import { describe, expect, it } from "vitest";

import { construireHistorique, type EssaiHistorique } from "@/lib/studioHistorique";

import { decisionsDeComparaison, freresDeComparaison, libelleDuree, planRetenir, type EssaiCompare } from "./_comparaison";

const essai = (id: string, p: Partial<EssaiCompare> = {}): EssaiCompare => ({
  id,
  referenceId: "ref1",
  angleId: "a1",
  modele: "m1",
  lancementId: "L1",
  essaiParentId: null,
  createdAt: "2026-10-20T10:00:00.000Z",
  ...p,
});

describe("freresDeComparaison", () => {
  const a = essai("a", { modele: "qwen", createdAt: "2026-10-20T10:00:02.000Z" });
  const b = essai("b", { modele: "seedream", createdAt: "2026-10-20T10:00:01.000Z" });
  const c = essai("c", { modele: "pro", createdAt: "2026-10-20T10:00:03.000Z" });

  it("groups the same cell of the same launch across models, in generation order", () => {
    expect(freresDeComparaison(a, [a, b, c]).map((x) => x.id)).toEqual(["b", "a", "c"]);
  });

  it("ignores another cell, another launch and corrections", () => {
    const autreCase = essai("d", { modele: "pro", referenceId: "ref2" });
    const autreLancement = essai("e", { modele: "pro", lancementId: "L2" });
    const correction = essai("f", { modele: "pro", essaiParentId: "a" });
    expect(freresDeComparaison(a, [a, autreCase, autreLancement, correction])).toEqual([]);
  });

  it("is empty for one model only, a manual deposit, or a correction", () => {
    const memeModele = essai("g", { modele: "qwen" });
    expect(freresDeComparaison(a, [a, memeModele])).toEqual([]);
    expect(freresDeComparaison(essai("h", { lancementId: null }), [a, b])).toEqual([]);
    expect(freresDeComparaison(essai("i", { essaiParentId: "x", modele: "pro" }), [a, b])).toEqual([]);
  });

  it("keeps the essai itself even when the list no longer holds it", () => {
    expect(freresDeComparaison(a, [b]).map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("decisionsDeComparaison", () => {
  it("keeps one and rejects the others, or rejects all for « aucune »", () => {
    const freres = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(decisionsDeComparaison(freres, "b")).toEqual([
      { id: "a", decision: "rejete" },
      { id: "b", decision: "valide" },
      { id: "c", decision: "rejete" },
    ]);
    expect(decisionsDeComparaison(freres, null).every((d) => d.decision === "rejete")).toBe(true);
  });
});

const ligne = (id: string, p: Partial<EssaiHistorique> = {}): EssaiHistorique => ({
  id,
  modele: "qwen",
  numero: 1,
  source: "api",
  decision: null,
  coutEstimeUsd: 0.02,
  coutReelUsd: 0.0184,
  dureeMs: 12_000,
  verifIA: null,
  urlImage: `https://blob/generees/u/${id}.png`,
  lancementId: "L1",
  essaiParentId: null,
  skuCible: "SDN1",
  createdAt: "2026-10-20T10:00:00.000Z",
  ...p,
});

describe("planRetenir", () => {
  it("rejects the image holding the cell first, then validates this one", () => {
    const h = construireHistorique([ligne("ancien", { decision: "rejete" }), ligne("actuel", { decision: "valide", createdAt: "2026-10-21T10:00:00.000Z" })]);
    expect(planRetenir(h, "ancien")).toEqual({ ok: true, rejeter: ["actuel"], valider: "ancien" });
  });

  it("rejects every living image (to judge or validated), never the already rejected ones", () => {
    const h = construireHistorique([
      ligne("a", { decision: "rejete" }),
      ligne("b", { decision: null }),
      ligne("c", { decision: "rejete" }),
      ligne("d", { decision: null }),
    ]);
    expect(planRetenir(h, "b")).toEqual({ ok: true, rejeter: ["d"], valider: "b" });
  });

  it("refuses a purged image, an image already kept, and an unknown id", () => {
    const h = construireHistorique([ligne("purge", { decision: "rejete", urlImage: "" }), ligne("garde", { decision: "valide" })]);
    expect(planRetenir(h, "purge")).toEqual({ ok: false, message: "Son image a été effacée : elle ne peut plus être retenue." });
    expect(planRetenir(h, "garde")).toEqual({ ok: false, message: "C’est déjà la version retenue." });
    expect(planRetenir(h, "absent").ok).toBe(false);
  });
});

describe("libelleDuree", () => {
  it("seconds, then minutes, never a made-up duration", () => {
    expect(libelleDuree(null)).toBeNull();
    expect(libelleDuree(-1)).toBeNull();
    expect(libelleDuree(18_400)).toBe("18 s");
    expect(libelleDuree(65_000)).toBe("1 min 05");
  });
});
