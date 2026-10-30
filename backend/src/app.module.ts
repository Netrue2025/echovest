import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { AuthModule } from './auth/auth.module.js';
import { EmailModule } from './email/email.module.js';
import { SessionsModule } from './sessions/sessions.module.js';
import { UsersModule } from './users/users.module.js';
import { RateLimitGuard } from './common/rate-limit.guard.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

function validateEnvironment(config: Record<string, unknown>) {
  const required = ['MONGODB_URI', 'RESEND_API_KEY', 'EMAIL_FROM', 'FRONTEND_URL', 'SESSION_SECRET'];
  const missing = required.filter((key) => typeof config[key] !== 'string' || !(config[key] as string).trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  const sessionSecret = config.SESSION_SECRET;
  if (typeof sessionSecret !== 'string' || sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  const sameSite = config.SESSION_SAME_SITE;
  if (sameSite !== undefined && (typeof sameSite !== 'string' || !['lax', 'strict', 'none'].includes(sameSite))) throw new Error('SESSION_SAME_SITE must be lax, strict, or none.');
  return config;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    MongooseModule.forRootAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('MONGODB_URI') }) }),
    ObserveModule.forRoot({ appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY', appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET', serviceId: 'backend' }),
    UsersModule,
    SessionsModule,
    EmailModule,
    AuthModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
