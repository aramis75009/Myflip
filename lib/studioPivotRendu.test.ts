import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { QUALITES_JPEG, RenduImpossible, rendreCopiePivotee } from "./studioPivotRendu";

/** Un aplat vert (r = 0), en JPEG : tout rouge qui apparaît après rendu vient du fond. */
const aplatVert = (l: number, h: number) =>
  sharp({ create: { width: l, height: h, channels: 3, background: { r: 0, g: 160, b: 0 } } })
    .jpeg({ quality: 95 })
    .toBuffer();

const MAGENTA = { r: 255, g: 0, b: 255 };

describe("rendreCopiePivotee", () => {
  it("garde les dimensions et le ratio de l'original, et rend un JPEG", async () => {
    const source = await aplatVert(300, 400);
    for (const angle of [-45, -8, 1, 8, 45]) {
      const { jpeg, largeur, hauteur } = await rendreCopiePivotee(source, angle);
      const meta = await sharp(jpeg).metadata();
      expect(meta.format).toBe("jpeg");
      expect([meta.width, meta.height]).toEqual([300, 400]);
      expect([largeur, hauteur]).toEqual([300, 400]);
    }
  });

  it("aucun coin vide : le fond n'apparaît nulle part, à aucun angle ni format", async () => {
    for (const [l, h] of [
      [300, 400],
      [400, 300],
      [320, 320],
      [120, 40],
    ]) {
      const source = await aplatVert(l, h);
      for (const angle of [-45, -22, -8, -1, 1, 8, 22, 45]) {
        const { jpeg } = await rendreCopiePivotee(source, angle, { fond: MAGENTA });
        const { channels } = await sharp(jpeg).stats();
        // Source : r = 0, b = 0. Le fond magenta a r = b = 255. Quelques niveaux de bruit JPEG au plus.
        expect(channels[0].max, `${l}×${h} à ${angle}° : rouge`).toBeLessThan(20);
        expect(channels[2].max, `${l}×${h} à ${angle}° : bleu`).toBeLessThan(20);
      }
    }
  });

  it("le cadre exact est nécessaire : sans l'agrandissement, le fond serait visible", async () => {
    // Garde-fou du test précédent : il ne peut pas passer « parce qu'il ne regarde rien ».
    const source = await aplatVert(300, 400);
    const { data, info } = await sharp(source)
      .rotate(8, { background: MAGENTA })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let magenta = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 200 && data[i + 2] > 200) magenta++;
    expect(magenta).toBeGreaterThan(1000);
  });

  it("tourne dans le sens des aiguilles d'une montre pour un angle positif (comme CSS rotate)", async () => {
    // Carré blanc en haut à droite d'un fond noir.
    const marque = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } } })
      .png()
      .toBuffer();
    const source = await sharp({ create: { width: 400, height: 400, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: marque, left: 300, top: 40 }])
      .jpeg({ quality: 95 })
      .toBuffer();

    async function centre(angle: number) {
      const { jpeg } = await rendreCopiePivotee(source, angle);
      const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
      let n = 0;
      let sx = 0;
      let sy = 0;
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          if (data[(y * info.width + x) * info.channels] > 128) {
            n++;
            sx += x;
            sy += y;
          }
        }
      }
      return { x: sx / n, y: sy / n };
    }

    // Calcul à la main (repère image, y vers le bas) : centre du carré (320, 60), à 10° horaire, agrandi de 1,159.
    const horaire = await centre(10);
    expect(horaire.x).toBeGreaterThan(355);
    expect(horaire.x).toBeLessThan(375);
    expect(horaire.y).toBeGreaterThan(55);
    expect(horaire.y).toBeLessThan(75);
    // Sens inverse : le carré glisse vers la gauche et vers le haut.
    const antihoraire = await centre(-10);
    expect(antihoraire.x).toBeLessThan(320);
    expect(antihoraire.y).toBeLessThan(45);
  });

  it("applique l'orientation EXIF avant tout : un fichier couché 300×400 balisé « 6 » rend du 400×300", async () => {
    const source = await sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 0, g: 160, b: 0 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    expect((await sharp(source).metadata()).orientation).toBe(6);
    const { jpeg, largeur, hauteur } = await rendreCopiePivotee(source, 8, { fond: MAGENTA });
    const meta = await sharp(jpeg).metadata();
    expect([meta.width, meta.height]).toEqual([400, 300]);
    expect([largeur, hauteur]).toEqual([400, 300]);
    const { channels } = await sharp(jpeg).stats();
    expect(channels[0].max).toBeLessThan(20);
    // La copie ne garde pas la balise : elle est déjà dans les pixels.
    expect((await sharp(jpeg).metadata()).orientation).toBeUndefined();
  });

  it("est déterministe : le même fichier et le même angle donnent les mêmes octets (c'est ce qui dédoublonne)", async () => {
    // Un aplat tourné de +8° ou −8° est le même aplat : il faut une image qui a un haut et un bas.
    const diagonale = Buffer.alloc(300 * 400 * 3);
    for (let y = 0; y < 400; y++) for (let x = 0; x < 300; x++) diagonale.fill(Math.round(((x + 2 * y) / 1100) * 255), (y * 300 + x) * 3, (y * 300 + x) * 3 + 3);
    const source = await sharp(diagonale, { raw: { width: 300, height: 400, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
    const a = await rendreCopiePivotee(source, 8);
    const b = await rendreCopiePivotee(source, 8);
    expect(a.jpeg.equals(b.jpeg)).toBe(true);
    const autre = await rendreCopiePivotee(source, -8);
    expect(autre.jpeg.equals(a.jpeg)).toBe(false);
  });

  it("encode à la meilleure qualité, 4:4:4, et ne descend que si le fichier est trop gros", async () => {
    // Du bruit : un JPEG de taille réaliste, qui réagit à la qualité.
    const bruit = await sharp(randomBytes(400 * 300 * 3), { raw: { width: 400, height: 300, channels: 3 } })
      .jpeg({ quality: 85 })
      .toBuffer();
    const plein = await rendreCopiePivotee(bruit, 8);
    expect(plein.qualite).toBe(QUALITES_JPEG[0]);
    expect((await sharp(plein.jpeg).metadata()).chromaSubsampling).toBe("4:4:4");

    const serre = await rendreCopiePivotee(bruit, 8, { maxOctets: plein.jpeg.length - 1 });
    expect(serre.qualite).toBeLessThan(QUALITES_JPEG[0]);
    expect(serre.jpeg.length).toBeLessThan(plein.jpeg.length);

    await expect(rendreCopiePivotee(bruit, 8, { maxOctets: 10 })).rejects.toBeInstanceOf(RenduImpossible);
  });

  it("garde le contenu : une image lisse tournée de 1° ne s'écarte presque pas de l'original", async () => {
    // Dégradé horizontal : une rotation de 1° le déplace à peine.
    const degrade = Buffer.alloc(400 * 300 * 3);
    for (let y = 0; y < 300; y++) for (let x = 0; x < 400; x++) degrade.fill(Math.round((x / 399) * 255), (y * 400 + x) * 3, (y * 400 + x) * 3 + 3);
    const source = await sharp(degrade, { raw: { width: 400, height: 300, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
    const { jpeg } = await rendreCopiePivotee(source, 1);
    const a = await sharp(source).raw().toBuffer();
    const b = await sharp(jpeg).raw().toBuffer();
    let somme = 0;
    for (let i = 0; i < a.length; i++) somme += Math.abs(a[i] - b[i]);
    // Écart moyen par canal, sur 255 : un dégradé qui glisse de ~3 px sur 400 = ~2 niveaux.
    expect(somme / a.length).toBeLessThan(8);
  });

  it("refuse un angle nul, hors plage ou non entier, et un fichier qui n'est pas une image", async () => {
    const source = await aplatVert(100, 100);
    for (const angle of [0, 46, -46, 8.5, Number.NaN]) await expect(rendreCopiePivotee(source, angle)).rejects.toBeInstanceOf(RangeError);
    await expect(rendreCopiePivotee(Buffer.from("pas une image"), 8)).rejects.toBeInstanceOf(RenduImpossible);
  });
});
