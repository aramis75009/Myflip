import { describe, expect, it } from "vitest";
import { deserialiser, meriteSauvegarde, serialiser } from "./_persistance";
import { etatInitial, reducerMev, type EtatMev } from "./_reducer";

function sessionRemplie(): EtatMev {
  let e = etatInitial("f0");
  e = reducerMev(e, { type: "fiche/ajout", id: "f1" });
  e = reducerMev(e, { type: "sku/saisie", id: "f0", sku: "PRL1" });
  e = reducerMev(e, { type: "sku/saisie", id: "f1", sku: "LAC3" });
  e = reducerMev(e, { type: "qcm", id: "f0", champ: "taille", valeur: "M" });
  e = reducerMev(e, { type: "qcm", id: "f0", champ: "etat", valeur: "Très bon état" });
  e = reducerMev(e, { type: "prompt", id: "f0", promptId: "prompt-rl" });
  return e;
}

describe("aller-retour", () => {
  it("restaure les SKU, les QCM et les prompts des 5 fiches", () => {
    const e = sessionRemplie();
    const r = deserialiser(serialiser(e));
    expect(r).not.toBeNull();
    expect(r!.fiches.map((f) => f.sku)).toEqual(["PRL1", "LAC3"]);
    expect(r!.fiches[0].qcm.taille).toBe("M");
    expect(r!.fiches[0].qcm.etat).toBe("Très bon état");
    expect(r!.fiches[0].promptId).toBe("prompt-rl");
  });

  it("ne restaure PAS l'article résolu : il sera relu, donc frais", () => {
    let e = sessionRemplie();
    e = reducerMev(e, { type: "sku/lookup", id: "f0", seq: 1 });
    e = reducerMev(e, {
      type: "sku/resolu",
      id: "f0",
      seq: 1,
      article: { id: "a1", sku: "PRL1", statut: "En stock" } as never,
    });
    const r = deserialiser(serialiser(e))!;
    expect(r.fiches[0].article).toBeNull();
    expect(r.fiches[0].lookup.phase).toBe("idle");
  });

  it("ne restaure pas les photos, et vide la sélection avec elles", () => {
    let e = sessionRemplie();
    e = reducerMev(e, {
      type: "photo/ajout",
      id: "f0",
      photos: [{ id: "p1", base: null, rotation: 0, url: "blob:p1", blob: {} as Blob }],
    });
    e = reducerMev(e, { type: "photo/selection", id: "f0", photoId: "p1" });
    const r = deserialiser(serialiser(e))!;
    expect(r.fiches[0].photos).toEqual([]);
    expect(r.fiches[0].selected).toEqual([]);
  });

  it("garde les annonces générées et repart à l'étape Export", () => {
    let e = sessionRemplie();
    e = reducerMev(e, {
      type: "generation/ok",
      id: "f0",
      resultat: { titre: "Polo RL", description: "D", motsCles: "M", promptNom: "P" },
    });
    const r = deserialiser(serialiser(e))!;
    expect(r.fiches[0].annonce.titre).toBe("Polo RL");
    expect(r.fiches[0].generation.phase).toBe("ok");
    expect(r.etape).toBe(4);
  });

  it("repart à l'étape 1 quand rien n'a été généré", () => {
    const r = deserialiser(serialiser(sessionRemplie()))!;
    expect(r.etape).toBe(1);
  });

  it("conserve la fiche active si elle existe encore", () => {
    let e = sessionRemplie();
    e = reducerMev(e, { type: "fiche/active", id: "f1" });
    expect(deserialiser(serialiser(e))!.active).toBe("f1");
  });
});

describe("refus des charges utiles invalides", () => {
  it("REFUSE l'ancien format mono-article (le piège du déploiement)", () => {
    // Forme réelle de l'ancienne clé `mev_state` : un objet plat, un article.
    const ancien = {
      sku: "PRL1",
      taille: "M",
      etat: "Très bon état",
      titre: "Polo",
      description: "…",
      motsCles: "…",
      step: 4,
    };
    expect(deserialiser(ancien)).toBeNull();
  });

  it("refuse une version inconnue", () => {
    const s = serialiser(sessionRemplie());
    expect(deserialiser({ ...s, version: 99 })).toBeNull();
    expect(deserialiser({ ...s, version: undefined })).toBeNull();
  });

  it("refuse une charge utile tronquée ou d'un autre type", () => {
    expect(deserialiser(null)).toBeNull();
    expect(deserialiser("mev")).toBeNull();
    expect(deserialiser(42)).toBeNull();
    expect(deserialiser({ version: 2, fiches: [] })).toBeNull();
    expect(deserialiser({ version: 2, fiches: [{ id: 1, sku: "X" }] })).toBeNull();
  });

  it("tolère des QCM partiels sans perdre les champs manquants", () => {
    const s = serialiser(sessionRemplie());
    const ampute = {
      ...s,
      fiches: [{ ...s.fiches[0], qcm: { taille: "L" } as never }],
    };
    const r = deserialiser(ampute)!;
    expect(r.fiches[0].qcm.taille).toBe("L");
    expect(r.fiches[0].qcm.etat).toBe("");
    expect(r.fiches[0].qcm.marqueCustom).toBe(false);
  });
});

describe("meriteSauvegarde", () => {
  it("ne sauve pas une session vierge", () => {
    expect(meriteSauvegarde(etatInitial("f0"))).toBe(false);
  });

  it("sauve dès qu'un SKU est saisi", () => {
    const e = reducerMev(etatInitial("f0"), { type: "sku/saisie", id: "f0", sku: "P" });
    expect(meriteSauvegarde(e)).toBe(true);
  });
});


describe("texte d'une version du Studio (étape 5)", () => {
  it("garde la version et le SKU d'annonce du texte : le SKU copié reste celui du texte après un rechargement", () => {
    let e = etatInitial("f0");
    e = reducerMev(e, { type: "sku/saisie", id: "f0", sku: "SDN3" });
    e = reducerMev(e, {
      type: "generation/ok",
      id: "f0",
      resultat: { titre: "T2", description: "- D2", motsCles: "m2", promptNom: "Version 2" },
      deVersion: { numero: 2, skuAnnonce: "SDN3-B" },
    });
    const r = deserialiser(JSON.parse(JSON.stringify(serialiser(e))))!;
    expect(r.fiches[0].texteDeVersion).toEqual({ numero: 2, skuAnnonce: "SDN3-B" });
    expect(r.fiches[0].generation.phase).toBe("ok");
  });

  it("une session écrite avant ce champ se relit : texte de l'IA, SKU du sac", () => {
    const ancienne = { version: 2, active: "f0", fiches: [{ id: "f0", sku: "SDN3", qcm: {}, promptId: null, annonce: { titre: "T", description: "D", motsCles: "M" }, genere: true }] };
    const r = deserialiser(ancienne)!;
    expect(r.fiches[0].texteDeVersion).toBeNull();
    expect(r.fiches[0].version).toBe(1);
    expect(r.fiches[0].studio).toBeNull();
  });

  it("ignore un champ mal formé", () => {
    for (const mauvais of [{ numero: 0, skuAnnonce: "X" }, { numero: 2, skuAnnonce: "" }, { numero: "2", skuAnnonce: "X" }, "x"]) {
      const brut = { version: 2, active: "f0", fiches: [{ id: "f0", sku: "SDN3", qcm: {}, promptId: null, annonce: { titre: "T", description: "", motsCles: "" }, genere: true, texteDeVersion: mauvais }] };
      expect(deserialiser(brut)!.fiches[0].texteDeVersion).toBeNull();
    }
  });
});
