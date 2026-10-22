import { describe, expect, it } from "vitest";

import {
  peutAnnulerDecision,
  peutValiderEssai,
  verifierChangementDecision,
  type EssaiADecider,
  type EssaiDeLaCase,
} from "./studioDecision";

const essai = (decision: string | null, purge = false): EssaiADecider => ({ id: "e1", decision, purge });
const autre = (id: string, decision: string | null): EssaiDeLaCase => ({ id, decision });

describe("verifierChangementDecision", () => {
  describe("annuler (repasser à « à juger »)", () => {
    it("cancels a validation when nothing else holds the case", () => {
      expect(verifierChangementDecision(essai("valide"), null, [])).toEqual({ ok: true, inchange: false });
    });

    it("cancels a rejection whose image is still there and whose case is free", () => {
      expect(verifierChangementDecision(essai("rejete"), null, [])).toEqual({ ok: true, inchange: false });
      // les autres essais de la case sont tous rejetés : la case est libre
      expect(verifierChangementDecision(essai("rejete"), null, [autre("e2", "rejete"), autre("e3", "rejete")])).toEqual({ ok: true, inchange: false });
    });

    it("says WHY a rejection whose image was purged from the Blob cannot be undone", () => {
      const v = verifierChangementDecision(essai("rejete", true), null, []);
      expect(v).toMatchObject({ ok: false, status: 409, code: "image_purgee", autresEssaiIds: [] });
      expect(!v.ok && v.message).toMatch(/effacée/);
    });

    it("refuses to bring a rejected essay back when another image took the case, naming it", () => {
      const v = verifierChangementDecision(essai("rejete"), null, [autre("e2", null), autre("e3", "rejete")]);
      expect(v).toMatchObject({ ok: false, status: 409, code: "case_reprise", autresEssaiIds: ["e2"] });
      const validee = verifierChangementDecision(essai("rejete"), null, [autre("e2", "valide")]);
      expect(validee).toMatchObject({ ok: false, code: "case_reprise", autresEssaiIds: ["e2"] });
    });

    it("lists every essay that holds the case", () => {
      const v = verifierChangementDecision(essai("rejete"), null, [autre("e2", null), autre("e3", "valide"), autre("e4", "rejete")]);
      expect(!v.ok && v.autresEssaiIds).toEqual(["e2", "e3"]);
    });

    it("lets a validated essay go back to « à juger » even when other candidates are still being judged", () => {
      // une comparaison : A validé, B et C encore à juger — annuler A ne reprend aucune case
      expect(verifierChangementDecision(essai("valide"), null, [autre("e2", null), autre("e3", null)])).toEqual({ ok: true, inchange: false });
    });

    it("is idempotent: cancelling an essay that is already « à juger » changes nothing", () => {
      expect(verifierChangementDecision(essai(null), null, [])).toEqual({ ok: true, inchange: true });
    });
  });

  describe("valider", () => {
    it("validates an essay « à juger » — with other candidates still being judged (comparison: one wins or none)", () => {
      expect(verifierChangementDecision(essai(null), "valide", [autre("e2", null), autre("e3", "rejete")])).toEqual({ ok: true, inchange: false });
    });

    it("refuses a second validated image in the same case, naming the first", () => {
      const v = verifierChangementDecision(essai(null), "valide", [autre("e2", "valide")]);
      expect(v).toMatchObject({ ok: false, status: 409, code: "deja_validee", autresEssaiIds: ["e2"] });
      expect(!v.ok && v.message).toMatch(/annule sa validation/);
    });

    it("refuses to validate a rejected essay while another image holds the case", () => {
      expect(verifierChangementDecision(essai("rejete"), "valide", [autre("e2", null)])).toMatchObject({ ok: false, code: "case_reprise", autresEssaiIds: ["e2"] });
    });

    it("names the validated image first when a rejected essay would clash with both", () => {
      expect(verifierChangementDecision(essai("rejete"), "valide", [autre("e2", "valide")])).toMatchObject({ ok: false, code: "deja_validee" });
    });

    it("validates a rejected essay (« retenir cette version ») when its image is there and the case is free", () => {
      expect(verifierChangementDecision(essai("rejete"), "valide", [autre("e2", "rejete")])).toEqual({ ok: true, inchange: false });
    });

    it("cannot validate a purged essay", () => {
      expect(verifierChangementDecision(essai("rejete", true), "valide", [])).toMatchObject({ ok: false, code: "image_purgee" });
    });

    it("is idempotent: validating an essay that is already validated changes nothing", () => {
      expect(verifierChangementDecision(essai("valide"), "valide", [autre("e2", "valide")])).toEqual({ ok: true, inchange: true });
    });
  });

  describe("rejeter", () => {
    it("rejects a validated or pending essay, whatever the others", () => {
      expect(verifierChangementDecision(essai("valide"), "rejete", [autre("e2", null)])).toEqual({ ok: true, inchange: false });
      expect(verifierChangementDecision(essai(null), "rejete", [autre("e2", "valide")])).toEqual({ ok: true, inchange: false });
    });

    it("keeps a purged rejection a rejection: asking again changes nothing and is not an error", () => {
      expect(verifierChangementDecision(essai("rejete", true), "rejete", [])).toEqual({ ok: true, inchange: true });
    });
  });
});

describe("peutAnnulerDecision", () => {
  it("has nothing to cancel on an essay without a decision", () => {
    expect(peutAnnulerDecision(essai(null), [])).toEqual({ possible: false, code: "rien_a_annuler", message: "Cet essai n'a pas encore de décision." });
  });

  it("is possible on a validated essay and on a rejected one with a free case", () => {
    expect(peutAnnulerDecision(essai("valide"), [])).toEqual({ possible: true });
    expect(peutAnnulerDecision(essai("rejete"), [autre("e2", "rejete")])).toEqual({ possible: true });
  });

  it("gives the reason when it is not possible", () => {
    expect(peutAnnulerDecision(essai("rejete", true), [])).toMatchObject({ possible: false, code: "image_purgee" });
    expect(peutAnnulerDecision(essai("rejete"), [autre("e2", null)])).toMatchObject({ possible: false, code: "case_reprise" });
  });
});

describe("peutValiderEssai", () => {
  it("is possible on a pending essay", () => {
    expect(peutValiderEssai(essai(null), [])).toEqual({ possible: true });
  });

  it("is not on an essay that is already validated", () => {
    expect(peutValiderEssai(essai("valide"), [])).toMatchObject({ possible: false, code: "deja_validee" });
  });

  it("gives the reason when another image is validated, or the image was purged", () => {
    expect(peutValiderEssai(essai(null), [autre("e2", "valide")])).toMatchObject({ possible: false, code: "deja_validee" });
    expect(peutValiderEssai(essai("rejete", true), [])).toMatchObject({ possible: false, code: "image_purgee" });
  });
});
