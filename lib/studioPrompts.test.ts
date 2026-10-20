import { describe, expect, it } from "vitest";
import { LONGUEUR_MAX_MAITRE, LONGUEUR_MAX_NOM, lirePromptMaitreSaisi, lireSaisieAngle } from "./studioPrompts";

describe("lireSaisieAngle", () => {
  it("nettoie un prompt d'angle valide", () => {
    expect(lireSaisieAngle({ nom: " 8° à droite ", angle: " Angle: camera about 8° to the right. " })).toEqual({
      nom: "8° à droite",
      angle: "Angle: camera about 8° to the right.",
    });
  });
  it("refuse un nom ou un texte vide, ou trop long", () => {
    expect(lireSaisieAngle({ nom: " ", angle: "x" })).toHaveProperty("erreur");
    expect(lireSaisieAngle({ nom: "x", angle: "" })).toHaveProperty("erreur");
    expect(lireSaisieAngle({ nom: "x".repeat(LONGUEUR_MAX_NOM + 1), angle: "x" })).toHaveProperty("erreur");
    expect(lireSaisieAngle(null)).toHaveProperty("erreur");
  });
});

describe("lirePromptMaitreSaisi", () => {
  it("accepte un prompt vide (le Studio n'envoie alors que l'angle)", () => {
    expect(lirePromptMaitreSaisi({ promptMaitre: "  " })).toBe("");
  });
  it("refuse ce qui n'est pas une chaîne, ou trop long", () => {
    expect(lirePromptMaitreSaisi({ promptMaitre: 3 })).toHaveProperty("erreur");
    expect(lirePromptMaitreSaisi({ promptMaitre: "x".repeat(LONGUEUR_MAX_MAITRE + 1) })).toHaveProperty("erreur");
  });
});
