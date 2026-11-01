import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChainPayService, isValidTronAddress } from './chainpay.service.js';

const validAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
function service(values: Record<string, string>) { return new ChainPayService({ get: (key: string) => values[key] } as never); }

describe('ChainPayService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('validates TRON base58check addresses rather than only their visible format', () => {
    expect(isValidTronAddress(validAddress)).toBe(true);
    expect(isValidTronAddress('T' + 'A'.repeat(33))).toBe(false);
  });

  it('keeps real address provisioning disabled by default', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(service({ CHAINPAY_CALLBACK_URL: 'https://api.example.com/api/webhooks/chainpay', CHAINPAY_FORWARD_ADDRESS: validAddress, TRON_USDT_CONTRACT: validAddress, CHAINPAY_WEBHOOK_SECRET: 'x'.repeat(40) }).createDepositAddress('ref')).rejects.toThrow(/disabled/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('calls the documented create-address route with the stable reference and callback token', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => { const body = JSON.parse(String(init?.body)) as Record<string, unknown>; expect(body.ticker).toBe('trc20/usdt'); expect(body.externalReference).toBe('ev_stable'); expect(String(body.callbackUrl)).toContain('token='); return new Response(JSON.stringify({ id: 'addr_123', address: validAddress, ticker: 'trc20/usdt', chain: 'tron', externalReference: 'ev_stable' }), { status: 201 }); });
    vi.stubGlobal('fetch', fetch);
    const result = await service({ CHAINPAY_LIVE_DEPOSITS_ENABLED: 'true', CHAINPAY_CALLBACK_URL: 'https://api.example.com/api/webhooks/chainpay', CHAINPAY_FORWARD_ADDRESS: validAddress, TRON_USDT_CONTRACT: validAddress, CHAINPAY_WEBHOOK_SECRET: 'secret'.repeat(7) }).createDepositAddress('ev_stable');
    expect(fetch).toHaveBeenCalledWith('https://api.chainpay.site/deposit-address', expect.objectContaining({ method: 'POST' }));
    expect(result).toMatchObject({ id: 'addr_123', address: validAddress, ticker: 'trc20/usdt', chain: 'tron' });
  });

  it('rejects malformed provider response data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ id: 'addr_123', address: 'not-tron' }), { status: 201 })));
    await expect(service({ CHAINPAY_LIVE_DEPOSITS_ENABLED: 'true', CHAINPAY_CALLBACK_URL: 'https://api.example.com/api/webhooks/chainpay', CHAINPAY_FORWARD_ADDRESS: validAddress, TRON_USDT_CONTRACT: validAddress, CHAINPAY_WEBHOOK_SECRET: 'secret'.repeat(7) }).createDepositAddress('ev_stable')).rejects.toThrow(/invalid TRON/);
  });
});
