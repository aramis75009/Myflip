/**
 * Couleurs et contraste WCAG, côté Node : les sondes relèvent des chaînes
 * `getComputedStyle` dans la page, et le calcul se fait ici.
 *
 * Formats compris : `#rgb`, `#rrggbb`, `rgb()`, `rgba()` (virgules ou espaces) et `color(srgb …)`.
 * Les autres espaces (lab, oklch…) rendent `null` : la sonde dit alors
 * « non mesurable » plutôt que d'inventer un ratio.
 */

export type Rvb = { r: number; v: number; b: number; a: number };

export const TRANSPARENT = "rgba(0, 0, 0, 0)";

const n = (s: string): number => Number.parseFloat(s);

export function lireCouleur(brut: string | null | undefined): Rvb | null {
  if (!brut) return null;
  const s = brut.trim().toLowerCase();
  if (s === "transparent") return { r: 0, v: 0, b: 0, a: 0 };

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return { r: Number.parseInt(h.slice(0, 2), 16), v: Number.parseInt(h.slice(2, 4), 16), b: Number.parseInt(h.slice(4, 6), 16), a: 1 };
  }

  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (rgb) {
    const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith("%") ? n(rgb[4]) / 100 : n(rgb[4]);
    return { r: n(rgb[1]), v: n(rgb[2]), b: n(rgb[3]), a: alpha };
  }

  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (srgb) {
    const alpha = srgb[4] === undefined ? 1 : srgb[4].endsWith("%") ? n(srgb[4]) / 100 : n(srgb[4]);
    return { r: n(srgb[1]) * 255, v: n(srgb[2]) * 255, b: n(srgb[3]) * 255, a: alpha };
  }
  return null;
}

/** `dessus` posé sur `dessous` (opaque) : la couleur réellement vue. */
export function composer(dessus: Rvb, dessous: Rvb): Rvb {
  const a = dessus.a;
  return {
    r: dessus.r * a + dessous.r * (1 - a),
    v: dessus.v * a + dessous.v * (1 - a),
    b: dessus.b * a + dessous.b * (1 - a),
    a: 1,
  };
}

const lineaire = (c: number): number => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};

/** Luminance relative WCAG, 0 (noir) à 1 (blanc). */
export function luminance(c: Rvb): number {
  return 0.2126 * lineaire(c.r) + 0.7152 * lineaire(c.v) + 0.0722 * lineaire(c.b);
}

/** Ratio de contraste WCAG entre deux couleurs opaques, de 1 à 21. */
export function ratio(a: Rvb, b: Rvb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [clair, sombre] = la >= lb ? [la, lb] : [lb, la];
  return (clair + 0.05) / (sombre + 0.05);
}

/**
 * Contraste d'un texte `fg` sur un fond `bg` (chaînes CSS). Un fg translucide est
 * composé sur le fond. Rend `null` si une couleur n'est pas lisible.
 */
export function contraste(fg: string | null | undefined, bg: string | null | undefined): number | null {
  const f = lireCouleur(fg);
  const b = lireCouleur(bg);
  if (!f || !b) return null;
  const fond = b.a < 1 ? composer(b, { r: 255, v: 255, b: 255, a: 1 }) : b;
  return ratio(f.a < 1 ? composer(f, fond) : f, fond);
}

/** Arrondi à 2 décimales, pour des mesures lisibles dans le JSON. */
export const arrondi = (x: number | null | undefined, d = 2): number | null =>
  x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d;

/** Alpha d'une couleur CSS, ou null si illisible. « rgba(0, 0, 0, 0) » vaut 0. */
export function alpha(brut: string | null | undefined): number | null {
  return lireCouleur(brut)?.a ?? null;
}

/** Deux couleurs CSS désignent-elles le même rouge-vert-bleu (à 1/255 près, opacité ignorée) ? null si une est illisible. */
export function memeCouleur(a: string | null | undefined, b: string | null | undefined): boolean | null {
  const x = lireCouleur(a);
  const y = lireCouleur(b);
  if (!x || !y) return null;
  return Math.abs(x.r - y.r) <= 1 && Math.abs(x.v - y.v) <= 1 && Math.abs(x.b - y.b) <= 1;
}
