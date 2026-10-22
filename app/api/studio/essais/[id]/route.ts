import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { supprimerImage } from "@/lib/studioBlob";
import { verifierChangementDecision } from "@/lib/studioDecision";
import { estDecision, type Decision } from "@/lib/studioFiche";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/studio/essais/[id] `{ decision }` — la décision d'Aramis : "valide",
 * "rejete", ou null pour l'ANNULER (l'essai repasse « à juger »). C'est elle, pas
 * le verdict IA, qui alimente le bilan (spec §6).
 *
 * Les règles de `lib/studioDecision.ts` protègent la case (une image vivante à
 * la fois) ; un refus est un 409 avec `code`, `error` (le POURQUOI, en français)
 * et `autresEssaiIds` (les essais de la case en cause) :
 *  - `image_purgee`  : un rejet dont l'image a été effacée du Blob ne se rattrape
 *    plus (ni remise à juger, ni validation) ;
 *  - `case_reprise`  : un essai rejeté ne redevient pas « à juger » ou validé si
 *    une autre image non rejetée tient déjà la case (rejeter celle-là d'abord) ;
 *  - `deja_validee`  : une case ne porte qu'une image validée (annuler l'autre d'abord) ;
 *  - `conflit`       : l'essai a changé entre la lecture et l'écriture, recharger.
 * Redemander la décision déjà en place répond 200 avec `inchange: true`.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { decision?: unknown };
  if (body.decision !== null && !estDecision(body.decision)) {
    return NextResponse.json({ error: "Décision inconnue." }, { status: 400 });
  }
  const nouvelle: Decision | null = body.decision;

  const essai = await prisma.studioEssai.findFirst({
    where: { id, coloris: { userId } },
    select: { id: true, decision: true, urlImage: true, colorisId: true, angleId: true, referenceId: true },
  });
  if (!essai) return notFound("Essai");

  // Les autres essais de la MÊME case. Un essai du banc de test (sans photo de ligne) n'a pas de case.
  const autres = essai.referenceId
    ? await prisma.studioEssai.findMany({
        where: { colorisId: essai.colorisId, angleId: essai.angleId, referenceId: essai.referenceId, id: { not: essai.id } },
        select: { id: true, decision: true },
      })
    : [];

  const verdict = verifierChangementDecision({ id: essai.id, decision: essai.decision, purge: essai.urlImage === "" }, nouvelle, autres);
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.message, code: verdict.code, autresEssaiIds: verdict.autresEssaiIds }, { status: verdict.status });
  }
  if (verdict.inchange) return NextResponse.json({ ok: true, decision: nouvelle, inchange: true });

  // La décision lue sert de garde : si l'essai a bougé entre-temps, on n'écrase rien.
  const res = await prisma.studioEssai.updateMany({
    where: { id, coloris: { userId }, decision: essai.decision },
    data: { decision: nouvelle },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Cet essai vient de changer : recharge la fiche.", code: "conflit" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, decision: nouvelle, inchange: false });
}

/**
 * DELETE /api/studio/essais/[id] — purge manuelle d'un essai REJETÉ (spec §8).
 *
 * Ne purge que l'IMAGE. La ligne reste, `urlImage` vidé : un rejet est une
 * mesure, l'effacer gonflerait le taux de réussite du bilan. Un essai validé
 * ou non décidé garde son image.
 */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  const essai = await prisma.studioEssai.findFirst({
    where: { id, coloris: { userId } },
    select: { urlImage: true, decision: true },
  });
  if (!essai) return notFound("Essai");
  if (!essai.urlImage) return NextResponse.json({ ok: true });
  if (essai.decision !== "rejete") {
    return NextResponse.json({ error: "Seul un essai rejeté peut être purgé." }, { status: 409 });
  }
  await prisma.studioEssai.update({ where: { id }, data: { urlImage: "" } });
  await supprimerImage(essai.urlImage, "generees", userId).catch((e) =>
    console.error("[studio] suppression blob essai :", e instanceof Error ? e.name : "erreur"),
  );
  return NextResponse.json({ ok: true });
}
