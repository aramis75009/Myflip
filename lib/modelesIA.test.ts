import { describe, expect, it } from "vitest";
import {
  champModele,
  effortReflexion,
  estFournisseurIA,
  estModeleHorsCatalogue,
  FOURNISSEUR_PAR_DEFAUT,
  fournisseurEffectif,
  libelleModeleIA,
  libelleOption,
  MODELE_CHAT_OLLAMA_PAR_DEFAUT,
  MODELE_CHAT_PAR_DEFAUT,
  MODELE_OLLAMA_PAR_DEFAUT,
  MODELE_PAR_DEFAUT,
  modeleChoisi,
  modeleParDefaut,
  MODELES_CHAT_OLLAMA_PROPOSES,
  MODELES_CHAT_PROPOSES,
  MODELES_OLLAMA_PROPOSES,
  MODELES_PROPOSES,
  modelesProposes,
} from "./modelesIA";

describe("catalogue Ollama Cloud", () => {
  it("contient les trois modèles décidés, deepseek-v4.1-flash en tête", () => {
    expect(MODELES_OLLAMA_PROPOSES.map((m) => m.id)).toEqual(["deepseek-v4.1-flash", "gemma4:31b", "glm-5.3-flash"]);
  });

  it("n'accepte pour les annonces que des modèles qui lisent les images", () => {
    // Sans vision, une génération échoue à chaque fois, pas une fois sur dix.
    expect(MODELES_OLLAMA_PROPOSES.length).toBeGreaterThan(0);
    for (const m of MODELES_OLLAMA_PROPOSES) expect(m.vision, m.id).toBe(true);
  });

  it("n'accepte pour l'assistant que des modèles qui appellent des outils", () => {
    expect(MODELES_CHAT_OLLAMA_PROPOSES.length).toBeGreaterThan(0);
    for (const m of MODELES_CHAT_OLLAMA_PROPOSES) expect(m.tools, m.id).toBe(true);
  });

  it("propose les mêmes modèles à l'assistant qu'aux annonces", () => {
    expect(MODELES_CHAT_OLLAMA_PROPOSES.map((m) => m.id)).toEqual(MODELES_OLLAMA_PROPOSES.map((m) => m.id));
  });

  it("a des identifiants uniques, sans préfixe de fournisseur (forme `nom` ou `nom:tag`)", () => {
    const ids = MODELES_OLLAMA_PROPOSES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id, id).not.toContain("/");
  });

  it("n'invente aucun prix : Ollama Cloud se paie au forfait", () => {
    for (const m of MODELES_OLLAMA_PROPOSES) expect(m.prix, m.id).toBeNull();
  });

  it("a son modèle par défaut dans chaque catalogue", () => {
    expect(MODELES_OLLAMA_PROPOSES.some((m) => m.id === MODELE_OLLAMA_PAR_DEFAUT)).toBe(true);
    expect(MODELES_CHAT_OLLAMA_PROPOSES.some((m) => m.id === MODELE_CHAT_OLLAMA_PAR_DEFAUT)).toBe(true);
  });

  it("garde le catalogue OpenRouter intact, avec son défaut", () => {
    // OpenRouter reste en secours ET sert le Studio : son défaut ne change pas.
    expect(MODELE_PAR_DEFAUT).toBe("google/gemini-3.6-flash");
    expect(MODELE_CHAT_PAR_DEFAUT).toBe("anthropic/claude-sonnet-4.6");
    expect(MODELES_PROPOSES.some((m) => m.id === MODELE_PAR_DEFAUT)).toBe(true);
    expect(MODELES_CHAT_PROPOSES.some((m) => m.id === MODELE_CHAT_PAR_DEFAUT)).toBe(true);
  });
});

describe("par défaut", () => {
  it("le fournisseur par défaut est Ollama Cloud", () => {
    expect(FOURNISSEUR_PAR_DEFAUT).toBe("ollama");
    expect(MODELE_OLLAMA_PAR_DEFAUT).toBe("deepseek-v4.1-flash");
    expect(MODELE_CHAT_OLLAMA_PAR_DEFAUT).toBe("deepseek-v4.1-flash");
  });

  it("fournisseurEffectif : rien, vide ou inconnu valent Ollama Cloud", () => {
    expect(fournisseurEffectif(null)).toBe("ollama");
    expect(fournisseurEffectif(undefined)).toBe("ollama");
    expect(fournisseurEffectif("")).toBe("ollama");
    expect(fournisseurEffectif("gemini")).toBe("ollama");
    expect(fournisseurEffectif("openrouter")).toBe("openrouter");
    expect(fournisseurEffectif("ollama")).toBe("ollama");
  });

  it("estFournisseurIA : liste fermée", () => {
    expect(estFournisseurIA("ollama")).toBe(true);
    expect(estFournisseurIA("openrouter")).toBe(true);
    expect(estFournisseurIA("OpenRouter")).toBe(false);
    expect(estFournisseurIA(null)).toBe(false);
  });

  it("modeleParDefaut : le défaut de chaque couple fournisseur / usage", () => {
    expect(modeleParDefaut("ollama", "annonce")).toBe("deepseek-v4.1-flash");
    expect(modeleParDefaut("ollama", "chat")).toBe("deepseek-v4.1-flash");
    expect(modeleParDefaut("openrouter", "annonce")).toBe("google/gemini-3.6-flash");
    expect(modeleParDefaut("openrouter", "chat")).toBe("anthropic/claude-sonnet-4.6");
  });
});

describe("modeleChoisi", () => {
  it("rien de choisi : Ollama Cloud et deepseek-v4.1-flash, pour les deux usages", () => {
    expect(modeleChoisi({}, "annonce")).toEqual({ fournisseur: "ollama", modele: "deepseek-v4.1-flash" });
    expect(modeleChoisi({}, "chat")).toEqual({ fournisseur: "ollama", modele: "deepseek-v4.1-flash" });
  });

  it("lit le modèle Ollama du compte, pas la colonne OpenRouter", () => {
    const brut = { modeleIA: "google/gemini-3.7-flash", modeleOllamaIA: "gemma4:31b" };
    expect(modeleChoisi(brut, "annonce")).toEqual({ fournisseur: "ollama", modele: "gemma4:31b" });
  });

  it("n'envoie jamais un identifiant OpenRouter à Ollama : un compte qui avait un modèle OpenRouter retombe sur le défaut Ollama", () => {
    // Cas réel : le compte d'Aramis avait `modeleIA = google/gemini-…` avant ce
    // changement. Sans colonne séparée, `google/gemini-…` partirait chez Ollama
    // et chaque génération échouerait en 404.
    const brut = { modeleIA: "google/gemini-3.7-flash", modeleChatIA: "anthropic/claude-haiku-4.5" };
    expect(modeleChoisi(brut, "annonce").modele).toBe("deepseek-v4.1-flash");
    expect(modeleChoisi(brut, "chat").modele).toBe("deepseek-v4.1-flash");
  });

  it("repli OpenRouter quand le compte l'a choisi : son fournisseur, son modèle", () => {
    const brut = {
      fournisseurIA: "openrouter",
      modeleIA: "google/gemini-3.7-flash",
      modeleChatIA: "anthropic/claude-haiku-4.5",
      modeleOllamaIA: "gemma4:31b",
    };
    expect(modeleChoisi(brut, "annonce")).toEqual({ fournisseur: "openrouter", modele: "google/gemini-3.7-flash" });
    expect(modeleChoisi(brut, "chat")).toEqual({ fournisseur: "openrouter", modele: "anthropic/claude-haiku-4.5" });
  });

  it("OpenRouter choisi sans modèle : le défaut OpenRouter", () => {
    expect(modeleChoisi({ fournisseurIA: "openrouter" }, "annonce")).toEqual({
      fournisseur: "openrouter",
      modele: "google/gemini-3.6-flash",
    });
    expect(modeleChoisi({ fournisseurIA: "openrouter" }, "chat").modele).toBe("anthropic/claude-sonnet-4.6");
  });

  it("modèle blanc ou fournisseur périmé en base : le défaut", () => {
    expect(modeleChoisi({ modeleOllamaIA: "   " }, "annonce").modele).toBe("deepseek-v4.1-flash");
    expect(modeleChoisi({ fournisseurIA: "gemini", modeleOllamaChatIA: "glm-5.3-flash" }, "chat")).toEqual({
      fournisseur: "ollama",
      modele: "glm-5.3-flash",
    });
  });

  it("annonce et assistant ont chacun leur modèle", () => {
    const brut = { modeleOllamaIA: "glm-5.3-flash", modeleOllamaChatIA: "gemma4:31b" };
    expect(modeleChoisi(brut, "annonce").modele).toBe("glm-5.3-flash");
    expect(modeleChoisi(brut, "chat").modele).toBe("gemma4:31b");
  });
});

describe("accès par fournisseur", () => {
  it("modelesProposes : le bon catalogue pour chaque couple", () => {
    expect(modelesProposes("ollama", "annonce")).toBe(MODELES_OLLAMA_PROPOSES);
    expect(modelesProposes("ollama", "chat")).toBe(MODELES_CHAT_OLLAMA_PROPOSES);
    expect(modelesProposes("openrouter", "annonce")).toBe(MODELES_PROPOSES);
    expect(modelesProposes("openrouter", "chat")).toBe(MODELES_CHAT_PROPOSES);
  });

  it("champModele : une colonne par fournisseur et par usage", () => {
    expect(champModele("openrouter", "annonce")).toBe("modeleIA");
    expect(champModele("openrouter", "chat")).toBe("modeleChatIA");
    expect(champModele("ollama", "annonce")).toBe("modeleOllamaIA");
    expect(champModele("ollama", "chat")).toBe("modeleOllamaChatIA");
  });

  it("estModeleHorsCatalogue : suit le catalogue du fournisseur", () => {
    expect(estModeleHorsCatalogue("ollama", "annonce", "gemma4:31b")).toBe(false);
    expect(estModeleHorsCatalogue("ollama", "annonce", "google/gemini-3.7-flash")).toBe(true);
    expect(estModeleHorsCatalogue("openrouter", "annonce", "google/gemini-3.7-flash")).toBe(false);
    expect(estModeleHorsCatalogue("openrouter", "annonce", "gemma4:31b")).toBe(true);
    expect(estModeleHorsCatalogue("ollama", "chat", null)).toBe(false);
  });

  it("libelleOption : le prix s'affiche s'il existe, sinon rien", () => {
    expect(libelleOption({ id: "a", libelle: "A", prix: "0.75 / 3.75", note: "" })).toBe("A — 0.75 / 3.75 $/M");
    expect(libelleOption({ id: "b", libelle: "B", prix: null, note: "" })).toBe("B");
  });

  it("libelleModeleIA : nom du catalogue, identifiant tel quel hors catalogue, défaut si vide", () => {
    expect(libelleModeleIA("ollama", "annonce", "gemma4:31b")).toBe("Gemma 4 31B");
    expect(libelleModeleIA("ollama", "annonce", "modele-saisi")).toBe("modele-saisi");
    expect(libelleModeleIA("ollama", "annonce", null)).toBe("DeepSeek V4.1 Flash");
    expect(libelleModeleIA("openrouter", "annonce", null)).toBe("Gemini 3.6 Flash");
  });
});

describe("effortReflexion", () => {
  it("deepseek réfléchit pour les annonces (comptage du titre et des mots-clés), peu pour l'assistant", () => {
    expect(effortReflexion("deepseek-v4.1-flash", "annonce")).toBe("medium");
    expect(effortReflexion("deepseek-v4.1-flash", "chat")).toBe("low");
  });

  it("ne rend rien pour un modèle sans réflexion connue ou saisi à la main", () => {
    expect(effortReflexion("gemma4:31b", "annonce")).toBeNull();
    expect(effortReflexion("glm-5.3-flash", "chat")).toBeNull();
    expect(effortReflexion("google/gemini-3.6-flash", "annonce")).toBeNull();
  });
});
