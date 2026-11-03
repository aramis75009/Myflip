import { describe, expect, it } from "vitest";
import { choisirIA, messageCleManquante, type ReglagesIA } from "./fournisseurIA";

const reglages = (over: Partial<ReglagesIA> = {}): ReglagesIA => ({
  openrouterKey: null,
  ollamaKey: null,
  source: { openrouter: "absente", ollama: "absente" },
  ...over,
});

describe("choisirIA", () => {
  it("Ollama Cloud et deepseek-v4.1-flash quand rien n'est choisi", () => {
    const c = choisirIA("annonce", reglages({ ollamaKey: "cle-ollama", source: { openrouter: "absente", ollama: "utilisateur" } }));
    expect(c).toEqual({
      fournisseur: "ollama",
      modele: "deepseek-v4.1-flash",
      cle: "cle-ollama",
      source: "utilisateur",
    });
  });

  it("le même défaut pour l'assistant", () => {
    const c = choisirIA("chat", reglages({ ollamaKey: "k" }));
    expect(c.fournisseur).toBe("ollama");
    expect(c.modele).toBe("deepseek-v4.1-flash");
  });

  it("prend la clé Ollama, jamais celle d'OpenRouter, même si seule celle-ci existe", () => {
    // Une clé OpenRouter envoyée à Ollama serait refusée (401) et, pire, fuirait
    // chez un tiers : la clé suit TOUJOURS le fournisseur retenu.
    const c = choisirIA("annonce", reglages({ openrouterKey: "cle-openrouter" }));
    expect(c.fournisseur).toBe("ollama");
    expect(c.cle).toBeNull();
    expect(c.source).toBe("absente");
  });

  it("repli OpenRouter quand le compte l'a choisi : sa clé, son modèle", () => {
    const c = choisirIA(
      "annonce",
      reglages({
        fournisseurIA: "openrouter",
        openrouterKey: "cle-openrouter",
        ollamaKey: "cle-ollama",
        modeleIA: "google/gemini-3.7-flash",
        modeleOllamaIA: "gemma4:31b",
        source: { openrouter: "app", ollama: "utilisateur" },
      }),
    );
    expect(c).toEqual({
      fournisseur: "openrouter",
      modele: "google/gemini-3.7-flash",
      cle: "cle-openrouter",
      source: "app",
    });
  });

  it("OpenRouter choisi pour l'assistant : le modèle chat d'OpenRouter, ou son défaut", () => {
    const sans = choisirIA("chat", reglages({ fournisseurIA: "openrouter", openrouterKey: "k" }));
    expect(sans.modele).toBe("anthropic/claude-sonnet-4.6");
    const avec = choisirIA(
      "chat",
      reglages({ fournisseurIA: "openrouter", openrouterKey: "k", modeleChatIA: "deepseek/deepseek-v4-flash-0731" }),
    );
    expect(avec.modele).toBe("deepseek/deepseek-v4-flash-0731");
  });

  it("Ollama choisi explicitement : le modèle Ollama du compte", () => {
    const c = choisirIA("annonce", reglages({ fournisseurIA: "ollama", ollamaKey: "k", modeleOllamaIA: "glm-5.3-flash" }));
    expect(c.modele).toBe("glm-5.3-flash");
  });

  it("un fournisseur périmé en base retombe sur Ollama Cloud", () => {
    expect(choisirIA("annonce", reglages({ fournisseurIA: "gemini" })).fournisseur).toBe("ollama");
  });
});

describe("messageCleManquante", () => {
  it("nomme le fournisseur concerné", () => {
    expect(messageCleManquante("ollama")).toMatch(/Aucune clé Ollama Cloud/);
    expect(messageCleManquante("openrouter")).toMatch(/Aucune clé OpenRouter/);
    expect(messageCleManquante("ollama")).toMatch(/Mon compte/);
  });
});
