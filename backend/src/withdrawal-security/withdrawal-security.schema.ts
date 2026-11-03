import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ collection: 'withdrawal_security_challenges', timestamps: true })
export class WithdrawalSecurityChallenge {
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ['registration', 'authentication'] }) purpose!: string;
  @Prop({ required: true }) challenge!: string;
  @Prop({ required: true }) contextHash!: string;
  @Prop({ type: Date, required: true, index: true }) expiresAt!: Date;
}
export const WithdrawalSecurityChallengeSchema = SchemaFactory.createForClass(WithdrawalSecurityChallenge);
WithdrawalSecurityChallengeSchema.index({ userId: 1, purpose: 1 }, { unique: true });

@Schema({ collection: 'withdrawal_security_proofs', timestamps: true })
export class WithdrawalSecurityProof {
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, unique: true }) tokenHash!: string;
  @Prop({ required: true }) contextHash!: string;
  @Prop({ type: Date, required: true, index: true }) expiresAt!: Date;
  @Prop({ type: Date, default: null }) consumedAt?: Date | null;
}
export const WithdrawalSecurityProofSchema = SchemaFactory.createForClass(WithdrawalSecurityProof);
