import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { whereImagesValidees } from "./studioAnnonce";

const RACINE = path.join(__dirname, "..");
const lire = (rel: string) => readFileSync(path.join(RACINE, rel), "utf8");

describe("whereImagesValidees (la règle de GET /api/studio/annonce)", () => {
  it("un essai validé par Aramis, avec son image, sur une photo du tableau, pour ce SKU et ce compte", () => {
    expect(whereImagesValidees("u1", "SDN15")).toEqual({
      skuCible: "SDN15",
      decision: "valide", // la décision d'Aramis, jamais le verdict de l'IA
      urlImage: { not: "" }, // un rejet purgé garde sa ligne mais plus son image
      coloris: { userId: "u1" },
      reference: { ordre: { not: null } }, // une photo gardée hors tableau ne part pas dans l'annonce
    });
  });

  it("pour plusieurs SKU, la même règle avec `in`", () => {
    expect(whereImagesValidees("u1", { in: ["SDN1", "SDN2"] })).toEqual({
      skuCible: { in: ["SDN1", "SDN2"] },
      decision: "valide",
      urlImage: { not: "" },
      coloris: { userId: "u1" },
      reference: { ordre: { not: null } },
    });
  });

  it("ne dépend de rien d'autre que ses arguments (pur)", () => {
    expect(whereImagesValidees("u1", "SDN15")).toEqual(whereImagesValidees("u1", "SDN15"));
    expect(whereImagesValidees("u2", "SDN15").coloris).toEqual({ userId: "u2" });
  });
});

describe("une seule règle pour l'annonce et pour l'état « Prêt » de l'accueil", () => {
  it("la route de l'annonce et l'accueil lisent whereImagesValidees, aucun des deux ne la réécrit", () => {
    const route = lire("app/api/studio/annonce/route.ts");
    const serveur = lire("lib/studioServeur.ts");
    expect(route).toContain("whereImagesValidees(userId, sku)");
    expect(serveur).toContain("whereImagesValidees(userId,");
    // La condition n'est plus écrite à la main dans la route : elle ne peut pas diverger.
    expect(route).not.toMatch(/decision\s*:/);
    expect(route).not.toMatch(/urlImage\s*:/);
  });
});
