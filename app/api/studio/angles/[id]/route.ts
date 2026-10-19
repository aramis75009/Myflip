import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { estRole } from "@/lib/studioFiche";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/studio/angles/[id] — édite un modèle d'angle (nom, rôle de la
 * photo à joindre, texte injecté dans {angle}). Les essais déjà déposés gardent
 * le prompt de leur dépôt (`promptUtilise`) : éditer un angle ne réécrit pas
 * les mesures passées.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { nom?: unknown; angle?: unknown; roleReference?: unknown };

  const data: { nom?: string; angle?: string; roleReference?: string } = {};
  if (body.nom !== undefined) {
    if (typeof body.nom !== "string" || !body.nom.trim()) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
    data.nom = body.nom.trim();
  }
  if (body.angle !== undefined) {
    if (typeof body.angle !== "string" || !body.angle.trim()) return NextResponse.json({ error: "Texte d'angle requis." }, { status: 400 });
    data.angle = body.angle.trim();
  }
  if (body.roleReference !== undefined) {
    if (!estRole(body.roleReference)) return NextResponse.json({ error: "Rôle inconnu." }, { status: 400 });
    data.roleReference = body.roleReference;
  }
  const res = await prisma.studioAngle.updateMany({ where: { id, userId }, data });
  if (res.count === 0) return notFound("Angle");
  return NextResponse.json({ ok: true });
}
