import { describe, expect, it } from "vitest";
import { computeStudioStats, type EchecStat, type StudioEssaiStat } from "./studioStats";

const essai = (
  colorisId: string,
  angleId: string,
  numero: number,
  decision: string | null,
  verifIA?: unknown,
): StudioEssaiStat => ({ colorisId, angleId, numero, decision, verifIA });

// Essai rangé sous un modèle, avec un coût réel éventuel (null = coût inconnu).
const essaiM = (
  modele: string,
  colorisId: string,
  angleId: string,
  numero: number,
  decision: string | null,
  coutReelUsd?: number | null,
  verifIA?: unknown,
): StudioEssaiStat => ({ colorisId, angleId, numero, decision, modele, coutReelUsd, verifIA });

const echec = (modele: string, code: string, coutReelUsd: number | null): EchecStat => ({
  modele,
  code,
  coutReelUsd,
});

const verif = (...derives: string[]) => ({
  details: derives.map((detail) => ({ detail, statut: "derive", note: "" })),
});

describe("computeStudioStats — empty and undecided data", () => {
  it("no essai at all: no rate, no average, empty top, no crash", () => {
    const s = computeStudioStats([]);
    expect(s.global).toEqual({
      firstTry: { validated: 0, decided: 0, rate: null },
      averageTries: null,
      pairs: 0,
    });
    expect(s.byAngle).toEqual([]);
    expect(s.byColoris).toEqual([]);
    expect(s.topDriftingDetails).toEqual([]);
  });

  it("only undecided essais: rate and average are null, not 0", () => {
    const s = computeStudioStats([essai("c1", "face", 1, null), essai("c1", "dos", 1, null)]);
    expect(s.global.firstTry).toEqual({ validated: 0, decided: 0, rate: null });
    expect(s.global.averageTries).toBeNull();
    expect(s.byAngle.map((a) => a.firstTry.rate)).toEqual([null, null]);
  });

  it("an unknown decision value counts as undecided", () => {
    const s = computeStudioStats([essai("c1", "face", 1, "peut-etre")]);
    expect(s.global.firstTry.decided).toBe(0);
  });
});

describe("computeStudioStats — first-try rate and average tries", () => {
  it("first-try rate per angle and per coloris, on decisions only", () => {
    const s = computeStudioStats([
      essai("c1", "face", 1, "valide"),
      essai("c2", "face", 1, "rejete"),
      essai("c2", "face", 2, "valide"),
      essai("c1", "dos", 1, "rejete"),
      essai("c2", "dos", 1, "valide"),
    ]);
    expect(s.byAngle.find((a) => a.id === "face")?.firstTry).toEqual({ validated: 1, decided: 2, rate: 0.5 });
    expect(s.byAngle.find((a) => a.id === "dos")?.firstTry).toEqual({ validated: 1, decided: 2, rate: 0.5 });
    expect(s.byColoris.find((c) => c.id === "c1")?.firstTry).toEqual({ validated: 1, decided: 2, rate: 0.5 });
    expect(s.byColoris.find((c) => c.id === "c2")?.firstTry).toEqual({ validated: 1, decided: 2, rate: 0.5 });
    expect(s.global.firstTry).toEqual({ validated: 2, decided: 4, rate: 0.5 });
  });

  it("a later success does not count as first-try success", () => {
    const s = computeStudioStats([essai("c1", "face", 1, "rejete"), essai("c1", "face", 2, "valide")]);
    expect(s.global.firstTry.rate).toBe(0);
  });

  it("an undecided first essai is excluded from the denominator", () => {
    const s = computeStudioStats([essai("c1", "face", 1, null), essai("c2", "face", 1, "valide")]);
    expect(s.global.firstTry).toEqual({ validated: 1, decided: 1, rate: 1 });
  });

  it("average tries counts decided essais per coloris x angle pair", () => {
    const s = computeStudioStats([
      essai("c1", "face", 1, "valide"), // 1 essai
      essai("c2", "face", 1, "rejete"),
      essai("c2", "face", 2, "rejete"),
      essai("c2", "face", 3, "valide"), // 3 essais
    ]);
    expect(s.byAngle[0]).toMatchObject({ id: "face", pairs: 2, averageTries: 2 });
    expect(s.global.averageTries).toBe(2);
    expect(s.byColoris.map((c) => [c.id, c.averageTries])).toEqual([
      ["c1", 1],
      ["c2", 3],
    ]);
  });

  it("an undecided pending essai does not inflate the average", () => {
    const s = computeStudioStats([essai("c1", "face", 1, "valide"), essai("c1", "face", 2, null)]);
    expect(s.global.averageTries).toBe(1);
  });

  it("an angle with only rejections: 0 % first try, its tries still count", () => {
    const s = computeStudioStats([
      essai("c1", "cote", 1, "rejete"),
      essai("c1", "cote", 2, "rejete"),
      essai("c2", "cote", 1, "rejete"),
    ]);
    expect(s.byAngle[0]).toEqual({
      id: "cote",
      firstTry: { validated: 0, decided: 2, rate: 0 },
      averageTries: 1.5,
      pairs: 2,
    });
  });

  it("the verdict of the AI never drives the rates", () => {
    const s = computeStudioStats([
      essai("c1", "face", 1, "rejete", { verdict: "ok", scoreGlobal: 100, details: [] }),
      essai("c2", "face", 1, "valide", { verdict: "rejet", scoreGlobal: 0, details: verif("zip").details }),
    ]);
    expect(s.global.firstTry).toEqual({ validated: 1, decided: 2, rate: 0.5 });
  });

  it("groups are sorted by id whatever the input order", () => {
    const s = computeStudioStats([essai("c2", "dos", 1, "valide"), essai("c1", "face", 1, "valide")]);
    expect(s.byAngle.map((a) => a.id)).toEqual(["dos", "face"]);
    expect(s.byColoris.map((c) => c.id)).toEqual(["c1", "c2"]);
  });
});

describe("computeStudioStats — top drifting details", () => {
  it("ranks details by number of essais, highest first", () => {
    const s = computeStudioStats([
      essai("c1", "face", 1, "rejete", verif("zip", "logo")),
      essai("c1", "face", 2, "rejete", verif("zip")),
      essai("c2", "dos", 1, "valide", verif("zip", "anse", "logo")),
    ]);
    expect(s.topDriftingDetails).toEqual([
      { detail: "zip", count: 3 },
      { detail: "logo", count: 2 },
      { detail: "anse", count: 1 },
    ]);
  });

  it("keeps at most 3 details", () => {
    const s = computeStudioStats([essai("c1", "face", 1, null, verif("a", "b", "c", "d", "e"))]);
    expect(s.topDriftingDetails).toHaveLength(3);
  });

  it("fewer than 3 drifting details: returns what exists", () => {
    const s = computeStudioStats([essai("c1", "face", 1, null, verif("zip"))]);
    expect(s.topDriftingDetails).toEqual([{ detail: "zip", count: 1 }]);
  });

  it("ties: alphabetical on the normalized key, regardless of input order", () => {
    const a = computeStudioStats([essai("c1", "face", 1, null, verif("Zip", "ancre", "Étiquette"))]);
    const b = computeStudioStats([essai("c1", "face", 1, null, verif("Étiquette", "Zip", "ancre"))]);
    const expected = [
      { detail: "ancre", count: 1 },
      { detail: "Étiquette", count: 1 },
      { detail: "Zip", count: 1 },
    ];
    expect(a.topDriftingDetails).toEqual(expected);
    expect(b.topDriftingDetails).toEqual(expected);
  });

  it("merges case, accent and spacing variants; keeps the first spelling", () => {
    const s = computeStudioStats([
      essai("c1", "face", 1, null, verif("Zip  doré")),
      essai("c2", "face", 1, null, verif("zip dore")),
    ]);
    expect(s.topDriftingDetails).toEqual([{ detail: "Zip doré", count: 2 }]);
  });

  it("a detail repeated inside one verification counts once", () => {
    const s = computeStudioStats([essai("c1", "face", 1, null, verif("zip", "zip"))]);
    expect(s.topDriftingDetails).toEqual([{ detail: "zip", count: 1 }]);
  });

  it("ignores details that are faithful or absent", () => {
    const s = computeStudioStats([
      essai("c1", "face", 1, null, {
        details: [
          { detail: "zip", statut: "fidele" },
          { detail: "logo", statut: "absent" },
          { detail: "anse", statut: "derive" },
        ],
      }),
    ]);
    expect(s.topDriftingDetails).toEqual([{ detail: "anse", count: 1 }]);
  });

  it("counts drift even when the essai has no decision yet", () => {
    const s = computeStudioStats([essai("c1", "face", 1, null, verif("zip"))]);
    expect(s.topDriftingDetails).toEqual([{ detail: "zip", count: 1 }]);
    expect(s.global.firstTry.rate).toBeNull();
  });
});

describe("computeStudioStats — verifIA of unexpected shape", () => {
  const weird: unknown[] = [
    undefined,
    null,
    {},
    [],
    "texte",
    42,
    true,
    { details: null },
    { details: "zip" },
    { details: {} },
    { details: [null, 1, "x", [], {}] },
    { details: [{ detail: 12, statut: "derive" }] },
    { details: [{ detail: "   ", statut: "derive" }] },
    { details: [{ statut: "derive" }] },
  ];

  it.each(weird.map((v, i) => [i, v] as const))("shape #%i does not crash and yields no detail", (_i, v) => {
    const s = computeStudioStats([essai("c1", "face", 1, "valide", v)]);
    expect(s.topDriftingDetails).toEqual([]);
    expect(s.global.firstTry.rate).toBe(1);
  });

  it("accepts a bare array of details", () => {
    const s = computeStudioStats([essai("c1", "face", 1, null, [{ detail: "zip", statut: "derive" }])]);
    expect(s.topDriftingDetails).toEqual([{ detail: "zip", count: 1 }]);
  });

  it("a bad item does not hide the good ones next to it", () => {
    const s = computeStudioStats([
      essai("c1", "face", 1, null, { details: [null, { detail: "zip", statut: "derive" }] }),
    ]);
    expect(s.topDriftingDetails).toEqual([{ detail: "zip", count: 1 }]);
  });
});

describe("computeStudioStats — per-model grouping of tries", () => {
  it("two models launched together on the same pair each keep their own n° 1", () => {
    const s = computeStudioStats([
      essaiM("A", "c1", "face", 1, "valide"),
      essaiM("B", "c1", "face", 1, "valide"),
    ]);
    expect(s.byModel.map((m) => [m.id, m.firstTry.rate])).toEqual([
      ["A", 1],
      ["B", 1],
    ]);
    // Une paire par modèle : 2 essais sur 2 paires = 1, et non 2 essais sur 1 paire.
    expect(s.global.averageTries).toBe(1);
    expect(s.global.pairs).toBe(2);
    expect(s.byAngle[0]).toMatchObject({ id: "face", pairs: 2, averageTries: 1 });
    expect(s.byColoris[0]).toMatchObject({ id: "c1", pairs: 2, averageTries: 1 });
    expect(s.global.firstTry).toEqual({ validated: 2, decided: 2, rate: 1 });
  });

  it("the tries of one model on one pair still add up inside that model", () => {
    const s = computeStudioStats([
      essaiM("A", "c1", "face", 1, "rejete"),
      essaiM("A", "c1", "face", 2, "rejete"),
      essaiM("A", "c1", "face", 3, "valide"),
      essaiM("B", "c1", "face", 1, "valide"),
    ]);
    const a = s.byModel.find((m) => m.id === "A");
    const b = s.byModel.find((m) => m.id === "B");
    expect(a).toMatchObject({ pairs: 1, averageTries: 3, firstTry: { validated: 0, decided: 1, rate: 0 } });
    expect(b).toMatchObject({ pairs: 1, averageTries: 1, firstTry: { validated: 1, decided: 1, rate: 1 } });
    // Global : (3 + 1) essais sur 2 paires (coloris, angle, modèle).
    expect(s.global).toMatchObject({ pairs: 2, averageTries: 2 });
  });

  it("an essai without a model lands on the manual row, merged with an explicit manual one", () => {
    const s = computeStudioStats([
      essai("c1", "face", 1, "valide"),
      essaiM("manuel", "c2", "face", 1, "rejete"),
    ]);
    expect(s.byModel).toHaveLength(1);
    expect(s.byModel[0]).toMatchObject({
      id: "manuel",
      essais: 2,
      firstTry: { validated: 1, decided: 2, rate: 0.5 },
    });
  });

  it("an absent model and the explicit manual model share one (coloris, angle) pair", () => {
    const s = computeStudioStats([essai("c1", "face", 1, "rejete"), essaiM("manuel", "c1", "face", 2, "valide")]);
    expect(s.global).toMatchObject({ pairs: 1, averageTries: 2 });
  });

  it("an empty model name counts as manual, not as a row with an empty id", () => {
    const s = computeStudioStats([essaiM("", "c1", "face", 1, "valide")]);
    expect(s.byModel.map((m) => m.id)).toEqual(["manuel"]);
  });

  it("models are sorted by id whatever the input order", () => {
    const s = computeStudioStats(
      [essaiM("b/model", "c1", "face", 1, "valide"), essaiM("a/model", "c1", "face", 1, "valide"), essai("c1", "dos", 1, null)],
      [echec("0/model", "no_image", null)],
    );
    expect(s.byModel.map((m) => m.id)).toEqual(["0/model", "a/model", "b/model", "manuel"]);
  });
});

describe("computeStudioStats — per-model costs", () => {
  const modelA = [
    essaiM("A", "c1", "face", 1, "rejete", 0.02),
    essaiM("A", "c1", "face", 2, null, null),
    essaiM("A", "c1", "face", 3, "valide", 0.04),
  ];

  it("averages the known costs only; a null cost is never a zero", () => {
    const a = computeStudioStats(modelA).byModel[0];
    expect(a).toMatchObject({
      id: "A",
      essais: 3,
      coutConnus: 2,
      coutTotalUsd: 0.06,
      coutMoyenUsd: 0.03,
    });
  });

  it("cost per validated image = known total / validated essais (all numbers, not only n° 1)", () => {
    const a = computeStudioStats(modelA).byModel[0];
    expect(a.validated).toBe(1);
    expect(a.firstTry.validated).toBe(0);
    expect(a.coutParValideeUsd).toBe(0.06);
  });

  it("flags an api model that has an essai without a known cost", () => {
    expect(computeStudioStats(modelA).byModel[0].coutIncomplet).toBe(true);
  });

  it("is not flagged when every cost is known", () => {
    const a = computeStudioStats([essaiM("A", "c1", "face", 1, "valide", 0.02), essaiM("A", "c2", "face", 1, "rejete", 0.04)])
      .byModel[0];
    expect(a.coutIncomplet).toBe(false);
    expect(a.coutParValideeUsd).toBe(0.06);
  });

  it("a model with no known cost has no average and no cost per image, never 0", () => {
    const a = computeStudioStats([essaiM("A", "c1", "face", 1, "valide", null), essaiM("A", "c2", "face", 1, "valide")])
      .byModel[0];
    expect(a).toMatchObject({
      coutConnus: 0,
      coutTotalUsd: 0,
      coutMoyenUsd: null,
      coutParValideeUsd: null,
      coutIncomplet: true,
    });
  });

  it("a known cost of 0 is a cost (free model), unlike a missing one", () => {
    const a = computeStudioStats([essaiM("A", "c1", "face", 1, "valide", 0)]).byModel[0];
    expect(a).toMatchObject({ coutConnus: 1, coutMoyenUsd: 0, coutParValideeUsd: 0, coutIncomplet: false });
  });

  it("no validated essai: no cost per validated image, the average is still there", () => {
    const a = computeStudioStats([essaiM("A", "c1", "face", 1, "rejete", 0.05)]).byModel[0];
    expect(a).toMatchObject({ validated: 0, coutParValideeUsd: null, coutMoyenUsd: 0.05 });
  });

  it("the manual row is never incomplete and carries no cost", () => {
    const m = computeStudioStats([essai("c1", "face", 1, "valide"), essai("c1", "dos", 1, null)]).byModel[0];
    expect(m).toMatchObject({
      id: "manuel",
      coutConnus: 0,
      coutTotalUsd: 0,
      coutMoyenUsd: null,
      coutParValideeUsd: null,
      coutIncomplet: false,
    });
  });

  it("ignores costs that are not finite numbers", () => {
    const a = computeStudioStats([
      essaiM("A", "c1", "face", 1, "valide", Number.NaN),
      essaiM("A", "c1", "face", 2, "valide", Number.POSITIVE_INFINITY),
      essaiM("A", "c1", "face", 3, "valide", 0.01),
    ]).byModel[0];
    expect(a).toMatchObject({ coutConnus: 1, coutTotalUsd: 0.01, coutIncomplet: true });
  });

  it("does not leak float noise into the money fields", () => {
    const s = computeStudioStats(
      [essaiM("A", "c1", "face", 1, "valide", 0.1), essaiM("A", "c1", "face", 2, "valide", 0.2)],
      [echec("A", "no_image", 0.1)],
    );
    expect(s.byModel[0].coutTotalUsd).toBe(0.3);
    expect(s.byModel[0].coutMoyenUsd).toBe(0.15);
    expect(s.byModel[0].coutParValideeUsd).toBe(0.15);
    expect(s.depense.totalUsd).toBe(0.4);
  });
});

describe("computeStudioStats — AI score per model", () => {
  it("averages the readable scores of the model's essais, rounded", () => {
    const s = computeStudioStats([
      essaiM("A", "c1", "face", 1, "rejete", null, { scoreGlobal: 81 }),
      essaiM("A", "c1", "face", 2, "valide", null, { scoreGlobal: 40 }),
      essaiM("B", "c1", "face", 1, "valide", null, { scoreGlobal: 90 }),
    ]);
    expect(s.byModel.map((m) => [m.id, m.scoreMoyen])).toEqual([
      ["A", 61],
      ["B", 90],
    ]);
  });

  it("is null, not 0, when no essai carries a readable score", () => {
    const s = computeStudioStats([
      essaiM("A", "c1", "face", 1, "valide", null, undefined),
      essaiM("A", "c1", "face", 2, "valide", null, { scoreGlobal: "81" }),
      essaiM("A", "c1", "face", 3, "valide", null, { details: [] }),
    ]);
    expect(s.byModel[0].scoreMoyen).toBeNull();
  });

  it("an unreadable score does not hide the readable ones", () => {
    const s = computeStudioStats([
      essaiM("A", "c1", "face", 1, "valide", null, "texte"),
      essaiM("A", "c1", "face", 2, "valide", null, { scoreGlobal: 70 }),
    ]);
    expect(s.byModel[0].scoreMoyen).toBe(70);
  });
});

describe("computeStudioStats — generation failures and spending", () => {
  const failures = [echec("A", "securite", null), echec("A", "no_image", 0.01)];

  it("counts failures and safety blocks per model", () => {
    const s = computeStudioStats([essaiM("A", "c1", "face", 1, "valide", 0.02)], failures);
    expect(s.byModel[0]).toMatchObject({ id: "A", essais: 1, echecs: 2, blocagesSecurite: 1 });
  });

  it("a model with only failures still has its row, with no invented figure", () => {
    const s = computeStudioStats([], failures);
    expect(s.byModel).toHaveLength(1);
    expect(s.byModel[0]).toEqual({
      id: "A",
      firstTry: { validated: 0, decided: 0, rate: null },
      averageTries: null,
      pairs: 0,
      essais: 0,
      validated: 0,
      coutConnus: 0,
      coutTotalUsd: 0,
      coutMoyenUsd: null,
      coutParValideeUsd: null,
      coutIncomplet: false,
      scoreMoyen: null,
      echecs: 2,
      blocagesSecurite: 1,
    });
  });

  it("a failure does not consume a try nor enter the rates", () => {
    const withFailures = computeStudioStats([essaiM("A", "c1", "face", 1, "valide", 0.02)], failures);
    const without = computeStudioStats([essaiM("A", "c1", "face", 1, "valide", 0.02)]);
    expect(withFailures.global).toEqual(without.global);
    expect(withFailures.byAngle).toEqual(without.byAngle);
    expect(withFailures.byModel[0].firstTry).toEqual(without.byModel[0].firstTry);
  });

  it("failure costs go to the total spent, not to the model's cost per image", () => {
    const s = computeStudioStats(
      [essaiM("A", "c1", "face", 1, "valide", 0.02), essaiM("A", "c1", "face", 2, "valide", 0.04)],
      failures,
    );
    expect(s.depense.totalUsd).toBe(0.07);
    expect(s.byModel[0].coutTotalUsd).toBe(0.06);
    expect(s.byModel[0].coutParValideeUsd).toBe(0.03);
  });

  it("total spent adds the known costs of every model, essais and failures alike", () => {
    const s = computeStudioStats(
      [essaiM("A", "c1", "face", 1, "valide", 0.02), essaiM("B", "c1", "face", 1, "valide", 0.1), essai("c1", "dos", 1, null)],
      [echec("B", "no_image", 0.01)],
    );
    expect(s.depense.totalUsd).toBe(0.13);
  });

  it("counts the api essais with no known cost; manual essais and failures are not counted", () => {
    const s = computeStudioStats(
      [
        essaiM("A", "c1", "face", 1, "valide", null),
        essaiM("A", "c1", "face", 2, "valide"),
        essaiM("A", "c1", "face", 3, "valide", 0.02),
        essaiM("B", "c1", "face", 1, "valide", Number.NaN),
        essai("c1", "dos", 1, null),
      ],
      failures,
    );
    expect(s.depense.essaisSansCout).toBe(3);
  });

  it("nothing spent: zero, not null", () => {
    expect(computeStudioStats([]).depense).toEqual({ totalUsd: 0, essaisSansCout: 0 });
    expect(computeStudioStats([essai("c1", "face", 1, "valide")]).depense).toEqual({
      totalUsd: 0,
      essaisSansCout: 0,
    });
  });

  it("the failures argument is optional and byModel is empty without any data", () => {
    const s = computeStudioStats([]);
    expect(s.byModel).toEqual([]);
  });
});
