import { describe, expect, it } from "vitest";

import {
  DESCRIPTION_MAX,
  decouperMotsCles,
  estVersionUn,
  fusionnerVersions,
  lireModificationVersion,
  lireSkuAnnonce,
  MOTS_CLES_MAX,
  nomVersion,
  normaliserMotsCles,
  normaliserTitre,
  prochainNumero,
  texteDescription,
  TITRE_MAX,
  urlZipVersion,
  versionsAffichees,
  viseVersionUn,
  type VersionEnBase,
} from "./studioVersion";

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

describe("modification à la main — lireModificationVersion (étape 4)", () => {
  it("n'écrit QUE le champ concerné : chaque champ absent reste absent du résultat", () => {
    expect(lireModificationVersion({ titre: "Nouveau titre" })).toEqual({ ok: true, donnees: { titre: "Nouveau titre" } });
    expect(lireModificationVersion({ description: "- un\n- deux" })).toEqual({ ok: true, donnees: { description: "- un\n- deux" } });
    expect(lireModificationVersion({ motsCles: "a, b" })).toEqual({ ok: true, donnees: { motsCles: "a, b" } });
    expect(lireModificationVersion({ skuAnnonce: "sdn40" })).toEqual({ ok: true, donnees: { skuAnnonce: "SDN40" } });
    for (const champ of ["titre", "description", "motsCles", "skuAnnonce"]) {
      const lu = lireModificationVersion({ [champ]: champ === "skuAnnonce" ? "SDN1" : "x" });
      expect(lu.ok && Object.keys(lu.donnees)).toEqual([champ]);
    }
  });

  it("un sous-ensemble de champs écrit exactement ces champs (« Garder » : titre et motsCles)", () => {
    const lu = lireModificationVersion({ titre: "T", motsCles: "a,b" });
    expect(lu).toEqual({ ok: true, donnees: { titre: "T", motsCles: "a, b" } });
  });

  it("toute autre clé du corps est ignorée, jamais écrite (id, userId, numéro, photos…)", () => {
    const lu = lireModificationVersion({ titre: "T", id: "x", userId: "evil", numero: 9, photos: ["p"], colorisId: "c", createdAt: "2020-01-01" });
    expect(lu).toEqual({ ok: true, donnees: { titre: "T" } });
  });

  it("refuse un corps sans aucun champ connu, ou qui n'est pas un objet", () => {
    for (const corps of [{}, { numero: 2 }, null, undefined, "titre", 12, ["titre"]]) expect(lireModificationVersion(corps).ok, JSON.stringify(corps)).toBe(false);
  });

  it("titre : espaces repliés, 100 caractères au plus (un émoji vaut un), vide accepté", () => {
    expect(lireModificationVersion({ titre: "  Sac \n  à dos   Nike " })).toEqual({ ok: true, donnees: { titre: "Sac à dos Nike" } });
    expect(lireModificationVersion({ titre: "" })).toEqual({ ok: true, donnees: { titre: "" } });
    expect(lireModificationVersion({ titre: "a".repeat(TITRE_MAX) }).ok).toBe(true);
    expect(lireModificationVersion({ titre: "🎒".repeat(TITRE_MAX) }).ok).toBe(true);
    const long = lireModificationVersion({ titre: "a".repeat(TITRE_MAX + 1) });
    expect(long).toEqual({ ok: false, message: "Titre trop long : 101 caractères, 100 au maximum." });
    expect(lireModificationVersion({ titre: 12 }).ok).toBe(false);
  });

  it("description : les lignes des tirets sont conservées, seuls CRLF et blancs de fin changent", () => {
    const lu = lireModificationVersion({ description: "- un\r\n-  deux  \r\n\r\n- trois\n\n  " });
    expect(lu).toEqual({ ok: true, donnees: { description: "- un\n-  deux  \n\n- trois" } });
    expect(lireModificationVersion({ description: "x".repeat(DESCRIPTION_MAX + 1) }).ok).toBe(false);
    expect(lireModificationVersion({ description: null }).ok).toBe(false);
  });

  it("mots-clés : une chaîne séparée par des virgules ; retours à la ligne et entrées vides écartés", () => {
    expect(lireModificationVersion({ motsCles: "sac à dos,  Nike ,,rucksack\nbackpack, " })).toEqual({ ok: true, donnees: { motsCles: "sac à dos, Nike, rucksack, backpack" } });
    expect(lireModificationVersion({ motsCles: "m".repeat(MOTS_CLES_MAX + 1) }).ok).toBe(false);
    expect(lireModificationVersion({ motsCles: ["a"] }).ok).toBe(false);
  });

  it("SKU : les règles de lireSkuAnnonce, et vide = null", () => {
    expect(lireModificationVersion({ skuAnnonce: "" })).toEqual({ ok: true, donnees: { skuAnnonce: null } });
    expect(lireModificationVersion({ skuAnnonce: "SDN 40" }).ok).toBe(false);
  });

  it("un champ invalide refuse TOUT le corps : rien n'est écrit à moitié", () => {
    expect(lireModificationVersion({ titre: "ok", motsCles: 5 }).ok).toBe(false);
    expect(lireModificationVersion({ titre: "a".repeat(101), description: "ok" }).ok).toBe(false);
  });
});

describe("la Version 1 n'est jamais modifiable (étape 4)", () => {
  it("pas d'id, id vide ou numéro 1 : c'est la Version 1", () => {
    for (const id of [null, undefined, "", "  ", "1", " 1 "]) expect(viseVersionUn(id), String(id)).toBe(true);
    for (const id of ["clx9k2h0a0000abcd", "2", "e2e-version-2"]) expect(viseVersionUn(id), id).toBe(false);
  });

  it("une ligne de base qui porterait le numéro 1 serait la Version 1", () => {
    expect(estVersionUn({ numero: 1 })).toBe(true);
    expect(estVersionUn({ numero: 2 })).toBe(false);
  });
});

describe("normalisation", () => {
  it("découpe et recolle les mots-clés dans le format de l'annonce", () => {
    expect(decouperMotsCles("a,b ,  c\n d,,")).toEqual(["a", "b", "c", "d"]);
    expect(normaliserMotsCles("a,b ,  c")).toBe("a, b, c");
    expect(normaliserMotsCles("")).toBe("");
    expect(normaliserTitre("  a \t b\n c ")).toBe("a b c");
  });
});

describe("urlZipVersion — « Télécharger les N photos »", () => {
  it("une version enregistrée : le coloris et le numéro, rien d'autre", () => {
    expect(urlZipVersion({ cle: "5039-black-pink", numero: 2, sku: "SDN3" })).toBe("/api/studio/versions/zip?cle=5039-black-pink&numero=2");
  });
  it("la Version 1 : avec le SKU du sac", () => {
    expect(urlZipVersion({ cle: "5039-black-pink", numero: 1, sku: "SDN3" })).toBe("/api/studio/versions/zip?cle=5039-black-pink&numero=1&sku=SDN3");
    expect(urlZipVersion({ cle: "a b/c", numero: 1, sku: null })).toBe("/api/studio/versions/zip?cle=a%20b%2Fc&numero=1");
  });
});

describe("les réglages de retouche voyagent avec les versions enregistrées, pas avec la Version 1", () => {
  it("versionsAffichees recopie `retouches` des versions enregistrées ; la Version 1 n'en a pas", () => {
    const retouches = [{ angle: 8, modeRotation: "zoom" as const, recadragePct: 0, cadre: null }];
    const liste = versionsAffichees({ sku: "SDN12", titre: "T", description: TIRETS, motsCles: MOTS, photos: ["e1"] }, [
      { id: "a", numero: 2, skuSource: "SDN12", titre: "T", description: TIRETS, motsCles: MOTS, skuAnnonce: null, createdAt: "2026-11-17T10:00:00.000Z", photos: ["c1"], retouches },
    ]);
    expect(liste[0].retouches).toBeUndefined();
    expect(liste[1].retouches).toEqual(retouches);
  });
});
