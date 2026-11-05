import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, OnModuleInit, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { EmailVerification } from '../auth/verification.schema.js';
import { PasswordReset } from '../auth/password-reset.schema.js';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { ADMIN_PERMISSION_CODES } from './admin-permissions.js';
import { AdminAudit } from './admin-audit.schema.js';
import { User } from '../users/user.schema.js';
import { FinanceTransaction } from '../finance/finance.schema.js';
import { ProviderDeposit } from '../deposits/provider-deposit.schema.js';

export type AdminActor = { id: string; email: string; isSuperAdmin?: boolean };

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
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(FinanceTransaction.name) private readonly transactions: Model<FinanceTransaction>,
    @InjectModel(ProviderDeposit.name) private readonly providerDeposits: Model<ProviderDeposit>,
    @InjectConnection() private readonly connection: Connection,
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
    return docs.map((user) => ({ id: String(user._id), fullName: user.fullName, email: user.email, role: user.role, isSuperAdmin: user.isSuperAdmin ?? false, isEmailVerified: user.isEmailVerified, isDisabled: user.isDisabled ?? false, withdrawalsDisabled: user.withdrawalsDisabled ?? false, tradingBalance: user.tradingBalance ?? 0, referralBalance: user.referralBalance ?? 0, createdAt: user.createdAt }));
  }
  async overview(days = 30) {
    if (![7, 30, 90, 365].includes(days)) throw new BadRequestException('Choose a supported overview period.');
    const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - days + 1);
    const [registeredUsers, referralCount, walletRows, financeTotals, chainpayTotals, financeDaily, chainpayDaily] = await Promise.all([
      this.userModel.countDocuments({ role: 'user' }).exec(),
      this.userModel.countDocuments({ role: 'user', referredBy: { $ne: null } }).exec(),
      this.userModel.aggregate([{ $match: { role: 'user' } }, { $group: { _id: null, trading: { $sum: '$tradingBalance' }, referral: { $sum: '$referralBalance' } } }]).exec(),
      this.transactions.aggregate([{ $match: { status: 'approved', archivedAt: { $exists: false }, createdAt: { $gte: start } } }, { $group: { _id: { type: '$type' }, total: { $sum: '$amount' } } }]).exec(),
      this.providerDeposits.aggregate([{ $match: { status: 'credited', archivedAt: { $exists: false }, creditedAt: { $gte: start } } }, { $group: { _id: null, total: { $sum: { $toDouble: '$amount' } } } }]).exec(),
      this.transactions.aggregate([{ $match: { status: 'approved', archivedAt: { $exists: false }, createdAt: { $gte: start } } }, { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, type: '$type' }, total: { $sum: '$amount' } } }]).exec(),
      this.providerDeposits.aggregate([{ $match: { status: 'credited', archivedAt: { $exists: false }, creditedAt: { $gte: start } } }, { $group: { _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$creditedAt' } } }, total: { $sum: { $toDouble: '$amount' } } } }]).exec(),
    ]);
    const daily = new Map<string, { date: string; deposits: number; withdrawals: number }>();
    for (let i = 0; i < days; i++) { const day = new Date(start); day.setUTCDate(start.getUTCDate() + i); const key = day.toISOString().slice(0, 10); daily.set(key, { date: key, deposits: 0, withdrawals: 0 }); }
    for (const row of financeDaily) { const item = daily.get(row._id.day); if (item) item[row._id.type === 'deposit' ? 'deposits' : 'withdrawals'] += Number(row.total); }
    for (const row of chainpayDaily) { const item = daily.get(row._id.day); if (item) item.deposits += Number(row.total); }
    const totals: Record<string, number> = { deposit: Number(chainpayTotals[0]?.total ?? 0), withdrawal: 0 };
    for (const row of financeTotals) totals[row._id.type] = (totals[row._id.type] ?? 0) + Number(row.total);
    const wallets = walletRows[0] ?? { trading: 0, referral: 0 };
    return { periodDays: days, registeredUsers, referralCount, walletBalance: Number(wallets.trading ?? 0) + Number(wallets.referral ?? 0), tradingBalance: Number(wallets.trading ?? 0), referralBalance: Number(wallets.referral ?? 0), deposits: totals.deposit ?? 0, withdrawals: totals.withdrawal ?? 0, daily: [...daily.values()] };
  }
  async listUserBalances() {
    const users = await this.userModel.find({ role: 'user' }).select('fullName email tradingBalance referralBalance createdAt').sort({ createdAt: -1 }).lean().exec();
    const rows = users.map((user) => ({ id: String(user._id), fullName: user.fullName, email: user.email, tradingBalance: user.tradingBalance ?? 0, referralBalance: user.referralBalance ?? 0, total: (user.tradingBalance ?? 0) + (user.referralBalance ?? 0), createdAt: user.createdAt }));
    return { users: rows, totalTrading: rows.reduce((sum, user) => sum + user.tradingBalance, 0), totalReferral: rows.reduce((sum, user) => sum + user.referralBalance, 0), totalBalance: rows.reduce((sum, user) => sum + user.total, 0) };
  }
  async adjustUserBalance(id: string, input: { wallet: 'trading' | 'referral'; direction: 'credit' | 'debit'; amount: number; reason: string }, actor: AdminActor) {
    if (!Types.ObjectId.isValid(id) || !Number.isFinite(input.amount) || input.amount <= 0) throw new BadRequestException('Enter a valid user and positive adjustment amount.');
    const field = input.wallet === 'trading' ? 'tradingBalance' : 'referralBalance';
    const delta = input.direction === 'credit' ? input.amount : -input.amount;
    const query: Record<string, unknown> = { _id: new Types.ObjectId(id), role: 'user' };
    if (delta < 0) query[field] = { $gte: input.amount };
    const session = await this.connection.startSession();
    let result: { id: string; tradingBalance: number; referralBalance: number } | null = null;
    try {
      await session.withTransaction(async () => {
        const updated = await this.userModel.findOneAndUpdate(query, { $inc: { [field]: delta } }, { new: true, projection: 'fullName email tradingBalance referralBalance', session }).lean().exec();
        if (!updated) throw new ConflictException('User not found or the wallet does not have enough balance for this debit.');
        await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: 'user.wallet.adjusted', targetType: 'user', targetId: id, targetLabel: updated.email, detail: `${input.direction} ${input.amount.toFixed(8)} USD to ${input.wallet} wallet. Reason: ${input.reason.trim()}` }], { session });
        result = { id, tradingBalance: updated.tradingBalance ?? 0, referralBalance: updated.referralBalance ?? 0 };
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.error('Balance adjustment failed; transaction was rolled back.');
      throw new ServiceUnavailableException('Wallet adjustment requires MongoDB transactions. Confirm the database is a replica set or sharded cluster, then retry.');
    } finally { await session.endSession(); }
    if (!result) throw new ServiceUnavailableException('Wallet adjustment did not complete.');
    return result;
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
  async permanentlyDeleteAuditEvents(ids: string[], reason: string, actor: AdminActor) {
    if (!actor.isSuperAdmin) throw new ForbiddenException('Only the super admin can permanently delete audit history.');
    const session = await this.audit.db.startSession();
    let deletedCount = 0;
    try {
      await session.withTransaction(async () => {
        const objectIds = ids.map((id) => new Types.ObjectId(id));
        const protectedActions = ['finance.deposit.txid_tombstone', 'deposit.provider.txid_tombstone'];
        const filter = { _id: { $in: objectIds }, action: { $nin: protectedActions } };
        const records = await this.audit.find(filter).select('_id action targetType targetId').session(session).lean().exec();
        if (!records.length) return;
        // This raw collection operation is intentionally limited to this guarded admin endpoint.
        const result = await this.audit.collection.deleteMany(filter, { session });
        deletedCount = result.deletedCount ?? 0;
        if (deletedCount) await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: 'audit.records_deleted', targetType: 'admin_audit', targetId: 'selected', targetLabel: 'Selected audit records', detail: `${deletedCount} audit record(s) permanently deleted. Reason: ${reason.trim()}. Deleted record IDs: ${records.map((item) => String(item._id)).join(', ')}.` }], { session });
      });
    } finally { await session.endSession(); }
    return { deletedCount };
  }
  async permanentlyDeleteAllAuditEvents(reason: string, actor: AdminActor) {
    if (!actor.isSuperAdmin) throw new ForbiddenException('Only the super admin can permanently delete audit history.');
    const session = await this.audit.db.startSession();
    let deletedCount = 0;
    try {
      await session.withTransaction(async () => {
        const filter = { action: { $nin: ['finance.deposit.txid_tombstone', 'deposit.provider.txid_tombstone'] } };
        const result = await this.audit.collection.deleteMany(filter, { session });
        deletedCount = result.deletedCount ?? 0;
        await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: 'audit.records_deleted', targetType: 'admin_audit', targetId: 'all_deletable', targetLabel: 'All deletable audit history', detail: `${deletedCount} audit record(s) permanently deleted. Reason: ${reason.trim()}. Financial replay-prevention tombstones were retained.` }], { session });
      });
    } finally { await session.endSession(); }
    return { deletedCount, protectedCount: await this.audit.countDocuments({ action: { $in: ['finance.deposit.txid_tombstone', 'deposit.provider.txid_tombstone'] } }).exec() };
  }
  private recordAudit(actor: AdminActor, action: string, targetType: string, targetId: string, targetLabel: string, detail: string) {
    return this.audit.create({ actorId: actor.id, actorEmail: actor.email, action, targetType, targetId, targetLabel, detail });
  }
}
