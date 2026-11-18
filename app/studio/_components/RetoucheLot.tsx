"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Crop, Frame, Lock, Pipette, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { pluriel } from "@/lib/format";
import { toastErreur, toastSucces } from "@/lib/toast";
import { ANGLE_MAX, ANGLE_MIN, libelleAngle, lireAngleSaisi } from "@/lib/studioPivot";
import {
  ADOUCISSEMENT_MAX,
  CADRE_DEFAUT,
  COULEURS_CADRE,
  EPAISSEUR_MAX,
  RECADRAGE_MAX,
  estIdentite,
  geometrieRetouche,
  nomCouleur,
  type Cadre,
  type ModeRotation,
  type Retouche,
} from "@/lib/studioRetouche";
import type { VersionEnBase } from "@/lib/studioVersion";

import ApercuRetouche from "./ApercuRetouche";
import { lireErreur } from "./envoi";

/** The panel's settings: the retouch, plus the frame's last settings when it is switched off (they come back on). */
export type ReglagesLot = { angle: number; modeRotation: ModeRotation; recadragePct: number; cadreActif: boolean; cadre: Cadre };

export const REGLAGES_INITIAUX: ReglagesLot = { angle: 0, modeRotation: "zoom", recadragePct: 0, cadreActif: false, cadre: CADRE_DEFAUT };

export const retoucheDe = (r: ReglagesLot): Retouche => ({
  angle: r.angle,
  modeRotation: r.modeRotation,
  recadragePct: r.recadragePct,
  cadre: r.cadreActif ? r.cadre : null,
});

export type PhotoCochee = { id: string; ordre: number; nom: string };

const num = (o: number) => String(o).padStart(2, "0");

/**
 * Batch retouch (PRD 2026-11-16, story 1 to 12): ONE panel for every checked
 * photo of the bag, with a live preview of each. Rotate (−45° to +45°, slider
 * and box in sync; zoom with no empty corner, or white edges with the whole
 * image), crop (0 to 30 %, centred), frame (colour, thickness, soft edge).
 *
 * « Enregistrer en Version N » saves a retouched COPY of each checked photo and
 * puts them in a new version of the bag; the originals never change. No
 * « judge / validate » step: the preview is the check (decision of 16/11).
 * The settings live in the parent: reopening the panel finds them again.
 */
export default function RetoucheLot({
  ouvert,
  onFermer,
  photos,
  cle,
  skuSource,
  numeroSuivant,
  reglages,
  onReglages,
  onVersionCreee,
}: {
  ouvert: boolean;
  onFermer: () => void;
  /** The checked photos, in board order. */
  photos: readonly PhotoCochee[];
  cle: string;
  /** The bag shown in the sheet: its Version 1 gives the new version its text. */
  skuSource: string | null;
  numeroSuivant: number;
  reglages: ReglagesLot;
  onReglages: (r: ReglagesLot) => void;
  onVersionCreee: (v: VersionEnBase) => void;
}) {
  const ids = {
    piv: useId(),
    rec: useId(),
    cad: useId(),
    couleur: useId(),
    ep: useId(),
    ad: useId(),
  };
  const [saisie, setSaisie] = useState<string | null>(null);
  // Frame off: its settings stay visible but out of reach and out of the tab order (`inert`, set by hand: React 18 does not know it).
  const corpsCadre = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = corpsCadre.current;
    if (!el) return;
    if (reglages.cadreActif) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  });
  const [envoi, setEnvoi] = useState(false);
  const retouche = retoucheDe(reglages);
  const identite = estIdentite(retouche);
  const n = photos.length;
  const maj = (p: Partial<ReglagesLot>) => onReglages({ ...reglages, ...p });
  const majCadre = (p: Partial<Cadre>) => onReglages({ ...reglages, cadreActif: true, cadre: { ...reglages.cadre, ...p } });

  // ── Angle: slider and box stay in sync (same rules as the former « Pivoter ») ─
  const choisirAngle = (a: number) => {
    maj({ angle: Math.min(ANGLE_MAX, Math.max(ANGLE_MIN, a)) });
    setSaisie(null);
  };
  function surSaisie(texte: string) {
    setSaisie(texte);
    const a = lireAngleSaisi(texte);
    if (a === null) return; // « - » en cours de frappe, case vide : on attend
    maj({ angle: a });
    const brut = Number(texte.trim().replace(",", ".").replace("−", "-"));
    if (brut > ANGLE_MAX || brut < ANGLE_MIN) setSaisie(String(a));
  }
  function surTouche(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    choisirAngle(reglages.angle + (e.key === "ArrowUp" ? 1 : -1));
  }

  async function enregistrer() {
    if (n === 0 || envoi) return;
    setEnvoi(true);
    try {
      const res = await fetch("/api/studio/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cle, skuSource, referenceIds: photos.map((p) => p.id), retouche }),
      });
      if (!res.ok) {
        toastErreur(`Version non enregistrée : ${await lireErreur(res)}`);
        return;
      }
      const j = (await res.json()) as { version: VersionEnBase; copiesCreees?: number; copiesReprises?: number };
      const copies = (j.copiesCreees ?? 0) + (j.copiesReprises ?? 0);
      toastSucces(
        copies > 0
          ? `Version ${j.version.numero} enregistrée : ${pluriel(copies, "copie", "copies")}. Les originales n’ont pas changé.`
          : `Version ${j.version.numero} enregistrée avec les photos d’origine.`,
      );
      onVersionCreee(j.version);
    } catch {
      toastErreur("Connexion perdue : la version n’a pas été enregistrée.");
    } finally {
      setEnvoi(false);
    }
  }

  const geoNote = geometrieRetouche(600, 800, { ...retouche, cadre: null, recadragePct: 0 });
  const notePivot =
    reglages.angle === 0
      ? "À 0° la photo ne tourne pas."
      : reglages.modeRotation === "zoom"
        ? `Agrandie de ×${geoNote.agrandissementRotation.toFixed(2).replace(".", ",")} : aucun coin vide.`
        : "Image entière : les coins restent blancs.";
  const noteBas =
    n === 0
      ? "Les originales ne changent pas."
      : identite
        ? `Aucune retouche : les photos d’origine iront telles quelles dans la Version ${numeroSuivant}.`
        : `Les originales ne changent pas : ${pluriel(n, "copie ira", "copies iront")} dans la Version ${numeroSuivant}.`;
  const pastille = COULEURS_CADRE.some((c) => c.hex === reglages.cadre.couleur);

  return (
    <Dialog
      open={ouvert}
      onOpenChange={(o) => !o && onFermer()}
      title={n === 0 ? "Retoucher" : `Retoucher ${pluriel(n, "photo", "photos")}`}
      size="lg"
      className="md:max-w-[980px]"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        void enregistrer();
      }}
      pending={envoi}
      footer={
        <>
          <p className="flex items-center gap-2 text-sm text-ink-2 md:mr-auto">
            <Lock size={14} aria-hidden className="flex-none" />
            <span>{noteBas}</span>
          </p>
          <Button variant="secondary" disabled={envoi} onClick={onFermer}>
            Annuler
          </Button>
          <Button type="submit" pending={envoi} pendingLabel="Enregistrement…" disabled={n === 0}>
            Enregistrer en Version {numeroSuivant}
          </Button>
        </>
      }
    >
      <div className="grid items-start gap-8 md:[grid-template-columns:minmax(0,560px)_minmax(0,1fr)]">
        {/* Live previews */}
        <ul aria-label="Aperçus des photos cochées" className="grid grid-cols-3 content-start gap-3">
          {photos.map((p) => (
            <li key={p.id}>
              <ApercuRetouche
                src={`/api/studio/image?ref=${p.id}`}
                alt={`Aperçu de la photo « ${p.nom} »`}
                retouche={retouche}
                pastille={num(p.ordre)}
              />
            </li>
          ))}
        </ul>

        {/* Settings */}
        <div className="flex flex-col gap-4">
          <section aria-labelledby={ids.piv} className="flex flex-col gap-2.5">
            <h3 id={ids.piv} className="flex items-center gap-2 text-md font-semibold text-ink">
              <RotateCw size={16} aria-hidden /> Pivoter
            </h3>
            <div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={ANGLE_MIN}
                  max={ANGLE_MAX}
                  step={1}
                  value={reglages.angle}
                  onChange={(e) => choisirAngle(Number(e.target.value))}
                  aria-label="Angle de rotation"
                  aria-valuetext={libelleAngle(reglages.angle)}
                  className="w-full cursor-pointer accent-accent"
                />
                <div className="flex flex-none items-center gap-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label="Angle exact, en degrés"
                    value={saisie ?? String(reglages.angle)}
                    onChange={(e) => surSaisie(e.target.value)}
                    onKeyDown={surTouche}
                    onBlur={() => setSaisie(null)}
                    className="block h-9 w-16 rounded border border-line-strong bg-surface px-3 text-center font-mono text-base text-ink transition-colors duration-fast focus-visible:border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  />
                  <span className="font-mono text-base text-ink-2">°</span>
                </div>
              </div>
              <div className="mt-0.5 flex justify-between pr-[88px] font-mono text-xs text-ink-3" aria-hidden>
                <span>−45°</span>
                <span>0°</span>
                <span>+45°</span>
              </div>
            </div>
            <div role="radiogroup" aria-label="Mode de rotation" className="flex flex-col gap-2">
              {(
                [
                  ["zoom", "Zoom (sans coin vide)"],
                  ["bordsBlancs", "Bords blancs (image entière)"],
                ] as const
              ).map(([mode, libelle]) => {
                const actif = reglages.modeRotation === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={actif}
                    onClick={() => maj({ modeRotation: mode })}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors duration-fast",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                      actif ? "border-accent bg-accent-soft font-semibold text-ink" : "border-line bg-surface text-ink-2 hover:border-line-strong",
                    )}
                  >
                    {libelle}
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-ink-2" aria-live="polite">
              {notePivot}
            </p>
          </section>

          <section aria-labelledby={ids.rec} className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id={ids.rec} className="flex items-center gap-2 text-md font-semibold text-ink">
                <Crop size={16} aria-hidden /> Recadrer <span className="text-sm font-normal text-ink-3">centré</span>
              </h3>
              <span className="font-mono text-base text-ink">
                <output>{reglages.recadragePct}</output> %
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={RECADRAGE_MAX}
              step={1}
              value={reglages.recadragePct}
              onChange={(e) => maj({ recadragePct: Number(e.target.value) })}
              aria-label="Recadrage, en pourcentage"
              className="w-full cursor-pointer accent-accent"
            />
          </section>

          <section aria-labelledby={ids.cad} className="flex flex-col gap-3 border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 id={ids.cad} className="flex items-center gap-2 text-md font-semibold text-ink">
                <Frame size={16} aria-hidden /> Cadre
              </h3>
              <button
                type="button"
                role="switch"
                aria-checked={reglages.cadreActif}
                aria-labelledby={ids.cad}
                onClick={() => maj({ cadreActif: !reglages.cadreActif })}
                className="group relative inline-flex h-6 w-11 flex-none items-center rounded-full border border-line-strong bg-surface-3 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface aria-checked:border-accent aria-checked:bg-accent"
              >
                <span className="pointer-events-none block h-4 w-4 translate-x-1 rounded-full bg-surface shadow-pop transition-transform duration-fast group-aria-checked:translate-x-6" />
              </button>
            </div>
            <div ref={corpsCadre} className={cn("flex flex-col gap-3.5 transition-opacity duration-fast", !reglages.cadreActif && "opacity-40")}>
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <span id={ids.couleur} className="text-sm font-semibold text-ink">
                    Couleur
                  </span>
                  <span className="text-sm text-ink-2">{nomCouleur(reglages.cadre.couleur)}</span>
                </div>
                <div role="radiogroup" aria-labelledby={ids.couleur} className="flex items-center gap-3">
                  {COULEURS_CADRE.map((c) => {
                    const actif = reglages.cadre.couleur === c.hex;
                    return (
                      <button
                        key={c.hex}
                        type="button"
                        role="radio"
                        aria-checked={actif}
                        aria-label={c.nom}
                        onClick={() => majCadre({ couleur: c.hex })}
                        style={{ background: c.hex }}
                        className={cn(
                          "relative block h-8 w-8 flex-none cursor-pointer rounded-full border border-line-strong transition-shadow duration-fast",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                          actif && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                        )}
                      />
                    );
                  })}
                  <label
                    role="radio"
                    aria-checked={!pastille}
                    aria-label="Autre couleur"
                    // A free colour shows itself; otherwise a pipette on the surface.
                    style={pastille ? undefined : { background: reglages.cadre.couleur }}
                    className={cn(
                      "relative flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-full border border-line-strong bg-surface text-ink-2 transition-shadow duration-fast focus-within:ring-2 focus-within:ring-focus focus-within:ring-offset-2 focus-within:ring-offset-surface",
                      !pastille && "ring-2 ring-ink ring-offset-2 ring-offset-surface",
                    )}
                  >
                    {pastille && <Pipette size={15} aria-hidden />}
                    <input
                      type="color"
                      value={reglages.cadre.couleur}
                      onChange={(e) => majCadre({ couleur: e.target.value.toLowerCase() })}
                      aria-label="Choisir une autre couleur"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                  </label>
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <label htmlFor={ids.ep} className="text-sm font-semibold text-ink">
                    Épaisseur
                  </label>
                  <span className="font-mono text-sm text-ink">
                    <output htmlFor={ids.ep}>{reglages.cadre.epaisseurPct}</output> %
                  </span>
                </div>
                <input
                  id={ids.ep}
                  type="range"
                  min={0}
                  max={EPAISSEUR_MAX}
                  step={1}
                  value={reglages.cadre.epaisseurPct}
                  onChange={(e) => majCadre({ epaisseurPct: Number(e.target.value) })}
                  className="w-full cursor-pointer accent-accent"
                />
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <label htmlFor={ids.ad} className="text-sm font-semibold text-ink">
                    Bord adouci
                  </label>
                  <span className="font-mono text-sm text-ink">
                    <output htmlFor={ids.ad}>{reglages.cadre.adoucissement}</output> %
                  </span>
                </div>
                <input
                  id={ids.ad}
                  type="range"
                  min={0}
                  max={ADOUCISSEMENT_MAX}
                  step={1}
                  value={reglages.cadre.adoucissement}
                  onChange={(e) => majCadre({ adoucissement: Number(e.target.value) })}
                  className="w-full cursor-pointer accent-accent"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </Dialog>
  );
}
