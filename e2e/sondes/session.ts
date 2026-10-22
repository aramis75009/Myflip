/**
 * Session du compte « sonde » : création du compte et de ses données (une fois
 * par lancement), puis connexion par le VRAI formulaire /login, comme
 * e2e/auth.setup.ts, et storageState dans e2e/.auth/<décalage>/sonde.json.
 *
 * Le projet « setup » de la config ne connaît que `demo` et `neuf` et n'est pas
 * à nous : cette connexion-ci se fait donc à la demande, sous verrou (deux
 * workers ne la font pas en même temps), et une seule fois par lancement
 * (fichier `sonde.run` = identifiant du lancement).
 *
 * Le mot de passe de test est posé par un évaluateur (jamais par `fill`) : il
 * n'apparaît ni dans les titres d'étape ni dans une trace. Il n'est écrit
 * dans aucun rapport.
 */
import fs from "node:fs";
import path from "node:path";

import type { Browser, Locator } from "@playwright/test";

import { MOT_DE_PASSE_E2E } from "../compte-test";
import { DOSSIERS, URL_APP, idLancement } from "../outils/environnement";
import { COMPTE_SONDE, semerCompteSonde } from "./graines";
import { avecVerrou } from "./resultats";

const FICHIER_SESSION = path.join(DOSSIERS.auth, "sonde.json");
const FICHIER_MARQUE = path.join(DOSSIERS.auth, "sonde.run");

let enCours: Promise<string> | null = null;

async function poserSansTrace(champ: Locator, valeur: string): Promise<void> {
  await champ.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, valeur);
}

/** Chemin du storageState du compte sonde ; le crée (compte, données, connexion) s'il manque pour ce lancement. */
export function assurerSessionSonde(browser: Browser): Promise<string> {
  enCours ??= avecVerrou(
    FICHIER_SESSION,
    async () => {
      const marque = fs.existsSync(FICHIER_MARQUE) ? fs.readFileSync(FICHIER_MARQUE, "utf8").trim() : "";
      if (marque === idLancement() && fs.existsSync(FICHIER_SESSION)) return FICHIER_SESSION;

      await semerCompteSonde();

      const contexte = await browser.newContext({ baseURL: URL_APP, locale: "fr-FR", timezoneId: "Europe/Paris" });
      try {
        const page = await contexte.newPage();
        await page.goto("/login", { timeout: 120_000 });
        await page.locator("input[type=email][autocomplete=email]").fill(COMPTE_SONDE.email);
        await poserSansTrace(page.locator("input[type=password][autocomplete=current-password]"), MOT_DE_PASSE_E2E);
        await page.getByRole("button", { name: "Se connecter" }).click();
        await page.waitForURL("**/dashboard", { timeout: 120_000 });
        fs.mkdirSync(path.dirname(FICHIER_SESSION), { recursive: true });
        await contexte.storageState({ path: FICHIER_SESSION });
        fs.writeFileSync(FICHIER_MARQUE, idLancement());
      } finally {
        await contexte.close();
      }
      return FICHIER_SESSION;
    },
    // La connexion peut attendre la compilation de /dashboard : un verrou plus patient.
    240_000,
  ).catch((e: unknown) => {
    enCours = null;
    throw e;
  });
  return enCours;
}
