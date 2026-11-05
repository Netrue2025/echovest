import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

export const MEMBERSHIP_LEVELS = ['Blue', 'Elite', 'Silver', 'Gold', 'Platinum'] as const;
export type MembershipLevel = typeof MEMBERSHIP_LEVELS[number];
export type ReferralRate = { level: MembershipLevel; tier1: number; tier2: number; tier3: number };
export type MembershipTier = {
  level: MembershipLevel;
  requiredDirectReferrals: number;
  requiredTradingBalance: number;
  withdrawalReviewHours: number;
  withdrawalFeeDiscountPercent: number;
};

export const DEFAULT_REFERRAL_RATES: ReferralRate[] = MEMBERSHIP_LEVELS.map((level) => ({ level, tier1: 0, tier2: 0, tier3: 0 }));
export const DEFAULT_MEMBERSHIP_TIERS: MembershipTier[] = MEMBERSHIP_LEVELS.map((level) => ({ level, requiredDirectReferrals: 0, requiredTradingBalance: 0, withdrawalReviewHours: 24, withdrawalFeeDiscountPercent: 0 }));

@Schema({ collection: 'referral_settings' })
export class ReferralSettings {
  @Prop({ required: true, unique: true, default: 'platform' }) key!: string;
  @Prop({ type: [{ _id: false, level: String, tier1: Number, tier2: Number, tier3: Number }], default: [] }) rates!: ReferralRate[];
  @Prop({ type: [{ _id: false, level: String, requiredDirectReferrals: Number, requiredTradingBalance: Number, withdrawalReviewHours: Number, withdrawalFeeDiscountPercent: Number }], default: [] }) levels!: MembershipTier[];
}
export const ReferralSettingsSchema = SchemaFactory.createForClass(ReferralSettings);

@Schema({ timestamps: true, collection: 'referral_earnings' })
export class ReferralEarning {
  @Prop({ type: Types.ObjectId, required: true, index: true }) referrerId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, default: null, index: true }) downlineUserId?: Types.ObjectId | null;
  @Prop({ required: true, enum: ['deposit', 'trading', 'manual'] }) sourceType!: 'deposit' | 'trading' | 'manual';
  @Prop({ required: true }) sourceId!: string;
  @Prop({ required: true, min: 1, max: 3 }) tier!: number;
  @Prop({ required: true, enum: MEMBERSHIP_LEVELS }) membershipLevel!: MembershipLevel;
  @Prop({ required: true, min: 0, max: 100 }) rate!: number;
  @Prop({ required: true, enum: ['credit', 'debit'], default: 'credit' }) direction!: 'credit' | 'debit';
  @Prop({ required: true, min: 0 }) sourceAmount!: number;
  @Prop({ required: true, min: 0.00000001 }) amount!: number;
  @Prop({ default: '' }) reason!: string;
}
export const ReferralEarningSchema = SchemaFactory.createForClass(ReferralEarning);
ReferralEarningSchema.index({ sourceType: 1, sourceId: 1, referrerId: 1 }, { unique: true });
ReferralEarningSchema.index({ referrerId: 1, createdAt: -1 });
