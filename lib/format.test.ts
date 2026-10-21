import { describe, expect, it } from "vitest";

import { dateCourte, eur, majusculeInitiale, niveauCoef, pluriel, signedEur, ton } from "./format";

const NBSP = " ";
const NNBSP = " ";
const MOINS = "−";

describe("format", () => {
  it("eur: French currency, two decimals", () => {
    expect(eur(19.45).replace(NNBSP, " ")).toBe(`19,45${NBSP}€`);
    expect(eur(1234.5).replace(NNBSP, " ")).toBe(`1 234,50${NBSP}€`);
  });

  it("signedEur: real minus sign, explicit plus, no sign on zero", () => {
    expect(signedEur(-19.45)).toBe(`${MOINS}19,45${NBSP}€`);
    expect(signedEur(12)).toBe(`+12,00${NBSP}€`);
    expect(signedEur(0)).toBe(`0,00${NBSP}€`);
  });

  it("ton", () => {
    expect(ton(3)).toBe("pos");
    expect(ton(-0.01)).toBe("neg");
    expect(ton(0)).toBe("neutre");
  });

  it("pluriel follows French rules (0, 1 and 1.5 are singular)", () => {
    expect(pluriel(1, "vendu", "vendus")).toBe("1 vendu");
    expect(pluriel(0.6, "vente", "ventes")).toBe("0,6 vente");
    expect(pluriel(1.5, "vente", "ventes")).toBe("1,5 vente");
    expect(pluriel(0, "vente", "ventes")).toBe("0 vente");
    expect(pluriel(2, "vendu", "vendus")).toBe("2 vendus");
  });

  it("niveauCoef", () => {
    expect(niveauCoef(2.3).libelle).toBe("objectif tenu");
    expect(niveauCoef(2.3).ton).toBe("pos");
    expect(niveauCoef(2.1)).toEqual({ ton: "warn", libelle: "proche" });
    expect(niveauCoef(1.4)).toEqual({ ton: "neg", libelle: "faible" });
    expect(niveauCoef(null).ton).toBe("neutre");
    expect(niveauCoef(null).libelle).toBe("—");
  });

  it("majusculeInitiale", () => {
    expect(majusculeInitiale("samedi 3 octobre")).toBe("Samedi 3 octobre");
    expect(majusculeInitiale("")).toBe("");
  });

  it("dateCourte (Paris day)", () => {
    expect(dateCourte("2026-10-03T12:00:00Z")).toBe("03/10/2026");
    expect(dateCourte(new Date("2026-12-31T23:30:00Z"))).toBe("01/01/2027");
  });
});
