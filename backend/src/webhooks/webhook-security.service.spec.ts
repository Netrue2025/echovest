import { describe, expect, it, vi } from 'vitest';
import { WebhookSecurityService } from './webhook-security.service.js';

function service() {
  const events = { create: vi.fn(async (document) => document) };
  return { security: new WebhookSecurityService(events as never), events };
}

describe('WebhookSecurityService', () => {
  it('stores hashes and never stores the source IP or external reference', async () => {
    const { security, events } = service();
    await security.record({ eventType: 'webhook_auth_failed', reasonCode: 'invalid_webhook_token', ipAddress: '203.0.113.5', externalReference: 'private-ref' });
    const saved = events.create.mock.calls[0][0];
    expect(saved.sourceIpHash).not.toContain('203.0.113.5');
    expect(saved.externalReferenceHash).not.toContain('private-ref');
    expect(saved).not.toHaveProperty('token');
    expect(saved).not.toHaveProperty('rawEvent');
  });
  it('limits a source to 60 requests per minute and only emits one rate log per window', () => {
    const { security } = service();
    for (let i = 0; i < 60; i += 1) expect(security.allow('192.0.2.1', 1000).allowed).toBe(true);
    expect(security.allow('192.0.2.1', 1000)).toMatchObject({ allowed: false, recordRateLimit: true });
    security.markRateLimitRecorded('192.0.2.1');
    expect(security.allow('192.0.2.1', 1000)).toMatchObject({ allowed: false, recordRateLimit: false });
    expect(security.allow('192.0.2.1', 61_001).allowed).toBe(true);
  });
  it('stores a transaction hash only when it is syntactically valid', async () => {
    const { security, events } = service();
    await security.record({ eventType: 'invalid_transaction_hash', reasonCode: 'invalid_hash_format', ipAddress: 'unknown', transactionHash: 'bearer-secret-do-not-store' });
    expect(events.create.mock.calls[0][0].transactionHash).toBe('');
  });
});
