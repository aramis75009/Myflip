"use client";

import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { Copy, Sparkles, Upload } from "lucide-react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toastErreur, toastSucces } from "@/lib/toast";
import { compilerCorrection } from "@/lib/studioAngles";
import type { ModeleImage } from "@/lib/studioModeles";

import { ACCEPT, lireErreur, preparer } from "./envoi";
import type { EssaiClient, FicheClient } from "./Fiche";
import { copier, envoyerGeneration } from "./lancer";
import { devisPour, montantDevis } from "./SelecteurModeles";
import type { AvisIA } from "./useParcours";

/**
 * « Corriger un détail » on the image being judged: tick the details that
 * drifted, then regenerate with the same model (API) or copy the correction
 * prompt and deposit the corrected image (manual). Spending asks for a
 * confirmation; the server has the last word (409 → its own words).
 */
export default function CorrectionDetail({
  fiche,
  essai,
  nomDe,
  modele,
  manuel,
  candidats,
  choix,
  onChoix,
  occupe,
  onOccupe,
  avis,
}: {
  fiche: FicheClient;
  essai: EssaiClient;
  nomDe: (id: string) => string;
  modele: ModeleImage | null;
  manuel: boolean;
  candidats: string[];
  choix: string[];
  onChoix: Dispatch<SetStateAction<string[] | null>>;
  occupe: string | null;
  onOccupe: (o: string | null) => void;
  avis: AvisIA;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState(false);
  /** The server's words when it asked for a confirmation (409). */
  const [motifServeur, setMotifServeur] = useState<string | null>(null);
  const depot = useRef<HTMLInputElement>(null);
  const promptCorrection = compilerCorrection(choix);
  const devisCorrection = modele ? devisPour([modele], 1, true) : null;

  async function regenerer(confirme: boolean) {
    if (occupe) return;
    onOccupe("correction");
    const r = await envoyerGeneration({
      cle: fiche.coloris.cle,
      angleId: essai.angleId,
      referenceId: essai.referenceId,
      skuCible: essai.skuCible,
      nbCases: 1,
      modele: essai.modele,
      modeles: [essai.modele],
      lancementId: crypto.randomUUID(),
      confirme,
      essaiParentId: essai.id,
      detailsCorrection: choix,
    });
    onOccupe(null);
    if (r.kind === "confirmation") {
      setMotifServeur(r.message);
      setConfirmation(true);
      return;
    }
    setConfirmation(false);
    if (r.kind === "erreur") {
      toastErreur(`Correction : ${r.message}`);
      return;
    }
    toastSucces("Correction générée : elle rejoint la file.");
    onChoix(null);
    router.refresh();
    avis.demander([r.essaiId]);
  }

  /**
   * Corrected manual deposit. The case is locked while the original is to
   * judge, so it is rejected first; if the deposit then fails, the original
   * goes back to « à juger » (its case is never left freed for nothing).
   */
  async function deposerCorrection(f: File | undefined) {
    if (!f || occupe) return;
    onOccupe("depot");
    let rejete = false;
    try {
      const p = await preparer(f);
      if (!p.ok) throw new Error(p.erreur);
      const rej = await fetch(`/api/studio/essais/${essai.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "rejete" }),
      });
      if (!rej.ok) throw new Error(await lireErreur(rej));
      rejete = true;
      const form = new FormData();
      form.set("cle", fiche.coloris.cle);
      form.set("referenceId", essai.referenceId);
      form.set("angleId", essai.angleId);
      if (essai.skuCible) form.set("skuCible", essai.skuCible);
      form.set("image", p.jpeg, "correction.jpg");
      const res = await fetch("/api/studio/essais", { method: "POST", body: form });
      if (!res.ok) throw new Error(await lireErreur(res));
      const j = (await res.json()) as { id: string };
      toastSucces("Version corrigée déposée : elle rejoint la file.");
      onChoix(null);
      avis.demander([j.id]);
    } catch (err) {
      if (rejete) {
        await fetch(`/api/studio/essais/${essai.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: null }),
        }).catch(() => null);
      }
      toastErreur(`Dépôt impossible : ${err instanceof Error ? err.message : "connexion perdue"}. L’image d’origine reste à juger.`);
    } finally {
      onOccupe(null);
      router.refresh();
    }
  }

  return (
    <>
      <div className="rounded-md border border-line p-4 text-base">
        <div className="font-semibold text-ink">Détails à corriger</div>
        {candidats.length === 0 ? (
          <p className="mt-1 text-sm text-ink-2">Aucun détail saisi pour ce coloris : ajoute-les dans « Détails vérifiés par l’IA », en haut de la fiche.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {candidats.map((d) => (
              <li key={d}>
                <Checkbox
                  checked={choix.includes(d)}
                  onChange={(ev) => onChoix((c) => (ev.target.checked ? [...(c ?? []), d] : (c ?? []).filter((x) => x !== d)))}
                  label={d}
                />
              </li>
            ))}
          </ul>
        )}
        {manuel ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={!promptCorrection} onClick={() => promptCorrection && void copier(promptCorrection, "Prompt de correction")}>
              <Copy size={14} aria-hidden /> Copier le prompt de correction
            </Button>
            <Button size="sm" pending={occupe === "depot"} pendingLabel="Dépôt…" disabled={!!occupe && occupe !== "depot"} onClick={() => depot.current?.click()}>
              <Upload size={14} aria-hidden /> Déposer la version corrigée
            </Button>
            <input
              ref={depot}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(ev) => {
                void deposerCorrection(ev.target.files?.[0]);
                ev.target.value = "";
              }}
            />
          </div>
        ) : (
          <div className="mt-3">
            <Button
              size="sm"
              disabled={!promptCorrection || (!!occupe && occupe !== "correction")}
              pending={occupe === "correction"}
              pendingLabel="Génération…"
              onClick={() => (devisCorrection?.confirmationRequise === false ? void regenerer(false) : setConfirmation(true))}
            >
              <Sparkles size={14} aria-hidden /> Régénérer avec {nomDe(essai.modele)}
              <span className="font-mono text-xs">{devisCorrection ? montantDevis(devisCorrection) : "coût inconnu"}</span>
            </Button>
          </div>
        )}
      </div>
      <AlertDialog
        open={confirmation}
        onOpenChange={(o) => {
          setConfirmation(o);
          if (!o) setMotifServeur(null);
        }}
        tone="neutre"
        title="Confirmer la dépense"
        description={
          motifServeur
            ? `${motifServeur} Ta clé OpenRouter paie.`
            : devisCorrection
              ? `Cette correction est estimée à ${montantDevis(devisCorrection)}. Ta clé OpenRouter paie.`
              : "Coût inconnu : ce modèle n’est plus au catalogue. Confirmer quand même ? Ta clé OpenRouter paie."
        }
        confirmLabel={devisCorrection && devisCorrection.inconnus === 0 ? `Confirmer ${montantDevis(devisCorrection)}` : "Confirmer quand même"}
        pending={occupe === "correction"}
        pendingLabel="Génération…"
        onConfirm={() => void regenerer(true)}
      />
    </>
  );
}
