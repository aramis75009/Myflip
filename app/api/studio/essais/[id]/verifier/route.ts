import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { detailsEnLignes } from "@/lib/studioAngles";
import { lireImageEnBase64 } from "@/lib/studioBlob";
import { referencesPourAngle } from "@/lib/studioFiche";
import { StudioVerifError, verifyGeneratedImage } from "@/lib/studioVerif";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/studio/essais/[id]/verifier — note l'essai avec le modèle de
 * vision (texte JSON, jamais de génération d'image) et range le résultat dans
 * `verifIA`. Les erreurs sortent avec leur `code` (missing_key, no_credits…)
 * pour que l'écran puisse renvoyer vers « Mon compte ».
 */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;

  const essai = await prisma.studioEssai.findFirst({
    where: { id, coloris: { userId } },
    select: {
      urlImage: true,
      angle: { select: { angle: true, roleReference: true } },
      coloris: {
        select: {
          details: true,
          references: { where: { userId }, select: { id: true, role: true, createdAt: true, urlImage: true } },
        },
      },
    },
  });
  if (!essai) return notFound("Essai");
  if (!essai.urlImage) return NextResponse.json({ error: "Image purgée.", code: "invalid_input" }, { status: 409 });

  const refs = referencesPourAngle(essai.coloris.references, essai.angle.roleReference);
  if (refs.length === 0) {
    return NextResponse.json(
      { error: "Aucune vraie photo pour ce coloris : ajoute une référence d'abord.", code: "invalid_input" },
      { status: 400 },
    );
  }

  try {
    const [generee, ...references] = await Promise.all([
      lireImageEnBase64(essai.urlImage, "generees", userId),
      ...refs.map((r) => lireImageEnBase64(r.urlImage, "references", userId)),
    ]);
    if (!generee) return NextResponse.json({ error: "Image introuvable.", code: "invalid_input" }, { status: 404 });
    const lisibles = references.filter((r): r is NonNullable<typeof r> => !!r);
    if (lisibles.length === 0) {
      return NextResponse.json({ error: "Références introuvables.", code: "invalid_input" }, { status: 404 });
    }

    const resultat = await verifyGeneratedImage(
      {
        // Le vrai type de chaque image : une image générée peut être en PNG ou en WebP,
        // et l'annoncer en JPEG fait refuser l'image par certains fournisseurs.
        references: lisibles.map(({ data, mimeType }) => ({ mimeType, data })),
        generated: { mimeType: generee.mimeType, data: generee.data },
        details: detailsEnLignes(essai.coloris.details),
        angle: essai.angle.angle,
      },
      userId,
    );
    await prisma.studioEssai.update({ where: { id }, data: { verifIA: resultat } });
    return NextResponse.json(resultat);
  } catch (err) {
    if (err instanceof StudioVerifError) {
      const status = err.code === "missing_key" || err.code === "invalid_input" ? 400 : 502;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error("POST /api/studio/essais/[id]/verifier", err instanceof Error ? err.name + ": " + err.message : "erreur");
    return NextResponse.json({ error: "Vérification impossible.", code: "provider" }, { status: 500 });
  }
}
