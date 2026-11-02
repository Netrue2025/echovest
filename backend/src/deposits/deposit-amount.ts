export function usdtToMicros(value: string) {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,6})?$/.test(value)) throw new Error('Invalid USDT decimal amount.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}
