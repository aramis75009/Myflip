import { describe, expect, it } from "vitest";

import { depensesParSemaine, lundiParis, statsGlobales, statsParGroupe, type EssaiBilan } from "./_bilan";

const essai = (p: Partial<EssaiBilan> = {}): EssaiBilan => ({
  colorisId: "c1",
  angleId: "a1",
  modele: "qwen",
  decision: null,
  essaiParentId: null,
  coutReelUsd: 0.02,
  createdAt: "2026-10-20T10:00:00.000Z",
  ...p,
});

describe("statsParGroupe", () => {
  const essais = [
    essai({ decision: "valide" }),
    essai({ decision: "rejete" }),
    essai({ decision: "valide", essaiParentId: "x" }), // a correction: not a first try
    essai({ decision: null, coutReelUsd: null }),
    essai({ modele: "pro", decision: "valide", coutReelUsd: 0.134 }),
    essai({ modele: "manuel", decision: "rejete", coutReelUsd: null }),
  ];

  it("counts first tries on Aramis's decisions only, corrections excluded", () => {
    const qwen = statsParGroupe(essais, (e) => e.modele).find((g) => g.id === "qwen")!;
    expect(qwen).toMatchObject({ images: 4, valides: 2, rejetes: 1, aJuger: 1, premiersDecides: 2, premiersValides: 1, taux: 0.5 });
  });

  it("never counts an unknown cost as zero: the total is a minimum and says how many it misses", () => {
    const qwen = statsParGroupe(essais, (e) => e.modele).find((g) => g.id === "qwen")!;
    expect(qwen.coutConnuUsd).toBeCloseTo(0.06, 9);
    expect(qwen.sansCout).toBe(1);
    expect(qwen.coutParValideeUsd).toBeCloseTo(0.03, 9);
  });

  it("a manual deposit is never « without cost »: it did not go through the API", () => {
    const manuel = statsParGroupe(essais, (e) => e.modele).find((g) => g.id === "manuel")!;
    expect(manuel.sansCout).toBe(0);
    expect(manuel.coutParValideeUsd).toBeNull();
  });

  it("no decided first try → no rate (never 0 %)", () => {
    const [g] = statsParGroupe([essai({ decision: null })], () => "x");
    expect(g.taux).toBeNull();
  });

  it("is deterministic (sorted by key)", () => {
    expect(statsParGroupe(essais, (e) => e.modele).map((g) => g.id)).toEqual(["manuel", "pro", "qwen"]);
  });

  it("global summary", () => {
    expect(statsGlobales(essais)).toMatchObject({ images: 6, valides: 3, rejetes: 2, premiersDecides: 4, premiersValides: 2, taux: 0.5 });
  });
});

describe("depensesParSemaine", () => {
  it("finds the Paris Monday", () => {
    expect(lundiParis("2026-10-22T10:00:00Z")).toBe("2026-10-19");
    expect(lundiParis("2026-10-19T00:30:00+02:00")).toBe("2026-10-19");
    // Sunday 23:30 UTC is already Monday in Paris.
    expect(lundiParis("2026-10-25T23:30:00Z")).toBe("2026-10-26");
    expect(lundiParis("illisible")).toBeNull();
  });

  it("lists every week, oldest first, with known costs, failures and missing costs", () => {
    const semaines = depensesParSemaine(
      [
        essai({ createdAt: "2026-10-20T10:00:00Z", coutReelUsd: 0.1 }),
        essai({ createdAt: "2026-10-21T10:00:00Z", coutReelUsd: null }),
        essai({ createdAt: "2026-10-06T10:00:00Z", coutReelUsd: 0.05 }),
        essai({ createdAt: "2025-01-01T10:00:00Z", coutReelUsd: 9 }), // too old: not shown
      ],
      [{ modele: "qwen", coutReelUsd: 0.002, createdAt: "2026-10-22T08:00:00Z" }],
      new Date("2026-10-22T12:00:00Z"),
      4,
    );
    expect(semaines.map((s) => s.debut)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(semaines.map((s) => s.usd)).toEqual([0, 0.05, 0, 0.102]);
    expect(semaines[3]).toMatchObject({ sansCout: 1, images: 2 });
    expect(semaines[2]).toMatchObject({ usd: 0, images: 0, sansCout: 0 });
  });
});
