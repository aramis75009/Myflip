"use client";
// design-tokens-dette: R12 → LZ

import { cn } from "@/lib/cn";

type Props = {
  label?: string;
  size?: "sm" | "md";
};

// Two complete templates rather than parallel ternaries: a size reads here
// in one block, and adding one happens in one place.
const GABARITS = {
  sm: { svg: 48, tuile: "p-2.5", py: "py-8", texte: "text-sm" },
  md: { svg: 72, tuile: "p-3.5", py: "py-16", texte: "text-base" },
} as const;

const TRACE = "M27 69 V31 L48 54 L69 31 V69";

/**
 * TRACE loader: the monoline M drawing itself on an accent tile, then the
 * label and three dots. Announced politely to screen readers.
 *
 * e2e contract (F1): the label is the FIRST text node of its div.
 * The two TRACE animations (atlas-draw, atlas-dots, keyframes in
 * globals.css) are identity, deferred: they stay inline until lot LZ.
 */
export default function Loader({ label = "Chargement", size = "md" }: Props) {
  const g = GABARITS[size];

  return (
    <div role="status" aria-live="polite" className={cn("flex flex-col items-center justify-center gap-4", g.py)}>
      <div className={cn("inline-flex rounded-lg bg-accent", g.tuile)}>
        <svg aria-hidden="true" width={g.svg} height={g.svg} viewBox="0 0 96 96" fill="none">
          <path
            d={TRACE}
            fill="none"
            className="stroke-accent-ink/30"
            strokeWidth="8.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={TRACE}
            fill="none"
            className="stroke-accent-ink"
            strokeWidth="8.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="100"
            style={{
              strokeDasharray: 100,
              animation: "atlas-draw 2.1s cubic-bezier(.65,.05,.36,1) infinite",
            }}
          />
        </svg>
      </div>
      <div className={cn("flex items-baseline gap-[3px] font-semibold tracking-[-0.01em] text-ink", g.texte)}>
        {label}
        <span aria-hidden="true" className="ml-px inline-flex gap-[3px]">
          {([0, 0.2, 0.4] as const).map((delay, i) => (
            <span
              key={i}
              className="inline-block h-[3px] w-[3px] rounded-full bg-pos"
              style={{ animation: "atlas-dots 1.4s infinite", animationDelay: `${delay}s` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
