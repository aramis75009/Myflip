import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

/**
 * Tailwind wiring of the design tokens (app/tokens.css).
 *
 * Every value is a `var(--…)`: this file holds no colour, size or duration of
 * its own. Colours are channels, exposed as `rgb(var(--x) / <alpha-value>)`
 * so that `bg-surface/90` works. The colour, font-size, radius, shadow,
 * z-index and duration scales REPLACE Tailwind's defaults (keys directly
 * under `theme`, not under `extend`): a default class such as `text-2xl` or
 * `z-50` only exists if it is listed here.
 */

const c = (n: string) => `rgb(var(--${n}) / <alpha-value>)`;

const STATUTS = [
  "brouillon",
  "stock",
  "lavage",
  "repasse",
  "photos",
  "vente",
  "livraison",
  "compta",
  "vendu",
  "retour",
  "perdu",
] as const;

const CANAUX = ["vinted", "vinted-go", "vc", "lbc", "mp", "autre"] as const;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  future: { hoverOnlyWhenSupported: true },
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      inherit: "inherit",
      bg: c("bg"),
      surface: { DEFAULT: c("surface"), 2: c("surface-2"), 3: c("surface-3") },
      line: { DEFAULT: c("line"), strong: c("line-strong") },
      ink: { DEFAULT: c("ink"), 2: c("ink-2"), 3: c("ink-3") },
      accent: {
        DEFAULT: c("accent"),
        hover: c("accent-hover"),
        ink: c("accent-ink"),
        text: c("accent-text"),
        soft: c("accent-soft"),
      },
      focus: c("focus"),
      pos: { DEFAULT: c("pos"), soft: c("pos-soft") },
      neg: { DEFAULT: c("neg"), soft: c("neg-soft") },
      warn: { DEFAULT: c("warn"), soft: c("warn-soft") },
      danger: { DEFAULT: c("danger"), ink: c("danger-ink") },
      bar: { DEFAULT: c("bar"), ink: c("bar-ink") },
      chart: { DEFAULT: c("chart"), 2: c("chart-2") },
      stage: c("stage"),
      st: Object.fromEntries(
        STATUTS.map((k) => [k, { DEFAULT: c(`st-${k}`), ink: c(`st-${k}-ink`), soft: c(`st-${k}-soft`) }]),
      ),
      ch: Object.fromEntries(CANAUX.map((k) => [k, c(`ch-${k}`)])),
      // The veil opacity follows the theme: no <alpha-value> here.
      veil: "rgb(var(--veil) / var(--veil-a))",
      "veil-fort": "rgb(var(--veil) / var(--veil-fort-a))",
      // TEMPORARY, to remove in lot LZ: a few screens still paint on photos
      // with white / black (guard rule R10, marked as debt).
      white: "rgb(255 255 255 / <alpha-value>)",
      black: "rgb(0 0 0 / <alpha-value>)",
    },
    fontSize: {
      xs: ["var(--t-xs)", { lineHeight: "var(--lh-ui)" }],
      sm: ["var(--t-sm)", { lineHeight: "var(--lh-ui)" }],
      base: ["var(--t-base)", { lineHeight: "var(--lh-ui)" }],
      md: ["var(--t-md)", { lineHeight: "var(--lh-prose)" }],
      lg: ["var(--t-lg)", { lineHeight: "var(--lh-snug)" }],
      xl: ["var(--t-xl)", { lineHeight: "var(--lh-snug)" }],
      "2xl": ["var(--t-2xl)", { lineHeight: "var(--lh-tight)" }],
      "3xl": ["var(--t-3xl)", { lineHeight: "var(--lh-tight)" }],
    },
    fontFamily: {
      sans: ["var(--font-sans)"],
      mono: ["var(--font-mono)"],
    },
    borderRadius: {
      none: "0",
      xs: "var(--r-xs)",
      sm: "var(--r-sm)",
      DEFAULT: "var(--r-sm)",
      md: "var(--r-md)",
      lg: "var(--r-lg)",
      full: "var(--r-full)",
    },
    boxShadow: {
      none: "none",
      pop: "var(--shadow-pop)",
      over: "var(--shadow-over)",
    },
    zIndex: {
      auto: "auto",
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
      0: "0ms",
      DEFAULT: "var(--d-base)",
      fast: "var(--d-fast)",
      base: "var(--d-base)",
      slow: "var(--d-slow)",
    },
    transitionTimingFunction: {
      DEFAULT: "var(--ease-out)",
      linear: "linear",
      out: "var(--ease-out)",
      in: "var(--ease-in)",
      "in-out": "var(--ease-in-out)",
    },
    extend: {
      // Preflight paints every border with this colour; Tailwind's default
      // (gray-200) is gone with the replaced palette and would fall back to
      // currentColor.
      borderColor: { DEFAULT: c("line") },
      height: { hit: "var(--hit)" },
      minHeight: { hit: "var(--hit)" },
      minWidth: { hit: "var(--hit)" },
      // Always written `motion-safe:animate-*`. `backwards` fill: no
      // transform is left on the element once the animation is over (a
      // residual transform turns an ancestor into the containing block of
      // every `position: fixed` descendant).
      keyframes: {
        entree: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        fondu: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        apparition: {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "none" },
        },
        shimmer: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        entree: "entree var(--d-slow) var(--ease-out) backwards",
        fondu: "fondu var(--d-base) var(--ease-out) backwards",
        pop: "apparition var(--d-base) var(--ease-out) backwards",
        shimmer: "shimmer 1.6s var(--ease-in-out) infinite",
      },
    },
  },
  plugins: [
    // `replie:hidden` etc.: styles of the collapsed desktop sidebar (rail).
    plugin(({ addVariant }) => addVariant("replie", ':root[data-sidebar="collapsed"] &')),
  ],
};

export default config;
