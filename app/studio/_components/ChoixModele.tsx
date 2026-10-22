"use client";

import { RotateCcw, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { libelleTarif, type ModeleImage } from "@/lib/studioModeles";

import type { ContexteModeles } from "./SelecteurModeles";

/**
 * TEMPORARY model picker of the « Génération » step: favourites (or the first
 * three of the catalogue) as pills, the rest in « Autre modèle… ».
 *
 * ⚠️ PLACEHOLDER for the « Studio, modèles » lot (PRD § 13, step 5): the real
 * picker (search, toggleable favourites, price per image and per bag, first-try
 * success rate, real average cost, out-of-budget badge, 1 to 3 models per
 * launch) REPLACES this component, in the `data-emplacement="selecteur-modeles"`
 * slot of Generation.tsx. Its contract with the step is only
 * `choisi` / `onChoisir` (one model today, an array tomorrow).
 */
export default function ChoixModele({
  modeles,
  choisi,
  onChoisir,
}: {
  modeles: ContexteModeles;
  choisi: ModeleImage | null;
  onChoisir: (id: string) => void;
}) {
  const catalogue = modeles.catalogue?.modeles ?? [];
  const parId = new Map(catalogue.map((m) => [m.id, m]));
  const favoris = modeles.favoris.map((id) => parId.get(id)).filter((m): m is ModeleImage => !!m);
  const proposes = favoris.length > 0 ? favoris : catalogue.slice(0, 3);
  // A model picked in « Autre modèle… » stays visible, pressed, next to the proposed ones.
  const visibles = choisi && !proposes.some((m) => m.id === choisi.id) ? [...proposes, choisi] : proposes;

  if (modeles.chargement && !modeles.catalogue) {
    return (
      <p role="status" className="text-sm text-ink-2">
        Chargement du catalogue…
      </p>
    );
  }
  if (modeles.erreur && !modeles.catalogue) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-ink">
        <span>Catalogue indisponible ({modeles.erreur}) : génère « À la main, dans Gemini » ou réessaie.</span>
        <Button variant="secondary" size="sm" onClick={modeles.recharger}>
          <RotateCcw size={14} aria-hidden /> Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visibles.map((m) => {
        const actif = choisi?.id === m.id;
        const favori = favoris.includes(m);
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={actif}
            onClick={() => onChoisir(m.id)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-base font-semibold transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              actif ? "border-accent bg-accent-soft text-ink" : "border-line bg-surface text-ink-2 hover:text-ink",
            )}
          >
            {favori && <Star size={12} className="fill-current text-warn" aria-label="favori" />}
            {m.nom}
            <span className="font-mono text-xs font-medium text-ink-2">{libelleTarif(m.tarif)}</span>
          </button>
        );
      })}
      {catalogue.length > visibles.length && (
        <select
          value=""
          onChange={(e) => e.target.value && onChoisir(e.target.value)}
          aria-label="Autre modèle"
          className="h-10 rounded-full border border-line bg-surface px-3 text-sm text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <option value="">Autre modèle…</option>
          {catalogue
            .filter((m) => !visibles.includes(m))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.nom} — {libelleTarif(m.tarif)}
              </option>
            ))}
        </select>
      )}
    </div>
  );
}
