import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AdminAccessGuard, RequireAdminPermissions } from '../admin/admin-access.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { User } from '../users/user.schema.js';
import { CreateTradeSignalDto, JoinTradeDto, WithdrawTradeInterestDto } from './trade.dto.js';
import { TradesService } from './trades.service.js';

@Controller('trades')
export class TradesController {
  constructor(private readonly trades: TradesService) {}

  @Get('me') @UseGuards(SessionGuard)
  me(@Req() request: Request & { user?: User }) { return this.trades.userDashboard(String(request.user!._id)); }

  @Post(':id/join') @UseGuards(OriginGuard, SessionGuard)
  join(@Req() request: Request & { user?: User }, @Param('id') id: string, @Body() body: JoinTradeDto) { return this.trades.join(String(request.user!._id), id, body.amount); }

  @Post('positions/:id/stop') @UseGuards(OriginGuard, SessionGuard)
  stop(@Req() request: Request & { user?: User }, @Param('id') id: string) { return this.trades.stop(String(request.user!._id), id); }

  @Post('positions/:id/withdraw-interest') @UseGuards(OriginGuard, SessionGuard)
  withdrawInterest(@Req() request: Request & { user?: User }, @Param('id') id: string, @Body() body: WithdrawTradeInterestDto) { return this.trades.withdrawInterest(String(request.user!._id), id, body.amount, body.destinationAddress, body.network, body); }

  @Post('withdraw-profit') @UseGuards(OriginGuard, SessionGuard)
  withdrawProfit(@Req() request: Request & { user?: User }, @Body() body: WithdrawTradeInterestDto) { return this.trades.withdrawProfit(String(request.user!._id), body.amount, body.destinationAddress, body.network, body); }

  @Patch('admin/signals/:id/close') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('signals.manage')
  close(@Req() request: Request & { user?: User }, @Param('id') id: string) { return this.trades.closeSignal(id, { id: String(request.user!._id), email: request.user!.email }); }

  @Get('admin/signals') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('signals.manage')
  adminSignals() { return this.trades.adminSignals(); }

  @Post('admin/signals') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('signals.manage')
  create(@Req() request: Request & { user?: User }, @Body() body: CreateTradeSignalDto) { return this.trades.createSignal(body, { id: String(request.user!._id), email: request.user!.email }); }
}
