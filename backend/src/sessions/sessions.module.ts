import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Session, SessionSchema } from './session.schema.js';
import { SessionsService } from './sessions.service.js';
@Module({ imports: [MongooseModule.forFeature([{ name: Session.name, schema: SessionSchema }])], providers: [SessionsService], exports: [SessionsService, MongooseModule] })
export class SessionsModule {}
