// Logique de calcul « façon Excel », partagée entre le serveur (écritures API)
// et le client (aperçus en temps réel). Une seule source de vérité pour les
// formules afin d'éviter toute divergence.

/** Taux appliqué au prix de vente pour obtenir la marge nette (TVA 20% sur marge). */
export const TVA_MARGE = 0.0638;

/** Statut « vendu » : déclenche le calcul des champs de vente. */
export const STATUT_VENDU = "Vendu";

/** Liste ordonnée des statuts possibles d'un article. */
export const STATUTS = [
  "Brouillon",
  "En stock",
  "Photos prêtes",
  "En vente",
  "En livraison",
  "À comptabiliser",
  "Vendu",
  "Retour",
  "En lavage",
  "Repassé",
  "Perdu",
] as const;

/** Statut « à comptabiliser » : article livré, en attente de validation comptable. */
export const STATUT_A_COMPTABILISER = "À comptabiliser";

/** Statut « photos prêtes » : article photographié, prêt pour la mise en vente. */
export const STATUT_PHOTOS_PRETES = "Photos prêtes";

/**
 * Statut « Retour » (décision d'Aramis, 22/10/2026) : vente annulée par le
 * client (colis non récupéré / ne lui plaît pas) et article en chemin vers
 * Paris. Cycle complet : Vendu → Retour (annonce du retour) → En stock
 * (réception physique) → Photos prêtes → En vente → Vendu, etc. Comme tout
 * statut hors « Vendu », quitter « Vendu » remet prix/date/marges à null —
 * la date de mise en vente survit, elle, pour l'historique.
 */
export const STATUT_RETOUR = "Retour";

export type Statut = (typeof STATUTS)[number];

// ── SKU ───────────────────────────────────────────────────────────────────
//
// Format : 2 ou 3 lettres majuscules suivies d'un numéro, sans séparateur et
// sans zéro de tête — PTH1, PTH114, SDN1, CRH100.
//
// C'est le format des 1 243 articles historiques, et celui qu'attend le webhook
// Trello (`/^[A-Z]{2,5}\d+$/`, app/api/webhooks/trello/route.ts). Le générateur
// produisait auparavant `LAC-001` : le tiret faisait échouer la reconnaissance
// des cartes Trello pour tout article créé depuis l'application.

/** Préfixes SKU connus, pour les libellés où les initiales tombent mal. */
const PREFIXES: Record<string, string> = {
  "polo ralph lauren": "PRL",
  lacoste: "LAC",
  "tommy hilfiger": "TH",
};

// Mots vides ignorés dans les initiales : « sac à dos » doit donner SD, pas SAD.
const MOTS_VIDES = new Set([
  "a",
  "à",
  "de",
  "du",
  "des",
  "le",
  "la",
  "les",
  "en",
  "d",
]);

const initiales = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .split(/[\s'’-]+/)
    .filter((m) => m && !MOTS_VIDES.has(m))
    .map((m) => m[0])
    .join("")
    .toUpperCase();

/**
 * SUGGÈRE un préfixe SKU à partir de la catégorie et de la marque.
 *
 * Ce n'est qu'une proposition : le préfixe réel est saisi par l'utilisateur
 * dans le formulaire de commande. Ses abréviations lui appartiennent (SDN pour
 * « sacs à dos Nike », CRH pour « coques Rhodes ») et aucune règle ne les
 * devinera de façon fiable — d'où le champ éditable.
 *
 * Règle : initiales des mots significatifs de la catégorie, puis de la marque,
 * tronquées à 3 lettres. « Polo » + « Tommy Hilfiger » → PTH.
 */
export function skuPrefix(marque: string, categorie?: string): string {
  // La table l'emporte sur les initiales, même quand une catégorie est fournie :
  // elle existe précisément pour les libellés dont les initiales tombent mal.
  // « Polo Ralph Lauren » + « Polo » donnerait PPR, alors que la série réelle
  // en base est PRL (256 articles).
  const connu = PREFIXES[marque.trim().toLowerCase()];
  if (connu) return connu;

  const brut = `${initiales(categorie ?? "")}${initiales(marque)}`;
  const propre = brut.replace(/[^A-Z]/g, "").slice(0, 3);

  if (propre.length >= 2) return propre;
  // Une seule initiale (« Adidas » seul) : on complète sur les lettres de la
  // marque pour rester à 2 caractères minimum et limiter les collisions.
  const secours = marque
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3);
  return (propre + secours).slice(0, 3) || "ART";
}

/**
 * SUGGÈRE le libellé d'un lot à partir de sa catégorie et de sa marque.
 *
 * « Sac à dos » + « Nike » → « Sac à dos Nike ». C'est ce libellé qui est
 * recopié dans `Article.lot` et qui alimente le filtre « Tous les lots » du
 * Stock : le capter automatiquement évite d'avoir à le retaper à chaque lot.
 * Comme le préfixe SKU, ce n'est qu'une proposition — le champ reste éditable.
 */
export function libelleLot(marque: string, categorie: string): string {
  const m = marque.trim();
  const c = categorie.trim();
  if (!m && !c) return "";
  // Un libellé collectif (« Mix » en marque ET en catégorie) ne gagne rien à
  // être doublé.
  if (!c || m.toLowerCase() === c.toLowerCase()) return m || c;
  if (!m) return c;
  // La marque est déjà dans la catégorie (« Polo Ralph Lauren » + « Polo ») :
  // concaténer donnerait « Polo Polo Ralph Lauren ».
  if (m.toLowerCase().includes(c.toLowerCase())) return m;
  return `${c} ${m}`;
}

/** Ce dont `cleRegroupement` a besoin. Volontairement structural : la fonction
 *  reste pure et testable sans Prisma. */
export type ArticleRegroupable = {
  lotId: string | null;
  /** Libellé recopié sur l'article à la création. NULL sur l'historique. */
  lot: string | null;
  /** Le lot joint (`include: { lotRef: { select: { nom: true } } }`). */
  lotRef: { nom: string } | null;
  marque: string;
  categorie: string;
};

/** Libellé de repli quand un article n'a ni lot rattaché ni libellé propre. */
export const LOT_INDETERMINE = "À définir";

/**
 * Sur quoi regrouper les articles d'une commande, et sous quel nom l'afficher.
 *
 * ```
 *   a.lot ─────▶ LA SOURCE DE VÉRITÉ. Libellé porté par l'ARTICLE, donc
 *     │          exact même quand une commande mêle plusieurs lots.
 *     │
 *     ├─ absent ─▶ a.lotRef.nom : le lot rattaché (repli)
 *     └─ absent ─▶ libelleLot(marque, catégorie) : reconstruit
 * ```
 *
 * ⚠️ **Ne PAS regrouper sur `lotId`.** La migration
 * `20260808180000_lots:64-92` crée **un seul `Lot` par `Commande`**, nommé
 * d'après le libellé le plus fréquent de ses articles, puis rattache tous les
 * articles à ce lot unique (`:94-98`). Sur les données réelles, 473 articles
 * sur 1 361 ont donc un `Lot.nom` qui ne correspond pas à leur `Article.lot`,
 * et 6 commandes sur 22 seraient écrasées en une seule ligne :
 *
 * ```
 *   Grossiste KZ, 20/01/2026 — regroupé sur lotId :
 *     « Chemise Dickies »  231 articles   ◀── FAUX, absorbe 5 autres lots
 *   regroupé sur a.lot :
 *     Mix TNF/PAT/COL 31 · Crazy Polaires 30 · Pulls islandais 30
 *     Mix Helly Hansen 50 · Crazy Coupe-vent 30 · Chemise Dickies 60
 * ```
 *
 * `Lot.nom` reste un repli utile : `Article.lot` est nullable et éditable
 * depuis le 11/08/2026, donc le cas vide est atteignable.
 *
 * Conséquence assumée : deux lots réellement homonymes dans une même commande
 * fusionnent en une ligne. C'est un choix de nommage que l'utilisateur
 * contrôle, alors que l'aplatissement ci-dessus, non.
 */
export function cleRegroupement(a: ArticleRegroupable): {
  cle: string;
  libelle: string;
} {
  const reconstruit = libelleLot(a.marque ?? "", a.categorie ?? "");
  const libelle = a.lot || a.lotRef?.nom || reconstruit || LOT_INDETERMINE;
  // Clé et libellé partagent la même cascade : le libellé EST l'identité.
  return { cle: libelle, libelle };
}

/** Normalise un préfixe saisi à la main : lettres uniquement, 3 au maximum. */
export function normaliserPrefixe(saisi: string): string {
  return saisi
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 3);
}

/**
 * Numéro d'un SKU : sans zéro de tête, la série commence à 1.
 * Fonction conservée comme point unique où le format du numéro est décidé.
 */
export function skuNumber(n: number): string {
  return String(n);
}

/**
 * Extrait le numéro d'un SKU s'il appartient EXACTEMENT à ce préfixe.
 *
 * Sans séparateur, un simple `startsWith` confondrait les séries : le préfixe
 * « A » matcherait « ADI1 ». L'ancrage sur `\d+$` impose que tout ce qui suit
 * le préfixe soit le numéro, et rien d'autre.
 */
export function numeroDuSku(sku: string, prefixe: string): number | null {
  const m = new RegExp(`^${prefixe}(\\d+)$`, "i").exec(sku.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Prix unitaire d'une commande = coût total ÷ nombre d'articles.
 *
 * ⚠️ En mode de saisie DETAILLE, cette valeur n'est plus le prix d'un article
 * mais la MOYENNE du lot : les articles y ont chacun leur propre prixAchat.
 * Tout affichage doit alors être libellé « P.U. moyen ».
 */
export function prixUnitaire(coutTotal: number, nbArticles: number): number {
  if (!nbArticles) return 0;
  return coutTotal / nbArticles;
}

/**
 * Répartit des frais de livraison sur des articles au prorata de leur prix, et
 * renvoie le coût complet de chacun (prix + sa part de frais).
 *
 * Au prorata et non à parts égales : dans un lot mixte, un manteau à 20 € et
 * un t-shirt à 2 € ne mobilisent pas le même transport. Répartir également
 * gonflerait le coût des petites pièces et écraserait leur coefficient.
 *
 * Propriété garantie : `Σ résultat = Σ prix + frais`. C'est elle qui maintient
 * `Σ Article.prixAchat = Commande.coutTotal`, dont dépendent toutes les
 * métriques de rentabilité (resteARecuperer, coefActuel, datePointMort…).
 *
 * Cas limite : un lot entièrement offert (Σ prix = 0) n'a pas de prorata
 * définissable — on retombe alors sur un partage à parts égales.
 */
export function repartirFrais(prix: number[], frais: number): number[] {
  if (prix.length === 0) return [];
  if (!frais) return [...prix];

  const somme = prix.reduce((s, p) => s + p, 0);
  if (somme <= 0) return prix.map(() => frais / prix.length);

  return prix.map((p) => p + (frais * p) / somme);
}

/** Marge brute = prix de vente - prix d'achat. */
export function margeBrute(prixVente: number, prixAchat: number): number {
  return prixVente - prixAchat;
}

/** Marge nette = prix de vente - prix d'achat - (prix de vente × TVA_MARGE). */
export function margeNette(prixVente: number, prixAchat: number): number {
  return prixVente - prixAchat - prixVente * TVA_MARGE;
}

/** Coefficient = prix de vente ÷ prix d'achat. */
export function coefficient(prixVente: number, prixAchat: number): number {
  if (!prixAchat) return 0;
  return prixVente / prixAchat;
}

/**
 * Recalcule les champs dérivés d'un article selon son statut.
 * Si « Vendu » : marges et coef calculés depuis prixVente/prixAchat.
 * Sinon : tous les champs de vente repassent à null.
 */
export function deriveVente(input: {
  statut: string;
  prixAchat: number;
  prixVente: number | null;
  dateVente: Date | null;
}): {
  prixVente: number | null;
  dateVente: Date | null;
  margeBrute: number | null;
  margeNette: number | null;
  coefficient: number | null;
} {
  if (input.statut === STATUT_VENDU && input.prixVente != null) {
    return {
      prixVente: input.prixVente,
      dateVente: input.dateVente ?? new Date(),
      margeBrute: margeBrute(input.prixVente, input.prixAchat),
      margeNette: margeNette(input.prixVente, input.prixAchat),
      coefficient: coefficient(input.prixVente, input.prixAchat),
    };
  }
  return {
    prixVente: null,
    dateVente: null,
    margeBrute: null,
    margeNette: null,
    coefficient: null,
  };
}

/**
 * Tri naturel des chaînes (ex. SKU) : AD1, AD2…AD9, AD10, AD11, LAC1…
 * Le tri SQL classique donnerait AD1, AD10, AD11, AD2… (ordre lexicographique).
 */
export const naturalSort = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Moyenne arithmétique d'une liste (0 si vide). */
export function moyenne(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Moyenne de coefficients, en ignorant les valeurs nulles ou négatives.
 *
 * `coefficient()` renvoie 0 quand le prix d'achat vaut 0 — le garde-fou contre
 * une division par zéro. Ce 0 n'est pas un coefficient faible, c'est une
 * absence de coefficient. Avec la saisie détaillée, les pièces offertes dans un
 * lot (prix 0) deviennent courantes : les compter tirerait la moyenne vers le
 * bas et fausserait le classement des meilleures et pires catégories.
 */
export function moyenneCoefs(values: number[]): number {
  return moyenne(values.filter((v) => v > 0));
}

/** Formate un montant en euros (fr-FR). */
export function euros(n: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(n ?? 0);
}

/** Formate un coefficient (ex. 2.45x). */
export function coef(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(2)}x`;
}

// ── Formats d'affichage « Direction C » ────────────────────────────────────
// Virgule décimale et espace avant le signe, comme la maquette. Partagés par le
// Dashboard et les Statistiques, qui affichent les mêmes grandeurs.

/** Pourcentage entier (0.488 -> "49 %"). */
export function pctInt(n: number): string {
  return `${Math.round(n * 100)} %`;
}

/** Pourcentage à la décimale (0.406 -> "40,6 %"). */
export function pct1(n: number): string {
  return `${(n * 100).toFixed(1).replace(".", ",")} %`;
}

/** Coefficient façon maquette (2.86 -> "2,86×"). `digits` = décimales gardées. */
export function coefLabel(n: number, digits = 2): string {
  return `${n.toFixed(digits).replace(".", ",")}×`;
}
