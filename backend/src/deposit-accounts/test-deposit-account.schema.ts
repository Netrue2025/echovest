import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type TestDepositAccountDocument = HydratedDocument<TestDepositAccount>;

/** Test-only addresses never share the live provider's deposit_accounts collection. */
@Schema({ timestamps: true, collection: 'test_deposit_accounts', strict: 'throw' })
export class TestDepositAccount {
  _id?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  @Prop({ type: Types.ObjectId, required: true, immutable: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ['USDT'], immutable: true }) asset!: 'USDT';
  @Prop({ required: true, enum: ['TRON'], immutable: true }) network!: 'TRON';
  @Prop({ required: true, enum: ['TRC20'], immutable: true }) protocol!: 'TRC20';
  @Prop({ required: true, unique: true, immutable: true }) externalReference!: string;
  @Prop({ required: true, unique: true, immutable: true }) depositAddress!: string;
  @Prop({ required: true, enum: ['active'], default: 'active', immutable: true }) accountStatus!: 'active';
}

export const TestDepositAccountSchema = SchemaFactory.createForClass(TestDepositAccount);
TestDepositAccountSchema.index({ userId: 1, asset: 1, network: 1 }, { unique: true });
