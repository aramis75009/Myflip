import { describe, expect, it } from "vitest";
import {
  DELAI_PAR_DEFAUT,
  delaiDepuisSaisie,
  normaliserDelai,
} from "./_delaiVinted";

describe("DELAI_PAR_DEFAUT", () => {
  it("est la fourchette 2 à 5 minutes décidée le 08/09", () => {
    expect(DELAI_PAR_DEFAUT).toEqual({ minMinutes: 2, maxMinutes: 5 });
  });
});

describe("normaliserDelai", () => {
  it("accepte une fourchette d'entiers", () => {
    expect(normaliserDelai({ minMinutes: 2, maxMinutes: 5 })).toEqual({
      minMinutes: 2,
      maxMinutes: 5,
    });
  });

  it("accepte un délai fixe, min = max", () => {
    expect(normaliserDelai({ minMinutes: 3, maxMinutes: 3 })).toEqual({
      minMinutes: 3,
      maxMinutes: 3,
    });
  });

  it("accepte zéro : « pas de délai » est un choix explicite", () => {
    expect(normaliserDelai({ minMinutes: 0, maxMinutes: 0 })).toEqual({
      minMinutes: 0,
      maxMinutes: 0,
    });
  });

  it("refuse une fourchette à l'envers", () => {
    expect(normaliserDelai({ minMinutes: 6, maxMinutes: 2 })).toBeNull();
  });

  it("refuse les non-entiers et les négatifs", () => {
    expect(normaliserDelai({ minMinutes: 1.5, maxMinutes: 5 })).toBeNull();
    expect(normaliserDelai({ minMinutes: -1, maxMinutes: 5 })).toBeNull();
  });

  it("refuse tout ce qui n'a pas la forme attendue", () => {
    expect(normaliserDelai(null)).toBeNull();
    expect(normaliserDelai(undefined)).toBeNull();
    expect(normaliserDelai("2-5")).toBeNull();
    expect(normaliserDelai({ minMinutes: 2 })).toBeNull();
    expect(normaliserDelai({ minMinutes: "2", maxMinutes: "5" })).toBeNull();
  });
});

describe("delaiDepuisSaisie — fourchette", () => {
  it("rend la fourchette saisie", () => {
    expect(delaiDepuisSaisie("fourchette", "2", "5")).toEqual({
      ok: true,
      delai: { minMinutes: 2, maxMinutes: 5 },
    });
  });

  it("accepte min = max", () => {
    expect(delaiDepuisSaisie("fourchette", "4", "4")).toEqual({
      ok: true,
      delai: { minMinutes: 4, maxMinutes: 4 },
    });
  });

  it("refuse une fourchette à l'envers, et le dit", () => {
    const r = delaiDepuisSaisie("fourchette", "9", "3");
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("erreur");
  });

  it("refuse un champ vide", () => {
    expect(delaiDepuisSaisie("fourchette", "", "5").ok).toBe(false);
    expect(delaiDepuisSaisie("fourchette", "2", "").ok).toBe(false);
  });

  it("refuse les décimales : minutes entières", () => {
    expect(delaiDepuisSaisie("fourchette", "2,5", "5").ok).toBe(false);
    expect(delaiDepuisSaisie("fourchette", "2.5", "5").ok).toBe(false);
  });
});

describe("delaiDepuisSaisie — fixe", () => {
  it("rend min = max, et ignore le second champ", () => {
    expect(delaiDepuisSaisie("fixe", "3", "99")).toEqual({
      ok: true,
      delai: { minMinutes: 3, maxMinutes: 3 },
    });
  });

  it("refuse un champ vide", () => {
    expect(delaiDepuisSaisie("fixe", "", "").ok).toBe(false);
  });

  it("refuse un négatif", () => {
    expect(delaiDepuisSaisie("fixe", "-2", "").ok).toBe(false);
  });
});
