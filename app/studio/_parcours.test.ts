import { describe, expect, it } from "vitest";

import {
  actionCarte,
  deplacer,
  ecrireFiltres,
  libelleStock,
  lireFiltres,
  messageSurplus,
  prochaineAction,
  regrouperParAction,
  repartirDepot,
  type EtatFiche,
} from "./_parcours";

const carte = (x: Partial<Parameters<typeof actionCarte>[0]> = {}) => ({
  chezMoi: 1,
  prises: 9,
  libres: 20,
  cases: 36,
  aJuger: 0,
  prochain: "SDN3",
  ...x,
});

describe("libelleStock", () => {
  const stock = (x: Partial<Parameters<typeof libelleStock>[0]> = {}) => ({ chezMoi: 0, vendus: 0, nbSacs: 0, photos: 0, ...x });

  it("says « jamais acheté » only when SacBase knows no bag and no photo was imported", () => {
    expect(libelleStock(stock())).toBe("jamais acheté");
  });

  it("imported photos prove a purchase, even when SacBase lists no bag", () => {
    expect(libelleStock(stock({ photos: 4 }))).toBe("acheté · photos importées");
  });

  it("a bag for sale or in transit (not at home, not sold) is never « jamais acheté »", () => {
    expect(libelleStock(stock({ nbSacs: 1 }))).toBe("1 en vente ou en route");
    expect(libelleStock(stock({ nbSacs: 3, chezMoi: 1, vendus: 1 }))).toBe("1 chez toi · 1 en vente ou en route · vendu ×1");
  });

  it("keeps the old wording for bags at home and sold, and for a colourway outside the catalogue", () => {
    expect(libelleStock(stock({ nbSacs: 2, chezMoi: 2 }))).toBe("2 chez toi");
    expect(libelleStock(stock({ nbSacs: 1, vendus: 1 }))).toBe("vendu ×1");
    expect(libelleStock({ chezMoi: null, vendus: null, nbSacs: null, photos: 2 })).toBe("hors catalogue SacBase");
  });
});

describe("actionCarte", () => {
  it("judging comes first: money is already spent", () => {
    expect(actionCarte(carte({ aJuger: 3 }))).toMatchObject({ genre: "juger", phrase: "Juger 3 images" });
    expect(actionCarte(carte({ aJuger: 1 })).phrase).toBe("Juger 1 image");
  });

  it("a bag at home without any photo is to photograph", () => {
    expect(actionCarte(carte({ prises: 0, chezMoi: 2 }))).toMatchObject({ genre: "photographier", phrase: "Photographier le sac" });
  });

  it("photos kept outside the board are named on a bag still to photograph", () => {
    expect(actionCarte(carte({ prises: 0, chezMoi: 1, photos: 3 })).detail).toBe("0 / 15 prises · 1 chez toi · 3 photos gardées hors tableau");
    expect(actionCarte(carte({ prises: 0, chezMoi: 1 })).detail).toBe("0 / 15 prises · 1 chez toi");
  });

  it("photos and a target bag: generate for it", () => {
    expect(actionCarte(carte())).toMatchObject({ genre: "generer", phrase: "Générer pour SDN3" });
  });

  it("nothing to prepare: never bought, every bag listed, or no free cell", () => {
    expect(actionCarte(carte({ prises: 0, chezMoi: 0, prochain: null })).genre).toBe("rien");
    expect(actionCarte(carte({ prochain: null })).phrase).toBe("Rien à préparer");
    expect(actionCarte(carte({ libres: 0 })).phrase).toBe("Plus de variante libre");
  });

  it("groups keep the work order and drop empty groups", () => {
    const g = regrouperParAction([carte({ prochain: null }), carte({ aJuger: 2 }), carte()]);
    expect(g.map((x) => x.genre)).toEqual(["juger", "generer", "rien"]);
  });
});

describe("catalogue filters in the URL", () => {
  it("round-trips, and ignores unknown values", () => {
    const f = lireFiltres(new URLSearchParams("generation=V2&filtre=a_juger&q=pink"));
    expect(f).toEqual({ generation: "V2", filtre: "a_juger", q: "pink" });
    expect(ecrireFiltres(f)).toBe("generation=V2&filtre=a_juger&q=pink");
    expect(lireFiltres(new URLSearchParams("generation=V9&filtre=tout"))).toEqual({ generation: null, filtre: null, q: "" });
    expect(ecrireFiltres({ generation: null, filtre: null, q: "  " })).toBe("");
    expect(lireFiltres(new URLSearchParams("filtre=photographies")).filtre).toBe("photographies");
    expect(lireFiltres(new URLSearchParams("filtre=jamais_photographies")).filtre).toBe("jamais_photographies");
  });
});

describe("prochaineAction", () => {
  const base: EtatFiche = { photos: 9, angles: 4, aJuger: 0, cible: "SDN3", choisies: 8, sansImage: 8, validees: 1 };

  it("judging first, then photographing, then generating", () => {
    expect(prochaineAction({ ...base, aJuger: 3 })).toMatchObject({ etape: "a-juger", titre: "Juger 3 images" });
    expect(prochaineAction({ ...base, photos: 0 })).toMatchObject({ etape: "photos", titre: "Photographier le sac" });
    expect(prochaineAction(base)).toMatchObject({ etape: "generation", titre: "Générer 8 variantes pour SDN3" });
  });

  it("no angle prompt: points to the Studio settings", () => {
    expect(prochaineAction({ ...base, angles: 0 })).toMatchObject({ etape: "angles", reglages: true });
  });

  it("no target bag: nothing to prepare", () => {
    expect(prochaineAction({ ...base, cible: null })).toMatchObject({ etape: "validees", titre: "Rien à préparer" });
  });

  it("photos without a free cell are named", () => {
    const p = prochaineAction({ ...base, choisies: 0, sansImage: 2 });
    expect(p).toMatchObject({ etape: "angles", titre: "Plus de case libre" });
    expect(p.detail).toContain("2 photos n’ont plus d’angle libre pour SDN3");
  });

  it("everything covered: complete the board, then the bag is ready", () => {
    expect(prochaineAction({ ...base, choisies: 0, sansImage: 0 })).toMatchObject({ etape: "photos", titre: "Compléter la planche" });
    expect(prochaineAction({ ...base, photos: 15, choisies: 0, sansImage: 0, validees: 15 })).toMatchObject({
      etape: "validees",
      titre: "SDN3 est prêt",
    });
  });
});

describe("repartirDepot", () => {
  it("fills the free cells in order and RETURNS the surplus instead of refusing the drop", () => {
    const r = repartirDepot(["a", "b", "c", "d"], [2, 5, 9]);
    expect(r.places).toEqual([
      { fichier: "a", ordre: 2 },
      { fichier: "b", ordre: 5 },
      { fichier: "c", ordre: 9 },
    ]);
    expect(r.surplus).toEqual(["d"]);
  });

  it("dropped on an empty cell, the first file takes it", () => {
    expect(repartirDepot(["a", "b"], [2, 5, 9], 9).places.map((p) => p.ordre)).toEqual([9, 2]);
    // An occupied cell is not a target: back to the normal order.
    expect(repartirDepot(["a"], [2, 5], 7).places[0].ordre).toBe(2);
  });

  it("names the surplus, singular and plural", () => {
    expect(messageSurplus(["IMG_1.jpg"])).toBe(
      "1 photo en trop n’a pas été importée : IMG_1.jpg. Retire ou remplace une photo pour l’ajouter.",
    );
    expect(messageSurplus(["a.jpg", "b.jpg"])).toBe(
      "2 photos en trop n’ont pas été importées : a.jpg, b.jpg. Retire ou remplace une photo pour les ajouter.",
    );
  });
});

describe("deplacer", () => {
  it("swaps with the photo already in the target cell", () => {
    const p = deplacer(
      [
        { id: "x", ordre: 1 },
        { id: "y", ordre: 2 },
      ],
      "x",
      2,
    );
    expect(p).toEqual([
      { id: "x", ordre: 2 },
      { id: "y", ordre: 1 },
    ]);
  });
});
