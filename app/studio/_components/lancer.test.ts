import { describe, expect, it } from "vitest";

import { devisDuLancement, type ModeleImage } from "@/lib/studioModeles";

import { lireDevis } from "./lancer";

const m = (id: string, tarif: ModeleImage["tarif"]): ModeleImage => ({
  id,
  nom: id.toUpperCase(),
  description: "",
  maxReferences: 4,
  minReferences: 0,
  ratios: ["3:4"],
  tarif,
});

describe("lireDevis (the quote of a 409)", () => {
  it("reads back the server's multi-model quote as it was computed", () => {
    const devis = devisDuLancement({
      modeles: [m("cher", { kind: "image", sortieUsd: 0.134, entreeParImageUsd: 0.002 }), m("inconnu", { kind: "inconnu" })],
      nbCases: 3,
      budget: { budgetParSacEur: 0.3, tauxEurParUsd: 0.86 },
    });
    const lu = lireDevis(JSON.parse(JSON.stringify(devis)));
    expect(lu).toEqual(devis);
    // A missing amount stays unknown, never zero.
    expect(lu?.parModele[1]).toMatchObject({ usd: null, eur: null, raison: "inconnu" });
  });

  it("refuses a shape it cannot trust (the server's sentence is then shown alone)", () => {
    expect(lireDevis(null)).toBeNull();
    expect(lireDevis({ lignes: [], totalConnuUsd: 0, inconnus: 0 })).toBeNull();
    expect(lireDevis({ lignes: [], totalConnuUsd: 0, inconnus: 0, totalConnuEur: 0, budgetEur: 1, tauxEurParUsd: 0.86, montantConfirmationEur: 0, parModele: [{}] })).toBeNull();
  });
});
