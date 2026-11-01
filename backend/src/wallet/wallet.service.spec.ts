import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { WalletService } from './wallet.service.js';

const userId = new Types.ObjectId().toString();
function setup(mode = 'mock', nodeEnv = 'development') {
  let account: Record<string, unknown> | null = null;
  const entries: Array<Record<string, unknown>> = [];
  const createdReferences = new Set<string>();
  const accounts = {
    findOne: vi.fn((filter: { externalReference?: string }) => ({ exec: async () => account && (!filter.externalReference || account.externalReference === filter.externalReference) ? account : null })),
    findOneAndUpdate: vi.fn((_filter: unknown, update: { $setOnInsert: Record<string, unknown> }) => ({ exec: async () => {
      if (!account) account = { ...update.$setOnInsert, _id: new Types.ObjectId(), save: async function (this: Record<string, unknown>) { return this; } };
      return account;
    } })),
  };
  const ledger = {
    find: vi.fn((filter: { status?: string }) => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, lean() { return this; }, exec: async () => entries.filter((entry) => !filter.status || entry.status === filter.status) })),
    create: vi.fn(async (input: Record<string, unknown>) => {
      const reference = String(input.reference);
      if (createdReferences.has(reference)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      createdReferences.add(reference);
      const entry = { ...input, _id: new Types.ObjectId(), createdAt: new Date() };
      entries.push(entry);
      return entry;
    }),
  };
  const providerDeposits = { find: vi.fn(() => ({ sort() { return this; }, limit() { return this; }, lean() { return this; }, exec: async () => [] })) };
  const config = { get: (key: string) => key === 'DEPOSIT_PROVIDER_MODE' ? mode : key === 'NODE_ENV' ? nodeEnv : undefined };
  const chainPay = { createDepositAddress: vi.fn() };
  const service = new WalletService(accounts as never, ledger as never, providerDeposits as never, config as never, chainPay as never);
  return { service, accounts, ledger, chainPay, entries };
}

describe('WalletService deposit prototype', () => {
  it('creates a permanent TEST account once and retrieves it on later requests', async () => {
    const { service, accounts } = setup();
    const first = await service.depositDetails(userId);
    const second = await service.depositDetails(userId);
    expect(first.account.address).toMatch(/^TEST-TRC20-/);
    expect(first.account.externalReference).toBe(second.account.externalReference);
    expect(accounts.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('uses one account when first requests race', async () => {
    const { service, accounts } = setup();
    const [left, right] = await Promise.all([service.depositDetails(userId), service.depositDetails(userId)]);
    expect(left.account.externalReference).toBe(right.account.externalReference);
    expect(left.account.address).toBe(right.account.address);
    expect(accounts.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('keeps pending, failed, and invalid TEST deposits out of the TEST balance', async () => {
    const { service } = setup();
    const details = await service.depositDetails(userId);
    await service.simulate(userId, { externalReference: details.account.externalReference, status: 'pending', amount: '7.123456' });
    await service.simulate(userId, { externalReference: details.account.externalReference, status: 'failed', amount: '7.123456' });
    await service.simulate(userId, { externalReference: details.account.externalReference, status: 'invalid', amount: '7.123456' });
    expect((await service.depositDetails(userId)).testWallet.balance).toBe('0');
  });

  it('adds an exact six-decimal amount only after a confirmed TEST event', async () => {
    const { service } = setup();
    const details = await service.depositDetails(userId);
    await service.simulate(userId, { externalReference: details.account.externalReference, status: 'confirmed', amount: '7.123456' });
    const updated = await service.depositDetails(userId);
    expect(updated.testWallet.balance).toBe('7.123456');
    expect(updated.testWallet.withdrawable).toBe(false);
    expect(updated.testOnly).toBe(true);
  });

  it('makes duplicate confirmed TEST events idempotent', async () => {
    const { service } = setup();
    const details = await service.depositDetails(userId);
    const event = { externalReference: details.account.externalReference, status: 'confirmed' as const, amount: '10.000001' };
    expect((await service.simulate(userId, event)).duplicate).toBe(false);
    expect((await service.simulate(userId, event)).duplicate).toBe(true);
    expect((await service.depositDetails(userId)).testWallet.balance).toBe('10.000001');
  });

  it('rejects invalid amounts and references', async () => {
    const { service } = setup();
    const details = await service.depositDetails(userId);
    await expect(service.simulate(userId, { externalReference: details.account.externalReference, status: 'confirmed', amount: '0' })).rejects.toThrow();
    await expect(service.simulate(userId, { externalReference: 'ev_invalid', status: 'confirmed', amount: '1' })).rejects.toThrow();
    await expect(service.simulate(userId, { externalReference: details.account.externalReference, status: 'confirmed', amount: '1.0000001' })).rejects.toThrow();
  });

  it('blocks mock mode outside development and never falls back to mock mode', async () => {
    const production = setup('mock', 'production');
    await expect(production.service.depositDetails(userId)).rejects.toThrow(/development/);
    const disabled = setup('disabled', 'development');
    await expect(disabled.service.depositDetails(userId)).rejects.toThrow(/provider mode/);
    expect(disabled.chainPay.createDepositAddress).not.toHaveBeenCalled();
  });

  it('does not provision a live ChainPay address unless the explicit gate is enabled', async () => {
    const { service, chainPay } = setup('chainpay');
    const result = await service.depositDetails(userId);
    expect(result.liveDepositsDisabled).toBe(true);
    expect(result.account.address).toBe('');
    expect(chainPay.createDepositAddress).not.toHaveBeenCalled();
  });
});
