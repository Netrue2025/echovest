import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

function apiBase() {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.NEXT_PUBLIC_API_URL) throw new Error('The account service URL is not configured. Set NEXT_PUBLIC_API_URL and rebuild the frontend.');
    return '/api/account';
  }
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

export type WithdrawalSecurityStatus = { pinEnabled: boolean; biometricEnabled: boolean; biometricCount: number; configured: boolean };
type Context = { amount: number; destinationAddress: string; network: string; source: string };

async function request<T>(path: string, payload?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`${apiBase()}/withdrawal-security/${path}`, { method: payload === undefined ? 'GET' : 'POST', credentials: 'include', headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) }); }
  catch { throw new Error('Cannot reach the EchoVest account service. Please try again.'); }
  const data = await response.json().catch(() => ({})) as { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Withdrawal security request failed.');
  return data as T;
}

export const withdrawalSecurityApi = {
  status: () => request<WithdrawalSecurityStatus>('status'),
  setPin: (pin: string) => request<WithdrawalSecurityStatus>('pin', { pin }),
  async registerPasskey() {
    if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('This browser does not support device biometric verification. Set a withdrawal PIN instead.');
    const options = await request<Parameters<typeof startRegistration>[0]['optionsJSON']>('passkey/registration-options', {});
    const response = await startRegistration({ optionsJSON: options });
    return request<WithdrawalSecurityStatus>('passkey/registration-verification', { response, name: 'This device' });
  },
  async verifyPasskey(context: Context) {
    if (!window.PublicKeyCredential || !navigator.credentials) throw new Error('This browser does not support device biometric verification.');
    const options = await request<Parameters<typeof startAuthentication>[0]['optionsJSON']>('passkey/authentication-options', context);
    const response = await startAuthentication({ optionsJSON: options });
    return request<{ verificationToken: string }>('passkey/authentication-verification', { ...context, response });
  },
};
