import "server-only";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { depsCopie, supprimerFichiersOrphelins } from "@/lib/studioCopieServeur";
import type { DepsVersion } from "@/lib/studioVersionLot";
import { prochainNumero } from "@/lib/studioVersion";
import { SELECT_VERSION, versionEnBase } from "@/lib/studioVersionLecture";

/**
 * Les dépendances réelles de `creerVersionRetouchee` : Prisma scopé par
 * `userId`, le stockage et sharp (par `depsCopie`).
 *
 * ⚠️ Cloisonnement : l'`Article` n'est que LU (titre, description à tirets,
 * mots-clés de l'annonce actuelle), pour être recopié dans la version. Rien
 * n'y est jamais écrit (`lib/studioCloisonnement.test.ts`).
 */

/** Deux enregistrements simultanés visent le même numéro : on retente au suivant. */
const ESSAIS_NUMERO = 3;

export function depsVersion(userId: string): DepsVersion {
  return {
    copie: depsCopie(userId),

    lirePhoto: (id) => prisma.studioReference.findFirst({ where: { id, userId }, select: { id: true, colorisId: true, copieDeId: true } }),

    texteVersionUn: async (sku) => {
      const a = await prisma.article.findFirst({
        where: { userId, sku },
        select: { titreAnnonce: true, descriptionAnnonce: true, motsClesAnnonce: true },
      });
      return { titre: a?.titreAnnonce ?? "", description: a?.descriptionAnnonce ?? "", motsCles: a?.motsClesAnnonce ?? "" };
    },

    creerVersion: async (d) => {
      for (let essai = 1; ; essai++) {
        try {
          const v = await prisma.$transaction(async (tx) => {
            const existantes = await tx.studioVersion.findMany({ where: { colorisId: d.colorisId }, select: { numero: true } });
            return tx.studioVersion.create({
              data: {
                userId,
                colorisId: d.colorisId,
                numero: prochainNumero(existantes.map((e) => e.numero)),
                skuSource: d.skuSource,
                titre: d.titre,
                description: d.description,
                motsCles: d.motsCles,
                photos: { create: d.photos.map((referenceId, i) => ({ referenceId, ordre: i + 1 })) },
              },
              select: SELECT_VERSION,
            });
          });
          return versionEnBase(v);
        } catch (e) {
          if (essai < ESSAIS_NUMERO && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
          throw e;
        }
      }
    },

    retirerCopies: async (ids) => {
      // Seulement des copies du compte qu'aucune version ne montre : jamais une vraie photo.
      const copies = await prisma.studioReference.findMany({
        where: { userId, id: { in: ids }, copieDeId: { not: null }, versionPhotos: { none: {} } },
        select: { id: true, urlImage: true },
      });
      if (copies.length === 0) return;
      await prisma.studioReference.deleteMany({ where: { userId, id: { in: copies.map((c) => c.id) } } });
      await supprimerFichiersOrphelins(
        userId,
        copies.map((c) => c.urlImage),
      );
    },
  };
}
