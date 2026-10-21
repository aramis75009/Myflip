"use client";

import { RadioGroup } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type OptionSegment<T extends string = string> = { valeur: T; libelle: ReactNode };

const classeGroupe = "inline-flex items-center gap-0.5 rounded bg-surface-2 p-0.5";
const classeSegment = cn(
  "inline-flex h-11 min-w-0 items-center justify-center rounded-sm px-3 text-sm font-medium text-ink-2 transition-colors duration-fast md:h-8",
  "hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
);
// Selected: lifted surface + inset border + bolder text (never colour alone).
const classeChoisi = "bg-surface font-semibold text-ink ring-1 ring-inset ring-line-strong";

/**
 * Segmented control.
 * - `mode="radio"` (default): Radix RadioGroup (role=radiogroup, arrow keys,
 *   roving tabindex).
 * - `mode="boutons"`: role=group + <button aria-pressed>, for places where
 *   the e2e suite looks for buttons (dashboard periods).
 */
export function Segmented<T extends string>({
  label,
  value,
  onValueChange,
  options,
  mode = "radio",
  className,
}: {
  label: string;
  value: T;
  onValueChange: (valeur: T) => void;
  options: OptionSegment<T>[];
  mode?: "radio" | "boutons";
  className?: string;
}) {
  if (mode === "boutons") {
    return (
      <div role="group" aria-label={label} className={cn(classeGroupe, className)}>
        {options.map((o) => (
          <button
            key={o.valeur}
            type="button"
            aria-pressed={o.valeur === value}
            onClick={() => onValueChange(o.valeur)}
            className={cn(classeSegment, o.valeur === value && classeChoisi)}
          >
            {o.libelle}
          </button>
        ))}
      </div>
    );
  }

  return (
    <RadioGroup.Root
      aria-label={label}
      value={value}
      onValueChange={(v) => onValueChange(v as T)}
      orientation="horizontal"
      className={cn(classeGroupe, className)}
    >
      {options.map((o) => (
        <RadioGroup.Item
          key={o.valeur}
          value={o.valeur}
          className={cn(classeSegment, "data-[state=checked]:bg-surface data-[state=checked]:font-semibold data-[state=checked]:text-ink data-[state=checked]:ring-1 data-[state=checked]:ring-inset data-[state=checked]:ring-line-strong")}
        >
          {o.libelle}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
