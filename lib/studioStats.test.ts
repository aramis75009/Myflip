import { describe, expect, it } from "vitest";
import { computeStudioStats, type StudioEssaiStat } from "./studioStats";

const essai = (
  colorisId: string,
  angleId: string,
  numero: number,
  decision: string | null,
  verifIA?: unknown,
): StudioEssaiStat => ({ colorisId, angleId, numero, decision, verifIA });

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
