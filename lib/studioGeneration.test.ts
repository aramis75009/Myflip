import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  StudioGenerationError,
  buildChatRequest,
  buildImagesRequest,
  cleDepuisReglages,
  decodeDataUrl,
  errorFromStatus,
  genererImage,
  readChatResponse,
  readImagesResponse,
  type DemandeImage,
  type GenerationErrorCode,
} from "./studioGeneration";

const CLE = "sk-or-v1-0123456789abcdef0123456789abcdef";

/** En-têtes réels : un PNG, un JPEG et un WebP commencent par ces octets. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([8, 0, 0, 0]), Buffer.from("WEBP"), Buffer.from("VP8 ")]);
/** Octets sans signature connue. */
const INCONNU = Buffer.from([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);

const b64 = (b: Buffer) => b.toString("base64");
const dataUrl = (mime: string, b: Buffer) => `data:${mime};base64,${b64(b)}`;

const demande = (over: Partial<DemandeImage> = {}): DemandeImage => ({
  modele: "qwen/qwen-image-2.1-turbo",
  prompt: "Même sac, vu de dos ¾.",
  references: ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"],
  ratio: "3:4",
  ...over,
});

/** Capture l'erreur levée, ou échoue si rien n'est levé. */
function lever(fn: () => unknown): StudioGenerationError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(StudioGenerationError);
    return e as StudioGenerationError;
  }
  throw new Error("aucune erreur levée");
}

async function leverAsync(p: Promise<unknown>): Promise<StudioGenerationError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(StudioGenerationError);
    return e as StudioGenerationError;
  }
  throw new Error("aucune erreur levée");
}

// ---------------------------------------------------------------------------
// Corps des requêtes
// ---------------------------------------------------------------------------

describe("buildImagesRequest", () => {
  it("builds the documented body, references in order", () => {
    expect(buildImagesRequest(demande())).toEqual({
      model: "qwen/qwen-image-2.1-turbo",
      prompt: "Même sac, vu de dos ¾.",
      n: 1,
      aspect_ratio: "3:4",
      input_references: [
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,BBBB" } },
      ],
    });
  });

  it("sends aspect_ratio when a ratio is given", () => {
    expect(buildImagesRequest(demande({ ratio: "3:4" })).aspect_ratio).toBe("3:4");
  });

  it("has no aspect_ratio key at all when the ratio is null (a model that refuses the parameter)", () => {
    const body = buildImagesRequest(demande({ ratio: null }));
    expect(body).not.toHaveProperty("aspect_ratio");
  });

  it("keeps the references in the order given, the failed image of a correction first", () => {
    const body = buildImagesRequest(demande({ references: ["data:a", "data:b", "data:c"] }));
    const urls = (body.input_references as { image_url: { url: string } }[]).map((r) => r.image_url.url);
    expect(urls).toEqual(["data:a", "data:b", "data:c"]);
  });

  it("leaves out input_references when there is none", () => {
    expect(buildImagesRequest(demande({ references: [] }))).not.toHaveProperty("input_references");
  });
});

describe("buildChatRequest", () => {
  it("puts the prompt first, then the images in order, and asks for image + text", () => {
    expect(buildChatRequest(demande())).toEqual({
      model: "qwen/qwen-image-2.1-turbo",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Même sac, vu de dos ¾." },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,BBBB" } },
          ],
        },
      ],
      modalities: ["image", "text"],
      image_config: { aspect_ratio: "3:4" },
    });
  });

  it("has no image_config when the ratio is null", () => {
    expect(buildChatRequest(demande({ ratio: null }))).not.toHaveProperty("image_config");
  });
});

// ---------------------------------------------------------------------------
// Lecture des réponses
// ---------------------------------------------------------------------------

describe("readImagesResponse", () => {
  const rep = (over: Record<string, unknown> = {}) => ({
    created: 1,
    data: [{ b64_json: b64(PNG), media_type: "image/png" }],
    usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10, cost: 0.0184 },
    ...over,
  });

  it("decodes the image, keeps the media type and reads the real cost", () => {
    const r = readImagesResponse(rep());
    expect(r.octets.equals(PNG)).toBe(true);
    expect(r.mime).toBe("image/png");
    expect(r.coutUsd).toBe(0.0184);
  });

  it("never turns a missing cost into zero", () => {
    expect(readImagesResponse(rep({ usage: undefined })).coutUsd).toBeNull();
    expect(readImagesResponse(rep({ usage: { total_tokens: 5 } })).coutUsd).toBeNull();
    expect(readImagesResponse(rep({ usage: { cost: "0.02" } })).coutUsd).toBeNull();
    expect(readImagesResponse(rep({ usage: { cost: -1 } })).coutUsd).toBeNull();
    expect(readImagesResponse(rep({ usage: null })).coutUsd).toBeNull();
  });

  it("keeps a genuine zero cost", () => {
    expect(readImagesResponse(rep({ usage: { cost: 0 } })).coutUsd).toBe(0);
  });

  it("is no_image on an empty data array, and keeps the cost if one was billed", () => {
    const e = lever(() => readImagesResponse(rep({ data: [], usage: { cost: 0.01 } })));
    expect(e.code).toBe("no_image");
    expect(e.coutUsd).toBe(0.01);
    expect(lever(() => readImagesResponse(rep({ data: [], usage: undefined }))).coutUsd).toBeNull();
  });

  it("is no_image when data is missing or holds no image", () => {
    expect(lever(() => readImagesResponse({})).code).toBe("no_image");
    expect(lever(() => readImagesResponse(rep({ data: [{}] }))).code).toBe("no_image");
    expect(lever(() => readImagesResponse(rep({ data: [{ b64_json: "" }] }))).code).toBe("no_image");
  });

  it("reads the type from the bytes when the response does not say", () => {
    const sans = (b: Buffer) => readImagesResponse(rep({ data: [{ b64_json: b64(b) }] }));
    expect(sans(PNG).mime).toBe("image/png");
    expect(sans(JPEG).mime).toBe("image/jpeg");
    expect(sans(WEBP).mime).toBe("image/webp");
  });

  it("falls back on png when nothing identifies the type (never lose a billed image)", () => {
    const r = readImagesResponse(rep({ data: [{ b64_json: b64(INCONNU) }] }));
    expect(r.mime).toBe("image/png");
    expect(r.octets.equals(INCONNU)).toBe(true);
  });

  it("lets the real bytes win over a wrong declared type", () => {
    const r = readImagesResponse(rep({ data: [{ b64_json: b64(JPEG), media_type: "image/png" }] }));
    expect(r.mime).toBe("image/jpeg");
  });

  it("normalises image/jpg and a type with parameters", () => {
    const lire = (t: string) => readImagesResponse(rep({ data: [{ b64_json: b64(INCONNU), media_type: t }] })).mime;
    expect(lire("image/jpg")).toBe("image/jpeg");
    expect(lire("IMAGE/WEBP; q=1")).toBe("image/webp");
  });

  it("is invalid_response on a declared type outside jpeg|png|webp, with the cost kept", () => {
    const e = lever(() => readImagesResponse(rep({ data: [{ b64_json: b64(INCONNU), media_type: "image/gif" }] })));
    expect(e.code).toBe("invalid_response");
    expect(e.coutUsd).toBe(0.0184);
  });

  it("is invalid_response when the payload decodes to nothing", () => {
    expect(lever(() => readImagesResponse(rep({ data: [{ b64_json: "!!!" }] }))).code).toBe("invalid_response");
  });

  it("is invalid_response on something that is not an object", () => {
    expect(lever(() => readImagesResponse(null)).code).toBe("invalid_response");
    expect(lever(() => readImagesResponse("oops")).code).toBe("invalid_response");
  });

  it("surfaces an error carried by a 200 response, with its reason", () => {
    const e = lever(() => readImagesResponse({ error: { message: "Provider returned error", code: 500 } }));
    expect(e.code).toBe("provider");
    expect(e.message).toContain("Provider returned error");
    expect(lever(() => readImagesResponse({ error: { message: "Blocked by content policy" } })).code).toBe("securite");
  });

  it("also accepts a data URL in b64_json or url", () => {
    expect(readImagesResponse(rep({ data: [{ b64_json: dataUrl("image/webp", WEBP) }] })).mime).toBe("image/webp");
    expect(readImagesResponse(rep({ data: [{ url: dataUrl("image/jpeg", JPEG) }] })).mime).toBe("image/jpeg");
  });
});

describe("readChatResponse", () => {
  const rep = (message: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
    choices: [{ message }],
    usage: { cost: 0.039 },
    ...over,
  });

  it("decodes the data URL of the first image and reads the cost", () => {
    const r = readChatResponse(
      rep({ content: "Voilà", images: [{ type: "image_url", image_url: { url: dataUrl("image/jpeg", JPEG) } }] }),
    );
    expect(r.octets.equals(JPEG)).toBe(true);
    expect(r.mime).toBe("image/jpeg");
    expect(r.coutUsd).toBe(0.039);
  });

  it("gives null for a missing cost, never zero", () => {
    const r = readChatResponse(
      rep({ images: [{ image_url: { url: dataUrl("image/png", PNG) } }] }, { usage: undefined }),
    );
    expect(r.coutUsd).toBeNull();
  });

  it("is no_image when the model answers with text only, and quotes the start of that text", () => {
    const e = lever(() => readChatResponse(rep({ content: "I can't create images of trademarked logos" })));
    expect(e.code).toBe("no_image");
    expect(e.message).toContain("I can't create images of trademarked logos");
    expect(e.coutUsd).toBe(0.039);
  });

  it("quotes text given as content parts, and cuts a long text", () => {
    const e = lever(() =>
      readChatResponse(rep({ content: [{ type: "text", text: "Désolé, " }, { type: "text", text: "non." }] })),
    );
    expect(e.message).toContain("Désolé,");
    const long = lever(() => readChatResponse(rep({ content: "z".repeat(2000) })));
    expect(long.message).not.toContain("z".repeat(301));
    expect(long.message.length).toBeLessThan(450);
  });

  it("is no_image with no text to quote, without an empty quotation", () => {
    const e = lever(() => readChatResponse(rep({ content: "" })));
    expect(e.code).toBe("no_image");
    expect(e.message).not.toContain("«");
  });

  it("is no_image when the image is not a data URL we can decode", () => {
    const e = lever(() => readChatResponse(rep({ images: [{ image_url: { url: "https://example.com/x.png" } }] })));
    expect(e.code).toBe("no_image");
  });

  it("is invalid_response on a declared type outside jpeg|png|webp", () => {
    const e = lever(() => readChatResponse(rep({ images: [{ image_url: { url: dataUrl("image/gif", INCONNU) } }] })));
    expect(e.code).toBe("invalid_response");
  });

  it("surfaces an error carried by a 200 response", () => {
    expect(lever(() => readChatResponse({ error: { message: "No endpoints found" } })).code).toBe("provider");
  });

  it("is invalid_response on something that is not an object", () => {
    expect(lever(() => readChatResponse(undefined)).code).toBe("invalid_response");
  });
});

describe("decodeDataUrl", () => {
  it("decodes a base64 data URL", () => {
    const r = decodeDataUrl(dataUrl("image/png", PNG));
    expect(r?.mime).toBe("image/png");
    expect(r?.octets.equals(PNG)).toBe(true);
  });

  it("lower-cases the type", () => {
    expect(decodeDataUrl(`data:IMAGE/PNG;base64,${b64(PNG)}`)?.mime).toBe("image/png");
  });

  it("returns an empty type when none is declared", () => {
    expect(decodeDataUrl(`data:;base64,${b64(PNG)}`)?.mime).toBe("");
  });

  it("returns null for anything that is not a base64 data URL with a payload", () => {
    expect(decodeDataUrl("https://example.com/x.png")).toBeNull();
    expect(decodeDataUrl("data:image/png,not-base64")).toBeNull();
    expect(decodeDataUrl("data:image/png;base64,")).toBeNull();
    expect(decodeDataUrl("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------

describe("errorFromStatus", () => {
  const corps = (message: string, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ error: { message, code: 400, ...extra } });

  const cas: [string, number, string, GenerationErrorCode][] = [
    ["401", 401, corps("No auth credentials found"), "bad_key"],
    ["402", 402, corps("Insufficient credits"), "no_credits"],
    ["403", 403, corps("Input was flagged"), "securite"],
    ["400 content policy", 400, corps("Your request was rejected by the content policy"), "securite"],
    ["422 safety", 422, corps("safety system"), "securite"],
    ["400 moderation in metadata", 400, corps("Provider returned error", { metadata: { raw: "blocked by moderation" } }), "securite"],
    ["400 invalid aspect_ratio", 400, corps("invalid aspect_ratio: 3:4"), "parametres"],
    ["422 other", 422, corps("n must be 1"), "parametres"],
    ["413", 413, "Request Entity Too Large", "parametres"],
    ["404", 404, corps("No endpoints found for x"), "unknown_model"],
    ["502", 502, corps("Bad gateway"), "incertain"],
    ["504", 504, "", "incertain"],
    ["408", 408, "", "incertain"],
    ["500", 500, corps("Internal"), "provider"],
    ["503", 503, corps("Overloaded"), "provider"],
    ["429", 429, corps("Rate limited"), "provider"],
    ["418", 418, "", "provider"],
  ];
  it.each(cas)("%s maps to its code", (_nom, status, body, code) => {
    const e = errorFromStatus(status, body, "qwen/qwen-image-2.1-turbo");
    expect(e).toBeInstanceOf(StudioGenerationError);
    expect(e.code).toBe(code);
    expect(e.coutUsd).toBeNull();
  });

  it("repeats OpenRouter's message for a refused parameter, cut at 300 characters", () => {
    const e = errorFromStatus(400, corps("invalid aspect_ratio: 3:4 (supported: 1:1, 16:9)"), "m");
    expect(e.message).toContain("invalid aspect_ratio: 3:4 (supported: 1:1, 16:9)");
    const long = errorFromStatus(400, corps("y".repeat(2000)), "m");
    expect(long.message).toContain("y".repeat(300));
    expect(long.message).not.toContain("y".repeat(301));
  });

  it("falls back on the raw text when the body is not JSON", () => {
    const e = errorFromStatus(400, "<html>Bad Request: width too large</html>", "m");
    expect(e.code).toBe("parametres");
    expect(e.message).toContain("width too large");
  });

  it("names the model on unknown_model", () => {
    expect(errorFromStatus(404, "", "foo/bar").message).toContain("foo/bar");
  });

  it("warns that an uncertain failure may have been billed", () => {
    for (const status of [502, 504]) {
      const m = errorFromStatus(status, "", "m").message;
      expect(m).toMatch(/peut-être facturée/);
      expect(m).toMatch(/vérifie ton activité OpenRouter avant de relancer/);
    }
  });

  it("masks anything that looks like an OpenRouter key", () => {
    const e = errorFromStatus(400, corps(`bad header Bearer ${CLE} rejected`), "m");
    expect(e.message).not.toContain(CLE);
    expect(e.message).not.toContain("0123456789abcdef");
  });
});

describe("StudioGenerationError", () => {
  it("carries its code and a cost that defaults to null", () => {
    const e = new StudioGenerationError("securite", "bloqué");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("StudioGenerationError");
    expect(e.code).toBe("securite");
    expect(e.coutUsd).toBeNull();
    expect(new StudioGenerationError("no_image", "x", 0.02).coutUsd).toBe(0.02);
  });
});

// ---------------------------------------------------------------------------
// Clé : celle du compte, jamais celle du déploiement
// ---------------------------------------------------------------------------

describe("cleDepuisReglages", () => {
  it("gives the account's own key, trimmed", () => {
    expect(cleDepuisReglages({ openrouterKey: `  ${CLE} `, source: { openrouter: "utilisateur" } })).toBe(CLE);
  });

  it("refuses the deployment's key: a generation would be billed to its owner", () => {
    const e = lever(() => cleDepuisReglages({ openrouterKey: CLE, source: { openrouter: "app" } }));
    expect(e.code).toBe("missing_key");
    expect(e.message).toBe("Clé OpenRouter manquante. Ajoute ta clé dans Mon compte.");
  });

  it("refuses when there is no key at all", () => {
    expect(lever(() => cleDepuisReglages({ openrouterKey: null, source: { openrouter: "absente" } })).code).toBe(
      "missing_key",
    );
  });

  it("refuses an account key that is blank or missing even if flagged as the user's", () => {
    expect(lever(() => cleDepuisReglages({ openrouterKey: "   ", source: { openrouter: "utilisateur" } })).code).toBe(
      "missing_key",
    );
    expect(lever(() => cleDepuisReglages({ openrouterKey: null, source: { openrouter: "utilisateur" } })).code).toBe(
      "missing_key",
    );
  });
});

// ---------------------------------------------------------------------------
// genererImage : l'appel réseau, piloté par un fetch factice
// ---------------------------------------------------------------------------

type Rep = { status?: number; body?: unknown; text?: string; throws?: unknown };
type Appel = { url: string; init: RequestInit };

/** Un fetch qui rend les réponses données dans l'ordre (la dernière se répète). */
function fauxFetch(reps: Rep[] | ((url: string, n: number) => Rep)) {
  const appels: Appel[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    const n = appels.length;
    appels.push({ url: String(url), init: init ?? {} });
    const r = typeof reps === "function" ? reps(String(url), n) : reps[Math.min(n, reps.length - 1)];
    if (r.throws) throw r.throws;
    return new Response(r.text ?? JSON.stringify(r.body ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { impl, appels };
}

const OK_IMAGES = { body: { data: [{ b64_json: b64(PNG), media_type: "image/png" }], usage: { cost: 0.0184 } } };
const OK_CHAT = {
  body: { choices: [{ message: { images: [{ image_url: { url: dataUrl("image/jpeg", JPEG) } }] } }], usage: { cost: 0.039 } },
};
const erreur = (status: number, message: string) => ({ status, body: { error: { message, code: status } } });

describe("genererImage", () => {
  // Le module journalise ses échecs : on les capte, pour une sortie propre et pour les inspecter.
  let journal: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    journal = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("posts to /images with the key, the attribution headers and the built body", async () => {
    const f = fauxFetch([OK_IMAGES]);
    const r = await genererImage(demande(), CLE, f.impl, 0);

    expect(r.mime).toBe("image/png");
    expect(r.coutUsd).toBe(0.0184);
    expect(r.octets.equals(PNG)).toBe(true);

    expect(f.appels).toHaveLength(1);
    const { url, init } = f.appels[0];
    expect(url).toBe("https://openrouter.ai/api/v1/images");
    expect(init.method).toBe("POST");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe(`Bearer ${CLE}`);
    expect(h["Content-Type"]).toBe("application/json");
    expect(h["HTTP-Referer"]).toBe("https://myflip.app");
    expect(h["X-Title"]).toBe("MyFlip");
    expect(JSON.parse(String(init.body))).toEqual(buildImagesRequest(demande()));
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([404, 405])("falls back on chat/completions when /images answers %i", async (status) => {
    const f = fauxFetch((url) => (url.endsWith("/images") ? erreur(status, "Not found") : OK_CHAT));
    const r = await genererImage(demande(), CLE, f.impl, 0);

    expect(r.mime).toBe("image/jpeg");
    expect(r.coutUsd).toBe(0.039);
    expect(f.appels.map((a) => a.url)).toEqual([
      "https://openrouter.ai/api/v1/images",
      "https://openrouter.ai/api/v1/chat/completions",
    ]);
    expect(JSON.parse(String(f.appels[1].init.body))).toEqual(buildChatRequest(demande()));
    expect((f.appels[1].init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CLE}`);
  });

  it("is unknown_model when both endpoints answer 404", async () => {
    const f = fauxFetch([erreur(404, "No endpoints found")]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("unknown_model");
    expect(f.appels).toHaveLength(2);
  });

  it("reports the chat fallback's own failure, not the 404 that triggered it", async () => {
    const f = fauxFetch((url) => (url.endsWith("/images") ? erreur(404, "nope") : erreur(400, "invalid modalities")));
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("parametres");
    expect(e.message).toContain("invalid modalities");
  });

  it("does not fall back when /images answers 200 without an image (a polite refusal is not a missing endpoint)", async () => {
    const f = fauxFetch([{ body: { data: [], usage: { cost: 0.01 } } }]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("no_image");
    expect(e.coutUsd).toBe(0.01);
    expect(f.appels).toHaveLength(1);
  });

  it.each([503, 429])("retries once after a %i, which is never billed", async (status) => {
    const f = fauxFetch([erreur(status, "busy"), OK_IMAGES]);
    const r = await genererImage(demande(), CLE, f.impl, 0);
    expect(r.coutUsd).toBe(0.0184);
    expect(f.appels).toHaveLength(2);
    expect(f.appels[1].init.body).toBe(f.appels[0].init.body);
  });

  it.each([503, 429])("gives up after a single retry on %i", async (status) => {
    const f = fauxFetch([erreur(status, "busy")]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("provider");
    expect(f.appels).toHaveLength(2);
  });

  it("waits the injected pause before the retry", async () => {
    const f = fauxFetch([erreur(503, "busy"), OK_IMAGES]);
    const t0 = Date.now();
    await genererImage(demande(), CLE, f.impl, 60);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(50);
  });

  it.each([502, 504])("never retries a %i: the generation may exist and be billed", async (status) => {
    const f = fauxFetch([erreur(status, "gateway")]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("incertain");
    expect(e.message).toMatch(/peut-être facturée/);
    expect(f.appels).toHaveLength(1);
  });

  it("never retries a plain 500", async () => {
    const f = fauxFetch([erreur(500, "boom")]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("provider");
    expect(f.appels).toHaveLength(1);
  });

  it.each<[number, string, GenerationErrorCode]>([
    [401, "bad auth", "bad_key"],
    [402, "no credit", "no_credits"],
    [403, "flagged", "securite"],
    [400, "rejected by the content policy", "securite"],
    [400, "invalid aspect_ratio", "parametres"],
  ])("maps a %i (%s) to %s without a retry", async (status, message, code) => {
    const f = fauxFetch([erreur(status, message)]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe(code);
    expect(f.appels).toHaveLength(1);
  });

  it("is incertain on a timeout: the request may have been accepted", async () => {
    const f = fauxFetch([{ throws: new DOMException("The operation timed out.", "TimeoutError") }]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("incertain");
    expect(e.message).toMatch(/peut-être facturée/);
    expect(f.appels).toHaveLength(1);
  });

  it("is incertain when the connection drops while the request is in flight", async () => {
    const f = fauxFetch([{ throws: new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }) }]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("incertain");
    expect(f.appels).toHaveLength(1);
  });

  it.each(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"])("is unreachable on %s: nothing was sent", async (code) => {
    const f = fauxFetch([{ throws: new TypeError("fetch failed", { cause: { code } }) }]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("unreachable");
    expect(e.coutUsd).toBeNull();
  });

  it("is invalid_response when a 200 is not JSON, and says the generation may have been billed", async () => {
    const f = fauxFetch([{ text: "<html>oops</html>" }]);
    const e = await leverAsync(genererImage(demande(), CLE, f.impl, 0));
    expect(e.code).toBe("invalid_response");
    expect(e.message).toMatch(/peut-être facturée/);
  });

  it("masks the exact key even when it does not look like an OpenRouter key", async () => {
    const autre = "tok_9f8e7d6c5b4a39281706";
    const f = fauxFetch([erreur(400, `Header rejected: Bearer ${autre}`), erreur(500, `upstream saw ${autre}`)]);
    const e1 = await leverAsync(genererImage(demande(), autre, f.impl, 0));
    const e2 = await leverAsync(genererImage(demande(), autre, f.impl, 0));
    expect(e1.message).not.toContain(autre);
    expect(e2.message).not.toContain(autre);
    expect(JSON.stringify(journal.mock.calls)).not.toContain(autre);
  });

  it("never writes the key, nor an image, to console.error, even when the provider echoes the key", async () => {
    const secretPixels = "data:image/png;base64,SECRETPIXELSSECRETPIXELS";
    const echo = (status: number) => ({
      status,
      body: { error: { message: `Invalid key ${CLE} for header Authorization: Bearer ${CLE}`, code: status } },
    });

    for (const status of [400, 401, 500, 502, 404]) {
      const f = fauxFetch([echo(status)]);
      const e = await leverAsync(genererImage(demande({ references: [secretPixels] }), CLE, f.impl, 0));
      expect(e.message).not.toContain(CLE);
    }
    const f2 = fauxFetch([{ throws: new TypeError(`fetch failed for ${CLE}`, { cause: { code: "ENOTFOUND" } }) }]);
    const e2 = await leverAsync(genererImage(demande({ references: [secretPixels] }), CLE, f2.impl, 0));
    expect(e2.message).not.toContain(CLE);

    // Le journal existe bien (sinon l'absence de clé ne prouverait rien).
    expect(journal).toHaveBeenCalled();
    const tout = JSON.stringify(journal.mock.calls, (_k, v) => (v instanceof Error ? `${v.name}: ${v.message}` : v));
    expect(tout).not.toContain(CLE);
    expect(tout).not.toContain("0123456789abcdef");
    expect(tout).not.toContain("SECRETPIXELS");
  });
});
