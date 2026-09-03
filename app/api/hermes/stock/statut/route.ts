// POST /api/hermes/stock/statut — change le statut d'articles de stock.
//
// Équivalent de la barre d'action groupée du Stock (« N sélectionnés | Statut |
// Appliquer »), et strictement rien de plus : même fonction métier
// (`changerStatutArticles`), donc mêmes statuts autorisés et même règle de
// remise à null des champs de vente. Hermes désigne les articles par SKU ou par
// commande, parce qu'il ne voit jamais les identifiants internes.
//
// POST et non PATCH : ce n'est pas la modification d'une ressource « statut »
// mais l'exécution d'une action sur un ensemble. Les routes /api/hermes ne
// suivent pas le découpage REST des routes de l'UI, elles suivent les actions
// qu'un agent a le droit de déclencher.

import { NextRequest, NextResponse } from "next/server";
import { authentifierHermes } from "@/lib/hermesAuth";
import { changerStatutArticles } from "@/lib/stock";
import { erreurHermes } from "@/lib/hermesApi";
import { STATUTS, STATUT_VENDU } from "@/lib/calc";

export const dynamic = "force-dynamic";

type Body = {
  skus?: string[];
  commandeId?: string;
  statut?: string;
};

export async function POST(req: NextRequest) {
  const auth = await authentifierHermes(req);
  if (!auth.ok) return auth.response;

  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return erreurHermes("Corps de requête JSON invalide.");
    }
    if (!body || typeof body !== "object")
      return erreurHermes("Corps de requête JSON invalide.");

    // Mis en majuscules : le format des SKU l'est (`^[A-Z]{2,5}\d+$`, cf.
    // lib/calc.ts) et aucun article en base n'y déroge — vérifié le 03/09/2026.
    // Un « sdn1 » recopié à la main doit trouver SDN1, pas échouer en silence.
    const demandes = Array.isArray(body.skus)
      ? body.skus.map((s) => String(s).trim().toUpperCase()).filter(Boolean)
      : [];
    const commandeId = body.commandeId?.trim() || undefined;

    if (demandes.length === 0 && !commandeId)
      return erreurHermes("Fournir « skus » (tableau) ou « commandeId ».");

    const res = await changerStatutArticles(
      auth.userId,
      { skus: demandes, commandeId },
      body.statut ?? "",
    );

    if (!res.ok)
      // La liste des statutsValides accompagne le refus : un agent qui se
      // trompe de libellé doit pouvoir se corriger sans lire le code.
      return erreurHermes(res.error, res.status, {
        statutsValides: STATUTS.filter((s) => s !== STATUT_VENDU),
      });

    // Les SKU demandés sont rendus tels quels quand ils n'existent pas : sans
    // cela, une faute de frappe passerait pour un succès partiel silencieux.
    const trouves = new Set(res.skus);
    const introuvables = demandes.filter((s) => !trouves.has(s));

    if (res.count === 0)
      return erreurHermes("Aucun article correspondant.", 404, {
        skusIntrouvables: introuvables,
      });

    return NextResponse.json({
      count: res.count,
      statut: res.statut,
      skus: res.skus,
      skusIntrouvables: introuvables,
    });
  } catch (err) {
    console.error("POST /api/hermes/stock/statut", err);
    return erreurHermes("Erreur lors de la mise à jour des statuts.", 500);
  }
}
