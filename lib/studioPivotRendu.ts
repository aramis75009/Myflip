import "server-only";
import sharp from "sharp";

import { TAILLE_MAX_OCTETS } from "./studioBlob";
import { estAngle, zoneRecadree } from "./studioPivot";

/**
 * Rendu d'une copie pivotée (serveur, sharp). Les règles de géométrie sont dans
 * `lib/studioPivot.ts`, partagées avec l'aperçu du navigateur.
 *
 * Trois étapes, un seul encodage JPEG :
 *   1. rotation de `angle` degrés, sans perte (tampon brut) ; l'image tournée
 *      est la boîte englobante, ses coins sont du fond ;
 *   2. découpe, au centre, de la zone que l'agrandissement garde (aucun coin
 *      de fond n'y entre : cf. `zoneRecadree`) ;
 *   3. agrandissement aux dimensions EXACTES de l'original, puis JPEG.
 *
 * Pourquoi deux passes plutôt qu'une : sharp applique `extract` avant la
 * rotation, pas après. Passer par un tampon brut garde la rotation et la
 * découpe sans réencoder entre les deux.
 *
 * L'orientation EXIF est appliquée d'abord (les fichiers du Studio n'en ont pas,
 * le navigateur les a réencodés, mais un fichier venu d'ailleurs en aurait une).
 */

/**
 * Qualités JPEG essayées, de la meilleure à la plus modeste. Le client envoie
 * ses photos en JPEG 1600 px à la qualité 0,85, en 4:2:0 : 92 en 4:4:4 est au
 * moins équivalent. On ne descend que si le fichier dépasse la limite du Studio
 * (4 Mo), ce qui n'arrive pas pour du 1600 px.
 */
export const QUALITES_JPEG = [92, 88, 84] as const;

/** Fond des coins de l'image tournée. Jamais visible : la découpe les écarte. Réglable pour que les tests voient une fuite. */
export type Fond = { r: number; g: number; b: number };
const FOND_BLANC: Fond = { r: 255, g: 255, b: 255 };

export type CopieRendue = {
  jpeg: Buffer;
  /** Dimensions de la copie : celles de l'original (orientation EXIF appliquée). */
  largeur: number;
  hauteur: number;
  qualite: number;
};

export class RenduImpossible extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenduImpossible";
  }
}

export async function rendreCopiePivotee(
  source: Buffer,
  angle: number,
  options: { fond?: Fond; maxOctets?: number } = {},
): Promise<CopieRendue> {
  if (!estAngle(angle) || angle === 0) throw new RangeError("Angle invalide.");
  const fond = options.fond ?? FOND_BLANC;
  const maxOctets = options.maxOctets ?? TAILLE_MAX_OCTETS;

  try {
    const meta = await sharp(source).metadata();
    if (!meta.width || !meta.height) throw new RenduImpossible("Image illisible.");
    const echange = (meta.orientation ?? 1) >= 5;
    const largeur = echange ? meta.height : meta.width;
    const hauteur = echange ? meta.width : meta.height;

    // 1. Rotation, sans perte.
    const tournee = await sharp(source)
      .rotate() // orientation EXIF, seul appel sans argument autorisé avant l'angle
      .flatten({ background: fond })
      .rotate(angle, { background: fond })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 2. Zone gardée, au centre.
    const zone = zoneRecadree(largeur, hauteur, angle, tournee.info.width, tournee.info.height);

    // 3. Agrandissement aux dimensions de l'original, un seul JPEG.
    const base = sharp(tournee.data, {
      raw: { width: tournee.info.width, height: tournee.info.height, channels: tournee.info.channels },
    })
      .extract({ left: zone.left, top: zone.top, width: zone.width, height: zone.height })
      .resize(largeur, hauteur, { fit: "fill", kernel: "lanczos3" });

    for (const qualite of QUALITES_JPEG) {
      const jpeg = await base.clone().jpeg({ quality: qualite, chromaSubsampling: "4:4:4" }).toBuffer();
      if (jpeg.length <= maxOctets) return { jpeg, largeur, hauteur, qualite };
    }
    throw new RenduImpossible("La copie dépasse la taille maximale.");
  } catch (err) {
    if (err instanceof RenduImpossible || err instanceof RangeError) throw err;
    // Le message de sharp peut citer un chemin ou des octets : on n'en garde que le type.
    throw new RenduImpossible("Image illisible.");
  }
}
