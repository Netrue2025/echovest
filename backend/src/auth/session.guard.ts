import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SessionsService, SESSION_COOKIE } from '../sessions/sessions.service.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionsService, private readonly users: UsersService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Sign in to continue.');
    const session = await this.sessions.findByToken(token);
    if (!session) throw new UnauthorizedException('Your session has expired. Sign in again.');
    const user = await this.users.findByEmailById(String(session.userId));
    if (!user) throw new UnauthorizedException('Sign in to continue.');
    if (user.isDisabled) throw new UnauthorizedException('This account is disabled. Contact support.');
    request.user = user;
    return true;
  }
}
