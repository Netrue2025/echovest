import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { User } from '../users/user.schema.js';
import { SetWithdrawalPinDto, VerifyRegistrationDto, WithdrawalAuthenticationResponseDto, WithdrawalContextDto } from './withdrawal-security.dto.js';
import { WithdrawalSecurityService } from './withdrawal-security.service.js';

@Controller('withdrawal-security')
@UseGuards(SessionGuard)
export class WithdrawalSecurityController {
  constructor(private readonly security: WithdrawalSecurityService) {}
  @Get('status') status(@Req() req: Request & { user?: User }) { return this.security.status(String(req.user!._id)); }
  @Post('pin') @UseGuards(OriginGuard) setPin(@Req() req: Request & { user?: User }, @Body() body: SetWithdrawalPinDto) { return this.security.setPin(String(req.user!._id), body.pin); }
  @Post('passkey/registration-options') @UseGuards(OriginGuard) registrationOptions(@Req() req: Request & { user?: User }) { return this.security.registrationOptions(String(req.user!._id)); }
  @Post('passkey/registration-verification') @UseGuards(OriginGuard) verifyRegistration(@Req() req: Request & { user?: User }, @Body() body: VerifyRegistrationDto) { return this.security.verifyRegistration(String(req.user!._id), body.response as RegistrationResponseJSON, body.name, body.challengeId); }
  @Post('passkey/authentication-options') @UseGuards(OriginGuard) authenticationOptions(@Req() req: Request & { user?: User }, @Body() body: WithdrawalContextDto) { return this.security.authenticationOptions(String(req.user!._id), body); }
  @Post('passkey/authentication-verification') @UseGuards(OriginGuard) verifyAuthentication(@Req() req: Request & { user?: User }, @Body() body: WithdrawalAuthenticationResponseDto) { return this.security.verifyAuthentication(String(req.user!._id), body.response as AuthenticationResponseJSON, body, body.challengeId); }
}
