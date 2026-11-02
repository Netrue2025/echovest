import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isValidTronAddress, tronAddressToHex } from '../providers/chainpay/chainpay.service.js';

const transferTopic = 'ddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const hashPattern = /^[a-f0-9]{64}$/i;

export type VerifiedTronTransfer = {
  transactionHash: string;
  recipientAddress: string;
  tokenContract: string;
  amount: string;
  blockNumber: number;
  confirmations: number;
  transferIndex: number;
  executionStatus: string;
};

function amountFromMicros(micros: bigint) {
  const whole = micros / 1_000_000n;
  const fraction = String(micros % 1_000_000n).padStart(6, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : String(whole);
}

function hexAddress(value: unknown) {
  if (typeof value !== 'string') return '';
  const hex = value.replace(/^0x/i, '').toLowerCase();
  return hex.length >= 40 ? hex.slice(-40) : '';
}

@Injectable()
export class TronVerificationService {
  constructor(private readonly config: ConfigService) {}

  private async post(path: string, body: Record<string, string>) {
    const base = (this.config.get<string>('TRON_API_URL') || 'https://api.trongrid.io').replace(/\/$/, '');
    const url = new URL(`${base}${path}`);
    if (url.protocol !== 'https:') throw new Error('tron_api_must_use_https');
    const apiKey = this.config.get<string>('TRONGRID_API_KEY')?.trim();
    const response = await fetch(url, {
      method: 'POST', redirect: 'error',
      headers: { accept: 'application/json', 'content-type': 'application/json', ...(apiKey ? { 'TRON-PRO-API-KEY': apiKey } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`tron_api_http_${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  async verifyTransfer(input: { transactionHash: string; expectedRecipient: string; expectedTokenContract: string }): Promise<VerifiedTronTransfer> {
    const transactionHash = input.transactionHash.trim().toLowerCase();
    if (!hashPattern.test(transactionHash)) throw new Error('invalid_transaction_hash');
    const recipientHex = tronAddressToHex(input.expectedRecipient);
    const contractHex = tronAddressToHex(input.expectedTokenContract);
    if (!recipientHex || !contractHex) throw new Error('invalid_expected_tron_address');

    const [receipt, solidifiedHead] = await Promise.all([
      this.post('/walletsolidity/gettransactioninfobyid', { value: transactionHash }),
      this.post('/walletsolidity/getnowblock', {}),
    ]);
    const receiptId = typeof receipt.id === 'string' ? receipt.id.toLowerCase() : '';
    if (receiptId !== transactionHash) throw new Error('transaction_hash_not_verified');
    const execution = receipt.receipt && typeof receipt.receipt === 'object' ? receipt.receipt as Record<string, unknown> : {};
    if (String(execution.result ?? '').toUpperCase() !== 'SUCCESS') throw new Error('transaction_execution_failed');
    const blockNumber = Number(receipt.blockNumber);
    const head = solidifiedHead.block_header && typeof solidifiedHead.block_header === 'object'
      ? (solidifiedHead.block_header as Record<string, unknown>).raw_data as Record<string, unknown> | undefined
      : undefined;
    const solidifiedHeight = Number(head?.number);
    if (!Number.isSafeInteger(blockNumber) || blockNumber < 0 || !Number.isSafeInteger(solidifiedHeight) || solidifiedHeight < blockNumber) throw new Error('solidified_block_height_unavailable');
    const confirmations = solidifiedHeight - blockNumber + 1;
    const configuredMinimum = Number(this.config.get<string>('TRON_MIN_CONFIRMATIONS') || '19');
    const minConfirmations = Number.isSafeInteger(configuredMinimum) && configuredMinimum > 0 ? configuredMinimum : 19;
    if (confirmations < minConfirmations) throw new Error('insufficient_confirmations');

    const logs = Array.isArray(receipt.log) ? receipt.log as Array<Record<string, unknown>> : [];
    const matching = logs.flatMap((log, transferIndex) => {
      const topics = Array.isArray(log.topics) ? log.topics.map((topic) => String(topic).replace(/^0x/i, '').toLowerCase()) : [];
      const contract = hexAddress(log.address);
      if (contract !== contractHex || topics[0] !== transferTopic || hexAddress(topics[2]) !== recipientHex) return [];
      const data = typeof log.data === 'string' ? log.data.replace(/^0x/i, '') : '';
      if (!/^[a-f0-9]{64}$/i.test(data)) return [];
      const micros = BigInt(`0x${data}`);
      if (micros <= 0n) return [];
      return [{
        transactionHash, recipientAddress: input.expectedRecipient, tokenContract: input.expectedTokenContract,
        amount: amountFromMicros(micros), blockNumber, confirmations, transferIndex,
        executionStatus: String(execution.result),
      }];
    });
    if (matching.length !== 1) throw new Error(matching.length ? 'ambiguous_usdt_transfers' : 'matching_usdt_transfer_not_found');
    return matching[0];
  }
}
