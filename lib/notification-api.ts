function apiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') throw new Error('The account service URL is not configured. Set NEXT_PUBLIC_API_URL and rebuild the frontend.');
  if (typeof window !== 'undefined') return `http://${window.location.hostname}:4000`;
  return 'http://localhost:4000';
}

export async function notificationRequest<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase()}/notifications/${path}`, { method, credentials: 'include', headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  } catch { throw new Error('Cannot reach the EchoVest account service. Please try again.'); }
  const data = await response.json().catch(() => ({})) as { message?: string | string[] };
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message[0] : data.message || 'Notification request failed.');
  return data as T;
}

export type UserNotification = { id: string; title: string; message: string; category: 'general' | 'deposit' | 'withdrawal'; readAt: string | null; createdAt?: string };
export type NotificationInbox = { notifications: UserNotification[]; unreadCount: number };

export function vapidKeyToBytes(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}
