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
  @Prop({ required: true, enum: ['pending', 'reconciling', 'verified_pending_credit', 'crediting', 'credited', 'review_required', 'confirmed_uncredited', 'rejected', 'reconciliation_failed'], default: 'pending', index: true }) status!: string;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) rawEvent!: Record<string, unknown>;
  @Prop({ type: String, default: '' }) reason!: string;
  @Prop({ type: [String], default: [] }) reconciliationDifferences!: string[];
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) providerVerification!: Record<string, unknown> | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) blockchainVerification!: Record<string, unknown> | null;
  @Prop({ type: Number, default: null }) transferIndex!: number | null;
  @Prop({ type: String, default: '' }) creditReference!: string;
  @Prop({ type: Date, default: null }) creditedAt!: Date | null;
  @Prop({ type: String, default: '' }) reviewedBy!: string;
  @Prop({ type: String, default: '' }) reviewDecision!: string;
  @Prop({ type: String, default: '' }) reviewReason!: string;
  @Prop({ type: Number, default: 1 }) deliveries!: number;
  @Prop({ type: Number, default: 0 }) reconciliationAttempts!: number;
  @Prop({ type: Boolean, default: false }) retryRequested!: boolean;
  @Prop({ type: Date, default: Date.now, index: true }) nextAttemptAt!: Date;
  // Admin history hiding is soft-delete only; provider and ledger audit data remain intact.
  @Prop({ type: Date }) archivedAt?: Date;
  @Prop({ type: String }) archivedBy?: string;
  @Prop({ type: String, default: '' }) archiveReason?: string;
}
export const ProviderDepositSchema = SchemaFactory.createForClass(ProviderDeposit);
ProviderDepositSchema.index({ providerTransactionId: 1, providerStatus: 1 }, { unique: true });
ProviderDepositSchema.index({ userId: 1, createdAt: -1 });
