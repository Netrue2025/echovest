import { describe, expect, it } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { AdminAccessGuard, REQUIRED_ADMIN_PERMISSIONS } from '../admin/admin-access.guard.js';
import { DepositsController } from './deposits.controller.js';

function context(user: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => DepositsController.prototype.review,
    getClass: () => DepositsController,
  } as unknown as ExecutionContext;
}

describe('DepositsController authorization', () => {
  it('requires authenticated admin deposit permission for the review API', () => {
    const guard = new AdminAccessGuard(new Reflector());
    expect(() => guard.canActivate(context({ role: 'user' }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context({ role: 'admin', adminPermissions: [] }))).toThrow(ForbiddenException);
    expect(guard.canActivate(context({ role: 'admin', adminPermissions: ['deposits.manage'] }))).toBe(true);
    expect(guard.canActivate(context({ role: 'admin', isSuperAdmin: true }))).toBe(true);
  });

  it('declares session and admin authorization guards on the review controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, DepositsController) as unknown[];
    expect(guards).toHaveLength(2);
    expect(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, DepositsController)).toEqual(['deposits.manage']);
  });
});
