// L'historique des tentatives d'une prise : tous les essais ET tous les échecs
// d'une case (vraie photo × prompt d'angle), rejetés compris, dans l'ordre où ils
// ont eu lieu. PUR et ISOMORPHE : la route lit les lignes, ce module les met en
// forme (coût réel ou estimé, verdict IA, ce qu'on peut encore faire d'un essai).
//
// Règles du Studio, reprises :
//  - le coût réel prime sur l'estimation ; sans l'un ni l'autre le coût est
//    INCONNU (`null`), jamais zéro ;
//  - le verdict de l'IA est une AIDE (`verifIA`), à côté de la décision d'Aramis
//    (`decision`), jamais confondu avec elle ;
//  - l'URL privée du Blob ne sort jamais : l'image se lit par `/api/studio/image`.

import { peutAnnulerDecision, peutValiderEssai, type Autorisation } from "./studioDecision";

/** Les valeurs de `Verdict` de lib/studioVerif.ts, recopiées : ce module reste sans import de valeur serveur. */
const VERDICTS = ["ok", "a_corriger", "rejet"] as const;
export type VerdictIA = (typeof VERDICTS)[number];

/** Un `StudioEssai` d'une case, tel que la route le lit. */
export type EssaiHistorique = {
  id: string;
  modele: string;
  numero: number;
  source: string;
  decision: string | null;
  coutEstimeUsd: number | null;
  coutReelUsd: number | null;
  dureeMs: number | null;
  /** Colonne Json, forme non garantie : lue défensivement. */
  verifIA: unknown;
  /** « » = image purgée. L'URL n'est jamais renvoyée. */
  urlImage: string;
  lancementId: string | null;
  essaiParentId: string | null;
  skuCible: string | null;
  createdAt: Date | string;
};

/** Un `StudioEchec` de la même case. */
export type EchecHistorique = {
  id: string;
  modele: string;
  code: string;
  message: string;
  coutReelUsd: number | null;
  dureeMs: number | null;
  lancementId: string | null;
  createdAt: Date | string;
};

/** Un coût : réel (facturé), estimé (au lancement), ou inconnu. `usd` n'est null que s'il est inconnu. */
export type CoutTentative = { usd: number | null; nature: "reel" | "estime" | "inconnu" };

export type TentativeEssai = {
  kind: "essai";
  id: string;
  creeLe: string;
  modele: string;
  /** Numéro de l'essai dans sa colonne (coloris × angle × modèle). */
  numero: number;
  source: "manuel" | "api";
  lancementId: string | null;
  /** Renseigné = c'est une correction de cet essai raté. */
  essaiParentId: string | null;
  skuCible: string | null;
  /** `/api/studio/image?essai=<id>`, ou null si l'image a été purgée. */
  image: string | null;
  purgee: boolean;
  cout: CoutTentative;
  coutReelUsd: number | null;
  coutEstimeUsd: number | null;
  dureeMs: number | null;
  /** Verdict de l'IA : une aide. null = pas d'avis, ou avis illisible. */
  verdictIA: { verdict: VerdictIA; scoreGlobal: number } | null;
  /** Décision d'Aramis : "valide" | "rejete" ; null = à juger. */
  decision: "valide" | "rejete" | null;
  /** Peut-on repasser cet essai à « à juger » ? Sinon, pourquoi. */
  peutAnnuler: Autorisation;
  /** Peut-on le valider maintenant (« retenir cette version ») ? Sinon, pourquoi. */
  peutValider: Autorisation;
};

export type TentativeEchec = {
  kind: "echec";
  id: string;
  creeLe: string;
  modele: string;
  lancementId: string | null;
  /** Code de l'erreur (`securite`, `no_image`, `no_credits`, `stockage`, `incertain`…). */
  code: string;
  message: string;
  cout: CoutTentative;
  coutReelUsd: number | null;
  dureeMs: number | null;
};

export type Tentative = TentativeEssai | TentativeEchec;

const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function temps(d: Date | string): number | null {
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  return Number.isFinite(t) ? t : null;
}

const iso = (d: Date | string): string => {
  const t = temps(d);
  return t === null ? String(d) : new Date(t).toISOString();
};

/** Le coût réel s'il est connu, sinon l'estimation, sinon « inconnu » : jamais un zéro inventé. */
export function coutDeTentative(reel: number | null | undefined, estime: number | null | undefined): CoutTentative {
  if (estNombre(reel) && reel >= 0) return { usd: reel, nature: "reel" };
  if (estNombre(estime) && estime >= 0) return { usd: estime, nature: "estime" };
  return { usd: null, nature: "inconnu" };
}

/** Verdict et score d'un `verifIA`, ou null si la forme n'est pas celle d'un avis lisible. */
export function resumerAvisIA(verifIA: unknown): { verdict: VerdictIA; scoreGlobal: number } | null {
  if (typeof verifIA !== "object" || verifIA === null) return null;
  const { verdict, scoreGlobal } = verifIA as { verdict?: unknown; scoreGlobal?: unknown };
  if (!(VERDICTS as readonly unknown[]).includes(verdict) || !estNombre(scoreGlobal)) return null;
  return { verdict: verdict as VerdictIA, scoreGlobal };
}

const decisionLue = (d: string | null): "valide" | "rejete" | null => (d === "valide" || d === "rejete" ? d : null);

/**
 * Les tentatives d'une case, de la plus ancienne à la plus récente (à date
 * égale : essais avant échecs, puis par id), `essais` et `echecs` étant TOUS ceux
 * de la case. L'écran inverse la liste s'il veut le plus récent en tête.
 */
export function construireHistorique(essais: readonly EssaiHistorique[], echecs: readonly EchecHistorique[] = []): Tentative[] {
  const tentatives: Tentative[] = [];

  for (const e of essais) {
    const autres = essais.filter((x) => x.id !== e.id).map((x) => ({ id: x.id, decision: decisionLue(x.decision) }));
    const purgee = e.urlImage === "";
    const decision = decisionLue(e.decision);
    const aDecider = { id: e.id, decision, purge: purgee };
    tentatives.push({
      kind: "essai",
      id: e.id,
      creeLe: iso(e.createdAt),
      modele: e.modele,
      numero: e.numero,
      source: e.source === "api" ? "api" : "manuel",
      lancementId: e.lancementId,
      essaiParentId: e.essaiParentId,
      skuCible: e.skuCible,
      image: purgee ? null : `/api/studio/image?essai=${encodeURIComponent(e.id)}`,
      purgee,
      cout: coutDeTentative(e.coutReelUsd, e.coutEstimeUsd),
      coutReelUsd: estNombre(e.coutReelUsd) ? e.coutReelUsd : null,
      coutEstimeUsd: estNombre(e.coutEstimeUsd) ? e.coutEstimeUsd : null,
      dureeMs: estNombre(e.dureeMs) && e.dureeMs >= 0 ? e.dureeMs : null,
      verdictIA: resumerAvisIA(e.verifIA),
      decision,
      peutAnnuler: peutAnnulerDecision(aDecider, autres),
      peutValider: peutValiderEssai(aDecider, autres),
    });
  }

  for (const x of echecs) {
    tentatives.push({
      kind: "echec",
      id: x.id,
      creeLe: iso(x.createdAt),
      modele: x.modele,
      lancementId: x.lancementId,
      code: x.code,
      message: x.message,
      cout: coutDeTentative(x.coutReelUsd, null),
      coutReelUsd: estNombre(x.coutReelUsd) ? x.coutReelUsd : null,
      dureeMs: estNombre(x.dureeMs) && x.dureeMs >= 0 ? x.dureeMs : null,
    });
  }

  return tentatives.sort((a, b) => {
    const d = (temps(a.creeLe) ?? 0) - (temps(b.creeLe) ?? 0);
    if (d !== 0) return d;
    if (a.kind !== b.kind) return a.kind === "essai" ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
