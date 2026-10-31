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
  @Prop({ required: true, enum: ['trading', 'referral'], default: 'trading' }) balanceType!: 'trading' | 'referral';
  @Prop({ required: true, enum: ['network_confirmation', 'pending_review', 'approved', 'rejected'], index: true }) status!: 'network_confirmation' | 'pending_review' | 'approved' | 'rejected';
  @Prop({ sparse: true, unique: true }) txid?: string;
  @Prop({ default: '' }) destinationAddress!: string;
  @Prop({ default: '' }) network!: string;
  @Prop({ default: '' }) rejectionReason!: string;
  @Prop({ default: '' }) reviewedBy!: string;
  @Prop() reviewedAt?: Date;
}
export const FinanceTransactionSchema = SchemaFactory.createForClass(FinanceTransaction);
FinanceTransactionSchema.index({ userId: 1, createdAt: -1 });

@Schema({ collection: 'finance_settings' })
export class FinanceSettings {
  @Prop({ required: true, unique: true, default: 'platform' }) key!: string;
  @Prop({ default: '' }) depositWalletAddress!: string;
  @Prop({ default: '' }) depositNetwork!: string;
  @Prop({ default: '' }) depositInstructions!: string;
  @Prop({ default: 0, min: 0 }) minimumDeposit!: number;
  @Prop({ default: 0, min: 0 }) minimumWithdrawal!: number;
}
export const FinanceSettingsSchema = SchemaFactory.createForClass(FinanceSettings);
