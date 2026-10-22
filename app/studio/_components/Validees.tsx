"use client";

import { useState } from "react";
import { ChevronDown, ImageOff } from "lucide-react";

import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";

import type { EssaiClient, FicheClient } from "./Fiche";
import { SectionEtape } from "./SectionEtape";
import type { Decisions } from "./useParcours";

const dateCourte = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

/**
 * Step 5, the decisions: validated images by bag (the target bag first) —
 * those join the bag's listing — and, folded, the rejected ones of this
 * colourway. A rejection frees its cell but never vanishes: it stays here,
 * and counts in the summary. A decision still in its undo delay shows at once.
 */
export default function Validees({
  fiche,
  cible,
  decisions,
  nomDe,
  numero,
  ouverte,
  courante,
  onBasculer,
}: {
  fiche: FicheClient;
  cible: string | null;
  decisions: Decisions;
  nomDe: (id: string) => string;
  numero: number;
  ouverte: boolean;
  courante: boolean;
  onBasculer: () => void;
}) {
  const [rejetsOuverts, setRejetsOuverts] = useState(false);
  const decisionDe = (e: EssaiClient) => decisions.decisionDe(e.id) ?? e.decision;
  const enAttente = (e: EssaiClient) => decisions.decisionDe(e.id) !== null;
  const recents = (a: EssaiClient, b: EssaiClient) => b.createdAt.localeCompare(a.createdAt);

  const validees = fiche.essais.filter((e) => decisionDe(e) === "valide").sort(recents);
  const rejetees = fiche.essais.filter((e) => decisionDe(e) === "rejete").sort(recents);

  // By bag: the target first, then the others, then « sans sac ».
  const groupes = new Map<string, EssaiClient[]>();
  for (const e of validees) {
    const k = e.skuCible ?? "";
    groupes.set(k, [...(groupes.get(k) ?? []), e]);
  }
  const ordre = [...groupes.keys()].sort((a, b) => {
    if (a === cible) return -1;
    if (b === cible) return 1;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, "fr", { numeric: true });
  });

  const pourCible = cible ? groupes.get(cible)?.length ?? 0 : 0;
  const resume = [
    cible ? `${pourCible} pour ${cible}` : pluriel(validees.length, "validée", "validées"),
    pluriel(rejetees.length, "rejetée", "rejetées"),
  ].join(" · ");

  const prise = (e: EssaiClient) => fiche.lignes.find((l) => l.id === e.referenceId)?.prise ?? "photo";
  const angle = (e: EssaiClient) => fiche.angles.find((a) => a.id === e.angleId)?.nom ?? "angle archivé";

  return (
    <SectionEtape etape="validees" numero={numero} titre="Validées" resume={resume} ouverte={ouverte} courante={courante} onBasculer={onBasculer}>
      {validees.length === 0 ? (
        <EmptyState
          titre="Aucune image validée"
          description="Une image que tu valides rejoint ici les photos de son sac, puis son annonce à la mise en vente."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {ordre.map((sku) => {
            const liste = groupes.get(sku)!;
            return (
              <div key={sku || "sans-sac"}>
                <h3 className="text-base font-semibold text-ink">
                  {sku ? `${sku}${sku === cible ? " · prochaine annonce" : ""}` : "Sans sac"}
                  <span className="ml-2 font-mono text-xs font-medium text-ink-2">{liste.length}</span>
                </h3>
                {!sku && <p className="text-sm text-ink-2">Comptées au bilan, elles ne partent dans aucune annonce.</p>}
                <ul className="mt-2 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(128px,1fr))]">
                  {liste.map((e) => (
                    <li key={e.id} className="min-w-0">
                      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-pos bg-surface-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
                        <img src={`/api/studio/image?essai=${e.id}`} alt={`Validée : ${prise(e)}, ${angle(e)}`} loading="lazy" className="h-full w-full object-cover" />
                        {enAttente(e) && (
                          <span className="absolute left-1.5 top-1.5 rounded-xs bg-surface px-1.5 py-0.5 text-xs font-semibold text-ink-2">À l’instant</span>
                        )}
                      </div>
                      <p className="mt-1.5 truncate text-sm font-semibold text-ink">{prise(e)}</p>
                      <p className="truncate text-xs text-ink-2">
                        {angle(e)} · {nomDe(e.modele)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {rejetees.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <button
            type="button"
            aria-expanded={rejetsOuverts}
            onClick={() => setRejetsOuverts((o) => !o)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-sm text-base font-semibold text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <ChevronDown size={15} aria-hidden className={cn("transition-transform duration-fast", !rejetsOuverts && "-rotate-90")} />
            Rejetées sur ce coloris <span className="font-mono text-xs font-medium">{rejetees.length}</span>
          </button>
          {rejetsOuverts && (
            <>
              <p className="mt-1 max-w-[65ch] text-sm text-ink-2">Un rejet libère sa case pour une nouvelle variante ; il reste compté au bilan.</p>
              <ul className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(112px,1fr))]">
                {rejetees.map((e) => (
                  <li key={e.id} className="min-w-0">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-line bg-surface-2">
                      {e.purge ? (
                        <span className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center text-xs text-ink-3">
                          <ImageOff size={16} aria-hidden /> Image purgée
                        </span>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image
                        <img src={`/api/studio/image?essai=${e.id}`} alt={`Rejetée : ${prise(e)}, ${angle(e)}`} loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <p className="mt-1.5 truncate text-sm text-ink">{prise(e)}</p>
                    <p className="truncate text-xs text-ink-2">
                      {angle(e)} · {dateCourte(e.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </SectionEtape>
  );
}
