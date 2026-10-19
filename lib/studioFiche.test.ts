import { describe, expect, it } from "vitest";
import {
  MAX_REFERENCES_PAR_ANGLE,
  avancement,
  detailsDerivants,
  estDecision,
  estDoublon,
  estOrigine,
  estRole,
  numeroSuivant,
  planRattachement,
  referencesPourAngle,
  roleSuggere,
  scoreVerif,
} from "./studioFiche";

describe("roleSuggere", () => {
  it("follows the loading order, then falls back to detail", () => {
    expect([0, 1, 2, 3, 4, 5, 12].map(roleSuggere)).toEqual(["face", "dos", "cote", "detail", "ouvert", "detail", "detail"]);
  });

  it("never throws on odd positions", () => {
    expect(roleSuggere(-1)).toBe("detail");
    expect(roleSuggere(1.5)).toBe("detail");
    expect(roleSuggere(Number.NaN)).toBe("detail");
  });
});

describe("guards", () => {
  it("accept only the closed values", () => {
    expect(estRole("face")).toBe(true);
    expect(estRole("Face")).toBe(false);
    expect(estOrigine("mise_en_vente")).toBe(true);
    expect(estOrigine("api")).toBe(false);
    expect(estDecision("valide")).toBe(true);
    expect(estDecision("ok")).toBe(false);
    expect(estDecision(null)).toBe(false);
  });
});

describe("referencesPourAngle", () => {
  const r = (id: string, role: string, jour: number) => ({ id, role, createdAt: new Date(2026, 9, jour) });

  it("takes the references of the requested role, oldest first", () => {
    const refs = [r("b", "dos", 3), r("a", "dos", 1), r("f", "face", 2)];
    expect(referencesPourAngle(refs, "dos").map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("falls back to front photos, then to everything", () => {
    expect(referencesPourAngle([r("f", "face", 1), r("d", "detail", 2)], "ouvert").map((x) => x.id)).toEqual(["f"]);
    expect(referencesPourAngle([r("d", "detail", 2), r("c", "cote", 1)], "ouvert").map((x) => x.id)).toEqual(["c", "d"]);
    expect(referencesPourAngle([], "face")).toEqual([]);
  });

  it("is capped", () => {
    const refs = Array.from({ length: 9 }, (_, i) => r(`x${i}`, "face", i + 1));
    expect(referencesPourAngle(refs, "face")).toHaveLength(MAX_REFERENCES_PAR_ANGLE);
  });

  it("does not mutate its input", () => {
    const refs = [r("b", "face", 3), r("a", "face", 1)];
    referencesPourAngle(refs, "face");
    expect(refs.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("numeroSuivant", () => {
  it("is max + 1, gaps included (a purged attempt keeps its number)", () => {
    expect(numeroSuivant([])).toBe(1);
    expect(numeroSuivant([{ numero: 1 }, { numero: 3 }])).toBe(4);
  });

  it("counts only the essais of the requested model (absent model = manual)", () => {
    const essais = [{ numero: 1, modele: "A" }, { numero: 3 }];
    expect(numeroSuivant(essais, "A")).toBe(2);
    expect(numeroSuivant(essais, "manuel")).toBe(4);
    expect(numeroSuivant([{ numero: 2 }])).toBe(3);
  });

  it("numbers every model independently on the same pair", () => {
    const essais = [
      { numero: 5, modele: "A" },
      { numero: 2, modele: "B" },
      { numero: 1, modele: "manuel" },
    ];
    expect(numeroSuivant(essais, "A")).toBe(6);
    expect(numeroSuivant(essais, "B")).toBe(3);
    expect(numeroSuivant(essais)).toBe(2);
  });

  it("starts at 1 for a model that has no essai yet", () => {
    expect(numeroSuivant([{ numero: 4, modele: "A" }], "B")).toBe(1);
    expect(numeroSuivant([{ numero: 4 }], "A")).toBe(1);
    expect(numeroSuivant([], "A")).toBe(1);
  });

  it("an empty model name is the manual model", () => {
    const essais = [{ numero: 2, modele: "" }, { numero: 5, modele: "A" }];
    expect(numeroSuivant(essais)).toBe(3);
    expect(numeroSuivant(essais, "")).toBe(3);
  });
});

describe("verifIA readers", () => {
  const verif = {
    details: [
      { detail: "swoosh blanc", statut: "derive", note: "" },
      { detail: "patch ELITE", statut: "fidele", note: "" },
      { detail: "lettrage", statut: "derive", note: "" },
      { detail: "bizarre", statut: "inconnu", note: "" },
    ],
    scoreGlobal: 72,
  };

  it("lists drifting details only", () => {
    expect(detailsDerivants(verif)).toEqual(["swoosh blanc", "lettrage"]);
  });

  it("reads defensively", () => {
    for (const v of [null, undefined, "x", 3, {}, { details: "x" }, { details: [null, 1] }]) {
      expect(detailsDerivants(v)).toEqual([]);
    }
    expect(scoreVerif(verif)).toBe(72);
    expect(scoreVerif({ scoreGlobal: "72" })).toBeNull();
    expect(scoreVerif(null)).toBeNull();
  });
});

describe("avancement", () => {
  it("counts tested and validated angles, and averages available scores", () => {
    const a = avancement(5, [
      { angleId: "face", decision: "rejete", verifIA: { scoreGlobal: 40 } },
      { angleId: "face", decision: "valide", verifIA: { scoreGlobal: 81 } },
      { angleId: "dos", decision: null, verifIA: null },
    ]);
    expect(a).toEqual({ references: 5, anglesTestes: 2, anglesValides: 1, scoreMoyen: 61 });
  });

  it("has no invented score when nothing was checked", () => {
    expect(avancement(0, []).scoreMoyen).toBeNull();
  });
});

describe("planRattachement", () => {
  it("attaches only orphans whose SKU is in the catalogue", () => {
    const index = new Map([["SDN1", "5039-black-pink"], ["SDN2", "5039-flower-green"]]);
    expect(
      planRattachement(
        [
          { id: "r1", sku: "SDN1" },
          { id: "r2", sku: "SDN9" },
          { id: "r3", sku: null },
          { id: "r4", sku: "SDN2" },
        ],
        index,
      ),
    ).toEqual([
      { id: "r1", cle: "5039-black-pink" },
      { id: "r4", cle: "5039-flower-green" },
    ]);
  });
});

describe("estDoublon", () => {
  it("is two bags or more at home", () => {
    expect([0, 1, 2, 3].map(estDoublon)).toEqual([false, false, true, true]);
  });
});
