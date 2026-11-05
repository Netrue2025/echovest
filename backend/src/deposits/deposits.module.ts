import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DepositAccount, DepositAccountSchema } from '../deposit-accounts/deposit-account.schema.js';
import { User, UserSchema } from '../users/user.schema.js';
import { UsersModule } from '../users/users.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { AdminAccessGuard } from '../admin/admin-access.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AdminAudit, AdminAuditSchema } from '../admin/admin-audit.schema.js';
import { ChainPayModule } from '../providers/chainpay/chainpay.module.js';
import { DepositWalletAccount, DepositWalletAccountSchema } from './deposit-wallet-account.schema.js';
import { DepositLedgerEntry, DepositLedgerEntrySchema } from './deposit-ledger-entry.schema.js';
import { ProviderDeposit, ProviderDepositSchema } from './provider-deposit.schema.js';
import { DepositsService } from './deposits.service.js';
import { DepositCreditService } from './deposit-credit.service.js';
import { TronVerificationService } from './tron-verification.service.js';
import { DepositsController } from './deposits.controller.js';
import { FinanceSettings, FinanceSettingsSchema } from '../finance/finance.schema.js';
import { ReferralsModule } from '../referrals/referrals.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SuperAdminGuard } from '../admin/super-admin.guard.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: DepositAccount.name, schema: DepositAccountSchema },
      { name: ProviderDeposit.name, schema: ProviderDepositSchema },
      { name: DepositWalletAccount.name, schema: DepositWalletAccountSchema },
      { name: DepositLedgerEntry.name, schema: DepositLedgerEntrySchema },
      { name: User.name, schema: UserSchema },
      { name: AdminAudit.name, schema: AdminAuditSchema },
      { name: FinanceSettings.name, schema: FinanceSettingsSchema },
    ]),
    UsersModule, SessionsModule, ChainPayModule, ReferralsModule, NotificationsModule,
  ],
  controllers: [DepositsController],
  providers: [DepositsService, DepositCreditService, TronVerificationService, SessionGuard, AdminAccessGuard, OriginGuard, SuperAdminGuard],
  exports: [DepositsService],
})
export class DepositsModule {}
