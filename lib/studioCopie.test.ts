import { readFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { EMPREINTE_RE, cheminImage } from "./studioBlob";
import { creerCopiePivotee, empreinteDe, type DepsCopie, type DonneesCopie, type ReferenceSource } from "./studioCopie";
import { rendreCopiePivotee } from "./studioPivotRendu";

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
  rendus: number[];
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
    rendre: async (source, angle) => {
      journal.rendus.push(angle);
      return { jpeg: Buffer.concat([source, Buffer.from(`pivote:${angle}`)]), largeur: 300, hauteur: 400 };
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

describe("creerCopiePivotee — la copie", () => {
  it("crée une nouvelle ligne liée à l'original, même coloris, hors tableau, sans toucher à l'original", async () => {
    const { deps, journal } = fausses();
    const res = await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 });

    expect(res).toEqual({ ok: true, id: "ref-copie", angle: 8, largeur: 300, hauteur: 400 });
    // Une seule écriture en base : la copie.
    expect(journal.creations).toHaveLength(1);
    const copie = journal.creations[0];
    expect(copie).toMatchObject({ colorisId: "coloris-5039", sku: "SDN15", role: "face", copieDeId: ORIGINALE.id, angleCopie: 8 });
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
    await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: -8 });
    const { empreinte } = journal.depots[0];
    expect(empreinte).toMatch(EMPREINTE_RE);
    // Le nom est le SHA-256 du JPEG rendu…
    const rendu = Buffer.concat([Buffer.from("source"), Buffer.from("pivote:-8")]);
    expect(empreinte).toBe(empreinteDe(rendu));
    // …et c'est un chemin que le module de stockage accepte tel quel.
    expect(() => cheminImage("references", USER, empreinte, "jpg")).not.toThrow();
    // Jamais le nom de l'original.
    expect(empreinte).not.toBe("a".repeat(64));
  });

  it("deux angles donnent deux fichiers : −8° et +8° ne se confondent pas", async () => {
    const un = fausses();
    const deux = fausses();
    await creerCopiePivotee(un.deps, { referenceId: ORIGINALE.id, angle: 8 });
    await creerCopiePivotee(deux.deps, { referenceId: ORIGINALE.id, angle: -8 });
    expect(un.journal.depots[0].empreinte).not.toBe(deux.journal.depots[0].empreinte);
  });
});

describe("creerCopiePivotee — la règle anti-doublon par empreinte", () => {
  it("n'est PAS rejetée à tort : l'original est déjà conservé (sur cette carte ou une autre), sa copie a une autre empreinte", async () => {
    // Le compte connaît déjà l'empreinte de l'ORIGINAL (c'est la photo déjà importée, éventuellement sur une autre carte).
    const connues = new Set(["a".repeat(64)]);
    const { deps, journal } = fausses({ empreinteConnue: async (e) => (connues.has(e) ? { id: "autre-ligne" } : null) });
    const res = await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 });
    expect(res.ok).toBe(true);
    expect(journal.creations).toHaveLength(1);
  });

  it("refuse la copie EXACTEMENT identique (mêmes octets) sans rien déposer ni créer", async () => {
    const { deps, journal } = fausses({ empreinteConnue: async () => ({ id: "ligne-identique" }) });
    const res = await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 });
    expect(res).toMatchObject({ ok: false, code: "deja_la", existante: "ligne-identique" });
    expect(journal.depots).toEqual([]);
    expect(journal.creations).toEqual([]);
  });

  it("refuse une copie qui existe déjà pour cette photo et cet angle, avant même de rendre", async () => {
    const { deps, journal } = fausses({ copieExistante: async () => ({ id: "copie-8" }) });
    const res = await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 });
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
    // L'import ne sait rien des copies pivotées : aucune exception n'y a été glissée.
    expect(source).not.toMatch(/copieDeId|angleCopie|studioCopie|studioPivot/);
  });
});

describe("creerCopiePivotee — refus", () => {
  it("refuse un angle nul, hors plage, décimal ou qui n'est pas un nombre, sans rien lire", async () => {
    for (const angle of [0, 46, -46, 8.5, "8", null, undefined, Number.NaN]) {
      const { deps, journal } = fausses({
        lireReference: async () => {
          throw new Error("ne doit pas être appelé");
        },
      });
      const res = await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle });
      expect(res, String(angle)).toMatchObject({ ok: false, code: "angle_invalide" });
      expect(journal.lectures).toEqual([]);
    }
  });

  it("accepte les bornes −45 et +45", async () => {
    for (const angle of [-45, 45, 1, -1]) {
      const { deps } = fausses();
      expect((await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle })).ok).toBe(true);
    }
  });

  it("photo inconnue (ou d'un autre compte : la dépendance est scopée) → introuvable", async () => {
    const { deps, journal } = fausses({}, { reference: null });
    expect(await creerCopiePivotee(deps, { referenceId: "x", angle: 8 })).toMatchObject({ ok: false, code: "introuvable" });
    expect(journal.depots).toEqual([]);
  });

  it("on ne pivote pas une copie : chaque copie part de l'original", async () => {
    const { deps, journal } = fausses({}, { reference: { ...ORIGINALE, id: "une-copie", copieDeId: ORIGINALE.id } });
    expect(await creerCopiePivotee(deps, { referenceId: "une-copie", angle: 8 })).toMatchObject({ ok: false, code: "est_une_copie" });
    expect(journal.lectures).toEqual([]);
  });

  it("fichier de l'original disparu → image_introuvable, rien n'est créé", async () => {
    const { deps, journal } = fausses({}, { octets: null });
    expect(await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 })).toMatchObject({ ok: false, code: "image_introuvable" });
    expect(journal.creations).toEqual([]);
  });

  it("rendu en échec → rendu_impossible, rien n'est déposé ni créé", async () => {
    const { deps, journal } = fausses({
      rendre: async () => {
        throw new Error("sharp : chemin /secret");
      },
    });
    const res = await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 });
    expect(res).toMatchObject({ ok: false, code: "rendu_impossible", message: "La photo n’a pas pu être pivotée." });
    // Le message de sharp n'est pas relayé à l'écran.
    expect(JSON.stringify(res)).not.toContain("secret");
    expect(journal.depots).toEqual([]);
    expect(journal.creations).toEqual([]);
  });
});

describe("creerCopiePivotee — concurrence et pannes", () => {
  it("contrainte d'unicité violée (deux clics) → deja_la, et le fichier déposé en trop est retiré", async () => {
    const { deps, journal } = fausses({ creer: async () => null, copieExistante: (() => {
      let appels = 0;
      return async () => (++appels === 1 ? null : { id: "copie-du-premier-clic" });
    })() });
    const res = await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 });
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
    await expect(creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 })).rejects.toThrow("base indisponible");
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
    await expect(creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 })).rejects.toThrow("base indisponible");
  });
});

describe("creerCopiePivotee — avec le vrai rendu sharp", () => {
  it("la copie a les dimensions de l'original, d'autres octets, un nom valide, et l'original reste intact", async () => {
    const original = await jpegOriginal();
    const avant = empreinteDe(original);
    const { deps, journal } = fausses({ rendre: rendreCopiePivotee }, { octets: original });
    const res = await creerCopiePivotee(deps, { referenceId: ORIGINALE.id, angle: 8 });
    expect(res).toMatchObject({ ok: true, largeur: 300, hauteur: 400 });
    expect(journal.depots[0].empreinte).toMatch(EMPREINTE_RE);
    expect(journal.depots[0].empreinte).not.toBe(avant);
    // Les octets de l'original n'ont pas bougé (la fonction ne reçoit qu'un Buffer, qu'elle ne modifie pas).
    expect(empreinteDe(original)).toBe(avant);
  });
});
