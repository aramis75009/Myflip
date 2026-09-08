import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound } from "@/lib/apiAuth";
import { toPromptDTO } from "@/lib/promptsServer";
import { prixReferenceDepuisSaisie } from "@/lib/promptSelect";

type Body = {
  nom?: string;
  marque?: string | null;
  categorie?: string | null;
  contenu?: string;
  estDefaut?: boolean;
  prixReference?: number | string | null;
};

function critere(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "toutes") return null;
  return t;
}

// PATCH /api/prompts/[id] — édition
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const owned = await prisma.promptTemplate.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!owned) return notFound("Prompt");

    const body = (await req.json()) as Body;
    const data: Record<string, unknown> = {};
    if (body.nom !== undefined) {
      const nom = body.nom.trim();
      if (!nom) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
      data.nom = nom;
    }
    if (body.contenu !== undefined) {
      const contenu = body.contenu.trim();
      if (!contenu)
        return NextResponse.json({ error: "Contenu requis." }, { status: 400 });
      data.contenu = contenu;
    }
    if (body.marque !== undefined) data.marque = critere(body.marque);
    if (body.categorie !== undefined) data.categorie = critere(body.categorie);
    if (body.estDefaut !== undefined) data.estDefaut = Boolean(body.estDefaut);
    if (body.prixReference !== undefined) {
      const prix = prixReferenceDepuisSaisie(body.prixReference);
      if (!prix.ok) {
        return NextResponse.json(
          { error: "Prix de référence invalide : un nombre supérieur à 0, ou vide." },
          { status: 400 },
        );
      }
      data.prixReference = prix.prix;
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Le défaut est un singleton par compte : ne démarquer que les prompts
      // de CET utilisateur, sinon on retire le défaut de tous les autres.
      if (data.estDefaut === true) {
        await tx.promptTemplate.updateMany({
          where: { userId, estDefaut: true, id: { not: params.id } },
          data: { estDefaut: false },
        });
      }
      return tx.promptTemplate.update({ where: { id: params.id }, data });
    });

    return NextResponse.json(toPromptDTO(updated));
  } catch (err) {
    console.error("PATCH /api/prompts/[id]", err);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du prompt." },
      { status: 500 },
    );
  }
}

// DELETE /api/prompts/[id]
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const res = await prisma.promptTemplate.deleteMany({
      where: { id: params.id, userId },
    });
    if (res.count === 0) return notFound("Prompt");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/prompts/[id]", err);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du prompt." },
      { status: 500 },
    );
  }
}
