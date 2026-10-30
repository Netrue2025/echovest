import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.path.startsWith('/auth/')) return true;
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const current = this.attempts.get(key);
    if (!current || current.resetAt <= now) this.attempts.set(key, { count: 1, resetAt: now + 60_000 });
    else if (current.count >= 20) throw new HttpException('Too many authentication requests. Please wait and try again.', HttpStatus.TOO_MANY_REQUESTS);
    else current.count += 1;
    if (this.attempts.size > 10_000) for (const [ip, entry] of this.attempts) if (entry.resetAt <= now) this.attempts.delete(ip);
    return true;
  }
}
