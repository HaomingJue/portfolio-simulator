"use client";

import { useEffect, useMemo, useState } from "react";
import { Backtest } from "@/components/Backtest";
import { Composition, SectorBreakdown } from "@/components/Composition";
import { TickerSearch } from "@/components/TickerSearch";
import { fetchMeta } from "@/lib/api";
import { pct } from "@/lib/format";
import { deletePortfolio, loadSaved, savePortfolio } from "@/lib/storage";
import type { Holding, SavedPortfolio } from "@/lib/types";

type View = "build" | "saved";

const blank = (): Holding => ({ ticker: "", weightPct: 0 });

export default function Home() {
  const [view, setView] = useState<View>("build");
  const [name, setName] = useState("My Portfolio");
  const [holdings, setHoldings] = useState<Holding[]>([blank()]);
  const [saved, setSaved] = useState<SavedPortfolio[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);

  useEffect(() => setSaved(loadSaved()), []);

  // ── derived ──────────────────────────────────────────────────────────
  const weights = useMemo(() => {
    const w: Record<string, number> = {};
    for (const h of holdings) {
      const t = h.ticker.trim().toUpperCase();
      if (!t) continue;
      w[t] = (w[t] ?? 0) + h.weightPct / 100;
    }
    return w;
  }, [holdings]);

  const totalPct = holdings.reduce((a, h) => a + (h.ticker.trim() ? h.weightPct : 0), 0);
  const cashPct = Math.max(0, 100 - totalPct);
  const overAlloc = totalPct > 100.5;
  const hasRows = Object.keys(weights).length > 0;

  // ── holdings table ops ───────────────────────────────────────────────
  const update = (i: number, patch: Partial<Holding>) =>
    setHoldings((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const addRow = () => setHoldings((hs) => [...hs, blank()]);
  const removeRow = (i: number) =>
    setHoldings((hs) => (hs.length > 1 ? hs.filter((_, j) => j !== i) : [blank()]));
  const addTicker = (sym: string) => {
    const t = sym.trim().toUpperCase();
    setHoldings((hs) => {
      if (hs.some((h) => h.ticker.trim().toUpperCase() === t)) return hs;
      const cleaned = hs.filter((h) => h.ticker.trim());
      return [...cleaned, { ticker: t, weightPct: 0 }];
    });
  };
  const normalize = () => {
    if (totalPct <= 0) return;
    setHoldings((hs) =>
      hs
        .filter((h) => h.ticker.trim())
        .map((h) => ({ ...h, weightPct: Number(((h.weightPct / totalPct) * 100).toFixed(2)) }))
    );
  };
  const clear = () => {
    setHoldings([blank()]);
    setName("My Portfolio");
    setSaveMsg(null);
    setSaveErr([]);
  };

  async function save() {
    setSaveMsg(null);
    const errs: string[] = [];
    const n = name.trim();
    if (!n) errs.push("Give the portfolio a name.");
    if (overAlloc) errs.push(`Weights total ${totalPct.toFixed(1)}% — over 100%. Normalize or lower them.`);
    if (!hasRows) errs.push("Add at least one holding.");
    if (errs.length) {
      setSaveErr(errs);
      return;
    }
    setValidating(true);
    setSaveErr([]);
    try {
      const { meta } = await fetchMeta(Object.keys(weights));
      const bad = Object.keys(weights).filter((t) => !meta[t]?.valid);
      if (bad.length) {
        setSaveErr([`Unknown ticker(s): ${bad.join(", ")}.`]);
        return;
      }
      const w: Record<string, number> = {};
      for (const [t, frac] of Object.entries(weights)) w[t] = Number(frac.toFixed(6));
      const next = savePortfolio({ name: n, weights: w, rebalance: "quarterly", savedAt: Date.now() });
      setSaved(next);
      setSaveMsg(`✅ Saved “${n}” (${Object.keys(w).length} holdings).`);
    } catch {
      setSaveErr(["Could not validate tickers — check your connection."]);
    } finally {
      setValidating(false);
    }
  }

  function loadInto(p: SavedPortfolio) {
    setHoldings(
      Object.entries(p.weights).map(([ticker, frac]) => ({
        ticker,
        weightPct: Number((frac * 100).toFixed(2)),
      }))
    );
    setName(p.name);
    setView("build");
    setSaveMsg(null);
    setSaveErr([]);
  }

  const inputCls =
    "rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">📈 Portfolio Backtester</h1>
        <nav className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(["build", "saved"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 text-sm font-medium ${
                view === v ? "bg-white text-gray-900 shadow" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {v === "build" ? "🛠️ Build & backtest" : `📂 Saved (${saved.length})`}
            </button>
          ))}
        </nav>
      </header>

      {view === "build" ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-gray-800">1. Find a stock</h2>
            <TickerSearch onAdd={addTicker} />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-gray-800">2. Your portfolio</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Portfolio name"
                  className={`${inputCls} w-full`}
                />
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-500">
                      <th className="pb-1">Ticker</th>
                      <th className="pb-1">Weight %</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h, i) => (
                      <tr key={i}>
                        <td className="py-0.5 pr-2">
                          <input
                            value={h.ticker}
                            onChange={(e) => update(i, { ticker: e.target.value.toUpperCase() })}
                            placeholder="e.g. AAPL"
                            className={`${inputCls} w-full font-mono`}
                          />
                        </td>
                        <td className="py-0.5 pr-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={h.weightPct === 0 ? "" : h.weightPct}
                            onChange={(e) =>
                              update(i, { weightPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })
                            }
                            placeholder="0"
                            className={`${inputCls} w-24`}
                          />
                        </td>
                        <td>
                          <button onClick={() => removeRow(i)} className="px-2 text-gray-400 hover:text-red-600" title="Remove">
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between text-sm">
                  <button onClick={addRow} className="text-blue-600 hover:underline">
                    + Add row
                  </button>
                  <span className={overAlloc ? "text-red-600" : "text-gray-600"}>
                    Invested {Math.min(totalPct, 100).toFixed(1)}%
                    {!overAlloc && cashPct > 0.5 && ` · 💵 ${cashPct.toFixed(1)}% cash`}
                    {overAlloc && " — over 100%"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={normalize}
                    disabled={totalPct <= 0}
                    className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
                  >
                    ⚖️ Normalize
                  </button>
                  <button onClick={clear} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
                    🗑️ Clear
                  </button>
                  <button
                    onClick={save}
                    disabled={!hasRows || overAlloc || validating}
                    className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {validating ? "Checking…" : "💾 Save"}
                  </button>
                </div>
                {saveMsg && <p className="text-sm text-green-700">{saveMsg}</p>}
                {saveErr.map((e) => (
                  <p key={e} className="text-sm text-red-600">
                    ❌ {e}
                  </p>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">Composition</p>
                {hasRows && !overAlloc && totalPct > 0 ? (
                  <>
                    <Composition weights={weights} />
                    <p className="text-sm font-medium text-gray-700">Sector breakdown</p>
                    <SectorBreakdown weights={weights} />
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Add holdings with weights to see the pie, bar, and sectors.</p>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-gray-800">3. Backtest over any time range</h2>
            {hasRows && !overAlloc ? (
              <Backtest weights={weights} name={name} />
            ) : (
              <p className="text-sm text-gray-400">Add holdings (weights up to 100%) to back-test them.</p>
            )}
          </section>
        </div>
      ) : (
        <SavedView saved={saved} onLoad={loadInto} onDelete={(n) => setSaved(deletePortfolio(n))} />
      )}

      <footer className="mt-8 text-xs text-gray-400">
        Prices via Yahoo Finance. Holdings that hadn&apos;t launched yet at the chosen start are held as cash until
        their first trading day. Idle-cash yield, taxes, and trading costs are not modeled. Not financial advice.
      </footer>
    </div>
  );
}

function SavedView({
  saved,
  onLoad,
  onDelete,
}: {
  saved: SavedPortfolio[];
  onLoad: (p: SavedPortfolio) => void;
  onDelete: (name: string) => void;
}) {
  if (saved.length === 0)
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500 shadow-sm">
        No saved portfolios yet. Build one and hit 💾 Save.
      </div>
    );
  return (
    <div className="space-y-3">
      {saved.map((p) => {
        const invested = Object.values(p.weights).reduce((a, b) => a + b, 0);
        const cash = Math.max(0, 1 - invested);
        return (
          <div key={p.name} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{p.name}</p>
                <p className="text-xs text-gray-500">
                  {Object.keys(p.weights).length} holdings · rebalance {p.rebalance}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => onLoad(p)} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                  ✏️ Load into builder
                </button>
                <button onClick={() => onDelete(p.name)} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
                  🗑️
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(p.weights)
                .sort((a, b) => b[1] - a[1])
                .map(([t, w]) => (
                  <span key={t} className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs">
                    {t} {pct(w, 0)}
                  </span>
                ))}
              {cash > 0.005 && <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Cash {pct(cash, 0)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
