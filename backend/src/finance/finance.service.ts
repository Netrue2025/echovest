import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/user.schema.js';
import { AdminAudit } from '../admin/admin-audit.schema.js';
import { FinanceSettings, FinanceTransaction } from './finance.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CopyTradeSignal, TradePosition } from '../trades/trade.schema.js';
import { assertWithdrawalWindow } from './withdrawal-window.js';

type Actor = { id: string; email: string };
@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);
  constructor(@InjectModel(User.name) private readonly users: Model<User>, @InjectModel(FinanceTransaction.name) private readonly transactions: Model<FinanceTransaction>, @InjectModel(FinanceSettings.name) private readonly settings: Model<FinanceSettings>, @InjectModel(AdminAudit.name) private readonly audit: Model<AdminAudit>, @InjectModel(TradePosition.name) private readonly tradePositions: Model<TradePosition>, @InjectModel(CopyTradeSignal.name) private readonly tradeSignals: Model<CopyTradeSignal>, private readonly notifications: NotificationsService) {}
  private async config() { return await this.settings.findOneAndUpdate({ key: 'platform' }, { $setOnInsert: { key: 'platform' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean().exec(); }
  async publicSettings() { const s = await this.config(); return { depositWalletAddress: s?.depositWalletAddress ?? '', depositNetwork: s?.depositNetwork ?? '', depositInstructions: s?.depositInstructions ?? '', minimumDeposit: s?.minimumDeposit ?? 0, minimumWithdrawal: s?.minimumWithdrawal ?? 0, capitalLockDays: s?.capitalLockDays ?? 60, withdrawalDays: s?.withdrawalDays ?? [1, 3, 5], withdrawalWindowStart: s?.withdrawalWindowStart ?? '09:00', withdrawalWindowEnd: s?.withdrawalWindowEnd ?? '17:00', withdrawalTimezone: s?.withdrawalTimezone ?? 'Africa/Lagos' }; }
  async updateSettings(input: { depositWalletAddress: string; depositNetwork: string; depositInstructions: string; minimumDeposit: number; minimumWithdrawal: number; capitalLockDays: number; withdrawalDays: number[]; withdrawalWindowStart: string; withdrawalWindowEnd: string; withdrawalTimezone: string }, actor: Actor) {
    if (input.withdrawalWindowStart >= input.withdrawalWindowEnd) throw new BadRequestException('Withdrawal window must end after it starts on the same day.');
    if (new Set(input.withdrawalDays).size !== input.withdrawalDays.length) throw new BadRequestException('Choose each withdrawal day only once.');
    try { new Intl.DateTimeFormat('en', { timeZone: input.withdrawalTimezone }); } catch { throw new BadRequestException('Choose a valid withdrawal timezone.'); }
    const result = await this.settings.findOneAndUpdate({ key: 'platform' }, { $set: { ...input, depositWalletAddress: input.depositWalletAddress.trim(), depositNetwork: input.depositNetwork.trim(), depositInstructions: input.depositInstructions.trim(), withdrawalTimezone: input.withdrawalTimezone.trim() } }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }).lean().exec();
    await this.audit.create({ actorId: actor.id, actorEmail: actor.email, action: 'finance.settings.updated', targetType: 'finance', targetId: 'platform', targetLabel: 'Finance settings', detail: `Minimum deposit ${input.minimumDeposit}; minimum withdrawal ${input.minimumWithdrawal}; capital lock ${input.capitalLockDays} days; withdrawal window ${input.withdrawalDays.join(',')} ${input.withdrawalWindowStart}-${input.withdrawalWindowEnd} ${input.withdrawalTimezone}.` });
    return result;
  }
  async summary(userId: string) {
    await this.settleMaturedCapital(userId);
    const [user, transactions, positions, settings, approvedProfitWithdrawals] = await Promise.all([this.users.findById(userId).select('tradingBalance maturedPrincipalBalance lockedCapitalLots referralBalance pendingTradingWithdrawals pendingMaturedWithdrawals pendingReferralWithdrawals').lean().exec(), this.listUserTransactions(userId), this.tradePositions.find({ userId: new Types.ObjectId(userId) }).select('signalId principal joinedAt stoppedAt claimedInterest principalReturnedAt').lean().exec(), this.config(), this.transactions.find({ userId: new Types.ObjectId(userId), type: 'withdrawal', sourceType: 'trade_interest', status: 'approved' }).select('amount').lean().exec()]);
    if (!user) throw new NotFoundException('Account not found.');
    const trading = user.tradingBalance ?? 0, referral = user.referralBalance ?? 0;
    let maturedPrincipal = user.maturedPrincipalBalance ?? 0;
    const hasMaturityLedger = await this.users.exists({ _id: userId, maturedPrincipalBalance: { $exists: true } }).exec();
    if (!hasMaturityLedger) {
      const returnedPrincipal = positions.reduce((sum, position) => sum + (position.principalReturnedAt ? position.principal : 0), 0);
      maturedPrincipal = Math.max(0, Math.min(returnedPrincipal, trading - (user.pendingTradingWithdrawals ?? 0)));
      await this.users.updateOne({ _id: userId, maturedPrincipalBalance: { $exists: false } }, { $set: { maturedPrincipalBalance: maturedPrincipal, pendingMaturedWithdrawals: 0 } }).exec();
    }
    const signals = positions.length ? await this.tradeSignals.find({ _id: { $in: positions.map((position) => position.signalId) } }).select('roiPercent lockDays startsAt endsAt').lean().exec() : [];
    const signalMap = new Map(signals.map((signal) => [String(signal._id), signal]));
    const grossProfitEarned = positions.reduce((total, position) => {
      const signal = signalMap.get(String(position.signalId));
      if (!signal) return total;
      const scheduledStart = new Date(signal.startsAt).getTime();
      const scheduleDuration = signal.endsAt && signal.startsAt ? new Date(signal.endsAt).getTime() - new Date(signal.startsAt).getTime() : (signal.lockDays ?? 1) * 24 * 60 * 60 * 1000;
      const start = Math.max(new Date(position.joinedAt).getTime(), scheduledStart);
      const end = scheduledStart + (Number.isFinite(scheduleDuration) && scheduleDuration > 0 ? scheduleDuration : 24 * 60 * 60 * 1000);
      const cutoff = position.stoppedAt ? Math.min(new Date(position.stoppedAt).getTime(), end) : end;
      const elapsed = Math.max(0, Math.min(Date.now(), cutoff) - start);
      const profit = position.principal * signal.roiPercent / 100 * Math.min(1, elapsed / Math.max(1, end - start));
      return total + profit;
    }, 0);
    const profitPaid = approvedProfitWithdrawals.reduce((total, transaction) => total + transaction.amount, 0);
    const totalProfitEarned = Math.max(0, grossProfitEarned - profitPaid);
    const profitAlreadyRequested = positions.reduce((total, position) => total + (position.claimedInterest ?? 0), 0);
    const pendingMatured = user.pendingMaturedWithdrawals ?? 0;
    const lockedCapitalLots = user.lockedCapitalLots ?? [];
    const lockedCapital = lockedCapitalLots.reduce((total, lot) => total + lot.amount, 0);
    const nextCapitalUnlockAt = lockedCapitalLots.reduce<Date | null>((earliest, lot) => !earliest || new Date(lot.unlockAt).getTime() < earliest.getTime() ? new Date(lot.unlockAt) : earliest, null);
    return { balances: { trading, referral, availableTrading: Math.max(0, trading - (user.pendingTradingWithdrawals ?? 0) - pendingMatured), maturedPrincipal, availableMaturedPrincipal: Math.max(0, maturedPrincipal - pendingMatured), lockedCapital, nextCapitalUnlockAt, capitalLockDays: settings?.capitalLockDays ?? 60, availableReferral: Math.max(0, referral - (user.pendingReferralWithdrawals ?? 0)), totalProfitEarned, availableProfit: Math.max(0, grossProfitEarned - profitAlreadyRequested) }, transactions };
  }
  async settleMaturedCapital(userId?: string) {
    const now = new Date();
    const candidates = await this.users.find({ ...(userId ? { _id: userId } : {}), lockedCapitalLots: { $elemMatch: { unlockAt: { $lte: now } } } }).select('_id').limit(300).lean().exec();
    for (const candidate of candidates) {
      const session = await this.users.db.startSession();
      try {
        await session.withTransaction(async () => {
          const user = await this.users.findById(candidate._id).session(session).select('lockedCapitalLots').lean().exec();
          if (!user) return;
          const lots = user.lockedCapitalLots ?? [];
          const matured = lots.filter((lot) => new Date(lot.unlockAt).getTime() <= now.getTime());
          if (!matured.length) return;
          const remaining = lots.filter((lot) => new Date(lot.unlockAt).getTime() > now.getTime());
          const amount = matured.reduce((total, lot) => total + lot.amount, 0);
          await this.users.updateOne({ _id: candidate._id }, { $set: { lockedCapitalLots: remaining }, $inc: { maturedPrincipalBalance: amount } }, { session }).exec();
        });
      } finally { await session.endSession(); }
    }
  }
  async listUserTransactions(userId: string) {
    const docs = await this.transactions.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(100).lean().exec();
    return docs.map((doc) => ({ ...doc, id: String(doc._id) }));
  }
  async requestDeposit(userId: string, amount: number, txid?: string) {
    void userId; void amount; void txid;
    throw new ForbiddenException('Real customer deposits are disabled. Use the separate TEST wallet prototype.');
  }
  async requestWithdrawal(userId: string, input: { amount: number; balanceType: 'trading' | 'referral'; destinationAddress: string; network: string }) {
    await this.settleMaturedCapital(userId);
    const [s, user] = await Promise.all([this.config(), this.users.findById(userId).select('+role isDisabled withdrawalsDisabled tradingBalance maturedPrincipalBalance referralBalance pendingTradingWithdrawals pendingMaturedWithdrawals pendingReferralWithdrawals').lean().exec()]);
    if (!user || user.isDisabled || user.withdrawalsDisabled) throw new ForbiddenException('Withdrawals are disabled for this account.');
    assertWithdrawalWindow(s ?? {}, new Date());
    if (input.amount < (s?.minimumWithdrawal ?? 0)) throw new BadRequestException(`The minimum withdrawal is ${s?.minimumWithdrawal ?? 0} USD.`);
    const isMaturedPrincipal = input.balanceType === 'trading';
    const balanceField = isMaturedPrincipal ? 'maturedPrincipalBalance' : 'referralBalance';
    const pendingField = isMaturedPrincipal ? 'pendingMaturedWithdrawals' : 'pendingReferralWithdrawals';
    const availability = isMaturedPrincipal
      ? { $and: [
          { $gte: [{ $subtract: [{ $ifNull: ['$maturedPrincipalBalance', 0] }, { $ifNull: ['$pendingMaturedWithdrawals', 0] }] }, input.amount] },
          { $gte: [{ $subtract: [{ $ifNull: ['$tradingBalance', 0] }, { $add: [{ $ifNull: ['$pendingTradingWithdrawals', 0] }, { $ifNull: ['$pendingMaturedWithdrawals', 0] }] }] }, input.amount] },
        ] }
      : { $gte: [{ $subtract: [{ $ifNull: ['$referralBalance', 0] }, { $ifNull: ['$pendingReferralWithdrawals', 0] }] }, input.amount] };
    const held = await this.users.findOneAndUpdate({ _id: userId, isDisabled: { $ne: true }, withdrawalsDisabled: { $ne: true }, $expr: availability }, { $inc: { [pendingField]: input.amount } }, { new: true }).lean().exec();
    if (!held) throw new BadRequestException('The amount exceeds your available balance.');
    try { return await this.transactions.create({ userId: new Types.ObjectId(userId), type: 'withdrawal', amount: input.amount, balanceType: input.balanceType, status: 'pending_review', destinationAddress: input.destinationAddress.trim(), network: input.network.trim(), maturedPrincipalWithdrawal: isMaturedPrincipal }); }
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
    if (expectedType === 'deposit') throw new ForbiddenException('Legacy real deposit approvals are disabled. TEST deposits never credit withdrawable balances.');
    const transaction = await this.transactions.findById(id).exec();
    if (!transaction) throw new NotFoundException('Transaction request not found.');
    if (transaction.type !== expectedType) throw new NotFoundException('Transaction request not found.');
    const validCurrent = 'pending_review';
    if (transaction.status !== validCurrent) throw new ConflictException('This request has already been reviewed.');
    if (decision === 'rejected' && !reason?.trim()) throw new BadRequestException('Add a reason when rejecting a request.');
    const session = await this.transactions.db.startSession();
    try {
      await session.withTransaction(async () => {
        const changed = await this.transactions.findOneAndUpdate({ _id: id, status: validCurrent }, { $set: { status: decision, rejectionReason: decision === 'rejected' ? reason!.trim() : '', reviewedBy: actor.email, reviewedAt: new Date() } }, { new: true, session }).exec();
        if (!changed) throw new ConflictException('This request has already been reviewed.');
        if (transaction.type === 'withdrawal') {
          const profitLedger = transaction.sourceType === 'trade_interest' && transaction.profitLedger;
          if (profitLedger && decision === 'approved') {
            const activePosition = await this.tradePositions.exists({ userId: transaction.userId, status: 'active' }).session(session).exec();
            if (activePosition) throw new ConflictException('This profit withdrawal cannot be approved while the user has an active copy trade.');
          }
          if (transaction.maturedPrincipalWithdrawal) {
            const update = decision === 'approved'
              ? { $inc: { tradingBalance: -transaction.amount, maturedPrincipalBalance: -transaction.amount, pendingMaturedWithdrawals: -transaction.amount } }
              : { $inc: { pendingMaturedWithdrawals: -transaction.amount } };
            const updated = await this.users.updateOne({ _id: transaction.userId, pendingMaturedWithdrawals: { $gte: transaction.amount }, ...(decision === 'approved' ? { tradingBalance: { $gte: transaction.amount }, maturedPrincipalBalance: { $gte: transaction.amount } } : {}) }, update, { session }).exec();
            if (!updated.matchedCount) throw new ConflictException('Could not settle the reserved matured principal withdrawal.');
          } else if (!profitLedger) {
            const balance = transaction.balanceType === 'trading' ? 'tradingBalance' : 'referralBalance';
            const pending = transaction.balanceType === 'trading' ? 'pendingTradingWithdrawals' : 'pendingReferralWithdrawals';
            const update = decision === 'approved' ? { $inc: { [balance]: -transaction.amount, [pending]: -transaction.amount } } : { $inc: { [pending]: -transaction.amount } };
            const updated = await this.users.updateOne({ _id: transaction.userId, [pending]: { $gte: transaction.amount }, ...(decision === 'approved' ? { [balance]: { $gte: transaction.amount } } : {}) }, update, { session }).exec();
            if (!updated.matchedCount) throw new ConflictException('Could not settle the reserved withdrawal amount.');
          }
          if (decision === 'rejected' && transaction.sourceType === 'trade_interest') {
            const allocations = transaction.profitPositionAllocations?.length
              ? transaction.profitPositionAllocations
              : transaction.tradePositionId ? [{ positionId: transaction.tradePositionId, amount: transaction.amount }] : [];
            for (const allocation of allocations) {
              const restored = await this.tradePositions.updateOne({ _id: allocation.positionId, userId: transaction.userId, claimedInterest: { $gte: allocation.amount } }, { $inc: { claimedInterest: -allocation.amount } }, { session }).exec();
              if (!restored.matchedCount) throw new ConflictException('Could not restore the rejected trade interest to its position.');
            }
          }
        }
        await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: `finance.${transaction.type}.${decision}`, targetType: 'transaction', targetId: id, targetLabel: String(transaction.userId), detail: decision === 'rejected' ? reason!.trim() : `${transaction.amount} USDT approved.` }], { session });
      });
    } finally { await session.endSession(); }
    const reviewed = await this.transactions.findById(id).lean().exec();
    if (reviewed) {
      const decisionText = decision === 'approved' ? 'approved' : 'rejected';
      const title = `Withdrawal ${decisionText}`;
      const message = decision === 'approved'
        ? transaction.sourceType === 'trade_interest'
            ? `Your ${transaction.amount} USD trade profit withdrawal was approved.`
            : transaction.maturedPrincipalWithdrawal
              ? `Your ${transaction.amount} USD matured investment principal withdrawal was approved.`
              : `Your ${transaction.amount} USDT withdrawal was approved and debited from your ${transaction.balanceType} balance.`
        : `Your withdrawal was rejected. ${reason?.trim() || 'Please review the request details.'}`;
      try { await this.notifications.notifyUser(String(transaction.userId), title, message, 'withdrawal'); }
      catch (error) { this.logger.error(`Transaction ${expectedType} notification could not be saved: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    return reviewed;
  }
}
