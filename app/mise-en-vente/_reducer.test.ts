import { describe, expect, it } from "vitest";
import {
  dejaAnnonces,
  etatInitial,
  ficheVide,
  fichePrete,
  manquePourGenerer,
  MAX_FICHES,
  MAX_SELECT,
  progression,
  reducerMev,
  skuEnDoublon,
  type ArticleEnCours,
  type EtatMev,
} from "./_reducer";
import type { ArticleDTO } from "@/lib/types";

const article = (sku: string, extra: Partial<ArticleDTO> = {}): ArticleDTO =>
  ({
    id: `art_${sku}`,
    sku,
    marque: "Ralph Lauren",
    categorie: "Polo",
    lot: "Polo Ralph Lauren",
    statut: "En stock",
    titreAnnonce: null,
    ...extra,
  }) as ArticleDTO;

const photo = (id: string) =>
  ({ id, base: null, rotation: 0, url: `blob:${id}`, blob: {} as Blob });

/** Raccourci : un état à N fiches nommées f0, f1… */
function etatA(n: number): EtatMev {
  let e = etatInitial("f0");
  for (let i = 1; i < n; i++) e = reducerMev(e, { type: "fiche/ajout", id: `f${i}` });
  return e;
}

describe("cycle de vie des fiches", () => {
  it("démarre à une fiche, active", () => {
    const e = etatInitial("f0");
    expect(e.fiches).toHaveLength(1);
    expect(e.active).toBe("f0");
    expect(e.etape).toBe(1);
  });

  it(`plafonne à ${MAX_FICHES} fiches`, () => {
    let e = etatA(MAX_FICHES);
    expect(e.fiches).toHaveLength(MAX_FICHES);
    e = reducerMev(e, { type: "fiche/ajout", id: "f-trop" });
    expect(e.fiches).toHaveLength(MAX_FICHES);
    expect(e.fiches.some((f) => f.id === "f-trop")).toBe(false);
  });

  it("garde toujours au moins une fiche", () => {
    const e = reducerMev(etatInitial("f0"), { type: "fiche/retrait", id: "f0" });
    expect(e.fiches).toHaveLength(1);
  });

  it("réactive une fiche survivante quand l'active est retirée", () => {
    let e = etatA(3);
    e = reducerMev(e, { type: "fiche/active", id: "f2" });
    e = reducerMev(e, { type: "fiche/retrait", id: "f2" });
    expect(e.active).toBe("f0");
    expect(e.fiches.map((f) => f.id)).toEqual(["f0", "f1"]);
  });
});

describe("garde de course du lookup", () => {
  it("applique une réponse dont le seq est courant", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 1 });
    e = reducerMev(e, { type: "sku/resolu", id: "f0", seq: 1, article: article("PRL1") });
    expect(e.fiches[0].article?.sku).toBe("PRL1");
    expect(e.fiches[0].lookup.phase).toBe("ok");
  });

  it("JETTE une réponse périmée arrivée après une saisie plus récente", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 1 }); // recherche lente
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 2 }); // l'utilisateur retape
    // La réponse de la PREMIÈRE recherche arrive maintenant.
    e = reducerMev(e, { type: "sku/resolu", id: "f0", seq: 1, article: article("VIEUX") });
    expect(e.fiches[0].article).toBeNull();
    expect(e.fiches[0].lookup.phase).toBe("encours");
  });

  it("jette aussi un échec périmé", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 2 });
    e = reducerMev(e, { type: "sku/echec", id: "f0", seq: 1, message: "vieux" });
    expect(e.fiches[0].lookup.phase).toBe("encours");
  });

  it("la garde est PAR FICHE : le seq de f1 n'affecte pas f0", () => {
    let e = etatA(2);
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 1 });
    e = reducerMev(e, { type: "sku/lookup", id: "f1", seq: 1 });
    e = reducerMev(e, { type: "sku/lookup", id: "f1", seq: 2 });
    e = reducerMev(e, { type: "sku/resolu", id: "f0", seq: 1, article: article("PRL1") });
    expect(e.fiches[0].article?.sku).toBe("PRL1");
  });

  it("une nouvelle saisie invalide l'article déjà résolu", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 1 });
    e = reducerMev(e, { type: "sku/resolu", id: "f0", seq: 1, article: article("PRL1") });
    e = reducerMev(e, { type: "sku/saisie", id: "f0", sku: "PRL" });
    expect(e.fiches[0].article).toBeNull();
  });
});

describe("états de génération", () => {
  it("ne peut pas être en cours ET en erreur", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "generation/debut", id: "f0" });
    expect(e.fiches[0].generation.phase).toBe("encours");
    e = reducerMev(e, { type: "generation/echec", id: "f0", message: "503" });
    expect(e.fiches[0].generation).toEqual({ phase: "erreur", message: "503" });
  });

  it("un échec sur une fiche laisse les autres intactes", () => {
    let e = etatA(3);
    const res = { titre: "T", description: "D", motsCles: "M", promptNom: "P" };
    e = reducerMev(e, { type: "generation/ok", id: "f0", resultat: res });
    e = reducerMev(e, { type: "generation/echec", id: "f1", message: "503" });
    e = reducerMev(e, { type: "generation/ok", id: "f2", resultat: res });

    expect(progression(e.fiches)).toEqual({ total: 3, faites: 2, encours: 0, erreurs: 1 });
    expect(e.fiches[0].annonce.titre).toBe("T");
    expect(e.fiches[2].annonce.titre).toBe("T");
  });

  it("un nouveau texte remet l'enregistrement à faire", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "enregistre", id: "f0", statut: "En vente" });
    e = reducerMev(e, {
      type: "generation/ok",
      id: "f0",
      resultat: { titre: "T2", description: "D", motsCles: "M", promptNom: "P" },
    });
    expect(e.fiches[0].enregistre).toBeNull();
  });

  it("l'erreur d'enregistrement est portée par la fiche, pas par la session", () => {
    let e = etatA(2);
    e = reducerMev(e, { type: "enregistre", id: "f0", statut: "En vente" });
    e = reducerMev(e, { type: "enregistrement/echec", id: "f1", message: "réseau" });
    expect(e.fiches[0].erreurEnregistrement).toBeNull();
    expect(e.fiches[0].enregistre).toBe("En vente");
    expect(e.fiches[1].erreurEnregistrement).toBe("réseau");
  });
});

describe("photos", () => {
  it("plafonne la sélection et conserve l'ordre choisi", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, {
      type: "photo/ajout",
      id: "f0",
      photos: ["p1", "p2", "p3", "p4"].map(photo),
    });
    for (const p of ["p3", "p1", "p2", "p4"]) {
      e = reducerMev(e, { type: "photo/selection", id: "f0", photoId: p });
    }
    expect(e.fiches[0].selected).toEqual(["p3", "p1", "p2"]);
    expect(e.fiches[0].selected).toHaveLength(MAX_SELECT);
  });

  it("retirer une photo la retire aussi de la sélection", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "photo/ajout", id: "f0", photos: [photo("p1")] });
    e = reducerMev(e, { type: "photo/selection", id: "f0", photoId: "p1" });
    e = reducerMev(e, { type: "photo/retrait", id: "f0", photoId: "p1" });
    expect(e.fiches[0].photos).toHaveLength(0);
    expect(e.fiches[0].selected).toHaveLength(0);
  });

  it("libère le canvas de TOUTES les fiches sans toucher aux blobs", () => {
    let e = etatA(2);
    const avecBase = { ...photo("p1"), base: {} as HTMLCanvasElement };
    e = reducerMev(e, { type: "photo/ajout", id: "f0", photos: [avecBase] });
    e = reducerMev(e, { type: "photo/ajout", id: "f1", photos: [avecBase] });
    e = reducerMev(e, { type: "photo/liberer-base" });
    expect(e.fiches[0].photos[0].base).toBeNull();
    expect(e.fiches[1].photos[0].base).toBeNull();
    expect(e.fiches[0].photos[0].blob).toBeDefined();
    expect(e.fiches[0].photos[0].url).toBe("blob:p1");
  });
});

describe("pré-remplissage du QCM depuis l'article", () => {
  it("reprend la marque et la catégorie réelles", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 1 });
    e = reducerMev(e, { type: "sku/resolu", id: "f0", seq: 1, article: article("PRL1") });
    expect(e.fiches[0].qcm.marque).toBe("Ralph Lauren");
    expect(e.fiches[0].qcm.categorie).toBe("Polo");
  });

  it("VIDE les libellés collectifs : « Mix » n'est pas une marque", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 1 });
    e = reducerMev(e, {
      type: "sku/resolu",
      id: "f0",
      seq: 1,
      article: article("MIX1", { marque: "TNF/PAT/COL", categorie: "Mix" }),
    });
    expect(e.fiches[0].qcm.marque).toBe("");
    expect(e.fiches[0].qcm.categorie).toBe("");
  });

  it("ne écrase pas une saisie manuelle", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "qcm", id: "f0", champ: "marqueCustom", valeur: true });
    e = reducerMev(e, { type: "qcm", id: "f0", champ: "marque", valeur: "Levi's" });
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 1 });
    e = reducerMev(e, { type: "sku/resolu", id: "f0", seq: 1, article: article("PRL1") });
    expect(e.fiches[0].qcm.marque).toBe("Levi's");
  });
});

describe("champ prix du QCM", () => {
  it("met à jour le champ prix comme n'importe quel autre champ", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "qcm", id: "f0", champ: "prix", valeur: "22" });
    expect(e.fiches[0].qcm.prix).toBe("22");
  });
});

describe("prompt par article", () => {
  it("chaque fiche porte son propre promptId", () => {
    let e = etatA(2);
    e = reducerMev(e, { type: "prompt", id: "f0", promptId: "prompt-rl" });
    e = reducerMev(e, { type: "prompt", id: "f1", promptId: "prompt-lacoste" });
    expect(e.fiches[0].promptId).toBe("prompt-rl");
    expect(e.fiches[1].promptId).toBe("prompt-lacoste");
  });
});

describe("sélecteurs", () => {
  const prete = (): ArticleEnCours => ({
    ...ficheVide("x"),
    article: article("PRL1"),
    selected: ["p1", "p2"],
    qcm: { ...ficheVide("x").qcm, taille: "M", etat: "Très bon état" },
  });

  it("fichePrete exige article, photos, taille et état", () => {
    expect(fichePrete(prete())).toBe(true);
    expect(fichePrete({ ...prete(), article: null })).toBe(false);
    expect(fichePrete({ ...prete(), selected: ["p1"] })).toBe(false);
    expect(fichePrete({ ...prete(), qcm: { ...prete().qcm, taille: "" } })).toBe(false);
    expect(fichePrete({ ...prete(), qcm: { ...prete().qcm, etat: "" } })).toBe(false);
  });

  it("manquePourGenerer nomme ce qui bloque", () => {
    expect(manquePourGenerer(prete())).toEqual([]);
    expect(manquePourGenerer(ficheVide("x"))).toEqual([
      "un SKU valide",
      "2 photos sélectionnées",
      "la taille",
      "l'état",
    ]);
  });

  it("skuEnDoublon repère les SKU répétés, insensible à la casse", () => {
    const f = (id: string, sku: string) => ({ ...ficheVide(id), sku });
    const d = skuEnDoublon([f("a", "PRL1"), f("b", "prl1"), f("c", "LAC3")]);
    expect(d.has("PRL1")).toBe(true);
    expect(d.has("LAC3")).toBe(false);
    expect(d.size).toBe(1);
  });

  it("skuEnDoublon ignore les fiches vides", () => {
    const f = (id: string, sku: string) => ({ ...ficheVide(id), sku });
    expect(skuEnDoublon([f("a", ""), f("b", ""), f("c", "  ")]).size).toBe(0);
  });

  it("dejaAnnonces repère les articles qui portent déjà un titre", () => {
    const avec = {
      ...ficheVide("a"),
      sku: "PRL1",
      article: article("PRL1", { titreAnnonce: "Ancien titre" }),
    };
    const sans = { ...ficheVide("b"), sku: "LAC3", article: article("LAC3") };
    expect(dejaAnnonces([avec, sans])).toEqual(["PRL1"]);
  });
});
