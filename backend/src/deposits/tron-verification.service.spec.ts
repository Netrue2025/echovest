import { afterEach, describe, expect, it, vi } from 'vitest';
import { tronAddressToHex } from '../providers/chainpay/chainpay.service.js';
import { TronVerificationService } from './tron-verification.service.js';
import { TRON_MAINNET_USDT_CONTRACT, TRON_MAINNET_NETWORK, TRONGRID_MAINNET_API_URL } from './tron-network.js';

const hash = 'a'.repeat(64);
const recipient = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';
const token = TRON_MAINNET_USDT_CONTRACT;
const signature = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topicAddress = (address: string) => `0x${address.padStart(64, '0')}`;
const service = (minimum = '19') => new TronVerificationService({ get: (key: string) => ({ TRON_MIN_CONFIRMATIONS: minimum, TRON_NETWORK: TRON_MAINNET_NETWORK, TRON_API_URL: TRONGRID_MAINNET_API_URL, TRONGRID_API_KEY: 'unit-test-key' })[key] } as never);

function mockChain(overrides: { id?: string; execution?: string; blockNumber?: number; head?: number; contract?: string; to?: string; data?: string } = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/walletsolidity/gettransactioninfobyid')) return new Response(JSON.stringify({
      id: overrides.id ?? hash,
      blockNumber: overrides.blockNumber ?? 100,
      receipt: { result: overrides.execution ?? 'SUCCESS' },
      log: [{
        address: overrides.contract ?? tronAddressToHex(token),
        topics: [`0x${signature}`, topicAddress('b'.repeat(40)), topicAddress(overrides.to ?? tronAddressToHex(recipient)!)],
        data: overrides.data ?? `0x${(1234567n).toString(16).padStart(64, '0')}`,
      }],
    }), { status: 200 });
    return new Response(JSON.stringify({ block_header: { raw_data: { number: overrides.head ?? 118 } } }), { status: 200 });
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('TronVerificationService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('verifies a successful USDT TRC20 transfer in the solidified chain', async () => {
    const fetch = mockChain();
    await expect(service().verifyTransfer({ transactionHash: hash, expectedRecipient: recipient, expectedTokenContract: token })).resolves.toMatchObject({
      transactionHash: hash, recipientAddress: recipient, tokenContract: token, amount: '1.234567', confirmations: 19, executionStatus: 'SUCCESS',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed or mismatched transaction hash', async () => {
    const fetch = mockChain();
    await expect(service().verifyTransfer({ transactionHash: 'bad', expectedRecipient: recipient, expectedTokenContract: token })).rejects.toThrow(/invalid_transaction_hash/);
    await expect(service().verifyTransfer({ transactionHash: 'b'.repeat(64), expectedRecipient: recipient, expectedTokenContract: token })).rejects.toThrow(/transaction_hash_not_verified/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects a wrong token contract and wrong recipient', async () => {
    mockChain();
    await expect(service().verifyTransfer({ transactionHash: hash, expectedRecipient: recipient, expectedTokenContract: recipient })).rejects.toThrow(/untrusted_usdt_contract/);
    mockChain({ to: tronAddressToHex(recipient) });
    await expect(service().verifyTransfer({ transactionHash: hash, expectedRecipient: token, expectedTokenContract: token })).rejects.toThrow(/matching_usdt_transfer_not_found/);
  });

  it('rejects failed execution and insufficient confirmations', async () => {
    mockChain({ execution: 'REVERT' });
    await expect(service().verifyTransfer({ transactionHash: hash, expectedRecipient: recipient, expectedTokenContract: token })).rejects.toThrow(/transaction_execution_failed/);
    mockChain({ head: 117 });
    await expect(service().verifyTransfer({ transactionHash: hash, expectedRecipient: recipient, expectedTokenContract: token })).rejects.toThrow(/insufficient_confirmations/);
  });

  it('fails closed when the TRON API is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })));
    await expect(service().verifyTransfer({ transactionHash: hash, expectedRecipient: recipient, expectedTokenContract: token })).rejects.toThrow(/tron_api_http_503/);
  });
});
