"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Sparkles, Upload } from "lucide-react";

import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pluriel } from "@/lib/format";
import { toastErreur, toastSucces } from "@/lib/toast";
import { triggerDownload } from "@/lib/imageProcessing";
import type { ModeleImage } from "@/lib/studioModeles";

import ChoixModele from "./ChoixModele";
import { fichiersImages, lireErreur, preparer, ACCEPT } from "./envoi";
import type { FicheClient } from "./Fiche";
import { CODES_COMPTE, copier, envoyerGeneration, parNom, parPaquets } from "./lancer";
import { devisPour, montantDevis, type ContexteModeles } from "./SelecteurModeles";
import { SectionEtape } from "./SectionEtape";
import type { Choix, ChoixCases } from "./useParcours";

/** Generations in flight at once: fast enough, without flooding the key. */
const EN_PARALLELE = 3;

type Mode = "api" | "manuel";
type Progression = { total: number; faits: number; erreurs: string[] };

/**
 * Step 3, generation: the cells picked in step 2, by API (one request per
 * cell, three at a time) or by hand in Gemini. The quote is the screen's; the
 * server computes its own before paying and refuses an unconfirmed launch.
 *
 * The model area (`data-emplacement="selecteur-modeles"`) is where the
 * « Studio, modèles » lot plugs its picker, its budget per bag and its
 * multi-model launch; the launch column on the right stays.
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
  const [modeleId, setModeleId] = useState<string | null>(null);
  /** Confirmation window: `message` = the server's words when it asked (409), else the screen's quote. */
  const [confirmation, setConfirmation] = useState<{ message: string | null } | null>(null);
  const [progression, setProgression] = useState<Progression | null>(null);
  const depot = useRef<HTMLInputElement>(null);

  const catalogue = modeles.catalogue?.modeles ?? [];
  const parId = new Map(catalogue.map((m) => [m.id, m]));
  const favoris = modeles.favoris.map((id) => parId.get(id)).filter((m): m is ModeleImage => !!m);
  const modele = (modeleId && parId.get(modeleId)) || favoris[0] || catalogue[0] || null;
  const devis = modele && choisies.length > 0 ? devisPour(Array.from({ length: choisies.length }, () => modele), 1) : null;
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
          : mode === "api" && !modele
            ? modeles.chargement
              ? "Chargement des modèles…"
              : "Aucun modèle disponible : catalogue OpenRouter indisponible."
            : null;

  /**
   * `confirme` is true only after the confirmation window. The FIRST request
   * goes alone: if the server (which knows the account budget) asks for a
   * confirmation, nothing else is sent and the window opens with its words.
   */
  async function generer(confirme: boolean) {
    if (!modele || !cible || enCours || choisies.length === 0) return;
    setConfirmation(null);
    const lancementId = crypto.randomUUID();
    const lot = [...choisies];
    const prog: Progression = { total: lot.length, faits: 0, erreurs: [] };
    setProgression({ ...prog });
    const nouveaux: string[] = [];
    let compte = false;
    let refus: string | null | undefined;
    const tache = (c: Choix) => async () => {
      if (refus !== undefined) return;
      const r = await envoyerGeneration({
        cle: fiche.coloris.cle,
        angleId: c.angleId,
        referenceId: c.referenceId,
        skuCible: cible,
        nbCases: lot.length,
        modele: modele.id,
        modeles: [modele.id],
        lancementId,
        confirme,
      });
      if (r.kind === "confirmation") {
        refus = r.message;
        return;
      }
      prog.faits++;
      if (r.kind === "ok") nouveaux.push(r.essaiId);
      else {
        prog.erreurs.push(`Photo ${String(c.ordre).padStart(2, "0")} : ${r.message}`);
        if (CODES_COMPTE.has(r.code ?? "")) compte = true;
      }
      setProgression({ ...prog, erreurs: [...prog.erreurs] });
    };
    await tache(lot[0])();
    if (refus === undefined) await parPaquets(lot.slice(1).map(tache), EN_PARALLELE);
    if (refus !== undefined && nouveaux.length === 0) {
      // Nothing was generated: the server wants Aramis's go first.
      setProgression(null);
      setConfirmation({ message: refus });
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
      toastSucces(`${pluriel(nouveaux.length, "image générée", "images générées")} : elles rejoignent la file « À juger ».`);
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
        : `${pluriel(choisies.length, "image", "images")}${modele ? ` · ${modele.nom}` : ""}${devis ? ` · devis ${montantDevis(devis)}` : ""}`;

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
              <div className="font-mono text-xs tracking-[0.14em] text-ink-2">MODÈLE</div>
              <ChoixModele modeles={modeles} choisi={modele} onChoisir={setModeleId} />
            </div>

            <div className="flex flex-col gap-3 rounded-md bg-surface-2 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-ink-2">
                  {cible ? `${pluriel(choisies.length, "image", "images")} pour ${cible}` : "Rien à générer"}
                </span>
                <span className="font-mono text-lg font-bold text-ink">{devis ? montantDevis(devis) : "—"}</span>
              </div>
              <p className="text-sm text-ink-2">
                {devis
                  ? devis.confirmationRequise
                    ? "Au-delà de ton budget par sac, ou tarif inconnu : une confirmation te sera demandée."
                    : "Dans le budget : part sans confirmation, sauf si le serveur en décide autrement. Ta clé OpenRouter paie."
                  : "Le devis s’affiche dès qu’une case est choisie."}
              </p>
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
                onClick={() => (devis?.confirmationRequise ? setConfirmation({ message: null }) : void generer(false))}
              >
                <Sparkles size={16} aria-hidden />
                {choisies.length ? `Générer ${pluriel(choisies.length, "image", "images")}` : "Générer"}
              </Button>
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

      <AlertDialog
        open={confirmation !== null && !!modele}
        onOpenChange={(o) => !o && setConfirmation(null)}
        tone="neutre"
        title="Confirmer la dépense"
        description={
          confirmation?.message
            ? `${confirmation.message} Ta clé OpenRouter paie.`
            : devis && modele
              ? `${pluriel(choisies.length, "image", "images")} avec ${modele.nom} : ${
                  devis.inconnus > 0 && devis.totalConnuUsd === 0 ? "coût inconnu (tarif non publié)" : `estimé à ${montantDevis(devis)}`
                }. Confirmation demandée au-delà de ton budget par sac ou dès qu’un tarif est inconnu. Ta clé OpenRouter paie.`
              : ""
        }
        confirmLabel={devis && devis.inconnus === 0 ? `Confirmer ${montantDevis(devis)}` : "Confirmer quand même"}
        onConfirm={() => void generer(true)}
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
