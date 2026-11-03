import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SupportConversationDocument = HydratedDocument<SupportConversation>;

@Schema({ timestamps: true, collection: 'support_conversations' })
export class SupportConversation {
  _id?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
  @Prop({ type: Types.ObjectId, default: null, index: true }) userId?: Types.ObjectId | null;
  @Prop({ required: true, lowercase: true, trim: true, maxlength: 254, index: true }) email!: string;
  @Prop({ required: true, enum: ['registered', 'guest'], index: true }) participantType!: 'registered' | 'guest';
  @Prop({ type: String, default: null, select: false }) guestTokenHash?: string | null;
  @Prop({ default: 'open', enum: ['open', 'closed'], index: true }) status!: 'open' | 'closed';
  @Prop({ default: '', maxlength: 4000 }) lastMessage!: string;
  @Prop({ type: Date, default: Date.now, index: true }) lastMessageAt!: Date;
  @Prop({ default: true }) unreadByAdmin!: boolean;
  @Prop({ default: false }) unreadByParticipant!: boolean;
  @Prop({ type: [{ senderType: { type: String, enum: ['user', 'admin'], required: true }, senderId: { type: String, default: '' }, senderName: { type: String, required: true, maxlength: 120 }, body: { type: String, required: true, maxlength: 4000 }, createdAt: { type: Date, required: true } }], default: [] }) messages!: { senderType: 'user' | 'admin'; senderId: string; senderName: string; body: string; createdAt: Date }[];
}

export const SupportConversationSchema = SchemaFactory.createForClass(SupportConversation);
SupportConversationSchema.index({ status: 1, lastMessageAt: -1 });
SupportConversationSchema.index({ userId: 1, status: 1, updatedAt: -1 });
