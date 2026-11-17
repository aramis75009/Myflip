import { describe, expect, it } from "vitest";

import { retoucheDeCopie, RETOUCHE_NEUTRE, type Retouche } from "./studioRetouche";
import { couleurLisible, ligneReglages, listeNumeros, texteRetouche, TEXTE_INCONNUS, TEXTE_ORIGINE, TEXTE_VARIES } from "./studioReglagesVersion";

const r = (p: Partial<Retouche> = {}): Retouche => ({ angle: 0, modeRotation: "zoom", recadragePct: 0, cadre: null, ...p });
const BEIGE = { couleur: "#e6dccb", epaisseurPct: 4, adoucissement: 35 };

describe("texteRetouche — les réglages d'une retouche, sans les réglages neutres", () => {
  it("l'exemple de la maquette : pivoté, recadré, cadre beige adouci", () => {
    expect(texteRetouche(r({ angle: 8, recadragePct: 10, cadre: BEIGE }))).toBe("Pivoté 8° (zoom) · Recadré 10 % · Cadre beige 4 %, bord adouci 35 %");
  });

  it("rien de réglé : « Photos d’origine » (jamais « Sans cadre » tout seul)", () => {
    expect(texteRetouche(RETOUCHE_NEUTRE)).toBe("Photos d’origine");
    expect(texteRetouche(r())).toBe(TEXTE_ORIGINE);
    // Un cadre d'épaisseur 0 sans adoucissement ne fait rien : il disparaît à la normalisation.
    expect(texteRetouche(r({ cadre: { couleur: "#ffffff", epaisseurPct: 0, adoucissement: 0 } }))).toBe("Photos d’origine");
    // Le mode ne dit rien sans rotation.
    expect(texteRetouche(r({ modeRotation: "bordsBlancs" }))).toBe("Photos d’origine");
  });

  it("omet la rotation à 0° et le recadrage à 0 %", () => {
    expect(texteRetouche(r({ recadragePct: 10, cadre: BEIGE }))).toBe("Recadré 10 % · Cadre beige 4 %, bord adouci 35 %");
    expect(texteRetouche(r({ angle: -3, cadre: BEIGE }))).toBe("Pivoté −3° (zoom) · Cadre beige 4 %, bord adouci 35 %");
  });

  it("« Sans cadre » quand le cadre est éteint ET que autre chose est réglé", () => {
    expect(texteRetouche(r({ angle: 8 }))).toBe("Pivoté 8° (zoom) · Sans cadre");
    expect(texteRetouche(r({ recadragePct: 15 }))).toBe("Recadré 15 % · Sans cadre");
    expect(texteRetouche(r({ angle: -12, modeRotation: "bordsBlancs", recadragePct: 5 }))).toBe("Pivoté −12° (bords blancs) · Recadré 5 % · Sans cadre");
  });

  it("le cadre seul : pas de « Sans cadre », bord adouci omis à 0", () => {
    expect(texteRetouche(r({ cadre: BEIGE }))).toBe("Cadre beige 4 %, bord adouci 35 %");
    expect(texteRetouche(r({ cadre: { ...BEIGE, adoucissement: 0 } }))).toBe("Cadre beige 4 %");
  });

  it("la couleur : nom de pastille (Blanc, Noir, Gris, Beige), ou code d'une couleur libre", () => {
    for (const [hex, nom] of [["#ffffff", "blanc"], ["#111413", "noir"], ["#9aa39e", "gris"], ["#e6dccb", "beige"]] as const) {
      expect(texteRetouche(r({ cadre: { couleur: hex, epaisseurPct: 6, adoucissement: 0 } })), hex).toBe(`Cadre ${nom} 6 %`);
    }
    expect(texteRetouche(r({ cadre: { couleur: "#C4553A", epaisseurPct: 3, adoucissement: 20 } }))).toBe("Cadre #c4553a 3 %, bord adouci 20 %");
    expect(couleurLisible("#E6DCCB")).toBe("beige");
    expect(couleurLisible("#123456")).toBe("#123456");
  });

  it("une copie « Pivoter » d'avant la refonte : l'angle seul, en zoom", () => {
    expect(texteRetouche(retoucheDeCopie({ retouche: null, angleCopie: 5 })!)).toBe("Pivoté 5° (zoom) · Sans cadre");
  });
});

describe("listeNumeros", () => {
  it("resserre les suites de trois ou plus", () => {
    expect(listeNumeros([1])).toBe("1");
    expect(listeNumeros([1, 2])).toBe("1, 2");
    expect(listeNumeros([1, 2, 3])).toBe("1 à 3");
    expect(listeNumeros([1, 2, 3, 5])).toBe("1 à 3, 5");
    expect(listeNumeros([6, 4, 5, 1])).toBe("1, 4 à 6");
  });
});

describe("ligneReglages — la ligne d'une version", () => {
  const pivot8 = r({ angle: 8 });

  it("un lot : les mêmes réglages sur toutes les photos, la ligne les dit, sans détail", () => {
    const lot = Array.from({ length: 6 }, () => r({ angle: 8, recadragePct: 10, cadre: BEIGE }));
    expect(ligneReglages(lot)).toEqual({ texte: "Pivoté 8° (zoom) · Recadré 10 % · Cadre beige 4 %, bord adouci 35 %", detail: null });
  });

  it("deux écritures du même réglage (couleur en capitales ou non) ne font pas « variés »", () => {
    const majuscules = r({ cadre: { couleur: "#E6DCCB", epaisseurPct: 4, adoucissement: 35 } });
    const minuscules = r({ cadre: BEIGE });
    expect(ligneReglages([majuscules, minuscules, majuscules])).toEqual({ texte: "Cadre beige 4 %, bord adouci 35 %", detail: null });
  });

  it("sans aucun réglage : « Photos d’origine » (la version reprend les originales)", () => {
    expect(ligneReglages([RETOUCHE_NEUTRE, RETOUCHE_NEUTRE])).toEqual({ texte: "Photos d’origine", detail: null });
  });

  it("des réglages différents : « Réglages variés » et le détail photo par photo, dans l'ordre", () => {
    const ligne = ligneReglages([pivot8, pivot8, pivot8, r({ angle: -3 }), RETOUCHE_NEUTRE]);
    expect(ligne).toEqual({
      texte: "Réglages variés",
      detail: ["Photos 1 à 3 : Pivoté 8° (zoom) · Sans cadre", "Photo 4 : Pivoté −3° (zoom) · Sans cadre", "Photo 5 : Photos d’origine"].join("\n"),
    });
  });

  it("des copies « Pivoter » d'angles différents", () => {
    const ligne = ligneReglages([r({ angle: 2 }), r({ angle: 5 }), r({ angle: 2 })]);
    expect(ligne?.texte).toBe("Réglages variés");
    expect(ligne?.detail).toBe(["Photos 1, 3 : Pivoté 2° (zoom) · Sans cadre", "Photo 2 : Pivoté 5° (zoom) · Sans cadre"].join("\n"));
  });

  it("une copie dont les réglages ne se relisent pas (null) : « Réglages inconnus », ou variés avec les autres", () => {
    expect(ligneReglages([null, null])).toEqual({ texte: TEXTE_INCONNUS, detail: null });
    expect(ligneReglages([pivot8, null])).toEqual({
      texte: TEXTE_VARIES,
      detail: ["Photo 1 : Pivoté 8° (zoom) · Sans cadre", `Photo 2 : ${TEXTE_INCONNUS}`].join("\n"),
    });
  });

  it("une version sans photo n'a pas de ligne", () => {
    expect(ligneReglages([])).toBeNull();
  });
});
