"use client";

import { Activity, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

async function fetchLiveCandles(range: Range, signal: AbortSignal): Promise<MarketData> {
  const config = marketRanges[range];
  const binanceHosts = ["https://api.binance.com", "https://api1.binance.com", "https://data-api.binance.vision"];
  for (const host of binanceHosts) {
    try {
      const params = new URLSearchParams({ symbol: "BTCUSDT", interval: config.interval, limit: String(config.limit) });
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
      if (candles.length) return { symbol: "BTCUSDT", candles, updatedAt: new Date().toISOString(), source: "Binance" };
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") throw reason;
    }
  }

  // OKX is an independent public market-data source for networks that cannot reach Binance.
  const okxInterval = config.interval === "4h" ? "4H" : config.interval === "1d" ? "1D" : config.interval;
  const params = new URLSearchParams({ instId: "BTC-USDT", bar: okxInterval, limit: String(config.limit) });
  const response = await fetch(`https://www.okx.com/api/v5/market/candles?${params}`, { cache: "no-store", signal, mode: "cors" });
  if (!response.ok) throw new Error("Live BTC/USDT data is unavailable. Check your connection and retry.");
  const payload = await response.json();
  const candles: Candle[] = Array.isArray(payload?.data) ? payload.data.flatMap((row: unknown): Candle[] => {
    if (!Array.isArray(row)) return [];
    const [time, open, high, low, close] = row;
    const candle = { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
    return Object.values(candle).every(Number.isFinite) ? [candle] : [];
  }).reverse() : [];
  if (!candles.length) throw new Error("Live BTC/USDT data is unavailable. Check your connection and retry.");
  return { symbol: "BTCUSDT", candles, updatedAt: new Date().toISOString(), source: "OKX" };
}

export function BtcMarketChart() {
  const [range, setRange] = useState<Range>("24H");
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let controller: AbortController | undefined;
    let mounted = true;
    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const result = await fetchLiveCandles(range, controller.signal);
        if (mounted) { setData(result); setError(""); setLoading(false); }
      } catch (reason) {
        if (mounted && !(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "Could not load market data");
          setLoading(false);
        }
      }
    };
    setLoading(!data);
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { mounted = false; window.clearInterval(timer); controller?.abort(); };
  }, [range]);

  const values = data?.candles ?? [];
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

  return <article className="dash-mobile-market" aria-label="Bitcoin live market chart">
    <div className="dash-mobile-market-head"><span className="dash-mobile-coin">₿</span><div><strong>BTC/USDT</strong><small>Bitcoin / Tether · Spot</small></div><span className={`dash-market-live${data ? "" : " connecting"}`}><i />{data ? "Live" : loading ? "Connecting" : "Offline"}</span></div>
    <div className="dash-market-price-row"><strong>{current ? usd.format(current) : "—"}</strong><span className={change >= 0 ? "up" : "down"}>{change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(change).toFixed(2)}%</span></div>
    <div className="dash-mobile-chart">
      {path ? <svg viewBox="0 0 360 92" preserveAspectRatio="none" role="img" aria-label={`Bitcoin price chart for ${range}`}><defs><linearGradient id="btcChartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#F0B90B" stopOpacity=".22"/><stop offset="100%" stopColor="#F0B90B" stopOpacity="0"/></linearGradient></defs><path d={`${path} L360,92 L0,92 Z`} className="dash-btc-chart-fill"/><path d={path} className="dash-btc-chart-line"/></svg> : <div className="dash-chart-state"><Activity size={17} />{loading ? "Loading live market data…" : error || "Chart data unavailable"}</div>}
    </div>
    <div className="dash-market-footer"><div className="dash-market-ranges" aria-label="Chart period">{ranges.map((item) => <button type="button" key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>)}</div><small>{data ? `Public ${data.source} data · Updated ${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : error ? "Retrying public market sources" : "Connecting to public market data"}</small></div>
  </article>;
}
