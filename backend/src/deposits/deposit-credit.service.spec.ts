import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { DepositCreditService } from './deposit-credit.service.js';

function setup() {
  const event = {
    _id: new Types.ObjectId(), userId: new Types.ObjectId(), providerTransactionId: 'a'.repeat(64),
    amount: Types.Decimal128.fromString('25.123456'), transferIndex: 0, status: 'verified_pending_credit',
  };
  const ledgerRows: Array<Record<string, any>> = [];
  let micros = 0n;
  let userTradingBalance = 0;
  const userUpdates: Array<Record<string, any>> = [];
  const session = { withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()), endSession: vi.fn(async () => undefined) };
  const connection = { startSession: vi.fn(async () => session) };
  const deposits = {
    findOneAndUpdate: vi.fn((_query: Record<string, any>, update: Record<string, any>) => ({ exec: async () => {
      if (event.status !== 'verified_pending_credit') return null;
      Object.assign(event, update.$set);
      return event;
    } })),
    updateOne: vi.fn((_query: Record<string, any>, update: Record<string, any>) => ({ exec: async () => { Object.assign(event, update.$set); return { matchedCount: 1 }; } })),
  };
  const balances = {
    findOneAndUpdate: vi.fn(() => ({ exec: async () => ({}) })),
    updateOne: vi.fn((_query: unknown, update: Record<string, any>) => ({ exec: async () => {
      const [whole, fraction = ''] = String(update.$inc.availableBalance).split('.');
      micros += BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
      return { matchedCount: 1 };
    } })),
  };
  const ledger = {
    create: vi.fn(async (rows: Array<Record<string, any>>) => {
      if (ledgerRows.some((row) => row.transactionHash === rows[0].transactionHash)) throw Object.assign(new Error('duplicate transaction'), { code: 11000 });
      ledgerRows.push(...rows);
      return rows;
    }),
  };
  const users = { updateOne: vi.fn((_query: unknown, update: Record<string, any>) => ({ exec: async () => {
    userUpdates.push(update);
    userTradingBalance += update.$inc.tradingBalance;
    return { matchedCount: 1 };
  } })) };
  const settings = { findOne: vi.fn(() => ({ session() { return this; }, lean() { return this; }, exec: async () => ({ capitalLockDays: 30 }) })) };
  return { service: new DepositCreditService(connection as never, deposits as never, balances as never, ledger as never, users as never, settings as never), event, ledgerRows, session, deposits, balances, ledger, users, settings, userUpdates, userTradingBalance: () => userTradingBalance, micros: () => micros };
}

describe('DepositCreditService', () => {
  it('atomically credits the Decimal128 ledger, deposit account, and dashboard investment balance with a capital lock', async () => {
    const fixture = setup();
    await expect(fixture.service.creditVerifiedDeposit(String(fixture.event._id))).resolves.toEqual({ credited: true });
    expect(fixture.ledgerRows[0]).toMatchObject({
      amount: Types.Decimal128.fromString('25.123456'), source: 'chainpay', transactionHash: 'a'.repeat(64),
      reference: `chainpay:${'a'.repeat(64)}:0`, status: 'confirmed',
    });
    expect(fixture.micros()).toBe(25_123_456n);
    expect(fixture.userTradingBalance()).toBe(25.123456);
    expect(fixture.userUpdates[0].$push.lockedCapitalLots).toMatchObject({ amount: 25.123456 });
    expect(fixture.userUpdates[0].$push.lockedCapitalLots.unlockAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
    expect(fixture.event.status).toBe('credited');
    expect(fixture.session.withTransaction).toHaveBeenCalledOnce();
  });

  it('does not credit the same event twice', async () => {
    const fixture = setup();
    await fixture.service.creditVerifiedDeposit(String(fixture.event._id));
    await expect(fixture.service.creditVerifiedDeposit(String(fixture.event._id))).resolves.toEqual({ credited: false });
    expect(fixture.ledgerRows).toHaveLength(1);
    expect(fixture.micros()).toBe(25_123_456n);
    expect(fixture.balances.updateOne).toHaveBeenCalledOnce();
    expect(fixture.users.updateOne).toHaveBeenCalledOnce();
    expect(fixture.userTradingBalance()).toBe(25.123456);
  });

  it('blocks a second deposit event with the same transaction hash', async () => {
    const fixture = setup();
    await fixture.service.creditVerifiedDeposit(String(fixture.event._id));
    fixture.event._id = new Types.ObjectId();
    fixture.event.status = 'verified_pending_credit';
    await expect(fixture.service.creditVerifiedDeposit(String(fixture.event._id))).resolves.toEqual({ credited: false, duplicate: true });
    expect(fixture.ledgerRows).toHaveLength(1);
    expect(fixture.balances.updateOne).toHaveBeenCalledOnce();
    expect(fixture.users.updateOne).toHaveBeenCalledOnce();
  });
});
