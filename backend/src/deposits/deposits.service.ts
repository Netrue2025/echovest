import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { timingSafeEqual } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { DepositAccount } from '../deposit-accounts/deposit-account.schema.js';
import { ProviderDeposit } from './provider-deposit.schema.js';

type ChainPayEvent = Record<string, unknown>;
const txHashPattern = /^[a-f0-9]{64}$/i;
const amountPattern = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/;
function constantTimeMatch(actual: string, expected: string) {
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
function collectRecords(value: unknown, result: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) { for (const item of value) collectRecords(item, result); return result; }
  if (value && typeof value === 'object') { const row = value as Record<string, unknown>; result.push(row); for (const nested of Object.values(row)) collectRecords(nested, result); }
  return result;
}
function containsFieldValue(value: unknown, key: string, expected: string) {
  return collectRecords(value).some((row) => typeof row[key] === 'string' && (row[key] as string).toLowerCase() === expected.toLowerCase());
}

@Injectable()
export class DepositsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositsService.name);
  private retryTimer?: ReturnType<typeof setInterval>;
  constructor(@InjectModel(DepositAccount.name) private readonly accounts: Model<DepositAccount>, @InjectModel(ProviderDeposit.name) private readonly events: Model<ProviderDeposit>, private readonly config: ConfigService) {}

  validSecret(candidate: string | undefined) {
    const expected = this.config.get<string>('CHAINPAY_WEBHOOK_SECRET') ?? '';
    return Boolean(expected && candidate && constantTimeMatch(candidate, expected));
  }

  onModuleInit() {
    this.retryTimer = setInterval(() => { void this.reconcilePending().catch(() => this.logger.error('Deposit reconciliation worker could not load its queue.')); }, 15_000);
    this.retryTimer.unref?.();
    void this.reconcilePending().catch(() => this.logger.error('Deposit reconciliation worker could not load its queue.'));
  }

  onModuleDestroy() { if (this.retryTimer) clearInterval(this.retryTimer); }

  private async reconcilePending() {
    const staleBefore = new Date(Date.now() - 60_000);
    await this.events.updateMany({ status: 'reconciling', updatedAt: { $lt: staleBefore } }, { $set: { status: 'reconciliation_failed', nextAttemptAt: new Date(), reason: 'Worker restarted before reconciliation finished; retry queued.' } }).exec();
    const work = await this.events.find({ providerStatus: 'confirmed', status: { $in: ['pending', 'reconciliation_failed'] }, nextAttemptAt: { $lte: new Date() } }).select('_id').limit(25).lean().exec();
    for (const item of work) await this.reconcile(String(item._id));
  }

  async acceptWebhook(payload: ChainPayEvent) {
    const txHash = typeof payload.txHash === 'string' ? payload.txHash.trim() : '';
    const externalReference = typeof payload.externalReference === 'string' ? payload.externalReference.trim() : '';
    const amount = typeof payload.amount === 'string' ? payload.amount : '';
    const [whole = '', fraction = ''] = amount.split('.');
    if (!txHashPattern.test(txHash) || !amountPattern.test(amount) || (/^0+$/.test(whole) && /^0*$/.test(fraction))) return { accepted: false, reason: 'invalid_transaction_or_amount' };
    const account = await this.accounts.findOne({ provider: 'chainpay', externalReference, accountStatus: 'active' }).exec();
    if (!account) return { accepted: false, reason: 'unknown_deposit_reference' };
    const expectedContract = this.config.get<string>('TRON_USDT_CONTRACT')?.trim();
    const isExpectedAsset = String(payload.chain ?? '').toLowerCase() === 'tron'
      && String(payload.tokenSymbol ?? '').toUpperCase() === 'USDT'
      && payload.isNative === false
      && Boolean(expectedContract && payload.tokenAddress === expectedContract);
    const providerStatus = String(payload.status ?? '').toLowerCase();
    const shouldReconcile = isExpectedAsset && providerStatus === 'confirmed';
    const status = isExpectedAsset && ['pending', 'confirmed'].includes(providerStatus) ? 'pending' : 'rejected';
    const safeEvent = { status: payload.status, externalReference, chain: payload.chain, tokenSymbol: payload.tokenSymbol, tokenAddress: payload.tokenAddress, isNative: payload.isNative, amount, txHash, fee: payload.fee, valueForwarded: payload.valueForwarded, txidOut: payload.txidOut };
    try {
      const event = await this.events.create({ providerTransactionId: txHash, providerStatus: providerStatus || 'invalid', userId: account.userId, depositAccountId: account._id, externalReference, amount: Types.Decimal128.fromString(amount), status, rawEvent: safeEvent, reason: !isExpectedAsset ? 'Unsupported or malformed asset/network.' : providerStatus === 'pending' ? 'Provider reports pending; no balance was credited.' : 'Awaiting independent provider reconciliation.' });
      if (shouldReconcile) void this.reconcile(String(event._id)).catch(() => this.logger.warn('ChainPay event reconciliation did not complete; event remains uncredited.'));
      return { accepted: true, duplicate: false };
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
        await this.events.updateOne({ providerTransactionId: txHash, providerStatus: providerStatus || 'invalid' }, { $inc: { deliveries: 1 } }).exec();
        if (shouldReconcile) {
          const existing = await this.events.findOne({ providerTransactionId: txHash, providerStatus: 'confirmed', status: 'pending' }).select('_id').lean().exec();
          if (existing) void this.reconcile(String(existing._id)).catch(() => this.logger.warn('ChainPay event reconciliation did not complete; event remains uncredited.'));
        }
        return { accepted: true, duplicate: true };
      }
      throw error;
    }
  }

  private async readDocumentedApi(path: string) {
    const response = await fetch(`https://api.chainpay.site${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('provider_reconciliation_failed');
    return response.json() as Promise<unknown>;
  }

  private async reconcile(id: string) {
    const event = await this.events.findOneAndUpdate({ _id: id, providerStatus: 'confirmed', status: { $in: ['pending', 'reconciliation_failed'] }, nextAttemptAt: { $lte: new Date() } }, { $set: { status: 'reconciling' }, $inc: { reconciliationAttempts: 1 } }, { new: true }).exec();
    if (!event) return;
    const account = await this.accounts.findById(event.depositAccountId).exec();
    if (!account?.providerAddressId) {
      await this.events.updateOne({ _id: id, status: 'reconciling' }, { $set: { status: 'reconciliation_failed', nextAttemptAt: new Date(Date.now() + 60_000), reason: 'Deposit account metadata is incomplete; no balance was credited.' } }).exec();
      return;
    }
    try {
      const [statusData, transactionsData] = await Promise.all([
        this.readDocumentedApi(`/deposit-address/${encodeURIComponent(account.providerAddressId)}/status`),
        this.readDocumentedApi(`/deposit-address/${encodeURIComponent(account.providerAddressId)}/transactions`),
      ]);
      const txHash = event.providerTransactionId;
      const records = [...collectRecords(statusData), ...collectRecords(transactionsData)];
      const transaction = records.find((row) => typeof row.txHash === 'string' && row.txHash.toLowerCase() === txHash.toLowerCase());
      const providerConfirmed = transaction && typeof transaction.status === 'string' && ['confirmed', 'swept'].includes(transaction.status.toLowerCase());
      if (!transaction || !providerConfirmed) throw new Error('provider_transaction_unconfirmed');
      if (typeof transaction.externalReference === 'string' && transaction.externalReference !== event.externalReference) throw new Error('provider_reference_mismatch');
      if (typeof transaction.chain === 'string' && transaction.chain.toLowerCase() !== 'tron') throw new Error('provider_network_mismatch');
      if (typeof transaction.tokenSymbol === 'string' && transaction.tokenSymbol.toUpperCase() !== 'USDT') throw new Error('provider_asset_mismatch');
      const expectedContract = this.config.get<string>('TRON_USDT_CONTRACT')?.trim();
      if (typeof transaction.tokenAddress === 'string' && transaction.tokenAddress !== expectedContract) throw new Error('provider_contract_mismatch');
      // Prototype safety gate: reconciled real events are retained for audit, never credited to a user wallet.
      await this.events.updateOne({ _id: id, status: 'reconciling' }, { $set: { status: 'confirmed_uncredited', reason: 'Provider reconciliation passed. Prototype mode does not credit live balances.' } }).exec();
    } catch {
      const attempts = Number(event.reconciliationAttempts ?? 1);
      const retryMs = Math.min(60 * 60_000, 30_000 * 2 ** Math.min(7, Math.max(0, attempts - 1)));
      await this.events.updateOne({ _id: id, status: 'reconciling' }, { $set: { status: 'reconciliation_failed', nextAttemptAt: new Date(Date.now() + retryMs), reason: 'Provider status/transaction could not be independently verified; no balance was credited.' } }).exec();
      this.logger.warn('ChainPay event could not be independently reconciled; no balance was credited.');
    }
  }
}
