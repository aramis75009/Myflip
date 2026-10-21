"use client";

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * NATIVE checkbox (e2e contract: `input[type=checkbox]`). With a `label`, the
 * whole label is the target, 44 × 44 at least (`p-3 -m-3`).
 */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: ReactNode }
>(function Checkbox({ label, className, ...props }, ref) {
  const caseACocher = (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-5 w-5 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed md:h-4 md:w-4",
        !label && className,
      )}
      {...props}
    />
  );
  if (!label) return caseACocher;
  return (
    <label className={cn("-m-3 inline-flex cursor-pointer items-center gap-2.5 p-3 text-base text-ink", className)}>
      {caseACocher}
      <span>{label}</span>
    </label>
  );
});
