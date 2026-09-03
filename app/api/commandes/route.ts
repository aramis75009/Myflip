import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { creerCommande, toCommandeDTO } from "@/lib/commandes";
import type { CommandeBody } from "@/lib/commandes";
import type { CommandeDTO } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/commandes
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const commandes = await prisma.commande.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      include: { lots: { orderBy: { createdAt: "asc" } } },
    });
    const dto: CommandeDTO[] = commandes.map(toCommandeDTO);
    return NextResponse.json(dto);
  } catch (err) {
    console.error("GET /api/commandes", err);
    return NextResponse.json(
      { error: "Erreur lors du chargement des commandes." },
      { status: 500 },
    );
  }
}

// POST /api/commandes — crée la commande, ses lots et leurs articles
//
// La logique vit dans `lib/commandes.ts` : elle est partagée avec l'API Hermes
// (POST /api/hermes/commandes), qui doit produire exactement les mêmes SKU et
// la même répartition du port que le formulaire.
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const body = (await req.json()) as CommandeBody;
    const res = await creerCommande(userId, body);

    if (!res.ok)
      return NextResponse.json({ error: res.error }, { status: res.status });

    // Les SKU générés ne sont pas renvoyés ici : l'UI recharge le stock et n'en
    // a pas l'usage. Hermes, lui, en a besoin — cf. sa route dédiée.
    return NextResponse.json(res.commande, { status: 201 });
  } catch (err) {
    console.error("POST /api/commandes", err);
    return NextResponse.json(
      { error: "Erreur lors de la création de la commande." },
      { status: 500 },
    );
  }
}
