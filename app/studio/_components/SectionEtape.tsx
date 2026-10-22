"use client";

import { ChevronDown } from "lucide-react";
import type { DragEventHandler, ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { Etape } from "../_parcours";

export const idEtape = (e: Etape) => `etape-${e}`;

/**
 * One step of a colourway sheet: number, title, one-line state, and actions
 * that stay reachable while the step is folded (« Ajouter des photos »).
 *
 * Accordion pattern: the heading holds the toggle button (aria-expanded);
 * the whole header row is its click area. Folded, the body stays MOUNTED
 * (`hidden`): a choice of cells or a launch in progress survives folding.
 */
export function SectionEtape({
  etape,
  numero,
  titre,
  resume,
  actions,
  ouverte,
  courante = false,
  onBasculer,
  onDragOver,
  onDragLeave,
  onDrop,
  survolee = false,
  children,
}: {
  etape: Etape;
  numero: number;
  titre: string;
  /** State of the step, always visible (« 9 / 15 prises »). */
  resume: ReactNode;
  actions?: ReactNode;
  ouverte: boolean;
  /** The step that holds the next action: marked by the filled number and a hidden label. */
  courante?: boolean;
  onBasculer: () => void;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
  survolee?: boolean;
  children: ReactNode;
}) {
  const id = idEtape(etape);
  return (
    <section
      id={id}
      aria-labelledby={`${id}-titre`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "scroll-mt-4 rounded-lg border bg-surface transition-colors duration-fast",
        courante ? "border-line-strong" : "border-line",
        survolee && "border-accent bg-accent-soft",
      )}
    >
      <div className="group relative flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <span
          aria-hidden="true"
          className={cn(
            "flex h-8 w-8 flex-none items-center justify-center rounded-full font-mono text-sm font-bold",
            courante ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink-2",
          )}
        >
          {numero}
        </span>
        <h2 id={`${id}-titre`} className="text-lg font-bold tracking-[-0.01em] text-ink">
          <button
            type="button"
            aria-expanded={ouverte}
            aria-controls={`${id}-corps`}
            aria-describedby={`${id}-resume`}
            onClick={onBasculer}
            className="rounded-sm text-left after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {titre}
            {courante && <span className="sr-only"> (prochaine action)</span>}
          </button>
        </h2>
        <span id={`${id}-resume`} className="min-w-0 flex-1 text-base text-ink-2">
          {resume}
        </span>
        {actions ? <div className="relative z-raised flex flex-none flex-wrap items-center gap-2">{actions}</div> : null}
        <ChevronDown
          aria-hidden="true"
          size={18}
          className={cn("flex-none text-ink-3 transition-transform duration-fast group-hover:text-ink", !ouverte && "-rotate-90")}
        />
      </div>
      <div id={`${id}-corps`} hidden={!ouverte} className="border-t border-line px-5 pb-5 pt-4">
        {children}
      </div>
    </section>
  );
}
