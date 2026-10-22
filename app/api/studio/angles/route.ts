import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { lireSaisieAngle } from "@/lib/studioPrompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/studio/angles — nouveau prompt d'angle, ajouté en dernière colonne. */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const saisie = lireSaisieAngle(await req.json().catch(() => null));
  if ("erreur" in saisie) return NextResponse.json({ error: saisie.erreur }, { status: 400 });
  const dernier = await prisma.studioAngle.aggregate({ where: { userId, archiveLe: null }, _max: { ordre: true } });
  const angle = await prisma.studioAngle.create({
    data: { userId, nom: saisie.nom, angle: saisie.angle, ordre: (dernier._max.ordre ?? 0) + 1 },
    select: { id: true },
  });
  return NextResponse.json(angle);
}
