/**
 * Parcours « Mise en vente » jusqu'à l'étape 2 avec une photo, sans IA : l'article
 * TST1 (compte sonde, non Hipobuy : aucun appel au Studio ni au Blob) est cherché,
 * puis une image SYNTHÉTIQUE est déposée dans le champ fichier (décodage local).
 * Rien n'est enregistré : la génération d'annonce (POST /api/listings/generate)
 * n'est jamais déclenchée.
 */
import type { Page } from "@playwright/test";

import { aller, attendreStable } from "./pages";
import { imageSynthetique } from "./png";
import { expect } from "./test";

export async function ouvrirEtapeDeux(page: Page, avecPhoto = true): Promise<void> {
  await aller(page, "/mise-en-vente", { repere: "button:has-text('Continuer')" });
  const champ = page.getByPlaceholder("Ex : PRL1");
  await champ.fill("TST1");
  // Le départ du champ lance la recherche, sans ajouter de ligne vide (Entrée en ajoute une et la rend active).
  await champ.blur();
  const continuer = page.getByRole("button", { name: /^Continuer/ });
  await expect(continuer).toBeEnabled({ timeout: 60_000 });
  await continuer.click();
  if (avecPhoto) {
    await page.locator("input[type=file]").first().setInputFiles({ name: "sonde-1.png", mimeType: "image/png", buffer: imageSynthetique(600, 800, 1) });
    await page.locator("button[aria-label='Agrandir la photo 1']").waitFor({ state: "visible", timeout: 60_000 });
  } else {
    await page.getByRole("heading", { name: "Photos" }).waitFor({ state: "visible", timeout: 60_000 });
  }
  await attendreStable(page, { stabiliseMs: 500 });
}
