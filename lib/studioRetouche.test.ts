import { describe, expect, it } from "vitest";

import { echelleContenue, echelleRecadrage, transformApercu, zoneRecadree } from "./studioPivot";
import {
  RETOUCHE_NEUTRE,
  cleRetouche,
  estIdentite,
  estPivotSeul,
  geometrieRetouche,
  libelleRetouche,
  lireRetouche,
  masqueAdoucissement,
  normaliserRetouche,
  profilAdoucissement,
  retoucheDeCopie,
  retoucheDePivot,
  styleApercu,
  zoneDeRendu,
  type Retouche,
} from "./studioRetouche";

const rad = (d: number) => (d * Math.PI) / 180;
const r = (p: Partial<Retouche>): Retouche => ({ ...RETOUCHE_NEUTRE, ...p });
const BEIGE = { couleur: "#e6dccb", epaisseurPct: 4, adoucissement: 35 };

/**
 * Vérification INDÉPENDANTE de la géométrie, sans la formule : on place l'image
 * L × H comme le fait le rendu (centrée sur la zone, tournée de `angle`,
 * agrandie de `echelle`) et on regarde où tombent les coins.
 *   • zone couverte : les quatre coins de la ZONE, ramenés dans le repère de
 *     l'image, sont dedans → aucun coin vide (mode zoom) ;
 *   • image entière : les quatre coins de l'IMAGE, placés dans le repère de la
 *     zone, sont dedans → rien de l'image n'est coupé (mode bords blancs).
 * Rend la plus petite marge, en pixels : ≥ 0 = vrai, ≈ 0 = juste assez.
 */
function margeCouverture(L: number, H: number, l: number, h: number, angle: number, s: number) {
  const a = rad(-angle);
  return Math.min(
    ...[
      [-l / 2, -h / 2],
      [l / 2, -h / 2],
      [l / 2, h / 2],
      [-l / 2, h / 2],
    ].map(([x, y]) => {
      const xi = (x * Math.cos(a) - y * Math.sin(a)) / s;
      const yi = (x * Math.sin(a) + y * Math.cos(a)) / s;
      return Math.min(L / 2 - Math.abs(xi), H / 2 - Math.abs(yi)) * s;
    }),
  );
}
function margeImageEntiere(L: number, H: number, l: number, h: number, angle: number, s: number) {
  const a = rad(angle);
  return Math.min(
    ...[
      [-L / 2, -H / 2],
      [L / 2, -H / 2],
      [L / 2, H / 2],
      [-L / 2, H / 2],
    ].map(([x, y]) => {
      const xz = s * (x * Math.cos(a) - y * Math.sin(a));
      const yz = s * (x * Math.sin(a) + y * Math.cos(a));
      return Math.min(l / 2 - Math.abs(xz), h / 2 - Math.abs(yz));
    }),
  );
}

describe("echelleRecadrage étendue (image d'autres dimensions que le cadre)", () => {
  it("sans image donnée : la formule de « Pivoter », au bit près", () => {
    for (const a of [-45, -8, 0, 1, 8, 45]) {
      expect(echelleRecadrage(1200, 1600, a, { largeur: 1200, hauteur: 1600 })).toBe(echelleRecadrage(1200, 1600, a));
    }
  });

  it("une image plus grande que le cadre a besoin de moins d'agrandissement", () => {
    expect(echelleRecadrage(1104, 1504, 0, { largeur: 1200, hauteur: 1600 })).toBeCloseTo(0.94, 10);
    expect(echelleRecadrage(1104, 1504, 8, { largeur: 1200, hauteur: 1600 })).toBeLessThan(echelleRecadrage(1104, 1504, 8));
  });

  it("echelleContenue est l'inverse exact pour une image au format du cadre", () => {
    for (const a of [-45, -8, 0, 8, 45]) expect(echelleContenue(1200, 1600, a)).toBeCloseTo(1 / echelleRecadrage(1200, 1600, a), 12);
  });

  it("refuse des dimensions nulles ou un angle qui n'est pas un nombre", () => {
    expect(() => echelleRecadrage(100, 100, 8, { largeur: 0, hauteur: 100 })).toThrow(RangeError);
    expect(() => echelleContenue(100, 100, Number.NaN)).toThrow(RangeError);
  });
});

describe("geometrieRetouche — angles 0, ±8, ±45 ; deux modes ; recadrage 0 / 15 / 30 ; cadre", () => {
  const FORMATS = [
    [1200, 1600],
    [1600, 1200],
    [1600, 1600],
    [300, 400],
  ] as const;
  const ANGLES = [0, 8, -8, 45, -45];

  it("zoom : aucun coin vide, juste assez sans recadrage, à tout angle, format, cadre", () => {
    for (const [L, H] of FORMATS) {
      for (const angle of ANGLES) {
        for (const cadre of [null, BEIGE, { couleur: "#111413", epaisseurPct: 15, adoucissement: 0 }]) {
          for (const recadragePct of [0, 15, 30]) {
            const g = geometrieRetouche(L, H, r({ angle, modeRotation: "zoom", recadragePct, cadre }));
            const m = margeCouverture(L, H, g.interieur.largeur, g.interieur.hauteur, angle, g.echelle);
            const cas = `${L}×${H} ${angle}° r${recadragePct} ${cadre ? cadre.epaisseurPct : "-"}`;
            expect(m, cas).toBeGreaterThanOrEqual(-1e-6);
            // Sans recadrage : un coin touche le bord (le minimum, pas plus).
            if (recadragePct === 0) expect(m, cas).toBeLessThan(1e-6);
          }
        }
      }
    }
  });

  it("bords blancs : l'image ENTIÈRE est visible, juste assez grande, à tout angle, format, cadre", () => {
    for (const [L, H] of FORMATS) {
      for (const angle of ANGLES) {
        for (const cadre of [null, BEIGE, { couleur: "#ffffff", epaisseurPct: 15, adoucissement: 100 }]) {
          const g = geometrieRetouche(L, H, r({ angle, modeRotation: "bordsBlancs", cadre }));
          const m = margeImageEntiere(L, H, g.interieur.largeur, g.interieur.hauteur, angle, g.echelle);
          const cas = `${L}×${H} ${angle}° ${cadre ? cadre.epaisseurPct : "-"}`;
          expect(m, cas).toBeGreaterThanOrEqual(-1e-6);
          expect(m, cas).toBeLessThan(1e-6);
        }
      }
    }
  });

  it("recadrer resserre sur le centre : 15 % → ×1/0,85, 30 % → ×1/0,7, dans les deux modes", () => {
    for (const modeRotation of ["zoom", "bordsBlancs"] as const) {
      const base = geometrieRetouche(1200, 1600, r({ angle: 8, modeRotation })).echelle;
      expect(geometrieRetouche(1200, 1600, r({ angle: 8, modeRotation, recadragePct: 15 })).echelle).toBeCloseTo(base / 0.85, 10);
      expect(geometrieRetouche(1200, 1600, r({ angle: 8, modeRotation, recadragePct: 30 })).echelle).toBeCloseTo(base / 0.7, 10);
    }
    // À 0°, sans cadre : seul le recadrage agrandit.
    expect(geometrieRetouche(1200, 1600, r({ recadragePct: 30 })).echelle).toBeCloseTo(1 / 0.7, 12);
  });

  it("« angle seul, zoom » est exactement « Pivoter » : même échelle, même zone, même CSS", () => {
    for (const angle of [-45, -8, 1, 8, 45]) {
      const g = geometrieRetouche(1200, 1600, retoucheDePivot(angle));
      expect(g.echelle).toBe(echelleRecadrage(1200, 1600, angle));
      expect(g.interieur).toEqual({ x: 0, y: 0, largeur: 1200, hauteur: 1600 });
      const ancienne = zoneRecadree(1200, 1600, angle, 1450, 1750);
      expect(zoneDeRendu(g, 1450, 1750)).toEqual({ left: ancienne.left, top: ancienne.top, width: ancienne.width, height: ancienne.height });
      expect(styleApercu(g).image.transform).toBe(`translate(-50%, -50%) ${transformApercu(1200, 1600, angle).replace(/scale\(([\d.]+)\)/, (_m, s) => `scale(${Number(Number(s).toFixed(6))})`)}`);
    }
  });

  it("cadre : épaisseur en % de la largeur, la même sur les quatre côtés, arrondie au pixel", () => {
    const g = geometrieRetouche(1200, 1600, r({ cadre: BEIGE }));
    expect(g.epaisseurPx).toBe(48);
    expect(g.interieur).toEqual({ x: 48, y: 48, largeur: 1104, hauteur: 1504 });
    expect(g.couleurCadre).toBe("#e6dccb");
    // Sans cadre, ou à 0 % : toute la photo.
    expect(geometrieRetouche(1200, 1600, r({})).epaisseurPx).toBe(0);
    expect(geometrieRetouche(1200, 1600, r({ cadre: { ...BEIGE, epaisseurPct: 0 } })).epaisseurPx).toBe(0);
  });

  it("bord adouci : 0 = net (null) ; sinon étalement = écart-type = 0,04 % × n de la largeur", () => {
    expect(geometrieRetouche(1200, 1600, r({ cadre: { ...BEIGE, adoucissement: 0 } })).adoucissement).toBeNull();
    const g = geometrieRetouche(1200, 1600, r({ cadre: BEIGE }));
    expect(g.adoucissement?.etalementPx).toBeCloseTo(16.8, 10);
    expect(g.adoucissement?.sigmaPx).toBeCloseTo(16.8, 10);
    expect(geometrieRetouche(1600, 1200, r({ cadre: { ...BEIGE, adoucissement: 100 } })).adoucissement?.etalementPx).toBeCloseTo(64, 10);
  });

  it("annonce l'agrandissement de la seule rotation : ×1,18 à 8° en zoom, 1 / 1,18 en bords blancs", () => {
    expect(geometrieRetouche(1200, 1600, r({ angle: 8 })).agrandissementRotation).toBeCloseTo(1.1758322, 6);
    expect(geometrieRetouche(1200, 1600, r({ angle: 8, modeRotation: "bordsBlancs" })).agrandissementRotation).toBeCloseTo(1 / 1.1758322, 6);
  });

  it("refuse des dimensions invalides", () => {
    expect(() => geometrieRetouche(0, 100, RETOUCHE_NEUTRE)).toThrow(RangeError);
    expect(() => geometrieRetouche(100, Number.NaN, RETOUCHE_NEUTRE)).toThrow(RangeError);
  });
});

describe("zoneDeRendu", () => {
  it("zoom : bornée à l'image tournée, réduite de la marge", () => {
    const g = geometrieRetouche(300, 400, r({ angle: 8, recadragePct: 15 }));
    const z = zoneDeRendu(g, 360, 440);
    expect(z.left).toBeGreaterThanOrEqual(0);
    expect(z.top).toBeGreaterThanOrEqual(0);
    expect(z.left + z.width).toBeLessThanOrEqual(360);
    expect(z.width).toBe(Math.floor(300 / g.echelle - 4));
  });

  it("bords blancs : déborde de l'image tournée (left / top négatifs = du blanc autour), sans marge", () => {
    const g = geometrieRetouche(300, 400, r({ angle: 45, modeRotation: "bordsBlancs" }));
    // Boîte englobante d'un 300 × 400 tourné de 45° : ~495 × 495.
    const z = zoneDeRendu(g, 495, 495);
    expect(z.width).toBe(Math.floor(300 / g.echelle));
    expect(z.height).toBeGreaterThan(495);
    expect(z.top).toBeLessThan(0);
  });
});

describe("styleApercu", () => {
  it("sans retouche : rien ne bouge", () => {
    const s = styleApercu(geometrieRetouche(600, 800, RETOUCHE_NEUTRE));
    expect(s.image).toEqual({ left: "50%", top: "50%", width: "100%", height: "100%", transform: "translate(-50%, -50%)" });
    expect(s.interieur.inset).toBe("0cqw");
    expect(s.conteneur.aspectRatio).toBe("600 / 800");
  });

  it("cadre beige 4 %, −3°, bords blancs : retrait en cqw, image à la taille de l'original, même échelle que le rendu", () => {
    const g = geometrieRetouche(600, 800, r({ angle: -3, modeRotation: "bordsBlancs", cadre: BEIGE }));
    const s = styleApercu(g);
    expect(s.conteneur.background).toBe("#e6dccb");
    expect(s.interieur).toEqual({ inset: "4cqw", background: "#ffffff" });
    expect(s.image.width).toBe(`${Number(((600 / 552) * 100).toFixed(4))}%`);
    expect(s.image.height).toBe(`${Number(((800 / 752) * 100).toFixed(4))}%`);
    expect(s.image.transform).toBe(`translate(-50%, -50%) rotate(-3deg) scale(${Number(g.echelle.toFixed(6))})`);
  });
});

describe("bord adouci (profil et calque)", () => {
  it("net : la photo entière, aucun voile", () => {
    expect([...profilAdoucissement(5, 0, 0)]).toEqual([1, 1, 1, 1, 1]);
    expect(masqueAdoucissement(4, 3, 0, 0).every((a) => a === 0)).toBe(true);
  });

  it("adouci : couleur du cadre au bord, photo au centre, symétrique, monotone", () => {
    const p = profilAdoucissement(200, 10, 10);
    expect(p[0]).toBeLessThan(0.25);
    expect(p[100]).toBeGreaterThan(0.999);
    for (let i = 0; i < 100; i++) {
      expect(p[i]).toBeCloseTo(p[199 - i], 12);
      expect(p[i + 1]).toBeGreaterThanOrEqual(p[i]);
    }
    // À la distance de l'étalement, la moitié (définition d'un flou gaussien d'un bord).
    expect(profilAdoucissement(1000, 100, 30)[99]).toBeCloseTo(0.5, 1);
    const m = masqueAdoucissement(200, 100, 10, 10);
    expect(m[0]).toBeGreaterThan(200); // coin : presque tout le cadre
    expect(m[50 * 200 + 100]).toBe(0); // centre : la photo
  });

  it("un étalement plus grand que la moitié de la zone la couvre entièrement", () => {
    expect([...profilAdoucissement(10, 6, 0)].every((v) => v === 0)).toBe(true);
  });
});

describe("lireRetouche / normaliser / clé / libellé", () => {
  it("lit une retouche valide et la normalise", () => {
    expect(lireRetouche({ angle: -3, modeRotation: "bordsBlancs", recadragePct: 15, cadre: { couleur: "#E6DCCB", epaisseurPct: 4, adoucissement: 35 } })).toEqual({
      angle: -3,
      modeRotation: "bordsBlancs",
      recadragePct: 15,
      cadre: BEIGE,
    });
  });

  it("refuse tout écart : type, plage, entier, couleur, champ manquant", () => {
    const ok = { angle: 8, modeRotation: "zoom", recadragePct: 0, cadre: null };
    for (const v of [
      null,
      "x",
      [],
      { ...ok, angle: 46 },
      { ...ok, angle: 8.5 },
      { ...ok, angle: "8" },
      { ...ok, modeRotation: "blanc" },
      { ...ok, recadragePct: -1 },
      { ...ok, recadragePct: 31 },
      { ...ok, cadre: undefined },
      { ...ok, cadre: { couleur: "#fff", epaisseurPct: 4, adoucissement: 35 } },
      { ...ok, cadre: { couleur: "#ffffff", epaisseurPct: 16, adoucissement: 35 } },
      { ...ok, cadre: { couleur: "#ffffff", epaisseurPct: 4, adoucissement: 101 } },
      { ...ok, cadre: { couleur: "#ffffff", epaisseurPct: 4 } },
    ]) {
      expect(lireRetouche(v), JSON.stringify(v)).toBeNull();
    }
  });

  it("deux réglages qui rendent la même image ont la même clé", () => {
    // Sans rotation ni cadre épais, le mode ne change rien.
    expect(cleRetouche(r({ modeRotation: "bordsBlancs", recadragePct: 10 }))).toBe(cleRetouche(r({ recadragePct: 10 })));
    // Un cadre de 0 % sans adoucissement n'existe pas.
    expect(normaliserRetouche(r({ angle: 8, cadre: { couleur: "#FFFFFF", epaisseurPct: 0, adoucissement: 0 } })).cadre).toBeNull();
    expect(cleRetouche(r({ angle: 8, cadre: { couleur: "#FFFFFF", epaisseurPct: 2, adoucissement: 0 } }))).toBe("a8|zoom|r0|c#ffffff/2/0");
    // Mais à 8°, zoom et bords blancs diffèrent.
    expect(cleRetouche(r({ angle: 8 }))).not.toBe(cleRetouche(r({ angle: 8, modeRotation: "bordsBlancs" })));
  });

  it("identité et « angle seul »", () => {
    expect(estIdentite(RETOUCHE_NEUTRE)).toBe(true);
    expect(estIdentite(r({ modeRotation: "bordsBlancs" }))).toBe(true);
    expect(estIdentite(r({ recadragePct: 1 }))).toBe(false);
    expect(estPivotSeul(retoucheDePivot(8))).toBe(true);
    expect(estPivotSeul(r({ angle: 8, modeRotation: "bordsBlancs" }))).toBe(false);
    expect(estPivotSeul(r({ angle: 8, cadre: BEIGE }))).toBe(false);
  });

  it("une copie pivotée d'avant la refonte (angleCopie seul) est reprise comme « angle seul, mode zoom »", () => {
    expect(retoucheDeCopie({ retouche: null, angleCopie: 8 })).toEqual({ angle: 8, modeRotation: "zoom", recadragePct: 0, cadre: null });
    expect(retoucheDeCopie({ retouche: { angle: -3, modeRotation: "bordsBlancs", recadragePct: 0, cadre: null }, angleCopie: null })).toEqual(
      r({ angle: -3, modeRotation: "bordsBlancs" }),
    );
    expect(retoucheDeCopie({ retouche: null, angleCopie: null })).toBeNull();
  });

  it("libellés", () => {
    expect(libelleRetouche(retoucheDePivot(8))).toBe("+8°");
    expect(libelleRetouche(r({ angle: -3, modeRotation: "bordsBlancs", recadragePct: 15, cadre: BEIGE }))).toBe("−3° bords blancs · recadrée 15 % · cadre beige");
    expect(libelleRetouche(r({ cadre: { couleur: "#c4553a", epaisseurPct: 4, adoucissement: 0 } }))).toBe("cadre #c4553a");
    expect(libelleRetouche(RETOUCHE_NEUTRE)).toBe("sans retouche");
  });
});
