// Tableau de bord du Studio IA (spec §3 étape 8 et §11). Module pur : il reçoit
// les essais en argument, ne lit ni base ni réseau.
//
// RÈGLE CENTRALE (spec §6) : le verdict IA est une aide, la décision d'Aramis
// est ce qui alimente les statistiques. Donc :
//   - taux de réussite et nombre moyen d'essais : calculés sur `decision`,
//     jamais sur `verifIA` ;
//   - `verifIA` ne sert qu'au top des détails qui dérivent, parce que c'est la
//     seule source qui nomme les détails (et au score moyen par modèle, qui est
//     une indication de lecture, jamais un taux).
//
// COÛTS (génération par API) : un coût inconnu (null, absent, non fini) n'est
// jamais compté comme zéro. Les moyennes se font sur les coûts connus, et
// `coutIncomplet` dit quand un modèle API en a laissé échapper.

import { MODELE_MANUEL, modeleDe, scoreVerif } from "./studioFiche";

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
  /** Modèle OpenRouter, ou "manuel" pour un dépôt à la main. Absent = "manuel". */
  modele?: string;
  /** Coût réel facturé, en USD. null ou absent = inconnu (jamais compté comme 0). */
  coutReelUsd?: number | null;
};

/** Sous-ensemble de la table `StudioEchec` : une génération qui n'a rendu aucun essai. */
export type EchecStat = {
  modele: string;
  /** Code de l'erreur (`"securite"`, `"no_image"`…). */
  code: string;
  /** Coût réel éventuellement facturé malgré l'échec, null si inconnu. */
  coutReelUsd: number | null;
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

export type ModelStat = GroupStat & {
  /** Essais rangés sous ce modèle, décidés ou non. Les échecs n'y entrent pas. */
  essais: number;
  /** Essais validés, tous numéros confondus (≠ `firstTry.validated`, limité au n° 1). */
  validated: number;
  /** Essais dont le coût réel est connu. */
  coutConnus: number;
  /** Somme des coûts connus des essais (0 si aucun). Les coûts des échecs n'y entrent pas : voir `Depense`. */
  coutTotalUsd: number;
  /** Moyenne des coûts connus, ou null si aucun (jamais 0 par défaut). */
  coutMoyenUsd: number | null;
  /** `coutTotalUsd / validated`, ou null sans essai validé ou sans coût connu. */
  coutParValideeUsd: number | null;
  /** Au moins un essai API de ce modèle sans coût connu : les coûts sont alors un minimum. */
  coutIncomplet: boolean;
  /** Moyenne des scores IA lisibles, arrondie à l'entier comme `avancement`, ou null. */
  scoreMoyen: number | null;
  /** Générations ratées de ce modèle. */
  echecs: number;
  /** Parmi elles, les refus de sécurité (code `"securite"`). */
  blocagesSecurite: number;
};

/** Argent dépensé en génération : coûts connus des essais ET des échecs. */
export type Depense = {
  totalUsd: number;
  /** Essais API dont le coût est inconnu : le total est alors un minimum. */
  essaisSansCout: number;
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
  /** Un par modèle (dépôts manuels compris, sous "manuel"), trié par id. */
  byModel: ModelStat[];
  depense: Depense;
  /** 3 détails au plus, du plus fréquent au moins fréquent. */
  topDriftingDetails: DriftingDetail[];
};

export const TOP_DRIFTING_COUNT = 3;

const CODE_SECURITE = "securite";

const isDecided = (e: StudioEssaiStat) => e.decision === "valide" || e.decision === "rejete";

const coutConnu = (c: number | null | undefined): c is number => typeof c === "number" && Number.isFinite(c);

/** Essai d'un modèle API (pas un dépôt manuel) dont on ne connaît pas le coût. */
const coutManquant = (e: StudioEssaiStat) => modeleDe(e.modele) !== MODELE_MANUEL && !coutConnu(e.coutReelUsd);

const somme = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

// Les montants sont arrondis au millionième de dollar : 0,1 + 0,2 doit donner 0,3.
const arrondiUsd = (n: number) => Math.round(n * 1e6) / 1e6;

function summarize(essais: StudioEssaiStat[]): Omit<GroupStat, "id"> {
  const decided = essais.filter(isDecided);

  const firstTries = decided.filter((e) => e.numero === 1);
  const validated = firstTries.filter((e) => e.decision === "valide").length;

  const triesByPair = new Map<string, number>();
  for (const e of decided) {
    // Le modèle fait partie de la paire : deux modèles lancés ensemble sur le
    // même coloris × angle sont deux séries d'essais, pas une série de deux.
    const key = JSON.stringify([e.colorisId, e.angleId, modeleDe(e.modele)]);
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

function bucket<T>(items: readonly T[], idOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = idOf(item);
    const list = groups.get(id);
    if (list) list.push(item);
    else groups.set(id, [item]);
  }
  return groups;
}

function groupBy(essais: StudioEssaiStat[], idOf: (e: StudioEssaiStat) => string): GroupStat[] {
  const groups = bucket(essais, idOf);
  // Ordre par id : sortie déterministe, quel que soit l'ordre d'arrivée des lignes.
  return [...groups.keys()]
    .sort(compareStrings)
    .map((id) => ({ id, ...summarize(groups.get(id) ?? []) }));
}

function summarizeModel(id: string, essais: StudioEssaiStat[], echecs: EchecStat[]): ModelStat {
  const couts = essais.map((e) => e.coutReelUsd).filter(coutConnu);
  const total = somme(couts);
  const validated = essais.filter((e) => e.decision === "valide").length;
  const scores = essais.map((e) => scoreVerif(e.verifIA)).filter((s): s is number => s !== null);

  return {
    id,
    ...summarize(essais),
    essais: essais.length,
    validated,
    coutConnus: couts.length,
    coutTotalUsd: arrondiUsd(total),
    coutMoyenUsd: couts.length > 0 ? arrondiUsd(total / couts.length) : null,
    // Sans coût connu, « 0 $ par image validée » serait un prix inventé.
    coutParValideeUsd: validated > 0 && couts.length > 0 ? arrondiUsd(total / validated) : null,
    coutIncomplet: essais.some(coutManquant),
    scoreMoyen: scores.length > 0 ? Math.round(somme(scores) / scores.length) : null,
    echecs: echecs.length,
    blocagesSecurite: echecs.filter((x) => x.code === CODE_SECURITE).length,
  };
}

// Un modèle qui n'a que des échecs a quand même sa ligne : c'est lui qu'on
// veut voir bloqué, pas faire disparaître du tableau.
function byModel(essais: StudioEssaiStat[], echecs: EchecStat[]): ModelStat[] {
  const essaisParModele = bucket(essais, (e) => modeleDe(e.modele));
  const echecsParModele = bucket(echecs, (x) => modeleDe(x.modele));
  const ids = new Set([...essaisParModele.keys(), ...echecsParModele.keys()]);
  return [...ids]
    .sort(compareStrings)
    .map((id) => summarizeModel(id, essaisParModele.get(id) ?? [], echecsParModele.get(id) ?? []));
}

function depenseTotale(essais: StudioEssaiStat[], echecs: EchecStat[]): Depense {
  const couts = [...essais.map((e) => e.coutReelUsd), ...echecs.map((x) => x.coutReelUsd)].filter(coutConnu);
  return {
    totalUsd: arrondiUsd(somme(couts)),
    essaisSansCout: essais.filter(coutManquant).length,
  };
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

export function computeStudioStats(essais: StudioEssaiStat[], echecs: EchecStat[] = []): StudioStats {
  return {
    global: summarize(essais),
    byAngle: groupBy(essais, (e) => e.angleId),
    byColoris: groupBy(essais, (e) => e.colorisId),
    byModel: byModel(essais, echecs),
    depense: depenseTotale(essais, echecs),
    topDriftingDetails: topDriftingDetails(essais),
  };
}
