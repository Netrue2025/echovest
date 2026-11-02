import { afterEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { DepositsService } from './deposits.service.js';
import { TRON_MAINNET_USDT_CONTRACT } from './tron-network.js';

const reference = 'ev_12345678-1234-4234-8234-123456789012';
const txHash = 'a'.repeat(64);
const recipient = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const contract = TRON_MAINNET_USDT_CONTRACT;
const account = { _id: new Types.ObjectId(), userId: new Types.ObjectId(), externalReference: reference, providerAddressId: 'addr_1', depositAddress: recipient, accountStatus: 'active' };
const validPayload = { status: 'confirmed', externalReference: reference, chain: 'tron', tokenSymbol: 'USDT', tokenAddress: contract, isNative: false, amount: '12.345678', txHash };

function setup(options: { live?: boolean; chainPayUnavailable?: boolean; tronUnavailable?: boolean; providerAmount?: string; providerChain?: string; providerRecipient?: string; tronAmount?: string; duplicateCredit?: boolean } = {}) {
  const docs: Array<Record<string, any>> = [];
  const providerTransaction = {
    txHash, status: 'confirmed', externalReference: reference, chain: options.providerChain ?? 'tron',
    tokenSymbol: 'USDT', tokenAddress: contract, depositAddress: options.providerRecipient ?? recipient,
    amount: options.providerAmount ?? '12.345678',
  };
  const accounts = {
    findOne: vi.fn(() => ({ exec: async () => account })),
    findById: vi.fn(() => ({ exec: async () => account })),
  };
  const events = {
    create: vi.fn(async (input: Record<string, any>) => {
      if (docs.some((row) => row.providerTransactionId === input.providerTransactionId && row.providerStatus === input.providerStatus)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      const event = { deliveries: 1, reconciliationAttempts: 0, reconciliationDifferences: [] as string[], transferIndex: null as number | null, ...input, _id: new Types.ObjectId() };
      docs.push(event); return event;
    }),
    updateOne: vi.fn((query: Record<string, any>, update: Record<string, any>) => ({ exec: async () => {
      const event = docs.find((row) => String(row._id) === String(query._id) && (!query.status || row.status === query.status));
      if (!event) return { matchedCount: 0 };
      Object.assign(event, update.$set ?? {});
      if (update.$inc) for (const [key, amount] of Object.entries(update.$inc)) event[key] = Number(event[key] ?? 0) + Number(amount);
      return { matchedCount: 1 };
    } })),
    updateMany: vi.fn(() => ({ exec: async () => ({ matchedCount: 0 }) })),
    find: vi.fn(() => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean() { return this; }, exec: async () => docs })),
    findOne: vi.fn((query: Record<string, any>) => ({ exec: async () => docs.find((row) => String(row._id) === String(query._id) && row.status === query.status) ?? null })),
    findOneAndUpdate: vi.fn((query: Record<string, any>, update: Record<string, any>) => ({ exec: async () => {
      const event = docs.find((row) => String(row._id) === String(query._id) && row.status === 'pending' && (row.providerStatus === 'confirmed' || row.retryRequested === true));
      if (!event) return null;
      Object.assign(event, update.$set ?? {});
      event.reconciliationAttempts += Number(update.$inc?.reconciliationAttempts ?? 0);
      return event;
    } })),
  };
  const users = { find: vi.fn(() => ({ select() { return this; }, lean() { return this; }, exec: async () => [{ _id: account.userId, fullName: 'Test User', email: 'test@example.com' }] })) };
  const audit = { create: vi.fn(async () => []) };
  const configValues: Record<string, string> = {
    DEPOSIT_PROVIDER_MODE: options.live === false ? 'mock' : 'chainpay',
    CHAINPAY_LIVE_DEPOSITS_ENABLED: options.live === false ? 'false' : 'true',
    CHAINPAY_WEBHOOK_SECRET: 'x'.repeat(40), TRON_NETWORK: 'mainnet', TRON_USDT_CONTRACT: contract, TRON_MIN_CONFIRMATIONS: '19',
  };
  const config = { get: (key: string) => configValues[key] };
  const tron = { verifyTransfer: options.tronUnavailable ? vi.fn(async () => { throw new Error('tron_api_unavailable'); }) : vi.fn(async () => ({ transactionHash: txHash, recipientAddress: recipient, tokenContract: contract, amount: options.tronAmount ?? '12.345678', blockNumber: 100, confirmations: 19, transferIndex: 0, executionStatus: 'SUCCESS' })) };
  const credits = { creditVerifiedDeposit: vi.fn(async () => options.duplicateCredit ? { credited: false, duplicate: true } : { credited: true }) };
  const service = new DepositsService(accounts as never, events as never, users as never, audit as never, config as never, tron as never, credits as never);
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (options.chainPayUnavailable) return new Response('unavailable', { status: 503 });
    const url = String(input);
    return new Response(JSON.stringify(url.endsWith('/transactions') ? { data: [providerTransaction] } : { status: 'confirmed' }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return { service, accounts, events, docs, users, audit, tron, credits, fetch };
}

describe('DepositsService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('authenticates the webhook token in constant time', () => {
    const { service } = setup();
    expect(service.validSecret('x'.repeat(40))).toBe(true);
    expect(service.validSecret('x'.repeat(39))).toBe(false);
  });

  it('refuses webhook processing and provider reconciliation while mock mode is active', async () => {
    const { service, events, fetch } = setup({ live: false });
    expect(await service.acceptWebhook(validPayload)).toMatchObject({ accepted: false, reason: 'live_deposits_disabled' });
    expect(events.create).not.toHaveBeenCalled();
    expect(await service.reconcile('id')).toMatchObject({ reconciled: false, reason: 'live_deposits_disabled' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an invalid hash and stores suspicious network events for admin review', async () => {
    const { service, docs } = setup();
    expect(await service.acceptWebhook({ ...validPayload, txHash: 'bad' })).toMatchObject({ accepted: false });
    expect(docs).toHaveLength(0);
    expect(await service.acceptWebhook({ ...validPayload, chain: 'ethereum' })).toMatchObject({ accepted: true, status: 'review_required' });
    expect(docs[0].reconciliationDifferences).toContain('provider_network_mismatch');
  });

  it('stores a pending event without issuing credit', async () => {
    const { service, docs, credits } = setup();
    expect(await service.acceptWebhook({ ...validPayload, status: 'pending' })).toMatchObject({ accepted: true, status: 'pending' });
    expect(docs[0].status).toBe('pending');
    expect(credits.creditVerifiedDeposit).not.toHaveBeenCalled();
  });

  it('deduplicates repeated webhook events by transaction and provider status', async () => {
    const { service, docs, events } = setup();
    await service.acceptWebhook(validPayload);
    expect(await service.acceptWebhook(validPayload)).toMatchObject({ accepted: true, duplicate: true });
    expect(docs).toHaveLength(1);
    expect(events.updateOne).toHaveBeenCalledWith(expect.any(Object), { $inc: { deliveries: 1 } });
  });

  it('credits only after provider and independent chain data match', async () => {
    const { service, docs, credits, tron } = setup();
    const result = await service.acceptWebhook(validPayload);
    expect(result.status).toBe('pending');
    expect(await service.reconcile(String(docs[0]._id))).toMatchObject({ reconciled: true, credited: true });
    expect(tron.verifyTransfer).toHaveBeenCalledWith({ transactionHash: txHash, expectedRecipient: recipient, expectedTokenContract: contract });
    expect(credits.creditVerifiedDeposit).toHaveBeenCalledOnce();
  });

  it.each([
    ['independently verified amount mismatch', { tronAmount: '12.345677' }, 'blockchain_amount_mismatch'],
    ['provider amount mismatch', { providerAmount: '12.345677' }, 'webhook_provider_amount_mismatch'],
    ['provider network mismatch', { providerChain: 'bsc' }, 'provider_network_mismatch'],
    ['provider recipient mismatch', { providerRecipient: 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj' }, 'provider_recipient_mismatch'],
  ])('sends %s to admin review without crediting', async (_label, options, difference) => {
    const { service, docs, credits, tron } = setup(options as never);
    await service.acceptWebhook(validPayload);
    expect(await service.reconcile(String(docs[0]._id))).toMatchObject({ reviewRequired: true });
    expect(docs[0].status).toBe('review_required');
    expect(docs[0].reconciliationDifferences).toContain(difference);
    expect(credits.creditVerifiedDeposit).not.toHaveBeenCalled();
    if (String(difference).startsWith('provider_') || difference === 'webhook_provider_amount_mismatch') expect(tron.verifyTransfer).not.toHaveBeenCalled();
    else expect(tron.verifyTransfer).toHaveBeenCalledOnce();
  });

  it('moves a repeated transaction credit to review', async () => {
    const { service, docs } = setup({ duplicateCredit: true });
    await service.acceptWebhook(validPayload);
    expect(await service.reconcile(String(docs[0]._id))).toMatchObject({ reviewRequired: true, duplicate: true });
    expect(docs[0].reconciliationDifferences).toContain('duplicate_transaction_credit');
  });

  it('flags provider and TRON API failures for review without credit', async () => {
    const providerFailure = setup({ chainPayUnavailable: true });
    await providerFailure.service.acceptWebhook(validPayload);
    await providerFailure.service.reconcile(String(providerFailure.docs[0]._id));
    expect(providerFailure.docs[0].status).toBe('review_required');
    expect(providerFailure.credits.creditVerifiedDeposit).not.toHaveBeenCalled();

    const tronFailure = setup({ tronUnavailable: true });
    await tronFailure.service.acceptWebhook(validPayload);
    await tronFailure.service.reconcile(String(tronFailure.docs[0]._id));
    expect(tronFailure.docs[0].status).toBe('review_required');
    expect(tronFailure.credits.creditVerifiedDeposit).not.toHaveBeenCalled();
  });

  it('lists review evidence and writes admin decisions with a database transaction and audit record', async () => {
    const { service, docs, audit, events } = setup();
    await service.acceptWebhook({ ...validPayload, tokenSymbol: 'USDC' });
    const queue = await service.listReviewQueue();
    expect(queue[0]).toMatchObject({ user: { email: 'test@example.com' }, transactionHash: txHash, asset: 'USDT', network: 'TRON' });

    const session = { withTransaction: async (callback: () => Promise<void>) => callback(), endSession: vi.fn(async () => undefined) };
    (events as any).db = { startSession: vi.fn(async () => session) };
    (events as any).findOneAndUpdate = vi.fn((query: Record<string, any>, update: Record<string, any>) => ({ exec: async () => {
      const event = docs.find((row) => String(row._id) === String(query._id) && row.status === query.status);
      if (!event) return null;
      Object.assign(event, update.$set);
      return event;
    } }));
    await expect(service.reviewDeposit(String(docs[0]._id), 'reject', 'Provider evidence does not match.', { id: 'admin-1', email: 'admin@example.com' })).resolves.toMatchObject({ status: 'rejected' });
    expect(audit.create).toHaveBeenCalledWith([expect.objectContaining({ action: 'deposit.review.reject', actorId: 'admin-1' })], { session });
  });

  it.each(['pending', 'confirmed', 'failed', 'expired', 'invalid', 'unexpected'])('admin retry queues a %s provider event for reconciliation', async (providerStatus) => {
    const { service, docs, events, audit } = setup();
    await service.acceptWebhook({ ...validPayload, status: providerStatus, chain: 'wrong-network' });
    const event = docs[0];
    expect(event.status).toBe('review_required');
    const session = { withTransaction: async (callback: () => Promise<void>) => callback(), endSession: vi.fn(async () => undefined) };
    (events as any).db = { startSession: vi.fn(async () => session) };
    (events as any).findOneAndUpdate = vi.fn((query: Record<string, any>, update: Record<string, any>) => ({ exec: async () => {
      if (query.status === 'review_required' && event.status === 'review_required') {
        Object.assign(event, update.$set);
        return event;
      }
      const retryEligible = event.retryRequested === true && event.status === 'pending';
      if (retryEligible) {
        Object.assign(event, update.$set);
        event.reconciliationAttempts += Number(update.$inc?.reconciliationAttempts ?? 0);
        return event;
      }
      return null;
    } }));
    await expect(service.reviewDeposit(String(event._id), 'retry_verification', 'Inspect again.', { id: 'admin-1', email: 'admin@example.com' })).resolves.toMatchObject({ status: 'pending' });
    expect(event.retryRequested).toBe(true);
    expect(audit.create).toHaveBeenCalledWith([expect.objectContaining({ action: 'deposit.review.retry_verification' })], { session });
    await expect(service.reconcile(String(event._id))).resolves.toMatchObject({ reconciled: true, credited: true });
    expect(event.status).toBe('verified_pending_credit');
  });
});
