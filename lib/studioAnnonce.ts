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

/** Une version enregistrée (2, 3…) telle que la Mise en vente la reçoit de GET /api/studio/annonce. */
export type VersionPourVente = {
  numero: number;
  titre: string;
  /** Les tirets. */
  description: string;
  motsCles: string;
  /** SKU de l'annonce saisi par Aramis ; null = pas renseigné. */
  skuAnnonce: string | null;
  /** Les photos, dans l'ordre de la version : une ligne StudioReference chacune (servie par /api/studio/image?ref=). */
  photos: { id: string; ordre: number }[];
};

type LigneVersionPourVente = {
  numero: number;
  titre: string;
  description: string;
  motsCles: string;
  skuAnnonce: string | null;
  photos: readonly { referenceId: string }[];
};

/**
 * Les versions d'un sac pour la Mise en vente : seulement la 2 et les suivantes
 * (la 1 est l'annonce actuelle, lue dans l'Article par la Mise en vente elle-même),
 * dans l'ordre des numéros, photos numérotées dans l'ordre de la version.
 * Pur : ne fait que mettre en forme des lignes déjà lues.
 */
export function versionsPourVente(lignes: readonly LigneVersionPourVente[]): VersionPourVente[] {
  return lignes
    .filter((v) => v.numero >= 2)
    .sort((a, b) => a.numero - b.numero)
    .map((v) => ({
      numero: v.numero,
      titre: v.titre,
      description: v.description,
      motsCles: v.motsCles,
      skuAnnonce: v.skuAnnonce,
      photos: v.photos.map((p, i) => ({ id: p.referenceId, ordre: i + 1 })),
    }));
}
