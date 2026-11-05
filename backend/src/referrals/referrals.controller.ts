import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { IsArray, IsIn, IsInt, IsMongoId, IsNumber, IsString, Max, Min, MinLength, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminAccessGuard, RequireAdminPermissions } from '../admin/admin-access.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { User } from '../users/user.schema.js';
import { MEMBERSHIP_LEVELS } from './referral.schema.js';
import type { MembershipLevel, MembershipTier, ReferralRate } from './referral.schema.js';
import { ReferralsService } from './referrals.service.js';

class ReferralRateDto implements ReferralRate {
  @IsIn(MEMBERSHIP_LEVELS) level!: MembershipLevel;
  @IsNumber() @Min(0) @Max(100) tier1!: number;
  @IsNumber() @Min(0) @Max(100) tier2!: number;
  @IsNumber() @Min(0) @Max(100) tier3!: number;
}
class UpdateReferralRatesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReferralRateDto) rates!: ReferralRateDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => MembershipTierDto) levels!: MembershipTierDto[];
}
class MembershipTierDto implements MembershipTier {
  @IsIn(MEMBERSHIP_LEVELS) level!: MembershipLevel;
  @IsInt() @Min(0) @Max(1_000_000) requiredDirectReferrals!: number;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0) requiredTradingBalance!: number;
  @IsInt() @Min(0) @Max(720) withdrawalReviewHours!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) withdrawalFeeDiscountPercent!: number;
}
class ReferralBonusDto {
  @IsMongoId() userId!: string;
  @IsNumber({ maxDecimalPlaces: 8 }) @Min(0.00000001) amount!: number;
  @IsIn(['credit', 'debit']) direction!: 'credit' | 'debit';
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Get('me') @UseGuards(SessionGuard) me(@Req() request: Request & { user?: User }) { return this.referrals.myOverview(String(request.user!._id)); }
  @Get('admin/settings') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('referrals.view') settings() { return this.referrals.getSettings(); }
  @Get('admin/users') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('referrals.view') users() { return this.referrals.listReferralUsers(); }
  @Post('admin/bonus') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('referrals.manage') bonus(@Body() body: ReferralBonusDto, @Req() request: Request & { user?: User }) { return this.referrals.adjustBonus(body.userId, body.amount, body.direction, body.reason, { id: String(request.user!._id), email: request.user!.email }); }
  @Patch('admin/settings') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('referrals.manage') update(@Body() body: UpdateReferralRatesDto, @Req() request: Request & { user?: User }) { return this.referrals.updateSettings(body.rates, body.levels, { id: String(request.user!._id), email: request.user!.email }); }
  @Get('admin/network/:userId') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('referrals.view') network(@Param('userId') userId: string) { return this.referrals.adminOverview(userId); }
}
