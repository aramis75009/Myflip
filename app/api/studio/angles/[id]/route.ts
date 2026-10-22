import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { lireSaisieAngle } from "@/lib/studioPrompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** L'angle a-t-il déjà pris une case (un essai non rejeté, sur n'importe quel coloris) ? */
const aServi = (angleId: string) =>
  prisma.studioEssai.count({ where: { angleId, OR: [{ decision: null }, { decision: { not: "rejete" } }] } }).then((n) => n > 0);

/**
 * PATCH /api/studio/angles/[id] — modifie un prompt d'angle (nom court, texte).
 *
 * Décision 2 du 20/10 : un angle qui a déjà pris une case n'est pas réécrit.
 * L'ancien est archivé et une nouvelle version prend sa place (même rang) :
 * les cases déjà prises restent attachées à l'ancien texte, la nouvelle
 * colonne repart libre. Un angle jamais utilisé est modifié sur place.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const saisie = lireSaisieAngle(await req.json().catch(() => null));
  if ("erreur" in saisie) return NextResponse.json({ error: saisie.erreur }, { status: 400 });

  const angle = await prisma.studioAngle.findFirst({ where: { id, userId, archiveLe: null } });
  if (!angle) return notFound("Angle");

  // Un simple renommage ne change pas ce qui est envoyé : sur place, même s'il a servi.
  if (saisie.angle === angle.angle || !(await aServi(id))) {
    await prisma.studioAngle.update({ where: { id }, data: saisie });
    return NextResponse.json({ id, version: false });
  }
  const nouveau = await prisma.$transaction(async (tx) => {
    await tx.studioAngle.update({ where: { id }, data: { archiveLe: new Date() } });
    return tx.studioAngle.create({
      data: { userId, nom: saisie.nom, angle: saisie.angle, ordre: angle.ordre },
      select: { id: true },
    });
  });
  return NextResponse.json({ id: nouveau.id, version: true });
}

/**
 * DELETE /api/studio/angles/[id] — retire un prompt d'angle. Un angle qui a
 * pris une case ne se retire pas (409). Un angle qui n'a que des essais
 * rejetés est archivé (ses mesures restent au bilan) ; sinon il est supprimé.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const angle = await prisma.studioAngle.findFirst({ where: { id, userId, archiveLe: null }, select: { id: true } });
  if (!angle) return notFound("Angle");
  if (await aServi(id)) {
    return NextResponse.json({ error: "Ce prompt d'angle a déjà servi : il ne peut plus être supprimé." }, { status: 409 });
  }
  const traces = await prisma.studioEssai.count({ where: { angleId: id } }) + (await prisma.studioEchec.count({ where: { angleId: id } }));
  if (traces > 0) await prisma.studioAngle.update({ where: { id }, data: { archiveLe: new Date() } });
  else await prisma.studioAngle.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
