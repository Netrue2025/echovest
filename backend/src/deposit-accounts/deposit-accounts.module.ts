import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DepositAccount, DepositAccountSchema } from './deposit-account.schema.js';
@Module({ imports: [MongooseModule.forFeature([{ name: DepositAccount.name, schema: DepositAccountSchema }])], exports: [MongooseModule] })
export class DepositAccountsModule {}
