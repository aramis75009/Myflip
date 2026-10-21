/**
 * Menu et cadre : M1 (entrée active du menu blanche sur blanc au premier
 * affichage), M2 (barre de défilement inutile, min-h-screen doublé), M3 (z-index),
 * plus les relevés X3 (barre de Mise en vente sur le pied de la sidebar), X4
 * (indicateur actif décalé après repli) et X5 (carte photos sous la barre du haut).
 */
import type { Page } from "@playwright/test";

import { alpha, arrondi, contraste } from "./couleurs";
import { DESKTOP, DESKTOP_CLAIR, etape, MOBILE_CLAIR, type MesureSonde, type Sonde, TOUS } from "./harness";
import { releveDebordements, releveFixes } from "./mesures";
import { aller, attendreStable } from "./pages";
import { ouvrirEtapeDeux } from "./vente";

/** Seuil au-delà duquel l'espace vide sous un contenu court n'est plus du padding (voir G4). */
const SEUIL_VIDE = 150;

const lienMentionsAtteignable = (page: Page) =>
  page.evaluate(() => {
    const a = document.querySelector("aside a[href='/legal/mentions-legales']");
    if (!a) return null;
    const r = a.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { atteignable: h === a || a.contains(h), depuisLeBas: Math.round(innerHeight - r.top), couvertPar: h && h !== a && !a.contains(h) ? `${h.tagName.toLowerCase()}.${(h.getAttribute("class") ?? "").split(" ")[0]}` : null };
  });

export const SONDES_CADRE: readonly Sonde[] = [
  {
    id: "M1",
    titre: "Entrée active du menu blanche sur blanc au premier affichage",
    route: "/dashboard, /stock, /studio (HTML serveur, sans hydratation)",
    critere:
      "Au premier affichage, avant toute hydratation : le texte du lien actif a un contraste >= 4,5:1 sur son fond, et un marqueur actif existe déjà dans le HTML serveur avec un contraste >= 3:1 contre l'aside.",
    projets: DESKTOP,
    compte: "demo",
    delaiMs: 240_000,
    executer: async (page, ctx) => {
      const sorties: MesureSonde[] = [];
      for (const chemin of ["/dashboard", "/stock", "/studio"]) {
        sorties.push(
          ...(await etape(chemin, async () => {
            // Aucun script de l'app ne tourne : on voit le HTML rendu par le serveur. Le script inline du thème, lui, s'exécute.
            await page.route("**/_next/static/chunks/**", (r) => r.abort());
            try {
              await page.goto(chemin, { waitUntil: "domcontentloaded", timeout: 120_000 });
              await page.locator("aside a[data-active=true]").first().waitFor({ state: "attached", timeout: 90_000 });
              await page.waitForTimeout(300);
              const m = await page.evaluate(() => {
                const a = document.querySelector("aside a[data-active=true]");
                if (!a) return null;
                const ind = a.parentElement?.querySelector(":scope > span[aria-hidden]") ?? null;
                const fondDe = (e: Element | null): string | null => {
                  for (; e; e = e.parentElement) {
                    const c = getComputedStyle(e).backgroundColor;
                    if (c !== "rgba(0, 0, 0, 0)") return c;
                  }
                  return null;
                };
                const aside = document.querySelector("aside");
                return {
                  fg: getComputedStyle(a).color,
                  fondEffectif: ind ? getComputedStyle(ind).backgroundColor : fondDe(a),
                  indicateur: !!ind,
                  fondAside: fondDe(aside),
                  fondPropre: getComputedStyle(a).backgroundColor,
                };
              });
              if (!m) return { route: chemin, mesure: { erreur: "Lien actif introuvable dans le HTML serveur." }, corrige: null };
              const ratioTexte = contraste(m.fg, m.fondEffectif);
              const marqueurFond = m.indicateur ? m.fondEffectif : m.fondPropre !== "rgba(0, 0, 0, 0)" ? m.fondPropre : null;
              const ratioMarqueur = marqueurFond ? contraste(marqueurFond, m.fondAside) : null;
              const capture = await ctx.capturer(page.locator("aside nav").first(), chemin.replace(/\W+/g, "") || "racine");
              return {
                route: chemin,
                mesure: { ...m, contrasteTexte: arrondi(ratioTexte), contrasteMarqueur: arrondi(ratioMarqueur) },
                corrige: ratioTexte !== null && ratioTexte >= 4.5 && ratioMarqueur !== null && ratioMarqueur >= 3,
                capture,
              };
            } finally {
              await page.unrouteAll({ behavior: "ignoreErrors" });
            }
          })),
        );
      }
      return sorties;
    },
  },

  {
    id: "M2",
    titre: "Barre de défilement inutile, min-h-screen appliqué deux fois",
    route: "404 et /studio",
    critere: "Une page courte ne défile pas (debordV <= 0), et au plus un élément est en hauteur pleine (pleineHauteur <= 1, de préférence en dvh).",
    projets: TOUS,
    compte: "demo",
    executer: async (page, ctx) => {
      const sorties: MesureSonde[] = [];
      for (const [chemin, repere] of [
        ["/route-inexistante-sonde", "text=404"],
        ["/studio", "main"],
      ] as const) {
        sorties.push(
          ...(await etape(chemin, async () => {
            await aller(page, chemin, { repere });
            const d = await page.evaluate(releveDebordements);
            const parasite = d.debordV > 0 && d.videEnBas > SEUIL_VIDE;
            return {
              route: chemin,
              mesure: { ...d, parasite },
              corrige: d.pleineHauteur.length <= 1 && !parasite && d.debordH <= 0,
              capture: await ctx.capturer(undefined, chemin.replace(/\W+/g, "") || "racine"),
            };
          })),
        );
      }
      return sorties;
    },
  },

  {
    id: "M2",
    titre: "Barre de défilement inutile, min-h-screen appliqué deux fois",
    route: "/a-comptabiliser (liste vide)",
    critere: "Une page courte ne défile pas (debordV <= 0), et au plus un élément est en hauteur pleine (pleineHauteur <= 1, de préférence en dvh).",
    projets: TOUS,
    compte: "neuf",
    executer: async (page, ctx) => {
      await aller(page, "/a-comptabiliser", { repere: "main" });
      const d = await page.evaluate(releveDebordements);
      const parasite = d.debordV > 0 && d.videEnBas > SEUIL_VIDE;
      return {
        mesure: { ...d, parasite },
        corrige: d.pleineHauteur.length <= 1 && !parasite && d.debordH <= 0,
        capture: await ctx.capturer(),
      };
    },
  },

  {
    id: "M3",
    titre: "Cinq éléments au même z-index",
    route: "/mise-en-vente",
    critere:
      "Chaque z-index d'élément fixed/sticky vaut un jeton nommé (variable --z-* sur :root), deux éléments visibles qui se chevauchent n'ont jamais le même z, et le lien MENTIONS de la sidebar est atteignable (desktop).",
    projets: [...DESKTOP_CLAIR, ...MOBILE_CLAIR],
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/mise-en-vente", { repere: "button:has-text('Continuer')" });
      const f = await page.evaluate(releveFixes);
      const mentions = ctx.mobile ? null : await lienMentionsAtteignable(page);
      const parZ: Record<string, number> = {};
      for (const e of f.elements) parZ[e.z] = (parZ[e.z] ?? 0) + 1;
      const partages = Object.fromEntries(Object.entries(parZ).filter(([, n]) => n > 1));
      return {
        mesure: { elements: f.elements, nbParZ: parZ, zPartages: partages, jetons: f.jetons, sansJeton: f.sansJeton, memeZ: f.memeZ, lienMentions: mentions },
        corrige:
          Object.keys(f.jetons).length > 0 &&
          f.sansJeton.length === 0 &&
          f.memeZ.length === 0 &&
          (mentions === null || mentions.atteignable),
        capture: await ctx.capturer(),
      };
    },
  },

  {
    id: "M3",
    titre: "Cinq éléments au même z-index",
    route: "/commandes (menu ⋯ ouvert)",
    critere: "Le voile du menu ⋯ et les autres éléments fixes ont un z-index qui est la valeur d'un jeton nommé (--z-*) ; aucun recouvrement à z égal.",
    projets: DESKTOP_CLAIR,
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/commandes", { repere: "button[aria-label='Actions']" });
      await page.locator("button[aria-label='Actions']").first().click();
      await page.waitForTimeout(300);
      const f = await page.evaluate(releveFixes);
      const parZ: Record<string, number> = {};
      for (const e of f.elements) parZ[e.z] = (parZ[e.z] ?? 0) + 1;
      return {
        mesure: { elements: f.elements, nbParZ: parZ, jetons: f.jetons, sansJeton: f.sansJeton, memeZ: f.memeZ },
        corrige: Object.keys(f.jetons).length > 0 && f.sansJeton.length === 0 && f.memeZ.length === 0,
        capture: await ctx.capturer(),
      };
    },
  },

  {
    id: "X3",
    titre: "La barre de Mise en vente recouvre le pied de la sidebar",
    route: "/mise-en-vente",
    critere: "Le lien MENTIONS du pied de sidebar est atteignable : le point central du lien reçoit le clic du lien lui-même, pas la barre d'actions.",
    projets: DESKTOP,
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/mise-en-vente", { repere: "button:has-text('Continuer')" });
      const m = await lienMentionsAtteignable(page);
      if (!m) return { mesure: { erreur: "Lien MENTIONS introuvable ou masqué." }, corrige: null };
      return { mesure: m, corrige: m.atteignable, capture: await ctx.capturer(page.locator("aside").first()) };
    },
  },

  {
    id: "X4",
    titre: "L'indicateur actif est décalé après repli de la sidebar",
    route: "/statistiques (menu replié puis déplié)",
    critere: "Après un repli comme après un nouveau dépliage, l'indicateur actif colle à l'entrée active : dTop = 0 et dH = 0.",
    projets: DESKTOP_CLAIR,
    compte: "demo",
    executer: async (page, ctx) => {
      // Lot LS : le menu n'a plus d'indicateur mesuré, le lien actif porte lui-même son fond
      // (`aside a[data-active=true]`). L'« indicateur » est `aside nav > span[aria-hidden]` s'il existe,
      // sinon le lien actif : dTop = dH = 0 par construction, et le verdict repose alors sur son fond
      // (opaque, et à 3:1 au moins de celui de l'aside), sinon l'entrée active ne se verrait pas.
      await aller(page, "/statistiques", { repere: "aside a[data-active=true]" });
      const ecart = () =>
        page.evaluate(() => {
          const lien = document.querySelector("aside a[data-active=true]");
          const span = document.querySelector("aside nav > span[aria-hidden]");
          const indicateur = span ?? lien;
          if (!lien || !indicateur) return null;
          const a = lien.getBoundingClientRect();
          const i = indicateur.getBoundingClientRect();
          return {
            indicateur: span ? "span[aria-hidden]" : "lien actif",
            dTop: Math.round(i.top - a.top),
            dH: Math.round(i.height - a.height),
            fond: getComputedStyle(indicateur).backgroundColor,
            fondAside: getComputedStyle(document.querySelector("aside") as Element).backgroundColor,
          };
        });
      const initial = await ecart();
      // aria-expanded n'est posé qu'une fois le menu hydraté : attendre le bouton, c'est attendre l'hydratation.
      // Repli : l'ancien bouton, repéré par son aria-label.
      const bascule = page.locator("aside button[aria-expanded], aside button[aria-label='Réduire ou agrandir le menu']").first();
      await bascule.click();
      await page.waitForTimeout(450);
      const replie = await ecart();
      const captureReplie = await ctx.capturer(page.locator("aside").first(), "replie");
      await bascule.click();
      await page.waitForTimeout(450);
      const deplie = await ecart();
      type Ecart = NonNullable<Awaited<ReturnType<typeof ecart>>>;
      const detail = (e: Ecart | null) => {
        if (e === null) return null;
        const c = contraste(e.fond, e.fondAside);
        return { ...e, alphaFond: alpha(e.fond), contrasteFond: arrondi(c) };
      };
      const ok = (e: Ecart | null): boolean | null => {
        if (e === null) return false;
        if (e.dTop !== 0 || e.dH !== 0) return false;
        if (e.indicateur === "span[aria-hidden]") return true;
        const a = alpha(e.fond);
        const c = contraste(e.fond, e.fondAside);
        if (a === null || c === null) return null;
        return a >= 1 && c >= 3;
      };
      const verdicts = [ok(replie), ok(deplie)];
      return {
        mesure: { initial: detail(initial), replie: detail(replie), deplie: detail(deplie) },
        corrige: verdicts.includes(false) ? false : verdicts.includes(null) ? null : true,
        capture: captureReplie,
      };
    },
  },

  {
    id: "X5",
    titre: "La carte photos collante glisse sous la barre du haut",
    route: "/mise-en-vente (étape 2)",
    critere: "En défilant, le haut de la carte photos collante reste sous la barre du haut : carteTop >= topbarBas.",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    delaiMs: 240_000,
    executer: async (page, ctx) => {
      await ouvrirEtapeDeux(page);
      await page.evaluate(() => window.scrollTo(0, 800));
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        // La barre du haut est un <header> (lot L2a), la carte photos un <div> : les deux sont cherchés.
        const sticky = [...document.querySelectorAll("div, header")].filter((d) => getComputedStyle(d).position === "sticky");
        const carte = sticky.find((d) => d.closest("main"));
        const barre = sticky.find((d) => !d.closest("main"));
        if (!carte || !barre) return null;
        return {
          carteTop: Math.round(carte.getBoundingClientRect().top),
          topbarBas: Math.round(barre.getBoundingClientRect().bottom),
          defilement: Math.round(window.scrollY),
          pageDefilable: document.documentElement.scrollHeight > window.innerHeight,
        };
      });
      if (!m) return { mesure: { erreur: "Carte collante ou barre du haut introuvable." }, corrige: null };
      await attendreStable(page, { stabiliseMs: 100 });
      return { mesure: { ...m, masques: Math.max(0, m.topbarBas - m.carteTop) }, corrige: m.carteTop >= m.topbarBas, capture: await ctx.capturer() };
    },
  },
];
