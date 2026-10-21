/**
 * Theme plumbing shared by the root layout, the PWA manifest and the theme
 * toggle.
 *
 * `FOND_THEME` mirrors `--bg` of `app/tokens.css` in hex, because
 * `<meta name="theme-color">` and the manifest do not understand CSS
 * variables. `lib/designTokens.test.ts` fails if the two drift apart.
 */

export const FOND_THEME = { light: "#e7ece8", dark: "#0b0e0d" } as const;

export type Theme = keyof typeof FOND_THEME;

export const CLE_THEME = "myflip-theme";

const CLE_SIDEBAR = "myflip-sidebar";

/**
 * Inline script, run as the first child of <body> before the first paint.
 *
 * - Theme: saved choice, else `prefers-color-scheme`; ALWAYS written as an
 *   explicit `data-theme` on <html>.
 * - `theme-color`: the meta tag belongs to this script (and to
 *   `appliquerTheme`), not to React — it is created in <head> if missing.
 * - Sidebar: `data-sidebar="collapsed"` when saved so.
 *
 * Every step is wrapped in try/catch: storage can throw (private mode).
 */
export const SCRIPT_THEME = `(function(){var d=document.documentElement,f=${JSON.stringify(
  FOND_THEME,
)},t=null;try{t=localStorage.getItem(${JSON.stringify(CLE_THEME)})}catch(e){}if(t!=="light"&&t!=="dark"){try{t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch(e){t="light"}}d.setAttribute("data-theme",t);try{var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.setAttribute("name","theme-color");document.head.appendChild(m)}m.setAttribute("content",f[t])}catch(e){}try{if(localStorage.getItem(${JSON.stringify(
  CLE_SIDEBAR,
)})==="collapsed")d.setAttribute("data-sidebar","collapsed")}catch(e){}})();`;

/** Client only: applies a theme (attribute, saved choice, theme-color). */
export function appliquerTheme(theme: Theme): void {
  const racine = document.documentElement;
  racine.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(CLE_THEME, theme);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  try {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", FOND_THEME[theme]);
  } catch {
    /* no <head>: nothing to update */
  }
}
