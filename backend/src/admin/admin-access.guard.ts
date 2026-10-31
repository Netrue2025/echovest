import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ADMIN_PERMISSION_CODES } from './admin-permissions.js';

export const REQUIRED_ADMIN_PERMISSIONS = 'requiredAdminPermissions';
export const RequireAdminPermissions = (...permissions: string[]) => SetMetadata(REQUIRED_ADMIN_PERMISSIONS, permissions);

type AdminRequest = Request & { user?: { role?: string; isSuperAdmin?: boolean; isDisabled?: boolean; adminPermissions?: string[] } };

@Injectable()
export class AdminAccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<AdminRequest>().user;
    if (!user || user.role !== 'admin' || user.isDisabled) throw new ForbiddenException('Admin access is required.');
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_ADMIN_PERMISSIONS, [context.getHandler(), context.getClass()]) ?? [];
    if (user.isSuperAdmin) return true;
    if (!required.length || !required.every((permission) => {
      if (!ADMIN_PERMISSION_CODES.includes(permission as typeof ADMIN_PERMISSION_CODES[number])) return false;
      if (permission === 'users.view') return Boolean(user.adminPermissions?.includes('users.view') || user.adminPermissions?.includes('users.manage'));
      return Boolean(user.adminPermissions?.includes(permission));
    })) {
      throw new ForbiddenException('Your admin account does not have permission for this section.');
    }
    return true;
  }
}
