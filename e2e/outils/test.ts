/**
 * `test` étendu de la suite e2e. TOUT spec importe `test` et `expect` d'ici,
 * jamais de @playwright/test directement : c'est ce qui branche les gardes.
 *
 * Pour chaque test, selon le projet :
 *  - thème posé AVANT le chargement (localStorage « myflip-theme ») ;
 *  - garde réseau du navigateur : seuls localhost / 127.0.0.1 / [::1] passent,
 *    le reste est avorté et FAIT ÉCHOUER le test (popups comprises) ;
 *  - GET /api/studio/image** servie par une image synthétique (Blob niveau 0) ;
 *  - console.error et pageerror collectés (`journalConsole`), versés dans
 *    e2e/rapports/<serie>/console.jsonl ;
 *  - window.confirm REFUSÉ (et prompt), alert et beforeunload acceptés ;
 *  - suivi des requêtes du contexte, pour `attendreCalme` (e2e/outils/calme.ts) ;
 *  - E2E_LATENCE_API_MS (défaut 0, éteint) : retarde chaque réponse de /api/**
 *    de 0 à N ms, selon le chemin. Mode « éprouvette » : une capture qui change
 *    avec la latence repose sur une attente fragile ;
 *  - compte : `test.use({ compte: "demo" | "neuf" | "aucun" })` (défaut « aucun »).
 *
 * Les captures : `capturer(page, id, options)` (e2e/outils/capture.ts).
 */
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";

import type { CleCompte } from "../compte-test";
import { suivreReseau } from "./calme";
import { JOURNAUX, cheminEtatSession } from "./environnement";
import { cleImageStudio, libelleParDefaut, svgSac } from "./image-studio";
import { ajouterLigne } from "./journaux";

export type ThemeMyflip = "light" | "dark";
export type Compte = CleCompte | "aucun";

export type EntreeConsole = { type: "console" | "pageerror"; texte: string; url?: string };

export type OptionsE2E = {
  /** Thème MyFlip posé avant chargement (défini par projet dans playwright.config.ts). */
  themeMyflip: ThemeMyflip;
  /** Compte connecté : storageState de e2e/.auth/<compte>.json, ou aucun. */
  compte: Compte;
};

export type FixturesE2E = {
  /** Erreurs de console et exceptions de page, tous onglets confondus. */
  journalConsole: { erreurs: EntreeConsole[] };
  /** Boîtes natives rencontrées (type + message) et leur traitement. */
  dialogues: { type: string; message: string; reponse: "accepte" | "refuse" }[];
  /** Requêtes vers un hôte non local, avortées par la garde (doit rester vide). */
  requetesBloquees: string[];
  /** Libellés des images synthétiques du Studio, par clé « ref:<id> » / « essai:<id> ». */
  imagesStudio: { libelles: Map<string, string>; servies: string[] };
};

const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Latence ajoutée aux réponses de /api/** (éprouvette, voir l'en-tête). 0 = rien. */
const LATENCE_API_MS = Math.max(0, Number(process.env.E2E_LATENCE_API_MS) || 0);

/** Délai propre à un chemin (0 à `max` ms, par paliers de max/4) : des routes d'inégale lenteur, donc des ordres d'arrivée différents. */
function delaiPourChemin(chemin: string, max: number): number {
  let h = 0;
  for (const c of chemin) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ((h % 5) * max) / 4;
}

export const test = base.extend<OptionsE2E & FixturesE2E>({
  themeMyflip: ["light", { option: true }],
  compte: ["aucun", { option: true }],

  storageState: async ({ compte }, use) => {
    await use(compte === "aucun" ? undefined : cheminEtatSession(compte));
  },

  journalConsole: async ({}, use) => {
    await use({ erreurs: [] });
  },
  dialogues: async ({}, use) => {
    await use([]);
  },
  requetesBloquees: async ({}, use) => {
    await use([]);
  },
  imagesStudio: async ({}, use) => {
    await use({ libelles: new Map(), servies: [] });
  },

  context: async (
    { context, themeMyflip, journalConsole, dialogues, requetesBloquees, imagesStudio },
    use,
    testInfo,
  ) => {
    // 0. Suivi des requêtes : le calme réseau (captures, sondes, axe) s'appuie dessus.
    suivreReseau(context);

    // 1. Thème, avant tout script de la page.
    await context.addInitScript((theme: string) => {
      try {
        window.localStorage.setItem("myflip-theme", theme);
      } catch {
        // Stockage indisponible (page about:blank) : sans effet sur les pages de l'app.
      }
    }, themeMyflip);

    // 2. Garde réseau du navigateur (enregistrée d'abord : elle passe en dernier).
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      const reseau = url.protocol === "http:" || url.protocol === "https:";
      if (reseau && !HOTES_LOCAUX.has(url.hostname)) {
        const cible = `${url.protocol}//${url.host}${url.pathname}`;
        requetesBloquees.push(cible);
        ajouterLigne(JOURNAUX.reseauNavigateur, { projet: testInfo.project.name, test: testInfo.titlePath.join(" › "), cible });
        await route.abort("blockedbyclient");
        return;
      }
      await route.fallback();
    });

    // 2 bis. Éprouvette de latence (éteinte par défaut). Enregistrée avant les routes des pages et
    // du test : celles-ci (réponses simulées, retenues) passent d'abord et ne sont pas retardées.
    if (LATENCE_API_MS > 0) {
      await context.route(
        (u) => u.pathname.startsWith("/api/") && u.hostname !== "127.0.0.1",
        async (route) => {
          const chemin = new URL(route.request().url()).pathname;
          await new Promise((r) => setTimeout(r, delaiPourChemin(chemin, LATENCE_API_MS)));
          await route.fallback();
        },
      );
    }

    // 3. Images du Studio (enregistrée ensuite : elle passe AVANT la garde).
    await context.route((u) => u.pathname === "/api/studio/image", async (route) => {
      const url = new URL(route.request().url());
      const cle = cleImageStudio(url);
      imagesStudio.servies.push(cle);
      await route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        headers: { "Cache-Control": "no-store" },
        body: svgSac(cle, imagesStudio.libelles.get(cle) ?? libelleParDefaut(cle)),
      });
    });

    // 4. Console, exceptions et boîtes natives, sur chaque onglet (popups comprises).
    const brancher = (page: Page) => {
      page.on("console", (m) => {
        if (m.type() === "error") journalConsole.erreurs.push({ type: "console", texte: m.text(), url: m.location().url });
      });
      page.on("pageerror", (e) => journalConsole.erreurs.push({ type: "pageerror", texte: e.message }));
      page.on("dialog", async (d) => {
        const refuser = d.type() === "confirm" || d.type() === "prompt";
        dialogues.push({ type: d.type(), message: d.message(), reponse: refuser ? "refuse" : "accepte" });
        if (refuser) await d.dismiss();
        else await d.accept();
      });
    };
    context.on("page", brancher);
    for (const p of context.pages()) brancher(p);

    await use(context);

    // Bilan du test.
    if (journalConsole.erreurs.length > 0) {
      for (const e of journalConsole.erreurs) {
        ajouterLigne(JOURNAUX.console, { projet: testInfo.project.name, test: testInfo.titlePath.join(" › "), ...e });
      }
    }
    if (requetesBloquees.length > 0) {
      throw new Error(
        `[garde réseau navigateur] ${requetesBloquees.length} requête(s) vers un hôte non local avortée(s) : ` +
          [...new Set(requetesBloquees)].join(", "),
      );
    }
  },
});

export { expect };
export type { BrowserContext, Page };
