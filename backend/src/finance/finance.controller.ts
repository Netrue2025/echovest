import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { User } from '../users/user.schema.js';
import { SessionGuard } from '../auth/session.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { AdminAccessGuard, RequireAdminPermissions } from '../admin/admin-access.guard.js';
import { FinanceService } from './finance.service.js';
import { DepositRequestDto, FinanceSettingsDto, ReviewFinanceDto, WithdrawalRequestDto } from './finance.dto.js';

@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}
  @Get('settings') settings() { return this.finance.publicSettings(); }
  @Get('me') @UseGuards(SessionGuard) me(@Req() req: Request & { user?: User }) { return this.finance.summary(String(req.user!._id)); }
  @Post('deposits') @UseGuards(OriginGuard, SessionGuard) deposit(@Req() req: Request & { user?: User }, @Body() body: DepositRequestDto) { return this.finance.requestDeposit(String(req.user!._id), body.amount, body.txid); }
  @Post('withdrawals') @UseGuards(OriginGuard, SessionGuard) withdraw(@Req() req: Request & { user?: User }, @Body() body: WithdrawalRequestDto) { return this.finance.requestWithdrawal(String(req.user!._id), body); }
  @Get('admin/settings') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('wallets.view') adminSettings() { return this.finance.publicSettings(); }
  @Patch('admin/settings') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('wallets.manage') saveSettings(@Req() req: Request & { user?: User }, @Body() body: FinanceSettingsDto) { return this.finance.updateSettings(body, { id: String(req.user!._id), email: req.user!.email }); }
  @Get('admin/deposits') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('deposits.manage') deposits() { return this.finance.adminTransactions('deposit'); }
  @Get('admin/withdrawals') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('withdrawals.manage') withdrawals() { return this.finance.adminTransactions('withdrawal'); }
  @Patch('admin/deposits/:id') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('deposits.manage') reviewDeposit(@Req() req: Request & { user?: User }, @Param('id') id: string, @Body() body: ReviewFinanceDto) { return this.finance.review(id, 'deposit', body.decision, body.rejectionReason, { id: String(req.user!._id), email: req.user!.email }); }
  @Patch('admin/withdrawals/:id') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('withdrawals.manage') reviewWithdrawal(@Req() req: Request & { user?: User }, @Param('id') id: string, @Body() body: ReviewFinanceDto) { return this.finance.review(id, 'withdrawal', body.decision, body.rejectionReason, { id: String(req.user!._id), email: req.user!.email }); }
}
