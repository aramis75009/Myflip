import { describe, expect, it } from "vitest";
import { ETATS, MATIERES_SUGGESTIONS } from "@/lib/listingOptions";
import {
  COULEURS_VINTED,
  ETAT_VERS_CONDITION_ID,
  MATIERE_VERS_MATERIAL_ID,
  conditionIdDepuisEtat,
  materialIdsDepuisMatieres,
} from "@/lib/vintedReferentiels";

describe("COULEURS_VINTED", () => {
  it("porte les 29 couleurs du relevé Vinted", () => {
    expect(COULEURS_VINTED).toHaveLength(29);
  });

  it("n'a aucun id en double", () => {
    const ids = COULEURS_VINTED.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("donne un hex à toutes les couleurs sauf Multicolore", () => {
    for (const c of COULEURS_VINTED) {
      if (c.libelle === "Multicolore") expect(c.hex).toBe("");
      else expect(c.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("ETAT_VERS_CONDITION_ID", () => {
  it("couvre les cinq états proposés par MyFlip", () => {
    for (const etat of ETATS) {
      expect(ETAT_VERS_CONDITION_ID[etat]).toBeTypeOf("number");
    }
  });

  it("mappe « Très bon état » sur 2", () => {
    expect(conditionIdDepuisEtat("Très bon état")).toBe(2);
  });

  it("renvoie null sur un état inconnu", () => {
    expect(conditionIdDepuisEtat("Comme neuf")).toBeNull();
    expect(conditionIdDepuisEtat("")).toBeNull();
  });
});

describe("MATIERE_VERS_MATERIAL_ID", () => {
  it("couvre les dix suggestions de matière de MyFlip", () => {
    for (const m of MATIERES_SUGGESTIONS) {
      expect(MATIERE_VERS_MATERIAL_ID[m]).toBeTypeOf("number");
    }
  });

  it("traduit Polyester et Nylon", () => {
    expect(materialIdsDepuisMatieres(["Polyester", "Nylon"])).toEqual([45, 52]);
  });

  it("déduplique : Coton et Coton piqué tombent tous deux sur 44", () => {
    expect(materialIdsDepuisMatieres(["Coton", "Coton piqué"])).toEqual([44]);
  });

  it("ignore les matières vides ou inconnues", () => {
    expect(materialIdsDepuisMatieres(["", "Kevlar", "Laine"])).toEqual([46]);
    expect(materialIdsDepuisMatieres([])).toEqual([]);
  });
});
