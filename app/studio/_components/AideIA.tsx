"use client";

import { Check, CircleAlert, RotateCcw, ScanSearch, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { scoreVerif } from "@/lib/studioFiche";

type DetailVerif = { detail: string; statut: string; note: string };
type Verif = { details: DetailVerif[]; scoreGlobal: number; verdict: string };

function lireVerif(v: unknown): Verif | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Partial<Verif>;
  if (!Array.isArray(o.details) || typeof o.verdict !== "string") return null;
  return o as Verif;
}

/**
 * A failure kept by the server inside `verifIA` (`{ erreur: { code, message } }`,
 * the shape proposed in docs/refonte/contrat-studio-api.md, question 3), once
 * the route stores one. Until then a failure only lives in this session.
 */
export function echecRange(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const e = o.erreur ?? o.echec;
  if (typeof e === "string" && e) return e;
  if (typeof e === "object" && e !== null && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message;
  return null;
}

/** The AI verdict is a SUGGESTION: it borrows nothing from Aramis's decision words. */
const SUGGESTIONS: Record<string, { texte: string; cls: string; barre: string }> = {
  ok: { texte: "valider", cls: "bg-pos-soft text-pos", barre: "bg-pos" },
  a_corriger: { texte: "corriger", cls: "bg-warn-soft text-ink", barre: "bg-warn" },
  rejet: { texte: "rejeter", cls: "bg-neg-soft text-neg", barre: "bg-neg" },
};

/** A detail the requested angle cannot show: not a failure of the generator. */
const HORS_CHAMP = "Hors champ";

/**
 * The AI opinion, presented as a help: a suggestion, an indicative score and
 * the checked details. Four distinct states: in progress, given, FAILED (with
 * its reason and « Relancer l'avis »), and not asked yet (paid, so only on demand).
 */
export default function AideIA({
  verifIA,
  enCours,
  echec,
  onDemander,
}: {
  verifIA: unknown;
  enCours: boolean;
  /** Reason of a failed opinion (this session, or stored by the server). */
  echec: string | null;
  onDemander: () => void;
}) {
  const verif = lireVerif(verifIA);
  const score = scoreVerif(verifIA);
  const suggestion = verif ? SUGGESTIONS[verif.verdict] ?? SUGGESTIONS.a_corriger : null;
  const raison = echec ?? echecRange(verifIA);

  return (
    <section aria-label="Avis de l’IA" className="rounded-md border border-line bg-surface-2 p-4">
      <p className="text-base">
        <span className="font-semibold text-ink">Avis de l’IA</span>
        <span className="text-sm text-ink-2"> · une aide, pas une décision</span>
      </p>
      {enCours ? (
        <p role="status" className="mt-2 text-sm text-ink-2">
          Avis en cours…
        </p>
      ) : verif && suggestion ? (
        <>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink">
            L’IA suggère : <span className={cn("rounded-xs px-1.5 py-0.5 font-semibold", suggestion.cls)}>{suggestion.texte}</span>
            {score !== null && <span className="font-mono text-sm text-ink-2">score {score}/100, indicatif</span>}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
            <div className={cn("h-1.5 rounded-full", suggestion.barre)} style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} />
          </div>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm">
            {verif.details.map((d) => {
              const ok = d.statut === "fidele";
              const horsChamp = !ok && d.note?.startsWith(HORS_CHAMP);
              return (
                <li key={d.detail} className="flex items-start gap-2">
                  <span className={cn("mt-0.5 flex-none", ok ? "text-pos" : horsChamp ? "text-ink-3" : "text-neg")} aria-hidden="true">
                    {ok ? <Check size={14} /> : horsChamp ? <span className="font-mono">–</span> : <X size={14} />}
                  </span>
                  <span>
                    <span className="font-medium text-ink">{d.detail}</span>
                    <span className="text-ink-2"> — {ok ? "fidèle" : d.note || d.statut}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : raison ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-start gap-1.5 text-ink">
            <CircleAlert size={15} aria-hidden className="mt-0.5 flex-none text-neg" />
            Avis IA en échec : {raison}
          </span>
          <Button variant="secondary" size="sm" onClick={onDemander}>
            <RotateCcw size={14} aria-hidden /> Relancer l’avis
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-2">
          Pas encore d’avis : il est payant, il ne part que si tu le demandes.
          <Button variant="secondary" size="sm" onClick={onDemander}>
            <ScanSearch size={14} aria-hidden /> Demander l’avis
          </Button>
        </div>
      )}
    </section>
  );
}
