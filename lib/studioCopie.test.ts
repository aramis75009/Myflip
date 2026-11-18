import { readFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { EMPREINTE_RE, cheminImage } from "./studioBlob";
import { creerCopieRetouchee, empreinteDe, type DepsCopie, type DonneesCopie, type ReferenceSource } from "./studioCopie";
import { rendreCopieRetouchee } from "./studioPivotRendu";
import { cleRetouche, retoucheDePivot, type Retouche } from "./studioRetouche";

const USER = "ckuserid0001";
const ORIGINALE: ReferenceSource = {
  id: "ref-originale",
  colorisId: "coloris-5039",
  sku: "SDN15",
  role: "face",
  urlImage: `https://x.supabase.co/storage/v1/object/myflip-studio/references/${USER}/${"a".repeat(64)}.jpg`,
  copieDeId: null,
};

/** Un aplat vert 300 × 400 : l'« original » stocké. */
const jpegOriginal = () =>
  sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 0, g: 160, b: 0 } } })
    .jpeg({ quality: 90 })
    .toBuffer();

type Journal = {
  lectures: string[];
  rendus: string[];
  depots: { empreinte: string; octets: number }[];
  creations: DonneesCopie[];
  retraits: string[];
};

/**
 * Faux dépendances, qui journalisent ce qu'on leur demande. Aucune n'a de
 * méthode qui écrive sur l'original : si le code en appelait une, le test
 * l'attraperait par le journal (`creations` ne contient que la copie).
 */
function fausses(
  surcharges: Partial<DepsCopie> = {},
  { reference = ORIGINALE, octets }: { reference?: ReferenceSource | null; octets?: Buffer | null } = {},
) {
  const journal: Journal = { lectures: [], rendus: [], depots: [], creations: [], retraits: [] };
  const deps: DepsCopie = {
    lireReference: async () => reference,
    copieExistante: async () => null,
    empreinteConnue: async () => null,
    lireOctets: async (url) => {
      journal.lectures.push(url);
      return octets === undefined ? Buffer.from("source") : octets;
    },
    rendre: async (source, retouche) => {
      journal.rendus.push(cleRetouche(retouche));
      return { jpeg: Buffer.concat([source, Buffer.from(`retouche:${cleRetouche(retouche)}`)]), largeur: 300, hauteur: 400 };
    },
    deposer: async (jpeg, empreinte) => {
      journal.depots.push({ empreinte, octets: jpeg.length });
      return `https://x.supabase.co/storage/v1/object/myflip-studio/references/${USER}/${empreinte}.jpg`;
    },
    creer: async (donnees) => {
      journal.creations.push(donnees);
      return { id: "ref-copie" };
    },
    retirerFichier: async (url) => {
      journal.retraits.push(url);
    },
    ...surcharges,
  };
  return { deps, journal };
}

describe("creerCopieRetouchee, angle seul (copie « Pivoter ») — la copie", () => {
  it("crée une nouvelle ligne liée à l'original, même coloris, hors tableau, sans toucher à l'original", async () => {
    const { deps, journal } = fausses();
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) });

    expect(res).toEqual({ ok: true, id: "ref-copie", retouche: retoucheDePivot(8), largeur: 300, hauteur: 400 });
    // Une seule écriture en base : la copie.
    expect(journal.creations).toHaveLength(1);
    const copie = journal.creations[0];
    expect(copie).toMatchObject({ colorisId: "coloris-5039", sku: "SDN15", role: "face", copieDeId: ORIGINALE.id, angleCopie: 8 });
    // Une copie « angle seul, zoom » (celles de l'ancien « Pivoter ») garde angleCopie et sa clé.
    expect(copie.retouche).toEqual({ angle: 8, modeRotation: "zoom", recadragePct: 0, cadre: null });
    expect(copie.retoucheCle).toBe("a8|zoom|r0|c-");
    // Ni numéro de prise ni nom de prise : une copie n'est pas une ligne du tableau.
    expect(copie).not.toHaveProperty("ordre");
    expect(copie).not.toHaveProperty("prise");
    // L'original n'a été que LU : un seul fichier lu, c'est le sien.
    expect(journal.lectures).toEqual([ORIGINALE.urlImage]);
    // Un seul dépôt, ailleurs que chez l'original.
    expect(journal.depots).toHaveLength(1);
    expect(copie.urlImage).not.toBe(ORIGINALE.urlImage);
  });

  it("range le fichier sous l'empreinte de SES octets, au même chemin que l'import (references/<userId>/<sha256>.jpg)", async () => {
    const { deps, journal } = fausses();
    await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(-8) });
    const { empreinte } = journal.depots[0];
    expect(empreinte).toMatch(EMPREINTE_RE);
    // Le nom est le SHA-256 du JPEG rendu…
    const rendu = Buffer.concat([Buffer.from("source"), Buffer.from(`retouche:${cleRetouche(retoucheDePivot(-8))}`)]);
    expect(empreinte).toBe(empreinteDe(rendu));
    // …et c'est un chemin que le module de stockage accepte tel quel.
    expect(() => cheminImage("references", USER, empreinte, "jpg")).not.toThrow();
    // Jamais le nom de l'original.
    expect(empreinte).not.toBe("a".repeat(64));
  });

  it("deux angles donnent deux fichiers : −8° et +8° ne se confondent pas", async () => {
    const un = fausses();
    const deux = fausses();
    await creerCopieRetouchee(un.deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) });
    await creerCopieRetouchee(deux.deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(-8) });
    expect(un.journal.depots[0].empreinte).not.toBe(deux.journal.depots[0].empreinte);
  });
});

describe("creerCopieRetouchee, angle seul (copie « Pivoter ») — la règle anti-doublon par empreinte", () => {
  it("n'est PAS rejetée à tort : l'original est déjà conservé (sur cette carte ou une autre), sa copie a une autre empreinte", async () => {
    // Le compte connaît déjà l'empreinte de l'ORIGINAL (c'est la photo déjà importée, éventuellement sur une autre carte).
    const connues = new Set(["a".repeat(64)]);
    const { deps, journal } = fausses({ empreinteConnue: async (e) => (connues.has(e) ? { id: "autre-ligne" } : null) });
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) });
    expect(res.ok).toBe(true);
    expect(journal.creations).toHaveLength(1);
  });

  it("refuse la copie EXACTEMENT identique (mêmes octets) sans rien déposer ni créer", async () => {
    const { deps, journal } = fausses({ empreinteConnue: async () => ({ id: "ligne-identique" }) });
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) });
    expect(res).toMatchObject({ ok: false, code: "deja_la", existante: "ligne-identique" });
    expect(journal.depots).toEqual([]);
    expect(journal.creations).toEqual([]);
  });

  it("refuse une copie qui existe déjà pour cette photo et cet angle, avant même de rendre", async () => {
    const { deps, journal } = fausses({ copieExistante: async () => ({ id: "copie-8" }) });
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) });
    expect(res).toMatchObject({ ok: false, code: "deja_la", existante: "copie-8", message: "Une copie à +8° existe déjà." });
    expect(journal.lectures).toEqual([]);
    expect(journal.rendus).toEqual([]);
    expect(journal.depots).toEqual([]);
  });

  it("ne touche pas à la règle de l'import : la route POST /api/studio/references garde son dédoublonnage et ignore les copies", () => {
    const source = readFileSync(path.join(__dirname, "..", "app/api/studio/references/route.ts"), "utf8");
    // Le prédicat de dédoublonnage et son effet sont toujours là, tels quels.
    expect(source).toContain("urlImage: { endsWith: `/${e}.jpg` }");
    expect(source).toContain("if (connues.has(empreintes[i]))");
    expect(source).toContain("doublons++");
    // L'import ne sait rien des copies retouchées : aucune exception n'y a été glissée.
    expect(source).not.toMatch(/copieDeId|angleCopie|studioCopie|studioPivot/);
  });
});

describe("creerCopieRetouchee, angle seul (copie « Pivoter ») — refus", () => {
  it("accepte les bornes −45 et +45", async () => {
    for (const angle of [-45, 45, 1, -1]) {
      const { deps } = fausses();
      expect((await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(angle) })).ok).toBe(true);
    }
  });

  it("photo inconnue (ou d'un autre compte : la dépendance est scopée) → introuvable", async () => {
    const { deps, journal } = fausses({}, { reference: null });
    expect(await creerCopieRetouchee(deps, { referenceId: "x", retouche: retoucheDePivot(8) })).toMatchObject({ ok: false, code: "introuvable" });
    expect(journal.depots).toEqual([]);
  });

  it("on ne retouche pas une copie : chaque copie part de l'original", async () => {
    const { deps, journal } = fausses({}, { reference: { ...ORIGINALE, id: "une-copie", copieDeId: ORIGINALE.id } });
    expect(await creerCopieRetouchee(deps, { referenceId: "une-copie", retouche: retoucheDePivot(8) })).toMatchObject({ ok: false, code: "est_une_copie" });
    expect(journal.lectures).toEqual([]);
  });

  it("fichier de l'original disparu → image_introuvable, rien n'est créé", async () => {
    const { deps, journal } = fausses({}, { octets: null });
    expect(await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) })).toMatchObject({ ok: false, code: "image_introuvable" });
    expect(journal.creations).toEqual([]);
  });

  it("rendu en échec → rendu_impossible, rien n'est déposé ni créé", async () => {
    const { deps, journal } = fausses({
      rendre: async () => {
        throw new Error("sharp : chemin /secret");
      },
    });
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) });
    expect(res).toMatchObject({ ok: false, code: "rendu_impossible", message: "La photo n’a pas pu être pivotée." });
    // Le message de sharp n'est pas relayé à l'écran.
    expect(JSON.stringify(res)).not.toContain("secret");
    expect(journal.depots).toEqual([]);
    expect(journal.creations).toEqual([]);
  });
});

describe("creerCopieRetouchee, angle seul (copie « Pivoter ») — concurrence et pannes", () => {
  it("contrainte d'unicité violée (deux clics) → deja_la, et le fichier déposé en trop est retiré", async () => {
    const { deps, journal } = fausses({ creer: async () => null, copieExistante: (() => {
      let appels = 0;
      return async () => (++appels === 1 ? null : { id: "copie-du-premier-clic" });
    })() });
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) });
    expect(res).toMatchObject({ ok: false, code: "deja_la", existante: "copie-du-premier-clic" });
    expect(journal.retraits).toHaveLength(1);
    expect(journal.retraits[0]).toContain(journal.depots[0].empreinte);
  });

  it("création en échec → le fichier déposé est retiré, l'erreur remonte", async () => {
    const { deps, journal } = fausses({
      creer: async () => {
        throw new Error("base indisponible");
      },
    });
    await expect(creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) })).rejects.toThrow("base indisponible");
    expect(journal.retraits).toHaveLength(1);
  });

  it("un nettoyage qui échoue ne masque pas l'erreur d'origine", async () => {
    const { deps } = fausses({
      creer: async () => {
        throw new Error("base indisponible");
      },
      retirerFichier: async () => {
        throw new Error("stockage indisponible");
      },
    });
    await expect(creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) })).rejects.toThrow("base indisponible");
  });
});

describe("creerCopieRetouchee, angle seul (copie « Pivoter ») — avec le vrai rendu sharp", () => {
  it("la copie a les dimensions de l'original, d'autres octets, un nom valide, et l'original reste intact", async () => {
    const original = await jpegOriginal();
    const avant = empreinteDe(original);
    const { deps, journal } = fausses({ rendre: rendreCopieRetouchee }, { octets: original });
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) });
    expect(res).toMatchObject({ ok: true, largeur: 300, hauteur: 400 });
    expect(journal.depots[0].empreinte).toMatch(EMPREINTE_RE);
    expect(journal.depots[0].empreinte).not.toBe(avant);
    // Les octets de l'original n'ont pas bougé (la fonction ne reçoit qu'un Buffer, qu'elle ne modifie pas).
    expect(empreinteDe(original)).toBe(avant);
  });
});

// ── Retouches par lot (17/11) : la même orchestration, réglages complets ─────

const CADRE_BEIGE: Retouche = { angle: -3, modeRotation: "bordsBlancs", recadragePct: 15, cadre: { couleur: "#E6DCCB", epaisseurPct: 4, adoucissement: 35 } };

describe("creerCopieRetouchee", () => {
  it("range les réglages complets et leur clé ; angleCopie reste null hors « angle seul, zoom »", async () => {
    const { deps, journal } = fausses();
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: CADRE_BEIGE });
    expect(res).toMatchObject({ ok: true, id: "ref-copie" });
    const copie = journal.creations[0];
    // Couleur normalisée en minuscules.
    expect(copie.retouche).toEqual({ angle: -3, modeRotation: "bordsBlancs", recadragePct: 15, cadre: { couleur: "#e6dccb", epaisseurPct: 4, adoucissement: 35 } });
    expect(copie.retoucheCle).toBe("a-3|bordsBlancs|r15|c#e6dccb/4/35");
    // L'index unique historique (copieDeId, angleCopie) ne gêne pas une copie à −3° avec cadre.
    expect(copie.angleCopie).toBeNull();
    expect(journal.lectures).toEqual([ORIGINALE.urlImage]);
    expect(journal.rendus).toEqual(["a-3|bordsBlancs|r15|c#e6dccb/4/35"]);
  });

  it("deux retouches au même angle (avec et sans cadre) donnent deux fichiers", async () => {
    const un = fausses();
    const deux = fausses();
    await creerCopieRetouchee(un.deps, { referenceId: ORIGINALE.id, retouche: retoucheDePivot(8) });
    await creerCopieRetouchee(deux.deps, { referenceId: ORIGINALE.id, retouche: { ...retoucheDePivot(8), cadre: { couleur: "#ffffff", epaisseurPct: 4, adoucissement: 0 } } });
    expect(un.journal.depots[0].empreinte).not.toBe(deux.journal.depots[0].empreinte);
  });

  it("la même retouche déjà faite (copie pivotée d'avant la refonte comprise) rend l'existante, sans rien rendre", async () => {
    const vues: Retouche[] = [];
    const { deps, journal } = fausses({
      copieExistante: async (_id, r) => {
        vues.push(r);
        return { id: "copie-pivotee-16-11" };
      },
    });
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: { angle: 8, modeRotation: "zoom", recadragePct: 0, cadre: null } });
    expect(res).toMatchObject({ ok: false, code: "deja_la", existante: "copie-pivotee-16-11" });
    expect(vues).toEqual([retoucheDePivot(8)]);
    expect(journal.rendus).toEqual([]);
    expect(journal.depots).toEqual([]);
  });

  it("refuse des réglages invalides ou sans effet, sans rien lire", async () => {
    for (const retouche of [
      null,
      { angle: 8 },
      { angle: 8, modeRotation: "zoom", recadragePct: 31, cadre: null },
      { angle: 8, modeRotation: "zoom", recadragePct: 0, cadre: { couleur: "beige", epaisseurPct: 4, adoucissement: 35 } },
      { angle: 8, modeRotation: "zoom", recadragePct: 0, cadre: { couleur: "#ffffff", epaisseurPct: 16, adoucissement: 35 } },
    ]) {
      const { deps, journal } = fausses({ lireReference: async () => { throw new Error("ne doit pas être appelé"); } });
      expect(await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche }), JSON.stringify(retouche)).toMatchObject({ ok: false, code: "retouche_invalide" });
      expect(journal.lectures).toEqual([]);
    }
    const { deps } = fausses();
    expect(await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: { angle: 0, modeRotation: "bordsBlancs", recadragePct: 0, cadre: null } })).toMatchObject({
      ok: false,
      code: "retouche_vide",
    });
  });

  it("avec le vrai rendu sharp : dimensions de l'original, autres octets, original intact", async () => {
    const original = await jpegOriginal();
    const avant = empreinteDe(original);
    const { deps, journal } = fausses({ rendre: rendreCopieRetouchee }, { octets: original });
    const res = await creerCopieRetouchee(deps, { referenceId: ORIGINALE.id, retouche: CADRE_BEIGE });
    expect(res).toMatchObject({ ok: true, largeur: 300, hauteur: 400 });
    expect(journal.depots[0].empreinte).toMatch(EMPREINTE_RE);
    expect(journal.depots[0].empreinte).not.toBe(avant);
    expect(empreinteDe(original)).toBe(avant);
  });
});
