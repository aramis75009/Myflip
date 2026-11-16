import "server-only";
import type { Prisma } from "@prisma/client";

import type { VersionEnBase } from "@/lib/studioVersion";

/**
 * Lecture d'une version en base, commune à la fiche (`chargerFiche`) et aux
 * routes /api/studio/versions. Séparée de `lib/studioVersionServeur.ts` pour
 * que la fiche n'embarque pas sharp (le rendu) avec elle.
 */
export const SELECT_VERSION = {
  id: true,
  numero: true,
  skuSource: true,
  titre: true,
  description: true,
  motsCles: true,
  skuAnnonce: true,
  createdAt: true,
  photos: { orderBy: { ordre: "asc" }, select: { referenceId: true } },
} satisfies Prisma.StudioVersionSelect;

type LigneVersion = Prisma.StudioVersionGetPayload<{ select: typeof SELECT_VERSION }>;

export const versionEnBase = (v: LigneVersion): VersionEnBase => ({
  id: v.id,
  numero: v.numero,
  skuSource: v.skuSource,
  titre: v.titre,
  description: v.description,
  motsCles: v.motsCles,
  skuAnnonce: v.skuAnnonce,
  createdAt: v.createdAt.toISOString(),
  photos: v.photos.map((p) => p.referenceId),
});
