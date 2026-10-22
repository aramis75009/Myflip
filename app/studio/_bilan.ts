// The Studio summary (/studio/bilan) as pure logic: success, decisions and
// spending per group (model, angle, colourway), and spending per week.
// PURE: tested by app/studio/_bilan.test.ts.
//
// Same definitions as the model picker (lib/studioAgregats.ts), so the two
// screens never disagree:
//  - a « first try » is an image that is NOT a correction (no `essaiParentId`)
//    and on which Aramis decided; the AI opinion never counts;
//  - an unknown real cost is never counted as zero: totals are minimums and
//    say how many images they miss (`sansCout`), manual deposits excepted
//    (they cost nothing through the API).

import { MODELE_MANUEL, modeleDe } from "@/lib/studioFiche";

export type EssaiBilan = {
  colorisId: string;
  angleId: string;
  modele: string;
  decision: string | null;
  essaiParentId: string | null;
  coutReelUsd: number | null;
  createdAt: Date | string;
};

export type EchecBilan = { modele: string; coutReelUsd: number | null; createdAt: Date | string };

export type StatGroupe = {
  id: string;
  images: number;
  valides: number;
  rejetes: number;
  aJuger: number;
  premiersDecides: number;
  premiersValides: number;
  /** premiersValides / premiersDecides; null without a decided first try (never 0 % by default). */
  taux: number | null;
  /** Known real costs of the images, in USD. */
  coutConnuUsd: number;
  /** API images without a real cost: `coutConnuUsd` is then a minimum. */
  sansCout: number;
  /** coutConnuUsd / valides; null without a validated image or without any known cost. */
  coutParValideeUsd: number | null;
};

const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const arrondiUsd = (n: number) => Math.round(n * 1e6) / 1e6;

function resumer(id: string, essais: readonly EssaiBilan[]): StatGroupe {
  let valides = 0;
  let rejetes = 0;
  let premiersDecides = 0;
  let premiersValides = 0;
  let cout = 0;
  let connus = 0;
  let sansCout = 0;
  for (const e of essais) {
    if (e.decision === "valide") valides++;
    else if (e.decision === "rejete") rejetes++;
    if (!e.essaiParentId && (e.decision === "valide" || e.decision === "rejete")) {
      premiersDecides++;
      if (e.decision === "valide") premiersValides++;
    }
    if (estNombre(e.coutReelUsd) && e.coutReelUsd >= 0) {
      cout += e.coutReelUsd;
      connus++;
    } else if (modeleDe(e.modele) !== MODELE_MANUEL) sansCout++;
  }
  const coutConnuUsd = arrondiUsd(cout);
  return {
    id,
    images: essais.length,
    valides,
    rejetes,
    aJuger: essais.length - valides - rejetes,
    premiersDecides,
    premiersValides,
    taux: premiersDecides > 0 ? premiersValides / premiersDecides : null,
    coutConnuUsd,
    sansCout,
    coutParValideeUsd: valides > 0 && connus > 0 ? arrondiUsd(coutConnuUsd / valides) : null,
  };
}

/** One summary per key, in key order (deterministic). */
export function statsParGroupe(essais: readonly EssaiBilan[], cle: (e: EssaiBilan) => string): StatGroupe[] {
  const groupes = new Map<string, EssaiBilan[]>();
  for (const e of essais) {
    const k = cle(e);
    const g = groupes.get(k);
    if (g) g.push(e);
    else groupes.set(k, [e]);
  }
  return [...groupes.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).map((k) => resumer(k, groupes.get(k)!));
}

/** Every image in one summary. */
export function statsGlobales(essais: readonly EssaiBilan[]): StatGroupe {
  return resumer("tout", essais);
}

export type SemaineDepense = {
  /** Monday of the week, « 2026-10-19 » (Paris calendar). */
  debut: string;
  /** Known real costs of the week (images and failures), USD. */
  usd: number;
  /** API images of the week without a real cost: the bar is a minimum. */
  sansCout: number;
  /** Images generated that week (all sources). */
  images: number;
};

const JOUR_PARIS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });

/** Monday (Paris calendar) of the week holding `d`, as « YYYY-MM-DD ». */
export function lundiParis(d: Date | string): string | null {
  const t = d instanceof Date ? d.getTime() : Date.parse(d);
  if (!Number.isFinite(t)) return null;
  const jour = new Date(`${JOUR_PARIS.format(new Date(t))}T00:00:00Z`);
  const decalage = (jour.getUTCDay() + 6) % 7; // lundi = 0
  jour.setUTCDate(jour.getUTCDate() - decalage);
  return jour.toISOString().slice(0, 10);
}

/**
 * Spending of the last `nb` weeks, oldest first, the current week last. Weeks
 * without activity are present (a zero bar is a fact, not a missing value).
 * Failures count with their known cost (a refused call may be billed).
 */
export function depensesParSemaine(
  essais: readonly EssaiBilan[],
  echecs: readonly EchecBilan[],
  maintenant: Date,
  nb = 12,
): SemaineDepense[] {
  const fin = lundiParis(maintenant);
  if (!fin) return [];
  const semaines: SemaineDepense[] = [];
  const index = new Map<string, SemaineDepense>();
  const base = new Date(`${fin}T00:00:00Z`);
  for (let i = nb - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - 7 * i);
    const s: SemaineDepense = { debut: d.toISOString().slice(0, 10), usd: 0, sansCout: 0, images: 0 };
    semaines.push(s);
    index.set(s.debut, s);
  }
  for (const e of essais) {
    const s = index.get(lundiParis(e.createdAt) ?? "");
    if (!s) continue;
    s.images++;
    if (estNombre(e.coutReelUsd) && e.coutReelUsd >= 0) s.usd += e.coutReelUsd;
    else if (modeleDe(e.modele) !== MODELE_MANUEL) s.sansCout++;
  }
  for (const x of echecs) {
    const s = index.get(lundiParis(x.createdAt) ?? "");
    if (s && estNombre(x.coutReelUsd) && x.coutReelUsd >= 0) s.usd += x.coutReelUsd;
  }
  for (const s of semaines) s.usd = arrondiUsd(s.usd);
  return semaines;
}
