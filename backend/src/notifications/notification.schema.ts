import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserNotificationDocument = HydratedDocument<UserNotification>;

@Schema({ timestamps: true, collection: 'user_notifications' })
export class UserNotification {
  _id?: unknown;
  createdAt?: Date;
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 120 }) title!: string;
  @Prop({ required: true, trim: true, maxlength: 2000 }) message!: string;
  @Prop({ default: 'general', enum: ['general', 'deposit', 'withdrawal'] }) category!: string;
  @Prop({ type: Date, default: null, index: true }) readAt?: Date | null;
}
export const UserNotificationSchema = SchemaFactory.createForClass(UserNotification);
UserNotificationSchema.index({ userId: 1, createdAt: -1 });

@Schema({ timestamps: true, collection: 'push_subscriptions' })
export class PushSubscriptionRecord {
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, unique: true }) endpoint!: string;
  @Prop({ required: true }) p256dh!: string;
  @Prop({ required: true }) auth!: string;
  @Prop({ type: Number, default: null }) expirationTime?: number | null;
}
export const PushSubscriptionRecordSchema = SchemaFactory.createForClass(PushSubscriptionRecord);
