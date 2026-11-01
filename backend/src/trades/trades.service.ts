import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AdminAudit } from '../admin/admin-audit.schema.js';
import { FinanceTransaction } from '../finance/finance.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ReferralsService } from '../referrals/referrals.service.js';
import { User } from '../users/user.schema.js';
import { CreateTradeSignalDto } from './trade.dto.js';
import { CopyTradeSignal, TradePosition } from './trade.schema.js';

type Actor = { id: string; email: string };
const duration = (days: number) => days * 24 * 60 * 60 * 1000;
const maturesAt = (position: Pick<TradePosition, 'joinedAt'>, signal: Pick<CopyTradeSignal, 'lockDays'>) => new Date(new Date(position.joinedAt).getTime() + duration(signal.lockDays));

@Injectable()
export class TradesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradesService.name);
  private scheduler?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(CopyTradeSignal.name) private readonly signals: Model<CopyTradeSignal>,
    @InjectModel(TradePosition.name) private readonly positions: Model<TradePosition>,
    @InjectModel(FinanceTransaction.name) private readonly transactions: Model<FinanceTransaction>,
    @InjectModel(AdminAudit.name) private readonly audit: Model<AdminAudit>,
    private readonly notifications: NotificationsService,
    private readonly referrals: ReferralsService,
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
    if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) throw new BadRequestException('Choose a future start time.');
    if (input.minimumInvestment > input.maximumInvestment) throw new BadRequestException('Maximum investment must be at least the minimum investment.');
    if (input.interestWindowStart >= input.interestWindowEnd) throw new BadRequestException('Interest withdrawal window must end after it starts on the same day.');
    const days = [...new Set(input.interestWithdrawalDays)].sort();
    if (days.length !== input.interestWithdrawalDays.length) throw new BadRequestException('Choose each interest withdrawal day only once.');
    try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { throw new BadRequestException('Choose a valid timezone.'); }
    const signal = await this.signals.create({ ...input, pair: input.pair.toUpperCase().replace(/\s/g, ''), startsAt, interestWithdrawalDays: days, status: 'scheduled', createdBy: actor.email });
    await this.writeAudit(actor.id, actor.email, 'trades.signal.scheduled', String(signal._id), `${signal.pair} copy trade`, `Starts ${startsAt.toISOString()}; configured ROI ${signal.roiPercent}% over ${signal.lockDays} days.`);
    return this.serializeSignal(signal);
  }

  async closeSignal(signalId: string, actor: Actor) {
    if (!Types.ObjectId.isValid(signalId)) throw new NotFoundException('Copy trade not found.');
    const signal = await this.signals.findOneAndUpdate({ _id: signalId, status: 'open' }, { $set: { status: 'completed' } }, { new: true }).exec();
    if (!signal) throw new ConflictException('This trade is already closed or unavailable.');
    await this.writeAudit(actor.id, actor.email, 'trades.signal.closed', signalId, `${signal.pair} copy trade`, 'Stopped accepting new participants. Existing positions continue until their individual maturity dates.');
    await this.notifications.notifyAll(`Copy trade closed: ${signal.pair}`, `${signal.title} is no longer accepting new participants. Existing positions continue under their original terms.`, '/dashboard?view=trading').catch((error) => this.logger.warn(`Trade close notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    return this.serializeSignal(signal);
  }

  private serializeSignal(signal: CopyTradeSignal & { _id?: unknown }, copiedBy?: number, participation?: TradePosition | null) {
    return { id: String(signal._id), title: signal.title, pair: signal.pair, startsAt: signal.startsAt, roiPercent: signal.roiPercent, lockDays: signal.lockDays, minimumInvestment: signal.minimumInvestment, maximumInvestment: signal.maximumInvestment, interestWithdrawalDays: signal.interestWithdrawalDays, interestWindowStart: signal.interestWindowStart, interestWindowEnd: signal.interestWindowEnd, timezone: signal.timezone, status: signal.status, copiedBy: copiedBy ?? 0, participation: participation ? this.serializePosition(participation, signal) : null };
  }

  private interestAt(position: TradePosition, signal: CopyTradeSignal, now = new Date()) {
    const start = new Date(position.joinedAt).getTime();
    const end = maturesAt(position, signal).getTime();
    const cutoff = position.stoppedAt ? Math.min(new Date(position.stoppedAt).getTime(), end) : end;
    const elapsed = Math.max(0, Math.min(now.getTime(), cutoff) - start);
    const fullProfit = position.principal * signal.roiPercent / 100;
    return fullProfit * Math.min(1, elapsed / Math.max(1, end - start));
  }

  private serializePosition(position: TradePosition, signal: CopyTradeSignal) {
    const accrued = this.interestAt(position, signal);
    return { id: String(position._id), signalId: String(signal._id), pair: signal.pair, title: signal.title, principal: position.principal, status: position.status, joinedAt: position.joinedAt, stoppedAt: position.stoppedAt ?? null, principalReturnedAt: position.principalReturnedAt ?? null, maturesAt: maturesAt(position, signal), roiPercent: signal.roiPercent, lockDays: signal.lockDays, interestAccrued: accrued, interestClaimed: position.claimedInterest, interestAvailable: Math.max(0, accrued - position.claimedInterest), interestWithdrawalDays: signal.interestWithdrawalDays, interestWindowStart: signal.interestWindowStart, interestWindowEnd: signal.interestWindowEnd, timezone: signal.timezone };
  }

  async publishDueSignals() {
    const now = new Date();
    const due = await this.signals.find({ status: 'scheduled', startsAt: { $lte: now } }).limit(100).exec();
    for (const signal of due) {
      const opened = await this.signals.findOneAndUpdate({ _id: signal._id, status: 'scheduled', startsAt: { $lte: now } }, { $set: { status: 'open', publishedAt: now } }, { new: true }).exec();
      if (!opened) continue;
      try { await this.notifications.notifyAll(`Copy trade now open: ${opened.pair}`, `${opened.title} is live and available to join. Configured ROI: ${opened.roiPercent}% over ${opened.lockDays} days.`, `/dashboard?view=trading`); }
      catch (error) { this.logger.error(`Trade launch notification failed for ${opened.pair}: ${error instanceof Error ? error.message : 'unknown error'}`); }
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
    return { openTrades: activeSignals, nextTrade: nextSignal ? this.serializeSignal(nextSignal) : null, positions: pastPositions };
  }

  async adminSignals() {
    await this.publishDueSignals();
    const signals = await this.signals.find().sort({ startsAt: -1 }).limit(200).lean().exec();
    const counts = await this.positions.aggregate<{ _id: Types.ObjectId; count: number }>([{ $match: { signalId: { $in: signals.map((item) => item._id) } } }, { $group: { _id: '$signalId', count: { $sum: 1 } } }]).exec();
    const countMap = new Map(counts.map((item) => [String(item._id), item.count]));
    return signals.map((signal) => this.serializeSignal(signal, countMap.get(String(signal._id)) ?? 0));
  }

  async join(userId: string, signalId: string, amount: number) {
    await this.publishDueSignals();
    if (!Types.ObjectId.isValid(signalId)) throw new NotFoundException('Copy trade not found.');
    const signal = await this.signals.findOne({ _id: signalId, status: 'open' }).lean().exec();
    if (!signal) throw new ConflictException('This copy trade is not open for joining.');
    if (amount < signal.minimumInvestment || amount > signal.maximumInvestment) throw new BadRequestException(`Investment must be between ${signal.minimumInvestment} and ${signal.maximumInvestment} USD.`);
    const session = await this.positions.db.startSession();
    let position: TradePosition | null = null;
    try {
      await session.withTransaction(async () => {
        if (await this.positions.exists({ userId: new Types.ObjectId(userId), signalId: new Types.ObjectId(signalId) }).session(session)) throw new ConflictException('You already joined or stopped this trade. You cannot join it again.');
        const openSignal = await this.signals.findOneAndUpdate({ _id: signalId, status: 'open' }, { $inc: { currentCopiers: 1 } }, { new: true, session }).exec();
        if (!openSignal) throw new ConflictException('This copy trade has just closed to new participants.');
        const investor = await this.users.findOne({ _id: userId, role: 'user', isDisabled: { $ne: true }, $expr: { $gte: [{ $subtract: [{ $ifNull: ['$tradingBalance', 0] }, { $add: [{ $ifNull: ['$pendingTradingWithdrawals', 0] }, { $ifNull: ['$pendingMaturedWithdrawals', 0] }] }] }, amount] } }).session(session).select('tradingBalance maturedPrincipalBalance').lean().exec();
        if (!investor) throw new BadRequestException('Your available investment balance is too low for this amount.');
        const maturedToReinvest = Math.min(investor.maturedPrincipalBalance ?? 0, amount);
        const investorFilter: Record<string, unknown> = { _id: userId, tradingBalance: investor.tradingBalance };
        if (investor.maturedPrincipalBalance === undefined) investorFilter.maturedPrincipalBalance = { $exists: false };
        else investorFilter.maturedPrincipalBalance = investor.maturedPrincipalBalance;
        const debited = await this.users.updateOne(investorFilter, { $inc: { tradingBalance: -amount, ...(maturedToReinvest > 0 ? { maturedPrincipalBalance: -maturedToReinvest } : {}) } }, { session }).exec();
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
        position = await this.positions.findOneAndUpdate({ _id: positionId, userId: new Types.ObjectId(userId), status: 'active', principalReturnedAt: null }, { $set: { status: 'stopped', stoppedAt: now, principalReturnedAt: now } }, { new: true, session }).exec();
        if (!position) throw new ConflictException('This trade is already stopped or completed.');
        signal = await this.signals.findById(position.signalId).session(session).exec() as CopyTradeSignal;
        if (!signal) throw new NotFoundException('Copy trade details not found.');
        const credited = await this.users.updateOne({ _id: position.userId }, { $inc: { tradingBalance: position.principal, maturedPrincipalBalance: position.principal } }, { session }).exec();
        if (!credited.matchedCount) throw new NotFoundException('Could not return the trade principal.');
        await this.writeAudit(userId, 'system', 'trades.position.stopped', positionId, signal.pair, `${position.principal} USD principal returned immediately. ROI finalized at the stop time and remains available in the profit balance.`, session);
      });
    } finally { await session.endSession(); }
    if (!position) throw new ConflictException('This trade could not be stopped. Refresh and try again.');
    return this.serializePosition(position, signal);
  }

  private localDayAndTime(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    const weekday = parts.find((part) => part.type === 'weekday')?.value ?? '';
    const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[weekday];
    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    return { day, time: `${hour}:${minute}` };
  }

  async withdrawInterest(userId: string, positionId: string, amount: number, destinationAddress: string, network: string) {
    if (!Types.ObjectId.isValid(positionId)) throw new NotFoundException('Copy trade participation not found.');
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
        const local = this.localDayAndTime(now, signal.timezone);
        if (!signal.interestWithdrawalDays.includes(local.day) || local.time < signal.interestWindowStart || local.time > signal.interestWindowEnd) throw new BadRequestException(`Interest can be requested ${signal.interestWithdrawalDays.map((day) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]).join(', ')} between ${signal.interestWindowStart} and ${signal.interestWindowEnd} (${signal.timezone}).`);
        const available = Math.max(0, this.interestAt(position, signal, now) - position.claimedInterest);
        if (amount < 0.01 || amount > available + 1e-8) throw new BadRequestException(`Available accrued interest is ${available.toFixed(8)} USD.`);
        const updatedPosition = await this.positions.findOneAndUpdate({ _id: positionId, claimedInterest: position.claimedInterest }, { $inc: { claimedInterest: amount } }, { new: true, session }).exec();
        if (!updatedPosition) throw new ConflictException('Interest balance changed. Refresh and try again.');
        const user = await this.users.findOne({ _id: userId, role: 'user', isDisabled: { $ne: true }, withdrawalsDisabled: { $ne: true } }).session(session).select('_id').lean().exec();
        if (!user) throw new NotFoundException('Account not found or withdrawals are disabled.');
        const docs = await this.transactions.create([{ userId: new Types.ObjectId(userId), type: 'withdrawal', amount, balanceType: 'trading', status: 'pending_review', destinationAddress: destinationAddress.trim(), network: network.trim(), sourceType: 'trade_interest', profitLedger: true, tradePositionId: new Types.ObjectId(positionId) }], { session });
        createdTransaction = docs[0];
        referralPayouts = await this.referrals.accrueTrading(userId, String(createdTransaction._id), amount, session);
        await this.writeAudit(userId, 'system', 'trades.interest.withdrawal_requested', String(createdTransaction._id), signal.pair, `${amount} USD accrued interest requested; pending admin withdrawal review.`, session);
      });
    } finally { await session.endSession(); }
    if (createdTransaction) await this.notifications.notifyUser(userId, 'Trade interest withdrawal requested', `${amount} USD accrued interest has been submitted for review.`, 'withdrawal').catch((error) => this.logger.warn(`Interest request notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    for (const payout of referralPayouts) await this.notifications.notifyUser(payout.userId, 'Referral trading commission credited', `You earned ${payout.amount} USD from a tier ${payout.tier} referral’s copy-trade interest.`, 'general').catch((error) => this.logger.warn(`Referral trade commission notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
    return { transaction: createdTransaction, message: 'Interest withdrawal request submitted for admin review.' };
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
          const settled = await this.positions.findOneAndUpdate({ _id: item._id, status: { $in: ['active', 'stopped'] }, principalReturnedAt: null }, { $set: { status: 'matured', principalReturnedAt: now } }, { new: true, session }).exec();
          if (!settled) return;
          const credited = await this.users.updateOne({ _id: settled.userId }, { $inc: { tradingBalance: settled.principal, maturedPrincipalBalance: settled.principal } }, { session }).exec();
          if (!credited.matchedCount) throw new NotFoundException('Could not return the matured trade principal.');
          await this.writeAudit(String(settled.userId), 'system', 'trades.position.matured', String(settled._id), signal.pair, `${settled.principal} USD principal returned to available investment balance.`, session);
        });
      } finally { await session.endSession(); }
    }
  }
}
