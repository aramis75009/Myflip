"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, GitCompareArrows, Settings2, Sparkles, Upload } from "lucide-react";

import { ReglageBudget } from "@/components/parametres/BudgetStudio";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { toastErreur, toastSucces } from "@/lib/toast";
import { triggerDownload } from "@/lib/imageProcessing";
import { devisDuLancement, formatEur, type DevisMultiModeles, type ModeleImage } from "@/lib/studioModeles";

import { construireLignes, depassement, montantCourt, partDuBudget, selectionInitiale } from "../_modeles";
import ConfirmationDepense from "./ConfirmationDepense";
import { fichiersImages, lireErreur, preparer, ACCEPT } from "./envoi";
import type { FicheClient } from "./Fiche";
import { CODES_COMPTE, copier, envoyerGeneration, parNom, parPaquets } from "./lancer";
import SelecteurModeles from "./SelecteurModeles";
import { SectionEtape } from "./SectionEtape";
import type { ContexteModeles } from "./useModeles";
import type { Choix, ChoixCases } from "./useParcours";

/** Generations in flight at once: fast enough, without flooding the key. */
const EN_PARALLELE = 3;

type Mode = "api" | "manuel";
type Progression = { total: number; faits: number; erreurs: string[] };
/** The confirmation window: the quote shown, whose it is, and the server's own words when it asked (409). */
type Confirmation = { devis: DevisMultiModeles; serveur: boolean; message: string | null };

const CLE_SELECTION = "myflip-studio-modeles-choisis";

/**
 * The models picked for the next launch, remembered in this browser. Restored
 * once the catalogue arrives, cleaned against it (a model OpenRouter dropped
 * goes away); nothing remembered → the first favourite.
 */
function useSelectionModeles(contexte: ContexteModeles): [string[], (ids: string[]) => void] {
  const [selection, setSelection] = useState<string[] | null>(null);
  const { catalogue, favoris, budget } = contexte;
  useEffect(() => {
    if (selection !== null || !catalogue || catalogue.modeles.length === 0) return;
    let memoire: unknown = null;
    try {
      memoire = JSON.parse(window.localStorage.getItem(CLE_SELECTION) ?? "null");
    } catch {
      memoire = null;
    }
    setSelection(selectionInitiale(memoire, construireLignes(catalogue.modeles, [], favoris, budget)));
  }, [catalogue, favoris, budget, selection]);
  return [
    selection ?? [],
    (ids) => {
      setSelection(ids);
      try {
        window.localStorage.setItem(CLE_SELECTION, JSON.stringify(ids));
      } catch {
        // Not remembered: still used for this visit.
      }
    },
  ];
}

/**
 * Step 3, generation: the cells picked in step 2, by API (one request per
 * cell AND per model, three at a time) or by hand in Gemini. 1 model, or 2 to
 * 3 to compare them on the same cells (one launch, judged side by side). The
 * quote is in euros against the account budget per bag; the server computes
 * the same quote before paying and refuses an unconfirmed launch (409, whose
 * quote then fills the same confirmation).
 */
export default function Generation({
  fiche,
  cible,
  choix,
  modeles,
  onNouveaux,
  onVoirAngles,
  numero,
  ouverte,
  courante,
  onBasculer,
}: {
  fiche: FicheClient;
  cible: string | null;
  choix: ChoixCases;
  modeles: ContexteModeles;
  /** New trials: the sheet asks for their AI opinion. */
  onNouveaux: (ids: string[]) => void;
  onVoirAngles: () => void;
  numero: number;
  ouverte: boolean;
  courante: boolean;
  onBasculer: () => void;
}) {
  const router = useRouter();
  const { choisies } = choix;
  const [mode, setMode] = useState<Mode>("api");
  const [selection, setSelection] = useSelectionModeles(modeles);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [progression, setProgression] = useState<Progression | null>(null);
  const [budgetOuvert, setBudgetOuvert] = useState(false);
  const depot = useRef<HTMLInputElement>(null);

  const catalogue = modeles.catalogue?.modeles ?? [];
  const parId = new Map(catalogue.map((m) => [m.id, m]));
  const choisis = selection.map((id) => parId.get(id)).filter((m): m is ModeleImage => !!m);
  const { budget } = modeles;
  const devis =
    choisis.length > 0 && choisies.length > 0 ? devisDuLancement({ modeles: choisis, nbCases: choisies.length, budget }) : null;
  const nbImages = choisies.length * Math.max(choisis.length, 1);
  const enCours = progression !== null && progression.faits < progression.total;

  // A paid launch is running: leaving the page would lose its follow-up.
  useEffect(() => {
    if (!enCours) return;
    const garde = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", garde);
    return () => window.removeEventListener("beforeunload", garde);
  }, [enCours]);

  const bloque = !cible
    ? "Aucun sac de ce coloris sans annonce : rien à préparer. Les photos restent disponibles pour un prochain sac."
    : fiche.lignes.length === 0
      ? "Ajoute d’abord les vraies photos (étape 1)."
      : fiche.angles.length === 0
        ? "Aucun prompt d’angle : ajoute-les dans les Réglages du Studio."
        : choisies.length === 0
          ? "Aucune case choisie : choisis-en dans l’étape Angles."
          : mode === "api" && choisis.length === 0
            ? modeles.chargement && catalogue.length === 0
              ? "Chargement des modèles…"
              : catalogue.length === 0
                ? "Aucun modèle disponible : catalogue OpenRouter indisponible."
                : "Choisis au moins un modèle."
            : null;

  /**
   * `confirme` is true only after the confirmation window. The FIRST request
   * goes alone: if the server (which knows the account budget) asks for a
   * confirmation, nothing else is sent and the window opens with its quote.
   * Every request of the launch carries the same `lancementId`, `nbCases` and
   * models: the server's quote is the same for all of them.
   */
  async function generer(confirme: boolean) {
    if (choisis.length === 0 || !cible || enCours || choisies.length === 0) return;
    const devisEcran = devis;
    setConfirmation(null);
    const lancementId = crypto.randomUUID();
    const lot = [...choisies];
    const mods = [...choisis];
    const ids = mods.map((m) => m.id);
    const travaux = lot.flatMap((c) => mods.map((m) => ({ c, m })));
    const prog: Progression = { total: travaux.length, faits: 0, erreurs: [] };
    setProgression({ ...prog });
    const nouveaux: string[] = [];
    let compte = false;
    let refus: { devis: DevisMultiModeles | null; message: string | null } | undefined;
    const tache = ({ c, m }: { c: Choix; m: ModeleImage }) => async () => {
      if (refus !== undefined) return;
      const r = await envoyerGeneration({
        cle: fiche.coloris.cle,
        angleId: c.angleId,
        referenceId: c.referenceId,
        skuCible: cible,
        nbCases: lot.length,
        modele: m.id,
        modeles: ids,
        lancementId,
        confirme,
      });
      if (r.kind === "confirmation") {
        refus = { devis: r.devis, message: r.message };
        return;
      }
      prog.faits++;
      if (r.kind === "ok") nouveaux.push(r.essaiId);
      else {
        prog.erreurs.push(`Photo ${String(c.ordre).padStart(2, "0")}${mods.length > 1 ? ` · ${m.nom}` : ""} : ${r.message}`);
        if (CODES_COMPTE.has(r.code ?? "")) compte = true;
      }
      setProgression({ ...prog, erreurs: [...prog.erreurs] });
    };
    await tache(travaux[0])();
    if (refus === undefined) await parPaquets(travaux.slice(1).map(tache), EN_PARALLELE);
    const refuse = refus as { devis: DevisMultiModeles | null; message: string | null } | undefined;
    if (refuse !== undefined && nouveaux.length === 0) {
      // Nothing was generated: the server wants Aramis's go first, with ITS quote.
      setProgression(null);
      const quoi = refuse.devis ?? devisEcran;
      if (quoi) setConfirmation({ devis: quoi, serveur: refuse.devis !== null, message: refuse.message });
      else toastErreur(refuse.message ?? "Le serveur demande une confirmation : relance la génération.");
      return;
    }
    choix.automatique();
    router.refresh();
    if (prog.erreurs.length > 0) {
      toastErreur(
        `${pluriel(prog.erreurs.length, "génération", "générations")} en échec${compte ? " : vérifie ta clé OpenRouter dans Mon compte" : ""}. Détail sous le bouton « Générer ».`,
      );
    }
    if (nouveaux.length > 0) {
      toastSucces(
        mods.length > 1
          ? `${pluriel(nouveaux.length, "image générée", "images générées")} : compare-les côte à côte dans « À juger ».`
          : `${pluriel(nouveaux.length, "image générée", "images générées")} : elles rejoignent la file « À juger ».`,
      );
      onNouveaux(nouveaux);
    }
  }

  // ── By hand, in Gemini ──────────────────────────────────────────────────
  const nomFichier = (c: Choix) => `${String(c.ordre).padStart(2, "0")}-${fiche.coloris.cle}.jpg`;

  async function telechargerPhotos() {
    for (const c of choisies) {
      const res = await fetch(`/api/studio/image?ref=${c.referenceId}`).catch(() => null);
      if (!res?.ok) {
        toastErreur(`Photo ${c.ordre} illisible.`);
        continue;
      }
      triggerDownload(await res.blob(), nomFichier(c));
    }
  }

  const promptsNumerotes = () =>
    choisies.map((c) => `${String(c.ordre).padStart(2, "0")} — ${fiche.angles.find((a) => a.id === c.angleId)?.angle ?? ""}`).join("\n");

  async function deposer(liste: File[]) {
    const fichiers = fichiersImages(liste).sort(parNom);
    if (fichiers.length === 0 || enCours || !cible) return;
    if (fichiers.length !== choisies.length) {
      toastErreur(
        `${pluriel(fichiers.length, "image", "images")} pour ${pluriel(choisies.length, "case choisie", "cases choisies")} : il en faut autant, dans le même ordre.`,
      );
      return;
    }
    const lot = [...choisies];
    const prog: Progression = { total: lot.length, faits: 0, erreurs: [] };
    setProgression({ ...prog });
    const nouveaux: string[] = [];
    for (let i = 0; i < lot.length; i++) {
      const c = lot[i];
      try {
        const p = await preparer(fichiers[i]);
        if (!p.ok) throw new Error(p.erreur);
        const form = new FormData();
        form.set("cle", fiche.coloris.cle);
        form.set("referenceId", c.referenceId);
        form.set("angleId", c.angleId);
        form.set("skuCible", cible);
        form.set("image", p.jpeg, nomFichier(c));
        const res = await fetch("/api/studio/essais", { method: "POST", body: form });
        if (!res.ok) throw new Error(await lireErreur(res));
        nouveaux.push(((await res.json()) as { id: string }).id);
      } catch (e) {
        prog.erreurs.push(`${fichiers[i].name} : ${e instanceof Error ? e.message : "connexion perdue"}`);
      }
      prog.faits++;
      setProgression({ ...prog, erreurs: [...prog.erreurs] });
    }
    choix.automatique();
    router.refresh();
    if (prog.erreurs.length > 0) toastErreur(`${pluriel(prog.erreurs.length, "dépôt", "dépôts")} en échec.`);
    if (nouveaux.length > 0) onNouveaux(nouveaux);
  }

  const resume = enCours
    ? `${mode === "api" ? "Génération" : "Dépôt"} ${progression!.faits} / ${progression!.total}…`
    : !cible
      ? "aucun sac à préparer"
      : mode === "manuel"
        ? `${pluriel(choisies.length, "image", "images")} · à la main, dans Gemini`
        : `${pluriel(nbImages, "image", "images")}${choisis.length > 0 ? ` · ${choisis.map((m) => m.nom).join(" + ")}` : ""}${devis ? ` · devis ${montantCourt(devis)}` : ""}`;

  return (
    <SectionEtape etape="generation" numero={numero} titre="Génération" resume={resume} ouverte={ouverte} courante={courante} onBasculer={onBasculer}>
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList aria-label="Façon de générer">
          <TabsTrigger value="api">Par API</TabsTrigger>
          <TabsTrigger value="manuel">À la main, dans Gemini</TabsTrigger>
        </TabsList>

        <TabsContent value="api">
          <div className="grid gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
            <div data-emplacement="selecteur-modeles" className="flex min-w-0 flex-col gap-3">
              <span className="block font-mono text-xs tracking-[0.14em] text-ink-2">MODÈLE</span>
              <SelecteurModeles contexte={modeles} selection={selection} onSelection={setSelection} />
            </div>

            <div role="group" aria-label="Devis du lancement" className="flex h-fit flex-col gap-3 rounded-md bg-surface-2 p-4 min-[1100px]:sticky min-[1100px]:top-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-ink">Devis du lancement</span>
                <span className="font-mono text-lg font-bold tabular-nums text-ink">{devis ? montantCourt(devis) : "—"}</span>
              </div>
              <p className="text-sm text-ink-2">
                {!cible
                  ? "Rien à générer"
                  : choisis.length > 1
                    ? `${pluriel(choisies.length, "prise", "prises")} × ${choisis.length} modèles = ${pluriel(nbImages, "image", "images")} pour ${cible}`
                    : `${pluriel(choisies.length, "image", "images")} pour ${cible}`}
              </p>
              {devis && <JaugeDevis devis={devis} />}
              {devis && choisis.length > 1 && (
                <ul aria-label="Coût par modèle" className="flex flex-col gap-1 border-t border-line pt-2 text-sm">
                  {devis.parModele.map((l) => (
                    <li key={l.modele} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-ink-2">{l.nom}</span>
                      <span className="flex-none font-mono tabular-nums text-ink">{l.eur === null ? "prix inconnu" : formatEur(l.eur)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className={cn("text-sm", devis?.confirmationRequise ? "font-semibold text-ink" : "text-ink-2")}>
                {!devis
                  ? "Le devis s’affiche dès qu’un modèle et une case sont choisis."
                  : devis.raisonConfirmation === "budget"
                    ? "Au-delà de ton budget par sac : tu confirmeras le montant avant de lancer."
                    : devis.raisonConfirmation
                      ? "Un prix n’est pas publié : tu confirmeras avant de lancer."
                      : "Dans ton budget : part sans confirmation. Ta clé OpenRouter paie."}
              </p>
              {choisis.length > 1 && (
                <p className="flex items-start gap-2 text-sm text-ink-2">
                  <GitCompareArrows size={16} aria-hidden className="mt-0.5 flex-none" />
                  Chaque prise part sur les {choisis.length} modèles : tu les compares côte à côte dans « À juger », et tu en retiens une.
                </p>
              )}
              {bloque && (
                <p role="status" className="text-sm font-semibold text-ink">
                  {bloque}
                </p>
              )}
              <Button
                size="lg"
                disabled={!!bloque}
                pending={enCours}
                pendingLabel={enCours ? `Génération ${progression!.faits} / ${progression!.total}…` : undefined}
                onClick={() => (devis?.confirmationRequise ? setConfirmation({ devis, serveur: false, message: null }) : void generer(false))}
              >
                <Sparkles size={16} aria-hidden />
                {choisies.length && choisis.length ? `Générer ${pluriel(nbImages, "image", "images")}` : "Générer"}
              </Button>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm text-ink-2">
                <span>
                  Budget <strong className="font-mono font-semibold tabular-nums text-ink">{formatEur(budget.budgetParSacEur)}</strong> par sac
                </span>
                <Popover open={budgetOuvert} onOpenChange={setBudgetOuvert}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Settings2 size={14} aria-hidden /> Modifier le budget
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" aria-label="Budget du Studio" className="w-[min(22rem,calc(100vw-2rem))] p-4">
                    <ReglageBudget
                      initial={budget}
                      empile
                      onEnregistre={(b) => {
                        modeles.majBudget(b);
                        setBudgetOuvert(false);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button variant="ghost" size="sm" onClick={onVoirAngles}>
                Revoir les angles choisis
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="manuel">
          <ol className="grid gap-3 min-[1100px]:grid-cols-3">
            <Etape n={1} titre="Nouvelle conversation Gemini">
              <span>
                Modèle <strong>Pro</strong>, format <strong>3:4</strong>. Colle le prompt maître une seule fois ; Gemini répond OK.
              </span>
              <Button variant="secondary" size="sm" disabled={!fiche.promptMaitre} onClick={() => void copier(fiche.promptMaitre, "Prompt maître")}>
                <Copy size={14} aria-hidden /> {fiche.promptMaitre ? "Copier le prompt maître" : "Prompt maître vide"}
              </Button>
            </Etape>
            <Etape n={2} titre={`Envoie les ${choisies.length} photos choisies`}>
              <span>Pour chacune : la photo, puis son prompt d’angle. Les fichiers sont numérotés dans le même ordre que les prompts.</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" disabled={choisies.length === 0} onClick={() => void telechargerPhotos()}>
                  <Download size={14} aria-hidden /> Photos
                </Button>
                <Button variant="secondary" size="sm" disabled={choisies.length === 0} onClick={() => void copier(promptsNumerotes(), "Prompts d’angle")}>
                  <Copy size={14} aria-hidden /> Prompts d’angle
                </Button>
              </div>
            </Etape>
            <Etape n={3} titre="Dépose les résultats">
              <span>Dans le même ordre : chaque image retrouve sa case et part au jugement.</span>
              {bloque && <span className="font-semibold text-ink">{bloque}</span>}
              <Button
                size="sm"
                disabled={!!bloque}
                pending={enCours}
                pendingLabel={enCours ? `Dépôt ${progression!.faits} / ${progression!.total}…` : undefined}
                onClick={() => depot.current?.click()}
              >
                <Upload size={14} aria-hidden /> Déposer
              </Button>
              <input
                ref={depot}
                type="file"
                accept={ACCEPT}
                multiple
                hidden
                onChange={(e) => {
                  void deposer(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </Etape>
          </ol>
        </TabsContent>
      </Tabs>

      {progression && (enCours || progression.erreurs.length > 0) && (
        <div role="status" className="mt-4">
          {enCours ? (
            <p className="text-sm text-ink-2">
              Une génération payée est en cours : {progression.faits} / {progression.total}. Reste sur la page jusqu’à la fin.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 rounded-md border border-neg bg-neg-soft p-3 text-sm text-ink">
              {progression.erreurs.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmationDepense
        devis={confirmation?.devis ?? null}
        serveur={confirmation?.serveur ?? false}
        message={confirmation?.message ?? null}
        onFermer={() => setConfirmation(null)}
        onConfirmer={() => void generer(true)}
      />
    </SectionEtape>
  );
}

function Etape({ n, titre, children }: { n: number; titre: string; children: ReactNode }) {
  return (
    <li className="flex flex-col items-start gap-2 rounded-md bg-surface-2 p-4 text-sm text-ink-2">
      <div className="flex items-center gap-2 text-base font-semibold text-ink">
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-surface text-sm font-bold">{n}</span>
        {titre}
      </div>
      {children}
    </li>
  );
}

/** The launch against the budget per bag: the bar fills up to the budget, an overrun is said in words. */
function JaugeDevis({ devis }: { devis: DevisMultiModeles }) {
  const part = partDuBudget(devis.totalConnuEur, devis.budgetEur) ?? 0;
  const hors = devis.depasseBudget;
  const trop = depassement(devis.totalConnuEur, devis.budgetEur);
  return (
    <div className="flex flex-col gap-1.5">
      <span aria-hidden className="relative h-2 overflow-hidden rounded-full bg-surface-3">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", hors ? "bg-warn" : "bg-chart")} style={{ width: `${Math.min(part, 1) * 100}%` }} />
      </span>
      <span className="text-xs text-ink-2">
        <span className="font-mono tabular-nums text-ink">{formatEur(devis.montantConfirmationEur)}</span>
        {devis.inconnus > 0 ? " + prix inconnu" : ""} sur <span className="font-mono tabular-nums">{formatEur(devis.budgetEur)}</span> de budget par sac
        {trop ? ` · ${trop}` : ""}
      </span>
    </div>
  );
}
