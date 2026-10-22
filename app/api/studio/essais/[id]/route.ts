import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { supprimerImage } from "@/lib/studioBlob";
import { estDecision } from "@/lib/studioFiche";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/studio/essais/[id] — la décision d'Aramis : "valide", "rejete",
 * ou null pour revenir sur une décision. C'est elle, pas le verdict IA, qui
 * alimente le bilan (spec §6).
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { decision?: unknown };
  if (body.decision !== null && !estDecision(body.decision)) {
    return NextResponse.json({ error: "Décision inconnue." }, { status: 400 });
  }
  const res = await prisma.studioEssai.updateMany({
    where: { id, coloris: { userId } },
    data: { decision: body.decision },
  });
  if (res.count === 0) return notFound("Essai");
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/studio/essais/[id] — purge manuelle d'un essai REJETÉ (spec §8).
 *
 * Ne purge que l'IMAGE. La ligne reste, `urlImage` vidé : un rejet est une
 * mesure, l'effacer gonflerait le taux de réussite du bilan. Un essai validé
 * ou non décidé garde son image.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const essai = await prisma.studioEssai.findFirst({
    where: { id, coloris: { userId } },
    select: { urlImage: true, decision: true },
  });
  if (!essai) return notFound("Essai");
  if (!essai.urlImage) return NextResponse.json({ ok: true });
  if (essai.decision !== "rejete") {
    return NextResponse.json({ error: "Seul un essai rejeté peut être purgé." }, { status: 409 });
  }
  await prisma.studioEssai.update({ where: { id }, data: { urlImage: "" } });
  await supprimerImage(essai.urlImage, "generees", userId).catch((e) =>
    console.error("[studio] suppression blob essai :", e instanceof Error ? e.name : "erreur"),
  );
  return NextResponse.json({ ok: true });
}
