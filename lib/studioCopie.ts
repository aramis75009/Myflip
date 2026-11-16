import "server-only";
import { createHash } from "node:crypto";

import { estAngle, libelleAngle } from "./studioPivot";
import { cleRetouche, estIdentite, estPivotSeul, lireRetouche, retoucheDePivot, type Retouche } from "./studioRetouche";

/**
 * Création d'une COPIE RETOUCHÉE d'une vraie photo du Studio : pivotée seule
 * (bouton « Pivoter », 16/11) ou retouchée par lot (pivoter, recadrer, cadre ;
 * 17/11, PRD 2026-11-16 §8). Une seule orchestration pour les deux.
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
 *     ne rejette que la copie EXACTEMENT identique (même photo, même retouche) ;
 *   • une copie par photo et par retouche (`copieExistante`, clé `cleRetouche`) :
 *     la même retouche ne crée pas deux fois la même copie, elle rend l'existante
 *     (`deja_la` + `existante`), que le lot réutilise ;
 *   • la copie n'est jamais une ligne du tableau (`ordre` null) : elle ne sert
 *     pas aux générations.
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
  /** Les réglages complets, normalisés, et leur clé canonique (unique par photo). */
  retouche: Retouche;
  retoucheCle: string;
  /**
   * L'angle, seulement pour une copie « angle seul, zoom » (ce que faisait
   * « Pivoter ») ; null pour toute autre retouche. L'index unique historique
   * (`copieDeId`, `angleCopie`) garde ainsi son sens : deux retouches au même
   * angle (avec et sans cadre) ne s'y heurtent pas.
   */
  angleCopie: number | null;
};

export type DepsCopie = {
  lireReference: (id: string) => Promise<ReferenceSource | null>;
  /** Une copie de cette photo avec cette retouche existe-t-elle déjà (copies pivotées d'avant la refonte comprises) ? */
  copieExistante: (originaleId: string, retouche: Retouche) => Promise<{ id: string } | null>;
  /** Même règle que l'import : une ligne de ce compte porte-t-elle déjà ce fichier (`…/<empreinte>.jpg`) ? */
  empreinteConnue: (empreinte: string) => Promise<{ id: string } | null>;
  /** Les octets du fichier de l'original, ou null s'il n'existe plus. */
  lireOctets: (url: string) => Promise<Buffer | null>;
  rendre: (octets: Buffer, retouche: Retouche) => Promise<{ jpeg: Buffer; largeur: number; hauteur: number }>;
  /** Range le JPEG sous `references/<userId>/<empreinte>.jpg` et rend son URL. */
  deposer: (jpeg: Buffer, empreinte: string) => Promise<string>;
  /** Crée la ligne. null = contrainte d'unicité violée : une autre requête a créé la copie entre-temps. */
  creer: (donnees: DonneesCopie) => Promise<{ id: string } | null>;
  /** Efface un fichier qu'aucune ligne n'utilise (nettoyage d'un dépôt resté sans ligne). Best-effort. */
  retirerFichier: (url: string) => Promise<void>;
};

export type CodeRefus =
  | "angle_invalide"
  | "retouche_invalide"
  | "retouche_vide"
  | "introuvable"
  | "est_une_copie"
  | "deja_la"
  | "image_introuvable"
  | "rendu_impossible";

export type ResultatRetouche =
  | { ok: true; id: string; retouche: Retouche; largeur: number; hauteur: number }
  | { ok: false; code: CodeRefus; message: string; existante?: string };

export type ResultatCopie =
  | { ok: true; id: string; angle: number; largeur: number; hauteur: number }
  | { ok: false; code: CodeRefus; message: string; existante?: string };

/** SHA-256 hexadécimal : le nom des fichiers de `references/` (cf. `EMPREINTE_RE`). */
export const empreinteDe = (octets: Buffer): string => createHash("sha256").update(octets).digest("hex");

const refus = (code: CodeRefus, message: string, existante?: string) => ({
  ok: false as const,
  code,
  message,
  ...(existante ? { existante } : {}),
});

/** Les messages de « Pivoter » (inchangés) pour une rotation seule, plus génériques sinon. */
const messageDejaLa = (r: Retouche) => (estPivotSeul(r) ? `Une copie à ${libelleAngle(r.angle)} existe déjà.` : "Une copie identique existe déjà.");
const messageRendu = (r: Retouche) => (estPivotSeul(r) ? "La photo n’a pas pu être pivotée." : "La photo n’a pas pu être retouchée.");

export async function creerCopieRetouchee(
  deps: DepsCopie,
  { referenceId, retouche: brute }: { referenceId: string; retouche: unknown },
): Promise<ResultatRetouche> {
  const retouche = lireRetouche(brute);
  if (!retouche) return refus("retouche_invalide", "Réglages de retouche invalides.");
  if (estIdentite(retouche)) return refus("retouche_vide", "Rien à retoucher : la copie serait l’originale.");

  const source = await deps.lireReference(referenceId);
  if (!source) return refus("introuvable", "Photo introuvable.");
  // Chaque copie part de l'original : retoucher une copie ferait deux rééchantillonnages d'affilée.
  if (source.copieDeId !== null) {
    return refus("est_une_copie", "Retouche la photo d’origine, pas une copie : chaque copie part de l’original.");
  }
  const existante = await deps.copieExistante(source.id, retouche);
  if (existante) return refus("deja_la", messageDejaLa(retouche), existante.id);

  const octets = await deps.lireOctets(source.urlImage);
  if (!octets) return refus("image_introuvable", "Le fichier de la photo est introuvable.");

  let rendu: Awaited<ReturnType<DepsCopie["rendre"]>>;
  try {
    rendu = await deps.rendre(octets, retouche);
  } catch {
    return refus("rendu_impossible", messageRendu(retouche));
  }

  const empreinte = empreinteDe(rendu.jpeg);
  const connue = await deps.empreinteConnue(empreinte);
  if (connue) return refus("deja_la", messageDejaLa(retouche), connue.id);

  const url = await deps.deposer(rendu.jpeg, empreinte);
  let creee: { id: string } | null;
  try {
    creee = await deps.creer({
      colorisId: source.colorisId,
      sku: source.sku,
      role: source.role,
      urlImage: url,
      copieDeId: source.id,
      retouche,
      retoucheCle: cleRetouche(retouche),
      angleCopie: estPivotSeul(retouche) ? retouche.angle : null,
    });
  } catch (err) {
    await deps.retirerFichier(url).catch(() => undefined);
    throw err;
  }
  if (!creee) {
    // Une requête concurrente a créé la copie : notre fichier n'a plus de ligne.
    await deps.retirerFichier(url).catch(() => undefined);
    const rattrapee = await deps.copieExistante(source.id, retouche);
    return refus("deja_la", messageDejaLa(retouche), rattrapee?.id);
  }
  return { ok: true, id: creee.id, retouche, largeur: rendu.largeur, hauteur: rendu.hauteur };
}

/** « Pivoter » (16/11) : la même orchestration, pour un angle seul en mode zoom. */
export async function creerCopiePivotee(deps: DepsCopie, { referenceId, angle }: { referenceId: string; angle: unknown }): Promise<ResultatCopie> {
  if (!estAngle(angle) || angle === 0) {
    return refus("angle_invalide", "Angle : un entier de −45° à +45°, différent de 0°.");
  }
  const res = await creerCopieRetouchee(deps, { referenceId, retouche: retoucheDePivot(angle) });
  if (!res.ok) return res;
  return { ok: true, id: res.id, angle, largeur: res.largeur, hauteur: res.hauteur };
}
