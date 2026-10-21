/**
 * Suite Playwright de référence de la refonte (PRD 2026-10-20, § 12-13).
 * Mode d'emploi, architecture et interdits : e2e/README.md.
 *
 * Jamais Neon, jamais une API réelle : Postgres embarqué local, faux
 * OpenRouter / SacBase / Resend, `next dev` dédié sur 3100+E2E_DECALAGE avec
 * son propre dossier de build. reuseExistingServer: false partout : la suite
 * ne pilote JAMAIS le `npm run dev` d'Aramis (vrais secrets, base Neon).
 */
import { defineConfig } from "@playwright/test";

import {
  DOSSIERS,
  JOURNAUX,
  PORTS,
  SACBASE_JETON_E2E,
  URL_APP,
  controlerPreparation,
  envServeur,
  viderJournauxDuLancement,
} from "./e2e/outils/environnement";
import type { OptionsE2E } from "./e2e/outils/test";

// ── Préliminaire, dans le processus principal seulement ──────────────────────
// Les webServer démarrent AVANT le globalSetup (ordre vérifié dans 1.63.0) :
// les contrôles qui doivent précéder `next dev` se font donc ici, au chargement
// de la config. Les workers rechargent ce fichier : ils héritent d'E2E_RUN_ID.
const principal = !process.env.TEST_WORKER_INDEX && !process.env.E2E_RUN_ID;
if (principal) {
  process.env.E2E_RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
  const lancementDeTests = process.argv.includes("test") && !process.argv.includes("--list");
  if (lancementDeTests) viderJournauxDuLancement();
}

const ENV_SERVEUR = envServeur();
controlerPreparation(ENV_SERVEUR);

const fauxServeur = (nom: string, script: string, port: number, extra: Record<string, string> = {}) => ({
  name: nom,
  command: `node ${script}`,
  url: `http://127.0.0.1:${port}/__e2e/appels`,
  env: { E2E_PORT_MOCK: String(port), E2E_JOURNAL_MOCKS: JOURNAUX.mocks, NODE_OPTIONS: "", ...extra },
  reuseExistingServer: false,
  timeout: 30_000,
  gracefulShutdown: { signal: "SIGTERM" as const, timeout: 3_000 },
});

const DESKTOP = { viewport: { width: 1440, height: 900 } };
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

export default defineConfig<OptionsE2E>({
  testDir: "./e2e",
  outputDir: DOSSIERS.resultats,
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  // E2E_WORKERS pour accélérer une machine peu chargée ; 2 par défaut (une suite
  // décalée peut tourner en même temps, et `next dev` compile à la demande).
  workers: Number(process.env.E2E_WORKERS) || 2,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  // `next dev` compile chaque route à sa première visite : plusieurs secondes. 180 s : plusieurs
  // attentes de 60 s peuvent se succéder dans un test pendant un gel du serveur.
  timeout: 180_000,
  // 60 s : un repère de page attend ses données, et `next dev` compile une route à sa première
  // visite. Constaté : sur un Mac qui swappe (5,8 Go de swap, iCloud en E/S), le serveur s'est figé
  // 40 s d'affilée au milieu d'un lancement, plusieurs tests attendant leurs données en même temps
  // (un test a échoué à 30 s, 15 s auparavant). Aucun effet sur la durée d'un test qui réussit.
  expect: { timeout: 60_000 },
  reporter: [["list"], ["html", { outputFolder: DOSSIERS.rapportHtml, open: "never" }]],

  use: {
    baseURL: URL_APP,
    browserName: "chromium",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    navigationTimeout: 90_000,
    actionTimeout: 20_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Sans cela, Chromium headless masque les barres de défilement : les bugs
    // « barre parasite » et « barre claire en sombre » du PRD § 1 disparaîtraient.
    launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts$/,
      // Pas de trace : elle garderait les arguments passés à la page.
      use: { ...DESKTOP, colorScheme: "light", themeMyflip: "light", trace: "off", screenshot: "off" },
    },
    {
      name: "desktop-clair",
      testMatch: /.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...DESKTOP, colorScheme: "light", themeMyflip: "light" },
    },
    {
      name: "desktop-sombre",
      testMatch: /.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...DESKTOP, colorScheme: "dark", themeMyflip: "dark" },
    },
    {
      name: "mobile-clair",
      testMatch: /.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...MOBILE, colorScheme: "light", themeMyflip: "light" },
    },
    {
      name: "mobile-sombre",
      testMatch: /.*\.spec\.ts$/,
      dependencies: ["setup"],
      use: { ...MOBILE, colorScheme: "dark", themeMyflip: "dark" },
    },
  ],

  // Démarrés dans l'ordre, chacun attendu avant le suivant ; arrêtés à la fin.
  webServer: [
    fauxServeur("OpenRouter factice", "e2e/mocks/openrouter.mjs", PORTS.openrouter),
    fauxServeur("SacBase factice", "e2e/mocks/sacbase.mjs", PORTS.sacbase, { E2E_SACBASE_JETON: SACBASE_JETON_E2E }),
    fauxServeur("Resend factice", "e2e/mocks/resend.mjs", PORTS.resend),
    {
      name: "next dev e2e",
      command: `node node_modules/next/dist/bin/next dev -p ${PORTS.app}`,
      url: `${URL_APP}/login`,
      env: ENV_SERVEUR,
      reuseExistingServer: false,
      timeout: 240_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
    },
  ],
});
