"use client";

import { Fragment } from "react";
import { Check, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { diffMotsCles, diffTitre, nbChanges, type MotDiff, type Proposition } from "@/lib/studioReformulation";

const LIBELLE = "text-xs font-bold uppercase tracking-[0.05em] text-ink-3";

/** Les mots d'un texte, ceux qui ont changé surlignés (`<mark>` : annoncé comme surligné par les lecteurs d'écran). */
function Surligne({ segments, separateur }: { segments: readonly MotDiff[]; separateur: string }) {
  return (
    <>
      {segments.map((s, i) => (
        <Fragment key={`${i}-${s.texte}`}>
          {i > 0 && separateur}
          {s.change ? (
            <mark className="-mx-px rounded-xs bg-warn-soft px-[3px] font-bold text-ink underline decoration-warn decoration-2 underline-offset-2">{s.texte}</mark>
          ) : (
            s.texte
          )}
        </Fragment>
      ))}
    </>
  );
}

/**
 * L'encadré d'une reformulation : le nouveau titre et les nouveaux mots-clés,
 * les mots changés surlignés (diff mot à mot, `lib/studioReformulation.ts`).
 * Rien n'est enregistré ici : « Garder » écrit, « Proposer autre chose » relance
 * un appel, fermer ne fait rien. Les tirets et le SKU ne bougent jamais.
 */
export function PropositionReformulation({
  base,
  proposition,
  attente,
  enregistrement,
  erreur,
  onGarder,
  onAutre,
  onFermer,
}: {
  /** Le titre et les mots-clés enregistrés au moment de la demande : ce contre quoi on surligne. */
  base: Proposition | null;
  proposition: Proposition | null;
  /** Un appel est en cours. */
  attente: boolean;
  /** « Garder » est en cours d'enregistrement. */
  enregistrement: boolean;
  erreur: string | null;
  onGarder: () => void;
  onAutre: () => void;
  onFermer: () => void;
}) {
  const titre = proposition && base ? diffTitre(base.titre, proposition.titre) : [];
  const mots = proposition && base ? diffMotsCles(base.motsCles, proposition.motsCles) : [];
  const nb = nbChanges(titre) + nbChanges(mots);

  return (
    <section id="proposition" aria-label="Proposition de reformulation" aria-live="polite" className="mt-3 rounded-md border border-accent bg-accent-soft p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold uppercase tracking-[0.05em] text-accent-text">Proposition</span>
        <Button variant="ghost" size="sm" onClick={onFermer} disabled={enregistrement} aria-label="Fermer la proposition" title="Fermer sans rien enregistrer">
          <X size={14} aria-hidden /> Fermer
        </Button>
      </div>

      {erreur && (
        <p role="alert" data-testid="proposition-erreur" className="mt-2 rounded-sm border border-neg bg-neg-soft px-3 py-2 text-base text-ink">
          {erreur}
        </p>
      )}

      {proposition && base ? (
        <div className={cn(attente && "opacity-40")}>
          <span className={cn("mt-3 block", LIBELLE)}>Titre</span>
          <p data-testid="proposition-titre" className="mt-1 text-md font-bold text-ink">
            <Surligne segments={titre} separateur=" " />
          </p>
          <span className={cn("mt-3 block", LIBELLE)}>Mots-clés</span>
          <p data-testid="proposition-mots-cles" className="mt-1 text-base leading-[1.6] text-ink">
            <Surligne segments={mots} separateur=", " />
          </p>
          <p className="mt-3 text-sm text-ink-2">
            {nb === 0 ? (
              "Aucun mot n’a changé : propose autre chose. "
            ) : (
              <>
                <span className="-mx-px rounded-xs bg-warn-soft px-[3px] font-bold text-ink underline decoration-warn decoration-2 underline-offset-2">Surligné</span> : mots changés.{" "}
              </>
            )}
            Les tirets et le SKU ne bougent pas.
          </p>
        </div>
      ) : (
        !erreur && <p className="mt-2 text-base text-ink-2">Reformulation en cours…</p>
      )}

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        {proposition && (
          <Button size="sm" onClick={onGarder} disabled={attente} pending={enregistrement} pendingLabel="Enregistrement…">
            <Check size={14} aria-hidden /> Garder
          </Button>
        )}
        {(proposition || erreur) && (
          <Button variant="secondary" size="sm" onClick={onAutre} disabled={enregistrement} pending={attente} pendingLabel="Reformulation…">
            <RefreshCw size={14} aria-hidden /> {proposition ? "Proposer autre chose" : "Réessayer"}
          </Button>
        )}
      </div>
    </section>
  );
}
