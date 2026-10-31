import { BadRequestException, ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let service: AuthService;
  let user: { _id: string; fullName: string; email: string; passwordHash: string; isEmailVerified: boolean; role: string } | null;
  let verification: { _id: string; codeHash: string; expiresAt: Date; attempts: number; createdAt: Date } | null;
  let sentCode = '';
  const users = {
    findByEmail: vi.fn(async (_email: string, _includePassword?: boolean) => user),
    create: vi.fn(async (data: { fullName: string; email: string; passwordHash: string }) => {
      user = { ...data, _id: 'user-1', isEmailVerified: false, role: 'user' };
      return user;
    }),
    markVerified: vi.fn(async () => { if (user) user.isEmailVerified = true; return user; }),
    delete: vi.fn(async () => { user = null; }),
    safe: vi.fn((value: NonNullable<typeof user>) => ({ id: value._id, fullName: value.fullName, email: value.email, role: value.role })),
  };
  const sessions = { create: vi.fn(async () => ({ token: 'raw-session-token', expiresAt: new Date(Date.now() + 1000) })) };
  const email = { sendVerificationCode: vi.fn(async (_address: string, _name: string, code: string) => { sentCode = code; }) };
  const config = { getOrThrow: vi.fn(() => 'test-session-secret-long-enough-for-hmac') };
  const records = {
    findOneAndUpdate: vi.fn((_query: unknown, data: Omit<NonNullable<typeof verification>, '_id'>) => { verification = { ...data, _id: 'otp-1' }; return { exec: async () => verification }; }),
    findOne: vi.fn(() => ({ exec: async () => verification, select: () => ({ exec: async () => verification }) })),
    updateOne: vi.fn(() => ({ exec: async () => { if (verification) verification.attempts += 1; } })),
    deleteOne: vi.fn(() => ({ exec: async () => { verification = null; } })),
  };

  beforeEach(() => {
    user = null; verification = null; sentCode = '';
    vi.clearAllMocks();
    service = new AuthService(users as never, sessions as never, email as never, config as never, records as never, records as never);
  });

  it('creates an unverified account, hashes its password, and emails an OTP', async () => {
    const result = await service.signup({ fullName: 'Ada Lovelace', email: ' ADA@example.com ', password: 'StrongPass1!', passwordConfirmation: 'StrongPass1!' });
    expect(result.email).toBe('ada@example.com');
    expect(user?.isEmailVerified).toBe(false);
    expect(user?.passwordHash).not.toBe('StrongPass1!');
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(verification?.codeHash).not.toBe(sentCode);
    expect(verification?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it('rejects mismatched passwords and duplicate emails', async () => {
    await expect(service.signup({ fullName: 'Ada', email: 'ada@example.com', password: 'StrongPass1!', passwordConfirmation: 'WrongPass1!' })).rejects.toBeInstanceOf(BadRequestException);
    user = { _id: 'user-1', fullName: 'Ada', email: 'ada@example.com', passwordHash: 'hash', isEmailVerified: false, role: 'user' };
    await expect(service.signup({ fullName: 'Ada', email: 'ada@example.com', password: 'StrongPass1!', passwordConfirmation: 'StrongPass1!' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('verifies an OTP once and creates a session', async () => {
    await service.signup({ fullName: 'Ada', email: 'ada@example.com', password: 'StrongPass1!', passwordConfirmation: 'StrongPass1!' });
    const emailAddress = user!.email;
    const result = await service.verifyEmail(emailAddress, sentCode);
    expect(result.user.email).toBe(emailAddress);
    expect(user.isEmailVerified).toBe(true);
    expect(result.session.token).toBe('raw-session-token');
    expect(verification).toBeNull();
  });

  it('rejects an incorrect OTP and counts the attempt', async () => {
    await service.signup({ fullName: 'Ada', email: 'ada@example.com', password: 'StrongPass1!', passwordConfirmation: 'StrongPass1!' });
    const wrongCode = sentCode === '000000' ? '000001' : '000000';
    await expect(service.verifyEmail(user!.email, wrongCode)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verification?.attempts).toBe(1);
  });

  it('blocks OTP verification after five incorrect attempts', async () => {
    await service.signup({ fullName: 'Ada', email: 'ada@example.com', password: 'StrongPass1!', passwordConfirmation: 'StrongPass1!' });
    const wrongCode = sentCode === '000000' ? '000001' : '000000';
    for (let attempt = 0; attempt < 5; attempt++) await expect(service.verifyEmail('ada@example.com', wrongCode)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verification?.attempts).toBe(5);
    await expect(service.verifyEmail('ada@example.com', sentCode)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects expired and reused codes', async () => {
    await service.signup({ fullName: 'Ada', email: 'ada@example.com', password: 'StrongPass1!', passwordConfirmation: 'StrongPass1!' });
    const emailAddress = user!.email;
    if (verification) verification.expiresAt = new Date(Date.now() - 1000);
    await expect(service.verifyEmail(emailAddress, sentCode)).rejects.toBeInstanceOf(UnauthorizedException);
    if (verification) verification.expiresAt = new Date(Date.now() + 60_000);
    const code = sentCode;
    await service.verifyEmail(emailAddress, code);
    await expect(service.verifyEmail(emailAddress, code)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('enforces resend cooldown and does not expose account eligibility', async () => {
    await service.signup({ fullName: 'Ada', email: 'ada@example.com', password: 'StrongPass1!', passwordConfirmation: 'StrongPass1!' });
    const emailAddress = user!.email;
    const firstCode = sentCode;
    await service.resendOtp(emailAddress);
    expect(sentCode).toBe(firstCode);
    if (verification) verification.createdAt = new Date(Date.now() - 61_000);
    await service.resendOtp(emailAddress);
    expect(sentCode).not.toBe(firstCode);
    const response = await service.resendOtp('missing@example.com');
    expect(response).toEqual({ message: 'If the account can receive a code, one will be sent shortly.' });
  });

  it('signs in verified users and rejects wrong passwords or unverified accounts', async () => {
    const argon2 = await import('argon2');
    const passwordHash = await argon2.hash('StrongPass1!');
    user = { _id: 'user-1', fullName: 'Ada', email: 'ada@example.com', passwordHash, isEmailVerified: true, role: 'user' };
    const signedIn = await service.signin(user.email, 'StrongPass1!');
    expect(signedIn.user.email).toBe(user.email);
    await expect(service.signin(user.email, 'WrongPass1!')).rejects.toBeInstanceOf(UnauthorizedException);
    user.isEmailVerified = false;
    await expect(service.signin(user.email, 'StrongPass1!')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
