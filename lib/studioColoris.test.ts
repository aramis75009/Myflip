import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// `server-only` lève hors des composants serveur React, et le paquet n'est pas
// installé : on le remplace par un module vide, comme le fait Next à la compilation.

import {
  COLORIS_TIMEOUT_MS,
  COLORIS_TTL_MS,
  buildSkuIndex,
  getColoris,
  getSacbaseConfig,
  parseColorisCatalogue,
  resetColorisCache,
  resolveSkuToCle,
} from "./studioColoris";

const TOKEN = "t0k3n-secret";

const BODY = {
  genere: "2026-10-18T09:00:00.000Z",
  coloris: [
    {
      cle: "5039-black-pink",
      modele: "5039",
      coloris: "Black Pink",
      image: "/img/5039_black_pink.jpg",
      sacs: [
        { sku: "SDN3", statut: "En stock", vendu: false },
        { sku: "SDN1", statut: "Vendu", vendu: true },
      ],
      chezMoi: 1,
      generation: "V3" as string | null,
    },
    { cle: "5880-white", modele: "5880", coloris: "White", image: "", sacs: [], chezMoi: 0, generation: null as string | null },
  ],
  ecartes: ["Sans nom exploitable"],
};

// Copie profonde modifiable : chaque cas de rejet part d'une réponse valide.
const mutated = (fn: (b: typeof BODY) => void) => {
  const b = structuredClone(BODY);
  fn(b);
  return b;
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  resetColorisCache();
  vi.stubEnv("SACBASE_URL", "https://sacbase.test/");
  vi.stubEnv("SACBASE_STUDIO_TOKEN", TOKEN);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getSacbaseConfig", () => {
  it("is null when a variable is missing or empty", () => {
    vi.stubEnv("SACBASE_STUDIO_TOKEN", "");
    expect(getSacbaseConfig()).toBeNull();
    vi.stubEnv("SACBASE_STUDIO_TOKEN", TOKEN);
    vi.stubEnv("SACBASE_URL", "");
    expect(getSacbaseConfig()).toBeNull();
  });

  it("rejects plain http except for a local host", () => {
    vi.stubEnv("SACBASE_URL", "http://sacbase.example");
    expect(getSacbaseConfig()).toBeNull();
    vi.stubEnv("SACBASE_URL", "http://localhost.evil.test");
    expect(getSacbaseConfig()).toBeNull();
    vi.stubEnv("SACBASE_URL", "http://127.0.0.1:3109");
    expect(getSacbaseConfig()).toEqual({ url: "http://127.0.0.1:3109", token: TOKEN });
    vi.stubEnv("SACBASE_URL", "http://localhost:3109");
    expect(getSacbaseConfig()?.url).toBe("http://localhost:3109");
  });

  it("strips trailing slashes", () => {
    expect(getSacbaseConfig()?.url).toBe("https://sacbase.test");
  });

  it("trims a stray newline pasted into a variable", () => {
    vi.stubEnv("SACBASE_STUDIO_TOKEN", TOKEN + "\n");
    expect(getSacbaseConfig()?.token).toBe(TOKEN);
  });
});

describe("parseColorisCatalogue", () => {
  it("accepts a valid response", () => {
    expect(parseColorisCatalogue(BODY)).toEqual(BODY);
  });

  it("reads a missing or empty generation as null (SacBase before 20/10)", () => {
    const parsed = parseColorisCatalogue(
      mutated((b) => {
        delete (b.coloris[0] as { generation?: unknown }).generation;
        b.coloris[1].generation = " ";
      }),
    );
    expect(parsed?.coloris.map((c) => c.generation)).toEqual([null, null]);
  });

  it("drops unknown fields", () => {
    const parsed = parseColorisCatalogue(
      mutated((b) => {
        Object.assign(b, { extra: 1 });
        Object.assign(b.coloris[0], { prixAchat: 12 });
        Object.assign(b.coloris[0].sacs[0], { note: "x" });
      }),
    );
    expect(parsed).toEqual(BODY);
  });

  it("tolerates an absent `ecartes` (diagnosis only)", () => {
    const sansEcartes: Record<string, unknown> = { ...BODY };
    delete sansEcartes.ecartes;
    expect(parseColorisCatalogue(sansEcartes)?.ecartes).toEqual([]);
  });

  it("accepts an empty catalogue", () => {
    expect(parseColorisCatalogue({ genere: BODY.genere, coloris: [], ecartes: [] })).toEqual({
      genere: BODY.genere,
      coloris: [],
      ecartes: [],
    });
  });

  it.each<[string, unknown]>([
    ["null", null],
    ["an array", []],
    ["a string", "x"],
    ["no `coloris` array", { genere: BODY.genere }],
    ["`coloris` not an array", { genere: BODY.genere, coloris: {} }],
    ["no `genere`", { coloris: [] }],
    ["`genere` not a timestamp", mutated((b) => void (b.genere = "hier"))],
    ["`genere` impossible", mutated((b) => void (b.genere = "2026-13-45T99:99:99Z"))],
    ["`ecartes` not an array", mutated((b) => void Object.assign(b, { ecartes: "x" }))],
    ["`ecartes` with a non-string", mutated((b) => void Object.assign(b, { ecartes: [1] }))],
    ["an entry that is not an object", mutated((b) => void b.coloris.push(null as never))],
    ["`cle` missing", mutated((b) => void delete (b.coloris[0] as Partial<(typeof BODY.coloris)[0]>).cle)],
    ["`cle` empty", mutated((b) => void (b.coloris[0].cle = ""))],
    ["`cle` that is not a key", mutated((b) => void (b.coloris[0].cle = "Black Pink"))],
    ["`cle` reduced to a hyphen", mutated((b) => void (b.coloris[0].cle = "-"))],
    ["a duplicate `cle`", mutated((b) => void (b.coloris[1].cle = b.coloris[0].cle))],
    ["`modele` not a string", mutated((b) => void Object.assign(b.coloris[0], { modele: 5039 }))],
    ["`coloris` not a string", mutated((b) => void Object.assign(b.coloris[0], { coloris: null }))],
    ["`image` not a string", mutated((b) => void Object.assign(b.coloris[0], { image: undefined }))],
    ["`sacs` not an array", mutated((b) => void Object.assign(b.coloris[0], { sacs: "SDN3" }))],
    ["a bag that is not an object", mutated((b) => void b.coloris[0].sacs.push("SDN9" as never))],
    ["a SKU out of format", mutated((b) => void (b.coloris[0].sacs[0].sku = "SDN-3"))],
    ["a lowercase SKU", mutated((b) => void (b.coloris[0].sacs[0].sku = "sdn3"))],
    ["a SKU repeated inside a colourway", mutated((b) => void (b.coloris[0].sacs[1].sku = "SDN3"))],
    ["a SKU repeated across colourways", mutated((b) => void b.coloris[1].sacs.push({ sku: "SDN3", statut: "En stock", vendu: false }))],
    ["`statut` empty", mutated((b) => void (b.coloris[0].sacs[0].statut = ""))],
    ["`statut` not a string", mutated((b) => void Object.assign(b.coloris[0].sacs[0], { statut: 1 }))],
    ["`vendu` as a string", mutated((b) => void Object.assign(b.coloris[0].sacs[0], { vendu: "false" }))],
    ["`vendu` missing", mutated((b) => void delete (b.coloris[0].sacs[0] as Partial<(typeof BODY.coloris)[0]["sacs"][0]>).vendu)],
    ["`chezMoi` negative", mutated((b) => void (b.coloris[0].chezMoi = -1))],
    ["`chezMoi` fractional", mutated((b) => void (b.coloris[0].chezMoi = 0.5))],
    ["`chezMoi` as a string", mutated((b) => void Object.assign(b.coloris[0], { chezMoi: "1" }))],
    ["`chezMoi` above the number of bags", mutated((b) => void (b.coloris[0].chezMoi = 3))],
    ["`generation` not a string", mutated((b) => void Object.assign(b.coloris[0], { generation: 3 }))],
  ])("rejects: %s", (_label, input) => {
    expect(parseColorisCatalogue(input)).toBeNull();
  });

  it("one malformed entry rejects the whole batch, valid neighbours included", () => {
    const body = mutated((b) => void (b.coloris[1].cle = "Pas une clé"));
    expect(body.coloris[0].cle).toBe("5039-black-pink");
    expect(parseColorisCatalogue(body)).toBeNull();
  });
});

describe("getColoris", () => {
  it("is off/non-configure without calling fetch", async () => {
    vi.stubEnv("SACBASE_URL", "");
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await getColoris({ fetchImpl })).toEqual({ kind: "off", reason: "non-configure", error: null });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("live: calls /api/studio/coloris with the bearer token, no-store and a 4 s timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(BODY));
    const r = await getColoris({ now: 1_000, fetchImpl });
    expect(r).toEqual({ kind: "live", data: BODY, fetchedAt: 1_000 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://sacbase.test/api/studio/coloris");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer " + TOKEN);
    expect(init?.cache).toBe("no-store");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(timeoutSpy).toHaveBeenCalledWith(COLORIS_TIMEOUT_MS);
    expect(COLORIS_TIMEOUT_MS).toBe(4_000);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("serves the cache for 60 s, then refetches", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(BODY));
    await getColoris({ now: 1_000, fetchImpl });
    expect(await getColoris({ now: 1_000 + COLORIS_TTL_MS - 1, fetchImpl })).toMatchObject({ kind: "live", fetchedAt: 1_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await getColoris({ now: 1_000 + COLORIS_TTL_MS, fetchImpl })).toMatchObject({ kind: "live", fetchedAt: 1_000 + COLORIS_TTL_MS });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(COLORIS_TTL_MS).toBe(60_000);
  });

  it("shares one request between concurrent callers", async () => {
    let release!: (r: Response) => void;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>((res) => (release = res)));
    const [a, b, c] = [getColoris({ now: 1_000, fetchImpl }), getColoris({ now: 1_000, fetchImpl }), getColoris({ now: 1_000, fetchImpl })];
    release(json(BODY));
    const results = await Promise.all([a, b, c]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.kind === "live")).toBe(true);
  });

  it("forgets the in-flight request once it settles, so a failure is retried", async () => {
    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await getColoris({ now: 1_000, fetchImpl: down });
    const ok = vi.fn<typeof fetch>().mockResolvedValue(json(BODY));
    expect(await getColoris({ now: 1_001, fetchImpl: ok })).toMatchObject({ kind: "live" });
  });

  it("stale: keeps the last good data when a later call fails", async () => {
    const ok = vi.fn<typeof fetch>().mockResolvedValue(json(BODY));
    await getColoris({ now: 1_000, fetchImpl: ok });
    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await getColoris({ now: 1_000 + COLORIS_TTL_MS, fetchImpl: down })).toEqual({
      kind: "stale",
      data: BODY,
      fetchedAt: 1_000,
      error: "réseau",
    });
  });

  it("stale: a malformed 200 never replaces the last good data", async () => {
    await getColoris({ now: 1_000, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(BODY)) });
    const bad = vi.fn<typeof fetch>().mockResolvedValue(json(mutated((b) => void (b.coloris[1].cle = "Pas une clé"))));
    expect(await getColoris({ now: 1_000 + COLORIS_TTL_MS, fetchImpl: bad })).toEqual({
      kind: "stale",
      data: BODY,
      fetchedAt: 1_000,
      error: "réponse invalide",
    });
  });

  it("off/injoignable with the HTTP status when nothing was ever received", async () => {
    const r503 = vi.fn<typeof fetch>().mockResolvedValue(json({ error: "x" }, 503));
    expect(await getColoris({ now: 1_000, fetchImpl: r503 })).toEqual({ kind: "off", reason: "injoignable", error: "HTTP 503" });
    const r401 = vi.fn<typeof fetch>().mockResolvedValue(json({ error: "x" }, 401));
    expect(await getColoris({ now: 1_000, fetchImpl: r401 })).toEqual({ kind: "off", reason: "injoignable", error: "HTTP 401" });
  });

  it("an invalid 200 body counts as a failure", async () => {
    const wrongShape = vi.fn<typeof fetch>().mockResolvedValue(json({ foo: 1 }));
    expect(await getColoris({ now: 1_000, fetchImpl: wrongShape })).toEqual({ kind: "off", reason: "injoignable", error: "réponse invalide" });
    const notJson = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>oops</html>", { status: 200 }));
    expect(await getColoris({ now: 1_000, fetchImpl: notJson })).toEqual({ kind: "off", reason: "injoignable", error: "réponse invalide" });
  });

  it("maps a timeout to « délai dépassé »", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(Object.assign(new Error("t"), { name: "TimeoutError" }));
    expect(await getColoris({ now: 1_000, fetchImpl })).toMatchObject({ kind: "off", error: "délai dépassé" });
  });

  it("maps an expired AbortSignal to « délai dépassé », even if the body is what times out", async () => {
    const expired = AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError"));
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(expired);
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      init?.signal?.throwIfAborted();
      return json(BODY);
    });
    expect(await getColoris({ now: 1_000, fetchImpl })).toMatchObject({ kind: "off", error: "délai dépassé" });
  });

  it("never throws, even when fetch throws synchronously", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(() => {
      throw new TypeError("boom");
    });
    await expect(getColoris({ now: 1_000, fetchImpl })).resolves.toMatchObject({ kind: "off", error: "réseau" });
  });

  it("resetColorisCache forgets the last good data", async () => {
    await getColoris({ now: 1_000, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(BODY)) });
    resetColorisCache();
    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await getColoris({ now: 1_000 + COLORIS_TTL_MS, fetchImpl: down })).toMatchObject({ kind: "off" });
  });

  describe("the token never reaches the logs", () => {
    it("on an HTTP failure", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({}, 401));
      await getColoris({ now: 1_000, fetchImpl });
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it("when the error message itself carries the token", async () => {
      const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("request failed, Authorization: Bearer " + TOKEN));
      const r = await getColoris({ now: 1_000, fetchImpl });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    });

    it("on an invalid body and on a stale fallback", async () => {
      await getColoris({ now: 1_000, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(BODY)) });
      const bad = vi.fn<typeof fetch>().mockResolvedValue(json({ echo: "Bearer " + TOKEN }));
      const r = await getColoris({ now: 1_000 + COLORIS_TTL_MS, fetchImpl: bad });
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(TOKEN);
      expect(JSON.stringify(r)).not.toContain(TOKEN);
    });
  });
});

describe("buildSkuIndex", () => {
  it("maps every SKU to its colourway key, sold bags included", () => {
    const data = parseColorisCatalogue(BODY)!;
    expect([...buildSkuIndex(data)]).toEqual([
      ["SDN3", "5039-black-pink"],
      ["SDN1", "5039-black-pink"],
    ]);
  });
});

describe("resolveSkuToCle", () => {
  it("live: resolves a SKU to its key", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(BODY));
    expect(await resolveSkuToCle("SDN3", { now: 1_000, fetchImpl })).toEqual({ cle: "5039-black-pink", kind: "live" });
  });

  it("live: an unknown SKU gives a null key", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(BODY));
    expect(await resolveSkuToCle("SDN99", { now: 1_000, fetchImpl })).toEqual({ cle: null, kind: "live" });
  });

  it("off: SacBase unreachable gives a null key, told apart from an unknown SKU", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await resolveSkuToCle("SDN3", { now: 1_000, fetchImpl })).toEqual({ cle: null, kind: "off" });
  });

  it("stale: still resolves from the last good response", async () => {
    await getColoris({ now: 1_000, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(BODY)) });
    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await resolveSkuToCle("SDN3", { now: 1_000 + COLORIS_TTL_MS, fetchImpl: down })).toEqual({
      cle: "5039-black-pink",
      kind: "stale",
    });
  });

  it("is not stored: a SKU that changes colourway follows the next response", async () => {
    const ok = vi.fn<typeof fetch>().mockResolvedValue(json(BODY));
    expect((await resolveSkuToCle("SDN3", { now: 1_000, fetchImpl: ok })).cle).toBe("5039-black-pink");

    const moved = mutated((b) => {
      const [sdn3] = b.coloris[0].sacs.splice(0, 1);
      b.coloris[0].chezMoi = 0;
      b.coloris[1].sacs.push(sdn3);
      b.coloris[1].chezMoi = 1;
    });
    const next = vi.fn<typeof fetch>().mockResolvedValue(json(moved));
    expect((await resolveSkuToCle("SDN3", { now: 1_000 + COLORIS_TTL_MS, fetchImpl: next })).cle).toBe("5880-white");
  });

  it("is off/non-configure without calling fetch", async () => {
    vi.stubEnv("SACBASE_STUDIO_TOKEN", "");
    const fetchImpl = vi.fn<typeof fetch>();
    expect(await resolveSkuToCle("SDN3", { fetchImpl })).toEqual({ cle: null, kind: "off" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("estCheminVignette", () => {
  it("n'accepte qu'un fichier image sous /img/, sans remontée", async () => {
    const { estCheminVignette } = await import("./studioColoris");
    expect(estCheminVignette("/img/5039_black_pink.jpg")).toBe(true);
    expect(estCheminVignette("/img/catalogue/6006-dark-blue.png")).toBe(true);
    for (const p of ["/img/../api/studio/coloris.png", "/api/x.jpg", "https://evil/img/a.jpg", "/img/a.jpg?x=1", "/img/a.svg", "", "/img/.hidden.jpg"]) {
      expect(estCheminVignette(p), p).toBe(false);
    }
  });
});
