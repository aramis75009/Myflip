import { describe, expect, it } from "vitest";
import { pickPrompt } from "./promptSelect";
import type { PromptTemplateDTO } from "./types";

function tmpl(p: Partial<PromptTemplateDTO>): PromptTemplateDTO {
  return {
    id: "id",
    nom: "Prompt",
    marque: null,
    categorie: null,
    contenu: "Rédige une annonce.",
    estDefaut: false,
    prixReference: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...p,
  };
}

describe("pickPrompt — la cascade", () => {
  it("choisit la correspondance exacte marque + catégorie", () => {
    const prompts = [
      tmpl({ id: "a", marque: "Tommy Hilfiger", categorie: "Pull" }),
      tmpl({ id: "b", marque: "Tommy Hilfiger", categorie: null }),
      tmpl({ id: "c", estDefaut: true }),
    ];
    expect(pickPrompt(prompts, "Tommy Hilfiger", "Pull")?.id).toBe("a");
  });

  it("retombe sur la marque seule si pas de correspondance catégorie", () => {
    const prompts = [
      tmpl({ id: "a", marque: "Ralph Lauren", categorie: null }),
      tmpl({ id: "b", estDefaut: true }),
    ];
    expect(pickPrompt(prompts, "Ralph Lauren", "Short")?.id).toBe("a");
  });

  it("retombe sur la catégorie seule si pas de correspondance marque", () => {
    const prompts = [
      tmpl({ id: "a", marque: null, categorie: "Polo" }),
      tmpl({ id: "b", estDefaut: true }),
    ];
    expect(pickPrompt(prompts, "Marque Inconnue", "Polo")?.id).toBe("a");
  });

  it("retombe sur le prompt par défaut si rien ne correspond", () => {
    const prompts = [tmpl({ id: "d", estDefaut: true })];
    expect(pickPrompt(prompts, "Inconnu", "Inconnu")?.id).toBe("d");
  });

  it("renvoie null si la liste est vide", () => {
    expect(pickPrompt([], "Nike", "Short")).toBeNull();
  });

  it("renvoie null si rien ne correspond et qu'aucun défaut n'existe", () => {
    const prompts = [tmpl({ id: "a", marque: "Nike", categorie: "Short" })];
    expect(pickPrompt(prompts, "Adidas", "Polo")).toBeNull();
  });

  it("ignore la casse et les espaces, des deux côtés", () => {
    const prompts = [tmpl({ id: "a", marque: "  NIKE ", categorie: "Sac à dos" })];
    expect(pickPrompt(prompts, "nike", "  sac à dos")?.id).toBe("a");
  });
});

describe("pickPrompt — le prix porté par le prompt", () => {
  it("rend le prix du prompt retenu", () => {
    const prompts = [
      tmpl({ id: "a", marque: "Nike", categorie: "Sac à dos", prixReference: 24.5 }),
      tmpl({ id: "b", estDefaut: true, prixReference: 10 }),
    ];
    expect(pickPrompt(prompts, "Nike", "Sac à dos")?.prixReference).toBe(24.5);
  });

  it("rend null quand le prompt retenu n'a pas de prix", () => {
    const prompts = [tmpl({ id: "a", marque: "Nike", categorie: "Sac à dos" })];
    expect(pickPrompt(prompts, "Nike", "Sac à dos")?.prixReference).toBeNull();
  });
});
