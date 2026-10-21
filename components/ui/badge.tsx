import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

const TONS = {
  neutre: "bg-surface-2 text-ink-2",
  pos: "bg-pos-soft text-pos",
  neg: "bg-neg-soft text-neg",
  warn: "bg-warn-soft text-warn",
  accent: "bg-accent-soft text-accent-text",
} as const;

/** Short label. Its text carries the meaning; the tone only supports it. */
export function Badge({
  ton = "neutre",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { ton?: keyof typeof TONS }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-xs font-semibold",
        TONS[ton],
        className,
      )}
      {...props}
    />
  );
}

/**
 * Round counter (bell, menu, dock). The number is visual; screen readers
 * get `label` (e.g. « 3 articles à comptabiliser »).
 */
export function CountBadge({ count, label, className }: { count: number; label: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-st-compta-soft px-1 text-xs font-bold leading-none text-st-compta-ink",
        className,
      )}
    >
      <span aria-hidden>{count}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
