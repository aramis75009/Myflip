import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { whereImagesValidees } from "@/lib/studioAnnonce";
import { versionsDuSac } from "@/lib/studioServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/annonce?sku=SDN15 — ce que le Studio donne à l'annonce de ce
 * sac : `images` (les images VALIDÉES, dans l'ordre des prises : la Version 1)
 * et `versions` (les versions enregistrées 2, 3… du coloris du sac, avec leur
 * texte, leur SKU et leurs photos : le menu « Version » de la Mise en vente,
 * étape 5 du PRD des retouches par lot). Un sac sans version rend `versions: []`.
 *
 * C'est le seul chemin par lequel une image générée rejoint une annonce (règle
 * du 20/10) : seule la décision d'Aramis (`decision = "valide"`) compte, jamais
 * le verdict IA. La mise en vente lit chaque image par /api/studio/image (`essai`
 * pour une image validée, `ref` pour une photo de version) ; la réponse ne porte
 * ni octets ni URL de blob.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const sku = req.nextUrl.searchParams.get("sku")?.trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "sku requis." }, { status: 400 });

  const [essais, versions] = await Promise.all([
    prisma.studioEssai.findMany({
      where: whereImagesValidees(userId, sku),
      select: { id: true, createdAt: true, reference: { select: { ordre: true, prise: true } } },
    }),
    versionsDuSac(userId, sku),
  ]);
  const images = essais
    .map((e) => ({ essaiId: e.id, ordre: e.reference?.ordre ?? 0, prise: e.reference?.prise ?? null, createdAt: +e.createdAt }))
    .sort((a, b) => a.ordre - b.ordre || a.createdAt - b.createdAt)
    .map((i) => ({ essaiId: i.essaiId, ordre: i.ordre, prise: i.prise }));
  return NextResponse.json({ sku, images, versions });
}
