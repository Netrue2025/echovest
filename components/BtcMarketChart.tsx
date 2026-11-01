"use client";

import { Activity, ArrowDownRight, ArrowUpRight, LoaderCircle, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { InlineLoader } from "./AppPreloader";
import { CopyTradeSignal, TradeDashboard, TradePosition, tradeRequest } from "../lib/trading-api";

type Range = "1H" | "24H" | "7D" | "30D";
type Candle = { time: number; open: number; high: number; low: number; close: number };
type MarketData = { symbol: string; candles: Candle[]; updatedAt: string; source: string };

const ranges: Range[] = ["1H", "24H", "7D", "30D"];
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const marketRanges: Record<Range, { interval: string; limit: number }> = {
  "1H": { interval: "1m", limit: 60 },
  "24H": { interval: "30m", limit: 48 },
  "7D": { interval: "4h", limit: 42 },
  "30D": { interval: "1d", limit: 30 },
};

async function fetchLiveCandles(range: Range, symbol: string, signal: AbortSignal): Promise<MarketData> {
  const config = marketRanges[range];
  const binanceHosts = ["https://api.binance.com", "https://api1.binance.com", "https://data-api.binance.vision"];
  for (const host of binanceHosts) {
    try {
      const params = new URLSearchParams({ symbol, interval: config.interval, limit: String(config.limit) });
      const response = await fetch(`${host}/api/v3/klines?${params}`, { cache: "no-store", signal, mode: "cors" });
      if (!response.ok) continue;
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) continue;
      const candles = rows.flatMap((row): Candle[] => {
        if (!Array.isArray(row)) return [];
        const [time, open, high, low, close] = row;
        const candle = { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
        return Object.values(candle).every(Number.isFinite) ? [candle] : [];
      });
      if (candles.length) return { symbol, candles, updatedAt: new Date().toISOString(), source: "Binance" };
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
    }
  }

  const okxInterval = config.interval === "4h" ? "4H" : config.interval === "1d" ? "1D" : config.interval;
  const instId = symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}-USDT` : symbol;
  const params = new URLSearchParams({ instId, bar: okxInterval, limit: String(config.limit) });
  const response = await fetch(`https://www.okx.com/api/v5/market/candles?${params}`, { cache: "no-store", signal, mode: "cors" });
  if (!response.ok) throw new Error(`Live ${symbol} data is unavailable. Check your connection and try again.`);
  const payload = await response.json();
  const candles: Candle[] = Array.isArray(payload?.data) ? payload.data.flatMap((row: unknown): Candle[] => {
    if (!Array.isArray(row)) return [];
    const [time, open, high, low, close] = row;
    const candle = { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
    return Object.values(candle).every(Number.isFinite) ? [candle] : [];
  }).reverse() : [];
  if (!candles.length) throw new Error(`Live ${symbol} data is unavailable. Check your connection and try again.`);
  return { symbol, candles, updatedAt: new Date().toISOString(), source: "OKX" };
}

function secondsLeft(value: string | undefined, now: number) {
  return value ? Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000)) : 0;
}
function countdown(seconds: number) {
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60), secs = seconds % 60;
  return days ? `${days}d ${hours}h ${minutes}m` : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function BtcMarketChart({ availableBalance, onBalanceUpdated }: { availableBalance: number; onBalanceUpdated: () => void }) {
  const [range, setRange] = useState<Range>("24H");
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trades, setTrades] = useState<TradeDashboard | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [tradeMessage, setTradeMessage] = useState("");
  const [tradeError, setTradeError] = useState("");
  const [now, setNow] = useState(Date.now());
  const liveTrade: CopyTradeSignal | null = trades?.openTrades[0] ?? null;
  const pairSymbol = liveTrade?.pair.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
  const position: TradePosition | null = liveTrade ? liveTrade.participation ?? trades?.positions.find((item) => item.signalId === liveTrade.id) ?? null : null;
  const secondsRemaining = secondsLeft(liveTrade?.endsAt, now);
  const scheduledStart = liveTrade ? new Date(liveTrade.startsAt).getTime() : now;
  const scheduledEnd = liveTrade ? new Date(liveTrade.endsAt).getTime() : now;
  const configuredDuration = Math.max(1, scheduledEnd - scheduledStart);
  const timeRemainingRatio = liveTrade ? Math.min(1, Math.max(0, (scheduledEnd - now) / configuredDuration)) : 0;
  const principal = position?.principal ?? Number(amount || liveTrade?.minimumInvestment || 0);
  const earnedPercent = liveTrade && position
    ? position.status === "active"
      ? liveTrade.roiPercent * Math.min(1, Math.max(0, (Math.min(now, scheduledEnd) - Math.max(new Date(position.joinedAt).getTime(), scheduledStart)) / configuredDuration))
      : position.interestAccrued / Math.max(0.01, position.principal) * 100
    : 0;
  const remainingPercent = liveTrade ? liveTrade.roiPercent * timeRemainingRatio : 0;
  const shownPercent = position ? earnedPercent : remainingPercent;
  const returnAmount = position?.status === "active" ? principal * earnedPercent / 100 : position ? position.interestAccrued : principal * shownPercent / 100;

  async function refreshTrades() {
    try { setTrades(await tradeRequest<TradeDashboard>("me")); } catch { /* Keep the public market chart visible if trade data is offline. */ }
  }
  useEffect(() => {
    void refreshTrades();
    const timer = window.setInterval(() => void refreshTrades(), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { if (liveTrade) setAmount(String(liveTrade.minimumInvestment)); }, [liveTrade?.id]);

  useEffect(() => {
    let controller: AbortController | undefined;
    let mounted = true;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const result = await fetchLiveCandles(range, pairSymbol, controller.signal);
        if (mounted) { setData(result); setError(""); setLoading(false); }
      } catch (reason) {
        if (mounted && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Could not load market data");
          setLoading(false);
        }
      }
    };
    setLoading(!data || data.symbol !== pairSymbol);
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { mounted = false; window.clearInterval(timer); controller?.abort(); };
  }, [range, pairSymbol]);

  const marketData = data?.symbol === pairSymbol ? data : null;
  const values = marketData?.candles ?? [];
  const current = values.at(-1)?.close;
  const first = values[0]?.open;
  const change = current && first ? ((current - first) / first) * 100 : 0;
  const path = useMemo(() => {
    if (values.length < 2) return "";
    const closes = values.map((candle) => candle.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    return closes.map((price, index) => `${index === 0 ? "M" : "L"}${(index / (closes.length - 1)) * 360},${82 - ((price - min) / span) * 66}`).join(" ");
  }, [values]);

  async function copyTrade() {
    if (!liveTrade || !amount || busy) return;
    setBusy(true); setTradeError(""); setTradeMessage("");
    try {
      await tradeRequest(`${liveTrade.id}/join`, "POST", { amount: Number(amount) });
      setTradeMessage("Trade copied. Your return accrues until this session ends or you stop copying.");
      await refreshTrades(); onBalanceUpdated();
    } catch (reason) { setTradeError(reason instanceof Error ? reason.message : "Could not copy this trade."); }
    finally { setBusy(false); }
  }
  async function stopCopying() {
    if (!position || busy) return;
    setBusy(true); setTradeError(""); setTradeMessage("");
    try {
      await tradeRequest(`positions/${position.id}/stop`, "POST", {});
      setTradeMessage("Copying stopped. Your return has been finalized at this time.");
      await refreshTrades(); onBalanceUpdated();
    } catch (reason) { setTradeError(reason instanceof Error ? reason.message : "Could not stop copying this trade."); }
    finally { setBusy(false); }
  }

  const displayPair = liveTrade?.pair ?? "BTC/USDT";
  return <article className={`dash-mobile-market${liveTrade ? " has-live-trade" : ""}`} aria-label={liveTrade ? `Live ${displayPair} copy trade chart` : "Bitcoin live market chart"}>
    <div className="dash-mobile-market-head"><span className="dash-mobile-coin">{liveTrade ? <Zap size={15} /> : "₿"}</span><div><strong>{displayPair}</strong><small>{liveTrade ? liveTrade.title : "Bitcoin / Tether · Spot"}</small></div><span className={`dash-market-live${data ? "" : " connecting"}`}><i />{data ? "Live" : loading ? "Connecting" : "Offline"}</span></div>
    <div className="dash-market-price-row"><strong>{current ? usd.format(current) : "—"}</strong><span className={change >= 0 ? "up" : "down"}>{change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(change).toFixed(2)}%</span></div>
    <div className="dash-mobile-chart">
      {path ? <svg viewBox="0 0 360 92" preserveAspectRatio="none" role="img" aria-label={`${displayPair} price chart for ${range}`}><defs><linearGradient id="btcChartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#F0B90B" stopOpacity=".22"/><stop offset="100%" stopColor="#F0B90B" stopOpacity="0"/></linearGradient></defs><path d={`${path} L360,92 L0,92 Z`} className="dash-btc-chart-fill"/><path d={path} className="dash-btc-chart-line"/></svg> : <div className="dash-chart-state">{loading ? <InlineLoader label={`Loading live ${displayPair} data`} /> : <Activity size={17} />}{loading ? "Loading live market data…" : error || "Chart data unavailable"}</div>}
    </div>
    {liveTrade && <div className="dash-chart-trade-inset">
      <div className="dash-chart-trade-stats"><span><small>{position?.status === "active" ? "Your return so far" : position ? "Final return" : "Potential return left"}</small><strong>{position ? usd.format(returnAmount) : `${shownPercent.toFixed(3)}% · ${usd.format(returnAmount)}`}</strong></span><span><small>{secondsRemaining ? "Session ends in" : "Session ended"}</small><strong>{countdown(secondsRemaining)}</strong></span></div>
      <div className="dash-chart-trade-meter"><i style={{ width: `${position?.status === "active" ? Math.min(100, Math.max(0, (now - new Date(position.joinedAt).getTime()) / configuredDuration * 100)) : (1 - timeRemainingRatio) * 100}%` }} /></div>
      <small className="dash-chart-trade-caption">{liveTrade.roiPercent}% max ROI over full session · returns stop when copying ends</small>
      {position?.status === "active" ? <button type="button" className="dash-chart-copy-button stop" onClick={() => void stopCopying()} disabled={busy}>{busy ? <LoaderCircle size={15} className="dash-spin" /> : null}{busy ? "Stopping…" : "Stop copying"}</button>
        : position ? <p className="dash-chart-trade-closed">You stopped copying this trade and cannot rejoin.</p>
        : <form className="dash-chart-copy-form" onSubmit={(event) => { event.preventDefault(); void copyTrade(); }}><label>Investment<input aria-label="Investment amount" type="number" min={liveTrade.minimumInvestment} max={Math.min(liveTrade.maximumInvestment, availableBalance)} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><button type="submit" className="dash-chart-copy-button" disabled={busy || Number(amount) < liveTrade.minimumInvestment || Number(amount) > liveTrade.maximumInvestment || Number(amount) > availableBalance || secondsRemaining <= 0}>{busy ? <LoaderCircle size={15} className="dash-spin" /> : <Zap size={15} />}{busy ? "Copying…" : "Copy trade"}</button></form>}
      {tradeError && <p className="dash-chart-trade-error" role="alert">{tradeError}</p>}{tradeMessage && <p className="dash-chart-trade-message" role="status">{tradeMessage}</p>}
    </div>}
    <div className="dash-market-footer"><div className="dash-market-ranges" aria-label="Chart period">{ranges.map((item) => <button type="button" key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>)}</div><small>{data ? `Public ${data.source} data · Updated ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : error ? `Retrying public ${displayPair} market sources` : "Connecting to public market data"}</small></div>
  </article>;
}
