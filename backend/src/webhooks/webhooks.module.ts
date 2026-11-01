import { Module } from '@nestjs/common';
import { DepositsModule } from '../deposits/deposits.module.js';
import { ChainPayWebhookController } from './chainpay-webhook.controller.js';
@Module({ imports: [DepositsModule], controllers: [ChainPayWebhookController] })
export class WebhooksModule {}
