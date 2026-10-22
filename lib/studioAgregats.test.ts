import { describe, expect, it } from "vitest";

import { agregatsParModele, type EchecAgregat, type EssaiAgregat } from "./studioAgregats";

let n = 0;
/** Un essai API d'un modèle, sauf indication contraire : décidé « valide », sans correction, coût 0,04 $. */
function essai(modele: string, over: Partial<EssaiAgregat> = {}): EssaiAgregat {
  n += 1;
  return {
    modele,
    decision: "valide",
    essaiParentId: null,
    coutReelUsd: 0.04,
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, n)),
    dureeMs: 20_000,
    ...over,
  };
}
const echec = (modele: string, createdAt: Date | string = new Date(Date.UTC(2026, 9, 2))): EchecAgregat => ({ modele, createdAt });
const de = (liste: ReturnType<typeof agregatsParModele>, modele: string) => liste.find((a) => a.modele === modele);

describe("agregatsParModele", () => {
  it("is empty without any essay or failure", () => {
    expect(agregatsParModele([], [])).toEqual([]);
    expect(agregatsParModele([])).toEqual([]);
  });

  it("computes the first-try success rate from Aramis's decisions only", () => {
    const r = agregatsParModele([
      essai("a/x", { decision: "valide" }),
      essai("a/x", { decision: "valide" }),
      essai("a/x", { decision: "rejete" }),
      essai("a/x", { decision: "rejete" }),
    ]);
    expect(de(r, "a/x")).toMatchObject({ premiersCoupsDecides: 4, premiersCoupsValides: 2, tauxPremierCoup: 0.5, images: 4 });
  });

  it("leaves out the images Aramis has not judged yet: no decision, no rate contribution", () => {
    const r = agregatsParModele([essai("a/x", { decision: "valide" }), essai("a/x", { decision: null }), essai("a/x", { decision: null })]);
    expect(de(r, "a/x")).toMatchObject({ images: 3, premiersCoupsDecides: 1, premiersCoupsValides: 1, tauxPremierCoup: 1 });
  });

  it("ignores any other decision value", () => {
    const r = agregatsParModele([essai("a/x", { decision: "ok" }), essai("a/x", { decision: "valide" })]);
    expect(de(r, "a/x")?.premiersCoupsDecides).toBe(1);
  });

  it("gives a null rate, never 0 %, while nothing is decided", () => {
    const r = agregatsParModele([essai("a/x", { decision: null })]);
    expect(de(r, "a/x")?.tauxPremierCoup).toBeNull();
    expect(de(r, "a/x")?.premiersCoupsDecides).toBe(0);
  });

  it("does not count a correction as a first try, but counts its image and cost", () => {
    // essai raté (rejeté) → sa correction (validée) : le modèle a raté du premier coup, une fois
    const r = agregatsParModele([
      essai("a/x", { decision: "rejete" }),
      essai("a/x", { decision: "valide", essaiParentId: "essai-raté" }),
    ]);
    expect(de(r, "a/x")).toMatchObject({ images: 2, premiersCoupsDecides: 1, premiersCoupsValides: 0, tauxPremierCoup: 0 });
    expect(de(r, "a/x")?.coutsConnus).toBe(2);
  });

  it("averages the known real costs only, and says when some are missing", () => {
    const r = agregatsParModele([
      essai("a/x", { coutReelUsd: 0.02 }),
      essai("a/x", { coutReelUsd: 0.04 }),
      essai("a/x", { coutReelUsd: null }),
    ]);
    const a = de(r, "a/x");
    expect(a?.coutMoyenReelUsd).toBe(0.03); // jamais (0,02 + 0,04 + 0) / 3
    expect(a?.coutsConnus).toBe(2);
    expect(a?.coutIncomplet).toBe(true);
  });

  it("has no average cost when none is known (never a zero), and is complete when all are known", () => {
    const sans = de(agregatsParModele([essai("a/x", { coutReelUsd: null })]), "a/x");
    expect(sans?.coutMoyenReelUsd).toBeNull();
    expect(sans?.coutsConnus).toBe(0);
    expect(sans?.coutIncomplet).toBe(true);
    const complet = de(agregatsParModele([essai("a/x", { coutReelUsd: 0.1 }), essai("a/x", { coutReelUsd: 0.2 })]), "a/x");
    expect(complet?.coutMoyenReelUsd).toBe(0.15);
    expect(complet?.coutIncomplet).toBe(false);
  });

  it("treats a non-finite cost as unknown, not as zero", () => {
    const a = de(agregatsParModele([essai("a/x", { coutReelUsd: Number.NaN }), essai("a/x", { coutReelUsd: 0.06 })]), "a/x");
    expect(a?.coutMoyenReelUsd).toBe(0.06);
    expect(a?.coutsConnus).toBe(1);
  });

  it("keeps a real cost of zero as a known cost (a free model is not an unknown one)", () => {
    const a = de(agregatsParModele([essai("a/x", { coutReelUsd: 0 })]), "a/x");
    expect(a?.coutMoyenReelUsd).toBe(0);
    expect(a?.coutsConnus).toBe(1);
    expect(a?.coutIncomplet).toBe(false);
  });

  it("rounds the average to the millionth of a dollar (0,1 + 0,2 gives 0,15 / 2 cleanly)", () => {
    const a = de(agregatsParModele([essai("a/x", { coutReelUsd: 0.1 }), essai("a/x", { coutReelUsd: 0.2 })]), "a/x");
    expect(a?.coutMoyenReelUsd).toBe(0.15);
    const b = de(agregatsParModele([essai("a/x", { coutReelUsd: 0.1 }), essai("a/x", { coutReelUsd: 0.1 }), essai("a/x", { coutReelUsd: 0.1 })]), "a/x");
    expect(b?.coutMoyenReelUsd).toBe(0.1);
  });

  it("averages the measured durations, and leaves unmeasured ones out", () => {
    const a = de(
      agregatsParModele([essai("a/x", { dureeMs: 10_000 }), essai("a/x", { dureeMs: 25_001 }), essai("a/x", { dureeMs: null }), essai("a/x", { dureeMs: undefined })]),
      "a/x",
    );
    expect(a?.dureeMoyenneMs).toBe(17_501);
    expect(de(agregatsParModele([essai("b/y", { dureeMs: null })]), "b/y")?.dureeMoyenneMs).toBeNull();
  });

  it("dates the last use from the latest essay OR failure, as an ISO string", () => {
    const r = agregatsParModele(
      [essai("a/x", { createdAt: new Date("2026-10-05T10:00:00Z") }), essai("a/x", { createdAt: "2026-10-03T10:00:00Z" })],
      [echec("a/x", new Date("2026-10-07T08:30:00Z"))],
    );
    expect(de(r, "a/x")?.derniereUtilisation).toBe("2026-10-07T08:30:00.000Z");
    const sansEchec = agregatsParModele([essai("a/x", { createdAt: "2026-10-05T10:00:00Z" }), essai("a/x", { createdAt: new Date("2026-10-04T10:00:00Z") })]);
    expect(de(sansEchec, "a/x")?.derniereUtilisation).toBe("2026-10-05T10:00:00.000Z");
  });

  it("ignores an unreadable date instead of crashing, and has no date without any readable one", () => {
    const r = agregatsParModele([essai("a/x", { createdAt: "pas une date" }), essai("a/x", { createdAt: "2026-10-05T10:00:00Z" })]);
    expect(de(r, "a/x")?.derniereUtilisation).toBe("2026-10-05T10:00:00.000Z");
    expect(de(agregatsParModele([essai("b/y", { createdAt: "???" })]), "b/y")?.derniereUtilisation).toBeNull();
  });

  it("counts failures apart: they are not images, not first tries, not costs", () => {
    const r = agregatsParModele([essai("a/x")], [echec("a/x"), echec("a/x")]);
    expect(de(r, "a/x")).toMatchObject({ images: 1, echecs: 2, premiersCoupsDecides: 1 });
  });

  it("gives a model that only has failures its own line, with no rate and no cost", () => {
    const r = agregatsParModele([], [echec("c/zzz"), echec("c/zzz")]);
    expect(r).toEqual([
      {
        modele: "c/zzz",
        images: 0,
        premiersCoupsDecides: 0,
        premiersCoupsValides: 0,
        tauxPremierCoup: null,
        coutMoyenReelUsd: null,
        coutsConnus: 0,
        coutIncomplet: false,
        dureeMoyenneMs: null,
        echecs: 2,
        derniereUtilisation: "2026-10-02T00:00:00.000Z",
      },
    ]);
  });

  it("keeps the models apart and returns them sorted by id, whatever the input order", () => {
    const r = agregatsParModele([essai("z/last"), essai("a/first", { decision: "rejete" }), essai("m/middle")]);
    expect(r.map((a) => a.modele)).toEqual(["a/first", "m/middle", "z/last"]);
    expect(de(r, "a/first")?.tauxPremierCoup).toBe(0);
    expect(de(r, "m/middle")?.tauxPremierCoup).toBe(1);
  });

  it("leaves out manual deposits: no price, no model to choose", () => {
    const r = agregatsParModele([essai("manuel", { coutReelUsd: null }), essai("", { coutReelUsd: null }), essai("a/x")], [echec("manuel")]);
    expect(r.map((a) => a.modele)).toEqual(["a/x"]);
  });

  it("does not read the AI verdict at all: the input type has no field for it", () => {
    // Un essai avec un `verifIA` favorable mais rejeté par Aramis reste un échec du premier coup.
    const avecAvis = { ...essai("a/x", { decision: "rejete" }), verifIA: { verdict: "ok", scoreGlobal: 99 } } as EssaiAgregat;
    expect(de(agregatsParModele([avecAvis]), "a/x")?.tauxPremierCoup).toBe(0);
  });

  it("does not mutate its inputs", () => {
    const essais = [essai("b/y"), essai("a/x")];
    const copie = JSON.stringify(essais);
    agregatsParModele(essais, [echec("a/x")]);
    expect(JSON.stringify(essais)).toBe(copie);
  });
});
