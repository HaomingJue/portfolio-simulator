"use client";

import { useEffect, useMemo, useState } from "react";
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
  computeMetrics,
  REBALANCE_OPTIONS,
  simulateWithCash,
  type Metrics,
  type Rebalance,
} from "@/lib/backtest";
import { AUTO_COLORS, money, pct } from "@/lib/format";

const todayISO = () => new Date().toISOString().slice(0, 10);

interface Series {
  name: string;
  color: string;
  metrics: Metrics;
  values: number[];
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

export function Backtest({
  weights,
  name,
}: {
  weights: Record<string, number>;
  name: string;
}) {
  const [start, setStart] = useState("2010-01-01");
  const [end, setEnd] = useState(todayISO());
  const [capital, setCapital] = useState(10000);
  const [rebalance, setRebalance] = useState<Rebalance>("quarterly");
  const [bench, setBench] = useState(true);
  const [logScale, setLogScale] = useState(true);

  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sig = useMemo(
    () =>
      Object.entries(weights)
        .map(([t, w]) => `${t}:${w.toFixed(4)}`)
        .sort()
        .join(","),
    [weights]
  );
  // Reset stale results when the portfolio changes (re-run to refresh).
  useEffect(() => {
    setResult(null);
  }, [sig]);

  const portfolioName = name.trim() || "My Portfolio";
  const holdsSPY = "SPY" in weights;

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const tickers = Object.keys(weights);
      const all = bench && !holdsSPY ? [...tickers, "SPY"] : tickers;
      const data = await fetchPrices(all, start, end);
      if (data.dates.length === 0) throw new Error("No price data in this range.");

      const series: Series[] = [];
      const portSim = simulateWithCash(data, weights, rebalance, capital);
      series.push({
        name: portfolioName,
        color: AUTO_COLORS[0],
        metrics: computeMetrics(portSim, portfolioName, capital),
        values: portSim.values,
      });
      if (bench && !holdsSPY) {
        const spySim = simulateWithCash(data, { SPY: 1 }, rebalance, capital);
        series.push({
          name: "S&P 500 (SPY)",
          color: "#757575",
          metrics: computeMetrics(spySim, "S&P 500 (SPY)", capital),
          values: spySim.values,
        });
      }
      const deferred = Object.entries(portSim.deferred).map(([ticker, when]) => ({
        ticker,
        when,
      }));
      setResult({ dates: data.dates, series, deferred });
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

  const inputCls =
    "rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Start
          <input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          End
          <input type="date" value={end} max={todayISO()} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-600">
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
        <label className="flex flex-col gap-1 text-xs text-gray-600">
          Rebalance
          <select value={rebalance} onChange={(e) => setRebalance(e.target.value as Rebalance)} className={inputCls}>
            {REBALANCE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={bench} onChange={(e) => setBench(e.target.checked)} />
          Compare vs S&P 500 (SPY)
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
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

      {bench && holdsSPY && (
        <p className="text-xs text-gray-500">Your portfolio already holds SPY — no separate benchmark line to add.</p>
      )}
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {result && (
        <div className="space-y-4">
          {result.deferred.length > 0 && (
            <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
              ⚠️ With a start of <b>{start}</b>, some holdings weren&apos;t trading yet and are held as{" "}
              <b>cash</b> until they launch:{" "}
              {result.deferred
                .map((d) => (d.when ? `${d.ticker} (cash until ${d.when})` : `${d.ticker} (no data — cash throughout)`))
                .join(", ")}
              .
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-gray-500">
                  <th className="py-1.5 pr-3">Portfolio</th>
                  <th className="px-3">CAGR</th>
                  <th className="px-3">Vol</th>
                  <th className="px-3">Sharpe</th>
                  <th className="px-3">Max DD</th>
                  <th className="px-3">Best yr</th>
                  <th className="px-3">Worst yr</th>
                  <th className="px-3">Final</th>
                  <th className="px-3">Green</th>
                </tr>
              </thead>
              <tbody>
                {result.series.map((s) => (
                  <tr key={s.name} className="border-b">
                    <td className="py-1.5 pr-3 font-medium" style={{ color: s.color }}>
                      {s.name}
                    </td>
                    <td className="px-3">{pct(s.metrics.cagr, 2, true)}</td>
                    <td className="px-3">{pct(s.metrics.vol, 1)}</td>
                    <td className="px-3">{s.metrics.sharpe.toFixed(2)}</td>
                    <td className="px-3">{pct(s.metrics.maxDD, 1)}</td>
                    <td className="px-3">
                      {pct(s.metrics.bestYr, 0, true)} ({s.metrics.bestYrYr})
                    </td>
                    <td className="px-3">
                      {pct(s.metrics.worstYr, 0, true)} ({s.metrics.worstYrYr})
                    </td>
                    <td className="px-3">{money(s.metrics.final)}</td>
                    <td className="px-3">{s.metrics.greenYears}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Growth of {money(capital)}</p>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={growthData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" fontSize={11} minTickGap={60} />
                <YAxis
                  scale={logScale ? "log" : "auto"}
                  domain={logScale ? ["auto", "auto"] : [0, "auto"]}
                  allowDataOverflow
                  tickFormatter={(v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v}`)}
                  fontSize={11}
                  width={56}
                />
                <Tooltip formatter={(value) => money(Number(value))} />
                {result.series.map((s) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} dot={false} strokeWidth={1.6} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">Drawdown</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={ddData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" fontSize={11} minTickGap={60} />
                <YAxis tickFormatter={(v: number) => `${v}%`} fontSize={11} width={44} />
                <Tooltip formatter={(value) => `${value}%`} />
                {result.series.map((s) => (
                  <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} dot={false} strokeWidth={1.2} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {!result && !error && (
        <p className="text-sm text-gray-400">Pick a date range and hit <b>Run backtest</b>.</p>
      )}
    </div>
  );
}
