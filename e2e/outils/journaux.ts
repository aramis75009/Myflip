/** Lecture et écriture des journaux JSONL de la suite (e2e/rapports/<serie>/). */
import fs from "node:fs";
import path from "node:path";

import { JOURNAUX, idLancement } from "./environnement";

export function ajouterLigne(fichier: string, entree: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.appendFileSync(fichier, JSON.stringify({ run: idLancement(), quand: new Date().toISOString(), ...entree }) + "\n");
}

export function lireLignes(fichier: string): Record<string, unknown>[] {
  if (!fs.existsSync(fichier)) return [];
  return fs
    .readFileSync(fichier, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Record<string, unknown>];
      } catch {
        return [];
      }
    });
}

/** Lignes du journal de la garde réseau du serveur pour CE lancement. */
export function lignesReseauServeur(): Record<string, unknown>[] {
  return lireLignes(JOURNAUX.reseauServeur).filter((l) => l.run === idLancement());
}
