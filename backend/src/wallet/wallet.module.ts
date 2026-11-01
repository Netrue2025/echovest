import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { DepositAccountsModule } from '../deposit-accounts/deposit-accounts.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { ChainPayModule } from '../providers/chainpay/chainpay.module.js';
import { ProviderDeposit, ProviderDepositSchema } from '../deposits/provider-deposit.schema.js';
import { WalletController } from './wallet.controller.js';
import { WalletService } from './wallet.service.js';
@Module({ imports: [MongooseModule.forFeature([{ name: ProviderDeposit.name, schema: ProviderDepositSchema }]), DepositAccountsModule, LedgerModule, UsersModule, SessionsModule, ChainPayModule], controllers: [WalletController], providers: [WalletService, SessionGuard, OriginGuard], exports: [WalletService] })
export class WalletModule {}
