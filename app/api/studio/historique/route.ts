import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { construireHistorique } from "@/lib/studioHistorique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LONGUEUR_MAX_ID = 200;
const parametre = (req: NextRequest, nom: string): string | null => {
  const v = req.nextUrl.searchParams.get(nom)?.trim() ?? "";
  return v !== "" && v.length <= LONGUEUR_MAX_ID ? v : null;
};

/**
 * GET /api/studio/historique?cle=<coloris>&referenceId=<vraie photo>&angleId=<prompt d'angle>
 * — toutes les tentatives d'UNE case (une prise × un angle) : essais ET échecs,
 * rejetés compris, y compris ceux dont l'image a été purgée (`image: null`),
 * du plus ancien au plus récent.
 *
 * Pour chaque essai : image (`/api/studio/image?essai=…`), modèle, coût
 * (`cout` : réel, sinon estimé, sinon inconnu, jamais zéro), durée, avis de
 * l'IA (`verdictIA`, une aide), décision d'Aramis (`decision`, null = à juger),
 * et ce qu'on peut encore en faire (`peutAnnuler`, `peutValider`, avec la
 * raison d'un refus). Chaque échec : code, message, coût éventuel, durée.
 *
 * Tout est scopé par compte : un coloris, une photo ou un angle d'un autre
 * compte rend 404. Un angle archivé reste lisible.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  const cle = parametre(req, "cle");
  const referenceId = parametre(req, "referenceId");
  const angleId = parametre(req, "angleId");
  if (!cle || !referenceId || !angleId) {
    return NextResponse.json({ error: "Coloris, photo et angle requis.", code: "corps_invalide" }, { status: 400 });
  }

  try {
    const [coloris, angle, reference] = await Promise.all([
      prisma.studioColoris.findUnique({ where: { userId_cle: { userId, cle } }, select: { id: true } }),
      prisma.studioAngle.findFirst({ where: { id: angleId, userId }, select: { id: true } }),
      prisma.studioReference.findFirst({ where: { id: referenceId, userId }, select: { id: true, colorisId: true } }),
    ]);
    if (!coloris) return notFound("Coloris");
    if (!angle) return notFound("Angle");
    if (!reference || reference.colorisId !== coloris.id) return notFound("Photo");

    const [essais, echecs] = await Promise.all([
      prisma.studioEssai.findMany({
        where: { colorisId: coloris.id, angleId: angle.id, referenceId: reference.id },
        select: {
          id: true,
          modele: true,
          numero: true,
          source: true,
          decision: true,
          coutEstimeUsd: true,
          coutReelUsd: true,
          dureeMs: true,
          verifIA: true,
          urlImage: true,
          lancementId: true,
          essaiParentId: true,
          skuCible: true,
          createdAt: true,
        },
      }),
      prisma.studioEchec.findMany({
        where: { userId, colorisId: coloris.id, angleId: angle.id, referenceId: reference.id },
        select: { id: true, modele: true, code: true, message: true, coutReelUsd: true, dureeMs: true, lancementId: true, createdAt: true },
      }),
    ]);

    return NextResponse.json({ cle, referenceId, angleId, tentatives: construireHistorique(essais, echecs) });
  } catch (e) {
    console.error("GET /api/studio/historique", e instanceof Error ? e.name + ": " + e.message : "erreur");
    return NextResponse.json({ error: "Historique illisible." }, { status: 500 });
  }
}
