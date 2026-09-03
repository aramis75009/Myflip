import { NextRequest, NextResponse } from "next/server";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { changerStatutArticles } from "@/lib/stock";

export const dynamic = "force-dynamic";

type Body = { ids?: string[]; statut?: string };

// PATCH /api/articles/bulk — change le statut d'un ensemble d'articles.
//
// La logique vit dans `lib/stock.ts` : elle est partagée avec l'API Hermes
// (POST /api/hermes/stock/statut), qui désigne les mêmes articles par SKU.
export async function PATCH(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const { ids, statut } = (await req.json()) as Body;

    const res = await changerStatutArticles(userId, { ids }, statut ?? "");
    if (!res.ok)
      return NextResponse.json({ error: res.error }, { status: res.status });

    // Les SKU ne sont pas renvoyés ici : l'UI recharge le stock. Sur une
    // sélection de plusieurs centaines de lignes, ce serait du poids pour rien.
    return NextResponse.json({ count: res.count, statut: res.statut });
  } catch (err) {
    console.error("PATCH /api/articles/bulk", err);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour groupée." },
      { status: 500 },
    );
  }
}
