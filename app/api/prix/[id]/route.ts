import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound } from "@/lib/apiAuth";
import { toPrixDTO } from "@/lib/prixServer";

type Body = {
  marque?: string | null;
  categorie?: string | null;
  prix?: number;
  estDefaut?: boolean;
};

function critere(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "toutes") return null;
  return t;
}

// PATCH /api/prix/[id] — édition
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const owned = await prisma.prixReference.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!owned) return notFound("Prix de référence");

    const body = (await req.json()) as Body;
    const data: Record<string, unknown> = {};
    if (body.prix !== undefined) {
      const prix = Number(body.prix);
      if (!Number.isFinite(prix) || prix <= 0) {
        return NextResponse.json({ error: "Prix invalide." }, { status: 400 });
      }
      data.prix = prix;
    }
    if (body.marque !== undefined) data.marque = critere(body.marque);
    if (body.categorie !== undefined) data.categorie = critere(body.categorie);
    if (body.estDefaut !== undefined) data.estDefaut = Boolean(body.estDefaut);

    const updated = await prisma.$transaction(async (tx) => {
      if (data.estDefaut === true) {
        await tx.prixReference.updateMany({
          where: { userId, estDefaut: true, id: { not: params.id } },
          data: { estDefaut: false },
        });
      }
      return tx.prixReference.update({ where: { id: params.id }, data });
    });

    return NextResponse.json(toPrixDTO(updated));
  } catch (err) {
    console.error("PATCH /api/prix/[id]", err);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour." },
      { status: 500 },
    );
  }
}

// DELETE /api/prix/[id]
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const res = await prisma.prixReference.deleteMany({
      where: { id: params.id, userId },
    });
    if (res.count === 0) return notFound("Prix de référence");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/prix/[id]", err);
    return NextResponse.json(
      { error: "Erreur lors de la suppression." },
      { status: 500 },
    );
  }
}
