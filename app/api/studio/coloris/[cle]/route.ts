import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ cle: string }> };

const MAX_DETAILS = 4000;

// PATCH /api/studio/coloris/[cle] — les détails à préserver, un par ligne.
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { cle } = await params;
  const body = (await req.json().catch(() => ({}))) as { details?: unknown };
  if (typeof body.details !== "string" || body.details.length > MAX_DETAILS) {
    return NextResponse.json({ error: "Détails invalides." }, { status: 400 });
  }
  const res = await prisma.studioColoris.updateMany({ where: { userId, cle }, data: { details: body.details } });
  if (res.count === 0) return notFound("Coloris");
  return NextResponse.json({ ok: true });
}
