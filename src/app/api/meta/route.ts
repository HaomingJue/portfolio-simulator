/**
 * GET /api/meta?tickers=AAPL,SPY
 *
 * Lightweight name / sector / quoteType / price per ticker, for the sector
 * breakdown and ticker validation. Unknown tickers resolve to { valid: false }.
 *   { meta: { [ticker]: { name, sector, quoteType, price, valid } } }
 */
import { yf, sectorLabel } from "@/lib/yahoo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tickers = (searchParams.get("tickers") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const entries = await Promise.all(
    tickers.map(async (t) => {
      try {
        const qs = await yf.quoteSummary(t, {
          modules: ["price", "assetProfile", "quoteType"],
        });
        return [
          t,
          {
            name: qs.quoteType?.longName ?? qs.quoteType?.shortName ?? t,
            sector: sectorLabel(qs.assetProfile?.sector, qs.quoteType?.quoteType),
            quoteType: qs.quoteType?.quoteType ?? "—",
            price: qs.price?.regularMarketPrice ?? null,
            valid: true,
          },
        ] as const;
      } catch {
        return [t, { name: t, sector: "—", quoteType: "—", price: null, valid: false }] as const;
      }
    })
  );

  return Response.json({ meta: Object.fromEntries(entries) });
}
