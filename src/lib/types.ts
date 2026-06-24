/** Shared client/server types. */
import type { Rebalance } from "./backtest";

export interface Holding {
  ticker: string;
  weightPct: number; // 0..100; the leftover under 100 is held as cash
}

/** A built-in strategy from presets.json. */
export interface Preset {
  name: string;
  description: string;
  rebalance: Rebalance;
  weights: Record<string, number>;
}

/** A portfolio pinned into the on-screen comparison set. */
export interface ComparePortfolio {
  id: string;
  name: string;
  weights: Record<string, number>; // fractions (may sum < 1 → rest is cash)
  rebalance: Rebalance;
}

export interface SavedPortfolio {
  name: string;
  /** ticker → fraction (0..1); may sum to < 1 (rest is cash) */
  weights: Record<string, number>;
  rebalance: string;
  savedAt: number;
}

export interface TickerOverview {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  sector: string;
  industry: string;
  price: number;
  change: number;
  changePct: number;
  marketCap: number | null;
  pe: number | null;
  dividendYield: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  summary: string;
  history: { dates: string[]; close: number[] };
}

export interface TickerMeta {
  name: string;
  sector: string;
  quoteType: string;
  price: number | null;
  valid: boolean;
}
