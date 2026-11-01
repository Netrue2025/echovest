import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminAccessGuard } from '../admin/admin-access.guard.js';
import { AdminAudit, AdminAuditSchema } from '../admin/admin-audit.schema.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { FinanceSettings, FinanceSettingsSchema, FinanceTransaction, FinanceTransactionSchema } from '../finance/finance.schema.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ReferralsModule } from '../referrals/referrals.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { UsersModule } from '../users/users.module.js';
import { TradesController } from './trades.controller.js';
import { CopyTradeSignal, CopyTradeSignalSchema, TradePosition, TradePositionSchema } from './trade.schema.js';
import { TradesService } from './trades.service.js';

@Module({
  imports: [MongooseModule.forFeature([
    { name: User.name, schema: UserSchema },
    { name: CopyTradeSignal.name, schema: CopyTradeSignalSchema },
    { name: TradePosition.name, schema: TradePositionSchema },
    { name: FinanceTransaction.name, schema: FinanceTransactionSchema },
    { name: FinanceSettings.name, schema: FinanceSettingsSchema },
    { name: AdminAudit.name, schema: AdminAuditSchema },
  ]), UsersModule, SessionsModule, NotificationsModule, ReferralsModule],
  controllers: [TradesController],
  providers: [TradesService, SessionGuard, AdminAccessGuard, OriginGuard],
})
export class TradesModule {}
