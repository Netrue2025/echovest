import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CopyTradeSignalDocument = HydratedDocument<CopyTradeSignal>;
export type TradePositionDocument = HydratedDocument<TradePosition>;

@Schema({ timestamps: true, collection: 'copy_trade_signals' })
export class CopyTradeSignal {
  _id?: unknown;
  createdAt?: Date;
  @Prop({ required: true, trim: true, maxlength: 100 }) title!: string;
  @Prop({ required: true, trim: true, uppercase: true, maxlength: 24, index: true }) pair!: string;
  @Prop({ required: true, index: true }) startsAt!: Date;
  @Prop({ type: Date, required: true, index: true }) endsAt!: Date;
  @Prop({ required: true, min: 0, max: 100 }) roiPercent!: number;
  @Prop({ min: 1, max: 365 }) lockDays?: number;
  @Prop({ required: true, min: 0.01 }) minimumInvestment!: number;
  @Prop({ required: true, min: 0.01 }) maximumInvestment!: number;
  @Prop({ type: [Number], required: true }) interestWithdrawalDays!: number[];
  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }) interestWindowStart!: string;
  @Prop({ required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ }) interestWindowEnd!: string;
  @Prop({ required: true, default: 'UTC' }) timezone!: string;
  @Prop({ default: 0, min: 0 }) currentCopiers!: number;
  @Prop({ required: true, enum: ['scheduled', 'open', 'completed', 'cancelled'], default: 'scheduled', index: true }) status!: 'scheduled' | 'open' | 'completed' | 'cancelled';
  @Prop({ required: true }) createdBy!: string;
  @Prop({ type: Date, default: null }) publishedAt?: Date | null;
}
export const CopyTradeSignalSchema = SchemaFactory.createForClass(CopyTradeSignal);
CopyTradeSignalSchema.index({ status: 1, startsAt: 1 });

@Schema({ timestamps: true, collection: 'copy_trade_positions' })
export class TradePosition {
  _id?: unknown;
  createdAt?: Date;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, index: true }) signalId!: Types.ObjectId;
  @Prop({ required: true, min: 0.01 }) principal!: number;
  @Prop({ required: true, enum: ['active', 'stopped', 'matured'], default: 'active', index: true }) status!: 'active' | 'stopped' | 'matured';
  @Prop({ required: true }) joinedAt!: Date;
  @Prop({ type: Date, default: null }) stoppedAt?: Date | null;
  @Prop({ type: Date, default: null }) principalReturnedAt?: Date | null;
  @Prop({ default: 0, min: 0 }) claimedInterest!: number;
}
export const TradePositionSchema = SchemaFactory.createForClass(TradePosition);
TradePositionSchema.index({ userId: 1, signalId: 1 }, { unique: true });
TradePositionSchema.index({ userId: 1, createdAt: -1 });
TradePositionSchema.index({ status: 1, principalReturnedAt: 1 });
