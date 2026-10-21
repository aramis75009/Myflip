/**
 * Toasts during a modal window (plan, point of vigilance 1, lot L2b).
 *
 * A Radix modal sets `pointer-events: none` on the body and closes on an
 * outside click. Expected: an error toast fired while the window is open
 * stays clickable (its close button works) and does NOT close the window.
 *
 * No mutation reachable from an open modal sends its error to the global
 * toast: each modal shows its own (`meta.erreurLocale`, hook → callers table
 * in the L2b report). The toast that DOES fire inside a modal is « Session
 * expirée » (lib/hooks.ts, jsonFetch, whatever the hook says): the sale from
 * the Stock (FenetreVente, PATCH /api/articles/<id>) gets a simulated 401.
 * No real write (every other write is blocked by bloquerEcritures), and the
 * redirection to /login is held, never served, as in etats.spec.ts.
 */
import { visible } from "./catalogue-routes";
import { bloquerEcritures } from "./outils/ecritures";
import { simulerJson } from "./outils/reseau-simule";
import { expect, test } from "./outils/test";

test.use({ compte: "demo" });

test("[L2b] toast d'erreur cliquable sans fermer la fenêtre de vente", async ({ page }) => {
  const garde = await bloquerEcritures(page);
  const patch = await simulerJson(page, { chemin: /^\/api\/articles\/[^/]+$/, methode: "PATCH" }, 401, {
    error: "Non authentifié (simulation e2e).",
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
  // Held redirection: registered only now, after the page has loaded.
  await page.route((u) => u.pathname === "/login", () => undefined);
  await fenetre.getByRole("button", { name: "Enregistrer la vente" }).click();

  const toastErreur = page.locator("[data-sonner-toast]").filter({ hasText: "Session expirée. Reconnecte-toi pour reprendre ici." });
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
