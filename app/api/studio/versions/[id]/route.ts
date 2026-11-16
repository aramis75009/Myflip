import { NextRequest, NextResponse } from "next/server";

import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { lireSkuAnnonce } from "@/lib/studioVersion";
import { SELECT_VERSION, versionEnBase } from "@/lib/studioVersionLecture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/studio/versions/[id] — enregistre le SKU d'annonce d'une version,
 * saisi par Aramis. Corps JSON : `{ skuAnnonce }` (chaîne ; vide = pas encore
 * renseigné). Seul ce champ se modifie ici : ni les photos, ni le titre, ni les
 * tirets. La Version 1 n'est pas en base : son SKU est celui du sac.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;

  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corps || typeof corps !== "object" || !("skuAnnonce" in corps)) {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }
  const sku = lireSkuAnnonce(corps.skuAnnonce);
  if (!sku.ok) return NextResponse.json({ error: sku.message }, { status: 400 });

  const res = await prisma.studioVersion.updateMany({ where: { id, userId }, data: { skuAnnonce: sku.sku } });
  if (res.count === 0) return notFound("Version");
  const version = await prisma.studioVersion.findFirst({ where: { id, userId }, select: SELECT_VERSION });
  if (!version) return notFound("Version");
  return NextResponse.json({ version: versionEnBase(version) });
}
