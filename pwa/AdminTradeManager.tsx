"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Clock3, RefreshCw, Signal, Users, Zap, Ban } from "lucide-react";
import { CopyTradeSignal, tradeRequest } from "../lib/trading-api";

type SignalRecord = Omit<CopyTradeSignal, "participation">;
const weekdays = [[1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [0, "Sun"]] as const;
const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export function AdminTradeManager() {
  const [signals, setSignals] = useState<SignalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [closing, setClosing] = useState("");
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [start, setStart] = useState(() => localDateTime(new Date(Date.now() + 60 * 60 * 1000)));
  const [timezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

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
    setSaving(true); setError(""); setNotice("");
    const payload = {
      title: String(data.get("title") ?? ""), pair: String(data.get("pair") ?? ""), startsAt: new Date(String(data.get("startsAt"))).toISOString(),
      roiPercent: Number(data.get("roiPercent")), lockDays: Number(data.get("lockDays")), minimumInvestment: Number(data.get("minimumInvestment")), maximumInvestment: Number(data.get("maximumInvestment")),
      interestWithdrawalDays: days, interestWindowStart: String(data.get("interestWindowStart")), interestWindowEnd: String(data.get("interestWindowEnd")), timezone,
    };
    try {
      await tradeRequest("admin/signals", "POST", payload);
      setNotice("Trade schedule published. Users will be notified when it goes live.");
      form.reset(); setDays([1, 3, 5]); setStart(localDateTime(new Date(Date.now() + 60 * 60 * 1000)));
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

  const formatDate = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return <div className="admin-trading-workspace">
    <form className="admin-panel admin-trade-form" onSubmit={submit}>
      <div className="admin-panel-head"><div><h2>Schedule a copy trade</h2><p>Publish a pair and set when it opens, how long capital stays locked, and the configured ROI.</p></div><span className="admin-trade-head-icon"><Zap size={18}/></span></div>
      <div className="admin-trade-disclaimer"><Signal size={16}/><span>The ROI is a platform-configured projection for the selected term. This schedule does not execute trades through an exchange or guarantee returns.</span></div>
      {error && <p className="admin-action-notice error" role="alert">{error}</p>}{notice && <p className="admin-action-notice" role="status">{notice}</p>}
      <div className="admin-trade-fields">
        <label>Trade title<input name="title" minLength={3} maxLength={100} placeholder="e.g. BTC momentum session" required /></label>
        <label>Trading pair<select name="pair" defaultValue="BTC/USDT"><option>BTC/USDT</option><option>ETH/USDT</option><option>BNB/USDT</option><option>SOL/USDT</option><option>XRP/USDT</option><option>ADA/USDT</option><option>DOGE/USDT</option></select></label>
        <label>Go-live time<input name="startsAt" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} required /></label>
        <label>Configured ROI for full term (%)<input name="roiPercent" type="number" min="0" max="100" step="0.01" placeholder="0.00" required /></label>
        <label>Capital lock period (days)<input name="lockDays" type="number" min="1" max="365" step="1" defaultValue="7" required /></label>
        <label>Minimum investment (USD)<input name="minimumInvestment" type="number" min="0.01" step="0.01" defaultValue="10" required /></label>
        <label>Maximum investment (USD)<input name="maximumInvestment" type="number" min="0.01" step="0.01" defaultValue="10000" required /></label>
        <div className="admin-trade-window"><strong>Interest withdrawal availability</strong><small>Users may request accrued interest on these days. Requests still go through withdrawal review.</small><div className="admin-trade-days">{weekdays.map(([value, label]) => <label key={value}><input type="checkbox" checked={days.includes(value)} onChange={() => setDays((current) => current.includes(value) ? current.filter((day) => day !== value) : [...current, value])}/><span>{label}</span></label>)}</div><div className="admin-trade-time-fields"><label>Window opens<input name="interestWindowStart" type="time" defaultValue="09:00" required /></label><label>Window closes<input name="interestWindowEnd" type="time" defaultValue="17:00" required /></label><small>Timezone: {timezone}</small></div></div>
      </div>
      <div className="admin-trade-form-footer"><span><Clock3 size={14}/> Upcoming trades go live automatically at the selected time.</span><button className="admin-primary-button" type="submit" disabled={saving || days.length === 0}>{saving ? "Saving schedule…" : "Schedule trade"}<ArrowUpRight size={15}/></button></div>
    </form>
    <article className="admin-panel admin-records admin-trade-schedules"><div className="admin-panel-head"><div><h2>Trade schedules</h2><p>Live, upcoming, and completed copy trades.</p></div><button type="button" className="admin-outline-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
      {loading ? <p className="admin-trade-empty">Loading trade schedules…</p> : signals.length ? <div className="admin-trade-list">{signals.map((trade) => <div className="admin-trade-row" key={trade.id}><span className={`admin-trade-pair-icon ${trade.status}`}><Signal size={17}/></span><span className="admin-trade-row-main"><strong>{trade.pair}<small>{trade.title}</small></strong><span>{trade.status === "scheduled" ? `Opens ${formatDate(trade.startsAt)}` : trade.status === "open" ? `Live since ${formatDate(trade.startsAt)}` : `Started ${formatDate(trade.startsAt)}`}</span></span><span className={`admin-trade-status ${trade.status}`}>{trade.status}</span><span className="admin-trade-row-roi"><strong>{trade.roiPercent}%</strong><small>{trade.lockDays} day term</small></span><span className="admin-trade-copiers"><Users size={14}/>{trade.copiedBy}</span>{trade.status === "open" && <button className="admin-trade-close" type="button" onClick={() => void closeSignal(trade)} disabled={closing === trade.id}><Ban size={13}/>{closing === trade.id ? "Closing…" : "Close entries"}</button>}</div>)}</div> : <p className="admin-trade-empty">No trade schedules yet. Create one above to get started.</p>}
    </article>
  </div>;
}
