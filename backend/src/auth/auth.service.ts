import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Model } from 'mongoose';
import { EmailService } from '../email/email.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { UsersService } from '../users/users.service.js';
import { EmailVerification } from './verification.schema.js';
import { PasswordReset } from './password-reset.schema.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    @InjectModel(EmailVerification.name) private readonly verifications: Model<EmailVerification>,
    @InjectModel(PasswordReset.name) private readonly passwordResets: Model<PasswordReset>,
  ) {}
  private codeHash(code: string) { return createHmac('sha256', this.config.getOrThrow<string>('SESSION_SECRET')).update(code).digest('hex'); }
  private async issueCode(userId: string, email: string, fullName: string) {
    const userKey = String(userId);
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.verifications.findOneAndUpdate(
      { userId: userKey }, { $set: { userId: userKey, codeHash: this.codeHash(code), expiresAt: new Date(Date.now() + 10 * 60_000), attempts: 0, createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
    await this.emailService.sendVerificationCode(email, fullName, code);
  }
  async signup(input: { fullName: string; email: string; password: string; passwordConfirmation: string }) {
    if (input.password !== input.passwordConfirmation) throw new BadRequestException('Passwords do not match.');
    const email = input.email.trim().toLowerCase();
    if (await this.users.findByEmail(email)) throw new ConflictException('An account with this email already exists.');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    let user;
    try { user = await this.users.create({ fullName: input.fullName.trim(), email, passwordHash }); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new ConflictException('An account with this email already exists.');
      throw error;
    }
    try { await this.issueCode(String(user._id), email, user.fullName); }
    catch { await this.verifications.deleteOne({ userId: user._id }).exec(); await this.users.delete(String(user._id)); throw new ServiceUnavailableException('We could not send your verification email. Please try signing up again shortly.'); }
    return { message: 'Check your email for a verification code.', email };
  }
  async verifyEmail(emailInput: string, code: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    if (!user) {
      this.logger.warn('Email verification rejected: no account found for submitted email.');
      throw new UnauthorizedException('This verification code is invalid or expired.');
    }
    if (user.isEmailVerified) {
      this.logger.warn('Email verification rejected: account is already verified.');
      throw new UnauthorizedException('This verification code is invalid or expired.');
    }
    const record = await this.verifications.findOne({ userId: String(user._id) }).select('+codeHash').exec();
    if (!record) {
      this.logger.warn('Email verification rejected: no pending code record exists.');
      throw new UnauthorizedException('This verification code is invalid or expired. Request a new code.');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      this.logger.warn('Email verification rejected: pending code has expired.');
      throw new UnauthorizedException('This verification code is invalid or expired. Request a new code.');
    }
    if (record.attempts >= 5) {
      this.logger.warn('Email verification rejected: pending code exceeded the five-attempt limit.');
      throw new UnauthorizedException('This verification code is invalid or expired. Request a new code.');
    }
    const expected = Buffer.from(record.codeHash, 'hex');
    const received = Buffer.from(this.codeHash(code), 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      await this.verifications.updateOne({ _id: record._id }, { $inc: { attempts: 1 } }).exec();
      throw new UnauthorizedException('The verification code is incorrect.');
    }
    const verified = await this.users.markVerified(String(user._id));
    await this.verifications.deleteOne({ _id: record._id }).exec();
    if (!verified) throw new UnauthorizedException('Unable to verify this account.');
    const session = await this.sessions.create(String(user._id));
    return { user: this.users.safe(verified), session };
  }
  async resendOtp(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    if (!user || user.isEmailVerified) return { message: 'If the account can receive a code, one will be sent shortly.' };
    const prior = await this.verifications.findOne({ userId: String(user._id) }).exec();
    if (prior && Date.now() - prior.createdAt.getTime() < 60_000) return { message: 'If the account can receive a code, one will be sent shortly.' };
    try { await this.issueCode(String(user._id), email, user.fullName); }
    catch { return { message: 'If the account can receive a code, one will be sent shortly.' }; }
    return { message: 'If the account can receive a code, one will be sent shortly.' };
  }
  async signin(emailInput: string, password: string) {
    const user = await this.users.findByEmail(emailInput.trim().toLowerCase(), true);
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('Invalid email or password.');
    if (!user.isEmailVerified) throw new ForbiddenException('Verify your email before signing in.');
    const session = await this.sessions.create(String(user._id));
    return { user: this.users.safe(user), session };
  }
  async requestPasswordReset(emailInput: string) {
    const generic = { message: 'If an account exists for that email, a reset code will be sent shortly.' };
    const email = emailInput.trim().toLowerCase();
    const user = await this.users.findByEmail(email);
    if (!user || !user.isEmailVerified) return generic;
    const userId = String(user._id);
    const prior = await this.passwordResets.findOne({ userId }).exec();
    if (prior && Date.now() - prior.createdAt.getTime() < 60_000) return generic;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.passwordResets.findOneAndUpdate(
      { userId }, { $set: { userId, codeHash: this.codeHash(code), expiresAt: new Date(Date.now() + 10 * 60_000), attempts: 0, createdAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
    try { await this.emailService.sendPasswordResetCode(email, user.fullName, code); }
    catch {
      await this.passwordResets.deleteOne({ userId }).exec();
      this.logger.warn('Password reset email could not be delivered.');
    }
    return generic;
  }
  async resetPassword(input: { email: string; code: string; newPassword: string; passwordConfirmation: string }) {
    if (input.newPassword !== input.passwordConfirmation) throw new BadRequestException('Passwords do not match.');
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    const invalid = () => new UnauthorizedException('The verification code is invalid or expired. Request a new code.');
    if (!user || !user.isEmailVerified) throw invalid();
    const userId = String(user._id);
    const record = await this.passwordResets.findOne({ userId }).select('+codeHash').exec();
    if (!record || record.expiresAt.getTime() <= Date.now() || record.attempts >= 5) throw invalid();
    const expected = Buffer.from(record.codeHash, 'hex');
    const received = Buffer.from(this.codeHash(input.code), 'hex');
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      await this.passwordResets.updateOne({ _id: record._id }, { $inc: { attempts: 1 } }).exec();
      throw invalid();
    }
    const consumed = await this.passwordResets.findOneAndDelete({ _id: record._id, codeHash: record.codeHash }).exec();
    if (!consumed) throw invalid();
    const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
    const updated = await this.users.updatePassword(userId, passwordHash);
    if (!updated) throw invalid();
    await this.sessions.revokeAllForUser(userId);
    return { message: 'Your password has been reset. Sign in with your new password.' };
  }
}
