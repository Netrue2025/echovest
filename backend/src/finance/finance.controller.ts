import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { User } from '../users/user.schema.js';
import { SessionGuard } from '../auth/session.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { AdminAccessGuard, RequireAdminPermissions } from '../admin/admin-access.guard.js';
import { FinanceService } from './finance.service.js';
import { ArchiveHistoryDto, DepositRequestDto, FinanceSettingsDto, ReviewFinanceDto, WithdrawalRequestDto } from './finance.dto.js';

@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}
  @Get('settings') settings() { return this.finance.publicSettings(); }
  @Get('me') @UseGuards(SessionGuard) me(@Req() req: Request & { user?: User }) { return this.finance.summary(String(req.user!._id)); }
  @Post('deposits') @UseGuards(OriginGuard, SessionGuard) deposit(@Req() req: Request & { user?: User }, @Body() body: DepositRequestDto) { return this.finance.requestDeposit(String(req.user!._id), body.amount, body.txid); }
  @Post('withdrawals') @UseGuards(OriginGuard, SessionGuard) withdraw(@Req() req: Request & { user?: User }, @Body() body: WithdrawalRequestDto) { return this.finance.requestWithdrawal(String(req.user!._id), body); }
  @Get('admin/settings') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('wallets.view') adminSettings() { return this.finance.publicSettings(); }
  @Patch('admin/settings') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('wallets.manage') saveSettings(@Req() req: Request & { user?: User }, @Body() body: FinanceSettingsDto) { return this.finance.updateSettings(body, { id: String(req.user!._id), email: req.user!.email }); }
  @Get('admin/deposits') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('deposits.manage') deposits(@Query('archived') archived?: string) { return this.finance.adminTransactions('deposit', archived === 'true'); }
  @Get('admin/withdrawals') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('withdrawals.manage') withdrawals(@Query('archived') archived?: string) { return this.finance.adminTransactions('withdrawal', archived === 'true'); }
  @Post('admin/deposits/:id/archive') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('deposits.manage') archiveDeposit(@Req() req: Request & { user?: User }, @Param('id') id: string, @Body() body: ArchiveHistoryDto) { return this.finance.archiveTransaction(id, 'deposit', body.reason, { id: String(req.user!._id), email: req.user!.email }); }
  @Post('admin/withdrawals/:id/archive') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('withdrawals.manage') archiveWithdrawal(@Req() req: Request & { user?: User }, @Param('id') id: string, @Body() body: ArchiveHistoryDto) { return this.finance.archiveTransaction(id, 'withdrawal', body.reason, { id: String(req.user!._id), email: req.user!.email }); }
  @Post('admin/deposits/:id/restore') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('deposits.manage') restoreDeposit(@Req() req: Request & { user?: User }, @Param('id') id: string) { return this.finance.restoreTransaction(id, 'deposit', { id: String(req.user!._id), email: req.user!.email }); }
  @Post('admin/withdrawals/:id/restore') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('withdrawals.manage') restoreWithdrawal(@Req() req: Request & { user?: User }, @Param('id') id: string) { return this.finance.restoreTransaction(id, 'withdrawal', { id: String(req.user!._id), email: req.user!.email }); }
  @Post('admin/deposits/archive-history') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('deposits.manage') clearDeposits(@Req() req: Request & { user?: User }, @Body() body: ArchiveHistoryDto) { return this.finance.archiveTransactionHistory('deposit', body.reason, { id: String(req.user!._id), email: req.user!.email }); }
  @Post('admin/withdrawals/archive-history') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('withdrawals.manage') clearWithdrawals(@Req() req: Request & { user?: User }, @Body() body: ArchiveHistoryDto) { return this.finance.archiveTransactionHistory('withdrawal', body.reason, { id: String(req.user!._id), email: req.user!.email }); }
  @Patch('admin/deposits/:id') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('deposits.manage') reviewDeposit(@Req() req: Request & { user?: User }, @Param('id') id: string, @Body() body: ReviewFinanceDto) { return this.finance.review(id, 'deposit', body.decision, body.rejectionReason, { id: String(req.user!._id), email: req.user!.email }); }
  @Patch('admin/withdrawals/:id') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('withdrawals.manage') reviewWithdrawal(@Req() req: Request & { user?: User }, @Param('id') id: string, @Body() body: ReviewFinanceDto) { return this.finance.review(id, 'withdrawal', body.decision, body.rejectionReason, { id: String(req.user!._id), email: req.user!.email }); }
}
