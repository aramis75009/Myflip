import { describe, expect, it } from "vitest";

import {
  RATIO_STUDIO,
  SEUIL_CONFIRMATION_USD,
  devisLancement,
  estimerEssai,
  formatUsd,
  libelleTarif,
  normaliserModele,
  tarifDepuisEndpoints,
  type Estimation,
  type Tarif,
} from "./studioModeles";

// Fixtures recopiées (et réduites) du relevé OpenRouter du 19/10/2026.

const QWEN_RAW = {
  id: "qwen/qwen-image-2.1-turbo",
  name: "Qwen: Qwen Image 2.1 Turbo",
  description: "Modèle d'image rapide.",
  created: 1760000000,
  architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
  supported_parameters: {
    resolution: { type: "enum", values: ["1K", "2K"] },
    aspect_ratio: { type: "enum", values: ["1:1", "3:2", "3:4", "4:3", "9:16"] },
    n: { type: "range", min: 1, max: 6 },
    input_references: { type: "range", min: 0, max: 4 },
  },
};

const RECRAFT_FLASH_RAW = {
  id: "recraft/recraft-v4.1-flash",
  name: "Recraft: V4.1 Flash",
  description: "Texte seul.",
  architecture: { input_modalities: ["text"], output_modalities: ["image"] },
  supported_parameters: { aspect_ratio: { type: "enum", values: ["1:1", "3:4"] } },
};

const QWEN_ENDPOINTS = {
  id: "qwen/qwen-image-2.1-turbo",
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
};

const GEMINI_ENDPOINTS = {
  id: "google/gemini-3-pro-image",
  endpoints: [
    { provider_name: "Google Vertex", pricing: [{ billable: "output_image", unit: "token", cost_usd: 0.000012 }] },
    { provider_name: "Google AI Studio", pricing: [{ billable: "output_image", unit: "token", cost_usd: 0.000012 }] },
  ],
};

const INCONNU: Tarif = { kind: "inconnu" };
const JETON: Tarif = { kind: "jeton" };

/** Un fournisseur, avec le tableau de prix donné. */
const ep = (...pricing: unknown[]) => ({ endpoints: [{ provider_name: "P", pricing }] });
const sortie = (cost_usd: number, extra: Record<string, unknown> = {}) => ({
  billable: "output_image",
  unit: "image",
  cost_usd,
  ...extra,
});

describe("constantes", () => {
  it("fixes the confirmation threshold and the Studio ratio", () => {
    expect(SEUIL_CONFIRMATION_USD).toBe(0.1);
    expect(RATIO_STUDIO).toBe("3:4");
  });
});

describe("tarifDepuisEndpoints", () => {
  it("reads a per-image price (qwen: two variants at the same price, free input)", () => {
    expect(tarifDepuisEndpoints(QWEN_ENDPOINTS)).toEqual({ kind: "image", sortieUsd: 0.0184, entreeParImageUsd: 0 });
  });

  it("is per-token when the output is billed per token (gemini, two providers)", () => {
    expect(tarifDepuisEndpoints(GEMINI_ENDPOINTS)).toEqual({ kind: "jeton" });
  });

  it("is unknown for unreadable shapes", () => {
    expect(tarifDepuisEndpoints({})).toEqual(INCONNU);
    expect(tarifDepuisEndpoints(null)).toEqual(INCONNU);
    expect(tarifDepuisEndpoints(undefined)).toEqual(INCONNU);
    expect(tarifDepuisEndpoints("x")).toEqual(INCONNU);
    expect(tarifDepuisEndpoints({ endpoints: [] })).toEqual(INCONNU);
    expect(tarifDepuisEndpoints({ endpoints: "oops" })).toEqual(INCONNU);
    expect(tarifDepuisEndpoints({ endpoints: [null] })).toEqual(INCONNU);
  });

  it("is unknown when a provider publishes no price at all (krea/k3-edit: pricing [])", () => {
    expect(tarifDepuisEndpoints(ep())).toEqual(INCONNU);
    expect(tarifDepuisEndpoints({ endpoints: [{ provider_name: "P" }] })).toEqual(INCONNU);
    expect(tarifDepuisEndpoints({ endpoints: [{ provider_name: "P", pricing: "oops" }] })).toEqual(INCONNU);
  });

  it("takes the maximum over providers and variants (cautious estimate)", () => {
    const deuxFournisseurs = {
      endpoints: [
        { provider_name: "A", pricing: [sortie(0.02)] },
        { provider_name: "B", pricing: [sortie(0.03)] },
      ],
    };
    expect(tarifDepuisEndpoints(deuxFournisseurs)).toEqual({ kind: "image", sortieUsd: 0.03, entreeParImageUsd: 0 });
    const variantes = ep(sortie(0.13), sortie(0.15, { variant: "2k" }), sortie(0.17, { variant: "4k" }));
    expect(tarifDepuisEndpoints(variantes)).toMatchObject({ kind: "image", sortieUsd: 0.17 });
  });

  it("takes the maximum per-image input price over input_image entries", () => {
    const t = ep(
      sortie(0.04),
      { billable: "input_image", unit: "image", cost_usd: 0.001 },
      { billable: "input_image", unit: "image", cost_usd: 0.002, variant: "2k" },
    );
    expect(tarifDepuisEndpoints(t)).toEqual({ kind: "image", sortieUsd: 0.04, entreeParImageUsd: 0.002 });
  });

  it("is per-token as soon as one output is per token, even next to a per-image one", () => {
    const melange = {
      endpoints: [
        { provider_name: "A", pricing: [sortie(0.02)] },
        { provider_name: "B", pricing: [{ billable: "output_image", unit: "token", cost_usd: 0.00001 }] },
      ],
    };
    expect(tarifDepuisEndpoints(melange)).toEqual(JETON);
  });

  it("is per-token when the input is billed per token (output per image)", () => {
    const t = ep(sortie(0.02), { billable: "input_image", unit: "token", cost_usd: 0.000001 });
    expect(tarifDepuisEndpoints(t)).toEqual(JETON);
  });

  it("is unknown for a unit it cannot turn into a per-image price (flux.2-flex: per megapixel)", () => {
    const flex = ep(
      { billable: "input_image", unit: "megapixel", cost_usd: 0.06 },
      { billable: "output_image", unit: "megapixel", cost_usd: 0.06 },
    );
    expect(tarifDepuisEndpoints(flex)).toEqual(INCONNU);
    // un seul output au mégapixel suffit à rendre la borne impossible
    expect(tarifDepuisEndpoints(ep(sortie(0.02), { billable: "output_image", unit: "megapixel", cost_usd: 0.06 }))).toEqual(INCONNU);
    // une entrée au mégapixel aussi, même avec une sortie à l'image
    expect(tarifDepuisEndpoints(ep(sortie(0.02), { billable: "input_image", unit: "megapixel", cost_usd: 0.06 }))).toEqual(INCONNU);
  });

  it("is unknown for a negative, missing or non-numeric price", () => {
    expect(tarifDepuisEndpoints(ep(sortie(-1)))).toEqual(INCONNU);
    expect(tarifDepuisEndpoints(ep(sortie(Number.NaN)))).toEqual(INCONNU);
    expect(tarifDepuisEndpoints(ep({ billable: "output_image", unit: "image", cost_usd: "0.02" }))).toEqual(INCONNU);
    expect(tarifDepuisEndpoints(ep({ billable: "output_image", unit: "image" }))).toEqual(INCONNU);
    expect(tarifDepuisEndpoints(ep(sortie(0.02), { billable: "input_image", unit: "image", cost_usd: -0.1 }))).toEqual(INCONNU);
  });

  it("is unknown when one provider has no output price while another has one", () => {
    const partiel = {
      endpoints: [
        { provider_name: "A", pricing: [sortie(0.02)] },
        { provider_name: "B", pricing: [] },
      ],
    };
    expect(tarifDepuisEndpoints(partiel)).toEqual(INCONNU);
  });

  it("counts input_reference per image as an input price (riverflow-v2-pro: 0,20 $ per reference)", () => {
    const riverflow = ep(
      sortie(0.15),
      sortie(0.15, { variant: "2k" }),
      sortie(0.33, { variant: "4k" }),
      { billable: "input_font", unit: "image", cost_usd: 0.03 },
      { billable: "input_reference", unit: "image", cost_usd: 0.2 },
    );
    expect(tarifDepuisEndpoints(riverflow)).toEqual({ kind: "image", sortieUsd: 0.33, entreeParImageUsd: 0.2 });
  });

  it("adds a per-request input fee to the output price (recraft-v4-styles-pro: 0,005 $ per request)", () => {
    const recraft = ep(sortie(0.1), { billable: "input_reference", unit: "request", cost_usd: 0.005 });
    const t = tarifDepuisEndpoints(recraft);
    expect(t.kind).toBe("image");
    if (t.kind !== "image") return;
    expect(t.sortieUsd).toBeCloseTo(0.105, 10);
    expect(t.entreeParImageUsd).toBe(0);
    // 0,105 $ dépasse le seuil de 0,10 $ : un lancement à une image doit demander confirmation
    expect(devisLancement([estimerEssai({ id: "r", tarif: t }, 1)]).confirmationRequise).toBe(true);
  });

  it("ignores input_font and input_text, which the Studio never sends", () => {
    const t = ep(
      sortie(0.02),
      { billable: "input_font", unit: "image", cost_usd: 5 },
      { billable: "input_text", unit: "token", cost_usd: 0.000001 },
    );
    expect(tarifDepuisEndpoints(t)).toEqual({ kind: "image", sortieUsd: 0.02, entreeParImageUsd: 0 });
  });
});

describe("normaliserModele", () => {
  it("keeps an image-to-image model with its references and ratios", () => {
    const tarif: Tarif = { kind: "image", sortieUsd: 0.0184, entreeParImageUsd: 0 };
    const m = normaliserModele(QWEN_RAW, tarif);
    expect(m).toEqual({
      id: "qwen/qwen-image-2.1-turbo",
      nom: "Qwen: Qwen Image 2.1 Turbo",
      description: "Modèle d'image rapide.",
      maxReferences: 4,
      minReferences: 0,
      ratios: ["1:1", "3:2", "3:4", "4:3", "9:16"],
      tarif,
    });
    expect(m?.ratios).toContain(RATIO_STUDIO);
  });

  it("excludes a text-only input (recraft-v4.1-flash)", () => {
    expect(normaliserModele(RECRAFT_FLASH_RAW, INCONNU)).toBeNull();
  });

  it("excludes a model whose output has no image", () => {
    const sansImage = { ...QWEN_RAW, architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] } };
    expect(normaliserModele(sansImage, INCONNU)).toBeNull();
    expect(normaliserModele({ ...QWEN_RAW, architecture: undefined }, INCONNU)).toBeNull();
    expect(normaliserModele({ ...QWEN_RAW, architecture: { input_modalities: ["image"] } }, INCONNU)).toBeNull();
  });

  it("keeps a model that outputs text alongside the image (gemini)", () => {
    const gemini = {
      ...QWEN_RAW,
      id: "google/gemini-3-pro-image",
      architecture: { input_modalities: ["image", "text"], output_modalities: ["image", "text"] },
    };
    expect(normaliserModele(gemini, JETON)?.id).toBe("google/gemini-3-pro-image");
  });

  it("excludes a model that accepts no reference (input_references.max < 1)", () => {
    const zero = { ...QWEN_RAW, supported_parameters: { input_references: { type: "range", min: 0, max: 0 } } };
    expect(normaliserModele(zero, INCONNU)).toBeNull();
  });

  it("keeps min and max of input_references (krea/k3-edit requires at least one)", () => {
    const k3 = { ...QWEN_RAW, supported_parameters: { input_references: { type: "range", min: 1, max: 8 } } };
    expect(normaliserModele(k3, INCONNU)).toMatchObject({ minReferences: 1, maxReferences: 8 });
  });

  it("has null ratios when the model lists no aspect_ratio", () => {
    const sansRatio = { ...QWEN_RAW, supported_parameters: { input_references: { type: "range", min: 0, max: 4 } } };
    expect(normaliserModele(sansRatio, INCONNU)?.ratios).toBeNull();
    const mal = { ...QWEN_RAW, supported_parameters: { aspect_ratio: { type: "enum", values: "1:1" } } };
    expect(normaliserModele(mal, INCONNU)?.ratios).toBeNull();
  });

  it("keeps only string ratios", () => {
    const melange = { ...QWEN_RAW, supported_parameters: { aspect_ratio: { type: "enum", values: ["1:1", 3, null, "3:4"] }, input_references: { max: 2 } } };
    expect(normaliserModele(melange, INCONNU)?.ratios).toEqual(["1:1", "3:4"]);
  });

  it("falls back to one reference when an image-input model publishes no input_references (meta/muse-image)", () => {
    const muse = { ...QWEN_RAW, supported_parameters: {} };
    expect(normaliserModele(muse, INCONNU)).toMatchObject({ maxReferences: 1, minReferences: 0, ratios: null });
    expect(normaliserModele({ ...QWEN_RAW, supported_parameters: undefined }, INCONNU)).toMatchObject({ maxReferences: 1 });
    // max illisible : même repli que l'absence
    const illisible = { ...QWEN_RAW, supported_parameters: { input_references: { type: "range", min: 0, max: "4" } } };
    expect(normaliserModele(illisible, INCONNU)).toMatchObject({ maxReferences: 1 });
  });

  it("never lets minReferences exceed maxReferences", () => {
    const absurde = { ...QWEN_RAW, supported_parameters: { input_references: { min: 5, max: 2 } } };
    expect(normaliserModele(absurde, INCONNU)).toMatchObject({ minReferences: 2, maxReferences: 2 });
  });

  it("excludes a vector-only model: its SVG output can never be stored or scored", () => {
    const svg = {
      ...QWEN_RAW,
      id: "recraft/recraft-v4-vector",
      supported_parameters: { output_format: { type: "enum", values: ["svg"] }, input_references: { min: 0, max: 1 } },
    };
    expect(normaliserModele(svg, INCONNU)).toBeNull();
    const aussiRaster = { ...svg, supported_parameters: { output_format: { type: "enum", values: ["png", "jpeg", "webp"] }, input_references: { min: 0, max: 1 } } };
    expect(normaliserModele(aussiRaster, INCONNU)).not.toBeNull();
  });

  it("falls back to the id for a missing name and to an empty description", () => {
    const m = normaliserModele({ id: "x/y", architecture: QWEN_RAW.architecture }, INCONNU);
    expect(m).toMatchObject({ id: "x/y", nom: "x/y", description: "" });
  });

  it("rejects anything that is not a model object with an id", () => {
    expect(normaliserModele(null, INCONNU)).toBeNull();
    expect(normaliserModele("qwen", INCONNU)).toBeNull();
    expect(normaliserModele([], INCONNU)).toBeNull();
    expect(normaliserModele({ ...QWEN_RAW, id: "" }, INCONNU)).toBeNull();
    expect(normaliserModele({ ...QWEN_RAW, id: 12 }, INCONNU)).toBeNull();
    expect(normaliserModele({ ...QWEN_RAW, id: undefined }, INCONNU)).toBeNull();
  });
});

describe("estimerEssai", () => {
  const m = (tarif: Tarif) => ({ id: "m/x", tarif });

  it("adds the per-reference input price, rounded to 1e-4", () => {
    const e = estimerEssai(m({ kind: "image", sortieUsd: 0.02, entreeParImageUsd: 0.001 }), 3);
    expect(e.usd).toBe(0.023);
    expect(e).toEqual({ modele: "m/x", usd: 0.023, raison: "image" });
  });

  it("is just the output price when the input is free", () => {
    expect(estimerEssai(m({ kind: "image", sortieUsd: 0.0184, entreeParImageUsd: 0 }), 4).usd).toBe(0.0184);
  });

  it("rounds to four decimals", () => {
    expect(estimerEssai(m({ kind: "image", sortieUsd: 0.01234567, entreeParImageUsd: 0 }), 0).usd).toBe(0.0123);
  });

  it("treats a non-positive or non-finite reference count as no reference", () => {
    const t: Tarif = { kind: "image", sortieUsd: 0.02, entreeParImageUsd: 0.01 };
    expect(estimerEssai(m(t), 0).usd).toBe(0.02);
    expect(estimerEssai(m(t), -2).usd).toBe(0.02);
    expect(estimerEssai(m(t), Number.NaN).usd).toBe(0.02);
  });

  it("gives no number for a per-token or unknown tariff (never an invented price)", () => {
    expect(estimerEssai(m(JETON), 3)).toEqual({ modele: "m/x", usd: null, raison: "jeton" });
    expect(estimerEssai(m(INCONNU), 3)).toEqual({ modele: "m/x", usd: null, raison: "inconnu" });
  });
});

describe("devisLancement", () => {
  const e = (usd: number | null, raison: Estimation["raison"] = usd === null ? "jeton" : "image", modele = "m"): Estimation => ({
    modele,
    usd,
    raison,
  });

  it("does not ask for confirmation at exactly 0,10 $ (the threshold is strict)", () => {
    const d = devisLancement([e(0.05), e(0.05)]);
    expect(d.totalConnuUsd).toBe(0.1);
    expect(d.confirmationRequise).toBe(false);
    expect(d.inconnus).toBe(0);
  });

  it("asks for confirmation just above 0,10 $", () => {
    expect(devisLancement([e(0.05), e(0.0501)]).confirmationRequise).toBe(true);
    expect(devisLancement([e(0.06), e(0.05)]).confirmationRequise).toBe(true);
  });

  it("is not fooled by floating-point noise on an exact 0,10 $ sum", () => {
    // 0.0012 + 0.0889 + 0.0099 vaut 0.10000000000000002 en virgule flottante
    const d = devisLancement([e(0.0012), e(0.0889), e(0.0099)]);
    expect(0.0012 + 0.0889 + 0.0099).toBeGreaterThan(0.1);
    expect(d.totalConnuUsd).toBe(0.1);
    expect(d.confirmationRequise).toBe(false);
  });

  it("asks for confirmation as soon as one tariff is unknown, and totals only the known ones", () => {
    const d = devisLancement([e(0.01), e(null, "jeton")]);
    expect(d.confirmationRequise).toBe(true);
    expect(d.inconnus).toBe(1);
    expect(d.totalConnuUsd).toBe(0.01);
    expect(devisLancement([e(null, "inconnu")]).confirmationRequise).toBe(true);
  });

  it("counts an unusable amount as unknown instead of zero", () => {
    const d = devisLancement([e(Number.NaN, "image"), e(-1, "image"), e(0.02)]);
    expect(d.inconnus).toBe(2);
    expect(d.totalConnuUsd).toBe(0.02);
    expect(d.confirmationRequise).toBe(true);
  });

  it("is a zero quote for no estimation, and keeps the lines in order", () => {
    expect(devisLancement([])).toEqual({ lignes: [], totalConnuUsd: 0, inconnus: 0, confirmationRequise: false });
    const lignes = [e(0.01, "image", "a"), e(null, "jeton", "b")];
    expect(devisLancement(lignes).lignes).toEqual(lignes);
  });

  it("does not alias the input array", () => {
    const lignes = [e(0.01)];
    const d = devisLancement(lignes);
    lignes.push(e(0.5));
    expect(d.lignes).toHaveLength(1);
  });
});

describe("libelleTarif", () => {
  it("labels a per-image price", () => {
    expect(libelleTarif({ kind: "image", sortieUsd: 0.0184, entreeParImageUsd: 0 })).toBe("0,018 $/image");
    expect(libelleTarif({ kind: "image", sortieUsd: 0.1, entreeParImageUsd: 0 })).toBe("0,100 $/image");
  });

  it("shows a paid reference input next to the output price", () => {
    expect(libelleTarif({ kind: "image", sortieUsd: 0.33, entreeParImageUsd: 0.2 })).toBe("0,330 $/image + 0,200 $/réf.");
  });

  it("labels per-token and unknown tariffs", () => {
    expect(libelleTarif({ kind: "jeton" })).toBe("tarif au jeton");
    expect(libelleTarif({ kind: "inconnu" })).toBe("tarif inconnu");
  });
});

describe("formatUsd", () => {
  it("writes an unknown amount as « inconnu »", () => {
    expect(formatUsd(null)).toBe("inconnu");
    expect(formatUsd(Number.NaN)).toBe("inconnu");
    expect(formatUsd(-0.5)).toBe("inconnu");
  });

  it("uses three decimals under one dollar and two above, with a comma", () => {
    expect(formatUsd(0.0184)).toBe("0,018 $");
    expect(formatUsd(0.023)).toBe("0,023 $");
    expect(formatUsd(0.1)).toBe("0,100 $");
    expect(formatUsd(1.5)).toBe("1,50 $");
    expect(formatUsd(12)).toBe("12,00 $");
  });

  it("never shows 1,000 $ for a sub-dollar amount that rounds up to a dollar", () => {
    expect(formatUsd(0.9996)).toBe("1,00 $");
  });

  it("shows zero as 0,00 $ and a non-zero amount below the display precision as < 0,001 $", () => {
    expect(formatUsd(0)).toBe("0,00 $");
    expect(formatUsd(0.0003)).toBe("< 0,001 $");
  });
});
