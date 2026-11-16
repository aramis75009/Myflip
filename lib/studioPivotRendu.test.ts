import { randomBytes } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { QUALITES_JPEG, RenduImpossible, rendreCopiePivotee, rendreCopieRetouchee } from "./studioPivotRendu";
import { geometrieRetouche } from "./studioRetouche";

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

// ── Retouches par lot (17/11) : même rendu, généralisé ────────────────────────

describe("rendreCopieRetouchee", () => {
  const BEIGE = { couleur: "#e6dccb", epaisseurPct: 4, adoucissement: 35 };
  const NET = { ...BEIGE, adoucissement: 0 };

  /** Un aplat vert, avec un carré rouge de 30 px dans chaque coin : on voit si les coins de l'original sont dans la copie. */
  async function vertAuxCoinsRouges(l: number, h: number) {
    const rouge = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    return sharp({ create: { width: l, height: h, channels: 3, background: { r: 0, g: 160, b: 0 } } })
      .composite([
        { input: rouge, left: 0, top: 0 },
        { input: rouge, left: l - 30, top: 0 },
        { input: rouge, left: 0, top: h - 30 },
        { input: rouge, left: l - 30, top: h - 30 },
      ])
      .jpeg({ quality: 95 })
      .toBuffer();
  }

  const pixels = async (jpeg: Buffer) => sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const px = (p: Awaited<ReturnType<typeof pixels>>, x: number, y: number) => {
    const i = (y * p.info.width + x) * p.info.channels;
    return [p.data[i], p.data[i + 1], p.data[i + 2]];
  };
  /** Rouge par quadrant : les quatre coins de l'original sont-ils là ? */
  function rougesParQuadrant(p: Awaited<ReturnType<typeof pixels>>) {
    const q = [0, 0, 0, 0];
    for (let y = 0; y < p.info.height; y++)
      for (let x = 0; x < p.info.width; x++) {
        const [r, g, b] = px(p, x, y);
        if (r > 180 && g < 80 && b < 80) q[(y < p.info.height / 2 ? 0 : 2) + (x < p.info.width / 2 ? 0 : 1)]++;
      }
    return q;
  }

  it("garde toujours les dimensions de l'original, dans tous les modes et avec un cadre", async () => {
    const source = await aplatVert(300, 400);
    for (const retouche of [
      { angle: 8, modeRotation: "zoom" as const, recadragePct: 15, cadre: null },
      { angle: -45, modeRotation: "bordsBlancs" as const, recadragePct: 0, cadre: BEIGE },
      { angle: 0, modeRotation: "zoom" as const, recadragePct: 30, cadre: null },
      { angle: 0, modeRotation: "zoom" as const, recadragePct: 0, cadre: { ...BEIGE, epaisseurPct: 15 } },
    ]) {
      const { jpeg, largeur, hauteur } = await rendreCopieRetouchee(source, retouche);
      expect([largeur, hauteur]).toEqual([300, 400]);
      expect([(await sharp(jpeg).metadata()).width, (await sharp(jpeg).metadata()).height]).toEqual([300, 400]);
    }
  });

  it("zoom : aucun coin vide même recadré et dans un cadre (le fond magenta n'apparaît nulle part)", async () => {
    const source = await aplatVert(300, 400);
    for (const angle of [-45, -8, 8, 45])
      for (const recadragePct of [0, 15, 30]) {
        const { jpeg } = await rendreCopieRetouchee(source, { angle, modeRotation: "zoom", recadragePct, cadre: null }, { fond: MAGENTA });
        const { channels } = await sharp(jpeg).stats();
        expect(channels[0].max, `${angle}° r${recadragePct}`).toBeLessThan(20);
      }
  });

  it("bords blancs : l'image ENTIÈRE est là (chaque coin rouge, là où la géométrie l'attend), coins blancs", async () => {
    const source = await vertAuxCoinsRouges(300, 400);
    for (const angle of [-45, -8, 8, 45]) {
      const retouche = { angle, modeRotation: "bordsBlancs" as const, recadragePct: 0, cadre: null };
      const p = await pixels((await rendreCopieRetouchee(source, retouche, { fond: MAGENTA })).jpeg);
      // Où la géométrie partagée place le centre de chaque carré rouge (repère de la copie, y vers le bas).
      const g = geometrieRetouche(300, 400, retouche);
      const a = (angle * Math.PI) / 180;
      for (const [cx, cy] of [[15, 15], [285, 15], [15, 385], [285, 385]]) {
        const dx = cx - 150;
        const dy = cy - 200;
        const x = Math.round(150 + g.echelle * (dx * Math.cos(a) - dy * Math.sin(a)));
        const y = Math.round(200 + g.echelle * (dx * Math.sin(a) + dy * Math.cos(a)));
        const [r, gg, b] = px(p, x, y);
        expect(r > 180 && gg < 90 && b < 90, `${angle}° : coin (${cx},${cy}) attendu en (${x},${y}), lu ${[r, gg, b]}`).toBe(true);
      }
      // Coins de la copie : blancs, jamais le fond de test (en bords blancs, le fond EST blanc).
      for (const [x, y] of [[1, 1], [298, 1], [1, 398], [298, 398]]) expect(Math.min(...px(p, x, y)), `${angle}° (${x},${y})`).toBeGreaterThan(235);
    }
    // En zoom, à 45°, les coins de l'original sont coupés : la différence entre les deux modes est réelle.
    const zoom = await pixels((await rendreCopieRetouchee(source, { angle: 45, modeRotation: "zoom", recadragePct: 0, cadre: null })).jpeg);
    expect(rougesParQuadrant(zoom).every((n) => n === 0)).toBe(true);
  });

  it("recadrer coupe les bords : à 0°, 15 % fait sortir les coins rouges", async () => {
    const source = await vertAuxCoinsRouges(300, 400);
    const p = await pixels((await rendreCopieRetouchee(source, { angle: 0, modeRotation: "zoom", recadragePct: 15, cadre: null })).jpeg);
    expect(rougesParQuadrant(p).every((n) => n === 0)).toBe(true);
  });

  it("cadre net : la bande extérieure est exactement la couleur du cadre, la photo commence juste après", async () => {
    const source = await aplatVert(300, 400);
    const p = await pixels((await rendreCopieRetouchee(source, { angle: 8, modeRotation: "zoom", recadragePct: 0, cadre: NET })).jpeg);
    // Épaisseur : 4 % de 300 = 12 px.
    for (const [x, y] of [[3, 200], [150, 3], [296, 200], [150, 396], [10, 10]]) {
      const [r, g, b] = px(p, x, y);
      expect(Math.abs(r - 0xe6) + Math.abs(g - 0xdc) + Math.abs(b - 0xcb), `(${x},${y})`).toBeLessThan(12);
    }
    const [r, g] = px(p, 16, 200);
    expect(r).toBeLessThan(30);
    expect(g).toBeGreaterThan(130);
  });

  it("bord adouci : la couleur du cadre se fond sur le bord de la photo, le centre reste la photo", async () => {
    const source = await aplatVert(300, 400);
    const net = await pixels((await rendreCopieRetouchee(source, { angle: 0, modeRotation: "zoom", recadragePct: 0, cadre: NET })).jpeg);
    const doux = await pixels((await rendreCopieRetouchee(source, { angle: 0, modeRotation: "zoom", recadragePct: 0, cadre: { ...BEIGE, adoucissement: 100 } })).jpeg);
    // Juste à l'intérieur du cadre (x = 13) : vert net, mais déjà teinté de beige une fois adouci.
    expect(px(net, 13, 200)[0]).toBeLessThan(30);
    expect(px(doux, 13, 200)[0]).toBeGreaterThan(120);
    // Le centre ne bouge pas.
    expect(px(doux, 150, 200)[0]).toBeLessThan(30);
    expect(px(doux, 150, 200)[1]).toBeGreaterThan(130);
  });

  it("est déterministe avec un cadre adouci (c'est ce qui dédoublonne), et reste sous le plafond", async () => {
    const bruit = await sharp(randomBytes(400 * 300 * 3), { raw: { width: 400, height: 300, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
    const retouche = { angle: -3, modeRotation: "bordsBlancs" as const, recadragePct: 15, cadre: BEIGE };
    const a = await rendreCopieRetouchee(bruit, retouche);
    const b = await rendreCopieRetouchee(bruit, retouche);
    expect(a.jpeg.equals(b.jpeg)).toBe(true);
    expect(a.qualite).toBe(QUALITES_JPEG[0]);
    const serre = await rendreCopieRetouchee(bruit, retouche, { maxOctets: a.jpeg.length - 1 });
    expect(serre.qualite).toBeLessThan(QUALITES_JPEG[0]);
    await expect(rendreCopieRetouchee(bruit, retouche, { maxOctets: 10 })).rejects.toBeInstanceOf(RenduImpossible);
  });

  it("refuse une retouche sans effet (la copie serait l'originale)", async () => {
    const source = await aplatVert(100, 100);
    await expect(rendreCopieRetouchee(source, { angle: 0, modeRotation: "bordsBlancs", recadragePct: 0, cadre: null })).rejects.toBeInstanceOf(RangeError);
  });
});
