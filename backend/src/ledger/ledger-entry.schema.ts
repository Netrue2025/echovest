import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type LedgerEntryDocument = HydratedDocument<LedgerEntry>;
@Schema({ timestamps: true, collection: 'test_ledger_entries', strict: true })
export class LedgerEntry {
  _id?: Types.ObjectId;
  createdAt?: Date;
  @Prop({ type: Types.ObjectId, required: true, index: true, immutable: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ['USDT'], immutable: true }) asset!: 'USDT';
  @Prop({ required: true, enum: ['TRON'], immutable: true }) network!: 'TRON';
  @Prop({ required: true, enum: ['deposit'], immutable: true }) entryType!: 'deposit';
  @Prop({ type: MongooseSchema.Types.Decimal128, required: true, immutable: true }) amount!: Types.Decimal128;
  @Prop({ required: true, unique: true, immutable: true }) reference!: string;
  @Prop({ required: true, enum: ['pending', 'confirmed', 'failed', 'rejected'], immutable: true }) status!: string;
  @Prop({ required: true, immutable: true }) description!: string;
  @Prop({ type: Boolean, required: true, default: true, immutable: true }) testOnly!: true;
}
export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntry);
LedgerEntrySchema.index({ userId: 1, createdAt: -1 });
