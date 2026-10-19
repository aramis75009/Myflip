import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { lireImage } from "@/lib/studioBlob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/image?ref=<id> | ?essai=<id> — sert une image du store privé.
 *
 * L'URL du blob n'est jamais acceptée en paramètre : on relit la ligne en base,
 * scopée par userId, et `lireImage` revérifie le préfixe. Une référence ne se
 * lit que sous `references/`, un essai que sous `generees/`.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const ref = req.nextUrl.searchParams.get("ref");
  const essai = req.nextUrl.searchParams.get("essai");

  try {
    let img: Awaited<ReturnType<typeof lireImage>> = null;
    if (ref) {
      const row = await prisma.studioReference.findFirst({ where: { id: ref, userId }, select: { urlImage: true } });
      if (row) img = await lireImage(row.urlImage, "references", userId);
    } else if (essai) {
      const row = await prisma.studioEssai.findFirst({
        where: { id: essai, coloris: { userId } },
        select: { urlImage: true },
      });
      if (row?.urlImage) img = await lireImage(row.urlImage, "generees", userId); // "" = purgé
    } else {
      return NextResponse.json({ error: "ref ou essai requis." }, { status: 400 });
    }
    if (!img) return notFound("Image");
    return new Response(img.stream, {
      headers: {
        "Content-Type": img.contentType,
        // Le contenu d'un id ne change jamais ; privé : aucun cache partagé.
        "Cache-Control": "private, max-age=3600, immutable",
      },
    });
  } catch (err) {
    console.error("GET /api/studio/image", err instanceof Error ? err.name : "erreur");
    return NextResponse.json({ error: "Image illisible." }, { status: 500 });
  }
}
