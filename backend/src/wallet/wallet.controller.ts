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
  @Get('deposit-address') @UseGuards(SessionGuard) details(@Req() req: Request & { user?: User }, @Query('asset') asset = 'USDT', @Query('network') network = 'TRON', @Query('wallet') wallet?: string, @Query('walletNetwork') walletNetwork?: string) {
    if (asset !== 'USDT' || !network.trim()) throw new BadRequestException('Choose USDT and a supported deposit network.');
    return this.wallet.depositDetails(String(req.user!._id), wallet, walletNetwork);
  }
  @Post('mock-deposit-event') @UseGuards(OriginGuard, SessionGuard) simulate(@Req() req: Request & { user?: User }, @Body() body: MockDepositEventDto) { return this.wallet.simulate(String(req.user!._id), body); }
}
