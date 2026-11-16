import "server-only";
import { createHash } from "node:crypto";

import { estAngle, libelleAngle } from "./studioPivot";

/**
 * Création d'une COPIE PIVOTÉE d'une vraie photo du Studio (bouton « Pivoter »).
 *
 * Orchestration à dépendances injectées, comme `lib/studioLancement.ts` : la
 * route lui donne Prisma, le stockage et sharp ; les tests lui donnent des
 * faux, sans base ni réseau. Chaque dépendance est déjà scopée par `userId`
 * par l'appelant.
 *
 * Ce que cette fonction garantit :
 *   • l'original n'est JAMAIS modifié : ni sa ligne, ni son fichier. Le fichier
 *     de la copie porte l'empreinte de SES octets (SHA-256 du JPEG rendu), donc
 *     un autre nom que celui de l'original — `deposerImage` écrase un même nom
 *     (`x-upsert`), il ne doit jamais pouvoir viser le fichier de l'original ;
 *   • la copie suit le même chemin d'enregistrement que l'import
 *     (`deposerImage("references", …)` : `references/<userId>/<sha256>.jpg`) et
 *     la même règle de dédoublonnage (une empreinte déjà conservée pour ce
 *     compte n'est pas redéposée) ;
 *   • cette règle ne rejette pas la copie à tort : ses octets sont nouveaux, donc
 *     son empreinte aussi, même si l'original est déjà sur une autre carte. Elle
 *     ne rejette que la copie EXACTEMENT identique (même photo, même angle) ;
 *   • la copie n'est jamais une ligne du tableau (`ordre` null) : elle ne sert
 *     pas aux générations, elle s'affiche à côté de sa photo.
 */

export type ReferenceSource = {
  id: string;
  colorisId: string | null;
  sku: string | null;
  role: string;
  urlImage: string;
  /** Non null : cette ligne est déjà une copie. */
  copieDeId: string | null;
};

export type DonneesCopie = {
  colorisId: string | null;
  sku: string | null;
  role: string;
  urlImage: string;
  copieDeId: string;
  angleCopie: number;
};

export type DepsCopie = {
  lireReference: (id: string) => Promise<ReferenceSource | null>;
  /** Une copie de cette photo à cet angle existe-t-elle déjà ? */
  copieExistante: (originaleId: string, angle: number) => Promise<{ id: string } | null>;
  /** Même règle que l'import : une ligne de ce compte porte-t-elle déjà ce fichier (`…/<empreinte>.jpg`) ? */
  empreinteConnue: (empreinte: string) => Promise<{ id: string } | null>;
  /** Les octets du fichier de l'original, ou null s'il n'existe plus. */
  lireOctets: (url: string) => Promise<Buffer | null>;
  rendre: (octets: Buffer, angle: number) => Promise<{ jpeg: Buffer; largeur: number; hauteur: number }>;
  /** Range le JPEG sous `references/<userId>/<empreinte>.jpg` et rend son URL. */
  deposer: (jpeg: Buffer, empreinte: string) => Promise<string>;
  /** Crée la ligne. null = contrainte d'unicité (photo, angle) violée : une autre requête a créé la copie entre-temps. */
  creer: (donnees: DonneesCopie) => Promise<{ id: string } | null>;
  /** Efface un fichier qu'aucune ligne n'utilise (nettoyage d'un dépôt resté sans ligne). Best-effort. */
  retirerFichier: (url: string) => Promise<void>;
};

export type CodeRefus = "angle_invalide" | "introuvable" | "est_une_copie" | "deja_la" | "image_introuvable" | "rendu_impossible";

export type ResultatCopie =
  | { ok: true; id: string; angle: number; largeur: number; hauteur: number }
  | { ok: false; code: CodeRefus; message: string; existante?: string };

/** SHA-256 hexadécimal : le nom des fichiers de `references/` (cf. `EMPREINTE_RE`). */
export const empreinteDe = (octets: Buffer): string => createHash("sha256").update(octets).digest("hex");

const refus = (code: CodeRefus, message: string, existante?: string): ResultatCopie => ({
  ok: false,
  code,
  message,
  ...(existante ? { existante } : {}),
});

export async function creerCopiePivotee(deps: DepsCopie, { referenceId, angle }: { referenceId: string; angle: unknown }): Promise<ResultatCopie> {
  if (!estAngle(angle) || angle === 0) {
    return refus("angle_invalide", "Angle : un entier de −45° à +45°, différent de 0°.");
  }
  const source = await deps.lireReference(referenceId);
  if (!source) return refus("introuvable", "Photo introuvable.");
  // Chaque copie part de l'original : pivoter une copie ferait deux rééchantillonnages d'affilée.
  if (source.copieDeId !== null) {
    return refus("est_une_copie", "Pivote la photo d’origine, pas une copie : chaque copie part de l’original.");
  }
  const deja = `Une copie à ${libelleAngle(angle)} existe déjà.`;
  const existante = await deps.copieExistante(source.id, angle);
  if (existante) return refus("deja_la", deja, existante.id);

  const octets = await deps.lireOctets(source.urlImage);
  if (!octets) return refus("image_introuvable", "Le fichier de la photo est introuvable.");

  let rendu: Awaited<ReturnType<DepsCopie["rendre"]>>;
  try {
    rendu = await deps.rendre(octets, angle);
  } catch {
    return refus("rendu_impossible", "La photo n’a pas pu être pivotée.");
  }

  const empreinte = empreinteDe(rendu.jpeg);
  const connue = await deps.empreinteConnue(empreinte);
  if (connue) return refus("deja_la", deja, connue.id);

  const url = await deps.deposer(rendu.jpeg, empreinte);
  let creee: { id: string } | null;
  try {
    creee = await deps.creer({
      colorisId: source.colorisId,
      sku: source.sku,
      role: source.role,
      urlImage: url,
      copieDeId: source.id,
      angleCopie: angle,
    });
  } catch (err) {
    await deps.retirerFichier(url).catch(() => undefined);
    throw err;
  }
  if (!creee) {
    // Une requête concurrente a créé la copie : notre fichier n'a plus de ligne.
    await deps.retirerFichier(url).catch(() => undefined);
    const rattrapee = await deps.copieExistante(source.id, angle);
    return refus("deja_la", deja, rattrapee?.id);
  }
  return { ok: true, id: creee.id, angle, largeur: rendu.largeur, hauteur: rendu.hauteur };
}
