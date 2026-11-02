import { Module } from '@nestjs/common';
import { DepositsModule } from '../deposits/deposits.module.js';
import { MongooseModule } from '@nestjs/mongoose';
import { ChainPayWebhookController } from './chainpay-webhook.controller.js';
import { DepositSecurityEvent, DepositSecurityEventSchema } from './deposit-security-event.schema.js';
import { WebhookSecurityService } from './webhook-security.service.js';
@Module({ imports: [DepositsModule, MongooseModule.forFeature([{ name: DepositSecurityEvent.name, schema: DepositSecurityEventSchema }])], controllers: [ChainPayWebhookController], providers: [WebhookSecurityService] })
export class WebhooksModule {}
