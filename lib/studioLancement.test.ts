import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { promptVariante } from "./studioCases";
import { StudioGenerationError, type DemandeImage, type ImageGeneree } from "./studioGeneration";
import {
  MAX_MODELES_PAR_LANCEMENT,
  controlerLancement,
  executerGeneration,
  lireCorpsGeneration,
  promptDeCorrection,
  referencesAEnvoyer,
  type ContexteGeneration,
  type CorpsGeneration,
  type DepsGeneration,
  type NouvelEchec,
  type NouvelEssai,
} from "./studioLancement";
import { BUDGET_PAR_DEFAUT, type BudgetCompte, type ModeleImage, type Tarif } from "./studioModeles";

// ── Fixtures ────────────────────────────────────────────────────────────────

const UUID = "3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b";
const USER = "user-1";

function modele(id: string, tarif: Tarif, over: Partial<ModeleImage> = {}): ModeleImage {
  return { id, nom: id, description: "", maxReferences: 4, minReferences: 0, ratios: ["1:1", "3:4"], tarif, ...over };
}
const image = (sortieUsd: number, entreeParImageUsd = 0): Tarif => ({ kind: "image", sortieUsd, entreeParImageUsd });
const JETON: Tarif = { kind: "jeton" };

const CATALOGUE: Record<string, ModeleImage> = {
  "a/jeton": modele("a/jeton", JETON),
  "b/jeton": modele("b/jeton", JETON),
  "c/six": modele("c/six", image(0.06)),
  "d/cinq": modele("d/cinq", image(0.05)),
  "e/cinq": modele("e/cinq", image(0.05)),
  "f/deux-refs": modele("f/deux-refs", image(0.05, 0.01), { maxReferences: 2 }),
  "g/sans-ratio": modele("g/sans-ratio", image(0.01), { ratios: null }),
  "h/carre": modele("h/carre", image(0.01), { ratios: ["1:1", "16:9"] }),
  "i/une-ref": modele("i/une-ref", image(0.01), { maxReferences: 1 }),
  "j/trois-min": modele("j/trois-min", image(0.01), { minReferences: 3 }),
};

/**
 * 0,10 € de budget au taux 1 : les seuils de l'ancien test à 0,10 $ (0,10 pile
 * ne demande rien, au-delà si), pour garder les mêmes cas limites. Les tests du
 * budget réel du compte (1 €, 0,86) sont à part, plus bas.
 */
const PETIT_BUDGET: BudgetCompte = { budgetParSacEur: 0.1, tauxEurParUsd: 1 };

const REF = (n: number) => `data:image/jpeg;base64,UkVG${n}`;
const IMAGE_RATEE = "data:image/png;base64,UkFURUU=";

function contexte(over: Partial<ContexteGeneration> = {}): ContexteGeneration {
  return {
    colorisId: "col-1",
    angleId: "ang-1",
    referenceId: "ref-1",
    promptMaitre: "Recreate the exact same item. Change only the camera angle.",
    angleTexte: "Angle: camera about 8° to the right.",
    references: [REF(1), REF(2)],
    caseLibre: true,
    parent: null,
    ...over,
  };
}

function corps(over: Partial<CorpsGeneration> = {}): CorpsGeneration {
  return {
    cle: "5039-black-pink",
    angleId: "ang-1",
    referenceId: "ref-1",
    skuCible: "SDN15",
    nbCases: 1,
    modele: "d/cinq",
    modeles: ["d/cinq"],
    lancementId: UUID,
    confirme: false,
    ...over,
  };
}

const OCTETS = Buffer.from("octets-de-l-image-generee-qui-ne-doivent-pas-sortir");

type Appels = {
  contexte: CorpsGeneration[];
  catalogue: string[];
  budget: string[];
  cle: string[];
  generer: { d: DemandeImage; apiKey: string }[];
  deposer: { userId: string; img: ImageGeneree }[];
  creerEssai: NouvelEssai[];
  rejeterParent: string[];
  creerEchec: NouvelEchec[];
};

/** Dépendances factices qui enregistrent leurs appels ; chaque comportement se remplace. */
function fausses(
  opts: {
    ctx?: ContexteGeneration | null;
    image?: ImageGeneree;
    cle?: () => Promise<string>;
    generer?: (d: DemandeImage) => Promise<ImageGeneree>;
    deposer?: () => Promise<string>;
    creerEchec?: () => Promise<void>;
    budget?: BudgetCompte;
    /** Les valeurs successives de l'horloge ; sans elle, 250 ms s'écoulent entre deux lectures. */
    horloge?: number[];
  } = {},
) {
  const appels: Appels = { contexte: [], catalogue: [], budget: [], cle: [], generer: [], deposer: [], creerEssai: [], rejeterParent: [], creerEchec: [] };
  let tick = 1_000;
  const img: ImageGeneree = opts.image ?? { octets: OCTETS, mime: "image/png", coutUsd: 0.0421 };
  const deps: DepsGeneration = {
    async chargerContexte(_userId, c) {
      appels.contexte.push(c);
      return opts.ctx === undefined ? contexte() : opts.ctx;
    },
    async catalogue(id) {
      appels.catalogue.push(id);
      return CATALOGUE[id] ?? null;
    },
    async budget(userId) {
      appels.budget.push(userId);
      return opts.budget ?? PETIT_BUDGET;
    },
    maintenant() {
      if (opts.horloge) return opts.horloge.shift() ?? Number.NaN;
      const v = tick;
      tick += 250;
      return v;
    },
    async cle(userId) {
      appels.cle.push(userId);
      return opts.cle ? opts.cle() : "sk-or-v1-du-compte";
    },
    async generer(d, apiKey) {
      appels.generer.push({ d, apiKey });
      return opts.generer ? opts.generer(d) : img;
    },
    async deposer(userId, i) {
      appels.deposer.push({ userId, img: i });
      return opts.deposer ? opts.deposer() : "https://blob.example/generees/user-1/essai.png";
    },
    async creerEssai(data) {
      appels.creerEssai.push(data);
      return { id: "essai-neuf", numero: 2 };
    },
    async rejeterParent(id) {
      appels.rejeterParent.push(id);
    },
    async creerEchec(data) {
      appels.creerEchec.push(data);
      if (opts.creerEchec) await opts.creerEchec();
    },
  };
  return { deps, appels };
}

const rien = (a: Appels) => ({ cle: a.cle.length, generer: a.generer.length, deposer: a.deposer.length, creerEssai: a.creerEssai.length });

let errorSpy: MockInstance<typeof console.error>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errorSpy.mockRestore();
});

// ── referencesAEnvoyer ──────────────────────────────────────────────────────

describe("referencesAEnvoyer", () => {
  const cinq = [REF(1), REF(2), REF(3), REF(4), REF(5)];

  it("keeps one slot for the failed image of a correction", () => {
    expect(referencesAEnvoyer(cinq, 4, true)).toEqual({ envoyees: [REF(1), REF(2), REF(3)], tronquees: 2 });
  });

  it("truncates to the model maximum, in order", () => {
    expect(referencesAEnvoyer(cinq, 2, false)).toEqual({ envoyees: [REF(1), REF(2)], tronquees: 3 });
  });

  it("sends everything when the model accepts enough", () => {
    expect(referencesAEnvoyer([REF(1), REF(2)], 4, false)).toEqual({ envoyees: [REF(1), REF(2)], tronquees: 0 });
  });

  it("has no room left for a real photo on a single-image model during a correction", () => {
    expect(referencesAEnvoyer([REF(1), REF(2), REF(3)], 1, true)).toEqual({ envoyees: [], tronquees: 3 });
  });

  it("never returns a negative count on odd maxima", () => {
    expect(referencesAEnvoyer([REF(1)], 0, true)).toEqual({ envoyees: [], tronquees: 1 });
    expect(referencesAEnvoyer([REF(1)], Number.NaN, false)).toEqual({ envoyees: [], tronquees: 1 });
  });
});

// ── lireCorpsGeneration ─────────────────────────────────────────────────────

describe("lireCorpsGeneration", () => {
  const valide = { cle: "5039-black-pink", angleId: "ang-1", referenceId: "ref-1", modele: "a/x", modeles: ["a/x", "b/y"], lancementId: UUID, confirme: true };
  const erreur = (body: unknown) => {
    const r = lireCorpsGeneration(body);
    expect("erreur" in r, JSON.stringify(body)).toBe(true);
  };

  it("reads a valid body", () => {
    expect(lireCorpsGeneration(valide)).toEqual({ ...valide, skuCible: null, nbCases: 1, essaiParentId: null, detailsCorrection: [] });
  });

  it("treats anything but `true` as not confirmed", () => {
    for (const confirme of [undefined, "true", 1, false]) {
      const r = lireCorpsGeneration({ ...valide, confirme });
      expect("erreur" in r ? null : r.confirme, String(confirme)).toBe(false);
    }
  });

  it("refuses a model that is not part of the launch", () => {
    erreur({ ...valide, modele: "z/absent" });
  });

  it("refuses more than MAX_MODELES_PAR_LANCEMENT models: a comparison is 1 to 3 models", () => {
    expect(MAX_MODELES_PAR_LANCEMENT).toBe(3);
    const quatre = ["m/1", "m/2", "m/3", "m/4"];
    erreur({ ...valide, modele: "m/1", modeles: quatre });
    expect("erreur" in lireCorpsGeneration({ ...valide, modele: "m/1", modeles: quatre.slice(0, 3) })).toBe(false);
  });

  it("refuses duplicates and an empty list", () => {
    erreur({ ...valide, modeles: ["a/x", "a/x"] });
    erreur({ ...valide, modeles: [] });
    erreur({ ...valide, modeles: ["a/x", 3] });
  });

  it("refuses a lancementId that is not a uuid", () => {
    erreur({ ...valide, lancementId: "lancement-1" });
    erreur({ ...valide, lancementId: undefined });
    erreur({ ...valide, lancementId: `${UUID}x` });
  });

  it("refuses missing fields and non-object bodies", () => {
    erreur({ ...valide, cle: "  " });
    erreur({ ...valide, angleId: 42 });
    erreur(null);
    erreur("cle=x");
    erreur([valide]);
  });

  it("requires a single-model launch for a correction", () => {
    erreur({ ...valide, essaiParentId: "essai-1", detailsCorrection: ["Gold zip"] });
    const r = lireCorpsGeneration({ ...valide, modeles: ["a/x"], essaiParentId: "essai-1", detailsCorrection: ["Gold zip", "  "] });
    expect(r).toEqual({ ...valide, skuCible: null, nbCases: 1, modeles: ["a/x"], essaiParentId: "essai-1", detailsCorrection: ["Gold zip", "  "] });
  });

  it("refuses malformed correction fields, ignores details without a parent", () => {
    erreur({ ...valide, modeles: ["a/x"], essaiParentId: 12 });
    erreur({ ...valide, modeles: ["a/x"], essaiParentId: "essai-1", detailsCorrection: "Gold zip" });
    erreur({ ...valide, modeles: ["a/x"], essaiParentId: "essai-1", detailsCorrection: [3] });
    const r = lireCorpsGeneration({ ...valide, essaiParentId: null, detailsCorrection: ["Gold zip"] });
    expect("erreur" in r ? null : r.detailsCorrection).toEqual([]);
  });
});

// ── controlerLancement ──────────────────────────────────────────────────────

describe("controlerLancement", () => {
  const m = (id: string) => CATALOGUE[id];

  it("does not ask for confirmation at exactly the budget", () => {
    const r = controlerLancement({ budget: PETIT_BUDGET, modeles: [m("d/cinq"), m("e/cinq")], nbReferences: 2, confirme: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.devis.totalConnuUsd).toBe(0.1);
  });

  it("asks for confirmation above the budget, with the devis in dollars AND euros", () => {
    const r = controlerLancement({ budget: PETIT_BUDGET, modeles: [m("c/six"), m("d/cinq")], nbReferences: 2, confirme: false });
    expect(r).toMatchObject({
      ok: false,
      status: 409,
      code: "confirmation_requise",
      devis: { totalConnuUsd: 0.11, totalConnuEur: 0.11, budgetEur: 0.1, montantConfirmationEur: 0.11, inconnus: 0, raisonConfirmation: "budget" },
    });
    expect(!r.ok && r.message).toBe("Ce lancement est estimé à 0,11 € (budget par sac : 0,10 €) : confirmation requise.");
  });

  it("no longer asks anything at 0,11 $ with the default account budget of 1 €", () => {
    const r = controlerLancement({ budget: BUDGET_PAR_DEFAUT, modeles: [m("c/six"), m("d/cinq")], nbReferences: 2, confirme: false });
    expect(r.ok).toBe(true);
  });

  it("asks above the default budget, converted at the account rate, and names the amount in euros", () => {
    // 15 cases × 0,06 $ = 0,90 $ = 0,774 € : dans le budget. 15 × 0,05 × 2 modèles = 1,50 $ = 1,29 € : confirmer.
    const dans = controlerLancement({ budget: BUDGET_PAR_DEFAUT, modeles: [m("c/six")], nbReferences: 1, confirme: false, nbCases: 15 });
    expect(dans.ok).toBe(true);
    const hors = controlerLancement({ budget: BUDGET_PAR_DEFAUT, modeles: [m("d/cinq"), m("e/cinq")], nbReferences: 1, confirme: false, nbCases: 15 });
    expect(hors).toMatchObject({ ok: false, status: 409, code: "confirmation_requise", devis: { totalConnuEur: 1.29, montantConfirmationEur: 1.29 } });
    expect(!hors.ok && hors.message).toBe("Ce lancement est estimé à 1,29 € (budget par sac : 1,00 €) : confirmation requise.");
  });

  it("says the amount is a minimum when a price is unknown, in euros", () => {
    const r = controlerLancement({ budget: PETIT_BUDGET, modeles: [m("a/jeton"), m("d/cinq")], nbReferences: 1, confirme: false });
    expect(!r.ok && r.message).toBe("Ce lancement est estimé à 0,05 €, plus 1 tarif inconnu (budget par sac : 0,10 €) : confirmation requise.");
    const seul = controlerLancement({ budget: PETIT_BUDGET, modeles: [m("a/jeton"), m("b/jeton")], nbReferences: 1, confirme: false });
    expect(!seul.ok && seul.message).toBe("Ce lancement compte 2 tarifs inconnus (budget par sac : 0,10 €) : confirmation requise.");
  });

  it("counts the inputs actually sent: truncated references and the failed image", () => {
    // f : 0,05 + 0,01 par image d'entrée, deux au plus. 5 photos ⇒ 2 envoyées ⇒ 0,07.
    const r = controlerLancement({ budget: PETIT_BUDGET, modeles: [m("f/deux-refs")], nbReferences: 5, confirme: false });
    expect(r.ok && r.devis.lignes[0].usd).toBe(0.07);
    // Correction : 1 photo + l'image ratée = 2 entrées ⇒ 0,07 aussi.
    const c = controlerLancement({ budget: PETIT_BUDGET, modeles: [m("f/deux-refs")], nbReferences: 1, confirme: false, avecImageRatee: true });
    expect(c.ok && c.devis.lignes[0].usd).toBe(0.07);
  });

  it("refuses an unknown model before anything else", () => {
    expect(controlerLancement({ budget: PETIT_BUDGET, modeles: [m("d/cinq"), null], nbReferences: 0, confirme: true })).toMatchObject({
      ok: false,
      status: 400,
      code: "modele_inconnu",
    });
  });

  it("refuses a launch without a real photo, or below a model minimum", () => {
    expect(controlerLancement({ budget: PETIT_BUDGET, modeles: [m("d/cinq")], nbReferences: 0, confirme: true })).toMatchObject({ status: 400, code: "sans_reference" });
    expect(controlerLancement({ budget: PETIT_BUDGET, modeles: [m("j/trois-min")], nbReferences: 2, confirme: true })).toMatchObject({ status: 400, code: "sans_reference" });
    expect(controlerLancement({ budget: PETIT_BUDGET, modeles: [m("i/une-ref")], nbReferences: 2, confirme: true, avecImageRatee: true })).toMatchObject({
      status: 400,
      code: "sans_reference",
    });
  });

  it("lets a confirmed launch through, unknown prices included", () => {
    const r = controlerLancement({ budget: PETIT_BUDGET, modeles: [m("a/jeton"), m("d/cinq")], nbReferences: 2, confirme: true });
    expect(r).toMatchObject({ ok: true, devis: { inconnus: 1, totalConnuUsd: 0.05, confirmationRequise: true } });
  });
});

// ── promptDeCorrection ──────────────────────────────────────────────────────

describe("promptDeCorrection", () => {
  it("is null when there is nothing to fix", () => {
    expect(promptDeCorrection("Base prompt", [])).toBeNull();
    expect(promptDeCorrection("Base prompt", ["  ", "- "])).toBeNull();
  });

  it("says the first image is the previous attempt, lists the details, keeps the brief", () => {
    const p = promptDeCorrection("Angle: back view", ["Gold zip pullers", "Pink logo patch"]);
    expect(p).not.toBeNull();
    const texte = p ?? "";
    expect(texte.startsWith("The first attached image is the previous attempt")).toBe(true);
    expect(texte).toContain("- Gold zip pullers\n- Pink logo patch");
    expect(texte).toContain("Angle: back view");
    expect(texte.indexOf("Gold zip pullers")).toBeLessThan(texte.indexOf("Angle: back view"));
  });
});

// ── executerGeneration ──────────────────────────────────────────────────────

describe("executerGeneration — threshold, checked on the server", () => {
  it("refuses two token-priced models without confirmation, and pays nothing", async () => {
    const { deps, appels } = fausses();
    const r = await executerGeneration(deps, USER, corps({ modele: "a/jeton", modeles: ["a/jeton", "b/jeton"] }));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "confirmation_requise", devis: { inconnus: 2, confirmationRequise: true } });
    expect(typeof r.body.error).toBe("string");
    expect(rien(appels)).toEqual({ cle: 0, generer: 0, deposer: 0, creerEssai: 0 });
    // Le devis porte sur TOUTE la liste, pas seulement le modèle de la requête.
    expect(appels.catalogue.sort()).toEqual(["a/jeton", "b/jeton"]);
  });

  it("generates the requested model only, once confirmed", async () => {
    const { deps, appels } = fausses();
    const r = await executerGeneration(deps, USER, corps({ modele: "b/jeton", modeles: ["a/jeton", "b/jeton"], confirme: true }));
    expect(r.status).toBe(200);
    expect(appels.generer).toHaveLength(1);
    expect(appels.generer[0].d.modele).toBe("b/jeton");
    expect(appels.generer[0].apiKey).toBe("sk-or-v1-du-compte");
    expect(appels.creerEssai[0].coutEstimeUsd).toBeNull(); // tarif au jeton : jamais un prix inventé
  });

  it("refuses 0.06 + 0.05 without confirmation", async () => {
    const { deps, appels } = fausses();
    const r = await executerGeneration(deps, USER, corps({ modele: "c/six", modeles: ["c/six", "d/cinq"] }));
    expect(r.status).toBe(409);
    expect(appels.generer).toHaveLength(0);
  });

  it("lets 0.05 + 0.05 through without confirmation", async () => {
    const { deps, appels } = fausses();
    const r = await executerGeneration(deps, USER, corps({ modele: "e/cinq", modeles: ["d/cinq", "e/cinq"] }));
    expect(r.status).toBe(200);
    expect(appels.generer).toHaveLength(1);
  });

  it("refuses a launch that names a model missing from the catalogue", async () => {
    const { deps, appels } = fausses();
    const r = await executerGeneration(deps, USER, corps({ modele: "d/cinq", modeles: ["d/cinq", "z/retire"], confirme: true }));
    expect(r.status).toBe(400);
    expect(r.body.code).toBe("modele_inconnu");
    expect(String(r.body.error)).toContain("z/retire");
    expect(rien(appels)).toEqual({ cle: 0, generer: 0, deposer: 0, creerEssai: 0 });
  });

  it("answers 404 when the coloris, the angle or the parent is not the user's", async () => {
    const { deps, appels } = fausses({ ctx: null });
    const r = await executerGeneration(deps, USER, corps());
    expect(r.status).toBe(404);
    expect(appels.catalogue).toHaveLength(0);
    expect(rien(appels)).toEqual({ cle: 0, generer: 0, deposer: 0, creerEssai: 0 });
  });

  it("refuses a launch without any real photo", async () => {
    const { deps, appels } = fausses({ ctx: contexte({ references: [] }) });
    const r = await executerGeneration(deps, USER, corps({ confirme: true }));
    expect(r).toMatchObject({ status: 400, body: { code: "sans_reference" } });
    expect(appels.generer).toHaveLength(0);
  });
});

describe("executerGeneration — success", () => {
  it("stores the essay with its estimate and its real cost, and returns no image", async () => {
    const { deps, appels } = fausses();
    const r = await executerGeneration(deps, USER, corps());
    expect(r).toEqual({
      status: 200,
      body: {
        essai: { id: "essai-neuf", numero: 2, modele: "d/cinq", coutEstimeUsd: 0.05, coutReelUsd: 0.0421, dureeMs: 250 },
        referencesEnvoyees: 2,
        referencesTronquees: 0,
      },
    });
    const texte = JSON.stringify(r.body);
    expect(texte).not.toContain(OCTETS.toString("base64"));
    expect(texte).not.toContain("data:");
    expect(texte).not.toContain("blob.example");

    expect(appels.deposer).toEqual([{ userId: USER, img: { octets: OCTETS, mime: "image/png", coutUsd: 0.0421 } }]);
    expect(appels.creerEssai).toEqual([
      {
        colorisId: "col-1",
        angleId: "ang-1",
        referenceId: "ref-1",
        skuCible: "SDN15",
        modele: "d/cinq",
        source: "api",
        promptUtilise: promptVariante(contexte().promptMaitre, contexte().angleTexte),
        urlImage: "https://blob.example/generees/user-1/essai.png",
        coutEstimeUsd: 0.05,
        coutReelUsd: 0.0421,
        lancementId: UUID,
        essaiParentId: null,
        dureeMs: 250,
      },
    ]);
    expect(appels.rejeterParent).toHaveLength(0);
    expect(appels.creerEchec).toHaveLength(0);
  });

  it("keeps a missing real cost null, never zero", async () => {
    const { deps, appels } = fausses({ image: { octets: OCTETS, mime: "image/jpeg", coutUsd: null } });
    const r = await executerGeneration(deps, USER, corps());
    expect(appels.creerEssai[0].coutReelUsd).toBeNull();
    expect((r.body.essai as { coutReelUsd: unknown }).coutReelUsd).toBeNull();
  });

  it("asks for 3:4 only when the model lists it", async () => {
    const ratioPour = async (id: string) => {
      const { deps, appels } = fausses();
      await executerGeneration(deps, USER, corps({ modele: id, modeles: [id] }));
      return appels.generer[0].d.ratio;
    };
    expect(await ratioPour("d/cinq")).toBe("3:4");
    expect(await ratioPour("g/sans-ratio")).toBeNull();
    expect(await ratioPour("h/carre")).toBeNull();
  });

  it("truncates the references to the model maximum and says so", async () => {
    const refs = [REF(1), REF(2), REF(3), REF(4), REF(5)];
    const { deps, appels } = fausses({ ctx: contexte({ references: refs }) });
    const r = await executerGeneration(deps, USER, corps({ modele: "f/deux-refs", modeles: ["f/deux-refs"] }));
    expect(appels.generer[0].d.references).toEqual([REF(1), REF(2)]);
    expect(r.body).toMatchObject({ referencesEnvoyees: 2, referencesTronquees: 3 });
    // L'estimation porte sur les 2 entrées envoyées, pas sur les 5 photos.
    expect(appels.creerEssai[0].coutEstimeUsd).toBe(0.07);
  });
});

describe("executerGeneration — failures", () => {
  it("records a safety block as a failure, not as an essay", async () => {
    const { deps, appels } = fausses({
      generer: async () => {
        throw new StudioGenerationError("securite", "Le fournisseur a bloqué la génération (sécurité).");
      },
    });
    const r = await executerGeneration(deps, USER, corps());
    expect(r).toEqual({ status: 400, body: { error: "Le fournisseur a bloqué la génération (sécurité).", code: "securite" } });
    expect(appels.creerEssai).toHaveLength(0);
    expect(appels.deposer).toHaveLength(0);
    expect(appels.creerEchec).toEqual([
      {
        userId: USER,
        colorisId: "col-1",
        angleId: "ang-1",
        referenceId: "ref-1",
        modele: "d/cinq",
        code: "securite",
        message: "Le fournisseur a bloqué la génération (sécurité).",
        lancementId: UUID,
        coutReelUsd: null,
        dureeMs: 250,
      },
    ]);
  });

  it("answers 502 for an uncertain failure and keeps the billed cost", async () => {
    const { deps, appels } = fausses({
      generer: async () => {
        throw new StudioGenerationError("incertain", "Délai dépassé : peut-être facturée.", 0.02);
      },
    });
    const r = await executerGeneration(deps, USER, corps());
    expect(r.status).toBe(502);
    expect(r.body.code).toBe("incertain");
    expect(appels.creerEchec[0]).toMatchObject({ code: "incertain", coutReelUsd: 0.02 });
  });

  it("maps the account errors to 400", async () => {
    for (const code of ["bad_key", "no_credits", "parametres"] as const) {
      const { deps } = fausses({
        generer: async () => {
          throw new StudioGenerationError(code, code);
        },
      });
      expect((await executerGeneration(deps, USER, corps())).status, code).toBe(400);
    }
    for (const code of ["no_image", "unreachable", "unknown_model", "provider", "invalid_response"] as const) {
      const { deps } = fausses({
        generer: async () => {
          throw new StudioGenerationError(code, code);
        },
      });
      expect((await executerGeneration(deps, USER, corps())).status, code).toBe(502);
    }
  });

  it("answers missing_key without generating nor recording a failure", async () => {
    const { deps, appels } = fausses({
      cle: async () => {
        throw new StudioGenerationError("missing_key", "Clé OpenRouter manquante. Ajoute ta clé dans Mon compte.");
      },
    });
    const r = await executerGeneration(deps, USER, corps());
    expect(r).toEqual({ status: 400, body: { error: "Clé OpenRouter manquante. Ajoute ta clé dans Mon compte.", code: "missing_key" } });
    expect(appels.generer).toHaveLength(0);
    expect(appels.creerEchec).toHaveLength(0);
  });

  it("lets unreadable settings bubble up (a 500, not a failure row)", async () => {
    const { deps, appels } = fausses({
      cle: async () => {
        throw new Error("ENCRYPTION_KEY absente");
      },
    });
    await expect(executerGeneration(deps, USER, corps())).rejects.toThrow("ENCRYPTION_KEY absente");
    expect(appels.generer).toHaveLength(0);
    expect(appels.creerEchec).toHaveLength(0);
  });

  it("records a paid image that could not be stored, with its cost", async () => {
    const { deps, appels } = fausses({
      deposer: async () => {
        throw new Error("BlobServiceNotAvailable");
      },
    });
    const r = await executerGeneration(deps, USER, corps());
    expect(r.status).toBe(502);
    expect(r.body.code).toBe("stockage");
    expect(appels.creerEssai).toHaveLength(0);
    expect(appels.creerEchec[0]).toMatchObject({ code: "stockage", modele: "d/cinq", coutReelUsd: 0.0421 });
  });

  it("still answers with the generation error when the failure row cannot be written", async () => {
    const { deps } = fausses({
      generer: async () => {
        throw new StudioGenerationError("no_image", "Le modèle n'a rendu aucune image.");
      },
      creerEchec: async () => {
        throw new Error("db down");
      },
    });
    const r = await executerGeneration(deps, USER, corps());
    expect(r).toEqual({ status: 502, body: { error: "Le modèle n'a rendu aucune image.", code: "no_image" } });
  });
});

describe("executerGeneration — correction by regeneration", () => {
  const parent = { id: "essai-rate", modele: "d/cinq", image: IMAGE_RATEE };
  const correction = (over: Partial<CorpsGeneration> = {}) =>
    corps({ essaiParentId: "essai-rate", detailsCorrection: ["Gold zip pullers"], ...over });

  it("sends the failed image first, rejects the parent and links the new essay to it", async () => {
    const { deps, appels } = fausses({ ctx: contexte({ parent }) });
    const r = await executerGeneration(deps, USER, correction());
    expect(r.status).toBe(200);
    expect(appels.generer[0].d.references).toEqual([IMAGE_RATEE, REF(1), REF(2)]);
    expect(appels.generer[0].d.prompt.startsWith("The first attached image is the previous attempt")).toBe(true);
    expect(appels.generer[0].d.prompt).toContain("- Gold zip pullers");
    expect(appels.rejeterParent).toEqual(["essai-rate"]);
    expect(appels.creerEssai[0]).toMatchObject({ essaiParentId: "essai-rate", promptUtilise: appels.generer[0].d.prompt });
    // L'image ratée n'est pas une vraie photo : elle n'entre pas dans le décompte des références.
    expect(r.body).toMatchObject({ referencesEnvoyees: 2, referencesTronquees: 0 });
  });

  it("keeps a slot for the failed image when truncating", async () => {
    const refs = [REF(1), REF(2), REF(3), REF(4), REF(5)];
    const { deps, appels } = fausses({ ctx: contexte({ parent, references: refs }) });
    const r = await executerGeneration(deps, USER, correction());
    expect(appels.generer[0].d.references).toEqual([IMAGE_RATEE, REF(1), REF(2), REF(3)]);
    expect(r.body).toMatchObject({ referencesEnvoyees: 3, referencesTronquees: 2 });
  });

  it("refuses another model than the parent's", async () => {
    const { deps, appels } = fausses({ ctx: contexte({ parent }) });
    const r = await executerGeneration(deps, USER, correction({ modele: "e/cinq", modeles: ["e/cinq"] }));
    expect(r.status).toBe(400);
    expect(appels.rejeterParent).toHaveLength(0);
    expect(rien(appels)).toEqual({ cle: 0, generer: 0, deposer: 0, creerEssai: 0 });
  });

  it("refuses a correction without any detail to fix", async () => {
    const { deps, appels } = fausses({ ctx: contexte({ parent }) });
    const r = await executerGeneration(deps, USER, correction({ detailsCorrection: [" "] }));
    expect(r.status).toBe(400);
    expect(appels.rejeterParent).toHaveLength(0);
    expect(appels.generer).toHaveLength(0);
  });

  it("refuses a correction whose failed image was purged", async () => {
    const { deps, appels } = fausses({ ctx: contexte({ parent: { ...parent, image: null } }) });
    const r = await executerGeneration(deps, USER, correction());
    expect(r.status).toBe(409);
    expect(appels.generer).toHaveLength(0);
    expect(appels.rejeterParent).toHaveLength(0);
  });

  it("applies the threshold too, and leaves the parent alone when refused", async () => {
    const { deps, appels } = fausses({ ctx: contexte({ parent: { ...parent, modele: "a/jeton" } }) });
    const r = await executerGeneration(deps, USER, correction({ modele: "a/jeton", modeles: ["a/jeton"] }));
    expect(r.status).toBe(409);
    expect(appels.rejeterParent).toHaveLength(0);
    expect(appels.generer).toHaveLength(0);
  });

  it("refuses a correction on a model that takes a single image", async () => {
    const { deps, appels } = fausses({ ctx: contexte({ parent: { ...parent, modele: "i/une-ref" } }) });
    const r = await executerGeneration(deps, USER, correction({ modele: "i/une-ref", modeles: ["i/une-ref"] }));
    expect(r).toMatchObject({ status: 400, body: { code: "sans_reference" } });
    expect(appels.generer).toHaveLength(0);
  });
});

// ── Variantes d'angle (20/10) : une case = une photo × un prompt d'angle ────

describe("variantes d'angle", () => {
  it("exige la photo de la ligne, lit le sac cible en majuscules et le nombre de cases", () => {
    const base = { cle: "c", angleId: "a", referenceId: "r", modele: "a/x", modeles: ["a/x"], lancementId: UUID };
    expect(lireCorpsGeneration({ ...base, referenceId: undefined })).toEqual({ erreur: "Coloris, photo, angle et modèle requis." });
    expect(lireCorpsGeneration({ ...base, skuCible: "sdn15", nbCases: 14 })).toMatchObject({ skuCible: "SDN15", nbCases: 14 });
    for (const nbCases of [0, 61, 1.5, "3"]) expect(lireCorpsGeneration({ ...base, nbCases })).toHaveProperty("erreur");
    expect(lireCorpsGeneration({ ...base, nbCases: 2, essaiParentId: "e" })).toEqual({ erreur: "Une correction porte sur une seule case." });
  });

  it("chiffre le devis sur toutes les cases du lancement : 3 × 0,05 $ exige la confirmation", async () => {
    const { deps, appels } = fausses();
    const r = await executerGeneration(deps, USER, corps({ nbCases: 3 }));
    expect(r).toMatchObject({ status: 409, body: { code: "confirmation_requise" } });
    expect(appels.generer).toHaveLength(0);
    const ok = await executerGeneration(deps, USER, corps({ nbCases: 2 }));
    expect(ok.status).toBe(200);
    expect(appels.creerEssai[0].coutEstimeUsd).toBe(0.05);
  });

  it("refuse une case déjà prise sans rien payer", async () => {
    const { deps, appels } = fausses({ ctx: contexte({ caseLibre: false }) });
    const r = await executerGeneration(deps, USER, corps({ confirme: true }));
    expect(r).toMatchObject({ status: 409, body: { code: "case_prise" } });
    expect(rien(appels)).toEqual({ cle: 0, generer: 0, deposer: 0, creerEssai: 0 });
  });

  it("laisse corriger une case prise : la correction vise l'essai raté de cette case", async () => {
    const parent = { id: "essai-rate", modele: "d/cinq", image: IMAGE_RATEE };
    const { deps, appels } = fausses({ ctx: contexte({ caseLibre: false, parent }) });
    const r = await executerGeneration(deps, USER, corps({ essaiParentId: "essai-rate", detailsCorrection: ["Gold zip"] }));
    expect(r.status).toBe(200);
    expect(appels.creerEssai[0]).toMatchObject({ referenceId: "ref-1", skuCible: "SDN15", essaiParentId: "essai-rate" });
    expect(appels.creerEssai[0].promptUtilise).toContain(contexte().promptMaitre);
  });
});

// ── Budget par sac (refonte du 20/10) ───────────────────────────────────────

describe("budget par sac — vérifié côté serveur", () => {
  it("reads the budget of THE ACCOUNT, never from the body, and checks it before paying", async () => {
    const { deps, appels } = fausses({ budget: BUDGET_PAR_DEFAUT });
    // 15 cases × 2 modèles × 0,05 $ = 1,50 $ = 1,29 € > 1 €
    const r = await executerGeneration(deps, USER, corps({ nbCases: 15, modele: "d/cinq", modeles: ["d/cinq", "e/cinq"] }));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "confirmation_requise", devis: { budgetEur: 1, totalConnuEur: 1.29, montantConfirmationEur: 1.29, depasseBudget: true } });
    expect(String(r.body.error)).toContain("1,29 €");
    expect(appels.budget).toEqual([USER]);
    expect(rien(appels)).toEqual({ cle: 0, generer: 0, deposer: 0, creerEssai: 0 });
  });

  it("lets the same launch through once the account raises its budget", async () => {
    const { deps, appels } = fausses({ budget: { budgetParSacEur: 2, tauxEurParUsd: 0.86 } });
    const r = await executerGeneration(deps, USER, corps({ nbCases: 15, modele: "d/cinq", modeles: ["d/cinq", "e/cinq"] }));
    expect(r.status).toBe(200);
    expect(appels.generer).toHaveLength(1);
  });

  it("follows the account rate: the same dollars cost less euros at a lower rate", async () => {
    // 1,50 $ à 0,6 € le dollar = 0,90 € : dans un budget de 1 €
    const { deps } = fausses({ budget: { budgetParSacEur: 1, tauxEurParUsd: 0.6 } });
    const r = await executerGeneration(deps, USER, corps({ nbCases: 15, modele: "d/cinq", modeles: ["d/cinq", "e/cinq"] }));
    expect(r.status).toBe(200);
  });

  it("does not let a small launch confirm itself away: it is within the 1 € budget, so no confirmation at all", async () => {
    const { deps, appels } = fausses({ budget: BUDGET_PAR_DEFAUT });
    const r = await executerGeneration(deps, USER, corps({ modele: "c/six", modeles: ["c/six", "d/cinq"] }));
    expect(r.status).toBe(200); // 0,11 $ : l'ancien seuil de 0,10 $ aurait refusé
    expect(appels.generer).toHaveLength(1);
  });

  it("always asks when a price is unknown, whatever the budget, and says the amount is a minimum", async () => {
    const { deps, appels } = fausses({ budget: { budgetParSacEur: 1000, tauxEurParUsd: 0.86 } });
    const r = await executerGeneration(deps, USER, corps({ modele: "a/jeton", modeles: ["a/jeton", "d/cinq"] }));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: "confirmation_requise", devis: { inconnus: 1, depasseBudget: false, raisonConfirmation: "prix_inconnu", montantMinimum: true } });
    expect(appels.generer).toHaveLength(0);
  });

  it("refuses without confirmation when the budget row is unusable (asks again instead of skipping)", async () => {
    const { deps } = fausses({ budget: { budgetParSacEur: Number.NaN, tauxEurParUsd: 0.86 } });
    const r = await executerGeneration(deps, USER, corps({ modele: "d/cinq", modeles: ["d/cinq"] }));
    expect(r.status).toBe(409);
  });
});

describe("comparaison : un lancement, plusieurs modèles, un seul lancementId", () => {
  it("shares the lancementId between the models of one launch, each essay with its own model and estimate", async () => {
    const lancement = { lancementId: UUID, modeles: ["c/six", "d/cinq", "e/cinq"], confirme: true };
    const lignes: NouvelEssai[] = [];
    for (const modele of lancement.modeles) {
      const { deps, appels } = fausses({ budget: BUDGET_PAR_DEFAUT });
      const r = await executerGeneration(deps, USER, corps({ ...lancement, modele }));
      expect(r.status, modele).toBe(200);
      lignes.push(...appels.creerEssai);
    }
    expect(lignes.map((l) => l.lancementId)).toEqual([UUID, UUID, UUID]);
    expect(lignes.map((l) => l.modele)).toEqual(["c/six", "d/cinq", "e/cinq"]);
    // chaque modèle garde SON estimation par image, pas celle du premier de la liste
    expect(lignes.map((l) => l.coutEstimeUsd)).toEqual([0.06, 0.05, 0.05]);
    expect(new Set(lignes.map((l) => `${l.referenceId}:${l.angleId}`)).size).toBe(1); // la même case
  });

  it("records the failures of a launch under the same lancementId", async () => {
    const { deps, appels } = fausses({
      generer: async () => {
        throw new StudioGenerationError("no_image", "Aucune image.");
      },
    });
    await executerGeneration(deps, USER, corps({ modele: "e/cinq", modeles: ["d/cinq", "e/cinq"] }));
    expect(appels.creerEchec[0]).toMatchObject({ lancementId: UUID, modele: "e/cinq" });
  });

  it("estimates the requested model with its own price in a mixed launch", async () => {
    const { deps, appels } = fausses({ budget: { budgetParSacEur: 100, tauxEurParUsd: 1 } });
    await executerGeneration(deps, USER, corps({ modele: "f/deux-refs", modeles: ["d/cinq", "f/deux-refs"], confirme: true }));
    expect(appels.creerEssai[0].coutEstimeUsd).toBe(0.07); // 0,05 + 2 photos × 0,01, pas les 0,05 de d/cinq
  });
});

describe("durée de génération", () => {
  it("measures the generation call only, in milliseconds, on the essay", async () => {
    const { deps, appels } = fausses({ horloge: [1_000, 1_850] });
    const r = await executerGeneration(deps, USER, corps());
    expect(appels.creerEssai[0].dureeMs).toBe(850);
    expect((r.body.essai as { dureeMs: unknown }).dureeMs).toBe(850);
  });

  it("measures it on a failed generation too", async () => {
    const { deps, appels } = fausses({
      horloge: [5_000, 5_120],
      generer: async () => {
        throw new StudioGenerationError("securite", "Bloqué.");
      },
    });
    await executerGeneration(deps, USER, corps());
    expect(appels.creerEchec[0].dureeMs).toBe(120);
  });

  it("measures the generation, not the storage, when a paid image cannot be stored", async () => {
    const { deps, appels } = fausses({
      horloge: [2_000, 2_300],
      deposer: async () => {
        throw new Error("BlobServiceNotAvailable");
      },
    });
    await executerGeneration(deps, USER, corps());
    expect(appels.creerEchec[0]).toMatchObject({ code: "stockage", dureeMs: 300 });
  });

  it("keeps the duration null rather than inventing one when the clock is unreadable or goes backwards", async () => {
    for (const horloge of [[2_000, 1_000], [Number.NaN, 5], [1_000]]) {
      const { deps, appels } = fausses({ horloge: [...horloge] });
      const r = await executerGeneration(deps, USER, corps());
      expect(r.status).toBe(200);
      expect(appels.creerEssai[0].dureeMs, JSON.stringify(horloge)).toBeNull();
    }
  });

  it("starts no clock for a refused launch", async () => {
    const horloge = [1_000, 2_000];
    const { deps } = fausses({ horloge, budget: BUDGET_PAR_DEFAUT });
    await executerGeneration(deps, USER, corps({ nbCases: 15, modele: "d/cinq", modeles: ["d/cinq", "e/cinq"] }));
    expect(horloge).toEqual([1_000, 2_000]);
  });
});
