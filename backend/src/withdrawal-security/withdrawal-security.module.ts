import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OriginGuard } from '../auth/origin.guard.js';
import { SessionGuard } from '../auth/session.guard.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { UsersModule } from '../users/users.module.js';
import { WithdrawalSecurityController } from './withdrawal-security.controller.js';
import { WithdrawalSecurityProof, WithdrawalSecurityProofSchema } from './withdrawal-security.schema.js';
import { WithdrawalSecurityService } from './withdrawal-security.service.js';

@Module({ imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: WithdrawalSecurityProof.name, schema: WithdrawalSecurityProofSchema }]), UsersModule, SessionsModule], controllers: [WithdrawalSecurityController], providers: [WithdrawalSecurityService, SessionGuard, OriginGuard], exports: [WithdrawalSecurityService] })
export class WithdrawalSecurityModule {}
