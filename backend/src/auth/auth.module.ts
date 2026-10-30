import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailModule } from '../email/email.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailVerification, EmailVerificationSchema } from './verification.schema.js';
import { OriginGuard } from './origin.guard.js';
import { SessionGuard } from './session.guard.js';
@Module({ imports: [MongooseModule.forFeature([{ name: EmailVerification.name, schema: EmailVerificationSchema }]), UsersModule, SessionsModule, EmailModule], controllers: [AuthController], providers: [AuthService, OriginGuard, SessionGuard] })
export class AuthModule {}
