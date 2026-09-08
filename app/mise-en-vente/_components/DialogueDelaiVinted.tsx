"use client";

// Le pop-up de choix du délai anti-ban, ouvert avant qu'un seul article ne
// parte en file.
//
// Il remplace un réglage de compte que l'extension allait lire dans le DOM de
// /compte — le mécanisme le plus fragile du chantier précédent, et le seul à
// produire un mode de panne muet : /compte jamais visité, et la file ne
// démarrait pas sans que rien ne le dise.
//
// AUCUNE LOGIQUE ICI. La validation et le format vivent dans `_delaiVinted.ts`,
// en fonctions pures testées ; ce composant ne fait que les brancher sur la
// modale de l'application. React ne se teste pas sur ce projet (cf.
// vitest.config.ts) : tout ce qui est décidable doit rester en dehors.

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { delaiDepuisSaisie, type DelaiVinted, type ModeDelai } from "../_delaiVinted";
import { inputCls, labelCls } from "../_ui";

export default function DialogueDelaiVinted({
  open,
  initial,
  libelleAction,
  onAnnuler,
  onConfirmer,
}: {
  open: boolean;
  /**
   * Dernier délai retenu, relu du `localStorage` par l'appelant.
   *
   * ⚠️ Sa RÉFÉRENCE doit être stable entre deux rendus : l'effet ci-dessous
   * réinitialise les champs quand elle change, et un objet recréé à chaque
   * rendu effacerait la saisie en cours à chaque frappe. `page.tsx` le range
   * dans un `useState` posé au clic, exactement pour cette raison.
   */
  initial: DelaiVinted;
  /** Ce que fait le bouton de confirmation. Ex. « Lancer le lot ». */
  libelleAction: string;
  onAnnuler: () => void;
  onConfirmer: (delai: DelaiVinted) => void;
}) {
  const [mode, setMode] = useState<ModeDelai>("fourchette");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  // Réarmé à CHAQUE ouverture, pas seulement au montage : le dialogue reste
  // monté entre deux lancements, et la saisie abandonnée du précédent ne doit
  // pas revenir telle quelle.
  useEffect(() => {
    if (!open) return;
    setMode(initial.minMinutes === initial.maxMinutes ? "fixe" : "fourchette");
    setMin(String(initial.minMinutes));
    setMax(String(initial.maxMinutes));
    setErreur(null);
  }, [open, initial]);

  function confirmer() {
    const r = delaiDepuisSaisie(mode, min, max);
    if (!r.ok) {
      setErreur(r.erreur);
      return;
    }
    onConfirmer(r.delai);
  }

  const ongletCls = (actif: boolean) =>
    `inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border-[1.5px] px-4 text-[13.5px] font-semibold transition-all ${
      actif
        ? "border-[var(--acc)] bg-[var(--acc)] text-[var(--acc-ink)]"
        : "border-[var(--border)] bg-surface text-[var(--ink2)] hover:border-[var(--border-strong)]"
    }`;

  return (
    <Modal
      open={open}
      onClose={onAnnuler}
      title="Délai entre deux brouillons"
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onAnnuler}
            className="min-h-[44px] rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 text-[12.5px] font-medium text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)]"
          >
            Annuler
          </button>
          <button
            onClick={confirmer}
            className="min-h-[44px] rounded-full bg-[var(--acc)] px-5 text-[12.5px] font-semibold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)]"
          >
            {libelleAction}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-[var(--ink2)]">
          Le premier article part tout de suite. Ce délai s&apos;applique entre
          les annonces suivantes — c&apos;est le garde-fou anti-ban.
        </p>

        <div className="flex gap-2.5">
          <button
            type="button"
            aria-pressed={mode === "fixe"}
            onClick={() => setMode("fixe")}
            className={ongletCls(mode === "fixe")}
          >
            Délai fixe
          </button>
          <button
            type="button"
            aria-pressed={mode === "fourchette"}
            onClick={() => setMode("fourchette")}
            className={ongletCls(mode === "fourchette")}
          >
            Fourchette aléatoire
          </button>
        </div>

        {mode === "fixe" ? (
          <div>
            <label className={labelCls} htmlFor="delai-fixe">
              Minutes
            </label>
            <input
              id="delai-fixe"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className={inputCls}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="delai-min">
                Minimum (min)
              </label>
              <input
                id="delai-min"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="delai-max">
                Maximum (min)
              </label>
              <input
                id="delai-max"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {erreur && (
          <p className="font-mono text-[12px] text-[var(--neg)]">{erreur}</p>
        )}
      </div>
    </Modal>
  );
}
