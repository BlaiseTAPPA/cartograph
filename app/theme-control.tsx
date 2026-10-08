"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

// The root element's data-theme is the source of truth; the boot script sets
// it before hydration, so this reads it rather than keeping a copy in state.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function readTheme(): Theme {
  const value = document.documentElement.dataset.theme;
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  try {
    if (theme === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the choice still applies, it just won't survive a reload.
  }
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system");

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex h-6 items-center rounded border border-line text-[11px]"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={theme === option.value}
          onClick={() => applyTheme(option.value)}
          className="h-full px-2 text-muted hover:text-fg aria-pressed:bg-raised aria-pressed:text-fg"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
