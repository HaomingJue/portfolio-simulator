/** Saved portfolios persisted in localStorage (the web analogue of
 *  saved_portfolios.json). No backend/DB needed. */
import type { SavedPortfolio } from "./types";

const KEY = "portfolio-backtester:saved";

export function loadSaved(): SavedPortfolio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(list: SavedPortfolio[]): void {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

/** Upsert by name. */
export function savePortfolio(p: SavedPortfolio): SavedPortfolio[] {
  const list = loadSaved().filter((x) => x.name !== p.name);
  list.push(p);
  list.sort((a, b) => b.savedAt - a.savedAt);
  writeAll(list);
  return list;
}

export function deletePortfolio(name: string): SavedPortfolio[] {
  const list = loadSaved().filter((x) => x.name !== name);
  writeAll(list);
  return list;
}
