"use client";

import { setThemeMode, useThemeMode, type ThemeMode } from "@/lib/useTheme";

const OPTS: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: "system", icon: "🖥️", label: "System" },
  { mode: "light", icon: "☀️", label: "Light" },
  { mode: "dark", icon: "🌙", label: "Dark" },
];

export function ThemeToggle() {
  const mode = useThemeMode();
  return (
    <div className="flex gap-0.5 rounded-lg bg-subtle p-1" role="group" aria-label="Color theme">
      {OPTS.map((o) => (
        <button
          key={o.mode}
          onClick={() => setThemeMode(o.mode)}
          title={`${o.label} theme`}
          aria-pressed={mode === o.mode}
          className={`rounded-md px-2 py-1 text-sm ${
            mode === o.mode ? "bg-surface shadow" : "text-muted hover:text-fg"
          }`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
