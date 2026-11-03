import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminAccessGuard } from '../admin/admin-access.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { UsersModule } from '../users/users.module.js';
import { SupportController } from './support.controller.js';
import { SupportConversation, SupportConversationSchema } from './support.schema.js';
import { SupportService } from './support.service.js';

@Module({ imports: [UsersModule, SessionsModule, NotificationsModule, MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: SupportConversation.name, schema: SupportConversationSchema }])], controllers: [SupportController], providers: [SupportService, SessionGuard, AdminAccessGuard, OriginGuard] })
export class SupportModule {}
