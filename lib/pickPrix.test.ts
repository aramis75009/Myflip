import { describe, expect, it } from "vitest";
import { pickPrix } from "./pickPrix";
import type { PrixReferenceDTO } from "./types";

function ref(p: Partial<PrixReferenceDTO>): PrixReferenceDTO {
  return {
    id: "id",
    marque: null,
    categorie: null,
    prix: 0,
    estDefaut: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...p,
  };
}

describe("pickPrix", () => {
  it("choisit la correspondance exacte marque + catégorie", () => {
    const refs = [
      ref({ marque: "Tommy Hilfiger", categorie: "Pull", prix: 22 }),
      ref({ marque: "Tommy Hilfiger", categorie: null, prix: 18 }),
      ref({ marque: null, categorie: null, prix: 10, estDefaut: true }),
    ];
    expect(pickPrix(refs, "Tommy Hilfiger", "Pull")?.prix).toBe(22);
  });

  it("retombe sur la marque seule si pas de correspondance catégorie", () => {
    const refs = [
      ref({ marque: "Ralph Lauren", categorie: null, prix: 24 }),
      ref({ marque: null, categorie: null, prix: 10, estDefaut: true }),
    ];
    expect(pickPrix(refs, "Ralph Lauren", "Short")?.prix).toBe(24);
  });

  it("retombe sur la catégorie seule si pas de correspondance marque", () => {
    const refs = [
      ref({ marque: null, categorie: "Polo", prix: 15 }),
      ref({ marque: null, categorie: null, prix: 10, estDefaut: true }),
    ];
    expect(pickPrix(refs, "Marque Inconnue", "Polo")?.prix).toBe(15);
  });

  it("retombe sur le prix par défaut si rien ne correspond", () => {
    const refs = [ref({ marque: null, categorie: null, prix: 10, estDefaut: true })];
    expect(pickPrix(refs, "Inconnu", "Inconnu")?.prix).toBe(10);
  });

  it("renvoie null si la liste est vide", () => {
    expect(pickPrix([], "Nike", "Short")).toBeNull();
  });

  it("renvoie null si rien ne correspond et pas de défaut", () => {
    const refs = [ref({ marque: "Nike", categorie: "Short", prix: 20 })];
    expect(pickPrix(refs, "Adidas", "Polo")).toBeNull();
  });
});
