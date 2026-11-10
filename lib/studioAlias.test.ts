import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALIAS_COLORIS_STUDIO, cleStudio, fusionnerAliasCatalogue, regrouperParCleStudio } from "./studioAlias";
import { buildSkuIndex, getColoris, resetColorisCache, resolveSkuToCle, type SacbaseCatalogue } from "./studioColoris";

const SOURCE = "5883-black-gold";
const CIBLE = "5880-black-gold";

// Le catalogue tel que SacBase le rend le 10/11 : deux coloris pour le même sac, même photo.
const catalogue = (): SacbaseCatalogue => ({
  genere: "2026-11-10T09:00:00.000Z",
  coloris: [
    {
      cle: "5039-black-pink",
      modele: "5039",
      coloris: "Black Pink",
      image: "/img/5039_black_pink.jpg",
      sacs: [{ sku: "SDN3", statut: "En stock", vendu: false }],
      chezMoi: 1,
      generation: "V3",
    },
    {
      cle: SOURCE,
      modele: "5883",
      coloris: "Black Gold",
      image: "/img/5880_black_gold.jpg",
      sacs: [
        { sku: "SDN40", statut: "Vendu", vendu: true },
        { sku: "SDN60", statut: "En stock", vendu: false },
      ],
      chezMoi: 1,
      generation: "V2",
    },
    { cle: CIBLE, modele: "5880", coloris: "Black Gold", image: "/img/5880_black_gold.jpg", sacs: [], chezMoi: 0, generation: null },
  ],
  ecartes: [],
});

describe("ALIAS_COLORIS_STUDIO", () => {
  it("5883 Black Gold devient 5880 Black Gold (décision du 10/11)", () => {
    expect([...ALIAS_COLORIS_STUDIO]).toEqual([[SOURCE, CIBLE]]);
  });

  it("un seul saut : aucune cible n'est elle-même une source, aucune source n'est sa propre cible", () => {
    for (const [source, cible] of ALIAS_COLORIS_STUDIO) {
      expect(ALIAS_COLORIS_STUDIO.has(cible)).toBe(false);
      expect(cible).not.toBe(source);
    }
  });

  it("cleStudio : la cible pour une source, la clé elle-même sinon (y compris un nom d'Object.prototype)", () => {
    expect(cleStudio(SOURCE)).toBe(CIBLE);
    expect(cleStudio(CIBLE)).toBe(CIBLE);
    expect(cleStudio("5039-black-pink")).toBe("5039-black-pink");
    expect(cleStudio("constructor")).toBe("constructor");
  });
});

describe("fusionnerAliasCatalogue", () => {
  it("une seule carte 5880, qui reprend les sacs de 5883 ; la carte 5883 disparaît", () => {
    const fusion = fusionnerAliasCatalogue(catalogue());
    expect(fusion.coloris.map((c) => c.cle)).toEqual(["5039-black-pink", CIBLE]);
    const c = fusion.coloris.find((x) => x.cle === CIBLE)!;
    expect(c.sacs.map((s) => s.sku)).toEqual(["SDN40", "SDN60"]);
    expect(c.chezMoi).toBe(1);
    // Libellés et vignette de la cible ; génération reprise de la source quand la cible n'en a pas.
    expect(c).toMatchObject({ modele: "5880", coloris: "Black Gold", image: "/img/5880_black_gold.jpg", generation: "V2" });
    expect(fusion.genere).toBe("2026-11-10T09:00:00.000Z");
  });

  it("chezMoi additionné et sacs concaténés quand la cible a déjà des sacs (cible d'abord)", () => {
    const cat = catalogue();
    cat.coloris[2] = { ...cat.coloris[2], sacs: [{ sku: "SDN70", statut: "Photos prêtes", vendu: false }], chezMoi: 1, generation: "V3" };
    const c = fusionnerAliasCatalogue(cat).coloris.find((x) => x.cle === CIBLE)!;
    expect(c.sacs.map((s) => s.sku)).toEqual(["SDN70", "SDN40", "SDN60"]);
    expect(c.chezMoi).toBe(2);
    expect(c.generation).toBe("V3");
  });

  it("la table sku → cle renvoie 5880 pour SDN40 et SDN60", () => {
    const index = buildSkuIndex(fusionnerAliasCatalogue(catalogue()));
    expect(index.get("SDN40")).toBe(CIBLE);
    expect(index.get("SDN60")).toBe(CIBLE);
    expect(index.get("SDN3")).toBe("5039-black-pink");
    expect([...index.values()]).not.toContain(SOURCE);
  });

  it("l'ordre du catalogue ne compte pas : une cible listée avant sa source reçoit quand même ses sacs", () => {
    const cat = catalogue();
    cat.coloris.reverse();
    const fusion = fusionnerAliasCatalogue(cat);
    expect(fusion.coloris.map((c) => c.cle)).toEqual([CIBLE, "5039-black-pink"]);
    expect(fusion.coloris[0].sacs.map((s) => s.sku)).toEqual(["SDN40", "SDN60"]);
  });

  it("cible absente du catalogue : la source prend la clé cible, sacs compris", () => {
    const cat = catalogue();
    cat.coloris.pop();
    const fusion = fusionnerAliasCatalogue(cat);
    expect(fusion.coloris.map((c) => c.cle)).toEqual(["5039-black-pink", CIBLE]);
    expect(fusion.coloris[1].sacs.map((s) => s.sku)).toEqual(["SDN40", "SDN60"]);
    expect(buildSkuIndex(fusion).get("SDN60")).toBe(CIBLE);
  });

  it("sans source au catalogue : rendu tel quel", () => {
    const cat = catalogue();
    cat.coloris.splice(1, 1);
    expect(fusionnerAliasCatalogue(cat)).toBe(cat);
  });

  it("ne modifie pas le catalogue reçu", () => {
    const cat = catalogue();
    const avant = structuredClone(cat);
    fusionnerAliasCatalogue(cat);
    expect(cat).toEqual(avant);
  });
});

describe("regrouperParCleStudio (cartes « connues en base »)", () => {
  type Ligne = { cle: string; modele: string; coloris: string; references: { id: string }[]; essais: { id: string }[] };
  const ligne = (cle: string, modele: string, refs: string[], essais: string[] = []): Ligne => ({
    cle,
    modele,
    coloris: "Black Gold",
    references: refs.map((id) => ({ id })),
    essais: essais.map((id) => ({ id })),
  });

  it("une ligne 5883 encore en base est absorbée par 5880 : photos et essais comptent pour 5880", () => {
    const lignes = [ligne("5039-black-pink", "5039", ["p1"]), ligne(SOURCE, "5883", ["a", "b"], ["e1"]), ligne(CIBLE, "5880", ["c"], ["e2"])];
    const out = regrouperParCleStudio(lignes);
    expect(out.map((l) => l.cle)).toEqual(["5039-black-pink", CIBLE]);
    const c = out.find((l) => l.cle === CIBLE)!;
    expect(c.modele).toBe("5880");
    expect(c.references.map((r) => r.id).sort()).toEqual(["a", "b", "c"]);
    expect(c.essais.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });

  it("seule la ligne 5883 existe : elle devient la carte 5880, jamais une carte 5883", () => {
    const out = regrouperParCleStudio([ligne(SOURCE, "5883", ["a"], ["e1"])]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ cle: CIBLE, references: [{ id: "a" }], essais: [{ id: "e1" }] });
  });

  it("sans ligne source : les lignes sont rendues telles quelles", () => {
    const lignes = [ligne("5039-black-pink", "5039", ["p1"]), ligne(CIBLE, "5880", [])];
    const out = regrouperParCleStudio(lignes);
    expect(out).toEqual(lignes);
    expect(out[0]).toBe(lignes[0]);
  });
});

// ── Bout en bout dans le client SacBase : tout le Studio lit le catalogue fusionné ──

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("getColoris applique l'alias du Studio", () => {
  beforeEach(() => {
    resetColorisCache();
    vi.stubEnv("SACBASE_URL", "https://sacbase.test");
    vi.stubEnv("SACBASE_STUDIO_TOKEN", "jeton-de-test");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("une seule carte 5880 et SDN60 → 5880, en direct puis depuis la dernière bonne réponse", async () => {
    // Une réponse neuve à chaque appel : un corps ne se lit qu'une fois.
    const ok = vi.fn<typeof fetch>().mockImplementation(async () => json(catalogue()));
    const live = await getColoris({ now: 1_000, fetchImpl: ok });
    expect(live.kind).toBe("live");
    if (live.kind === "off") throw new Error("inattendu");
    expect(live.data.coloris.map((c) => c.cle)).toEqual(["5039-black-pink", CIBLE]);
    expect(live.data.coloris[1].chezMoi).toBe(1);

    const down = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    const stale = await getColoris({ now: 1_000_000, fetchImpl: down });
    expect(stale.kind).toBe("stale");
    if (stale.kind === "off") throw new Error("inattendu");
    expect(stale.data.coloris.map((c) => c.cle)).not.toContain(SOURCE);

    resetColorisCache();
    expect(await resolveSkuToCle("SDN60", { now: 2_000, fetchImpl: ok })).toEqual({ cle: CIBLE, kind: "live" });
    expect(await resolveSkuToCle("SDN40", { now: 2_000, fetchImpl: ok })).toEqual({ cle: CIBLE, kind: "live" });
  });
});
