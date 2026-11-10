import type { Prisma } from "@prisma/client";

/**
 * Quelles images générées partent dans l'annonce d'un sac ? UNE règle, lue par
 * deux endroits : GET /api/studio/annonce (la mise en vente) et l'accueil du
 * Studio (l'état « Prêt » d'un sac). Elles ne peuvent donc pas diverger.
 *
 * Un essai compte quand : il vise ce SKU (`skuCible`), Aramis l'a VALIDÉ
 * (`decision = "valide"`, jamais le verdict de l'IA), son image existe encore
 * (`urlImage` non vide : un rejet purgé garde sa ligne mais plus son image),
 * il appartient au compte, et sa vraie photo est dans le tableau (`ordre` non
 * null : une photo gardée hors tableau ne part pas dans l'annonce).
 *
 * Pur : ne fait que construire le `where`, aucun accès à la base.
 */
export function whereImagesValidees(userId: string, skuCible: string | { in: string[] }): Prisma.StudioEssaiWhereInput {
  return {
    skuCible,
    decision: "valide",
    urlImage: { not: "" },
    coloris: { userId },
    reference: { ordre: { not: null } },
  };
}
