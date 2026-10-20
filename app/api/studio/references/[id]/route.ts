import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { supprimerImage } from "@/lib/studioBlob";
import { MAX_PRISES, nomPrise } from "@/lib/studioCases";
import { estRole } from "@/lib/studioFiche";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/studio/references/[id] — corrige le rôle d'une photo, ou son
 * numéro de prise (`ordre`, 1 à 15 ; null la sort du tableau). Si une autre
 * photo du coloris porte déjà ce numéro, les deux s'échangent. `generation`
 * (« V3 »…) choisit la liste des noms de prise.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { role?: unknown; ordre?: unknown; generation?: unknown };

  if (body.ordre !== undefined) {
    const ordre = body.ordre;
    const generation = typeof body.generation === "string" ? body.generation : null;
    if (ordre !== null && !(typeof ordre === "number" && Number.isInteger(ordre) && ordre >= 1 && ordre <= MAX_PRISES)) {
      return NextResponse.json({ error: `Numéro de prise : 1 à ${MAX_PRISES}.` }, { status: 400 });
    }
    const ref = await prisma.studioReference.findFirst({ where: { id, userId }, select: { colorisId: true, ordre: true } });
    if (!ref) return notFound("Photo");
    if (ordre === null && (await prisma.studioEssai.count({ where: { referenceId: id } })) > 0) {
      return NextResponse.json({ error: "Cette photo a déjà servi : elle reste dans le tableau." }, { status: 409 });
    }
    await prisma.$transaction(async (tx) => {
      if (ordre !== null && ref.colorisId) {
        await tx.studioReference.updateMany({
          where: { userId, colorisId: ref.colorisId, ordre, NOT: { id } },
          data: { ordre: ref.ordre, prise: ref.ordre === null ? null : nomPrise(ref.ordre, generation) },
        });
      }
      await tx.studioReference.update({ where: { id }, data: { ordre, prise: ordre === null ? null : nomPrise(ordre, generation) } });
    });
    return NextResponse.json({ ok: true });
  }

  if (!estRole(body.role)) return NextResponse.json({ error: "Rôle inconnu." }, { status: 400 });
  const res = await prisma.studioReference.updateMany({ where: { id, userId }, data: { role: body.role } });
  if (res.count === 0) return notFound("Photo");
  return NextResponse.json({ ok: true });
}

// DELETE /api/studio/references/[id] — retire une photo de la bibliothèque.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const ref = await prisma.studioReference.findFirst({ where: { id, userId }, select: { urlImage: true } });
  if (!ref) return notFound("Photo");
  // RESTRICT en base : une photo qui a servi garde ses cases verrouillées.
  if ((await prisma.studioEssai.count({ where: { referenceId: id } })) > 0) {
    return NextResponse.json({ error: "Cette photo a déjà servi : elle ne peut plus être supprimée." }, { status: 409 });
  }
  await prisma.studioReference.delete({ where: { id } });
  // Le fichier peut servir à une autre ligne (même empreinte) : ne l'effacer que s'il est orphelin.
  const encore = await prisma.studioReference.count({ where: { userId, urlImage: ref.urlImage } });
  if (encore === 0) {
    await supprimerImage(ref.urlImage, "references", userId).catch((e) =>
      console.error("[studio] suppression blob référence :", e instanceof Error ? e.name : "erreur"),
    );
  }
  return NextResponse.json({ ok: true });
}
