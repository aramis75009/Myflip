/**
 * Rapport des captures : une ligne JSON par capture de route ou d'état dans
 * e2e/rapports/<serie>/captures.jsonl (vidé au début de chaque lancement).
 * Les erreurs de console y sont recopiées SANS faire échouer le test : elles
 * décrivent l'état « avant » de l'application, pas un défaut de la suite.
 */
import path from "node:path";

import { test } from "@playwright/test";

import { DOSSIERS, JOURNAUX, RACINE } from "./environnement";
import { ajouterLigne } from "./journaux";
import type { EntreeConsole } from "./test";

export type LigneCapture = {
  type: "route" | "etat";
  id: string;
  chemin: string;
  compte: string;
  /** Statut HTTP du document (routes seulement). */
  statut?: number;
  /** Capture prise mais hors du périmètre de la règle visée (Studio à 390 px). */
  informatif?: string;
  /** Réponses simulées par le test (page.route), pour lire la capture. */
  simulations?: string[];
  /** Constats sur l'application « avant » (ex. toast perdu au chargement direct). */
  constats?: string[];
  fichiers: string[];
  console: EntreeConsole[];
};

export function consignerCapture(ligne: LigneCapture): void {
  const info = test.info();
  ajouterLigne(JOURNAUX.captures, {
    projet: info.project.name,
    ...ligne,
    fichiers: ligne.fichiers.map((f) => path.relative(RACINE, f)),
    // Un même message répété (refetch, StrictMode) n'apporte rien de plus.
    console: dedoublonner(ligne.console),
  });
}

function dedoublonner(entrees: EntreeConsole[]): (EntreeConsole & { fois: number })[] {
  const vus = new Map<string, EntreeConsole & { fois: number }>();
  for (const e of entrees) {
    const cle = `${e.type}|${e.texte}`;
    const deja = vus.get(cle);
    if (deja) deja.fois += 1;
    else vus.set(cle, { ...e, texte: e.texte.slice(0, 500), fois: 1 });
  }
  return [...vus.values()];
}

/** Dossier des rapports de la série (pour les fichiers JSON écrits une fois). */
export const DOSSIER_RAPPORTS = DOSSIERS.rapports;
