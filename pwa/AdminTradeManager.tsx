"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Clock3, RefreshCw, Signal, Users, Zap, Ban } from "lucide-react";
import { CopyTradeSignal, tradeRequest } from "../lib/trading-api";

type SignalRecord = Omit<CopyTradeSignal, "participation">;
const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const formatLockTerm = (startsAt: string, endsAt: string, fallbackDays = 1) => {
  const scheduledMinutes = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000;
  const totalMinutes = Math.max(1, Math.round(Number.isFinite(scheduledMinutes) && scheduledMinutes > 0 ? scheduledMinutes : fallbackDays * 1440));
  const days = Math.floor(totalMinutes / 1440), hours = Math.floor((totalMinutes % 1440) / 60), minutes = totalMinutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", minutes ? `${minutes}m` : ""].filter(Boolean).join(" ");
};

export function AdminTradeManager() {
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [closing, setClosing] = useState("");
  const [start, setStart] = useState(() => localDateTime(new Date(Date.now() + 60 * 60 * 1000)));
  const [end, setEnd] = useState(() => localDateTime(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)));

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setSignals(await tradeRequest<SignalRecord[]>("admin/signals")); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load trade schedules."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startsAt = new Date(String(data.get("startsAt")));
    const endsAt = new Date(String(data.get("endsAt")));
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) { setError("Choose an end date and time after the start date and time."); return; }
    setSaving(true); setError(""); setNotice("");
    const payload = {
      title: String(data.get("title") ?? ""), pair: String(data.get("pair") ?? ""), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
      roiPercent: Number(data.get("roiPercent")), minimumInvestment: Number(data.get("minimumInvestment")), maximumInvestment: Number(data.get("maximumInvestment")),
    };
    try {
      await tradeRequest("admin/signals", "POST", payload);
      setNotice("Trade schedule published. Users will be notified when it goes live.");
      form.reset(); setStart(localDateTime(new Date(Date.now() + 60 * 60 * 1000))); setEnd(localDateTime(new Date(Date.now() + 8 * 24 * 60 * 60 * 1000)));
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the trade schedule."); }
    finally { setSaving(false); }
  }

  async function closeSignal(signal: SignalRecord) {
    setClosing(signal.id); setError(""); setNotice("");
    try { await tradeRequest(`admin/signals/${signal.id}/close`, "PATCH", {}); setNotice(`${signal.pair} is no longer accepting participants. Existing positions remain active until maturity.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not close this trade."); }
    finally { setClosing(""); }
  }

  async function cancelSignal(signal: SignalRecord) {
    setClosing(signal.id); setError(''); setNotice('');
    try { await tradeRequest(`admin/signals/${signal.id}/cancel`, 'PATCH', {}); setNotice(`${signal.pair} scheduled trade cancelled before launch.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not cancel this trade.'); }
    finally { setClosing(''); }
  }

  const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <div className="admin-trading-workspace">
    <form className="admin-panel admin-trade-form" onSubmit={submit}>
      <div className="admin-panel-head"><div><h2>Schedule a copy trade</h2><p>Set the trade window. A participant’s capital lock duration is calculated from its start and end time.</p></div><span className="admin-trade-head-icon"><Zap size={18}/></span></div>
      <div className="admin-trade-disclaimer"><Signal size={16}/><span>The ROI is a platform-configured projection for the selected term. This schedule does not execute trades through an exchange or guarantee returns.</span></div>
      {error && <p className="admin-action-notice error" role="alert">{error}</p>}{notice && <p className="admin-action-notice" role="status">{notice}</p>}
      <div className="admin-trade-fields">
        <label>Trade title<input name="title" minLength={3} maxLength={100} placeholder="e.g. BTC momentum session" required /></label>
        <label>Trading pair<select name="pair" defaultValue="BTC/USDT"><option>BTC/USDT</option><option>ETH/USDT</option><option>BNB/USDT</option><option>SOL/USDT</option><option>XRP/USDT</option><option>ADA/USDT</option><option>DOGE/USDT</option></select></label>
        <label>Trade starts<input name="startsAt" type="datetime-local" min={localDateTime(new Date())} value={start} onChange={(event) => { const value = event.target.value; setStart(value); if (new Date(end) <= new Date(value)) setEnd(localDateTime(new Date(new Date(value).getTime() + 24 * 60 * 60 * 1000))); }} required /><small>Local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"}</small></label>
        <label>Trade ends<input name="endsAt" type="datetime-local" min={start} value={end} onChange={(event) => setEnd(event.target.value)} required /><small>This interval sets the capital lock duration.</small></label>
        <label>Configured ROI for full term (%)<input name="roiPercent" type="number" min="0" max="100" step="0.01" placeholder="0.00" required /></label>
        <label>Minimum investment (USD)<input name="minimumInvestment" type="number" min="0.01" step="0.01" defaultValue="10" required /></label>
        <label>Maximum investment (USD)<input name="maximumInvestment" type="number" min="0.01" step="0.01" defaultValue="10000" required /></label>
      </div>
      <div className="admin-trade-form-footer"><span><Clock3 size={14}/> Upcoming trades go live at the selected start time and stop accepting entries at the end time.</span><button className="admin-primary-button" type="submit" disabled={saving}>{saving ? "Saving schedule…" : "Schedule trade"}<ArrowUpRight size={15}/></button></div>
    </form>
    <article className="admin-panel admin-records admin-trade-schedules"><div className="admin-panel-head"><div><h2>Trade schedules</h2><p>Live, upcoming, and completed copy trades.</p></div><button type="button" className="admin-outline-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
      {loading ? <p className="admin-trade-empty">Loading trade schedules…</p> : signals.length ? <div className="admin-trade-list">{signals.map((trade) => <div className="admin-trade-row" key={trade.id}><span className={`admin-trade-pair-icon ${trade.status}`}><Signal size={17}/></span><span className="admin-trade-row-main"><strong>{trade.pair}<small>{trade.title}</small></strong><span>{trade.status === "scheduled" ? `Opens ${formatDate(trade.startsAt)}` : trade.status === "open" ? `Live since ${formatDate(trade.startsAt)}` : `Started ${formatDate(trade.startsAt)}`} · Ends {formatDate(trade.endsAt)}</span></span><span className={`admin-trade-status ${trade.status}`}>{trade.status}</span><span className="admin-trade-row-roi"><strong>{trade.roiPercent}%</strong><small>{formatLockTerm(trade.startsAt, trade.endsAt, trade.lockDays)} lock</small></span><span className="admin-trade-copiers"><Users size={14}/>{trade.copiedBy}</span>{trade.status === "scheduled" && <button className="admin-trade-close" type="button" onClick={() => void cancelSignal(trade)} disabled={closing === trade.id}><Ban size={13}/>{closing === trade.id ? "Cancelling..." : "Cancel schedule"}</button>}{trade.status === "open" && <button className="admin-trade-close" type="button" onClick={() => void closeSignal(trade)} disabled={closing === trade.id}><Ban size={13}/>{closing === trade.id ? "Closing…" : "Close entries"}</button>}</div>)}</div> : <p className="admin-trade-empty">No trade schedules yet. Create one above to get started.</p>}
    </article>
  </div>;
}
