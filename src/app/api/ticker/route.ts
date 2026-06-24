/**
 * GET /api/ticker?symbol=AAPL&period=1y   (or &start=...&end=...)
 *
 * Yahoo-Finance-style overview for one symbol: key stats + a close-price history
 * for the mini chart. 404 if the symbol returns nothing.
 */
import { yf, periodToStart, sectorLabel, todayISO } from "@/lib/yahoo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!symbol) {
    return Response.json({ error: "Enter a ticker symbol." }, { status: 400 });
  }

  const period = searchParams.get("period");
  const start = period
    ? periodToStart(period)
    : searchParams.get("start") ?? periodToStart("1y");
  const end = period ? todayISO() : searchParams.get("end") ?? todayISO();

  try {
    const period2 = new Date(end);
    period2.setDate(period2.getDate() + 1);

    const [chart, qs] = await Promise.all([
      yf.chart(symbol, {
        period1: start,
        period2: period2.toISOString().slice(0, 10),
        interval: "1d",
      }),
      yf
        .quoteSummary(symbol, {
          modules: ["price", "summaryDetail", "assetProfile", "quoteType"],
        })
        .catch(() => null),
    ]);

    const dates: string[] = [];
    const close: number[] = [];
    for (const q of chart.quotes) {
      const v = q.close ?? q.adjclose;
      if (v == null || !Number.isFinite(v)) continue;
      dates.push(
        q.date instanceof Date
          ? q.date.toISOString().slice(0, 10)
          : String(q.date).slice(0, 10)
      );
      close.push(v);
    }
    if (dates.length === 0) {
      return Response.json(
        { error: `No data for '${symbol}'. It may be misspelled or delisted.` },
        { status: 404 }
      );
    }

    const price = qs?.price;
    const sd = qs?.summaryDetail;
    const ap = qs?.assetProfile;
    const qt = qs?.quoteType;
    const last = close[close.length - 1];
    const prev = close.length > 1 ? close[close.length - 2] : last;

    return Response.json({
      symbol,
      name: qt?.longName ?? qt?.shortName ?? price?.longName ?? symbol,
      currency: price?.currency ?? "USD",
      exchange: price?.exchangeName ?? qt?.exchange ?? "—",
      sector: sectorLabel(ap?.sector, qt?.quoteType),
      industry: ap?.industry ?? "—",
      price: price?.regularMarketPrice ?? last,
      change: price?.regularMarketChange ?? last - prev,
      changePct: price?.regularMarketChangePercent ?? (prev ? last / prev - 1 : 0),
      marketCap: price?.marketCap ?? null,
      pe: sd?.trailingPE ?? null,
      dividendYield: sd?.dividendYield ?? null,
      yearHigh: sd?.fiftyTwoWeekHigh ?? null,
      yearLow: sd?.fiftyTwoWeekLow ?? null,
      dayHigh: sd?.dayHigh ?? null,
      dayLow: sd?.dayLow ?? null,
      volume: sd?.volume ?? null,
      summary: ap?.longBusinessSummary ?? "",
      history: { dates, close },
    });
  } catch {
    return Response.json(
      { error: `No data for '${symbol}'. It may be misspelled or delisted.` },
      { status: 404 }
    );
  }
}
