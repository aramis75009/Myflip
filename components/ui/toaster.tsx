"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { Toaster } from "sonner";

function abonnerTheme(avertir: () => void): () => void {
  const obs = new MutationObserver(avertir);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const lireTheme = (): "light" | "dark" => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const themeServeur = (): "light" | "dark" => "light";

// Sonner styles its toasts with (0,2,0) selectors reading these variables:
// set on the toaster itself (inline beats its sheet), they make every toast
// follow the tokens, hence the theme, with no override war.
const STYLE = {
  zIndex: "var(--z-toast)",
  fontFamily: "var(--font-sans)",
  "--normal-bg": "rgb(var(--surface))",
  "--normal-border": "rgb(var(--line))",
  "--normal-text": "rgb(var(--ink))",
  "--border-radius": "var(--r-md)",
} as CSSProperties;

/**
 * The app's only toaster. Mounted BEFORE the frame in app/layout.tsx, so a
 * toast fired by a page effect on first render is not lost (probe X15).
 *
 * - theme read from <html data-theme> (MutationObserver);
 * - above the assistant bubble and the dock, and above an open action bar
 *   (--fab-offset);
 * - `pointer-events-auto`: a toast stays clickable while a Radix modal sets
 *   `pointer-events: none` on the body (the Dialog ignores clicks inside
 *   [data-sonner-toaster], so the modal stays open).
 */
export function AppToaster() {
  const theme = useSyncExternalStore(abonnerTheme, lireTheme, themeServeur);
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      closeButton
      offset={{ bottom: "calc(6rem + var(--fab-offset, 0px))", right: 24 }}
      mobileOffset={{ bottom: "calc(var(--dock-h) + env(safe-area-inset-bottom) + 5rem + var(--fab-offset, 0px))" }}
      style={STYLE}
      toastOptions={{
        classNames: {
          toast: "bg-surface text-ink border border-line shadow-over rounded-md font-sans text-sm pointer-events-auto",
        },
      }}
    />
  );
}
