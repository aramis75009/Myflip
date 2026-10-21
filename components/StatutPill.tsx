"use client";

import { ChevronDown } from "lucide-react";
import { STATUTS } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { styleStatut } from "@/lib/statutColors";

// Status selector dressed as a pill.
//
// It is a NATIVE <select> on purpose: the native list opens outside the DOM
// flow. A custom menu would be clipped by the Stock's virtualised container,
// and would lose keyboard navigation and the native picker on mobile.
// `appearance: none` only removes the system chevron.
//
// Neutral background, the status colour carried by the text (`texte` of
// styleStatut, ≥ 4.5:1): the SKU column already carries a rule in the status
// colour, a filled pastel here would repeat it.
//
// FIXED WIDTH (140 px, measured on the Direction C mock-up): a column of
// aligned controls, not badges of uneven widths. Fixed height too: the Stock
// row height (and its virtualisation) depends on it.

type Props = {
  value: string;
  onChange: (statut: string) => void;
  /**
   * "sm" = desktop table row: 32 px high, 140 px wide.
   * "md" = mobile card: 44 px, full width (touch target).
   */
  size?: "sm" | "md";
  ariaLabel?: string;
  className?: string;
};

export default function StatutPill({
  value,
  onChange,
  size = "sm",
  ariaLabel,
  className = "",
}: Props) {
  const s = styleStatut(value);
  const md = size === "md";

  return (
    <span className={cn("relative inline-flex items-center", md ? "h-11 w-full" : "h-8 w-[140px]", className)}>
      <select
        value={value}
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "peer absolute inset-0 h-full w-full cursor-pointer appearance-none truncate rounded-full border border-line bg-surface-2 font-semibold leading-none transition-colors duration-fast hover:border-line-strong",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          s.texte,
          md ? "pl-4 pr-9 text-md" : "pl-2.5 pr-7 text-xs",
        )}
      >
        {STATUTS.map((statut) => (
          <option key={statut} value={statut} className="bg-surface text-ink">
            {statut}
          </option>
        ))}
      </select>

      {/* Discreet chevron, stronger on hover: says « control » without the
          system rendering. */}
      <ChevronDown
        aria-hidden="true"
        strokeWidth={2.75}
        className={cn(
          "pointer-events-none absolute opacity-45 transition-opacity duration-fast peer-hover:opacity-90 peer-focus-visible:opacity-90",
          s.texte,
          md ? "right-3 h-4 w-4" : "right-2.5 h-3 w-3",
        )}
      />
    </span>
  );
}
