import { describe, expect, it } from "vitest";
import { MAPPINGS_VINTED, pickVintedMapping } from "@/lib/vintedMapping";

describe("pickVintedMapping", () => {
  it("trouve le sac à dos Nike", () => {
    const m = pickVintedMapping("Nike", "Sac à dos");
    expect(m?.categoryId).toBe(157);
    expect(m?.brandId).toBe(53);
    expect(m?.packageType).toBe(1);
    expect(m?.unisex).toBe(true);
    expect(m?.materiauxDefaut).toEqual(["Polyester", "Nylon"]);
    expect(m?.aUneTaille).toBe(false);
    expect(m?.filAriane).toBe("Femmes > Sacs");
  });

  it("ignore la casse et les espaces de bord", () => {
    expect(pickVintedMapping("  nike ", "SAC À DOS")?.categoryId).toBe(157);
  });

  it("exige les deux critères", () => {
    expect(pickVintedMapping("Nike", "Polo")).toBeNull();
    expect(pickVintedMapping("Adidas", "Sac à dos")).toBeNull();
  });

  it("renvoie null sur une saisie vide", () => {
    expect(pickVintedMapping("", "")).toBeNull();
  });

  it("ne vise jamais la catégorie 246, celle du rayon Hommes", () => {
    expect(MAPPINGS_VINTED.some((m) => m.categoryId === 246)).toBe(false);
  });
});
