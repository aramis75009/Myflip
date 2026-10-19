import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { compilerPrompt } from "@/lib/studioAngles";
import { deposerImage, erreurFichier } from "@/lib/studioBlob";
import { MODELE_MANUEL, numeroSuivant } from "@/lib/studioFiche";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/studio/essais — dépose une image faite ailleurs (application Gemini…).
 * Numérotée avec les autres dépôts manuels, à part des générations par API.
 * Multipart : `cle`, `angleId`, `image` (JPEG compressé côté client).
 *
 * L'image va sous `generees/<userId>/` et dans `StudioEssai`, nulle part
 * ailleurs (spec §7). Le prompt rangé est recompilé ici, avec l'angle et les
 * détails tels qu'ils sont au moment du dépôt : c'est ce qui sera mesuré.
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Corps illisible." }, { status: 400 });
  }
  const cle = String(form.get("cle") ?? "").trim();
  const angleId = String(form.get("angleId") ?? "").trim();
  const image = form.get("image");
  if (!cle || !angleId || !image || typeof image === "string") {
    return NextResponse.json({ error: "Coloris, angle et image requis." }, { status: 400 });
  }
  const err = erreurFichier(image);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    const [coloris, angle] = await Promise.all([
      prisma.studioColoris.findUnique({ where: { userId_cle: { userId, cle } } }),
      prisma.studioAngle.findFirst({ where: { id: angleId, userId } }),
    ]);
    if (!coloris) return notFound("Coloris");
    if (!angle) return notFound("Angle");

    const url = await deposerImage("generees", userId, image);
    const promptUtilise = compilerPrompt({ angle: angle.angle, details: coloris.details });

    // Deux dépôts simultanés peuvent viser le même numéro : l'unique
    // (colorisId, angleId, modele, numero) en refuse un, on retente une fois.
    for (let tentative = 0; ; tentative++) {
      const existants = await prisma.studioEssai.findMany({
        where: { colorisId: coloris.id, angleId: angle.id, modele: MODELE_MANUEL },
        select: { numero: true, modele: true },
      });
      try {
        const essai = await prisma.studioEssai.create({
          data: {
            colorisId: coloris.id,
            angleId: angle.id,
            numero: numeroSuivant(existants, MODELE_MANUEL),
            modele: MODELE_MANUEL,
            source: "manuel",
            promptUtilise,
            urlImage: url,
          },
          select: { id: true, numero: true },
        });
        return NextResponse.json(essai);
      } catch (e) {
        if (tentative === 0 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
        throw e;
      }
    }
  } catch (e) {
    console.error("POST /api/studio/essais", e instanceof Error ? e.name + ": " + e.message : "erreur");
    return NextResponse.json({ error: "Dépôt impossible." }, { status: 500 });
  }
}
