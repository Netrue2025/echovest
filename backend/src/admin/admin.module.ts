import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailVerification, EmailVerificationSchema } from '../auth/verification.schema.js';
import { PasswordReset, PasswordResetSchema } from '../auth/password-reset.schema.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { AdminAccessGuard } from './admin-access.guard.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { SuperAdminGuard } from './super-admin.guard.js';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { AdminAudit, AdminAuditSchema } from './admin-audit.schema.js';

@Module({ imports: [MongooseModule.forFeature([{ name: EmailVerification.name, schema: EmailVerificationSchema }, { name: PasswordReset.name, schema: PasswordResetSchema }, { name: AdminAudit.name, schema: AdminAuditSchema }]), UsersModule, SessionsModule], controllers: [AdminController], providers: [AdminService, AdminAccessGuard, SuperAdminGuard, OriginGuard, SessionGuard] })
export class AdminModule {}
