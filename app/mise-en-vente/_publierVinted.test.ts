import { describe, expect, it, vi } from "vitest";
import {
  detailPublicationVinted,
  publierVinted,
  type DetailPublicationVinted,
} from "./_publierVinted";
import { ficheVide, type ArticleEnCours } from "./_reducer";
import type { ArticleDTO } from "@/lib/types";
import { DELAI_PAR_DEFAUT } from "./_delaiVinted";

const article = (extra: Partial<ArticleDTO> = {}): ArticleDTO =>
  ({
    id: "art_PRL1",
    sku: "PRL1",
    marque: "Ralph Lauren",
    categorie: "Polo",
    lot: "Polo Ralph Lauren",
    statut: "En stock",
    titreAnnonce: null,
    ...extra,
  }) as ArticleDTO;

const photo = (id: string) =>
  ({ id, base: null, rotation: 0, url: `blob:${id}`, blob: { id } as unknown as Blob });

/**
 * Fiche prête pour l'export : article résolu, annonce générée, une photo.
 *
 * `id: "f0"` (identité CLIENT, cf. _reducer.ts) et `article.id: "art_PRL1"`
 * (identité BASE) sont délibérément DIFFÉRENTS — c'est ce qui permet aux
 * tests ci-dessous de distinguer un appel avec le bon id d'un appel avec
 * l'autre. Un vrai bug de prod (`f.article.id` passé à la place de `f.id`)
 * les a un temps confondus : cf. le fix documenté dans task-8-report.md.
 */
function ficheDeTest(): ArticleEnCours {
  return {
    ...ficheVide("f0"),
    sku: "PRL1",
    article: article(),
    photos: [photo("p1")],
    qcm: { ...ficheVide("f0").qcm, prix: "25" },
    annonce: { titre: "Polo Ralph Lauren M", description: "Description.", motsCles: "polo, rl" },
  };
}

/** `ficheDeTest()` avec un QCM surchargé — les tests Vinted ne se
 *  distinguent que par marque, catégorie, état, matières et couleurs. */
function ficheAvec(qcm: Partial<ArticleEnCours["qcm"]>): ArticleEnCours {
  const base = ficheDeTest();
  return { ...base, qcm: { ...base.qcm, ...qcm } };
}

describe("publierVinted — invariant critique : PATCH gate l'onglet", () => {
  // L'extension (Tâche 14) apparie chaque onglet Vinted ouvert à un article
  // mis en file, DANS L'ORDRE DE CRÉATION des onglets. Un onglet ouvert sans
  // article correspondant (parce que l'enregistrement a échoué en silence)
  // décale l'appariement de tous les onglets suivants ouverts dans la même
  // session. Ce test est celui qui matérialise ce risque — cf. brief Tâche 8.

  it("n'émet pas l'événement si l'enregistrement échoue", async () => {
    const enregistrerUn = vi.fn().mockResolvedValue(false);
    const emettreEvenement = vi.fn();

    const resultat = await publierVinted(
      ficheDeTest(),
      DELAI_PAR_DEFAUT,
      enregistrerUn,
      emettreEvenement,
    );

    // f.id ("f0"), PAS f.article.id ("art_PRL1") : c'est l'id CLIENT que
    // `enregistrer()` (page.tsx) résout via `fiches.find((x) => x.id === id)`.
    // Lui passer l'id article ne matche jamais aucune fiche : la publication
    // deviendrait alors structurellement impossible en prod (bug déjà vécu).
    expect(enregistrerUn).toHaveBeenCalledWith("f0", "Brouillon");
    expect(emettreEvenement).not.toHaveBeenCalled();
    expect(resultat).toBe(false);
  });

  it("émet l'événement seulement après un enregistrement réussi", async () => {
    const enregistrerUn = vi.fn().mockResolvedValue(true);
    const emettreEvenement = vi.fn();

    const resultat = await publierVinted(
      ficheDeTest(),
      DELAI_PAR_DEFAUT,
      enregistrerUn,
      emettreEvenement,
    );

    expect(enregistrerUn).toHaveBeenCalledWith("f0", "Brouillon");
    expect(emettreEvenement).toHaveBeenCalledTimes(1);
    expect(resultat).toBe(true);
  });

  it("passe l'id CLIENT de la fiche à enregistrerUn, jamais l'id article — régression du bug de prod", async () => {
    // Garde de fixture : si quelqu'un aligne un jour `id` et `article.id`
    // dans `ficheDeTest()`, ce test ne prouverait plus rien — on le vérifie
    // explicitement pour que ce cas-là échoue bruyamment plutôt qu'en silence.
    const f = ficheDeTest();
    expect(f.id).not.toBe(f.article!.id);

    const enregistrerUn = vi.fn().mockResolvedValue(true);
    await publierVinted(f, DELAI_PAR_DEFAUT, enregistrerUn, vi.fn());

    expect(enregistrerUn).toHaveBeenCalledWith(f.id, "Brouillon");
    expect(enregistrerUn).not.toHaveBeenCalledWith(f.article!.id, "Brouillon");
  });

  it("ne tente même pas l'enregistrement si la fiche n'a pas d'article", async () => {
    const enregistrerUn = vi.fn().mockResolvedValue(true);
    const emettreEvenement = vi.fn();
    const sansArticle: ArticleEnCours = { ...ficheDeTest(), article: null };

    const resultat = await publierVinted(
      sansArticle,
      DELAI_PAR_DEFAUT,
      enregistrerUn,
      emettreEvenement,
    );

    expect(enregistrerUn).not.toHaveBeenCalled();
    expect(emettreEvenement).not.toHaveBeenCalled();
    expect(resultat).toBe(false);
  });
});

describe("publierVinted — sans ouverture d'onglet", () => {
  it("émet l'événement quand le PATCH réussit, et rien d'autre", async () => {
    const emis: DetailPublicationVinted[] = [];
    const ok = await publierVinted(
      ficheAvec({ marque: "Nike", categorie: "Sac à dos", etat: "Très bon état" }),
      DELAI_PAR_DEFAUT,
      async () => true,
      (d) => emis.push(d),
    );
    expect(ok).toBe(true);
    expect(emis).toHaveLength(1);
  });

  it("n'émet rien quand le PATCH échoue", async () => {
    const emis: DetailPublicationVinted[] = [];
    const ok = await publierVinted(
      ficheAvec({ marque: "Nike", categorie: "Sac à dos", etat: "Très bon état" }),
      DELAI_PAR_DEFAUT,
      async () => false,
      (d) => emis.push(d),
    );
    expect(ok).toBe(false);
    expect(emis).toHaveLength(0);
  });
});

describe("detailPublicationVinted", () => {
  it("porte l'id article, le texte de l'annonce, le prix, les blobs photo et le délai", () => {
    const detail = detailPublicationVinted(ficheDeTest(), { minMinutes: 4, maxMinutes: 9 });
    expect(detail).toEqual({
      articleId: "art_PRL1",
      titre: "Polo Ralph Lauren M",
      description: "Description.",
      prix: "25",
      photos: [{ id: "p1" }],
      delai: { minMinutes: 4, maxMinutes: 9 },
    });
  });

  it("transporte un délai fixe tel quel, min = max", () => {
    const detail = detailPublicationVinted(ficheDeTest(), { minMinutes: 3, maxMinutes: 3 });
    expect(detail.delai).toEqual({ minMinutes: 3, maxMinutes: 3 });
  });
});

describe("detailPublicationVinted — champs Vinted", () => {
  it("porte les identifiants numériques pour un sac à dos Nike", () => {
    const f = ficheAvec({
      marque: "Nike",
      categorie: "Sac à dos",
      etat: "Très bon état",
      matiere: "Polyester",
      matiere2: "Nylon",
      couleurs: [1, 3],
    });
    const detail = detailPublicationVinted(f, DELAI_PAR_DEFAUT);
    expect(detail.vinted).toEqual({
      categoryId: 246,
      rechercheCategorie: "Sacs à dos",
      filAriane: "Hommes > Accessoires > Sacs et sacoches",
      brandId: 53,
      conditionId: 2,
      packageType: 1,
      unisex: true,
      colorIds: [1, 3],
      materialIds: [45, 52],
    });
  });

  it("n'a pas de bloc vinted quand aucun mapping ne correspond", () => {
    const f = ficheAvec({ marque: "Ralph Lauren", categorie: "Polo", etat: "Bon état" });
    expect(detailPublicationVinted(f, DELAI_PAR_DEFAUT).vinted).toBeUndefined();
  });

  it("n'a pas de bloc vinted si l'état n'a pas d'équivalent Vinted", () => {
    const f = ficheAvec({ marque: "Nike", categorie: "Sac à dos", etat: "" });
    expect(detailPublicationVinted(f, DELAI_PAR_DEFAUT).vinted).toBeUndefined();
  });

  it("plafonne les couleurs à 2 et les matériaux à 2", () => {
    const f = ficheAvec({
      marque: "Nike",
      categorie: "Sac à dos",
      etat: "Bon état",
      matiere: "Coton",
      matiere2: "Coton piqué",
      couleurs: [1, 3, 12],
    });
    const v = detailPublicationVinted(f, DELAI_PAR_DEFAUT).vinted!;
    expect(v.colorIds).toEqual([1, 3]);
    expect(v.materialIds).toEqual([44]);
    expect(v.conditionId).toBe(3);
  });
});
