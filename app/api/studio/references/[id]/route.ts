import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { supprimerImage } from "@/lib/studioBlob";
import { estRole } from "@/lib/studioFiche";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/studio/references/[id] — corrige le rôle d'une photo.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { role?: unknown };
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
