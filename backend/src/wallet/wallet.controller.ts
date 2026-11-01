import { BadRequestException, Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { User } from '../users/user.schema.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { MockDepositEventDto } from './deposit.dto.js';
import { WalletService } from './wallet.service.js';

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}
  @Get('deposit-address') @UseGuards(SessionGuard) details(@Req() req: Request & { user?: User }, @Query('asset') asset = 'USDT', @Query('network') network = 'TRON') {
    if (asset !== 'USDT' || network !== 'TRON') throw new BadRequestException('Only USDT on TRON (TRC20) is supported.');
    return this.wallet.depositDetails(String(req.user!._id));
  }
  @Post('mock-deposit-event') @UseGuards(OriginGuard, SessionGuard) simulate(@Req() req: Request & { user?: User }, @Body() body: MockDepositEventDto) { return this.wallet.simulate(String(req.user!._id), body); }
}
