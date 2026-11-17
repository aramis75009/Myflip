import { NextRequest, NextResponse } from "next/server";

import { getUserId, notFound, unauthorized } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { lireModificationVersion, MESSAGE_VERSION_UN, viseVersionUn } from "@/lib/studioVersion";
import { SELECT_VERSION, versionEnBase } from "@/lib/studioVersionLecture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/studio/versions/[id] — modifie le texte et le SKU d'une version
 * (la 2 et les suivantes), saisis à la main par Aramis ou gardés d'une
 * reformulation. Corps JSON : n'importe quel sous-ensemble de
 *   { titre, description, motsCles, skuAnnonce }
 * (au moins un). Seuls les champs PRÉSENTS sont écrits : modifier le titre ne
 * touche ni la description ni les mots-clés. Vide = pas encore renseigné.
 * Règles de chaque champ : `lireModificationVersion`. Ni les photos ni le
 * numéro ne se modifient ici.
 *
 * « Garder » d'une reformulation envoie `{ titre, motsCles }` et rien d'autre ;
 * la description (les tirets) ne change que par la main d'Aramis, jamais par
 * l'IA.
 *
 * La Version 1 n'est pas en base : c'est l'annonce actuelle du sac, lue dans
 * l'Article. Elle est refusée (400), comme toute ligne qui porterait son numéro.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const userId = await getUserId();
  if (!userId) return unauthorized();
  const { id } = await params;
  if (viseVersionUn(id)) return NextResponse.json({ error: MESSAGE_VERSION_UN, code: "version_une" }, { status: 400 });

  const corps = (await req.json().catch(() => null)) as unknown;
  const lu = lireModificationVersion(corps);
  if (!lu.ok) return NextResponse.json({ error: lu.message }, { status: 400 });

  const res = await prisma.studioVersion.updateMany({ where: { id, userId, numero: { gte: 2 } }, data: lu.donnees });
  if (res.count === 0) return notFound("Version");
  const version = await prisma.studioVersion.findFirst({ where: { id, userId }, select: SELECT_VERSION });
  if (!version) return notFound("Version");
  return NextResponse.json({ version: versionEnBase(version) });
}
