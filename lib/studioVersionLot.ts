import "server-only";

import { MAX_PRISES } from "./studioCases";
import { creerCopieRetouchee, type CodeRefus, type DepsCopie } from "./studioCopie";
import { estIdentite, lireRetouche } from "./studioRetouche";
import { lireSkuAnnonce, type VersionEnBase } from "./studioVersion";

/**
 * « Enregistrer en Version N » du panneau de retouche par lot (PRD 2026-11-16,
 * §2, §8) : une copie retouchée par photo cochée, puis UNE nouvelle version du
 * coloris avec ces copies, dans l'ordre de la planche. Pas d'étape « juger » :
 * Aramis a vu l'aperçu, c'est lui qui enregistre.
 *
 * Orchestration à dépendances injectées (comme `creerCopieRetouchee`) : la
 * route lui donne Prisma, le stockage et sharp ; les tests des faux.
 *
 * Garanties :
 *   • l'original n'est jamais modifié (c'est `creerCopieRetouchee` qui crée
 *     chaque copie, avec l'empreinte de SES octets) ;
 *   • tout est vérifié AVANT le premier rendu (réglages, photos du compte, du
 *     coloris, pas des copies) : un lot refusé ne laisse rien derrière lui ;
 *   • la même retouche sur la même photo réutilise la copie existante (copies
 *     pivotées d'avant la refonte comprises) : deux enregistrements identiques
 *     ne créent pas de doublon, mais bien deux versions ;
 *   • sans aucune retouche, la version reprend les photos d'origine telles
 *     quelles (aucune copie, aucun rendu) ;
 *   • si la version ne peut pas être créée, les copies créées par CE lot sont
 *     retirées (celles réutilisées restent) ;
 *   • le texte de la version est celui de la Version 1 du sac affiché, COPIÉ
 *     (l'`Article` n'est que lu).
 */

/** Une photo cochée, relue en base (scopée par compte). */
export type PhotoDuLot = { id: string; colorisId: string | null; copieDeId: string | null };

export type DonneesVersion = {
  colorisId: string;
  skuSource: string | null;
  titre: string;
  description: string;
  motsCles: string;
  /** Lignes StudioReference, dans l'ordre. */
  photos: string[];
};

export type DepsVersion = {
  copie: DepsCopie;
  lirePhoto: (id: string) => Promise<PhotoDuLot | null>;
  /** Le texte de la Version 1 d'un sac (Article : titre, description à tirets, mots-clés). Vides si rien. */
  texteVersionUn: (sku: string) => Promise<{ titre: string; description: string; motsCles: string }>;
  /** Crée la version et ses photos, au numéro suivant du coloris (≥ 2). */
  creerVersion: (d: DonneesVersion) => Promise<VersionEnBase>;
  /** Retire des copies créées par ce lot (lignes et fichiers orphelins). Best-effort. */
  retirerCopies: (ids: string[]) => Promise<void>;
};

export type CodeRefusLot = CodeRefus | "photos_invalides" | "sku_invalide" | "autre_coloris";

export type ResultatLot =
  | { ok: true; version: VersionEnBase; copiesCreees: number; copiesReprises: number; originales: number }
  | { ok: false; code: CodeRefusLot; message: string };

const refus = (code: CodeRefusLot, message: string): ResultatLot => ({ ok: false, code, message });

/** Les ids cochés : 1 à 15 chaînes, sans doublon. */
function lireIds(v: unknown): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > MAX_PRISES) return null;
  if (!v.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64)) return null;
  return new Set(v).size === v.length ? (v as string[]) : null;
}

export async function creerVersionRetouchee(
  deps: DepsVersion,
  entree: { colorisId: string; skuSource: unknown; referenceIds: unknown; retouche: unknown },
): Promise<ResultatLot> {
  const retouche = lireRetouche(entree.retouche);
  if (!retouche) return refus("retouche_invalide", "Réglages de retouche invalides.");
  const ids = lireIds(entree.referenceIds);
  if (!ids) return refus("photos_invalides", `Coche de 1 à ${MAX_PRISES} photos.`);
  const sku = lireSkuAnnonce(entree.skuSource);
  if (!sku.ok) return refus("sku_invalide", sku.message);

  // Tout vérifier avant le premier rendu.
  for (const id of ids) {
    const photo = await deps.lirePhoto(id);
    if (!photo) return refus("introuvable", "Une des photos cochées est introuvable : recharge la page.");
    if (photo.colorisId !== entree.colorisId) return refus("autre_coloris", "Une des photos cochées appartient à un autre sac.");
    if (photo.copieDeId !== null) return refus("est_une_copie", "Coche les photos d’origine : chaque copie part de l’original.");
  }

  const identite = estIdentite(retouche);
  const photos: string[] = [];
  const creees: string[] = [];
  let reprises = 0;
  const annuler = () => (creees.length > 0 ? deps.retirerCopies([...creees]).catch(() => undefined) : Promise.resolve());

  try {
    for (const [i, id] of ids.entries()) {
      if (identite) {
        // Rien à rendre : la version montre la photo d'origine elle-même (jamais modifiée).
        photos.push(id);
        continue;
      }
      const res = await creerCopieRetouchee(deps.copie, { referenceId: id, retouche });
      if (res.ok) {
        photos.push(res.id);
        creees.push(res.id);
      } else if (res.code === "deja_la" && res.existante) {
        photos.push(res.existante);
        reprises++;
      } else {
        await annuler();
        return refus(res.code, ids.length > 1 ? `Photo ${i + 1} sur ${ids.length} : ${res.message}` : res.message);
      }
    }

    const texte = sku.sku ? await deps.texteVersionUn(sku.sku) : { titre: "", description: "", motsCles: "" };
    const version = await deps.creerVersion({ colorisId: entree.colorisId, skuSource: sku.sku, ...texte, photos });
    return { ok: true, version, copiesCreees: creees.length, copiesReprises: reprises, originales: identite ? photos.length : 0 };
  } catch (err) {
    await annuler();
    throw err;
  }
}
