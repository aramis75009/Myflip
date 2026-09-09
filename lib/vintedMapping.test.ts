import { describe, expect, it } from "vitest";
import { MAPPINGS_VINTED, pickVintedMapping } from "@/lib/vintedMapping";

describe("pickVintedMapping", () => {
  it("trouve le sac à dos Nike", () => {
    const m = pickVintedMapping("Nike", "Sac à dos");
    expect(m?.categoryId).toBe(246);
    expect(m?.brandId).toBe(53);
    expect(m?.packageType).toBe(1);
    expect(m?.unisex).toBe(true);
    expect(m?.materiauxDefaut).toEqual(["Polyester", "Nylon"]);
    expect(m?.aUneTaille).toBe(false);
    expect(m?.filAriane).toBe("Hommes > Accessoires > Sacs et sacoches");
  });

  it("ignore la casse et les espaces de bord", () => {
    expect(pickVintedMapping("  nike ", "SAC À DOS")?.categoryId).toBe(246);
  });

  it("exige les deux critères", () => {
    expect(pickVintedMapping("Nike", "Polo")).toBeNull();
    expect(pickVintedMapping("Adidas", "Sac à dos")).toBeNull();
  });

  it("renvoie null sur une saisie vide", () => {
    expect(pickVintedMapping("", "")).toBeNull();
  });

  // Les deux feuilles portent le même libellé « Sacs à dos » : seul l'id les
  // distingue, et se tromper range tous les sacs dans le mauvais rayon sans
  // la moindre erreur visible. 157 est celle qu'on ne vise PAS.
  it("ne vise jamais la catégorie 157, celle du rayon Femmes", () => {
    expect(MAPPINGS_VINTED.some((m) => m.categoryId === 157)).toBe(false);
  });
});
