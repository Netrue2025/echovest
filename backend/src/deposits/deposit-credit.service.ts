import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { DepositWalletAccount } from './deposit-wallet-account.schema.js';
import { DepositLedgerEntry } from './deposit-ledger-entry.schema.js';
import { ProviderDeposit } from './provider-deposit.schema.js';
import { User } from '../users/user.schema.js';
import { FinanceSettings } from '../finance/finance.schema.js';
import { ReferralsService } from '../referrals/referrals.service.js';

@Injectable()
export class DepositCreditService {
  private readonly logger = new Logger(DepositCreditService.name);
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(ProviderDeposit.name) private readonly deposits: Model<ProviderDeposit>,
    @InjectModel(DepositWalletAccount.name) private readonly balances: Model<DepositWalletAccount>,
    @InjectModel(DepositLedgerEntry.name) private readonly ledger: Model<DepositLedgerEntry>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(FinanceSettings.name) private readonly settings: Model<FinanceSettings>,
    private readonly referrals: ReferralsService,
  ) {}

  /** Credits only a deposit that passed provider and independent-chain verification. */
  async creditVerifiedDeposit(depositId: string) {
    const session = await this.connection.startSession();
    try {
      let credited = false;
      await session.withTransaction(async () => {
        const event = await this.deposits.findOneAndUpdate(
          { _id: new Types.ObjectId(depositId), status: 'verified_pending_credit' },
          { $set: { status: 'crediting' } }, { new: true, session },
        ).exec();
        if (!event) return;
        const transferIndex = Number(event.transferIndex);
        if (!Number.isSafeInteger(transferIndex) || transferIndex < 0) throw new Error('Verified transfer index is missing.');
        const transactionHash = event.providerTransactionId.toLowerCase();
        const reference = `chainpay:${transactionHash}:${transferIndex}`;
        await this.ledger.create([{
          userId: event.userId, depositEventId: event._id, asset: 'USDT', network: 'TRON', entryType: 'deposit_credit',
          amount: event.amount, reference, source: 'chainpay', transactionHash, transferIndex,
          status: 'confirmed', description: 'Verified ChainPay USDT TRON deposit',
        }], { session });
        await this.balances.findOneAndUpdate(
          { userId: event.userId, asset: 'USDT', network: 'TRON' },
          { $setOnInsert: { userId: event.userId, asset: 'USDT', network: 'TRON', availableBalance: Types.Decimal128.fromString('0') } },
          { upsert: true, new: true, session, setDefaultsOnInsert: true },
        ).exec();
        await this.balances.updateOne(
          { userId: event.userId, asset: 'USDT', network: 'TRON' }, { $inc: { availableBalance: event.amount } }, { session },
        ).exec();
        const settings = await this.settings.findOne({ key: 'platform' }).session(session).lean().exec();
        const capitalLockDays = Number(settings?.capitalLockDays ?? 60);
        if (!Number.isSafeInteger(capitalLockDays) || capitalLockDays < 1 || capitalLockDays > 3650) throw new Error('Configured capital lock period is invalid.');
        const amount = Number(event.amount.toString());
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Verified deposit amount is invalid for the user balance.');
        const unlockAt = new Date(Date.now() + capitalLockDays * 24 * 60 * 60 * 1000);
        const userUpdate = await this.users.updateOne(
          { _id: event.userId, role: 'user' },
          { $inc: { tradingBalance: amount }, $push: { lockedCapitalLots: { amount, unlockAt } } },
          { session },
        ).exec();
        if (userUpdate.matchedCount !== 1) throw new Error('Deposit user balance could not be updated.');
        await this.referrals.accrueDeposit(String(event.userId), String(event._id), amount, session);
        await this.deposits.updateOne(
          { _id: event._id, status: 'crediting' },
          { $set: { status: 'credited', creditReference: reference, creditedAt: new Date(), reason: `Provider and solidified TRON transfer verified; ledger, deposit wallet, and user investment balance credited. Capital unlocks after ${capitalLockDays} days.` } },
          { session },
        ).exec();
        credited = true;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      return { credited };
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) return { credited: false, duplicate: true };
      this.logger.error('Verified deposit credit transaction failed; deposit remains uncredited.');
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
