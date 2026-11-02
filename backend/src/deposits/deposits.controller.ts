import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { User } from '../users/user.schema.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AdminAccessGuard, RequireAdminPermissions } from '../admin/admin-access.guard.js';
import { DepositReviewDto } from './deposit-review.dto.js';
import { DepositsService } from './deposits.service.js';

@Controller('admin/deposit-events')
@UseGuards(SessionGuard, AdminAccessGuard)
@RequireAdminPermissions('deposits.manage')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Get('review') reviewQueue() { return this.deposits.listReviewQueue(); }

  @Post(':id/review') @UseGuards(OriginGuard)
  review(@Param('id') id: string, @Body() body: DepositReviewDto, @Req() request: Request & { user?: User }) {
    return this.deposits.reviewDeposit(id, body.action, body.reason, { id: String(request.user!._id), email: request.user!.email });
  }
}
