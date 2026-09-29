// Date de mise en vente et « jours en vente » — la règle vit ICI, une fois.
//
// Objectif : savoir en combien de jours un article s'est vendu. La date de mise
// en vente est la PREMIÈRE mise en ligne : un aller-retour en brouillon ne la
// remet pas à zéro, et une date corrigée à la main n'est jamais écrasée.
//
// Les jours se comptent en jours calendaires à Paris : un article mis en ligne
// à 23 h 30 l'est « ce jour-là », comme le voit Aramis — pas le lendemain UTC.

import type { Prisma } from "@prisma/client";

export const STATUT_EN_VENTE = "En vente";

const FMT_PARIS = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });

/** « AAAA-MM-JJ » du jour calendaire à Paris, ou null. */
export function jourParis(d: Date | null): string | null {
  return d ? FMT_PARIS.format(d) : null;
}

/** Aujourd'hui à Paris, « AAAA-MM-JJ » (pré-remplissage des champs date). */
export function aujourdhuiParis(now: Date = new Date()): string {
  return FMT_PARIS.format(now);
}

/**
 * Valeur à écrire dans `dateMiseEnVente` lors d'une écriture de statut.
 *
 * - `saisie` fournie (Date ou null) : c'est une correction à la main, elle
 *   l'emporte toujours ;
 * - sinon, PASSAGE en « En vente » (depuis un autre statut) d'un article SANS
 *   date : maintenant. Un article déjà en vente sans date — antérieur à cette
 *   fonctionnalité — n'en reçoit pas à la première édition venue : pas de
 *   rattrapage inventé ;
 * - sinon : `undefined` = ne pas toucher à la colonne.
 */
export function dateMiseEnVenteAEcrire(
  x: { statutAvant: string; statut: string; dateActuelle: Date | null; saisie?: Date | null },
  now: Date = new Date(),
): Date | null | undefined {
  if (x.saisie !== undefined) return x.saisie;
  if (x.statut === STATUT_EN_VENTE && x.statutAvant !== STATUT_EN_VENTE && x.dateActuelle == null) return now;
  return undefined;
}

const DAY_MS = 86_400_000;
const jourIndex = (d: Date) => Date.parse(FMT_PARIS.format(d) + "T00:00:00Z") / DAY_MS;
const toDate = (v: Date | string | null): Date | null => (v == null ? null : v instanceof Date ? v : new Date(v));

/**
 * Jours en vente : vendu = date de vente − date de mise en vente ; pas encore
 * vendu = aujourd'hui − date de mise en vente. `null` sans date de mise en
 * vente (affiché « — »). Jamais négatif : une vente datée avant la mise en
 * ligne (saisie rattrapée à la main) compte 0.
 */
export function joursEnVente(
  a: { dateMiseEnVente: Date | string | null; dateVente: Date | string | null },
  now: Date = new Date(),
): { jours: number; vendu: boolean } | null {
  const debut = toDate(a.dateMiseEnVente);
  if (!debut || Number.isNaN(debut.getTime())) return null;
  const vente = toDate(a.dateVente);
  const fin = vente && !Number.isNaN(vente.getTime()) ? vente : now;
  return { jours: Math.max(0, Math.round(jourIndex(fin) - jourIndex(debut))), vendu: fin === vente };
}

export type PatchDate =
  | { ok: true; change: false }
  | { ok: true; change: true; value: Date | null }
  | { ok: false; error: string };

const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;
const ANNEE_MIN = 2000;
const ANNEE_MAX = 2100;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Champ date d'un PATCH : absent = inchangé, null / "" = effacé, « AAAA-MM-JJ »
 * ou ISO complet = enregistré. Un jour seul est stocké à minuit UTC, soit le
 * même jour à Paris — la convention déjà utilisée pour `dateVente`.
 */
export function parseDatePatch(v: unknown): PatchDate {
  if (v === undefined) return { ok: true, change: false };
  if (v === null || v === "") return { ok: true, change: true, value: null };
  if (typeof v === "string" && (JOUR_RE.test(v) || ISO_RE.test(v))) {
    const d = new Date(JOUR_RE.test(v) ? v + "T00:00:00.000Z" : v);
    // « 2026-13-45 » passe la regex mais pas le calendrier. L'année est bornée :
    // un input date tapé au clavier émet « 0002-09-29 » pendant qu'on écrit
    // 2026, et une telle date sortirait hors format vers SacBase.
    const annee = Number(v.slice(0, 4));
    if (
      !Number.isNaN(d.getTime()) &&
      annee >= ANNEE_MIN &&
      annee <= ANNEE_MAX &&
      (!JOUR_RE.test(v) || d.toISOString().slice(0, 10) === v)
    )
      return { ok: true, change: true, value: d };
  }
  return { ok: false, error: "Date invalide." };
}

/**
 * Filtre des écritures groupées de statut (barre d'action du Stock, assistant) :
 * parmi `cible`, les articles qui passent VRAIMENT en « En vente » et n'ont pas
 * encore de date. En `AND` pour ne jamais écraser un filtre `statut` de la cible.
 */
export function whereMiseEnVenteAuto(cible: Prisma.ArticleWhereInput): { AND: Prisma.ArticleWhereInput[] } {
  return { AND: [cible, { dateMiseEnVente: null, statut: { not: STATUT_EN_VENTE } }] };
}
