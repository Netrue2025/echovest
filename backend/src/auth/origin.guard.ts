import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin;
    const allowed = this.config.getOrThrow<string>('FRONTEND_URL').split(',').map((value) => value.trim().replace(/\/$/, ''));
    if (!origin || !allowed.includes(origin.replace(/\/$/, ''))) throw new ForbiddenException('Request origin is not allowed.');
    return true;
  }
}
