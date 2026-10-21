/**
 * PNG minimal, sans dépendance : décodeur (8 bits RVB / RVBA, non entrelacé, les
 * 5 filtres) pour mesurer des pixels dans une capture, et encodeur pour fabriquer
 * des images SYNTHÉTIQUES (jamais une vraie photo, jamais une image générée par IA)
 * à déposer dans un champ fichier.
 */
import zlib from "node:zlib";

export type ImageDecodee = { largeur: number; hauteur: number; canaux: 3 | 4; octets: Uint8Array };

export function decoderPng(png: Buffer): ImageDecodee {
  if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("PNG illisible : signature absente.");
  let pos = 8;
  let largeur = 0;
  let hauteur = 0;
  let canaux: 3 | 4 = 3;
  const idat: Buffer[] = [];
  while (pos < png.length) {
    const longueur = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    const donnees = png.subarray(pos + 8, pos + 8 + longueur);
    if (type === "IHDR") {
      largeur = donnees.readUInt32BE(0);
      hauteur = donnees.readUInt32BE(4);
      const profondeur = donnees[8];
      const couleur = donnees[9];
      if (profondeur !== 8 || (couleur !== 2 && couleur !== 6) || donnees[12] !== 0) {
        throw new Error(`PNG non géré : profondeur ${profondeur}, type de couleur ${couleur}, entrelacement ${donnees[12]}.`);
      }
      canaux = couleur === 6 ? 4 : 3;
    } else if (type === "IDAT") idat.push(Buffer.from(donnees));
    else if (type === "IEND") break;
    pos += 12 + longueur;
  }
  const brut = zlib.inflateSync(Buffer.concat(idat));
  const ligne = largeur * canaux;
  const sortie = new Uint8Array(ligne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[y * (ligne + 1)];
    const src = y * (ligne + 1) + 1;
    for (let i = 0; i < ligne; i++) {
      const x = brut[src + i];
      const a = i >= canaux ? sortie[y * ligne + i - canaux] : 0;
      const b = y > 0 ? sortie[(y - 1) * ligne + i] : 0;
      const c = y > 0 && i >= canaux ? sortie[(y - 1) * ligne + i - canaux] : 0;
      let v: number;
      switch (filtre) {
        case 0:
          v = x;
          break;
        case 1:
          v = x + a;
          break;
        case 2:
          v = x + b;
          break;
        case 3:
          v = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`Filtre PNG inconnu : ${filtre}.`);
      }
      sortie[y * ligne + i] = v & 0xff;
    }
  }
  return { largeur, hauteur, canaux, octets: sortie };
}

/** Pixel (x, y) en [r, v, b]. */
export function pixel(img: ImageDecodee, x: number, y: number): [number, number, number] {
  const o = (y * img.largeur + x) * img.canaux;
  return [img.octets[o], img.octets[o + 1], img.octets[o + 2]];
}

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** Luminance relative WCAG d'un pixel, 0 à 1. */
export const luminancePixel = ([r, v, b]: [number, number, number]): number => 0.2126 * lin(r) + 0.7152 * lin(v) + 0.0722 * lin(b);

/** Luminance maximale d'une image (le pixel le plus clair). */
export function luminanceMax(img: ImageDecodee): number {
  let max = 0;
  for (let y = 0; y < img.hauteur; y++) for (let x = 0; x < img.largeur; x++) max = Math.max(max, luminancePixel(pixel(img, x, y)));
  return max;
}

/** Luminance du pixel central, pour comparer « avant » et « après » d'un voile. */
export const luminanceCentre = (img: ImageDecodee): number => luminancePixel(pixel(img, Math.floor(img.largeur / 2), Math.floor(img.hauteur / 2)));

// ── Encodeur ────────────────────────────────────────────────────────────────

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type: string, donnees: Buffer): Buffer {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, "ascii"), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, crc]);
}

/** PNG RVB 8 bits ; `couleur(x, y)` rend [r, v, b]. */
export function encoderPng(largeur: number, hauteur: number, couleur: (x: number, y: number) => [number, number, number]): Buffer {
  const ligne = largeur * 3 + 1;
  const brut = Buffer.alloc(ligne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const [r, v, b] = couleur(x, y);
      const o = y * ligne + 1 + x * 3;
      brut[o] = r;
      brut[o + 1] = v;
      brut[o + 2] = b;
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8;
  entete[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", entete),
    bloc("IDAT", zlib.deflateSync(brut)),
    bloc("IEND", Buffer.alloc(0)),
  ]);
}

/** Image de test : un fond uni et un rectangle (silhouette), déterministe selon la teinte. */
export function imageSynthetique(largeur = 600, hauteur = 800, teinte = 0): Buffer {
  const fond: [number, number, number] = [220 - teinte * 7, 224 - teinte * 3, 230];
  const sac: [number, number, number] = [40 + teinte * 20, 90, 70 + teinte * 15];
  return encoderPng(largeur, hauteur, (x, y) => {
    const dansSac = x > largeur * 0.22 && x < largeur * 0.78 && y > hauteur * 0.4 && y < hauteur * 0.88;
    return dansSac ? sac : fond;
  });
}
