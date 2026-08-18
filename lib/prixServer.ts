import type { PrixReference } from "@prisma/client";
import type { PrixReferenceDTO } from "./types";

export function toPrixDTO(p: PrixReference): PrixReferenceDTO {
  return {
    id: p.id,
    marque: p.marque,
    categorie: p.categorie,
    prix: p.prix,
    estDefaut: p.estDefaut,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
