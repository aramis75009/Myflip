import { describe, expect, it } from "vitest";
import { entreesPerimees, prochaineAction, tirerDelaiMs } from "./file.js";

const enAttente = (entryId, ts, cibleMs = null) => ({
  entryId,
  etat: "en-attente",
  ts,
  cibleMs,
  tabId: null,
});

describe("prochaineAction", () => {
  it("ne fait rien sur une file vide", () => {
    expect(prochaineAction([], 1000)).toEqual({ type: "rien" });
  });

  it("demande à planifier une entrée qui n'a pas encore de cible", () => {
    expect(prochaineAction([enAttente("a", 100)], 1000)).toEqual({
      type: "planifier",
      entryId: "a",
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
