import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound } from "@/lib/apiAuth";
import { deriveVente, STATUT_VENDU } from "@/lib/calc";
import { toDTO } from "@/lib/serialize";
import { addLabelToCard, removeComptabiliserLabel } from "@/lib/trello";
import { contexteTrello } from "@/lib/settings";
import { compteAComptabiliser } from "@/lib/comptesVente";

export const dynamic = "force-dynamic";

type Body = { prixVente?: number; dateVente?: string; canal?: string; compteVente?: string };

// POST /api/articles/[id]/comptabiliser
// 1. Marque l'article comme vendu (prixVente, dateVente, marges, coef, canal)
// 2. Retire l'étiquette « À comptabiliser » de la carte Trello
//    (la carte reste visible dans Trello — pas d'archivage).
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const body = (await req.json()) as Body;
    const prixVente = Number(body.prixVente);
    if (!Number.isFinite(prixVente) || prixVente <= 0) {
      return NextResponse.json(
        { error: "Prix de vente invalide." },
        { status: 400 },
      );
    }
    const dateVente = body.dateVente ? new Date(body.dateVente) : new Date();
    const canal = body.canal ? String(body.canal).trim() : undefined;

    const existing = await prisma.article.findFirst({
      where: { id: params.id, userId },
    });
    if (!existing) return notFound("Article");

    const d = deriveVente({
      statut: STATUT_VENDU,
      prixAchat: existing.prixAchat,
      prixVente,
      dateVente,
    });

    const updated = await prisma.article.update({
      where: { id: params.id },
      data: {
        statut: STATUT_VENDU,
        prixVente: d.prixVente,
        dateVente: d.dateVente,
        margeBrute: d.margeBrute,
        margeNette: d.margeNette,
        coefficient: d.coefficient,
        ...(canal ? { canal } : {}),
        // Un compte inconnu (ou absent) n'est pas une erreur : on garde celui
        // déjà choisi sur l'article, VINTED_PRO seulement s'il n'y en a aucun.
        compteVente: compteAComptabiliser(body.compteVente, existing.compteVente),
      },
      include: { commande: true },
    });

    // --- Trello (best-effort : ne bloque jamais la validation comptable) ---
    // On retire « À comptabiliser » et on pose « Comptabilisé ».
    // La carte n'est PAS archivée : elle reste visible avec ses autres étiquettes.
    let trello: string | null = null;
    // Les identifiants Trello viennent des réglages de CET utilisateur, avec
    // repli sur ceux du déploiement. Sans contexte, on ne synchronise rien.
    const ctx = existing.trelloCardId ? await contexteTrello(userId) : null;
    if (existing.trelloCardId && ctx) {
      if (ctx.labelId) {
        try {
          await removeComptabiliserLabel(ctx, existing.trelloCardId);
          trello = "Étiquette retirée.";
        } catch (e) {
          console.error("[trello] retrait « À comptabiliser »", e);
          trello = "Article validé, mais la synchro Trello a échoué.";
        }
      }

      // Pose de l'étiquette verte, indépendante du retrait : si le retrait a
      // échoué, on tente quand même l'ajout (et inversement).
      if (ctx.comptabiliseLabelId) {
        try {
          await addLabelToCard(
            ctx,
            existing.trelloCardId,
            ctx.comptabiliseLabelId,
          );
          if (trello === "Étiquette retirée.") {
            trello = "Étiquettes Trello mises à jour.";
          }
        } catch (e) {
          console.error("[trello] ajout « Comptabilisé »", e);
          trello = "Article validé, mais la synchro Trello a échoué.";
        }
      } else {
        console.warn(
          "[trello] étiquette « Comptabilisé » non configurée : non posée.",
        );
      }
    }

    return NextResponse.json({ article: toDTO(updated), trello });
  } catch (err) {
    console.error("POST /api/articles/[id]/comptabiliser", err);
    return NextResponse.json(
      { error: "Erreur lors de la validation." },
      { status: 500 },
    );
  }
}
