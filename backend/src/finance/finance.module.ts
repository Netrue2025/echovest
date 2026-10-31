import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/user.schema.js';
import { UsersModule } from '../users/users.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { AdminAudit, AdminAuditSchema } from '../admin/admin-audit.schema.js';
import { AdminAccessGuard } from '../admin/admin-access.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { FinanceSettings, FinanceSettingsSchema, FinanceTransaction, FinanceTransactionSchema } from './finance.schema.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({ imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: FinanceTransaction.name, schema: FinanceTransactionSchema }, { name: FinanceSettings.name, schema: FinanceSettingsSchema }, { name: AdminAudit.name, schema: AdminAuditSchema }]), UsersModule, SessionsModule, NotificationsModule], controllers: [FinanceController], providers: [FinanceService, SessionGuard, AdminAccessGuard, OriginGuard] })
export class FinanceModule {}
