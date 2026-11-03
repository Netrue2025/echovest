import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { User } from '../users/user.schema.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AdminAccessGuard, RequireAdminPermissions } from '../admin/admin-access.guard.js';
import { DepositReviewDto } from './deposit-review.dto.js';
import { DepositsService } from './deposits.service.js';
import { ArchiveHistoryDto, ArchiveSelectedHistoryDto } from '../finance/finance.dto.js';

@Controller('admin/deposit-events')
@UseGuards(SessionGuard, AdminAccessGuard)
@RequireAdminPermissions('deposits.manage')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Get('review') reviewQueue() { return this.deposits.listReviewQueue(); }

  @Get('history') history(@Query('archived') archived?: string) { return this.deposits.listAdminHistory(archived === 'true'); }

  @Post('history/:id/archive') @UseGuards(OriginGuard)
  archiveHistory(@Param('id') id: string, @Body() body: ArchiveHistoryDto, @Req() request: Request & { user?: User }) {
    return this.deposits.archiveHistoryRecord(id, body.reason, { id: String(request.user!._id), email: request.user!.email });
  }

  @Post('history/:id/restore') @UseGuards(OriginGuard)
  restoreHistory(@Param('id') id: string, @Req() request: Request & { user?: User }) {
    return this.deposits.restoreHistoryRecord(id, { id: String(request.user!._id), email: request.user!.email });
  }

  @Post('history/archive-selected') @UseGuards(OriginGuard)
  archiveSelectedHistory(@Body() body: ArchiveSelectedHistoryDto, @Req() request: Request & { user?: User }) {
    return this.deposits.archiveSelectedHistoryRecords(body.ids, body.reason, { id: String(request.user!._id), email: request.user!.email });
  }

  @Delete('history') @UseGuards(OriginGuard)
  permanentlyDeleteSelectedHistory(@Body() body: ArchiveSelectedHistoryDto, @Req() request: Request & { user?: User }) {
    return this.deposits.permanentlyDeleteSelectedHistoryRecords(body.ids, body.reason, { id: String(request.user!._id), email: request.user!.email });
  }

  @Post('history/archive-all') @UseGuards(OriginGuard)
  archiveHistoryAll(@Body() body: ArchiveHistoryDto, @Req() request: Request & { user?: User }) {
    return this.deposits.archiveResolvedDepositHistory(body.reason, { id: String(request.user!._id), email: request.user!.email });
  }

  @Post(':id/review') @UseGuards(OriginGuard)
  review(@Param('id') id: string, @Body() body: DepositReviewDto, @Req() request: Request & { user?: User }) {
    return this.deposits.reviewDeposit(id, body.action, body.reason, { id: String(request.user!._id), email: request.user!.email });
  }
}
