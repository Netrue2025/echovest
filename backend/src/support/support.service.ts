import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/user.schema.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SupportConversation } from './support.schema.js';

type ChatMessage = SupportConversation['messages'][number];
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class SupportService {
  constructor(
    @InjectModel(SupportConversation.name) private readonly conversations: Model<SupportConversation>,
    @InjectModel(User.name) private readonly users: Model<User>,
    private readonly notifications: NotificationsService,
  ) {}

  async startGuest(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const conversation = await this.conversations.create({ email, participantType: 'guest', guestTokenHash: hashToken(token), messages: [], status: 'open', lastMessageAt: new Date() });
    return { conversation: this.publicConversation(conversation), accessToken: token };
  }

  async getUserConversation(user: User) {
    const userId = new Types.ObjectId(String(user._id));
    const conversation = await this.conversations.findOneAndUpdate(
      { _id: userId },
      { $setOnInsert: { userId, email: user.email, participantType: 'registered', messages: [], status: 'open', lastMessageAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();
    return this.publicConversation(conversation);
  }

  async getGuestConversation(id: string, token: string) {
    const conversation = await this.findGuest(id, token);
    return this.publicConversation(conversation);
  }

  async sendUserMessage(user: User, bodyInput: string) {
    const conversation = await this.conversations.findOne({ userId: new Types.ObjectId(String(user._id)), status: 'open' }).exec();
    if (!conversation) throw new NotFoundException('Open support conversation not found. Refresh and try again.');
    const message = this.message('user', String(user._id), user.fullName || user.email, bodyInput);
    await this.append(conversation, message, true);
    await this.notifications.notifyAdmins('New support message', 'A member sent a message to EchoVest support.', '/admin?section=support');
    return { message };
  }

  async sendGuestMessage(id: string, token: string, bodyInput: string) {
    const conversation = await this.findGuest(id, token);
    if (conversation.status === 'closed') throw new ForbiddenException('This support chat is closed. Start a new conversation for further help.');
    const message = this.message('user', '', conversation.email, bodyInput);
    await this.append(conversation, message, true);
    await this.notifications.notifyAdmins('New guest support message', 'A guest sent a message to EchoVest support.', '/admin?section=support');
    return { message };
  }

  async listAdminConversations() {
    const conversations = await this.conversations.find().select('email participantType status lastMessage lastMessageAt unreadByAdmin unreadByParticipant updatedAt').sort({ lastMessageAt: -1 }).limit(100).lean().exec();
    return conversations.map((conversation) => ({ id: String(conversation._id), email: conversation.email, participantType: conversation.participantType, status: conversation.status, lastMessage: conversation.lastMessage, lastMessageAt: conversation.lastMessageAt, unread: conversation.unreadByAdmin }));
  }

  async getAdminConversation(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Support conversation not found.');
    const conversation = await this.conversations.findById(id).select('-guestTokenHash').lean().exec();
    if (!conversation) throw new NotFoundException('Support conversation not found.');
    await this.conversations.updateOne({ _id: conversation._id }, { $set: { unreadByAdmin: false } }).exec();
    return this.publicConversation(conversation);
  }

  async replyAsAdmin(id: string, admin: User, bodyInput: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Support conversation not found.');
    const conversation = await this.conversations.findById(id).exec();
    if (!conversation) throw new NotFoundException('Support conversation not found.');
    if (conversation.status === 'closed') throw new ForbiddenException('This support conversation is closed.');
    const message = this.message('admin', String(admin._id), admin.fullName || admin.email, bodyInput);
    await this.append(conversation, message, false);
    if (conversation.userId) await this.notifications.notifyUser(String(conversation.userId), 'Support replied', 'You have a new message from EchoVest support.', 'general', '/dashboard?view=help&chat=1');
    else await this.notifications.notifyGuestConversation(String(conversation._id), 'Support replied', 'EchoVest support has replied. Open your chat to read the message.', '/?support=1');
    return { message };
  }

  async registerGuestPush(id: string, token: string, input: { endpoint: string; p256dh: string; auth: string; expirationTime?: number | null }) {
    await this.findGuest(id, token);
    return this.notifications.addGuestSubscription(id, input);
  }

  private async findGuest(id: string, token: string) {
    if (!Types.ObjectId.isValid(id) || !token || token.length > 200) throw new ForbiddenException('This chat link is invalid.');
    const conversation = await this.conversations.findById(id).select('+guestTokenHash').exec();
    const expected = conversation?.guestTokenHash;
    const candidate = hashToken(token);
    const valid = Boolean(conversation && conversation.participantType === 'guest' && expected && expected.length === candidate.length && timingSafeEqual(Buffer.from(expected), Buffer.from(candidate)));
    if (!valid || !conversation) throw new ForbiddenException('This chat link is invalid or expired.');
    return conversation;
  }

  private message(senderType: 'user' | 'admin', senderId: string, senderName: string, body: string): ChatMessage {
    return { senderType, senderId, senderName: senderName.slice(0, 120), body: body.trim().slice(0, 4000), createdAt: new Date() };
  }

  private async append(conversation: SupportConversation, message: ChatMessage, fromParticipant: boolean) {
    await this.conversations.updateOne({ _id: conversation._id, status: 'open' }, { $push: { messages: { $each: [message], $slice: -200 } }, $set: { lastMessage: message.body, lastMessageAt: message.createdAt, unreadByAdmin: fromParticipant, unreadByParticipant: !fromParticipant } }).exec();
  }

  private publicConversation(conversation: SupportConversation | Record<string, any>) {
    return { id: String(conversation._id), email: conversation.email, participantType: conversation.participantType, status: conversation.status, messages: (conversation.messages ?? []).map((message: ChatMessage) => ({ senderType: message.senderType, senderName: message.senderName, body: message.body, createdAt: message.createdAt })) };
  }
}
