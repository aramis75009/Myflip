import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { baseOpenRouter, OPENROUTER_BASE_URL_DEFAUT, urlOpenRouter } from "@/lib/openrouterBase";

describe("baseOpenRouter", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_BASE_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rend l'adresse publique quand la variable est absente ou vide", () => {
    expect(baseOpenRouter()).toBe("https://openrouter.ai/api/v1");
    expect(OPENROUTER_BASE_URL_DEFAUT).toBe("https://openrouter.ai/api/v1");
    vi.stubEnv("OPENROUTER_BASE_URL", "   ");
    expect(baseOpenRouter()).toBe(OPENROUTER_BASE_URL_DEFAUT);
  });

  it("retire la barre finale", () => {
    vi.stubEnv("OPENROUTER_BASE_URL", "http://127.0.0.1:4010/api/v1/");
    expect(baseOpenRouter()).toBe("http://127.0.0.1:4010/api/v1");
  });

  it("accepte une adresse locale (127.0.0.1, localhost, [::1])", () => {
    vi.stubEnv("OPENROUTER_BASE_URL", "http://127.0.0.1:4010/api/v1");
    expect(baseOpenRouter()).toBe("http://127.0.0.1:4010/api/v1");
    vi.stubEnv("OPENROUTER_BASE_URL", "http://localhost:4010/api/v1");
    expect(baseOpenRouter()).toBe("http://localhost:4010/api/v1");
    vi.stubEnv("OPENROUTER_BASE_URL", "http://[::1]:4010/api/v1");
    expect(baseOpenRouter()).toBe("http://[::1]:4010/api/v1");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("refuse tout autre hôte et retombe sur le défaut", () => {
    for (const v of [
      "https://evil.example",
      "http://10.0.0.5",
      "http://10.0.0.5:4010/api/v1",
      "https://127.0.0.1:4010/api/v1",
      "http://localhost.evil.example/api/v1",
      "http://127.0.0.1.evil.example/api/v1",
    ]) {
      vi.stubEnv("OPENROUTER_BASE_URL", v);
      expect(baseOpenRouter(), v).toBe(OPENROUTER_BASE_URL_DEFAUT);
    }
    expect(console.error).toHaveBeenCalled();
  });
});

describe("urlOpenRouter", () => {
  beforeEach(() => vi.stubEnv("OPENROUTER_BASE_URL", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("colle le chemin à la base, avec ou sans barre initiale", () => {
    expect(urlOpenRouter("/chat/completions")).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(urlOpenRouter("key")).toBe("https://openrouter.ai/api/v1/key");
  });

  it("suit la variable à chaque appel", () => {
    vi.stubEnv("OPENROUTER_BASE_URL", "http://127.0.0.1:4010/api/v1");
    expect(urlOpenRouter("/images/models")).toBe("http://127.0.0.1:4010/api/v1/images/models");
    vi.stubEnv("OPENROUTER_BASE_URL", "");
    expect(urlOpenRouter("/images/models")).toBe("https://openrouter.ai/api/v1/images/models");
  });
});
