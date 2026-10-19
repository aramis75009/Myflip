// Studio IA : règles des écrans, sans base ni réseau. Ce que les routes et les
// pages font des lignes Prisma se décide ici, là où un test peut le voir.

// Isomorphe : importé par les écrans. Ne JAMAIS importer `./studioVerif` ici
// (valeurs) : il tire `lib/settings`, donc Prisma, dans le bundle navigateur.

import { ROLES_REFERENCE, type RoleReference } from "./studioAngles";
import type { DetailStatus } from "./studioVerif";

const DETAIL_STATUSES: readonly DetailStatus[] = ["fidele", "derive", "absent"];

export const ORIGINES = ["mise_en_vente", "studio"] as const;
export type Origine = (typeof ORIGINES)[number];

export const DECISIONS = ["valide", "rejete"] as const;
export type Decision = (typeof DECISIONS)[number];

/** Nombre de références proposées au téléchargement pour un angle. */
export const MAX_REFERENCES_PAR_ANGLE = 4;

export const estRole = (v: unknown): v is RoleReference =>
  typeof v === "string" && (ROLES_REFERENCE as readonly string[]).includes(v);

export const estOrigine = (v: unknown): v is Origine =>
  typeof v === "string" && (ORIGINES as readonly string[]).includes(v);

export const estDecision = (v: unknown): v is Decision =>
  typeof v === "string" && (DECISIONS as readonly string[]).includes(v);

/**
 * Rôle suggéré par l'ordre de chargement (spec §3) : 1re photo = face, 2e =
 * dos, 3e = côté, 4e = détail, 5e = ouvert, toutes les suivantes = détail.
 * Corrigeable ensuite sur la fiche coloris.
 */
export function roleSuggere(position: number): RoleReference {
  if (!Number.isInteger(position) || position < 0) return "detail";
  return ROLES_REFERENCE[position] ?? "detail";
}

export type RefLite = { id: string; role: string; createdAt: Date | string };

/**
 * Les vraies photos à joindre pour un angle : celles du rôle demandé ; à
 * défaut celles de face ; à défaut toutes. Les plus anciennes d'abord (la
 * première photo d'une série est la mieux cadrée, d'habitude), plafonné.
 */
export function referencesPourAngle<R extends RefLite>(refs: readonly R[], role: string): R[] {
  const parDate = [...refs].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const duRole = parDate.filter((r) => r.role === role);
  const face = parDate.filter((r) => r.role === "face");
  const choix = duRole.length > 0 ? duRole : face.length > 0 ? face : parDate;
  return choix.slice(0, MAX_REFERENCES_PAR_ANGLE);
}

/** Modèle d'un essai déposé à la main (valeur par défaut de `StudioEssai.modele`). */
export const MODELE_MANUEL = "manuel";

/** Modèle d'un essai : absent (ou vide) = dépôt manuel. */
export function modeleDe(modele: string | null | undefined): string {
  return typeof modele === "string" && modele !== "" ? modele : MODELE_MANUEL;
}

/**
 * Numéro du prochain essai pour un triplet coloris × angle × modèle : seuls les
 * essais de ce modèle comptent (la contrainte unique porte sur le modèle). Un
 * essai sans `modele` est un dépôt manuel.
 */
export function numeroSuivant(
  essais: readonly { numero: number; modele?: string }[],
  modele: string = MODELE_MANUEL,
): number {
  const cible = modeleDe(modele);
  return essais.reduce((m, e) => (modeleDe(e.modele) === cible ? Math.max(m, e.numero) : m), 0) + 1;
}

/** Lecture défensive de `verifIA` (colonne Json, forme non garantie). */
function detailsVerif(verifIA: unknown): { detail: string; statut: string }[] {
  if (typeof verifIA !== "object" || verifIA === null) return [];
  const d = (verifIA as { details?: unknown }).details;
  if (!Array.isArray(d)) return [];
  return d.filter(
    (x): x is { detail: string; statut: string } =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as { detail?: unknown }).detail === "string" &&
      DETAIL_STATUSES.includes((x as { statut?: unknown }).statut as DetailStatus),
  );
}

/** Détails marqués « derive » par le contrôle : la matière du prompt de correction. */
export function detailsDerivants(verifIA: unknown): string[] {
  return detailsVerif(verifIA)
    .filter((x) => x.statut === "derive")
    .map((x) => x.detail);
}

/** Score global d'un contrôle, ou null s'il n'y en a pas (ou s'il est illisible). */
export function scoreVerif(verifIA: unknown): number | null {
  if (typeof verifIA !== "object" || verifIA === null) return null;
  const s = (verifIA as { scoreGlobal?: unknown }).scoreGlobal;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

export type EssaiLite = { angleId: string; decision: string | null; verifIA?: unknown };

export type Avancement = {
  references: number;
  /** Angles qui ont au moins un essai. */
  anglesTestes: number;
  /** Angles qui ont au moins un essai validé. */
  anglesValides: number;
  /** Moyenne des scores IA disponibles, arrondie, ou null. */
  scoreMoyen: number | null;
};

/** Badges d'avancement d'un coloris, sur la grille /studio. */
export function avancement(references: number, essais: readonly EssaiLite[]): Avancement {
  const testes = new Set(essais.map((e) => e.angleId));
  const valides = new Set(essais.filter((e) => e.decision === "valide").map((e) => e.angleId));
  const scores = essais.map((e) => scoreVerif(e.verifIA)).filter((s): s is number => s !== null);
  return {
    references,
    anglesTestes: testes.size,
    anglesValides: valides.size,
    scoreMoyen: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
  };
}

/**
 * Photos non rattachées qu'on peut rattacher maintenant : celles dont le SKU
 * est connu du catalogue SacBase. Les autres restent en attente, sans erreur.
 */
export function planRattachement(
  orphelines: readonly { id: string; sku: string | null }[],
  index: ReadonlyMap<string, string>,
): { id: string; cle: string }[] {
  const plan: { id: string; cle: string }[] = [];
  for (const o of orphelines) {
    const cle = o.sku ? index.get(o.sku) : undefined;
    if (cle) plan.push({ id: o.id, cle });
  }
  return plan;
}

/** Filtre « doublons chez moi » de la grille (spec §4 : chezMoi ≥ 2). */
export const estDoublon = (chezMoi: number) => chezMoi >= 2;
