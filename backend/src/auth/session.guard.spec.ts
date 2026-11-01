import { describe, expect, it, vi } from 'vitest';
import { SessionGuard } from './session.guard.js';

describe('SessionGuard deposit route authentication', () => {
  it('rejects a request without an authenticated session cookie', async () => {
    const guard = new SessionGuard({ findByToken: vi.fn() } as never, { findByEmailById: vi.fn() } as never);
    const context = { switchToHttp: () => ({ getRequest: () => ({ cookies: {} }) }) } as never;
    await expect(guard.canActivate(context)).rejects.toThrow(/Sign in/);
  });
});
