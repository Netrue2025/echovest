import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { AdminAudit } from '../admin/admin-audit.schema.js';
import { User } from '../users/user.schema.js';
import { TradePosition } from '../trades/trade.schema.js';
import { DEFAULT_MEMBERSHIP_TIERS, DEFAULT_REFERRAL_RATES, MEMBERSHIP_LEVELS, MembershipLevel, MembershipTier, ReferralEarning, ReferralRate, ReferralSettings } from './referral.schema.js';

type Actor = { id: string; email: string };
type CreditedReferral = { userId: string; amount: number; tier: number };

function lockedCapitalTotal(lots?: Array<{ amount: number; unlockAt: Date }>) {
  const now = Date.now();
  return (lots ?? []).reduce((total, lot) => total + (new Date(lot.unlockAt).getTime() > now ? lot.amount : 0), 0);
}

@Injectable()
export class ReferralsService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(ReferralSettings.name) private readonly settings: Model<ReferralSettings>,
    @InjectModel(ReferralEarning.name) private readonly earnings: Model<ReferralEarning>,
    @InjectModel(AdminAudit.name) private readonly audit: Model<AdminAudit>,
    @InjectModel(TradePosition.name) private readonly positions: Model<TradePosition>,
  ) {}

  private async config() {
    return this.settings.findOneAndUpdate({ key: 'platform' }, { $setOnInsert: { key: 'platform', rates: DEFAULT_REFERRAL_RATES, levels: DEFAULT_MEMBERSHIP_TIERS } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean().exec();
  }

  async myOverview(userId: string) { return this.overview(userId); }
  async adminOverview(userId: string) { return this.overview(userId); }
  async listReferralUsers() { return this.users.find({ role: 'user' }).select('_id fullName membershipLevel').sort({ fullName: 1 }).lean().exec().then((items) => items.map((item) => ({ id: String(item._id), fullName: item.fullName, membershipLevel: item.membershipLevel || 'Blue' }))); }

  private membershipTiers(configured?: MembershipTier[]) {
    return DEFAULT_MEMBERSHIP_TIERS.map((fallback) => ({ ...fallback, ...(configured?.find((item) => item.level === fallback.level) ?? {}) }));
  }

  async membershipBenefits(level?: string, session?: ClientSession, userId?: string) {
    const query = this.settings.findOne({ key: 'platform' });
    if (session) query.session(session);
    const settings = await query.lean().exec();
    const normalizedLevel = userId
      ? await this.reconcileMembershipLevel(userId, this.membershipTiers(settings?.levels), session)
      : MEMBERSHIP_LEVELS.includes((level || 'Blue') as MembershipLevel) ? (level || 'Blue') as MembershipLevel : 'Blue';
    return this.membershipTiers(settings?.levels).find((item) => item.level === normalizedLevel) ?? DEFAULT_MEMBERSHIP_TIERS[0];
  }

  private qualifiedLevel(levels: MembershipTier[], directReferrals: number, lockedTradingBalance: number): MembershipLevel {
    let qualified: MembershipLevel = 'Blue';
    for (const level of MEMBERSHIP_LEVELS.slice(1)) {
      const requirement = levels.find((item) => item.level === level);
      if (!requirement) continue;
      const meetsReferralCriterion = requirement.requiredDirectReferrals > 0 && directReferrals >= requirement.requiredDirectReferrals;
      const meetsBalanceCriterion = requirement.requiredTradingBalance > 0 && lockedTradingBalance >= requirement.requiredTradingBalance;
      if (meetsReferralCriterion || meetsBalanceCriterion) qualified = level;
    }
    return qualified;
  }

  private async saveMembershipLevel(user: { _id: unknown; fullName?: string; membershipLevel?: string | null }, nextLevel: MembershipLevel, detail: string, session?: ClientSession) {
    const current = user.membershipLevel && MEMBERSHIP_LEVELS.includes(user.membershipLevel as MembershipLevel) ? user.membershipLevel as MembershipLevel : 'Blue';
    if (current === nextLevel && user.membershipLevel === nextLevel) return nextLevel;
    const previousFilter = user.membershipLevel == null
      ? { $or: [{ membershipLevel: { $exists: false } }, { membershipLevel: null }] }
      : { membershipLevel: user.membershipLevel };
    const changed = await this.users.updateOne({ _id: user._id, ...previousFilter }, { $set: { membershipLevel: nextLevel } }, session ? { session } : {}).exec();
    if (changed.matchedCount) {
      const action = MEMBERSHIP_LEVELS.indexOf(nextLevel) > MEMBERSHIP_LEVELS.indexOf(current) ? 'membership.level.upgraded' : 'membership.level.downgraded';
      await this.audit.create([{ actorId: 'system', actorEmail: 'system', action, targetType: 'user', targetId: String(user._id), targetLabel: user.fullName ?? String(user._id), detail }], session ? { session } : {});
      return nextLevel;
    }
    const latest = await this.users.findById(user._id).select('membershipLevel').session(session ?? null).lean().exec();
    return latest?.membershipLevel && MEMBERSHIP_LEVELS.includes(latest.membershipLevel as MembershipLevel) ? latest.membershipLevel as MembershipLevel : 'Blue';
  }

  private async reconcileMembershipLevel(userId: string, levels: MembershipTier[], session?: ClientSession): Promise<MembershipLevel> {
    const userQuery = this.users.findById(userId).select('fullName membershipLevel lockedCapitalLots');
    if (session) userQuery.session(session);
    const user = await userQuery.lean().exec();
    if (!user) return 'Blue';
    const id = new Types.ObjectId(userId);
    const directQuery = this.users.countDocuments({ referredBy: id, role: 'user' });
    const positionsQuery = this.positions.find({ userId: id, status: { $in: ['active', 'stopped'] }, principalReturnedAt: null }).select('principal');
    if (session) { directQuery.session(session); positionsQuery.session(session); }
    const [directReferrals, positions] = await Promise.all([directQuery.exec(), positionsQuery.lean().exec()]);
    const lockedTradingBalance = lockedCapitalTotal(user.lockedCapitalLots) + positions.reduce((total, position) => total + position.principal, 0);
    const nextLevel = this.qualifiedLevel(levels, directReferrals, lockedTradingBalance);
    const previous = user.membershipLevel && MEMBERSHIP_LEVELS.includes(user.membershipLevel as MembershipLevel) ? user.membershipLevel as MembershipLevel : 'Blue';
    const qualification = nextLevel === 'Blue' ? 'Blue starting level; no higher-tier requirement is currently met.' : `${directReferrals} direct referrals and ${lockedTradingBalance} USD locked trading capital were checked against configured requirements.`;
    return this.saveMembershipLevel(user, nextLevel, `Membership changed from ${previous} to ${nextLevel}. ${qualification}`, session);
  }

  async reconcileAllMembershipLevels() {
    const [settings, users, directCounts, activeCapital] = await Promise.all([
      this.config(),
      this.users.find({ role: 'user' }).select('_id fullName membershipLevel lockedCapitalLots').lean().exec(),
      this.users.aggregate<{ _id: Types.ObjectId; count: number }>([{ $match: { role: 'user', referredBy: { $ne: null } } }, { $group: { _id: '$referredBy', count: { $sum: 1 } } }]).exec(),
      this.positions.aggregate<{ _id: Types.ObjectId; total: number }>([{ $match: { status: { $in: ['active', 'stopped'] }, principalReturnedAt: null } }, { $group: { _id: '$userId', total: { $sum: '$principal' } } }]).exec(),
    ]);
    const levels = this.membershipTiers(settings?.levels);
    const referralMap = new Map(directCounts.map((row) => [String(row._id), row.count]));
    const capitalMap = new Map(activeCapital.map((row) => [String(row._id), row.total]));
    for (const user of users) {
      const id = String(user._id);
      const lockedTradingBalance = lockedCapitalTotal(user.lockedCapitalLots) + (capitalMap.get(id) ?? 0);
      const nextLevel = this.qualifiedLevel(levels, referralMap.get(id) ?? 0, lockedTradingBalance);
      const previous = user.membershipLevel && MEMBERSHIP_LEVELS.includes(user.membershipLevel as MembershipLevel) ? user.membershipLevel as MembershipLevel : 'Blue';
      if (previous !== nextLevel || user.membershipLevel !== nextLevel) {
        const qualification = nextLevel === 'Blue' ? 'No higher-tier requirement is currently met.' : `${referralMap.get(id) ?? 0} direct referrals and ${lockedTradingBalance} USD locked trading capital were checked against configured requirements.`;
        await this.saveMembershipLevel(user, nextLevel, `Membership changed from ${previous} to ${nextLevel}. ${qualification}`, undefined);
      }
    }
    return users.length;
  }

  private async overview(userId: string) {
    const user = await this.users.findById(userId).select('fullName referralCode membershipLevel tradingBalance lockedCapitalLots').lean().exec();
    if (!user) throw new NotFoundException('Account not found.');
    const referralCode = user.referralCode || await this.ensureCode(userId);
    const [settings, earningsTotal, activePositions] = await Promise.all([
      this.config(),
      this.earnings.aggregate([{ $match: { referrerId: new Types.ObjectId(userId) } }, { $group: { _id: null, total: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, { $multiply: ['$amount', -1] }, '$amount'] } } } }]).exec(),
      this.positions.find({ userId: new Types.ObjectId(userId), status: { $in: ['active', 'stopped'] }, principalReturnedAt: null }).select('principal').lean().exec(),
    ]);
    const lockedTradingBalance = lockedCapitalTotal(user.lockedCapitalLots) + activePositions.reduce((total, position) => total + position.principal, 0);

    const members: Array<{ id: string; fullName: string; tier: number; joinedAt?: Date; earned: number }> = [];
    let parentIds = [new Types.ObjectId(userId)];
    for (let tier = 1; tier <= 3 && parentIds.length; tier++) {
      const children = await this.users.find({ referredBy: { $in: parentIds }, role: 'user' }).select('_id fullName createdAt').lean().exec();
      if (!children.length) break;
      members.push(...children.map((child) => ({ id: String(child._id), fullName: child.fullName, tier, joinedAt: child.createdAt, earned: 0 })));
      parentIds = children.map((child) => child._id as Types.ObjectId);
    }
    if (members.length) {
      const earned = await this.earnings.aggregate([
        { $match: { referrerId: new Types.ObjectId(userId), downlineUserId: { $in: members.map((member) => new Types.ObjectId(member.id)) } } },
        { $group: { _id: '$downlineUserId', total: { $sum: { $cond: [{ $eq: ['$direction', 'debit'] }, { $multiply: ['$amount', -1] }, '$amount'] } } } },
      ]).exec();
      const totals = new Map(earned.map((entry) => [String(entry._id), entry.total]));
      for (const member of members) member.earned = totals.get(member.id) ?? 0;
    }
    const counts = { tier1: members.filter((member) => member.tier === 1).length, tier2: members.filter((member) => member.tier === 2).length, tier3: members.filter((member) => member.tier === 3).length };
    const levels = this.membershipTiers(settings?.levels);
    const level = await this.saveMembershipLevel(user, this.qualifiedLevel(levels, counts.tier1, lockedTradingBalance), `Membership reconciled from ${user.membershipLevel || 'Blue'} to ${this.qualifiedLevel(levels, counts.tier1, lockedTradingBalance)}; verified ${counts.tier1} direct referrals and ${lockedTradingBalance} USD locked trading capital against configured criteria.`);
    const currentRates = settings?.rates?.find((row) => row.level === level) ?? DEFAULT_REFERRAL_RATES[0];
    return {
      referralCode,
      membershipLevel: level,
      lockedTradingBalance,
      membershipLevels: levels,
      membershipRates: settings?.rates ?? DEFAULT_REFERRAL_RATES,
      referralBalanceEarned: earningsTotal[0]?.total ?? 0,
      rates: currentRates,
      counts,
      downliners: members,
    };
  }

  async getSettings() { const settings = await this.config(); return { rates: settings?.rates ?? DEFAULT_REFERRAL_RATES, levels: this.membershipTiers(settings?.levels) }; }

  async updateSettings(rates: ReferralRate[], levels: MembershipTier[], actor: Actor) {
    if (rates.length !== MEMBERSHIP_LEVELS.length || new Set(rates.map((item) => item.level)).size !== MEMBERSHIP_LEVELS.length || !MEMBERSHIP_LEVELS.every((level) => rates.some((item) => item.level === level))) {
      throw new BadRequestException('Provide one commission row for each membership level.');
    }
    for (const row of rates) {
      if (![row.tier1, row.tier2, row.tier3].every((rate) => Number.isFinite(rate) && rate >= 0 && rate <= 100)) throw new BadRequestException('Commission rates must be between 0 and 100 percent.');
      if (row.tier2 > row.tier1 || row.tier3 > row.tier2) throw new BadRequestException('Commission rates must stay the same or decrease at deeper tiers.');
    }
    const ordered = MEMBERSHIP_LEVELS.map((level) => rates.find((item) => item.level === level)!);
    for (let index = 1; index < ordered.length; index += 1) {
      const current = ordered[index], previous = ordered[index - 1];
      if (current.tier1 < previous.tier1 || current.tier2 < previous.tier2 || current.tier3 < previous.tier3) throw new BadRequestException('Referral commission rates must stay the same or increase at higher membership levels.');
    }
    if (levels.length !== MEMBERSHIP_LEVELS.length || new Set(levels.map((item) => item.level)).size !== MEMBERSHIP_LEVELS.length || !MEMBERSHIP_LEVELS.every((level) => levels.some((item) => item.level === level))) throw new BadRequestException('Provide qualification and benefit settings for every membership level.');
    const orderedLevels = MEMBERSHIP_LEVELS.map((level) => levels.find((item) => item.level === level)!);
    if (orderedLevels[0].requiredDirectReferrals !== 0 || orderedLevels[0].requiredTradingBalance !== 0) throw new BadRequestException('The starting Blue level must not have an upgrade requirement.');
    for (let index = 0; index < orderedLevels.length; index += 1) {
      const row = orderedLevels[index];
      if (![row.requiredDirectReferrals, row.requiredTradingBalance, row.withdrawalReviewHours, row.withdrawalFeeDiscountPercent].every(Number.isFinite) || row.requiredDirectReferrals < 0 || !Number.isInteger(row.requiredDirectReferrals) || row.requiredTradingBalance < 0 || row.withdrawalReviewHours < 0 || row.withdrawalReviewHours > 720 || !Number.isInteger(row.withdrawalReviewHours) || row.withdrawalFeeDiscountPercent < 0 || row.withdrawalFeeDiscountPercent > 100) throw new BadRequestException('Membership criteria and benefits contain an invalid value.');
      if (index > 0) {
        const previous = orderedLevels[index - 1];
        if (row.requiredDirectReferrals < previous.requiredDirectReferrals || row.requiredTradingBalance < previous.requiredTradingBalance) throw new BadRequestException('Upgrade requirements must stay the same or increase at higher levels.');
        if (row.withdrawalReviewHours > 0 && previous.withdrawalReviewHours > 0 && row.withdrawalReviewHours > previous.withdrawalReviewHours) throw new BadRequestException('Withdrawal review targets must stay the same or get faster at higher levels.');
        if (row.withdrawalFeeDiscountPercent < previous.withdrawalFeeDiscountPercent) throw new BadRequestException('Withdrawal fee discounts must stay the same or increase at higher levels.');
      }
    }
    const result = await this.settings.findOneAndUpdate({ key: 'platform' }, { $set: { rates: ordered, levels: orderedLevels } }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }).lean().exec();
    const detail = orderedLevels.map((tier, index) => `${tier.level}: ${tier.requiredDirectReferrals} direct referrals or ${tier.requiredTradingBalance} USD locked balance; ${tier.withdrawalReviewHours || 'standard'}h withdrawal review target; ${tier.withdrawalFeeDiscountPercent} percentage-point withdrawal fee reduction; referral commission ${ordered[index].tier1}/${ordered[index].tier2}/${ordered[index].tier3}%.`).join(' | ');
    await this.audit.create({ actorId: actor.id, actorEmail: actor.email, action: 'membership.settings.updated', targetType: 'referrals', targetId: 'platform', targetLabel: 'Membership levels', detail });
    await this.reconcileAllMembershipLevels();
    return { rates: result?.rates ?? ordered, levels: this.membershipTiers(result?.levels ?? orderedLevels) };
  }

  async adjustBonus(userId: string, amount: number, direction: 'credit' | 'debit', reason: string, actor: Actor) {
    if (!Types.ObjectId.isValid(userId)) throw new NotFoundException('User account not found.');
    const session = await this.users.db.startSession();
    const cleanReason = reason.trim();
    const sourceId = `manual-${new Types.ObjectId().toHexString()}`;
    try {
      await session.withTransaction(async () => {
        const filter = { _id: new Types.ObjectId(userId), role: 'user', ...(direction === 'debit' ? { referralBalance: { $gte: amount } } : {}) };
        const update = { $inc: { referralBalance: direction === 'credit' ? amount : -amount } };
        const changed = await this.users.updateOne(filter, update, { session }).exec();
        if (!changed.matchedCount) throw new BadRequestException(direction === 'debit' ? 'The adjustment exceeds the user’s referral balance.' : 'User account not found.');
        await this.earnings.create([{ referrerId: new Types.ObjectId(userId), sourceType: 'manual', sourceId, tier: 1, membershipLevel: 'Blue', rate: 0, direction, sourceAmount: amount, amount, reason: cleanReason }], { session });
        await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: `referrals.bonus.${direction}`, targetType: 'user', targetId: userId, targetLabel: userId, detail: `${direction === 'credit' ? 'Credited' : 'Debited'} ${amount} USD referral balance. Reason: ${cleanReason}` }], { session });
      });
    } finally { await session.endSession(); }
    return { userId, amount, direction, reason: cleanReason };
  }

  async accrueDeposit(sourceUserId: string, sourceId: string, sourceAmount: number, session: ClientSession): Promise<CreditedReferral[]> {
    return this.accrueEarnings(sourceUserId, sourceId, sourceAmount, session, 'deposit');
  }

  async accrueTrading(sourceUserId: string, sourceId: string, sourceAmount: number, session: ClientSession): Promise<CreditedReferral[]> {
    return this.accrueEarnings(sourceUserId, sourceId, sourceAmount, session, 'trading');
  }

  private async accrueEarnings(sourceUserId: string, sourceId: string, sourceAmount: number, session: ClientSession, sourceType: 'deposit' | 'trading'): Promise<CreditedReferral[]> {
    const settings = await this.config();
    const rates = settings?.rates ?? DEFAULT_REFERRAL_RATES;
    let source = await this.users.findById(sourceUserId).select('referredBy').session(session).lean().exec();
    const credited: CreditedReferral[] = [];
    for (let tier = 1; tier <= 3 && source?.referredBy; tier++) {
      const referrerId = source.referredBy;
      const referrer = await this.users.findById(referrerId).select('role isDisabled membershipLevel referredBy email').session(session).lean().exec();
      if (!referrer || referrer.role !== 'user') break;
      const level = await this.reconcileMembershipLevel(String(referrerId), this.membershipTiers(settings?.levels), session);
      const row = rates.find((item) => item.level === level);
      const rate = row?.[`tier${tier}` as 'tier1' | 'tier2' | 'tier3'] ?? 0;
      const amount = Math.floor((sourceAmount * rate / 100) * 1e8) / 1e8;
      if (!referrer.isDisabled && rate > 0 && amount >= 0.00000001) {
        await this.earnings.create([{ referrerId, downlineUserId: new Types.ObjectId(sourceUserId), sourceType, sourceId, tier, membershipLevel: level, rate, sourceAmount, amount }], { session });
        const updated = await this.users.updateOne({ _id: referrerId, role: 'user', isDisabled: { $ne: true } }, { $inc: { referralBalance: amount } }, { session }).exec();
        if (!updated.matchedCount) throw new NotFoundException('Referral account is unavailable.');
        await this.audit.create([{ actorId: 'system', actorEmail: 'system', action: 'referrals.commission.credited', targetType: 'user', targetId: String(referrerId), targetLabel: String(referrerId), detail: `${amount} USD tier ${tier} ${sourceType} commission from ${sourceType} earnings ${sourceId}.` }], { session });
        credited.push({ userId: String(referrerId), amount, tier });
      }
      source = referrer;
    }
    return credited;
  }

  private async ensureCode(userId: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = `EV${new Types.ObjectId().toHexString().slice(-12).toUpperCase()}`;
      try {
        const updated = await this.users.findOneAndUpdate({ _id: userId, $or: [{ referralCode: { $exists: false } }, { referralCode: null }] }, { $set: { referralCode: code } }, { new: true }).select('referralCode').lean().exec();
        if (updated?.referralCode) return updated.referralCode;
        const existing = await this.users.findById(userId).select('referralCode').lean().exec();
        if (existing?.referralCode) return existing.referralCode;
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
      }
    }
    throw new Error('Could not assign a referral code.');
  }
}
