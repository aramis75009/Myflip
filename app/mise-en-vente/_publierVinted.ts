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

export type DetailPublicationVinted = {
  articleId: string;
  titre: string;
  description: string;
  prix: string;
  /** Blob pleine résolution — cf. _reducer.ts sur `Photo.blob`. */
  photos: Blob[];
};

/** Charge utile du `CustomEvent("myflip:publier-vinted")` consommé par l'extension. */
export function detailPublicationVinted(f: ArticleEnCours): DetailPublicationVinted {
  return {
    articleId: f.article!.id,
    titre: f.annonce.titre,
    description: f.annonce.description,
    prix: f.qcm.prix,
    photos: f.photos.map((p) => p.blob),
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
  const succes = await enregistrerUn(f.article.id, "Brouillon");
  if (!succes) return false;
  emettreEvenement(detailPublicationVinted(f));
  ouvrirOnglet();
  return true;
}
