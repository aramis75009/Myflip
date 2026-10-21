/**
 * Contrast helpers for the design tokens (pure, no DOM).
 *
 * `app/tokens.css` stores every colour as space-separated channels
 * ("15 81 50"), so that Tailwind can apply an alpha modifier. These helpers
 * read those channels back and compute the WCAG 2.x contrast ratio. They are
 * used by `lib/designTokens.test.ts` to keep both themes AA-compliant.
 */

export type Rvb = { r: number; v: number; b: number };

/** Parses "R G B" (or "R, G, B") channels. Throws on anything else. */
export function lireCanaux(s: string): Rvb {
  const parts = s
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    throw new Error(`Canaux invalides : « ${s} »`);
  }
  const [r, v, b] = parts;
  return { r, v, b };
}

function lineaire(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, v, b }: Rvb): number {
  return 0.2126 * lineaire(r) + 0.7152 * lineaire(v) + 0.0722 * lineaire(b);
}

/** WCAG 2.x contrast ratio, from 1 to 21. Order of arguments does not matter. */
export function ratioContraste(a: Rvb, b: Rvb): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [claire, sombre] = la > lb ? [la, lb] : [lb, la];
  return (claire + 0.05) / (sombre + 0.05);
}

function declarations(corps: string): Record<string, string> {
  const out: Record<string, string> = {};
  const sansCommentaires = corps.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of sansCommentaires.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/**
 * Reads the two theme blocks of `app/tokens.css`.
 *
 * - `clair`: every top-level `:root { … }` block (a line that starts with
 *   `:root {`), merged in order.
 * - `sombre`: `clair` overridden by the `:root[data-theme="dark"] { … }` block,
 *   i.e. the values actually in force in dark mode.
 *
 * Nested blocks (inside `@media`) are indented in tokens.css and are ignored.
 */
export function lireBlocsTokens(css: string): {
  clair: Record<string, string>;
  sombre: Record<string, string>;
} {
  const clair: Record<string, string> = {};
  for (const m of css.matchAll(/(?:^|\n):root\s*\{([^}]*)\}/g)) {
    Object.assign(clair, declarations(m[1]));
  }
  const sombre: Record<string, string> = { ...clair };
  for (const m of css.matchAll(/(?:^|\n):root\[data-theme="dark"\]\s*\{([^}]*)\}/g)) {
    Object.assign(sombre, declarations(m[1]));
  }
  return { clair, sombre };
}
