import { describe, expect, it } from "vitest";

import { fusionnerAliasCatalogue } from "./studioAlias";
import {
  ETATS_SAC,
  LIBELLES_ETAT,
  compterEtats,
  estEtatSac,
  etatSac,
  grouperParCommande,
  resumeEtats,
  sacsChezToi,
  type CarteDuSac,
  type EtatSac,
  type SacChezToi,
} from "./studioChezToi";
import { parseColorisCatalogue, type SacbaseCatalogue } from "./studioColoris";

// ── Fixtures ────────────────────────────────────────────────────────────────

type Sac = { sku: string; statut: string; vendu: boolean; commande?: number | null };
const sac = (sku: string, statut = "En stock", commande: number | null | undefined = undefined, vendu = false): Sac => ({ sku, statut, vendu, commande });

const coloris = (cle: string, nom: string, generation: string | null, sacs: Sac[], image = `/img/${cle}.jpg`) => ({
  cle,
  modele: cle.split("-")[0],
  coloris: nom,
  image,
  sacs,
  chezMoi: sacs.filter((s) => !s.vendu && ["En stock", "Photos prêtes"].includes(s.statut)).length,
  generation,
});

const cartesDe = (cat: SacbaseCatalogue, photos: Record<string, number>): CarteDuSac[] =>
  cat.coloris.map((c) => ({
    cle: c.cle,
    modele: c.modele,
    coloris: c.coloris,
    generation: c.generation,
    vignette: c.image ? `/api/studio/vignette?cle=${encodeURIComponent(c.cle)}` : null,
    photos: photos[c.cle] ?? 0,
  }));

const aucunStatut = () => null;

/** Un sac déjà calculé, pour tester le regroupement seul. */
const s = (sku: string, commande: number | null, etat: EtatSac): SacChezToi => ({
  sku,
  cle: "5039-black-pink",
  modele: "5039",
  coloris: "Black Pink",
  generation: "V1",
  vignette: null,
  commande,
  etat,
});

// ── L'état d'un sac ─────────────────────────────────────────────────────────

describe("etatSac", () => {
  it("à prendre en photo : le coloris n'a aucune vraie photo et le SKU aucune image validée", () => {
    expect(etatSac(0, false)).toBe("a_photographier");
  });

  it("à générer : le coloris a des vraies photos, mais le SKU n'a aucune image validée", () => {
    expect(etatSac(1, false)).toBe("a_generer");
    expect(etatSac(15, false)).toBe("a_generer");
  });

  it("prêt : au moins une image validée pour ce SKU, quelles que soient les photos de la carte", () => {
    expect(etatSac(15, true)).toBe("pret");
    expect(etatSac(3, true)).toBe("pret");
    // Un SKU qui a changé de coloris garde ses images validées : l'annonce les reçoit, il est prêt.
    expect(etatSac(0, true)).toBe("pret");
  });

  it("trois états, dans l'ordre du travail, chacun avec son mot", () => {
    expect([...ETATS_SAC]).toEqual(["a_photographier", "a_generer", "pret"]);
    expect(LIBELLES_ETAT).toEqual({ a_photographier: "À prendre en photo", a_generer: "À générer", pret: "Prêt" });
    expect(estEtatSac("pret")).toBe(true);
    expect(estEtatSac("PRET")).toBe(false);
    expect(estEtatSac(null)).toBe(false);
  });
});

// ── Les sacs chez toi ───────────────────────────────────────────────────────

describe("sacsChezToi", () => {
  const cat: SacbaseCatalogue = {
    genere: "2026-11-10T09:00:00.000Z",
    ecartes: [],
    coloris: [
      coloris("5039-black-pink", "Black Pink", "V3", [
        sac("SDN1", "Vendu", 2, true),
        sac("SDN2", "En vente", 2),
        sac("SDN3", "Photos prêtes", 2),
        sac("SDN4", "En stock", 2),
        sac("SDN5", "En livraison", 2),
      ]),
      coloris("5040-red", "Red", "V1", [sac("SDN6", "En stock", 3), sac("SDN7", "?", 3)]),
      coloris("5041-sky", "Sky Blue", null, [sac("SDN8", "En stock", 3)], ""),
    ],
  };
  // SDN7 : SacBase en retard, MyFlip le sait déjà « En vente ».
  const statuts: Record<string, string> = { SDN7: "En vente", SDN3: "En vente" };
  const statutDe = (sku: string) => statuts[sku] ?? null;

  it("ne garde que les sacs chez toi : ni vendu, ni en vente, ni en livraison ; le statut MyFlip l'emporte", () => {
    const sacs = sacsChezToi(cat.coloris, cartesDe(cat, { "5039-black-pink": 15 }), new Set(), statutDe);
    // SDN3 est « En vente » côté MyFlip : plus chez toi, même si SacBase dit « Photos prêtes ».
    expect(sacs.map((x) => x.sku)).toEqual(["SDN4", "SDN6", "SDN8"]);
  });

  it("à prendre en photo / à générer / prêt, d'après les photos du coloris et les images validées du SKU", () => {
    const sacs = sacsChezToi(cat.coloris, cartesDe(cat, { "5039-black-pink": 15 }), new Set(["SDN6"]), statutDe);
    expect(sacs.map((x) => [x.sku, x.etat])).toEqual([
      ["SDN4", "a_generer"], // Black Pink : 15 photos, aucune image validée pour SDN4
      ["SDN6", "pret"], // Red : aucune photo, mais une image validée pour SDN6
      ["SDN8", "a_photographier"], // Sky Blue : aucune photo, aucune image
    ]);
  });

  it("une image validée pour un AUTRE sac du coloris ne rend pas celui-ci prêt", () => {
    const sacs = sacsChezToi(cat.coloris, cartesDe(cat, { "5039-black-pink": 15 }), new Set(["SDN3"]), aucunStatut);
    expect(sacs.find((x) => x.sku === "SDN4")?.etat).toBe("a_generer");
    expect(sacs.find((x) => x.sku === "SDN3")?.etat).toBe("pret");
  });

  it("porte ce qu'il faut à une ligne : fiche, coloris, génération, vignette et Commande", () => {
    const sacs = sacsChezToi(cat.coloris, cartesDe(cat, {}), new Set(), statutDe);
    expect(sacs[0]).toEqual({
      sku: "SDN4",
      cle: "5039-black-pink",
      modele: "5039",
      coloris: "Black Pink",
      generation: "V3",
      vignette: "/api/studio/vignette?cle=5039-black-pink",
      commande: 2,
      etat: "a_photographier",
    });
    // Un coloris sans image n'a pas de vignette ; une Commande absente est null.
    expect(sacs.find((x) => x.sku === "SDN8")).toMatchObject({ vignette: null, generation: null, commande: 3 });
  });

  it("un sac dont le coloris n'a pas de carte est ignoré sans faire d'erreur", () => {
    const sacs = sacsChezToi(cat.coloris, cartesDe(cat, {}).filter((c) => c.cle !== "5040-red"), new Set(), statutDe);
    expect(sacs.map((x) => x.sku)).toEqual(["SDN4", "SDN8"]);
  });

  it("sans catalogue (SacBase injoignable), aucun sac", () => {
    expect(sacsChezToi([], [], new Set(), aucunStatut)).toEqual([]);
  });
});

describe("l'alias Studio : SDN60 apparaît sous Black Gold 5880", () => {
  // Le catalogue tel que SacBase le rend : 5883 porte SDN40 (vendu) et SDN60 (en stock), 5880 n'a aucun sac.
  const brut: SacbaseCatalogue = {
    genere: "2026-11-10T09:00:00.000Z",
    ecartes: [],
    coloris: [
      coloris("5039-black-pink", "Black Pink", "V3", [sac("SDN3", "En stock", 7)]),
      coloris("5883-black-gold", "Black Gold", "V2", [sac("SDN40", "Vendu", 4, true), sac("SDN60", "En stock", 7)], "/img/5880_black_gold.jpg"),
      coloris("5880-black-gold", "Black Gold", null, [], "/img/5880_black_gold.jpg"),
    ],
  };
  const catalogue = fusionnerAliasCatalogue(brut);

  it("le sac sort sous la clé 5880, avec le libellé et le modèle de la carte 5880", () => {
    // Après l'alias, la carte du Studio est celle de 5880 ; ses photos sont celles de 5880 ET de 5883 (regrouperParCleStudio).
    const sacs = sacsChezToi(catalogue.coloris, cartesDe(catalogue, { "5880-black-gold": 15 }), new Set(), aucunStatut);
    const sdn60 = sacs.find((x) => x.sku === "SDN60");
    expect(sdn60).toMatchObject({ cle: "5880-black-gold", coloris: "Black Gold", modele: "5880", generation: "V2", commande: 7, etat: "a_generer" });
    expect(sacs.some((x) => x.cle === "5883-black-gold")).toBe(false);
  });

  it("le sac vendu (SDN40) n'est pas chez toi, la Commande du sac absorbé survit à la fusion", () => {
    const sacs = sacsChezToi(catalogue.coloris, cartesDe(catalogue, {}), new Set(), aucunStatut);
    expect(sacs.map((x) => x.sku).sort()).toEqual(["SDN3", "SDN60"]);
    expect(catalogue.coloris.flatMap((c) => c.sacs).find((x) => x.sku === "SDN40")?.commande).toBe(4);
  });

  it("sans photo sur la carte 5880, SDN60 est « à prendre en photo » ; avec une image validée, « prêt »", () => {
    const cartes = cartesDe(catalogue, {});
    expect(sacsChezToi(catalogue.coloris, cartes, new Set(), aucunStatut).find((x) => x.sku === "SDN60")?.etat).toBe("a_photographier");
    expect(sacsChezToi(catalogue.coloris, cartes, new Set(["SDN60"]), aucunStatut).find((x) => x.sku === "SDN60")?.etat).toBe("pret");
  });
});

// ── Compteurs et résumé ─────────────────────────────────────────────────────

describe("compterEtats", () => {
  it("compte chaque état et le total", () => {
    const sacs = [s("SDN1", 1, "pret"), s("SDN2", 1, "a_generer"), s("SDN3", 1, "a_generer"), s("SDN4", 1, "a_photographier"), s("SDN5", null, "pret")];
    expect(compterEtats(sacs)).toEqual({ a_photographier: 1, a_generer: 2, pret: 2, total: 5 });
  });

  it("les trois états font toujours le total", () => {
    const c = compterEtats([s("SDN1", 1, "pret"), s("SDN2", 2, "a_generer")]);
    expect(c.a_photographier + c.a_generer + c.pret).toBe(c.total);
  });

  it("aucun sac : tout à zéro", () => {
    expect(compterEtats([])).toEqual({ a_photographier: 0, a_generer: 0, pret: 0, total: 0 });
  });
});

describe("resumeEtats (accord et parties nulles)", () => {
  const c = (a_photographier: number, a_generer: number, pret: number) => ({ a_photographier, a_generer, pret, total: a_photographier + a_generer + pret });

  it("la phrase de la maquette", () => {
    expect(resumeEtats(c(4, 5, 1))).toBe("10 sacs chez toi · 4 à prendre en photo, 5 à générer, 1 prêt");
    expect(resumeEtats(c(0, 1, 1))).toBe("2 sacs chez toi · 1 à générer, 1 prêt");
  });

  it("n'affiche que les parties non nulles", () => {
    expect(resumeEtats(c(5, 0, 0))).toBe("5 sacs chez toi · 5 à prendre en photo");
    expect(resumeEtats(c(0, 5, 0))).toBe("5 sacs chez toi · 5 à générer");
    expect(resumeEtats(c(0, 0, 5))).toBe("5 sacs chez toi · 5 prêts");
    expect(resumeEtats(c(2, 0, 3))).toBe("5 sacs chez toi · 2 à prendre en photo, 3 prêts");
  });

  it("accorde au singulier : un sac, un prêt", () => {
    expect(resumeEtats(c(0, 0, 1))).toBe("1 sac chez toi · 1 prêt");
    expect(resumeEtats(c(1, 0, 0))).toBe("1 sac chez toi · 1 à prendre en photo");
    expect(resumeEtats(c(0, 1, 0))).toBe("1 sac chez toi · 1 à générer");
  });

  it("au pluriel dès deux", () => {
    expect(resumeEtats(c(0, 0, 2))).toBe("2 sacs chez toi · 2 prêts");
  });

  it("aucun sac : le total seul, au singulier comme le français", () => {
    expect(resumeEtats(c(0, 0, 0))).toBe("0 sac chez toi");
  });
});

// ── Rangement par Commande ──────────────────────────────────────────────────

describe("grouperParCommande, avec le numéro de Commande", () => {
  // La maquette : Commande 7 (10 sacs), Commande 5 (5 sacs), Commande 2 (2 sacs), dans le désordre.
  const sacs: SacChezToi[] = [
    s("SDN61", 7, "pret"),
    s("SDN52", 7, "a_generer"),
    s("SDN54", 7, "a_photographier"),
    s("SDN37", 5, "a_generer"),
    s("SDN11", 2, "pret"),
    s("SDN53", 7, "a_generer"),
    s("SDN56", 7, "a_photographier"),
    s("SDN34", 5, "pret"),
    s("SDN14", 2, "a_generer"),
    s("SDN9", 7, "a_generer"), // SDN9 avant SDN52 : tri numérique, pas alphabétique
  ];

  it("la Commande la plus récente d'abord, avec son titre", () => {
    const g = grouperParCommande(sacs);
    expect(g.map((x) => [x.id, x.titre, x.commande])).toEqual([
      ["commande-7", "Commande 7", 7],
      ["commande-5", "Commande 5", 5],
      ["commande-2", "Commande 2", 2],
    ]);
  });

  it("compare les numéros comme des nombres (10 avant 9)", () => {
    const g = grouperParCommande([s("SDN1", 9, "pret"), s("SDN2", 10, "pret"), s("SDN3", 100, "pret")]);
    expect(g.map((x) => x.titre)).toEqual(["Commande 100", "Commande 10", "Commande 9"]);
  });

  it("dans chaque Commande : à prendre en photo, puis à générer, puis prêts, chacun par SKU", () => {
    const [c7] = grouperParCommande(sacs);
    expect(c7.sacs.map((x) => [x.sku, x.etat])).toEqual([
      ["SDN54", "a_photographier"],
      ["SDN56", "a_photographier"],
      ["SDN9", "a_generer"],
      ["SDN52", "a_generer"],
      ["SDN53", "a_generer"],
      ["SDN61", "pret"],
    ]);
  });

  it("le résumé de chaque Commande compte tous ses sacs", () => {
    expect(grouperParCommande(sacs).map((x) => x.resume)).toEqual([
      "6 sacs chez toi · 2 à prendre en photo, 3 à générer, 1 prêt",
      "2 sacs chez toi · 1 à générer, 1 prêt",
      "2 sacs chez toi · 1 à générer, 1 prêt",
    ]);
  });

  it("un filtre d'état ne garde que ces sacs, le résumé reste celui de la Commande, un groupe vide disparaît", () => {
    const g = grouperParCommande(sacs, "a_photographier");
    expect(g.map((x) => x.titre)).toEqual(["Commande 7"]);
    expect(g[0].sacs.map((x) => x.sku)).toEqual(["SDN54", "SDN56"]);
    expect(g[0].resume).toBe("6 sacs chez toi · 2 à prendre en photo, 3 à générer, 1 prêt");

    const prets = grouperParCommande(sacs, "pret");
    expect(prets.map((x) => [x.titre, x.sacs.map((y) => y.sku)])).toEqual([
      ["Commande 7", ["SDN61"]],
      ["Commande 5", ["SDN34"]],
      ["Commande 2", ["SDN11"]],
    ]);
  });

  it("chaque sac apparaît une fois sans filtre, et la somme des trois filtres redonne la liste", () => {
    const tous = grouperParCommande(sacs).flatMap((g) => g.sacs.map((x) => x.sku));
    expect(tous).toHaveLength(sacs.length);
    expect(new Set(tous).size).toBe(sacs.length);
    const parEtat = ETATS_SAC.flatMap((e) => grouperParCommande(sacs, e).flatMap((g) => g.sacs.map((x) => x.sku)));
    expect(parEtat.sort()).toEqual([...tous].sort());
  });

  it("ne modifie pas la liste reçue", () => {
    const avant = sacs.map((x) => x.sku);
    grouperParCommande(sacs);
    grouperParCommande(sacs, "pret");
    expect(sacs.map((x) => x.sku)).toEqual(avant);
  });

  it("aucun sac : aucun groupe", () => {
    expect(grouperParCommande([])).toEqual([]);
  });
});

describe("grouperParCommande, sans le numéro de Commande (FLIPO d'avant ce champ)", () => {
  const sacs = [s("SDN12", null, "pret"), s("SDN3", null, "a_photographier"), s("SDN5", null, "a_generer")];

  it("un seul groupe « Chez toi », sans numéro, tous les sacs triés par état", () => {
    const g = grouperParCommande(sacs);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ id: "chez-toi", titre: "Chez toi", commande: null, resume: "3 sacs chez toi · 1 à prendre en photo, 1 à générer, 1 prêt" });
    expect(g[0].sacs.map((x) => x.sku)).toEqual(["SDN3", "SDN5", "SDN12"]);
  });

  it("le filtre d'état marche de même", () => {
    const g = grouperParCommande(sacs, "pret");
    expect(g.map((x) => [x.titre, x.sacs.map((y) => y.sku)])).toEqual([["Chez toi", ["SDN12"]]]);
    expect(grouperParCommande([s("SDN1", null, "a_generer")], "pret")).toEqual([]);
  });

  it("le titre ne porte jamais de numéro", () => {
    expect(grouperParCommande(sacs)[0].titre).not.toMatch(/\d/);
  });
});

describe("grouperParCommande, numéros pour une partie des sacs seulement", () => {
  it("les sacs sans numéro forment un dernier groupe « Commande inconnue »", () => {
    const g = grouperParCommande([s("SDN1", null, "pret"), s("SDN2", 3, "pret"), s("SDN3", 6, "a_generer")]);
    expect(g.map((x) => [x.id, x.titre, x.commande])).toEqual([
      ["commande-6", "Commande 6", 6],
      ["commande-3", "Commande 3", 3],
      ["commande-inconnue", "Commande inconnue", null],
    ]);
  });
});

// ── Les deux cas de bout en bout : réponse FLIPO avec et sans le champ ─────

describe("du catalogue reçu jusqu'aux groupes", () => {
  const corps = (avecCommande: boolean) => ({
    genere: "2026-11-10T09:00:00.000Z",
    ecartes: [],
    coloris: [
      {
        cle: "5039-black-pink",
        modele: "5039",
        coloris: "Black Pink",
        image: "/img/5039.jpg",
        generation: "V3",
        chezMoi: 2,
        sacs: [
          { sku: "SDN3", statut: "En stock", vendu: false, ...(avecCommande ? { commande: 7 } : {}) },
          { sku: "SDN4", statut: "Photos prêtes", vendu: false, ...(avecCommande ? { commande: 5 } : {}) },
        ],
      },
      {
        cle: "5883-black-gold",
        modele: "5883",
        coloris: "Black Gold",
        image: "/img/5880.jpg",
        generation: "V2",
        chezMoi: 1,
        sacs: [
          { sku: "SDN40", statut: "Vendu", vendu: true, ...(avecCommande ? { commande: 4 } : {}) },
          { sku: "SDN60", statut: "En stock", vendu: false, ...(avecCommande ? { commande: 7 } : {}) },
        ],
      },
      { cle: "5880-black-gold", modele: "5880", coloris: "Black Gold", image: "/img/5880.jpg", generation: null, chezMoi: 0, sacs: [] },
    ],
  });
  const groupes = (avecCommande: boolean) => {
    const brut = parseColorisCatalogue(corps(avecCommande));
    expect(brut).not.toBeNull();
    const cat = fusionnerAliasCatalogue(brut!);
    const sacs = sacsChezToi(cat.coloris, cartesDe(cat, { "5039-black-pink": 15, "5880-black-gold": 15 }), new Set(["SDN4"]), aucunStatut);
    return grouperParCommande(sacs);
  };

  it("avec le champ `commande` : un groupe par Commande, SDN60 sous Black Gold 5880 dans la Commande 7", () => {
    const g = groupes(true);
    expect(g.map((x) => [x.titre, x.sacs.map((y) => y.sku)])).toEqual([
      ["Commande 7", ["SDN3", "SDN60"]],
      ["Commande 5", ["SDN4"]],
    ]);
    expect(g[0].sacs.find((x) => x.sku === "SDN60")).toMatchObject({ cle: "5880-black-gold", coloris: "Black Gold", modele: "5880" });
  });

  it("sans le champ `commande` : le catalogue est accepté et les sacs forment un seul groupe « Chez toi »", () => {
    const g = groupes(false);
    expect(g.map((x) => [x.titre, x.commande])).toEqual([["Chez toi", null]]);
    expect(g[0].sacs.map((x) => [x.sku, x.etat])).toEqual([
      ["SDN3", "a_generer"],
      ["SDN60", "a_generer"],
      ["SDN4", "pret"],
    ]);
    expect(g[0].resume).toBe("3 sacs chez toi · 2 à générer, 1 prêt");
  });
});
