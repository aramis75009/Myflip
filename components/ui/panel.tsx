import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const PADDING = { sm: "p-3", md: "p-5", lg: "p-6" } as const;
const PADDING_X = { sm: "px-3", md: "px-5", lg: "px-6" } as const;

/** Panel: surface + hairline, no shadow (depth comes from tones and lines). */
export function Panel({
  titre,
  titreAs: Titre = "h2",
  aside,
  actions,
  pied,
  padding = "md",
  className,
  children,
}: {
  titre?: ReactNode;
  titreAs?: "h2" | "h3";
  /** Secondary text next to the title (period, count…). */
  aside?: ReactNode;
  actions?: ReactNode;
  pied?: ReactNode;
  padding?: keyof typeof PADDING;
  className?: string;
  children: ReactNode;
}) {
  const enTete = titre || aside || actions;
  return (
    <section className={cn("rounded-lg border border-line bg-surface", className)}>
      {enTete ? (
        <div className={cn("flex flex-wrap items-start justify-between gap-x-3 gap-y-1 pt-4", PADDING_X[padding])}>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            {titre ? <Titre className="text-base font-semibold text-ink">{titre}</Titre> : null}
            {aside ? <span className="text-sm text-ink-3">{aside}</span> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={PADDING[padding]}>{children}</div>
      {pied ? <div className={cn("border-t border-line py-3", PADDING_X[padding])}>{pied}</div> : null}
    </section>
  );
}
