import { describe, expect, it } from "vitest";
import {
  COMPTES_VENTE,
  compteAComptabiliser,
  isCompteVente,
  labelCompteVente,
  parseCompteVentePatch,
} from "./comptesVente";

// Les deux comptes Vinted réels d'Aramis. SacBase affiche ces libellés : les
// changer ici les change partout (SellDialog, Stock, fiche, /api/sacbase).
describe("COMPTES_VENTE", () => {
  it("porte les vrais pseudos, dans l'ordre", () => {
    expect(COMPTES_VENTE).toEqual([
      { id: "VINTED_PRO", label: "Fripandtrend" },
      { id: "VINTED_SECOND", label: "Enorab18" },
      { id: "VESTIAIRE_COLLECTIVE", label: "Vestiaire Collective" },
    ]);
  });

  it("isCompteVente n'accepte que les trois valeurs de l'enum", () => {
    expect(isCompteVente("VINTED_SECOND")).toBe(true);
    expect(isCompteVente("vinted_second")).toBe(false);
    expect(isCompteVente("FOO")).toBe(false);
    expect(isCompteVente(null)).toBe(false);
  });

  it("labelCompteVente affiche « — » sans compte", () => {
    expect(labelCompteVente("VINTED_PRO")).toBe("Fripandtrend");
    expect(labelCompteVente(null)).toBe("—");
    expect(labelCompteVente(undefined)).toBe("—");
  });
});

describe("parseCompteVentePatch (PATCH /api/articles/[id])", () => {
  it("champ absent : aucun changement", () => {
    expect(parseCompteVentePatch(undefined)).toEqual({ ok: true, change: false });
  });
  it("valeur de l'enum : enregistrée", () => {
    expect(parseCompteVentePatch("VINTED_SECOND")).toEqual({ ok: true, change: true, value: "VINTED_SECOND" });
  });
  it("null : efface le compte", () => {
    expect(parseCompteVentePatch(null)).toEqual({ ok: true, change: true, value: null });
  });
  it("toute autre valeur : refus", () => {
    expect(parseCompteVentePatch("FOO")).toMatchObject({ ok: false });
    expect(parseCompteVentePatch("")).toMatchObject({ ok: false });
    expect(parseCompteVentePatch(3)).toMatchObject({ ok: false });
  });
});

describe("compteAComptabiliser (validation comptable)", () => {
  it("un compte valide dans le corps l'emporte", () => {
    expect(compteAComptabiliser("VESTIAIRE_COLLECTIVE", "VINTED_SECOND")).toBe("VESTIAIRE_COLLECTIVE");
  });
  it("corps sans compte : garde le compte déjà enregistré", () => {
    expect(compteAComptabiliser(undefined, "VINTED_SECOND")).toBe("VINTED_SECOND");
    expect(compteAComptabiliser("FOO", "VINTED_SECOND")).toBe("VINTED_SECOND");
  });
  it("ni corps ni compte enregistré : VINTED_PRO (comportement historique)", () => {
    expect(compteAComptabiliser(undefined, null)).toBe("VINTED_PRO");
  });
});
