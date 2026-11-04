import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { timingSafeEqual } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { DepositAccount } from '../deposit-accounts/deposit-account.schema.js';
import { User } from '../users/user.schema.js';
import { AdminAudit } from '../admin/admin-audit.schema.js';
import { DepositCreditService } from './deposit-credit.service.js';
import { ProviderDeposit } from './provider-deposit.schema.js';
import { TronVerificationService } from './tron-verification.service.js';
import { usdtToMicros } from './deposit-amount.js';
import { isOfficialTronMainnetUsdtContract } from './tron-network.js';
import { NotificationsService } from '../notifications/notifications.service.js';

type ChainPayEvent = Record<string, unknown>;
type AdminActor = { id: string; email: string };
const txHashPattern = /^[a-f0-9]{64}$/i;

function constantTimeMatch(actual: string, expected: string) {
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}
function collectRecords(value: unknown, result: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) { for (const item of value) collectRecords(item, result); return result; }
  if (value && typeof value === 'object') { const row = value as Record<string, unknown>; result.push(row); for (const nested of Object.values(row)) collectRecords(nested, result); }
  return result;
}
function firstString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (typeof row[key] === 'string' && (row[key] as string).trim()) return (row[key] as string).trim();
  return '';
}
function safeEvent(payload: ChainPayEvent) {
  return {
    status: payload.status, externalReference: payload.externalReference, chain: payload.chain,
    tokenSymbol: payload.tokenSymbol, tokenAddress: payload.tokenAddress, isNative: payload.isNative,
    amount: payload.amount, txHash: payload.txHash, recipientAddress: payload.recipientAddress ?? payload.address,
    fee: payload.fee, valueForwarded: payload.valueForwarded, txidOut: payload.txidOut,
  };
}

@Injectable()
export class DepositsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositsService.name);
  private retryTimer?: ReturnType<typeof setInterval>;
  constructor(
    @InjectModel(DepositAccount.name) private readonly accounts: Model<DepositAccount>,
    @InjectModel(ProviderDeposit.name) private readonly events: Model<ProviderDeposit>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(AdminAudit.name) private readonly audit: Model<AdminAudit>,
    private readonly config: ConfigService,
    private readonly tron: TronVerificationService,
    private readonly credits: DepositCreditService,
    private readonly notifications: NotificationsService,
  ) {}

  private isLiveChainPayEnabled() {
    return this.config.get<string>('DEPOSIT_PROVIDER_MODE') === 'chainpay'
      && this.config.get<string>('CHAINPAY_LIVE_DEPOSITS_ENABLED') === 'true';
  }

  validSecret(candidate: unknown) {
    const expected = this.config.get<string>('CHAINPAY_WEBHOOK_SECRET') ?? '';
    return Boolean(expected && typeof candidate === 'string' && constantTimeMatch(candidate, expected));
  }

  onModuleInit() {
    // Do not query providers or mutate reconciliation records in mock/disabled mode.
    if (!this.isLiveChainPayEnabled()) return;
    this.retryTimer = setInterval(() => { void this.reconcilePending().catch(() => this.logger.error('Deposit reconciliation worker could not load its queue.')); }, 15_000);
    this.retryTimer.unref?.();
    void this.reconcilePending().catch(() => this.logger.error('Deposit reconciliation worker could not load its queue.'));
  }

  onModuleDestroy() { if (this.retryTimer) clearInterval(this.retryTimer); }

  private async reconcilePending() {
    if (!this.isLiveChainPayEnabled()) return;
    const staleBefore = new Date(Date.now() - 60_000);
    await this.events.updateMany({ status: 'reconciling', updatedAt: { $lt: staleBefore } }, { $set: { status: 'review_required', reason: 'Worker restarted while reconciliation was running; administrator review required.' } }).exec();
    const work = await this.events.find({ status: 'pending', nextAttemptAt: { $lte: new Date() }, $or: [{ providerStatus: 'confirmed' }, { retryRequested: true }] }).select('_id').limit(25).lean().exec();
    for (const item of work) await this.reconcile(String(item._id));
  }

  async acceptWebhook(payload: ChainPayEvent) {
    if (!this.isLiveChainPayEnabled()) return { accepted: false, reason: 'live_deposits_disabled' };
    const txHash = typeof payload.txHash === 'string' ? payload.txHash.trim() : '';
    const externalReference = typeof payload.externalReference === 'string' ? payload.externalReference.trim() : '';
    const amount = typeof payload.amount === 'string' ? payload.amount.trim() : '';
    const account = await this.accounts.findOne({ provider: 'chainpay', externalReference, accountStatus: 'active' }).exec();
    if (!account) return { accepted: false, reason: 'unknown_deposit_reference' };
    const differences: string[] = [];
    try { if (usdtToMicros(amount) <= 0n) differences.push('invalid_amount'); } catch { differences.push('invalid_amount'); }
    if (!txHashPattern.test(txHash)) differences.push('invalid_transaction_hash');
    const expectedContract = this.config.get<string>('TRON_USDT_CONTRACT')?.trim() ?? '';
    if (!isOfficialTronMainnetUsdtContract(expectedContract)) differences.push('untrusted_configured_usdt_contract');
    if (String(payload.chain ?? '').toLowerCase() !== 'tron') differences.push('provider_network_mismatch');
    if (String(payload.tokenSymbol ?? '').toUpperCase() !== 'USDT' || payload.isNative !== false) differences.push('provider_asset_mismatch');
    if (!expectedContract || payload.tokenAddress !== expectedContract) differences.push('provider_contract_mismatch');
    const providerStatus = String(payload.status ?? '').toLowerCase();
    if (!['pending', 'confirmed'].includes(providerStatus)) differences.push('unexpected_provider_status');
    if (differences.length && !txHashPattern.test(txHash)) return { accepted: false, reason: 'invalid_transaction_or_amount' };
    const status = differences.length ? 'review_required' : 'pending';
    const summary = safeEvent(payload);
    try {
      const event = await this.events.create({
        providerTransactionId: txHash.toLowerCase(), providerStatus: providerStatus || 'invalid', userId: account.userId,
        depositAccountId: account._id, externalReference, amount: Types.Decimal128.fromString(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(amount) ? amount : '0'),
        status, rawEvent: summary, reconciliationDifferences: differences,
        reason: differences.length ? 'Webhook fields are incomplete or inconsistent; no credit was issued.' : providerStatus === 'pending' ? 'Provider reports pending; no credit was issued.' : 'Awaiting provider and independent TRON verification.',
      });
      if (providerStatus === 'confirmed') void this.notifications.notifyAdmins('Deposit waiting for confirmation checks', 'ChainPay reported a deposit. Independent verification is in progress.', '/admin?section=deposits').catch(() => undefined);
      if (providerStatus === 'confirmed' && !differences.length) {
        // Begin provider and on-chain reconciliation immediately on the confirmed webhook.
        // The scheduled worker remains as a recovery path if this request or process is interrupted.
        const result = await this.reconcile(String(event._id));
        return { accepted: true, duplicate: false, status: result.credited ? 'credited' : result.reviewRequired ? 'review_required' : 'pending' };
      }
      return { accepted: true, duplicate: false, status };
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
        await this.events.updateOne({ providerTransactionId: txHash.toLowerCase(), providerStatus: providerStatus || 'invalid' }, { $inc: { deliveries: 1 } }).exec();
        return { accepted: true, duplicate: true };
      }
      throw error;
    }
  }

  private async readChainPay(path: string) {
    const apiKey = this.config.get<string>('CHAINPAY_API_KEY')?.trim();
    const response = await fetch(`https://api.chainpay.site${path}`, {
      headers: { accept: 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) },
      redirect: 'error', signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`chainpay_api_http_${response.status}`);
    return response.json() as Promise<unknown>;
  }

  private async flagForReview(id: string, reason: string, differences: string[], provider?: Record<string, unknown>, blockchain?: Record<string, unknown>) {
    await this.events.updateOne({ _id: id, status: 'reconciling' }, { $set: {
      status: 'review_required', reason, reconciliationDifferences: [...new Set(differences)],
      ...(provider ? { providerVerification: provider } : {}), ...(blockchain ? { blockchainVerification: blockchain } : {}),
    } }).exec();
  }

  async reconcile(id: string) {
    if (!this.isLiveChainPayEnabled()) return { reconciled: false, reason: 'live_deposits_disabled' };
    const event = await this.events.findOneAndUpdate(
      { _id: id, status: { $in: ['pending', 'reconciliation_failed'] }, $or: [{ providerStatus: 'confirmed' }, { retryRequested: true }] },
      { $set: { status: 'reconciling', retryRequested: false }, $inc: { reconciliationAttempts: 1 } }, { new: true },
    ).exec();
    if (!event) return { reconciled: false, reason: 'event_not_eligible' };
    const account = await this.accounts.findById(event.depositAccountId).exec();
    if (!account?.providerAddressId || !account.depositAddress) {
      await this.flagForReview(id, 'Deposit account provider metadata is incomplete.', ['deposit_account_metadata_missing']);
      return { reconciled: false, reviewRequired: true };
    }
    try {
      const [statusData, transactionsData] = await Promise.all([
        this.readChainPay(`/deposit-address/${encodeURIComponent(account.providerAddressId)}/status`),
        this.readChainPay(`/deposit-address/${encodeURIComponent(account.providerAddressId)}/transactions`),
      ]);
      const records = [...collectRecords(statusData), ...collectRecords(transactionsData)];
      const row = records.find((record) => firstString(record, ['txHash', 'transactionHash', 'txid']).toLowerCase() === event.providerTransactionId.toLowerCase());
      if (!row) {
        await this.flagForReview(id, 'ChainPay transaction could not be matched to its status and transaction records.', ['provider_transaction_missing']);
        return { reconciled: false, reviewRequired: true };
      }
      const provider = {
        transactionHash: firstString(row, ['txHash', 'transactionHash', 'txid']),
        status: firstString(row, ['status']).toLowerCase(),
        externalReference: firstString(row, ['externalReference']),
        chain: firstString(row, ['chain', 'network']).toLowerCase(),
        tokenSymbol: firstString(row, ['tokenSymbol', 'asset']).toUpperCase(),
        tokenAddress: firstString(row, ['tokenAddress', 'contractAddress']),
        recipientAddress: firstString(row, ['depositAddress', 'recipientAddress', 'recipient', 'toAddress', 'address']),
        amount: firstString(row, ['amount']),
      };
      const differences: string[] = [];
      const expectedContract = this.config.get<string>('TRON_USDT_CONTRACT')?.trim() ?? '';
      if (!isOfficialTronMainnetUsdtContract(expectedContract)) differences.push('untrusted_configured_usdt_contract');
      if (provider.transactionHash.toLowerCase() !== event.providerTransactionId.toLowerCase()) differences.push('provider_transaction_hash_mismatch');
      if (!['confirmed', 'swept'].includes(provider.status)) differences.push('provider_status_not_confirmed');
      if (provider.externalReference !== event.externalReference) differences.push('provider_reference_mismatch');
      if (provider.chain !== 'tron') differences.push('provider_network_mismatch');
      if (provider.tokenSymbol !== 'USDT') differences.push('provider_asset_mismatch');
      if (provider.tokenAddress !== expectedContract) differences.push('provider_contract_mismatch');
      if (provider.recipientAddress !== account.depositAddress) differences.push('provider_recipient_mismatch');
      try { if (usdtToMicros(provider.amount) !== usdtToMicros(String(event.amount))) differences.push('webhook_provider_amount_mismatch'); } catch { differences.push('provider_amount_unavailable'); }
      if (differences.length) {
        await this.flagForReview(id, 'ChainPay transaction fields are incomplete or inconsistent.', differences, provider);
        return { reconciled: false, reviewRequired: true, differences };
      }

      const transfer = await this.tron.verifyTransfer({ transactionHash: event.providerTransactionId, expectedRecipient: account.depositAddress, expectedTokenContract: expectedContract });
      if (usdtToMicros(transfer.amount) !== usdtToMicros(String(event.amount)) || usdtToMicros(transfer.amount) !== usdtToMicros(provider.amount)) differences.push('blockchain_amount_mismatch');
      if (transfer.recipientAddress !== account.depositAddress) differences.push('blockchain_recipient_mismatch');
      if (transfer.tokenContract !== expectedContract) differences.push('blockchain_contract_mismatch');
      const blockchain = { ...transfer };
      if (differences.length) {
        await this.flagForReview(id, 'Provider and independently verified TRON data differ.', differences, provider, blockchain);
        return { reconciled: false, reviewRequired: true, differences };
      }
      const updated = await this.events.updateOne({ _id: id, status: 'reconciling' }, { $set: {
        status: 'verified_pending_credit', providerVerification: provider, blockchainVerification: blockchain,
        transferIndex: transfer.transferIndex, reason: 'Provider and solidified TRON transfer match; committing the auditable deposit ledger credit.',
      } }).exec();
      if (!updated.matchedCount) return { reconciled: false, reason: 'event_state_changed' };
      let credit: { credited: boolean; duplicate?: boolean };
      try { credit = await this.credits.creditVerifiedDeposit(id); }
      catch {
        await this.events.updateOne({ _id: id, status: 'verified_pending_credit' }, { $set: { status: 'review_required', reason: 'The MongoDB credit transaction could not be committed; no balance was credited.', reconciliationDifferences: ['ledger_transaction_failed'] } }).exec();
        return { reconciled: false, reviewRequired: true, reason: 'ledger_transaction_failed' };
      }
      if (!credit.credited) {
        await this.events.updateOne({ _id: id, status: 'verified_pending_credit' }, { $set: {
          status: 'review_required', reason: 'A matching ledger reference already exists; administrator review required.', reconciliationDifferences: ['duplicate_transaction_credit'],
        } }).exec();
        return { reconciled: false, reviewRequired: true, duplicate: true };
      }
      return { reconciled: true, credited: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'verification_unavailable';
      await this.flagForReview(id, 'Provider or TRON verification was unavailable or failed; no balance was credited.', [reason]);
      this.logger.warn('Deposit could not be fully reconciled; administrator review is required.');
      return { reconciled: false, reviewRequired: true, reason };
    }
  }

  async listReviewQueue() {
    const events = await this.events.find({ status: 'review_required' }).sort({ createdAt: -1 }).limit(200).lean().exec();
    const ids = [...new Set(events.map((event) => String(event.userId)))].map((id) => new Types.ObjectId(id));
    const users = await this.users.find({ _id: { $in: ids } }).select('fullName email').lean().exec();
    const userById = new Map(users.map((user) => [String(user._id), { fullName: user.fullName, email: user.email }]));
    return events.map((event) => ({
      id: String(event._id), user: userById.get(String(event.userId)) ?? null,
      transactionHash: event.providerTransactionId, amount: String(event.amount), asset: 'USDT', network: 'TRON',
      providerStatus: event.providerStatus, status: event.status, reason: event.reason,
      chainPay: event.providerVerification ?? null, blockchain: event.blockchainVerification ?? null,
      differences: event.reconciliationDifferences ?? [], deliveries: event.deliveries,
      createdAt: event.createdAt, reviewedBy: event.reviewedBy, reviewDecision: event.reviewDecision, reviewReason: event.reviewReason,
    }));
  }

  async listAdminHistory(includeArchived = false) {
    const events = await this.events.find({ ...(includeArchived ? { archivedAt: { $exists: true } } : { archivedAt: { $exists: false } }) }).sort({ createdAt: -1 }).limit(500).lean().exec();
    const ids = [...new Set(events.map((event) => String(event.userId)))].map((id) => new Types.ObjectId(id));
    const users = await this.users.find({ _id: { $in: ids } }).select('fullName email').lean().exec();
    const userById = new Map(users.map((user) => [String(user._id), { fullName: user.fullName, email: user.email }]));
    return events.map((event) => ({
      id: String(event._id), user: userById.get(String(event.userId)) ?? null,
      transactionHash: event.providerTransactionId, amount: String(event.amount), asset: 'USDT', network: 'TRON',
      providerStatus: event.providerStatus, status: event.status, reason: event.reason,
      differences: event.reconciliationDifferences ?? [], createdAt: event.createdAt,
      archivedAt: event.archivedAt, archiveReason: event.archiveReason,
    }));
  }

  async archiveHistoryRecord(id: string, reason: string, actor: AdminActor) {
    const session = await this.events.db.startSession();
    let changed = false;
    try {
      await session.withTransaction(async () => {
        const event = await this.events.findOneAndUpdate(
          { _id: id, status: { $in: ['credited', 'rejected'] }, archivedAt: { $exists: false } },
          { $set: { archivedAt: new Date(), archivedBy: actor.id, archiveReason: reason.trim() } },
          { new: true, session },
        ).lean().exec();
        if (!event) return;
        await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: 'deposit.history_archived', targetType: 'provider_deposit', targetId: id, targetLabel: event.providerTransactionId, detail: reason.trim() }], { session });
        changed = true;
      });
    } finally { await session.endSession(); }
    if (!changed) throw new ConflictException('Only credited or rejected deposits can be archived. Refresh the history and try again.');
    return { id, archived: true };
  }

  async archiveSelectedHistoryRecords(ids: string[], reason: string, actor: AdminActor) {
    const objectIds = ids.map((id) => new Types.ObjectId(id));
    const session = await this.events.db.startSession();
    let count = 0;
    try {
      await session.withTransaction(async () => {
        const result = await this.events.updateMany(
          { _id: { $in: objectIds }, status: { $in: ['credited', 'rejected'] }, archivedAt: { $exists: false } },
          { $set: { archivedAt: new Date(), archivedBy: actor.id, archiveReason: reason.trim() } },
          { session },
        ).exec();
        count = result.modifiedCount;
        if (count) await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: 'deposit.history_selected_archived', targetType: 'provider_deposit_history', targetId: 'selected', targetLabel: 'Selected deposit history', detail: `${count} credited/rejected deposit record(s) hidden from normal history views. ${reason.trim()}` }], { session });
      });
    } finally { await session.endSession(); }
    return { archivedCount: count };
  }

  async permanentlyDeleteSelectedHistoryRecords(ids: string[], reason: string, actor: AdminActor) {
    const session = await this.events.db.startSession();
    let count = 0;
    try {
      await session.withTransaction(async () => {
        const records = await this.events.find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) }, status: { $in: ['credited', 'rejected'] } }).select('_id providerTransactionId amount').session(session).lean().exec();
        if (!records.length) return;
        const result = await this.events.deleteMany({ _id: { $in: records.map((item) => item._id) }, status: { $in: ['credited', 'rejected'] } }, { session }).exec();
        count = result.deletedCount;
        if (count) await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: 'deposit.history_permanently_deleted', targetType: 'provider_deposit_history', targetId: 'selected', targetLabel: 'Selected ChainPay deposit history', detail: `${count} resolved provider record(s) permanently deleted. Reason: ${reason.trim()}. Transaction hashes: ${records.map((item) => item.providerTransactionId).join(', ')}.` }], { session });
      });
    } finally { await session.endSession(); }
    return { deletedCount: count };
  }

  async restoreHistoryRecord(id: string, actor: AdminActor) {
    const session = await this.events.db.startSession();
    let changed = false;
    try {
      await session.withTransaction(async () => {
        const event = await this.events.findOneAndUpdate(
          { _id: id, status: { $in: ['credited', 'rejected'] }, archivedAt: { $exists: true } },
          { $unset: { archivedAt: 1, archivedBy: 1, archiveReason: 1 } },
          { new: true, session },
        ).lean().exec();
        if (!event) return;
        await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: 'deposit.history_restored', targetType: 'provider_deposit', targetId: id, targetLabel: event.providerTransactionId, detail: 'Archived deposit history restored.' }], { session });
        changed = true;
      });
    } finally { await session.endSession(); }
    if (!changed) throw new NotFoundException('Archived deposit history was not found.');
    return { id, restored: true };
  }

  async archiveResolvedDepositHistory(reason: string, actor: AdminActor) {
    const session = await this.events.db.startSession();
    let count = 0;
    try {
      await session.withTransaction(async () => {
        const result = await this.events.updateMany(
          { status: { $in: ['credited', 'rejected'] }, archivedAt: { $exists: false } },
          { $set: { archivedAt: new Date(), archivedBy: actor.id, archiveReason: reason.trim() } },
          { session },
        ).exec();
        count = result.modifiedCount;
        if (count) await this.audit.create([{ actorId: actor.id, actorEmail: actor.email, action: 'deposit.history_cleared', targetType: 'provider_deposit_history', targetId: 'all_resolved', targetLabel: 'Resolved deposit history', detail: `${count} credited/rejected deposit record(s) hidden from normal history views. ${reason.trim()}` }], { session });
      });
    } finally { await session.endSession(); }
    return { archivedCount: count };
  }

  async reviewDeposit(id: string, action: 'reject' | 'retry_verification', reason: string, actor: AdminActor) {
    const event = await this.events.findOne({ _id: id, status: 'review_required' }).exec();
    if (!event) throw new NotFoundException('Deposit review item not found.');
    const update = action === 'reject'
      ? { status: 'rejected', reviewedBy: actor.id, reviewDecision: action, reviewReason: reason.trim(), reason: `Rejected by admin: ${reason.trim()}` }
      : { status: 'pending', retryRequested: true, nextAttemptAt: new Date(), reviewedBy: actor.id, reviewDecision: action, reviewReason: reason.trim(), reason: `Reverification requested by admin: ${reason.trim()}` };
    const session = await this.events.db.startSession();
    let changed = false;
    try {
      await session.withTransaction(async () => {
        const result = await this.events.findOneAndUpdate({ _id: event._id, status: 'review_required' }, { $set: update }, { new: true, session }).exec();
        if (!result) return;
        await this.audit.create([{
          actorId: actor.id, actorEmail: actor.email, action: `deposit.review.${action}`, targetType: 'deposit', targetId: id,
          targetLabel: event.providerTransactionId,
          detail: `${reason.trim()} Differences: ${(event.reconciliationDifferences ?? []).join(', ') || 'none'}.`,
        }], { session });
        changed = true;
      }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    } finally { await session.endSession(); }
    if (!changed) throw new ForbiddenException('This deposit changed while it was being reviewed. Refresh the queue.');
    return { id, status: action === 'reject' ? 'rejected' : 'pending', action };
  }
}
