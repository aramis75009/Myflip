// GET /api/hermes/stock — lit le stock, filtré.
//
// C'est la route qui permet à Hermes de DÉCIDER. Sans elle il ne pouvait lire
// que s'il connaissait déjà un `commandeId` : un agent qui reprend son travail
// après un redémarrage n'avait aucun moyen de retrouver où il en était.
//
// Lecture seule. Le pendant en écriture est /api/hermes/stock/statut, et il n'y
// en a pas d'autre : aucune route ne permet de modifier un champ arbitraire.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authentifierHermes } from "@/lib/hermesAuth";
import { erreurHermes, lirePagination, listeParam } from "@/lib/hermesApi";
import {
  articleHermesSelect,
  decompteParStatut,
  toArticleHermes,
} from "@/lib/stock";
import { STATUTS } from "@/lib/calc";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authentifierHermes(req);
  if (!auth.ok) return auth.response;

  try {
    const p = req.nextUrl.searchParams;

    const page = lirePagination(p);
    if ("erreur" in page) return page.erreur;

    const statuts = listeParam(p, "statut");
    // Un statut inconnu ne rend pas « 0 article » — il rend une erreur. Sinon
    // une faute de frappe (« En Stock ») passerait pour un stock vide, et
    // l'agent en conclurait qu'il n'a rien à faire.
    const inconnus = statuts.filter((s) => !STATUTS.includes(s as never));
    if (inconnus.length)
      return erreurHermes(`Statut inconnu : ${inconnus.join(", ")}.`, 400, {
        statutsValides: STATUTS,
      });

    const skus = listeParam(p, "sku").map((s) => s.toUpperCase());
    const commandeId = p.get("commandeId")?.trim();
    const marque = p.get("marque")?.trim();
    const categorie = p.get("categorie")?.trim();
    const lot = p.get("lot")?.trim();
    const q = p.get("q")?.trim();

    // `userId` est posé en premier et jamais surchargé par un filtre de
    // l'appelant : il borne le périmètre, les autres critères le restreignent.
    const where: Prisma.ArticleWhereInput = { userId: auth.userId };
    if (statuts.length) where.statut = { in: statuts };
    if (skus.length) where.sku = { in: skus };
    else if (q) where.sku = { contains: q, mode: "insensitive" };
    if (commandeId) where.commandeId = commandeId;
    if (marque) where.marque = { equals: marque, mode: "insensitive" };
    if (categorie) where.categorie = { equals: categorie, mode: "insensitive" };
    if (lot) where.lot = { equals: lot, mode: "insensitive" };

    const [total, articles, parStatut] = await Promise.all([
      prisma.article.count({ where }),
      prisma.article.findMany({
        where,
        select: articleHermesSelect,
        orderBy: [{ createdAt: "desc" }, { sku: "asc" }],
        take: page.limit,
        skip: page.offset,
      }),
      decompteParStatut(where),
    ]);

    return NextResponse.json({
      total,
      limit: page.limit,
      offset: page.offset,
      // Dit sans ambiguïté s'il reste des pages : l'agent n'a pas à déduire la
      // fin d'une page incomplète, raisonnement qui casse quand total % limit
      // vaut 0.
      suite: page.offset + articles.length < total,
      // Décompte sur TOUT le filtre, pas sur la page.
      parStatut,
      articles: articles.map(toArticleHermes),
    });
  } catch (err) {
    console.error("GET /api/hermes/stock", err);
    return erreurHermes("Erreur lors du chargement du stock.", 500);
  }
}
