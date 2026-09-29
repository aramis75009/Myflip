import { prixUnitaire } from "./calc";
import type { ArticleDTO } from "./types";
import type { Prisma } from "@prisma/client";

// Projection Prisma : uniquement les colonnes réellement lues par toDTO.
// Évite de rapatrier Article.createdAt (inutile) et surtout les 7 colonnes
// de Commande non utilisées (date, fournisseur, marque, categorie, grade,
// id, createdAt) ramenées par un include complet.
export const articleSelect = {
  id: true,
  sku: true,
  marque: true,
  categorie: true,
  lot: true,
  grade: true,
  statut: true,
  prixAchat: true,
  prixVente: true,
  margeBrute: true,
  margeNette: true,
  coefficient: true,
  canal: true,
  dateVente: true,
  dateMiseEnVente: true,
  transporteur: true,
  trelloCardId: true,
  commandeId: true,
  titreAnnonce: true,
  descriptionAnnonce: true,
  motsClesAnnonce: true,
  compteVente: true,
  commande: {
    select: { coutTotal: true, nbArticles: true, coefObjectif: true, fournisseur: true },
  },
} satisfies Prisma.ArticleSelect;

// Type de l'entité projetée. Une entité issue d'un `include: { commande: true }`
// complet reste assignable à ce type (sur-ensemble) → les routes [id] et
// comptabiliser qui passent un article complet à toDTO continuent de compiler.
export type ArticleForDTO = Prisma.ArticleGetPayload<{
  select: typeof articleSelect;
}>;

/** Convertit un article Prisma (+ sa commande) en DTO renvoyé par l'API. */
export function toDTO(a: ArticleForDTO): ArticleDTO {
  return {
    id: a.id,
    sku: a.sku,
    marque: a.marque,
    categorie: a.categorie,
    lot: a.lot,
    grade: a.grade,
    statut: a.statut,
    prixAchat: a.prixAchat,
    prixVente: a.prixVente,
    margeBrute: a.margeBrute,
    margeNette: a.margeNette,
    coefficient: a.coefficient,
    canal: a.canal,
    dateVente: a.dateVente ? a.dateVente.toISOString() : null,
    dateMiseEnVente: a.dateMiseEnVente ? a.dateMiseEnVente.toISOString() : null,
    transporteur: a.transporteur,
    trelloCardId: a.trelloCardId,
    commandeId: a.commandeId,
    prixUnitaire: a.commande
      ? prixUnitaire(a.commande.coutTotal, a.commande.nbArticles)
      : null,
    coefObjectif: a.commande ? a.commande.coefObjectif : null,
    commandeFournisseur: a.commande?.fournisseur ?? null,
    titreAnnonce: a.titreAnnonce,
    descriptionAnnonce: a.descriptionAnnonce,
    motsClesAnnonce: a.motsClesAnnonce,
    compteVente: a.compteVente,
  };
}
