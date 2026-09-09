// État de l'assistant de mise en vente, de 1 à 5 articles par session.
//
// CE FICHIER EST PUR : ni React, ni fetch, ni DOM. C'est ce qui le rend
// testable sans navigateur, et c'est toute la surface couverte par Vitest.
// Les effets de bord (révocation des object URLs, appels réseau) vivent dans
// page.tsx — un reducer est invoqué DEUX FOIS en StrictMode React 18, donc
// tout effet qui s'y glisse s'exécute en double.
//
// ── Machine à états d'une fiche ───────────────────────────────────────────
//
//   sku/saisie          sku/resolu            fiche complète
//  ┌──────────┐  lookup  ┌──────────┐  photos  ┌──────────┐
//  │   vide   │─────────▶│  prete   │◀────────▶│  prete   │
//  └──────────┘          └────┬─────┘          └────┬─────┘
//       ▲                     │                     │ generation/debut
//       │ sku/echec           │                     ▼
//       │                     │                ┌──────────┐
//       └─────────────────────┘                │ encours  │
//                                              └────┬─────┘
//                        generation/echec ──────────┼────────── generation/ok
//                                 ▼                                    ▼
//                           ┌──────────┐  relance                ┌──────────┐
//                           │  erreur  │────────────────────────▶│    ok    │
//                           └──────────┘                         └──────────┘
//
// `encours` et `erreur` sont exclusifs par construction : l'union discriminée
// rend l'état « en cours ET en erreur » inexprimable. C'est précisément ce
// couple de booléens indépendants qui avait produit l'écran de chargement
// infini de l'ancienne version.

import type { ArticleDTO } from "@/lib/types";
import type { GenerateResult } from "@/lib/hooks";

/** Plafond de fiches par session. Au-delà, le rail devient illisible et la
 *  file d'attente séquentielle dépasse la patience de qui la regarde. */
export const MAX_FICHES = 5;
/** Photos par fiche. Le canvas pleine résolution étant libéré après l'étape
 *  photos (cf. `photo/liberer-base`), ce plafond est ergonomique, pas
 *  technique : au-delà, la grille de vignettes déborde. */
export const MAX_PHOTOS = 20;
export const MAX_SELECT = 3;
export const MIN_SELECT = 2;

/**
 * Libellés « collectifs » : ils décrivent un lot mixte, pas un fabricant ni un
 * type de pièce. Les laisser passer dans une annonce donnerait « Polo Mix ».
 * À l'utilisateur (ou à l'IA) de trancher article par article.
 */
const MARQUES_NON_ANNONCABLES = new Set(["Mix", "TNF/PAT/COL", "À définir"]);
const CATEGORIES_NON_ANNONCABLES = new Set(["Mix", "À définir"]);

/** Valeurs de départ du QCM, prises sur l'article, libellés collectifs vidés. */
export function libellesAnnoncables(a: { marque: string; categorie: string }): {
  marque: string;
  categorie: string;
} {
  return {
    marque: MARQUES_NON_ANNONCABLES.has(a.marque) ? "" : a.marque,
    categorie: CATEGORIES_NON_ANNONCABLES.has(a.categorie) ? "" : a.categorie,
  };
}

export type PhaseLookup =
  | { phase: "idle" }
  | { phase: "encours" }
  | { phase: "ok" }
  | { phase: "erreur"; message: string };

export type PhaseGeneration =
  | { phase: "vide" }
  | { phase: "prete" }
  | { phase: "encours" }
  | { phase: "ok"; resultat: GenerateResult }
  | { phase: "erreur"; message: string };

export type Qcm = {
  marque: string;
  marqueCustom: boolean;
  categorie: string;
  categorieCustom: boolean;
  taille: string;
  etat: string;
  matiere: string;
  matiere2: string;
  details: string;
  prix: string;
  /** Ids de couleur Vinted, 0 à 2. Vinted plafonne la sélection à 2. */
  couleurs: number[];
};

export type Photo = {
  id: string;
  /**
   * Canvas pleine résolution, source lossless des rotations.
   *
   * ⚠️ ~48 Mo pour une photo d'iPhone (4032×3024 en RGBA). Libéré dès que la
   * fiche quitte l'étape photos : à 5 fiches, le garder coûterait des giga-
   * octets. Une rotation tardive re-décode depuis `blob`.
   *
   * `blob`, lui, n'est JAMAIS dégradé : c'est le JPEG déposé sur Vinted.
   */
  base: HTMLCanvasElement | null;
  rotation: number;
  url: string;
  blob: Blob;
};

export type ArticleEnCours = {
  /** Identité CLIENT, stable, distincte de `article.id` qui peut être absent.
   *  Sert de clé React, de `mutationKey`, et de ligne dans le rail. */
  id: string;
  sku: string;
  /**
   * Garde de course, PAR FICHE.
   *
   * ⚠️ Le numéro est généré par l'APPELANT et voyage dans `sku/lookup` puis
   * dans `sku/resolu`. `useReducer` ne rend pas la valeur dispatchée : un
   * handler asynchrone ne peut pas relire le compteur qu'il vient
   * d'incrémenter. Le reducer se contente de jeter les réponses dont le `seq`
   * ne correspond plus.
   */
  lookupSeq: number;
  article: ArticleDTO | null;
  lookup: PhaseLookup;
  photos: Photo[];
  /** Tableau et non Set : l'ordre de sélection est la priorité envoyée à l'IA. */
  selected: string[];
  qcm: Qcm;
  /** Résolu PAR ARTICLE. Un `promptId` unique pour la session ferait générer
   *  les cinq annonces avec le prompt de la première, en silence. */
  promptId: string | null;
  generation: PhaseGeneration;
  annonce: { titre: string; description: string; motsCles: string };
  /** Statut posé lors du dernier enregistrement réussi, ou null. */
  enregistre: string | null;
  /** Échec du dernier enregistrement. Par fiche : l'ancienne version lisait
   *  `updateArticle.isError`, partagé, donc accroché à la mauvaise fiche. */
  erreurEnregistrement: string | null;
};

export type Etape = 1 | 2 | 3 | 4;

export type EtatMev = {
  fiches: ArticleEnCours[];
  /** `id` de la fiche affichée dans le panneau de droite. */
  active: string;
  etape: Etape;
};

export type ActionMev =
  | { type: "fiche/ajout"; id: string }
  | { type: "fiche/retrait"; id: string }
  | { type: "fiche/active"; id: string }
  | { type: "sku/saisie"; id: string; sku: string }
  | { type: "sku/lookup"; id: string; seq: number }
  | { type: "sku/resolu"; id: string; seq: number; article: ArticleDTO }
  | { type: "sku/echec"; id: string; seq: number; message: string }
  | { type: "photo/ajout"; id: string; photos: Photo[] }
  | { type: "photo/retrait"; id: string; photoId: string }
  | {
      type: "photo/rotation";
      id: string;
      photoId: string;
      rotation: number;
      url: string;
      blob: Blob;
    }
  | { type: "photo/selection"; id: string; photoId: string }
  | { type: "photo/liberer-base" }
  | { type: "qcm"; id: string; champ: keyof Qcm; valeur: string | boolean | number[] }
  | { type: "prompt"; id: string; promptId: string | null }
  | { type: "generation/debut"; id: string }
  | { type: "generation/ok"; id: string; resultat: GenerateResult }
  | { type: "generation/echec"; id: string; message: string }
  | {
      type: "annonce";
      id: string;
      champ: "titre" | "description" | "motsCles";
      valeur: string;
    }
  | { type: "enregistre"; id: string; statut: string }
  | { type: "enregistrement/echec"; id: string; message: string }
  | { type: "etape"; etape: Etape }
  | { type: "session/restaure"; etat: EtatMev }
  | { type: "reset"; id: string };

const QCM_VIDE: Qcm = {
  marque: "",
  marqueCustom: false,
  categorie: "",
  categorieCustom: false,
  taille: "",
  etat: "",
  matiere: "",
  matiere2: "",
  details: "",
  prix: "",
  couleurs: [],
};

export function ficheVide(id: string): ArticleEnCours {
  return {
    id,
    sku: "",
    lookupSeq: 0,
    article: null,
    lookup: { phase: "idle" },
    photos: [],
    selected: [],
    qcm: { ...QCM_VIDE },
    promptId: null,
    generation: { phase: "vide" },
    annonce: { titre: "", description: "", motsCles: "" },
    enregistre: null,
    erreurEnregistrement: null,
  };
}

export function etatInitial(id: string): EtatMev {
  return { fiches: [ficheVide(id)], active: id, etape: 1 };
}

/** Applique `fn` à la fiche ciblée, laisse les autres intactes. */
function surFiche(
  etat: EtatMev,
  id: string,
  fn: (f: ArticleEnCours) => ArticleEnCours,
): EtatMev {
  const fiches = etat.fiches.map((f) => (f.id === id ? fn(f) : f));
  return fiches === etat.fiches ? etat : { ...etat, fiches };
}

export function reducerMev(etat: EtatMev, action: ActionMev): EtatMev {
  switch (action.type) {
    case "fiche/ajout": {
      if (etat.fiches.length >= MAX_FICHES) return etat;
      return {
        ...etat,
        fiches: [...etat.fiches, ficheVide(action.id)],
        active: action.id,
      };
    }

    case "fiche/retrait": {
      // Une session garde toujours au moins une fiche : sans elle, l'écran
      // n'a plus rien à afficher et l'utilisateur doit tout recommencer.
      if (etat.fiches.length <= 1) return etat;
      const fiches = etat.fiches.filter((f) => f.id !== action.id);
      const active =
        etat.active === action.id ? fiches[0].id : etat.active;
      return { ...etat, fiches, active };
    }

    case "fiche/active":
      return etat.fiches.some((f) => f.id === action.id)
        ? { ...etat, active: action.id }
        : etat;

    case "sku/saisie":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        sku: action.sku,
        // Toute saisie invalide la résolution précédente : sinon un SKU
        // à moitié retapé garderait l'article de l'ancien.
        article: null,
        lookup: { phase: "idle" },
      }));

    case "sku/lookup":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        lookupSeq: action.seq,
        lookup: { phase: "encours" },
      }));

    case "sku/resolu":
      return surFiche(etat, action.id, (f) =>
        // Réponse d'un lookup périmé : on la jette. Sans cette garde, une
        // recherche lente écrase le résultat d'une recherche plus récente.
        f.lookupSeq !== action.seq
          ? f
          : {
              ...f,
              article: action.article,
              lookup: { phase: "ok" },
              generation: f.generation.phase === "vide" ? { phase: "prete" } : f.generation,
              // Pré-remplissage depuis la fiche article, corrigeable ensuite.
              // Les libellés collectifs sont vidés : « Mix » n'est pas une marque.
              qcm: {
                ...f.qcm,
                marque: f.qcm.marqueCustom
                  ? f.qcm.marque
                  : libellesAnnoncables(action.article).marque,
                categorie: f.qcm.categorieCustom
                  ? f.qcm.categorie
                  : libellesAnnoncables(action.article).categorie,
              },
            },
      );

    case "sku/echec":
      return surFiche(etat, action.id, (f) =>
        f.lookupSeq !== action.seq
          ? f
          : { ...f, article: null, lookup: { phase: "erreur", message: action.message } },
      );

    case "photo/ajout":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        photos: [...f.photos, ...action.photos].slice(0, MAX_PHOTOS),
      }));

    case "photo/retrait":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        photos: f.photos.filter((p) => p.id !== action.photoId),
        selected: f.selected.filter((s) => s !== action.photoId),
      }));

    case "photo/rotation":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        photos: f.photos.map((p) =>
          p.id === action.photoId
            ? { ...p, rotation: action.rotation, url: action.url, blob: action.blob }
            : p,
        ),
      }));

    case "photo/selection":
      return surFiche(etat, action.id, (f) => {
        if (f.selected.includes(action.photoId)) {
          return { ...f, selected: f.selected.filter((s) => s !== action.photoId) };
        }
        if (f.selected.length >= MAX_SELECT) return f;
        return { ...f, selected: [...f.selected, action.photoId] };
      });

    case "photo/liberer-base":
      // Coupe la référence au canvas pleine résolution sur TOUTES les fiches.
      // Le blob reste : c'est lui qu'on envoie au modèle et qu'on télécharge.
      return {
        ...etat,
        fiches: etat.fiches.map((f) => ({
          ...f,
          photos: f.photos.map((p) => (p.base ? { ...p, base: null } : p)),
        })),
      };

    case "qcm":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        qcm: { ...f.qcm, [action.champ]: action.valeur },
      }));

    case "prompt":
      return surFiche(etat, action.id, (f) => ({ ...f, promptId: action.promptId }));

    case "generation/debut":
      return surFiche(etat, action.id, (f) => ({ ...f, generation: { phase: "encours" } }));

    case "generation/ok":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        generation: { phase: "ok", resultat: action.resultat },
        annonce: {
          titre: action.resultat.titre,
          description: action.resultat.description,
          motsCles: action.resultat.motsCles,
        },
        // Un nouveau texte n'est pas l'ancien : l'enregistrement redevient à faire.
        enregistre: null,
        erreurEnregistrement: null,
      }));

    case "generation/echec":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        generation: { phase: "erreur", message: action.message },
      }));

    case "annonce":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        annonce: { ...f.annonce, [action.champ]: action.valeur },
      }));

    case "enregistre":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        enregistre: action.statut,
        erreurEnregistrement: null,
      }));

    case "enregistrement/echec":
      return surFiche(etat, action.id, (f) => ({
        ...f,
        enregistre: null,
        erreurEnregistrement: action.message,
      }));

    case "etape":
      return { ...etat, etape: action.etape };

    case "session/restaure":
      return action.etat;

    case "reset":
      return etatInitial(action.id);

    default:
      return etat;
  }
}

// ── Sélecteurs dérivés (purs, testés) ─────────────────────────────────────

/** Une fiche est générable quand son article existe, qu'elle a assez de
 *  photos sélectionnées, et que taille et état sont renseignés. */
export function fichePrete(f: ArticleEnCours): boolean {
  return (
    f.article !== null &&
    f.selected.length >= MIN_SELECT &&
    f.qcm.taille !== "" &&
    f.qcm.etat !== ""
  );
}

/** Ce qui manque à une fiche, en clair, pour l'afficher dans la barre. */
export function manquePourGenerer(f: ArticleEnCours): string[] {
  const manque: string[] = [];
  if (!f.article) manque.push("un SKU valide");
  if (f.selected.length < MIN_SELECT)
    manque.push(`${MIN_SELECT} photos sélectionnées`);
  if (!f.qcm.taille) manque.push("la taille");
  if (!f.qcm.etat) manque.push("l'état");
  return manque;
}

/**
 * SKU présents plus d'une fois dans la session.
 *
 * L'utilisateur a choisi d'être averti, pas bloqué (revue du 11/08/2026) :
 * deux fiches sur le même article produisent deux annonces dont la seconde
 * écrase la première, en silence. L'avertissement doit donc réapparaître au
 * moment de l'enregistrement, pas seulement à la saisie.
 */
export function skuEnDoublon(fiches: ArticleEnCours[]): Set<string> {
  const vus = new Map<string, number>();
  for (const f of fiches) {
    const sku = f.sku.trim().toUpperCase();
    if (!sku) continue;
    vus.set(sku, (vus.get(sku) ?? 0) + 1);
  }
  return new Set([...vus].filter(([, n]) => n > 1).map(([sku]) => sku));
}

/** Articles portant déjà une annonce : l'enregistrer l'écrasera. */
export function dejaAnnonces(fiches: ArticleEnCours[]): string[] {
  return fiches
    .filter((f) => f.article?.titreAnnonce)
    .map((f) => f.sku.trim().toUpperCase());
}

/** Avancement de la file de génération, pour la barre de progression. */
export function progression(fiches: ArticleEnCours[]): {
  faites: number;
  total: number;
  encours: number;
  erreurs: number;
} {
  return {
    total: fiches.length,
    faites: fiches.filter((f) => f.generation.phase === "ok").length,
    encours: fiches.filter((f) => f.generation.phase === "encours").length,
    erreurs: fiches.filter((f) => f.generation.phase === "erreur").length,
  };
}
