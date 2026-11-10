"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LIBELLES_ETAT, compterEtats, grouperParCommande, type EtatSac, type SacChezToi } from "@/lib/studioChezToi";

import { Badge } from "../_ui";

// /studio, the top of the home: the bags you have in hand, what each one still
// needs, grouped by Commande (the number comes from FLIPO). Three tiles count
// the states and filter the list (?etat=…): to photograph, to generate, ready.
//
// The state rules live in lib/studioChezToi.ts (pure, tested); this file only draws.

const TONS_ETAT: Record<EtatSac, "warn" | "neutre" | "acc"> = {
  a_photographier: "warn",
  a_generer: "neutre",
  pret: "acc",
};

export function VueChezToi({ sacs, etat, onEtat }: { sacs: SacChezToi[]; etat: EtatSac | null; onEtat: (e: EtatSac | null) => void }) {
  const compte = compterEtats(sacs);
  const groupes = grouperParCommande(sacs, etat);
  // A second click on the active tile takes the filter off.
  const basculer = (e: EtatSac) => onEtat(etat === e ? null : e);

  return (
    <section aria-label="Sacs chez toi" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 min-[820px]:grid-cols-[minmax(0,1.1fr)_repeat(3,minmax(0,1fr))]">
        <div className="rounded-lg bg-accent px-5 py-4 text-accent-ink">
          <div className="font-mono text-3xl font-bold leading-none">{compte.total}</div>
          <div className="mt-1.5 text-md">{compte.total > 1 ? "sacs" : "sac"} chez toi</div>
        </div>
        <Tuile n={compte.a_photographier} titre="À prendre en photo" detail="Coloris sans vraie photo." avertissement actif={etat === "a_photographier"} onClick={() => basculer("a_photographier")} />
        <Tuile n={compte.a_generer} titre="À générer" detail="Le coloris a ses photos, ce sac n’a pas encore d’images validées." actif={etat === "a_generer"} onClick={() => basculer("a_generer")} />
        <Tuile n={compte.pret} titre="Prêts" detail="Images validées, l’annonce peut partir." actif={etat === "pret"} onClick={() => basculer("pret")} />
      </div>

      {groupes.length === 0 ? (
        <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-line-strong px-4 py-3 text-base text-ink-2">
          {etat ? `Aucun sac « ${LIBELLES_ETAT[etat]} » chez toi.` : "Aucun sac chez toi pour l’instant."}
          {etat && (
            <Button variant="secondary" size="sm" onClick={() => onEtat(null)}>
              Voir tous les sacs
            </Button>
          )}
        </p>
      ) : (
        groupes.map((g) => (
          <section key={g.id} aria-labelledby={`sacs-${g.id}`}>
            <h2 id={`sacs-${g.id}`} className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-md font-semibold text-ink">
              {g.titre}
              <span className="text-base font-normal text-ink-2">{g.resume}</span>
            </h2>
            <ul className="overflow-hidden rounded-lg border border-line bg-surface">
              {g.sacs.map((s) => (
                <li key={s.sku} className="border-t border-line first:border-t-0">
                  <LigneSac sac={s} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}

/** A tile that counts one state and filters the list; only « to photograph » is highlighted (warning tone). */
function Tuile({ n, titre, detail, actif, avertissement, onClick }: { n: number; titre: string; detail: string; actif: boolean; avertissement?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // An active filter on an empty state stays clickable, so it can be taken off.
      disabled={n === 0 && !actif}
      aria-pressed={actif}
      className={cn(
        "flex flex-col items-start rounded-lg border px-4 py-3.5 text-left text-ink transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:opacity-60",
        avertissement ? "border-warn bg-warn-soft" : "border-line bg-surface",
        actif ? "ring-2 ring-inset ring-ink" : avertissement ? "enabled:hover:border-ink" : "enabled:hover:border-line-strong",
      )}
    >
      <span className={cn("font-mono text-2xl font-bold leading-none", avertissement && "text-warn")}>{n}</span>
      <span className="mt-1.5 text-md font-semibold">{titre}</span>
      <span className="mt-0.5 text-sm text-ink-2">{detail}</span>
    </button>
  );
}

/**
 * One bag: thumbnail of its colourway, SKU, colourway and generation, state,
 * and a link to the sheet. The whole row is the link. On a phone the state
 * moves up beside the SKU and « Ouvrir » is dropped (the row is the tap target).
 */
function LigneSac({ sac }: { sac: SacChezToi }) {
  const [vignetteKo, setVignetteKo] = useState(false);
  return (
    <Link
      href={`/studio/${encodeURIComponent(sac.cle)}`}
      data-sac={sac.sku}
      className={cn(
        "grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 text-ink transition-colors duration-fast hover:bg-surface-2",
        "min-[640px]:grid-cols-[48px_76px_minmax(0,1fr)_auto_auto]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
      )}
    >
      <span className="col-start-1 row-span-2 row-start-1 flex h-12 w-12 items-center justify-center overflow-hidden rounded-md bg-surface-2 min-[640px]:row-span-1">
        {sac.vignette && !vignetteKo ? (
          // eslint-disable-next-line @next/next/no-img-element -- relais privé /api/studio/vignette, pas d'optimisation Next
          <img src={sac.vignette} alt="" loading="lazy" onError={() => setVignetteKo(true)} className="block h-11 w-auto max-w-full object-contain" />
        ) : (
          <span className="max-w-full truncate px-0.5 font-mono text-xs text-ink-2">{sac.modele || "?"}</span>
        )}
      </span>

      <span className="col-start-2 row-start-1 justify-self-start rounded-xs bg-surface-2 px-1.5 py-0.5 font-mono text-sm font-semibold">{sac.sku}</span>

      <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 items-baseline gap-x-2 min-[640px]:col-span-1 min-[640px]:col-start-3 min-[640px]:row-start-1 min-[640px]:flex-col min-[640px]:items-start min-[640px]:gap-x-0">
        <span className="min-w-0 truncate text-md font-semibold">{sac.coloris || sac.cle}</span>
        {sac.generation && <span className="flex-none font-mono text-xs font-semibold text-ink-2">{sac.generation}</span>}
      </span>

      <span className="col-start-3 row-start-1 justify-self-end whitespace-nowrap min-[640px]:col-start-4">
        <Badge ton={TONS_ETAT[sac.etat]}>{LIBELLES_ETAT[sac.etat]}</Badge>
      </span>

      <span className="col-start-5 row-start-1 hidden items-center gap-1 text-base font-semibold text-accent-text min-[640px]:inline-flex">
        Ouvrir <ArrowRight size={15} aria-hidden />
      </span>
    </Link>
  );
}
