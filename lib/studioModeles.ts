/**
 * Catalogue des modèles d'image OpenRouter, vu du Studio : normalisation, tarif,
 * coût d'un sac, devis et règle de confirmation. Module PUR et ISOMORPHE : il
 * est importé par les composants client (le devis bouge quand on coche un
 * modèle) comme par le serveur (qui recalcule le même devis avant de payer).
 * Aucun import serveur, aucun réseau : la lecture d'OpenRouter est dans
 * lib/studioCatalogue.ts.
 *
 * Règles d'or :
 *  - JAMAIS un prix inventé. Un modèle sans prix par image publié est « au
 *    jeton » ou « inconnu », et l'un comme l'autre exigent une confirmation ;
 *  - jamais un coût absent compté zéro : un montant inconnu reste `null`.
 *
 * Budget (refonte du 20/10) : un budget PAR SAC (15 prises), en euros, réglé
 * dans les réglages du Studio (1 € par défaut). OpenRouter facture en dollars :
 * un taux « euros pour 1 dollar » (0,86 par défaut), affiché et réglable,
 * convertit. Un lancement demande confirmation si son estimation dépasse
 * STRICTEMENT le budget, ou si un seul prix est inconnu. Le seuil fixe de 0,10 $
 * est supprimé.
 *
 * Source des tarifs : GET /api/v1/images/models/{id}/endpoints, `pricing[]`
 * avec { billable, unit, cost_usd, variant? } (relevé du 19/10/2026).
 * /models?output_modalities=image ne publie que des prix au jeton.
 */

import { MAX_PRISES } from "./studioCases";

// ── Budget ──────────────────────────────────────────────────────────────────

/** Budget d'un sac complet, en euros, tant que le compte n'en a pas réglé un autre. */
export const BUDGET_PAR_SAC_EUR_DEFAUT = 1;
/** Euros pour 1 dollar : valeur de départ, à régler (aucun service de change n'est interrogé). */
export const TAUX_EUR_PAR_USD_DEFAUT = 0.86;
/** Un sac complet : une image par prise (une prise = une vraie photo = une image générée). */
export const PRISES_PAR_SAC = MAX_PRISES;

/** Bornes de saisie : au-delà, c'est une faute de frappe (0,086 ou 8,6 pour 0,86). */
export const BUDGET_EUR_MAX = 1000;
export const TAUX_EUR_PAR_USD_MIN = 0.5;
export const TAUX_EUR_PAR_USD_MAX = 2;

/**
 * @deprecated Le seuil fixe de 0,10 $ n'existe plus : une confirmation compare
 * l'estimation au budget du COMPTE (`BudgetCompte`, `devisLancement`). Ce n'est
 * plus que le budget PAR DÉFAUT converti en dollars, laissé pour que l'ancien
 * `app/studio/_components/SelecteurModeles.tsx` (code mort, en cours de
 * réécriture) compile encore. Ne rien décider avec. À SUPPRIMER avec ce fichier.
 */
export const SEUIL_CONFIRMATION_USD = Math.round((BUDGET_PAR_SAC_EUR_DEFAUT / TAUX_EUR_PAR_USD_DEFAUT) * 1e4) / 1e4;

/** Les deux réglages de coût d'un compte (`StudioReglages`). */
export type BudgetCompte = { budgetParSacEur: number; tauxEurParUsd: number };

export const BUDGET_PAR_DEFAUT: BudgetCompte = {
  budgetParSacEur: BUDGET_PAR_SAC_EUR_DEFAUT,
  tauxEurParUsd: TAUX_EUR_PAR_USD_DEFAUT,
};

/** Le ratio des fiches produit du Studio : portrait 3:4. */
export const RATIO_STUDIO = "3:4";

export type Tarif =
  | { kind: "image"; sortieUsd: number; entreeParImageUsd: number } // prix publiés par image
  | { kind: "jeton" } // seulement au jeton
  | { kind: "inconnu" };

export type ModeleImage = {
  id: string;
  nom: string;
  description: string;
  /** Références d'entrée acceptées au plus (≥ 1, sinon le modèle n'est pas retenu). */
  maxReferences: number;
  /** Références exigées au moins (krea/k3-edit : 1). */
  minReferences: number;
  /** Ratios listés par le modèle ; null = aucun `aspect_ratio` publié, donc on n'en envoie pas. */
  ratios: string[] | null;
  tarif: Tarif;
};

export type Estimation = { modele: string; usd: number | null; raison: "image" | "jeton" | "inconnu" };

/** Le noyau d'un devis, en dollars. `DevisBudget` y ajoute les euros et le budget. */
export type Devis = { lignes: Estimation[]; totalConnuUsd: number; inconnus: number; confirmationRequise: boolean };

/** Pourquoi une confirmation est demandée ; null = aucune. */
export type RaisonConfirmation = "budget" | "prix_inconnu" | "budget_et_prix_inconnu";

/** Un montant (ou un sac) comparé au budget. « inconnu » : un prix manque, on ne conclut pas. */
export type StatutBudget = "dans" | "hors" | "inconnu";

/**
 * Un devis comparé au budget du compte. Les montants inconnus ne sont jamais
 * comptés zéro : `totalConnuEur` n'additionne que les prix connus, et dès que
 * `inconnus > 0` c'est un MINIMUM (`montantMinimum`).
 */
export type DevisBudget = Devis & {
  budgetEur: number;
  tauxEurParUsd: number;
  /** Total des prix connus, en euros (au 1e-9 près). */
  totalConnuEur: number;
  /** Le total connu dépasse STRICTEMENT le budget (ou le budget est inutilisable : on redemande). */
  depasseBudget: boolean;
  raisonConfirmation: RaisonConfirmation | null;
  /** Montant du bouton « Confirmer 1,34 € » : `totalConnuEur` arrondi au centime SUPÉRIEUR, jamais en dessous du réel. */
  montantConfirmationEur: number;
  /** Vrai si au moins un prix est inconnu : le vrai total est supérieur au montant affiché. */
  montantMinimum: boolean;
};

const INCONNU: Tarif = { kind: "inconnu" };

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const arrondi = (x: number, decimales: number): number => {
  const f = 10 ** decimales;
  return Math.round(x * f) / f;
};

// ── Normalisation d'un modèle ───────────────────────────────────────────────

const modalites = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/**
 * Un élément de GET /images/models devient un `ModeleImage`, ou null s'il ne
 * sert pas le Studio :
 *  - la sortie ne contient pas d'image ;
 *  - l'entrée n'accepte pas d'image (le Studio part toujours de vraies photos) ;
 *  - `input_references.max` < 1 ;
 *  - il ne sait rendre que du SVG (`output_format` limité à « svg ») : le Blob
 *    n'accepte que jpg|png|webp et la vérification IA ne lit pas du vectoriel,
 *    l'image serait payée puis rejetée.
 * `input_references` absent mais entrée image : une référence (repli prudent,
 * par ex. meta/muse-image publie `supported_parameters: {}`).
 */
export function normaliserModele(raw: unknown, tarif: Tarif): ModeleImage | null {
  if (!estObjet(raw)) return null;
  const id = raw.id;
  if (typeof id !== "string" || id.trim() === "") return null;

  const archi = estObjet(raw.architecture) ? raw.architecture : {};
  if (!modalites(archi.output_modalities).includes("image")) return null;
  if (!modalites(archi.input_modalities).includes("image")) return null;

  const params = estObjet(raw.supported_parameters) ? raw.supported_parameters : {};

  const formats = estObjet(params.output_format) ? modalites(params.output_format.values) : [];
  if (formats.length > 0 && formats.every((f) => f === "svg")) return null;

  const refs = estObjet(params.input_references) ? params.input_references : {};
  const maxReferences = estNombre(refs.max) ? Math.floor(refs.max) : 1;
  if (maxReferences < 1) return null;
  const minReferences = Math.min(Math.max(estNombre(refs.min) ? Math.floor(refs.min) : 0, 0), maxReferences);

  const ratios = estObjet(params.aspect_ratio) && Array.isArray(params.aspect_ratio.values)
    ? params.aspect_ratio.values.filter((r): r is string => typeof r === "string")
    : null;

  return {
    id,
    nom: typeof raw.name === "string" && raw.name.trim() !== "" ? raw.name : id,
    description: typeof raw.description === "string" ? raw.description : "",
    maxReferences,
    minReferences,
    ratios,
    tarif,
  };
}

// ── Tarif ───────────────────────────────────────────────────────────────────

/** Entrées facturées à l'image de référence. `input_font` et `input_text` : jamais envoyés par le Studio. */
const ENTREES_REFERENCE = new Set(["input_image", "input_reference"]);

/**
 * Tarif d'un modèle d'après GET /images/models/{id}/endpoints.
 *
 * Estimation PRUDENTE : le maximum sur tous les fournisseurs et toutes les
 * variantes de résolution, donc un majorant.
 *  - `image` : chaque fournisseur publie au moins un `output_image`, tous « à
 *    l'image ». `sortieUsd` = le plus cher ; `entreeParImageUsd` = le plus cher
 *    des `input_image` / `input_reference` « à l'image » (0 s'il n'y en a pas) ;
 *    un forfait « à la requête » sur une entrée (recraft : 0,005 $) s'ajoute à
 *    `sortieUsd`, car le Studio joint toujours au moins une référence.
 *  - `jeton` : une sortie est facturée au jeton, ou (sortie à l'image) une
 *    entrée l'est.
 *  - `inconnu` : forme illisible, prix négatif ou non numérique, fournisseur
 *    sans prix de sortie, unité qu'on ne sait pas ramener à l'image (mégapixel…).
 */
export function tarifDepuisEndpoints(raw: unknown): Tarif {
  if (!estObjet(raw) || !Array.isArray(raw.endpoints) || raw.endpoints.length === 0) return INCONNU;

  let sortieMax = 0;
  let entreeMax = 0;
  let forfaitMax = 0;
  let sortieAuJeton = false;
  let sortieIllisible = false;
  let entreeAuJeton = false;
  let entreeIllisible = false;

  for (const endpoint of raw.endpoints) {
    if (!estObjet(endpoint) || !Array.isArray(endpoint.pricing)) return INCONNU;
    let aUneSortie = false;
    let forfait = 0;

    for (const p of endpoint.pricing) {
      if (!estObjet(p)) return INCONNU;
      const sortie = p.billable === "output_image";
      const entree = typeof p.billable === "string" && ENTREES_REFERENCE.has(p.billable);
      if (!sortie && !entree) continue;
      if (!estNombre(p.cost_usd) || p.cost_usd < 0) return INCONNU;
      const cout = p.cost_usd;

      if (sortie) {
        aUneSortie = true;
        if (p.unit === "image") sortieMax = Math.max(sortieMax, cout);
        else if (p.unit === "token") sortieAuJeton = true;
        else sortieIllisible = true;
      } else if (p.unit === "image") entreeMax = Math.max(entreeMax, cout);
      else if (p.unit === "request") forfait = Math.max(forfait, cout);
      else if (p.unit === "token") entreeAuJeton = true;
      else entreeIllisible = true;
    }

    // Un fournisseur sans prix de sortie : le majorant n'en est plus un.
    if (!aUneSortie) return INCONNU;
    forfaitMax = Math.max(forfaitMax, forfait);
  }

  if (sortieAuJeton) return { kind: "jeton" };
  if (sortieIllisible || entreeIllisible) return INCONNU;
  if (entreeAuJeton) return { kind: "jeton" };
  return { kind: "image", sortieUsd: sortieMax + forfaitMax, entreeParImageUsd: entreeMax };
}

// ── Conversion et budget ────────────────────────────────────────────────────

const tauxValide = (taux: number): boolean => estNombre(taux) && taux > 0;
const budgetValide = (b: BudgetCompte): boolean => estNombre(b.budgetParSacEur) && b.budgetParSacEur > 0 && tauxValide(b.tauxEurParUsd);

/** Dollars → euros au taux « euros pour 1 dollar » ; null si le montant ou le taux est inutilisable. */
export function usdEnEur(usd: number | null, taux: number): number | null {
  if (usd === null || !estNombre(usd) || usd < 0 || !tauxValide(taux)) return null;
  return arrondi(usd * taux, 9);
}

/** Euros → dollars (le budget en dollars) ; null si le montant ou le taux est inutilisable. */
export function eurEnUsd(eur: number | null, taux: number): number | null {
  if (eur === null || !estNombre(eur) || eur < 0 || !tauxValide(taux)) return null;
  return arrondi(eur / taux, 9);
}

/**
 * Un montant est-il dans le budget ? « hors » STRICTEMENT au-delà (le budget
 * pile ne demande rien), « inconnu » sans montant ou sans budget lisible. Les
 * deux côtés sont arrondis à 1e-9 : 0,1 $ × 0,86 ne doit pas dépasser 0,086 €
 * à cause de la virgule flottante.
 */
export function comparerAuBudget(eur: number | null, budgetEur: number): StatutBudget {
  if (eur === null || !estNombre(eur) || eur < 0 || !estNombre(budgetEur) || budgetEur <= 0) return "inconnu";
  return arrondi(eur, 9) > arrondi(budgetEur, 9) ? "hors" : "dans";
}

/** Centime supérieur : le montant affiché sur un bouton de confirmation ne sous-estime jamais. */
const auCentimeSuperieur = (eur: number): number => Math.ceil(arrondi(eur * 100, 6)) / 100;

export type ReglagesBudgetSaisis = { budgetParSacEur?: number; tauxEurParUsd?: number };

/**
 * Les réglages de coût d'un corps de requête. Chaque champ est facultatif
 * (absent = inchangé) mais, présent, doit être un nombre dans les bornes :
 * budget de 0,01 à 1 000 € (arrondi au centime), taux de 0,5 à 2 € pour 1 $
 * (arrondi à 4 décimales). `null`, une chaîne ou NaN sont refusés, pas ignorés.
 * Un corps sans aucun des deux champs rend `{}` : à l'appelant de décider.
 */
export function lireBudgetSaisi(body: unknown): ReglagesBudgetSaisis | { erreur: string } {
  if (!estObjet(body)) return { erreur: "Réglages illisibles." };
  const out: ReglagesBudgetSaisis = {};

  if (body.budgetParSacEur !== undefined) {
    const v = body.budgetParSacEur;
    if (!estNombre(v)) return { erreur: "Budget par sac illisible : un montant en euros est attendu." };
    const cents = arrondi(v, 2);
    if (cents <= 0 || cents > BUDGET_EUR_MAX) return { erreur: `Budget par sac : de 0,01 € à ${BUDGET_EUR_MAX} €.` };
    out.budgetParSacEur = cents;
  }

  if (body.tauxEurParUsd !== undefined) {
    const v = body.tauxEurParUsd;
    if (!estNombre(v)) return { erreur: "Taux illisible : un nombre d'euros pour 1 dollar est attendu." };
    const taux = arrondi(v, 4);
    if (taux < TAUX_EUR_PAR_USD_MIN || taux > TAUX_EUR_PAR_USD_MAX) {
      return { erreur: `Taux : entre ${String(TAUX_EUR_PAR_USD_MIN).replace(".", ",")} et ${TAUX_EUR_PAR_USD_MAX} € pour 1 $.` };
    }
    out.tauxEurParUsd = taux;
  }

  return out;
}

// ── Entrées facturées ───────────────────────────────────────────────────────

/** Places pour de vraies photos : le maximum du modèle, moins une pour l'image ratée d'une correction. */
export function placesPourPhotos(maxReferences: number, avecImageRatee: boolean): number {
  const max = Number.isFinite(maxReferences) ? Math.floor(maxReferences) : 0;
  return Math.max(0, max - (avecImageRatee ? 1 : 0));
}

/**
 * Images d'entrée réellement envoyées à ce modèle (image ratée d'une correction
 * comprise) : la base du devis, après troncature au maximum du modèle. C'est ce
 * qui sera facturé, donc la même règle sert l'écran et le serveur.
 */
export function entreesEnvoyees(
  m: Pick<ModeleImage, "maxReferences">,
  nbPhotos: number,
  avecImageRatee: boolean,
): { photos: number; total: number } {
  const dispo = estNombre(nbPhotos) ? Math.max(0, Math.floor(nbPhotos)) : 0;
  const photos = Math.min(dispo, placesPourPhotos(m.maxReferences, avecImageRatee));
  return { photos, total: photos + (avecImageRatee ? 1 : 0) };
}

// ── Estimation et devis ─────────────────────────────────────────────────────

/** Coût estimé d'UN essai : la sortie, plus l'entrée de chaque référence jointe. Arrondi à 1e-4. */
export function estimerEssai(m: Pick<ModeleImage, "id" | "tarif">, nbReferences: number): Estimation {
  const t = m.tarif;
  if (t.kind === "jeton") return { modele: m.id, usd: null, raison: "jeton" };
  if (t.kind === "inconnu") return { modele: m.id, usd: null, raison: "inconnu" };
  const n = estNombre(nbReferences) && nbReferences > 0 ? nbReferences : 0;
  return { modele: m.id, usd: arrondi(t.sortieUsd + t.entreeParImageUsd * n, 4), raison: "image" };
}

/**
 * Coût d'un sac complet (15 prises, une image par prise) avec ce modèle, comparé
 * au budget. Chaque prise envoie UNE vraie photo (`nbPhotosParPrise`, défaut 1),
 * tronquée au maximum du modèle. Un modèle « au jeton » ou « inconnu » n'a pas de
 * coût de sac : `usd` et `eur` restent null et `statutBudget` vaut « inconnu » —
 * jamais « dans le budget », jamais zéro.
 */
export type CoutSac = {
  modele: string;
  nbPrises: number;
  raison: Estimation["raison"];
  usdParImage: number | null;
  eurParImage: number | null;
  usd: number | null;
  eur: number | null;
  statutBudget: StatutBudget;
};

export function coutSac(
  m: Pick<ModeleImage, "id" | "tarif" | "maxReferences">,
  budget: BudgetCompte = BUDGET_PAR_DEFAUT,
  opts: { nbPrises?: number; nbPhotosParPrise?: number } = {},
): CoutSac {
  const nbPrises = estNombre(opts.nbPrises) && opts.nbPrises >= 1 ? Math.floor(opts.nbPrises) : PRISES_PAR_SAC;
  const { total } = entreesEnvoyees(m, opts.nbPhotosParPrise ?? 1, false);
  const e = estimerEssai(m, total);
  const usd = e.usd === null ? null : arrondi(e.usd * nbPrises, 6);
  const eur = usdEnEur(usd, budget.tauxEurParUsd);
  return {
    modele: m.id,
    nbPrises,
    raison: e.raison,
    usdParImage: e.usd,
    eurParImage: usdEnEur(e.usd, budget.tauxEurParUsd),
    usd,
    eur,
    statutBudget: comparerAuBudget(eur, budget.budgetParSacEur),
  };
}

/**
 * Devis d'un lancement : la somme des estimations (une par image à générer),
 * comparée au budget du compte. La confirmation est requise si un tarif est
 * inconnu OU si le total connu, en euros, dépasse STRICTEMENT le budget : le
 * budget pile ne confirme pas. Un montant inutilisable (NaN, négatif) compte
 * comme inconnu, jamais comme zéro. Un budget ou un taux inutilisable redemande
 * toujours : dans le doute, on ne laisse pas payer sans confirmation. Les
 * sommes sont arrondies à 1e-9 avant toute comparaison (le bruit de la virgule
 * flottante ne doit pas déclencher une confirmation à tort).
 *
 * Sans `budget`, le budget par défaut (1 €, taux 0,86) s'applique.
 */
export function devisLancement(estimations: Estimation[], budget: BudgetCompte = BUDGET_PAR_DEFAUT): DevisBudget {
  let total = 0;
  let inconnus = 0;
  for (const e of estimations) {
    if (e.usd === null || !estNombre(e.usd) || e.usd < 0) inconnus += 1;
    else total += e.usd;
  }
  const totalConnuUsd = arrondi(total, 9);
  const totalConnuEur = usdEnEur(totalConnuUsd, budget.tauxEurParUsd) ?? 0;
  const lisible = budgetValide(budget);
  const depasseBudget = !lisible || comparerAuBudget(totalConnuEur, budget.budgetParSacEur) === "hors";
  const raisonConfirmation: RaisonConfirmation | null =
    depasseBudget && inconnus > 0 ? "budget_et_prix_inconnu" : depasseBudget ? "budget" : inconnus > 0 ? "prix_inconnu" : null;
  return {
    lignes: [...estimations],
    totalConnuUsd,
    inconnus,
    confirmationRequise: raisonConfirmation !== null,
    budgetEur: budget.budgetParSacEur,
    tauxEurParUsd: budget.tauxEurParUsd,
    totalConnuEur,
    depasseBudget,
    raisonConfirmation,
    montantConfirmationEur: auCentimeSuperieur(totalConnuEur),
    montantMinimum: inconnus > 0,
  };
}

/** Une ligne du devis par modèle : ce que ce modèle coûte sur ce lancement. */
export type LigneModeleDevis = {
  modele: string;
  nom: string;
  /** Images à générer avec ce modèle : une par case. */
  images: number;
  raison: Estimation["raison"];
  usdParImage: number | null;
  eurParImage: number | null;
  /** `images` × prix par image ; null si le prix est inconnu (jamais zéro). */
  usd: number | null;
  eur: number | null;
};

export type DevisMultiModeles = DevisBudget & {
  parModele: LigneModeleDevis[];
  /** Images du lancement, tous modèles confondus (cases × modèles). */
  images: number;
};

/**
 * Devis d'un lancement visant 1 à 3 modèles sur `nbCases` cases : chaque modèle
 * génère une image par case. `lignes` compte une estimation par image (cases ×
 * modèles, les images d'un même modèle à la suite) ; `parModele` donne le
 * résultat par modèle pour l'affichage. Un lancement sur 2 ou 3 modèles pour UNE
 * prise est `nbCases: 1` avec 2 ou 3 modèles : le devis multiplie les coûts en
 * conséquence. `nbPhotos` : vraies photos jointes à chaque image (défaut 1) ;
 * `avecImageRatee` : une correction, dont l'image ratée s'ajoute en entrée.
 * C'est LE calcul du serveur et de l'écran : mêmes entrées, même devis.
 */
export function devisDuLancement(p: {
  modeles: readonly Pick<ModeleImage, "id" | "nom" | "tarif" | "maxReferences">[];
  nbCases: number;
  nbPhotos?: number;
  avecImageRatee?: boolean;
  budget?: BudgetCompte;
}): DevisMultiModeles {
  const budget = p.budget ?? BUDGET_PAR_DEFAUT;
  const nbCases = estNombre(p.nbCases) && p.nbCases >= 1 ? Math.floor(p.nbCases) : 1;
  const avecImageRatee = p.avecImageRatee === true;

  const estimations: Estimation[] = [];
  const parModele: LigneModeleDevis[] = [];
  for (const m of p.modeles) {
    const { total } = entreesEnvoyees(m, p.nbPhotos ?? 1, avecImageRatee);
    const e = estimerEssai(m, total);
    for (let i = 0; i < nbCases; i++) estimations.push(e);
    const usd = e.usd === null ? null : arrondi(e.usd * nbCases, 6);
    parModele.push({
      modele: m.id,
      nom: m.nom,
      images: nbCases,
      raison: e.raison,
      usdParImage: e.usd,
      eurParImage: usdEnEur(e.usd, budget.tauxEurParUsd),
      usd,
      eur: usdEnEur(usd, budget.tauxEurParUsd),
    });
  }
  return { ...devisLancement(estimations, budget), parModele, images: estimations.length };
}

// ── Libellés ────────────────────────────────────────────────────────────────

/** « 0,018 $ » (sous 1 $ : trois décimales, au-delà : deux) ; null ou inutilisable → « inconnu ». */
export function formatUsd(usd: number | null): string {
  if (usd === null || !estNombre(usd) || usd < 0) return "inconnu";
  if (usd === 0) return "0,00 $";
  const fin = usd.toFixed(3);
  // Un vrai montant ne s'affiche pas « 0,000 $ ».
  if (Number(fin) === 0) return "< 0,001 $";
  // 0,9996 s'arrondit à 1,000 : au-delà de 1 $, deux décimales.
  const texte = Number(fin) < 1 ? fin : usd.toFixed(2);
  return `${texte.replace(".", ",")} $`;
}

/**
 * « 1,34 € » : deux décimales dès 0,10 €, et pour tout montant qui tombe juste au
 * centime (« 0,05 € », le budget ou le total d'une confirmation). Un prix par
 * image qui ne tombe pas juste en dessous de 0,10 € prend trois décimales
 * (« 0,016 € »). null ou inutilisable → « inconnu ». Jamais « 0,000 € » pour un
 * vrai montant.
 */
export function formatEur(eur: number | null): string {
  if (eur === null || !estNombre(eur) || eur < 0) return "inconnu";
  if (eur === 0) return "0,00 €";
  const auCentime = Math.abs(eur * 100 - Math.round(eur * 100)) < 1e-6;
  if (eur < 0.1 && !auCentime) {
    const fin = eur.toFixed(3);
    if (Number(fin) === 0) return "< 0,001 €";
    return `${fin.replace(".", ",")} €`;
  }
  return `${eur.toFixed(2).replace(".", ",")} €`;
}

/** « 0,018 $/image » | « tarif au jeton » | « tarif inconnu » (+ « + 0,200 $/réf. » si chaque référence est payante). */
export function libelleTarif(t: Tarif): string {
  if (t.kind === "jeton") return "tarif au jeton";
  if (t.kind === "inconnu") return "tarif inconnu";
  const base = `${formatUsd(t.sortieUsd)}/image`;
  return t.entreeParImageUsd > 0 ? `${base} + ${formatUsd(t.entreeParImageUsd)}/réf.` : base;
}
