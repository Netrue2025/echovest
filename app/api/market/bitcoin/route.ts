import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ranges = {
  "1H": { interval: "1m", limit: "60" },
  "24H": { interval: "30m", limit: "48" },
  "7D": { interval: "4h", limit: "42" },
  "30D": { interval: "1d", limit: "30" },
} as const;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = (url.searchParams.get("range") ?? "24H") as keyof typeof ranges;
  const config = ranges[range];
  if (!config) return NextResponse.json({ error: "Unsupported chart range" }, { status: 400 });

  try {
    const endpoint = new URL("https://data-api.binance.vision/api/v3/klines");
    endpoint.searchParams.set("symbol", "BTCUSDT");
    endpoint.searchParams.set("interval", config.interval);
    endpoint.searchParams.set("limit", config.limit);
    const response = await fetch(endpoint, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`Market source returned ${response.status}`);

    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error("Invalid market response");
    const candles: { time: number; open: number; high: number; low: number; close: number }[] = [];
    for (const row of rows) {
      if (!Array.isArray(row)) continue;
      const [time, open, high, low, close] = row;
      const candle = { time: Number(time), open: Number(open), high: Number(high), low: Number(low), close: Number(close) };
      if (Object.values(candle).every(Number.isFinite)) candles.push(candle);
    }

    if (!candles.length) throw new Error("Market source returned no candles");
    return NextResponse.json({ symbol: "BTCUSDT", range, candles, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Live Bitcoin market data is temporarily unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
