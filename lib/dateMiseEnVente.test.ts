import { describe, expect, it } from "vitest";
import {
  aujourdhuiParis,
  dateMiseEnVenteAEcrire,
  joursEnVente,
  parseDatePatch,
  whereMiseEnVenteAuto,
} from "./dateMiseEnVente";

// 29/09/2026, 10 h à Paris.
const NOW = new Date("2026-09-29T08:00:00.000Z");
const J = (iso: string) => new Date(iso);

describe("dateMiseEnVenteAEcrire — remplissage automatique", () => {
  it("passage en « En vente » d'un article sans date : la date du jour est posée", () => {
    expect(dateMiseEnVenteAEcrire({ statutAvant: "Photos prêtes", statut: "En vente", dateActuelle: null }, NOW)).toEqual(NOW);
  });

  it("retour en brouillon puis remise en vente : la date d'origine est conservée", () => {
    const origine = J("2026-09-10T09:00:00.000Z");
    // En brouillon : on ne touche à rien (pas d'effacement).
    expect(dateMiseEnVenteAEcrire({ statutAvant: "En vente", statut: "Brouillon", dateActuelle: origine }, NOW)).toBeUndefined();
    // Remise en vente : la première date reste.
    expect(dateMiseEnVenteAEcrire({ statutAvant: "Brouillon", statut: "En vente", dateActuelle: origine }, NOW)).toBeUndefined();
  });

  it("date modifiée à la main : elle est conservée ensuite", () => {
    const manuelle = J("2026-09-01T00:00:00.000Z");
    expect(dateMiseEnVenteAEcrire({ statutAvant: "Brouillon", statut: "En vente", dateActuelle: manuelle }, NOW)).toBeUndefined();
  });

  it("une date saisie dans la même requête l'emporte sur le remplissage", () => {
    const saisie = J("2026-09-05T00:00:00.000Z");
    expect(dateMiseEnVenteAEcrire({ statutAvant: "Brouillon", statut: "En vente", dateActuelle: null, saisie }, NOW)).toEqual(saisie);
    expect(dateMiseEnVenteAEcrire({ statutAvant: "En vente", statut: "En vente", dateActuelle: saisie, saisie: null }, NOW)).toBeNull();
  });

  it("article déjà « En vente » sans date (existant) : aucune date inventée", () => {
    // Une édition de marque sur un article en vente réécrit le même statut :
    // ce n'est pas une mise en vente, on ne rattrape rien.
    expect(dateMiseEnVenteAEcrire({ statutAvant: "En vente", statut: "En vente", dateActuelle: null }, NOW)).toBeUndefined();
  });

  it("aucun autre statut ne pose de date", () => {
    for (const statut of ["Brouillon", "En stock", "Photos prêtes", "En livraison", "À comptabiliser", "Vendu"])
      expect(dateMiseEnVenteAEcrire({ statutAvant: "Brouillon", statut, dateActuelle: null }, NOW)).toBeUndefined();
  });
});

describe("aujourdhuiParis", () => {
  it("jour calendaire à Paris, pas en UTC", () => {
    expect(aujourdhuiParis(J("2026-09-27T21:30:00.000Z"))).toBe("2026-09-27"); // 23 h 30 à Paris
    expect(aujourdhuiParis(J("2026-09-27T22:30:00.000Z"))).toBe("2026-09-28"); // 00 h 30 à Paris
  });
});

describe("joursEnVente", () => {
  it("vendu : différence des deux dates (jours calendaires, Paris)", () => {
    expect(joursEnVente({ dateMiseEnVente: J("2026-09-20T08:00:00Z"), dateVente: J("2026-09-23T20:00:00Z") }, NOW)).toEqual({ jours: 3, vendu: true });
  });
  it("vendu le jour même : 0", () => {
    expect(joursEnVente({ dateMiseEnVente: J("2026-09-20T08:00:00Z"), dateVente: J("2026-09-20T18:00:00Z") }, NOW)).toEqual({ jours: 0, vendu: true });
  });
  it("non vendu : jusqu'à aujourd'hui", () => {
    expect(joursEnVente({ dateMiseEnVente: J("2026-09-24T08:00:00Z"), dateVente: null }, NOW)).toEqual({ jours: 5, vendu: false });
  });
  it("mise en vente à 23 h 30 à Paris compte pour ce jour-là", () => {
    expect(joursEnVente({ dateMiseEnVente: J("2026-09-27T21:30:00Z"), dateVente: null }, NOW)).toEqual({ jours: 2, vendu: false });
  });
  it("date de mise en vente vide : null (affiché « — »)", () => {
    expect(joursEnVente({ dateMiseEnVente: null, dateVente: J("2026-09-23T20:00:00Z") }, NOW)).toBeNull();
  });
  it("accepte les dates ISO du DTO", () => {
    expect(joursEnVente({ dateMiseEnVente: "2026-09-20T08:00:00.000Z", dateVente: "2026-09-23T20:00:00.000Z" }, NOW)).toEqual({ jours: 3, vendu: true });
  });
  it("vente saisie avant la mise en vente : jamais négatif", () => {
    expect(joursEnVente({ dateMiseEnVente: J("2026-09-25T08:00:00Z"), dateVente: J("2026-09-23T08:00:00Z") }, NOW)).toEqual({ jours: 0, vendu: true });
  });
});

describe("parseDatePatch", () => {
  it("absent : aucun changement", () => expect(parseDatePatch(undefined)).toEqual({ ok: true, change: false }));
  it("null ou vide : efface", () => {
    expect(parseDatePatch(null)).toEqual({ ok: true, change: true, value: null });
    expect(parseDatePatch("")).toEqual({ ok: true, change: true, value: null });
  });
  it("AAAA-MM-JJ ou ISO : enregistré", () => {
    expect(parseDatePatch("2026-09-27")).toEqual({ ok: true, change: true, value: J("2026-09-27T00:00:00.000Z") });
    expect(parseDatePatch("2026-09-27T10:00:00.000Z")).toEqual({ ok: true, change: true, value: J("2026-09-27T10:00:00.000Z") });
  });
  it("invalide : refus", () => {
    expect(parseDatePatch("27/09/2026")).toMatchObject({ ok: false });
    expect(parseDatePatch("2026-13-45")).toMatchObject({ ok: false });
    expect(parseDatePatch(42)).toMatchObject({ ok: false });
  });
});

describe("whereMiseEnVenteAuto — écritures groupées (barre d'action, assistant)", () => {
  it("ne vise que les articles sans date qui ne sont pas déjà en vente, dans la cible donnée", () => {
    expect(whereMiseEnVenteAuto({ userId: "u1", id: { in: ["a", "b"] } })).toEqual({
      AND: [{ userId: "u1", id: { in: ["a", "b"] } }, { dateMiseEnVente: null, statut: { not: "En vente" } }],
    });
  });
  it("garde un filtre de statut existant intact (pas d'écrasement de clé)", () => {
    const w = whereMiseEnVenteAuto({ userId: "u1", statut: "Brouillon" });
    expect(w.AND[0]).toEqual({ userId: "u1", statut: "Brouillon" });
  });
});
