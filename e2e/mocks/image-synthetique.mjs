// Images SYNTHÉTIQUES pour les faux serveurs : un PNG dessiné pixel par pixel
// (silhouette de sac sur fond uni), sans dépendance ni fichier. Jamais une
// vraie photo, jamais une image générée par IA. Déterministe : la même graine
// donne les mêmes octets.

import zlib from "node:zlib";

const TABLE_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(octets) {
  let c = 0xffffffff;
  for (const o of octets) c = TABLE_CRC[(c ^ o) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const typeEtDonnees = Buffer.concat([Buffer.from(type, "ascii"), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeEtDonnees));
  return Buffer.concat([longueur, typeEtDonnees, crc]);
}

/** PNG RVB 8 bits ; `pixel(x, y)` rend [r, v, b]. */
export function png(largeur, hauteur, pixel) {
  const ligne = largeur * 3 + 1;
  const brut = Buffer.alloc(ligne * hauteur);
  for (let y = 0; y < hauteur; y++) {
    brut[y * ligne] = 0; // filtre « aucun »
    for (let x = 0; x < largeur; x++) {
      const [r, v, b] = pixel(x, y);
      const o = y * ligne + 1 + x * 3;
      brut[o] = r;
      brut[o + 1] = v;
      brut[o + 2] = b;
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8; // profondeur
  entete[9] = 2; // RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", entete),
    bloc("IDAT", zlib.deflateSync(brut)),
    bloc("IEND", Buffer.alloc(0)),
  ]);
}

/** Petit hachage stable d'une chaîne, pour choisir une teinte. */
function hacher(texte) {
  let h = 2166136261;
  for (const c of String(texte)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

function teinte(h) {
  const palette = [
    [32, 33, 36], // noir
    [196, 72, 112], // rose
    [222, 206, 178], // crème
    [44, 82, 130], // marine
    [128, 52, 40], // cognac
    [70, 110, 74], // vert
  ];
  return palette[h % palette.length];
}

/**
 * Silhouette de sac 3:4 (300×400 par défaut) : corps trapézoïdal, anse en
 * arceau, fermoir. La graine choisit la couleur du sac et du fond.
 */
export function pngSac(graine = "e2e", largeur = 300, hauteur = 400) {
  const h = hacher(graine);
  const sac = teinte(h);
  const fond = [236 - (h % 12), 232 - ((h >> 4) % 10), 226 - ((h >> 8) % 8)];
  const fermoir = [212, 175, 55];
  const cx = largeur / 2;
  const haut = hauteur * 0.4;
  const bas = hauteur * 0.88;
  const rayonExt = largeur * 0.2;
  const rayonInt = largeur * 0.15;

  return png(largeur, hauteur, (x, y) => {
    if (y >= haut && y <= bas) {
      const t = (y - haut) / (bas - haut);
      const demiLargeur = largeur * (0.28 + 0.08 * t);
      if (Math.abs(x - cx) <= demiLargeur) {
        const surFermoir = Math.abs(x - cx) <= largeur * 0.04 && y - haut < hauteur * 0.06;
        if (surFermoir) return fermoir;
        const ombre = t > 0.92 ? 0.8 : 1;
        return sac.map((c) => Math.round(c * ombre));
      }
    }
    if (y < haut) {
      const d = Math.hypot(x - cx, y - haut);
      if (d <= rayonExt && d >= rayonInt) return sac;
    }
    return fond;
  });
}

/** PNG 1×1 de secours (cité par la spécification du faux OpenRouter). */
export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
