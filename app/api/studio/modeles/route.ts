import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { getCatalogue } from "@/lib/studioCatalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/modeles — le catalogue des modèles d'image OpenRouter (avec
 * leur tarif) et les favoris du compte.
 *
 * Le catalogue ne lève jamais : OpenRouter injoignable ⇒ dernière bonne
 * réponse (`etat.kind = "stale"`), sinon liste vide (`"off"`). Les favoris sont
 * rendus tels quels, même ceux qu'OpenRouter ne liste plus : l'écran les
 * ignore, et ils restent supprimables.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const [catalogue, favoris] = await Promise.all([
      getCatalogue(),
      prisma.studioModeleFavori.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { modele: true } }),
    ]);
    return NextResponse.json({
      modeles: catalogue.modeles,
      favoris: favoris.map((f) => f.modele),
      etat: catalogue.etat,
      fetchedAt: catalogue.fetchedAt,
    });
  } catch (e) {
    console.error("GET /api/studio/modeles", e instanceof Error ? e.name + ": " + e.message : "erreur");
    return NextResponse.json({ error: "Catalogue illisible." }, { status: 500 });
  }
}
