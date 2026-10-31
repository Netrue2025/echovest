import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { SESSION_COOKIE, SessionsService } from '../sessions/sessions.service.js';
import { User } from '../users/user.schema.js';
import { AdminAccessGuard, RequireAdminPermissions } from './admin-access.guard.js';
import { AdminActor, AdminService } from './admin.service.js';
import { AdminSigninDto, CreateAdminDto, UpdateAdminPermissionsDto, UpdateAdminStatusDto, UpdateUserControlsDto, UpdateUserDto, UpdateUserPasswordDto, UpdateUserWithdrawalDto } from './admin.dto.js';
import { ADMIN_PERMISSION_GROUPS } from './admin-permissions.js';
import { SuperAdminGuard } from './super-admin.guard.js';

const cookieOptions = (expires?: Date) => {
  const production = process.env.NODE_ENV === 'production';
  const configured = process.env.SESSION_SAME_SITE;
  const sameSite: 'none' | 'strict' | 'lax' = configured === 'none' || configured === 'strict' || configured === 'lax' ? configured : production ? 'none' : 'lax';
  return { httpOnly: true, secure: production || sameSite === 'none', sameSite, path: '/', ...(expires ? { expires } : {}) };
};

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly sessions: SessionsService) {}
  private actor(request: Request & { user?: User }): AdminActor { return { id: String(request.user!._id), email: request.user!.email }; }

  @Post('auth/signin') @UseGuards(OriginGuard)
  async signin(@Body() body: AdminSigninDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.admin.signin(body.email, body.password);
    response.cookie(SESSION_COOKIE, result.session.token, { ...cookieOptions(result.session.expiresAt), maxAge: result.session.expiresAt.getTime() - Date.now() });
    return { user: result.user };
  }
  @Post('auth/signout') @UseGuards(OriginGuard)
  async signout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.[SESSION_COOKIE] as string | undefined;
    try { if (token) await this.sessions.revoke(token); } finally { response.clearCookie(SESSION_COOKIE, cookieOptions()); }
    return { message: 'Signed out.' };
  }
  @Get('auth/me') @UseGuards(SessionGuard, AdminAccessGuard) me(@Req() request: Request & { user?: User }) {
    const user = request.user!;
    return { user: { id: String(user._id), fullName: user.fullName, email: user.email, isSuperAdmin: user.isSuperAdmin, permissions: user.adminPermissions ?? [] } };
  }
  @Get('permission-groups') @UseGuards(SessionGuard, AdminAccessGuard, SuperAdminGuard) permissionGroups() { return ADMIN_PERMISSION_GROUPS; }
  @Get('users') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('users.view') listUsers() { return this.admin.listUsers(); }
  @Patch('users/:id') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('users.manage') updateUser(@Param('id') id: string, @Body() body: UpdateUserDto, @Req() request: Request & { user?: User }) { return this.admin.updateUser(id, body, this.actor(request)); }
  @Patch('users/:id/password') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('users.manage') updatePassword(@Param('id') id: string, @Body() body: UpdateUserPasswordDto, @Req() request: Request & { user?: User }) { return this.admin.changeUserPassword(id, body.password, this.actor(request)); }
  @Patch('users/:id/controls') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('users.manage') updateControls(@Param('id') id: string, @Body() body: UpdateUserControlsDto, @Req() request: Request & { user?: User }) { return this.admin.updateUserControls(id, body, this.actor(request)); }
  @Patch('users/:id/withdrawals') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('withdrawals.manage') updateWithdrawalControl(@Param('id') id: string, @Body() body: UpdateUserWithdrawalDto, @Req() request: Request & { user?: User }) { return this.admin.updateUserWithdrawalControl(id, body.withdrawalsDisabled, this.actor(request)); }
  @Delete('users/:id') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard) @RequireAdminPermissions('users.manage') deleteUser(@Param('id') id: string, @Req() request: Request & { user?: User }) { return this.admin.deleteUser(id, this.actor(request)); }
  @Get('admins') @UseGuards(SessionGuard, AdminAccessGuard, SuperAdminGuard) listAdmins() { return this.admin.listAdmins(); }
  @Post('admins') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard, SuperAdminGuard) createAdmin(@Body() body: CreateAdminDto, @Req() request: Request & { user?: User }) { return this.admin.createAdmin(body, this.actor(request)); }
  @Patch('admins/:id/permissions') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard, SuperAdminGuard) updateAdminPermissions(@Param('id') id: string, @Body() body: UpdateAdminPermissionsDto, @Req() request: Request & { user?: User }) { return this.admin.updateAdminPermissions(id, body.permissions, this.actor(request)); }
  @Patch('admins/:id/status') @UseGuards(OriginGuard, SessionGuard, AdminAccessGuard, SuperAdminGuard) updateAdminStatus(@Param('id') id: string, @Body() body: UpdateAdminStatusDto, @Req() request: Request & { user?: User }) { return this.admin.updateAdminStatus(id, body.disabled, this.actor(request)); }
  @Get('audit') @UseGuards(SessionGuard, AdminAccessGuard) @RequireAdminPermissions('audit.view') listAudit() { return this.admin.listAudit(); }
}
