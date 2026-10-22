import { describe, expect, it } from "vitest";

import {
  BUDGET_PAR_DEFAUT,
  BUDGET_PAR_SAC_EUR_DEFAUT,
  PRISES_PAR_SAC,
  RATIO_STUDIO,
  TAUX_EUR_PAR_USD_DEFAUT,
  comparerAuBudget,
  coutSac,
  devisDuLancement,
  devisLancement,
  entreesEnvoyees,
  estimerEssai,
  eurEnUsd,
  formatEur,
  formatUsd,
  libelleTarif,
  lireBudgetSaisi,
  normaliserModele,
  placesPourPhotos,
  tarifDepuisEndpoints,
  usdEnEur,
  type BudgetCompte,
  type Estimation,
  type ModeleImage,
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

/** 1 € = 1 $ et 0,10 € de budget : les seuils exacts de l'ancien test à 0,10 $, pour garder les cas limites. */
const DIXIEME: BudgetCompte = { budgetParSacEur: 0.1, tauxEurParUsd: 1 };

/** Un fournisseur, avec le tableau de prix donné. */
const ep = (...pricing: unknown[]) => ({ endpoints: [{ provider_name: "P", pricing }] });
const sortie = (cost_usd: number, extra: Record<string, unknown> = {}) => ({
  billable: "output_image",
  unit: "image",
  cost_usd,
  ...extra,
});

describe("constantes", () => {
  it("fixes the default budget (1 € per bag), the default rate (0,86 € per $), the bag size and the Studio ratio", () => {
    expect(BUDGET_PAR_SAC_EUR_DEFAUT).toBe(1);
    expect(TAUX_EUR_PAR_USD_DEFAUT).toBe(0.86);
    expect(BUDGET_PAR_DEFAUT).toEqual({ budgetParSacEur: 1, tauxEurParUsd: 0.86 });
    expect(PRISES_PAR_SAC).toBe(15);
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
    // le forfait par requête compte : 0,105 $ dépasse un budget de 0,10 $ (0,100 $ sans lui n'aurait rien demandé)
    expect(devisLancement([estimerEssai({ id: "r", tarif: t }, 1)], DIXIEME).confirmationRequise).toBe(true);
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

  it("does not ask for confirmation at exactly the budget (the threshold is strict)", () => {
    const d = devisLancement([e(0.05), e(0.05)], DIXIEME);
    expect(d.totalConnuUsd).toBe(0.1);
    expect(d.totalConnuEur).toBe(0.1);
    expect(d.confirmationRequise).toBe(false);
    expect(d.depasseBudget).toBe(false);
    expect(d.raisonConfirmation).toBeNull();
    expect(d.inconnus).toBe(0);
  });

  it("asks for confirmation just above the budget", () => {
    const d = devisLancement([e(0.05), e(0.0501)], DIXIEME);
    expect(d.confirmationRequise).toBe(true);
    expect(d.depasseBudget).toBe(true);
    expect(d.raisonConfirmation).toBe("budget");
    expect(devisLancement([e(0.06), e(0.05)], DIXIEME).confirmationRequise).toBe(true);
  });

  it("is not fooled by floating-point noise on an exact budget sum", () => {
    // 0.0012 + 0.0889 + 0.0099 vaut 0.10000000000000002 en virgule flottante
    const d = devisLancement([e(0.0012), e(0.0889), e(0.0099)], DIXIEME);
    expect(0.0012 + 0.0889 + 0.0099).toBeGreaterThan(0.1);
    expect(d.totalConnuUsd).toBe(0.1);
    expect(d.confirmationRequise).toBe(false);
  });

  it("is not fooled by the dollar-euro conversion noise at the boundary either", () => {
    // 0,1 $ au taux 0,86 = 0,086 € ; le budget 0,086 € est atteint pile, pas dépassé
    const d = devisLancement([e(0.1)], { budgetParSacEur: 0.086, tauxEurParUsd: 0.86 });
    expect(d.confirmationRequise).toBe(false);
    expect(devisLancement([e(0.1001)], { budgetParSacEur: 0.086, tauxEurParUsd: 0.86 }).confirmationRequise).toBe(true);
  });

  it("converts to euros at the account rate and compares in euros", () => {
    // 1,2 $ × 0,86 = 1,032 € > 1 € ; 1,1 $ × 0,86 = 0,946 € ≤ 1 €
    expect(devisLancement([e(1.2)]).confirmationRequise).toBe(true);
    expect(devisLancement([e(1.1)]).confirmationRequise).toBe(false);
    // le même 1,2 $ passe avec un budget de 2 €, ou avec un taux plus bas
    expect(devisLancement([e(1.2)], { budgetParSacEur: 2, tauxEurParUsd: 0.86 }).confirmationRequise).toBe(false);
    expect(devisLancement([e(1.2)], { budgetParSacEur: 1, tauxEurParUsd: 0.8 }).confirmationRequise).toBe(false);
  });

  it("applies the default budget (1 €, 0,86) when none is given: the old 0,10 $ threshold is gone", () => {
    const d = devisLancement([e(0.5), e(0.5)]);
    expect(d.budgetEur).toBe(1);
    expect(d.tauxEurParUsd).toBe(0.86);
    expect(d.confirmationRequise).toBe(false); // 1,00 $ = 0,86 €, et 0,10 $ aurait demandé
    expect(d.totalConnuEur).toBe(0.86);
  });

  it("asks for confirmation as soon as one tariff is unknown, and totals only the known ones", () => {
    const d = devisLancement([e(0.01), e(null, "jeton")], DIXIEME);
    expect(d.confirmationRequise).toBe(true);
    expect(d.inconnus).toBe(1);
    expect(d.totalConnuUsd).toBe(0.01);
    expect(d.raisonConfirmation).toBe("prix_inconnu");
    expect(d.depasseBudget).toBe(false);
    expect(d.montantMinimum).toBe(true);
    expect(devisLancement([e(null, "inconnu")]).confirmationRequise).toBe(true);
  });

  it("names both reasons when the known part is over the budget AND a price is unknown", () => {
    const d = devisLancement([e(0.5), e(null, "jeton")], DIXIEME);
    expect(d.raisonConfirmation).toBe("budget_et_prix_inconnu");
    expect(d.confirmationRequise).toBe(true);
  });

  it("gives the confirmation amount in euros, rounded UP to the cent, never below the real total", () => {
    // 1,5 $ × 0,86 = 1,29 € ; 1,6 $ × 0,86 = 1,376 € → 1,38 €
    const d = devisLancement([e(1.6)]);
    expect(d.totalConnuEur).toBe(1.376);
    expect(d.montantConfirmationEur).toBe(1.38);
    expect(d.montantMinimum).toBe(false);
    expect(devisLancement([e(1.5)]).montantConfirmationEur).toBe(1.29);
    // un montant déjà rond ne bouge pas (pas de centime en trop par flottant)
    expect(devisLancement([e(1)], { budgetParSacEur: 0.5, tauxEurParUsd: 1 }).montantConfirmationEur).toBe(1);
  });

  it("counts an unusable amount as unknown instead of zero", () => {
    const d = devisLancement([e(Number.NaN, "image"), e(-1, "image"), e(0.02)]);
    expect(d.inconnus).toBe(2);
    expect(d.totalConnuUsd).toBe(0.02);
    expect(d.confirmationRequise).toBe(true);
  });

  it("never lets an unusable budget or rate skip the confirmation", () => {
    for (const budget of [
      { budgetParSacEur: Number.NaN, tauxEurParUsd: 0.86 },
      { budgetParSacEur: 0, tauxEurParUsd: 0.86 },
      { budgetParSacEur: -1, tauxEurParUsd: 0.86 },
      { budgetParSacEur: 1, tauxEurParUsd: 0 },
      { budgetParSacEur: 1, tauxEurParUsd: Number.NaN },
    ]) {
      const d = devisLancement([e(0.01)], budget);
      expect(d.confirmationRequise, JSON.stringify(budget)).toBe(true);
      expect(d.depasseBudget).toBe(true);
    }
  });

  it("is a zero quote for no estimation, and keeps the lines in order", () => {
    expect(devisLancement([])).toMatchObject({ lignes: [], totalConnuUsd: 0, totalConnuEur: 0, inconnus: 0, confirmationRequise: false });
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

describe("conversion et budget", () => {
  it("converts dollars to euros and back at the account rate, null stays null", () => {
    expect(usdEnEur(1, 0.86)).toBe(0.86);
    expect(usdEnEur(0.018, 0.86)).toBe(0.01548);
    expect(eurEnUsd(0.86, 0.86)).toBe(1);
    expect(usdEnEur(null, 0.86)).toBeNull();
    expect(eurEnUsd(null, 0.86)).toBeNull();
  });

  it("refuses to convert an unusable amount or rate instead of inventing a number", () => {
    expect(usdEnEur(Number.NaN, 0.86)).toBeNull();
    expect(usdEnEur(-1, 0.86)).toBeNull();
    expect(usdEnEur(1, 0)).toBeNull();
    expect(usdEnEur(1, Number.NaN)).toBeNull();
    expect(eurEnUsd(1, 0)).toBeNull();
  });

  it("compares to the budget: strictly above is out, the budget itself is in, no amount is unknown", () => {
    expect(comparerAuBudget(0.99, 1)).toBe("dans");
    expect(comparerAuBudget(1, 1)).toBe("dans");
    expect(comparerAuBudget(1.0001, 1)).toBe("hors");
    expect(comparerAuBudget(null, 1)).toBe("inconnu");
    expect(comparerAuBudget(Number.NaN, 1)).toBe("inconnu");
    expect(comparerAuBudget(0.5, 0)).toBe("inconnu");
    expect(comparerAuBudget(0.5, Number.NaN)).toBe("inconnu");
  });
});

describe("lireBudgetSaisi", () => {
  it("reads a budget and a rate, rounded to the cent and to four decimals", () => {
    expect(lireBudgetSaisi({ budgetParSacEur: 1.239, tauxEurParUsd: 0.86123456 })).toEqual({ budgetParSacEur: 1.24, tauxEurParUsd: 0.8612 });
  });

  it("treats an absent field as unchanged and an empty body as nothing", () => {
    expect(lireBudgetSaisi({ budgetParSacEur: 2 })).toEqual({ budgetParSacEur: 2 });
    expect(lireBudgetSaisi({ tauxEurParUsd: 0.9 })).toEqual({ tauxEurParUsd: 0.9 });
    expect(lireBudgetSaisi({ promptMaitre: "x" })).toEqual({});
  });

  it("refuses a present but unusable field: null, a string, NaN, out of bounds", () => {
    const erreur = (body: unknown) => expect("erreur" in lireBudgetSaisi(body), JSON.stringify(body)).toBe(true);
    erreur(null);
    erreur([1]);
    erreur({ budgetParSacEur: null });
    erreur({ budgetParSacEur: "1" });
    erreur({ budgetParSacEur: Number.NaN });
    erreur({ budgetParSacEur: 0 });
    erreur({ budgetParSacEur: 0.004 }); // arrondi à 0,00
    erreur({ budgetParSacEur: -1 });
    erreur({ budgetParSacEur: 1000.01 });
    erreur({ tauxEurParUsd: null });
    erreur({ tauxEurParUsd: "0,86" });
    erreur({ tauxEurParUsd: 0.086 });
    erreur({ tauxEurParUsd: 8.6 });
    erreur({ tauxEurParUsd: 0.49 });
    erreur({ tauxEurParUsd: 2.01 });
    expect(lireBudgetSaisi({ budgetParSacEur: 1000, tauxEurParUsd: 2 })).toEqual({ budgetParSacEur: 1000, tauxEurParUsd: 2 });
    expect(lireBudgetSaisi({ budgetParSacEur: 0.01, tauxEurParUsd: 0.5 })).toEqual({ budgetParSacEur: 0.01, tauxEurParUsd: 0.5 });
  });
});

describe("entreesEnvoyees et placesPourPhotos", () => {
  it("keeps one slot for the failed image of a correction", () => {
    expect(placesPourPhotos(4, true)).toBe(3);
    expect(placesPourPhotos(4, false)).toBe(4);
    expect(placesPourPhotos(1, true)).toBe(0);
    expect(placesPourPhotos(Number.NaN, false)).toBe(0);
  });

  it("counts the inputs actually sent, truncated to the model maximum, failed image included", () => {
    expect(entreesEnvoyees({ maxReferences: 2 }, 5, false)).toEqual({ photos: 2, total: 2 });
    expect(entreesEnvoyees({ maxReferences: 2 }, 1, true)).toEqual({ photos: 1, total: 2 });
    expect(entreesEnvoyees({ maxReferences: 1 }, 3, true)).toEqual({ photos: 0, total: 1 });
    expect(entreesEnvoyees({ maxReferences: 4 }, 0, false)).toEqual({ photos: 0, total: 0 });
    expect(entreesEnvoyees({ maxReferences: 4 }, Number.NaN, false)).toEqual({ photos: 0, total: 0 });
  });
});

const modeleImg = (id: string, tarif: Tarif, over: Partial<ModeleImage> = {}): ModeleImage => ({
  id,
  nom: id,
  description: "",
  maxReferences: 4,
  minReferences: 0,
  ratios: ["3:4"],
  tarif,
  ...over,
});
const image = (sortieUsd: number, entreeParImageUsd = 0): Tarif => ({ kind: "image", sortieUsd, entreeParImageUsd });

describe("coutSac", () => {
  it("costs a full bag: 15 prises, one image each, one real photo per image, in euros", () => {
    // 0,02 $/image + 0,001 $ pour la photo d'entrée = 0,021 $ ; × 15 = 0,315 $ ; × 0,86 = 0,2709 €
    const c = coutSac(modeleImg("a/x", image(0.02, 0.001)));
    expect(c).toEqual({
      modele: "a/x",
      nbPrises: 15,
      raison: "image",
      usdParImage: 0.021,
      eurParImage: 0.01806,
      usd: 0.315,
      eur: 0.2709,
      statutBudget: "dans",
    });
  });

  it("flags a model above the budget instead of hiding it (Nano Banana Pro ≈ 2 $ per bag)", () => {
    const c = coutSac(modeleImg("google/pro", image(0.134)));
    expect(c.usd).toBe(2.01);
    expect(c.eur).toBe(1.7286);
    expect(c.statutBudget).toBe("hors");
  });

  it("is within the budget at exactly the budget", () => {
    const c = coutSac(modeleImg("a/x", image(0.1)), { budgetParSacEur: 1.5, tauxEurParUsd: 1 });
    expect(c.eur).toBe(1.5);
    expect(c.statutBudget).toBe("dans");
  });

  it("follows the account budget and rate", () => {
    const m = modeleImg("a/x", image(0.1)); // 1,5 $ le sac
    expect(coutSac(m, { budgetParSacEur: 1, tauxEurParUsd: 0.86 }).statutBudget).toBe("hors"); // 1,29 €
    expect(coutSac(m, { budgetParSacEur: 1.5, tauxEurParUsd: 0.86 }).statutBudget).toBe("dans");
    expect(coutSac(m, { budgetParSacEur: 1, tauxEurParUsd: 0.6 }).statutBudget).toBe("dans"); // 0,9 €
  });

  it("has no bag cost for a per-token or unknown tariff: never zero, never in budget", () => {
    for (const [tarif, raison] of [
      [{ kind: "jeton" }, "jeton"],
      [{ kind: "inconnu" }, "inconnu"],
    ] as const) {
      expect(coutSac(modeleImg("a/x", tarif))).toEqual({
        modele: "a/x",
        nbPrises: 15,
        raison,
        usdParImage: null,
        eurParImage: null,
        usd: null,
        eur: null,
        statutBudget: "inconnu",
      });
    }
  });

  it("charges the input reference once per image, and caps the references at the model maximum", () => {
    // riverflow-like : 0,2 $ par référence ; un modèle qui n'accepte qu'une image en prend une
    expect(coutSac(modeleImg("a/x", image(0.1, 0.2)), BUDGET_PAR_DEFAUT, { nbPhotosParPrise: 3 }).usdParImage).toBe(0.7);
    expect(coutSac(modeleImg("a/x", image(0.1, 0.2), { maxReferences: 1 }), BUDGET_PAR_DEFAUT, { nbPhotosParPrise: 3 }).usdParImage).toBe(0.3);
  });

  it("takes another bag size when asked, and falls back to 15 on nonsense", () => {
    expect(coutSac(modeleImg("a/x", image(0.1)), BUDGET_PAR_DEFAUT, { nbPrises: 5 }).usd).toBe(0.5);
    expect(coutSac(modeleImg("a/x", image(0.1)), BUDGET_PAR_DEFAUT, { nbPrises: 0 }).nbPrises).toBe(15);
    expect(coutSac(modeleImg("a/x", image(0.1)), BUDGET_PAR_DEFAUT, { nbPrises: Number.NaN }).nbPrises).toBe(15);
  });
});

describe("devisDuLancement (1 à 3 modèles sur les mêmes cases)", () => {
  const A = modeleImg("a/un", image(0.02));
  const B = modeleImg("b/deux", image(0.05));
  const JET = modeleImg("c/jeton", { kind: "jeton" });

  it("multiplies the cost by the number of models for one prise", () => {
    const d = devisDuLancement({ modeles: [A, B], nbCases: 1 });
    expect(d.images).toBe(2);
    expect(d.totalConnuUsd).toBe(0.07);
    expect(d.totalConnuEur).toBe(0.0602);
    expect(d.parModele).toEqual([
      { modele: "a/un", nom: "a/un", images: 1, raison: "image", usdParImage: 0.02, eurParImage: 0.0172, usd: 0.02, eur: 0.0172 },
      { modele: "b/deux", nom: "b/deux", images: 1, raison: "image", usdParImage: 0.05, eurParImage: 0.043, usd: 0.05, eur: 0.043 },
    ]);
    expect(d.confirmationRequise).toBe(false);
  });

  it("multiplies by the cases as well: 15 cases × 3 models", () => {
    const d = devisDuLancement({ modeles: [A, B, modeleImg("d/trois", image(0.1))], nbCases: 15 });
    expect(d.images).toBe(45);
    expect(d.lignes).toHaveLength(45);
    expect(d.totalConnuUsd).toBe(2.55); // 15 × (0,02 + 0,05 + 0,1)
    expect(d.totalConnuEur).toBe(2.193);
    expect(d.depasseBudget).toBe(true);
    expect(d.montantConfirmationEur).toBe(2.2); // 2,193 → centime supérieur
    expect(d.raisonConfirmation).toBe("budget");
  });

  it("keeps an unknown price as null on its model line and asks for confirmation, with a minimum amount", () => {
    const d = devisDuLancement({ modeles: [A, JET], nbCases: 4 });
    expect(d.parModele[1]).toMatchObject({ modele: "c/jeton", images: 4, raison: "jeton", usdParImage: null, usd: null, eur: null, eurParImage: null });
    expect(d.inconnus).toBe(4);
    expect(d.totalConnuUsd).toBe(0.08);
    expect(d.confirmationRequise).toBe(true);
    expect(d.raisonConfirmation).toBe("prix_inconnu");
    expect(d.montantMinimum).toBe(true);
  });

  it("charges the failed image of a correction as an extra input, and truncates the photos to the model maximum", () => {
    const m = modeleImg("f/deux-refs", image(0.05, 0.01), { maxReferences: 2 });
    expect(devisDuLancement({ modeles: [m], nbCases: 1, nbPhotos: 5 }).parModele[0].usdParImage).toBe(0.07);
    expect(devisDuLancement({ modeles: [m], nbCases: 1, nbPhotos: 1, avecImageRatee: true }).parModele[0].usdParImage).toBe(0.07);
    expect(devisDuLancement({ modeles: [m], nbCases: 1 }).parModele[0].usdParImage).toBe(0.06);
  });

  it("uses the account budget, and the same quote for the screen and the server", () => {
    const petit: BudgetCompte = { budgetParSacEur: 0.05, tauxEurParUsd: 1 };
    const d = devisDuLancement({ modeles: [A, B], nbCases: 1, budget: petit });
    expect(d.budgetEur).toBe(0.05);
    expect(d.confirmationRequise).toBe(true); // 0,07 € > 0,05 €
    expect(devisDuLancement({ modeles: [A, B], nbCases: 1, budget: { budgetParSacEur: 0.07, tauxEurParUsd: 1 } }).confirmationRequise).toBe(false);
  });

  it("falls back to one case on a nonsense count, and handles no model", () => {
    expect(devisDuLancement({ modeles: [A], nbCases: 0 }).images).toBe(1);
    expect(devisDuLancement({ modeles: [A], nbCases: Number.NaN }).images).toBe(1);
    expect(devisDuLancement({ modeles: [], nbCases: 3 })).toMatchObject({ images: 0, parModele: [], confirmationRequise: false });
  });
});

describe("formatEur", () => {
  it("formats a euro amount: two decimals from 0,10 €, three below (a per-image price)", () => {
    expect(formatEur(1.34)).toBe("1,34 €");
    expect(formatEur(1)).toBe("1,00 €");
    expect(formatEur(12.5)).toBe("12,50 €");
    expect(formatEur(0.4123)).toBe("0,41 €");
    expect(formatEur(0.0156)).toBe("0,016 €");
    expect(formatEur(0.0172)).toBe("0,017 €");
  });

  it("keeps two decimals for an amount that is a whole number of cents, even under 0,10 €", () => {
    expect(formatEur(0.05)).toBe("0,05 €");
    expect(formatEur(0.1)).toBe("0,10 €");
    expect(formatEur(0.01)).toBe("0,01 €");
    expect(formatEur(0.086)).toBe("0,086 €");
  });

  it("never shows 0,000 € for a real amount, and keeps the zero a zero", () => {
    expect(formatEur(0.0001)).toBe("< 0,001 €");
    expect(formatEur(0)).toBe("0,00 €");
  });

  it("says « inconnu » for a missing or unusable amount", () => {
    expect(formatEur(null)).toBe("inconnu");
    expect(formatEur(Number.NaN)).toBe("inconnu");
    expect(formatEur(-1)).toBe("inconnu");
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
