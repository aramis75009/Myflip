import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { toPrixDTO } from "@/lib/prixServer";

export const dynamic = "force-dynamic";

type Body = {
  marque?: string | null;
  categorie?: string | null;
  prix?: number;
  estDefaut?: boolean;
};

// Normalise un critère : "" ou "Toutes" → null (s'applique à tout).
function critere(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "toutes") return null;
  return t;
}

// GET /api/prix — liste
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const prix = await prisma.prixReference.findMany({
      where: { userId },
      orderBy: [{ estDefaut: "desc" }, { marque: "asc" }],
    });
    return NextResponse.json(prix.map(toPrixDTO));
  } catch (err) {
    console.error("GET /api/prix", err);
    return NextResponse.json(
      { error: "Erreur lors du chargement des prix de référence." },
      { status: 500 },
    );
  }
}

// POST /api/prix — création
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const body = (await req.json()) as Body;
    const prix = Number(body.prix);
    if (!Number.isFinite(prix) || prix <= 0) {
      return NextResponse.json({ error: "Prix invalide." }, { status: 400 });
    }

    const estDefaut = Boolean(body.estDefaut);
    const data = {
      prix,
      marque: critere(body.marque),
      categorie: critere(body.categorie),
      estDefaut,
      userId,
    };

    const created = await prisma.$transaction(async (tx) => {
      // Un seul prix par défaut à la fois — par utilisateur.
      if (estDefaut) {
        await tx.prixReference.updateMany({
          where: { userId, estDefaut: true },
          data: { estDefaut: false },
        });
      }
      return tx.prixReference.create({ data });
    });

    return NextResponse.json(toPrixDTO(created), { status: 201 });
  } catch (err) {
    console.error("POST /api/prix", err);
    return NextResponse.json(
      { error: "Erreur lors de la création du prix de référence." },
      { status: 500 },
    );
  }
}
