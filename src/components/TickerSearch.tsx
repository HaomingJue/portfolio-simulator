"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchTicker } from "@/lib/api";
import { humanMoney, num, pct } from "@/lib/format";
import type { TickerOverview } from "@/lib/types";

const PERIODS: Record<string, string> = {
  "1M": "1mo",
  "6M": "6mo",
  YTD: "ytd",
  "1Y": "1y",
  "5Y": "5y",
  Max: "max",
};

export function TickerSearch({ onAdd }: { onAdd: (symbol: string) => void }) {
  const [symbol, setSymbol] = useState("");
  const [period, setPeriod] = useState("1Y");
  const [ov, setOv] = useState<TickerOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(sym: string, per: string) {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      setOv(await fetchTicker(s, { period: PERIODS[per] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed.");
      setOv(null);
    } finally {
      setLoading(false);
    }
  }

  const up = (ov?.change ?? 0) >= 0;
  const lineColor = up ? "#1a7f37" : "#cf222e";
  const chartData = ov?.history.dates.map((d, i) => ({ date: d, close: ov.history.close[i] }));

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(symbol, period);
        }}
      >
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="e.g. AAPL, SPY, BTC-USD"
          className="w-48 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button type="submit" className="rounded bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-900">
          Search
        </button>
        <div className="flex gap-1">
          {Object.keys(PERIODS).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setPeriod(p);
                if (ov) search(ov.symbol, p);
              }}
              className={`rounded px-2 py-1 text-xs ${
                period === p ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </form>

      {loading && <p className="text-sm text-gray-400">Looking up…</p>}
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">❌ {error}</p>}

      {ov && (
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border border-gray-200 p-3">
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={chartData} margin={{ left: 0, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" fontSize={10} minTickGap={50} />
                <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `$${num(v, 0)}`} fontSize={10} width={48} />
                <Tooltip formatter={(value) => `$${num(Number(value))}`} />
                <Area type="monotone" dataKey="close" stroke={lineColor} fill="url(#g)" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            <div>
              <p className="font-semibold">
                {ov.name} <span className="font-mono text-xs text-gray-500">{ov.symbol}</span>
              </p>
              <p className="text-xs text-gray-500">
                {ov.exchange} · {ov.sector}
              </p>
            </div>
            <div>
              <span className="text-2xl font-semibold">${num(ov.price)}</span>{" "}
              <span className={up ? "text-green-700" : "text-red-700"}>
                {ov.change >= 0 ? "+" : ""}
                {num(ov.change)} ({pct(ov.changePct, 2, true)})
              </span>
            </div>
            <p className="text-xs text-gray-600">
              Mkt cap {humanMoney(ov.marketCap)} · P/E {num(ov.pe)} ·{" "}
              Div {ov.dividendYield ? pct(ov.dividendYield > 1 ? ov.dividendYield / 100 : ov.dividendYield, 2) : "—"}
              <br />
              52-wk {ov.yearLow && ov.yearHigh ? `$${num(ov.yearLow, 0)}–$${num(ov.yearHigh, 0)}` : "—"}
            </p>
            <button
              onClick={() => onAdd(ov.symbol)}
              className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              ➕ Add {ov.symbol}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
