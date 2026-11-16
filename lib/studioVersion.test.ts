import { describe, expect, it } from "vitest";

import { fusionnerVersions, lireSkuAnnonce, nomVersion, prochainNumero, texteDescription, versionsAffichees, type VersionEnBase } from "./studioVersion";

const TIRETS = ["- Sac à dos Nike Elite, coloris noir et orange", "- Fermetures éclair, bretelles et fond en bon état", "- Expédition soignée"].join("\n");
const MOTS = "sac à dos, Nike Elite, sac de sport, noir et orange";

describe("texteDescription — « Copier la description » (décision du 16/11)", () => {
  it("tirets, UNE ligne vide, mots-clés, puis le SKU sur la ligne JUSTE en dessous", () => {
    expect(texteDescription({ tirets: TIRETS, motsCles: MOTS, sku: "SDN12" })).toBe(`${TIRETS}\n\n${MOTS}\nSDN12`);
  });

  it("le même texte, ligne par ligne : une seule ligne vide, et aucune entre les mots-clés et le SKU", () => {
    const lignes = texteDescription({ tirets: TIRETS, motsCles: MOTS, sku: "SDN12" }).split("\n");
    expect(lignes).toEqual([...TIRETS.split("\n"), "", MOTS, "SDN12"]);
    expect(lignes.filter((l) => l === "")).toHaveLength(1);
  });

  it("diffère volontairement de l'export de Mise en vente (ligne vide aussi avant le SKU)", () => {
    const exportMiseEnVente = `${TIRETS}\n\n${MOTS}\n\nSDN12`; // app/mise-en-vente/_components/ExportAnnonces.tsx, inchangé
    expect(texteDescription({ tirets: TIRETS, motsCles: MOTS, sku: "SDN12" })).not.toBe(exportMiseEnVente);
  });

  it("ne réécrit pas les tirets : seuls les blancs de fin partent (sinon la ligne vide doublerait)", () => {
    const texte = texteDescription({ tirets: `${TIRETS}\n\n  `, motsCles: MOTS, sku: "SDN12" });
    expect(texte.startsWith(TIRETS)).toBe(true);
    expect(texte).toBe(`${TIRETS}\n\n${MOTS}\nSDN12`);
    // Les tirets avec leurs espaces internes, majuscules et ponctuation, tels quels.
    const bizarre = "-  Double  espace\n- MAJUSCULES ; ponctuation !";
    expect(texteDescription({ tirets: bizarre, motsCles: "", sku: null })).toBe(bizarre);
  });

  it("une partie vide disparaît avec son séparateur", () => {
    expect(texteDescription({ tirets: TIRETS, motsCles: MOTS, sku: null })).toBe(`${TIRETS}\n\n${MOTS}`);
    expect(texteDescription({ tirets: TIRETS, motsCles: "  ", sku: "SDN12" })).toBe(`${TIRETS}\n\nSDN12`);
    expect(texteDescription({ tirets: "", motsCles: MOTS, sku: "SDN12" })).toBe(`${MOTS}\nSDN12`);
    expect(texteDescription({ tirets: "", motsCles: "", sku: null })).toBe("");
  });
});

describe("lireSkuAnnonce", () => {
  it("met en majuscules, retire les espaces ; vide = pas renseigné", () => {
    expect(lireSkuAnnonce(" sdn40 ")).toEqual({ ok: true, sku: "SDN40" });
    expect(lireSkuAnnonce("PRL-001")).toEqual({ ok: true, sku: "PRL-001" });
    expect(lireSkuAnnonce("")).toEqual({ ok: true, sku: null });
    expect(lireSkuAnnonce(null)).toEqual({ ok: true, sku: null });
  });

  it("refuse ce qui n'est pas un SKU", () => {
    for (const v of ["SDN 40", "SDN40;", "-SDN", "A".repeat(41), 40, {}]) expect(lireSkuAnnonce(v).ok, String(v)).toBe(false);
  });
});

describe("numéros et liste des versions", () => {
  it("la première version enregistrée est la 2 ; ensuite, la suivante du plus grand numéro", () => {
    expect(prochainNumero([])).toBe(2);
    expect(prochainNumero([2, 3])).toBe(4);
    expect(prochainNumero([2, 5])).toBe(6);
  });

  const v = (id: string, numero: number, sku: string | null = null): VersionEnBase => ({
    id,
    numero,
    skuSource: "SDN12",
    titre: "T",
    description: TIRETS,
    motsCles: MOTS,
    skuAnnonce: sku,
    createdAt: "2026-11-17T10:00:00.000Z",
    photos: ["c1", "c2"],
  });

  it("fusion : le serveur fait foi, une version créée à l'instant n'est pas perdue, tri par numéro", () => {
    expect(fusionnerVersions([v("b", 3, "LOCAL"), v("c", 4)], [v("a", 2), v("b", 3, "SERVEUR")])).toEqual([v("a", 2), v("b", 3, "SERVEUR"), v("c", 4)]);
  });

  it("la Version 1 est l'état actuel du sac (images validées), puis les enregistrées (photos de la planche)", () => {
    const liste = versionsAffichees({ sku: "SDN12", titre: "Titre actuel", description: TIRETS, motsCles: MOTS, photos: ["e1"] }, [v("b", 3), v("a", 2)]);
    expect(liste.map((x) => x.numero)).toEqual([1, 2, 3]);
    expect(liste[0]).toEqual({ id: null, numero: 1, titre: "Titre actuel", description: TIRETS, motsCles: MOTS, skuAnnonce: "SDN12", photos: [{ type: "essai", id: "e1" }] });
    expect(liste[1].photos).toEqual([
      { type: "ref", id: "c1" },
      { type: "ref", id: "c2" },
    ]);
    // Sans sac : une Version 1 vide, jamais d'erreur.
    expect(versionsAffichees(null, [])[0]).toMatchObject({ numero: 1, titre: "", skuAnnonce: null, photos: [] });
  });

  it("noms", () => {
    expect(nomVersion(1)).toBe("Version 1 (actuelle)");
    expect(nomVersion(2)).toBe("Version 2");
  });
});
