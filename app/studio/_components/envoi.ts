// Préparation des fichiers côté navigateur : décodage, compression JPEG
// ~1600 px (spec §8), empreinte. Pas de bibliothèque HEIC (écart 2 du plan) :
// on laisse le navigateur décoder, et un échec est NOMMÉ, fichier par fichier.

import { compressImage } from "@/lib/imageProcessing";

const COTE_MAX = 1600;
const QUALITE = 0.85;

export const ACCEPT = "image/*,.heic,.heif";

const estHeic = (f: File) => /\.(heic|heif)$/i.test(f.name) || /image\/hei[cf]/i.test(f.type);

export const MESSAGE_HEIC =
  "Ton navigateur ne sait pas lire ce HEIC — ouvre le Studio dans Safari, ou exporte en JPEG depuis l’iPhone.";

export type Prepare = { ok: true; nom: string; jpeg: Blob; empreinte: string } | { ok: false; nom: string; erreur: string };

async function empreinte(f: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function preparer(f: File): Promise<Prepare> {
  try {
    const jpeg = await compressImage(f, COTE_MAX, QUALITE);
    return { ok: true, nom: f.name, jpeg, empreinte: await empreinte(f) };
  } catch {
    return { ok: false, nom: f.name, erreur: estHeic(f) ? MESSAGE_HEIC : "Fichier illisible." };
  }
}

/** Fichiers images d'un glisser-déposer ou d'un collage. */
export function fichiersImages(liste: FileList | File[] | null | undefined): File[] {
  return Array.from(liste ?? []).filter((f) => f.type.startsWith("image/") || estHeic(f));
}

export async function lireErreur(res: Response): Promise<string> {
  const j = (await res.json().catch(() => null)) as { error?: string } | null;
  return j?.error ?? `Erreur ${res.status}`;
}

/**
 * Range une vraie photo sous la prise n° `ordre`. Si une autre photo du
 * coloris l'occupe déjà, le serveur échange les deux. Renvoie l'erreur à
 * afficher, ou null.
 */
export async function changerPrise(refId: string, ordre: number, generation: string | null): Promise<string | null> {
  const res = await fetch(`/api/studio/references/${refId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ordre, generation }),
  });
  return res.ok ? null : lireErreur(res);
}

/**
 * Replaces a photo of the board: the old one leaves the board (`ordre: null`,
 * kept out of the table, never deleted here), then the new one takes its cell.
 * If nothing took the cell, the old photo goes back to it. Resolves to null on
 * success, "servie" when the API refuses (409: the photo gave a variant), or
 * the message to show.
 */
export async function remplacerPhoto({
  cle,
  generation,
  photo,
  fichier,
}: {
  cle: string;
  generation: string | null;
  photo: { id: string; ordre: number };
  fichier: File;
}): Promise<null | "servie" | string> {
  const p = await preparer(fichier);
  if (!p.ok) return `${p.nom} : ${p.erreur}`;
  const sortie = await fetch(`/api/studio/references/${photo.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ordre: null, generation }),
  }).catch(() => null);
  if (!sortie) return "Connexion perdue : la photo reste à sa place.";
  if (sortie.status === 409) return "servie";
  if (!sortie.ok) return `Remplacement impossible : ${await lireErreur(sortie)}`;

  const form = new FormData();
  form.set("origine", "studio");
  form.set("cle", cle);
  if (generation) form.set("generation", generation);
  form.append("photo", p.jpeg, `${p.empreinte}.jpg`);
  form.append("empreinte", p.empreinte);
  form.append("ordre", String(photo.ordre));
  const res = await fetch("/api/studio/references", { method: "POST", body: form }).catch(() => null);
  const j = res?.ok ? ((await res.json().catch(() => null)) as { conservees?: number } | null) : null;
  if (j?.conservees) return null;
  // Nothing took the cell: the old photo goes back to it.
  await changerPrise(photo.id, photo.ordre, generation).catch(() => null);
  if (res?.ok) return "Cette photo est déjà sur la planche : l’ancienne reste à sa place.";
  return `Remplacement impossible${res ? ` : ${await lireErreur(res)}` : " : connexion perdue"}. L’ancienne photo reste à sa place.`;
}
