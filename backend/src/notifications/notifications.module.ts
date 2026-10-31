import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminAccessGuard } from '../admin/admin-access.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { User, UserSchema } from '../users/user.schema.js';
import { NotificationsController } from './notifications.controller.js';
import { PushSubscriptionRecord, PushSubscriptionRecordSchema, UserNotification, UserNotificationSchema } from './notification.schema.js';
import { NotificationsService } from './notifications.service.js';

@Module({ imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: UserNotification.name, schema: UserNotificationSchema }, { name: PushSubscriptionRecord.name, schema: PushSubscriptionRecordSchema }])], controllers: [NotificationsController], providers: [NotificationsService, SessionGuard, OriginGuard, AdminAccessGuard], exports: [NotificationsService] })
export class NotificationsModule {}
