// Résultats réels de chaque modèle d'image, tirés des essais d'Aramis : ce que
// montre le sélecteur de modèles à côté du prix (taux de réussite du premier
// coup, coût moyen réel, nombre d'images, dernière utilisation).
//
// PUR et ISOMORPHE : il reçoit les lignes déjà lues, ne touche ni base ni
// réseau. Différence avec `lib/studioStats.ts` (le Bilan) : ici le « premier
// coup » est un essai qui n'est PAS une correction, parce que le numéro d'un
// essai se compte par colonne (coloris × angle × modèle) et n'identifie pas la
// première tentative d'une case.
//
// RÈGLES, reprises du Studio :
//  - seule la DÉCISION d'Aramis (valide | rejete) compte ; l'avis de l'IA
//    (`verifIA`) n'entre dans aucun taux, il n'est même pas en entrée ;
//  - un coût réel absent n'est jamais compté zéro : la moyenne se fait sur les
//    coûts connus, et `coutIncomplet` dit qu'il en manque ;
//  - un taux sans essai décidé est `null`, jamais 0 % ;
//  - les dépôts manuels (modèle « manuel ») n'ont ni prix ni modèle à choisir :
//    ils n'ont pas de ligne ici.

import { MODELE_MANUEL, modeleDe } from "./studioFiche";

/** Sous-ensemble de `StudioEssai` dont les agrégats ont besoin. */
export type EssaiAgregat = {
  modele: string;
  /** "valide" | "rejete" | null. Toute autre valeur est traitée comme « pas décidé ». */
  decision: string | null;
  /** Renseigné = c'est une correction d'un essai raté, pas un premier coup. */
  essaiParentId: string | null;
  /** `usage.cost` d'OpenRouter ; null ou absent = inconnu (jamais zéro). */
  coutReelUsd: number | null;
  createdAt: Date | string;
  /** Durée de l'appel de génération ; null = non mesurée. */
  dureeMs?: number | null;
};

/** Sous-ensemble de `StudioEchec` : une génération qui n'a rendu aucune image. */
export type EchecAgregat = {
  modele: string;
  createdAt: Date | string;
};

export type AgregatModele = {
  modele: string;
  /** Images générées avec ce modèle (corrections comprises, images purgées comprises). Les échecs n'y entrent pas. */
  images: number;
  /** Premiers coups sur lesquels Aramis a décidé (valide ou rejete). */
  premiersCoupsDecides: number;
  /** Parmi eux, ceux qu'il a validés. */
  premiersCoupsValides: number;
  /** valides / décidés, entre 0 et 1 ; null tant qu'aucun premier coup n'est décidé. */
  tauxPremierCoup: number | null;
  /** Moyenne des coûts réels connus, en USD ; null si aucun coût connu. */
  coutMoyenReelUsd: number | null;
  /** Images dont le coût réel est connu (la base de la moyenne). */
  coutsConnus: number;
  /** Au moins une image sans coût réel : la moyenne ne porte que sur les autres. */
  coutIncomplet: boolean;
  /** Moyenne des durées mesurées (ms), arrondie ; null si aucune. */
  dureeMoyenneMs: number | null;
  /** Générations ratées (aucune image) de ce modèle. */
  echecs: number;
  /** Date ISO de la dernière image OU du dernier échec ; null sans aucune trace. */
  derniereUtilisation: string | null;
};

const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const estDecide = (d: string | null) => d === "valide" || d === "rejete";

/** Montants arrondis au millionième de dollar : 0,1 + 0,2 doit donner 0,3. */
const arrondiUsd = (n: number) => Math.round(n * 1e6) / 1e6;

/** Le temps d'une date, ou null si elle est illisible (une date cassée ne doit pas faire planter la route). */
function temps(d: Date | string): number | null {
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(t) ? t : null;
}

const compareTexte = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Un agrégat par modèle ayant au moins une image ou un échec, trié par id (sortie
 * déterministe). Le modèle « manuel » est écarté. Un modèle qui n'a que des
 * échecs a quand même sa ligne : c'est lui qu'on veut voir, pas faire disparaître.
 */
export function agregatsParModele(essais: readonly EssaiAgregat[], echecs: readonly EchecAgregat[] = []): AgregatModele[] {
  const parModele = new Map<string, { essais: EssaiAgregat[]; echecs: EchecAgregat[] }>();
  const groupe = (id: string) => {
    let g = parModele.get(id);
    if (!g) {
      g = { essais: [], echecs: [] };
      parModele.set(id, g);
    }
    return g;
  };
  for (const e of essais) {
    const id = modeleDe(e.modele);
    if (id !== MODELE_MANUEL) groupe(id).essais.push(e);
  }
  for (const x of echecs) {
    const id = modeleDe(x.modele);
    if (id !== MODELE_MANUEL) groupe(id).echecs.push(x);
  }

  return [...parModele.keys()].sort(compareTexte).map((id) => {
    const { essais: es, echecs: xs } = parModele.get(id) as { essais: EssaiAgregat[]; echecs: EchecAgregat[] };

    const premiersCoups = es.filter((e) => !e.essaiParentId && estDecide(e.decision));
    const valides = premiersCoups.filter((e) => e.decision === "valide").length;

    const couts = es.map((e) => e.coutReelUsd).filter(estNombre);
    const durees = es.map((e) => e.dureeMs).filter((d): d is number => estNombre(d) && d >= 0);

    const dates = [...es.map((e) => temps(e.createdAt)), ...xs.map((x) => temps(x.createdAt))].filter((t): t is number => t !== null);

    return {
      modele: id,
      images: es.length,
      premiersCoupsDecides: premiersCoups.length,
      premiersCoupsValides: valides,
      tauxPremierCoup: premiersCoups.length > 0 ? valides / premiersCoups.length : null,
      coutMoyenReelUsd: couts.length > 0 ? arrondiUsd(couts.reduce((a, b) => a + b, 0) / couts.length) : null,
      coutsConnus: couts.length,
      coutIncomplet: couts.length < es.length,
      dureeMoyenneMs: durees.length > 0 ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) : null,
      echecs: xs.length,
      derniereUtilisation: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null,
    };
  });
}
