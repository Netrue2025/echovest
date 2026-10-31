"use client";

import { Bell, BellOff, Check, Megaphone, X } from "lucide-react";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { notificationRequest, NotificationInbox, UserNotification, vapidKeyToBytes } from "../lib/notification-api";

type NotificationContextValue = {
  notifications: UserNotification[];
  unreadCount: number;
  loading: boolean;
  pushSupported: boolean;
  pushEnabled: boolean;
  pushBusy: boolean;
  error: string;
  refresh: () => Promise<void>;
  markRead: (item: UserNotification) => Promise<void>;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
  clearError: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);
const useNotificationCenter = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("NotificationCenter must be used within its provider.");
  return context;
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const inbox = await notificationRequest<NotificationInbox>("");
      setNotifications(inbox.notifications);
      setUnreadCount(inbox.unreadCount);
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load notifications."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setPushSupported(typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window);
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 20000);
    if ("serviceWorker" in navigator) navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => setPushEnabled(Boolean(subscription))).catch(() => undefined);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const markRead = useCallback(async (item: UserNotification) => {
    if (item.readAt) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => notification.id === item.id ? { ...notification, readAt } : notification));
    setUnreadCount((current) => Math.max(0, current - 1));
    try { await notificationRequest(`${item.id}/read`, "PATCH", {}); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not mark this notification as read."); }
  }, []);

  const enablePush = useCallback(async () => {
    if (!pushSupported) { setError("Push notifications are not supported by this browser."); return; }
    setPushBusy(true); setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your browser settings to enable push alerts.");
      const { publicKey } = await notificationRequest<{ publicKey: string }>("push/public-key");
      if (!publicKey) throw new Error("Push notifications are not configured on the server yet.");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(publicKey) });
      const json = subscription.toJSON();
      if (!subscription.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Could not read the browser push subscription.");
      await notificationRequest("push/subscription", "POST", { endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, expirationTime: subscription.expirationTime });
      setPushEnabled(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not enable push notifications."); }
    finally { setPushBusy(false); }
  }, [pushSupported]);

  const disablePush = useCallback(async () => {
    setPushBusy(true); setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await notificationRequest("push/unsubscription", "POST", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not disable push notifications."); }
    finally { setPushBusy(false); }
  }, []);

  const value: NotificationContextValue = { notifications, unreadCount, loading, pushSupported, pushEnabled, pushBusy, error, refresh, markRead, enablePush, disablePush, clearError: () => setError("") };
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function NotificationBell({ className, label = "Open notifications", size = 20 }: { className: string; label?: string; size?: number }) {
  const { unreadCount } = useNotificationCenter();
  return <a className={className} href="/dashboard?view=notifications" aria-label={unreadCount ? `${label}, ${unreadCount} unread` : label}><Bell size={size} /><span className="dash-notification-indicator" data-visible={unreadCount > 0 ? "true" : "false"} aria-hidden="true" /></a>;
}

export function useNotificationCenterState() { return useNotificationCenter(); }

export function NotificationsPage() {
  const { notifications, unreadCount, loading, pushSupported, pushEnabled, pushBusy, error, markRead, enablePush, disablePush, clearError } = useNotificationCenter();
  const [selected, setSelected] = useState<UserNotification | null>(null);
  async function open(item: UserNotification) { setSelected(item); await markRead(item); }
  return <>
    <div className="dash-page-heading"><div><p className="dash-kicker">YOUR ACCOUNT</p><h1>Notifications</h1><p className="dash-subtitle">Important wallet and account updates.</p></div><NotificationBell className="dash-page-mobile-notification" /></div>
    <article className="dash-panel dash-notifications-panel">
      <div className="dash-panel-heading"><div><h2>Your inbox</h2><p>Tap a message to read the full update.</p></div><span className="dash-notification-count">{unreadCount} unread</span></div>
      <div className="dash-push-preferences"><span className="dash-push-icon">{pushEnabled ? <Bell size={18} /> : <BellOff size={18} />}</span><span><strong>Push notifications</strong><small>{pushEnabled ? "Alerts are enabled on this device." : pushSupported ? "Get important account alerts on this device." : "This browser does not support push alerts."}</small></span>{pushSupported && <button type="button" disabled={pushBusy} onClick={() => void (pushEnabled ? disablePush() : enablePush())}>{pushBusy ? "Saving…" : pushEnabled ? "Turn off" : "Enable"}</button>}</div>
      {error && <p className="dash-notification-error" role="alert">{error}<button type="button" onClick={clearError} aria-label="Dismiss error"><X size={14} /></button></p>}
      {loading ? <p className="dash-deposit-helper">Loading your inbox…</p> : notifications.length ? <div className="dash-notifications-list">{notifications.map((item) => <button type="button" className={`dash-notification-item ${item.readAt ? "read" : "unread"}`} key={item.id} onClick={() => void open(item)}><span className={`dash-notification-icon ${item.category === "deposit" || item.category === "withdrawal" ? "success" : ""}`}>{item.category === "general" ? <Megaphone size={17} /> : <Check size={17} />}</span><span className="dash-notification-copy"><strong>{item.title}</strong><small>{item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</small><span>{item.message}</span></span>{!item.readAt && <i className="dash-notification-unread-dot" aria-label="Unread" />}</button>)}</div> : <div className="dash-notifications-empty"><span><Bell size={20} /></span><strong>You’re all caught up</strong><p>Important account and wallet updates will appear here.</p></div>}
    </article>
    {selected && <div className="dash-notification-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="dash-notification-modal" role="dialog" aria-modal="true" aria-labelledby="dash-notification-modal-title"><button type="button" className="dash-notification-modal-close" onClick={() => setSelected(null)} aria-label="Close notification"><X size={19} /></button><span className={`dash-notification-icon ${selected.category === "general" ? "" : "success"}`}>{selected.category === "general" ? <Megaphone size={19} /> : <Check size={19} />}</span><small className="dash-notification-modal-date">{selected.createdAt ? new Date(selected.createdAt).toLocaleString() : ""}</small><h2 id="dash-notification-modal-title">{selected.title}</h2><p>{selected.message}</p><button type="button" className="dash-notification-modal-done" onClick={() => setSelected(null)}>Done</button></section></div>}
  </>;
}
