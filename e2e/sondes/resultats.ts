/**
 * Écriture des rapports des sondes : e2e/rapports/<serie>/sondes.json et a11y.json.
 *
 * Plusieurs workers écrivent en même temps (2 workers, 4 projets) : chaque
 * résultat est FUSIONNÉ dans le fichier sous un verrou (dossier créé de façon
 * atomique), puis le fichier est remplacé par renommage. Clé de fusion :
 * (id, projet, route). Un lancement partiel remplace donc seulement les
 * entrées qu'il a mesurées, comme les captures. Pour repartir de zéro, effacer
 * le fichier avant de lancer.
 */
import fs from "node:fs";
import path from "node:path";

import { DOSSIERS, RACINE, idLancement } from "../outils/environnement";

export type EtatSonde = "bug présent" | "corrigé" | "non mesurable";

export type ResultatSonde = {
  id: string;
  titre: string;
  projet: string;
  route: string;
  /** Entrée du catalogue de routes (`route.<id>`, `route.neuf.<id>`), quand la route en vient ; null sinon. */
  variante: string | null;
  /** Valeurs brutes relevées dans la page. */
  mesure: Record<string, unknown>;
  /** Ce qui doit être vrai une fois le bug corrigé. */
  critere: string;
  etat: EtatSonde;
  /** Chemin (relatif à la racine du dépôt) d'une capture ciblée de la zone, ou null. */
  capture: string | null;
  lancement: string;
  mesureLe: string;
};

export type ViolationA11y = {
  regle: string;
  impact: string | null;
  aide: string;
  /** Nombre d'éléments en infraction. */
  noeuds: number;
  /** Sélecteurs CSS des premiers éléments (20 au plus). */
  cibles: string[];
};

export type ResultatA11y = {
  route: string;
  /** Entrée du catalogue de routes : `route.<id>` ou `route.neuf.<id>` (comme les captures). */
  variante: string;
  projet: string;
  /** Violations par règle. */
  violations: ViolationA11y[];
  /** Nombre de règles en infraction, par impact (minor, moderate, serious, critical). */
  parImpact: Record<string, number>;
  /** Nombre d'éléments en infraction, par impact. */
  noeudsParImpact: Record<string, number>;
  totalRegles: number;
  totalNoeuds: number;
  /** Règles en infraction serious ou critical : ce que A11Y_STRICT=1 fait échouer. */
  graves: number;
  regleReussies: number;
  incompletes: number;
  lancement: string;
  mesureLe: string;
};

const ATTENTE_VERROU_MS = 300_000;
const VERROU_PERIME_MS = 30_000;

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function avecVerrou<T>(fichier: string, fn: () => T | Promise<T>, perimeMs = VERROU_PERIME_MS): Promise<T> {
  const verrou = `${fichier}.verrou`;
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  const debut = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(verrou);
      break;
    } catch {
      // Un verrou oublié par un processus tué ne doit pas bloquer la suite.
      try {
        if (Date.now() - fs.statSync(verrou).mtimeMs > perimeMs) fs.rmSync(verrou, { recursive: true, force: true });
      } catch {
        /* disparu entre-temps */
      }
      if (Date.now() - debut > ATTENTE_VERROU_MS) throw new Error(`Verrou ${path.basename(verrou)} impossible à prendre en ${ATTENTE_VERROU_MS} ms.`);
      await pause(40 + Math.floor(Math.random() * 60));
    }
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(verrou, { recursive: true, force: true });
  }
}

function lireTableau<T>(fichier: string): T[] {
  if (!fs.existsSync(fichier)) return [];
  try {
    const brut = JSON.parse(fs.readFileSync(fichier, "utf8")) as unknown;
    return Array.isArray(brut) ? (brut as T[]) : [];
  } catch {
    return [];
  }
}

function ecrireAtomique(fichier: string, contenu: unknown): void {
  const tmp = `${fichier}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(contenu, null, 2) + "\n");
  fs.renameSync(tmp, fichier);
}

export const FICHIER_SONDES = path.join(DOSSIERS.rapports, "sondes.json");
export const FICHIER_A11Y = path.join(DOSSIERS.rapports, "a11y.json");

/** Ordre naturel des identifiants de sonde : F1, F2, …, O1, …, S8, X0, X1…X14, G1…G6. */
function cleOrdre(id: string): [string, number] {
  const m = /^([A-Z]+)(\d+)$/.exec(id);
  return m ? [m[1], Number(m[2])] : [id, 0];
}
const ORDRE_FAMILLES = ["F", "O", "M", "MO", "S", "X", "G"];

export function comparerSondes(a: ResultatSonde, b: ResultatSonde): number {
  const [fa, na] = cleOrdre(a.id);
  const [fb, nb] = cleOrdre(b.id);
  const ia = ORDRE_FAMILLES.indexOf(fa);
  const ib = ORDRE_FAMILLES.indexOf(fb);
  if (ia !== ib) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  if (na !== nb) return na - nb;
  return a.projet.localeCompare(b.projet) || a.route.localeCompare(b.route) || (a.variante ?? "").localeCompare(b.variante ?? "");
}

export const cheminRelatif = (absolu: string): string => path.relative(RACINE, absolu);

export async function enregistrerSonde(r: Omit<ResultatSonde, "lancement" | "mesureLe">): Promise<void> {
  const entree: ResultatSonde = { ...r, lancement: idLancement(), mesureLe: new Date().toISOString() };
  await avecVerrou(FICHIER_SONDES, () => {
    const tous = lireTableau<ResultatSonde>(FICHIER_SONDES).filter(
      (x) => !(x.id === entree.id && x.projet === entree.projet && x.route === entree.route && (x.variante ?? null) === entree.variante),
    );
    tous.push(entree);
    tous.sort(comparerSondes);
    ecrireAtomique(FICHIER_SONDES, tous);
  });
}

export async function enregistrerA11y(r: Omit<ResultatA11y, "lancement" | "mesureLe">): Promise<void> {
  const entree: ResultatA11y = { ...r, lancement: idLancement(), mesureLe: new Date().toISOString() };
  await avecVerrou(FICHIER_A11Y, () => {
    const tous = lireTableau<ResultatA11y>(FICHIER_A11Y).filter((x) => !(x.variante === entree.variante && x.projet === entree.projet));
    tous.push(entree);
    tous.sort((a, b) => a.variante.localeCompare(b.variante) || a.projet.localeCompare(b.projet));
    ecrireAtomique(FICHIER_A11Y, tous);
  });
}

/** Lecture seule, pour les tests de la suite elle-même et le résumé de fin de lancement. */
export const lireSondes = (): ResultatSonde[] => lireTableau<ResultatSonde>(FICHIER_SONDES);
export const lireA11y = (): ResultatA11y[] => lireTableau<ResultatA11y>(FICHIER_A11Y);

export { avecVerrou };
