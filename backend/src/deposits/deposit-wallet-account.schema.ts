import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DepositWalletAccountDocument = HydratedDocument<DepositWalletAccount>;

/** Decimal-only deposit ledger projection, kept in sync with the user's tradeable, withdrawal-locked investment balance. */
@Schema({ timestamps: true, collection: 'deposit_wallet_accounts', strict: 'throw' })
export class DepositWalletAccount {
  _id?: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
  @Prop({ type: Types.ObjectId, required: true, immutable: true }) userId!: Types.ObjectId;
  @Prop({ required: true, enum: ['USDT'], immutable: true }) asset!: 'USDT';
  @Prop({ required: true, enum: ['TRON'], immutable: true }) network!: 'TRON';
  @Prop({ type: MongooseSchema.Types.Decimal128, required: true, default: () => Types.Decimal128.fromString('0') }) availableBalance!: Types.Decimal128;
}

export const DepositWalletAccountSchema = SchemaFactory.createForClass(DepositWalletAccount);
DepositWalletAccountSchema.index({ userId: 1, asset: 1, network: 1 }, { unique: true });
