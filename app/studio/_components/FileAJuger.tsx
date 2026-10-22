"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, History, Keyboard, ScanSearch, Wrench, X } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { detailsEnLignes } from "@/lib/studioAngles";
import { MODELE_MANUEL, detailsDerivants, modeleDe } from "@/lib/studioFiche";
import type { BudgetCompte, ModeleImage } from "@/lib/studioModeles";

import { decisionsDeComparaison, freresDeComparaison } from "../_comparaison";
import AideIA, { echecRange } from "./AideIA";
import Comparaison, { coutEnEuros } from "./Comparaison";
import CorrectionDetail from "./CorrectionDetail";
import type { EssaiClient, FicheClient } from "./Fiche";
import { SectionEtape, idEtape } from "./SectionEtape";
import type { AvisIA, Decisions } from "./useParcours";

const CLE_RACCOURCIS = "myflip-studio-raccourcis";

const dateCourte = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(" ", " à ");

/** V / R / C shortcuts can be switched off (WCAG 2.1.4), remembered in this browser. */
function useRaccourcis(): [boolean, (v: boolean) => void] {
  const [actifs, setActifs] = useState(true);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(CLE_RACCOURCIS) === "0") setActifs(false);
    } catch {
      // Storage unavailable: shortcuts on.
    }
  }, []);
  return [
    actifs,
    (v) => {
      setActifs(v);
      try {
        window.localStorage.setItem(CLE_RACCOURCIS, v ? "1" : "0");
      } catch {
        // Not remembered: still applied for this visit.
      }
    },
  ];
}

/**
 * Step 4, judging: the real photo NEXT TO the generated image, the AI opinion
 * as a help, and Aramis's decision. V / R take effect at once on screen, with
 * a 5 s « Annuler » toast BEFORE anything reaches the server (useDecisions).
 * Only a VALIDATED image joins its bag's listing; only decisions count.
 *
 * Images of ONE launch on the same cell with 2 or 3 models are judged
 * together, side by side (Comparaison): keep one, or none.
 */
export default function FileAJuger({
  fiche,
  file,
  courantId,
  onCourant,
  nomDe,
  catalogue,
  avis,
  decisions,
  budget,
  onHistorique,
  numero,
  ouverte,
  courante,
  onBasculer,
}: {
  fiche: FicheClient;
  file: EssaiClient[];
  courantId: string | null;
  onCourant: (id: string | null) => void;
  nomDe: (id: string) => string;
  catalogue: Map<string, ModeleImage>;
  avis: AvisIA;
  decisions: Decisions;
  budget: BudgetCompte;
  /** Opens the history of a cell (every attempt, rejected ones included). */
  onHistorique: (c: { referenceId: string; angleId: string }) => void;
  numero: number;
  ouverte: boolean;
  courante: boolean;
  onBasculer: () => void;
}) {
  const [correction, setCorrection] = useState<string[] | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [raccourcis, setRaccourcis] = useRaccourcis();

  const i = Math.max(0, file.findIndex((x) => x.id === courantId));
  const e = file[i] ?? null;
  useEffect(() => setCorrection(null), [e?.id]);

  const aller = (pas: number) => {
    if (file.length === 0) return;
    onCourant(file[(i + pas + file.length) % file.length].id);
  };

  const ligne = e ? fiche.lignes.find((l) => l.id === e.referenceId) : undefined;
  const angle = e ? fiche.angles.find((a) => a.id === e.angleId) : undefined;
  const manuel = e ? modeleDe(e.modele) === MODELE_MANUEL : false;
  const modele = e && !manuel ? catalogue.get(e.modele) ?? null : null;
  const derivants = e ? detailsDerivants(e.verifIA) : [];
  const candidats = derivants.length > 0 ? derivants : detailsEnLignes(fiche.coloris.details);

  function decider(decision: "valide" | "rejete") {
    if (!e || occupe) return;
    const suivant = file.length > 1 ? file[(i + 1) % file.length].id : null;
    decisions.decider(e, decision);
    onCourant(suivant);
  }

  // A comparison: the same cell, the same launch, 2 or 3 models, still to judge.
  const freres = e ? freresDeComparaison(e, file) : [];

  /** Keeps `retenu` (validated for its bag) and rejects the others; null = none kept. */
  function trancher(retenu: EssaiClient | null) {
    if (freres.length === 0 || occupe) return;
    const ids = new Set(freres.map((f) => f.id));
    const suivant = file.find((x, k) => k > i && !ids.has(x.id)) ?? file.find((x) => !ids.has(x.id)) ?? null;
    const liste = decisionsDeComparaison(freres, retenu?.id ?? null).map((d) => ({ essai: freres.find((f) => f.id === d.id)!, decision: d.decision }));
    const autres = freres.length - (retenu ? 1 : 0);
    decisions.deciderPlusieurs(
      liste,
      retenu
        ? `Retenue : ${nomDe(retenu.modele)}${retenu.skuCible ? ` pour ${retenu.skuCible}` : ""} · ${pluriel(autres, "autre rejetée", "autres rejetées")}`
        : `Aucune retenue : ${pluriel(autres, "image rejetée", "images rejetées")}`,
    );
    onCourant(suivant?.id ?? null);
  }

  // Shortcuts V / R / C / ← →: when the step is open, outside fields, menus and
  // windows, and only if focus is in this step or nowhere in particular.
  useEffect(() => {
    if (!raccourcis || !ouverte || !e) return;
    function touche(ev: KeyboardEvent) {
      if (ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat) return;
      const cible = ev.target instanceof HTMLElement ? ev.target : null;
      if (cible?.closest("input, textarea, select, [contenteditable], [role=dialog], [role=alertdialog], [role=menu], [role=listbox], [role=tablist]")) return;
      if (document.querySelector("[role=dialog][data-state=open], [role=alertdialog][data-state=open], [role=menu][data-state=open]")) return;
      const section = document.getElementById(idEtape("a-juger"));
      const neutre = !cible || cible === document.body || cible.id === "contenu";
      if (!neutre && !section?.contains(cible)) return;
      const k = ev.key.toLowerCase();
      if (freres.length > 0) {
        // Comparison: 1 / 2 / 3 keep that image, R none of them.
        const n = Number(k);
        if (Number.isInteger(n) && n >= 1 && n <= freres.length) trancher(freres[n - 1]);
        else if (k === "r") trancher(null);
        else if (ev.key === "ArrowRight") aller(1);
        else if (ev.key === "ArrowLeft") aller(-1);
        else return;
        ev.preventDefault();
        return;
      }
      if (k === "v") decider("valide");
      else if (k === "r") decider("rejete");
      else if (k === "c") setCorrection((c) => (c ? null : derivants));
      else if (ev.key === "ArrowRight") aller(1);
      else if (ev.key === "ArrowLeft") aller(-1);
      else return;
      ev.preventDefault();
    }
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  const resume = file.length === 0 ? "rien à juger" : `${pluriel(file.length, "image", "images")} en attente de ta décision`;

  if (!e) {
    return (
      <SectionEtape etape="a-juger" numero={numero} titre="À juger" resume={resume} ouverte={ouverte} courante={courante} onBasculer={onBasculer}>
        <EmptyState
          icone={<Check />}
          titre="Rien à juger"
          description="Les images générées arrivent ici, à côté de leur vraie photo. Tes décisions apparaissent dans « Validées »."
        />
      </SectionEtape>
    );
  }

  const cout = manuel ? "Gemini, à la main" : coutEnEuros(e, budget.tauxEurParUsd);
  // Without an opinion, or with a failed one stored by the server: « Demander les avis » covers both.
  const sansAvisAutres = file.filter((x) => (x.verifIA === null || echecRange(x.verifIA) !== null) && !avis.enCours.has(x.id) && !avis.echecs.has(x.id));
  const historique = (
    <Button variant="ghost" size="sm" onClick={() => onHistorique({ referenceId: e.referenceId, angleId: e.angleId })}>
      <History size={14} aria-hidden /> Historique de la prise
    </Button>
  );

  return (
    <SectionEtape etape="a-juger" numero={numero} titre="À juger" resume={resume} ouverte={ouverte} courante={courante} onBasculer={onBasculer}>
      {/* Focusable by click (not by Tab): a click in the step keeps the focus
          here, so V / R apply to it and the frame does not get the focus ring. */}
      <div tabIndex={-1} className="focus-visible:outline-none">
        {/* File d'attente : vignettes, position, raccourcis */}
        <div className="flex flex-wrap items-center gap-3">
          <ol aria-label="Images à juger" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1">
            {file.map((x, k) => {
              const actif = x.id === e.id;
              return (
                <li key={x.id} className="flex-none">
                  <button
                    type="button"
                    aria-current={actif ? "true" : undefined}
                    aria-label={`Image ${k + 1} : ${fiche.lignes.find((l) => l.id === x.referenceId)?.prise ?? "photo"}`}
                    onClick={() => onCourant(x.id)}
                    className={cn(
                      "block h-16 w-12 overflow-hidden rounded-xs border-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                      actif ? "border-accent" : "border-transparent opacity-70 hover:opacity-100",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
                    <img src={`/api/studio/image?essai=${x.id}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="flex items-center gap-1.5">
            <IconButton label="Image précédente" variant="secondary" onClick={() => aller(-1)} disabled={file.length < 2}>
              <ChevronLeft size={16} aria-hidden />
            </IconButton>
            <span className="min-w-11 text-center font-mono text-sm text-ink-2">
              {i + 1} / {file.length}
            </span>
            <IconButton label="Image suivante" variant="secondary" onClick={() => aller(1)} disabled={file.length < 2}>
              <ChevronRight size={16} aria-hidden />
            </IconButton>
          </div>
          <Checkbox
            checked={raccourcis}
            onChange={(ev) => setRaccourcis(ev.target.checked)}
            label={
              <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
                <Keyboard size={14} aria-hidden /> Raccourcis V / R / C
              </span>
            }
          />
        </div>

        {sansAvisAutres.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md bg-surface-2 px-4 py-2.5 text-sm text-ink">
            <span>{pluriel(sansAvisAutres.length, "image sans avis IA", "images sans avis IA")}. L’avis est payant : il ne part que si tu le demandes.</span>
            <Button variant="secondary" size="sm" onClick={() => avis.demander(sansAvisAutres.map((x) => x.id))}>
              <ScanSearch size={14} aria-hidden /> Demander les avis
            </Button>
          </div>
        )}

        {freres.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3">
            <Comparaison
              freres={freres}
              referenceId={e.referenceId}
              prise={ligne?.prise ?? "Photo"}
              angle={angle?.nom ?? "angle archivé"}
              sku={e.skuCible}
              nomDe={nomDe}
              taux={budget.tauxEurParUsd}
              avis={avis}
              onRetenir={(f) => trancher(f)}
              onAucune={() => trancher(null)}
            />
            <div>{historique}</div>
          </div>
        ) : (
          <div className="mt-4 grid gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
            {/* La vraie photo à côté de l'image générée */}
            <div className="grid grid-cols-2 gap-3">
              <figure className="min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
                <img src={`/api/studio/image?ref=${e.referenceId}`} alt="Vraie photo" className="aspect-[3/4] w-full rounded-md border border-line bg-surface-2 object-cover" />
                <figcaption className="mt-2 text-sm text-ink-2">
                  <strong className="font-semibold text-ink">Ta vraie photo</strong> · {ligne?.prise ?? "photo"}
                </figcaption>
              </figure>
              <figure className="min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
                <img src={`/api/studio/image?essai=${e.id}`} alt="Image générée" className="aspect-[3/4] w-full rounded-md border-2 border-accent bg-surface-2 object-cover" />
                <figcaption className="mt-2 text-sm text-ink-2">
                  <strong className="font-semibold text-ink">Image générée</strong> · {angle?.nom ?? "angle archivé"}
                </figcaption>
              </figure>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <div>
                <div className="font-mono text-xs tracking-[0.14em] text-ink-2">
                  PHOTO {String(ligne?.ordre ?? 0).padStart(2, "0")}
                  {e.skuCible ? ` · POUR ${e.skuCible}` : " · SANS SAC"}
                </div>
                <h3 className="mt-1 text-lg font-bold tracking-[-0.01em] text-ink">{ligne?.prise ?? "Photo"}</h3>
                <p className="mt-0.5 text-base text-ink-2">
                  {angle?.nom ?? "angle archivé"} · {nomDe(e.modele)} · {dateCourte(e.createdAt)} · {cout}
                </p>
                {!e.skuCible && (
                  <p className="mt-2 rounded-md border border-warn bg-warn-soft px-3 py-2 text-sm text-ink">
                    Cette image n’est rattachée à aucun sac : validée, elle compte au bilan mais ne part dans aucune annonce.
                  </p>
                )}
              </div>

              {/* La décision d'Aramis */}
              <div className="flex flex-wrap gap-2">
                <Button size="lg" disabled={!!occupe} onClick={() => decider("valide")}>
                  <Check size={16} aria-hidden /> {e.skuCible ? `Valider pour ${e.skuCible}` : "Valider sans annonce"}
                  <kbd className="ml-1 rounded-xs border border-current px-1 font-mono text-xs">V</kbd>
                </Button>
                <Button size="lg" variant="secondary" disabled={!!occupe} onClick={() => decider("rejete")}>
                  <X size={16} aria-hidden /> Rejeter
                  <kbd className="ml-1 rounded-xs border border-current px-1 font-mono text-xs">R</kbd>
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  disabled={!!occupe}
                  aria-expanded={!!correction}
                  onClick={() => setCorrection((c) => (c ? null : derivants))}
                >
                  <Wrench size={16} aria-hidden /> Corriger un détail
                  <kbd className="ml-1 rounded-xs border border-current px-1 font-mono text-xs">C</kbd>
                </Button>
              </div>
              <p className="-mt-2 text-sm text-ink-2">Tu as 5 secondes pour annuler : rien ne part avant.</p>
              <div className="-mt-2">{historique}</div>

              <AideIA verifIA={e.verifIA} enCours={avis.enCours.has(e.id)} echec={avis.echecs.get(e.id) ?? null} onDemander={() => avis.demander([e.id])} />

              {correction && (
                <CorrectionDetail
                  fiche={fiche}
                  essai={e}
                  nomDe={nomDe}
                  modele={modele}
                  manuel={manuel}
                  candidats={candidats}
                  choix={correction}
                  onChoix={setCorrection}
                  occupe={occupe}
                  onOccupe={setOccupe}
                  avis={avis}
                  budget={budget}
                />
              )}

              {e.promptUtilise && (
                <details className="text-sm text-ink-2">
                  <summary className="cursor-pointer rounded-xs font-semibold text-ink-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    Prompt envoyé pour cette image
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-mono text-xs leading-relaxed text-ink">
                    {e.promptUtilise}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionEtape>
  );
}
