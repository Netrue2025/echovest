import { BadRequestException, ConflictException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as argon2 from 'argon2';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Model } from 'mongoose';
import { EmailService } from '../email/email.service.js';
import { SessionsService } from '../sessions/sessions.service.js';
import { UsersService } from '../users/users.service.js';
import { EmailVerification } from './verification.schema.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    @InjectModel(EmailVerification.name) private readonly verifications: Model<EmailVerification>,
  ) {}
  private codeHash(code: string) { return createHmac('sha256', this.config.getOrThrow<string>('SESSION_SECRET')).update(code).digest('hex'); }
  private async issueCode(userId: string, email: string, fullName: string) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.verifications.findOneAndUpdate(
      { userId }, { userId, codeHash: this.codeHash(code), expiresAt: new Date(Date.now() + 10 * 60_000), attempts: 0, createdAt: new Date() },
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
    if (!user || user.isEmailVerified) throw new UnauthorizedException('This verification code is invalid or expired.');
    const record = await this.verifications.findOne({ userId: user._id }).select('+codeHash').exec();
    if (!record || record.expiresAt.getTime() <= Date.now() || record.attempts >= 5) throw new UnauthorizedException('This verification code is invalid or expired. Request a new code.');
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
    const prior = await this.verifications.findOne({ userId: user._id }).exec();
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
}
