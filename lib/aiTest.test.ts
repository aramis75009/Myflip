import { describe, expect, it } from "vitest";
import { corpsTestAnthropic, corpsTestOllama } from "./aiTest";

describe("corpsTestOllama", () => {
  // Tester une clé ne doit coûter qu'une fraction infime du forfait : un jeton,
  // et rien qui fasse travailler le modèle.
  it("tient en un message court et UN jeton de sortie", () => {
    const corps = corpsTestOllama();
    expect(corps.max_tokens).toBe(1);
    expect(corps.messages).toHaveLength(1);
    expect(corps.messages[0].content.length).toBeLessThanOrEqual(10);
  });

  it("n'envoie ni outil, ni image, ni réflexion, ni schéma", () => {
    const corps = corpsTestOllama() as Record<string, unknown>;
    for (const champ of ["tools", "reasoning_effort", "response_format"]) expect(champ in corps).toBe(false);
  });

  it("vise un modèle du catalogue", () => {
    expect(corpsTestOllama().model).toBe("deepseek-v4.1-flash");
  });
});

describe("corpsTestAnthropic", () => {
  it("tient en un message court et UN jeton de sortie", () => {
    const corps = corpsTestAnthropic();
    expect(corps.max_tokens).toBe(1);
    expect(corps.messages).toHaveLength(1);
    expect(corps.messages[0].content.length).toBeLessThanOrEqual(10);
  });

  it("n'envoie ni outil, ni image, ni schéma, ni effort, ni échantillonnage", () => {
    const corps = corpsTestAnthropic() as Record<string, unknown>;
    for (const champ of ["tools", "output_config", "system", "temperature", "top_p", "top_k", "thinking"]) {
      expect(champ in corps).toBe(false);
    }
  });

  it("vise le modèle le moins cher du catalogue", () => {
    expect(corpsTestAnthropic().model).toBe("claude-haiku-5-5");
  });
});
