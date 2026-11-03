import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  _id?: unknown;
  createdAt?: Date;
  @Prop({ required: true, trim: true, maxlength: 120 }) fullName!: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true }) email!: string;
  @Prop({ required: true, select: false }) passwordHash!: string;
  @Prop({ select: false, default: null }) withdrawalPinHash?: string | null;
  @Prop({ select: false, default: 0 }) withdrawalPinFailedAttempts!: number;
  @Prop({ select: false, default: null }) withdrawalPinLockedUntil?: Date | null;
  @Prop({ type: [{ credentialId: { type: String, required: true }, publicKey: { type: Buffer, required: true }, counter: { type: Number, required: true, default: 0 }, transports: { type: [String], default: [] }, deviceType: { type: String }, backedUp: { type: Boolean, default: false }, name: { type: String } }], select: false, default: [] }) withdrawalPasskeys!: Array<Record<string, unknown>>;
  @Prop({ unique: true, sparse: true, uppercase: true, trim: true, index: true }) referralCode?: string;
  @Prop({ type: Types.ObjectId, ref: User.name, default: null, index: true }) referredBy?: Types.ObjectId | null;
  @Prop({ enum: ['Blue', 'Elite', 'Silver', 'Gold', 'Platinum'], default: 'Blue' }) membershipLevel!: string;
  @Prop({ default: false, index: true }) isEmailVerified!: boolean;
  @Prop({ enum: ['user', 'admin'], default: 'user' }) role!: string;
  @Prop({ default: false, index: true }) isSuperAdmin!: boolean;
  @Prop({ type: [String], default: [] }) adminPermissions!: string[];
  @Prop({ default: false, index: true }) isDisabled!: boolean;
  @Prop({ default: false, index: true }) withdrawalsDisabled!: boolean;
  @Prop({ default: 0, min: 0 }) tradingBalance!: number;
  @Prop({ default: 0, min: 0 }) maturedPrincipalBalance!: number;
  @Prop({ type: [{ amount: { type: Number, required: true }, unlockAt: { type: Date, required: true } }], default: [] }) lockedCapitalLots!: Array<{ amount: number; unlockAt: Date }>;
  @Prop({ default: 0, min: 0 }) referralBalance!: number;
  @Prop({ default: 0, min: 0 }) pendingTradingWithdrawals!: number;
  @Prop({ default: 0, min: 0 }) pendingMaturedWithdrawals!: number;
  @Prop({ default: 0, min: 0 }) pendingReferralWithdrawals!: number;
}

export const UserSchema = SchemaFactory.createForClass(User);
