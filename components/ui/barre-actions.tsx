"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Fixed action bar (bulk selection, sticky form actions). Above the mobile
 * dock and its safe area, right of the sidebar on desktop, always opaque.
 *
 * While open, its height (+ 8 px) is written to `--fab-offset` on <html>, so
 * that the assistant bubble moves above it; reset to 0px when it closes or
 * unmounts.
 */
export function BarreActions({
  ouverte,
  ton = "surface",
  "aria-label": ariaLabel,
  className,
  children,
}: {
  ouverte: boolean;
  ton?: "surface" | "bar";
  "aria-label": string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const racine = document.documentElement;
    const el = ref.current;
    if (!ouverte || !el) {
      racine.style.setProperty("--fab-offset", "0px");
      return;
    }
    const ecrire = () =>
      racine.style.setProperty("--fab-offset", `${Math.ceil(el.getBoundingClientRect().height) + 8}px`);
    ecrire();
    const observateur = new ResizeObserver(ecrire);
    observateur.observe(el);
    return () => {
      observateur.disconnect();
      racine.style.setProperty("--fab-offset", "0px");
    };
  }, [ouverte]);

  if (!ouverte) return null;

  return (
    <section
      ref={ref}
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-x-3 bottom-[calc(var(--dock-h)+env(safe-area-inset-bottom)+0.5rem)] z-dock flex items-center gap-2 rounded-lg px-3 py-2 shadow-over motion-safe:animate-entree",
        "md:bottom-4 md:left-[calc(var(--sidebar-w)+1.5rem)] md:right-6",
        ton === "bar" ? "bg-bar text-bar-ink" : "border border-line bg-surface text-ink",
        className,
      )}
    >
      {children}
    </section>
  );
}
