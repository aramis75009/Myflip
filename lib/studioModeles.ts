/**
 * Catalogue des modèles d'image OpenRouter, vu du Studio : normalisation, tarif,
 * devis et seuil de confirmation. Module PUR et ISOMORPHE : il est importé par
 * les composants client (le devis bouge quand on coche un modèle) comme par le
 * serveur (qui recalcule le même devis avant de payer). Aucun import serveur,
 * aucun réseau : la lecture d'OpenRouter est dans lib/studioCatalogue.ts.
 *
 * Règle d'or : JAMAIS un prix inventé. Un modèle sans prix par image publié est
 * « au jeton » ou « inconnu », et l'un comme l'autre exigent une confirmation.
 *
 * Source des tarifs : GET /api/v1/images/models/{id}/endpoints, `pricing[]`
 * avec { billable, unit, cost_usd, variant? } (relevé du 19/10/2026).
 * /models?output_modalities=image ne publie que des prix au jeton.
 */

/** Au-delà (strictement), ou si un tarif est inconnu, un lancement demande confirmation. */
export const SEUIL_CONFIRMATION_USD = 0.1;

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

export type Devis = { lignes: Estimation[]; totalConnuUsd: number; inconnus: number; confirmationRequise: boolean };

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
 * Devis d'un lancement (un angle × les modèles cochés). La confirmation est
 * requise si un tarif est inconnu OU si le total connu dépasse STRICTEMENT le
 * seuil : 0,10 $ pile ne confirme pas. Un montant inutilisable (NaN, négatif)
 * compte comme inconnu, jamais comme zéro. La somme est arrondie à 1e-9 avant
 * la comparaison : le bruit de la virgule flottante (0,0012 + 0,0889 + 0,0099
 * = 0,10000000000000002) ne doit pas déclencher une confirmation à tort.
 */
export function devisLancement(estimations: Estimation[]): Devis {
  let total = 0;
  let inconnus = 0;
  for (const e of estimations) {
    if (e.usd === null || !estNombre(e.usd) || e.usd < 0) inconnus += 1;
    else total += e.usd;
  }
  const totalConnuUsd = arrondi(total, 9);
  return {
    lignes: [...estimations],
    totalConnuUsd,
    inconnus,
    confirmationRequise: inconnus > 0 || totalConnuUsd > SEUIL_CONFIRMATION_USD,
  };
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

/** « 0,018 $/image » | « tarif au jeton » | « tarif inconnu » (+ « + 0,200 $/réf. » si chaque référence est payante). */
export function libelleTarif(t: Tarif): string {
  if (t.kind === "jeton") return "tarif au jeton";
  if (t.kind === "inconnu") return "tarif inconnu";
  const base = `${formatUsd(t.sortieUsd)}/image`;
  return t.entreeParImageUsd > 0 ? `${base} + ${formatUsd(t.entreeParImageUsd)}/réf.` : base;
}
