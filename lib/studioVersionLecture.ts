import "server-only";
import type { Prisma } from "@prisma/client";

import { RETOUCHE_NEUTRE, retoucheDeCopie } from "@/lib/studioRetouche";
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
  // Les réglages se lisent sur la copie : `retouche` (JSON), ou `angleCopie` pour une copie « Pivoter » d'avant la refonte.
  photos: { orderBy: { ordre: "asc" }, select: { referenceId: true, reference: { select: { copieDeId: true, retouche: true, angleCopie: true } } } },
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
  // Une photo d'origine (pas une copie) n'a aucun réglage ; une copie dont la retouche ne se relit pas : null.
  retouches: v.photos.map((p) => (p.reference.copieDeId === null ? RETOUCHE_NEUTRE : retoucheDeCopie(p.reference))),
});
