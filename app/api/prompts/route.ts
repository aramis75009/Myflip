import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { ensureDefaultPrompt, toPromptDTO } from "@/lib/promptsServer";
import { prixReferenceDepuisSaisie } from "@/lib/promptSelect";

export const dynamic = "force-dynamic";

type Body = {
  nom?: string;
  marque?: string | null;
  categorie?: string | null;
  contenu?: string;
  estDefaut?: boolean;
  prixReference?: number | string | null;
};

// Normalise un critère : "" ou "Toutes" → null (s'applique à tout).
function critere(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "toutes") return null;
  return t;
}

// GET /api/prompts — liste (crée un prompt par défaut si aucun n'existe)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    await ensureDefaultPrompt(userId);
    const prompts = await prisma.promptTemplate.findMany({
      where: { userId },
      orderBy: [{ estDefaut: "desc" }, { nom: "asc" }],
    });
    return NextResponse.json(prompts.map(toPromptDTO));
  } catch (err) {
    console.error("GET /api/prompts", err);
    return NextResponse.json(
      { error: "Erreur lors du chargement des prompts." },
      { status: 500 },
    );
  }
}

// POST /api/prompts — création
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const body = (await req.json()) as Body;
    const nom = body.nom?.trim();
    const contenu = body.contenu?.trim();
    if (!nom) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
    if (!contenu)
      return NextResponse.json({ error: "Contenu requis." }, { status: 400 });

    const estDefaut = Boolean(body.estDefaut);

    // Facultatif : un prompt sans prix est le cas ordinaire. Une saisie
    // invalide, elle, doit être refusée plutôt que silencieusement remise à
    // null — le prix serait perdu sans que personne ne le voie.
    const prix = prixReferenceDepuisSaisie(body.prixReference);
    if (!prix.ok) {
      return NextResponse.json(
        { error: "Prix de référence invalide : un nombre supérieur à 0, ou vide." },
        { status: 400 },
      );
    }

    const data = {
      nom,
      contenu,
      marque: critere(body.marque),
      categorie: critere(body.categorie),
      estDefaut,
      prixReference: prix.prix,
      userId,
    };

    const created = await prisma.$transaction(async (tx) => {
      // Un seul prompt par défaut à la fois — par utilisateur. Sans le userId,
      // définir son défaut retirerait celui de tous les autres comptes.
      if (estDefaut) {
        await tx.promptTemplate.updateMany({
          where: { userId, estDefaut: true },
          data: { estDefaut: false },
        });
      }
      return tx.promptTemplate.create({ data });
    });

    return NextResponse.json(toPromptDTO(created), { status: 201 });
  } catch (err) {
    console.error("POST /api/prompts", err);
    return NextResponse.json(
      { error: "Erreur lors de la création du prompt." },
      { status: 500 },
    );
  }
}
