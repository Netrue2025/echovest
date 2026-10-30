import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { EmailCodeDto, EmailDto, SigninDto, SignupDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { OriginGuard } from './origin.guard.js';
import { SessionGuard } from './session.guard.js';
import { UsersService } from '../users/users.service.js';
import { SESSION_COOKIE, SessionsService } from '../sessions/sessions.service.js';

const cookieOptions = (expires?: Date) => {
  const configured = process.env.SESSION_SAME_SITE;
  const production = process.env.NODE_ENV === 'production';
  const sameSite: 'none' | 'strict' | 'lax' = configured === 'none' || configured === 'strict' || configured === 'lax' ? configured : production ? 'none' : 'lax';
  return { httpOnly: true, secure: production || sameSite === 'none', sameSite, path: '/', ...(expires ? { expires } : {}) };
};

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService, private readonly sessions: SessionsService) {}
  @Post('signup') @UseGuards(OriginGuard) signup(@Body() body: SignupDto) { return this.auth.signup(body); }
  @Post('verify-email') @UseGuards(OriginGuard)
  async verifyEmail(@Body() body: EmailCodeDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.verifyEmail(body.email, body.code);
    response.cookie(SESSION_COOKIE, result.session.token, { ...cookieOptions(result.session.expiresAt), maxAge: result.session.expiresAt.getTime() - Date.now() });
    return { message: 'Your email is verified.', user: result.user };
  }
  @Post('resend-otp') @UseGuards(OriginGuard) resendOtp(@Body() body: EmailDto) { return this.auth.resendOtp(body.email); }
  @Post('signin') @UseGuards(OriginGuard)
  async signin(@Body() body: SigninDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.signin(body.email, body.password);
    response.cookie(SESSION_COOKIE, result.session.token, { ...cookieOptions(result.session.expiresAt), maxAge: result.session.expiresAt.getTime() - Date.now() });
    return { user: result.user };
  }
  @Post('signout') @UseGuards(OriginGuard)
  async signout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    try { if (token) await this.sessions.revoke(token); }
    finally { response.clearCookie(SESSION_COOKIE, cookieOptions()); }
    return { message: 'Signed out.' };
  }
  @Get('me') @UseGuards(SessionGuard)
  me(@Req() request: Request & { user?: Parameters<UsersService['safe']>[0] }) { return { user: this.users.safe(request.user!) }; }
}
