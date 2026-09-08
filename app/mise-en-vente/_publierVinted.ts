// Publication vers Vinted : le PATCH d'abord, l'événement ensuite — et
// l'événement SEULEMENT si le PATCH a réussi. L'ouverture de l'onglet n'a plus
// lieu ici : c'est l'extension qui crée le sien à réception de l'événement.
//
// Pourquoi un module à part plutôt qu'un bloc direct dans page.tsx : l'ancien
// <a target="_blank"> ouvrait l'onglet Vinted AU CLIC, avant que le PATCH
// asynchrone ait résolu. Un échec produisait quand même un onglet, donc un
// `tabs.onCreated` orphelin côté extension (Tâche 14) — qui apparie chaque
// onglet ouvert à un article mis en file par ORDRE DE CRÉATION. Un onglet en
// trop décale l'appariement de tous les onglets suivants ouverts dans la même
// session (bug identifié en revue Eng). Faire créer l'onglet par l'extension
// elle-même, à réception de l'événement, supprime le problème à la racine.
//
// Cette fonction matérialise le garde-fou. `enregistrerUn` et
// `emettreEvenement` sont INJECTÉS par l'appelant plutôt qu'appelés en dur
// (`window.dispatchEvent`) : ce fichier reste une fonction pure — sans React,
// sans DOM — donc testable par Vitest en environnement `node` (cf.
// vitest.config.ts). page.tsx branche les effets réels.

import type { ArticleEnCours } from "./_reducer";
import { pickVintedMapping } from "@/lib/vintedMapping";
import {
  conditionIdDepuisEtat,
  materialIdsDepuisMatieres,
} from "@/lib/vintedReferentiels";
import type { DelaiVinted } from "./_delaiVinted";

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
  /**
   * Délai anti-ban choisi pour CE lancement, en minutes.
   *
   * Il voyage avec l'annonce plutôt que d'être stocké quelque part et relu :
   * chaque entrée de la file de l'extension porte donc le sien, et deux lots
   * lancés avec des réglages différents s'enchaînent sans que le second impose
   * le sien au premier. Un délai fixe s'exprime `minMinutes === maxMinutes`.
   */
  delai: DelaiVinted;
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
export function detailPublicationVinted(
  f: ArticleEnCours,
  delai: DelaiVinted,
): DetailPublicationVinted {
  const vinted = champsVinted(f);
  return {
    articleId: f.article!.id,
    titre: f.annonce.titre,
    description: f.annonce.description,
    prix: f.qcm.prix,
    photos: f.photos.map((p) => p.blob),
    delai,
    ...(vinted ? { vinted } : {}),
  };
}

/**
 * Orchestre la publication Vinted d'une fiche.
 *
 * INVARIANT CRITIQUE : `emettreEvenement` n'est appelé QUE si `enregistrerUn`
 * a résolu à `true`. Ne jamais relâcher cette garde.
 *
 * ⚠️ Cette fonction n'ouvre PLUS d'onglet. C'est l'extension qui crée le sien
 * (`browser.tabs.create`), pour deux raisons : un `window.open()` placé après
 * un `await` réseau perd l'activation utilisateur (~5 s chez Firefox) et se
 * fait bloquer comme popup dès que le PATCH traîne ; et un onglet ouvert par
 * l'extension n'a plus besoin d'être apparié à son article après coup.
 * page.tsx garde un repli manuel pour le cas « extension non installée ».
 */
export async function publierVinted(
  f: ArticleEnCours,
  delai: DelaiVinted,
  enregistrerUn: (id: string, statut: string) => Promise<boolean>,
  emettreEvenement: (detail: DetailPublicationVinted) => void,
): Promise<boolean> {
  if (!f.article) return false;
  // ⚠️ `f.id` — l'identité CLIENT de la fiche, PAS `f.article.id` : c'est ce
  // que `enregistrer()` (page.tsx) sait résoudre.
  const succes = await enregistrerUn(f.id, "Brouillon");
  if (!succes) return false;
  emettreEvenement(detailPublicationVinted(f, delai));
  return true;
}

/**
 * L'extension est-elle installée ?
 *
 * `content-myflip.js` pose `data-myflip-vinted="1"` sur `<html>` à
 * l'injection. C'est le seul canal disponible : il n'existe aucune API MyFlip
 * que l'extension pourrait appeler, par choix de design. Sans marqueur, la
 * page ouvre l'onglet Vinted elle-même — le comportement d'avant ce chantier.
 */
export function extensionPresente(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.myflipVinted === "1";
}
