import type { CopyTradeSignal, TradePosition } from './trade.schema.js';

export const TRADE_AMOUNT_SCALE = 100_000_000;
export const tradeAmountUnits = (value: number) => Math.round((value + Number.EPSILON) * TRADE_AMOUNT_SCALE);

/** Canonical ROI calculation shared by dashboard balances and withdrawal reservations. */
export function earnedTradeInterestUnits(
  position: Pick<TradePosition, 'principal' | 'joinedAt' | 'stoppedAt'> & Partial<Pick<TradePosition, 'status'>>,
  signal: Pick<CopyTradeSignal, 'roiPercent' | 'lockDays' | 'startsAt' | 'endsAt'>,
  now: Date,
) {
  if (position.status === 'closed_loss') return 0;
  const scheduleStart = new Date(signal.startsAt).getTime();
  const joinedAt = new Date(position.joinedAt).getTime();
  const nowAt = now.getTime();
  const principal = Number(position.principal);
  const roiPercent = Number(signal.roiPercent);
  if (![scheduleStart, joinedAt, nowAt, principal, roiPercent].every(Number.isFinite) || principal <= 0 || roiPercent < 0) return 0;

  const configuredEnd = signal.endsAt ? new Date(signal.endsAt).getTime() : Number.NaN;
  const configuredLock = Number(signal.lockDays ?? 1) * 24 * 60 * 60 * 1000;
  const scheduleEnd = Number.isFinite(configuredEnd) && configuredEnd > scheduleStart
    ? configuredEnd
    : scheduleStart + (Number.isFinite(configuredLock) && configuredLock > 0 ? configuredLock : 24 * 60 * 60 * 1000);
  const positionStart = Math.max(joinedAt, scheduleStart);
  const stoppedAt = position.stoppedAt ? new Date(position.stoppedAt).getTime() : scheduleEnd;
  const cutoff = Number.isFinite(stoppedAt) ? Math.min(stoppedAt, scheduleEnd) : scheduleEnd;
  const elapsed = Math.max(0, Math.min(nowAt, cutoff) - positionStart);
  const duration = Math.max(1, scheduleEnd - scheduleStart);
  const earned = principal * roiPercent / 100 * Math.min(1, elapsed / duration);
  return Number.isFinite(earned) ? Math.max(0, tradeAmountUnits(earned)) : 0;
}

export function availableTradeInterestUnits(
  position: Pick<TradePosition, 'principal' | 'joinedAt' | 'stoppedAt' | 'claimedInterest'> & Partial<Pick<TradePosition, 'status'>>,
  signal: Pick<CopyTradeSignal, 'roiPercent' | 'lockDays' | 'startsAt' | 'endsAt'>,
  now: Date,
) {
  return Math.max(0, earnedTradeInterestUnits(position, signal, now) - tradeAmountUnits(Number(position.claimedInterest ?? 0)));
}
