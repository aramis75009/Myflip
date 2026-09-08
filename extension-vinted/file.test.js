import { describe, expect, it } from "vitest";
import {
  DELAI_REPLI,
  delaiDeLEntree,
  entreesPerimees,
  estPremiereEntree,
  prochaineAction,
  tirerDelaiMs,
} from "./file.js";

const enAttente = (entryId, ts, cibleMs = null, extra = {}) => ({
  entryId,
  etat: "en-attente",
  ts,
  cibleMs,
  tabId: null,
  premier: false,
  delai: { minMinutes: 2, maxMinutes: 5 },
  ...extra,
});

describe("prochaineAction", () => {
  it("ne fait rien sur une file vide", () => {
    expect(prochaineAction([], 1000)).toEqual({ type: "rien" });
  });

  it("demande à planifier avec attente une entrée qui n'a pas encore de cible", () => {
    expect(prochaineAction([enAttente("a", 100)], 1000)).toEqual({
      type: "planifier",
      entryId: "a",
      immediat: false,
    });
  });

  it("demande à planifier SANS attente le premier article d'un lot", () => {
    const file = [enAttente("a", 100, null, { premier: true })];
    expect(prochaineAction(file, 1000)).toEqual({
      type: "planifier",
      entryId: "a",
      immediat: true,
    });
  });

  it("fait attendre une entrée sans champ `premier` — mise en file par une version antérieure", () => {
    // Entrée LITTÉRALE, sans la clé `premier` : c'est la forme qu'ont déjà en
    // base les entrées mises en file avant cette mise à jour de l'extension.
    // « Absent » doit valoir « elle attend », jamais « elle part maintenant ».
    // Écrire `premier !== false` à la place du `=== true` actuel ferait
    // repartir un lot entier d'un coup — et sans ce test, rien ne broncherait.
    const ancienne = {
      entryId: "a",
      etat: "en-attente",
      ts: 100,
      cibleMs: null,
      tabId: null,
    };
    expect(prochaineAction([ancienne], 1000)).toEqual({
      type: "planifier",
      entryId: "a",
      immediat: false,
    });
  });

  it("demande à attendre quand la cible est dans le futur", () => {
    expect(prochaineAction([enAttente("a", 100, 5000)], 1000)).toEqual({
      type: "attendre",
      entryId: "a",
      dansMs: 4000,
    });
  });

  it("demande à ouvrir quand la cible est atteinte", () => {
    expect(prochaineAction([enAttente("a", 100, 1000)], 1000)).toEqual({
      type: "ouvrir",
      entryId: "a",
    });
  });

  it("traite les entrées dans leur ordre d'arrivée", () => {
    const file = [enAttente("b", 200, 0), enAttente("a", 100, 0)];
    expect(prochaineAction(file, 1000)).toEqual({ type: "ouvrir", entryId: "a" });
  });

  it("n'ouvre rien tant qu'une entrée est en cours", () => {
    const file = [
      { entryId: "a", etat: "en-cours", ts: 100, cibleMs: 0, tabId: 7 },
      enAttente("b", 200, 0),
    ];
    expect(prochaineAction(file, 1000)).toEqual({ type: "occupe", entryId: "a" });
  });

  it("suspend toute la chaîne dès qu'une entrée a échoué", () => {
    const file = [
      enAttente("b", 200, 0),
      { entryId: "a", etat: "echouee", ts: 100, cibleMs: 0, tabId: 7 },
    ];
    expect(prochaineAction(file, 1000)).toEqual({ type: "suspendu", entryId: "a" });
  });
});

describe("tirerDelaiMs", () => {
  it("respecte la borne basse", () => {
    expect(tirerDelaiMs(2, 6, () => 0)).toBe(120_000);
  });

  it("respecte la borne haute", () => {
    expect(tirerDelaiMs(2, 6, () => 1)).toBe(360_000);
  });

  it("tombe au milieu pour un tirage au milieu", () => {
    expect(tirerDelaiMs(2, 6, () => 0.5)).toBe(240_000);
  });

  it("accepte min = max", () => {
    expect(tirerDelaiMs(3, 3, () => 0.42)).toBe(180_000);
  });

  it("se protège d'une fourchette inversée", () => {
    expect(tirerDelaiMs(6, 2, () => 0)).toBe(120_000);
    expect(tirerDelaiMs(6, 2, () => 1)).toBe(360_000);
  });
});

describe("entreesPerimees", () => {
  it("rend les entrées plus vieilles que le TTL", () => {
    const file = [enAttente("vieille", 0), enAttente("fraiche", 900)];
    expect(entreesPerimees(file, 1000, 500)).toEqual(["vieille"]);
  });

  it("ne purge jamais une entrée en cours, même vieille", () => {
    const file = [{ entryId: "a", etat: "en-cours", ts: 0, cibleMs: 0, tabId: 7 }];
    expect(entreesPerimees(file, 10_000_000, 500)).toEqual([]);
  });
});

describe("estPremiereEntree", () => {
  // Le drapeau est posé À LA MISE EN FILE, pas à la planification.
  //
  // Le critère « aucune entrée n'a de cibleMs » aurait été rejoué après CHAQUE
  // succès : une entrée réussie est supprimée de la base (background.js,
  // tabs.onUpdated), donc la file y retombe entre deux articles et tout le lot
  // serait parti sans attendre — le garde-fou annulé en silence.
  it("est vraie quand la file est vide", () => {
    expect(estPremiereEntree([])).toBe(true);
  });

  it("est fausse dès qu'une entrée attend déjà", () => {
    expect(estPremiereEntree([enAttente("a", 100)])).toBe(false);
  });

  it("est fausse quand un article est en vol", () => {
    const file = [{ entryId: "a", etat: "en-cours", ts: 100, cibleMs: 0, tabId: 7 }];
    expect(estPremiereEntree(file)).toBe(false);
  });
});

describe("delaiDeLEntree", () => {
  it("rend la fourchette portée par l'entrée", () => {
    const e = enAttente("a", 100, null, { delai: { minMinutes: 4, maxMinutes: 9 } });
    expect(delaiDeLEntree(e)).toEqual({ minMinutes: 4, maxMinutes: 9 });
  });

  it("accepte un délai fixe et un délai nul", () => {
    const fixe = enAttente("a", 100, null, { delai: { minMinutes: 3, maxMinutes: 3 } });
    expect(delaiDeLEntree(fixe)).toEqual({ minMinutes: 3, maxMinutes: 3 });
    const nul = enAttente("b", 100, null, { delai: { minMinutes: 0, maxMinutes: 0 } });
    expect(delaiDeLEntree(nul)).toEqual({ minMinutes: 0, maxMinutes: 0 });
  });

  it("replie sur 2–5 min une entrée sans délai — jamais sur zéro", () => {
    const e = enAttente("a", 100, null, { delai: undefined });
    expect(delaiDeLEntree(e)).toEqual(DELAI_REPLI);
    expect(DELAI_REPLI).toEqual({ minMinutes: 2, maxMinutes: 5 });
  });

  it("replie aussi sur un délai abîmé", () => {
    expect(delaiDeLEntree(enAttente("a", 1, null, { delai: null }))).toEqual(DELAI_REPLI);
    expect(delaiDeLEntree(enAttente("b", 1, null, { delai: {} }))).toEqual(DELAI_REPLI);
    expect(
      delaiDeLEntree(enAttente("c", 1, null, { delai: { minMinutes: "2", maxMinutes: 5 } })),
    ).toEqual(DELAI_REPLI);
    expect(
      delaiDeLEntree(enAttente("d", 1, null, { delai: { minMinutes: -1, maxMinutes: 5 } })),
    ).toEqual(DELAI_REPLI);
  });

  it("laisse passer une fourchette à l'envers : tirerDelaiMs la réordonne déjà", () => {
    const e = enAttente("a", 100, null, { delai: { minMinutes: 9, maxMinutes: 4 } });
    expect(delaiDeLEntree(e)).toEqual({ minMinutes: 9, maxMinutes: 4 });
  });
});
