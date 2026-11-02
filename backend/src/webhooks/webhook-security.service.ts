import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import type { Model } from 'mongoose';
import { DepositSecurityEvent } from './deposit-security-event.schema.js';

type SecurityEventType = 'webhook_auth_failed' | 'webhook_rate_limited' | 'invalid_transaction_hash' | 'unknown_deposit_reference' | 'payload_mismatch';

@Injectable()
export class WebhookSecurityService {
  private readonly windows = new Map<string, { count: number; resetAt: number; rateEventRecorded: boolean }>();
  constructor(@InjectModel(DepositSecurityEvent.name) private readonly events: Model<DepositSecurityEvent>) {}

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

  allow(ipAddress: string, now = Date.now()) {
    const key = this.hash(ipAddress || 'unknown');
    let window = this.windows.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + 60_000, rateEventRecorded: false };
      this.windows.set(key, window);
    }
    if (this.windows.size > 10_000) for (const [entry, value] of this.windows) if (value.resetAt <= now) this.windows.delete(entry);
    if (window.count >= 60) return { allowed: false, recordRateLimit: !window.rateEventRecorded };
    window.count += 1;
    return { allowed: true, recordRateLimit: false };
  }

  markRateLimitRecorded(ipAddress: string) {
    const window = this.windows.get(this.hash(ipAddress || 'unknown'));
    if (window) window.rateEventRecorded = true;
  }

  async record(input: { eventType: SecurityEventType; reasonCode: string; ipAddress: string; transactionHash?: string; externalReference?: string }) {
    const txHash = input.transactionHash && /^[a-f0-9]{64}$/i.test(input.transactionHash) ? input.transactionHash.toLowerCase() : '';
    const externalReferenceHash = input.externalReference ? this.hash(input.externalReference).slice(0, 32) : '';
    await this.events.create({
      eventType: input.eventType,
      reasonCode: input.reasonCode.slice(0, 80),
      sourceIpHash: this.hash(input.ipAddress || 'unknown'),
      transactionHash: txHash,
      externalReferenceHash,
    });
  }
}
