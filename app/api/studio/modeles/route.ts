import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { agregatsParModele } from "@/lib/studioAgregats";
import { getCatalogue } from "@/lib/studioCatalogue";
import { lireBudget } from "@/lib/studioServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/modeles — le catalogue des modèles d'image OpenRouter (avec
 * leur tarif), les favoris du compte, le budget du compte et les RÉSULTATS
 * RÉELS de chaque modèle d'après les essais d'Aramis.
 *
 *  - `agregats` : un élément par modèle déjà utilisé (essai ou échec), voir
 *    `AgregatModele` (lib/studioAgregats.ts). Un modèle jamais utilisé n'y est
 *    pas : l'écran affiche alors « jamais essayé », pas un taux de 0 %. Seules
 *    les décisions d'Aramis comptent, jamais l'avis de l'IA ; un coût réel
 *    absent n'est jamais compté zéro.
 *  - `budget` : `{ budgetParSacEur, tauxEurParUsd }`, de quoi calculer le coût
 *    par sac et le badge « hors budget » avec `coutSac` (lib/studioModeles.ts).
 *
 * Le catalogue ne lève jamais : OpenRouter injoignable ⇒ dernière bonne
 * réponse (`etat.kind = "stale"`), sinon liste vide (`"off"`). Les favoris sont
 * rendus tels quels, même ceux qu'OpenRouter ne liste plus : l'écran les
 * ignore, et ils restent supprimables.
 *
 * `?rafraichir=1` (bouton « Rafraîchir » du sélecteur) relit OpenRouter sans
 * attendre la fin du cache de 10 min ; en panne, c'est toujours la dernière
 * bonne réponse qui revient.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const rafraichir = req.nextUrl.searchParams.get("rafraichir") === "1";

  try {
    const [catalogue, favoris, essais, echecs, budget] = await Promise.all([
      getCatalogue({ refresh: rafraichir }),
      prisma.studioModeleFavori.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { modele: true } }),
      prisma.studioEssai.findMany({
        where: { coloris: { userId } },
        select: { modele: true, decision: true, essaiParentId: true, coutReelUsd: true, dureeMs: true, createdAt: true },
      }),
      prisma.studioEchec.findMany({ where: { userId }, select: { modele: true, createdAt: true } }),
      lireBudget(userId),
    ]);
    return NextResponse.json({
      modeles: catalogue.modeles,
      favoris: favoris.map((f) => f.modele),
      agregats: agregatsParModele(essais, echecs),
      budget,
      etat: catalogue.etat,
      fetchedAt: catalogue.fetchedAt,
    });
  } catch (e) {
    console.error("GET /api/studio/modeles", e instanceof Error ? e.name + ": " + e.message : "erreur");
    return NextResponse.json({ error: "Catalogue illisible." }, { status: 500 });
  }
}
