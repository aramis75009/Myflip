import { describe, expect, it, vi } from "vitest";
import { detailPublicationVinted, publierVinted } from "./_publierVinted";
import { ficheVide, type ArticleEnCours } from "./_reducer";
import type { ArticleDTO } from "@/lib/types";

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

/** Fiche prête pour l'export : article résolu, annonce générée, une photo. */
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

describe("publierVinted — invariant critique : PATCH gate l'onglet", () => {
  // L'extension (Tâche 14) apparie chaque onglet Vinted ouvert à un article
  // mis en file, DANS L'ORDRE DE CRÉATION des onglets. Un onglet ouvert sans
  // article correspondant (parce que l'enregistrement a échoué en silence)
  // décale l'appariement de tous les onglets suivants ouverts dans la même
  // session. Ce test est celui qui matérialise ce risque — cf. brief Tâche 8.

  it("n'émet pas l'événement et n'ouvre pas d'onglet si l'enregistrement échoue", async () => {
    const enregistrerUn = vi.fn().mockResolvedValue(false);
    const emettreEvenement = vi.fn();
    const ouvrirOnglet = vi.fn();

    const resultat = await publierVinted(
      ficheDeTest(),
      enregistrerUn,
      emettreEvenement,
      ouvrirOnglet,
    );

    expect(enregistrerUn).toHaveBeenCalledWith("art_PRL1", "Brouillon");
    expect(emettreEvenement).not.toHaveBeenCalled();
    expect(ouvrirOnglet).not.toHaveBeenCalled();
    expect(resultat).toBe(false);
  });

  it("émet l'événement puis ouvre l'onglet seulement après un enregistrement réussi", async () => {
    const enregistrerUn = vi.fn().mockResolvedValue(true);
    const appels: string[] = [];
    const emettreEvenement = vi.fn(() => appels.push("evenement"));
    const ouvrirOnglet = vi.fn(() => appels.push("onglet"));

    const resultat = await publierVinted(
      ficheDeTest(),
      enregistrerUn,
      emettreEvenement,
      ouvrirOnglet,
    );

    expect(emettreEvenement).toHaveBeenCalledTimes(1);
    expect(ouvrirOnglet).toHaveBeenCalledTimes(1);
    // L'événement précède l'ouverture : l'extension doit pouvoir capter le
    // detail avant que l'onglet Vinted n'existe.
    expect(appels).toEqual(["evenement", "onglet"]);
    expect(resultat).toBe(true);
  });

  it("ne tente même pas l'enregistrement si la fiche n'a pas d'article", async () => {
    const enregistrerUn = vi.fn().mockResolvedValue(true);
    const emettreEvenement = vi.fn();
    const ouvrirOnglet = vi.fn();
    const sansArticle: ArticleEnCours = { ...ficheDeTest(), article: null };

    const resultat = await publierVinted(
      sansArticle,
      enregistrerUn,
      emettreEvenement,
      ouvrirOnglet,
    );

    expect(enregistrerUn).not.toHaveBeenCalled();
    expect(emettreEvenement).not.toHaveBeenCalled();
    expect(ouvrirOnglet).not.toHaveBeenCalled();
    expect(resultat).toBe(false);
  });
});

describe("detailPublicationVinted", () => {
  it("porte l'id article, le texte de l'annonce, le prix et les blobs photo", () => {
    const detail = detailPublicationVinted(ficheDeTest());
    expect(detail).toEqual({
      articleId: "art_PRL1",
      titre: "Polo Ralph Lauren M",
      description: "Description.",
      prix: "25",
      photos: [{ id: "p1" }],
    });
  });
});
