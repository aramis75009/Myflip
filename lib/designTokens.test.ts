import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { lireBlocsTokens, lireCanaux, ratioContraste } from "./contraste";
import { FOND_THEME } from "./themeMeta";

/**
 * Design-token guard (plan-fondations § 2.7 and § 2.8).
 *
 * 1. No hard-coded value in `app/` and `components/`: every colour, text size,
 *    radius, shadow, z-index and duration goes through `app/tokens.css` and
 *    the Tailwind scales built on it.
 * 2. Both themes of `app/tokens.css` keep their WCAG AA contrast pairs.
 *
 * Temporary debt: a file may carry, in its first 5 lines,
 *   `// design-tokens-dette: R2 R3 → M7`   (CSS: `/* design-tokens-dette: R17 → LZ *\/`)
 * The listed rules are tolerated in that file; the test FAILS if a listed
 * rule has no violation left there (remove it from the marker) and on any
 * other rule. Lot LZ sets DETTE_AUTORISEE to false.
 *
 * Documented exception (R4 and R5 only): the line, or the one just above it,
 * contains `design-tokens-exception: <reason of at least 10 characters>`.
 */

const DETTE_AUTORISEE = true;

const RACINE = path.join(__dirname, "..");

// ── Scan ─────────────────────────────────────────────────────────────────────

function estDoublon(rel: string): boolean {
  return rel.includes(" 2/") || /(^|\/)[^/]* 2\.[^/]*$/.test(rel);
}

function balayer(dossierRel: string, ext: RegExp): string[] {
  const out: string[] = [];
  const visiter = (rel: string) => {
    for (const nom of readdirSync(path.join(RACINE, rel))) {
      const enfant = `${rel}/${nom}`;
      if (estDoublon(`${enfant}/`) || estDoublon(enfant)) continue;
      if (statSync(path.join(RACINE, enfant)).isDirectory()) {
        if (enfant === "app/api") continue;
        visiter(enfant);
      } else if (ext.test(nom) && !/\.test\.[jt]sx?$/.test(nom)) {
        out.push(enfant);
      }
    }
  };
  visiter(dossierRel);
  return out.sort();
}

const FICHIERS = [
  ...balayer("app", /\.(ts|tsx|css)$/).filter((f) => f !== "app/tokens.css"),
  ...balayer("components", /\.(ts|tsx)$/),
  "lib/statutColors.ts",
  "lib/canalColors.ts",
  "lib/celebrate.tsx",
];

// ── Rules ────────────────────────────────────────────────────────────────────

type Regle = {
  id: string;
  /** Patterns for every file. */
  tous?: RegExp[];
  /** Patterns for .ts/.tsx only. */
  ts?: RegExp[];
  /** Patterns for .css only. */
  css?: RegExp[];
  /** Custom line test. */
  test?: (ligne: string) => boolean;
  attendu: string;
};

const STATUTS = "brouillon|stock|lavage|repasse|photos|vente|livraison|compta|vendu|retour|perdu";

const REGLES: Regle[] = [
  { id: "R1", tous: [/\btext-\[/], attendu: "text-xs … text-3xl (échelle --t-*)" },
  {
    id: "R2",
    ts: [/\bfontSize\s*[:=]/],
    css: [/font-size\s*:(?!\s*var\(--t-)/],
    attendu: "une classe text-* ou var(--t-*)",
  },
  {
    id: "R3",
    ts: [/\bz-\[/, /\bz-\d/, /\bzIndex\s*[:=](?!\s*["'`]var\(--z-)/],
    css: [/z-index\s*:(?!\s*var\(--z-)/],
    attendu: "z-base | z-raised | z-sticky | z-dock | z-fab | z-overlay | z-modal | z-popover | z-toast | z-tooltip | z-skip",
  },
  { id: "R4", tous: [/#[0-9a-fA-F]{3,8}\b/], attendu: "un token de couleur (bg-surface, text-ink-2…)" },
  { id: "R5", tous: [/\b(rgba?|hsla?)\(\s*\d/], attendu: "rgb(var(--token)) ou une classe de couleur" },
  {
    id: "R6",
    tous: [/\brounded(-[a-z]{1,2})?-\[/, /\bborderRadius\s*[:=]/],
    attendu: "rounded-xs | rounded | rounded-md | rounded-lg | rounded-full",
  },
  { id: "R7", tous: [/\bshadow-\[/, /\bboxShadow\s*[:=]/], attendu: "shadow-pop | shadow-over | shadow-none" },
  {
    id: "R8",
    tous: [
      /\b(bg|text|border(-[trblxy])?|ring(-offset)?|outline|fill|stroke|from|via|to|divide|decoration|caret|accent|placeholder)-\[(color:)?var\(--/,
    ],
    attendu: "la classe du token (bg-[var(--surface-2)] → bg-surface-2)",
  },
  {
    id: "R9",
    tous: [
      /\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder)-(primary-dark|primary|on-primary|surface-soft|surface-container|ink-muted|ink-faint|muted|faint|nav|tint|error)\b/,
      /\bfont-grotesk\b/,
      /\btext-(label-sm|body-md|title-sm)\b/,
      /\b(rounded|shadow)-card/,
    ],
    attendu: "le nom de token actuel (accent, ink-2, ink-3, surface-2, neg, font-sans…)",
  },
  {
    id: "R10",
    tous: [
      /\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|caret|decoration)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/,
    ],
    attendu: "un token de couleur (la palette Tailwind par défaut ne suit pas le thème)",
  },
  {
    id: "R11",
    tous: [
      new RegExp(
        `\\b(bg|text|border|ring|outline|fill|stroke)-(line-strong|focus|accent|st-(${STATUTS})|ch-[a-z-]+)\\/\\d`,
      ),
    ],
    attendu: "le token opaque (une opacité casse le contraste vérifié)",
  },
  {
    id: "R12",
    tous: [/\[animation:/, /\btransition-all\b/, /\b(duration|ease|delay)-\[/, /(?<!motion-safe:)\banimate-(?!none\b)/],
    ts: [/\banimation\s*:/],
    attendu: "motion-safe:animate-entree|fondu|pop|shimmer|spin, duration-fast|base|slow, transition-colors…",
  },
  {
    id: "R13",
    test: (l) => l.includes("outline-none") && !l.includes("focus-visible:"),
    attendu: "un focus-visible:ring-* sur la même ligne (ou garder l'outline global)",
  },
  {
    id: "R14",
    tous: [/\b(min-h-screen|h-screen|max-h-screen)\b/, /100vh/],
    attendu: "la hauteur du cadre (100dvh, flex-1, h-full)",
  },
  {
    id: "R15",
    tous: [/\bwindow\.confirm\(/, /(?<![\w.])confirm\(\s*[`"']/],
    attendu: "AlertDialog (components/ui/alert-dialog)",
  },
  { id: "R16", tous: [/font-?family\s*:\s*["'`](?!var\()/i], attendu: "var(--font-sans) | var(--font-mono)" },
  { id: "R17", css: [/!important/], attendu: "une spécificité suffisante, sans !important" },
];

const IDS_REGLES = new Set(REGLES.map((r) => r.id));
const EXCEPTION = /design-tokens-exception:\s*(.{10,})/;
const MARQUEUR = /design-tokens-dette:\s*((?:R\d+\s*)+)→\s*(\S+)/;

type Violation = { ligne: number; regle: string; extrait: string };

function estCommentaire(ligne: string): boolean {
  const t = ligne.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function violationsLigne(ligne: string, estCss: boolean): string[] {
  const ids: string[] = [];
  for (const r of REGLES) {
    const motifs = [...(r.tous ?? []), ...((estCss ? r.css : r.ts) ?? [])];
    if (motifs.some((m) => m.test(ligne)) || (r.test?.(ligne) ?? false)) ids.push(r.id);
  }
  return ids;
}

/**
 * Line numbers (0-based) to skip: comment lines, plus the inside of a block
 * comment opened at the START of a line (`/*` or JSX `{/*`). A `/*` in the
 * middle of a code line is NOT treated as an opening: `accept="image/*"`
 * would otherwise silence the rest of the file.
 */
function lignesDeCommentaire(lignes: string[]): Set<number> {
  const out = new Set<number>();
  let dansBloc = false;
  lignes.forEach((ligne, i) => {
    const t = ligne.trimStart();
    if (dansBloc) {
      out.add(i);
      if (ligne.includes("*/")) dansBloc = false;
      return;
    }
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      out.add(i);
      if (!ligne.includes("*/")) dansBloc = true;
      return;
    }
    if (estCommentaire(ligne)) out.add(i);
  });
  return out;
}

function analyser(source: string, estCss: boolean): Violation[] {
  const lignes = source.split("\n");
  const commentaires = lignesDeCommentaire(lignes);
  const out: Violation[] = [];
  lignes.forEach((ligne, i) => {
    if (commentaires.has(i)) return;
    for (const regle of violationsLigne(ligne, estCss)) {
      if (
        (regle === "R4" || regle === "R5") &&
        (EXCEPTION.test(ligne) || (i > 0 && EXCEPTION.test(lignes[i - 1])))
      ) {
        continue;
      }
      out.push({ ligne: i + 1, regle, extrait: ligne.trim().slice(0, 140) });
    }
  });
  return out;
}

function lireMarqueur(source: string): { regles: string[]; lot: string } | null {
  const tete = source.split("\n").slice(0, 5).join("\n");
  const m = tete.match(MARQUEUR);
  if (!m) return null;
  return { regles: m[1].trim().split(/\s+/), lot: m[2] };
}

function attendu(id: string): string {
  return REGLES.find((r) => r.id === id)?.attendu ?? "";
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("design tokens · garde-fou des valeurs en dur", () => {
  it("balaye bien les dossiers (sentinelles)", () => {
    expect(FICHIERS.length).toBeGreaterThan(50);
    for (const sentinelle of ["app/layout.tsx", "app/globals.css", "components/Sidebar.tsx", "lib/statutColors.ts"]) {
      expect(FICHIERS).toContain(sentinelle);
    }
    expect(FICHIERS.some((f) => f.startsWith("app/api/"))).toBe(false);
    expect(FICHIERS).not.toContain("app/tokens.css");
  });

  it("chaque règle détecte son cas et ignore le bon usage", () => {
    const cas: [string, boolean, string | null][] = [
      ['className="text-[13px]"', false, "R1"],
      ["style={{ fontSize: 12 }}", false, "R2"],
      ["font-size: 12px;", true, "R2"],
      ["font-size: var(--t-md);", true, null],
      ['className="z-[60]"', false, "R3"],
      ['className="z-50"', false, "R3"],
      ["zIndex: 30,", false, "R3"],
      ['zIndex: "var(--z-modal)",', false, null],
      ['color: "#0f5132"', false, "R4"],
      ['background: "rgba(0,0,0,.4)"', false, "R5"],
      ['color: "rgb(var(--ink))"', false, null],
      ['className="rounded-[14px]"', false, "R6"],
      ['className="shadow-[0_1px_2px_rgba(0,0,0,.1)]"', false, "R7"],
      ['className="bg-[var(--surface-2)]"', false, "R8"],
      ['className="text-ink-faint"', false, "R9"],
      ['className="bg-white/10"', false, "R10"],
      ['className="ring-focus/30"', false, "R11"],
      ['className="bg-accent-soft"', false, null],
      ['className="animate-spin"', false, "R12"],
      ['className="motion-safe:animate-spin"', false, null],
      ['className="outline-none"', false, "R13"],
      ['className="focus-visible:outline-none focus-visible:ring-2"', false, null],
      ['className="min-h-screen"', false, "R14"],
      ['if (confirm("Supprimer ?")) {', false, "R15"],
      ['fontFamily: "Space Grotesk"', false, "R16"],
      ['fontFamily: "var(--font-sans)"', false, null],
      ["display: none !important;", true, "R17"],
    ];
    for (const [ligne, estCss, regle] of cas) {
      const ids = violationsLigne(ligne, estCss);
      if (regle) expect(ids, ligne).toContain(regle);
      else expect(ids, ligne).toEqual([]);
    }
  });

  it("ignore les commentaires, y compris un bloc JSX sur plusieurs lignes", () => {
    const source = [
      'const a = "text-[13px]";',
      "// text-[13px]",
      "{/* un vert #1B4332",
      "    sur deux lignes */}",
      '<input accept="image/*" />',
      'const b = "z-[60]";',
    ].join("\n");
    expect(analyser(source, false).map((v) => `${v.ligne}:${v.regle}`)).toEqual(["1:R1", "6:R3"]);
  });

  it("aucune valeur en dur hors dette marquée", () => {
    const echecs: string[] = [];
    for (const rel of FICHIERS) {
      const source = readFileSync(path.join(RACINE, rel), "utf8");
      const violations = analyser(source, rel.endsWith(".css"));
      const marqueur = lireMarqueur(source);

      if (marqueur) {
        if (!DETTE_AUTORISEE) {
          echecs.push(`${rel}:1  marqueur de dette interdit (DETTE_AUTORISEE = false)`);
        }
        for (const id of marqueur.regles) {
          if (!IDS_REGLES.has(id)) echecs.push(`${rel}:1  marqueur : règle inconnue ${id}`);
          else if (!violations.some((v) => v.regle === id)) {
            echecs.push(`${rel}:1  marqueur : ${id} n'a plus aucune violation, la retirer du marqueur`);
          }
        }
      }

      for (const v of violations) {
        if (DETTE_AUTORISEE && marqueur?.regles.includes(v.regle)) continue;
        echecs.push(`${rel}:${v.ligne}  ${v.regle}  ${v.extrait}  → attendu : ${attendu(v.regle)}`);
      }
    }
    expect(echecs, `\n${echecs.join("\n")}\n`).toEqual([]);
  });
});

describe("design tokens · contrastes AA dans les deux thèmes", () => {
  const css = readFileSync(path.join(RACINE, "app/tokens.css"), "utf8");
  const { clair, sombre } = lireBlocsTokens(css);
  const STATUT_CLES = STATUTS.split("|");
  const CANAUX = ["vinted", "vinted-go", "vc", "lbc", "mp", "autre"];

  const texte: [string, string[]][] = [
    ["ink", ["bg", "surface", "surface-2", "surface-3", "accent-soft"]],
    ["ink-2", ["bg", "surface", "surface-2", "surface-3"]],
    ["ink-3", ["bg", "surface", "surface-2", "surface-3", "accent-soft"]],
    ["accent-text", ["bg", "surface", "surface-2", "accent-soft"]],
    ["accent-ink", ["accent", "accent-hover"]],
    ["danger-ink", ["danger"]],
    ["bar-ink", ["bar"]],
    ["pos", ["surface", "pos-soft"]],
    ["neg", ["surface", "neg-soft"]],
    ["warn", ["surface", "surface-2", "warn-soft"]],
    ...STATUT_CLES.map(
      (k): [string, string[]] => [`st-${k}-ink`, [`st-${k}-soft`, "surface", "surface-2", "bg"]],
    ),
  ];
  const interfaceUi: [string, string[]][] = [
    ["line-strong", ["bg", "surface", "surface-2"]],
    ["focus", ["bg", "surface", "surface-2"]],
    ["accent", ["bg", "surface"]],
    ["chart", ["surface"]],
    ["chart-2", ["surface"]],
    ...CANAUX.map((k): [string, string[]] => [`ch-${k}`, ["surface", "surface-2"]]),
  ];

  function verifier(theme: string, jeu: Record<string, string>, paires: [string, string[]][], seuil: number) {
    const echecs: string[] = [];
    for (const [avant, fonds] of paires) {
      for (const fond of fonds) {
        const a = jeu[`--${avant}`];
        const b = jeu[`--${fond}`];
        if (!a || !b) {
          echecs.push(`${theme} : token manquant --${a ? fond : avant}`);
          continue;
        }
        const r = ratioContraste(lireCanaux(a), lireCanaux(b));
        if (r < seuil) echecs.push(`${theme} : ${avant} sur ${fond} = ${r.toFixed(2)} (< ${seuil})`);
      }
    }
    return echecs;
  }

  it("lit les deux blocs", () => {
    expect(Object.keys(clair).length).toBeGreaterThan(50);
    expect(clair["--bg"]).not.toEqual(sombre["--bg"]);
  });

  it("le calcul suit WCAG 2.x (noir sur blanc = 21)", () => {
    expect(ratioContraste(lireCanaux("0 0 0"), lireCanaux("255 255 255"))).toBeCloseTo(21, 5);
    expect(ratioContraste(lireCanaux("255 255 255"), lireCanaux("255 255 255"))).toBe(1);
  });

  it("texte ≥ 4,5:1", () => {
    expect([...verifier("clair", clair, texte, 4.5), ...verifier("sombre", sombre, texte, 4.5)]).toEqual([]);
  });

  it("interface ≥ 3:1", () => {
    expect([
      ...verifier("clair", clair, interfaceUi, 3),
      ...verifier("sombre", sombre, interfaceUi, 3),
    ]).toEqual([]);
  });

  it("FOND_THEME (theme-color, manifeste) = --bg", () => {
    const hexVersCanaux = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
    expect(hexVersCanaux(FOND_THEME.light)).toBe(clair["--bg"].trim());
    expect(hexVersCanaux(FOND_THEME.dark)).toBe(sombre["--bg"].trim());
  });
});
