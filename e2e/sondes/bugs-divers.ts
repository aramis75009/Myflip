/**
 * Relevés hors Studio de l'étude : X1 (dialogue calé sur le <main>), X2 (bulle du
 * chat sur le bouton de Mise en vente), X6 (focus des modales), X7 (theme-color),
 * X8 (contraste du texte « faint »), X13 (bouton de thème au premier affichage),
 * X14 (doc périmée). X15 : relevé en plus, hors étude (toast perdu au retour OAuth).
 */
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";

import { RACINE } from "../outils/environnement";
import { arrondi, contraste, memeCouleur } from "./couleurs";
import { DESKTOP, DESKTOP_CLAIR, etape, MOBILE_CLAIR, type MesureSonde, type Sonde } from "./harness";
import { aller } from "./pages";
import { ROUTES_SONDES } from "./routes";

type PageAxe = ConstructorParameters<typeof AxeBuilder>[0]["page"];


/** X8 : la règle axe `color-contrast` sur toutes les routes d'un compte (app connectée, ou pages publiques). */
function sondeContraste(compte: "demo" | "aucun" | "neuf"): Sonde {
  return {
    id: "X8",
    titre: "Le texte « faint » n'atteint pas le contraste WCAG AA",
    route: `${{ demo: "routes du compte demo", aucun: "pages publiques", neuf: "routes du compte neuf" }[compte]} (règle axe color-contrast)`,
    critere: "Aucune violation de la règle axe color-contrast (4,5:1 pour le texte) sur la route, dans le thème du projet.",
    projets: DESKTOP,
    compte,
    delaiMs: 600_000,
    executer: async (page, ctx) => {
      const sorties: MesureSonde[] = [];
      for (const r of ROUTES_SONDES.filter((x) => x.compte === compte)) {
        sorties.push(
          ...(await etape(r.chemin, async () => {
            if (r.entree.mouvementReduit) await page.emulateMedia({ reducedMotion: "reduce" });
            await aller(page, r.chemin, { attente: r.entree.attente(page) });
            const res = await new AxeBuilder({ page: page as unknown as PageAxe }).withRules(["color-contrast"]).exclude("nextjs-portal").analyze();
            const noeuds = res.violations.flatMap((v) => v.nodes);
            const pires = noeuds
              .map((n) => {
                const d = (n.any[0]?.data ?? {}) as { contrastRatio?: number; fgColor?: string; bgColor?: string };
                return { ratio: d.contrastRatio ?? null, fg: d.fgColor ?? null, bg: d.bgColor ?? null, cible: n.target.join(" ").slice(0, 80) };
              })
              .sort((a, b) => (a.ratio ?? 99) - (b.ratio ?? 99))
              .slice(0, 5);
            const mesure: Record<string, unknown> = { violations: noeuds.length, pires };
            if (r.variante === "route.dashboard") {
              // Le kicker de la barre du haut (« VUE D'ENSEMBLE ») : couleur du texte contre le fond de la barre.
              const k = await page.evaluate(() => {
                const kicker = document.querySelector(".sticky .font-mono");
                const barre = kicker?.closest(".sticky");
                if (!kicker || !barre) return null;
                return { fg: getComputedStyle(kicker).color, bg: getComputedStyle(barre).backgroundColor };
              });
              if (k) mesure.kicker = { ...k, contraste: arrondi(contraste(k.fg, k.bg)) };
            }
            return { route: r.chemin, variante: r.variante, mesure, corrige: noeuds.length === 0, capture: r.variante === "route.dashboard" ? await ctx.capturer() : undefined };
          }, r.variante)),
        );
      }
      return sorties;
    },
  };
}

export const SONDES_DIVERS: readonly Sonde[] = [
  {
    id: "X1",
    titre: "Les dialogues du cadre se calent sur le <main>, pas sur la fenêtre",
    route: "/a-comptabiliser (30 lignes, fenêtre « Vendre »)",
    critere: "Le voile du dialogue couvre toute la fenêtre : haut = 0, hauteur = hauteur de fenêtre, il recouvre la barre du haut (couvreTopbar = true) et le dialogue reste visible (dialogueVisible = true) avec 30 lignes.",
    projets: DESKTOP,
    compte: "sonde",
    executer: async (page, ctx) => {
      await aller(page, "/a-comptabiliser", { repere: "table tbody tr" });
      await page.getByRole("button", { name: "Valider", exact: true }).first().click();
      await page.locator("form").first().waitFor({ state: "visible", timeout: 30_000 });
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const f = document.querySelector("form");
        if (!f) return null;
        let o: Element | null = f;
        while (o && getComputedStyle(o).position !== "fixed") o = o.parentElement;
        if (!o) return null;
        const r = o.getBoundingClientRect();
        const fr = f.getBoundingClientRect();
        const main = document.querySelector("main");
        return {
          transformMain: main ? getComputedStyle(main).transform : null,
          haut: Math.round(r.top),
          hauteur: Math.round(r.height),
          hauteurFenetre: window.innerHeight,
          couvreTopbar: o.contains(document.elementFromPoint(720, 30)),
          dialogueVisible: fr.top >= 0 && fr.bottom <= window.innerHeight,
          lignes: document.querySelectorAll("tbody tr").length,
        };
      });
      if (!m) return { mesure: { erreur: "Dialogue introuvable." }, corrige: null };
      return {
        mesure: m,
        corrige: m.haut === 0 && m.hauteur === m.hauteurFenetre && m.couvreTopbar && m.dialogueVisible,
        capture: await ctx.capturer(),
      };
    },
  },

  {
    id: "X2",
    titre: "La bulle du chat recouvre le bouton principal de Mise en vente",
    route: "/mise-en-vente (bouton « Continuer »)",
    critere: "Aucun recouvrement : aire = 0 et le point droit du bouton « Continuer » reçoit le bouton d'action, pas « Ouvrir l'assistant IA ».",
    projets: [...DESKTOP_CLAIR, ...MOBILE_CLAIR],
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/mise-en-vente", { repere: "button:has-text('Continuer')" });
      const m = await page.evaluate(() => {
        const bouton = [...document.querySelectorAll("button")].find((x) => /^Continuer/.test((x.textContent ?? "").trim()));
        const chat = document.querySelector("button[aria-label^='Ouvrir l']");
        if (!bouton || !chat) return null;
        const b = bouton.getBoundingClientRect();
        const c = chat.getBoundingClientRect();
        const ix = Math.max(0, Math.min(b.right, c.right) - Math.max(b.left, c.left));
        const iy = Math.max(0, Math.min(b.bottom, c.bottom) - Math.max(b.top, c.top));
        return {
          aire: Math.round(ix * iy),
          pointDuBouton: document.elementFromPoint(b.right - 8, b.top + b.height / 2)?.closest("button")?.getAttribute("aria-label") ?? "bouton",
          bouton: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
          bulle: { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) },
        };
      });
      if (!m) return { mesure: { erreur: "Bouton « Continuer » ou bulle du chat introuvable." }, corrige: null };
      const h = page.viewportSize()?.height ?? 900;
      return { mesure: m, corrige: m.aire === 0 && m.pointDuBouton === "bouton", capture: await ctx.capturer({ x: 0, y: h - 160, width: page.viewportSize()?.width ?? 1440, height: 160 }, undefined, 0) };
    },
  },

  {
    id: "X6",
    titre: "Les modales ne gèrent pas le focus",
    route: "/parametres (modale Nouveau prompt), /calendrier (détail du jour)",
    critere:
      "À l'ouverture d'une modale le focus est dans le dialogue, il y reste après 25 Tab, Échap le rend au déclencheur ; le dialogue du calendrier se ferme avec Échap.",
    projets: DESKTOP_CLAIR,
    compte: "demo",
    executer: async (page, ctx) => {
      const sorties: MesureSonde[] = [];

      sorties.push(...(await etape("/parametres (modale Nouveau prompt)", async () => {
        await aller(page, "/parametres", { repere: "main" });
        const declencheur = page.getByRole("button", { name: "Nouveau prompt" }).first();
        await declencheur.evaluate((e) => e.setAttribute("data-sonde-declencheur", "1"));
        await declencheur.click();
        await page.locator("[role=dialog]").first().waitFor({ state: "visible" });
        await page.waitForTimeout(300);
        const dansDialogue = () => page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
        const focusInitial = await dansDialogue();
        const capture = await ctx.capturer(undefined, "modale");
        for (let i = 0; i < 25; i++) await page.keyboard.press("Tab");
        const focusApres25Tab = await dansDialogue();
        await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
        const apresEchap = await page.evaluate(() => ({
          dialogueOuvert: !!document.querySelector("[role=dialog]"),
          focusSur: (() => {
            const a = document.activeElement as HTMLElement | null;
            if (!a) return null;
            return a === document.body ? "body" : `${a.tagName.toLowerCase()} « ${(a.innerText ?? "").trim().slice(0, 24)} »`;
          })(),
          retourAuDeclencheur: document.activeElement?.hasAttribute("data-sonde-declencheur") ?? false,
        }));
        return {
          route: "/parametres (modale Nouveau prompt)",
          mesure: { focusInitial, focusApres25Tab, ...apresEchap },
          corrige: focusInitial && focusApres25Tab && apresEchap.retourAuDeclencheur && !apresEchap.dialogueOuvert,
          capture,
        };
      })));

      sorties.push(...(await etape("/calendrier (détail du jour)", async () => {
        await aller(page, "/calendrier", { repere: "div[style*='cursor: pointer']" });
        await page.locator("div[style*='cursor: pointer']").first().click();
        await page.getByText("Détail du jour").waitFor({ state: "visible" });
        const roleDialogue = await page.evaluate(() => !!document.querySelector("[role=dialog]"));
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
        const encoreLa = await page.getByText("Détail du jour").isVisible();
        return {
          route: "/calendrier (détail du jour)",
          mesure: { roleDialogue, dialogueEncoreOuvertApresEchap: encoreLa },
          corrige: roleDialogue && !encoreLa,
        };
      })));
      return sorties;
    },
  },

  {
    id: "X7",
    titre: "theme-color suit l'OS et pas le thème choisi dans l'app",
    route: "/dashboard",
    critere: "La couleur de la meta theme-color est celle du fond du thème actif (celui de l'app), quel que soit le réglage de l'OS, et change à la bascule.",
    projets: DESKTOP_CLAIR,
    compte: "demo",
    executer: async (page) => {
      const sorties: MesureSonde[] = [];
      const combos = [
        { app: "dark", os: "light" },
        { app: "light", os: "dark" },
      ] as const;
      for (const c of combos) {
        sorties.push(...(await etape(`/dashboard (app ${c.app}, OS ${c.os})`, async () => {
          // Ce script s'exécute après celui du projet : le thème de l'app est celui qu'on veut tester.
          await page.addInitScript((theme: string) => {
            try {
              window.localStorage.setItem("myflip-theme", theme);
            } catch {
              /* stockage indisponible */
            }
          }, c.app);
          await page.emulateMedia({ colorScheme: c.os });
          await aller(page, "/dashboard", { repere: "text=Bonjour" });
          const m = await page.evaluate(() => {
            const metas = [...document.querySelectorAll("meta[name=theme-color]")];
            const actif = metas.find((x) => !(x as HTMLMetaElement).media || matchMedia((x as HTMLMetaElement).media).matches) as HTMLMetaElement | undefined;
            return {
              themeColor: actif?.content ?? null,
              metas: metas.map((x) => `${(x as HTMLMetaElement).media || "(sans media)"} ${(x as HTMLMetaElement).content}`),
              fond: getComputedStyle(document.body).backgroundColor,
              themeApp: document.documentElement.dataset.theme ?? "light",
            };
          });
          const meme = memeCouleur(m.themeColor, m.fond);
          return { route: `/dashboard (app ${c.app}, OS ${c.os})`, mesure: { ...m, themeAttendu: c.app }, corrige: meme };
        })));
      }
      return sorties;
    },
  },

  sondeContraste("demo"),
  sondeContraste("aucun"),
  sondeContraste("neuf"),

  {
    id: "X13",
    titre: "Le bouton de thème annonce le mauvais état avant l'hydratation",
    route: "/dashboard (HTML serveur, thème sombre)",
    critere: "Dès le HTML serveur, l'étiquette du bouton de thème est cohérente avec le thème posé : en thème sombre « Passer en thème clair » (ou une icône pilotée en CSS).",
    projets: ["desktop-sombre"],
    compte: "demo",
    executer: async (page, ctx) => {
      await page.route("**/_next/static/chunks/**", (r) => r.abort());
      try {
        await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.locator("button[aria-label^='Passer en thème']").first().waitFor({ state: "attached", timeout: 90_000 });
        await page.waitForTimeout(300);
        const m = await page.evaluate(() => ({
          theme: document.documentElement.dataset.theme ?? "light",
          label: document.querySelector("button[aria-label^='Passer en thème']")?.getAttribute("aria-label") ?? null,
        }));
        const attendu = m.theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre";
        return { mesure: { ...m, attendu }, corrige: m.label === attendu, capture: await ctx.capturer(page.locator("button[aria-label^='Passer en thème']").first()) };
      } finally {
        await page.unrouteAll({ behavior: "ignoreErrors" });
      }
    },
  },

  {
    id: "X14",
    titre: "Doc périmée : CLAUDE.md cite un fichier absent",
    route: "CLAUDE.md, components/WelcomeModal.tsx",
    critere: "CLAUDE.md ne cite plus components/WelcomeModal.tsx, ou ce fichier existe.",
    projets: DESKTOP_CLAIR,
    compte: "aucun",
    executer: async () => {
      const existe = fs.existsSync(path.join(RACINE, "components", "WelcomeModal.tsx"));
      const doc = fs.readFileSync(path.join(RACINE, "CLAUDE.md"), "utf8");
      const lignes = doc
        .split("\n")
        .map((l, i) => ({ n: i + 1, l }))
        .filter((x) => x.l.includes("WelcomeModal"))
        .map((x) => `CLAUDE.md:${x.n}`);
      return { mesure: { fichierExiste: existe, citationsDansLaDoc: lignes }, corrige: existe || lignes.length === 0 };
    },
  },

  {
    id: "X15",
    titre: "Le toast « Trello est connecté » se perd au retour OAuth (relevé hors étude)",
    route: "/compte?trello=ok",
    critere: "Au retour de l'autorisation Trello, le message « Trello est connecté. » est affiché (au moins un toast visible après le chargement).",
    projets: DESKTOP_CLAIR,
    compte: "demo",
    executer: async (page, ctx) => {
      await page.goto("/compte?trello=ok", { waitUntil: "load", timeout: 120_000 });
      await page.locator("main").first().waitFor({ state: "visible", timeout: 90_000 });
      await page.waitForTimeout(2500);
      const m = await page.evaluate(() => ({
        urlApres: location.pathname + location.search,
        toasts: [...document.querySelectorAll("[data-sonner-toast]")].map((t) => (t.textContent ?? "").trim()),
      }));
      return {
        mesure: {
          ...m,
          note:
            "Le paramètre est lu puis retiré de l'URL (le code a donc bien tourné) mais aucun toast n'apparaît : l'effet de Integrations.tsx appelle toast.success() avant que le <Toaster> de layout.tsx ne soit abonné. Cause supposée, non démontrée ici.",
        },
        corrige: m.toasts.some((t) => /connect/i.test(t)),
        capture: await ctx.capturer(),
      };
    },
  },
];
