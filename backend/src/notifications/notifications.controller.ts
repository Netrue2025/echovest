import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAccessGuard, RequireAdminPermissions } from '../admin/admin-access.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { User } from '../users/user.schema.js';
import { BroadcastNotificationDto, PushSubscriptionDto, RemovePushSubscriptionDto } from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('push/public-key') publicKey() { return this.notifications.publicKey(); }
  @Get() @UseGuards(SessionGuard) list(@Req() request: Request & { user?: User }) { return this.notifications.listForUser(String(request.user!._id)); }
  @Patch(':id/read') @UseGuards(OriginGuard, SessionGuard) read(@Req() request: Request & { user?: User }, @Param('id') id: string) { return this.notifications.markRead(String(request.user!._id), id); }
  @Post('push/subscription') @UseGuards(OriginGuard, SessionGuard) subscribe(@Req() request: Request & { user?: User }, @Body() body: PushSubscriptionDto) { return this.notifications.addSubscription(String(request.user!._id), body); }
  @Post('push/unsubscription') @UseGuards(OriginGuard, SessionGuard) unsubscribe(@Req() request: Request & { user?: User }, @Body() body: RemovePushSubscriptionDto) { return this.notifications.removeSubscription(String(request.user!._id), body.endpoint); }
  @Post('admin/broadcast') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('notifications.manage') broadcast(@Body() body: BroadcastNotificationDto) { return this.notifications.broadcast(body); }
}
