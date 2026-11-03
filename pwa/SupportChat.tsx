"use client";

import { Bell, Check, Headphones, MessageCircle, Send, ShieldCheck, UserRound, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { notificationRequest, vapidKeyToBytes } from "../lib/notification-api";
import { GuestSupportSession, SupportConversation, SupportMessage, supportRequest } from "../lib/support-api";

const GUEST_SESSION_KEY = "echovest_guest_support_session_v1";
type SavedGuestSession = { conversationId: string; accessToken: string; email: string };

export function SupportChat({ mode = "guest", label }: { mode?: "guest" | "account"; label?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState<SavedGuestSession | null>(null);
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pushEnabled, setPushEnabled] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if ((mode === "account" && params.get("chat") === "1") || (mode === "guest" && params.get("support") === "1")) setOpen(true);
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "guest") return;
    try {
      const previous = localStorage.getItem(GUEST_SESSION_KEY);
      if (previous) { const session = JSON.parse(previous) as SavedGuestSession; setSaved(session); setEmail(session.email); }
    } catch { localStorage.removeItem(GUEST_SESSION_KEY); }
  }, [mode]);

  const refresh = useCallback(async () => {
    try {
      const result = mode === "account"
        ? await supportRequest<SupportConversation>("me")
        : saved ? await supportRequest<SupportConversation>(`guest/${encodeURIComponent(saved.conversationId)}`, "GET", undefined, saved.accessToken) : null;
      if (result) { setConversation(result); setError(""); }
    } catch (cause) {
      if (mode === "guest" && saved) { localStorage.removeItem(GUEST_SESSION_KEY); setSaved(null); setConversation(null); }
      setError(cause instanceof Error ? cause.message : "Could not load your support conversation.");
    }
  }, [mode, saved]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), 12000);
    return () => window.clearInterval(timer);
  }, [open, refresh]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [conversation?.messages.length, open]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const session = await supportRequest<GuestSupportSession>("guest/start", "POST", { email });
      const guest = { conversationId: session.conversation.id, accessToken: session.accessToken, email: session.conversation.email };
      localStorage.setItem(GUEST_SESSION_KEY, JSON.stringify(guest)); setSaved(guest); setConversation(session.conversation);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start a chat."); }
    finally { setBusy(false); }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const body = String(new FormData(form).get("message") ?? "").trim();
    if (!body) return;
    setSending(true); setError("");
    try {
      if (mode === "account") await supportRequest("me/messages", "POST", { body });
      else if (saved) await supportRequest(`guest/${encodeURIComponent(saved.conversationId)}/messages`, "POST", { body }, saved.accessToken);
      form.reset(); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your message could not be sent."); }
    finally { setSending(false); }
  }

  async function enablePush() {
    setBusy(true); setError("");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("Push notifications are not supported by this browser.");
      if (await Notification.requestPermission() !== "granted") throw new Error("Allow notifications in browser settings to receive chat alerts.");
      const { publicKey } = await notificationRequest<{ publicKey: string }>("push/public-key");
      if (!publicKey) throw new Error("Push notifications are not configured on the server yet.");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyToBytes(publicKey) });
      const json = subscription.toJSON();
      if (!subscription.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error("Could not read the browser push subscription.");
      const payload = { endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, expirationTime: subscription.expirationTime };
      if (mode === "account") await notificationRequest("push/subscription", "POST", payload);
      else if (saved) await supportRequest(`guest/${encodeURIComponent(saved.conversationId)}/push`, "POST", payload, saved.accessToken);
      else throw new Error("Start the chat before enabling guest chat alerts.");
      setPushEnabled(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not enable chat notifications."); }
    finally { setBusy(false); }
  }

  const canChat = mode === "account" || Boolean(saved);
  return <>
    <button type="button" className={mode === "guest" ? "support-chat-fab" : "support-chat-inline-launcher"} onClick={() => setOpen(true)} aria-label={label || "Chat with EchoVest support"}>
      <MessageCircle size={mode === "guest" ? 23 : 18}/>{mode === "account" && <span>{label || "Chat with support"}</span>}{mode === "guest" && <span>Chat with us</span>}
    </button>
    {open && <div className="support-chat-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="support-chat-modal" role="dialog" aria-modal="true" aria-labelledby="support-chat-title">
        <header className="support-chat-header"><span className="support-chat-header-icon"><Headphones size={20}/></span><div><h2 id="support-chat-title">EchoVest support</h2><p><i/>Usually replies as soon as possible</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close chat"><X size={19}/></button></header>
        {!canChat ? <form className="support-chat-email-form" onSubmit={(event) => void start(event)}><span className="support-chat-welcome-icon"><MessageCircle size={24}/></span><h3>How can we help?</h3><p>Enter your email to start a private chat with our support team.</p><label htmlFor="support-email">Email address</label><input id="support-email" autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required placeholder="you@example.com"/>{error && <p className="support-chat-error" role="alert">{error}</p>}<button className="support-chat-submit" type="submit" disabled={busy}>{busy ? "Starting chat…" : "Start chat"}</button><small>Your email is used to identify this conversation.</small></form> : <>
          <div className="support-chat-context"><span><UserRound size={14}/>{conversation?.email || saved?.email || "Your account"}</span><button type="button" onClick={() => void enablePush()} disabled={busy || pushEnabled} title="Receive message alerts when this app is closed"><Bell size={14}/>{pushEnabled ? "Alerts on" : "Enable alerts"}</button></div>
          <div className="support-chat-messages" aria-live="polite">{conversation?.messages.length ? conversation.messages.map((message: SupportMessage, index) => <article key={`${message.createdAt}-${index}`} className={`support-chat-message ${message.senderType === "user" ? "mine" : "theirs"}`}><span>{message.senderType === "admin" ? <ShieldCheck size={13}/> : null}{message.senderName}</span><p>{message.body}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></article>) : <div className="support-chat-empty"><span><MessageCircle size={20}/></span><b>Start the conversation</b><p>Send us a message and our team will respond here.</p></div>}<div ref={endRef}/></div>
          {error && <p className="support-chat-error support-chat-inline-error" role="alert">{error}</p>}
          {conversation?.status === "closed" ? <div className="support-chat-closed"><Check size={16}/> This conversation is closed.</div> : <form className="support-chat-compose" onSubmit={(event) => void send(event)}><textarea name="message" placeholder="Write your message…" maxLength={4000} rows={2} required aria-label="Your message"/><button type="submit" disabled={sending} aria-label="Send message"><Send size={18}/></button></form>}
          <div className="support-chat-footnote">Messages update automatically. Enable alerts for replies when the app is closed. Never share passwords, OTPs, or wallet recovery phrases.</div>
        </>}
      </section>
    </div>}
  </>;
}
