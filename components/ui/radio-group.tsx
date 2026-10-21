"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type OptionRadio<T extends string = string> = {
  valeur: T;
  libelle: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

/**
 * Single choice among a few visible options: <fieldset><legend> and NATIVE
 * radios (arrow keys for free). The selected option is marked by a 2 px
 * accent border AND a check mark, never by its background alone.
 */
export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  orientation = "vertical",
  className,
}: {
  legend: ReactNode;
  name: string;
  value: T | null;
  onChange: (valeur: T) => void;
  options: OptionRadio<T>[];
  orientation?: "vertical" | "horizontal";
  className?: string;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="mb-1.5 text-sm font-medium text-ink-2">{legend}</legend>
      <div className={cn("flex gap-2", orientation === "vertical" ? "flex-col" : "flex-wrap")}>
        {options.map((o) => {
          const choisi = o.valeur === value;
          return (
            <label
              key={o.valeur}
              className={cn(
                "relative flex min-h-hit cursor-pointer items-start gap-3 rounded border bg-surface px-3 py-2.5 transition-colors duration-fast md:min-h-0",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
                choisi ? "border-accent ring-1 ring-inset ring-accent" : "border-line-strong hover:bg-surface-2",
                o.disabled && "cursor-not-allowed bg-surface-3 text-ink-3",
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.valeur}
                checked={choisi}
                disabled={o.disabled}
                onChange={() => onChange(o.valeur)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  choisi ? "border-accent bg-accent text-accent-ink" : "border-line-strong",
                )}
              >
                {choisi ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-base font-medium text-ink">{o.libelle}</span>
                {o.description ? <span className="text-sm text-ink-2">{o.description}</span> : null}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
