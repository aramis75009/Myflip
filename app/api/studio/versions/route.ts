import { NextRequest, NextResponse } from "next/server";

import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { creerVersionRetouchee, type CodeRefusLot } from "@/lib/studioVersionLot";
import { depsVersion } from "@/lib/studioVersionServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Jusqu'à 15 photos de 1600 px lues, retouchées et déposées l'une après l'autre : une à deux secondes chacune.
export const maxDuration = 60;

const STATUT: Record<CodeRefusLot, number> = {
  angle_invalide: 400,
  retouche_invalide: 400,
  retouche_vide: 400,
  photos_invalides: 400,
  sku_invalide: 400,
  autre_coloris: 400,
  est_une_copie: 400,
  introuvable: 404,
  image_introuvable: 404,
  deja_la: 409,
  rendu_impossible: 422,
};

/**
 * POST /api/studio/versions — « Enregistrer en Version N » du panneau de
 * retouche par lot. Corps JSON :
 *   { cle, skuSource, referenceIds: string[], retouche: Retouche }
 * `cle` : le coloris de la fiche ; `skuSource` : le sac affiché, dont la
 * Version 1 fournit le titre, la description et les mots-clés (copiés) ;
 * `referenceIds` : les photos cochées, dans l'ordre de la planche.
 *
 * Crée une copie retouchée de chaque photo (l'original reste intact) et UNE
 * nouvelle version avec ces copies. Toute la logique est dans
 * `lib/studioVersionLot.ts` ; cette route ne fait que l'authentification, le
 * coloris et les codes. Réponse 201 : `{ version, copiesCreees, copiesReprises }`.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  const corps = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!corps || typeof corps !== "object" || typeof corps.cle !== "string") {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }
  const coloris = await prisma.studioColoris.findUnique({ where: { userId_cle: { userId, cle: corps.cle } }, select: { id: true } });
  if (!coloris) return notFound("Coloris");

  try {
    const res = await creerVersionRetouchee(depsVersion(userId), {
      colorisId: coloris.id,
      skuSource: corps.skuSource,
      referenceIds: corps.referenceIds,
      retouche: corps.retouche,
    });
    if (!res.ok) return NextResponse.json({ error: res.message, code: res.code }, { status: STATUT[res.code] });
    return NextResponse.json(
      { version: res.version, copiesCreees: res.copiesCreees, copiesReprises: res.copiesReprises, originales: res.originales },
      { status: 201 },
    );
  } catch (err) {
    // Jamais le message : il peut citer un chemin de stockage ou une clé.
    console.error("POST /api/studio/versions", err instanceof Error ? err.name : "erreur");
    return NextResponse.json({ error: "Version impossible à enregistrer." }, { status: 500 });
  }
}
