import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';
import { DepositAccount } from '../deposit-accounts/deposit-account.schema.js';
import { LedgerEntry } from '../ledger/ledger-entry.schema.js';
import { ChainPayService } from '../providers/chainpay/chainpay.service.js';
import { ProviderDeposit } from '../deposits/provider-deposit.schema.js';
import { TestDepositAccount } from '../deposit-accounts/test-deposit-account.schema.js';

function toMicros(value: string) {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(value)) throw new BadRequestException('Enter a valid USDT amount with up to 6 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}
function fromMicros(value: bigint) { const whole = value / 1_000_000n; const fraction = String(value % 1_000_000n).padStart(6, '0').replace(/0+$/, ''); return fraction ? `${whole}.${fraction}` : String(whole); }

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(DepositAccount.name) private readonly accounts: Model<DepositAccount>,
    @InjectModel(TestDepositAccount.name) private readonly testAccounts: Model<TestDepositAccount>,
    @InjectModel(LedgerEntry.name) private readonly ledger: Model<LedgerEntry>,
    @InjectModel(ProviderDeposit.name) private readonly providerDeposits: Model<ProviderDeposit>,
    private readonly config: ConfigService,
    private readonly chainPay: ChainPayService,
  ) {}

  private mode() { return this.config.get<string>('DEPOSIT_PROVIDER_MODE') ?? 'disabled'; }
  private async testAccount(userId: string) {
    const filter = { userId: new Types.ObjectId(userId), asset: 'USDT', network: 'TRON' };
    let account = await this.testAccounts.findOne(filter).exec();
    if (!account) {
      const reference = `ev_${randomUUID()}`;
      try {
        account = await this.testAccounts.findOneAndUpdate(filter, { $setOnInsert: { ...filter, protocol: 'TRC20', externalReference: reference, depositAddress: `TEST-TRC20-${reference.slice(3, 15)}`, accountStatus: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
      } catch (error) {
        if (!(typeof error === 'object' && error && 'code' in error && error.code === 11000)) throw error;
        account = await this.testAccounts.findOne(filter).exec();
      }
    }
    if (!account) throw new ConflictException('Could not create a permanent TEST deposit account. Try again.');
    return account;
  }
  private async account(userId: string) {
    const mode = this.mode();
    if (!['mock', 'chainpay'].includes(mode)) throw new ForbiddenException('Deposits are disabled until a provider mode is configured.');
    if (mode === 'mock' && this.config.get<string>('NODE_ENV') !== 'development') throw new ForbiddenException('Mock deposits are available only in development.');
    if (mode === 'mock') return this.testAccount(userId);
    const filter = { userId: new Types.ObjectId(userId), asset: 'USDT', network: 'TRON' };
    let account = await this.accounts.findOne(filter).exec();
    if (account && account.provider !== mode) throw new ConflictException('This deposit account uses a different provider mode. Contact support.');
    if (!account) {
      const reference = `ev_${randomUUID()}`;
      try {
        account = await this.accounts.findOneAndUpdate(filter, { $setOnInsert: { ...filter, provider: mode, externalReference: reference, protocol: 'TRC20', depositAddress: mode === 'mock' ? `TEST-TRC20-${reference.slice(3, 15)}` : 'PENDING', accountStatus: mode === 'mock' ? 'active' : 'provisioning' } }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
      } catch (error) {
        if (!(typeof error === 'object' && error && 'code' in error && error.code === 11000)) throw error;
        account = await this.accounts.findOne(filter).exec();
      }
    }
    if (!account) throw new ConflictException('Could not create a permanent deposit account. Try again.');
    if (mode === 'chainpay' && account.accountStatus === 'provisioning') {
      const address = await this.chainPay.createDepositAddress(account.externalReference);
      account.providerAddressId = address.id;
      account.depositAddress = address.address;
      account.accountStatus = 'active';
      await account.save();
    }
    return account;
  }

  private async testBalance(userId: string) {
    const rows = await this.ledger.find({ userId: new Types.ObjectId(userId), status: 'confirmed', testOnly: true }).select('amount').lean().exec();
    return fromMicros(rows.reduce((sum, row) => sum + toMicros(String(row.amount)), 0n));
  }

  async depositDetails(userId: string) {
    if (this.mode() === 'chainpay' && this.config.get<string>('CHAINPAY_LIVE_DEPOSITS_ENABLED') !== 'true') {
      return { mode: 'chainpay' as const, testOnly: false, liveDepositsDisabled: true,
        account: { asset: 'USDT' as const, network: 'TRON' as const, protocol: 'TRC20' as const, address: '', externalReference: '', status: 'disabled' },
        testWallet: { asset: 'USDT' as const, network: 'TRON' as const, balance: '0', withdrawable: false as const }, history: [] };
    }
    const account = await this.account(userId);
    const mode = this.mode();
    const [testBalance, history, providerHistory] = await Promise.all([
      mode === 'mock' ? this.testBalance(userId) : Promise.resolve('0'),
      this.ledger.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(30).lean().exec(),
      this.providerDeposits.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).limit(30).lean().exec(),
    ]);
    return {
      mode: mode as 'mock' | 'chainpay', testOnly: mode === 'mock',
      liveDepositsDisabled: mode === 'chainpay' && this.config.get<string>('CHAINPAY_LIVE_DEPOSITS_ENABLED') !== 'true',
      account: { asset: account.asset, network: account.network, protocol: account.protocol, address: account.depositAddress, externalReference: account.externalReference, status: account.accountStatus, createdAt: account.createdAt },
      testWallet: { asset: 'USDT', network: 'TRON', balance: testBalance, withdrawable: false },
      history: mode === 'mock'
        ? history.map((entry) => ({ id: String(entry._id), amount: String(entry.amount), status: entry.status, description: entry.description, createdAt: entry.createdAt, testOnly: true }))
        : providerHistory.map((entry) => ({ id: String(entry._id), amount: String(entry.amount), status: entry.status, description: entry.reason, createdAt: entry.createdAt, testOnly: false })),
    };
  }

  async simulate(userId: string, input: { externalReference: string; status: 'pending' | 'confirmed' | 'failed' | 'invalid'; amount: string }) {
    if (this.config.get<string>('NODE_ENV') !== 'development' || this.mode() !== 'mock') throw new ForbiddenException('Mock deposit events are available only in development mock mode.');
    const amountMicros = toMicros(input.amount);
    if (amountMicros <= 0n) throw new BadRequestException('Deposit amount must be greater than zero.');
      const account = await this.testAccounts.findOne({ userId: new Types.ObjectId(userId), externalReference: input.externalReference }).exec();
    if (!account) throw new NotFoundException('Mock deposit account not found.');
    const status = input.status === 'invalid' ? 'rejected' : input.status;
    const reference = `mock:${account.externalReference}:${input.status}`;
    try {
      const entry = await this.ledger.create({ userId: new Types.ObjectId(userId), asset: 'USDT', network: 'TRON', entryType: 'deposit', amount: Types.Decimal128.fromString(input.amount), reference, status, description: input.status === 'invalid' ? 'TEST invalid event rejected' : `TEST simulated ${input.status} deposit`, testOnly: true });
      return { id: String(entry._id), status: entry.status, duplicate: false, testOnly: true, balance: await this.testBalance(userId) };
    } catch (error) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 11000) return { status, duplicate: true, testOnly: true, balance: await this.testBalance(userId) };
      throw error;
    }
  }
}
