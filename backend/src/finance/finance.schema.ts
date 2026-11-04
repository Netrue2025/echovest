import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type FinanceTransactionDocument = HydratedDocument<FinanceTransaction>;
@Schema({ timestamps: true, collection: 'finance_transactions' })
export class FinanceTransaction {
  _id?: unknown;
  createdAt?: Date;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ['deposit', 'withdrawal'], index: true }) type!: 'deposit' | 'withdrawal';
  @Prop({ required: true, min: 0.01 }) amount!: number;
  @Prop({ type: Number, default: 0, min: 0 }) withdrawalFee!: number;
  @Prop({ type: Number, default: 0, min: 0 }) payoutAmount!: number;
  @Prop({ required: true, enum: ['trading', 'referral'], default: 'trading' }) balanceType!: 'trading' | 'referral';
  @Prop({ required: true, enum: ['network_confirmation', 'pending_review', 'approved', 'rejected'], index: true }) status!: 'network_confirmation' | 'pending_review' | 'approved' | 'rejected';
  @Prop({ sparse: true, unique: true }) txid?: string;
  @Prop({ default: '' }) destinationAddress!: string;
  @Prop({ default: '' }) network!: string;
  @Prop({ default: '' }) rejectionReason!: string;
  @Prop({ default: '' }) reviewedBy!: string;
  @Prop() reviewedAt?: Date;
  @Prop({ enum: ['trade_interest'] }) sourceType?: 'trade_interest';
  @Prop({ default: false }) profitLedger?: boolean;
  // Individual position allocations may be fractions of a cent even though
  // the combined withdrawal must meet the platform's minimum amount.
  @Prop({ type: [{ positionId: { type: Types.ObjectId, required: true }, amount: { type: Number, required: true, min: 0.00000001 } }], default: [] }) profitPositionAllocations!: Array<{ positionId: Types.ObjectId; amount: number }>;
  @Prop({ default: false }) maturedPrincipalWithdrawal?: boolean;
  @Prop({ type: Types.ObjectId, default: null }) tradePositionId?: Types.ObjectId | null;
  // History may be hidden by an authorized admin, but the financial record stays intact.
  @Prop({ type: Date }) archivedAt?: Date;
  @Prop({ type: String }) archivedBy?: string;
  @Prop({ type: String, default: '' }) archiveReason?: string;
}
export const FinanceTransactionSchema = SchemaFactory.createForClass(FinanceTransaction);
FinanceTransactionSchema.index({ userId: 1, createdAt: -1 });

@Schema({ collection: 'finance_settings' })
export class FinanceSettings {
  @Prop({ required: true, unique: true, default: 'platform' }) key!: string;
  @Prop({ default: '' }) depositWalletAddress!: string;
  @Prop({ default: '' }) depositNetwork!: string;
  @Prop({ default: '' }) depositInstructions!: string;
  @Prop({ enum: ['manual', 'chainpay'] }) depositMethod?: 'manual' | 'chainpay';
  @Prop({ default: 0, min: 0 }) minimumDeposit!: number;
  @Prop({ default: 0, min: 0 }) minimumWithdrawal!: number;
  @Prop({ type: Number, default: 0, min: 0, max: 100 }) withdrawalFeePercent!: number;
  @Prop({ type: Number, default: 0, min: 0, max: 10000 }) withdrawalFeeFixed!: number;
  @Prop({ default: 60, min: 1, max: 3650 }) capitalLockDays!: number;
  @Prop({ type: [Number], default: [1, 3, 5] }) withdrawalDays!: number[];
  @Prop({ default: '09:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ }) withdrawalWindowStart!: string;
  @Prop({ default: '17:00', match: /^([01]\d|2[0-3]):[0-5]\d$/ }) withdrawalWindowEnd!: string;
  @Prop({ default: 'Africa/Lagos' }) withdrawalTimezone!: string;
}
export const FinanceSettingsSchema = SchemaFactory.createForClass(FinanceSettings);
