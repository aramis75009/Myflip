// GET /api/hermes/commandes/[id] — état d'une commande, pour qu'Hermes vérifie
// avant d'agir.
//
// Lecture seule et volontairement complète : la commande, ses lots, ses
// articles avec leur statut courant, et le décompte par statut. C'est ce qui
// permet à l'agent de savoir si une commande a déjà été créée (éviter un
// doublon) et sur quels SKU il lui reste à agir, en un seul appel.
//
// Aucune contrepartie en écriture : il n'existe ni PATCH ni DELETE sous
// /api/hermes. La surface d'action d'Hermes se limite à créer une commande et à
// changer un statut.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authentifierHermes } from "@/lib/hermesAuth";
import { toCommandeDTO } from "@/lib/commandes";
import { articleHermesSelect, toArticleHermes } from "@/lib/stock";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> },
) {
  const auth = await authentifierHermes(req);
  if (!auth.ok) return auth.response;

  const { id } = await props.params;

  try {
    // Le `userId` est dans le `where` et non vérifié après coup : une commande
    // d'un autre compte doit être indiscernable d'une commande inexistante.
    const commande = await prisma.commande.findFirst({
      where: { id, userId: auth.userId },
      include: {
        lots: { orderBy: { createdAt: "asc" } },
        // Même projection que GET /api/hermes/stock : un article a la même
        // forme quelle que soit la route qui le sert.
        articles: { orderBy: { sku: "asc" }, select: articleHermesSelect },
      },
    });

    if (!commande)
      return NextResponse.json(
        { error: "Commande introuvable." },
        { status: 404 },
      );

    const parStatut: Record<string, number> = {};
    for (const a of commande.articles)
      parStatut[a.statut] = (parStatut[a.statut] ?? 0) + 1;

    return NextResponse.json({
      commande: toCommandeDTO(commande),
      articles: commande.articles.map(toArticleHermes),
      parStatut,
    });
  } catch (err) {
    console.error("GET /api/hermes/commandes/[id]", err);
    return NextResponse.json(
      { error: "Erreur lors du chargement de la commande." },
      { status: 500 },
    );
  }
}
