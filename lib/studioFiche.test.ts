import { describe, expect, it } from "vitest";
import { estDoublon, estOrigine, estRole, planRattachement, roleSuggere } from "./studioFiche";

describe("roleSuggere", () => {
  it("follows the loading order, then falls back to detail", () => {
    expect([0, 1, 2, 3, 4, 5, 12].map(roleSuggere)).toEqual(["face", "dos", "cote", "detail", "ouvert", "detail", "detail"]);
  });

  it("never throws on odd positions", () => {
    expect(roleSuggere(-1)).toBe("detail");
    expect(roleSuggere(1.5)).toBe("detail");
    expect(roleSuggere(Number.NaN)).toBe("detail");
  });
});

describe("guards", () => {
  it("accept only the closed values", () => {
    expect(estRole("face")).toBe(true);
    expect(estRole("Face")).toBe(false);
    expect(estOrigine("mise_en_vente")).toBe(true);
    expect(estOrigine("api")).toBe(false);
  });
});

describe("planRattachement", () => {
  it("attaches only orphans whose SKU is in the catalogue", () => {
    const index = new Map([["SDN1", "5039-black-pink"], ["SDN2", "5039-flower-green"]]);
    expect(
      planRattachement(
        [
          { id: "r1", sku: "SDN1" },
          { id: "r2", sku: "SDN9" },
          { id: "r3", sku: null },
          { id: "r4", sku: "SDN2" },
        ],
        index,
      ),
    ).toEqual([
      { id: "r1", cle: "5039-black-pink" },
      { id: "r4", cle: "5039-flower-green" },
    ]);
  });
});

describe("estDoublon", () => {
  it("is two bags or more at home", () => {
    expect([0, 1, 2, 3].map(estDoublon)).toEqual([false, false, true, true]);
  });
});
