import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANTHROPIC_BASE_URL_DEFAUT,
  ANTHROPIC_VERSION,
  baseAnthropic,
  enTetesAnthropic,
  urlAnthropic,
} from "@/lib/anthropicBase";

describe("baseAnthropic", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rend l'adresse publique quand la variable est absente ou vide", () => {
    expect(baseAnthropic()).toBe("https://api.anthropic.com/v1");
    expect(ANTHROPIC_BASE_URL_DEFAUT).toBe("https://api.anthropic.com/v1");
    vi.stubEnv("ANTHROPIC_BASE_URL", "   ");
    expect(baseAnthropic()).toBe(ANTHROPIC_BASE_URL_DEFAUT);
  });

  it("accepte l'adresse publique posée explicitement, avec ou sans barre finale", () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://api.anthropic.com/v1/");
    expect(baseAnthropic()).toBe("https://api.anthropic.com/v1");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("accepte une adresse locale (127.0.0.1, localhost, [::1])", () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:4010/v1");
    expect(baseAnthropic()).toBe("http://127.0.0.1:4010/v1");
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://localhost:4010/v1/");
    expect(baseAnthropic()).toBe("http://localhost:4010/v1");
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://[::1]:4010/v1");
    expect(baseAnthropic()).toBe("http://[::1]:4010/v1");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("refuse tout autre hôte et retombe sur le défaut : la clé ne part jamais ailleurs", () => {
    for (const v of [
      "https://evil.example",
      "https://evil.example/v1",
      "http://api.anthropic.com/v1",
      "https://api.anthropic.com.evil.example/v1",
      "http://10.0.0.5:4010/v1",
      "https://127.0.0.1:4010/v1",
      "http://localhost.evil.example/v1",
      "http://127.0.0.1.evil.example/v1",
    ]) {
      vi.stubEnv("ANTHROPIC_BASE_URL", v);
      expect(baseAnthropic(), v).toBe(ANTHROPIC_BASE_URL_DEFAUT);
    }
    expect(console.error).toHaveBeenCalled();
  });

  it("ne dit jamais la valeur refusée dans le journal", () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://evil.example/secret-path");
    baseAnthropic();
    const lignes = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(lignes).not.toContain("evil.example");
  });
});

describe("urlAnthropic", () => {
  beforeEach(() => vi.stubEnv("ANTHROPIC_BASE_URL", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("colle le chemin à la base, avec ou sans barre initiale", () => {
    expect(urlAnthropic("/messages")).toBe("https://api.anthropic.com/v1/messages");
    expect(urlAnthropic("messages")).toBe("https://api.anthropic.com/v1/messages");
  });

  it("suit la variable à chaque appel", () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "http://127.0.0.1:4010/v1");
    expect(urlAnthropic("/messages")).toBe("http://127.0.0.1:4010/v1/messages");
    vi.stubEnv("ANTHROPIC_BASE_URL", "");
    expect(urlAnthropic("/messages")).toBe("https://api.anthropic.com/v1/messages");
  });
});

describe("enTetesAnthropic", () => {
  it("porte la clé dans x-api-key (pas Authorization), la version du protocole et le type JSON", () => {
    expect(enTetesAnthropic("sk-test")).toEqual({
      "x-api-key": "sk-test",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    });
    expect(ANTHROPIC_VERSION).toBe("2023-06-01");
  });
});
