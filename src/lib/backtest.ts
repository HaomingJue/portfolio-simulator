/**
 * Portfolio backtest engine (TypeScript port of the Python `backtest.py`).
 *
 * All math runs on adjusted-close prices aligned to a shared date axis. A holding
 * that hadn't launched yet at the start is held as CASH (0% yield) until its first
 * trading day — see `simulateWithCash`, the direct port of `simulate_with_cash`.
 *
 * Pure, dependency-free, and identical on server or client.
 */

export type Rebalance =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

export const REBALANCE_OPTIONS: Rebalance[] = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

/** Prices aligned to a shared, sorted date axis. `null` = no trade that day
 *  (before a ticker's inception, or a gap). Dates are ISO `YYYY-MM-DD`. */
export interface PriceData {
  dates: string[];
  prices: Record<string, (number | null)[]>;
}

export interface SimResult {
  dates: string[];
  values: number[];
  /** ticker → first available ISO date, only for holdings not tradable on the
   *  first day. `null` means the ticker never traded in range (cash throughout). */
  deferred: Record<string, string | null>;
}

export interface Metrics {
  name: string;
  start: string;
  end: string;
  years: number;
  initial: number;
  final: number;
  cagr: number;
  vol: number;
  sharpe: number;
  calmar: number;
  maxDD: number;
  maxDDStart: string;
  maxDDEnd: string;
  worstYr: number;
  worstYrYr: number;
  bestYr: number;
  bestYrYr: number;
  greenYears: string;
  /** year → return */
  annual: Record<number, number>;
  /** drawdown series aligned to `dates` (negative fractions) */
  drawdown: number[];
}

// ---------------------------------------------------------------------------
// Rebalance schedule
// ---------------------------------------------------------------------------

function isoWeekKey(iso: string): string {
  // ISO-8601 week number + ISO week-year (mirrors pandas isocalendar()).
  const d = new Date(iso + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  d.setUTCDate(d.getUTCDate() - day + 3); // nearest Thursday
  const isoYear = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week =
    1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 864e5));
  return `${isoYear}-W${week}`;
}

/** Indices of the first trading day of each rebalance period. */
function rebalanceIndices(dates: string[], freq: Rebalance): Set<number> {
  if (dates.length === 0) return new Set();
  if (freq === "none") return new Set([0]);
  if (freq === "daily") return new Set(dates.map((_, i) => i));

  const keyOf = (iso: string): string => {
    const y = iso.slice(0, 4);
    const m = Number(iso.slice(5, 7));
    switch (freq) {
      case "weekly":
        return isoWeekKey(iso);
      case "monthly":
        return iso.slice(0, 7);
      case "quarterly":
        return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
      case "yearly":
        return y;
      default:
        return iso;
    }
  };

  const seen = new Set<string>();
  const out = new Set<number>();
  dates.forEach((iso, i) => {
    const k = keyOf(iso);
    if (!seen.has(k)) {
      seen.add(k);
      out.add(i);
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Simulation (cash-aware) — port of simulate_with_cash
// ---------------------------------------------------------------------------

export function simulateWithCash(
  data: PriceData,
  weights: Record<string, number>,
  rebalance: Rebalance,
  initial: number
): SimResult {
  const tickers = Object.keys(weights);
  const { dates } = data;
  const n = dates.length;
  if (tickers.length === 0 || n === 0) {
    return { dates: [], values: [], deferred: {} };
  }

  const w = tickers.map((t) => weights[t]);
  const sumW = w.reduce((a, b) => a + b, 0);
  const cashW = Math.max(0, 1 - sumW);

  // Per-ticker price columns, monotonic availability, and forward-filled prices.
  const cols = tickers.map((t) => data.prices[t] ?? new Array(n).fill(null));
  const firstPos = cols.map((col) => col.findIndex((v) => v != null));

  const deferred: Record<string, string | null> = {};
  tickers.forEach((t, j) => {
    if (firstPos[j] < 0) deferred[t] = null; // never traded in range
    else if (firstPos[j] > 0) deferred[t] = dates[firstPos[j]]; // launched after start
  });

  // avail[i][j] = ticker j has launched on or before day i
  const avail: boolean[][] = Array.from({ length: n }, () =>
    new Array(tickers.length).fill(false)
  );
  tickers.forEach((_, j) => {
    if (firstPos[j] >= 0) {
      for (let i = firstPos[j]; i < n; i++) avail[i][j] = true;
    }
  });

  // forward-filled prices → daily returns (0 where unavailable)
  const ff = cols.map((col) => {
    const out = new Array<number | null>(n).fill(null);
    let last: number | null = null;
    for (let i = 0; i < n; i++) {
      if (col[i] != null) last = col[i];
      out[i] = last;
    }
    return out;
  });
  const ret = (i: number, j: number): number => {
    if (i === 0) return 0;
    const a = ff[j][i - 1];
    const b = ff[j][i];
    if (a == null || b == null || a === 0) return 0;
    return b / a - 1;
  };

  const rebalSet = rebalanceIndices(dates, rebalance);

  const holding = new Array(tickers.length).fill(0);
  let prevAv = avail[0].slice();
  // initial allocation: launched tickers get their weight, the rest (cash weight
  // + not-yet-launched weight) sits in cash.
  let cash = cashW * initial;
  tickers.forEach((_, j) => {
    if (avail[0][j]) holding[j] = w[j] * initial;
    else cash += w[j] * initial;
  });

  const values = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const avI = avail[i];
      // grow currently-held positions
      for (let j = 0; j < tickers.length; j++) {
        if (avI[j] && prevAv[j]) holding[j] *= 1 + ret(i, j);
      }
      let total = cash + holding.reduce((a, b) => a + b, 0);
      // fund tickers launching today from the reserved cash
      const newIdx = tickers
        .map((_, j) => j)
        .filter((j) => avI[j] && !prevAv[j]);
      if (newIdx.length && cash > 0) {
        let want = newIdx.map((j) => w[j] * total);
        const totWant = want.reduce((a, b) => a + b, 0);
        if (totWant > cash) want = want.map((x) => (x * cash) / totWant);
        newIdx.forEach((j, k) => {
          holding[j] += want[k];
          cash -= want[k];
        });
      }
      prevAv = avI.slice();
    }
    values[i] = cash + holding.reduce((a, b) => a + b, 0);

    if (i > 0 && rebalSet.has(i)) {
      const total = values[i];
      let invested = 0;
      for (let j = 0; j < tickers.length; j++) {
        holding[j] = prevAv[j] ? w[j] * total : 0;
        invested += holding[j];
      }
      cash = total - invested; // leftover cash weight + still-unlaunched weight
    }
  }

  return { dates, values, deferred };
}

// ---------------------------------------------------------------------------
// Metrics — port of compute_metrics
// ---------------------------------------------------------------------------

const daysBetween = (a: string, b: string): number =>
  (Date.parse(b) - Date.parse(a)) / 864e5;

export function computeMetrics(
  sim: SimResult,
  name: string,
  initial: number
): Metrics {
  const { dates, values } = sim;
  const start = dates[0];
  const end = dates[dates.length - 1];
  const years = daysBetween(start, end) / 365.25;
  const final = values[values.length - 1];

  const cagr = years > 0 ? Math.pow(final / initial, 1 / years) - 1 : 0;

  // drawdown
  const drawdown = new Array(values.length).fill(0);
  let peak = -Infinity;
  let maxDD = 0;
  let maxDDEndIdx = 0;
  values.forEach((v, i) => {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (v - peak) / peak : 0;
    drawdown[i] = dd;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDEndIdx = i;
    }
  });
  // peak date before the trough
  let maxDDStartIdx = 0;
  let runPeak = -Infinity;
  for (let i = 0; i <= maxDDEndIdx; i++) {
    if (values[i] > runPeak) {
      runPeak = values[i];
      maxDDStartIdx = i;
    }
  }

  // daily returns → annualized vol
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) rets.push(values[i] / values[i - 1] - 1);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance =
    rets.length > 1
      ? rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1)
      : 0;
  const vol = Math.sqrt(variance) * Math.sqrt(252);
  const sharpe = vol > 0 ? (cagr - 0.04) / vol : 0;
  const calmar = maxDD !== 0 ? cagr / Math.abs(maxDD) : Infinity;

  // annual returns
  const years_set = Array.from(new Set(dates.map((d) => Number(d.slice(0, 4))))).sort(
    (a, b) => a - b
  );
  const annual: Record<number, number> = {};
  for (const yr of years_set) {
    let firstIdx = -1;
    let lastIdx = -1;
    for (let i = 0; i < dates.length; i++) {
      if (Number(dates[i].slice(0, 4)) === yr) {
        if (firstIdx < 0) firstIdx = i;
        lastIdx = i;
      }
    }
    const startVal = firstIdx > 0 ? values[firstIdx - 1] : initial;
    annual[yr] = values[lastIdx] / startVal - 1;
  }

  const annualVals = Object.entries(annual).map(([y, r]) => ({ y: Number(y), r }));
  let worst = annualVals[0] ?? { y: 0, r: 0 };
  let best = annualVals[0] ?? { y: 0, r: 0 };
  for (const a of annualVals) {
    if (a.r < worst.r) worst = a;
    if (a.r > best.r) best = a;
  }
  const greenN = annualVals.filter((a) => a.r > 0).length;
  const totalN = annualVals.length || 1;
  const greenYears = `${greenN}/${annualVals.length} (${Math.round(
    (greenN / totalN) * 100
  )}%)`;

  return {
    name,
    start,
    end,
    years: Math.round(years * 10) / 10,
    initial,
    final,
    cagr,
    vol,
    sharpe,
    calmar,
    maxDD,
    maxDDStart: dates[maxDDStartIdx],
    maxDDEnd: dates[maxDDEndIdx],
    worstYr: worst.r,
    worstYrYr: worst.y,
    bestYr: best.r,
    bestYrYr: best.y,
    greenYears,
    annual,
    drawdown,
  };
}
