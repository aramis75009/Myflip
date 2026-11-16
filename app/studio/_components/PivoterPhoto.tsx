"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toastAvertissement, toastErreur, toastSucces } from "@/lib/toast";
import { ANGLE_MAX, ANGLE_MIN, echelleRecadrage, libelleAngle, lireAngleSaisi, transformApercu } from "@/lib/studioPivot";

import { lireErreur } from "./envoi";

export type PhotoAPivoter = { id: string; ordre: number };

/**
 * « Pivoter » — a small tool on a stored board photo. The angle is set by a
 * slider (−45° to +45°, to the degree) AND a box where the exact angle is
 * typed; both stay in sync. The preview is live, client side only: a CSS
 * transform of the stored image, enlarged just enough that no empty corner
 * shows (`echelleRecadrage`, the same function the server renders with, so
 * what is saved is what is seen).
 *
 * « Enregistrer » asks the server for a COPY, shown next to the original on the
 * board; the original is never touched. « Annuler » does nothing.
 */
export default function PivoterPhoto({
  photo,
  nom,
  onFermer,
}: {
  /** The photo to rotate; null = closed. */
  photo: PhotoAPivoter | null;
  /** Name of its shot (« Face · détail gauche »). */
  nom: string;
  onFermer: () => void;
}) {
  const router = useRouter();
  const idCurseur = useId();
  const idSaisie = useId();
  const [angle, setAngle] = useState(0);
  const [saisie, setSaisie] = useState("0");
  // Natural size of the stored image: the preview frame takes its ratio.
  const [taille, setTaille] = useState<{ l: number; h: number } | null>(null);
  const [envoi, setEnvoi] = useState(false);

  // Every opening starts from scratch: 0°, no size known yet.
  const idPhoto = photo?.id ?? null;
  useEffect(() => {
    setAngle(0);
    setSaisie("0");
    setTaille(null);
    setEnvoi(false);
  }, [idPhoto]);

  function choisir(n: number) {
    setAngle(n);
    setSaisie(String(n));
  }

  function surSaisie(texte: string) {
    setSaisie(texte);
    const n = lireAngleSaisi(texte);
    if (n === null) return; // « - » en cours de frappe, case vide : on attend
    setAngle(n);
    // Out of range (« 90 »): the box shows what is really applied, at once.
    const brut = Number(texte.trim().replace(",", "."));
    if (brut > ANGLE_MAX || brut < ANGLE_MIN) setSaisie(String(n));
  }

  function surTouche(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    choisir(Math.min(ANGLE_MAX, Math.max(ANGLE_MIN, angle + (e.key === "ArrowUp" ? 1 : -1))));
  }

  async function enregistrer() {
    if (!photo || angle === 0 || envoi) return;
    setEnvoi(true);
    try {
      const res = await fetch(`/api/studio/references/${photo.id}/pivoter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angle }),
      });
      if (res.status === 409) {
        // The same copy already exists: nothing to add, said as it is.
        toastAvertissement(await lireErreur(res));
      } else if (!res.ok) {
        toastErreur(`Copie impossible : ${await lireErreur(res)}`);
      } else {
        toastSucces(`Copie à ${libelleAngle(angle)} enregistrée à côté de la photo « ${nom} ».`);
        onFermer();
        router.refresh();
      }
    } catch {
      toastErreur("Connexion perdue : la copie n’a pas été enregistrée.");
    } finally {
      setEnvoi(false);
    }
  }

  const echelle = taille ? echelleRecadrage(taille.l, taille.h, angle) : 1;
  const ratio = taille ? taille.l / taille.h : 3 / 4;

  return (
    <Dialog
      open={photo !== null}
      onOpenChange={(ouvert) => !ouvert && onFermer()}
      title={photo ? `Pivoter « ${nom} »` : "Pivoter la photo"}
      description="Une copie est rangée à côté de la photo ; l’originale reste intacte."
      size="lg"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        void enregistrer();
      }}
      pending={envoi}
      footer={
        <>
          <Button variant="secondary" disabled={envoi} onClick={onFermer}>
            Annuler
          </Button>
          <Button type="submit" pending={envoi} pendingLabel="Enregistrement…" disabled={angle === 0}>
            Enregistrer une copie
          </Button>
        </>
      }
    >
      {photo && (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_14rem]">
          {/* Live preview: the stored image, turned then enlarged around its centre, clipped to the ratio of the original. */}
          <div className="flex justify-center">
            <div
              data-testid="apercu-pivot"
              className="relative overflow-hidden rounded-sm bg-surface-3"
              style={{ aspectRatio: `${ratio}`, width: `min(100%, calc(60vh * ${ratio}))` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- image privée servie par /api/studio/image */}
              <img
                key={photo.id}
                src={`/api/studio/image?ref=${photo.id}`}
                alt={`Aperçu de la photo « ${nom} », pivotée de ${libelleAngle(angle)}`}
                draggable={false}
                onLoad={(e) => setTaille({ l: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                className="absolute inset-0 h-full w-full select-none"
                style={{ transform: taille ? transformApercu(taille.l, taille.h, angle) : "none", transformOrigin: "center" }}
              />
              {/* Grid of thirds, to level a line by eye. Not part of the saved image. */}
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <span className="absolute inset-y-0 left-1/3 w-px bg-surface/60" />
                <span className="absolute inset-y-0 left-2/3 w-px bg-surface/60" />
                <span className="absolute inset-x-0 top-1/3 h-px bg-surface/60" />
                <span className="absolute inset-x-0 top-2/3 h-px bg-surface/60" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <label htmlFor={idCurseur} className="text-sm font-semibold text-ink">
                Angle
              </label>
              <input
                id={idCurseur}
                type="range"
                min={ANGLE_MIN}
                max={ANGLE_MAX}
                step={1}
                value={angle}
                onChange={(e) => choisir(Number(e.target.value))}
                aria-valuetext={libelleAngle(angle)}
                className="w-full cursor-pointer accent-accent"
              />
              <div className="flex justify-between font-mono text-xs text-ink-3" aria-hidden>
                <span>−45°</span>
                <span>0°</span>
                <span>+45°</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor={idSaisie} className="text-sm font-semibold text-ink">
                Angle exact, en degrés
              </label>
              <div className="flex items-center gap-2">
                <Input
                  id={idSaisie}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={saisie}
                  onChange={(e) => surSaisie(e.target.value)}
                  onKeyDown={surTouche}
                  onBlur={() => setSaisie(String(angle))}
                  className="w-24 font-mono"
                />
                <Button variant="ghost" size="sm" disabled={angle === 0 || envoi} onClick={() => choisir(0)}>
                  <RotateCcw size={14} aria-hidden /> À 0°
                </Button>
              </div>
              <p className="text-xs text-ink-2">De {ANGLE_MIN}° à +{ANGLE_MAX}°. Positif : dans le sens des aiguilles d’une montre.</p>
            </div>

            <p className="text-sm text-ink-2" aria-live="polite">
              {angle === 0
                ? "À 0° il n’y a rien à enregistrer."
                : `Agrandie de ×${echelle.toFixed(2).replace(".", ",")} pour qu’aucun coin ne reste vide. Mêmes dimensions que l’originale.`}
            </p>
          </div>
        </div>
      )}
    </Dialog>
  );
}
