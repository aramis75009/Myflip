import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { deposerImage, erreurFichier } from "@/lib/studioBlob";
import { etatCase, promptVariante } from "@/lib/studioCases";
import { MODELE_MANUEL, numeroSuivant } from "@/lib/studioFiche";
import { lirePromptMaitre, statutsDesSkus } from "@/lib/studioServeur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/studio/essais — dépose une image faite ailleurs (application Gemini)
 * dans une case du tableau. Multipart : `cle`, `referenceId` (la vraie photo de
 * la ligne), `angleId` (le prompt d'angle), `skuCible` (facultatif), `image`
 * (JPEG compressé côté client).
 *
 * L'image va sous `generees/<userId>/` et dans `StudioEssai`, nulle part
 * ailleurs : elle ne rejoindra l'annonce de `skuCible` qu'une fois validée.
 * Le prompt rangé est celui envoyé dans Gemini : prompt maître + prompt
 * d'angle, tels qu'ils sont au moment du dépôt.
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
  const referenceId = String(form.get("referenceId") ?? "").trim();
  const skuCible = String(form.get("skuCible") ?? "").trim().toUpperCase() || null;
  const image = form.get("image");
  if (!cle || !angleId || !referenceId || !image || typeof image === "string") {
    return NextResponse.json({ error: "Coloris, photo, angle et image requis." }, { status: 400 });
  }
  const err = erreurFichier(image);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    const [coloris, angle, reference, maitre] = await Promise.all([
      prisma.studioColoris.findUnique({ where: { userId_cle: { userId, cle } } }),
      prisma.studioAngle.findFirst({ where: { id: angleId, userId, archiveLe: null } }),
      prisma.studioReference.findFirst({ where: { id: referenceId, userId, ordre: { not: null } }, select: { id: true, colorisId: true } }),
      lirePromptMaitre(userId),
    ]);
    if (!coloris) return notFound("Coloris");
    if (!angle) return notFound("Angle");
    if (!reference || reference.colorisId !== coloris.id) return notFound("Photo");

    // Même verrou que la génération par API : une case prise ne reçoit plus d'image.
    const essaisCase = await prisma.studioEssai.findMany({
      where: { colorisId: coloris.id, angleId: angle.id, referenceId: reference.id },
      select: { referenceId: true, angleId: true, decision: true, skuCible: true },
    });
    const statuts = await statutsDesSkus(userId, essaisCase.flatMap((e) => (e.skuCible ? [e.skuCible] : [])));
    if (etatCase(essaisCase, (sku) => statuts.get(sku) ?? null).kind !== "libre") {
      return NextResponse.json({ error: "Cette case a déjà servi pour ce coloris.", code: "case_prise" }, { status: 409 });
    }

    const url = await deposerImage("generees", userId, image);
    const promptUtilise = promptVariante(maitre.texte, angle.angle);

    // Deux dépôts simultanés peuvent viser le même numéro : l'unique (coloris,
    // angle, modèle, numéro) en refuse un, on recalcule et on retente une fois.
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
            referenceId: reference.id,
            skuCible,
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
