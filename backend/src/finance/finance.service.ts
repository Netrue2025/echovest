import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/user.schema.js';
import { AdminAudit } from '../admin/admin-audit.schema.js';
import { FinanceSettings, FinanceTransaction } from './finance.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CopyTradeSignal, TradePosition } from '../trades/trade.schema.js';
import { assertWithdrawalWindow } from './withdrawal-window.js';
import { WithdrawalSecurityService } from '../withdrawal-security/withdrawal-security.service.js';
import { availableTradeInterestUnits, tradeAmountUnits } from '../trades/trade-profit.js';
import { ReferralsService } from '../referrals/referrals.service.js';

type Actor = { id: string; email: string };
@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);
  constructor(@InjectModel(User.name) private readonly users: Model<User>, @InjectModel(FinanceTransaction.name) private readonly transactions: Model<FinanceTransaction>, @InjectModel(FinanceSettings.name) private readonly settings: Model<FinanceSettings>, @InjectModel(AdminAudit.name) private readonly audit: Model<AdminAudit>, @InjectModel(TradePosition.name) private readonly tradePositions: Model<TradePosition>, @InjectModel(CopyTradeSignal.name) private readonly tradeSignals: Model<CopyTradeSignal>, private readonly notifications: NotificationsService, private readonly withdrawalSecurity: WithdrawalSecurityService, private readonly env: ConfigService, private readonly referrals: ReferralsService) {}
  private async config() { return await this.settings.findOneAndUpdate({ key: 'platform' }, { $setOnInsert: { key: 'platform' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean().exec(); }
  async publicSettings() { const s = await this.config(); return { depositMethod: s?.depositMethod ?? (this.env.get<string>('DEPOSIT_PROVIDER_MODE') === 'chainpay' ? 'chainpay' : 'manual'), depositWalletAddress: s?.depositWalletAddress ?? '', depositNetwork: s?.depositNetwork ?? '', depositInstructions: s?.depositInstructions ?? '', minimumDeposit: s?.minimumDeposit ?? 0, minimumWithdrawal: s?.minimumWithdrawal ?? 0, withdrawalFeePercent: s?.withdrawalFeePercent ?? 0, withdrawalFeeFixed: s?.withdrawalFeeFixed ?? 0, capitalLockDays: s?.capitalLockDays ?? 60, withdrawalDays: s?.withdrawalDays ?? [1, 3, 5], withdrawalWindowStart: s?.withdrawalWindowStart ?? '09:00', withdrawalWindowEnd: s?.withdrawalWindowEnd ?? '17:00', withdrawalTimezone: s?.withdrawalTimezone ?? 'Africa/Lagos' }; }
  async updateSettings(input: { depositMethod: 'manual' | 'chainpay'; depositWalletAddress: string; depositNetwork: string; depositInstructions: string; minimumDeposit: number; minimumWithdrawal: number; withdrawalFeePercent: number; withdrawalFeeFixed: number; capitalLockDays: number; withdrawalDays: number[]; withdrawalWindowStart: string; withdrawalWindowEnd: string; withdrawalTimezone: string }, actor: Actor) {
    if (input.depositMethod === 'manual' && (!input.depositWalletAddress.trim() || !input.depositNetwork.trim())) throw new BadRequestException('Enter the manual deposit wallet address and network before enabling manual deposits.');
    if (input.withdrawalWindowStart >= input.withdrawalWindowEnd) throw new BadRequestException('Withdrawal window must end after it starts on the same day.');
    if (new Set(input.withdrawalDays).size !== input.withdrawalDays.length) throw new BadRequestException('Choose each withdrawal day only once.');
    try { new Intl.DateTimeFormat('en', { timeZone: input.withdrawalTimezone }); } catch { throw new BadRequestException('Choose a valid withdrawal timezone.'); }
    const result = await this.settings.findOneAndUpdate({ key: 'platform' }, { $set: { ...input, depositWalletAddress: input.depositWalletAddress.trim(), depositNetwork: input.depositNetwork.trim(), depositInstructions: input.depositInstructions.trim(), withdrawalTimezone: input.withdrawalTimezone.trim() } }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }).lean().exec();
    await this.audit.create({ actorId: actor.id, actorEmail: actor.email, action: 'finance.settings.updated', targetType: 'finance', targetId: 'platform', targetLabel: 'Finance settings', detail: `Deposit method ${input.depositMethod}; minimum deposit ${input.minimumDeposit}; minimum withdrawal ${input.minimumWithdrawal}; withdrawal fee ${input.withdrawalFeePercent}% + ${input.withdrawalFeeFixed} fixed; capital lock ${input.capitalLockDays} days; withdrawal window ${input.withdrawalDays.join(',')} ${input.withdrawalWindowStart}-${input.withdrawalWindowEnd} ${input.withdrawalTimezone}.` });
    return result;
  }
  async summary(userId: string) {
    await this.settleMaturedCapital(userId);
    const [user, transactions, positions, settings, approvedProfitWithdrawals] = await Promise.all([this.users.findById(userId).select('tradingBalance maturedPrincipalBalance lockedCapitalLots referralBalance pendingTradingWithdrawals pendingMaturedWithdrawals pendingReferralWithdrawals membershipLevel').lean().exec(), this.listUserTransactions(userId), this.tradePositions.find({ userId: new Types.ObjectId(userId) }).select('signalId principal joinedAt stoppedAt claimedInterest principalReturnedAt status').lean().exec(), this.config(), this.transactions.find({ userId: new Types.ObjectId(userId), type: 'withdrawal', sourceType: 'trade_interest', status: 'approved' }).select('amount').lean().exec()]);
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
    // Only closed positions can fund a profit withdrawal. Keep the available
    // figure aligned with withdrawProfit(), which reserves from stopped/matured
    // positions only and rejects the request if any position remains active.
    const closedPositions = positions.filter((position) => position.status === 'stopped' || position.status === 'matured');
    const profitCalculationTime = new Date();
    const closedProfitUnits = closedPositions.reduce((total, position) => {
      const signal = signalMap.get(String(position.signalId));
      if (!signal) return total;
      return total + availableTradeInterestUnits(position, signal, profitCalculationTime);
    }, 0);
    const profitPaid = approvedProfitWithdrawals.reduce((total, transaction) => total + transaction.amount, 0);
    const totalProfitEarned = Math.max(0, grossProfitEarned - profitPaid);
    const availableProfitUnits = Math.max(0, closedProfitUnits);
    const pendingMatured = user.pendingMaturedWithdrawals ?? 0;
    const lockedCapitalLots = user.lockedCapitalLots ?? [];
    const lockedCapital = lockedCapitalLots.reduce((total, lot) => total + lot.amount, 0);
    const nextCapitalUnlockAt = lockedCapitalLots.reduce<Date | null>((earliest, lot) => !earliest || new Date(lot.unlockAt).getTime() < earliest.getTime() ? new Date(lot.unlockAt) : earliest, null);
    const membershipBenefit = await this.referrals.membershipBenefits(user.membershipLevel);
    return { membership: { level: membershipBenefit.level, withdrawalReviewHours: membershipBenefit.withdrawalReviewHours, withdrawalFeeDiscountPercent: membershipBenefit.withdrawalFeeDiscountPercent }, balances: { trading, referral, availableTrading: Math.max(0, trading - (user.pendingTradingWithdrawals ?? 0) - pendingMatured), maturedPrincipal, availableMaturedPrincipal: Math.max(0, maturedPrincipal - pendingMatured), lockedCapital, nextCapitalUnlockAt, capitalLockDays: settings?.capitalLockDays ?? 60, availableReferral: Math.max(0, referral - (user.pendingReferralWithdrawals ?? 0)), totalProfitEarned, availableProfit: availableProfitUnits / 100_000_000 }, transactions };
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
    const docs = await this.transactions.find({ userId: new Types.ObjectId(userId), archivedAt: { $exists: false } }).sort({ createdAt: -1 }).limit(100).lean().exec();
    return docs.map((doc) => ({ ...doc, id: String(doc._id) }));
  }
  async requestDeposit(userId: string, amount: number, txid?: string) {
    const settings = await this.config();
    if (settings?.depositMethod !== 'manual') throw new ForbiddenException('Manual deposits are currently unavailable.');
    if (!settings.depositWalletAddress.trim() || !settings.depositNetwork.trim()) throw new ForbiddenException('The manual deposit wallet is not configured yet.');
    if (amount < (settings.minimumDeposit ?? 0)) throw new BadRequestException(`The minimum deposit is ${settings.minimumDeposit} USDT.`);
    try {
      if (txid?.trim() && await this.audit.exists({ action: 'finance.deposit.txid_tombstone', targetId: txid.trim() }).exec()) throw new ConflictException('This transaction hash was already used and cannot be submitted again.');
      const created = await this.transactions.create({ userId: new Types.ObjectId(userId), type: 'deposit', amount, balanceType: 'trading', status: 'pending_review', ...(txid?.trim() ? { txid: txid.trim() } : {}), destinationAddress: settings.depositWalletAddress.trim(), network: settings.depositNetwork.trim() });
      void this.notifications.notifyAdmins('Deposit submitted', `A user submitted a ${amount} USDT deposit for review.`, '/admin?section=deposits').catch(() => undefined);
      return created;
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) throw new ConflictException('This transaction hash has already been submitted.');
      throw error;
    }
  }
  async requestWithdrawal(userId: string, input: { amount: number; balanceType: 'trading' | 'referral'; destinationAddress: string; network: string; pin?: string; verificationToken?: string }) {
    await this.settleMaturedCapital(userId);
    const [s, user] = await Promise.all([this.config(), this.users.findById(userId).select('+role isDisabled withdrawalsDisabled tradingBalance maturedPrincipalBalance referralBalance pendingTradingWithdrawals pendingMaturedWithdrawals pendingReferralWithdrawals membershipLevel').lean().exec()]);
    if (!user || user.isDisabled || user.withdrawalsDisabled) throw new ForbiddenException('Withdrawals are disabled for this account.');
    assertWithdrawalWindow(s ?? {}, new Date());
    if (input.amount < (s?.minimumWithdrawal ?? 0)) throw new BadRequestException(`The minimum withdrawal is ${s?.minimumWithdrawal ?? 0} USD.`);
    await this.withdrawalSecurity.assertWithdrawal(userId, input, { amount: input.amount, destinationAddress: input.destinationAddress, network: input.network, source: input.balanceType });
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
    try {
      const membershipBenefit = await this.referrals.membershipBenefits(user.membershipLevel);
      const effectiveFeePercent = Math.max(0, (s?.withdrawalFeePercent ?? 0) - membershipBenefit.withdrawalFeeDiscountPercent);
      const withdrawalFee = Math.round((input.amount * effectiveFeePercent / 100 + (s?.withdrawalFeeFixed ?? 0)) * 1e8) / 1e8;
      const payoutAmount = Math.round((input.amount - withdrawalFee) * 1e8) / 1e8;
      if (payoutAmount <= 0) throw new BadRequestException('The withdrawal charge must be less than the withdrawal amount.');
      const created = await this.transactions.create({ userId: new Types.ObjectId(userId), type: 'withdrawal', amount: input.amount, withdrawalFee, payoutAmount, balanceType: input.balanceType, status: 'pending_review', destinationAddress: input.destinationAddress.trim(), network: input.network.trim(), maturedPrincipalWithdrawal: isMaturedPrincipal });
      void this.notifications.notifyAdmins('Withdrawal submitted', `A user submitted a ${input.amount} USD withdrawal for review.`, '/admin?section=withdrawals').catch(() => undefined);
      return created;
    }
    catch (error) { await this.users.updateOne({ _id: userId }, { $inc: { [pendingField]: -input.amount } }).exec(); throw error; }
  }
  async adminTransactions(type?: 'deposit' | 'withdrawal', includeArchived = false) {
    const filter = { ...(type ? { type } : {}), ...(includeArchived ? { archivedAt: { $exists: true } } : { archivedAt: { $exists: false } }) };
    const items = await this.transactions.find(filter).sort({ createdAt: -1 }).limit(500).lean().exec();
    const ids = [...new Set(items.map((item) => String(item.userId)))];
    const [users, membershipSettings] = await Promise.all([
      this.users.find({ _id: { $in: ids } }).select('fullName email membershipLevel').lean().exec(),
      type === 'withdrawal' ? this.referrals.getSettings() : Promise.resolve(null),
    ]);
    const map = new Map(users.map((u) => [String(u._id), u]));
    const reviewHours = new Map<string, number>((membershipSettings?.levels ?? []).map((row) => [row.level, row.withdrawalReviewHours] as const));
    const result = items.map((item) => {
      const user = map.get(String(item.userId));
      const level = user?.membershipLevel ?? 'Blue';
      return { ...item, id: String(item._id), user: user ? { ...user, withdrawalReviewHours: reviewHours.get(level) ?? 24 } : null };
    });
    if (type === 'withdrawal') result.sort((a, b) => {
      const aPending = a.status === 'pending_review' ? 1 : 0, bPending = b.status === 'pending_review' ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      if (aPending && bPending) {
        const aTarget = a.user?.withdrawalReviewHours || Number.MAX_SAFE_INTEGER;
        const bTarget = b.user?.withdrawalReviewHours || Number.MAX_SAFE_INTEGER;
        const priority = aTarget - bTarget;
        if (priority) return priority;
        return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
      }
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });
    return result;
  }
  async archiveTransaction(id: string, type: 'deposit' | 'withdrawal', reason: string, actor: Actor) {
    const session = await this.transactions.db.startSession();
    let archived = false;
    try {
      await session.withTransaction(async () => {
        const changed = await this.transactions.findOneAndUpdate(
          { _id: id, type, status: { $in: ['approved', 'rejected'] }, archivedAt: { $exists: false } },
          { $set: { archivedAt: new Date(), archivedBy: actor.email, archiveReason: reason.trim() } },
          { new: true, session },
        ).lean().exec();
        if (!changed) return;
        await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: `finance.${type}.history_archived`, targetType: 'transaction', targetId: id, targetLabel: String(changed.userId), detail: reason.trim() }], { session });
        archived = true;
      });
    } finally { await session.endSession(); }
    if (!archived) throw new ConflictException('Only approved or rejected history can be archived. Refresh the list and try again.');
    return { id, archived: true };
  }
  async restoreTransaction(id: string, type: 'deposit' | 'withdrawal', actor: Actor) {
    const session = await this.transactions.db.startSession();
    let restored = false;
    try {
      await session.withTransaction(async () => {
        const changed = await this.transactions.findOneAndUpdate(
          { _id: id, type, status: { $in: ['approved', 'rejected'] }, archivedAt: { $exists: true } },
          { $unset: { archivedAt: 1, archivedBy: 1, archiveReason: 1 } },
          { new: true, session },
        ).lean().exec();
        if (!changed) return;
        await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: `finance.${type}.history_restored`, targetType: 'transaction', targetId: id, targetLabel: String(changed.userId), detail: 'Archived history restored to normal views.' }], { session });
        restored = true;
      });
    } finally { await session.endSession(); }
    if (!restored) throw new ConflictException('This archived transaction could not be restored. Refresh the list and try again.');
    return { id, restored: true };
  }
  async archiveTransactionHistory(type: 'deposit' | 'withdrawal', reason: string, actor: Actor) {
    const session = await this.transactions.db.startSession();
    let count = 0;
    try {
      await session.withTransaction(async () => {
        const result = await this.transactions.updateMany(
          { type, status: { $in: ['approved', 'rejected'] }, archivedAt: { $exists: false } },
          { $set: { archivedAt: new Date(), archivedBy: actor.email, archiveReason: reason.trim() } },
          { session },
        ).exec();
        count = result.modifiedCount;
        if (count) await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: `finance.${type}.history_cleared`, targetType: 'transaction_history', targetId: type, targetLabel: `${type} history`, detail: `${count} approved/rejected record(s) hidden from normal history views. ${reason.trim()}` }], { session });
      });
    } finally { await session.endSession(); }
    return { type, archivedCount: count };
  }
  async archiveSelectedTransactions(type: 'deposit' | 'withdrawal', ids: string[], reason: string, actor: Actor) {
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    const session = await this.transactions.db.startSession();
    let count = 0;
    try {
      await session.withTransaction(async () => {
        const result = await this.transactions.updateMany({ _id: { $in: objectIds }, type, status: { $in: ['approved', 'rejected'] }, archivedAt: { $exists: false } }, { $set: { archivedAt: new Date(), archivedBy: actor.email, archiveReason: reason.trim() } }, { session }).exec();
        count = result.modifiedCount;
        if (count) await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: `finance.${type}.history_selected_archived`, targetType: 'transaction_history', targetId: type, targetLabel: `${type} history`, detail: `${count} selected approved/rejected record(s) hidden. ${reason.trim()}` }], { session });
      });
    } finally { await session.endSession(); }
    return { type, archivedCount: count };
  }
  async permanentlyDeleteSelectedTransactions(type: 'deposit' | 'withdrawal', ids: string[], reason: string, actor: Actor) {
    const session = await this.transactions.db.startSession();
    let count = 0;
    try {
      await session.withTransaction(async () => {
        const records = await this.transactions.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, type, status: { $in: ['approved', 'rejected'] } }).select('_id amount txid').session(session).lean().exec();
        if (!records.length) return;
        const result = await this.transactions.deleteMany({ _id: { $in: records.map((item) => item._id) }, type, status: { $in: ['approved', 'rejected'] } }, { session }).exec();
        count = result.deletedCount;
        if (count) {
          const deletionAudit = [{ actorId: actor.id, actorEmail: actor.email, action: `finance.${type}.history_permanently_deleted`, targetType: 'transaction_history', targetId: type, targetLabel: `${type} history`, detail: `${count} resolved record(s) permanently deleted. Reason: ${reason.trim()}. Record IDs: ${records.map((item) => String(item._id)).join(', ')}.` }];
          const transactionHashTombstones = type === 'deposit' ? records.filter((item) => item.txid).map((item) => ({ actorId: actor.id, actorEmail: actor.email, action: 'finance.deposit.txid_tombstone', targetType: 'deleted_deposit_transaction_hash', targetId: item.txid!, targetLabel: 'Previously submitted transaction hash', detail: `A deleted deposit history record retains this hash to prevent replay. Reason: ${reason.trim()}.` })) : [];
          await this.audit.create([...deletionAudit, ...transactionHashTombstones], { session });
        }
      });
    } finally { await session.endSession(); }
    return { type, deletedCount: count };
  }
  async review(id: string, expectedType: 'deposit' | 'withdrawal', decision: 'approved' | 'rejected', reason: string | undefined, actor: Actor) {
    const transaction = await this.transactions.findById(id).exec();
    if (!transaction) throw new NotFoundException('Transaction request not found.');
    if (transaction.type !== expectedType) throw new NotFoundException('Transaction request not found.');
    const validCurrent = 'pending_review';
    if (transaction.status !== validCurrent) throw new ConflictException('This request has already been reviewed.');
    if (decision === 'rejected' && !reason?.trim()) throw new BadRequestException('Add a reason when rejecting a request.');
    const session = await this.transactions.db.startSession();
    let depositReferralPayouts: { userId: string; amount: number; tier: number }[] = [];
    try {
      await session.withTransaction(async () => {
        if (transaction.type === 'deposit') {
          const settings = await this.settings.findOne({ key: 'platform' }).session(session).lean().exec();
          if (settings?.depositMethod !== 'manual' || transaction.status !== 'pending_review') throw new ConflictException('This manual deposit is no longer eligible for review.');
          if (decision === 'approved' && transaction.txid && await this.audit.exists({ action: 'finance.deposit.txid_tombstone', targetId: transaction.txid }).session(session).exec()) throw new ConflictException('This transaction hash was already used and cannot be credited again.');
          const changed = await this.transactions.findOneAndUpdate({ _id: id, type: 'deposit', status: 'pending_review' }, { $set: { status: decision, rejectionReason: decision === 'rejected' ? reason!.trim() : '', reviewedBy: actor.email, reviewedAt: new Date() } }, { new: true, session }).exec();
          if (!changed) throw new ConflictException('This request has already been reviewed.');
          if (decision === 'approved') {
            const unlockAt = new Date(Date.now() + (settings?.capitalLockDays ?? 60) * 24 * 60 * 60 * 1000);
            const credited = await this.users.updateOne({ _id: transaction.userId, role: 'user', isDisabled: { $ne: true } }, { $inc: { tradingBalance: transaction.amount }, $push: { lockedCapitalLots: { amount: transaction.amount, unlockAt } } }, { session }).exec();
            if (!credited.matchedCount) throw new ConflictException('Could not credit the user account.');
            depositReferralPayouts = await this.referrals.accrueDeposit(String(transaction.userId), String(transaction._id), transaction.amount, session);
          }
          await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: `finance.deposit.${decision}`, targetType: 'transaction', targetId: id, targetLabel: String(transaction.userId), detail: decision === 'approved' ? `${transaction.amount} USDT manual deposit approved; credited to locked investment balance.` : reason!.trim() }], { session });
          return;
        }
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
    if (transaction.type === 'deposit' && decision === 'approved') {
      for (const payout of depositReferralPayouts) {
        await this.notifications.notifyUser(payout.userId, 'Referral deposit bonus credited', `You earned ${payout.amount} USD from a tier ${payout.tier} referral deposit.`, 'general', '/dashboard?view=referrals').catch((error) => this.logger.warn(`Referral deposit notification could not be delivered: ${error instanceof Error ? error.message : 'unknown error'}`));
      }
    }
    const reviewed = await this.transactions.findById(id).lean().exec();
    if (reviewed) {
      const decisionText = decision === 'approved' ? 'approved' : 'rejected';
      const payoutAmount = transaction.payoutAmount ?? transaction.amount;
      const withdrawalFee = transaction.withdrawalFee ?? 0;
      const title = transaction.type === 'deposit' ? `Deposit ${decisionText}` : `Withdrawal ${decisionText}`;
      const message = transaction.type === 'deposit'
        ? decision === 'approved' ? `Your ${transaction.amount} USDT deposit was approved and added to your investment balance. The capital remains locked according to the account schedule.` : `Your deposit was rejected. ${reason?.trim() || 'Please review the request details.'}`
        : decision === 'approved'
        ? transaction.sourceType === 'trade_interest'
            ? `Your ${transaction.amount} USD trade profit withdrawal was approved.`
            : transaction.maturedPrincipalWithdrawal
              ? `Your ${transaction.amount} USD matured investment principal withdrawal was approved.`
              : `Your withdrawal was approved. ${transaction.amount} USDT was debited from your ${transaction.balanceType} balance, including a ${withdrawalFee} USDT charge; ${payoutAmount} USDT is the payout amount.`
        : `Your withdrawal was rejected. ${reason?.trim() || 'Please review the request details.'}`;
      try { await this.notifications.notifyUser(String(transaction.userId), title, message, 'withdrawal'); }
      catch (error) { this.logger.error(`Transaction ${expectedType} notification could not be saved: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    return reviewed;
  }
}
