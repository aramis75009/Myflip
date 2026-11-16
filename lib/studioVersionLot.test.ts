import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { empreinteDe, type DepsCopie, type DonneesCopie } from "./studioCopie";
import { rendreCopieRetouchee } from "./studioPivotRendu";
import { cleRetouche, estPivotSeul, type Retouche } from "./studioRetouche";
import { prochainNumero, type VersionEnBase } from "./studioVersion";
import { creerVersionRetouchee, type DepsVersion } from "./studioVersionLot";

const COLORIS = "coloris-5039";
const TIRETS = "- Sac à dos Nike Elite, noir et orange\n- Expédition soignée";
const LOT: Retouche = { angle: 8, modeRotation: "zoom", recadragePct: 10, cadre: { couleur: "#e6dccb", epaisseurPct: 4, adoucissement: 35 } };

type Ligne = { id: string; colorisId: string | null; sku: string | null; role: string; urlImage: string; copieDeId: string | null; angleCopie: number | null; retoucheCle: string | null };

/**
 * Une base et un stockage EN MÉMOIRE, qui se comportent comme les vrais
 * (`lib/studioCopieServeur.ts`, `lib/studioVersionServeur.ts`) : index unique
 * par photo et retouche, dépôt par empreinte qui ÉCRASE un même nom (comme
 * `x-upsert`), numérotation des versions. Ce qui permet de vérifier, octet par
 * octet, que les originaux ne bougent pas.
 */
function memoire({ rendre }: { rendre?: DepsCopie["rendre"] } = {}) {
  const lignes = new Map<string, Ligne>();
  const fichiers = new Map<string, Buffer>();
  const versions: VersionEnBase[] = [];
  const journal = { rendus: 0, depots: 0, retraitsCopies: [] as string[][], textes: [] as string[] };
  let n = 0;

  const ajouterOriginale = (id: string, octets: Buffer, colorisId = COLORIS) => {
    const url = `mem://references/u/${empreinteDe(octets)}.jpg`;
    fichiers.set(url, octets);
    lignes.set(id, { id, colorisId, sku: null, role: "face", urlImage: url, copieDeId: null, angleCopie: null, retoucheCle: null });
  };

  const copie: DepsCopie = {
    lireReference: async (id) => lignes.get(id) ?? null,
    copieExistante: async (originaleId, r) =>
      [...lignes.values()].find(
        (l) => l.copieDeId === originaleId && (l.retoucheCle === cleRetouche(r) || (l.retoucheCle === null && estPivotSeul(r) && l.angleCopie === r.angle)),
      ) ?? null,
    empreinteConnue: async (e) => [...lignes.values()].find((l) => l.urlImage.endsWith(`/${e}.jpg`)) ?? null,
    lireOctets: async (url) => fichiers.get(url) ?? null,
    rendre:
      rendre ??
      (async (octets, r) => {
        journal.rendus++;
        return { jpeg: Buffer.concat([octets, Buffer.from(`|${cleRetouche(r)}`)]), largeur: 300, hauteur: 400 };
      }),
    deposer: async (jpeg, e) => {
      journal.depots++;
      const url = `mem://references/u/${e}.jpg`;
      fichiers.set(url, jpeg); // écrase un même nom, comme le vrai stockage
      return url;
    },
    creer: async (d: DonneesCopie) => {
      const doublon = [...lignes.values()].some(
        (l) => l.copieDeId === d.copieDeId && (l.retoucheCle === d.retoucheCle || (d.angleCopie !== null && l.angleCopie === d.angleCopie)),
      );
      if (doublon) return null;
      const id = `copie-${++n}`;
      lignes.set(id, { id, colorisId: d.colorisId, sku: d.sku, role: d.role, urlImage: d.urlImage, copieDeId: d.copieDeId, angleCopie: d.angleCopie, retoucheCle: d.retoucheCle });
      return { id };
    },
    retirerFichier: async (url) => {
      if (![...lignes.values()].some((l) => l.urlImage === url)) fichiers.delete(url);
    },
  };

  const deps: DepsVersion = {
    copie,
    lirePhoto: async (id) => {
      const l = lignes.get(id);
      return l ? { id: l.id, colorisId: l.colorisId, copieDeId: l.copieDeId } : null;
    },
    texteVersionUn: async (sku) => {
      journal.textes.push(sku);
      return { titre: "Sac à dos Nike Elite noir et orange - très bon état", description: TIRETS, motsCles: "sac à dos, Nike Elite" };
    },
    creerVersion: async (d) => {
      const v: VersionEnBase = {
        id: `version-${versions.length + 1}`,
        numero: prochainNumero(versions.filter((x) => x.id).map((x) => x.numero)),
        skuSource: d.skuSource,
        titre: d.titre,
        description: d.description,
        motsCles: d.motsCles,
        skuAnnonce: null,
        createdAt: new Date(0).toISOString(),
        photos: d.photos,
      };
      versions.push(v);
      return v;
    },
    retirerCopies: async (ids) => {
      journal.retraitsCopies.push(ids);
      for (const id of ids) {
        const l = lignes.get(id);
        if (!l || l.copieDeId === null) continue;
        lignes.delete(id);
        await copie.retirerFichier(l.urlImage);
      }
    },
  };
  return { deps, lignes, fichiers, versions, journal, ajouterOriginale };
}

const SIX = ["ref-1", "ref-2", "ref-3", "ref-4", "ref-5", "ref-6"];
const octetsDe = (i: number) => Buffer.from(`photo-${i}`);

function avecSixPhotos(options?: Parameters<typeof memoire>[0]) {
  const m = memoire(options);
  SIX.forEach((id, i) => m.ajouterOriginale(id, octetsDe(i)));
  return m;
}

/** Empreinte de chaque original : sa ligne et ses octets. */
const etatDesOriginaux = (m: ReturnType<typeof memoire>) =>
  SIX.map((id) => {
    const l = m.lignes.get(id);
    return { ligne: JSON.stringify(l), octets: l ? empreinteDe(m.fichiers.get(l.urlImage) as Buffer) : null };
  });

describe("creerVersionRetouchee — un lot de 6", () => {
  it("6 photos cochées → 6 copies et UNE version, dans l'ordre de la planche, originaux intacts", async () => {
    const m = avecSixPhotos();
    const avant = etatDesOriginaux(m);
    const res = await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: "sdn12", referenceIds: SIX, retouche: LOT });

    expect(res).toMatchObject({ ok: true, copiesCreees: 6, copiesReprises: 0, originales: 0 });
    if (!res.ok) return;
    expect(m.versions).toHaveLength(1);
    expect(res.version.numero).toBe(2);
    // Une copie par photo, liée à SON original, dans l'ordre des cases cochées.
    expect(res.version.photos).toHaveLength(6);
    expect(res.version.photos.map((id) => m.lignes.get(id)?.copieDeId)).toEqual(SIX);
    expect(new Set(res.version.photos).size).toBe(6);
    // Les originaux : mêmes lignes, mêmes octets.
    expect(etatDesOriginaux(m)).toEqual(avant);
    // Aucun fichier d'original n'a été visé par un dépôt.
    for (const id of res.version.photos) expect(m.lignes.get(id)?.urlImage).not.toBe(m.lignes.get(m.lignes.get(id)?.copieDeId as string)?.urlImage);
  });

  it("le texte vient de la Version 1 du sac affiché (copié), tirets compris, SKU d'annonce vide", async () => {
    const m = avecSixPhotos();
    const res = await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: "SDN12", referenceIds: SIX, retouche: LOT });
    expect(m.journal.textes).toEqual(["SDN12"]);
    expect(res).toMatchObject({ ok: true, version: { skuSource: "SDN12", description: TIRETS, motsCles: "sac à dos, Nike Elite", skuAnnonce: null } });
  });

  it("deux enregistrements identiques : pas de copie en double, mais bien deux versions (2 puis 3)", async () => {
    const m = avecSixPhotos();
    const un = await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: "SDN12", referenceIds: SIX, retouche: LOT });
    const lignesApres1 = m.lignes.size;
    const fichiersApres1 = m.fichiers.size;
    const deux = await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: "SDN12", referenceIds: SIX, retouche: LOT });
    expect(deux).toMatchObject({ ok: true, copiesCreees: 0, copiesReprises: 6 });
    expect(m.lignes.size).toBe(lignesApres1);
    expect(m.fichiers.size).toBe(fichiersApres1);
    expect(m.journal.rendus).toBe(6);
    if (!un.ok || !deux.ok) return;
    expect([un.version.numero, deux.version.numero]).toEqual([2, 3]);
    expect(deux.version.photos).toEqual(un.version.photos);
  });

  it("une copie pivotée d'avant la refonte (angle seul, zoom) est reprise, pas refaite", async () => {
    const m = avecSixPhotos();
    m.lignes.set("pivot-16-11", { id: "pivot-16-11", colorisId: COLORIS, sku: null, role: "face", urlImage: "mem://references/u/ancienne.jpg", copieDeId: "ref-1", angleCopie: 8, retoucheCle: null });
    const res = await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: null, referenceIds: ["ref-1", "ref-2"], retouche: { angle: 8, modeRotation: "zoom", recadragePct: 0, cadre: null } });
    expect(res).toMatchObject({ ok: true, copiesCreees: 1, copiesReprises: 1 });
    if (res.ok) expect(res.version.photos[0]).toBe("pivot-16-11");
  });

  it("sans aucune retouche : la version montre les photos d'origine, rien n'est rendu ni déposé", async () => {
    const m = avecSixPhotos();
    const res = await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: "SDN12", referenceIds: SIX, retouche: { angle: 0, modeRotation: "bordsBlancs", recadragePct: 0, cadre: null } });
    expect(res).toMatchObject({ ok: true, copiesCreees: 0, originales: 6 });
    if (res.ok) expect(res.version.photos).toEqual(SIX);
    expect(m.journal.rendus).toBe(0);
    expect(m.journal.depots).toBe(0);
  });
});

describe("creerVersionRetouchee — refus avant tout rendu", () => {
  const cas: [string, Partial<{ skuSource: unknown; referenceIds: unknown; retouche: unknown }>, string][] = [
    ["réglages invalides", { retouche: { ...LOT, recadragePct: 31 } }, "retouche_invalide"],
    ["aucune photo", { referenceIds: [] }, "photos_invalides"],
    ["plus de 15 photos", { referenceIds: Array.from({ length: 16 }, (_, i) => `r${i}`) }, "photos_invalides"],
    ["la même photo deux fois", { referenceIds: ["ref-1", "ref-1"] }, "photos_invalides"],
    ["un SKU illisible", { skuSource: "SDN 12" }, "sku_invalide"],
    ["une photo inconnue (ou d'un autre compte)", { referenceIds: ["ref-1", "inconnue"] }, "introuvable"],
    ["une photo d'un autre coloris", { referenceIds: ["ref-1", "autre"] }, "autre_coloris"],
    ["une copie cochée", { referenceIds: ["ref-1", "une-copie"] }, "est_une_copie"],
  ];
  for (const [nom, entree, code] of cas) {
    it(nom, async () => {
      const m = avecSixPhotos();
      m.ajouterOriginale("autre", Buffer.from("autre"), "coloris-autre");
      m.lignes.set("une-copie", { id: "une-copie", colorisId: COLORIS, sku: null, role: "face", urlImage: "mem://x.jpg", copieDeId: "ref-2", angleCopie: 3, retoucheCle: null });
      const lignesAvant = m.lignes.size;
      const res = await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: "SDN12", referenceIds: SIX, retouche: LOT, ...entree });
      expect(res).toMatchObject({ ok: false, code });
      expect(m.journal.rendus).toBe(0);
      expect(m.lignes.size).toBe(lignesAvant);
      expect(m.versions).toEqual([]);
    });
  }
});

describe("creerVersionRetouchee — pannes en cours de lot", () => {
  it("un rendu qui échoue à la 4e photo : les 3 copies déjà faites sont retirées, aucune version", async () => {
    let i = 0;
    const m = avecSixPhotos({
      rendre: async (octets) => {
        if (++i === 4) throw new Error("sharp : /chemin/secret");
        return { jpeg: Buffer.concat([octets, Buffer.from("|r")]), largeur: 300, hauteur: 400 };
      },
    });
    const avant = etatDesOriginaux(m);
    const res = await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: "SDN12", referenceIds: SIX, retouche: LOT });
    expect(res).toMatchObject({ ok: false, code: "rendu_impossible", message: "Photo 4 sur 6 : La photo n’a pas pu être retouchée." });
    expect(JSON.stringify(res)).not.toContain("secret");
    expect(m.journal.retraitsCopies).toEqual([["copie-1", "copie-2", "copie-3"]]);
    expect([...m.lignes.values()].filter((l) => l.copieDeId)).toEqual([]);
    expect(m.versions).toEqual([]);
    expect(etatDesOriginaux(m)).toEqual(avant);
  });

  it("la version ne peut pas être créée : les copies du lot sont retirées, celles reprises restent, l'erreur remonte", async () => {
    const m = avecSixPhotos();
    await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: null, referenceIds: ["ref-1"], retouche: LOT });
    const reprise = [...m.lignes.values()].find((l) => l.copieDeId === "ref-1")?.id;
    m.deps.creerVersion = async () => {
      throw new Error("base indisponible");
    };
    await expect(creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: null, referenceIds: ["ref-1", "ref-2"], retouche: LOT })).rejects.toThrow("base indisponible");
    expect(m.journal.retraitsCopies.at(-1)).toEqual(["copie-2"]);
    expect(m.lignes.has(reprise as string)).toBe(true);
  });
});

describe("creerVersionRetouchee — avec le vrai rendu sharp", () => {
  it("6 vraies photos : 6 JPEG aux dimensions des originaux, originaux identiques octet pour octet", async () => {
    const m = memoire({ rendre: rendreCopieRetouchee });
    const originaux = await Promise.all(
      SIX.map((_, i) =>
        sharp({ create: { width: 300, height: 400, channels: 3, background: { r: 20 * i, g: 160, b: 40 } } })
          .jpeg({ quality: 90 })
          .toBuffer(),
      ),
    );
    SIX.forEach((id, i) => m.ajouterOriginale(id, originaux[i]));
    const avant = etatDesOriginaux(m);
    const res = await creerVersionRetouchee(m.deps, { colorisId: COLORIS, skuSource: "SDN12", referenceIds: SIX, retouche: LOT });
    expect(res).toMatchObject({ ok: true, copiesCreees: 6 });
    if (!res.ok) return;
    for (const id of res.version.photos) {
      const jpeg = m.fichiers.get(m.lignes.get(id)?.urlImage as string) as Buffer;
      const meta = await sharp(jpeg).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 300, 400]);
    }
    expect(etatDesOriginaux(m)).toEqual(avant);
    SIX.forEach((id, i) => expect(m.fichiers.get(m.lignes.get(id)?.urlImage as string)?.equals(originaux[i])).toBe(true));
  });
});
