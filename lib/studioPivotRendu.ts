import "server-only";
import sharp from "sharp";

import { TAILLE_MAX_OCTETS } from "./studioBlob";
import { estAngle } from "./studioPivot";
import {
  FOND_RETOUCHE,
  estIdentite,
  geometrieRetouche,
  masqueAdoucissement,
  retoucheDePivot,
  rgbDe,
  zoneDeRendu,
  type GeometrieRetouche,
  type Retouche,
} from "./studioRetouche";

/**
 * Rendu d'une copie retouchée (serveur, sharp). Les règles de géométrie sont
 * dans `lib/studioRetouche.ts` (`geometrieRetouche`, partie d'`echelleRecadrage`
 * de `lib/studioPivot.ts`), partagées avec l'aperçu du navigateur.
 *
 * Étapes, un seul encodage JPEG :
 *   1. rotation de `angle` degrés, sans perte (tampon brut) ; l'image tournée
 *      est la boîte englobante, ses coins sont du fond ;
 *   2. découpe, au centre, de la zone que l'échelle garde (`zoneDeRendu`) : en
 *      zoom aucun coin de fond n'y entre ; en bords blancs elle déborde, et le
 *      débord est du blanc ;
 *   3. agrandissement à la zone de la photo (sans cadre : les dimensions EXACTES
 *      de l'original) ;
 *   4. avec un cadre : la photo est posée dans un aplat de sa couleur, et le bord
 *      adouci (`masqueAdoucissement`) fond la couleur du cadre sur la photo.
 *
 * Pourquoi plusieurs passes plutôt qu'une : sharp applique `extract` avant la
 * rotation, et `extend` après le redimensionnement. Passer par des tampons bruts
 * garde l'ordre voulu sans réencoder entre deux.
 *
 * L'orientation EXIF est appliquée d'abord (les fichiers du Studio n'en ont pas,
 * le navigateur les a réencodés, mais un fichier venu d'ailleurs en aurait une).
 *
 * « Pivoter » (angle seul, zoom) passe par exactement les mêmes appels qu'avant
 * la généralisation : ses copies restent identiques octet pour octet, ce qui
 * permet de les retrouver par leur empreinte.
 */

/**
 * Qualités JPEG essayées, de la meilleure à la plus modeste. Le client envoie
 * ses photos en JPEG 1600 px à la qualité 0,85, en 4:2:0 : 92 en 4:4:4 est au
 * moins équivalent. On ne descend que si le fichier dépasse la limite du Studio
 * (4 Mo), ce qui n'arrive pas pour du 1600 px.
 */
export const QUALITES_JPEG = [92, 88, 84] as const;

/** Fond des coins de l'image tournée en mode zoom. Jamais visible : la découpe les écarte. Réglable pour que les tests voient une fuite. */
export type Fond = { r: number; g: number; b: number };
const FOND_BLANC: Fond = rgbDe(FOND_RETOUCHE);

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

type Brut = { data: Buffer; info: { width: number; height: number; channels: number } };
const depuisBrut = (b: Brut) =>
  sharp(b.data, { raw: { width: b.info.width, height: b.info.height, channels: b.info.channels as 1 | 2 | 3 | 4 } });

/** Copie pivotée (« Pivoter ») : angle seul, mode zoom. */
export async function rendreCopiePivotee(
  source: Buffer,
  angle: number,
  options: { fond?: Fond; maxOctets?: number } = {},
): Promise<CopieRendue> {
  if (!estAngle(angle) || angle === 0) throw new RangeError("Angle invalide.");
  return rendreCopieRetouchee(source, retoucheDePivot(angle), options);
}

export async function rendreCopieRetouchee(
  source: Buffer,
  retouche: Retouche,
  options: { fond?: Fond; maxOctets?: number } = {},
): Promise<CopieRendue> {
  if (estIdentite(retouche)) throw new RangeError("Rien à retoucher.");
  const maxOctets = options.maxOctets ?? TAILLE_MAX_OCTETS;

  try {
    const meta = await sharp(source).metadata();
    if (!meta.width || !meta.height) throw new RenduImpossible("Image illisible.");
    const echange = (meta.orientation ?? 1) >= 5;
    const largeur = echange ? meta.height : meta.width;
    const hauteur = echange ? meta.width : meta.height;
    const geo = geometrieRetouche(largeur, hauteur, retouche);
    // Bords blancs : les coins SONT le fond, et l'aperçu les montre blancs.
    const fond = geo.mode === "bordsBlancs" ? FOND_BLANC : (options.fond ?? FOND_BLANC);

    // 1. Rotation, sans perte (orientation EXIF d'abord : seul appel sans argument autorisé avant l'angle).
    let pipeline = sharp(source).rotate().flatten({ background: fond });
    if (geo.angle !== 0) pipeline = pipeline.rotate(geo.angle, { background: fond });
    let tournee: Brut = await pipeline.raw().toBuffer({ resolveWithObject: true });

    // 2. Zone gardée, au centre ; en bords blancs, du blanc autour quand elle déborde.
    const zone = zoneDeRendu(geo, tournee.info.width, tournee.info.height);
    const debord = {
      left: Math.max(0, -zone.left),
      top: Math.max(0, -zone.top),
      right: Math.max(0, zone.left + zone.width - tournee.info.width),
      bottom: Math.max(0, zone.top + zone.height - tournee.info.height),
    };
    if (debord.left + debord.top + debord.right + debord.bottom > 0) {
      tournee = await depuisBrut(tournee).extend({ ...debord, background: fond }).raw().toBuffer({ resolveWithObject: true });
    }

    // 3. Agrandissement à la zone de la photo.
    const { largeur: l, hauteur: h } = geo.interieur;
    const photo = depuisBrut(tournee)
      .extract({ left: zone.left + debord.left, top: zone.top + debord.top, width: zone.width, height: zone.height })
      .resize(l, h, { fit: "fill", kernel: "lanczos3" });

    // Sans cadre, la photo EST la copie : le chemin de « Pivoter », inchangé.
    const base = geo.couleurCadre === null ? photo : await poserDansLeCadre(photo, geo);

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

/**
 * Étape 4 : un aplat de la couleur du cadre aux dimensions de l'original, la
 * photo posée à (e, e), et le bord adouci fondu par-dessus la photo. Fait sur
 * des tampons bruts, au pixel près : pas de composition sharp dont l'ordre ou
 * la prémultiplication pourraient s'écarter de l'aperçu.
 */
async function poserDansLeCadre(photo: sharp.Sharp, geo: GeometrieRetouche): Promise<sharp.Sharp> {
  const { largeur: l, hauteur: h, x: x0, y: y0 } = geo.interieur;
  const { data, info } = await photo.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  const { r, g, b } = rgbDe(geo.couleurCadre as string);
  const teinte = [r, g, b];

  if (geo.adoucissement) {
    const masque = masqueAdoucissement(l, h, geo.adoucissement.etalementPx, geo.adoucissement.sigmaPx);
    for (let i = 0; i < masque.length; i++) {
      const a = masque[i];
      if (a === 0) continue;
      const p = i * c;
      for (let k = 0; k < 3; k++) data[p + k] = Math.round((data[p + k] * (255 - a) + teinte[k] * a) / 255);
    }
  }

  const sortie = Buffer.alloc(geo.largeur * geo.hauteur * 3);
  for (let i = 0; i < sortie.length; i += 3) {
    sortie[i] = r;
    sortie[i + 1] = g;
    sortie[i + 2] = b;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < l; x++) {
      const s = (y * l + x) * c;
      const d = ((y0 + y) * geo.largeur + (x0 + x)) * 3;
      sortie[d] = data[s];
      sortie[d + 1] = data[s + 1];
      sortie[d + 2] = data[s + 2];
    }
  }
  return sharp(sortie, { raw: { width: geo.largeur, height: geo.hauteur, channels: 3 } });
}
