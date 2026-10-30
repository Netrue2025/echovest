import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
@Schema({ collection: 'email_verifications' })
export class EmailVerification {
  @Prop({ type: Types.ObjectId, required: true, unique: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, select: false }) codeHash!: string;
  @Prop({ required: true, index: { expires: 0 } }) expiresAt!: Date;
  @Prop({ default: 0 }) attempts!: number;
  @Prop({ default: Date.now }) createdAt!: Date;
}
export const EmailVerificationSchema = SchemaFactory.createForClass(EmailVerification);
