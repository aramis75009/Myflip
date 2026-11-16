// Retouches par lot du Studio (PRD 2026-11-16, §8) : les règles, sans base,
// sans réseau, sans sharp. PUR et isomorphe : l'aperçu du navigateur (CSS +
// un calque de bord adouci) et le rendu du serveur (sharp) lisent la MÊME
// géométrie, `geometrieRetouche`, qui part d'`echelleRecadrage` (« Pivoter »,
// lib/studioPivot.ts) sans la réécrire. C'est ce qui garantit qu'on enregistre
// ce qu'on a vu.

import { ANGLE_MAX, ANGLE_MIN, MARGE_RENDU_PX, echelleContenue, echelleRecadrage, estAngle, libelleAngle, zoneCentree } from "./studioPivot";

export type ModeRotation = "zoom" | "bordsBlancs";

export type Cadre = {
  /** « #rrggbb », en minuscules. */
  couleur: string;
  /** Épaisseur du cadre, en % de la LARGEUR de la photo (la même sur les quatre côtés), 0 à 15. */
  epaisseurPct: number;
  /** Bord adouci entre la photo et le cadre, 0 (net) à 100. */
  adoucissement: number;
};

/** Les réglages d'une retouche : un objet unique, partagé par l'aperçu, la route et le rendu. */
export type Retouche = {
  /** −45 à +45, entier. Positif = sens des aiguilles d'une montre (comme CSS `rotate`). */
  angle: number;
  /** zoom : agrandie juste assez pour qu'aucun coin ne reste vide ; bordsBlancs : l'image entière, coins blancs. */
  modeRotation: ModeRotation;
  /** 0 à 30 : on garde le centre, (100 − n) % de chaque dimension. */
  recadragePct: number;
  cadre: null | Cadre;
};

export const RECADRAGE_MAX = 30;
export const EPAISSEUR_MAX = 15;
export const EPAISSEUR_DEFAUT = 4;
export const ADOUCISSEMENT_MAX = 100;
export const ADOUCISSEMENT_DEFAUT = 35;

/** Pastilles du cadre (maquette du 16/11). Toute autre couleur reste possible (« Autre couleur »). */
export const COULEURS_CADRE = [
  { nom: "Blanc", hex: "#ffffff" },
  { nom: "Noir", hex: "#111413" },
  { nom: "Gris", hex: "#9aa39e" },
  { nom: "Beige", hex: "#e6dccb" },
] as const;

export const CADRE_DEFAUT: Cadre = { couleur: "#ffffff", epaisseurPct: EPAISSEUR_DEFAUT, adoucissement: ADOUCISSEMENT_DEFAUT };
export const RETOUCHE_NEUTRE: Retouche = { angle: 0, modeRotation: "zoom", recadragePct: 0, cadre: null };

/** Fond des coins en mode « bords blancs », et sous la photo quand elle ne couvre pas sa zone. */
export const FOND_RETOUCHE = "#ffffff";

const COULEUR_RE = /^#[0-9a-f]{6}$/i;
const entierDans = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export const estCouleur = (v: unknown): v is string => typeof v === "string" && COULEUR_RE.test(v);

/**
 * La forme canonique d'une retouche : deux retouches qui rendent la même image
 * ont la même forme (donc la même clé, `cleRetouche`).
 *   • couleur en minuscules ;
 *   • un cadre d'épaisseur 0 sans adoucissement ne fait rien : il disparaît ;
 *   • sans rotation et sans cadre épais, le mode ne change rien : « zoom ».
 */
export function normaliserRetouche(r: Retouche): Retouche {
  const angle = r.angle === 0 ? 0 : r.angle; // pas de −0
  const cadre =
    r.cadre && (r.cadre.epaisseurPct > 0 || r.cadre.adoucissement > 0)
      ? { couleur: r.cadre.couleur.toLowerCase(), epaisseurPct: r.cadre.epaisseurPct, adoucissement: r.cadre.adoucissement }
      : null;
  const modeSansEffet = angle === 0 && (!cadre || cadre.epaisseurPct === 0);
  return { angle, modeRotation: modeSansEffet ? "zoom" : r.modeRotation, recadragePct: r.recadragePct, cadre };
}

/**
 * Une retouche venue du réseau (corps JSON) ou de la base (colonne `retouche`).
 * null au moindre écart : champ absent, type faux, hors plage, non entier.
 * Le résultat est normalisé.
 */
export function lireRetouche(v: unknown): Retouche | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!estAngle(o.angle)) return null;
  if (o.modeRotation !== "zoom" && o.modeRotation !== "bordsBlancs") return null;
  if (!entierDans(o.recadragePct, 0, RECADRAGE_MAX)) return null;
  let cadre: Cadre | null = null;
  if (o.cadre !== null) {
    if (!o.cadre || typeof o.cadre !== "object" || Array.isArray(o.cadre)) return null;
    const c = o.cadre as Record<string, unknown>;
    if (!estCouleur(c.couleur)) return null;
    if (!entierDans(c.epaisseurPct, 0, EPAISSEUR_MAX)) return null;
    if (!entierDans(c.adoucissement, 0, ADOUCISSEMENT_MAX)) return null;
    cadre = { couleur: c.couleur, epaisseurPct: c.epaisseurPct, adoucissement: c.adoucissement };
  }
  return normaliserRetouche({ angle: o.angle, modeRotation: o.modeRotation, recadragePct: o.recadragePct, cadre });
}

/** La retouche d'une copie faite par « Pivoter » (avant la refonte) : angle seul, mode zoom. */
export const retoucheDePivot = (angle: number): Retouche => normaliserRetouche({ angle, modeRotation: "zoom", recadragePct: 0, cadre: null });

/**
 * La retouche d'une copie en base. Les copies pivotées d'avant la refonte n'ont
 * que `angleCopie` : elles sont reprises comme « angle seul, mode zoom ».
 * null : la ligne n'est pas une copie lisible.
 */
export function retoucheDeCopie(ligne: { retouche: unknown; angleCopie: number | null }): Retouche | null {
  const lue = ligne.retouche === null || ligne.retouche === undefined ? null : lireRetouche(ligne.retouche);
  if (lue) return lue;
  return ligne.angleCopie !== null && estAngle(ligne.angleCopie) && ligne.angleCopie !== 0 ? retoucheDePivot(ligne.angleCopie) : null;
}

/** Rien à rendre : l'image serait l'originale. */
export function estIdentite(r: Retouche): boolean {
  const n = normaliserRetouche(r);
  return n.angle === 0 && n.recadragePct === 0 && n.cadre === null;
}

/** Exactement ce que faisait « Pivoter » : un angle, en mode zoom, rien d'autre. */
export function estPivotSeul(r: Retouche): boolean {
  const n = normaliserRetouche(r);
  return n.angle !== 0 && n.modeRotation === "zoom" && n.recadragePct === 0 && n.cadre === null;
}

/**
 * Clé canonique d'une retouche : une copie par photo et par clé (index unique
 * `copieDeId, retoucheCle`). « a8|zoom|r0|c- », « a-3|bordsBlancs|r15|c#e6dccb/4/35 ».
 */
export function cleRetouche(r: Retouche): string {
  const n = normaliserRetouche(r);
  const cadre = n.cadre ? `c${n.cadre.couleur}/${n.cadre.epaisseurPct}/${n.cadre.adoucissement}` : "c-";
  return `a${n.angle}|${n.modeRotation}|r${n.recadragePct}|${cadre}`;
}

/** Le nom d'une couleur de pastille, ou « personnalisée ». */
export function nomCouleur(hex: string): string {
  return COULEURS_CADRE.find((c) => c.hex === hex.toLowerCase())?.nom ?? "Personnalisée";
}

/** « +8° », « −3° bords blancs · recadrée 15 % · cadre beige », « cadre #c4553a », « sans retouche ». */
export function libelleRetouche(r: Retouche): string {
  const n = normaliserRetouche(r);
  const parts: string[] = [];
  if (n.angle !== 0) parts.push(n.modeRotation === "bordsBlancs" ? `${libelleAngle(n.angle)} bords blancs` : libelleAngle(n.angle));
  if (n.recadragePct > 0) parts.push(`recadrée ${n.recadragePct} %`);
  if (n.cadre) {
    const pastille = COULEURS_CADRE.find((c) => c.hex === n.cadre?.couleur);
    parts.push(`cadre ${pastille ? pastille.nom.toLowerCase() : n.cadre.couleur}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "sans retouche";
}

// ── Géométrie ───────────────────────────────────────────────────────────────

/**
 * Bord adouci : l'ombre intérieure de la maquette (`box-shadow: inset 0 0 B S`,
 * B = 0,08 % × n de la largeur, S = 0,04 % × n, n = 0 à 100). L'écart-type du
 * flou gaussien vaut B / 2 (définition CSS), donc ici autant que l'étalement.
 */
const ADOUCI_PAR_POINT = 0.0004;

export type GeometrieRetouche = {
  /** Dimensions de la copie : celles de l'original. */
  largeur: number;
  hauteur: number;
  angle: number;
  mode: ModeRotation;
  /** Épaisseur du cadre en pixels (0 sans cadre), la même sur les quatre côtés. */
  epaisseurPx: number;
  /** La zone de la photo, à l'intérieur du cadre. */
  interieur: { x: number; y: number; largeur: number; hauteur: number };
  /**
   * Facteur appliqué aux pixels de l'original, autour du centre de la zone :
   * rotation (zoom : couvrir la zone ; bords blancs : y tenir entière) puis recadrage.
   */
  echelle: number;
  /** Agrandissement dû à la seule rotation, vu de la zone (≥ 1 en zoom) : ce que l'écran annonce. */
  agrandissementRotation: number;
  couleurCadre: string | null;
  /** Bord adouci, en pixels de l'original. null = net (ou pas de cadre). */
  adoucissement: null | { etalementPx: number; sigmaPx: number };
};

/**
 * LA géométrie d'une retouche sur une photo `largeur` × `hauteur`. L'aperçu
 * (`styleApercu`, `masqueAdoucissement`) et le rendu sharp
 * (lib/studioPivotRendu.ts) partent tous deux de ce résultat.
 *
 * Modèle : la copie a les dimensions de l'original. Un cadre d'épaisseur e
 * (arrondie au pixel) laisse à la photo une zone l × h = (L − 2e) × (H − 2e).
 * La photo d'origine est centrée sur cette zone, tournée de `angle`, puis
 * agrandie de `echelle` :
 *   • zoom : echelleRecadrage(l, h, angle, L × H), le minimum pour couvrir la
 *     zone (aucun coin vide) ;
 *   • bords blancs : echelleContenue(l, h, angle, L × H), le maximum pour y
 *     tenir entière (coins blancs) ;
 * puis × 1 / (1 − recadrage) : on resserre sur le centre.
 * Sans cadre ni recadrage, en zoom, c'est exactement « Pivoter ».
 */
export function geometrieRetouche(largeur: number, hauteur: number, retouche: Retouche): GeometrieRetouche {
  if (!(largeur > 0) || !(hauteur > 0) || !Number.isFinite(largeur) || !Number.isFinite(hauteur)) {
    throw new RangeError("Dimensions invalides.");
  }
  const r = normaliserRetouche(retouche);
  // La zone de la photo garde au moins 1 px.
  const epaisseurMax = Math.floor((Math.min(largeur, hauteur) - 1) / 2);
  const e = r.cadre ? Math.min(epaisseurMax, Math.round((r.cadre.epaisseurPct / 100) * largeur)) : 0;
  const l = largeur - 2 * e;
  const h = hauteur - 2 * e;
  const original = { largeur, hauteur };
  const base = r.modeRotation === "zoom" ? echelleRecadrage(l, h, r.angle, original) : echelleContenue(l, h, r.angle, original);
  const recadrage = 1 / (1 - r.recadragePct / 100);
  const rotation = echelleRecadrage(l, h, r.angle);
  const adouci = r.cadre && r.cadre.adoucissement > 0 ? r.cadre.adoucissement * ADOUCI_PAR_POINT * largeur : 0;
  return {
    largeur,
    hauteur,
    angle: r.angle,
    mode: r.modeRotation,
    epaisseurPx: e,
    interieur: { x: e, y: e, largeur: l, hauteur: h },
    // Sans recadrage, `base` tel quel : « Pivoter » retrouve son facteur au bit près.
    echelle: r.recadragePct === 0 ? base : base * recadrage,
    agrandissementRotation: r.modeRotation === "zoom" ? rotation : 1 / rotation,
    couleurCadre: r.cadre ? r.cadre.couleur : null,
    adoucissement: adouci > 0 ? { etalementPx: adouci, sigmaPx: adouci } : null,
  };
}

/**
 * La zone à découper dans l'original DÉJÀ tourné (`largeurTournee` ×
 * `hauteurTournee`, sa boîte englobante) : le rendu l'agrandit ensuite à la
 * zone de la photo. En zoom, réduite de `MARGE_RENDU_PX` (les bords fondus de
 * la rotation n'entrent pas) et bornée à l'image ; en bords blancs, elle peut
 * déborder (left / top négatifs = du blanc tout autour).
 */
export function zoneDeRendu(geo: GeometrieRetouche, largeurTournee: number, hauteurTournee: number) {
  const zoom = geo.mode === "zoom";
  return zoneCentree(
    { largeur: geo.interieur.largeur, hauteur: geo.interieur.hauteur },
    geo.echelle,
    { largeur: largeurTournee, hauteur: hauteurTournee },
    { marge: zoom && geo.angle !== 0 ? MARGE_RENDU_PX : 0, bornee: zoom },
  );
}

const arrondi = (n: number, d = 6) => Number(n.toFixed(d));

export type StyleApercu = {
  /** Le cadre de l'aperçu : ratio de l'original, `container-type: inline-size` (unités cqw). */
  conteneur: { aspectRatio: string; background: string };
  /** La zone de la photo, en retrait de l'épaisseur du cadre (cqw : la même sur les quatre côtés). */
  interieur: { inset: string; background: string };
  /** La photo, centrée sur sa zone, à la taille de l'original puis transformée. */
  image: { left: string; top: string; width: string; height: string; transform: string };
};

/**
 * L'aperçu CSS de la géométrie : mêmes nombres que le rendu, en unités
 * relatives (une unité = 1 % de la largeur de l'original, comme `cqw`).
 */
export function styleApercu(geo: GeometrieRetouche): StyleApercu {
  const { largeur: l, hauteur: h } = geo.interieur;
  const neutre = geo.angle === 0 && geo.echelle === 1;
  return {
    conteneur: { aspectRatio: `${geo.largeur} / ${geo.hauteur}`, background: geo.couleurCadre ?? FOND_RETOUCHE },
    interieur: { inset: `${arrondi((geo.epaisseurPx / geo.largeur) * 100, 4)}cqw`, background: FOND_RETOUCHE },
    image: {
      left: "50%",
      top: "50%",
      width: `${arrondi((geo.largeur / l) * 100, 4)}%`,
      height: `${arrondi((geo.hauteur / h) * 100, 4)}%`,
      transform: neutre ? "translate(-50%, -50%)" : `translate(-50%, -50%) rotate(${geo.angle}deg) scale(${arrondi(geo.echelle)})`,
    },
  };
}

// ── Bord adouci ─────────────────────────────────────────────────────────────

/** erf, Abramowitz et Stegun 7.1.26 (erreur < 1,5e-7) : assez pour 256 niveaux. */
function erf(x: number): number {
  const signe = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return signe * y;
}
const phi = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2));

/**
 * Profil d'un bord adouci sur une dimension de `n` pixels : pour chaque pixel
 * (son centre, i + 0,5), la part de PHOTO qui reste visible, de 0 à 1. C'est
 * l'indicatrice de [étalement, n − étalement] floutée par une gaussienne
 * d'écart-type `sigma` (la définition CSS d'une ombre intérieure).
 * sigma = 0 : bord net.
 */
export function profilAdoucissement(n: number, etalement: number, sigma: number): Float64Array {
  const p = new Float64Array(Math.max(0, n));
  const debut = etalement;
  const fin = n - etalement;
  for (let i = 0; i < p.length; i++) {
    const x = i + 0.5;
    const v = sigma > 0 ? phi((x - debut) / sigma) - phi((x - fin) / sigma) : x >= debut && x <= fin ? 1 : 0;
    p[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return p;
}

/**
 * Le calque du bord adouci sur une zone l × h : l'opacité (0 à 255) de la
 * couleur du cadre posée PAR-DESSUS la photo, ligne par ligne. Le flou d'un
 * rectangle est séparable : 1 − profil(x) × profil(y), exactement.
 * Servi tel quel au rendu (pleine taille) et à l'aperçu (réduit).
 */
export function masqueAdoucissement(largeur: number, hauteur: number, etalement: number, sigma: number): Uint8ClampedArray {
  const px = profilAdoucissement(largeur, etalement, sigma);
  const py = profilAdoucissement(hauteur, etalement, sigma);
  const m = new Uint8ClampedArray(largeur * hauteur);
  for (let y = 0; y < hauteur; y++) {
    const ligne = y * largeur;
    const vy = py[y];
    for (let x = 0; x < largeur; x++) m[ligne + x] = Math.round(255 * (1 - px[x] * vy));
  }
  return m;
}

/** « #rrggbb » → composantes. */
export function rgbDe(hex: string): { r: number; g: number; b: number } {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export { ANGLE_MAX, ANGLE_MIN };
