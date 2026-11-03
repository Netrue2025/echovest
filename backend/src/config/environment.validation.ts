import { isPrivateCallbackHost, isValidTronAddress } from '../providers/chainpay/chainpay.service.js';
import { isOfficialTronMainnetUsdtContract, TRON_MAINNET_NETWORK, TRONGRID_MAINNET_API_URL } from '../deposits/tron-network.js';

export function validateEnvironment(config: Record<string, unknown>) {
  const required = ['MONGODB_URI', 'RESEND_API_KEY', 'EMAIL_FROM', 'FRONTEND_URL', 'SESSION_SECRET'];
  const missing = required.filter((key) => typeof config[key] !== 'string' || !(config[key] as string).trim());
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  const sessionSecret = config.SESSION_SECRET;
  if (typeof sessionSecret !== 'string' || sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  const sameSite = config.SESSION_SAME_SITE;
  if (sameSite !== undefined && (typeof sameSite !== 'string' || !['lax', 'strict', 'none'].includes(sameSite))) throw new Error('SESSION_SAME_SITE must be lax, strict, or none.');

  if (config.WEBAUTHN_RP_ID !== undefined && String(config.WEBAUTHN_RP_ID).trim()) {
    const rpId = String(config.WEBAUTHN_RP_ID).trim().toLowerCase();
    const origins = String(config.FRONTEND_URL).split(',').map((value) => value.trim()).filter(Boolean).map((value) => { try { return new URL(value); } catch { throw new Error('FRONTEND_URL must contain valid origins when configuring WEBAUTHN_RP_ID.'); } });
    if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(rpId) || !origins.some((origin) => origin.hostname.toLowerCase() === rpId) || (config.NODE_ENV === 'production' && origins.some((origin) => origin.hostname.toLowerCase() === rpId && origin.protocol !== 'https:'))) {
      throw new Error('WEBAUTHN_RP_ID must exactly match an HTTPS frontend hostname in production (or an allowed local frontend origin in development).');
    }
  }

  const mode = config.DEPOSIT_PROVIDER_MODE;
  if (mode !== undefined && !['disabled', 'mock', 'chainpay'].includes(String(mode))) throw new Error('DEPOSIT_PROVIDER_MODE must be disabled, mock, or chainpay.');
  const liveValue = config.CHAINPAY_LIVE_DEPOSITS_ENABLED;
  if (liveValue !== undefined && liveValue !== 'true' && liveValue !== 'false') throw new Error('CHAINPAY_LIVE_DEPOSITS_ENABLED must be exactly true or false.');

  if (liveValue === 'true') {
    if (mode !== 'chainpay') throw new Error('Live deposits require DEPOSIT_PROVIDER_MODE=chainpay.');
    if (config.TRON_NETWORK !== TRON_MAINNET_NETWORK) throw new Error('Live USDT deposits currently support TRON mainnet only; set TRON_NETWORK=mainnet.');
    if (!isOfficialTronMainnetUsdtContract(config.TRON_USDT_CONTRACT)) throw new Error('TRON_USDT_CONTRACT must equal the pinned official TRON mainnet USDT contract.');

    const callbackText = typeof config.CHAINPAY_CALLBACK_URL === 'string' ? config.CHAINPAY_CALLBACK_URL.trim() : '';
    let callback: URL;
    try { callback = new URL(callbackText); } catch { throw new Error('CHAINPAY_CALLBACK_URL must be a valid public HTTPS URL.'); }
    if (callback.protocol !== 'https:' || callback.username || callback.password || callback.search || callback.hash || callback.pathname !== '/api/webhooks/chainpay' || !callback.hostname || isPrivateCallbackHost(callback.hostname)) {
      throw new Error('CHAINPAY_CALLBACK_URL must be a public HTTPS origin ending in /api/webhooks/chainpay, without query parameters or credentials.');
    }
    if (typeof config.CHAINPAY_FORWARD_ADDRESS !== 'string' || !isValidTronAddress(config.CHAINPAY_FORWARD_ADDRESS.trim())) throw new Error('CHAINPAY_FORWARD_ADDRESS must be a valid TRON mainnet address.');
    if (typeof config.CHAINPAY_WEBHOOK_SECRET !== 'string' || config.CHAINPAY_WEBHOOK_SECRET.trim().length < 32) throw new Error('CHAINPAY_WEBHOOK_SECRET must contain at least 32 characters.');

    // ChainPay documents keyless deposit creation; an API key is optional for
    // attaching addresses to a cabinet account. It is sent only when configured.
    if (config.CHAINPAY_API_KEY !== undefined && typeof config.CHAINPAY_API_KEY !== 'string') throw new Error('CHAINPAY_API_KEY must be a string when configured.');
    const tronApiUrl = typeof config.TRON_API_URL === 'string' && config.TRON_API_URL.trim() ? config.TRON_API_URL.trim().replace(/\/$/, '') : TRONGRID_MAINNET_API_URL;
    if (tronApiUrl !== TRONGRID_MAINNET_API_URL) throw new Error(`TRON_API_URL must be ${TRONGRID_MAINNET_API_URL} for the configured mainnet verifier.`);
    if (typeof config.TRONGRID_API_KEY !== 'string' || !config.TRONGRID_API_KEY.trim()) throw new Error('TRONGRID_API_KEY is required when live deposits are enabled.');
    const confirmations = Number(config.TRON_MIN_CONFIRMATIONS ?? '19');
    if (!Number.isSafeInteger(confirmations) || confirmations < 19) throw new Error('TRON_MIN_CONFIRMATIONS must be an integer of at least 19.');
  }
  return config;
}
