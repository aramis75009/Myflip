import { describe, expect, it } from "vitest";

import {
  construireHistorique,
  coutDeTentative,
  resumerAvisIA,
  type EchecHistorique,
  type EssaiHistorique,
  type TentativeEchec,
  type TentativeEssai,
} from "./studioHistorique";

let n = 0;
function essai(over: Partial<EssaiHistorique> = {}): EssaiHistorique {
  n += 1;
  return {
    id: `e${n}`,
    modele: "a/x",
    numero: n,
    source: "api",
    decision: null,
    coutEstimeUsd: 0.05,
    coutReelUsd: 0.04,
    dureeMs: 21_000,
    verifIA: { verdict: "ok", scoreGlobal: 88, details: [] },
    urlImage: "https://blob.example/private/generees/u/x.png",
    lancementId: "lancement-1",
    essaiParentId: null,
    skuCible: "SDN15",
    createdAt: new Date(Date.UTC(2026, 9, 10, 10, 0, n)),
    ...over,
  };
}
function echec(over: Partial<EchecHistorique> = {}): EchecHistorique {
  n += 1;
  return {
    id: `x${n}`,
    modele: "b/y",
    code: "securite",
    message: "Bloqué par le fournisseur.",
    coutReelUsd: null,
    dureeMs: 3_000,
    lancementId: "lancement-1",
    createdAt: new Date(Date.UTC(2026, 9, 10, 10, 0, n)),
    ...over,
  };
}
const essais = (h: ReturnType<typeof construireHistorique>) => h.filter((t): t is TentativeEssai => t.kind === "essai");
const echecs = (h: ReturnType<typeof construireHistorique>) => h.filter((t): t is TentativeEchec => t.kind === "echec");

describe("coutDeTentative", () => {
  it("prefers the real cost, then the estimate, then says unknown — never zero", () => {
    expect(coutDeTentative(0.04, 0.05)).toEqual({ usd: 0.04, nature: "reel" });
    expect(coutDeTentative(null, 0.05)).toEqual({ usd: 0.05, nature: "estime" });
    expect(coutDeTentative(null, null)).toEqual({ usd: null, nature: "inconnu" });
    expect(coutDeTentative(undefined, undefined)).toEqual({ usd: null, nature: "inconnu" });
    expect(coutDeTentative(Number.NaN, Number.NaN)).toEqual({ usd: null, nature: "inconnu" });
  });

  it("keeps a real zero cost as a real cost", () => {
    expect(coutDeTentative(0, 0.05)).toEqual({ usd: 0, nature: "reel" });
  });
});

describe("resumerAvisIA", () => {
  it("reads verdict and score from a readable opinion", () => {
    expect(resumerAvisIA({ verdict: "a_corriger", scoreGlobal: 61, details: [] })).toEqual({ verdict: "a_corriger", scoreGlobal: 61 });
    expect(resumerAvisIA({ verdict: "rejet", scoreGlobal: 12 })).toEqual({ verdict: "rejet", scoreGlobal: 12 });
  });

  it("is null for no opinion or an unreadable one (never a made-up verdict)", () => {
    for (const v of [null, undefined, "ok", 3, [], {}, { verdict: "ok" }, { scoreGlobal: 50 }, { verdict: "peut-être", scoreGlobal: 50 }, { verdict: "ok", scoreGlobal: "50" }, { verdict: "ok", scoreGlobal: Number.NaN }]) {
      expect(resumerAvisIA(v), JSON.stringify(v)).toBeNull();
    }
  });
});

describe("construireHistorique", () => {
  it("is empty without any attempt", () => {
    expect(construireHistorique([], [])).toEqual([]);
    expect(construireHistorique([])).toEqual([]);
  });

  it("lists essays AND failures in chronological order, oldest first", () => {
    const e1 = essai({ createdAt: new Date("2026-10-10T10:00:00Z") });
    const x1 = echec({ createdAt: new Date("2026-10-10T10:05:00Z") });
    const e2 = essai({ createdAt: new Date("2026-10-10T10:10:00Z") });
    const h = construireHistorique([e2, e1], [x1]);
    expect(h.map((t) => t.id)).toEqual([e1.id, x1.id, e2.id]);
    expect(h.map((t) => t.kind)).toEqual(["essai", "echec", "essai"]);
  });

  it("puts an essay before a failure at the same instant, then orders by id", () => {
    const t = new Date("2026-10-10T10:00:00Z");
    const x = echec({ id: "x-a", createdAt: t });
    const eB = essai({ id: "e-b", createdAt: t });
    const eA = essai({ id: "e-a", createdAt: t });
    expect(construireHistorique([eB, eA], [x]).map((i) => i.id)).toEqual(["e-a", "e-b", "x-a"]);
  });

  it("keeps rejected essays, even with their image purged", () => {
    const rejete = essai({ decision: "rejete" });
    const purge = essai({ decision: "rejete", urlImage: "" });
    const h = essais(construireHistorique([rejete, purge]));
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ decision: "rejete", purgee: false, image: `/api/studio/image?essai=${rejete.id}` });
    expect(h[1]).toMatchObject({ decision: "rejete", purgee: true, image: null });
  });

  it("never leaks the private blob URL", () => {
    const h = construireHistorique([essai()], [echec()]);
    expect(JSON.stringify(h)).not.toContain("blob.example");
    expect(JSON.stringify(h)).not.toContain("urlImage");
  });

  it("fills in model, cost, duration, AI opinion and the decision of an essay", () => {
    const e = essai({ id: "e-1", modele: "google/pro", numero: 2, decision: "valide", coutReelUsd: 0.134, coutEstimeUsd: 0.15, dureeMs: 48_000, essaiParentId: "e-0", lancementId: "l-9", skuCible: "SDN3" });
    expect(essais(construireHistorique([e]))[0]).toMatchObject({
      kind: "essai",
      id: "e-1",
      modele: "google/pro",
      numero: 2,
      source: "api",
      lancementId: "l-9",
      essaiParentId: "e-0",
      skuCible: "SDN3",
      cout: { usd: 0.134, nature: "reel" },
      coutReelUsd: 0.134,
      coutEstimeUsd: 0.15,
      dureeMs: 48_000,
      verdictIA: { verdict: "ok", scoreGlobal: 88 },
      decision: "valide",
    });
  });

  it("falls back to the estimate when the real cost is missing, and to unknown when both are", () => {
    const [estime, inconnu] = essais(construireHistorique([essai({ coutReelUsd: null }), essai({ coutReelUsd: null, coutEstimeUsd: null })]));
    expect(estime.cout).toEqual({ usd: 0.05, nature: "estime" });
    expect(estime.coutReelUsd).toBeNull();
    expect(inconnu.cout).toEqual({ usd: null, nature: "inconnu" });
  });

  it("shows the AI opinion next to, not instead of, Aramis's decision (no opinion = null, decision untouched)", () => {
    const [h] = essais(construireHistorique([essai({ verifIA: null, decision: "rejete" })]));
    expect(h.verdictIA).toBeNull();
    expect(h.decision).toBe("rejete");
    const [ok] = essais(construireHistorique([essai({ verifIA: { verdict: "ok", scoreGlobal: 97 }, decision: "rejete" })]));
    expect(ok.verdictIA?.verdict).toBe("ok");
    expect(ok.decision).toBe("rejete");
  });

  it("reads a manual deposit as manual, and an unknown decision as « à juger »", () => {
    const [manuel, bizarre] = essais(construireHistorique([essai({ source: "manuel", modele: "manuel", coutReelUsd: null, coutEstimeUsd: null, dureeMs: null }), essai({ decision: "peut-être" })]));
    expect(manuel.source).toBe("manuel");
    expect(manuel.cout.nature).toBe("inconnu");
    expect(manuel.dureeMs).toBeNull();
    expect(bizarre.decision).toBeNull();
  });

  it("keeps an unknown duration null and drops a negative one", () => {
    const [a, b] = essais(construireHistorique([essai({ dureeMs: null }), essai({ dureeMs: -5 })]));
    expect(a.dureeMs).toBeNull();
    expect(b.dureeMs).toBeNull();
  });

  it("describes a failure: code, message, cost if billed, duration", () => {
    const [x] = echecs(construireHistorique([], [echec({ id: "x-1", code: "incertain", message: "Délai dépassé.", coutReelUsd: 0.02, dureeMs: 280_000, modele: "c/z" })]));
    expect(x).toEqual({
      kind: "echec",
      id: "x-1",
      creeLe: expect.stringMatching(/^2026-10-10T/),
      modele: "c/z",
      lancementId: "lancement-1",
      code: "incertain",
      message: "Délai dépassé.",
      cout: { usd: 0.02, nature: "reel" },
      coutReelUsd: 0.02,
      dureeMs: 280_000,
    });
  });

  it("gives a failure without a known cost an unknown cost, not zero", () => {
    const [x] = echecs(construireHistorique([], [echec({ coutReelUsd: null })]));
    expect(x.cout).toEqual({ usd: null, nature: "inconnu" });
  });

  it("formats dates as ISO strings, from a Date or a string", () => {
    const h = construireHistorique([essai({ createdAt: "2026-10-10T08:00:00+02:00" }), essai({ createdAt: new Date("2026-10-10T09:00:00Z") })]);
    expect(h.map((t) => t.creeLe)).toEqual(["2026-10-10T06:00:00.000Z", "2026-10-10T09:00:00.000Z"]);
  });

  it("encodes the essay id in the image URL", () => {
    const [h] = essais(construireHistorique([essai({ id: "a b/c" })]));
    expect(h.image).toBe("/api/studio/image?essai=a%20b%2Fc");
  });

  describe("what can still be done with an essay", () => {
    it("offers to cancel a decision and to retain a rejected version when the case is free", () => {
      const [valide, rejete] = essais(construireHistorique([essai({ decision: "valide" }), essai({ decision: "rejete" })]));
      // validé + rejeté dans la même case : annuler le rejet reprend la case, tenue par le validé
      expect(valide.peutAnnuler).toEqual({ possible: true });
      expect(valide.peutValider).toMatchObject({ possible: false, code: "deja_validee" });
      expect(rejete.peutAnnuler).toMatchObject({ possible: false, code: "case_reprise" });
      expect(rejete.peutValider).toMatchObject({ possible: false, code: "deja_validee" });
    });

    it("can bring a rejected version back when every other attempt is rejected too", () => {
      const [a, b] = essais(construireHistorique([essai({ decision: "rejete" }), essai({ decision: "rejete" })]));
      expect(a.peutAnnuler).toEqual({ possible: true });
      expect(a.peutValider).toEqual({ possible: true });
      expect(b.peutAnnuler).toEqual({ possible: true });
    });

    it("says an essay with no decision has nothing to cancel, but can be validated", () => {
      const [h] = essais(construireHistorique([essai({ decision: null })]));
      expect(h.peutAnnuler).toMatchObject({ possible: false, code: "rien_a_annuler" });
      expect(h.peutValider).toEqual({ possible: true });
    });

    it("says why a purged rejection cannot be undone or retained", () => {
      const [h] = essais(construireHistorique([essai({ decision: "rejete", urlImage: "" })]));
      expect(h.peutAnnuler).toMatchObject({ possible: false, code: "image_purgee" });
      expect(h.peutValider).toMatchObject({ possible: false, code: "image_purgee" });
    });

    it("compares each essay with the OTHER essays of the case only", () => {
      // comparaison de trois modèles, tous à juger : chacun peut être validé (un seul le sera)
      const h = essais(construireHistorique([essai({ modele: "a/x" }), essai({ modele: "b/y" }), essai({ modele: "c/z" })]));
      expect(h.map((t) => t.peutValider)).toEqual([{ possible: true }, { possible: true }, { possible: true }]);
    });
  });
});
