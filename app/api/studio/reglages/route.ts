import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { lirePromptMaitreSaisi } from "@/lib/studioPrompts";
import { chargerPromptsStudio } from "@/lib/studioServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/studio/reglages — prompt maître et prompts d'angle actifs, avec leur utilisation. */
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  return NextResponse.json(await chargerPromptsStudio(userId));
}

/**
 * PUT /api/studio/reglages — le prompt maître du compte. Les essais passés
 * gardent le prompt de leur génération (`promptUtilise`) : le modifier ne
 * réécrit aucune mesure.
 */
export async function PUT(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const promptMaitre = lirePromptMaitreSaisi(await req.json().catch(() => null));
  if (typeof promptMaitre !== "string") return NextResponse.json({ error: promptMaitre.erreur }, { status: 400 });
  const r = await prisma.studioReglages.upsert({
    where: { userId },
    update: { promptMaitre },
    create: { userId, promptMaitre },
    select: { updatedAt: true },
  });
  return NextResponse.json({ ok: true, modifieLe: r.updatedAt.toISOString() });
}
