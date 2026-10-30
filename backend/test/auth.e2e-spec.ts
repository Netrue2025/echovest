import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { AuthService } from '../src/auth/auth.service.js';
import { SessionsService } from '../src/sessions/sessions.service.js';
import { UsersService } from '../src/users/users.service.js';

describe('Authentication API (e2e)', () => {
  let app: INestApplication<App>;
  const profile = { id: 'user-id', fullName: 'Ada Lovelace', email: 'ada@example.com', role: 'user' };
  const session = { token: 'session-token', expiresAt: new Date(Date.now() + 60_000) };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { signup: vi.fn(async () => ({ message: 'Check your email for a verification code.', email: profile.email })), verifyEmail: vi.fn(async () => ({ user: profile, session })), resendOtp: vi.fn(async () => ({ message: 'If the account can receive a code, one will be sent shortly.' })), signin: vi.fn(async () => ({ user: profile, session })) } },
        { provide: UsersService, useValue: { safe: vi.fn(() => profile), findByEmailById: vi.fn(async () => profile) } },
        { provide: SessionsService, useValue: { revoke: vi.fn(async () => ({ deletedCount: 1 })), findByToken: vi.fn(async () => ({ userId: profile.id })) } },
        { provide: ConfigService, useValue: { getOrThrow: () => 'http://localhost:3000' } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
  });

  it('serves signup, OTP, signin, signout, and current-user routes', async () => {
    const origin = 'http://localhost:3000';
    await request(app.getHttpServer()).post('/auth/signup').set('Origin', origin).send({ fullName: 'Ada Lovelace', email: profile.email, password: 'StrongPass1!', passwordConfirmation: 'StrongPass1!' }).expect(201).expect(({ body }) => expect(body.email).toBe(profile.email));
    await request(app.getHttpServer()).post('/auth/resend-otp').set('Origin', origin).send({ email: profile.email }).expect(201);
    const verified = await request(app.getHttpServer()).post('/auth/verify-email').set('Origin', origin).send({ email: profile.email, code: '123456' }).expect(201);
    expect(verified.headers['set-cookie'][0]).toContain('HttpOnly');
    await request(app.getHttpServer()).post('/auth/signin').set('Origin', origin).send({ email: profile.email, password: 'StrongPass1!' }).expect(201).expect(({ body }) => expect(body.user.id).toBe(profile.id));
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer()).get('/auth/me').set('Cookie', 'ev_session=session-token').expect(200).expect(({ body }) => expect(body.user.email).toBe(profile.email));
    await request(app.getHttpServer()).post('/auth/signout').set('Origin', origin).expect(201);
  });

  afterEach(async () => { if (app) await app.close(); });
});
