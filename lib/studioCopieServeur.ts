import "server-only";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { deposerImage, lireImage, supprimerImage } from "@/lib/studioBlob";
import type { DepsCopie } from "@/lib/studioCopie";
import { rendreCopieRetouchee } from "@/lib/studioPivotRendu";
import { cleRetouche, estPivotSeul } from "@/lib/studioRetouche";

/**
 * Efface les fichiers de `references/` que plus aucune ligne de ce compte
 * n'utilise. Deux lignes peuvent partager un fichier (même empreinte) : on ne
 * l'efface que s'il est orphelin, comme le fait déjà la route DELETE d'une
 * photo. Best-effort : un échec de stockage est journalisé (le type seulement),
 * jamais remonté — la ligne en base, elle, est déjà réglée.
 */
export async function supprimerFichiersOrphelins(userId: string, urls: readonly string[]): Promise<void> {
  for (const url of new Set(urls)) {
    try {
      if ((await prisma.studioReference.count({ where: { userId, urlImage: url } })) > 0) continue;
      await supprimerImage(url, "references", userId);
    } catch (e) {
      console.error("[studio] suppression fichier de copie :", e instanceof Error ? e.name : "erreur");
    }
  }
}

/**
 * Les dépendances réelles de `creerCopieRetouchee` :
 * Prisma scopé par `userId`, le stockage privé de `lib/studioBlob.ts`, et le
 * rendu sharp.
 */
export function depsCopie(userId: string): DepsCopie {
  return {
    lireReference: (id) =>
      prisma.studioReference.findFirst({
        where: { id, userId },
        select: { id: true, colorisId: true, sku: true, role: true, urlImage: true, copieDeId: true },
      }),

    // Par la clé de la retouche ; une copie pivotée d'avant le 17/11 n'a que son angle (lue « angle seul, zoom »).
    copieExistante: (originaleId, retouche) =>
      prisma.studioReference.findFirst({
        where: {
          userId,
          copieDeId: originaleId,
          OR: [
            { retoucheCle: cleRetouche(retouche) },
            ...(estPivotSeul(retouche) ? [{ retoucheCle: null, angleCopie: retouche.angle }] : []),
          ],
        },
        select: { id: true },
      }),

    // Même prédicat que l'import (POST /api/studio/references) : une ligne du compte dont l'URL finit par `/<empreinte>.jpg`.
    empreinteConnue: (empreinte) =>
      prisma.studioReference.findFirst({ where: { userId, urlImage: { endsWith: `/${empreinte}.jpg` } }, select: { id: true } }),

    lireOctets: async (url) => {
      const image = await lireImage(url, "references", userId);
      return image ? Buffer.from(await new Response(image.stream).arrayBuffer()) : null;
    },

    rendre: rendreCopieRetouchee,

    deposer: (jpeg, empreinte) => deposerImage("references", userId, jpeg, empreinte),

    creer: async (d) => {
      try {
        return await prisma.studioReference.create({
          data: {
            userId,
            colorisId: d.colorisId,
            sku: d.sku,
            // Faite dans le Studio, même si l'original vient de la mise en vente.
            origine: "studio",
            role: d.role,
            urlImage: d.urlImage,
            // Jamais une ligne du tableau : ni ordre ni nom de prise.
            ordre: null,
            prise: null,
            copieDeId: d.copieDeId,
            angleCopie: d.angleCopie,
            retouche: d.retouche,
            retoucheCle: d.retoucheCle,
          },
          select: { id: true },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
        throw e;
      }
    },

    retirerFichier: (url) => supprimerFichiersOrphelins(userId, [url]),
  };
}
