import { describe, expect, it } from "vitest";

import type { ArticleDTO } from "@/lib/types";
import { ficheVide, type ArticleEnCours } from "./_reducer";
import {
  aUnTexte,
  choixInitial,
  descriptionComplete,
  faudraitGenerer,
  libelleVersion,
  lireMemoire,
  lireReponseStudio,
  memoireApresChoix,
  STUDIO_VIDE,
  texteSansIA,
  versionChoisie,
  versionsChoisissables,
  type StudioDuSac,
  type VersionMev,
} from "./_versionChoix";

const article = (extra: Partial<ArticleDTO> = {}): ArticleDTO =>
  ({ id: "a1", sku: "SDN3", titreAnnonce: null, descriptionAnnonce: null, motsClesAnnonce: null, ...extra }) as ArticleDTO;

const v2: VersionMev = {
  numero: 2,
  titre: "Sac à dos Nike Elite - Version 2",
  description: "- Tiret A\n- Tiret B",
  motsCles: "sac, nike",
  skuAnnonce: "SDN3-B",
  photos: [
    { type: "ref", id: "c1", ordre: 1 },
    { type: "ref", id: "c2", ordre: 2 },
  ],
};
const v3SansTexte: VersionMev = { numero: 3, titre: "", description: "", motsCles: "", skuAnnonce: null, photos: [{ type: "ref", id: "c3", ordre: 1 }] };

const studio = (versions: VersionMev[]): StudioDuSac => ({ images: [{ type: "essai", id: "e1", ordre: 2 }], versions });

function fiche(extra: Partial<ArticleEnCours> = {}): ArticleEnCours {
  return { ...ficheVide("f1"), article: article(), ...extra };
}

describe("lireReponseStudio (réponse de GET /api/studio/annonce)", () => {
  it("lit les images validées et les versions, numérotées et triées", () => {
    const r = lireReponseStudio({
      sku: "SDN3",
      images: [{ essaiId: "e1", ordre: 2, prise: "Dos" }],
      versions: [
        { numero: 3, titre: "T3", description: "D3", motsCles: "m3", skuAnnonce: null, photos: [{ id: "c9", ordre: 1 }] },
        { numero: 2, titre: "T2", description: "D2", motsCles: "m2", skuAnnonce: " SDN3-B ", photos: [{ id: "c1", ordre: 1 }, { id: "c2", ordre: 2 }] },
      ],
    });
    expect(r.images).toEqual([{ type: "essai", id: "e1", ordre: 2 }]);
    expect(r.versions.map((v) => v.numero)).toEqual([2, 3]);
    expect(r.versions[0]).toMatchObject({ titre: "T2", skuAnnonce: "SDN3-B" });
    expect(r.versions[0].photos).toEqual([
      { type: "ref", id: "c1", ordre: 1 },
      { type: "ref", id: "c2", ordre: 2 },
    ]);
    expect(r.versions[1].skuAnnonce).toBeNull();
  });

  it("une réponse d'avant l'étape 5 (sans `versions`) ne donne que les images : comportement d'avant", () => {
    const r = lireReponseStudio({ sku: "SDN3", images: [{ essaiId: "e1", ordre: 1 }] });
    expect(r.versions).toEqual([]);
    expect(r.images).toHaveLength(1);
  });

  it("écarte tout ce qui est mal formé, sans jamais lever", () => {
    for (const brut of [null, undefined, 3, "x", [], {}]) expect(lireReponseStudio(brut)).toEqual(STUDIO_VIDE);
    const r = lireReponseStudio({
      images: [{ essaiId: 1, ordre: 1 }, null, { essaiId: "ok", ordre: "1" }],
      versions: [null, { numero: 1, titre: "la 1 est virtuelle" }, { numero: "2" }, { numero: 2.5 }, { numero: 4, photos: [{ id: 7 }, null, { id: "c" }] }],
    });
    expect(r.images).toEqual([]);
    expect(r.versions).toHaveLength(1);
    expect(r.versions[0].numero).toBe(4);
    expect(r.versions[0].photos).toEqual([{ type: "ref", id: "c", ordre: 3 }]);
  });
});

describe("le menu « Version »", () => {
  it("n'existe pas pour un sac sans version enregistrée : comportement d'avant", () => {
    expect(versionsChoisissables(fiche())).toEqual([]);
    expect(versionsChoisissables(fiche({ studio: studio([]) }))).toEqual([]);
    expect(versionChoisie(fiche({ studio: studio([]) }))).toBeNull();
    // Sans article résolu, jamais de menu non plus.
    expect(versionsChoisissables({ article: null, studio: studio([v2]) })).toEqual([]);
  });

  it("propose la Version 1 (état actuel de l'Article, images validées) puis les versions enregistrées", () => {
    const f = fiche({
      article: article({ titreAnnonce: "Titre actuel", descriptionAnnonce: "Tirets actuels", motsClesAnnonce: "mots actuels" }),
      studio: studio([v2, v3SansTexte]),
    });
    const liste = versionsChoisissables(f);
    expect(liste.map((v) => v.numero)).toEqual([1, 2, 3]);
    expect(liste[0]).toEqual({
      numero: 1,
      titre: "Titre actuel",
      description: "Tirets actuels",
      motsCles: "mots actuels",
      skuAnnonce: "SDN3",
      photos: [{ type: "essai", id: "e1", ordre: 2 }],
    });
  });

  it("par défaut la Version 1 ; un numéro qui n'existe plus retombe sur la Version 1", () => {
    const f = fiche({ studio: studio([v2]) });
    expect(versionChoisie(f)?.numero).toBe(1);
    expect(versionChoisie({ ...f, version: 2 })?.numero).toBe(2);
    expect(versionChoisie({ ...f, version: 9 })?.numero).toBe(1);
  });

  it("choixInitial : le choix mémorisé s'il existe encore, sinon la Version 1", () => {
    expect(choixInitial([{ numero: 2 }, { numero: 3 }], null)).toBe(1);
    expect(choixInitial([{ numero: 2 }, { numero: 3 }], 3)).toBe(3);
    expect(choixInitial([{ numero: 2 }], 3)).toBe(1);
    expect(choixInitial([], 2)).toBe(1);
  });

  it("libellés", () => {
    expect(libelleVersion(1)).toBe("Version 1 (actuelle)");
    expect(libelleVersion(2)).toBe("Version 2");
  });
});

describe("RÈGLE : l'IA ne génère le texte que si la version choisie n'en a pas", () => {
  it("sac sans menu : l'IA rédige (comportement d'avant), même si l'Article a déjà une annonce", () => {
    const f = fiche({ article: article({ titreAnnonce: "Annonce déjà là" }) });
    expect(texteSansIA(f)).toBeNull();
    expect(faudraitGenerer(f)).toBe(true);
  });

  it("version 2 avec texte : ce texte est repris tel quel, avec son SKU, sans IA", () => {
    const f = fiche({ studio: studio([v2]), version: 2 });
    expect(faudraitGenerer(f)).toBe(false);
    expect(texteSansIA(f)).toEqual({
      numero: 2,
      titre: "Sac à dos Nike Elite - Version 2",
      description: "- Tiret A\n- Tiret B",
      motsCles: "sac, nike",
      skuAnnonce: "SDN3-B",
    });
  });

  it("version sans SKU d'annonce : le SKU du sac", () => {
    const sansSku = { ...v2, skuAnnonce: null };
    expect(texteSansIA(fiche({ studio: studio([sansSku]), version: 2 }))?.skuAnnonce).toBe("SDN3");
  });

  it("version sans aucun texte : l'IA rédige", () => {
    const f = fiche({ studio: studio([v2, v3SansTexte]), version: 3 });
    expect(texteSansIA(f)).toBeNull();
    expect(faudraitGenerer(f)).toBe(true);
  });

  it("une version qui n'a qu'un titre, ou que des mots-clés, a un texte : jamais réécrite", () => {
    for (const partiel of [{ titre: "Juste un titre" }, { motsCles: "juste, des, mots" }, { description: "- juste des tirets" }]) {
      const v = { ...v3SansTexte, ...partiel };
      expect(aUnTexte(v)).toBe(true);
      expect(faudraitGenerer(fiche({ studio: studio([v]), version: 3 }))).toBe(false);
    }
    expect(aUnTexte({ titre: "  ", description: "\n", motsCles: "" })).toBe(false);
  });

  it("Version 1 choisie avec un menu : si l'Article a un texte il n'est pas réécrit, sinon l'IA rédige", () => {
    const avec = fiche({ article: article({ titreAnnonce: "Titre actuel" }), studio: studio([v2]), version: 1 });
    expect(texteSansIA(avec)).toMatchObject({ numero: 1, titre: "Titre actuel", skuAnnonce: "SDN3" });
    const sans = fiche({ studio: studio([v2]), version: 1 });
    expect(faudraitGenerer(sans)).toBe(true);
  });
});

describe("format de la copie « Description + mots-clés »", () => {
  it("description, ligne vide, mots-clés, ligne vide, SKU (inchangé)", () => {
    expect(descriptionComplete({ description: "- A\n- B", motsCles: "m1, m2" }, "SDN3-B")).toBe("- A\n- B\n\nm1, m2\n\nSDN3-B");
  });
});

describe("mémoire du choix, par SKU (localStorage, sans migration)", () => {
  it("lit une table sku → numéro, ignore le reste", () => {
    expect(lireMemoire(null)).toEqual({});
    expect(lireMemoire("pas du json")).toEqual({});
    expect(lireMemoire("[1,2]")).toEqual({});
    expect(lireMemoire(JSON.stringify({ SDN3: 2, SDN4: "x", SDN5: 0, SDN6: 1.5 }))).toEqual({ SDN3: 2 });
  });

  it("retient un choix, l'efface au retour sur la Version 1 (le défaut)", () => {
    const a = memoireApresChoix({}, "sdn3", 2);
    expect(a).toEqual({ SDN3: 2 });
    expect(memoireApresChoix(a, "SDN4", 3)).toEqual({ SDN3: 2, SDN4: 3 });
    expect(memoireApresChoix(a, "SDN3", 1)).toEqual({});
  });
});
