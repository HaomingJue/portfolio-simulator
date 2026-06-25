"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchMeta } from "@/lib/api";
import { AUTO_COLORS, CASH_COLOR } from "@/lib/format";
import { chartTheme, useEffectiveDark } from "@/lib/useTheme";

interface Slice {
  name: string;
  value: number; // percent 0..100
  color: string;
}

function buildSlices(weights: Record<string, number>): Slice[] {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const cash = Math.max(0, 1 - sum);
  const slices = Object.entries(weights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([t, w], i) => ({
      name: t,
      value: Number((w * 100).toFixed(2)),
      color: AUTO_COLORS[i % AUTO_COLORS.length],
    }));
  if (cash > 0.0005)
    slices.push({ name: "Cash", value: Number((cash * 100).toFixed(2)), color: CASH_COLOR });
  return slices;
}

function PctTooltip({ active, payload }: { active?: boolean; payload?: { name?: string; value?: number; payload?: Slice }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const name = p.payload?.name ?? p.name;
  return (
    <div className="rounded border border-line bg-surface px-2 py-1 text-xs text-fg shadow">
      {name}: {Number(p.value).toFixed(1)}%
    </div>
  );
}

export function Composition({ weights }: { weights: Record<string, number> }) {
  const ct = chartTheme(useEffectiveDark());
  const slices = buildSlices(weights);
  if (slices.length === 0)
    return <p className="text-sm text-muted">Add holdings with weights to see the composition.</p>;

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={slices} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={1}>
            {slices.map((s) => (
              <Cell key={s.name} fill={s.color} />
            ))}
          </Pie>
          <Legend wrapperStyle={{ fontSize: 11, color: ct.fg }} />
          <Tooltip content={<PctTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      <ResponsiveContainer width="100%" height={Math.max(80, 30 * slices.length)}>
        <BarChart data={slices} layout="vertical" margin={{ left: 8, right: 24 }}>
          <XAxis type="number" tickFormatter={(v) => `${v}%`} domain={[0, "dataMax"]} fontSize={11} stroke={ct.axis} tick={{ fill: ct.axis }} />
          <YAxis type="category" dataKey="name" width={56} fontSize={11} stroke={ct.axis} tick={{ fill: ct.axis }} />
          <Tooltip content={<PctTooltip />} cursor={{ fill: ct.grid, fillOpacity: 0.4 }} />
          <Bar dataKey="value" radius={3}>
            {slices.map((s) => (
              <Cell key={s.name} fill={s.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SectorBreakdown({ weights }: { weights: Record<string, number> }) {
  const ct = chartTheme(useEffectiveDark());
  const tickers = Object.keys(weights).filter((t) => weights[t] > 0);
  const [sectors, setSectors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const key = tickers.slice().sort().join(",");

  useEffect(() => {
    if (tickers.length === 0) return;
    let cancelled = false;
    async function loadSectors(syms: string[]) {
      setLoading(true);
      try {
        const { meta } = await fetchMeta(syms);
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const t of syms) map[t] = meta[t]?.sector ?? "—";
        setSectors(map);
      } catch {
        // leave previous sectors in place
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSectors(key.split(","));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (tickers.length === 0) return null;
  if (loading && Object.keys(sectors).length === 0)
    return <p className="text-xs text-faint">Looking up sectors…</p>;

  const agg: Record<string, number> = {};
  for (const t of tickers) {
    const s = sectors[t] ?? "—";
    agg[s] = (agg[s] ?? 0) + weights[t];
  }
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const cash = Math.max(0, 1 - sum);
  if (cash > 0.0005) agg["Cash"] = cash;

  const data = Object.entries(agg)
    .sort((a, b) => b[1] - a[1])
    .map(([name, w], i) => ({
      name,
      value: Number((w * 100).toFixed(2)),
      color: name === "Cash" ? CASH_COLOR : AUTO_COLORS[i % AUTO_COLORS.length],
    }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(90, 30 * data.length)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <XAxis type="number" tickFormatter={(v) => `${v}%`} domain={[0, "dataMax"]} fontSize={11} stroke={ct.axis} tick={{ fill: ct.axis }} />
        <YAxis type="category" dataKey="name" width={96} fontSize={11} stroke={ct.axis} tick={{ fill: ct.axis }} />
        <Tooltip content={<PctTooltip />} cursor={{ fill: ct.grid, fillOpacity: 0.4 }} />
        <Bar dataKey="value" radius={3}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
