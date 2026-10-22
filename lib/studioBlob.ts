import "server-only";
import { randomUUID } from "node:crypto";
import { del, get, put } from "@vercel/blob";

/**
 * Stockage des images du Studio IA dans Vercel Blob (store `myflip-studio`,
 * privé). Deux préfixes, et seulement deux (spec §8) :
 *
 *   references/<userId>/…  vraies photos (mise en vente ou import manuel)
 *   generees/<userId>/…    images générées dans Gemini et déposées au Studio
 *
 * Aucune fonction de ce module ne prend un chemin libre : le chemin est
 * toujours construit ici, à partir d'un préfixe fermé et d'un userId vérifié.
 * À la lecture et à la suppression, l'URL stockée en base est revérifiée
 * contre ce même préfixe : une ligne corrompue ne peut pas faire lire ou
 * effacer le fichier d'un autre compte.
 *
 * Les fichiers portent l'extension de leur type : `.jpg` (dépôts manuels, tout
 * l'existant), `.png` ou `.webp` (images générées par l'API, qui rend ce que le
 * modèle produit).
 *
 * Le store est privé : une URL de blob n'est pas affichable telle quelle. Les
 * écrans passent par GET /api/studio/image, qui relit la ligne en base (scopée
 * par userId) puis appelle `lireImage`.
 *
 * Variable : BLOB_READ_WRITE_TOKEN (lue par @vercel/blob).
 */

export const PREFIXES_BLOB = ["references", "generees"] as const;
export type PrefixeBlob = (typeof PREFIXES_BLOB)[number];

/** Taille maximale acceptée à l'envoi. Le client compresse à ~1600 px avant. */
export const TAILLE_MAX_OCTETS = 4 * 1024 * 1024;

/**
 * Formats acceptés à l'envoi MANUEL : le client réencode tout en JPEG. Ne pas
 * élargir : seules les images GÉNÉRÉES par l'API (qui rend ce que le modèle
 * produit) peuvent être en PNG ou en WebP, cf. `MIMES_IMAGE`.
 */
export const TYPES_ACCEPTES = ["image/jpeg"] as const;

/**
 * Formats que le Blob sait ranger : ce que les modèles d'image rendent. Un
 * dépôt manuel reste JPEG seul (`TYPES_ACCEPTES`) ; une image générée garde le
 * type renvoyé par le modèle, sans réencodage.
 */
export const MIMES_IMAGE = ["image/jpeg", "image/png", "image/webp"] as const;
export type MimeImage = (typeof MIMES_IMAGE)[number];
export const EXTENSIONS_IMAGE = ["jpg", "png", "webp"] as const;
export type ExtensionImage = (typeof EXTENSIONS_IMAGE)[number];

const EXTENSION_PAR_MIME: Record<MimeImage, ExtensionImage> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MIME_PAR_EXTENSION: Record<ExtensionImage, MimeImage> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// cuid (Prisma) : minuscules et chiffres. Rien qui puisse contenir « / » ou « .. ».
const USER_ID_RE = /^[a-z0-9]{8,64}$/;
// uuid (essais) ou empreinte SHA-256 du fichier d'origine (références : la même
// photo déposée deux fois tombe sur le même nom, et n'est pas conservée deux fois).
const FICHIER_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{64})\.(?:jpg|png|webp)$/;
export const EMPREINTE_RE = /^[0-9a-f]{64}$/;

export class StudioBlobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioBlobError";
  }
}

function verifierUserId(userId: string): void {
  if (!USER_ID_RE.test(userId)) throw new StudioBlobError("Identifiant de compte invalide.");
}

/** L'extension d'un type d'image rangeable. Lève sur tout autre type : on ne devine pas. */
export function extensionDepuisMime(mime: MimeImage): ExtensionImage {
  const ext = EXTENSION_PAR_MIME[mime];
  if (!ext) throw new StudioBlobError("Type d'image non pris en charge.");
  return ext;
}

/**
 * Le type d'une image lue dans le Blob : le `contentType` enregistré s'il est
 * l'un des trois, sinon celui que dit l'extension du fichier, sinon JPEG (les
 * fichiers d'avant PNG/WebP sont tous des `.jpg`).
 */
export function mimeDepuisContentType(contentType: string | null | undefined, url: string): MimeImage {
  const brut = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if ((MIMES_IMAGE as readonly string[]).includes(brut)) return brut as MimeImage;
  const fichier = (cheminDepuisUrl(url) ?? "").split("/").pop() ?? "";
  const ext = fichier.slice(fichier.lastIndexOf(".") + 1);
  return MIME_PAR_EXTENSION[ext as ExtensionImage] ?? "image/jpeg";
}

/** Chemin d'un nouveau fichier. Pur : `id` est injectable pour les tests. */
export function cheminImage(
  prefixe: PrefixeBlob,
  userId: string,
  id: string = randomUUID(),
  ext: ExtensionImage = "jpg",
): string {
  if (!PREFIXES_BLOB.includes(prefixe)) throw new StudioBlobError("Préfixe inconnu.");
  verifierUserId(userId);
  const fichier = `${id}.${ext}`;
  if (!FICHIER_RE.test(fichier)) throw new StudioBlobError("Nom de fichier invalide.");
  return `${prefixe}/${userId}/${fichier}`;
}

/**
 * Le chemin d'une URL de blob, ou null si l'URL n'est pas une URL de blob
 * exploitable. `https` exigé, hôte en `.blob.vercel-storage.com`.
 */
export function cheminDepuisUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || !u.hostname.endsWith(".blob.vercel-storage.com")) return null;
  return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
}

/**
 * Vrai si `url` désigne un fichier de `prefixe/userId/` et rien d'autre : pas
 * de sous-dossier, pas de « .. », nom de fichier au format produit par
 * `cheminImage`.
 */
export function urlAppartientA(url: string, prefixe: PrefixeBlob, userId: string): boolean {
  if (!USER_ID_RE.test(userId) || !PREFIXES_BLOB.includes(prefixe)) return false;
  const chemin = cheminDepuisUrl(url);
  if (!chemin) return false;
  const morceaux = chemin.split("/");
  return morceaux.length === 3 && morceaux[0] === prefixe && morceaux[1] === userId && FICHIER_RE.test(morceaux[2]);
}

/** Contrôle d'un fichier reçu, avant tout envoi. Rend un message, ou null si c'est bon. */
export function erreurFichier(f: { type: string; size: number }): string | null {
  if (!(TYPES_ACCEPTES as readonly string[]).includes(f.type)) return "Format refusé : JPEG attendu.";
  if (f.size <= 0) return "Fichier vide.";
  if (f.size > TAILLE_MAX_OCTETS) return "Fichier trop lourd (4 Mo au plus).";
  return null;
}

/**
 * Envoie une image. Rend l'URL (privée) à ranger dans `urlImage`. `id` : une
 * empreinte SHA-256 pour une référence, rien (uuid tiré ici) pour un essai.
 * `mime` : JPEG par défaut (dépôts manuels) ; une image générée garde le type
 * que le modèle a rendu, et l'extension du fichier le suit.
 */
export async function deposerImage(
  prefixe: PrefixeBlob,
  userId: string,
  corps: Blob | ArrayBuffer | Buffer,
  id?: string,
  mime: MimeImage = "image/jpeg",
): Promise<string> {
  const chemin = cheminImage(prefixe, userId, id, extensionDepuisMime(mime));
  const res = await put(chemin, corps, {
    access: "private",
    contentType: mime,
    addRandomSuffix: false,
    // Même empreinte = même photo : réécrire le fichier est sans effet visible.
    allowOverwrite: true,
  });
  return res.url;
}

function assurerAppartenance(url: string, prefixe: PrefixeBlob, userId: string): void {
  if (!urlAppartientA(url, prefixe, userId)) {
    // Ni l'URL ni le userId dans le message : il peut finir dans un log.
    throw new StudioBlobError("Image hors du préfixe attendu.");
  }
}

/** Lit une image privée. null si elle n'existe plus. */
export async function lireImage(
  url: string,
  prefixe: PrefixeBlob,
  userId: string,
): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  assurerAppartenance(url, prefixe, userId);
  const res = await get(url, { access: "private" });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return { stream: res.stream, contentType: res.blob.contentType || "image/jpeg" };
}

/**
 * Lit une image privée en entier (pour la vérification IA, qui l'envoie en
 * base64) et rend aussi son VRAI type : une image générée peut être en PNG ou en
 * WebP, et l'annoncer en JPEG fait refuser l'image par certains fournisseurs.
 */
export async function lireImageEnBase64(
  url: string,
  prefixe: PrefixeBlob,
  userId: string,
): Promise<{ data: string; mimeType: string } | null> {
  const res = await lireImage(url, prefixe, userId);
  if (!res) return null;
  const buf = Buffer.from(await new Response(res.stream).arrayBuffer());
  return { data: buf.toString("base64"), mimeType: mimeDepuisContentType(res.contentType, url) };
}

/** Supprime une image (purge manuelle d'un essai, ou d'une référence retirée). */
export async function supprimerImage(url: string, prefixe: PrefixeBlob, userId: string): Promise<void> {
  assurerAppartenance(url, prefixe, userId);
  await del(url);
}
