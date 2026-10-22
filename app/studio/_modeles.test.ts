import { describe, expect, it } from "vitest";

import type { AgregatModele } from "@/lib/studioAgregats";
import { MAX_MODELES_PAR_LANCEMENT } from "@/lib/studioLancement";
import { devisDuLancement, type BudgetCompte, type ModeleImage, type Tarif } from "@/lib/studioModeles";

import {
  FILTRES_VIDES,
  MAX_MODELES_LANCEMENT,
  basculerSelection,
  construireLignes,
  coutMoyenReel,
  depassement,
  depuis,
  filtrerLignes,
  libelleConfirmer,
  libelleReussite,
  montantCourt,
  partDuBudget,
  phraseConfirmation,
  sectionsLignes,
  selectionInitiale,
  trierLignes,
} from "./_modeles";

const modele = (id: string, nom: string, tarif: Tarif, extra: Partial<ModeleImage> = {}): ModeleImage => ({
  id,
  nom,
  description: "",
  maxReferences: 4,
  minReferences: 0,
  ratios: ["3:4"],
  tarif,
  ...extra,
});

const QWEN = modele("qwen/qwen-image", "Qwen Image Turbo", { kind: "image", sortieUsd: 0.0184, entreeParImageUsd: 0 });
const SEED = modele("bytedance/seedream", "Seedream 5.0 Flash", { kind: "image", sortieUsd: 0.03, entreeParImageUsd: 0 });
const PRO = modele("google/gemini-3-pro-image", "Nano Banana Pro", { kind: "image", sortieUsd: 0.134, entreeParImageUsd: 0 });
const JETON = modele("google/jeton", "Au jeton", { kind: "jeton" });
const INCONNU = modele("e2e/inconnu", "Prix inconnu", { kind: "inconnu" });
const KREA = modele("krea/k3-edit", "Krea K3 Edit", { kind: "image", sortieUsd: 0.02, entreeParImageUsd: 0 }, { minReferences: 2 });

const BUDGET: BudgetCompte = { budgetParSacEur: 1, tauxEurParUsd: 0.86 };

const agregat = (modele: string, p: Partial<AgregatModele> = {}): AgregatModele => ({
  modele,
  images: 4,
  premiersCoupsDecides: 4,
  premiersCoupsValides: 3,
  tauxPremierCoup: 0.75,
  coutMoyenReelUsd: 0.02,
  coutsConnus: 4,
  coutIncomplet: false,
  dureeMoyenneMs: 12_000,
  echecs: 0,
  derniereUtilisation: "2026-10-20T10:00:00.000Z",
  ...p,
});

describe("construireLignes", () => {
  const lignes = construireLignes([QWEN, PRO, INCONNU, KREA], [agregat(QWEN.id)], [PRO.id], BUDGET);

  it("prices a full bag (15 cells) in euros at the account rate and compares it to the budget", () => {
    const qwen = lignes[0];
    expect(qwen.sac.nbPrises).toBe(15);
    expect(qwen.sac.usd).toBeCloseTo(0.276, 6);
    expect(qwen.sac.eur).toBeCloseTo(0.23736, 6);
    expect(qwen.sac.statutBudget).toBe("dans");
  });

  it("shows the expensive model honestly: about 1,73 € the bag, out of budget", () => {
    const pro = lignes[1];
    expect(pro.sac.eur).toBeCloseTo(1.7286, 4);
    expect(pro.sac.statutBudget).toBe("hors");
    expect(pro.favori).toBe(true);
  });

  it("never invents a price: an unknown tariff has no bag cost and no budget verdict", () => {
    const inconnu = lignes[2];
    expect(inconnu.sac.eur).toBeNull();
    expect(inconnu.sac.usd).toBeNull();
    expect(inconnu.sac.statutBudget).toBe("inconnu");
  });

  it("joins the real results; a model never used has none", () => {
    expect(lignes[0].agregat?.tauxPremierCoup).toBe(0.75);
    expect(lignes[1].agregat).toBeNull();
  });

  it("marks a model the Studio cannot feed (two references required)", () => {
    expect(lignes[3].inutilisable).toMatch(/Exige 2 images/);
    expect(lignes[0].inutilisable).toBeNull();
  });
});

describe("filtrerLignes", () => {
  const lignes = construireLignes([QWEN, SEED, PRO, INCONNU], [agregat(SEED.id)], [], BUDGET);

  it("searches name and id, accents and case ignored, every word required", () => {
    expect(filtrerLignes(lignes, { ...FILTRES_VIDES, q: "SEEDREAM" }).map((l) => l.modele.id)).toEqual([SEED.id]);
    expect(filtrerLignes(lignes, { ...FILTRES_VIDES, q: "google pro" }).map((l) => l.modele.id)).toEqual([PRO.id]);
    expect(filtrerLignes(lignes, { ...FILTRES_VIDES, q: "  " })).toHaveLength(4);
    expect(filtrerLignes(lignes, { ...FILTRES_VIDES, q: "inexistant" })).toEqual([]);
  });

  it("« dans le budget » keeps only known bags at or under the budget (never an unknown price)", () => {
    expect(filtrerLignes(lignes, { ...FILTRES_VIDES, dansBudget: true }).map((l) => l.modele.id)).toEqual([QWEN.id, SEED.id]);
  });

  it("« déjà testé » keeps only models with real results", () => {
    expect(filtrerLignes(lignes, { ...FILTRES_VIDES, dejaTeste: true }).map((l) => l.modele.id)).toEqual([SEED.id]);
  });

  it("the budget pile is « dans »: a bag exactly at the budget stays", () => {
    const pile = modele("x/pile", "Pile", { kind: "image", sortieUsd: 1 / 15 / 0.86, entreeParImageUsd: 0 });
    const [l] = construireLignes([pile], [], [], BUDGET);
    // 1/15/0.86 rounded to 1e-4 per image: 0.0775 $ × 15 × 0.86 = 0.99975 €, under 1 €.
    expect(l.sac.statutBudget).toBe("dans");
  });
});

describe("trierLignes", () => {
  const lignes = construireLignes(
    [INCONNU, PRO, SEED, QWEN, JETON],
    [
      agregat(PRO.id, { tauxPremierCoup: 0.9, premiersCoupsDecides: 10, premiersCoupsValides: 9 }),
      agregat(SEED.id, { tauxPremierCoup: 0.9, premiersCoupsDecides: 2, premiersCoupsValides: 2 }),
      agregat(QWEN.id, { tauxPremierCoup: null, premiersCoupsDecides: 0, premiersCoupsValides: 0 }),
    ],
    [],
    BUDGET,
  );

  it("by bag cost: cheapest first, unknown prices LAST (never the cheapest)", () => {
    expect(trierLignes(lignes, "cout").map((l) => l.modele.id)).toEqual([QWEN.id, SEED.id, PRO.id, JETON.id, INCONNU.id]);
  });

  it("by success: best rate first, more evidence first on a tie, undecided and never tried last", () => {
    const ordre = trierLignes(lignes, "reussite").map((l) => l.modele.id);
    expect(ordre.slice(0, 2)).toEqual([PRO.id, SEED.id]);
    // QWEN (pas encore jugé) and the two never tried come after, by cost.
    expect(ordre.slice(2)).toEqual([QWEN.id, JETON.id, INCONNU.id]);
  });

  it("does not mutate its input", () => {
    const avant = lignes.map((l) => l.modele.id);
    trierLignes(lignes, "cout");
    expect(lignes.map((l) => l.modele.id)).toEqual(avant);
  });

  it("pins favourites first, keeping the order", () => {
    const avecFav = construireLignes([QWEN, SEED, PRO], [], [PRO.id], BUDGET);
    const { favoris, autres } = sectionsLignes(trierLignes(avecFav, "cout"));
    expect(favoris.map((l) => l.modele.id)).toEqual([PRO.id]);
    expect(autres.map((l) => l.modele.id)).toEqual([QWEN.id, SEED.id]);
  });
});

describe("selection", () => {
  it("is the same as the server's maximum", () => {
    expect(MAX_MODELES_LANCEMENT).toBe(MAX_MODELES_PAR_LANCEMENT);
  });

  it("adds, removes, and refuses a 4th model without changing anything", () => {
    let s = basculerSelection([], "a").selection;
    s = basculerSelection(s, "b").selection;
    s = basculerSelection(s, "c").selection;
    expect(s).toEqual(["a", "b", "c"]);
    const plein = basculerSelection(s, "d");
    expect(plein).toEqual({ selection: ["a", "b", "c"], refus: "plein" });
    expect(basculerSelection(s, "b")).toEqual({ selection: ["a", "c"], refus: null });
  });

  it("restores a remembered selection cleaned against the catalogue", () => {
    const lignes = construireLignes([QWEN, SEED, PRO, KREA], [], [SEED.id], BUDGET);
    expect(selectionInitiale([PRO.id, "disparu", PRO.id, KREA.id, QWEN.id, SEED.id], lignes)).toEqual([PRO.id, QWEN.id, SEED.id]);
    expect(selectionInitiale("illisible", lignes)).toEqual([SEED.id]);
    expect(selectionInitiale(["disparu"], lignes)).toEqual([SEED.id]);
    expect(selectionInitiale(null, construireLignes([QWEN], [], [], BUDGET))).toEqual([]);
  });
});

describe("words", () => {
  it("success: never 0 % without a decision", () => {
    expect(libelleReussite(null)).toEqual({ texte: "jamais essayé", detail: null, connue: false });
    expect(libelleReussite(agregat("x", { tauxPremierCoup: null, premiersCoupsDecides: 0, premiersCoupsValides: 0 })).texte).toBe("pas encore jugé");
    expect(libelleReussite(agregat("x", { tauxPremierCoup: 0, premiersCoupsDecides: 3, premiersCoupsValides: 0 }))).toEqual({
      texte: "0 %",
      detail: "0/3 au 1er coup",
      connue: true,
    });
    expect(libelleReussite(agregat("x")).texte).toBe("75 %");
  });

  it("real average cost: in euros, partial when some images have no real cost, absent when none is known", () => {
    expect(coutMoyenReel(agregat("x", { coutMoyenReelUsd: 0.02 }), 0.86)).toEqual({ eur: 0.0172, partiel: false, sur: 4, images: 4 });
    expect(coutMoyenReel(agregat("x", { coutIncomplet: true, coutsConnus: 2 }), 0.86)?.partiel).toBe(true);
    expect(coutMoyenReel(agregat("x", { coutMoyenReelUsd: null, coutsConnus: 0 }), 0.86)).toBeNull();
    expect(coutMoyenReel(null, 0.86)).toBeNull();
  });

  it("last use on the Paris calendar", () => {
    const maintenant = new Date("2026-10-22T10:00:00Z");
    expect(depuis(null, maintenant)).toBeNull();
    expect(depuis("pas une date", maintenant)).toBeNull();
    expect(depuis("2026-10-22T06:00:00Z", maintenant)).toBe("aujourd’hui");
    // 22:30 UTC on the 21st is already the 22nd in Paris.
    expect(depuis("2026-10-21T22:30:00Z", maintenant)).toBe("aujourd’hui");
    expect(depuis("2026-10-21T08:00:00Z", maintenant)).toBe("hier");
    expect(depuis("2026-10-19T08:00:00Z", maintenant)).toBe("il y a 3 j");
    expect(depuis("2026-08-01T08:00:00Z", maintenant)).toBe("il y a 2 mois");
    expect(depuis("2025-06-01T08:00:00Z", maintenant)).toBe("il y a 1 an");
  });

  it("budget gauge and overrun", () => {
    expect(partDuBudget(0.5, 1)).toBe(0.5);
    expect(partDuBudget(null, 1)).toBeNull();
    expect(partDuBudget(1, 0)).toBeNull();
    expect(depassement(1, 1)).toBeNull();
    expect(depassement(2.08, 1)).toBe("2,1 × le budget");
  });
});

describe("confirmation", () => {
  it("a known amount: the button carries it, rounded up to the cent", () => {
    const d = devisDuLancement({ modeles: [PRO], nbCases: 11, budget: BUDGET });
    // 11 × 0.134 $ × 0.86 = 1.26764 € → 1,27 €.
    expect(d.raisonConfirmation).toBe("budget");
    expect(libelleConfirmer(d)).toBe("Confirmer 1,27 €");
    expect(phraseConfirmation(d)).toBe("Ce lancement est estimé à 1,27 €, au-delà de ton budget de 1,00 € par sac.");
    expect(montantCourt(d)).toBe("1,27 €");
  });

  it("an unknown price: never « 0,00 € », the known part is a minimum", () => {
    const seul = devisDuLancement({ modeles: [INCONNU], nbCases: 2, budget: BUDGET });
    expect(libelleConfirmer(seul)).toBe("Confirmer sans prix connu");
    expect(phraseConfirmation(seul)).toBe("Le prix de Prix inconnu n’est pas publié : le coût ne se saura qu’après la génération.");
    expect(montantCourt(seul)).toBe("prix inconnu");

    const mixte = devisDuLancement({ modeles: [QWEN, JETON], nbCases: 1, budget: BUDGET });
    expect(mixte.raisonConfirmation).toBe("prix_inconnu");
    expect(libelleConfirmer(mixte)).toBe("Confirmer 0,02 € + prix inconnu");
    expect(montantCourt(mixte)).toBe("0,02 € + prix inconnu");
    expect(phraseConfirmation(mixte)).toMatch(/^Le prix de Au jeton n’est pas publié : le lancement coûtera plus que les 0,02 € connus/);
  });

  it("over budget AND an unknown price", () => {
    const d = devisDuLancement({ modeles: [PRO, INCONNU], nbCases: 10, budget: BUDGET });
    expect(d.raisonConfirmation).toBe("budget_et_prix_inconnu");
    expect(phraseConfirmation(d)).toBe(
      "Ce lancement dépasse déjà ton budget de 1,00 € par sac (1,16 € connus), et le prix de Prix inconnu n’est pas publié.",
    );
  });

  it("a comparison multiplies: 3 models on one cell", () => {
    const d = devisDuLancement({ modeles: [QWEN, SEED, PRO], nbCases: 1, budget: BUDGET });
    expect(d.images).toBe(3);
    expect(d.confirmationRequise).toBe(false);
    // 0,156864 € : the quote shows what the button would commit to, the cent above.
    expect(montantCourt(d)).toBe("0,16 €");
    const petit = devisDuLancement({ modeles: [QWEN], nbCases: 1, budget: BUDGET });
    expect(montantCourt(petit)).toBe("0,02 €");
  });
});
