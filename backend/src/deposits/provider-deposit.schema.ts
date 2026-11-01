import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ProviderDepositDocument = HydratedDocument<ProviderDeposit>;
@Schema({ timestamps: true, collection: 'provider_deposit_events', strict: true })
export class ProviderDeposit {
  _id?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  @Prop({ required: true, index: true }) providerTransactionId!: string;
  @Prop({ required: true, index: true }) providerStatus!: string;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, required: true }) depositAccountId!: Types.ObjectId;
  @Prop({ required: true }) externalReference!: string;
  @Prop({ type: MongooseSchema.Types.Decimal128, required: true }) amount!: Types.Decimal128;
  @Prop({ required: true, enum: ['pending', 'reconciling', 'confirmed_uncredited', 'rejected', 'reconciliation_failed'], default: 'pending', index: true }) status!: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) rawEvent!: Record<string, unknown>;
  @Prop({ type: String, default: '' }) reason!: string;
  @Prop({ type: Number, default: 1 }) deliveries!: number;
  @Prop({ type: Number, default: 0 }) reconciliationAttempts!: number;
  @Prop({ type: Date, default: Date.now, index: true }) nextAttemptAt!: Date;
}
export const ProviderDepositSchema = SchemaFactory.createForClass(ProviderDeposit);
ProviderDepositSchema.index({ providerTransactionId: 1, providerStatus: 1 }, { unique: true });
ProviderDepositSchema.index({ userId: 1, createdAt: -1 });
