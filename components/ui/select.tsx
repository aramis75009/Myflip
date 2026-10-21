"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef, type SelectHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

import { joindreIds, useChampField } from "./field";

/**
 * NATIVE select (keyboard, mobile picker and e2e contract for free), with a
 * decorative chevron. `className` goes to the wrapper (width, margins),
 * `selectClassName` to the <select> itself.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { selectClassName?: string }
>(function Select(
  { className, selectClassName, id, "aria-describedby": decritPar, "aria-invalid": invalide, children, ...props },
  ref,
) {
  const champ = useChampField();
  return (
    <div className={cn("relative w-full", className)}>
      <select
        ref={ref}
        id={id ?? champ?.id}
        aria-describedby={joindreIds(champ?.describedBy, decritPar)}
        aria-invalid={invalide ?? (champ?.invalid || undefined)}
        className={cn(
          "block h-11 w-full cursor-pointer appearance-none rounded border border-line-strong bg-surface pl-3 pr-9 text-md text-ink transition-colors duration-fast md:h-9 md:text-base",
          "focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          "aria-[invalid=true]:border-neg aria-[invalid=true]:bg-neg-soft",
          "disabled:cursor-not-allowed disabled:bg-surface-3 disabled:text-ink-3",
          selectClassName,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
});
