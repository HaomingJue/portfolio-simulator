"use client";

import { useEffect, useMemo, useState } from "react";
import { Backtest } from "@/components/Backtest";
import { Composition, SectorBreakdown } from "@/components/Composition";
import { TickerSearch } from "@/components/TickerSearch";
import { fetchMeta } from "@/lib/api";
import { REBALANCE_OPTIONS, type Rebalance } from "@/lib/backtest";
import { AUTO_COLORS, pct } from "@/lib/format";
import { deletePortfolio, loadSaved, savePortfolio } from "@/lib/storage";
import presetsData from "@/data/presets.json";
import type { ComparePortfolio, Holding, Preset, SavedPortfolio } from "@/lib/types";

const PRESETS = presetsData as unknown as Preset[];

const blank = (): Holding => ({ ticker: "", weightPct: 0 });
const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

const inputCls =
  "rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg focus:border-blue-500 focus:outline-none";
const cardCls = "rounded-xl border border-line bg-surface p-4 shadow-sm";
const secBtn = "rounded border border-line px-3 py-1.5 text-sm hover:bg-subtle";

function summarize(weights: Record<string, number>): string {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const parts = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .map(([t, w]) => `${t} ${pct(w, 0)}`);
  const cash = Math.max(0, 1 - sum);
  if (cash > 0.005) parts.push(`Cash ${pct(cash, 0)}`);
  return parts.join(" · ");
}

export default function Home() {
  const [name, setName] = useState("My Portfolio");
  const [holdings, setHoldings] = useState<Holding[]>([blank()]);
  const [rebalance, setRebalance] = useState<Rebalance>("quarterly");
  const [compareSet, setCompareSet] = useState<ComparePortfolio[]>([]);
  const [saved, setSaved] = useState<SavedPortfolio[]>([]);
  const [presetSel, setPresetSel] = useState(PRESETS[0]?.name ?? "");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    // localStorage is client-only — hydrate the saved list after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(loadSaved());
  }, []);

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

  // ── builder ops ────────────────────────────────────────────────────────
  const update = (i: number, patch: Partial<Holding>) =>
    setHoldings((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)));
  const addRow = () => setHoldings((hs) => [...hs, blank()]);
  const removeRow = (i: number) =>
    setHoldings((hs) => (hs.length > 1 ? hs.filter((_, j) => j !== i) : [blank()]));
  const addTicker = (sym: string) => {
    const t = sym.trim().toUpperCase();
    setHoldings((hs) => {
      if (hs.some((h) => h.ticker.trim().toUpperCase() === t)) return hs;
      return [...hs.filter((h) => h.ticker.trim()), { ticker: t, weightPct: 0 }];
    });
  };
  const normalize = () => {
    if (totalPct <= 0) return;
    setHoldings((hs) =>
      hs.filter((h) => h.ticker.trim()).map((h) => ({ ...h, weightPct: Number(((h.weightPct / totalPct) * 100).toFixed(2)) }))
    );
  };
  const clearBuilder = () => {
    setHoldings([blank()]);
    setName("My Portfolio");
    setRebalance("quarterly");
    setMsg(null);
  };

  // ── comparison set ─────────────────────────────────────────────────────
  const addToComparison = () => {
    if (!hasRows) return setMsg({ kind: "err", text: "Add at least one holding first." });
    if (overAlloc) return setMsg({ kind: "err", text: `Weights total ${totalPct.toFixed(1)}% — over 100%.` });
    const w: Record<string, number> = {};
    for (const [t, frac] of Object.entries(weights)) w[t] = Number(frac.toFixed(6));
    const nm = name.trim() || `Portfolio ${compareSet.length + 1}`;
    setCompareSet((cs) => [...cs, { id: newId(), name: nm, weights: w, rebalance }]);
    setMsg({ kind: "ok", text: `📌 Added “${nm}” to the comparison.` });
  };
  const addPreset = () => {
    const p = PRESETS.find((x) => x.name === presetSel);
    if (!p) return;
    setCompareSet((cs) => [...cs, { id: newId(), name: p.name, weights: { ...p.weights }, rebalance: p.rebalance }]);
  };
  const addSavedToComparison = (s: SavedPortfolio) =>
    setCompareSet((cs) => [...cs, { id: newId(), name: s.name, weights: { ...s.weights }, rebalance: (s.rebalance as Rebalance) || "quarterly" }]);
  const removeCompare = (id: string) => setCompareSet((cs) => cs.filter((p) => p.id !== id));
  const setCompareRebalance = (id: string, r: Rebalance) =>
    setCompareSet((cs) => cs.map((p) => (p.id === id ? { ...p, rebalance: r } : p)));
  const editCompare = (p: ComparePortfolio) => {
    setHoldings(Object.entries(p.weights).map(([ticker, frac]) => ({ ticker, weightPct: Number((frac * 100).toFixed(2)) })));
    setName(p.name);
    setRebalance(p.rebalance);
    setMsg({ kind: "ok", text: `Loaded “${p.name}” into the builder.` });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── saved (persistent) ─────────────────────────────────────────────────
  async function save() {
    const n = name.trim();
    if (!n) return setMsg({ kind: "err", text: "Give the portfolio a name." });
    if (overAlloc) return setMsg({ kind: "err", text: `Weights total ${totalPct.toFixed(1)}% — over 100%.` });
    if (!hasRows) return setMsg({ kind: "err", text: "Add at least one holding." });
    setValidating(true);
    setMsg(null);
    try {
      const { meta } = await fetchMeta(Object.keys(weights));
      const bad = Object.keys(weights).filter((t) => !meta[t]?.valid);
      if (bad.length) {
        setMsg({ kind: "err", text: `Unknown ticker(s): ${bad.join(", ")}.` });
        return;
      }
      const w: Record<string, number> = {};
      for (const [t, frac] of Object.entries(weights)) w[t] = Number(frac.toFixed(6));
      setSaved(savePortfolio({ name: n, weights: w, rebalance, savedAt: Date.now() }));
      setMsg({ kind: "ok", text: `💾 Saved “${n}”.` });
    } catch {
      setMsg({ kind: "err", text: "Could not validate tickers — check your connection." });
    } finally {
      setValidating(false);
    }
  }
  const loadSavedIntoBuilder = (s: SavedPortfolio) => {
    setHoldings(Object.entries(s.weights).map(([ticker, frac]) => ({ ticker, weightPct: Number((frac * 100).toFixed(2)) })));
    setName(s.name);
    setRebalance((s.rebalance as Rebalance) || "quarterly");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectedPreset = PRESETS.find((p) => p.name === presetSel);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold text-fg">📈 Portfolio Backtester</h1>
        <p className="text-sm text-muted">Build portfolios, pin several, and compare them side by side.</p>
      </header>

      {/* 1. Build */}
      <section className={`${cardCls} mb-6`}>
        <h2 className="mb-3 font-semibold text-fg">1. Build a portfolio</h2>
        <TickerSearch onAdd={addTicker} />
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Portfolio name"
              className={`${inputCls} w-full`}
            />
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted">
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
                        onChange={(e) => update(i, { weightPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                        placeholder="0"
                        className={`${inputCls} w-24`}
                      />
                    </td>
                    <td>
                      <button onClick={() => removeRow(i)} className="px-2 text-faint hover:text-down" title="Remove">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between text-sm">
              <button onClick={addRow} className="text-blue-600 hover:underline dark:text-blue-400">
                + Add row
              </button>
              <span className={overAlloc ? "text-down" : "text-muted"}>
                Invested {Math.min(totalPct, 100).toFixed(1)}%
                {!overAlloc && cashPct > 0.5 && ` · 💵 ${cashPct.toFixed(1)}% cash`}
                {overAlloc && " — over 100%"}
              </span>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted">
              Rebalance
              <select value={rebalance} onChange={(e) => setRebalance(e.target.value as Rebalance)} className={inputCls}>
                {REBALANCE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={addToComparison}
                disabled={!hasRows || overAlloc}
                className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                📌 Add to comparison
              </button>
              <button onClick={normalize} disabled={totalPct <= 0} className={`${secBtn} disabled:opacity-40`}>
                ⚖️ Normalize
              </button>
              <button onClick={clearBuilder} className={secBtn}>
                🗑️ Clear
              </button>
              <button onClick={save} disabled={!hasRows || overAlloc || validating} className={`${secBtn} disabled:opacity-50`}>
                {validating ? "Checking…" : "💾 Save"}
              </button>
            </div>
            {msg && <p className={`text-sm ${msg.kind === "ok" ? "text-up" : "text-down"}`}>{msg.text}</p>}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium text-fg">Composition</p>
            {hasRows && !overAlloc && totalPct > 0 ? (
              <>
                <Composition weights={weights} />
                <p className="text-sm font-medium text-fg">Sector breakdown</p>
                <SectorBreakdown weights={weights} />
              </>
            ) : (
              <p className="text-sm text-faint">Add holdings with weights to see the pie, bar, and sectors.</p>
            )}
          </div>
        </div>
      </section>

      {/* 2. Compare & backtest */}
      <section className={cardCls}>
        <h2 className="mb-3 font-semibold text-fg">2. Compare &amp; backtest</h2>

        {/* add from presets / saved */}
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-muted">Add a preset strategy</p>
            <div className="flex items-center gap-2">
              <select value={presetSel} onChange={(e) => setPresetSel(e.target.value)} className={`${inputCls} flex-1`}>
                {PRESETS.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button onClick={addPreset} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
                + Add
              </button>
            </div>
            {selectedPreset && <p className="mt-1 text-xs text-faint">{selectedPreset.description}</p>}
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase text-muted">Your saved portfolios</p>
            {saved.length === 0 ? (
              <p className="text-xs text-faint">None yet — build one and hit 💾 Save.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {saved.map((s) => (
                  <span key={s.name} className="inline-flex items-center gap-1 rounded bg-subtle px-2 py-1 text-xs text-fg">
                    {s.name}
                    <button onClick={() => addSavedToComparison(s)} title="Add to comparison" className="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400">
                      +
                    </button>
                    <button onClick={() => loadSavedIntoBuilder(s)} title="Load into builder" className="text-muted hover:text-fg">
                      ✏️
                    </button>
                    <button onClick={() => setSaved(deletePortfolio(s.name))} title="Delete" className="text-faint hover:text-down">
                      🗑
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* comparison set */}
        {compareSet.length === 0 ? (
          <p className="mb-4 rounded border border-dashed border-line px-3 py-4 text-center text-sm text-faint">
            Nothing to compare yet. Use <b>📌 Add to comparison</b> above, add a preset, or add a saved portfolio.
          </p>
        ) : (
          <div className="mb-4 space-y-2">
            {compareSet.map((p, i) => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: AUTO_COLORS[i % AUTO_COLORS.length] }} />
                <span className="font-medium text-fg">{p.name}</span>
                <span className="text-xs text-muted">{summarize(p.weights)}</span>
                <div className="ml-auto flex items-center gap-2">
                  <select
                    value={p.rebalance}
                    onChange={(e) => setCompareRebalance(p.id, e.target.value as Rebalance)}
                    className="rounded border border-line bg-surface px-1.5 py-1 text-xs text-fg"
                    title="Rebalance frequency"
                  >
                    {REBALANCE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button onClick={() => editCompare(p)} className="text-xs text-muted hover:text-fg" title="Load into builder">
                    ✏️ Edit
                  </button>
                  <button onClick={() => removeCompare(p.id)} className="text-faint hover:text-down" title="Remove">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Backtest portfolios={compareSet} />
      </section>

      <footer className="mt-8 text-xs text-faint">
        Prices via Yahoo Finance. Holdings that hadn&apos;t launched yet at the chosen start are held as cash until
        their first trading day. Idle-cash yield, taxes, and trading costs are not modeled. Not financial advice.
      </footer>
    </div>
  );
}
