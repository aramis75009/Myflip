import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { versionsPourVente, whereImagesValidees } from "./studioAnnonce";

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

describe("versionsPourVente (les versions 2, 3… que GET /api/studio/annonce rend à la Mise en vente)", () => {
  const ligne = (numero: number, extra: Partial<Parameters<typeof versionsPourVente>[0][number]> = {}) => ({
    numero,
    titre: `T${numero}`,
    description: `- D${numero}`,
    motsCles: `m${numero}`,
    skuAnnonce: null,
    photos: [{ referenceId: `c${numero}a` }, { referenceId: `c${numero}b` }],
    ...extra,
  });

  it("trie par numéro et numérote les photos dans l'ordre de la version", () => {
    const r = versionsPourVente([ligne(3), ligne(2, { skuAnnonce: "SDN3-B" })]);
    expect(r.map((v) => v.numero)).toEqual([2, 3]);
    expect(r[0]).toEqual({
      numero: 2,
      titre: "T2",
      description: "- D2",
      motsCles: "m2",
      skuAnnonce: "SDN3-B",
      photos: [
        { id: "c2a", ordre: 1 },
        { id: "c2b", ordre: 2 },
      ],
    });
  });

  it("n'emporte jamais la Version 1 : elle est virtuelle, la Mise en vente la lit dans l'Article", () => {
    expect(versionsPourVente([ligne(1), ligne(2)]).map((v) => v.numero)).toEqual([2]);
    expect(versionsPourVente([])).toEqual([]);
  });

  it("la route rend `versions` à côté de `images`, et lit les versions par le même module que le Studio", () => {
    const route = lire("app/api/studio/annonce/route.ts");
    expect(route).toContain("versionsDuSac(userId, sku)");
    expect(route).toMatch(/NextResponse\.json\(\{ sku, images, versions \}\)/);
    const serveur = lire("lib/studioServeur.ts");
    // Scopé par compte, versions 2+ seulement, lecture seule.
    expect(serveur).toMatch(/studioVersion\.findMany\(\{\s*where: \{ userId, numero: \{ gte: 2 \}, coloris: \{ userId, cle \} \}/);
  });
});
