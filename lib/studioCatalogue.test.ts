import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { CATALOGUE_TTL_MS, getCatalogue, trouverModele, viderCacheCatalogue } from "./studioCatalogue";

// `server-only` est aliasé vers un module vide par vitest.config.ts.

const LISTE_URL = "https://openrouter.ai/api/v1/images/models";
const endpointsUrl = (id: string) => `${LISTE_URL}/${id}/endpoints`;

// Fixtures réduites du relevé OpenRouter du 19/10/2026.
const QWEN = {
  id: "qwen/qwen-image-2.1-turbo",
  name: "Qwen: Qwen Image 2.1 Turbo",
  description: "Rapide.",
  architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
  supported_parameters: {
    aspect_ratio: { type: "enum", values: ["1:1", "3:4"] },
    input_references: { type: "range", min: 0, max: 4 },
  },
};
const GEMINI = {
  id: "google/gemini-3-pro-image",
  name: "Google: Nano Banana Pro",
  description: "",
  architecture: { input_modalities: ["image", "text"], output_modalities: ["image", "text"] },
  supported_parameters: { input_references: { type: "range", min: 0, max: 14 } },
};
const SEEDREAM = {
  id: "bytedance-seed/seedream-5-0-flash",
  name: "ByteDance Seed: Seedream 5.0 Flash",
  description: "",
  architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
  supported_parameters: { input_references: { type: "range", min: 0, max: 14 } },
};
// Entrée texte seule : écarté, et son tarif n'est jamais demandé.
const RECRAFT_TEXTE = {
  id: "recraft/recraft-v4.1-flash",
  name: "Recraft: V4.1 Flash",
  description: "",
  architecture: { input_modalities: ["text"], output_modalities: ["image"] },
  supported_parameters: {},
};

const ENDPOINTS: Record<string, unknown> = {
  [QWEN.id]: {
    id: QWEN.id,
    endpoints: [
      {
        provider_name: "Alibaba",
        pricing: [
          { billable: "input_image", unit: "image", cost_usd: 0 },
          { billable: "output_image", unit: "image", cost_usd: 0.0184, variant: "1k" },
          { billable: "output_image", unit: "image", cost_usd: 0.0184, variant: "2k" },
        ],
      },
    ],
  },
  [GEMINI.id]: {
    id: GEMINI.id,
    endpoints: [{ provider_name: "Google", pricing: [{ billable: "output_image", unit: "token", cost_usd: 0.000012 }] }],
  },
  [SEEDREAM.id]: {
    id: SEEDREAM.id,
    endpoints: [{ provider_name: "ByteDance", pricing: [{ billable: "output_image", unit: "image", cost_usd: 0.03 }] }],
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type Appel = { url: string; init: RequestInit | undefined };

/** fetch factice qui route sur l'URL et garde la trace des appels. */
function faux(opts: {
  liste?: () => Response | Promise<Response>;
  endpoints?: (id: string) => Response | Promise<Response>;
}) {
  const appels: Appel[] = [];
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input);
    appels.push({ url, init });
    if (url === LISTE_URL) return (opts.liste ?? (() => json({ data: [QWEN, GEMINI, SEEDREAM, RECRAFT_TEXTE] })))();
    const m = /\/images\/models\/(.+)\/endpoints$/.exec(url);
    if (m) {
      const id = decodeURIComponent(m[1]);
      return (opts.endpoints ?? ((i: string) => json(ENDPOINTS[i] ?? { id: i, endpoints: [] })))(id);
    }
    return json({}, 404);
  }) as typeof fetch;
  const listes = () => appels.filter((a) => a.url === LISTE_URL).length;
  return { fetchImpl, appels, listes };
}

let maintenant = 1_800_000_000_000; // ms, fixe tant que le test ne l'avance pas
const opts = (fetchImpl: typeof fetch, extra: { refresh?: boolean } = {}) => ({ fetchImpl, now: () => maintenant, ...extra });
const iso = (ms: number) => new Date(ms).toISOString();

let errorSpy: MockInstance<typeof console.error>;

beforeEach(() => {
  viderCacheCatalogue();
  maintenant = 1_800_000_000_000;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("getCatalogue", () => {
  it("lists image models, priced from their endpoints, sorted by name", async () => {
    const f = faux({});
    const c = await getCatalogue(opts(f.fetchImpl));

    expect(c.etat).toEqual({ kind: "live" });
    expect(c.fetchedAt).toBe(iso(maintenant));
    // trié par nom : « ByteDance Seed… » < « Google… » < « Qwen… »
    expect(c.modeles.map((m) => m.id)).toEqual([SEEDREAM.id, GEMINI.id, QWEN.id]);
    const parId = Object.fromEntries(c.modeles.map((m) => [m.id, m]));
    expect(parId[QWEN.id].tarif).toEqual({ kind: "image", sortieUsd: 0.0184, entreeParImageUsd: 0 });
    expect(parId[QWEN.id]).toMatchObject({ nom: "Qwen: Qwen Image 2.1 Turbo", maxReferences: 4, ratios: ["1:1", "3:4"] });
    expect(parId[GEMINI.id].tarif).toEqual({ kind: "jeton" });
    expect(parId[SEEDREAM.id].tarif).toEqual({ kind: "image", sortieUsd: 0.03, entreeParImageUsd: 0 });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not ask for the price of a model it drops", async () => {
    const f = faux({});
    await getCatalogue(opts(f.fetchImpl));
    const demandes = f.appels.map((a) => a.url);
    expect(demandes).toContain(endpointsUrl(QWEN.id));
    expect(demandes).not.toContain(endpointsUrl(RECRAFT_TEXTE.id));
    expect(demandes).toHaveLength(1 + 3);
  });

  it("marks a model unknown when its endpoints call fails, and prices the others", async () => {
    const f = faux({
      endpoints: (id) => (id === GEMINI.id ? json({ error: "boom" }, 500) : json(ENDPOINTS[id])),
    });
    const c = await getCatalogue(opts(f.fetchImpl));
    const parId = Object.fromEntries(c.modeles.map((m) => [m.id, m]));
    expect(parId[GEMINI.id].tarif).toEqual({ kind: "inconnu" });
    expect(parId[QWEN.id].tarif.kind).toBe("image");
    expect(parId[SEEDREAM.id].tarif.kind).toBe("image");
    expect(c.etat).toEqual({ kind: "live" });
  });

  it("marks a model unknown when its endpoints call throws or returns garbage", async () => {
    const f = faux({
      endpoints: (id) => {
        if (id === GEMINI.id) throw new Error("ECONNRESET");
        if (id === QWEN.id) return new Response("<html>nope</html>", { status: 200 });
        return json(ENDPOINTS[id]);
      },
    });
    const c = await getCatalogue(opts(f.fetchImpl));
    const parId = Object.fromEntries(c.modeles.map((m) => [m.id, m]));
    expect(parId[GEMINI.id].tarif).toEqual({ kind: "inconnu" });
    expect(parId[QWEN.id].tarif).toEqual({ kind: "inconnu" });
    expect(parId[SEEDREAM.id].tarif.kind).toBe("image");
  });

  it("never trusts the body of a non-2xx answer, even one that looks like a price", async () => {
    const f = faux({ endpoints: (id) => (id === QWEN.id ? json(ENDPOINTS[id], 503) : json(ENDPOINTS[id])) });
    const c = await getCatalogue(opts(f.fetchImpl));
    expect(c.modeles.find((m) => m.id === QWEN.id)?.tarif).toEqual({ kind: "inconnu" });

    viderCacheCatalogue();
    const liste = faux({ liste: () => json({ data: [QWEN] }, 500) });
    expect((await getCatalogue(opts(liste.fetchImpl))).etat).toEqual({ kind: "off" });
  });

  it("serves the cache without any fetch inside the ten-minute window", async () => {
    const f = faux({});
    const premier = await getCatalogue(opts(f.fetchImpl));
    const n = f.appels.length;

    maintenant += CATALOGUE_TTL_MS - 1;
    const second = await getCatalogue(opts(f.fetchImpl));

    expect(f.appels).toHaveLength(n);
    expect(second.etat).toEqual({ kind: "live" });
    expect(second.modeles).toEqual(premier.modeles);
    expect(second.fetchedAt).toBe(iso(1_800_000_000_000)); // l'instant de la lecture, pas celui de l'appel
    expect(CATALOGUE_TTL_MS).toBe(10 * 60_000);
  });

  it("refetches once the window has passed", async () => {
    const f = faux({});
    await getCatalogue(opts(f.fetchImpl));
    maintenant += CATALOGUE_TTL_MS;
    const c = await getCatalogue(opts(f.fetchImpl));
    expect(f.listes()).toBe(2);
    expect(c.fetchedAt).toBe(iso(maintenant));
  });

  it("refetches on demand with refresh: true", async () => {
    const f = faux({});
    await getCatalogue(opts(f.fetchImpl));
    await getCatalogue(opts(f.fetchImpl, { refresh: true }));
    expect(f.listes()).toBe(2);
  });

  it("falls back to the last good answer (stale) when the list call fails afterwards", async () => {
    let panne = false;
    const f = faux({ liste: () => (panne ? json({ error: "down" }, 503) : json({ data: [QWEN, GEMINI] })) });
    const bon = await getCatalogue(opts(f.fetchImpl));
    const t0 = maintenant;

    maintenant += CATALOGUE_TTL_MS + 1;
    panne = true;
    const c = await getCatalogue(opts(f.fetchImpl));

    expect(c.etat).toEqual({ kind: "stale", fetchedAt: iso(t0) });
    expect(c.fetchedAt).toBe(iso(t0));
    expect(c.modeles).toEqual(bon.modeles);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // l'échec ne prolonge pas le cache : l'appel suivant réessaie, et se rétablit
    panne = false;
    const retabli = await getCatalogue(opts(f.fetchImpl));
    expect(f.listes()).toBe(3);
    expect(retabli.etat).toEqual({ kind: "live" });
  });

  it("is off with an empty list on a cold failure, and the next call fetches again", async () => {
    let panne = true;
    const f = faux({ liste: () => (panne ? json({ error: "down" }, 500) : json({ data: [QWEN] })) });

    const froid = await getCatalogue(opts(f.fetchImpl));
    expect(froid).toEqual({ modeles: [], fetchedAt: null, etat: { kind: "off" } });
    expect(f.listes()).toBe(1);

    panne = false;
    const c = await getCatalogue(opts(f.fetchImpl));
    expect(f.listes()).toBe(2);
    expect(c.etat).toEqual({ kind: "live" });
    expect(c.modeles.map((m) => m.id)).toEqual([QWEN.id]);
  });

  it("never caches an empty result: an empty list is a failure", async () => {
    let vide = true;
    const f = faux({ liste: () => json({ data: vide ? [] : [QWEN] }) });

    const c1 = await getCatalogue(opts(f.fetchImpl));
    expect(c1).toEqual({ modeles: [], fetchedAt: null, etat: { kind: "off" } });
    vide = false;
    const c2 = await getCatalogue(opts(f.fetchImpl));
    expect(f.listes()).toBe(2);
    expect(c2.modeles).toHaveLength(1);

    // vide APRÈS un succès : on garde la dernière bonne liste
    vide = true;
    maintenant += CATALOGUE_TTL_MS + 1;
    const c3 = await getCatalogue(opts(f.fetchImpl));
    expect(c3.etat.kind).toBe("stale");
    expect(c3.modeles).toHaveLength(1);
  });

  it("treats a list with no usable model as empty", async () => {
    const f = faux({ liste: () => json({ data: [RECRAFT_TEXTE] }) });
    const c = await getCatalogue(opts(f.fetchImpl));
    expect(c.etat).toEqual({ kind: "off" });
    expect(c.modeles).toEqual([]);
  });

  it("never throws: a fetch that throws, a bad body, a wrong shape", async () => {
    const leve = faux({ liste: () => { throw new Error("ECONNREFUSED"); } });
    expect((await getCatalogue(opts(leve.fetchImpl))).etat).toEqual({ kind: "off" });

    const html = faux({ liste: () => new Response("<html>Bad gateway</html>", { status: 200 }) });
    expect((await getCatalogue(opts(html.fetchImpl))).etat).toEqual({ kind: "off" });

    const forme = faux({ liste: () => json({ data: "oops" }) });
    expect((await getCatalogue(opts(forme.fetchImpl))).etat).toEqual({ kind: "off" });

    const nu = faux({ liste: () => json(null) });
    expect((await getCatalogue(opts(nu.fetchImpl))).etat).toEqual({ kind: "off" });

    const rejet = (async () => {
      throw new Error("boom");
    }) as typeof fetch;
    expect((await getCatalogue(opts(rejet))).etat).toEqual({ kind: "off" });
  });

  it("skips malformed entries and duplicate ids in the list", async () => {
    const f = faux({ liste: () => json({ data: [null, "x", { nope: 1 }, QWEN, QWEN, GEMINI] }) });
    const c = await getCatalogue(opts(f.fetchImpl));
    expect(c.modeles.map((m) => m.id).sort()).toEqual([GEMINI.id, QWEN.id].sort());
    expect(f.appels.filter((a) => a.url === endpointsUrl(QWEN.id))).toHaveLength(1);
  });

  it("shares a single request between concurrent callers", async () => {
    const f = faux({});
    const [a, b] = await Promise.all([getCatalogue(opts(f.fetchImpl)), getCatalogue(opts(f.fetchImpl))]);
    expect(f.listes()).toBe(1);
    expect(a.modeles).toEqual(b.modeles);
  });

  it("forgets everything on viderCacheCatalogue", async () => {
    const f = faux({});
    await getCatalogue(opts(f.fetchImpl));
    viderCacheCatalogue();
    await getCatalogue(opts(f.fetchImpl));
    expect(f.listes()).toBe(2);
  });

  it("sends no key, only the attribution headers, and a timeout on every call", async () => {
    const f = faux({});
    await getCatalogue(opts(f.fetchImpl));
    expect(f.appels.length).toBeGreaterThan(1);
    for (const { init } of f.appels) {
      const h = new Headers(init?.headers);
      expect(h.get("authorization")).toBeNull();
      expect(h.get("x-api-key")).toBeNull();
      expect(h.get("http-referer")).toBe("https://myflip.app");
      expect(h.get("x-title")).toBe("MyFlip");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.signal?.aborted).toBe(false);
    }
  });

  it("puts the model id in the endpoints path, escaping what must be escaped", async () => {
    const bizarre = { ...QWEN, id: "acme/img 1?x#y:free", name: "Acme" };
    const f = faux({ liste: () => json({ data: [bizarre] }) });
    await getCatalogue(opts(f.fetchImpl));
    expect(f.appels[1].url).toBe(`${LISTE_URL}/acme/img%201%3Fx%23y:free/endpoints`);
  });
});

describe("trouverModele", () => {
  it("finds a model of the catalogue by id", async () => {
    const f = faux({});
    const m = await trouverModele(QWEN.id, opts(f.fetchImpl));
    expect(m?.id).toBe(QWEN.id);
    expect(m?.tarif).toEqual({ kind: "image", sortieUsd: 0.0184, entreeParImageUsd: 0 });
  });

  it("is null for an id the catalogue does not have, or a dropped one", async () => {
    const f = faux({});
    expect(await trouverModele("nope/nope", opts(f.fetchImpl))).toBeNull();
    expect(await trouverModele(RECRAFT_TEXTE.id, opts(f.fetchImpl))).toBeNull();
    expect(f.listes()).toBe(1); // le cache sert le second appel
  });

  it("is null, without throwing, when the catalogue is off", async () => {
    const f = faux({ liste: () => json({}, 500) });
    expect(await trouverModele(QWEN.id, opts(f.fetchImpl))).toBeNull();
  });

  it("still finds a model in the stale list", async () => {
    let panne = false;
    const f = faux({ liste: () => (panne ? json({}, 500) : json({ data: [QWEN] })) });
    await getCatalogue(opts(f.fetchImpl));
    maintenant += CATALOGUE_TTL_MS + 1;
    panne = true;
    expect((await trouverModele(QWEN.id, opts(f.fetchImpl)))?.id).toBe(QWEN.id);
  });
});
