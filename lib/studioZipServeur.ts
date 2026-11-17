import "server-only";

import { prisma } from "@/lib/prisma";
import { extensionDepuisMime, lireImage, mimeDepuisContentType } from "@/lib/studioBlob";
import { chargerVersionsUn } from "@/lib/studioServeur";
import type { PhotoVersion } from "@/lib/studioVersion";
import type { DepsZip, OctetsPhoto } from "@/lib/studioZip";

/**
 * Les dépendances réelles de `assemblerZip` : Prisma et le stockage, TOUJOURS
 * scopés par `userId`. Rien ne s'écrit.
 *
 * Cloisonnement : la route n'accepte aucun identifiant de photo du navigateur.
 * Elle reçoit le coloris, le numéro de version (et le SKU du sac pour la
 * Version 1) ; les photos sont relues ici, en base, pour CE compte. Un coloris,
 * une version ou une photo d'un autre compte n'existe pas : 404, jamais 403
 * (`lib/studioCloisonnement.test.ts` garde les imports et les écritures du Studio).
 */
export function depsZip(userId: string): DepsZip {
  return {
    lireVersion: async ({ cle, numero, sku }) => {
      const coloris = await prisma.studioColoris.findUnique({ where: { userId_cle: { userId, cle } }, select: { id: true } });
      if (!coloris) return null;

      if (numero >= 2) {
        const v = await prisma.studioVersion.findFirst({
          where: { userId, colorisId: coloris.id, numero },
          select: { numero: true, skuAnnonce: true, skuSource: true, photos: { orderBy: { ordre: "asc" }, select: { referenceId: true } } },
        });
        if (!v) return null;
        return { numero: v.numero, skuAnnonce: v.skuAnnonce, skuSource: v.skuSource, photos: v.photos.map((p) => ({ type: "ref" as const, id: p.referenceId })) };
      }

      // Version 1 : les images validées du sac, par la règle de l'annonce, dans l'ordre des prises.
      if (!sku) return null;
      const [un] = await chargerVersionsUn(userId, [sku]);
      const duColoris = await prisma.studioEssai.findMany({ where: { id: { in: un?.photos ?? [] }, colorisId: coloris.id, coloris: { userId } }, select: { id: true } });
      const gardes = new Set(duColoris.map((e) => e.id));
      return { numero: 1, skuAnnonce: sku, skuSource: sku, photos: (un?.photos ?? []).filter((id) => gardes.has(id)).map((id) => ({ type: "essai" as const, id })) };
    },

    lireOctets: async (photo: PhotoVersion): Promise<OctetsPhoto | null> => {
      let url: string | null = null;
      if (photo.type === "ref") {
        url = (await prisma.studioReference.findFirst({ where: { id: photo.id, userId }, select: { urlImage: true } }))?.urlImage ?? null;
      } else {
        url = (await prisma.studioEssai.findFirst({ where: { id: photo.id, coloris: { userId } }, select: { urlImage: true } }))?.urlImage ?? null;
      }
      if (!url) return null; // absente, d'un autre compte, ou purgée ("")
      const img = await lireImage(url, photo.type === "ref" ? "references" : "generees", userId);
      if (!img) return null;
      const octets = new Uint8Array(await new Response(img.stream).arrayBuffer());
      return { octets, extension: extensionDepuisMime(mimeDepuisContentType(img.contentType, url)) };
    },
  };
}
