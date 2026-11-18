"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/cn";

import { CLE_RETOUR_CATALOGUE } from "../_parcours";
import type { FicheClient } from "./Fiche";

// The top of a colourway sheet: identity, and the bags of the colourway (the
// chosen one gives Version 1, the current listing).

const STATUT_LIBELLE: Record<string, string> = {
  "En stock": "photos à préparer",
  "Photos prêtes": "photos prêtes",
  "En vente": "en vente",
  Vendu: "vendu",
};

// ── Header ──────────────────────────────────────────────────────────────────

export function EnTete({ fiche, cible, onCible }: { fiche: FicheClient; cible: string | null; onCible: (sku: string) => void }) {
  const { coloris } = fiche;
  // The catalogue with the filters Aramis left it with (sessionStorage, read after mount).
  const [retour, setRetour] = useState("/studio");
  useEffect(() => {
    try {
      const q = window.sessionStorage.getItem(CLE_RETOUR_CATALOGUE);
      if (q) setRetour(`/studio?${q}`);
    } catch {
      // Storage unavailable: plain catalogue.
    }
  }, []);

  return (
    <header className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex h-[76px] w-[60px] flex-none items-center justify-center overflow-hidden rounded-md border border-line bg-surface-2">
          {fiche.vignette ? (
            // eslint-disable-next-line @next/next/no-img-element -- relais privé /api/studio/vignette
            <img src={fiche.vignette} alt={`Vignette SacBase ${coloris.coloris}`} className="h-[68px] w-auto object-contain" />
          ) : (
            <span className="px-1 text-center font-mono text-xs text-ink-2">{coloris.modele}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={retour}
              className="inline-flex items-center gap-1 rounded-xs text-sm font-semibold text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <ArrowLeft size={14} aria-hidden /> Tous les coloris
            </Link>
            <span aria-hidden="true" className="text-ink-3">
              /
            </span>
            <span className="font-mono text-xs tracking-[0.14em] text-ink-2">
              {[fiche.generation, coloris.modele, coloris.cle].filter(Boolean).join(" · ")}
            </span>
          </div>
          <h1 className="mt-1 text-xl font-bold tracking-[-0.02em] text-ink">{coloris.coloris || coloris.cle}</h1>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
        {fiche.sacs.length === 0 ? (
          <span className="text-sm font-semibold text-ink">Hors catalogue SacBase</span>
        ) : (
          <span className="mr-1 text-sm text-ink-2">{fiche.cibles.length > 0 ? "Préparer pour" : "Sacs"}</span>
        )}
        {fiche.sacs.map((s) => {
          const estCible = s.sku === cible;
          const choisissable = fiche.cibles.includes(s.sku);
          return (
            <button
              key={s.sku}
              type="button"
              disabled={!choisissable}
              aria-pressed={estCible}
              onClick={() => onCible(s.sku)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-fast disabled:cursor-default",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                estCible ? "border-accent bg-accent-soft font-semibold text-ink" : "border-line bg-surface text-ink-2 enabled:hover:border-line-strong",
              )}
            >
              <span className="font-mono font-bold text-ink">{s.sku}</span>
              {STATUT_LIBELLE[s.statut] ?? s.statut.toLowerCase()}
            </button>
          );
        })}
      </div>
    </header>
  );
}
