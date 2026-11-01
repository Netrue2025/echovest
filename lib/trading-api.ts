function apiBase() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.NEXT_PUBLIC_API_URL) throw new Error('The account service URL is not configured. Set NEXT_PUBLIC_API_URL and rebuild the frontend.');
    return '/api/account';
  }
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

export async function tradeRequest<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`${apiBase()}/trades/${path}`, { method, credentials: 'include', headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) }); }
  catch { throw new Error('Cannot reach the EchoVest account service. Please try again.'); }
  const data = await response.json().catch(() => ({})) as { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Trade request failed.');
  return data as T;
}

export type CopyTradeSignal = { id: string; title: string; pair: string; startsAt: string; endsAt: string; roiPercent: number; lockDays: number; minimumInvestment: number; maximumInvestment: number; status: 'scheduled' | 'open' | 'completed' | 'cancelled'; copiedBy: number; participation: TradePosition | null };
export type TradePosition = { id: string; signalId: string; pair: string; title: string; principal: number; status: 'active' | 'stopped' | 'matured'; joinedAt: string; stoppedAt: string | null; principalReturnedAt?: string | null; capitalUnlockAt?: string | null; maturesAt: string; roiPercent: number; lockDays: number; interestAccrued: number; interestClaimed: number; interestAvailable: number };
export type TradeDashboard = { openTrades: CopyTradeSignal[]; nextTrade: CopyTradeSignal | null; positions: TradePosition[]; withdrawalSettings: { withdrawalDays: number[]; withdrawalWindowStart: string; withdrawalWindowEnd: string; withdrawalTimezone: string } };
