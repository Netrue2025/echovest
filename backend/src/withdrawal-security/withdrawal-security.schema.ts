import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ collection: 'withdrawal_security_proofs', timestamps: true })
export class WithdrawalSecurityProof {
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, unique: true }) tokenHash!: string;
  @Prop({ required: true }) contextHash!: string;
  @Prop({ type: Date, required: true, index: true }) expiresAt!: Date;
  @Prop({ type: Date, default: null }) consumedAt?: Date | null;
}
export const WithdrawalSecurityProofSchema = SchemaFactory.createForClass(WithdrawalSecurityProof);
