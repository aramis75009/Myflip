"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { joindreIds, useChampField } from "./field";

/**
 * Shared look of text fields. 44 px and 16 px under md (no iOS zoom), 36 px
 * and 14 px above. A read-only field is never dressed as a field.
 */
export const classesChamp = cn(
  "block w-full rounded border border-line-strong bg-surface px-3 text-md text-ink transition-colors duration-fast placeholder:text-ink-3 md:text-base",
  "focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
  "aria-[invalid=true]:border-neg aria-[invalid=true]:bg-neg-soft",
  "disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-3",
  "[&[readonly]]:border-transparent [&[readonly]]:bg-transparent [&[readonly]]:px-0",
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, id, "aria-describedby": decritPar, "aria-invalid": invalide, ...props },
  ref,
) {
  const champ = useChampField();
  return (
    <input
      ref={ref}
      id={id ?? champ?.id}
      aria-describedby={joindreIds(champ?.describedBy, decritPar)}
      aria-invalid={invalide ?? (champ?.invalid || undefined)}
      className={cn(classesChamp, "h-11 md:h-9", className)}
      {...props}
    />
  );
});
