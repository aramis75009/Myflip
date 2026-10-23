import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TAILLE_MAX_OCTETS,
  cheminDepuisUrl,
  cheminImage,
  erreurFichier,
  deposerImage,
  extensionDepuisMime,
  lireImage,
  mimeDepuisContentType,
  supprimerImage,
  urlAppartientA,
} from "./studioBlob";

const USER = "cmabc123def456ghi789";
const AUTRE = "cmzzz999yyy888xxx777";
const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const HOTE = "https://abcdef.private.blob.vercel-storage.com";

describe("cheminImage", () => {
  it("builds the two allowed prefixes", () => {
    expect(cheminImage("references", USER, ID)).toBe(`references/${USER}/${ID}.jpg`);
    expect(cheminImage("generees", USER, ID)).toBe(`generees/${USER}/${ID}.jpg`);
  });

  it("accepts a SHA-256 fingerprint as file name", () => {
    const h = "a".repeat(64);
    expect(cheminImage("references", USER, h)).toBe(`references/${USER}/${h}.jpg`);
    expect(urlAppartientA(`${HOTE}/references/${USER}/${h}.jpg`, "references", USER)).toBe(true);
  });

  it("generates a fresh id when none is given", () => {
    const a = cheminImage("references", USER);
    const b = cheminImage("references", USER);
    expect(a).not.toBe(b);
    expect(a).toMatch(new RegExp(`^references/${USER}/[0-9a-f-]{36}\\.jpg$`));
  });

  it("defaults to .jpg and follows the requested extension", () => {
    expect(cheminImage("generees", USER, ID)).toBe(`generees/${USER}/${ID}.jpg`);
    expect(cheminImage("generees", USER, ID, "png")).toBe(`generees/${USER}/${ID}.png`);
    expect(cheminImage("generees", USER, ID, "webp")).toBe(`generees/${USER}/${ID}.webp`);
    expect(cheminImage("generees", USER, ID, "png")).toMatch(/\.png$/);
  });

  it("refuses an extension outside jpg|png|webp", () => {
    // @ts-expect-error : extension hors de l'union, comme le ferait un appel non typé
    expect(() => cheminImage("generees", USER, ID, "gif")).toThrow();
    // @ts-expect-error : double extension, hors de l'union
    expect(() => cheminImage("generees", USER, ID, "jpg.png")).toThrow();
  });

  it("refuses any other prefix", () => {
    // @ts-expect-error : préfixe hors de l'union, comme le ferait un appel non typé
    expect(() => cheminImage("annonces", USER, ID)).toThrow();
    // @ts-expect-error : chaîne vide, hors de l’union
    expect(() => cheminImage("", USER, ID)).toThrow();
  });

  it("refuses a userId that could escape the folder", () => {
    for (const u of ["", "../x", "a/b", "ABC", "short", `${USER}/..`, "x".repeat(65)]) {
      expect(() => cheminImage("references", u, ID), u).toThrow();
    }
  });

  it("refuses an id that is not a uuid", () => {
    for (const id of ["../../etc", "a/b", "abc", `${ID}/x`, "-".repeat(36), "A".repeat(64)]) {
      expect(() => cheminImage("references", USER, id), id).toThrow();
    }
  });
});

describe("cheminDepuisUrl", () => {
  it("reads the pathname of a blob url", () => {
    expect(cheminDepuisUrl(`${HOTE}/references/${USER}/${ID}.jpg`)).toBe(`references/${USER}/${ID}.jpg`);
  });

  it("rejects non-blob hosts and non-https", () => {
    expect(cheminDepuisUrl(`https://evil.example.com/references/${USER}/${ID}.jpg`)).toBeNull();
    expect(cheminDepuisUrl(`http://abcdef.private.blob.vercel-storage.com/references/${USER}/${ID}.jpg`)).toBeNull();
    expect(cheminDepuisUrl("pas une url")).toBeNull();
  });
});

describe("urlAppartientA", () => {
  const url = (chemin: string) => `${HOTE}/${chemin}`;

  it("accepts a file of this user under this prefix", () => {
    expect(urlAppartientA(url(`references/${USER}/${ID}.jpg`), "references", USER)).toBe(true);
    expect(urlAppartientA(url(`generees/${USER}/${ID}.jpg`), "generees", USER)).toBe(true);
  });

  it("accepts .png and .webp, for generated images and for references", () => {
    expect(urlAppartientA(url(`generees/${USER}/${ID}.png`), "generees", USER)).toBe(true);
    expect(urlAppartientA(url(`generees/${USER}/${ID}.webp`), "generees", USER)).toBe(true);
    expect(urlAppartientA(url(`references/${USER}/${"b".repeat(64)}.png`), "references", USER)).toBe(true);
  });

  it("rejects .gif, a double extension and an upper-case extension", () => {
    for (const c of [
      `generees/${USER}/${ID}.gif`,
      `generees/${USER}/${ID}.jpg.png`,
      `generees/${USER}/${ID}.png.jpg`,
      `generees/${USER}/${ID}.PNG`,
      `generees/${USER}/${ID}.jpeg`,
      `generees/${USER}/${ID}`,
    ]) {
      expect(urlAppartientA(url(c), "generees", USER), c).toBe(false);
    }
  });

  it("rejects another user's file", () => {
    expect(urlAppartientA(url(`references/${AUTRE}/${ID}.jpg`), "references", USER)).toBe(false);
  });

  it("rejects the other prefix: a generated image is never read as a reference", () => {
    expect(urlAppartientA(url(`generees/${USER}/${ID}.jpg`), "references", USER)).toBe(false);
    expect(urlAppartientA(url(`references/${USER}/${ID}.jpg`), "generees", USER)).toBe(false);
  });

  it("rejects traversal, sub-folders and foreign names", () => {
    for (const c of [
      `references/${USER}/../${AUTRE}/${ID}.jpg`,
      `references/${USER}/sub/${ID}.jpg`,
      `references/${USER}/photo.png`,
      `references/${USER}/%2e%2e/${ID}.jpg`,
      `references/${USER}`,
    ]) {
      expect(urlAppartientA(url(c), "references", USER), c).toBe(false);
    }
  });

  it("rejects an invalid userId even if the path matches it", () => {
    expect(urlAppartientA(url(`references/../${ID}.jpg`), "references", "..")).toBe(false);
  });
});

describe("erreurFichier", () => {
  it("accepts a JPEG within the limit", () => {
    expect(erreurFichier({ type: "image/jpeg", size: 500_000 })).toBeNull();
    expect(erreurFichier({ type: "image/jpeg", size: TAILLE_MAX_OCTETS })).toBeNull();
  });

  it("rejects other types, empty and oversized files", () => {
    expect(erreurFichier({ type: "image/png", size: 10 })).not.toBeNull();
    expect(erreurFichier({ type: "image/heic", size: 10 })).not.toBeNull();
    expect(erreurFichier({ type: "image/jpeg", size: 0 })).not.toBeNull();
    expect(erreurFichier({ type: "image/jpeg", size: TAILLE_MAX_OCTETS + 1 })).not.toBeNull();
  });
});

describe("extensionDepuisMime", () => {
  it("maps the three accepted image types to their extension", () => {
    expect(extensionDepuisMime("image/jpeg")).toBe("jpg");
    expect(extensionDepuisMime("image/png")).toBe("png");
    expect(extensionDepuisMime("image/webp")).toBe("webp");
  });

  it("refuses any other type instead of guessing", () => {
    // @ts-expect-error : type hors de l'union, comme le ferait un appel non typé
    expect(() => extensionDepuisMime("image/gif")).toThrow();
    // @ts-expect-error : chaîne vide, hors de l'union
    expect(() => extensionDepuisMime("")).toThrow();
  });
});

describe("mimeDepuisContentType", () => {
  const u = (ext: string) => `${HOTE}/generees/${USER}/${ID}.${ext}`;

  it("keeps the stored content type when it is one of the three", () => {
    expect(mimeDepuisContentType("image/png", u("png"))).toBe("image/png");
    expect(mimeDepuisContentType("image/webp", u("webp"))).toBe("image/webp");
    expect(mimeDepuisContentType("IMAGE/JPEG; charset=binary", u("jpg"))).toBe("image/jpeg");
  });

  it("falls back on the file extension when the stored type is unusable", () => {
    expect(mimeDepuisContentType("application/octet-stream", u("png"))).toBe("image/png");
    expect(mimeDepuisContentType("", u("webp"))).toBe("image/webp");
    expect(mimeDepuisContentType(null, u("jpg"))).toBe("image/jpeg");
  });

  it("defaults to JPEG when neither says anything usable (files written before png/webp existed)", () => {
    expect(mimeDepuisContentType(undefined, "pas une url")).toBe("image/jpeg");
    expect(mimeDepuisContentType("text/html", u("gif"))).toBe("image/jpeg");
  });
});

const PROJET = "https://abcdefgh.supabase.co";
const SB = (chemin: string) => `${PROJET}/storage/v1/object/myflip-studio/${chemin}`;

describe("adresses Supabase", () => {
  it("reads the path of a Supabase Storage url", () => {
    expect(cheminDepuisUrl(SB(`references/${USER}/${ID}.jpg`))).toBe(`references/${USER}/${ID}.jpg`);
  });

  it("rejects another bucket, another endpoint, another host and non-https", () => {
    expect(cheminDepuisUrl(`${PROJET}/storage/v1/object/autre-bucket/references/${USER}/${ID}.jpg`)).toBeNull();
    expect(cheminDepuisUrl(`${PROJET}/rest/v1/references/${USER}/${ID}.jpg`)).toBeNull();
    expect(cheminDepuisUrl(`https://evil.example.com/storage/v1/object/myflip-studio/references/${USER}/${ID}.jpg`)).toBeNull();
    expect(cheminDepuisUrl(SB(`references/${USER}/${ID}.jpg`).replace("https:", "http:"))).toBeNull();
  });

  it("applies the same ownership rules as for the old Blob urls", () => {
    expect(urlAppartientA(SB(`generees/${USER}/${ID}.png`), "generees", USER)).toBe(true);
    expect(urlAppartientA(SB(`generees/${AUTRE}/${ID}.png`), "generees", USER)).toBe(false);
    expect(urlAppartientA(SB(`generees/${USER}/${ID}.png`), "references", USER)).toBe(false);
    expect(urlAppartientA(SB(`references/${USER}/../${AUTRE}/${ID}.jpg`), "references", USER)).toBe(false);
  });
});

describe("accès au stockage (réseau simulé)", () => {
  const fetchSim = vi.fn();

  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", PROJET);
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_cle_de_test");
    fetchSim.mockReset();
    vi.stubGlobal("fetch", fetchSim);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("deposerImage posts to the bucket, upserts, and returns the Supabase url", async () => {
    fetchSim.mockResolvedValue(new Response("{}", { status: 200 }));
    const url = await deposerImage("generees", USER, Buffer.from([1, 2, 3]), ID, "image/png");
    expect(url).toBe(SB(`generees/${USER}/${ID}.png`));
    const [appele, init] = fetchSim.mock.calls[0];
    expect(appele).toBe(SB(`generees/${USER}/${ID}.png`));
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("image/png");
    expect(init.headers["x-upsert"]).toBe("true");
    expect(init.headers.Authorization).toBe("Bearer sb_secret_cle_de_test");
  });

  it("deposerImage reports the status but never the answer or the key", async () => {
    fetchSim.mockResolvedValue(new Response("sb_secret_cle_de_test refusée", { status: 403 }));
    const e = await deposerImage("references", USER, Buffer.from([1]), "a".repeat(64)).catch((x) => x);
    expect(e.message).toContain("403");
    expect(e.message).not.toContain("sb_secret");
  });

  it("lireImage reads by path on the configured host, even for an old Vercel url", async () => {
    fetchSim.mockResolvedValue(new Response("octets", { status: 200, headers: { "content-type": "image/webp" } }));
    const ancienne = `${HOTE}/generees/${USER}/${ID}.webp`;
    const img = await lireImage(ancienne, "generees", USER);
    expect(fetchSim.mock.calls[0][0]).toBe(`${PROJET}/storage/v1/object/authenticated/myflip-studio/generees/${USER}/${ID}.webp`);
    expect(img?.contentType).toBe("image/webp");
  });

  it("lireImage returns null for a missing object (404, or 400 + not found)", async () => {
    const url = SB(`references/${USER}/${ID}.jpg`);
    fetchSim.mockResolvedValueOnce(new Response("", { status: 404 }));
    expect(await lireImage(url, "references", USER)).toBeNull();
    fetchSim.mockResolvedValueOnce(new Response('{"error":"not_found","statusCode":"404"}', { status: 400 }));
    expect(await lireImage(url, "references", USER)).toBeNull();
  });

  it("lireImage throws on a real failure instead of hiding it as « missing »", async () => {
    fetchSim.mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(lireImage(SB(`references/${USER}/${ID}.jpg`), "references", USER)).rejects.toThrow("500");
  });

  it("lireImage refuses a url outside the prefix without any network call", async () => {
    await expect(lireImage(SB(`generees/${USER}/${ID}.jpg`), "references", USER)).rejects.toThrow();
    expect(fetchSim).not.toHaveBeenCalled();
  });

  it("supprimerImage deletes by path and tolerates an already-missing file", async () => {
    fetchSim.mockResolvedValue(new Response("", { status: 404 }));
    await supprimerImage(SB(`references/${USER}/${ID}.jpg`), "references", USER);
    const [appele, init] = fetchSim.mock.calls[0];
    expect(appele).toBe(SB(`references/${USER}/${ID}.jpg`));
    expect(init.method).toBe("DELETE");
    fetchSim.mockResolvedValue(new Response("", { status: 500 }));
    await expect(supprimerImage(SB(`references/${USER}/${ID}.jpg`), "references", USER)).rejects.toThrow("500");
  });

  it("fails clearly, with no network call, when the storage is not configured", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    await expect(deposerImage("references", USER, Buffer.from([1]))).rejects.toThrow("non configuré");
    expect(fetchSim).not.toHaveBeenCalled();
  });
});
