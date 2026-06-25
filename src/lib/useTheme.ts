"use client";

import { useSyncExternalStore } from "react";

export type ThemeMode = "system" | "light" | "dark";

export const THEME_KEY = "pb-theme";
const QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  let mq: MediaQueryList | null = null;
  if (typeof window !== "undefined" && window.matchMedia) {
    mq = window.matchMedia(QUERY);
    mq.addEventListener("change", cb); // OS change matters in "system" mode
  }
  return () => {
    listeners.delete(cb);
    mq?.removeEventListener("change", cb);
  };
}

function readMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const m = window.localStorage.getItem(THEME_KEY);
  return m === "light" || m === "dark" || m === "system" ? m : "system";
}

/** Set the theme mode: persist it and reflect it on <html data-theme>. */
export function setThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(THEME_KEY, mode);
  } catch {
    /* ignore */
  }
  document.documentElement.dataset.theme = mode;
  listeners.forEach((l) => l());
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, readMode, () => "system");
}

/** The resolved dark/light state (honors a forced override, else the OS). */
export function useEffectiveDark(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      const m = readMode();
      if (m === "dark") return true;
      if (m === "light") return false;
      return typeof window !== "undefined" && window.matchMedia(QUERY).matches;
    },
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

/** Colors for Recharts (axes, grid, tooltip) per resolved theme. */
export function chartTheme(dark: boolean): ChartTheme {
  return dark
    ? { grid: "#30363d", axis: "#9aa4b2", fg: "#e6edf3", tooltipBg: "#161b22", tooltipBorder: "#30363d" }
    : { grid: "#eee", axis: "#6b7280", fg: "#111827", tooltipBg: "#ffffff", tooltipBorder: "#e5e7eb" };
}
