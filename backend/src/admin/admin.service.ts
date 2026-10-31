import { ConflictException, ForbiddenException, Injectable, Logger, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { EmailVerification } from '../auth/verification.schema.js';
import { PasswordReset } from '../auth/password-reset.schema.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ADMIN_PERMISSION_CODES } from './admin-permissions.js';
import { AdminAudit } from './admin-audit.schema.js';

export type AdminActor = { id: string; email: string };

@Injectable()
export class AdminService implements OnModuleInit {
  private readonly logger = new Logger(AdminService.name);
  private superAdminConfigured = false;
  constructor(
    private readonly config: ConfigService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    @InjectModel(EmailVerification.name) private readonly verifications: Model<EmailVerification>,
    @InjectModel(PasswordReset.name) private readonly passwordResets: Model<PasswordReset>,
    @InjectModel(AdminAudit.name) private readonly audit: Model<AdminAudit>,
  ) {}
  async onModuleInit() {
    const email = this.config.get<string>('SUPER_ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('SUPER_ADMIN_PASSWORD');
    if (!email && !password) { this.logger.warn('Super-admin login is disabled until SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are configured.'); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12) {
      this.logger.error('Super-admin login is disabled: configure a valid SUPER_ADMIN_EMAIL and a SUPER_ADMIN_PASSWORD of at least 12 characters.');
      return;
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.users.upsertSuperAdmin(email, passwordHash, [...ADMIN_PERMISSION_CODES]);
    this.superAdminConfigured = true;
  }
  async signin(emailInput: string, password: string) {
    const user = await this.users.findByEmail(emailInput.trim().toLowerCase(), true);
    if (!user && !this.superAdminConfigured) throw new ServiceUnavailableException('Admin sign-in is not configured. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD on the backend service.');
    if (!user || user.role !== 'admin' || user.isDisabled || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('Invalid admin email or password.');
    const session = await this.sessions.create(String(user._id));
    return { user: { id: String(user._id), fullName: user.fullName, email: user.email, isSuperAdmin: user.isSuperAdmin ?? false, permissions: user.adminPermissions ?? [] }, session };
  }
  async listUsers() {
    const docs = await this.users.listAll();
    return docs.map((user) => ({ id: String(user._id), fullName: user.fullName, email: user.email, role: user.role, isSuperAdmin: user.isSuperAdmin ?? false, isEmailVerified: user.isEmailVerified, isDisabled: user.isDisabled ?? false, withdrawalsDisabled: user.withdrawalsDisabled ?? false, createdAt: user.createdAt }));
  }
  async updateUser(id: string, updates: { fullName?: string; email?: string }, actor: AdminActor) {
    const existing = await this.users.findByIdWithPassword(id);
    if (!existing) throw new UnauthorizedException('User not found.');
    if (existing.role === 'admin' || existing.isSuperAdmin) throw new ForbiddenException('Admin accounts are managed in the admin access section.');
    if (!Object.keys(updates).length) return this.getUser(id);
    try {
      const user = await this.users.updateProfile(id, { ...updates, ...(updates.email ? { email: updates.email.trim().toLowerCase() } : {}) });
      if (!user) throw new UnauthorizedException('User not found.');
      await this.recordAudit(actor, 'user.profile.updated', 'user', id, user.email, 'Profile details updated.');
      return this.users.safe(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new ConflictException('An account with this email already exists.');
      throw error;
    }
  }
  async changeUserPassword(id: string, password: string, actor: AdminActor) {
    const user = await this.users.findByIdWithPassword(id);
    if (!user) throw new UnauthorizedException('User not found.');
    if (user.role === 'admin' || user.isSuperAdmin) throw new ForbiddenException('Admin passwords must be reset through admin account recovery.');
    await this.users.updatePassword(id, await argon2.hash(password, { type: argon2.argon2id }));
    await this.sessions.revokeAllForUser(id);
    await this.recordAudit(actor, 'user.password.changed', 'user', id, user.email, 'Password changed; all sessions revoked.');
    return { message: 'Password changed. The user has been signed out of all sessions.' };
  }
  async updateUserControls(id: string, updates: { disabled?: boolean }, actor: AdminActor) {
    const existing = await this.users.findByIdWithPassword(id);
    if (!existing) throw new UnauthorizedException('User not found.');
    if (existing.role === 'admin' || existing.isSuperAdmin) throw new ForbiddenException('Admin account controls are managed in the admin access section.');
    const user = await this.users.updateAccountControls(id, { ...(updates.disabled !== undefined ? { isDisabled: updates.disabled } : {}) });
    if (!user) throw new UnauthorizedException('User not found.');
    if (updates.disabled) await this.sessions.revokeAllForUser(id);
    if (updates.disabled !== undefined) await this.recordAudit(actor, updates.disabled ? 'user.account.disabled' : 'user.account.enabled', 'user', id, user.email, 'Account sign-in access changed.');
    return this.users.safe(user);
  }
  async updateUserWithdrawalControl(id: string, withdrawalsDisabled: boolean, actor: AdminActor) {
    const existing = await this.users.findByIdWithPassword(id);
    if (!existing) throw new UnauthorizedException('User not found.');
    if (existing.role === 'admin' || existing.isSuperAdmin) throw new ForbiddenException('Admin accounts are not managed through user withdrawal controls.');
    const user = await this.users.updateAccountControls(id, { withdrawalsDisabled });
    if (!user) throw new UnauthorizedException('User not found.');
    await this.recordAudit(actor, withdrawalsDisabled ? 'user.withdrawals.disabled' : 'user.withdrawals.enabled', 'user', id, user.email, 'Withdrawal access changed.');
    return this.users.safe(user);
  }
  async deleteUser(id: string, actor: AdminActor) {
    const user = await this.users.findByIdWithPassword(id);
    if (!user) throw new UnauthorizedException('User not found.');
    if (user.role === 'admin' || user.isSuperAdmin) throw new ForbiddenException('Administrator accounts cannot be removed from user management.');
    await Promise.all([this.sessions.revokeAllForUser(id), this.verifications.deleteOne({ userId: id }).exec(), this.passwordResets.deleteOne({ userId: id }).exec()]);
    await this.users.deleteById(id);
    await this.recordAudit(actor, 'user.account.deleted', 'user', id, user.email, 'Account and authentication records deleted.');
    return { message: 'User account deleted.' };
  }
  async listAdmins() {
    const admins = await this.users.listAdmins();
    return admins.map((admin) => ({ id: String(admin._id), fullName: admin.fullName, email: admin.email, permissions: admin.adminPermissions ?? [], disabled: admin.isDisabled ?? false, createdAt: admin.createdAt }));
  }
  async createAdmin(input: { fullName: string; email: string; password: string; permissions: string[] }, actor: AdminActor) {
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) throw new ConflictException('An account with this email already exists.');
    const hash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      const admin = await this.users.createAdmin({ fullName: input.fullName.trim(), email, passwordHash: hash, adminPermissions: input.permissions });
      await this.recordAudit(actor, 'admin.account.created', 'admin', String(admin._id), email, `${input.permissions.length} permissions assigned.`);
      return { id: String(admin._id), fullName: admin.fullName, email: admin.email, permissions: admin.adminPermissions, disabled: false };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new ConflictException('An account with this email already exists.');
      throw error;
    }
  }
  async updateAdminPermissions(id: string, permissions: string[], actor: AdminActor) {
    const current = await this.users.findByIdWithPassword(id);
    if (!current || current.role !== 'admin' || current.isSuperAdmin) throw new ForbiddenException('This administrator account cannot be changed here.');
    const updated = await this.users.updateAdminPermissions(id, permissions);
    await this.recordAudit(actor, 'admin.permissions.updated', 'admin', id, current.email, `${permissions.length} permissions enabled.`);
    return { id, permissions: updated?.adminPermissions ?? [] };
  }
  async updateAdminStatus(id: string, disabled: boolean, actor: AdminActor) {
    const current = await this.users.findByIdWithPassword(id);
    if (!current || current.role !== 'admin' || current.isSuperAdmin) throw new ForbiddenException('This administrator account cannot be changed here.');
    const updated = await this.users.updateAccountControls(id, { isDisabled: disabled });
    if (disabled) await this.sessions.revokeAllForUser(id);
    await this.recordAudit(actor, disabled ? 'admin.account.disabled' : 'admin.account.enabled', 'admin', id, current.email, 'Admin account status changed.');
    return { id, disabled: updated?.isDisabled ?? disabled };
  }
  private async getUser(id: string) {
    const user = await this.users.findByIdWithPassword(id);
    if (!user) throw new UnauthorizedException('User not found.');
    return this.users.safe(user);
  }
  async listAudit() {
    const events = await this.audit.find({}).sort({ createdAt: -1 }).limit(250).lean().exec();
    return events.map((event) => ({ id: String(event._id), actorId: event.actorId, actorEmail: event.actorEmail, action: event.action, targetType: event.targetType, targetId: event.targetId, targetLabel: event.targetLabel, detail: event.detail, createdAt: event.createdAt }));
  }
  private recordAudit(actor: AdminActor, action: string, targetType: string, targetId: string, targetLabel: string, detail: string) {
    return this.audit.create({ actorId: actor.id, actorEmail: actor.email, action, targetType, targetId, targetLabel, detail });
  }
}
