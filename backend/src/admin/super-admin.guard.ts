import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { User } from '../users/user.schema.js';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<Request & { user?: User }>().user;
    if (!user?.isSuperAdmin || user.isDisabled) throw new ForbiddenException('Only the super admin can manage administrator accounts.');
    return true;
  }
}
