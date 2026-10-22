import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/annonce?sku=SDN15 — les images VALIDÉES pour l'annonce de ce
 * sac, dans l'ordre des prises.
 *
 * C'est le seul chemin par lequel une image générée rejoint une annonce (règle
 * du 20/10) : seule la décision d'Aramis (`decision = "valide"`) compte, jamais
 * le verdict IA. La mise en vente lit chaque image par /api/studio/image ; la
 * réponse ne porte ni octets ni URL de blob.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const sku = req.nextUrl.searchParams.get("sku")?.trim().toUpperCase();
  if (!sku) return NextResponse.json({ error: "sku requis." }, { status: 400 });

  const essais = await prisma.studioEssai.findMany({
    where: { skuCible: sku, decision: "valide", urlImage: { not: "" }, coloris: { userId }, reference: { ordre: { not: null } } },
    select: { id: true, createdAt: true, reference: { select: { ordre: true, prise: true } } },
  });
  const images = essais
    .map((e) => ({ essaiId: e.id, ordre: e.reference?.ordre ?? 0, prise: e.reference?.prise ?? null, createdAt: +e.createdAt }))
    .sort((a, b) => a.ordre - b.ordre || a.createdAt - b.createdAt)
    .map((i) => ({ essaiId: i.essaiId, ordre: i.ordre, prise: i.prise }));
  return NextResponse.json({ sku, images });
}
