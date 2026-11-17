import { readFileSync } from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import type { PhotoVersion } from "./studioVersion";
import { assemblerZip, fluxZip, lireEntreeZip, nomFichierPhoto, nomZip, type DepsZip, type OctetsPhoto, type VersionPourZip } from "./studioZip";

/** Des « fichiers stockés » : des octets reconnaissables (en-tête JPEG ou PNG + une charge propre à chaque photo). */
function octetsDe(graine: number, taille: number, png = false): Uint8Array {
  const entete = png ? [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] : [0xff, 0xd8, 0xff, 0xe0];
  const b = new Uint8Array(taille);
  b.set(entete);
  for (let i = entete.length; i < taille; i++) b[i] = (graine * 31 + i * 7 + (i >> 3)) & 0xff;
  return b;
}

const STOCK = new Map<string, OctetsPhoto>([
  ["ref-zeta", { octets: octetsDe(1, 3000), extension: "jpg" }],
  ["ref-alpha", { octets: octetsDe(2, 5000), extension: "jpg" }],
  ["essai-milieu", { octets: octetsDe(3, 4096, true), extension: "png" }],
  ["ref-omega", { octets: octetsDe(4, 1000), extension: "jpg" }],
]);

const cle = (p: PhotoVersion) => `${p.type}-${p.id}`;
const photo = (type: "ref" | "essai", id: string): PhotoVersion => ({ type, id });

function faux(version: VersionPourZip | null, autresComptes: string[] = []) {
  const lus: string[] = [];
  const deps: DepsZip = {
    lireVersion: async () => version,
    lireOctets: async (p) => {
      lus.push(cle(p));
      // Une photo d'un autre compte n'existe pas pour celui-ci : la dépendance réelle la rend introuvable.
      if (autresComptes.includes(cle(p))) return null;
      return STOCK.get(cle(p)) ?? null;
    },
  };
  return { deps, lus };
}

const ENTREE = { cle: "5039-black-pink", numero: 2, sku: null };
// L'ordre de la version n'est PAS l'ordre alphabétique des identifiants : zeta, alpha, milieu, omega.
const VERSION: VersionPourZip = {
  numero: 2,
  skuAnnonce: "SDN13",
  skuSource: "SDN12",
  photos: [photo("ref", "zeta"), photo("ref", "alpha"), photo("essai", "milieu"), photo("ref", "omega")],
};

describe("assemblerZip — le zip d'une version", () => {
  it("contient N fichiers, dans l'ordre de la version, numérotés 01, 02…, aux octets identiques aux originaux stockés", async () => {
    const { deps } = faux(VERSION);
    const res = await assemblerZip(deps, ENTREE);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const archive = unzipSync(res.zip);
    // Les noms, dans l'ordre : le zip est relu par une bibliothèque, pas par notre code.
    expect(Object.keys(archive)).toEqual(["01.jpg", "02.jpg", "03.png", "04.jpg"]);
    // Les octets : ceux du stockage, un par un.
    expect(Buffer.compare(archive["01.jpg"], STOCK.get("ref-zeta")!.octets)).toBe(0);
    expect(Buffer.compare(archive["02.jpg"], STOCK.get("ref-alpha")!.octets)).toBe(0);
    expect(Buffer.compare(archive["03.png"], STOCK.get("essai-milieu")!.octets)).toBe(0);
    expect(Buffer.compare(archive["04.jpg"], STOCK.get("ref-omega")!.octets)).toBe(0);
    // Et la liste `fichiers` de la réponse dit la même chose.
    expect(res.fichiers.map((f) => f.nom)).toEqual(Object.keys(archive));
  });

  it("sans recompression : chaque entrée est rangée telle quelle (STORE), sa taille stockée = sa taille d'origine", async () => {
    const { deps } = faux(VERSION);
    const res = await assemblerZip(deps, ENTREE);
    if (!res.ok) throw new Error("zip refusé");
    const infos: { nom: string; compression: number; taille: number; originale: number }[] = [];
    unzipSync(res.zip, {
      filter: (f) => {
        infos.push({ nom: f.name, compression: f.compression, taille: f.size, originale: f.originalSize });
        return true;
      },
    });
    expect(infos).toHaveLength(4);
    for (const i of infos) {
      expect(i.compression, i.nom).toBe(0);
      expect(i.taille, i.nom).toBe(i.originale);
    }
    // Le zip pèse les octets des photos + quelques dizaines d'octets d'en-têtes par fichier, pas un octet de moins.
    const total = [...STOCK.values()].reduce((s, o) => s + o.octets.byteLength, 0);
    expect(res.zip.byteLength).toBeGreaterThan(total);
    expect(res.zip.byteLength).toBeLessThan(total + 4 * 200);
  });

  it("le nom du zip : le SKU de la version s'il est rempli", async () => {
    const res = await assemblerZip(faux(VERSION).deps, ENTREE);
    expect(res.ok && res.nom).toBe("SDN13-version-2.zip");
  });

  it("une photo d'un AUTRE compte refuse tout le téléchargement : pas de zip incomplet", async () => {
    const { deps } = faux(VERSION, ["ref-alpha"]);
    const res = await assemblerZip(deps, ENTREE);
    expect(res).toEqual({ ok: false, code: "photo_introuvable", message: "Une des photos de la version est introuvable : recharge la page." });
    expect("zip" in res).toBe(false);
  });

  it("une version introuvable (ou d'un autre compte) : refusée", async () => {
    const res = await assemblerZip(faux(null).deps, ENTREE);
    expect(res.ok === false && res.code).toBe("introuvable");
  });

  it("une version sans photo : rien à télécharger", async () => {
    const res = await assemblerZip(faux({ ...VERSION, photos: [] }).deps, ENTREE);
    expect(res.ok === false && res.code).toBe("sans_photo");
  });

  it("la Version 1 : ses images validées (essais) dans l'ordre, nommée d'après le SKU du sac", async () => {
    const un: VersionPourZip = { numero: 1, skuAnnonce: "SDN3", skuSource: "SDN3", photos: [photo("essai", "milieu"), photo("ref", "omega")] };
    const res = await assemblerZip(faux(un).deps, { cle: "5039-black-pink", numero: 1, sku: "SDN3" });
    expect(res.ok && res.nom).toBe("SDN3-version-1.zip");
    expect(res.ok && Object.keys(unzipSync(res.zip))).toEqual(["01.png", "02.jpg"]);
  });
});

describe("nomZip", () => {
  const base = { skuAnnonce: null, skuSource: null, cle: "5039-black-pink", numero: 2 };
  it("d'après le SKU de la version s'il est rempli", () => {
    expect(nomZip({ ...base, skuAnnonce: "SDN13", skuSource: "SDN12" })).toBe("SDN13-version-2.zip");
  });
  it("sinon d'après le sac dont la version reprend le texte, et le numéro de version", () => {
    expect(nomZip({ ...base, skuSource: "SDN12" })).toBe("SDN12-version-2.zip");
    expect(nomZip({ ...base, skuSource: "SDN12", numero: 5 })).toBe("SDN12-version-5.zip");
  });
  it("sinon d'après le coloris", () => {
    expect(nomZip(base)).toBe("5039-black-pink-version-2.zip");
  });
  it("rien d'autre que lettres, chiffres, point, tiret, soulignement : le nom part dans un en-tête HTTP", () => {
    expect(nomZip({ ...base, skuAnnonce: 'SD"N 1\r\n/../x' })).toMatch(/^[A-Za-z0-9._-]+-version-2\.zip$/);
    expect(nomZip({ ...base, skuAnnonce: " ", skuSource: "", cle: "é à/ç" })).toMatch(/^[A-Za-z0-9._-]+-version-2\.zip$/);
    expect(nomZip({ skuAnnonce: null, skuSource: null, cle: "///", numero: 3 })).toBe("photos-version-3.zip");
  });
});

describe("nomFichierPhoto", () => {
  it("numéroté dans l'ordre : 01, 02… (trois chiffres à partir de 100 photos)", () => {
    expect(nomFichierPhoto(0, 6, "jpg")).toBe("01.jpg");
    expect(nomFichierPhoto(14, 15, "jpg")).toBe("15.jpg");
    expect(nomFichierPhoto(2, 4, "png")).toBe("03.png");
    expect(nomFichierPhoto(0, 100, "webp")).toBe("001.webp");
  });
});

describe("lireEntreeZip — la requête", () => {
  it("une version enregistrée : coloris et numéro", () => {
    expect(lireEntreeZip({ cle: "5039-black-pink", numero: "2", sku: null })).toEqual({ ok: true, entree: { cle: "5039-black-pink", numero: 2, sku: null } });
  });
  it("la Version 1 exige le SKU du sac (en majuscules)", () => {
    expect(lireEntreeZip({ cle: "c", numero: "1", sku: "sdn3" })).toEqual({ ok: true, entree: { cle: "c", numero: 1, sku: "SDN3" } });
    expect(lireEntreeZip({ cle: "c", numero: "1", sku: null }).ok).toBe(false);
    expect(lireEntreeZip({ cle: "c", numero: "1", sku: "SDN 3" }).ok).toBe(false);
  });
  it("le SKU d'une version enregistrée est ignoré (les photos viennent de la base, pas de la requête)", () => {
    expect(lireEntreeZip({ cle: "c", numero: "3", sku: "SDN3" })).toEqual({ ok: true, entree: { cle: "c", numero: 3, sku: null } });
  });
  it("refuse coloris vide, numéro absent, zéro, négatif, décimal, texte", () => {
    for (const numero of [null, "", "0", "-1", "2.5", "abc", "12345", "2e1"]) expect(lireEntreeZip({ cle: "c", numero, sku: null }).ok, String(numero)).toBe(false);
    expect(lireEntreeZip({ cle: "", numero: "2", sku: null }).ok).toBe(false);
    expect(lireEntreeZip({ cle: null, numero: "2", sku: null }).ok).toBe(false);
  });
});

describe("fluxZip — la réponse est un flux", () => {
  it("rend exactement les octets du zip, par tranches", async () => {
    const zip = octetsDe(9, 200_000);
    const lecteur = fluxZip(zip, 64 * 1024).getReader();
    const morceaux: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      morceaux.push(value);
    }
    expect(morceaux.map((m) => m.byteLength)).toEqual([65536, 65536, 65536, 3392]);
    expect(Buffer.compare(Buffer.concat(morceaux), zip)).toBe(0);
  });
});

// ── Cloisonnement du téléchargement ─────────────────────────────────────────

describe("lib/studioZipServeur.ts : toute lecture est scopée par compte", () => {
  const src = readFileSync(path.join(__dirname, "studioZipServeur.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

  it("chaque requête Prisma (findFirst / findMany / findUnique) nomme userId", () => {
    const requetes = [...src.matchAll(/prisma\.\w+\.(?:findFirst|findMany|findUnique)\(/g)];
    expect(requetes.length).toBeGreaterThanOrEqual(5);
    for (const m of requetes) {
      const debut = m.index ?? 0;
      // Jusqu'à la requête suivante (ou la fin) : son `where` doit parler de `userId`.
      const suite = src.slice(debut + 1);
      const fin = suite.search(/prisma\.\w+\.(?:findFirst|findMany|findUnique)\(/);
      const corps = fin === -1 ? suite : suite.slice(0, fin);
      expect(corps.slice(0, 600), src.slice(debut, debut + 60)).toMatch(/userId/);
    }
  });

  it("n'écrit jamais : aucun create / update / delete / upsert", () => {
    expect(src).not.toMatch(/\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
  });

  it("la route n'accepte aucun identifiant de photo du navigateur", () => {
    const route = readFileSync(path.join(__dirname, "..", "app/api/studio/versions/zip/route.ts"), "utf8");
    expect(route).toContain("getUserId");
    expect(route).not.toMatch(/searchParams\.get\(["'](?:ref|essai|photos?|ids?)["']\)/);
  });
});
