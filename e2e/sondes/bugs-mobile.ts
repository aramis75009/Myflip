/**
 * Mobile : MO1 (champs sous 16 px, iOS zoome au focus), MO2 (barres fixes qui
 * chevauchent le dock, zone sûre ignorée), MO3 (toasts clairs en sombre),
 * MO4 (barre de défilement claire en sombre), plus X9 (dock qui défile).
 */
import { arrondi, contraste, lireCouleur, luminance } from "./couleurs";
import { DESKTOP, etape, MOBILE_CLAIR, type MesureSonde, type Sonde, TOUS } from "./harness";
import { type ChampMesure, releveChamps } from "./mesures";
import { aller } from "./pages";
import { decoderPng, luminanceMax, pixel } from "./png";

const resumeChamps = (champs: ChampMesure[]) => {
  const sous16 = champs.filter((c) => c.taille < 16);
  return {
    champs: champs.length,
    minimum: champs.length ? arrondi(Math.min(...champs.map((c) => c.taille))) : null,
    sous16: sous16.length,
    exemples: sous16.slice(0, 6),
  };
};

export const SONDES_MOBILE: readonly Sonde[] = [
  {
    id: "MO1",
    titre: "Champs sous 16 px (iOS zoome au focus)",
    route: "/login, /signup, /reset-password",
    critere: "Aucun champ de saisie sous 16 px à 390 px, sur chaque route et dans chaque modale : minimum >= 16.",
    projets: MOBILE_CLAIR,
    compte: "aucun",
    executer: async (page) => {
      const sorties: MesureSonde[] = [];
      for (const chemin of ["/login", "/signup", "/reset-password"]) {
        sorties.push(
          ...(await etape(chemin, async () => {
            await aller(page, chemin, { repere: "form" });
            const r = resumeChamps(await page.evaluate(releveChamps));
            return { route: chemin, mesure: r, corrige: r.champs > 0 ? r.sous16 === 0 : null };
          })),
        );
      }
      return sorties;
    },
  },

  {
    id: "MO1",
    titre: "Champs sous 16 px (iOS zoome au focus)",
    route: "/stock, /compte, modales et assistant",
    critere: "Aucun champ de saisie sous 16 px à 390 px, sur chaque route et dans chaque modale : minimum >= 16.",
    projets: MOBILE_CLAIR,
    compte: "demo",
    delaiMs: 240_000,
    executer: async (page, ctx) => {
      const sorties: MesureSonde[] = [];
      const mesurer = async (route: string, suffixe: string | null = null): Promise<void> => {
        const r = resumeChamps(await page.evaluate(releveChamps));
        sorties.push({ route, mesure: r, corrige: r.champs > 0 ? r.sous16 === 0 : null, capture: suffixe ? await ctx.capturer(undefined, suffixe) : undefined });
      };

      const etapes: [string, () => Promise<void>][] = [
        [
          "/stock",
          async () => {
            await aller(page, "/stock", { repere: "main" });
            await mesurer("/stock");
          },
        ],
        [
          "/compte",
          async () => {
            await aller(page, "/compte", { repere: "main" });
            await mesurer("/compte");
          },
        ],
        [
          "/parametres (modale Nouveau prompt)",
          async () => {
            await aller(page, "/parametres", { repere: "main" });
            await page.getByRole("button", { name: "Nouveau prompt" }).first().click();
            await page.locator("[role=dialog]").first().waitFor({ state: "visible" });
            await mesurer("/parametres (modale Nouveau prompt)", "prompt");
          },
        ],
        [
          "/a-comptabiliser (fenêtre Vendre)",
          async () => {
            await aller(page, "/a-comptabiliser", { repere: "text=PIS4 >> visible=true" });
            await page.getByRole("button", { name: "Valider", exact: true }).first().click();
            await page.locator("form").filter({ hasText: /Vendre/ }).first().waitFor({ state: "visible" });
            await mesurer("/a-comptabiliser (fenêtre Vendre)", "vente");
          },
        ],
        [
          "/commandes (modale Créer une commande)",
          async () => {
            await aller(page, "/commandes", { repere: "main" });
            await page.getByRole("button", { name: "Créer une commande" }).first().click();
            await page.locator("[role=dialog]").first().waitFor({ state: "visible" });
            await mesurer("/commandes (modale Créer une commande)", "commande");
          },
        ],
        [
          "/dashboard (assistant IA ouvert)",
          async () => {
            await aller(page, "/dashboard", { repere: "text=Bonjour" });
            await page.getByRole("button", { name: "Ouvrir l'assistant IA" }).click();
            await page.locator("textarea, input[type=text], input:not([type])").last().waitFor({ state: "visible" });
            await mesurer("/dashboard (assistant IA ouvert)", "assistant");
          },
        ],
      ];
      for (const [route, faire] of etapes) {
        const avant = sorties.length;
        const erreurs = await etape(route, async () => {
          await faire();
          return [];
        });
        // `etape` ne rend que l'erreur éventuelle : les mesures ont déjà été poussées par `mesurer`.
        if (sorties.length === avant) sorties.push(...erreurs);
      }
      return sorties;
    },
  },

  {
    id: "MO2",
    titre: "Barres fixes qui chevauchent le dock (zone sûre ignorée)",
    route: "/mise-en-vente, /stock, bulle du chat",
    critere: "À 390 px, à zone sûre 0 comme à 34 px, aucune barre fixe (barre de Mise en vente, barre groupée du Stock, bulle du chat) ne chevauche le dock : chevauche = 0 pour chacune.",
    projets: MOBILE_CLAIR,
    compte: "demo",
    delaiMs: 240_000,
    executer: async (page, ctx) => {
      const cdp = await page.context().newCDPSession(page);
      let zoneSure = true;
      const poserZoneSure = async (bas: number): Promise<void> => {
        try {
          await cdp.send("Emulation.setSafeAreaInsetsOverride", {
            insets: { top: bas ? 47 : 0, topMax: bas ? 47 : 0, bottom: bas, bottomMax: bas, left: 0, leftMax: 0, right: 0, rightMax: 0 },
          });
        } catch {
          zoneSure = false;
        }
      };
      const releve = () =>
        page.evaluate(() => {
          const dock = [...document.querySelectorAll("nav")].find((n) => {
            const cs = getComputedStyle(n);
            return cs.position === "fixed" && cs.display !== "none" && n.getBoundingClientRect().bottom >= innerHeight - 1;
          });
          if (!dock) return null;
          const d = dock.getBoundingClientRect();
          const barres = [...document.querySelectorAll("body *")]
            .filter((e) => {
              if (getComputedStyle(e).position !== "fixed" || e === dock || dock.contains(e) || !e.getClientRects().length) return false;
              const r = e.getBoundingClientRect();
              return r.height < innerHeight / 2 && r.width > 0;
            })
            .map((e) => {
              const r = e.getBoundingClientRect();
              return {
                barre: `${e.tagName.toLowerCase()}.${(e.getAttribute("class") ?? "").split(" ").slice(0, 3).join(".")}`.slice(0, 70),
                chevauche: Math.max(0, Math.round(r.bottom - d.top)),
                ecart: Math.round(d.top - r.bottom),
              };
            });
          return { dockH: Math.round(d.height), barres };
        });

      const sorties: MesureSonde[] = [];
      const pages: { route: string; preparer: () => Promise<void> }[] = [
        { route: "/mise-en-vente", preparer: async () => void (await aller(page, "/mise-en-vente", { repere: "button:has-text('Continuer')" })) },
        {
          route: "/stock (une ligne cochée)",
          preparer: async () => {
            await aller(page, "/stock", { repere: "input[type=checkbox][aria-label^='Sélectionner ']" });
            await page.locator("input[type=checkbox][aria-label^='Sélectionner ']").first().check();
            await page.getByRole("button", { name: "Annuler la sélection" }).waitFor({ state: "visible" });
            await page.waitForTimeout(400);
          },
        },
        { route: "/dashboard (bulle du chat)", preparer: async () => void (await aller(page, "/dashboard", { repere: "text=Bonjour" })) },
      ];
      for (const p of pages) {
        sorties.push(
          ...(await etape(p.route, async () => {
            await poserZoneSure(0);
            await p.preparer();
            const a0 = await releve();
            await poserZoneSure(34);
            await page.waitForTimeout(300);
            const a34 = await releve();
            const capture = await ctx.capturer({ x: 0, y: (page.viewportSize()?.height ?? 844) - 220, width: 390, height: 220 }, p.route.replace(/\W+/g, ""));
            const chevauche = [...(a0?.barres ?? []), ...(a34?.barres ?? [])].some((b) => b.chevauche > 0);
            // Sans l'émulation, on retombe sur la règle de l'étude : un écart d'au moins 34 px au-dessus du dock à zone sûre 0.
            const ecartSuffisant = (a0?.barres ?? []).every((b) => b.ecart >= 34);
            return {
              route: p.route,
              mesure: { zoneSureEmulee: zoneSure, zoneSure0: a0, zoneSure34: zoneSure ? a34 : null },
              corrige: a0 === null ? null : zoneSure ? !chevauche : ecartSuffisant,
              capture,
            };
          })),
        );
      }
      await cdp.detach().catch(() => undefined);
      return sorties;
    },
  },

  {
    id: "MO3",
    titre: "Les toasts restent clairs en mode sombre",
    route: "/commandes (toast « Import Excel », sans réseau)",
    critere:
      "Le toast suit le thème (theme = 'dark' ou fond sombre en thème sombre), utilise la police de l'app, et ne recouvre ni la bulle du chat (surChat = 0) ni le dock (surDock = 0).",
    projets: TOUS,
    compte: "demo",
    executer: async (page, ctx) => {
      // L'étude proposait /compte?trello=ok, mais ce toast est lancé avant que le <Toaster> ne soit abonné et se perd
      // (voir X15). Le bouton « Importer un fichier Excel » de /commandes donne un toast sans aucun appel réseau.
      await aller(page, "/commandes", { repere: "main" });
      await page.getByRole("button", { name: "Importer un fichier Excel" }).first().click();
      await page.locator("[data-sonner-toast]").first().waitFor({ state: "visible", timeout: 20_000 });
      await page.waitForTimeout(700);
      const m = await page.evaluate(() => {
        const t = document.querySelector("[data-sonner-toast]");
        if (!t) return null;
        const ol = t.closest("[data-sonner-toaster]") as HTMLElement | null;
        const r = t.getBoundingClientRect();
        const chat = document.querySelector("button[aria-label^='Ouvrir l']")?.getBoundingClientRect();
        const dock = [...document.querySelectorAll("nav")].find((n) => {
          const cs = getComputedStyle(n);
          return cs.position === "fixed" && cs.display !== "none" && n.getBoundingClientRect().bottom >= innerHeight - 1;
        })?.getBoundingClientRect();
        const inter = (a: DOMRect, b?: DOMRect) => (b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0);
        return {
          theme: ol?.dataset.sonnerTheme ?? null,
          fond: getComputedStyle(t).backgroundColor,
          police: getComputedStyle(t).fontFamily,
          policeApp: getComputedStyle(document.body).fontFamily,
          schemeHtml: getComputedStyle(document.documentElement).colorScheme,
          texte: (t.textContent ?? "").trim().slice(0, 40),
          surChat: Math.round(inter(r, chat)),
          surDock: Math.round(inter(r, dock)),
        };
      });
      if (!m) return { mesure: { erreur: "Aucun toast affiché." }, corrige: null };
      const fond = lireCouleur(m.fond);
      const fondSombre = fond ? luminance(fond) < 0.2 : null;
      const premiereFamille = (f: string) => f.split(",")[0].trim().replace(/["']/g, "").toLowerCase();
      const policeDeLApp = premiereFamille(m.police) === premiereFamille(m.policeApp);
      const suitLeTheme = ctx.sombre ? m.theme === "dark" || fondSombre === true : true;
      return {
        mesure: { ...m, fondSombre, policeDeLApp, suitLeTheme },
        corrige: suitLeTheme && policeDeLApp && m.surChat === 0 && m.surDock === 0,
        capture: await ctx.capturer(page.locator("[data-sonner-toast]").first(), undefined, 24),
      };
    },
  },

  {
    id: "MO4",
    titre: "La barre de défilement reste claire en mode sombre",
    route: "/stock (page longue)",
    critere:
      "Le pouce de la barre de défilement a un contraste >= 1,5:1 avec le fond, et en thème sombre sa luminance reste <= 0,6 (aucun pixel plus clair dans la bande de la barre).",
    projets: DESKTOP,
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/stock", { repere: "main" });
      const css = await page.evaluate(() => {
        const racine = document.documentElement;
        const regles = [...document.styleSheets]
          .flatMap((s) => {
            try {
              return [...s.cssRules];
            } catch {
              return [];
            }
          })
          .filter((r) => ((r as CSSStyleRule).selectorText ?? "").includes("::-webkit-scrollbar-thumb"))
          .map((r) => `${(r as CSSStyleRule).selectorText} -> ${(r as CSSStyleRule).style.backgroundColor || (r as CSSStyleRule).style.background}`);
        let pouceCalcule: string | null = null;
        try {
          pouceCalcule = getComputedStyle(racine, "::-webkit-scrollbar-thumb").backgroundColor;
        } catch {
          pouceCalcule = null;
        }
        return {
          regles,
          pouceCalcule,
          scrollbarColor: getComputedStyle(racine).scrollbarColor,
          scheme: getComputedStyle(racine).colorScheme,
          fond: getComputedStyle(document.body).backgroundColor,
          largeur: window.innerWidth,
          barre: window.innerWidth - racine.clientWidth,
          defilable: racine.scrollHeight > window.innerHeight,
        };
      });
      const taille = page.viewportSize() ?? { width: 1440, height: 900 };
      let bande: { luminanceMax: number; couleursDistinctes: number } | null = null;
      if (css.barre > 0) {
        const png = await page.screenshot({
          clip: { x: taille.width - css.barre, y: 0, width: css.barre, height: taille.height },
          scale: "css",
          animations: "disabled",
          caret: "hide",
          style: "nextjs-portal { display: none !important; }",
        });
        const img = decoderPng(png);
        const couleurs = new Set<string>();
        for (let y = 0; y < img.hauteur; y += 2) for (let x = 0; x < img.largeur; x++) couleurs.add(pixel(img, x, y).join(","));
        bande = { luminanceMax: arrondi(luminanceMax(img), 3) ?? 0, couleursDistinctes: couleurs.size };
      }
      // Pouce : couleur calculée si DevTools la rend, sinon la première règle, sinon scrollbar-color.
      const couleurScrollbarColor = css.scrollbarColor !== "auto" ? css.scrollbarColor.split(/\s(?=rgb|color|#)/)[0] : null;
      const pouce = css.pouceCalcule && css.pouceCalcule !== "rgba(0, 0, 0, 0)" ? css.pouceCalcule : couleurScrollbarColor ?? css.regles[0]?.split("-> ")[1] ?? null;
      const rPouce = lireCouleur(pouce);
      const ratioPouce = rPouce ? contraste(pouce, css.fond) : null;
      const lumPouce = rPouce ? luminance(rPouce) : null;
      const capture = await ctx.capturer({ x: taille.width - 80, y: 0, width: 80, height: Math.min(taille.height, 300) }, undefined, 0);
      let corrige: boolean | null = null;
      if (ratioPouce !== null) {
        const pixelsOk = !ctx.sombre || bande === null || bande.luminanceMax <= 0.6;
        corrige = ratioPouce >= 1.5 && (!ctx.sombre || (lumPouce !== null && lumPouce <= 0.6)) && pixelsOk;
      }
      return {
        mesure: { ...css, pouce, contrastePouceFond: arrondi(ratioPouce), luminancePouce: arrondi(lumPouce, 3), bande },
        corrige,
        capture,
      };
    },
  },

  {
    id: "X9",
    titre: "Le dock mobile défile horizontalement",
    route: "/dashboard (dock, 390 px)",
    critere: "Le dock tient dans la largeur : scrollW = clientW (aucune entrée hors écran), avec un menu « Plus » pour le reste.",
    projets: MOBILE_CLAIR,
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/dashboard", { repere: "text=Bonjour" });
      const m = await page.evaluate(() => {
        const n = [...document.querySelectorAll("nav")].find((x) => getComputedStyle(x).position === "fixed" && getComputedStyle(x).display !== "none");
        if (!n) return null;
        return {
          scrollW: n.scrollWidth,
          clientW: n.clientWidth,
          entrees: n.children.length,
          horsEcran: [...n.children].filter((c) => c.getBoundingClientRect().right > innerWidth + 1).map((c) => (c.textContent ?? "").trim()),
          menuPlus: [...n.children].some((c) => /^plus$/i.test((c.textContent ?? "").trim())),
        };
      });
      if (!m) return { mesure: { erreur: "Dock introuvable." }, corrige: null };
      return { mesure: m, corrige: m.scrollW <= m.clientW && m.menuPlus, capture: await ctx.capturer(page.locator("nav").last()) };
    },
  },
];
