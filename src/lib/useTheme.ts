"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-color-scheme: dark)";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** Tracks the OS/browser color scheme and re-renders on change. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}

export interface ChartTheme {
  grid: string;
  axis: string;
  fg: string;
  tooltipBg: string;
  tooltipBorder: string;
}

/** Colors for Recharts (axes, grid, tooltip) per theme. */
export function chartTheme(dark: boolean): ChartTheme {
  return dark
    ? { grid: "#30363d", axis: "#9aa4b2", fg: "#e6edf3", tooltipBg: "#161b22", tooltipBorder: "#30363d" }
    : { grid: "#eee", axis: "#6b7280", fg: "#111827", tooltipBg: "#ffffff", tooltipBorder: "#e5e7eb" };
}
