/**
 * Aides de navigation des sondes : aller sur une page et attendre qu'elle soit
 * STABLE (chargée, réseau calme, polices prêtes, animation d'entrée finie) avant
 * de mesurer. `next dev` compile chaque route à sa première visite : les délais
 * sont larges.
 */
import type { Locator, Page } from "@playwright/test";

import { attendreCalme, requetesEnCours } from "../outils/calme";

export type OptionsAller = {
  /** Sélecteur à attendre visible (en plus du chargement). */
  repere?: string;
  /** Locators qui doivent tous être visibles (condition `attente` du catalogue de routes). */
  attente?: Locator[];
  /** Plafond d'attente du calme réseau (défaut 60 s, voir outils/calme.ts). Au-delà, la mesure échoue. */
  reseauMs?: number;
  /** Attente finale pour les animations d'entrée (défaut 350 ms ; l'animation `stepIn` dure 200 ms). */
  stabiliseMs?: number;
};

export async function attendreStable(page: Page, options: OptionsAller = {}): Promise<void> {
  if (options.repere) await page.locator(options.repere).first().waitFor({ state: "visible", timeout: 90_000 });
  for (const l of options.attente ?? []) await l.waitFor({ state: "visible", timeout: 90_000 });
  // Pas de mesure « quand même » : une page à moitié chargée donnerait des mesures différentes d'un lancement à l'autre.
  if (!(await attendreCalme(page, { plafondMs: options.reseauMs }))) {
    throw new Error(`Réseau jamais calme (requêtes en cours : ${requetesEnCours(page).join(", ") || "aucune"}).`);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForTimeout(options.stabiliseMs ?? 350);
}

export async function aller(page: Page, chemin: string, options: OptionsAller = {}): Promise<{ statut: number | null; url: string }> {
  const reponse = await page.goto(chemin, { waitUntil: "load", timeout: 120_000 });
  await attendreStable(page, options);
  return { statut: reponse?.status() ?? null, url: new URL(page.url()).pathname + new URL(page.url()).search };
}
