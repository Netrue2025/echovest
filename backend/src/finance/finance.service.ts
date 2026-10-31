import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/user.schema.js';
import { AdminAudit } from '../admin/admin-audit.schema.js';
import { FinanceSettings, FinanceTransaction } from './finance.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type Actor = { id: string; email: string };
@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);
  constructor(@InjectModel(User.name) private readonly users: Model<User>, @InjectModel(FinanceTransaction.name) private readonly transactions: Model<FinanceTransaction>, @InjectModel(FinanceSettings.name) private readonly settings: Model<FinanceSettings>, @InjectModel(AdminAudit.name) private readonly audit: Model<AdminAudit>, private readonly notifications: NotificationsService) {}
  private async config() { return await this.settings.findOneAndUpdate({ key: 'platform' }, { $setOnInsert: { key: 'platform' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean().exec(); }
  async publicSettings() { const s = await this.config(); return { depositWalletAddress: s?.depositWalletAddress ?? '', depositNetwork: s?.depositNetwork ?? '', depositInstructions: s?.depositInstructions ?? '', minimumDeposit: s?.minimumDeposit ?? 0, minimumWithdrawal: s?.minimumWithdrawal ?? 0 }; }
  async updateSettings(input: { depositWalletAddress: string; depositNetwork: string; depositInstructions: string; minimumDeposit: number; minimumWithdrawal: number }, actor: Actor) {
    const result = await this.settings.findOneAndUpdate({ key: 'platform' }, { $set: { ...input, depositWalletAddress: input.depositWalletAddress.trim(), depositNetwork: input.depositNetwork.trim(), depositInstructions: input.depositInstructions.trim() } }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }).lean().exec();
    await this.audit.create({ actorId: actor.id, actorEmail: actor.email, action: 'finance.settings.updated', targetType: 'finance', targetId: 'platform', targetLabel: 'Finance settings', detail: `Minimum deposit ${input.minimumDeposit}; minimum withdrawal ${input.minimumWithdrawal}.` });
    return result;
  }
  async summary(userId: string) {
    const [user, transactions] = await Promise.all([this.users.findById(userId).select('tradingBalance referralBalance pendingTradingWithdrawals pendingReferralWithdrawals').lean().exec(), this.listUserTransactions(userId)]);
    if (!user) throw new NotFoundException('Account not found.');
    const trading = user.tradingBalance ?? 0, referral = user.referralBalance ?? 0;
    return { balances: { trading, referral, availableTrading: Math.max(0, trading - (user.pendingTradingWithdrawals ?? 0)), availableReferral: Math.max(0, referral - (user.pendingReferralWithdrawals ?? 0)) }, transactions };
  }
  async listUserTransactions(userId: string) {
    const docs = await this.transactions.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(100).lean().exec();
    return docs.map((doc) => ({ ...doc, id: String(doc._id) }));
  }
  async requestDeposit(userId: string, amount: number, txid?: string) {
    const [s, user] = await Promise.all([this.config(), this.users.findById(userId).select('isDisabled').lean().exec()]);
    if (!user || user.isDisabled) throw new ForbiddenException('This account cannot request deposits.');
    if (!s?.depositWalletAddress || !s.depositNetwork) throw new BadRequestException('Deposits are not configured yet. Contact support.');
    if (amount < (s.minimumDeposit ?? 0)) throw new BadRequestException(`The minimum deposit is ${s.minimumDeposit} USDT.`);
    const hash = txid?.trim();
    if (!hash) throw new BadRequestException('Enter the transaction hash so the deposit can be verified.');
    try { return await this.transactions.create({ userId: new Types.ObjectId(userId), type: 'deposit', amount, balanceType: 'trading', status: 'network_confirmation', txid: hash, network: s.depositNetwork }); }
    catch (error) { if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) throw new ConflictException('This transaction hash has already been submitted.'); throw error; }
  }
  async requestWithdrawal(userId: string, input: { amount: number; balanceType: 'trading' | 'referral'; destinationAddress: string; network: string }) {
    const [s, user] = await Promise.all([this.config(), this.users.findById(userId).select('+role isDisabled withdrawalsDisabled tradingBalance referralBalance pendingTradingWithdrawals pendingReferralWithdrawals').lean().exec()]);
    if (!user || user.isDisabled || user.withdrawalsDisabled) throw new ForbiddenException('Withdrawals are disabled for this account.');
    if (input.amount < (s?.minimumWithdrawal ?? 0)) throw new BadRequestException(`The minimum withdrawal is ${s?.minimumWithdrawal ?? 0} USDT.`);
    const balanceField = input.balanceType === 'trading' ? 'tradingBalance' : 'referralBalance';
    const pendingField = input.balanceType === 'trading' ? 'pendingTradingWithdrawals' : 'pendingReferralWithdrawals';
    const held = await this.users.findOneAndUpdate({ _id: userId, isDisabled: { $ne: true }, withdrawalsDisabled: { $ne: true }, $expr: { $gte: [{ $subtract: [{ $ifNull: [`$${balanceField}`, 0] }, { $ifNull: [`$${pendingField}`, 0] }] }, input.amount] } }, { $inc: { [pendingField]: input.amount } }, { new: true }).lean().exec();
    if (!held) throw new BadRequestException('The amount exceeds your available balance.');
    try { return await this.transactions.create({ userId: new Types.ObjectId(userId), type: 'withdrawal', amount: input.amount, balanceType: input.balanceType, status: 'pending_review', destinationAddress: input.destinationAddress.trim(), network: input.network.trim() }); }
    catch (error) { await this.users.updateOne({ _id: userId }, { $inc: { [pendingField]: -input.amount } }).exec(); throw error; }
  }
  async adminTransactions(type?: 'deposit' | 'withdrawal') {
    const filter = type ? { type } : {};
    const items = await this.transactions.find(filter).sort({ createdAt: -1 }).limit(500).lean().exec();
    const ids = [...new Set(items.map((item) => String(item.userId)))];
    const users = await this.users.find({ _id: { $in: ids } }).select('fullName email').lean().exec();
    const map = new Map(users.map((u) => [String(u._id), u]));
    return items.map((item) => ({ ...item, id: String(item._id), user: map.get(String(item.userId)) ?? null }));
  }
  async review(id: string, expectedType: 'deposit' | 'withdrawal', decision: 'approved' | 'rejected', reason: string | undefined, actor: Actor) {
    const transaction = await this.transactions.findById(id).exec();
    if (!transaction) throw new NotFoundException('Transaction request not found.');
    if (transaction.type !== expectedType) throw new NotFoundException('Transaction request not found.');
    const validCurrent = transaction.type === 'deposit' ? 'network_confirmation' : 'pending_review';
    if (transaction.status !== validCurrent) throw new ConflictException('This request has already been reviewed.');
    if (decision === 'rejected' && !reason?.trim()) throw new BadRequestException('Add a reason when rejecting a request.');
    const session = await this.transactions.db.startSession();
    try {
      await session.withTransaction(async () => {
        const changed = await this.transactions.findOneAndUpdate({ _id: id, status: validCurrent }, { $set: { status: decision, rejectionReason: decision === 'rejected' ? reason!.trim() : '', reviewedBy: actor.email, reviewedAt: new Date() } }, { new: true, session }).exec();
        if (!changed) throw new ConflictException('This request has already been reviewed.');
        if (transaction.type === 'deposit' && decision === 'approved') {
          const credited = await this.users.updateOne({ _id: transaction.userId }, { $inc: { tradingBalance: transaction.amount } }, { session }).exec();
          if (!credited.matchedCount) throw new NotFoundException('The account for this deposit no longer exists.');
        }
        if (transaction.type === 'withdrawal') {
          const balance = transaction.balanceType === 'trading' ? 'tradingBalance' : 'referralBalance';
          const pending = transaction.balanceType === 'trading' ? 'pendingTradingWithdrawals' : 'pendingReferralWithdrawals';
          const update = decision === 'approved' ? { $inc: { [balance]: -transaction.amount, [pending]: -transaction.amount } } : { $inc: { [pending]: -transaction.amount } };
          const updated = await this.users.updateOne({ _id: transaction.userId, [pending]: { $gte: transaction.amount }, ...(decision === 'approved' ? { [balance]: { $gte: transaction.amount } } : {}) }, update, { session }).exec();
          if (!updated.matchedCount) throw new ConflictException('Could not settle the reserved withdrawal amount.');
        }
        await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: `finance.${transaction.type}.${decision}`, targetType: 'transaction', targetId: id, targetLabel: String(transaction.userId), detail: decision === 'rejected' ? reason!.trim() : `${transaction.amount} USDT approved.` }], { session });
      });
    } finally { await session.endSession(); }
    const reviewed = await this.transactions.findById(id).lean().exec();
    if (reviewed) {
      const decisionText = decision === 'approved' ? 'approved' : 'rejected';
      const title = `${expectedType === 'deposit' ? 'Deposit' : 'Withdrawal'} ${decisionText}`;
      const message = decision === 'approved'
        ? expectedType === 'deposit'
          ? `Your ${transaction.amount} USDT deposit was approved and credited to your trading balance.`
          : `Your ${transaction.amount} USDT withdrawal was approved and debited from your ${transaction.balanceType} balance.`
        : `${expectedType === 'deposit' ? 'Your deposit' : 'Your withdrawal'} was rejected. ${reason?.trim() || 'Please review the request details.'}`;
      try { await this.notifications.notifyUser(String(transaction.userId), title, message, expectedType); }
      catch (error) { this.logger.error(`Transaction ${expectedType} notification could not be saved: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    return reviewed;
  }
}
