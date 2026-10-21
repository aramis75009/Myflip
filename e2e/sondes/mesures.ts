/**
 * Relevés exécutés DANS la page (`page.evaluate(releve…)`). Chaque fonction est
 * autonome : Playwright la sérialise, aucune variable extérieure n'est visible.
 * Elles ne modifient rien dans la page (sauf `releveZoomTexte`, qui change la
 * taille racine le temps de la mesure puis la rétablit).
 *
 * Éléments ignorés partout : ce qui est caché (display, visibility, opacité 0,
 * boîte vide) et l'outillage de `next dev` (<nextjs-portal>), absent en production.
 */

export type Exemple = { taille: number; texte: string };

export type RelevePolices = {
  /** Éléments de texte visibles sous 10 px et sous 11 px. */
  lt10: number;
  lt11: number;
  total: number;
  /** Les 12 premiers sous 11 px. */
  exemples: Exemple[];
  /** Tailles distinctes (px, arrondies au centième) et nombre d'éléments pour chacune. */
  tailles: [number, number][];
  nbTailles: number;
};

export function relevePolices(): RelevePolices {
  const vus = new Set<Element>();
  const parTaille = new Map<number, number>();
  const exemples: Exemple[] = [];
  let lt10 = 0;
  let lt11 = 0;
  let total = 0;
  const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.textContent && n.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  while (marcheur.nextNode()) {
    const el = marcheur.currentNode.parentElement;
    if (!el || vus.has(el)) continue;
    vus.add(el);
    if (el.closest("nextjs-portal, script, style, noscript, template, option")) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0 || !r.width || !r.height) continue;
    const px = Math.round(parseFloat(cs.fontSize) * 100) / 100;
    total += 1;
    parTaille.set(px, (parTaille.get(px) ?? 0) + 1);
    if (px < 11) {
      lt11 += 1;
      if (px < 10) lt10 += 1;
      if (exemples.length < 12) exemples.push({ taille: px, texte: (el.textContent ?? "").trim().slice(0, 28) });
    }
  }
  const tailles = [...parTaille.entries()].sort((a, b) => a[0] - b[0]);
  return { lt10, lt11, total, exemples, tailles, nbTailles: tailles.length };
}

export type ReleveZoom = {
  total: number;
  suivent: number;
  /** Part des textes dont la taille double (au moins ×1,9) quand la taille racine passe de 16 à 32 px. */
  ratio: number;
  /** Les 10 premiers qui ne suivent pas : « <balise> <taille en px> texte ». */
  exceptions: string[];
};

export function releveZoomTexte(): ReleveZoom {
  const racine = document.documentElement;
  const els = [...document.querySelectorAll("body *")].filter(
    (e) =>
      !e.closest("nextjs-portal, script, style, noscript, template, option") &&
      e.getClientRects().length > 0 &&
      [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""),
  );
  const avant = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
  const precedent = racine.style.fontSize;
  racine.style.fontSize = "32px";
  const apres = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
  racine.style.fontSize = precedent;
  let suivent = 0;
  const exceptions: string[] = [];
  els.forEach((e, i) => {
    if (apres[i] >= avant[i] * 1.9) suivent += 1;
    else if (exceptions.length < 10) exceptions.push(`${e.tagName.toLowerCase()} ${avant[i]}px « ${(e.textContent ?? "").trim().slice(0, 20)} »`);
  });
  return { total: els.length, suivent, ratio: els.length ? Math.round((suivent / els.length) * 1000) / 1000 : 1, exceptions };
}

export type ReleveDebordements = {
  fenetre: { largeur: number; hauteur: number };
  /** Défilement horizontal : scrollWidth − clientWidth du document (> 0 = la page défile de côté). */
  debordH: number;
  /** Défilement vertical : scrollHeight − hauteur de fenêtre (> 0 = une barre verticale). */
  debordV: number;
  /** Largeur occupée par la barre de défilement verticale (innerWidth − clientWidth). */
  barreV: number;
  /** Éléments dont min-height ≥ hauteur de fenêtre (body compris). */
  pleineHauteur: string[];
  /** Bas du dernier contenu réel (texte, image, champ, bouton ; hors éléments fixes et collants), en px depuis le haut du document. */
  basContenu: number;
  /** Hauteur du document moins le bas du contenu : l'espace vide sous la page. */
  videEnBas: number;
};

export function releveDebordements(): ReleveDebordements {
  const doc = document.scrollingElement ?? document.documentElement;
  const h = window.innerHeight;
  const pleineHauteur = [...document.querySelectorAll("body, body *")]
    .filter((e) => !e.closest("nextjs-portal") && parseFloat(getComputedStyle(e).minHeight) >= h - 1)
    .map((e) => e.tagName);
  // Bas du contenu réel : on ignore tout ce qui est fixe ou collant (barres, dock, bulle, toasts).
  const positionne = (el: Element): boolean => {
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
      const p = getComputedStyle(e).position;
      if (p === "fixed" || p === "sticky") return true;
    }
    return false;
  };
  let basContenu = 0;
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("nextjs-portal, script, style, noscript, template")) continue;
    const porteContenu =
      /^(IMG|SVG|CANVAS|VIDEO|INPUT|SELECT|TEXTAREA|BUTTON)$/i.test(el.tagName) ||
      [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
    if (!porteContenu) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden" || positionne(el)) continue;
    basContenu = Math.max(basContenu, r.bottom + window.scrollY);
  }
  return {
    fenetre: { largeur: window.innerWidth, hauteur: h },
    debordH: doc.scrollWidth - document.documentElement.clientWidth,
    debordV: doc.scrollHeight - h,
    barreV: window.innerWidth - document.documentElement.clientWidth,
    pleineHauteur,
    basContenu: Math.round(basContenu),
    videEnBas: Math.round(doc.scrollHeight - basContenu),
  };
}

export type ElementFixe = {
  balise: string;
  classe: string;
  position: string;
  z: string;
  rect: { x: number; y: number; w: number; h: number };
};

export type ReleveFixes = {
  elements: ElementFixe[];
  /** Variables --z-* déclarées sur :root ou html (nom → valeur). */
  jetons: Record<string, string>;
  /** Éléments dont le z-index n'est pas la valeur d'un jeton. */
  sansJeton: string[];
  /** Paires d'éléments qui se chevauchent avec le MÊME z-index (l'ordre du DOM décide). */
  memeZ: string[];
};

export function releveFixes(): ReleveFixes {
  const elements: ElementFixe[] = [];
  const bruts: { el: Element; r: DOMRect; z: string }[] = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.closest("nextjs-portal")) continue;
    const cs = getComputedStyle(el);
    if ((cs.position !== "fixed" && cs.position !== "sticky") || cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    bruts.push({ el, r, z: cs.zIndex });
    elements.push({
      balise: el.tagName.toLowerCase(),
      classe: (el.getAttribute("class") ?? "").slice(0, 60),
      position: cs.position,
      z: cs.zIndex,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    });
  }

  const jetons: Record<string, string> = {};
  const lire = (regles: CSSRuleList) => {
    for (const regle of regles) {
      const r = regle as CSSStyleRule & { cssRules?: CSSRuleList };
      if (r.selectorText && /(^|,)\s*(:root|html)\b/.test(r.selectorText)) {
        for (const nom of r.style) if (nom.startsWith("--z")) jetons[nom] = r.style.getPropertyValue(nom).trim();
      }
      if (r.cssRules) lire(r.cssRules);
    }
  };
  for (const feuille of document.styleSheets) {
    try {
      lire(feuille.cssRules);
    } catch {
      /* feuille d'une autre origine */
    }
  }
  const valeursJetons = new Set(Object.values(jetons));

  const sansJeton = elements.filter((e) => !valeursJetons.has(e.z)).map((e) => `${e.balise}.${e.classe.split(" ")[0] ?? ""} z=${e.z}`);

  const memeZ: string[] = [];
  for (let i = 0; i < bruts.length; i++) {
    for (let j = i + 1; j < bruts.length; j++) {
      const a = bruts[i];
      const b = bruts[j];
      if (a.z !== b.z || a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ix > 0 && iy > 0) {
        memeZ.push(`${elements[i].balise}.${elements[i].classe.split(" ")[0] ?? ""} / ${elements[j].balise}.${elements[j].classe.split(" ")[0] ?? ""} z=${a.z}`);
      }
    }
  }
  return { elements, jetons, sansJeton, memeZ };
}

export type ChampMesure = { nom: string; taille: number };

export function releveChamps(): ChampMesure[] {
  const champs = document.querySelectorAll(
    "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=submit]):not([type=button]), select, textarea",
  );
  return [...champs]
    .filter((e) => !e.closest("nextjs-portal") && e.getClientRects().length > 0)
    .map((e) => {
      const f = e as HTMLInputElement;
      return {
        nom: f.name || f.getAttribute("aria-label") || f.placeholder || f.tagName.toLowerCase(),
        taille: parseFloat(getComputedStyle(e).fontSize),
      };
    });
}
