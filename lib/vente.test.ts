import { describe, expect, it } from "vitest";

import { compteVisible, validerPrix, valeursInitiales, type ArticleVendable } from "./vente";

const MESSAGE = "Indique un prix de vente supérieur à 0 €";

const article = (x: Partial<ArticleVendable> = {}): ArticleVendable => ({
  id: "a1",
  sku: "PIS7",
  prixVente: null,
  dateVente: null,
  canal: null,
  compteVente: null,
  ...x,
});

describe("validerPrix", () => {
  it("refuses an empty, zero or negative price with the exact message", () => {
    for (const saisie of ["", "0", "-3", "  ", "abc"]) {
      expect(validerPrix(saisie)).toEqual({ ok: false, message: MESSAGE });
    }
  });

  it("accepts a positive price", () => {
    expect(validerPrix("18.5")).toEqual({ ok: true, prix: 18.5 });
    expect(validerPrix("18,5")).toEqual({ ok: true, prix: 18.5 });
    expect(validerPrix("0.01")).toEqual({ ok: true, prix: 0.01 });
  });
});

describe("compteVisible", () => {
  it("shows the account only for Vinted, Vinted Go and Vestiaire Collective", () => {
    expect(compteVisible("Vinted")).toBe(true);
    expect(compteVisible("Vinted Go")).toBe(true);
    expect(compteVisible("Vestiaire Collective")).toBe(true);
    expect(compteVisible("Leboncoin")).toBe(false);
    expect(compteVisible("En main propre")).toBe(false);
    expect(compteVisible("Autre")).toBe(false);
  });
});

describe("valeursInitiales", () => {
  it("prefills the known sale date, otherwise today", () => {
    expect(valeursInitiales(article({ dateVente: "2026-10-03T00:00:00.000Z" }), "stock", "2026-10-21").date).toBe(
      "2026-10-03",
    );
    expect(valeursInitiales(article(), "stock", "2026-10-21").date).toBe("2026-10-21");
  });

  it("keeps the chosen account; default account only when accounting", () => {
    expect(valeursInitiales(article(), "comptabiliser", "2026-10-21").compte).toBe("VINTED_PRO");
    expect(valeursInitiales(article(), "stock", "2026-10-21").compte).toBeNull();
    expect(valeursInitiales(article({ compteVente: "VINTED_SECOND" }), "stock", "2026-10-21").compte).toBe(
      "VINTED_SECOND",
    );
    expect(valeursInitiales(article({ compteVente: "VINTED_SECOND" }), "comptabiliser", "2026-10-21").compte).toBe(
      "VINTED_SECOND",
    );
  });

  it("prefills price and channel, Vinted by default", () => {
    expect(valeursInitiales(article({ prixVente: 18, canal: "Leboncoin" }), "comptabiliser", "2026-10-21")).toMatchObject({
      prix: "18",
      canal: "Leboncoin",
    });
    expect(valeursInitiales(article(), "stock", "2026-10-21")).toMatchObject({ prix: "", canal: "Vinted" });
  });
});
