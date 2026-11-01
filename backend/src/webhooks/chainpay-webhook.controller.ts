import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, Post, Query } from '@nestjs/common';
import { DepositsService } from '../deposits/deposits.service.js';

@Controller('api/webhooks')
export class ChainPayWebhookController {
  constructor(private readonly deposits: DepositsService) {}
  @Post('chainpay') @HttpCode(200) async receive(@Query('token') token: string | undefined, @Body() body: Record<string, unknown>) {
    if (!this.deposits.validSecret(token)) throw new ForbiddenException('Invalid webhook credentials.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException('Invalid ChainPay event.');
    return this.deposits.acceptWebhook(body);
  }
}
