import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminAudit, AdminAuditSchema } from '../admin/admin-audit.schema.js';
import { AdminAccessGuard } from '../admin/admin-access.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { TradePosition, TradePositionSchema } from '../trades/trade.schema.js';
import { UsersModule } from '../users/users.module.js';
import { ReferralEarning, ReferralEarningSchema, ReferralSettings, ReferralSettingsSchema } from './referral.schema.js';
import { ReferralsController } from './referrals.controller.js';
import { ReferralsService } from './referrals.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: TradePosition.name, schema: TradePositionSchema }, { name: ReferralSettings.name, schema: ReferralSettingsSchema }, { name: ReferralEarning.name, schema: ReferralEarningSchema }, { name: AdminAudit.name, schema: AdminAuditSchema }]), UsersModule, SessionsModule],
  controllers: [ReferralsController],
  providers: [ReferralsService, SessionGuard, AdminAccessGuard, OriginGuard],
  exports: [ReferralsService],
})
export class ReferralsModule {}
