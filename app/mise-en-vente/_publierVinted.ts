// Publication vers Vinted : le PATCH d'abord, l'onglet ensuite — et l'onglet
// SEULEMENT si le PATCH a réussi.
//
// Pourquoi un module à part plutôt qu'un bloc direct dans page.tsx : l'ancien
// <a target="_blank"> ouvrait l'onglet Vinted AU CLIC, avant que le PATCH
// asynchrone ait résolu. Un échec produisait quand même un onglet, donc un
// `tabs.onCreated` orphelin côté extension (Tâche 14) — qui apparie chaque
// onglet ouvert à un article mis en file par ORDRE DE CRÉATION. Un onglet en
// trop décale l'appariement de tous les onglets suivants ouverts dans la même
// session (bug identifié en revue Eng).
//
// Cette fonction matérialise le garde-fou. `enregistrerUn`, `emettreEvenement`
// et `ouvrirOnglet` sont INJECTÉS par l'appelant plutôt qu'appelés en dur
// (`window.dispatchEvent`, `window.open`) : ce fichier reste une fonction pure
// — sans React, sans DOM — donc testable par Vitest en environnement `node`
// (cf. vitest.config.ts). page.tsx branche les effets réels.

import type { ArticleEnCours } from "./_reducer";
import { pickVintedMapping } from "@/lib/vintedMapping";
import {
  conditionIdDepuisEtat,
  materialIdsDepuisMatieres,
} from "@/lib/vintedReferentiels";

/**
 * Les champs du formulaire Vinted, en identifiants NUMÉRIQUES — jamais en
 * libellés. L'extension les consomme tels quels : aucune traduction ne doit
 * avoir lieu de l'autre côté de la frontière, où rien n'est testé.
 */
export type ChampsVinted = {
  categoryId: number;
  rechercheCategorie: string;
  filAriane: string;
  brandId: number;
  conditionId: number;
  packageType: 1 | 2 | 3;
  unisex: boolean;
  /** 1 à 2 ids. */
  colorIds: number[];
  /** 0 à 2 ids, dédupliqués. */
  materialIds: number[];
};

export type DetailPublicationVinted = {
  articleId: string;
  titre: string;
  description: string;
  prix: string;
  /** Blob pleine résolution — cf. _reducer.ts sur `Photo.blob`. */
  photos: Blob[];
  /** Absent quand la fiche ne correspond à aucun mapping. L'extension ne
   *  sait alors pas remplir le formulaire seule : elle laisse l'onglet
   *  ouvert et suspend la chaîne, pour que l'annonce se finisse à la main. */
  vinted?: ChampsVinted;
};

/**
 * Résout les champs Vinted d'une fiche, ou `null` si elle n'est pas éligible.
 *
 * Deux conditions, pas une : un mapping marque+catégorie ET un état traduisible.
 * Sans état, Vinted refuse le formulaire (`required: true` sur `condition`) —
 * mieux vaut ne rien promettre que promettre un formulaire qui bloquera.
 */
function champsVinted(f: ArticleEnCours): ChampsVinted | null {
  const mapping = pickVintedMapping(f.qcm.marque, f.qcm.categorie);
  if (!mapping) return null;
  const conditionId = conditionIdDepuisEtat(f.qcm.etat);
  if (conditionId === null) return null;
  return {
    categoryId: mapping.categoryId,
    rechercheCategorie: mapping.rechercheCategorie,
    filAriane: mapping.filAriane,
    brandId: mapping.brandId,
    conditionId,
    packageType: mapping.packageType,
    unisex: mapping.unisex,
    // Plafonds appliqués ICI et pas seulement dans l'écran : au-delà de sa
    // limite, Vinted évince silencieusement la plus ancienne sélection au
    // lieu de refuser le clic. On ne lui donne jamais l'occasion de choisir.
    colorIds: f.qcm.couleurs.slice(0, 2),
    materialIds: materialIdsDepuisMatieres(
      [f.qcm.matiere, f.qcm.matiere2].filter(Boolean),
    ).slice(0, 2),
  };
}

/** Charge utile du `CustomEvent("myflip:publier-vinted")` consommé par l'extension. */
export function detailPublicationVinted(f: ArticleEnCours): DetailPublicationVinted {
  const vinted = champsVinted(f);
  return {
    articleId: f.article!.id,
    titre: f.annonce.titre,
    description: f.annonce.description,
    prix: f.qcm.prix,
    photos: f.photos.map((p) => p.blob),
    ...(vinted ? { vinted } : {}),
  };
}

/**
 * Orchestre la publication Vinted d'une fiche.
 *
 * INVARIANT CRITIQUE : `emettreEvenement` et `ouvrirOnglet` ne sont appelés
 * QUE si `enregistrerUn` a résolu à `true`. Ne JAMAIS relâcher cette garde,
 * même partiellement (ex. ouvrir l'onglet avant l'événement, ou l'inverse,
 * sans vérifier `succes`) : c'est exactement le bug que ce module corrige.
 *
 * Renvoie `true` si la publication est allée jusqu'au bout (enregistrement +
 * événement + onglet), `false` sinon — utile pour les appelants qui veulent
 * réagir à un échec (ex. ne pas fermer un panneau).
 */
export async function publierVinted(
  f: ArticleEnCours,
  enregistrerUn: (id: string, statut: string) => Promise<boolean>,
  emettreEvenement: (detail: DetailPublicationVinted) => void,
  ouvrirOnglet: () => void,
): Promise<boolean> {
  if (!f.article) return false;
  // ⚠️ `f.id` — l'identité CLIENT de la fiche (cf. _reducer.ts), PAS
  // `f.article.id`. `enregistrer()` (page.tsx) résout ses ids via
  // `etatRef.current.fiches.find((x) => x.id === id)` : lui passer
  // `f.article.id` ne matche jamais aucune fiche, la boucle `continue`
  // silencieusement, aucun PATCH ne part, et `enregistrer()` renvoie
  // toujours `false` — la publication devient structurellement impossible.
  const succes = await enregistrerUn(f.id, "Brouillon");
  if (!succes) return false;
  emettreEvenement(detailPublicationVinted(f));
  ouvrirOnglet();
  return true;
}
