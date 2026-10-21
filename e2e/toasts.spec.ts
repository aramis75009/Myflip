/**
 * Toasts during a modal window (plan, point of vigilance 1, lot L2b).
 *
 * A Radix modal sets `pointer-events: none` on the body and closes on an
 * outside click. Expected: an error toast fired while the window is open
 * stays clickable (its close button works) and does NOT close the window.
 *
 * Mutation used: the sale from the Stock (FenetreVente, PATCH
 * /api/articles/<id>, hook useUpdateArticle), whose error goes through the
 * global toast (app/providers.tsx). Its response is simulated as a 500: no
 * real write, and every other write is blocked (bloquerEcritures).
 */
import { visible } from "./catalogue-routes";
import { bloquerEcritures } from "./outils/ecritures";
import { simulerJson } from "./outils/reseau-simule";
import { expect, test } from "./outils/test";

test.use({ compte: "demo" });

test("[L2b] toast d'erreur cliquable sans fermer la fenêtre de vente", async ({ page }) => {
  const garde = await bloquerEcritures(page);
  const patch = await simulerJson(page, { chemin: /^\/api\/articles\/[^/]+$/, methode: "PATCH" }, 500, {
    error: "Erreur simulée (e2e).",
  });

  await page.goto("/stock");
  await expect(visible(page.getByText("Articles au total"))).toBeVisible();
  await page.getByPlaceholder("Rechercher un SKU…").fill("PIS7");
  const statut = visible(page.getByRole("combobox", { name: "Statut de PIS7", exact: true }));
  await expect(statut).toBeVisible();
  await statut.selectOption("Vendu");

  const fenetre = page.getByRole("dialog", { name: /^Enregistrer la vente de PIS7/ });
  await expect(fenetre).toBeVisible();
  await fenetre.getByLabel(/^Prix de vente/).fill("25");
  await fenetre.getByRole("button", { name: "Enregistrer la vente" }).click();

  const toastErreur = page.locator("[data-sonner-toast]").filter({ hasText: "Erreur simulée (e2e)." });
  await expect(toastErreur).toBeVisible();
  await expect(fenetre, "la fenêtre reste ouverte après l'erreur").toBeVisible();

  // The close button is reachable through the modal's pointer-events: none.
  await toastErreur.hover();
  await toastErreur.locator("[data-close-button]").click();
  await expect(toastErreur).toBeHidden();
  await expect(fenetre, "cliquer le toast ne ferme pas la fenêtre").toBeVisible();

  expect(patch.appels).toBe(1);
  expect(garde.bloquees).toEqual([]);
});
