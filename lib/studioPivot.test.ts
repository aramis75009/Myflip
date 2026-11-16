import { describe, expect, it } from "vitest";

import {
  ANGLE_MAX,
  ANGLE_MIN,
  MARGE_RENDU_PX,
  echelleRecadrage,
  estAngle,
  lireAngleSaisi,
  libelleAngle,
  transformApercu,
  zoneRecadree,
} from "./studioPivot";

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Vérification INDÉPENDANTE de la formule : on tourne les quatre coins du cadre
 * de −angle (ils passent dans le repère de l'image) et on regarde s'ils tiennent
 * dans l'image agrandie de `s`. Sert à prouver à la fois « aucun coin vide »
 * (tous dedans) et « juste assez » (un coin au moins touche le bord).
 */
function jeuDesCoins(l: number, h: number, angle: number, s: number) {
  const a = rad(-angle);
  const marges = [
    [-l / 2, -h / 2],
    [l / 2, -h / 2],
    [l / 2, h / 2],
    [-l / 2, h / 2],
  ].map(([x, y]) => {
    const xi = x * Math.cos(a) - y * Math.sin(a);
    const yi = x * Math.sin(a) + y * Math.cos(a);
    // Distance au bord de l'image agrandie (positive = dedans).
    return Math.min((s * l) / 2 - Math.abs(xi), (s * h) / 2 - Math.abs(yi));
  });
  return Math.min(...marges);
}

describe("echelleRecadrage", () => {
  it("vaut 1 à 0° : rien n'est agrandi", () => {
    expect(echelleRecadrage(1200, 1600, 0)).toBe(1);
    expect(echelleRecadrage(1600, 1600, 0)).toBe(1);
  });

  it("à 8° sur 1200 × 1600 : 1,17583 (valeur calculée à la main)", () => {
    expect(echelleRecadrage(1200, 1600, 8)).toBeCloseTo(1.1758322, 6);
  });

  it("−8° donne exactement la même échelle que +8°", () => {
    expect(echelleRecadrage(1200, 1600, -8)).toBe(echelleRecadrage(1200, 1600, 8));
  });

  it("à 45° sur un carré : racine de 2", () => {
    expect(echelleRecadrage(1600, 1600, 45)).toBeCloseTo(Math.SQRT2, 10);
  });

  it("à 45° sur 3 × 4 : 7 / (3 racine de 2), le côté court décide", () => {
    expect(echelleRecadrage(3, 4, 45)).toBeCloseTo(7 / (3 * Math.SQRT2), 10);
    expect(echelleRecadrage(3, 4, -45)).toBeCloseTo(7 / (3 * Math.SQRT2), 10);
  });

  it("portrait et paysage de mêmes côtés ont la même échelle", () => {
    for (const a of [1, 8, 20, 45]) expect(echelleRecadrage(1200, 1600, a)).toBeCloseTo(echelleRecadrage(1600, 1200, a), 10);
  });

  it("croît avec l'angle (de 0° à 45°)", () => {
    let precedent = 1;
    for (let a = 1; a <= ANGLE_MAX; a++) {
      const s = echelleRecadrage(1200, 1600, a);
      expect(s).toBeGreaterThan(precedent);
      precedent = s;
    }
  });

  it("aucun coin vide et juste assez : tous les angles entiers, plusieurs formats", () => {
    for (const [l, h] of [
      [1200, 1600],
      [1600, 1200],
      [1600, 1600],
      [900, 1600],
      [37, 11],
    ]) {
      for (let a = ANGLE_MIN; a <= ANGLE_MAX; a++) {
        const s = echelleRecadrage(l, h, a);
        const jeu = jeuDesCoins(l, h, a, s);
        // Dedans, à la poussière flottante près…
        expect(jeu).toBeGreaterThanOrEqual(-1e-6);
        // …et pas plus que nécessaire : un coin touche un bord.
        expect(jeu).toBeLessThan(1e-6);
        // Un peu moins d'agrandissement laisserait un coin vide.
        if (a !== 0) expect(jeuDesCoins(l, h, a, s * 0.999)).toBeLessThan(0);
      }
    }
  });

  it("refuse des dimensions ou un angle absurdes", () => {
    expect(() => echelleRecadrage(0, 100, 5)).toThrow(RangeError);
    expect(() => echelleRecadrage(100, -1, 5)).toThrow(RangeError);
    expect(() => echelleRecadrage(100, 100, Number.NaN)).toThrow(RangeError);
  });
});

describe("estAngle", () => {
  it("accepte les entiers de −45 à +45, zéro compris", () => {
    for (const a of [-45, -8, 0, 1, 8, 45]) expect(estAngle(a)).toBe(true);
  });
  it("refuse hors plage, décimaux, textes, null", () => {
    for (const a of [-46, 46, 8.5, Number.NaN, Infinity, "8", null, undefined, {}]) expect(estAngle(a)).toBe(false);
  });
});

describe("lireAngleSaisi", () => {
  it("lit un entier, avec ou sans signe", () => {
    expect(lireAngleSaisi("8")).toBe(8);
    expect(lireAngleSaisi("-8")).toBe(-8);
    expect(lireAngleSaisi("+8")).toBe(8);
    expect(lireAngleSaisi("  12 ")).toBe(12);
  });
  it("arrondit au degré, virgule décimale comprise", () => {
    expect(lireAngleSaisi("8,4")).toBe(8);
    expect(lireAngleSaisi("8.5")).toBe(9);
    expect(lireAngleSaisi("-0,4")).toBe(0);
    expect(Object.is(lireAngleSaisi("-0,4"), 0)).toBe(true); // pas de −0
  });
  it("ramène une valeur hors plage au bord", () => {
    expect(lireAngleSaisi("90")).toBe(45);
    expect(lireAngleSaisi("-200")).toBe(-45);
  });
  it("rend null tant que ce n'est pas un nombre (case vide, signe seul, texte)", () => {
    for (const s of ["", " ", "-", "+", "abc", "8°", "1e", "NaN", "Infinity"]) expect(lireAngleSaisi(s)).toBeNull();
  });
});

describe("libelleAngle", () => {
  it("écrit le signe, avec un vrai moins", () => {
    expect(libelleAngle(8)).toBe("+8°");
    expect(libelleAngle(-8)).toBe("−8°");
    expect(libelleAngle(0)).toBe("0°");
  });
});

describe("transformApercu", () => {
  it("ne transforme rien à 0°", () => {
    expect(transformApercu(1200, 1600, 0)).toBe("none");
  });
  it("tourne puis agrandit de l'échelle du recadrage", () => {
    expect(transformApercu(1200, 1600, 8)).toBe(`rotate(8deg) scale(${echelleRecadrage(1200, 1600, 8)})`);
    expect(transformApercu(1200, 1600, -8)).toBe(`rotate(-8deg) scale(${echelleRecadrage(1200, 1600, -8)})`);
  });
});

describe("zoneRecadree", () => {
  it("à 0° : toute l'image, sans marge", () => {
    expect(zoneRecadree(1200, 1600, 0, 1200, 1600)).toEqual({ left: 0, top: 0, width: 1200, height: 1600, echelle: 1 });
  });

  it("est centrée dans l'image tournée et reste dedans", () => {
    const l = 1200;
    const h = 1600;
    const angle = 8;
    // Boîte englobante de l'image tournée.
    const W = Math.ceil(l * Math.cos(rad(angle)) + h * Math.sin(rad(angle)));
    const H = Math.ceil(l * Math.sin(rad(angle)) + h * Math.cos(rad(angle)));
    const z = zoneRecadree(l, h, angle, W, H);
    expect(z.left).toBeGreaterThanOrEqual(0);
    expect(z.top).toBeGreaterThanOrEqual(0);
    expect(z.left + z.width).toBeLessThanOrEqual(W);
    expect(z.top + z.height).toBeLessThanOrEqual(H);
    expect(Math.abs(z.left - (W - z.width) / 2)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(z.top - (H - z.height) / 2)).toBeLessThanOrEqual(0.5);
  });

  it("la zone tient dans le rectangle tourné, avec au moins la marge de sécurité", () => {
    for (const [l, h] of [
      [1200, 1600],
      [1600, 1600],
    ]) {
      for (const angle of [-45, -8, -1, 1, 8, 22, 45]) {
        const W = Math.ceil(l * Math.abs(Math.cos(rad(angle))) + h * Math.abs(Math.sin(rad(angle))));
        const H = Math.ceil(l * Math.abs(Math.sin(rad(angle))) + h * Math.abs(Math.cos(rad(angle))));
        const z = zoneRecadree(l, h, angle, W, H);
        // Les 4 coins de la zone, ramenés au repère de l'image : au moins MARGE px de chaque bord.
        const a = rad(-angle);
        const cx = W / 2;
        const cy = H / 2;
        for (const [x, y] of [
          [z.left, z.top],
          [z.left + z.width, z.top],
          [z.left + z.width, z.top + z.height],
          [z.left, z.top + z.height],
        ]) {
          const dx = x - cx;
          const dy = y - cy;
          const xi = dx * Math.cos(a) - dy * Math.sin(a);
          const yi = dx * Math.sin(a) + dy * Math.cos(a);
          // Un demi-pixel de tolérance : position et taille sont arrondies.
          expect(l / 2 - Math.abs(xi)).toBeGreaterThanOrEqual(MARGE_RENDU_PX - 1);
          expect(h / 2 - Math.abs(yi)).toBeGreaterThanOrEqual(MARGE_RENDU_PX - 1);
        }
      }
    }
  });

  it("l'échelle réelle dépasse très peu l'échelle exacte (marge de 2 px)", () => {
    const exacte = echelleRecadrage(1200, 1600, 8);
    const W = Math.ceil(1200 * Math.cos(rad(8)) + 1600 * Math.sin(rad(8)));
    const H = Math.ceil(1200 * Math.sin(rad(8)) + 1600 * Math.cos(rad(8)));
    const { echelle } = zoneRecadree(1200, 1600, 8, W, H);
    expect(echelle).toBeGreaterThanOrEqual(exacte);
    expect(echelle - exacte).toBeLessThan(0.01);
  });
});
