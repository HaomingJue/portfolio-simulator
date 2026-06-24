/**
 * Shared server-side Yahoo Finance client. Used only inside Route Handlers —
 * never imported into client components (keeps the dependency server-only and
 * sidesteps browser CORS against Yahoo).
 */
import YahooFinance from "yahoo-finance2";

export const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

/** A period label (e.g. "1y", "max") → an ISO start date for chart() period1. */
export function periodToStart(period: string): string {
  const now = new Date();
  const d = new Date(now);
  switch (period) {
    case "1mo":
      d.setMonth(d.getMonth() - 1);
      break;
    case "6mo":
      d.setMonth(d.getMonth() - 6);
      break;
    case "ytd":
      return `${now.getFullYear()}-01-01`;
    case "1y":
      d.setFullYear(d.getFullYear() - 1);
      break;
    case "5y":
      d.setFullYear(d.getFullYear() - 5);
      break;
    case "max":
      return "1970-01-01";
    default:
      d.setFullYear(d.getFullYear() - 1);
  }
  return d.toISOString().slice(0, 10);
}

export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** Sector label that degrades gracefully for funds (which have no sector). */
export function sectorLabel(
  sector: string | undefined,
  quoteType: string | undefined
): string {
  if (sector) return sector;
  const qt = (quoteType ?? "").toUpperCase();
  return qt === "ETF" || qt === "MUTUALFUND" ? "ETF / Fund" : "—";
}
