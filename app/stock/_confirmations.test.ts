import { describe, expect, it } from "vitest";

import { messageChangementGroupe, messageQuitterVendu, messageSuppression } from "./_confirmations";

const NBSP = " ";

describe("messageQuitterVendu", () => {
  const vendu = { sku: "LAC9", statut: "Vendu", prixVente: 18 };

  it("asks before leaving Vendu, with the formatted price", () => {
    expect(messageQuitterVendu(vendu, "En vente")).toEqual({
      titre: "Annuler la vente de LAC9 ?",
      corps: `Le prix de vente (18,00${NBSP}€), la date de vente et la marge seront effacés. Cette action est définitive.`,
    });
  });

  it("null when staying Vendu or when the article is not sold", () => {
    expect(messageQuitterVendu(vendu, "Vendu")).toBeNull();
    expect(messageQuitterVendu({ ...vendu, statut: "En vente" }, "En stock")).toBeNull();
  });

  it("no price in parentheses when none is known", () => {
    expect(messageQuitterVendu({ ...vendu, prixVente: null }, "En stock")?.corps).toBe(
      "Le prix de vente, la date de vente et la marge seront effacés. Cette action est définitive.",
    );
  });
});

describe("messageSuppression", () => {
  it("names the SKU", () => {
    expect(messageSuppression({ sku: "ADI1" })).toEqual({
      titre: "Supprimer ADI1 ?",
      corps: "L’article et ses données de vente seront supprimés définitivement.",
    });
  });
});

describe("messageChangementGroupe", () => {
  it("null when no sold article is targeted", () => {
    expect(messageChangementGroupe(12, 0)).toBeNull();
  });

  it("plural and singular", () => {
    expect(messageChangementGroupe(12, 4)).toEqual({
      titre: "Changer le statut de 12 articles ?",
      corps: "4 articles vendus perdront leur prix, leur date et leur marge de vente.",
    });
    expect(messageChangementGroupe(1, 1)).toEqual({
      titre: "Changer le statut de 1 article ?",
      corps: "1 article vendu perdra son prix, sa date et sa marge de vente.",
    });
  });
});
