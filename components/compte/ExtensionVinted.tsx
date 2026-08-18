"use client";

// Réglage du délai anti-ban de l'extension Vinted : une fourchette (min/max,
// en minutes) que l'extension tire au sort avant de remplir automatiquement
// un nouvel onglet. Nullable, sans défaut — Aramis choisit sa propre
// fourchette ; tant qu'elle n'est pas réglée, l'extension ne remplit rien.
//
// Composant séparé d'Integrations.tsx : sujet différent (garde-fou de
// l'extension navigateur, pas une dépendance externe de MyFlip).

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { CardTitle, Module } from "@/components/console";
import { useReglages, useSetDelaiVinted } from "@/lib/hooks";

const labelCls =
  "font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--faint)]";
const inputCls =
  "min-h-[44px] w-full rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4 text-[14px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--acc)] disabled:cursor-not-allowed disabled:opacity-60";

/** Chaîne de saisie → entier ou `null` (champ vide = borne non réglée). */
function versNombre(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function ExtensionVinted() {
  const { data: reglages } = useReglages();
  const enregistrer = useSetDelaiVinted();

  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  // La saisie suit les valeurs du serveur tant que l'utilisateur n'a rien
  // tapé — même parti que l'objectif mensuel (app/parametres/page.tsx).
  const [touche, setTouche] = useState(false);
  useEffect(() => {
    if (touche || !reglages) return;
    setMin(
      reglages.delaiVintedMinMinutes != null
        ? String(reglages.delaiVintedMinMinutes)
        : "",
    );
    setMax(
      reglages.delaiVintedMaxMinutes != null
        ? String(reglages.delaiVintedMaxMinutes)
        : "",
    );
  }, [reglages, touche]);

  // Tant que le premier chargement n'a pas résolu, `min`/`max` valent encore
  // "" par défaut — pas parce que rien n'est réglé côté serveur, mais parce
  // que la réponse n'est pas encore arrivée. Bloquer la saisie jusque-là (champs
  // désactivés plus bas) : sinon, taper puis quitter un champ avant la fin du
  // GET enverrait `null` pour l'autre borne et écraserait une valeur déjà
  // enregistrée (cf. revue). Une fois `pretAModifier` vrai, l'effet ci-dessus a
  // déjà tourné avant que l'utilisateur ait pu interagir (les champs étaient
  // désactivés jusque-là) : `min`/`max` reflètent alors soit le serveur, soit
  // une saisie déjà en cours — jamais un vide accidentel. Une valeur locale
  // vide à ce stade est donc une intention explicite de l'utilisateur
  // (effacer la borne), pas un défaut de synchronisation : on ne doit PAS la
  // remplacer par l'ancienne valeur serveur, sinon « vider le champ » ne
  // s'enregistrerait jamais.
  const pretAModifier = reglages != null;

  // Les deux bornes s'envoient toujours ensemble, même si la route accepte
  // désormais une mise à jour partielle (elle va relire l'autre borne en base
  // pour la comparaison min < max — cf. app/api/user/settings/route.ts). Les
  // envoyer toutes les deux reste plus simple à raisonner ici : la valeur
  // comparée est alors exactement celle affichée à l'écran, jamais une valeur
  // en base que l'utilisateur ne voit pas au moment du blur.
  function enregistrerFourchette() {
    if (!pretAModifier) return;
    enregistrer.mutate(
      {
        delaiVintedMinMinutes: versNombre(min),
        delaiVintedMaxMinutes: versNombre(max),
      },
      {
        onSuccess: () => setTouche(false),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <Module className="p-[24px]">
      <div className="mb-[14px] flex items-center gap-2.5">
        <ShieldAlert
          className="h-[18px] w-[18px] text-[var(--acc)]"
          strokeWidth={2}
        />
        <CardTitle className="">Extension Vinted</CardTitle>
      </div>

      <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--faint)]">
        Délai aléatoire, en minutes, avant que l&apos;extension remplisse
        automatiquement un nouvel onglet Vinted — le garde-fou anti-ban. Tant
        qu&apos;il n&apos;est pas réglé, l&apos;extension ne remplit rien.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className={labelCls} htmlFor="delai-vinted-min">
            Minimum (min)
          </label>
          <input
            id="delai-vinted-min"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={min}
            disabled={!pretAModifier}
            onChange={(e) => {
              setTouche(true);
              setMin(e.target.value);
            }}
            onBlur={enregistrerFourchette}
            placeholder="Ex : 3"
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={labelCls} htmlFor="delai-vinted-max">
            Maximum (min)
          </label>
          <input
            id="delai-vinted-max"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={max}
            disabled={!pretAModifier}
            onChange={(e) => {
              setTouche(true);
              setMax(e.target.value);
            }}
            onBlur={enregistrerFourchette}
            placeholder="Ex : 8"
            className={inputCls}
          />
        </div>
      </div>
    </Module>
  );
}
