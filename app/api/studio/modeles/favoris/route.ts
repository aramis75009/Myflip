import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { getCatalogue } from "@/lib/studioCatalogue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LONGUEUR_MAX_ID = 200;

/** `{ modele }` du corps, ou null. */
async function lireModele(req: NextRequest): Promise<string | null> {
  const body = (await req.json().catch(() => null)) as { modele?: unknown } | null;
  const m = typeof body?.modele === "string" ? body.modele.trim() : "";
  return m !== "" && m.length <= LONGUEUR_MAX_ID ? m : null;
}

/**
 * POST /api/studio/modeles/favoris `{ modele }` — épingle un modèle. Il doit
 * figurer au catalogue (400 sinon) ; catalogue injoignable à froid ⇒ 503, pour
 * ne pas dire « inconnu » d'un modèle qu'on n'a simplement pas pu vérifier.
 * Idempotent (upsert sur l'unique userId + modele).
 */
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const modele = await lireModele(req);
  if (!modele) return NextResponse.json({ error: "Modèle requis.", code: "corps_invalide" }, { status: 400 });

  try {
    const catalogue = await getCatalogue();
    if (catalogue.etat.kind === "off") {
      return NextResponse.json({ error: "Catalogue OpenRouter injoignable : réessaie plus tard.", code: "catalogue_off" }, { status: 503 });
    }
    if (!catalogue.modeles.some((m) => m.id === modele)) {
      return NextResponse.json({ error: "Modèle absent du catalogue OpenRouter.", code: "modele_inconnu" }, { status: 400 });
    }
    await prisma.studioModeleFavori.upsert({
      where: { userId_modele: { userId, modele } },
      update: {},
      create: { userId, modele },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Deux clics sur l'étoile en même temps : l'unique refuse le second, le favori existe.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ ok: true });
    console.error("POST /api/studio/modeles/favoris", e instanceof Error ? e.name + ": " + e.message : "erreur");
    return NextResponse.json({ error: "Favori non enregistré." }, { status: 500 });
  }
}

/**
 * DELETE /api/studio/modeles/favoris `{ modele }` — retire un favori. Sans
 * contrôle du catalogue : un modèle retiré d'OpenRouter doit rester retirable.
 */
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const modele = await lireModele(req);
  if (!modele) return NextResponse.json({ error: "Modèle requis.", code: "corps_invalide" }, { status: 400 });

  try {
    await prisma.studioModeleFavori.deleteMany({ where: { userId, modele } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/studio/modeles/favoris", e instanceof Error ? e.name + ": " + e.message : "erreur");
    return NextResponse.json({ error: "Favori non retiré." }, { status: 500 });
  }
}
