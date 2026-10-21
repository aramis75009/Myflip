import { describe, expect, it } from "vitest";
import { descripteurBarre } from "./_barreAction";
import { etatInitial, reducerMev, type EtatMev } from "./_reducer";
import type { ArticleDTO } from "@/lib/types";

const art = (sku: string): ArticleDTO =>
  ({ id: `a_${sku}`, sku, marque: "Ralph Lauren", categorie: "Polo" }) as ArticleDTO;

/** Une fiche résolue, photos choisies, taille et état posés. */
function ficheComplete(e: EtatMev, id: string, sku: string, seq: number): EtatMev {
  let s = reducerMev(e, { type: "sku/saisie", id, sku });
  s = reducerMev(s, { type: "sku/lookup", id, seq });
  s = reducerMev(s, { type: "sku/resolu", id, seq, article: art(sku) });
  s = reducerMev(s, {
    type: "photo/ajout",
    id,
    photos: ["p1", "p2"].map((p) => ({
      id: `${id}${p}`,
      base: null,
      rotation: 0,
      url: `blob:${id}${p}`,
      blob: {} as Blob,
    })),
  });
  s = reducerMev(s, { type: "photo/selection", id, photoId: `${id}p1` });
  s = reducerMev(s, { type: "photo/selection", id, photoId: `${id}p2` });
  s = reducerMev(s, { type: "qcm", id, champ: "taille", valeur: "M" });
  s = reducerMev(s, { type: "qcm", id, champ: "etat", valeur: "Bon état" });
  return s;
}

describe("étape 1 — saisie des SKU", () => {
  it("bloque tant qu'aucun SKU n'est résolu, et dit quoi faire", () => {
    const d = descripteurBarre(etatInitial("f0"));
    expect(d.actif).toBe(false);
    expect(d.ok).toBe(false);
    expect(d.indice).toBe("Saisis au moins un SKU valide");
    expect(d.retourPossible).toBe(false);
  });

  it("compte les articles trouvés, au singulier comme au pluriel", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 1 });
    e = reducerMev(e, { type: "sku/resolu", id: "f0", seq: 1, article: art("PRL1") });
    expect(descripteurBarre(e).indice).toBe("1 article trouvé");

    e = reducerMev(e, { type: "fiche/ajout", id: "f1" });
    e = reducerMev(e, { type: "sku/lookup", id: "f1", seq: 1 });
    e = reducerMev(e, { type: "sku/resolu", id: "f1", seq: 1, article: art("LAC3") });
    const d = descripteurBarre(e);
    expect(d.indice).toBe("2 articles trouvés");
    expect(d.actif).toBe(true);
    expect(d.intention).toBe("continuer");
  });
});

describe("étape 2 — fiches", () => {
  it("décrit ce que le BOUTON va faire, même si la fiche affichée est incomplète", () => {
    let e = ficheComplete(etatInitial("f0"), "f0", "PRL1", 1);
    e = reducerMev(e, { type: "fiche/ajout", id: "f1" }); // vide, et devient active
    e = reducerMev(e, { type: "etape", etape: 2 });
    const d = descripteurBarre(e);
    // La fiche active (f1) est vide, mais f0 est prête : le bouton générera f0.
    // L'indice doit donc parler du LOT, pas de la fiche regardée — sinon on
    // lirait « Il manque un SKU » à côté d'un bouton actif, ce qui se contredit.
    // Ce qui manque à la fiche affichée est déjà dit par ses badges « requis ».
    expect(d.indice).toBe("1 fiche prête sur 2");
    expect(d.actif).toBe(true);
  });

  it("bascule sur ce qui manque quand AUCUNE fiche n'est prête", () => {
    const e = reducerMev(etatInitial("f0"), { type: "etape", etape: 2 });
    const d = descripteurBarre(e);
    expect(d.indice).toContain("Il manque");
    expect(d.indice).toContain("un SKU valide");
    expect(d.actif).toBe(false);
  });

  it("passe au pluriel quand plusieurs fiches sont prêtes", () => {
    let e = ficheComplete(etatInitial("f0"), "f0", "PRL1", 1);
    e = reducerMev(e, { type: "fiche/ajout", id: "f1" });
    e = ficheComplete(e, "f1", "LAC3", 1);
    e = reducerMev(e, { type: "etape", etape: 2 });
    const d = descripteurBarre(e);
    expect(d.label).toBe("Générer les 2 annonces");
    expect(d.indice).toBe("2 fiches prêtes sur 2");
    expect(d.icone).toBe("etincelles");
    expect(d.intention).toBe("generer");
  });

  it("reste au singulier avec une seule fiche prête sur deux", () => {
    let e = ficheComplete(etatInitial("f0"), "f0", "PRL1", 1);
    e = reducerMev(e, { type: "fiche/ajout", id: "f1" });
    e = reducerMev(e, { type: "fiche/active", id: "f0" });
    e = reducerMev(e, { type: "etape", etape: 2 });
    const d = descripteurBarre(e);
    expect(d.label).toBe("Générer l'annonce");
    expect(d.indice).toBe("1 fiche prête sur 2");
  });
});

describe("étape 3 — génération", () => {
  it("bouton inerte et retour interdit pendant la file", () => {
    const e = reducerMev(etatInitial("f0"), { type: "etape", etape: 3 });
    const d = descripteurBarre(e);
    expect(d.actif).toBe(false);
    expect(d.intention).toBe("attendre");
    // Revenir modifier une fiche dont la génération est en vol produirait une
    // annonce qui ne correspond plus à ce qu'on a demandé.
    expect(d.retourPossible).toBe(false);
  });
});

describe("étape 4 — annonces", () => {
  const genere = (e: EtatMev, id: string) =>
    reducerMev(e, {
      type: "generation/ok",
      id,
      resultat: { titre: "T", description: "D", motsCles: "M", promptNom: "P" },
    });

  it("alerte tant que des annonces ne sont pas enregistrées", () => {
    let e = reducerMev(etatInitial("f0"), { type: "etape", etape: 4 });
    e = genere(e, "f0");
    const d = descripteurBarre(e);
    expect(d.indice).toBe("1 annonce non enregistrée");
    expect(d.ok).toBe(false);
  });

  it("passe au vert une fois tout enregistré", () => {
    let e = reducerMev(etatInitial("f0"), { type: "etape", etape: 4 });
    e = genere(e, "f0");
    e = reducerMev(e, { type: "enregistre", id: "f0", statut: "En vente" });
    const d = descripteurBarre(e);
    expect(d.indice).toBe("Tout est enregistré");
    expect(d.ok).toBe(true);
    expect(d.intention).toBe("nouvelle-session");
  });

  it("accorde le pluriel sur plusieurs annonces en attente", () => {
    let e = reducerMev(etatInitial("f0"), { type: "etape", etape: 4 });
    e = reducerMev(e, { type: "fiche/ajout", id: "f1" });
    e = genere(e, "f0");
    e = genere(e, "f1");
    expect(descripteurBarre(e).indice).toBe("2 annonces non enregistrées");
  });

  // QU-61 : « Nouvelle session » efface des annonces générées (donc payées) et
  // les photos. Le descripteur dit s'il faut demander confirmation, et laquelle.
  describe("« Nouvelle session » (QU-61)", () => {
    it("n'est jamais l'action principale de l'étape", () => {
      let e = reducerMev(etatInitial("f0"), { type: "etape", etape: 4 });
      e = genere(e, "f0");
      const d = descripteurBarre(e);
      expect(d.label).toBe("Nouvelle session");
      expect(d.variante).toBe("secondary");
    });

    it("demande confirmation avec 2 annonces non enregistrées", () => {
      let e = reducerMev(etatInitial("f0"), { type: "etape", etape: 4 });
      e = reducerMev(e, { type: "fiche/ajout", id: "f1" });
      e = genere(e, "f0");
      e = genere(e, "f1");
      const d = descripteurBarre(e);
      expect(d.variante).toBe("secondary");
      expect(d.confirmation).toEqual({
        titre: "Abandonner 2 annonces non enregistrées ?",
        confirmer: "Abandonner et recommencer",
      });
    });

    it("demande confirmation avec 1 annonce non enregistrée, au singulier", () => {
      let e = reducerMev(etatInitial("f0"), { type: "etape", etape: 4 });
      e = genere(e, "f0");
      expect(descripteurBarre(e).confirmation?.titre).toBe(
        "Abandonner 1 annonce non enregistrée ?",
      );
    });

    it("ne compte que les annonces non enregistrées", () => {
      let e = reducerMev(etatInitial("f0"), { type: "etape", etape: 4 });
      e = reducerMev(e, { type: "fiche/ajout", id: "f1" });
      e = genere(e, "f0");
      e = genere(e, "f1");
      e = reducerMev(e, { type: "enregistre", id: "f0", statut: "En vente" });
      expect(descripteurBarre(e).confirmation?.titre).toBe(
        "Abandonner 1 annonce non enregistrée ?",
      );
    });

    it("ne demande rien quand tout est enregistré", () => {
      let e = reducerMev(etatInitial("f0"), { type: "etape", etape: 4 });
      e = genere(e, "f0");
      e = reducerMev(e, { type: "enregistre", id: "f0", statut: "En vente" });
      expect(descripteurBarre(e).confirmation).toBeNull();
    });

    it("ne demande rien quand aucune annonce n'a été générée", () => {
      const e = reducerMev(etatInitial("f0"), { type: "etape", etape: 4 });
      expect(descripteurBarre(e).confirmation).toBeNull();
    });
  });
});

describe("poids du bouton principal", () => {
  it("reste « primary », sans confirmation, aux étapes 1 à 3", () => {
    const e1 = etatInitial("f0");
    const e2 = reducerMev(e1, { type: "etape", etape: 2 });
    const e3 = reducerMev(e1, { type: "etape", etape: 3 });
    for (const e of [e1, e2, e3]) {
      const d = descripteurBarre(e);
      expect(d.variante).toBe("primary");
      expect(d.confirmation).toBeNull();
    }
  });
});
