// Tableau de bord du Studio IA (spec §3 étape 8 et §11). Module pur : il reçoit
// les essais en argument, ne lit ni base ni réseau.
//
// RÈGLE CENTRALE (spec §6) : le verdict IA est une aide, la décision d'Aramis
// est ce qui alimente les statistiques. Donc :
//   - taux de réussite et nombre moyen d'essais : calculés sur `decision`,
//     jamais sur `verifIA` ;
//   - `verifIA` ne sert qu'au top des détails qui dérivent, parce que c'est la
//     seule source qui nomme les détails.

/** Sous-ensemble de la table `StudioEssai` dont le tableau de bord a besoin. */
export type StudioEssaiStat = {
  colorisId: string;
  angleId: string;
  /** 1er, 2e essai… pour le couple coloris × angle. */
  numero: number;
  /** "valide" | "rejete" | null. Toute autre valeur est traitée comme « pas décidé ». */
  decision: string | null;
  /** Sortie du contrôle automatique (§6), forme non garantie : lue défensivement. */
  verifIA?: unknown;
};

export type FirstTryStat = {
  validated: number;
  /** Essais n° 1 qui ont reçu une décision. Les essais sans décision sont exclus. */
  decided: number;
  /** validated / decided, ou null si aucun 1er essai n'est décidé (pas de 0 % inventé). */
  rate: number | null;
};

export type GroupStat = {
  id: string;
  firstTry: FirstTryStat;
  /** Moyenne, sur les couples coloris × angle décidés, du nombre d'essais décidés. null si aucun. */
  averageTries: number | null;
  /** Couples coloris × angle comptés dans la moyenne. */
  pairs: number;
};

export type DriftingDetail = {
  detail: string;
  /** Nombre d'essais dont le contrôle automatique marque ce détail « derive ». */
  count: number;
};

export type StudioStats = {
  global: Omit<GroupStat, "id">;
  byAngle: GroupStat[];
  byColoris: GroupStat[];
  /** 3 détails au plus, du plus fréquent au moins fréquent. */
  topDriftingDetails: DriftingDetail[];
};

export const TOP_DRIFTING_COUNT = 3;

const isDecided = (e: StudioEssaiStat) => e.decision === "valide" || e.decision === "rejete";

function summarize(essais: StudioEssaiStat[]): Omit<GroupStat, "id"> {
  const decided = essais.filter(isDecided);

  const firstTries = decided.filter((e) => e.numero === 1);
  const validated = firstTries.filter((e) => e.decision === "valide").length;

  const triesByPair = new Map<string, number>();
  for (const e of decided) {
    const key = JSON.stringify([e.colorisId, e.angleId]);
    triesByPair.set(key, (triesByPair.get(key) ?? 0) + 1);
  }
  const pairs = triesByPair.size;
  const totalTries = [...triesByPair.values()].reduce((a, b) => a + b, 0);

  return {
    firstTry: {
      validated,
      decided: firstTries.length,
      rate: firstTries.length > 0 ? validated / firstTries.length : null,
    },
    averageTries: pairs > 0 ? totalTries / pairs : null,
    pairs,
  };
}

function groupBy(essais: StudioEssaiStat[], idOf: (e: StudioEssaiStat) => string): GroupStat[] {
  const groups = new Map<string, StudioEssaiStat[]>();
  for (const e of essais) {
    const id = idOf(e);
    const list = groups.get(id);
    if (list) list.push(e);
    else groups.set(id, [e]);
  }
  // Ordre par id : sortie déterministe, quel que soit l'ordre d'arrivée des lignes.
  return [...groups.keys()]
    .sort(compareStrings)
    .map((id) => ({ id, ...summarize(groups.get(id) ?? []) }));
}

// Comparaison par code unitaire, pas localeCompare : le résultat ne doit pas
// dépendre de l'ICU de la machine.
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Lit les détails « derive » d'un `verifIA`. Forme attendue (§6) :
 * `{ details: [{ detail, statut: "derive", note }], … }`. Le nom du tableau
 * n'est pas figé par la spec : on accepte `details`, ou le tableau nu.
 * Toute autre forme donne une liste vide, jamais une exception.
 */
function driftingDetailsOf(verifIA: unknown): string[] {
  let list: unknown = verifIA;
  if (list !== null && typeof list === "object" && !Array.isArray(list)) {
    list = (list as Record<string, unknown>).details;
  }
  if (!Array.isArray(list)) return [];

  const names: string[] = [];
  for (const item of list) {
    if (item === null || typeof item !== "object") continue;
    const { detail, statut } = item as Record<string, unknown>;
    if (statut !== "derive" || typeof detail !== "string") continue;
    const name = detail.trim().replace(/\s+/g, " ");
    if (name !== "") names.push(name);
  }
  return names;
}

// « Zip doré » et « zip dore » sont le même détail pour le classement.
const detailKey = (name: string) =>
  name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Top des détails qui dérivent. Départage des ex æquo : nombre décroissant,
 * puis clé normalisée (sans accents ni casse) par ordre alphabétique croissant.
 * Le libellé affiché est la première graphie rencontrée.
 */
function topDriftingDetails(essais: StudioEssaiStat[]): DriftingDetail[] {
  const tally = new Map<string, DriftingDetail>();
  for (const e of essais) {
    // Un détail cité deux fois dans le même contrôle ne compte qu'une fois.
    const seen = new Set<string>();
    for (const name of driftingDetailsOf(e.verifIA)) {
      const key = detailKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = tally.get(key);
      if (entry) entry.count += 1;
      else tally.set(key, { detail: name, count: 1 });
    }
  }
  return [...tally.entries()]
    .sort(([ka, a], [kb, b]) => b.count - a.count || compareStrings(ka, kb))
    .slice(0, TOP_DRIFTING_COUNT)
    .map(([, entry]) => entry);
}

export function computeStudioStats(essais: StudioEssaiStat[]): StudioStats {
  return {
    global: summarize(essais),
    byAngle: groupBy(essais, (e) => e.angleId),
    byColoris: groupBy(essais, (e) => e.colorisId),
    topDriftingDetails: topDriftingDetails(essais),
  };
}
