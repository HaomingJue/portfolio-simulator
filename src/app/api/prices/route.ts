/**
 * GET /api/prices?tickers=AAPL,MSFT&start=2010-01-01&end=2026-06-23
 *
 * Returns adjusted-close prices aligned to a shared, sorted date axis:
 *   { dates: string[], prices: { [ticker]: (number|null)[] } }
 * `null` = no trade that day (pre-inception or a gap). A ticker that returns no
 * data at all becomes an all-null column, which the engine holds as cash.
 */
import { yf, todayISO } from "@/lib/yahoo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickers = (searchParams.get("tickers") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const start = searchParams.get("start") ?? "2010-01-01";
  const end = searchParams.get("end") ?? todayISO();

  if (tickers.length === 0) {
    return Response.json({ error: "No tickers provided." }, { status: 400 });
  }

  // chart period2 is exclusive — bump a day so `end` is included.
  const period2 = new Date(end);
  period2.setDate(period2.getDate() + 1);

  const perTicker = await Promise.all(
    tickers.map(async (t) => {
      const map = new Map<string, number>();
      try {
        const chart = await yf.chart(t, {
          period1: start,
          period2: period2.toISOString().slice(0, 10),
          interval: "1d",
        });
        for (const q of chart.quotes) {
          const iso =
            q.date instanceof Date
              ? q.date.toISOString().slice(0, 10)
              : String(q.date).slice(0, 10);
          const v = q.adjclose ?? q.close;
          if (v != null && Number.isFinite(v)) map.set(iso, v);
        }
      } catch {
        // invalid/empty ticker → empty map → all-null column (held as cash)
      }
      return { t, map };
    })
  );

  const dateSet = new Set<string>();
  for (const { map } of perTicker) for (const d of map.keys()) dateSet.add(d);
  const dates = Array.from(dateSet).sort();

  const prices: Record<string, (number | null)[]> = {};
  for (const { t, map } of perTicker) {
    prices[t] = dates.map((d) => map.get(d) ?? null);
  }

  return Response.json({ dates, prices });
}
