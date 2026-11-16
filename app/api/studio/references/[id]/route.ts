import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { MAX_PRISES, nomPrise } from "@/lib/studioCases";
import { supprimerFichiersOrphelins } from "@/lib/studioCopieServeur";
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

// DELETE /api/studio/references/[id] — retire une photo de la bibliothèque, ou
// une de ses copies retouchées. Retirer une photo retire aussi ses copies. Une
// photo (ou une copie) montrée par une version reste : 409.
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const ref = await prisma.studioReference.findFirst({ where: { id, userId }, select: { urlImage: true } });
  if (!ref) return notFound("Photo");
  // Les copies pivotées partent avec leur photo (cascade en base) : on garde leurs fichiers à effacer.
  const copies = await prisma.studioReference.findMany({ where: { userId, copieDeId: id }, select: { id: true, urlImage: true } });
  // RESTRICT en base : une photo qui a servi garde ses cases verrouillées.
  if ((await prisma.studioEssai.count({ where: { referenceId: { in: [id, ...copies.map((c) => c.id)] } } })) > 0) {
    return NextResponse.json({ error: "Cette photo a déjà servi : elle ne peut plus être supprimée." }, { status: 409 });
  }
  // Une version montre cette photo, ou une de ses copies : la retirer viderait une case de la version.
  if ((await prisma.studioVersionPhoto.count({ where: { referenceId: { in: [id, ...copies.map((c) => c.id)] } } })) > 0) {
    return NextResponse.json({ error: "Cette photo sert à une version : elle ne peut plus être supprimée." }, { status: 409 });
  }
  await prisma.studioReference.delete({ where: { id } });
  // Un fichier peut servir à une autre ligne (même empreinte) : on ne l'efface que s'il est orphelin.
  await supprimerFichiersOrphelins(userId, [ref.urlImage, ...copies.map((c) => c.urlImage)]);
  return NextResponse.json({ ok: true });
}
