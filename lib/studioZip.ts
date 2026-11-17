import "server-only";

import { zipSync } from "fflate";

import { lireSkuAnnonce, type PhotoVersion } from "./studioVersion";

/**
 * « Télécharger les N photos » d'une version (PRD 2026-11-16, étape 4) : un
 * seul .zip des photos de la version, dans l'ordre, numérotées `01.jpg`,
 * `02.jpg`… Orchestration à dépendances injectées (comme
 * `creerVersionRetouchee`) : la route lui donne Prisma et le stockage ; les
 * tests des faux.
 *
 * Garanties :
 *   • les octets du zip sont ceux des images STOCKÉES, tels quels : aucune
 *     recompression (les images, entrée par entrée, sont rangées sans
 *     compression ; un JPEG ne se compresse de toute façon pas) ;
 *   • l'ordre est celui de la version (planche pour la Version 1 : l'ordre des
 *     prises, pour les suivantes : leur `ordre`) ;
 *   • tout ou rien : tout est lu AVANT la première réponse ; une photo
 *     introuvable ou d'un autre compte refuse tout le téléchargement, plutôt
 *     que de livrer un zip incomplet qu'Aramis prendrait pour complet ;
 *   • l'extension suit le TYPE réel de l'image (`jpg`, `png`, `webp`) : une
 *     image générée peut ne pas être un JPEG.
 */

export type ExtensionZip = "jpg" | "png" | "webp";

/** Ce que la route demande : le coloris de la fiche, le numéro de version, et le SKU du sac pour la Version 1. */
export type EntreeZip = { cle: string; numero: number; sku: string | null };

/** Une version prête à zipper : ses photos dans l'ordre, et les SKU qui nomment le fichier. */
export type VersionPourZip = {
  numero: number;
  /** Le SKU d'annonce (Version 2 et suivantes) ou le SKU du sac (Version 1) ; null = pas renseigné. */
  skuAnnonce: string | null;
  /** Le sac dont la version a repris le texte. */
  skuSource: string | null;
  photos: PhotoVersion[];
};

export type OctetsPhoto = { octets: Uint8Array; extension: ExtensionZip };

export type DepsZip = {
  /** La version du compte (scopée par `userId`), photos dans l'ordre ; null si elle n'existe pas pour ce compte. */
  lireVersion: (entree: EntreeZip) => Promise<VersionPourZip | null>;
  /** Les octets stockés d'une photo du compte ; null si elle est absente, purgée ou n'est pas à ce compte. */
  lireOctets: (photo: PhotoVersion) => Promise<OctetsPhoto | null>;
};

export type CodeRefusZip = "requete_invalide" | "introuvable" | "sans_photo" | "photo_introuvable";

export type ResultatZip =
  | { ok: true; nom: string; fichiers: { nom: string; octets: Uint8Array }[]; zip: Uint8Array }
  | { ok: false; code: CodeRefusZip; message: string };

const refus = (code: CodeRefusZip, message: string): ResultatZip => ({ ok: false, code, message });

/**
 * Le nom du .zip : le SKU de la version s'il est rempli (`SDN13-version-2.zip`),
 * sinon le sac dont elle reprend le texte, sinon le coloris, puis `-version-N`.
 * Rien d'autre que des lettres, chiffres, point, tiret et soulignement (le nom
 * part dans un en-tête HTTP et sur le disque d'Aramis).
 */
export function nomZip({ skuAnnonce, skuSource, cle, numero }: { skuAnnonce: string | null; skuSource: string | null; cle: string; numero: number }): string {
  const base = [skuAnnonce, skuSource, cle].map((s) => (s ?? "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "")).find(Boolean) ?? "photos";
  return `${base}-version-${numero}.zip`;
}

/** `01.jpg`, `02.jpg`… : au moins deux chiffres, plus s'il y a 100 photos ou davantage. */
export function nomFichierPhoto(index: number, total: number, extension: ExtensionZip): string {
  return `${String(index + 1).padStart(Math.max(2, String(total).length), "0")}.${extension}`;
}

/** Les paramètres de la requête : `cle` non vide, `numero` entier ≥ 1, `sku` valide (et exigé pour la Version 1). */
export function lireEntreeZip(p: { cle: string | null; numero: string | null; sku: string | null }): { ok: true; entree: EntreeZip } | { ok: false; message: string } {
  const cle = (p.cle ?? "").trim();
  if (!cle || cle.length > 200) return { ok: false, message: "Coloris illisible." };
  const numero = Number(p.numero);
  if (!/^\d{1,4}$/.test(p.numero ?? "") || !Number.isInteger(numero) || numero < 1) return { ok: false, message: "Numéro de version illisible." };
  const sku = lireSkuAnnonce(p.sku);
  if (!sku.ok) return { ok: false, message: sku.message };
  if (numero === 1 && !sku.sku) return { ok: false, message: "La Version 1 est celle d’un sac : indique son SKU." };
  return { ok: true, entree: { cle, numero, sku: numero === 1 ? sku.sku : null } };
}

export async function assemblerZip(deps: DepsZip, entree: EntreeZip): Promise<ResultatZip> {
  const version = await deps.lireVersion(entree);
  if (!version) return refus("introuvable", "Version introuvable : recharge la page.");
  if (version.photos.length === 0) return refus("sans_photo", "Cette version n’a pas de photo à télécharger.");

  // Tout lire AVANT de répondre (en parallèle : jusqu'à 15 photos). Une seule absente refuse le tout.
  const lues = await Promise.all(version.photos.map((p) => deps.lireOctets(p)));
  if (lues.some((l) => l === null)) return refus("photo_introuvable", "Une des photos de la version est introuvable : recharge la page.");

  const fichiers = (lues as OctetsPhoto[]).map((l, i) => ({ nom: nomFichierPhoto(i, lues.length, l.extension), octets: l.octets }));
  // `level: 0` : entrées rangées telles quelles (STORE), dans l'ordre d'insertion des clés.
  const zip = zipSync(Object.fromEntries(fichiers.map((f) => [f.nom, f.octets] as const)), { level: 0 });
  return { ok: true, nom: nomZip({ ...version, cle: entree.cle }), fichiers, zip };
}

/** Le zip fini, servi par tranches : la réponse est un flux (les gros fichiers passent, sans plafond de corps). */
export function fluxZip(zip: Uint8Array, tranche = 64 * 1024): ReadableStream<Uint8Array> {
  let debut = 0;
  return new ReadableStream<Uint8Array>({
    pull(controleur) {
      if (debut >= zip.byteLength) {
        controleur.close();
        return;
      }
      controleur.enqueue(zip.subarray(debut, Math.min(debut + tranche, zip.byteLength)));
      debut += tranche;
    },
  });
}
