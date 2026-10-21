/**
 * Opacités sans effet : O1 (voile des modales), O2 (barres collantes de Mise en
 * vente et de la landing), O3 (overlay et bouton X de Mise en vente).
 * Cause commune : Tailwind ne génère aucune classe d'opacité (`bg-ink/30`,
 * `bg-surface/95`, `bg-[var(--ink)]/80`) sur une couleur définie par `var()`.
 */
import type { Page } from "@playwright/test";

import { alpha, arrondi, contraste, lireCouleur } from "./couleurs";
import { DESKTOP, type MesureSonde, type Sonde, TOUS } from "./harness";
import { aller, attendreStable } from "./pages";
import { decoderPng, luminancePixel, pixel } from "./png";
import { ouvrirEtapeDeux } from "./vente";

/** Luminance du pixel (x, y) de la fenêtre, lue dans une capture de 1×1 pixel CSS. */
export async function luminanceDuPixel(page: Page, x: number, y: number): Promise<number> {
  const png = await page.screenshot({ clip: { x, y, width: 2, height: 2 }, scale: "css", animations: "disabled", caret: "hide", style: "nextjs-portal { display: none !important; }" });
  return luminancePixel(pixel(decoderPng(png), 0, 0));
}

/**
 * Règles générées vs classes d'opacité présentes dans le DOM : liste des classes
 * `bg|text|border|ring-…/NN` qu'aucune règle CSS ne définit (donc sans effet).
 */
export async function classesOpaciteMortes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selecteurs = new Set<string>();
    const ajouter = (r: CSSRule) => {
      const regle = r as CSSStyleRule & { cssRules?: CSSRuleList };
      if (regle.selectorText) selecteurs.add(regle.selectorText);
      if (regle.cssRules) [...regle.cssRules].forEach(ajouter);
    };
    for (const feuille of document.styleSheets) {
      try {
        [...feuille.cssRules].forEach(ajouter);
      } catch {
        /* feuille d'une autre origine */
      }
    }
    const tout = [...selecteurs].join(" ");
    const manquantes = new Set<string>();
    document.querySelectorAll("[class]").forEach((e) => {
      const classes = (e.getAttribute("class") ?? "").split(/\s+/);
      for (const c of classes) {
        if (/(bg|text|border|ring)-.*[/][0-9]+$/.test(c) && !tout.includes(CSS.escape(c))) manquantes.add(c);
      }
    });
    return [...manquantes].sort();
  });
}

export const SONDES_OPACITES: readonly Sonde[] = [
  {
    id: "O1",
    titre: "Aucun voile derrière les modales",
    route: "/parametres (modale « Nouveau prompt »)",
    critere: "Le voile de la modale est visible dans les deux thèmes : alpha de son fond >= 0,3 ET le pixel de la page derrière est assombri d'au moins 15 % de luminance une fois la modale ouverte.",
    projets: TOUS,
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/parametres", { repere: "main" });
      const y = Math.floor((page.viewportSize()?.height ?? 900) / 2);
      const avant = await luminanceDuPixel(page, 4, y);

      await page.getByRole("button", { name: "Nouveau prompt" }).first().click();
      await page.locator("[role=dialog]").first().waitFor({ state: "visible" });
      await page.waitForTimeout(400);
      const apres = await luminanceDuPixel(page, 4, y);

      const dom = await page.evaluate(() => {
        const d = document.querySelector("[role=dialog]");
        let el: Element | null = d;
        while (el && getComputedStyle(el).position !== "fixed") el = el.parentElement;
        const coin = document.elementFromPoint(4, innerHeight - 4);
        return {
          voile: el ? getComputedStyle(el).backgroundColor : null,
          coin: coin ? getComputedStyle(coin).backgroundColor : null,
          regleCss: [...document.styleSheets]
            .flatMap((s) => {
              try {
                return [...s.cssRules];
              } catch {
                return [];
              }
            })
            .some((r) => ((r as CSSStyleRule).selectorText ?? "").includes("bg-ink")),
        };
      });
      const alphaVoile = alpha(dom.voile);
      const assombrissement = avant > 0 ? 1 - apres / avant : 0;
      const capture = await ctx.capturer();
      return {
        mesure: {
          voile: dom.voile,
          alphaVoile,
          coin: dom.coin,
          regleCss: dom.regleCss,
          luminanceAvant: arrondi(avant, 4),
          luminanceApres: arrondi(apres, 4),
          assombrissement: arrondi(assombrissement, 3),
        },
        corrige: alphaVoile !== null && alphaVoile >= 0.3 && assombrissement >= 0.15,
        capture,
      };
    },
  },

  {
    id: "O2",
    titre: "La barre collante de Mise en vente est transparente",
    route: "/mise-en-vente (barre d'actions)",
    critere: "Le fond de la barre d'actions est quasi opaque : alpha >= 0,9.",
    projets: TOUS,
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/mise-en-vente", { repere: "button:has-text('Continuer')" });
      const dom = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /^Continuer/.test((x.textContent ?? "").trim()));
        let el: Element | null = b ?? null;
        while (el && !["fixed", "sticky"].includes(getComputedStyle(el).position)) el = el.parentElement;
        if (!el) return null;
        return { fond: getComputedStyle(el).backgroundColor, flou: getComputedStyle(el).backdropFilter, classe: (el.getAttribute("class") ?? "").slice(0, 80) };
      });
      if (!dom) return { mesure: { erreur: "Barre introuvable." }, corrige: null };
      const a = alpha(dom.fond);
      const capture = await ctx.capturer(page.locator("div.fixed", { has: page.getByRole("button", { name: /^Continuer/ }) }).first());
      return { mesure: { ...dom, alpha: a }, corrige: a !== null && a >= 0.9, capture };
    },
  },

  {
    id: "O2",
    titre: "L'en-tête collant de la landing est transparent",
    route: "/ (landing, sans session)",
    critere: "Le fond de l'en-tête collant est opaque à 85 % au moins (alpha >= 0,85) et le texte de la barre garde un contraste >= 4,5:1.",
    projets: TOUS,
    compte: "aucun",
    executer: async (page, ctx) => {
      await aller(page, "/", { repere: "h1" });
      await page.evaluate(() => window.scrollTo(0, 1200));
      await page.waitForTimeout(300);
      const dom = await page.evaluate(() => {
        const h = [...document.querySelectorAll("header")].find((x) => getComputedStyle(x).position === "sticky");
        if (!h) return null;
        const lien = h.querySelector("a, button");
        return {
          fond: getComputedStyle(h).backgroundColor,
          flou: getComputedStyle(h).backdropFilter,
          texte: lien ? getComputedStyle(lien).color : null,
          fondPage: getComputedStyle(document.body).backgroundColor,
          haut: Math.round(h.getBoundingClientRect().top),
        };
      });
      if (!dom) return { mesure: { erreur: "En-tête collant introuvable." }, corrige: null };
      const a = alpha(dom.fond);
      const fondEffectif = lireCouleur(dom.fondPage);
      const c = contraste(dom.texte, fondEffectif && a !== null && a > 0 ? dom.fond : dom.fondPage);
      const capture = await ctx.capturer(page.locator("header").first());
      return { mesure: { ...dom, alpha: a, contraste: arrondi(c) }, corrige: a !== null && a >= 0.85 && (c === null || c >= 4.5), capture };
    },
  },

  {
    id: "O3",
    titre: "L'overlay du zoom photo et le bouton X sont invisibles",
    route: "/mise-en-vente (étape 2, photo ajoutée)",
    critere:
      "Overlay du zoom : alpha >= 0,6. Bouton X « Supprimer la photo » : fond opaque, ou alpha >= 0,5 avec un contraste icône/fond >= 3:1. Balayage des classes d'opacité sans règle CSS : liste vide.",
    projets: DESKTOP,
    compte: "sonde",
    delaiMs: 240_000,
    executer: async (page, ctx) => {
      await ouvrirEtapeDeux(page);
      const bouton = await page.evaluate(() => {
        const b = document.querySelector("button[aria-label='Supprimer la photo 1']");
        if (!b) return null;
        const cs = getComputedStyle(b);
        const icone = b.querySelector("svg");
        return { fond: cs.backgroundColor, icone: icone ? getComputedStyle(icone).color : cs.color };
      });
      const balayage = await classesOpaciteMortes(page);
      const capturePhoto = await ctx.capturer(page.locator("button[aria-label='Supprimer la photo 1']").locator(".."), "bouton-x");

      await page.locator("button[aria-label='Agrandir la photo 1']").click();
      await page.waitForTimeout(400);
      const overlay = await page.evaluate(() => {
        const hit = document.elementFromPoint(8, innerHeight / 2);
        return hit ? getComputedStyle(hit).backgroundColor : null;
      });
      const capture = await ctx.capturer(undefined, "overlay");

      const aOverlay = alpha(overlay);
      const aBouton = alpha(bouton?.fond);
      const cBouton = bouton ? contraste(bouton.icone, bouton.fond) : null;
      const boutonOk = aBouton !== null && (aBouton >= 1 || (aBouton >= 0.5 && cBouton !== null && cBouton >= 3));
      const sorties: MesureSonde[] = [
        {
          mesure: { overlay, alphaOverlay: aOverlay, boutonX: bouton, alphaBouton: aBouton, contrasteIconeBouton: arrondi(cBouton), classesSansRegle: balayage },
          corrige: aOverlay !== null && aOverlay >= 0.6 && boutonOk && balayage.length === 0,
          capture: capture ?? capturePhoto,
        },
      ];
      return sorties;
    },
  },
];
