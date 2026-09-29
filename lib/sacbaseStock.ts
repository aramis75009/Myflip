// Réponse de GET /api/sacbase/stock — le contrat lu par SacBase.
//
// ⚠️ SacBase valide cette réponse STRICTEMENT et rejette tout le lot au moindre
// écart (SKU hors format, compte inconnu, date avec heure…). Ajouter un champ
// est sans danger (il est ignoré) ; en retirer un ou changer un type casse la
// synchro. Pas de prix d'achat, de marge ni d'id interne : SacBase n'en a pas
// besoin, et moins de champs sortis, c'est moins de surface à garder stable.

import type { Prisma } from "@prisma/client";
import { naturalSort } from "@/lib/calc";
import { COMPTES_VENTE } from "@/lib/comptesVente";
import { jourParis } from "@/lib/dateMiseEnVente";
import type { CompteVente } from "@/lib/types";

/** Sacs Hipobuy de l'utilisateur ciblé (fournisseur « Hipobuy », casse libre). */
export function whereSacbase(userId: string) {
  return {
    userId,
    commande: { fournisseur: { contains: "hipobuy", mode: "insensitive" } },
  } satisfies Prisma.ArticleWhereInput;
}

export const articleSacbaseSelect = {
  sku: true,
  statut: true,
  compteVente: true,
  prixVente: true,
  dateVente: true,
  dateMiseEnVente: true,
} satisfies Prisma.ArticleSelect;

export type ArticleSacbaseRow = {
  sku: string;
  statut: string;
  compteVente: CompteVente | null;
  prixVente: number | null;
  dateVente: Date | null;
  dateMiseEnVente: Date | null;
};

export type ArticleSacbase = {
  sku: string;
  statut: string;
  compte: CompteVente | null;
  prixVente: number | null;
  /** « AAAA-MM-JJ » en Europe/Paris, ou null. */
  dateVente: string | null;
  /** Première mise en ligne, même format. SacBase en tire les jours en vente. */
  dateMiseEnVente: string | null;
};

/** Jour calendaire à Paris : une vente à 23 h 30 le 27/09 reste le 27/09. */
export { jourParis };

export function toArticleSacbase(a: ArticleSacbaseRow): ArticleSacbase {
  return {
    sku: a.sku,
    statut: a.statut,
    compte: a.compteVente ?? null,
    prixVente: a.prixVente ?? null,
    dateVente: jourParis(a.dateVente),
    dateMiseEnVente: jourParis(a.dateMiseEnVente),
  };
}

// Les formats exacts que SacBase exige (cf. son parseMyflipStock).
const SKU_RE = /^[A-Z]{2,5}\d+$/;
const JOUR_RE = /^\d{4}-\d{2}-\d{2}$/;
const conforme = (a: ArticleSacbase) =>
  SKU_RE.test(a.sku) &&
  a.statut !== "" &&
  (a.dateVente === null || JOUR_RE.test(a.dateVente)) &&
  (a.dateMiseEnVente === null || JOUR_RE.test(a.dateMiseEnVente));

/**
 * `ecartes` : SKU des lignes hors contrat (SKU « SDN-4 », date aberrante…),
 * RETIRÉES de la réponse. SacBase rejette tout le lot au premier écart : une
 * seule ligne douteuse couperait la synchro de tous les sacs. La route les
 * journalise ; elles ne partent jamais.
 */
export function reponseSacbase(rows: ArticleSacbaseRow[], now: Date = new Date()) {
  const tous = rows.map(toArticleSacbase);
  return {
    genere_le: now.toISOString(),
    comptes: COMPTES_VENTE.map((c) => ({ id: c.id, label: c.label })),
    articles: tous.filter(conforme).sort((a, b) => naturalSort(a.sku, b.sku)),
    ecartes: tous
      .filter((a) => !conforme(a))
      .map((a) => a.sku)
      .sort(naturalSort),
  };
}
