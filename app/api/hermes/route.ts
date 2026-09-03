// GET /api/hermes — contrôle de configuration et manifeste.
//
// Premier appel qu'Hermes doit faire au démarrage. Il répond à trois questions
// qu'un agent hébergé ailleurs ne peut pas trancher seul :
//
//   1. mon jeton est-il bon ?          (401 sinon)
//   2. sur QUEL compte j'écris ?       (une variable mal posée sur Vercel
//                                       enverrait le sourcing chez quelqu'un
//                                       d'autre, en silence)
//   3. quels statuts ai-je le droit de poser ?
//
// La liste des statuts est servie plutôt que codée en dur chez Hermes : ils
// vivent dans `lib/calc.ts` et ont déjà bougé (« En lavage », « Repassé »
// ajoutés en août 2026). Une copie côté agent divergerait sans prévenir.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authentifierHermes } from "@/lib/hermesAuth";
import { erreurHermes } from "@/lib/hermesApi";
import { STATUTS, STATUT_VENDU } from "@/lib/calc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await authentifierHermes(req);
  if (!auth.ok) return auth.response;

  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { email: true, prenom: true },
    });

    const [commandes, articles] = await Promise.all([
      prisma.commande.count({ where: { userId: auth.userId } }),
      prisma.article.count({ where: { userId: auth.userId } }),
    ]);

    return NextResponse.json({
      ok: true,
      compte: { email: user.email, prenom: user.prenom },
      volumes: { commandes, articles },
      statuts: {
        // Ce qu'un changement de statut accepte.
        applicables: STATUTS.filter((s) => s !== STATUT_VENDU),
        // Existe en lecture mais ne se pose pas par cette API : « Vendu »
        // porte un prix, une date et des marges (validation comptable).
        lectureSeule: [STATUT_VENDU],
      },
      routes: [
        "GET    /api/hermes",
        "GET    /api/hermes/commandes",
        "POST   /api/hermes/commandes",
        "GET    /api/hermes/commandes/{id}",
        "GET    /api/hermes/stock",
        "POST   /api/hermes/stock/statut",
      ],
    });
  } catch (err) {
    console.error("GET /api/hermes", err);
    return erreurHermes("Erreur lors du contrôle de configuration.", 500);
  }
}
