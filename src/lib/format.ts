/** Display formatting helpers. */

export function humanMoney(x: number | null | undefined): string {
  if (x == null) return "—";
  const a = Math.abs(x);
  for (const [unit, div] of [
    ["T", 1e12],
    ["B", 1e9],
    ["M", 1e6],
    ["K", 1e3],
  ] as const) {
    if (a >= div) return `$${(x / div).toFixed(2)}${unit}`;
  }
  return `$${x.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export const pct = (x: number, dp = 1, sign = false): string =>
  `${sign && x >= 0 ? "+" : ""}${(x * 100).toFixed(dp)}%`;

export const money = (x: number): string =>
  `$${x.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const num = (x: number | null | undefined, dp = 2): string =>
  x == null ? "—" : x.toLocaleString(undefined, { maximumFractionDigits: dp });

/** Distinct chart colors (matches the Python AUTO_COLORS palette). */
export const AUTO_COLORS = [
  "#2196F3",
  "#FF5722",
  "#4CAF50",
  "#FF9800",
  "#9C27B0",
  "#009688",
  "#E91E63",
  "#607D8B",
  "#795548",
  "#F44336",
  "#3F51B5",
  "#00BCD4",
];

export const CASH_COLOR = "#9e9e9e";
