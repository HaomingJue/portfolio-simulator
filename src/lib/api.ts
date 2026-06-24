/** Typed client-side fetch wrappers for the API routes. */
import type { PriceData } from "./backtest";
import type { TickerMeta, TickerOverview } from "./types";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const fetchTicker = (
  symbol: string,
  opts: { period?: string; start?: string; end?: string }
): Promise<TickerOverview> => {
  const p = new URLSearchParams({ symbol });
  if (opts.period) p.set("period", opts.period);
  if (opts.start) p.set("start", opts.start);
  if (opts.end) p.set("end", opts.end);
  return getJSON<TickerOverview>(`/api/ticker?${p}`);
};

export const fetchMeta = (
  tickers: string[]
): Promise<{ meta: Record<string, TickerMeta> }> =>
  getJSON(`/api/meta?tickers=${tickers.join(",")}`);

export const fetchPrices = (
  tickers: string[],
  start: string,
  end: string
): Promise<PriceData> =>
  getJSON<PriceData>(
    `/api/prices?tickers=${tickers.join(",")}&start=${start}&end=${end}`
  );
