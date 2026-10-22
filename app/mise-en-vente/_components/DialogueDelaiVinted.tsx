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

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { delaiDepuisSaisie, type DelaiVinted, type ModeDelai } from "../_delaiVinted";

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

  function confirmer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const r = delaiDepuisSaisie(mode, min, max);
    if (!r.ok) {
      setErreur(r.erreur);
      return;
    }
    onConfirmer(r.delai);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(ouvert) => {
        if (!ouvert) onAnnuler();
      }}
      title="Délai entre deux brouillons"
      size="sm"
      as="form"
      onSubmit={confirmer}
      footer={
        <>
          <Button variant="secondary" onClick={onAnnuler}>
            Annuler
          </Button>
          <Button type="submit">{libelleAction}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-2">
          Le premier article part tout de suite. Ce délai s&apos;applique entre
          les annonces suivantes — c&apos;est le garde-fou anti-ban.
        </p>

        <Segmented
          label="Type de délai"
          value={mode}
          onValueChange={setMode}
          options={[
            { valeur: "fixe", libelle: "Délai fixe" },
            { valeur: "fourchette", libelle: "Fourchette aléatoire" },
          ]}
          className="flex w-full [&>*]:flex-1"
        />

        {mode === "fixe" ? (
          <Field label="Minutes">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Minimum (min)">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </Field>
            <Field label="Maximum (min)">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </Field>
          </div>
        )}

        {erreur && (
          <p role="alert" className="font-mono text-xs text-neg">
            {erreur}
          </p>
        )}
      </div>
    </Dialog>
  );
}
