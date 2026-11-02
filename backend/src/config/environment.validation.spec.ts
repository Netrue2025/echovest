import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './environment.validation.js';
import { TRON_MAINNET_USDT_CONTRACT } from '../deposits/tron-network.js';

const base = { MONGODB_URI: 'mongodb://unit.test/db', RESEND_API_KEY: 'test', EMAIL_FROM: 'EchoVest <test@example.com>', FRONTEND_URL: 'http://localhost:3000', SESSION_SECRET: 's'.repeat(40), DEPOSIT_PROVIDER_MODE: 'mock', CHAINPAY_LIVE_DEPOSITS_ENABLED: 'false' };
const live = { ...base, DEPOSIT_PROVIDER_MODE: 'chainpay', CHAINPAY_LIVE_DEPOSITS_ENABLED: 'true', TRON_NETWORK: 'mainnet', TRON_USDT_CONTRACT: TRON_MAINNET_USDT_CONTRACT, CHAINPAY_CALLBACK_URL: 'https://api.example.com/api/webhooks/chainpay', CHAINPAY_FORWARD_ADDRESS: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', CHAINPAY_WEBHOOK_SECRET: 's'.repeat(40), TRONGRID_API_KEY: 'test-key', TRON_MIN_CONFIRMATIONS: '19' };

describe('validateEnvironment deposit gates', () => {
  it('allows mock mode without live provider credentials', () => { expect(validateEnvironment(base)).toBe(base); });
  it('requires chainpay mode when live deposits are enabled', () => { expect(() => validateEnvironment({ ...live, DEPOSIT_PROVIDER_MODE: 'mock' })).toThrow(/DEPOSIT_PROVIDER_MODE=chainpay/); });
  it('pins live USDT configuration to TRON mainnet and its official contract', () => {
    expect(validateEnvironment(live)).toBe(live);
    expect(() => validateEnvironment({ ...live, TRON_NETWORK: 'nile' })).toThrow(/mainnet only/);
    expect(() => validateEnvironment({ ...live, TRON_USDT_CONTRACT: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb' })).toThrow(/pinned official/);
  });
  it.each([
    ['callback url', { CHAINPAY_CALLBACK_URL: 'http://api.example.com/api/webhooks/chainpay' }],
    ['private callback host', { CHAINPAY_CALLBACK_URL: 'https://192.168.1.4/api/webhooks/chainpay' }],
    ['callback query string', { CHAINPAY_CALLBACK_URL: 'https://api.example.com/api/webhooks/chainpay?token=secret' }],
    ['forwarding address', { CHAINPAY_FORWARD_ADDRESS: 'invalid' }],
    ['webhook secret', { CHAINPAY_WEBHOOK_SECRET: 'short' }],
    ['TRON API key', { TRONGRID_API_KEY: '' }],
    ['TRON API network URL', { TRON_API_URL: 'https://api.nileex.io' }],
    ['confirmations', { TRON_MIN_CONFIRMATIONS: '2' }],
  ])('fails closed for invalid %s configuration', (_name, override) => { expect(() => validateEnvironment({ ...live, ...override })).toThrow(); });
  it('does not require ChainPay API key for the documented keyless deposit route', () => { expect(validateEnvironment(live)).toBe(live); });
});
