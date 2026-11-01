import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { DepositsService } from './deposits.service.js';

const reference = 'ev_12345678-1234-4234-8234-123456789012';
const txHash = 'a'.repeat(64);
const account = { _id: new Types.ObjectId(), userId: new Types.ObjectId(), externalReference: reference, providerAddressId: 'addr_1' };
const validPayload = { status: 'confirmed', externalReference: reference, chain: 'tron', tokenSymbol: 'USDT', tokenAddress: 'TVerifiedContract', isNative: false, amount: '12.345678', txHash };

function setup() {
  const docs: Array<Record<string, unknown>> = [];
  const accounts = { findOne: vi.fn(() => ({ exec: async () => account })) };
  const events = {
    create: vi.fn(async (data: Record<string, unknown>) => { if (docs.some((row) => row.providerTransactionId === data.providerTransactionId && row.providerStatus === data.providerStatus)) throw Object.assign(new Error('duplicate'), { code: 11000 }); const document = { ...data, _id: new Types.ObjectId() }; docs.push(document); return document; }),
    updateOne: vi.fn(() => ({ exec: async () => ({ matchedCount: 1 }) })),
    findOne: vi.fn(() => ({ select() { return this; }, lean() { return this; }, exec: async () => null })),
    findOneAndUpdate: vi.fn(() => ({ exec: async () => null })),
  };
  const config = { get: (key: string) => key === 'CHAINPAY_WEBHOOK_SECRET' ? 'a'.repeat(40) : key === 'TRON_USDT_CONTRACT' ? 'TVerifiedContract' : undefined };
  const service = new DepositsService(accounts as never, events as never, config as never);
  return { service, accounts, events, docs };
}

describe('DepositsService ChainPay webhook', () => {
  it('compares the callback token in constant time and rejects an invalid token', () => {
    const { service } = setup();
    expect(service.validSecret('a'.repeat(40))).toBe(true);
    expect(service.validSecret('a'.repeat(39))).toBe(false);
    expect(service.validSecret(undefined)).toBe(false);
  });

  it('rejects unknown external references before storing a provider event', async () => {
    const { service, accounts, events } = setup();
    accounts.findOne.mockImplementation(() => ({ exec: async () => null }) as never);
    expect(await service.acceptWebhook(validPayload)).toEqual({ accepted: false, reason: 'unknown_deposit_reference' });
    expect(events.create).not.toHaveBeenCalled();
  });

  it('stores confirmed events as pending reconciliation without crediting any wallet', async () => {
    const { service, events } = setup();
    expect(await service.acceptWebhook(validPayload)).toEqual({ accepted: true, duplicate: false });
    expect(events.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', providerStatus: 'confirmed', amount: expect.any(Object) }));
  });

  it('stores pending separately from confirmed and does not start confirmation work', async () => {
    const { service, events } = setup();
    await service.acceptWebhook({ ...validPayload, status: 'pending' });
    expect(events.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', providerStatus: 'pending' }));
  });

  it('rejects unsupported token, network, and invalid transaction data', async () => {
    const { service, events } = setup();
    await service.acceptWebhook({ ...validPayload, tokenSymbol: 'USDC' });
    expect(events.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
    await expect(service.acceptWebhook({ ...validPayload, txHash: 'bad' })).resolves.toMatchObject({ accepted: false });
    await expect(service.acceptWebhook({ ...validPayload, amount: '1.0000001' })).resolves.toMatchObject({ accepted: false });
  });

  it('deduplicates a provider transaction and status pair', async () => {
    const { service, events } = setup();
    await service.acceptWebhook(validPayload);
    events.create.mockImplementationOnce(async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
    expect(await service.acceptWebhook(validPayload)).toEqual({ accepted: true, duplicate: true });
    expect(events.updateOne).toHaveBeenCalled();
  });
});
