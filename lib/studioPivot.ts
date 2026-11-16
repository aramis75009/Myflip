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
 */
export function echelleRecadrage(largeur: number, hauteur: number, angle: number): number {
  if (!(largeur > 0) || !(hauteur > 0) || !Number.isFinite(angle)) {
    throw new RangeError("Dimensions ou angle invalides.");
  }
  const c = Math.abs(Math.cos(enRadians(angle)));
  const s = Math.abs(Math.sin(enRadians(angle)));
  // Arrondi à 1e-12 : cos(0) et sin(45°) laissent des poussières flottantes, qui feraient échouer une comparaison exacte.
  const brut = Math.max((largeur * c + hauteur * s) / largeur, (largeur * s + hauteur * c) / hauteur);
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
  const marge = angle === 0 ? 0 : MARGE_RENDU_PX;
  const width = Math.max(1, Math.min(largeurTournee, Math.floor(largeur / s - 2 * marge)));
  const height = Math.max(1, Math.min(hauteurTournee, Math.floor(hauteur / s - 2 * marge)));
  const left = Math.max(0, Math.round((largeurTournee - width) / 2));
  const top = Math.max(0, Math.round((hauteurTournee - height) / 2));
  return { left, top, width, height, echelle: Math.max(largeur / width, hauteur / height) };
}
