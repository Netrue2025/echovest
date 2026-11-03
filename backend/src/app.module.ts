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
import { AdminModule } from './admin/admin.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { ReferralsModule } from './referrals/referrals.module.js';
import { TradesModule } from './trades/trades.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { SupportModule } from './support/support.module.js';
import { validateEnvironment } from './config/environment.validation.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    MongooseModule.forRootAsync({ inject: [ConfigService], useFactory: (config: ConfigService) => ({ uri: config.getOrThrow<string>('MONGODB_URI'), autoIndex: false }) }),
    ObserveModule.forRoot({ appKey: process.env.OBSERVE_APP_KEY ?? 'YOUR_APP_KEY', appSecret: process.env.OBSERVE_APP_SECRET ?? 'YOUR_APP_SECRET', serviceId: 'backend', http: { queryParamsObfuscateRegex: /([?&]token=)[^&]+/gi } }),
    UsersModule,
    SessionsModule,
    EmailModule,
    AuthModule,
    AdminModule,
    FinanceModule,
    NotificationsModule,
    ReferralsModule,
    TradesModule,
    WalletModule,
    WebhooksModule,
    SupportModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
