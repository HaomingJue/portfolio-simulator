"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchPrices } from "@/lib/api";
import {
  betaCorrelation,
  computeMetrics,
  simulateWithCash,
  type Metrics,
} from "@/lib/backtest";
import { AUTO_COLORS, money, pct } from "@/lib/format";
import { chartTheme, useEffectiveDark } from "@/lib/useTheme";
import type { ComparePortfolio } from "@/lib/types";

const todayISO = () => new Date().toISOString().slice(0, 10);
const colorFor = (i: number) => AUTO_COLORS[i % AUTO_COLORS.length];

interface Series {
  name: string;
  color: string;
  metrics: Metrics;
  values: number[];
  beta?: number;
  corr?: number;
}
interface Result {
  dates: string[];
  series: Series[];
  deferred: { ticker: string; when: string | null }[];
}

function downsample<T>(arr: T[], max = 500): { v: T; i: number }[] {
  if (arr.length <= max) return arr.map((v, i) => ({ v, i }));
  const step = Math.ceil(arr.length / max);
  const out: { v: T; i: number }[] = [];
  for (let i = 0; i < arr.length; i += step) out.push({ v: arr[i], i });
  if (out[out.length - 1].i !== arr.length - 1)
    out.push({ v: arr[arr.length - 1], i: arr.length - 1 });
  return out;
}

const fmtCalmar = (c: number) => (Number.isFinite(c) ? c.toFixed(2) : "∞");
const fmtNum = (x: number | undefined) => (x != null && Number.isFinite(x) ? x.toFixed(2) : "—");

const STAT_ROWS: { label: string; hint?: string; get: (s: Series) => string }[] = [
  { label: "Total return", get: (s) => pct(s.metrics.totalReturn, 1, true) },
  { label: "CAGR", hint: "annualized return", get: (s) => pct(s.metrics.cagr, 2, true) },
  { label: "Volatility (ann)", get: (s) => pct(s.metrics.vol, 1) },
  { label: "Sharpe", hint: "return per unit of total risk", get: (s) => fmtNum(s.metrics.sharpe) },
  { label: "Sortino", hint: "return per unit of downside risk", get: (s) => fmtNum(s.metrics.sortino) },
  { label: "Calmar", hint: "CAGR ÷ max drawdown", get: (s) => fmtCalmar(s.metrics.calmar) },
  { label: "Max drawdown", get: (s) => pct(s.metrics.maxDD, 1) },
  { label: "Longest underwater", hint: "longest time below a prior peak", get: (s) => `${s.metrics.longestUnderwaterDays}d` },
  { label: "Ulcer index", hint: "depth & duration of drawdowns (lower = steadier)", get: (s) => s.metrics.ulcerIndex.toFixed(1) },
  { label: "% positive months", get: (s) => pct(s.metrics.positiveMonthsPct, 0) },
  { label: "Beta vs SPY", hint: "sensitivity to the market", get: (s) => fmtNum(s.beta) },
  { label: "Correlation vs SPY", get: (s) => fmtNum(s.corr) },
  { label: "Best year", get: (s) => `${pct(s.metrics.bestYr, 0, true)} (${s.metrics.bestYrYr})` },
  { label: "Worst year", get: (s) => `${pct(s.metrics.worstYr, 0, true)} (${s.metrics.worstYrYr})` },
  { label: "Final value", get: (s) => money(s.metrics.final) },
];

export function Backtest({ portfolios }: { portfolios: ComparePortfolio[] }) {
  const ct = chartTheme(useEffectiveDark());
  const [start, setStart] = useState("2010-01-01");
  const [end, setEnd] = useState(todayISO());
  const [capital, setCapital] = useState(10000);
  const [bench, setBench] = useState(true);
  const [logScale, setLogScale] = useState(true);

  const [result, setResult] = useState<Result | null>(null);
  const [resultSig, setResultSig] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-run needed when the portfolios or the sim inputs change (log scale is a
  // display-only toggle, applied live — excluded from the signature).
  const settingsSig = useMemo(
    () =>
      JSON.stringify({
        p: portfolios.map((p) => ({ n: p.name, w: p.weights, r: p.rebalance })),
        start,
        end,
        capital,
        bench,
      }),
    [portfolios, start, end, capital, bench]
  );
  const stale = !result || resultSig !== settingsSig;

  async function run() {
    if (portfolios.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      const tickers = new Set<string>();
      for (const p of portfolios) for (const t of Object.keys(p.weights)) tickers.add(t);
      if (bench) tickers.add("SPY");
      const data = await fetchPrices([...tickers], start, end);
      if (data.dates.length === 0) throw new Error("No price data in this range.");

      const used = new Map<string, number>(); // dedupe display names
      const uniqueName = (n: string) => {
        const base = n || "Portfolio";
        const c = used.get(base) ?? 0;
        used.set(base, c + 1);
        return c === 0 ? base : `${base} (${c + 1})`;
      };

      const series: Series[] = [];
      const deferredMap: Record<string, string | null> = {};
      portfolios.forEach((p, i) => {
        const sim = simulateWithCash(data, p.weights, p.rebalance, capital);
        series.push({
          name: uniqueName(p.name),
          color: colorFor(i),
          metrics: computeMetrics(sim, p.name, capital),
          values: sim.values,
        });
        for (const [t, when] of Object.entries(sim.deferred)) {
          if (!(t in deferredMap)) deferredMap[t] = when;
        }
      });

      let spyValues: number[] | null = null;
      if (bench) {
        const spySim = simulateWithCash(data, { SPY: 1 }, "none", capital);
        spyValues = spySim.values;
        series.push({
          name: "S&P 500 (SPY)",
          color: "#9e9e9e",
          metrics: computeMetrics(spySim, "S&P 500 (SPY)", capital),
          values: spySim.values,
        });
      }
      if (spyValues) {
        for (const s of series) {
          const { beta, correlation } = betaCorrelation(s.values, spyValues);
          s.beta = beta;
          s.corr = correlation;
        }
      }

      const deferred = Object.entries(deferredMap).map(([ticker, when]) => ({ ticker, when }));
      setResult({ dates: data.dates, series, deferred });
      setResultSig(settingsSig);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed.");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  const growthData = useMemo(() => {
    if (!result) return [];
    return downsample(result.dates).map(({ v: date, i }) => {
      const row: Record<string, string | number> = { date };
      for (const s of result.series) row[s.name] = Math.round(s.values[i]);
      return row;
    });
  }, [result]);

  const ddData = useMemo(() => {
    if (!result) return [];
    return downsample(result.dates).map(({ v: date, i }) => {
      const row: Record<string, string | number> = { date };
      for (const s of result.series) row[s.name] = Number((s.metrics.drawdown[i] * 100).toFixed(2));
      return row;
    });
  }, [result]);

  const years = useMemo(() => {
    if (!result) return [];
    const set = new Set<number>();
    for (const s of result.series) for (const y of s.metrics.yearly) set.add(y.year);
    return Array.from(set).sort((a, b) => a - b);
  }, [result]);

  const inputCls =
    "rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg focus:border-blue-500 focus:outline-none";
  const tooltipStyle = {
    background: ct.tooltipBg,
    border: `1px solid ${ct.tooltipBorder}`,
    borderRadius: 6,
    color: ct.fg,
    fontSize: 12,
  };

  if (portfolios.length === 0) {
    return (
      <p className="text-sm text-faint">
        Add your portfolio (or a preset / saved one) to the comparison above, then run a backtest.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Start
          <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          End
          <input type="date" value={end} max={todayISO()} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Capital ($)
          <input
            type="number"
            min={100}
            step={1000}
            value={capital}
            onChange={(e) => setCapital(Math.max(100, Number(e.target.value) || 0))}
            className={inputCls}
          />
        </label>
      </div>
      <p className="-mt-2 text-xs text-faint">
        Each portfolio rebalances on its own schedule (set per portfolio above). The S&P 500
        benchmark is buy &amp; hold.
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={bench} onChange={(e) => setBench(e.target.checked)} />
          Compare vs S&P 500 (SPY)
        </label>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
          Log scale
        </label>
        <button
          onClick={run}
          disabled={running}
          className="ml-auto rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "Running…" : "▶ Run backtest"}
        </button>
      </div>

      {error && <p className="rounded bg-danger-bg px-3 py-2 text-sm text-danger-fg">{error}</p>}

      {!stale && result && (
        <div className="space-y-5">
          {result.deferred.length > 0 && (
            <p className="rounded bg-warn-bg px-3 py-2 text-sm text-warn-fg">
              ⚠️ With a start of <b>{start}</b>, some holdings weren&apos;t trading yet and are held as{" "}
              <b>cash</b> until they launch:{" "}
              {result.deferred
                .map((d) => (d.when ? `${d.ticker} (cash until ${d.when})` : `${d.ticker} (no data — cash throughout)`))
                .join(", ")}
              .
            </p>
          )}

          <div className="overflow-x-auto">
            <p className="mb-1 text-sm font-medium text-fg">Performance &amp; stability</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="py-1.5 pr-3 font-medium">Metric</th>
                  {result.series.map((s) => (
                    <th key={s.name} className="px-3 font-semibold" style={{ color: s.color }}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STAT_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-line last:border-0">
                    <td className="py-1 pr-3 text-muted" title={row.hint}>
                      {row.label}
                      {row.hint && <span className="ml-1 text-faint">ⓘ</span>}
                    </td>
                    {result.series.map((s) => (
                      <td key={s.name} className="px-3 tabular-nums text-fg">
                        {row.get(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-fg">Growth of {money(capital)}</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={growthData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                <XAxis dataKey="date" fontSize={11} minTickGap={60} stroke={ct.axis} tick={{ fill: ct.axis }} />
                <YAxis
                  scale={logScale ? "log" : "auto"}
                  domain={logScale ? ["auto", "auto"] : [0, "auto"]}
                  allowDataOverflow
                  tickFormatter={(v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`)}
                  fontSize={11}
                  width={56}
                  stroke={ct.axis}
                  tick={{ fill: ct.axis }}
                />
                <Tooltip formatter={(value) => money(Number(value))} contentStyle={tooltipStyle} labelStyle={{ color: ct.fg }} />
                {result.series.map((s) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} dot={false} strokeWidth={1.6} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-fg">Drawdown</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={ddData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                <XAxis dataKey="date" fontSize={11} minTickGap={60} stroke={ct.axis} tick={{ fill: ct.axis }} />
                <YAxis tickFormatter={(v: number) => `${v}%`} fontSize={11} width={44} stroke={ct.axis} tick={{ fill: ct.axis }} />
                <Tooltip formatter={(value) => `${value}%`} contentStyle={tooltipStyle} labelStyle={{ color: ct.fg }} />
                {result.series.map((s) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} dot={false} strokeWidth={1.2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <p className="mb-1 text-sm font-medium text-fg">Yearly performance</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-muted">
                  <th className="py-1.5 pr-3 text-left font-medium">Year</th>
                  {result.series.map((s) => (
                    <th key={s.name} colSpan={2} className="px-3 text-center font-semibold" style={{ color: s.color }}>
                      {s.name}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-line text-[10px] uppercase text-faint">
                  <th></th>
                  {result.series.map((s) => (
                    <FragmentCols key={s.name} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {years.map((yr) => (
                  <tr key={yr} className="border-b border-line last:border-0">
                    <td className="py-1 pr-3 font-medium text-fg">{yr}</td>
                    {result.series.map((s) => {
                      const y = s.metrics.yearly.find((v) => v.year === yr);
                      return <YearCells key={s.name} ret={y?.ret} maxDD={y?.maxDD} />;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {stale && !error && !running && (
        <p className="text-sm text-faint">Set a date range and hit <b>Run backtest</b>.</p>
      )}
    </div>
  );
}

function FragmentCols() {
  return (
    <>
      <th className="px-3 text-right font-medium">Return</th>
      <th className="px-3 text-right font-medium">Max DD</th>
    </>
  );
}

function YearCells({ ret, maxDD }: { ret?: number; maxDD?: number }) {
  return (
    <>
      <td className={`px-3 text-right tabular-nums ${ret == null ? "text-faint" : ret >= 0 ? "text-up" : "text-down"}`}>
        {ret == null ? "—" : pct(ret, 1, true)}
      </td>
      <td className="px-3 text-right tabular-nums text-muted">{maxDD == null ? "—" : pct(maxDD, 1)}</td>
    </>
  );
}
