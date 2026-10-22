"use client";

import { CircleAlert } from "lucide-react";
import { createContext, useContext, useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type ChampContexte = { id: string; describedBy: string | undefined; invalid: boolean };

const ChampContext = createContext<ChampContexte | null>(null);

/** Context of the enclosing Field (id, aria-describedby, aria-invalid), or null. */
export function useChampField(): ChampContexte | null {
  return useContext(ChampContext);
}

/** Joins aria-describedby ids, ignoring empty values. */
export function joindreIds(...ids: (string | undefined | null | false)[]): string | undefined {
  const s = ids.filter(Boolean).join(" ");
  return s || undefined;
}

/**
 * Labelled form field. Input, Textarea and Select read its context: the
 * label is tied by `htmlFor`, the hint and the error by `aria-describedby`,
 * and an error sets `aria-invalid`.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const aideId = `${id}-aide`;
  const erreurId = `${id}-erreur`;
  const valeur: ChampContexte = {
    id,
    describedBy: joindreIds(hint ? aideId : null, error ? erreurId : null),
    invalid: Boolean(error),
  };

  return (
    <ChampContext.Provider value={valeur}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={id} className="text-sm font-medium text-ink-2">
          {label}
        </label>
        {children}
        {hint ? (
          <p id={aideId} className="text-sm text-ink-3">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={erreurId} className="flex items-start gap-1.5 text-sm text-neg">
            <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </div>
    </ChampContext.Provider>
  );
}
