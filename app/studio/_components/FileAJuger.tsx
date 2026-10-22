"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Copy, ScanSearch, Sparkles, Upload, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { Module } from "@/components/console";
import { compilerCorrection, detailsEnLignes } from "@/lib/studioAngles";
import { MODELE_MANUEL, detailsDerivants, modeleDe, scoreVerif } from "@/lib/studioFiche";
import { formatUsd, type ModeleImage } from "@/lib/studioModeles";
import { btn, btnAcc } from "../_ui";
import { ACCEPT, lireErreur, preparer } from "./envoi";
import { copier, envoyerGeneration } from "./lancer";
import { devisPour, montantDevis } from "./SelecteurModeles";
import type { EssaiClient, FicheClient } from "./Fiche";

type DetailVerif = { detail: string; statut: string; note: string };
type Verif = { details: DetailVerif[]; scoreGlobal: number; verdict: string };

function lireVerif(v: unknown): Verif | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Partial<Verif>;
  if (!Array.isArray(o.details) || typeof o.verdict !== "string") return null;
  return o as Verif;
}

const VERDICTS: Record<string, { texte: string; cls: string; barre: string }> = {
  ok: { texte: "OK", cls: "bg-pos-soft text-pos", barre: "bg-pos" },
  a_corriger: { texte: "À corriger", cls: "bg-warn-soft text-ink", barre: "bg-warn" },
  rejet: { texte: "Rejet", cls: "bg-neg-soft text-neg", barre: "bg-neg" },
};

const dateCourte = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", " à ");

/**
 * La prochaine action de la fiche : les images qui attendent la décision
 * d'Aramis. L'avis de l'IA est une aide ; seule la décision compte au bilan,
 * et seule une image VALIDÉE part dans l'annonce du sac.
 */
export default function FileAJuger({
  fiche,
  file,
  nomDe,
  catalogue,
  avisEnCours,
  onAvis,
}: {
  fiche: FicheClient;
  file: EssaiClient[];
  nomDe: (id: string) => string;
  catalogue: Map<string, ModeleImage>;
  avisEnCours: ReadonlySet<string>;
  onAvis: (essaiId: string) => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [correction, setCorrection] = useState<string[] | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const [occupe, setOccupe] = useState<string | null>(null);
  const depot = useRef<HTMLInputElement>(null);

  const i = file.length ? Math.min(index, file.length - 1) : 0;
  const e = file[i];
  // Changer d'image ferme la correction en cours.
  useEffect(() => {
    setCorrection(null);
    setConfirmation(false);
  }, [e?.id]);

  const ligne = e ? fiche.lignes.find((l) => l.id === e.referenceId) : undefined;
  const angle = e ? fiche.angles.find((a) => a.id === e.angleId) : undefined;
  const verif = e ? lireVerif(e.verifIA) : null;
  const score = e ? scoreVerif(e.verifIA) : null;
  const manuel = e ? modeleDe(e.modele) === MODELE_MANUEL : false;
  const modele = e && !manuel ? catalogue.get(e.modele) ?? null : null;
  const derivants = e ? detailsDerivants(e.verifIA) : [];
  const candidats = derivants.length > 0 ? derivants : detailsEnLignes(fiche.coloris.details);

  async function decider(decision: "valide" | "rejete") {
    if (!e || occupe) return;
    setOccupe(decision);
    const res = await fetch(`/api/studio/essais/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    if (!res.ok) toast.error(await lireErreur(res));
    else if (decision === "valide") toast.success(e.skuCible ? `Validée : rejoint les photos de ${e.skuCible}.` : "Validée.");
    setOccupe(null);
    router.refresh();
  }

  async function regenerer(confirme: boolean) {
    if (!e || !correction || occupe) return;
    setOccupe("correction");
    const r = await envoyerGeneration({
      cle: fiche.coloris.cle,
      angleId: e.angleId,
      referenceId: e.referenceId,
      skuCible: e.skuCible,
      nbCases: 1,
      modele: e.modele,
      modeles: [e.modele],
      lancementId: crypto.randomUUID(),
      confirme,
      essaiParentId: e.id,
      detailsCorrection: correction,
    });
    setOccupe(null);
    if (r.kind === "confirmation") {
      setConfirmation(true);
      return;
    }
    setConfirmation(false);
    if (r.kind === "erreur") {
      toast.error(`Correction : ${r.message}`, { duration: 10000 });
      return;
    }
    toast.success("Correction générée : elle rejoint la file.");
    setCorrection(null);
    router.refresh();
    onAvis(r.essaiId);
  }

  /** Dépôt manuel corrigé : l'essai raté passe rejeté, la case se libère, la nouvelle image s'y dépose. */
  async function deposerCorrection(f: File | undefined) {
    if (!e || !f || occupe) return;
    setOccupe("depot");
    try {
      const p = await preparer(f);
      if (!p.ok) throw new Error(p.erreur);
      if (e.decision !== "rejete") {
        const rej = await fetch(`/api/studio/essais/${e.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "rejete" }),
        });
        if (!rej.ok) throw new Error(await lireErreur(rej));
      }
      const form = new FormData();
      form.set("cle", fiche.coloris.cle);
      form.set("referenceId", e.referenceId);
      form.set("angleId", e.angleId);
      if (e.skuCible) form.set("skuCible", e.skuCible);
      form.set("image", p.jpeg, "correction.jpg");
      const res = await fetch("/api/studio/essais", { method: "POST", body: form });
      if (!res.ok) throw new Error(await lireErreur(res));
      const j = (await res.json()) as { id: string };
      toast.success("Version corrigée déposée.");
      setCorrection(null);
      onAvis(j.id);
    } catch (err) {
      toast.error(`Dépôt impossible : ${err instanceof Error ? err.message : "erreur inconnue"}`);
    } finally {
      setOccupe(null);
      router.refresh();
    }
  }

  // Raccourcis V / R / C, hors des champs de saisie.
  useEffect(() => {
    function touche(ev: KeyboardEvent) {
      const cible = ev.target as HTMLElement | null;
      if (!e || ev.metaKey || ev.ctrlKey || ev.altKey || cible?.closest("input, textarea, select, [contenteditable]")) return;
      const k = ev.key.toLowerCase();
      if (k === "v") void decider("valide");
      else if (k === "r") void decider("rejete");
      else if (k === "c") setCorrection((c) => (c ? null : derivants));
      else if (ev.key === "ArrowRight") setIndex((n) => (n + 1) % file.length);
      else if (ev.key === "ArrowLeft") setIndex((n) => (n - 1 + file.length) % file.length);
      else return;
      ev.preventDefault();
    }
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  if (!e) return null;
  const vd = verif ? VERDICTS[verif.verdict] ?? VERDICTS.a_corriger : null;
  const cout = manuel ? "Gemini, à la main" : e.coutReelUsd !== null ? formatUsd(e.coutReelUsd) : e.coutEstimeUsd !== null ? `estimé ${formatUsd(e.coutEstimeUsd)}` : "coût inconnu";
  const promptCorrection = correction ? compilerCorrection(correction) : null;
  const devisCorrection = modele ? devisPour([modele], 1, true) : null;

  return (
    <Module className="p-[22px]">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <h2 className="text-lg font-bold tracking-[-0.01em]">À juger</h2>
        <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-warn-soft px-2.5 text-sm font-semibold text-ink">
          <span className="h-[7px] w-[7px] rounded-full bg-warn" aria-hidden="true" />
          {file.length} image{file.length > 1 ? "s" : ""}
        </span>
        <span className="text-base text-ink-2">
          {e.skuCible ? `Une image validée rejoint les photos de ${e.skuCible}` : "Une image validée rejoint l’annonce de son sac"} ; ta décision est la seule mesure du bilan.
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className={`${btn} h-10 w-10 justify-center rounded-full px-0`} aria-label="Image précédente" onClick={() => setIndex((i - 1 + file.length) % file.length)}>
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-11 text-center font-mono text-sm text-ink-2">
            {i + 1} / {file.length}
          </span>
          <button type="button" className={`${btn} h-10 w-10 justify-center rounded-full px-0`} aria-label="Image suivante" onClick={() => setIndex((i + 1) % file.length)}>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-[22px] [grid-template-columns:minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-2 gap-3">
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
            <img src={`/api/studio/image?ref=${e.referenceId}`} alt="Vraie photo" className="aspect-[3/4] w-full rounded-md border border-line object-cover" />
            <figcaption className="mt-1.5 text-sm text-ink-2">
              <strong className="font-semibold text-ink">Vraie photo</strong> · {ligne?.prise ?? "?"}
            </figcaption>
          </figure>
          <figure>
            {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
            <img src={`/api/studio/image?essai=${e.id}`} alt="Image générée" className="aspect-[3/4] w-full rounded-md border border-line object-cover" />
            <figcaption className="mt-1.5 text-sm text-ink-2">
              <strong className="font-semibold text-ink">Générée</strong> · {angle?.nom ?? "angle archivé"}
            </figcaption>
          </figure>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <div className="font-mono text-xs tracking-[0.14em] text-ink-2">
              PHOTO {String(ligne?.ordre ?? 0).padStart(2, "0")}
              {e.skuCible ? ` · POUR ${e.skuCible}` : ""}
            </div>
            <div className="mt-1 text-lg font-bold tracking-[-0.01em]">{ligne?.prise ?? "Photo"}</div>
            <div className="mt-0.5 text-base text-ink-2">
              {angle?.nom ?? "angle archivé"} · {nomDe(e.modele)} · {dateCourte(e.createdAt)} · {cout}
            </div>
            <div className="mt-2 rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm leading-relaxed">{angle?.angle ?? "—"}</div>
          </div>

          <div className="rounded-lg border border-line p-3.5">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold">Avis de l’IA</span>
              {vd && <span className={`inline-flex h-6 items-center rounded-md px-2 text-sm font-bold ${vd.cls}`}>{vd.texte}</span>}
              {score !== null && <span className="ml-auto font-mono text-sm font-semibold">{score}/100</span>}
            </div>
            {verif && vd ? (
              <>
                <div className="mt-2 h-[5px] overflow-hidden rounded-xs bg-surface-2" aria-hidden="true">
                  <div className={`h-[5px] rounded-xs ${vd.barre}`} style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} />
                </div>
                <ul className="mt-2.5 flex flex-col gap-1.5 text-base">
                  {verif.details.map((d) => {
                    const ok = d.statut === "fidele";
                    return (
                      <li key={d.detail} className="flex items-start gap-2">
                        <span className={`mt-0.5 flex-none ${ok ? "text-pos" : "text-neg"}`} aria-hidden="true">
                          {ok ? <Check size={14} /> : <X size={14} />}
                        </span>
                        <span>
                          <span className="font-medium">{d.detail}</span>
                          <span className="text-ink-2"> — {ok ? "fidèle" : d.note || d.statut}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="mt-2 flex items-center gap-3 text-sm text-ink-2">
                {avisEnCours.has(e.id) ? (
                  "Avis en cours…"
                ) : (
                  <>
                    Pas encore d’avis.
                    <button type="button" className={btn} onClick={() => onAvis(e.id)}>
                      <ScanSearch size={14} /> Demander l’avis
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${btnAcc} h-11 rounded-full px-5 text-base`} disabled={!!occupe} onClick={() => void decider("valide")}>
              <Check size={15} /> {e.skuCible ? `Valider pour ${e.skuCible}` : "Valider"}
              <kbd className="ml-1 rounded border border-current px-1 font-mono text-xs opacity-70">V</kbd>
            </button>
            <button type="button" className={`${btn} h-11 rounded-full px-5 text-base`} disabled={!!occupe} onClick={() => void decider("rejete")}>
              <X size={15} /> Rejeter
              <kbd className="ml-1 rounded border border-current px-1 font-mono text-xs opacity-70">R</kbd>
            </button>
            <button type="button" className={`${btn} h-11 rounded-full px-5 text-base`} disabled={!!occupe} aria-expanded={!!correction} onClick={() => setCorrection((c) => (c ? null : derivants))}>
              <Wrench size={15} /> Corriger un détail
              <kbd className="ml-1 rounded border border-current px-1 font-mono text-xs opacity-70">C</kbd>
            </button>
          </div>

          {correction && (
            <div className="rounded-lg border border-line bg-surface-2 p-3.5 text-base">
              <div className="font-semibold">Détails à corriger</div>
              {candidats.length === 0 ? (
                <p className="mt-1 text-ink-2">Aucun détail saisi pour ce coloris : ajoute-les dans « Détails vérifiés par l’IA ».</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {candidats.map((d) => (
                    <li key={d}>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-accent"
                          checked={correction.includes(d)}
                          onChange={(ev) => setCorrection((c) => (ev.target.checked ? [...(c ?? []), d] : (c ?? []).filter((x) => x !== d)))}
                        />
                        {d}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {manuel ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btn} disabled={!promptCorrection} onClick={() => promptCorrection && void copier(promptCorrection, "Prompt de correction")}>
                    <Copy size={14} /> Copier le prompt de correction
                  </button>
                  <button type="button" className={btnAcc} disabled={!!occupe} onClick={() => depot.current?.click()}>
                    <Upload size={14} /> {occupe === "depot" ? "Dépôt…" : "Déposer la version corrigée"}
                  </button>
                  <input ref={depot} type="file" accept={ACCEPT} hidden onChange={(ev) => { void deposerCorrection(ev.target.files?.[0]); ev.target.value = ""; }} />
                </div>
              ) : (
                <div className="mt-3">
                  {confirmation && devisCorrection ? (
                    <div role="alertdialog" aria-label="Confirmer la dépense" className="rounded-lg border border-warn bg-warn-soft p-3">
                      <p className="font-semibold">Cette correction est estimée à {montantDevis(devisCorrection)} : confirmer ?</p>
                      <div className="mt-2 flex gap-2">
                        <button type="button" className={btnAcc} onClick={() => void regenerer(true)}>
                          <Sparkles size={14} /> Confirmer et générer
                        </button>
                        {/* eslint-disable-next-line jsx-a11y/no-autofocus -- Entrée ne doit jamais dépenser par réflexe */}
                        <button type="button" className={btn} autoFocus onClick={() => setConfirmation(false)}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className={btnAcc} disabled={!promptCorrection || !!occupe} onClick={() => void regenerer(false)}>
                      <Sparkles size={14} /> {occupe === "correction" ? "Génération…" : `Régénérer avec ${nomDe(e.modele)}`}
                      {devisCorrection && <span className="font-mono text-xs opacity-80">{montantDevis(devisCorrection)}</span>}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Module>
  );
}
