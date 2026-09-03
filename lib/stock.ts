// Changement de statut d'un ensemble d'articles.
//
// Pourquoi ce fichier existe : cette logique vivait dans le handler
// PATCH /api/articles/bulk. Deux appelants la partagent désormais — la barre
// d'action groupée du Stock et l'API Hermes (POST /api/hermes/stock/statut) —
// et la règle « quitter Vendu remet les champs de vente à null » ne doit
// exister qu'à un seul endroit : dupliquée, elle laisserait un jour un article
// « En stock » porter encore un prix de vente et une marge.
//
// La désignation des articles diffère selon l'appelant : l'UI connaît les
// `id` de ses lignes, Hermes raisonne en SKU (ce qu'il a lu sur l'étiquette)
// ou en commande entière. Les trois se résolvent ici, en une requête, dans le
// périmètre de l'utilisateur.

import { prisma } from "@/lib/prisma";
import { STATUT_VENDU, STATUTS } from "@/lib/calc";
import type { Prisma } from "@prisma/client";

// ── Vue « article » exposée à Hermes ───────────────────────────────────────
//
// Volontairement plus étroite que l'`ArticleDTO` du client : l'agent raisonne
// en SKU et n'a que faire de l'`id` interne, de la carte Trello ou du texte
// d'annonce. Moins de champs sortis, c'est moins de surface à maintenir stable
// pour un consommateur qui vit hors du dépôt.

export const articleHermesSelect = {
  sku: true,
  statut: true,
  marque: true,
  categorie: true,
  lot: true,
  grade: true,
  prixAchat: true,
  prixVente: true,
  dateVente: true,
  commandeId: true,
} satisfies Prisma.ArticleSelect;

export type ArticleHermesRow = Prisma.ArticleGetPayload<{
  select: typeof articleHermesSelect;
}>;

export type ArticleHermes = Omit<ArticleHermesRow, "dateVente"> & {
  dateVente: string | null;
};

export function toArticleHermes(a: ArticleHermesRow): ArticleHermes {
  return { ...a, dateVente: a.dateVente?.toISOString() ?? null };
}

/**
 * Décompte par statut d'un ensemble d'articles, en une requête.
 *
 * Sert les vues de suivi : « combien de pièces de cette commande sont encore en
 * livraison ». Calculé sur l'ENSEMBLE filtré, jamais sur la page courante — un
 * décompte qui ne porterait que sur 100 lignes sur 400 mentirait.
 */
export async function decompteParStatut(
  where: Prisma.ArticleWhereInput,
): Promise<Record<string, number>> {
  const groupes = await prisma.article.groupBy({
    by: ["statut"],
    where,
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of groupes) out[g.statut] = g._count._all;
  return out;
}

/** Désignation des articles à modifier. Au moins un critère est requis. */
export type CibleArticles = {
  ids?: string[];
  skus?: string[];
  commandeId?: string;
};

export type ResultatStatut =
  | { ok: true; count: number; statut: string; skus: string[] }
  | { ok: false; error: string; status: number };

const echec = (error: string, status = 400): ResultatStatut => ({
  ok: false,
  error,
  status,
});

/**
 * Applique un statut à un ensemble d'articles.
 *
 * `Vendu` est refusé volontairement : ce statut porte un prix de vente, une
 * date et des marges qu'aucun changement en masse ne sait fournir. Il passe par
 * la validation comptable (`/api/articles/[id]/comptabiliser`).
 *
 * Les articles qui n'appartiennent pas à `userId` sont simplement ignorés :
 * `count` reflète ce qui a réellement changé, et rien ne révèle l'existence des
 * données d'autrui.
 */
export async function changerStatutArticles(
  userId: string,
  cible: CibleArticles,
  statut: string,
): Promise<ResultatStatut> {
  const nouveau = String(statut ?? "").trim();
  if (!STATUTS.includes(nouveau as never)) return echec("Statut invalide.");
  if (nouveau === STATUT_VENDU)
    return echec(
      "Pour marquer des articles comme vendus, utilise la validation (prix requis).",
    );

  const ids = Array.isArray(cible.ids) ? cible.ids.filter(Boolean) : [];
  const skus = Array.isArray(cible.skus) ? cible.skus.filter(Boolean) : [];
  const commandeId = cible.commandeId?.trim() || null;

  if (ids.length === 0 && skus.length === 0 && !commandeId)
    return echec("Aucun article sélectionné.");

  // Les critères s'additionnent (OR) : un appelant peut viser une commande
  // entière plus quelques SKU isolés. Le `userId` reste au niveau supérieur,
  // donc il s'applique quel que soit le critère retenu.
  const ou = [
    ...(ids.length ? [{ id: { in: ids } }] : []),
    ...(skus.length ? [{ sku: { in: skus } }] : []),
    ...(commandeId ? [{ commandeId }] : []),
  ];

  // Résolution AVANT l'écriture : `updateMany` ne rend qu'un compteur, or un
  // appelant non interactif a besoin de savoir SUR QUOI il a agi — et de voir
  // qu'un SKU inconnu n'a rien touché.
  const cibles = await prisma.article.findMany({
    where: { userId, OR: ou },
    select: { id: true, sku: true },
    orderBy: { sku: "asc" },
  });

  // Une cible vide n'est PAS une erreur ici : sur la barre d'action groupée
  // c'est une sélection périmée, sans conséquence. C'est à l'appelant d'en
  // décider — Hermes, lui, en fait une 404, parce qu'un SKU mal recopié doit
  // se voir plutôt que de passer pour un succès.
  if (cibles.length === 0)
    return { ok: true, count: 0, statut: nouveau, skus: [] };

  // Champs de vente remis à null (règle centrale si on quitte « Vendu »).
  const res = await prisma.article.updateMany({
    where: { id: { in: cibles.map((a) => a.id) }, userId },
    data: {
      statut: nouveau,
      prixVente: null,
      dateVente: null,
      margeBrute: null,
      margeNette: null,
      coefficient: null,
    },
  });

  return {
    ok: true,
    count: res.count,
    statut: nouveau,
    skus: cibles.map((a) => a.sku),
  };
}
