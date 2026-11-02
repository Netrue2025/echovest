import { describe, expect, it, vi } from 'vitest';
import { ChainPayWebhookController } from './chainpay-webhook.controller.js';

function controller() {
  const deposits = { validSecret: vi.fn((token: unknown) => token === 'test-token'), acceptWebhook: vi.fn(async () => ({ accepted: true, status: 'review_required' })) };
  const security = { allow: vi.fn(() => ({ allowed: true, recordRateLimit: false })), markRateLimitRecorded: vi.fn(), record: vi.fn(async () => undefined) };
  const instance = new ChainPayWebhookController(deposits as never, security as never);
  const request = { ip: '203.0.113.4', socket: { remoteAddress: '203.0.113.4' } } as never;
  return { instance, deposits, security, request };
}

describe('ChainPayWebhookController security audit', () => {
  it('records invalid authentication without storing the supplied token', async () => {
    const { instance, security } = controller();
    await expect(instance.receive('secret-token', {}, { ip: '203.0.113.4' } as never)).rejects.toThrow(/Invalid webhook/);
    expect(security.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'webhook_auth_failed', reasonCode: 'invalid_webhook_token' }));
    expect(JSON.stringify(security.record.mock.calls)).not.toContain('secret-token');
  });
  it('audits IP rate limiting and rejects excess requests', async () => {
    const { instance, security } = controller();
    security.allow.mockReturnValue({ allowed: false, recordRateLimit: true });
    await expect(instance.receive('test-token', {}, { ip: '203.0.113.4' } as never)).rejects.toThrow(/rate limit/i);
    expect(security.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'webhook_rate_limited' }));
    expect(security.markRateLimitRecorded).toHaveBeenCalledWith('203.0.113.4');
  });
  it('records malformed transaction hashes and mismatched accepted payloads', async () => {
    const { instance, security, request } = controller();
    await instance.receive('test-token', { txHash: 'invalid', externalReference: 'ref' }, request);
    expect(security.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'payload_mismatch' }));
  });
});
