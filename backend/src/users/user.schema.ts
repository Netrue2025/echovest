import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  _id?: unknown;
  createdAt?: Date;
  @Prop({ required: true, trim: true, maxlength: 120 }) fullName!: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true }) email!: string;
  @Prop({ required: true, select: false }) passwordHash!: string;
  @Prop({ default: false, index: true }) isEmailVerified!: boolean;
  @Prop({ enum: ['user', 'admin'], default: 'user' }) role!: string;
  @Prop({ default: false, index: true }) isSuperAdmin!: boolean;
  @Prop({ type: [String], default: [] }) adminPermissions!: string[];
  @Prop({ default: false, index: true }) isDisabled!: boolean;
  @Prop({ default: false, index: true }) withdrawalsDisabled!: boolean;
  @Prop({ default: 0, min: 0 }) tradingBalance!: number;
  @Prop({ default: 0, min: 0 }) referralBalance!: number;
  @Prop({ default: 0, min: 0 }) pendingTradingWithdrawals!: number;
  @Prop({ default: 0, min: 0 }) pendingReferralWithdrawals!: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
