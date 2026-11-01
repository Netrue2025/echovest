import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DepositAccount, DepositAccountSchema } from '../deposit-accounts/deposit-account.schema.js';
import { ProviderDeposit, ProviderDepositSchema } from './provider-deposit.schema.js';
import { DepositsService } from './deposits.service.js';
@Module({ imports: [MongooseModule.forFeature([{ name: DepositAccount.name, schema: DepositAccountSchema }, { name: ProviderDeposit.name, schema: ProviderDepositSchema }])], providers: [DepositsService], exports: [DepositsService] })
export class DepositsModule {}
