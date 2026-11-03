import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { baseOllama, OLLAMA_BASE_URL_DEFAUT, urlOllama } from "@/lib/ollamaBase";

describe("baseOllama", () => {
  beforeEach(() => {
    vi.stubEnv("OLLAMA_BASE_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rend l'adresse publique quand la variable est absente ou vide", () => {
    expect(baseOllama()).toBe("https://ollama.com/v1");
    expect(OLLAMA_BASE_URL_DEFAUT).toBe("https://ollama.com/v1");
    vi.stubEnv("OLLAMA_BASE_URL", "   ");
    expect(baseOllama()).toBe(OLLAMA_BASE_URL_DEFAUT);
  });

  it("accepte l'adresse publique posée explicitement, avec ou sans barre finale", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "https://ollama.com/v1/");
    expect(baseOllama()).toBe("https://ollama.com/v1");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("accepte une adresse locale (127.0.0.1, localhost, [::1])", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:4010/api/v1");
    expect(baseOllama()).toBe("http://127.0.0.1:4010/api/v1");
    vi.stubEnv("OLLAMA_BASE_URL", "http://localhost:4010/v1/");
    expect(baseOllama()).toBe("http://localhost:4010/v1");
    vi.stubEnv("OLLAMA_BASE_URL", "http://[::1]:4010/v1");
    expect(baseOllama()).toBe("http://[::1]:4010/v1");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("refuse tout autre hôte et retombe sur le défaut, sans jamais l'envoyer ailleurs", () => {
    for (const v of [
      "https://evil.example",
      "https://evil.example/v1",
      "http://ollama.com/v1",
      "https://ollama.com.evil.example/v1",
      "http://10.0.0.5:4010/v1",
      "https://127.0.0.1:4010/v1",
      "http://localhost.evil.example/v1",
      "http://127.0.0.1.evil.example/v1",
    ]) {
      vi.stubEnv("OLLAMA_BASE_URL", v);
      expect(baseOllama(), v).toBe(OLLAMA_BASE_URL_DEFAUT);
    }
    expect(console.error).toHaveBeenCalled();
  });

  it("ne dit jamais la valeur refusée dans le journal", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "https://evil.example/secret-path");
    baseOllama();
    const lignes = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(lignes).not.toContain("evil.example");
  });
});

describe("urlOllama", () => {
  beforeEach(() => vi.stubEnv("OLLAMA_BASE_URL", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("colle le chemin à la base, avec ou sans barre initiale", () => {
    expect(urlOllama("/chat/completions")).toBe("https://ollama.com/v1/chat/completions");
    expect(urlOllama("models")).toBe("https://ollama.com/v1/models");
  });

  it("suit la variable à chaque appel", () => {
    vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:4010/v1");
    expect(urlOllama("/chat/completions")).toBe("http://127.0.0.1:4010/v1/chat/completions");
    vi.stubEnv("OLLAMA_BASE_URL", "");
    expect(urlOllama("/chat/completions")).toBe("https://ollama.com/v1/chat/completions");
  });
});
