"use client";

import { Moon, Sun } from "lucide-react";

import { appliquerTheme } from "@/lib/themeMeta";

// Light / dark switch. The theme is set before the first paint by the inline
// script (lib/themeMeta.ts). This button holds NO React state: what it shows
// and its accessible name come from CSS (.theme-seul-clair / .theme-seul-sombre
// in globals.css), so the server HTML is already right in both themes.
export default function ThemeToggle() {
  function basculer() {
    const actuel = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    appliquerTheme(actuel === "dark" ? "light" : "dark");
  }

  return (
    <button
      type="button"
      data-theme-toggle
      onClick={basculer}
      className="flex h-11 w-11 items-center justify-center rounded text-ink-2 transition-colors hover:bg-surface-2 hover:text-accent-text md:h-10 md:w-10"
    >
      <Sun className="theme-seul-sombre h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
      <Moon className="theme-seul-clair h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
      <span className="theme-seul-sombre sr-only">Passer en thème clair</span>
      <span className="theme-seul-clair sr-only">Passer en thème sombre</span>
    </button>
  );
}
