// Charts of /studio/bilan, drawn with plain elements and tokens (no chart
// library, nothing hard-coded): they follow both themes by construction.
//
// Forms (dataviz skill): one measure per chart, one hue (`chart`) per
// measure, no dual axis, bars ≤ 24 px with a 4 px rounded data end and a
// square baseline, values written with TEXT tokens next to the marks, a
// tooltip on hover AND focus for the columns, and a table view for the weeks.

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { formatEur } from "@/lib/studioModeles";

import type { SemaineDepense } from "../_bilan";

const jourMois = (iso: string) => {
  const [, m, j] = iso.split("-");
  return `${j}/${m}`;
};

/**
 * A horizontal bar for a share (0 to 1) or a magnitude already divided by its
 * maximum. `part` null = no value: an empty dashed track, and `libelle` says why.
 */
export function Barre({ part, libelle, etiquette }: { part: number | null; libelle: ReactNode; etiquette: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span role="img" aria-label={etiquette} className={cn("relative h-3 min-w-0 flex-1", part === null && "rounded-xs border border-dashed border-line-strong")}>
        {part !== null && (
          <span
            className="absolute inset-y-0 left-0 rounded-r-xs bg-chart"
            // A real zero is a hairline, never nothing: the value exists.
            style={{ width: part > 0 ? `max(2px, ${Math.min(part, 1) * 100}%)` : "2px" }}
          />
        )}
      </span>
      <span className="w-28 flex-none text-right font-mono text-sm tabular-nums text-ink">{libelle}</span>
    </div>
  );
}

/**
 * Spending per week, oldest on the left. Each column says its amount on hover
 * and focus; the highest and the current week are labelled on their cap. A
 * week with images but no real cost is a minimum (« ≥ »), never a zero.
 */
export function ColonnesSemaines({ semaines, taux }: { semaines: SemaineDepense[]; taux: number }) {
  const eur = (s: SemaineDepense) => s.usd * taux;
  const max = Math.max(...semaines.map(eur), 0);
  const iMax = max > 0 ? semaines.findIndex((s) => eur(s) === max) : -1;
  const derniere = semaines.length - 1;
  const montant = (s: SemaineDepense) => `${s.sansCout > 0 ? "≥ " : ""}${formatEur(eur(s))}`;

  return (
    <div>
      <ol aria-label="Dépenses par semaine" className="flex h-44 items-end gap-1 border-b border-line pt-6">
        {semaines.map((s, i) => {
          const h = max > 0 ? (eur(s) / max) * 100 : 0;
          const detail = `Semaine du ${jourMois(s.debut)} : ${montant(s)}, ${s.images} image${s.images > 1 ? "s" : ""}${
            s.sansCout > 0 ? `, dont ${s.sansCout} sans coût connu` : ""
          }`;
          return (
            <li
              key={s.debut}
              tabIndex={0}
              aria-label={detail}
              className="group relative flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end rounded-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              {(i === iMax || i === derniere) && eur(s) > 0 && (
                <span className="mb-1 whitespace-nowrap font-mono text-xs tabular-nums text-ink-2">{montant(s)}</span>
              )}
              <span
                aria-hidden
                className={cn(
                  "w-full max-w-6 rounded-t-xs transition-colors duration-fast",
                  eur(s) > 0 ? "bg-chart group-hover:bg-accent-hover group-focus-visible:bg-accent-hover" : "bg-transparent",
                )}
                style={{ height: eur(s) > 0 ? `max(2px, ${h}%)` : 0 }}
              />
              <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-tooltip mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-xs bg-bar px-2 py-1 text-xs text-bar-ink shadow-pop group-hover:block group-focus-visible:block"
              >
                <strong className="font-semibold">{montant(s)}</strong> · semaine du {jourMois(s.debut)}
                {s.sansCout > 0 ? ` · ${s.sansCout} sans coût` : ""}
              </span>
            </li>
          );
        })}
      </ol>
      <ol aria-hidden className="mt-1.5 flex gap-1">
        {semaines.map((s, i) => (
          <li key={s.debut} className="min-w-0 flex-1 text-center font-mono text-xs text-ink-3">
            {i % 2 === derniere % 2 ? jourMois(s.debut) : ""}
          </li>
        ))}
      </ol>
      <details className="mt-3 text-sm text-ink-2">
        <summary className="cursor-pointer rounded-xs font-semibold hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          Voir les chiffres
        </summary>
        <table className="mt-2 w-full max-w-md text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th scope="col" className="pb-1 font-medium">
                Semaine du
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Images
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Dépensé
              </th>
            </tr>
          </thead>
          <tbody>
            {semaines.map((s) => (
              <tr key={s.debut} className="border-t border-line">
                <th scope="row" className="py-1 text-left font-mono font-normal">
                  {jourMois(s.debut)}
                </th>
                <td className="py-1 text-right font-mono tabular-nums">{s.images}</td>
                <td className="py-1 text-right font-mono tabular-nums text-ink">{montant(s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
