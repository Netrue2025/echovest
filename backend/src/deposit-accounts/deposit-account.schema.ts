import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DepositAccountDocument = HydratedDocument<DepositAccount>;

@Schema({ timestamps: true, collection: 'deposit_accounts' })
export class DepositAccount {
  _id?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ['mock', 'chainpay'] }) provider!: 'mock' | 'chainpay';
  @Prop({ type: String, default: '' }) providerAddressId!: string;
  @Prop({ required: true, unique: true, index: true }) externalReference!: string;
  @Prop({ required: true, enum: ['USDT'] }) asset!: 'USDT';
  @Prop({ required: true, enum: ['TRON'] }) network!: 'TRON';
  @Prop({ required: true, enum: ['TRC20'] }) protocol!: 'TRC20';
  @Prop({ required: true }) depositAddress!: string;
  @Prop({ required: true, enum: ['active', 'provisioning', 'disabled'], default: 'active' }) accountStatus!: string;
}

export const DepositAccountSchema = SchemaFactory.createForClass(DepositAccount);
DepositAccountSchema.index({ userId: 1, asset: 1, network: 1 }, { unique: true });
