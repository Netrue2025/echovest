function apiBase() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.NEXT_PUBLIC_API_URL) throw new Error('The account service URL is not configured. Set NEXT_PUBLIC_API_URL and rebuild the frontend.');
    return '/api/account';
  }
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

export type ReferralMember = { id: string; fullName: string; tier: number; earned: number; joinedAt?: string };
export type MembershipTier = { level: string; requiredDirectReferrals: number; requiredTradingBalance: number; withdrawalReviewHours: number; withdrawalFeeDiscountPercent: number };
export type ReferralOverview = {
  referralCode: string;
  membershipLevel: string;
  referralBalanceEarned: number;
  rates: { level: string; tier1: number; tier2: number; tier3: number };
  membershipLevels: MembershipTier[];
  membershipRates: { level: string; tier1: number; tier2: number; tier3: number }[];
  lockedTradingBalance: number;
  counts: { tier1: number; tier2: number; tier3: number };
  downliners: ReferralMember[];
};

export async function referralRequest<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/referrals/${path}`, { method, credentials: 'include', headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  } catch { throw new Error('Cannot reach the EchoVest account service. Please try again.'); }
  const data = await response.json().catch(() => ({})) as { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Referral request failed.');
  return data as T;
}
