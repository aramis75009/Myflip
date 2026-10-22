#!/usr/bin/env node
/**
 * Design-token codemod (docs/refonte/plan-fondations.md § 2.6, tables A to G).
 *
 * Rewrites hard-coded classes and old CSS variables of `app/**` (except
 * `app/api/**`) and `components/**`, .ts/.tsx, tests and iCloud " 2"
 * duplicates excluded. Works on raw text: classes also live in strings and
 * `cva` calls.
 *
 *   node scripts/refonte/codemod-tokens.mjs --dry-run   # report only
 *   node scripts/refonte/codemod-tokens.mjs             # write files
 *
 * Run it ONCE: the radius table is not idempotent (a new rounded-lg would
 * be read as an old one on a second run).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DRY = process.argv.includes("--dry-run");

// ── Files ────────────────────────────────────────────────────────────────────

function walk(rel, out = []) {
  for (const e of fs.readdirSync(path.join(RACINE, rel), { withFileTypes: true })) {
    const enfant = `${rel}/${e.name}`;
    if (e.name.includes(" 2")) continue;
    if (e.isDirectory()) {
      if (enfant === "app/api") continue;
      walk(enfant, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(enfant);
    }
  }
  return out;
}

const FICHIERS = [...walk("app"), ...walk("components")].sort();

// ── Tables ───────────────────────────────────────────────────────────────────

const stats = new Map();
const compter = (table, n = 1) => stats.set(table, (stats.get(table) ?? 0) + n);
const nonTraites = [];

// A. Old token → new token.
const ANCIEN_VERS_NOUVEAU = {
  bg: "bg",
  surface: "surface",
  "surface-2": "surface-2",
  ink: "ink",
  pos: "pos",
  neg: "neg",
  warn: "warn",
  "pos-soft": "pos-soft",
  "neg-soft": "neg-soft",
  "warn-soft": "warn-soft",
  tint: "surface-2",
  raise: "surface-3",
  disabled: "surface-3",
  "acc-soft-strong": "surface-3",
  border: "line",
  "border-strong": "line-strong",
  ink2: "ink-2",
  nav: "ink-2",
  muted: "ink-3",
  faint: "ink-3",
  "faint-2": "ink-3",
  acc: "accent", // "accent-text" after text-
  "acc-hover": "accent-hover",
  "acc-ink": "accent-ink",
  "acc-dim": "accent-ink",
  "acc-soft": "accent-soft",
  "acc-ring": "focus",
  "acc-ring-strong": "focus",
  alert: "danger",
  "alert-soft": "neg-soft",
  notice: "warn",
  "notice-soft": "warn-soft",
};

const PREFIXES_COULEUR =
  "bg|text|border-[trblxy]|border|ring-offset|ring|outline|fill|stroke|from|via|to|divide|decoration|caret|accent|placeholder";

function nouveauNom(ancien, prefixe) {
  if (ancien === "acc" && prefixe === "text") return "accent-text";
  return ANCIEN_VERS_NOUVEAU[ancien];
}

// B. Old Tailwind aliases.
const ALIAS = {
  "primary-dark": "accent-hover",
  "on-primary": "accent-ink",
  primary: "accent", // "accent-text" after text-
  "surface-soft": "surface-2",
  "surface-container": "surface-2",
  "ink-muted": "ink-2",
  "ink-faint": "ink-3",
  muted: "ink-3",
  faint: "ink-3",
  nav: "ink-2",
  tint: "surface-2",
  error: "neg",
};

// C. Text sizes (px → name).
function tailleTexte(px) {
  if (px >= 8.5 && px <= 12) return "xs";
  if (px >= 12.5 && px <= 13) return "sm";
  if (px >= 13.5 && px <= 14.5) return "base";
  if (px >= 15 && px <= 17) return "md";
  if (px >= 18 && px <= 22) return "lg";
  if (px >= 23 && px <= 30) return "xl";
  if (px >= 34 && px <= 44) return "2xl";
  if (px >= 58 && px <= 80) return "3xl";
  return null;
}

// D. Radii (one pass, one mapping function: never chain lg → md then xl → lg).
function rayon(valeur) {
  const m = valeur.match(/^\[(\d+(?:\.\d+)?)px\]$/);
  if (m) {
    const px = Number(m[1]);
    if (px === 3 || px === 4) return "xs";
    if (px >= 8 && px <= 11) return "";
    if (px >= 12 && px <= 16) return "md";
    if (px >= 18 && px <= 26) return "lg";
    return null;
  }
  return { md: "md", lg: "md", "2xl": "md", xl: "lg", card: "lg" }[valeur] ?? null;
}

// E. Shadows.
const OMBRES = {
  "shadow-sm": null,
  "shadow-card": null,
  "shadow-[0_1px_2px_rgba(22,38,29,.03)]": null,
  "shadow-[0_10px_22px_-12px_rgba(20,53,40,.8)]": "shadow-pop",
  "shadow-[0_14px_40px_-20px_rgba(20,53,40,.2)]": "shadow-pop",
  "shadow-[0_26px_60px_-24px_rgba(20,53,40,.5)]": "shadow-pop",
  "shadow-[0_2px_10px_rgba(20,53,40,.14)]": "shadow-pop",
  "shadow-[0_18px_34px_-24px_rgba(20,53,40,.55)]": "shadow-pop",
  "shadow-[0_14px_30px_-20px_rgba(20,53,40,.7)]": "shadow-pop",
  "shadow-card-hover": "shadow-over",
  "shadow-[0_30px_80px_-20px_rgba(22,38,29,.55)]": "shadow-over",
  "shadow-[0_28px_60px_-20px_rgba(0,0,0,.7)]": "shadow-over",
  "shadow-[0_24px_44px_-22px_rgba(20,53,40,.85)]": "shadow-over",
  "shadow-[0_18px_40px_-16px_rgba(0,0,0,.6)]": "shadow-over",
};

// F. Z-index, occurrence by occurrence (lines read on 21/10).
const Z_INDEX = [
  ["components/TopBar.tsx", 36, "z-40", "z-sticky"],
  ["components/Sidebar.tsx", 153, "z-40", "z-sticky"],
  ["components/Sidebar.tsx", 159, "z-50", "z-raised"],
  ["components/Sidebar.tsx", 191, "z-0", "z-base"],
  ["components/Sidebar.tsx", 203, "z-10", "z-raised"],
  ["components/Sidebar.tsx", 210, "z-10", "z-raised"],
  ["components/Sidebar.tsx", 275, "z-40", "z-dock"],
  ["components/ChatBot.tsx", 117, "z-50", "z-fab"],
  ["components/ChatBot.tsx", 132, "z-50", "z-modal"],
  ["components/Modal.tsx", 66, "z-[60]", "z-modal"],
  ["components/SellDialog.tsx", 87, "z-50", "z-modal"],
  ["app/a-comptabiliser/page.tsx", 316, "z-50", "z-modal"],
  ["app/commandes/page.tsx", 568, "z-40", "z-overlay"],
  ["app/commandes/page.tsx", 571, "z-50", "z-popover"],
  ["app/mise-en-vente/page.tsx", 728, "z-[60]", "z-modal"],
  ["app/mise-en-vente/page.tsx", 758, "z-40", "z-dock"],
  ["app/mise-en-vente/_components/FicheArticle.tsx", 321, "z-10", "z-raised"],
  ["app/mise-en-vente/_components/FicheArticle.tsx", 328, "z-10", "z-raised"],
  ["app/mise-en-vente/_components/FicheArticle.tsx", 335, "z-10", "z-raised"],
  ["app/mise-en-vente/_components/FicheArticle.tsx", 342, "z-10", "z-raised"],
  ["app/mise-en-vente/_components/FicheArticle.tsx", 349, "z-10", "z-raised"],
  ["app/statistiques/page.tsx", 115, "z-10", "z-overlay"],
  ["app/statistiques/page.tsx", 121, "z-20", "z-popover"],
  ["app/statistiques/page.tsx", 144, "z-20", "z-popover"],
  ["app/stock/page.tsx", 1603, "z-30", "z-dock"],
  ["app/calendrier/page.tsx", 553, "z-[80]", "z-modal"],
  ["components/landing/LandingNav.tsx", 20, "z-50", "z-sticky"],
];

// G. Spacing scale of Tailwind (N/4).
const ECHELLE = new Set(
  [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96],
);
const PREFIXES_ESPACE =
  "gap-x|gap-y|gap|space-x|space-y|min-w|min-h|max-h|inset-x|inset-y|inset|translate-x|translate-y|px|py|pt|pr|pb|pl|p|mx|my|mt|mr|mb|ml|m|size|w|h|top|right|bottom|left";

// Escapes a literal for RegExp.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A class token boundary: not preceded / followed by a word char or a dash.
const AVANT = "(?<![\\w-])";
const APRES = "(?![\\w-])";

// ── Transform ────────────────────────────────────────────────────────────────

function transformer(rel, source) {
  let s = source;

  // F. z-index by line (line numbers are stable: no step adds or removes lines).
  const lignes = s.split("\n");
  for (const [fichier, n, de, vers] of Z_INDEX.filter(([f]) => f === rel)) {
    const re = new RegExp(`${AVANT}${esc(de)}${APRES}`);
    if (re.test(lignes[n - 1] ?? "")) {
      lignes[n - 1] = lignes[n - 1].replace(re, vers);
      compter("F z-index");
    } else if (!(lignes[n - 1] ?? "").includes(vers)) {
      nonTraites.push(`${fichier}:${n} ${de} → ${vers} : occurrence introuvable, à traiter à la main`);
    }
  }
  s = lignes.join("\n");

  // G. Animations and durations.
  s = s.replace(/\[animation:(?:stepIn|fadeUp)[^\]\s]*\]/g, () => (compter("G animation"), "motion-safe:animate-entree"));
  s = s.replace(/\[animation:(?:popIn|modalIn)[^\]\s]*\]/g, () => (compter("G animation"), "motion-safe:animate-pop"));
  s = s.replace(/\[animation:overlayIn[^\]\s]*\]/g, () => (compter("G animation"), "motion-safe:animate-fondu"));
  s = s.replace(/(?<![\w:-])animate-spin(?![\w-])/g, () => (compter("G animation"), "motion-safe:animate-spin"));
  s = s.replace(new RegExp(`${AVANT}duration-(150|200|300|500|\\[260ms\\])${APRES}`, "g"), (_, v) => {
    compter("G durée");
    return `duration-${v === "150" ? "fast" : v === "200" ? "base" : "slow"}`;
  });

  // A. Classes `prefix-[var(--old)]` (modifiers and /NN opacity kept).
  s = s.replace(
    new RegExp(`${AVANT}(${PREFIXES_COULEUR})-\\[(?:color:)?var\\(--([a-z0-9-]+)\\)\\]`, "g"),
    (tout, prefixe, ancien) => {
      const nouveau = nouveauNom(ancien, prefixe);
      if (!nouveau) return tout;
      compter("A classe");
      return `${prefixe}-${nouveau}`;
    },
  );
  s = s.replace(new RegExp(`${AVANT}shadow-\\[var\\(--shadow\\)\\]${APRES}`, "g"), () => (compter("A classe"), "shadow-pop"));

  // A. Any other string: var(--old) → rgb(var(--new)); var(--shadow) → var(--shadow-pop).
  s = s.replace(/(?<!rgb\()var\(--([a-z0-9-]+)\)/g, (tout, ancien) => {
    if (ancien === "shadow") return (compter("A chaîne"), "var(--shadow-pop)");
    if (ancien === "font-grotesk") return (compter("A chaîne"), "var(--font-sans)");
    const nouveau = ANCIEN_VERS_NOUVEAU[ancien];
    if (!nouveau) return tout;
    compter("A chaîne");
    return `rgb(var(--${nouveau}))`;
  });

  // B. Old aliases.
  s = s.replace(
    new RegExp(
      `${AVANT}(${PREFIXES_COULEUR})-(primary-dark|on-primary|primary|surface-soft|surface-container|ink-muted|ink-faint|muted|faint|nav|tint|error)${APRES}`,
      "g",
    ),
    (_, prefixe, alias) => {
      compter("B alias");
      const nouveau = alias === "primary" && prefixe === "text" ? "accent-text" : ALIAS[alias];
      return `${prefixe}-${nouveau}`;
    },
  );
  s = s.replace(new RegExp(`${AVANT}font-grotesk${APRES}`, "g"), () => (compter("B alias"), "font-sans"));
  // The three old named sizes carried a weight; keep it unless the line sets one.
  s = s
    .split("\n")
    .map((ligne) => {
      const aUnPoids = /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/.test(ligne);
      return ligne
        .replace(new RegExp(`${AVANT}text-label-sm${APRES}`, "g"), () => (compter("B alias"), aUnPoids ? "text-xs" : "text-xs font-medium"))
        .replace(new RegExp(`${AVANT}text-body-md${APRES}`, "g"), () => (compter("B alias"), "text-base"))
        .replace(new RegExp(`${AVANT}text-title-sm${APRES}`, "g"), () => (compter("B alias"), aUnPoids ? "text-lg" : "text-lg font-semibold"));
    })
    .join("\n");

  // C. Text sizes.
  s = s.replace(new RegExp(`${AVANT}text-\\[(\\d+(?:\\.\\d+)?)px\\]`, "g"), (tout, px) => {
    const nom = tailleTexte(Number(px));
    if (!nom) return tout;
    compter("C texte");
    return `text-${nom}`;
  });

  // D. Radii.
  s = s.replace(
    new RegExp(`${AVANT}rounded(-(?:tl|tr|bl|br|t|r|b|l))?-(\\[\\d+(?:\\.\\d+)?px\\]|md|lg|xl|2xl|card)${APRES}`, "g"),
    (tout, dir = "", valeur) => {
      const nom = rayon(valeur);
      if (nom === null) return tout;
      if (nom === valeur) return tout;
      compter("D rayon");
      return `rounded${dir}${nom ? `-${nom}` : ""}`;
    },
  );

  // E. Shadows (with their modifiers; a removed class takes one space with it).
  for (const [ancienne, nouvelle] of Object.entries(OMBRES)) {
    const re = new RegExp(`${AVANT}((?:[a-z0-9-]+:)*)${esc(ancienne)}${APRES}`, "g");
    s = s.replace(re, (tout, modifs) => {
      compter("E ombre");
      return nouvelle ? `${modifs}${nouvelle}` : "\u0000";
    });
  }
  s = s.replace(/ \u0000|\u0000 |\u0000/g, "");

  // G. Spacing: prefix-[Npx] → prefix-<N/4> when N/4 is on the default scale.
  s = s.replace(
    new RegExp(`${AVANT}(-?)(${PREFIXES_ESPACE})-\\[(\\d+(?:\\.\\d+)?)px\\]${APRES}`, "g"),
    (tout, moins, prefixe, px) => {
      const pas = Number(px) / 4;
      if (!ECHELLE.has(pas)) return tout;
      compter("G espacement");
      return `${moins}${prefixe}-${pas}`;
    },
  );

  // Collapsed sidebar: `.sb-*` rules of globals.css → `replie:` variant.
  if (rel === "components/Sidebar.tsx") {
    s = s.replace(/\bsb-hide-collapsed\b/g, () => (compter("Sidebar replie"), "replie:hidden"));
    s = s.replace(/\bsb-only-collapsed\b/g, () => (compter("Sidebar replie"), "hidden replie:flex"));
    s = s.replace(
      /\bsb-item\b/g,
      () => (compter("Sidebar replie"), "replie:h-12 replie:flex-col replie:items-center replie:justify-center replie:gap-0.5 replie:p-0"),
    );
    s = s.replace(
      "La bascule est purement\n// CSS (`.replie:hidden` / `.hidden replie:flex` dans globals.css).",
      "La bascule est purement\n// CSS (variante `replie:` de tailwind.config.ts).",
    );
  }

  return s;
}

// ── Run ──────────────────────────────────────────────────────────────────────

const modifies = [];
let pxRestants = 0;
let stylesEnLigne = 0;
for (const rel of FICHIERS) {
  const avant = fs.readFileSync(path.join(RACINE, rel), "utf8");
  const apres = transformer(rel, avant);
  pxRestants += (apres.match(/-\[\d+(?:\.\d+)?px\]/g) ?? []).length;
  stylesEnLigne += (apres.match(/style=\{\{/g) ?? []).length;
  if (apres !== avant) {
    modifies.push(rel);
    if (!DRY) fs.writeFileSync(path.join(RACINE, rel), apres);
  }
}

console.log(`${DRY ? "[dry-run] " : ""}${FICHIERS.length} fichiers lus, ${modifies.length} modifiés`);
for (const [table, n] of [...stats].sort()) console.log(`  ${table.padEnd(16)} ${n}`);
console.log(`  valeurs px arbitraires restantes : ${pxRestants}`);
console.log(`  styles en ligne restants : ${stylesEnLigne}`);
if (nonTraites.length) console.log(`Non traités :\n  ${nonTraites.join("\n  ")}`);
console.log(`Fichiers :\n  ${modifies.join("\n  ")}`);
