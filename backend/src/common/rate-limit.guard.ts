import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const route = request.path;
    const guestStart = route === '/support/guest/start' && request.method === 'POST';
    const supportMessage = (/^\/support\/(?:guest\/[^/]+\/messages|me\/messages)$/.test(route) || /^\/admin\/support\/conversations\/[^/]+\/messages$/.test(route)) && request.method === 'POST';
    if (!route.startsWith('/auth/') && !guestStart && !supportMessage) return true;
    const now = Date.now();
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const bucket = route.startsWith('/auth/') ? 'auth' : guestStart ? 'guest-chat-start' : 'support-message';
    const limit = route.startsWith('/auth/') ? 20 : guestStart ? 5 : 12;
    const windowMs = guestStart ? 60 * 60_000 : 60_000;
    const attemptKey = `${bucket}:${key}`;
    const current = this.attempts.get(attemptKey);
    if (!current || current.resetAt <= now) this.attempts.set(attemptKey, { count: 1, resetAt: now + windowMs });
    else if (current.count >= limit) throw new HttpException('Too many requests. Please wait and try again.', HttpStatus.TOO_MANY_REQUESTS);
    else current.count += 1;
    if (this.attempts.size > 10_000) for (const [ip, entry] of this.attempts) if (entry.resetAt <= now) this.attempts.delete(ip);
    return true;
  }
}
