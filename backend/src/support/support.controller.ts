import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAccessGuard, RequireAdminPermissions } from '../admin/admin-access.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { User } from '../users/user.schema.js';
import { PushSubscriptionDto } from '../notifications/notifications.dto.js';
import { SendSupportMessageDto, StartGuestChatDto } from './support.dto.js';
import { SupportService } from './support.service.js';

@Controller()
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('support/guest/start') @UseGuards(OriginGuard) startGuest(@Body() body: StartGuestChatDto) { return this.support.startGuest(body.email); }
  @Get('support/guest/:id') getGuest(@Param('id') id: string, @Headers('x-chat-token') token: string) { return this.support.getGuestConversation(id, token); }
  @Post('support/guest/:id/messages') @UseGuards(OriginGuard) sendGuest(@Param('id') id: string, @Headers('x-chat-token') token: string, @Body() body: SendSupportMessageDto) { return this.support.sendGuestMessage(id, token, body.body); }
  @Post('support/guest/:id/push') @UseGuards(OriginGuard) guestPush(@Param('id') id: string, @Headers('x-chat-token') token: string, @Body() body: PushSubscriptionDto) { return this.support.registerGuestPush(id, token, body); }

  @Get('support/me') @UseGuards(SessionGuard) userConversation(@Req() request: Request & { user?: User }) { return this.support.getUserConversation(request.user!); }
  @Post('support/me/messages') @UseGuards(OriginGuard, SessionGuard) sendUser(@Req() request: Request & { user?: User }, @Body() body: SendSupportMessageDto) { return this.support.sendUserMessage(request.user!, body.body); }

  @Get('admin/support/conversations') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('support.manage') listAdmin() { return this.support.listAdminConversations(); }
  @Get('admin/support/conversations/:id') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('support.manage') readAdmin(@Param('id') id: string) { return this.support.getAdminConversation(id); }
  @Post('admin/support/conversations/:id/messages') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('support.manage') replyAdmin(@Param('id') id: string, @Req() request: Request & { user?: User }, @Body() body: SendSupportMessageDto) { return this.support.replyAsAdmin(id, request.user!, body.body); }
}
