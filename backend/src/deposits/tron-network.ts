/** Canonical Tether USD (USDT) TRC20 contract on TRON mainnet. */
export const TRON_MAINNET_USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
export const TRON_MAINNET_NETWORK = 'mainnet';
export const TRONGRID_MAINNET_API_URL = 'https://api.trongrid.io';

export function isOfficialTronMainnetUsdtContract(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === TRON_MAINNET_USDT_CONTRACT;
}
