import { Injectable, Logger, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import * as webpush from 'web-push';
import { Model, Types } from 'mongoose';
import { User } from '../users/user.schema.js';
import { BroadcastNotificationDto, PushSubscriptionDto } from './notifications.dto.js';
import { PushSubscriptionRecord, UserNotification } from './notification.schema.js';

type PushMessage = { title: string; body: string; url: string; notificationId?: string };

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private vapidPublicKey = '';
  private pushConfigured = false;
  constructor(
    private readonly config: ConfigService,
    @InjectModel(UserNotification.name) private readonly notifications: Model<UserNotification>,
    @InjectModel(PushSubscriptionRecord.name) private readonly subscriptions: Model<PushSubscriptionRecord>,
    @InjectModel(User.name) private readonly users: Model<User>,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY')?.trim() ?? '';
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY')?.trim() ?? '';
    const subject = this.config.get<string>('VAPID_SUBJECT')?.trim() ?? '';
    if (!publicKey || !privateKey || !subject) {
      this.logger.warn('Web Push is disabled until VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT are configured.');
      return;
    }
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidPublicKey = publicKey;
      this.pushConfigured = true;
    } catch (error) {
      this.logger.error(`Web Push VAPID configuration is invalid: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  publicKey() { return { publicKey: this.vapidPublicKey }; }
  async addSubscription(userId: string, input: PushSubscriptionDto) {
    if (!this.pushConfigured) throw new ServiceUnavailableException('Push notifications are not configured on the server yet.');
    await this.subscriptions.findOneAndUpdate({ endpoint: input.endpoint }, { $set: { userId: new Types.ObjectId(userId), endpoint: input.endpoint, p256dh: input.p256dh, auth: input.auth, expirationTime: input.expirationTime ?? null } }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
    return { enabled: true };
  }
  async removeSubscription(userId: string, endpoint: string) {
    await this.subscriptions.deleteOne({ userId: new Types.ObjectId(userId), endpoint }).exec();
    return { enabled: false };
  }

  async listForUser(userId: string) {
    const filter = { userId: new Types.ObjectId(userId) };
    const [docs, unreadCount] = await Promise.all([this.notifications.find(filter).sort({ createdAt: -1 }).limit(100).lean().exec(), this.notifications.countDocuments({ ...filter, readAt: null }).exec()]);
    return { notifications: docs.map((item) => ({ id: String(item._id), title: item.title, message: item.message, category: item.category, readAt: item.readAt ?? null, createdAt: item.createdAt })), unreadCount };
  }

  async markRead(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Notification not found.');
    const result = await this.notifications.findOneAndUpdate({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) }, { $set: { readAt: new Date() } }, { new: true }).lean().exec();
    if (!result) throw new NotFoundException('Notification not found.');
    return { id: String(result._id), readAt: result.readAt };
  }

  async notifyUser(userId: string, title: string, message: string, category: 'general' | 'deposit' | 'withdrawal') {
    const notification = await this.notifications.create({ userId: new Types.ObjectId(userId), title, message, category });
    await this.sendToUser(userId, { title, body: message, url: '/dashboard?view=notifications', notificationId: String(notification._id) });
    return notification;
  }

  async broadcast(input: BroadcastNotificationDto) {
    const recipients = await this.users.find({ role: 'user' }).select('_id').lean().exec();
    if (!recipients.length) return { sent: 0 };
    const userIds = recipients.map((user) => String(user._id));
    const created = await this.notifications.insertMany(userIds.map((userId) => ({ userId: new Types.ObjectId(userId), title: input.title.trim(), message: input.message.trim(), category: 'general' })), { ordered: false });
    await this.sendToUsers(userIds, { title: input.title.trim(), body: input.message.trim(), url: '/dashboard?view=notifications' });
    return { sent: created.length };
  }

  private async sendToUser(userId: string, message: PushMessage) {
    if (!this.pushConfigured) return;
    const subscriptions = await this.subscriptions.find({ userId: new Types.ObjectId(userId) }).lean().exec();
    await this.deliver(subscriptions, message);
  }
  private async sendToUsers(userIds: string[], message: PushMessage) {
    if (!this.pushConfigured) return;
    const subscriptions = await this.subscriptions.find({ userId: { $in: userIds.map((id) => new Types.ObjectId(id)) } }).lean().exec();
    await this.deliver(subscriptions, message);
  }
  private async deliver(subscriptions: PushSubscriptionRecord[], message: PushMessage) {
    for (let offset = 0; offset < subscriptions.length; offset += 30) {
      const batch = subscriptions.slice(offset, offset + 30);
      await Promise.all(batch.map(async (item) => {
        try {
          await webpush.sendNotification({ endpoint: item.endpoint, expirationTime: item.expirationTime ?? null, keys: { p256dh: item.p256dh, auth: item.auth } }, JSON.stringify(message));
        } catch (error) {
          const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 0;
          if (statusCode === 404 || statusCode === 410) await this.subscriptions.deleteOne({ endpoint: item.endpoint }).exec();
          else this.logger.warn(`Could not deliver a push notification: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }));
    }
  }
}
