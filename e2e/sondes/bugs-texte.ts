/**
 * Polices et texte : F1 (police du Loader), F2 (tailles sous 10 px et 11 px),
 * F3 (le zoom texte ne suit pas). Mesures et critères : e2e/sondes/LISEZMOI.md.
 */
import { arrondi } from "./couleurs";
import { DESKTOP, DESKTOP_CLAIR, etape, type MesureSonde, type Sonde, TOUS } from "./harness";
import { releveZoomTexte, relevePolices } from "./mesures";
import { aller } from "./pages";

type PoliceRendue = { familyName: string; isCustomFont: boolean; glyphCount: number };

/** Police réellement rendue pour un élément repéré par [data-sonde], via le protocole DevTools. */
async function policesRendues(page: import("@playwright/test").Page, selecteur: string): Promise<PoliceRendue[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("DOM.enable");
    await cdp.send("CSS.enable");
    const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: selecteur });
    if (!nodeId) return [];
    const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    return fonts.map((f) => ({ familyName: f.familyName, isCustomFont: f.isCustomFont, glyphCount: f.glyphCount }));
  } finally {
    await cdp.detach().catch(() => undefined);
  }
}

export const SONDES_TEXTE: readonly Sonde[] = [
  {
    id: "F1",
    titre: "Le Loader ne s'affiche pas dans la police de l'app",
    route: "/dashboard (chargement)",
    critere:
      "Le libellé du Loader utilise la police de l'interface : sa famille déclarée est celle du corps (memeQueCorps = true, ou une variable next/font), plus aucune police en style inline hors variable (enLigneSansVariable = 0), et la police réellement rendue (DevTools) est une police web (isCustomFont = true).",
    projets: DESKTOP,
    compte: "demo",
    executer: async (page, ctx) => {
      // La page reste en chargement tant que /api/dashboard n'est pas libérée.
      let liberer: () => void = () => undefined;
      const barriere = new Promise<void>((r) => {
        liberer = r;
      });
      await page.route("**/api/dashboard**", async (route) => {
        await barriere;
        await route.continue().catch(() => undefined);
      });
      try {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.getByText("Chargement du dashboard").first().waitFor({ state: "visible", timeout: 90_000 });
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        // Poser un attribut sur du HTML serveur AVANT l'hydratation fait lever à React « A tree hydrated but
        // some attributes of the server rendered HTML didn't match » (console.error, jamais corrigée) : c'est
        // la sonde qui la causait, pas l'application, et selon la course, dans un projet ou dans un autre.
        // React pose __reactFiber$… sur chaque nœud hydraté : on attend celui du Loader et celui du titre.
        await page.waitForFunction(
          () => {
            const parTexte = (t: string) =>
              [...document.querySelectorAll("div")].find((d) => d.firstChild?.nodeType === 3 && (d.firstChild.textContent ?? "").trim() === t);
            const hydrate = (e: Element | undefined) => !!e && Object.keys(e).some((k) => k.startsWith("__reactFiber$"));
            return hydrate(parTexte("Chargement du dashboard")) && hydrate(parTexte("Dashboard"));
          },
          null,
          { timeout: 60_000 },
        );

        const dom = await page.evaluate(() => {
          const el = [...document.querySelectorAll("div")].find((d) => d.firstChild?.nodeType === 3 && (d.firstChild.textContent ?? "").trim() === "Chargement du dashboard");
          if (!el) return null;
          el.setAttribute("data-sonde", "loader");
          // Témoin : le titre de la barre du haut (« Dashboard »), qui porte la police de l'interface.
          const titre = [...document.querySelectorAll("div")].find((d) => d.firstChild?.nodeType === 3 && (d.firstChild.textContent ?? "").trim() === "Dashboard");
          titre?.setAttribute("data-sonde-temoin", "1");
          return {
            declaree: getComputedStyle(el).fontFamily,
            corps: getComputedStyle(document.body).fontFamily,
            memeQueCorps: getComputedStyle(el).fontFamily === getComputedStyle(document.body).fontFamily,
            enLigneSansVariable: [...document.querySelectorAll("[style*=font-family]")].filter((e) => !(e as HTMLElement).style.fontFamily.includes("var(--font")).length,
          };
        });
        if (!dom) return { mesure: { erreur: "Libellé du Loader introuvable." }, corrige: null };

        const loader = await policesRendues(page, "[data-sonde=loader]");
        // Témoin : le corps de la page doit, lui, être rendu en police web. Sinon la police n'a pas été téléchargée
        // (hors ligne) et la sonde ne dit rien du Loader.
        const temoin = await policesRendues(page, "[data-sonde-temoin]");
        const capture = await ctx.capturer(page.locator("[data-sonde=loader]"));

        const structurel = dom.memeQueCorps && dom.enLigneSansVariable === 0;
        const mesure = {
          ...dom,
          structurel,
          policeRendueLoader: loader,
          policeRendueDuTitre: temoin,
          note:
            "En `next dev`, next/font garde le nom « Space Grotesk » dans son @font-face : le Loader s'affiche (par hasard) dans la bonne police. " +
            "En production le nom est hashé (__Space_Grotesk_xxxx) et le littéral retombe sur sans-serif. Le verdict repose donc sur la déclaration (structurel), pas sur le rendu en dev.",
        };
        // Déclaration fautive : bug présent, quelle que soit la police que le dev rend par hasard.
        if (!structurel) return { mesure, corrige: false, capture };
        // Déclaration saine : la police rendue doit être une police web (sinon la police n'est pas chargée, on ne conclut pas).
        if (loader.length === 0) return { mesure, corrige: null, capture };
        return { mesure, corrige: loader[0].isCustomFont === true ? true : temoin[0]?.isCustomFont === true ? false : null, capture };
      } finally {
        liberer();
        await page.unrouteAll({ behavior: "ignoreErrors" });
      }
    },
  },

  {
    id: "F2",
    titre: "Texte sous 10 px et 11 px",
    route: "/dashboard",
    critere: "Aucun texte d'interface visible sous 11 px sur la route : lt11 = 0 (donc lt10 = 0). Toutes les routes : sondes globales G1.",
    projets: TOUS,
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/dashboard", { repere: "text=Bonjour" });
      const r = await page.evaluate(relevePolices);
      const capture = await ctx.capturer(ctx.mobile ? page.locator("nav").last() : page.locator("aside").first());
      return {
        mesure: { lt10: r.lt10, lt11: r.lt11, textesVisibles: r.total, exemples: r.exemples, tailles: r.tailles },
        corrige: r.lt11 === 0,
        capture,
      };
    },
  },

  {
    id: "F3",
    titre: "Le zoom texte ne suit pas (tailles en px)",
    route: "/dashboard, /stock",
    critere: "Au moins 95 % des textes suivent la taille racine : leur taille double quand la taille racine passe de 16 à 32 px (ratio >= 0,95) ; exceptions (icônes, SVG) documentées.",
    projets: DESKTOP_CLAIR,
    compte: "demo",
    executer: async (page) => {
      const sorties: MesureSonde[] = [];
      // /login (public) est mesuré par la sonde suivante, sans session : le compte connecté y serait renvoyé.
      for (const chemin of ["/dashboard", "/stock"]) {
        sorties.push(
          ...(await etape(chemin, async () => {
            await aller(page, chemin, { repere: "main" });
            const z = await page.evaluate(releveZoomTexte);
            return { route: chemin, mesure: { total: z.total, suivent: z.suivent, ratio: z.ratio, exceptions: z.exceptions }, corrige: z.ratio >= 0.95 };
          })),
        );
      }
      return sorties;
    },
  },

  {
    id: "F3",
    titre: "Le zoom texte ne suit pas (tailles en px)",
    route: "/login",
    critere: "Au moins 95 % des textes suivent la taille racine : leur taille double quand la taille racine passe de 16 à 32 px (ratio >= 0,95) ; exceptions (icônes, SVG) documentées.",
    projets: DESKTOP_CLAIR,
    compte: "aucun",
    executer: async (page) => {
      await aller(page, "/login", { repere: "button:has-text('Se connecter')" });
      const z = await page.evaluate(releveZoomTexte);
      return { mesure: { total: z.total, suivent: z.suivent, ratio: arrondi(z.ratio, 3), exceptions: z.exceptions }, corrige: z.ratio >= 0.95 };
    },
  },
];
