import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { isOfficialTronMainnetUsdtContract, TRON_MAINNET_NETWORK } from '../../deposits/tron-network.js';

export type ChainPayAddress = { id: string; address: string; ticker?: string; chain?: string; externalReference?: string };
const base58Alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function isValidTronAddress(address: string) {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return false;
  let number = 0n;
  for (const char of address) { const digit = base58Alphabet.indexOf(char); if (digit < 0) return false; number = number * 58n + BigInt(digit); }
  let hex = number.toString(16); if (hex.length % 2) hex = `0${hex}`;
  let decoded = Buffer.from(hex, 'hex');
  for (const char of address) { if (char !== '1') break; decoded = Buffer.concat([Buffer.from([0]), decoded]); }
  if (decoded.length !== 25 || decoded[0] !== 0x41) return false;
  const payload = decoded.subarray(0, 21);
  const checksum = createHash('sha256').update(createHash('sha256').update(payload).digest()).digest().subarray(0, 4);
  return checksum.equals(decoded.subarray(21));
}
export function tronAddressToHex(address: string) {
  if (!isValidTronAddress(address)) return undefined;
  let number = 0n;
  for (const char of address) number = number * 58n + BigInt(base58Alphabet.indexOf(char));
  let hex = number.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const decoded = Buffer.from(hex, 'hex');
  return decoded.subarray(1, 21).toString('hex').toLowerCase();
}
export function isPrivateCallbackHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  const version = isIP(host);
  if (version === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (version === 6) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe8') || host.startsWith('fe9') || host.startsWith('fea') || host.startsWith('feb');
  return false;
}

@Injectable()
export class ChainPayService {
  constructor(private readonly config: ConfigService) {}

  async createDepositAddress(externalReference: string): Promise<ChainPayAddress> {
    const callbackUrl = this.config.get<string>('CHAINPAY_CALLBACK_URL')?.trim();
    const forwardAddress = this.config.get<string>('CHAINPAY_FORWARD_ADDRESS')?.trim();
    const tokenContract = this.config.get<string>('TRON_USDT_CONTRACT')?.trim();
    const webhookSecret = this.config.get<string>('CHAINPAY_WEBHOOK_SECRET')?.trim();
    const liveEnabled = this.config.get<string>('CHAINPAY_LIVE_DEPOSITS_ENABLED') === 'true';
    if (!liveEnabled) throw new BadGatewayException('Live ChainPay deposits are disabled for this prototype.');
    if (!callbackUrl || !forwardAddress || !tokenContract || !webhookSecret) throw new BadGatewayException('ChainPay deposit configuration is incomplete.');
    let callback: URL;
    try { callback = new URL(callbackUrl); } catch { throw new BadGatewayException('ChainPay callback URL is invalid.'); }
    if (callback.protocol !== 'https:' || isPrivateCallbackHost(callback.hostname)) throw new BadGatewayException('ChainPay callback URL must be publicly reachable over HTTPS.');
    if (callback.pathname !== '/api/webhooks/chainpay' || callback.search || callback.hash || webhookSecret.length < 32) throw new BadGatewayException('ChainPay callback path or webhook secret is invalid.');
    if (!isValidTronAddress(forwardAddress)) throw new BadGatewayException('ChainPay forwarding address must be a valid TRON address.');
    if (this.config.get<string>('TRON_NETWORK') !== TRON_MAINNET_NETWORK || !isOfficialTronMainnetUsdtContract(tokenContract) || !isValidTronAddress(tokenContract)) throw new BadGatewayException('Only the pinned official USDT contract on TRON mainnet is supported.');
    callback.searchParams.set('token', webhookSecret);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch('https://api.chainpay.site/deposit-address', {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', ...(this.config.get<string>('CHAINPAY_API_KEY')?.trim() ? { 'x-api-key': this.config.get<string>('CHAINPAY_API_KEY')!.trim() } : {}) },
        body: JSON.stringify({ ticker: 'trc20/usdt', callbackUrl: callback.toString(), forwardAddress, externalReference, pending: true }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== 'object') throw new BadGatewayException('ChainPay could not create a deposit address.');
      const data = payload as Record<string, unknown>;
      if (typeof data.id !== 'string' || typeof data.address !== 'string' || !data.id || !data.address) throw new BadGatewayException('ChainPay returned an incomplete deposit address response.');
      if (data.externalReference !== undefined && data.externalReference !== externalReference) throw new BadGatewayException('ChainPay returned a mismatched deposit reference.');
      if (data.ticker !== undefined && data.ticker !== 'trc20/usdt') throw new BadGatewayException('ChainPay returned an unexpected deposit asset.');
      if (data.chain !== undefined && String(data.chain).toLowerCase() !== 'tron') throw new BadGatewayException('ChainPay returned an unexpected deposit network.');
      if (!isValidTronAddress(data.address)) throw new BadGatewayException('ChainPay returned an invalid TRON deposit address.');
      return { id: data.id, address: data.address, ticker: typeof data.ticker === 'string' ? data.ticker : undefined, chain: typeof data.chain === 'string' ? data.chain : undefined, externalReference: typeof data.externalReference === 'string' ? data.externalReference : undefined };
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('ChainPay is temporarily unavailable. Try again later.');
    } finally { clearTimeout(timer); }
  }
}
