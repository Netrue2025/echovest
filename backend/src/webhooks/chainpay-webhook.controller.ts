import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, HttpException, HttpStatus, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { DepositsService } from '../deposits/deposits.service.js';
import { WebhookSecurityService } from './webhook-security.service.js';

@Controller('api/webhooks')
export class ChainPayWebhookController {
  constructor(private readonly deposits: DepositsService, private readonly security: WebhookSecurityService) {}
  @Post('chainpay') @HttpCode(200) async receive(@Query('token') token: string | undefined, @Body() body: Record<string, unknown>, @Req() request: Request) {
    const ipAddress = request.ip || request.socket.remoteAddress || 'unknown';
    const rate = this.security.allow(ipAddress);
    if (!rate.allowed) {
      if (rate.recordRateLimit) {
        await this.security.record({ eventType: 'webhook_rate_limited', reasonCode: 'per_ip_minute_limit', ipAddress });
        this.security.markRateLimitRecorded(ipAddress);
      }
      throw new HttpException('Webhook rate limit exceeded.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!this.deposits.validSecret(token)) {
      await this.security.record({ eventType: 'webhook_auth_failed', reasonCode: 'invalid_webhook_token', ipAddress });
      throw new ForbiddenException('Invalid webhook credentials.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      await this.security.record({ eventType: 'payload_mismatch', reasonCode: 'malformed_event_body', ipAddress });
      throw new BadRequestException('Invalid ChainPay event.');
    }
    const result = await this.deposits.acceptWebhook(body);
    const hash = typeof body.txHash === 'string' ? body.txHash.trim() : '';
    const reference = typeof body.externalReference === 'string' ? body.externalReference.trim() : '';
    if (!/^[a-f0-9]{64}$/i.test(hash)) await this.security.record({ eventType: 'invalid_transaction_hash', reasonCode: 'invalid_hash_format', ipAddress, transactionHash: hash, externalReference: reference });
    if (!result.accepted) {
      if (result.reason === 'unknown_deposit_reference') await this.security.record({ eventType: 'unknown_deposit_reference', reasonCode: 'no_active_matching_account', ipAddress, transactionHash: hash, externalReference: reference });
      else if (result.reason === 'invalid_transaction_or_amount' && /^[a-f0-9]{64}$/i.test(hash)) await this.security.record({ eventType: 'payload_mismatch', reasonCode: 'invalid_or_nonpositive_amount', ipAddress, transactionHash: hash, externalReference: reference });
    }
    if (result.accepted && result.status === 'review_required') {
      await this.security.record({ eventType: 'payload_mismatch', reasonCode: 'webhook_fields_inconsistent', ipAddress, transactionHash: hash, externalReference: reference });
    }
    return result;
  }
}
