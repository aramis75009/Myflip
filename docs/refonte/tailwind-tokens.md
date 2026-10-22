# Vernier dans Tailwind 3 et next/font

> Adopté le 20/10/2026. À appliquer à l'étape 3 (fondations). Source des valeurs :
> `docs/refonte/tokens.css`. Règles et intentions : `docs/design-system.md`.

## 1. Où poser quoi

| Quoi | Où | Note |
|---|---|---|
| `docs/refonte/tokens.css` | en tête de `app/globals.css`, avant `@tailwind base` | remplace tout le bloc de variables de Direction C (`--acc`, `--acc-ring`, `--faint`, `--raise`…) |
| bloc `theme` ci-dessous | `tailwind.config.ts` | les alias morts (`primary`, `primary-dark`, `on-primary`, `error`, `muted`, `faint`…) disparaissent |
| polices | `app/layout.tsx` (§ 4) | variables posées sur `<html>` |
| script de thème | `app/layout.tsx`, `<script>` inline dans `<head>` (§ 5) | jamais dans un `useEffect` |

## 2. `tailwind.config.ts`

`fontSize`, `zIndex`, `borderRadius`, `boxShadow` et `transitionDuration` sont **remplacés**, pas étendus : les
valeurs par défaut de Tailwind (`text-[13.5px]` mis à part) ne doivent plus exister. L'espacement par défaut de
Tailwind (pas de 0,25 rem) correspond déjà à `--sp-*` : on le garde tel quel (`p-4` = `--sp-4` = 16 px).

```ts
import type { Config } from "tailwindcss";

/** Couleur en canaux : `bg-surface/90`, `bg-veil/50` et `ring-focus` fonctionnent. */
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const STATUTS = ["brouillon", "stock", "lavage", "repasse", "photos", "vente", "livraison", "compta", "vendu", "perdu"] as const;
const CANAUX = ["vinted", "vinted-go", "vc", "lbc", "mp", "autre"] as const;

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'], // à ne pas utiliser : les tokens changent seuls de thème, y compris en « auto »
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    fontFamily: {
      sans: ["var(--font-sans)"],
      mono: ["var(--font-mono)"],
    },
    fontSize: {
      xs: ["var(--t-xs)", { lineHeight: "1.4" }],     // 12 px
      sm: ["var(--t-sm)", { lineHeight: "1.4" }],     // 13 px
      base: ["var(--t-base)", { lineHeight: "1.45" }],// 14 px
      md: ["var(--t-md)", { lineHeight: "1.5" }],     // 16 px
      lg: ["var(--t-lg)", { lineHeight: "1.25" }],    // 20 px
      xl: ["var(--t-xl)", { lineHeight: "1.2" }],     // 28 px
      "2xl": ["var(--t-2xl)", { lineHeight: "1.05" }],// 40 px
      "3xl": ["var(--t-3xl)", { lineHeight: "1.05" }],// 56 px
    },
    borderRadius: {
      none: "0",
      xs: "var(--r-xs)",
      DEFAULT: "var(--r-sm)",
      sm: "var(--r-sm)",
      md: "var(--r-md)",
      lg: "var(--r-lg)",
      full: "var(--r-full)",
    },
    boxShadow: {
      none: "none",
      pop: "var(--shadow-pop)",   // menus, info-bulles, listes
      over: "var(--shadow-over)", // modale, tiroir, feuille, toast, barre groupée
    },
    zIndex: {
      base: "var(--z-base)",
      raised: "var(--z-raised)",
      sticky: "var(--z-sticky)",
      dock: "var(--z-dock)",
      fab: "var(--z-fab)",
      overlay: "var(--z-overlay)",
      modal: "var(--z-modal)",
      popover: "var(--z-popover)",
      toast: "var(--z-toast)",
      tooltip: "var(--z-tooltip)",
      skip: "var(--z-skip)",
    },
    transitionDuration: {
      DEFAULT: "var(--d-base)",
      fast: "var(--d-fast)",
      base: "var(--d-base)",
      slow: "var(--d-slow)",
    },
    transitionTimingFunction: {
      DEFAULT: "var(--ease-out)",
      out: "var(--ease-out)",
      in: "var(--ease-in)",
      "in-out": "var(--ease-in-out)",
    },
    extend: {
      colors: {
        bg: c("bg"),
        surface: { DEFAULT: c("surface"), 2: c("surface-2"), 3: c("surface-3") },
        line: { DEFAULT: c("line"), strong: c("line-strong") },
        ink: { DEFAULT: c("ink"), 2: c("ink-2"), 3: c("ink-3") },
        accent: {
          DEFAULT: c("accent"),
          hover: c("accent-hover"),
          ink: c("accent-ink"),   // texte sur l'accent
          text: c("accent-text"), // accent écrit : liens, entrée active
          soft: c("accent-soft"), // fond de sélection
        },
        focus: c("focus"),
        pos: { DEFAULT: c("pos"), soft: c("pos-soft") },
        neg: { DEFAULT: c("neg"), soft: c("neg-soft") },
        warn: { DEFAULT: c("warn"), soft: c("warn-soft") },
        danger: { DEFAULT: c("danger"), ink: c("danger-ink") },
        veil: c("veil"),
        bar: { DEFAULT: c("bar"), ink: c("bar-ink") },
        stage: c("stage"),
        chart: { DEFAULT: c("chart"), 2: c("chart-2") },
        st: Object.fromEntries(
          STATUTS.map((s) => [s, { DEFAULT: c(`st-${s}`), ink: c(`st-${s}-ink`), soft: c(`st-${s}-soft`) }]),
        ),
        ch: Object.fromEntries(CANAUX.map((k) => [k, c(`ch-${k}`)])),
      },
      height: { row: "var(--row-h)", hit: "var(--hit)", topbar: "var(--topbar-h)", dock: "var(--dock-h)" },
      minHeight: { hit: "var(--hit)" },
      minWidth: { hit: "var(--hit)" },
      width: { sidebar: "var(--sidebar-w)", rail: "var(--sidebar-rail)" },
      keyframes: {
        shimmer: { from: { backgroundPosition: "100% 0" }, to: { backgroundPosition: "-150% 0" } },
      },
      animation: {
        shimmer: "shimmer 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
```

Classes qui en sortent, pour les relire d'un œil : `bg-surface`, `bg-surface-2`, `border-line`,
`border-line-strong`, `text-ink-3`, `bg-accent text-accent-ink`, `text-accent-text`, `bg-accent-soft`,
`ring-focus`, `bg-veil/50`, `bg-bg/90`, `bg-st-vente-soft text-st-vente-ink`, `text-st-vente` (icône),
`bg-ch-vinted`, `z-modal`, `shadow-over`, `duration-slow ease-in-out`, `text-sm`, `h-row`.

**Les classes de statut sont écrites en entier dans un tableau** (`lib/statutColors.ts` devient une table de
classes : `{ pill: "bg-st-vente-soft text-st-vente-ink", icon: "text-st-vente", Icon: Tag }`), jamais
construites par concaténation (`bg-st-${k}`) : le JIT ne les verrait pas.

### Utilitaires à ajouter dans `app/globals.css`

```css
@layer utilities {
  .font-wide { font-stretch: var(--wide); }            /* titres Archivo élargi */
  .text-balance { text-wrap: balance; }
}
@layer base {
  body { background: rgb(var(--bg)); color: rgb(var(--ink)); font-family: var(--font-sans);
         font-size: var(--t-base); line-height: var(--lh-ui); font-variant-numeric: tabular-nums;
         scrollbar-color: rgb(var(--line-strong)) rgb(var(--bg)); }
  :focus-visible { outline: 2px solid rgb(var(--focus)); outline-offset: 2px; }
  ::selection { background: rgb(var(--accent) / 0.22); }
  @media (max-width: 767px) { input, select, textarea { font-size: var(--t-md); } } /* jamais de zoom iOS */
}
```

Les ~30 keyframes de Direction C et la règle `0.01ms !important` de `globals.css` sont supprimées. Il ne reste
que `animate-spin` (déjà fourni par Tailwind, toujours écrit `motion-safe:animate-spin`) et `animate-shimmer`
(toujours `motion-safe:animate-shimmer`).

## 3. Interdits que la config ne bloque pas

Tailwind accepte encore les valeurs arbitraires. Un test Vitest (`lib/designTokens.test.ts`, à créer à l'étape 3)
parcourt `app/` et `components/` et échoue sur :

- `text-[` suivi d'un nombre (taille hors échelle) ;
- `z-[` et `z-10|20|30|40|50` (z-index hors échelle) ;
- un hexadécimal `#[0-9a-fA-F]{3,8}` hors des fichiers d'exception (données de couleurs de vêtements, e-mails) ;
- `rounded-[`, `shadow-[`, `duration-[` ;
- une opacité sur `line-strong`, `focus`, `accent` (sauf `accent/22` de `::selection`) ou un marqueur `st-*` :
  `/(border|ring|text|bg)-(line-strong|focus|st-[a-z]+)\/\d+/`.

Le même test lit `tokens.css` et recalcule les contrastes des paires de `design-system.md` (§ Contrastes) dans
les deux thèmes, comme la section Système de `reference.html`.

## 4. Polices : `next/font/google`

Vérifié le 20/10/2026 dans `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json` (Next 15.5.19) :
Archivo (axes `wdth` 62 à 125 et `wght` 100 à 900, sous-ensembles `latin`, `latin-ext`) et Fragment Mono (400,
`latin`). Licence SIL OFL 1.1 pour les deux (fichiers `ofl/archivo/OFL.txt` et `ofl/fragmentmono/OFL.txt` du
dépôt google/fonts, relus le 20/10/2026).

```tsx
// app/layout.tsx
import { Archivo, Fragment_Mono } from "next/font/google";

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],                // police variable : wght est inclus d'office
  variable: "--font-archivo",
  display: "swap",
});
const fragmentMono = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-fragment-mono",
  display: "swap",
});

// <html lang="fr" className={`${archivo.variable} ${fragmentMono.variable}`} suppressHydrationWarning>
```

- Les variables s'appellent `--font-archivo` et `--font-fragment-mono`, **pas** `--font-sans` : `tokens.css`
  construit `--font-sans` et `--font-mono` à partir d'elles, avec un repli. Ne jamais écrire `"Archivo"` ni
  `'Space Grotesk'` dans un composant (bug F1).
- La flèche (U+2192) et la croix (U+2715) ne sont dans aucun sous-ensemble servi : `ArrowRight` et `X` de
  lucide-react, et `×` (U+00D7, couvert) pour le coefficient.
- `font-stretch` sur Archivo : la classe `.font-wide` (115 %) pour les titres de page, 118 à 122 % réservés au
  wordmark et à la landing.

## 5. Thème : script inline et `themeColor`

```tsx
// app/layout.tsx, dans <head>, avant tout le reste
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem('myflip-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
  }}
/>
```

- Choix « clair » ⇒ `data-theme="light"` posé explicitement (sinon un système sombre l'emporterait, puisque
  `tokens.css` garde son bloc `@media` sous `:root:not([data-theme="light"])`).
- Choix « automatique » ⇒ clé effacée et attribut retiré : `prefers-color-scheme` décide, sans JS.
- `export const viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f5f7f9" }, { media: "(prefers-color-scheme: dark)", color: "#0f1318" }] }`,
  et le sélecteur de thème réécrit `<meta name="theme-color">` à chaque bascule (bug X7).
- L'icône du bouton de thème se choisit en CSS selon `data-theme` et la media query : juste dès le premier
  affichage (bug X13).
- Sonner : `<Toaster theme={…} toastOptions={{ classNames: { toast: "bg-surface text-ink border border-line shadow-over rounded-md font-sans text-sm" } }} offset={24} mobileOffset={{ bottom: "calc(var(--dock-h) + env(safe-area-inset-bottom) + 12px)" }} />`
  (bug MO3, toasts au-dessus du dock).

## 6. Primitives d'interface

Le PRD autorise Radix (ou shadcn sur Radix), `clsx`, `cva` et `tailwind-merge`. Recommandation pour l'étape 3 :
`@radix-ui/react-dialog` pour la modale, le tiroir et la feuille « Plus » (piège de focus, Échap, retour du
focus, verrouillage du défilement), `cva` pour les variantes. La couche Radix rend dans un portail : l'échelle
`--z-overlay` / `--z-modal` / `--z-popover` / `--z-toast` s'applique telle quelle, et les toasts Sonner restent
au-dessus d'une modale ouverte. Versions à lire dans la doc du moment (MCP context7), pas de mémoire.
