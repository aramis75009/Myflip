/**
 * Projet « setup » : se connecte par le VRAI formulaire /login avec chaque
 * compte de test (base e2e locale, semée par e2e/seed/seed-e2e.ts) et
 * enregistre sa session dans e2e/.auth/<compte>.json (gitignoré).
 *
 * Sélecteurs : les <label> de /login ne sont pas liés aux champs (getByLabel
 * échoue) ; voir donnees-fixtures.json > userCreation. Le jour où la refonte
 * corrige ce défaut, ces sélecteurs suivront.
 *
 * Le mot de passe est posé par un évaluateur, pas par `fill` : ainsi il
 * n'apparaît ni dans les titres d'étape du rapport, ni dans une trace.
 */
import fs from "node:fs";
import path from "node:path";

import { COMPTES, MOT_DE_PASSE_E2E, type CleCompte } from "./compte-test";
import { cheminEtatSession, seedPresent } from "./outils/environnement";
import { expect, test } from "./outils/test";

async function poserValeurSansTrace(champ: import("@playwright/test").Locator, valeur: string): Promise<void> {
  await champ.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, valeur);
}

for (const cle of Object.keys(COMPTES) as CleCompte[]) {
  test(`connexion du compte ${cle}`, async ({ page }) => {
    test.skip(!seedPresent(), "e2e/seed/seed-e2e.ts absent : aucun compte de test en base.");

    await page.goto("/login");
    await page.locator("input[type=email][autocomplete=email]").fill(COMPTES[cle].email);
    await poserValeurSansTrace(page.locator("input[type=password][autocomplete=current-password]"), MOT_DE_PASSE_E2E);
    await page.getByRole("button", { name: "Se connecter" }).click();

    await page.waitForURL("**/dashboard", { timeout: 90_000 });
    await expect(page).toHaveURL(/\/dashboard$/);

    const fichier = cheminEtatSession(cle);
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    await page.context().storageState({ path: fichier });
  });
}
