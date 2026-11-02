import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DepositLedgerEntryDocument = HydratedDocument<DepositLedgerEntry>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'deposit_ledger_entries', strict: 'throw' })
export class DepositLedgerEntry {
  _id?: Types.ObjectId;
  createdAt?: Date;
  @Prop({ type: Types.ObjectId, required: true, immutable: true, index: true }) userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true, immutable: true }) depositEventId!: Types.ObjectId;
  @Prop({ required: true, enum: ['USDT'], immutable: true }) asset!: 'USDT';
  @Prop({ required: true, enum: ['TRON'], immutable: true }) network!: 'TRON';
  @Prop({ required: true, enum: ['deposit_credit'], immutable: true }) entryType!: 'deposit_credit';
  @Prop({ type: MongooseSchema.Types.Decimal128, required: true, immutable: true }) amount!: Types.Decimal128;
  @Prop({ required: true, immutable: true }) reference!: string;
  @Prop({ required: true, enum: ['chainpay'], immutable: true }) source!: 'chainpay';
  @Prop({ required: true, immutable: true }) transactionHash!: string;
  @Prop({ required: true, min: 0, immutable: true }) transferIndex!: number;
  @Prop({ required: true, enum: ['confirmed'], immutable: true }) status!: 'confirmed';
  @Prop({ required: true, immutable: true }) description!: string;
}

export const DepositLedgerEntrySchema = SchemaFactory.createForClass(DepositLedgerEntry);
DepositLedgerEntrySchema.index({ reference: 1 }, { unique: true });
DepositLedgerEntrySchema.index({ transactionHash: 1 }, { unique: true });
DepositLedgerEntrySchema.index({ depositEventId: 1 }, { unique: true });
DepositLedgerEntrySchema.index({ userId: 1, createdAt: -1 });
