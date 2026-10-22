import { NextRequest, NextResponse } from "next/server";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { lireVignette } from "@/lib/studioColoris";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/studio/vignette?cle=<cle> — la vignette catalogue d'un coloris,
 * relayée depuis SacBase. Un repère d'affichage, jamais une référence de
 * génération. Le jeton SacBase reste côté serveur.
 */
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const cle = req.nextUrl.searchParams.get("cle")?.trim();
  if (!cle) return NextResponse.json({ error: "cle requise." }, { status: 400 });
  const img = await lireVignette(cle);
  if (!img) return notFound("Vignette");
  return new Response(img.octets, {
    headers: { "Content-Type": img.contentType, "Cache-Control": "private, max-age=86400" },
  });
}
