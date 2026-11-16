// Pivoter une vraie photo du Studio : les règles, sans base, sans réseau, sans
// sharp. PUR et isomorphe : l'aperçu du navigateur (CSS) et le rendu du serveur
// (sharp) lisent les MÊMES fonctions, c'est ce qui garantit qu'on enregistre ce
// qu'on a vu.

/** Plage de l'outil : de −45° à +45°, au degré près. Positif = sens des aiguilles d'une montre (comme CSS `rotate`). */
export const ANGLE_MIN = -45;
export const ANGLE_MAX = 45;

/** Vrai pour un angle que le serveur accepte : entier, dans la plage. Zéro compris (il est refusé plus loin : une copie à 0° n'a pas de sens). */
export const estAngle = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= ANGLE_MIN && v <= ANGLE_MAX;

/**
 * Ce que l'utilisateur tape dans la case → un angle entier de la plage, ou
 * null si ce n'est pas un nombre. Virgule décimale acceptée, arrondi au degré,
 * et une valeur hors plage est ramenée au bord (taper 90 donne 45) : la case ne
 * reste jamais sur une valeur que le curseur ne sait pas montrer.
 */
export function lireAngleSaisi(saisie: string): number | null {
  const texte = saisie.trim().replace(",", ".");
  if (texte === "" || texte === "-" || texte === "+") return null;
  const n = Number(texte);
  if (!Number.isFinite(n)) return null;
  const arrondi = Math.round(n);
  return Math.min(ANGLE_MAX, Math.max(ANGLE_MIN, arrondi === 0 ? 0 : arrondi));
}

/** « +8° », « −8° », « 0° » : le signe est écrit, et le moins est un vrai signe moins. */
export function libelleAngle(angle: number): string {
  if (angle === 0) return "0°";
  return `${angle > 0 ? "+" : "−"}${Math.abs(angle)}°`;
}

const enRadians = (degres: number) => (degres * Math.PI) / 180;

/**
 * Facteur d'agrandissement pour qu'une image l × h tournée de `angle` degrés,
 * agrandie autour de son centre, couvre exactement le cadre l × h d'origine :
 * aucun coin vide, comme l'app Photos d'Apple.
 *
 * Le cadre, vu depuis l'image, est un rectangle tourné de −angle ; il tient dans
 * l'image agrandie de s quand sa boîte englobante tient dans s·l × s·h :
 *   s = max((l·|cos| + h·|sin|) / l , (l·|sin| + h·|cos|) / h)
 * Symétrique en l'angle (+8° et −8° donnent le même), égal à 1 à 0°.
 *
 * Étendue le 17/11/2026 (retouches par lot, `lib/studioRetouche.ts`) : l'image
 * peut avoir d'AUTRES dimensions que le cadre (`image`, a × b), quand un cadre de
 * couleur réduit la zone de la photo. Le facteur, rapporté aux pixels de
 * l'image, devient max((l·|cos| + h·|sin|) / a , (l·|sin| + h·|cos|) / b). Sans
 * `image`, a = l et b = h : c'est la formule d'origine, au bit près.
 */
export function echelleRecadrage(
  largeur: number,
  hauteur: number,
  angle: number,
  image: { largeur: number; hauteur: number } = { largeur, hauteur },
): number {
  if (!(largeur > 0) || !(hauteur > 0) || !(image.largeur > 0) || !(image.hauteur > 0) || !Number.isFinite(angle)) {
    throw new RangeError("Dimensions ou angle invalides.");
  }
  const c = Math.abs(Math.cos(enRadians(angle)));
  const s = Math.abs(Math.sin(enRadians(angle)));
  // Arrondi à 1e-12 : cos(0) et sin(45°) laissent des poussières flottantes, qui feraient échouer une comparaison exacte.
  const brut = Math.max((largeur * c + hauteur * s) / image.largeur, (largeur * s + hauteur * c) / image.hauteur);
  return Math.round(brut * 1e12) / 1e12;
}

/**
 * Le pendant « image entière » d'`echelleRecadrage`, même repère : le plus
 * grand facteur pour qu'une image a × b (`image`, par défaut l × h) tournée de
 * `angle` degrés tienne ENTIÈRE dans le cadre l × h. Sa boîte englobante,
 * agrandie de s, mesure s·(a·|cos| + b·|sin|) × s·(a·|sin| + b·|cos|) :
 *   s = min(l / (a·|cos| + b·|sin|) , h / (a·|sin| + b·|cos|))
 * Pour une image au format du cadre, c'est exactement 1 / echelleRecadrage.
 */
export function echelleContenue(
  largeur: number,
  hauteur: number,
  angle: number,
  image: { largeur: number; hauteur: number } = { largeur, hauteur },
): number {
  if (!(largeur > 0) || !(hauteur > 0) || !(image.largeur > 0) || !(image.hauteur > 0) || !Number.isFinite(angle)) {
    throw new RangeError("Dimensions ou angle invalides.");
  }
  const c = Math.abs(Math.cos(enRadians(angle)));
  const s = Math.abs(Math.sin(enRadians(angle)));
  const brut = Math.min(largeur / (image.largeur * c + image.hauteur * s), hauteur / (image.largeur * s + image.hauteur * c));
  return Math.round(brut * 1e12) / 1e12;
}

/**
 * La transformation CSS de l'aperçu : on tourne, puis on agrandit, autour du
 * centre. Le cadre qui la porte a le ratio de l'image et `overflow: hidden`.
 * `rotate` positif tourne dans le sens des aiguilles d'une montre.
 */
export function transformApercu(largeur: number, hauteur: number, angle: number): string {
  if (angle === 0) return "none";
  return `rotate(${angle}deg) scale(${echelleRecadrage(largeur, hauteur, angle)})`;
}

/**
 * Marge de sécurité du rendu, en pixels de l'image tournée, de chaque côté.
 * Les bords d'une image tournée sont fondus avec le fond sur ~1 px : sans
 * marge, une frange de fond apparaîtrait sur les bords du cadre. 2 px sur
 * 1600 = 0,25 % d'agrandissement en plus, invisible.
 */
export const MARGE_RENDU_PX = 2;

/**
 * La zone à garder dans l'image DÉJÀ tournée (la boîte englobante de l'image
 * tournée, de `largeurTournee` × `hauteurTournee`), centrée, au ratio de
 * l'original : un rectangle de (l / s) × (h / s), réduit de la marge. Le rendu
 * l'agrandit ensuite à l × h.
 *
 * Rend la zone en entiers (position et taille), et le facteur réellement
 * appliqué, un peu au-dessus de `echelleRecadrage` à cause de la marge.
 */
export function zoneRecadree(
  largeur: number,
  hauteur: number,
  angle: number,
  largeurTournee: number,
  hauteurTournee: number,
): { left: number; top: number; width: number; height: number; echelle: number } {
  const s = echelleRecadrage(largeur, hauteur, angle);
  // À 0° rien n'est tourné : pas de marge, la zone est l'image entière.
  const zone = zoneCentree(
    { largeur, hauteur },
    s,
    { largeur: largeurTournee, hauteur: hauteurTournee },
    { marge: angle === 0 ? 0 : MARGE_RENDU_PX, bornee: true },
  );
  return { ...zone, echelle: Math.max(largeur / zone.width, hauteur / zone.height) };
}

/**
 * La règle de découpe, généralisée (retouches par lot) : dans l'image tournée
 * (`tournee`, aux pixels de l'original), la zone centrée de (l / s) × (h / s)
 * que le rendu agrandit ensuite à `cible` (l × h), réduite de `marge` de chaque
 * côté. `bornee` : la zone ne déborde jamais de l'image tournée (mode « zoom »,
 * aucun coin vide). Sans borne (mode « bords blancs », s < 1), elle peut être
 * plus grande que l'image : `left` / `top` négatifs = du fond à ajouter autour.
 */
export function zoneCentree(
  cible: { largeur: number; hauteur: number },
  echelle: number,
  tournee: { largeur: number; hauteur: number },
  { marge, bornee }: { marge: number; bornee: boolean },
): { left: number; top: number; width: number; height: number } {
  let width = Math.max(1, Math.floor(cible.largeur / echelle - 2 * marge));
  let height = Math.max(1, Math.floor(cible.hauteur / echelle - 2 * marge));
  if (bornee) {
    width = Math.min(tournee.largeur, width);
    height = Math.min(tournee.hauteur, height);
  }
  const left = Math.round((tournee.largeur - width) / 2);
  const top = Math.round((tournee.hauteur - height) / 2);
  return bornee ? { left: Math.max(0, left), top: Math.max(0, top), width, height } : { left, top, width, height };
}
