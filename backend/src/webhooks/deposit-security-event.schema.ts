import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export const DEPOSIT_SECURITY_EVENT_RETENTION_SECONDS = 90 * 24 * 60 * 60;

@Schema({ collection: 'deposit_security_events', timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' })
export class DepositSecurityEvent {
  @Prop({ required: true, enum: ['webhook_auth_failed', 'webhook_rate_limited', 'invalid_transaction_hash', 'unknown_deposit_reference', 'payload_mismatch'] }) eventType!: string;
  @Prop({ required: true }) reasonCode!: string;
  @Prop({ required: true }) sourceIpHash!: string;
  @Prop({ type: String, default: '' }) transactionHash!: string;
  @Prop({ type: String, default: '' }) externalReferenceHash!: string;
  createdAt?: Date;
}

export const DepositSecurityEventSchema = SchemaFactory.createForClass(DepositSecurityEvent);
DepositSecurityEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: DEPOSIT_SECURITY_EVENT_RETENTION_SECONDS });
DepositSecurityEventSchema.index({ eventType: 1, createdAt: -1 });
