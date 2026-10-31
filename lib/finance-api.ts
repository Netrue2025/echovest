function apiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') throw new Error('The account service URL is not configured. Set NEXT_PUBLIC_API_URL and rebuild the frontend.');
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

export async function financeRequest<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/finance/${path}`, { method, credentials: 'include', headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  } catch { throw new Error('Cannot reach the EchoVest account service. Please try again.'); }
  const data = await response.json().catch(() => ({})) as { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Request failed. Please try again.');
  return data as T;
}

export type FinanceSettings = { depositWalletAddress: string; depositNetwork: string; depositInstructions: string; minimumDeposit: number; minimumWithdrawal: number };
export type FinanceTransaction = { id: string; type: 'deposit' | 'withdrawal'; amount: number; balanceType: 'trading' | 'referral'; status: string; txid: string; network: string; destinationAddress: string; rejectionReason: string; createdAt?: string };
export type FinanceSummary = { balances: { trading: number; referral: number; availableTrading: number; availableReferral: number }; transactions: FinanceTransaction[] };
