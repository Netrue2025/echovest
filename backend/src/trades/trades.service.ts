import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AdminAudit } from '../admin/admin-audit.schema.js';
import { FinanceSettings, FinanceTransaction } from '../finance/finance.schema.js';
import { assertWithdrawalWindow } from '../finance/withdrawal-window.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ReferralsService } from '../referrals/referrals.service.js';
import { User } from '../users/user.schema.js';
import { CreateTradeSignalDto } from './trade.dto.js';
import { CopyTradeSignal, TradePosition } from './trade.schema.js';
import { WithdrawalSecurityService } from '../withdrawal-security/withdrawal-security.service.js';
import { availableTradeInterestUnits, earnedTradeInterestUnits, TRADE_AMOUNT_SCALE, tradeAmountUnits } from './trade-profit.js';

type Actor = { id: string; email: string };
const DAY_MS = 24 * 60 * 60 * 1000;
const amountUnits = tradeAmountUnits;
const duration = (days: number) => days * DAY_MS;
const signalDuration = (signal: Pick<CopyTradeSignal, 'startsAt' | 'endsAt' | 'lockDays'>) => {
  const scheduledDuration = signal.endsAt ? new Date(signal.endsAt).getTime() - new Date(signal.startsAt).getTime() : 0;
  return Number.isFinite(scheduledDuration) && scheduledDuration > 0 ? scheduledDuration : duration(signal.lockDays ?? 1);
};
const scheduleEndsAt = (signal: Pick<CopyTradeSignal, 'startsAt' | 'endsAt' | 'lockDays'>) => signal.endsAt ? new Date(signal.endsAt) : new Date(new Date(signal.startsAt).getTime() + duration(signal.lockDays ?? 1));
const maturesAt = (_position: Pick<TradePosition, 'joinedAt'>, signal: Pick<CopyTradeSignal, 'startsAt' | 'endsAt' | 'lockDays'>) => scheduleEndsAt(signal);
const lockTermLabel = (milliseconds: number) => {
  const totalMinutes = Math.max(1, Math.round(milliseconds / 60_000));
  const days = Math.floor(totalMinutes / 1440), hours = Math.floor((totalMinutes % 1440) / 60), minutes = totalMinutes % 60;
  return [days ? `${days} day${days === 1 ? '' : 's'}` : '', hours ? `${hours} hour${hours === 1 ? '' : 's'}` : '', minutes ? `${minutes} minute${minutes === 1 ? '' : 's'}` : ''].filter(Boolean).join(' ');
};

@Injectable()
export class TradesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradesService.name);
  private scheduler?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(CopyTradeSignal.name) private readonly signals: Model<CopyTradeSignal>,
    @InjectModel(TradePosition.name) private readonly positions: Model<TradePosition>,
    @InjectModel(FinanceTransaction.name) private readonly transactions: Model<FinanceTransaction>,
    @InjectModel(FinanceSettings.name) private readonly financeSettings: Model<FinanceSettings>,
    @InjectModel(AdminAudit.name) private readonly audit: Model<AdminAudit>,
    private readonly notifications: NotificationsService,
    private readonly referrals: ReferralsService,
    private readonly withdrawalSecurity: WithdrawalSecurityService,
  ) {}

  onModuleInit() {
    this.scheduler = setInterval(() => { void this.publishDueSignals().then(() => this.settleMatured()).catch((error) => this.logger.error(`Trade scheduler failed: ${error instanceof Error ? error.message : 'unknown error'}`)); }, 30_000);
    this.scheduler.unref?.();
    void this.publishDueSignals().then(() => this.settleMatured()).catch((error) => this.logger.error(`Initial trade scheduler failed: ${error instanceof Error ? error.message : 'unknown error'}`));
  }
  onModuleDestroy() { if (this.scheduler) clearInterval(this.scheduler); }

  private async writeAudit(actorId: string, actorEmail: string, action: string, id: string, label: string, detail: string, session?: ClientSession) {
    await this.audit.create([{ actorId, actorEmail, action, targetType: 'copy_trade', targetId: id, targetLabel: label, detail }], session ? { session } : undefined);
  }

  async createSignal(input: CreateTradeSignalDto, actor: Actor) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) throw new BadRequestException('Choose a future start time.');
    if (!Number.isFinite(endsAt.getTime()) || endsAt.getTime() <= startsAt.getTime()) throw new BadRequestException('Choose an end time after the scheduled start time.');
    if (endsAt.getTime() - startsAt.getTime() > 365 * DAY_MS) throw new BadRequestException('A trade schedule cannot run for more than 365 days.');
    if (input.minimumInvestment > input.maximumInvestment) throw new BadRequestException('Maximum investment must be at least the minimum investment.');
    const signal = await this.signals.create({ ...input, pair: input.pair.toUpperCase().replace(/\s/g, ''), startsAt, endsAt, status: 'scheduled', createdBy: actor.email });
    await this.writeAudit(actor.id, actor.email, 'trades.signal.scheduled', String(signal._id), `${signal.pair} copy trade`, `Starts ${startsAt.toISOString()} and ends ${endsAt.toISOString()}; configured ROI ${signal.roiPercent}% over ${lockTermLabel(endsAt.getTime() - startsAt.getTime())}.`);
    return this.serializeSignal(signal);
  }

  async closeSignal(signalId: string, actor: Actor) {
    if (!Types.ObjectId.isValid(signalId)) throw new NotFoundException('Copy trade not found.');
    const session = await this.positions.db.startSession();
    let signal!: CopyTradeSignal;
    const closedUsers: Array<{ id: string; loss: number }> = [];
    const now = new Date();
    try {
      await session.withTransaction(async () => {
        const closedSignal = await this.signals.findOneAndUpdate({ _id: signalId, status: 'open' }, { $set: { status: 'completed' } }, { new: true, session }).exec();
        if (!closedSignal) throw new ConflictException('This trade is already closed or unavailable.');
        signal = closedSignal;
        const settings = await this.financeSettings.findOne({ key: 'platform' }).session(session).lean().exec();
        const capitalUnlockAt = new Date(now.getTime() + (settings?.capitalLockDays ?? 60) * DAY_MS);
        const active = await this.positions.find({ signalId: new Types.ObjectId(signalId), status: 'active', principalReturnedAt: null }).session(session).exec();
        for (const position of active) {
          // Principal was debited at join. Returning principal minus the loss
          // realizes the loss exactly once without charging the wallet twice.
          const loss = Math.min(position.principal, this.interestAt(position, signal, now));
          const returnedPrincipal = Math.max(0, amountUnits(position.principal - loss) / TRADE_AMOUNT_SCALE);
          const updated = await this.positions.findOneAndUpdate({ _id: position._id, status: 'active', principalReturnedAt: null }, { $set: { status: 'closed_loss', stoppedAt: now, principalReturnedAt: now, principalReturnedAmount: returnedPrincipal, capitalUnlockAt, lossAmount: loss, lossAt: now } }, { new: true, session }).exec();
          if (!updated) continue;
          const userUpdate = await this.users.updateOne({ _id: position.userId }, { $inc: { tradingBalance: returnedPrincipal }, ...(returnedPrincipal > 0 ? { $push: { lockedCapitalLots: { amount: returnedPrincipal, unlockAt: capitalUnlockAt } } } : {}) }, { session }).exec();
          if (!userUpdate.matchedCount) throw new NotFoundException('Could not settle a copied trade position.');
          closedUsers.push({ id: String(position.userId), loss });
          await this.writeAudit(actor.id, actor.email, 'trades.position.closed_at_loss', String(position._id), `${signal.pair} copy trade`, `Admin closed the trade at ${now.toISOString()}; ${loss.toFixed(8)} USD loss was realized and ${returnedPrincipal.toFixed(8)} USD principal was returned to the investment balance, locked until ${capitalUnlockAt.toISOString()}.`, session);
        }
        await this.writeAudit(actor.id, actor.email, 'trades.signal.closed', signalId, `${signal.pair} copy trade`, `Admin closed the trade at ${now.toISOString()}; ${closedUsers.length} active position(s) settled at the loss accrued at closure.`, session);
      });
    } finally { await session.endSession(); }
    for (const recipient of closedUsers) await this.notifications.notifyUser(recipient.id, `Copy trade ended: ${signal.pair}`, `The trade ended early. ${recipient.loss.toFixed(2)} USD was realized as the loss at closure, and the remaining principal was returned to your investment balance. Watch out for the next trading session.`, 'general').catch((error) => this.logger.warn(`Trade end notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    await this.notifications.notifyAll(`Copy trade ended: ${signal.pair}`, `${signal.title} was closed early and is no longer accepting participants. Watch out for the next trading session.`, '/dashboard?view=trading').catch((error) => this.logger.warn(`Trade close notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    return this.serializeSignal(signal);
  }

  async cancelScheduledSignal(signalId: string, actor: Actor) {
    if (!Types.ObjectId.isValid(signalId)) throw new NotFoundException('Copy trade not found.');
    const signal = await this.signals.findOneAndUpdate({ _id: signalId, status: 'scheduled', startsAt: { $gt: new Date() } }, { $set: { status: 'cancelled' } }, { new: true }).exec();
    if (!signal) throw new ConflictException('Only a future scheduled trade can be cancelled. It may already be live or past its start time.');
    await this.writeAudit(actor.id, actor.email, 'trades.signal.cancelled', signalId, `${signal.pair} copy trade`, `Scheduled launch for ${new Date(signal.startsAt).toISOString()} cancelled before going live.`);
    await this.notifications.notifyAll(`Copy trade cancelled: ${signal.pair}`, `${signal.title} will not go live as scheduled.`, '/dashboard?view=trading').catch((error) => this.logger.warn(`Trade cancellation notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    return this.serializeSignal(signal);
  }

  private serializeSignal(signal: CopyTradeSignal & { _id?: unknown }, copiedBy?: number, participation?: TradePosition | null) {
    const endsAt = scheduleEndsAt(signal);
    return { id: String(signal._id), title: signal.title, pair: signal.pair, startsAt: signal.startsAt, endsAt, roiPercent: signal.roiPercent, lockDays: signalDuration(signal) / DAY_MS, minimumInvestment: signal.minimumInvestment, maximumInvestment: signal.maximumInvestment, status: signal.status, copiedBy: copiedBy ?? 0, participation: participation ? this.serializePosition(participation, signal) : null };
  }

  private interestAt(position: TradePosition, signal: CopyTradeSignal, now = new Date()) {
    return earnedTradeInterestUnits(position, signal, now) / TRADE_AMOUNT_SCALE;
  }

  private serializePosition(position: TradePosition, signal: CopyTradeSignal) {
    const accrued = this.interestAt(position, signal);
    return { id: String(position._id), signalId: String(signal._id), pair: signal.pair, title: signal.title, principal: position.principal, principalReturnedAmount: position.principalReturnedAmount ?? (position.principalReturnedAt ? position.principal : null), status: position.status, joinedAt: position.joinedAt, stoppedAt: position.stoppedAt ?? null, principalReturnedAt: position.principalReturnedAt ?? null, capitalUnlockAt: position.capitalUnlockAt ?? null, maturesAt: maturesAt(position, signal), roiPercent: signal.roiPercent, lockDays: signalDuration(signal) / DAY_MS, interestAccrued: accrued, interestClaimed: position.claimedInterest, interestAvailable: Math.max(0, accrued - position.claimedInterest), lossAmount: position.lossAmount ?? 0 };
  }

  async publishDueSignals() {
    const now = new Date();
    const due = await this.signals.find({ status: 'scheduled', startsAt: { $lte: now } }).limit(100).exec();
    for (const signal of due) {
      if (scheduleEndsAt(signal).getTime() <= now.getTime()) {
        await this.signals.updateOne({ _id: signal._id, status: 'scheduled' }, { $set: { status: 'completed' } }).exec();
        continue;
      }
      const opened = await this.signals.findOneAndUpdate({ _id: signal._id, status: 'scheduled', startsAt: { $lte: now } }, { $set: { status: 'open', publishedAt: now } }, { new: true }).exec();
      if (!opened) continue;
      try { await this.notifications.notifyAll(`Copy trade now open: ${opened.pair}`, `${opened.title} is live and available to join until ${scheduleEndsAt(opened).toISOString()}. Configured ROI: ${opened.roiPercent}% over ${lockTermLabel(signalDuration(opened))}.`, `/dashboard?view=trading`); }
      catch (error) { this.logger.error(`Trade launch notification failed for ${opened.pair}: ${error instanceof Error ? error.message : 'unknown error'}`); }
    }
    const open = await this.signals.find({ status: 'open', endsAt: { $lte: now } }).exec();
    for (const signal of open) {
      const ended = await this.signals.findOneAndUpdate({ _id: signal._id, status: 'open', endsAt: { $lte: now } }, { $set: { status: 'completed' } }, { new: true }).exec();
      if (ended) await this.notifications.notifyAll(`Copy trade ended: ${ended.pair}`, `${ended.title} has reached its scheduled end. Watch out for the next trading session.`, '/dashboard?view=trading').catch((error) => this.logger.warn(`Trade end notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    }
  }

  async userDashboard(userId: string) {
    await this.publishDueSignals();
    await this.settleMatured(userId);
    const [signals, nextSignal, positions] = await Promise.all([
      this.signals.find({ status: 'open' }).sort({ startsAt: 1 }).limit(50).lean().exec(),
      this.signals.findOne({ status: 'scheduled', startsAt: { $gt: new Date() } }).sort({ startsAt: 1 }).lean().exec(),
      this.positions.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(100).lean().exec(),
    ]);
    const ids = positions.map((item) => item.signalId);
    const pastSignals = ids.length ? await this.signals.find({ _id: { $in: ids } }).lean().exec() : [];
    const signalMap = new Map(pastSignals.map((item) => [String(item._id), item]));
    const positionMap = new Map(positions.map((item) => [String(item.signalId), item]));
    const activeSignals = signals.map((signal) => this.serializeSignal(signal, undefined, positionMap.get(String(signal._id)) ?? null));
    const pastPositions = positions.flatMap((position) => { const signal = signalMap.get(String(position.signalId)); return signal ? [this.serializePosition(position, signal)] : []; });
    const config = await this.financeSettings.findOne({ key: 'platform' }).lean().exec();
    return { openTrades: activeSignals, nextTrade: nextSignal ? this.serializeSignal(nextSignal) : null, positions: pastPositions, withdrawalSettings: { withdrawalDays: config?.withdrawalDays ?? [1, 3, 5], withdrawalWindowStart: config?.withdrawalWindowStart ?? '09:00', withdrawalWindowEnd: config?.withdrawalWindowEnd ?? '17:00', withdrawalTimezone: config?.withdrawalTimezone ?? 'Africa/Lagos' } };
  }

  async adminSignals() {
    await this.publishDueSignals();
    const signals = await this.signals.find().sort({ startsAt: -1 }).limit(200).lean().exec();
    const counts = await this.positions.aggregate<{ _id: Types.ObjectId; count: number }>([{ $match: { signalId: { $in: signals.map((item) => item._id) } } }, { $group: { _id: '$signalId', count: { $sum: 1 } } }]).exec();
    const countMap = new Map(counts.map((item) => [String(item._id), item.count]));
    return signals.map((signal) => this.serializeSignal(signal, countMap.get(String(signal._id)) ?? 0));
  }

  async join(userId: string, signalId: string) {
    await this.publishDueSignals();
    if (!Types.ObjectId.isValid(signalId)) throw new NotFoundException('Copy trade not found.');
    const signal = await this.signals.findOne({ _id: signalId, status: 'open' }).lean().exec();
    if (!signal) throw new ConflictException('This copy trade is not open for joining.');
    if (scheduleEndsAt(signal).getTime() <= Date.now()) throw new ConflictException('The scheduled copy-trade window has ended.');
    const session = await this.positions.db.startSession();
    let position: TradePosition | null = null;
    try {
      await session.withTransaction(async () => {
        if (await this.positions.exists({ userId: new Types.ObjectId(userId), signalId: new Types.ObjectId(signalId) }).session(session)) throw new ConflictException('You already joined or stopped this trade. You cannot join it again.');
        const openSignal = await this.signals.findOneAndUpdate({ _id: signalId, status: 'open' }, { $inc: { currentCopiers: 1 } }, { new: true, session }).exec();
        if (!openSignal) throw new ConflictException('This copy trade has just closed to new participants.');
        const investor = await this.users.findOne({ _id: userId, role: 'user', isDisabled: { $ne: true } }).session(session).select('tradingBalance maturedPrincipalBalance lockedCapitalLots pendingTradingWithdrawals pendingMaturedWithdrawals').lean().exec();
        if (!investor) throw new BadRequestException('Your account is not available to copy this trade.');
        const amount = amountUnits(Math.max(0, investor.tradingBalance - (investor.pendingTradingWithdrawals ?? 0) - (investor.pendingMaturedWithdrawals ?? 0))) / TRADE_AMOUNT_SCALE;
        if (amount < signal.minimumInvestment || amount > signal.maximumInvestment) throw new BadRequestException(`Your full available investment balance must be between ${signal.minimumInvestment} and ${signal.maximumInvestment} USD to copy this trade.`);
        const maturedToReinvest = Math.min(investor.maturedPrincipalBalance ?? 0, amount);
        let lockedToReinvest = amount - maturedToReinvest;
        const remainingLots: Array<{ amount: number; unlockAt: Date }> = [];
        for (const lot of [...(investor.lockedCapitalLots ?? [])].sort((a, b) => new Date(a.unlockAt).getTime() - new Date(b.unlockAt).getTime())) {
          const used = Math.min(lockedToReinvest, lot.amount);
          lockedToReinvest -= used;
          if (lot.amount - used > 1e-8) remainingLots.push({ amount: lot.amount - used, unlockAt: new Date(lot.unlockAt) });
        }
        const investorFilter: Record<string, unknown> = { _id: userId, tradingBalance: investor.tradingBalance };
        for (const field of ['pendingTradingWithdrawals', 'pendingMaturedWithdrawals'] as const) {
          const value = investor[field];
          investorFilter[field] = value === undefined ? { $exists: false } : value;
        }
        if (investor.maturedPrincipalBalance === undefined) investorFilter.maturedPrincipalBalance = { $exists: false };
        else investorFilter.maturedPrincipalBalance = investor.maturedPrincipalBalance;
        const debited = await this.users.updateOne(investorFilter, { $inc: { tradingBalance: -amount, ...(maturedToReinvest > 0 ? { maturedPrincipalBalance: -maturedToReinvest } : {}) }, $set: { lockedCapitalLots: remainingLots } }, { session }).exec();
        if (!debited.matchedCount) throw new ConflictException('Your investment balance changed. Refresh and try again.');
        const created = await this.positions.create([{ userId: new Types.ObjectId(userId), signalId: new Types.ObjectId(signalId), principal: amount, status: 'active', joinedAt: new Date(), claimedInterest: 0 }], { session });
        position = created[0];
        await this.writeAudit(userId, 'system', 'trades.position.joined', String(position._id), signal.pair, `${amount} USD principal locked until ${maturesAt(position, signal).toISOString()}.`, session);
      });
    } finally { await session.endSession(); }
    return { position: position ? this.serializePosition(position, signal) : null };
  }

  async stop(userId: string, positionId: string) {
    if (!Types.ObjectId.isValid(positionId)) throw new NotFoundException('Copy trade participation not found.');
    const session = await this.positions.db.startSession();
    let position: TradePosition | null = null;
    let signal!: CopyTradeSignal;
    try {
      await session.withTransaction(async () => {
        const now = new Date();
        const settings = await this.financeSettings.findOne({ key: 'platform' }).session(session).lean().exec();
        const capitalUnlockAt = new Date(now.getTime() + (settings?.capitalLockDays ?? 60) * DAY_MS);
        position = await this.positions.findOneAndUpdate({ _id: positionId, userId: new Types.ObjectId(userId), status: 'active', principalReturnedAt: null }, { $set: { status: 'stopped', stoppedAt: now, principalReturnedAt: now, capitalUnlockAt } }, { new: true, session }).exec();
        if (!position) throw new ConflictException('This trade is already stopped or completed.');
        signal = await this.signals.findById(position.signalId).session(session).exec() as CopyTradeSignal;
        if (!signal) throw new NotFoundException('Copy trade details not found.');
        const credited = await this.users.updateOne({ _id: position.userId }, { $inc: { tradingBalance: position.principal, maturedPrincipalBalance: 0 }, $push: { lockedCapitalLots: { amount: position.principal, unlockAt: capitalUnlockAt } } }, { session }).exec();
        if (!credited.matchedCount) throw new NotFoundException('Could not return the trade principal.');
        await this.writeAudit(userId, 'system', 'trades.position.stopped', positionId, signal.pair, `${position.principal} USD principal returned to the investment balance and locked for withdrawal until ${capitalUnlockAt.toISOString()}. ROI finalized at the stop time.`, session);
      });
    } finally { await session.endSession(); }
    if (!position) throw new ConflictException('This trade could not be stopped. Refresh and try again.');
    return this.serializePosition(position, signal);
  }

  async withdrawInterest(userId: string, positionId: string, amount: number, destinationAddress: string, network: string, verification: { pin?: string; verificationToken?: string }) {
    if (!Types.ObjectId.isValid(positionId)) throw new NotFoundException('Copy trade participation not found.');
    await this.withdrawalSecurity.assertWithdrawal(userId, verification, { amount, destinationAddress, network, source: `interest:${positionId}` });
    const session = await this.positions.db.startSession();
    let createdTransaction: FinanceTransaction | null = null;
    let referralPayouts: Array<{ userId: string; amount: number; tier: number }> = [];
    let signal!: CopyTradeSignal;
    try {
      await session.withTransaction(async () => {
        const position = await this.positions.findOne({ _id: positionId, userId: new Types.ObjectId(userId) }).session(session).exec();
        if (!position) throw new NotFoundException('Copy trade participation not found.');
        signal = await this.signals.findById(position.signalId).session(session).exec() as CopyTradeSignal;
        if (!signal) throw new NotFoundException('Copy trade details not found.');
        const activePosition = await this.positions.exists({ userId: new Types.ObjectId(userId), status: 'active' }).session(session).exec();
        if (activePosition) throw new BadRequestException('Close all active copy trades before requesting a profit withdrawal.');
        const now = new Date();
        const withdrawalSettings = await this.financeSettings.findOne({ key: 'platform' }).session(session).lean().exec();
        assertWithdrawalWindow(withdrawalSettings ?? {}, now);
        if (amount < (withdrawalSettings?.minimumWithdrawal ?? 0)) throw new BadRequestException(`The minimum withdrawal is ${withdrawalSettings?.minimumWithdrawal ?? 0} USD.`);
        const available = Math.max(0, this.interestAt(position, signal, now) - position.claimedInterest);
        if (amount < 0.01 || amount > available + 1e-8) throw new BadRequestException(`Available accrued interest is ${available.toFixed(8)} USD.`);
        const updatedPosition = await this.positions.findOneAndUpdate({ _id: positionId, claimedInterest: position.claimedInterest }, { $inc: { claimedInterest: amount } }, { new: true, session }).exec();
        if (!updatedPosition) throw new ConflictException('Interest balance changed. Refresh and try again.');
        const user = await this.users.findOne({ _id: userId, role: 'user', isDisabled: { $ne: true }, withdrawalsDisabled: { $ne: true } }).session(session).select('_id membershipLevel').lean().exec();
        if (!user) throw new NotFoundException('Account not found or withdrawals are disabled.');
        const membershipBenefit = await this.referrals.membershipBenefits(user.membershipLevel, session);
          const effectiveFeePercent = Math.max(0, (withdrawalSettings?.withdrawalFeePercent ?? 0) - membershipBenefit.withdrawalFeeDiscountPercent);
        const withdrawalFee = Math.round((amount * effectiveFeePercent / 100 + (withdrawalSettings?.withdrawalFeeFixed ?? 0)) * 1e8) / 1e8;
        const payoutAmount = Math.round((amount - withdrawalFee) * 1e8) / 1e8;
        if (payoutAmount <= 0) throw new BadRequestException('The withdrawal charge must be less than the withdrawal amount.');
        const docs = await this.transactions.create([{ userId: new Types.ObjectId(userId), type: 'withdrawal', amount, withdrawalFee, payoutAmount, balanceType: 'trading', status: 'pending_review', destinationAddress: destinationAddress.trim(), network: network.trim(), sourceType: 'trade_interest', profitLedger: true, tradePositionId: new Types.ObjectId(positionId) }], { session });
        createdTransaction = docs[0];
        referralPayouts = await this.referrals.accrueTrading(userId, String(createdTransaction._id), amount, session);
        await this.writeAudit(userId, 'system', 'trades.interest.withdrawal_requested', String(createdTransaction._id), signal.pair, `${amount} USD accrued interest requested; pending admin withdrawal review.`, session);
      });
    } finally { await session.endSession(); }
    if (createdTransaction) await this.notifications.notifyUser(userId, 'Trade interest withdrawal requested', `${amount} USD accrued interest has been submitted for review.`, 'withdrawal').catch((error) => this.logger.warn(`Interest request notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    for (const payout of referralPayouts) await this.notifications.notifyUser(payout.userId, 'Referral trading commission credited', `You earned ${payout.amount} USD from a tier ${payout.tier} referral’s copy-trade interest.`, 'general').catch((error) => this.logger.warn(`Referral trade commission notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    return { transaction: createdTransaction, message: 'Interest withdrawal request submitted for review.' };
  }

  async withdrawProfit(userId: string, amount: number, destinationAddress: string, network: string, verification: { pin?: string; verificationToken?: string }) {
    await this.withdrawalSecurity.assertWithdrawal(userId, verification, { amount, destinationAddress, network, source: 'profit' });
    const session = await this.positions.db.startSession();
    let createdTransaction: FinanceTransaction | null = null;
    let referralPayouts: Array<{ userId: string; amount: number; tier: number }> = [];
    try {
      await session.withTransaction(async () => {
        const user = await this.users.findOne({ _id: userId, role: 'user', isDisabled: { $ne: true }, withdrawalsDisabled: { $ne: true } }).session(session).select('_id membershipLevel').lean().exec();
        if (!user) throw new NotFoundException('Account not found or withdrawals are disabled.');
        const activePosition = await this.positions.exists({ userId: new Types.ObjectId(userId), status: 'active' }).session(session).exec();
        if (activePosition) throw new BadRequestException('Stop all active copy trades before requesting a profit withdrawal.');
        const now = new Date();
        const settings = await this.financeSettings.findOne({ key: 'platform' }).session(session).lean().exec();
        assertWithdrawalWindow(settings ?? {}, now);
        if (amount < (settings?.minimumWithdrawal ?? 0)) throw new BadRequestException(`The minimum withdrawal is ${settings?.minimumWithdrawal ?? 0} USD.`);

        const positions = await this.positions.find({ userId: new Types.ObjectId(userId), status: { $in: ['stopped', 'matured'] } }).sort({ joinedAt: 1 }).session(session).exec();
        const signalMap = new Map<string, CopyTradeSignal>();
        for (const position of positions) {
          const signal = await this.signals.findById(position.signalId).session(session).exec();
          if (signal) signalMap.set(String(position.signalId), signal);
        }
        // Work in the same 8-decimal unit precision as the withdrawal DTO so
        // binary floating-point residue cannot reject an amount shown as available.
        let remainingUnits = amountUnits(amount);
        const allocations: Array<{ positionId: Types.ObjectId; amount: number }> = [];
        for (const position of positions) {
          if (remainingUnits <= 0) break;
          const signal = signalMap.get(String(position.signalId));
          if (!signal) continue;
          const availableUnits = availableTradeInterestUnits(position, signal, now);
          const allocationUnits = Math.min(remainingUnits, availableUnits);
          if (!allocationUnits) continue;
          const allocation = allocationUnits / TRADE_AMOUNT_SCALE;
          const updated = await this.positions.updateOne({ _id: position._id, claimedInterest: position.claimedInterest }, { $inc: { claimedInterest: allocation } }, { session }).exec();
          if (!updated.matchedCount) throw new ConflictException('Profit balance changed. Refresh and try again.');
          allocations.push({ positionId: position._id as Types.ObjectId, amount: allocation });
          remainingUnits -= allocationUnits;
        }
        if (remainingUnits > 0) {
          const availableUnits = positions.reduce((total, position) => {
            const signal = signalMap.get(String(position.signalId));
            return signal ? total + availableTradeInterestUnits(position, signal, now) : total;
          }, 0);
          throw new BadRequestException(`Available profit from closed trades is ${(availableUnits / TRADE_AMOUNT_SCALE).toFixed(8)} USD. Refresh the balance and try again.`);
        }

        const membershipBenefit = await this.referrals.membershipBenefits(user.membershipLevel, session);
        const effectiveFeePercent = Math.max(0, (settings?.withdrawalFeePercent ?? 0) - membershipBenefit.withdrawalFeeDiscountPercent);
        const withdrawalFee = Math.round((amount * effectiveFeePercent / 100 + (settings?.withdrawalFeeFixed ?? 0)) * 1e8) / 1e8;
        const payoutAmount = Math.round((amount - withdrawalFee) * 1e8) / 1e8;
        if (payoutAmount <= 0) throw new BadRequestException('The withdrawal charge must be less than the withdrawal amount.');
        const docs = await this.transactions.create([{ userId: new Types.ObjectId(userId), type: 'withdrawal', amount, withdrawalFee, payoutAmount, balanceType: 'trading', status: 'pending_review', destinationAddress: destinationAddress.trim(), network: network.trim(), sourceType: 'trade_interest', profitLedger: true, profitPositionAllocations: allocations }], { session });
        createdTransaction = docs[0];
        referralPayouts = await this.referrals.accrueTrading(userId, String(createdTransaction._id), amount, session);
        await this.writeAudit(userId, 'system', 'trades.profit.withdrawal_requested', String(createdTransaction._id), 'Total profit earned', `${amount} USD profit withdrawal submitted across ${allocations.length} closed trade position(s); pending admin review.`, session);
      });
    } finally { await session.endSession(); }
    if (createdTransaction) await this.notifications.notifyUser(userId, 'Profit withdrawal requested', `${amount} USD profit has been submitted for review.`, 'withdrawal').catch((error) => this.logger.warn(`Profit withdrawal notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    if (createdTransaction) void this.notifications.notifyAdmins('Profit withdrawal submitted', 'A user submitted a profit withdrawal for review.', '/admin?section=withdrawals').catch(() => undefined);
    for (const payout of referralPayouts) await this.notifications.notifyUser(payout.userId, 'Referral trading commission credited', `You earned ${payout.amount} USD from a tier ${payout.tier} referral's copy-trade profit.`, 'general').catch((error) => this.logger.warn(`Referral trade commission notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    return { transaction: createdTransaction, message: 'Profit withdrawal request submitted for review.' };
  }

  async settleMatured(userId?: string) {
    const now = new Date();
    const filter = { status: { $in: ['active', 'stopped'] }, principalReturnedAt: null, ...(userId ? { userId: new Types.ObjectId(userId) } : {}) };
    const due = await this.positions.find(filter).limit(200).lean().exec();
    for (const item of due) {
      const signal = await this.signals.findById(item.signalId).lean().exec();
      if (!signal || maturesAt(item, signal).getTime() > now.getTime()) continue;
      const session = await this.positions.db.startSession();
      try {
        await session.withTransaction(async () => {
          const settled = await this.positions.findOneAndUpdate({ _id: item._id, status: { $in: ['active', 'stopped'] }, principalReturnedAt: null }, { $set: { status: 'matured', principalReturnedAt: now, principalReturnedAmount: item.principal } }, { new: true, session }).exec();
          if (!settled) return;
          const settings = await this.financeSettings.findOne({ key: 'platform' }).session(session).lean().exec();
          const capitalUnlockAt = new Date(now.getTime() + (settings?.capitalLockDays ?? 60) * DAY_MS);
          await this.positions.updateOne({ _id: settled._id }, { $set: { capitalUnlockAt } }, { session }).exec();
          const credited = await this.users.updateOne({ _id: settled.userId }, { $inc: { tradingBalance: settled.principal, maturedPrincipalBalance: 0 }, $push: { lockedCapitalLots: { amount: settled.principal, unlockAt: capitalUnlockAt } } }, { session }).exec();
          if (!credited.matchedCount) throw new NotFoundException('Could not return the matured trade principal.');
          await this.writeAudit(String(settled.userId), 'system', 'trades.position.matured', String(settled._id), signal.pair, `${settled.principal} USD principal returned to the investment balance and locked for withdrawal until ${capitalUnlockAt.toISOString()}.`, session);
        });
      } finally { await session.endSession(); }
    }
  }
}
