"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, RotateCcw, ScanSearch, Sparkles, Trash2, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { compilerCorrection, detailsEnLignes } from "@/lib/studioAngles";
import { MODELE_MANUEL, detailsDerivants, modeleDe, scoreVerif } from "@/lib/studioFiche";
import { formatUsd } from "@/lib/studioModeles";
import { Badge, btn, btnAcc } from "../_ui";
import { lireErreur } from "./envoi";
import type { EssaiClient, RefClient } from "./FicheColoris";
import { copier } from "./LigneAngle";

type DetailVerif = { detail: string; statut: string; note: string };
type Verif = { details: DetailVerif[]; angleRespecte: boolean; scoreGlobal: number; verdict: string };

const VERDICTS: Record<string, { texte: string; ton: "pos" | "warn" | "neg" }> = {
  ok: { texte: "OK", ton: "pos" },
  a_corriger: { texte: "À CORRIGER", ton: "warn" },
  rejet: { texte: "REJET", ton: "neg" },
};
const STATUTS: Record<string, { texte: string; ton: "pos" | "neg" | "neutre" }> = {
  fidele: { texte: "fidèle", ton: "pos" },
  derive: { texte: "dérive", ton: "neg" },
  absent: { texte: "absent", ton: "neutre" },
};

function lireVerif(v: unknown): Verif | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Partial<Verif>;
  if (!Array.isArray(o.details) || typeof o.verdict !== "string") return null;
  return o as Verif;
}

/** Régénération d'un essai api avec son modèle : ce que la ligne d'angle permet, et l'encadré de confirmation. */
export type Regeneration = {
  /** Pourquoi on ne peut pas régénérer maintenant, ou null. */
  raison: string | null;
  /** Devis de la régénération, déjà formaté. */
  estimation: string;
  onRegenerer: (detailsCorrection: string[]) => void;
  /** Encadré de confirmation quand la régénération de CET essai l'attend. */
  confirmation: ReactNode;
};

/** Coût affiché d'un essai api : le réel, sinon l'estimation du lancement, jamais un zéro inventé. */
function coutEssai(e: EssaiClient): { texte: string; titre: string } | null {
  if (e.source !== "api") return null;
  if (e.coutReelUsd !== null) return { texte: formatUsd(e.coutReelUsd), titre: "Coût réel facturé par OpenRouter" };
  if (e.coutEstimeUsd !== null) return { texte: `estimé ${formatUsd(e.coutEstimeUsd)}`, titre: "OpenRouter n’a pas renvoyé le coût réel : estimation au lancement" };
  return { texte: "coût inconnu", titre: "Ni coût réel ni estimation (tarif au jeton ou inconnu)" };
}

const imageCls = "aspect-[3/4] w-full rounded-xl border border-[var(--border)] object-cover";
const videCls = "flex aspect-[3/4] items-center justify-center rounded-xl border border-dashed border-[var(--border)] text-[12px] text-[var(--ink2)]";
const legendeCls = "mb-1 font-mono text-[10px] tracking-[0.1em] text-[var(--faint)]";

/**
 * Un essai : comparaison référence ↔ image générée, verdict IA (une aide), et
 * la décision d'Aramis — la seule qui compte au bilan (spec §6).
 */
export default function CarteEssai({
  essai,
  reference,
  details,
  nomModele,
  correctionDe,
  verifEnCours,
  onVerifier,
  regeneration,
}: {
  essai: EssaiClient;
  reference: RefClient | null;
  details: string;
  nomModele: string;
  /** Numéro de l'essai raté que celui-ci corrige, s'il y en a un. */
  correctionDe: number | null;
  verifEnCours: boolean;
  onVerifier: () => void;
  /** null pour un dépôt manuel : la correction passe alors par le prompt à copier. */
  regeneration: Regeneration | null;
}) {
  const router = useRouter();
  const [correction, setCorrection] = useState(false);
  const [choisis, setChoisis] = useState<string[] | null>(null);
  const verif = lireVerif(essai.verifIA);
  const score = scoreVerif(essai.verifIA);
  const derivants = detailsDerivants(essai.verifIA);
  // Détails proposés pour la correction : ceux qui dérivent selon l'IA, sinon tous ceux du coloris.
  const candidats = derivants.length > 0 ? derivants : detailsEnLignes(details);
  const selection = choisis ?? derivants;
  const promptCorrection = compilerCorrection(selection);
  const purge = essai.purge;
  const manuel = modeleDe(essai.modele) === MODELE_MANUEL;
  const cout = coutEssai(essai);

  async function decider(decision: "valide" | "rejete" | null) {
    const res = await fetch(`/api/studio/essais/${essai.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) toast.error(await lireErreur(res));
    router.refresh();
  }

  async function corriger() {
    setCorrection(true);
    // Dépôt manuel : corriger, c'est constater que cet essai n'est pas bon, il est compté rejeté
    // et la version corrigée sera déposée comme l'essai suivant. Essai api : c'est le serveur qui
    // le passe rejeté, au moment où la régénération part vraiment.
    if (!regeneration && essai.decision !== "rejete") await decider("rejete");
  }

  async function purger() {
    if (!window.confirm("Effacer l’image de cet essai rejeté ? La mesure (rejet) est conservée.")) return;
    const res = await fetch(`/api/studio/essais/${essai.id}`, { method: "DELETE" });
    if (!res.ok) toast.error(await lireErreur(res));
    router.refresh();
  }

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="text-[14px] font-bold">Essai n° {essai.numero}</span>
        <span className="font-mono text-[10.5px] text-[var(--faint)]">
          {new Date(essai.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
        </span>
        {cout && (
          <span className="ml-auto font-mono text-[11px] font-semibold text-[var(--ink)]" title={cout.titre}>
            {cout.texte}
          </span>
        )}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge ton={manuel ? "neutre" : "acc"} title={manuel ? "Image déposée à la main" : essai.modele}>
          <span className="max-w-[170px] truncate">{manuel ? "MANUEL" : nomModele.toUpperCase()}</span>
        </Badge>
        {correctionDe !== null && <Badge title="Régénération ciblée d’un essai raté">CORRIGE N° {correctionDe}</Badge>}
        {essai.decision === "valide" && <Badge ton="pos">VALIDÉ</Badge>}
        {essai.decision === "rejete" && <Badge ton="neg">REJETÉ</Badge>}
        {verif && VERDICTS[verif.verdict] && (
          <Badge ton={VERDICTS[verif.verdict].ton} title="Verdict du modèle de vision — une aide, pas la décision">
            IA : {VERDICTS[verif.verdict].texte}
            {score !== null ? ` · ${score}/100` : ""}
          </Badge>
        )}
        {verif && !verif.angleRespecte && <Badge ton="warn">ANGLE NON RESPECTÉ</Badge>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <figure className="min-w-0">
          <figcaption className={legendeCls}>RÉFÉRENCE</figcaption>
          {reference ? (
            <a href={`/api/studio/image?ref=${reference.id}`} target="_blank" rel="noreferrer" title="Ouvrir en grand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/studio/image?ref=${reference.id}`} alt="Vraie photo" className={imageCls} />
            </a>
          ) : (
            <div className={videCls}>aucune</div>
          )}
        </figure>
        <figure className="min-w-0">
          <figcaption className={legendeCls}>GÉNÉRÉE</figcaption>
          {purge ? (
            <div className={videCls}>image purgée</div>
          ) : (
            <a href={`/api/studio/image?essai=${essai.id}`} target="_blank" rel="noreferrer" title="Ouvrir en grand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/studio/image?essai=${essai.id}`} alt={`Essai ${essai.numero}`} className={imageCls} />
            </a>
          )}
        </figure>
      </div>

      <div className="mt-2.5">
        {verif ? (
          <ul className="flex flex-col gap-1.5 text-[12.5px]">
            {verif.details.map((d, i) => (
              <li key={i} className="flex items-start gap-2">
                <Badge ton={STATUTS[d.statut]?.ton ?? "neutre"}>{STATUTS[d.statut]?.texte ?? d.statut}</Badge>
                <span className="min-w-0">
                  <span className="font-semibold">{d.detail}</span>
                  {d.note && <span className="text-[var(--ink2)]"> — {d.note}</span>}
                </span>
              </li>
            ))}
            {verif.details.length === 0 && <li className="text-[var(--ink2)]">Aucun détail listé pour ce coloris.</li>}
          </ul>
        ) : (
          <p className="text-[12.5px] text-[var(--ink2)]">{verifEnCours ? "Vérification en cours…" : "Pas encore vérifié."}</p>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" className={btnAcc} onClick={() => void decider("valide")} disabled={essai.decision === "valide"}>
          <Check size={14} /> Valider
        </button>
        <button type="button" className={btn} onClick={() => void decider("rejete")} disabled={essai.decision === "rejete"}>
          <X size={14} /> Rejeter
        </button>
        {essai.decision && (
          <button type="button" className={btn} onClick={() => void decider(null)} title="Annuler la décision" aria-label="Annuler la décision">
            <RotateCcw size={14} />
          </button>
        )}
        <button type="button" className={btn} onClick={() => void corriger()} disabled={correction}>
          <Wrench size={14} /> Corriger un détail
        </button>
        <button type="button" className={btn} onClick={onVerifier} disabled={verifEnCours || purge}>
          <ScanSearch size={14} /> {verif ? "Revérifier" : "Vérifier"}
        </button>
        {essai.decision === "rejete" && !purge && (
          <button type="button" className={btn} onClick={() => void purger()} title="Effacer l’image, garder la mesure" aria-label="Effacer l’image">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {correction && (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-surface p-3">
          <div className="mb-2 text-[13px] font-semibold">
            {regeneration ? `Correction ciblée — régénérée par ${nomModele}` : "Correction ciblée — à recoller dans la même conversation Gemini"}
          </div>
          {candidats.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
              {candidats.map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    className="accent-[var(--acc)]"
                    checked={selection.includes(d)}
                    onChange={(e) => setChoisis(e.target.checked ? [...selection, d] : selection.filter((x) => x !== d))}
                  />
                  {d}
                </label>
              ))}
            </div>
          ) : (
            <p className="mb-2 text-[12.5px] text-[var(--ink2)]">Aucun détail saisi pour ce coloris : ajoute-les plus haut.</p>
          )}
          {promptCorrection ? (
            <>
              <pre className="mb-2 whitespace-pre-wrap rounded-lg bg-[var(--surface-2)] p-2.5 font-mono text-[12px]">{promptCorrection}</pre>
              {regeneration ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={`${btnAcc} max-w-full`}
                      onClick={() => regeneration.onRegenerer(selection)}
                      disabled={!!regeneration.raison || !!regeneration.confirmation}
                      title={`Régénérer avec ${nomModele}`}
                    >
                      <Sparkles size={14} className="flex-none" />
                      <span className="min-w-0 truncate">Régénérer avec {nomModele}</span>
                    </button>
                    <button type="button" className={btn} onClick={() => setCorrection(false)}>
                      Fermer
                    </button>
                    <span className="font-mono text-[11.5px] text-[var(--ink2)]">devis : {regeneration.estimation}</span>
                  </div>
                  {regeneration.raison && <p className="mt-1.5 text-[12.5px] font-semibold text-[var(--warn)]">{regeneration.raison}</p>}
                  {regeneration.confirmation}
                </>
              ) : (
                <div className="flex gap-2">
                  <button type="button" className={btnAcc} onClick={() => void copier(promptCorrection, "Correction")}>
                    <Copy size={14} /> Copier la correction
                  </button>
                  <button type="button" className={btn} onClick={() => setCorrection(false)}>
                    Fermer
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-[var(--ink2)]">Coche au moins un détail à corriger.</p>
          )}
          <p className="mt-2 text-[12px] text-[var(--ink2)]">
            {regeneration
              ? `Le modèle repart des références et de cette image. Cet essai sera compté rejeté ; la version corrigée devient l’essai suivant de ${nomModele}.`
              : "Cet essai est compté rejeté ; dépose la version corrigée comme l’essai suivant."}
          </p>
        </div>
      )}
    </article>
  );
}
