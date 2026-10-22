/**
 * Studio, modèles (étape 5 du PRD 2026-10-20 : critères 6 à 10, stories 15 à
 * 20 et 26) : sélecteur, favori, devis et confirmation au-dessus du budget,
 * comparaison côte à côte, historique d'une prise, Bilan et 404.
 *
 * Desktop seulement. OpenRouter n'est JAMAIS appelé : toute écriture vers
 * /api/** est bloquée par la garde, et celles que le parcours doit faire sont
 * simulées et comptées ici. Le compte demo a un budget de 0,30 € par sac
 * (e2e/seed/seed-e2e.ts, BUDGET_E2E_EUR) et le faux catalogue tarife Qwen à
 * 0,0184 $ l'image et « E2E: Modèle cher » à 0,136 $ (sortie + une référence).
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";

import { devisDuLancement, type ModeleImage } from "../lib/studioModeles";
import { capturer } from "./outils/capture";
import { bloquerEcritures } from "./outils/ecritures";
import { expect, test } from "./outils/test";

const FICHE = "/studio/5039-black-pink";
const NAVY = "/studio/5040-navy-orange";
const QWEN = "Qwen: Qwen Image 2.1 Turbo";
const CHER = "E2E: Modèle cher";
const TAUX = 0.86;
const BUDGET = 0.3;

const modele = (id: string, nom: string, sortieUsd: number, entreeParImageUsd: number): ModeleImage => ({
  id,
  nom,
  description: "",
  maxReferences: 4,
  minReferences: 0,
  ratios: ["3:4"],
  tarif: { kind: "image", sortieUsd, entreeParImageUsd },
});
const M_QWEN = modele("qwen/qwen-image-2.1-turbo", QWEN, 0.0184, 0);
const M_CHER = modele("e2e/modele-cher", CHER, 0.134, 0.002);

const toast = (page: Page, texte: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: texte }).first();
const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

/**
 * Erreurs de console attendues : les réponses en erreur simulées (409, 503), que Chromium journalise, et le
 * journal SERVEUR que `next dev` recopie dans la console du navigateur quand le faux catalogue publie un
 * tarif illisible (« E2E: Tarif inconnu », voulu : lib/studioCatalogue.ts le compte « inconnu »).
 */
const erreursInattendues = (erreurs: { texte: string }[]) =>
  erreurs.filter((e) => !/status of (409|503)/.test(e.texte) && !e.texte.includes("[studio] catalogue OpenRouter : 1 tarif(s) illisible(s)"));

type PageAxe = ConstructorParameters<typeof AxeBuilder>[0]["page"];

/** axe (WCAG 2.2 A/AA) sur la zone écrite par ce lot : aucune violation serious ou critical. */
async function sansViolationGrave(page: Page, zone: string) {
  const r = await new AxeBuilder({ page: page as unknown as PageAxe })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .include(zone)
    .analyze();
  const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(graves.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

async function ouvrirEtape(page: Page, nom: string) {
  const bouton = page.getByRole("heading", { level: 2, name: new RegExp(`^${nom}`) }).getByRole("button");
  if ((await bouton.getAttribute("aria-expanded")) !== "true") await bouton.click();
  await expect(bouton).toHaveAttribute("aria-expanded", "true");
}

/** La ligne d'un modèle : le bouton de sélection (nom exact) et ce qui l'entoure. */
const ligne = (page: Page, nom: string) => page.locator("li").filter({ has: page.getByRole("button", { name: nom, exact: true }) });

test.describe("Studio, modèles", () => {
  test.use({ compte: "demo" });
  test.skip(({ isMobile }) => isMobile, "Studio : écrans d'ordinateur.");

  test("sélecteur : coût du sac contre le budget, réussite réelle, favori basculé, filtres et tri", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const favoris: { methode: string; corps: unknown }[] = [];
    await page.route("**/api/studio/modeles/favoris", async (route) => {
      favoris.push({ methode: route.request().method(), corps: route.request().postDataJSON() });
      await json(route, 200, { ok: true });
    });
    await page.goto(FICHE);
    await ouvrirEtape(page, "Génération");
    const zone = page.locator('[data-emplacement="selecteur-modeles"]');
    await expect(zone.getByRole("button", { name: QWEN, exact: true })).toBeVisible();

    // Qwen : un sac complet (15 × 0,0184 $ × 0,86) tient dans 0,30 €, et ses vrais résultats (1 validée, 1 rejetée).
    const qwen = ligne(page, QWEN);
    await expect(qwen).toContainText("0,24 €");
    await expect(qwen).toContainText("Réussite 50 % (1/2 au 1er coup)");
    await expect(qwen).not.toContainText("Hors budget");
    // Le modèle cher, montré tel qu'il est : 1,75 € le sac, hors budget, jamais essayé (jamais « 0 % »).
    const cher = ligne(page, CHER);
    await expect(cher).toContainText("1,75 €");
    await expect(cher).toContainText("Hors budget");
    await expect(cher).toContainText("5,8 × le budget");
    await expect(cher).toContainText("Réussite jamais essayé");
    // Jamais un prix inventé.
    await expect(ligne(page, "E2E: Tarif inconnu")).toContainText("prix inconnu");
    await expect(ligne(page, "Google: Nano Banana Pro")).toContainText("Tarif au jeton");
    // Les favoris du compte absents du faux catalogue restent visibles et retirables.
    await expect(zone.getByText("google/gemini-2.5-flash-image")).toBeVisible();
    await capturer(page, "modeles.selecteur", { pleinePage: true });
    await sansViolationGrave(page, "#etape-generation");

    // Favori basculé : épinglé en tête, puis retiré.
    await zone.getByRole("button", { name: `Épingler ${QWEN} en favori` }).click();
    await expect(zone.getByRole("button", { name: `Retirer ${QWEN} des favoris` })).toHaveAttribute("aria-pressed", "true");
    await expect(zone.getByRole("region", { name: /^Favoris/ }).getByRole("button", { name: QWEN, exact: true })).toBeVisible();
    await zone.getByRole("button", { name: `Retirer ${QWEN} des favoris` }).click();
    await expect(zone.getByRole("button", { name: `Épingler ${QWEN} en favori` })).toHaveAttribute("aria-pressed", "false");
    expect(favoris).toEqual([
      { methode: "POST", corps: { modele: "qwen/qwen-image-2.1-turbo" } },
      { methode: "DELETE", corps: { modele: "qwen/qwen-image-2.1-turbo" } },
    ]);

    // « Dans le budget » : Qwen seul tient un sac complet dans 0,30 €.
    const selection = (nom: string) => zone.getByRole("button", { name: nom, exact: true });
    await zone.getByRole("button", { name: "Dans le budget" }).click();
    await expect(selection(QWEN)).toBeVisible();
    await expect(selection(CHER)).toHaveCount(0);
    await expect(selection("ByteDance Seed: Seedream 5.0 Flash")).toHaveCount(0);
    await zone.getByRole("button", { name: "Dans le budget" }).click();

    // « Déjà testé » : Qwen et Seedream (la comparaison de navy-orange), pas le modèle cher.
    await zone.getByRole("button", { name: "Déjà testé" }).click();
    await expect(selection(QWEN)).toBeVisible();
    await expect(selection("ByteDance Seed: Seedream 5.0 Flash")).toBeVisible();
    await expect(selection(CHER)).toHaveCount(0);
    await zone.getByRole("button", { name: "Déjà testé" }).click();

    // Tri par réussite : Qwen (le seul à avoir un taux) en tête.
    await zone.getByRole("radio", { name: "Réussite" }).click();
    // (le bouton de sélection d'une ligne est le seul à porter aria-describedby ; l'étoile n'en a pas)
    await expect(zone.locator("li button[aria-describedby]").first()).toHaveAttribute("aria-label", QWEN);

    // Recherche, et 3 modèles au plus.
    await zone.getByRole("searchbox", { name: "Rechercher un modèle" }).fill("e2e");
    await expect(selection(CHER)).toBeVisible();
    await expect(selection(QWEN)).toHaveCount(0);
    await zone.getByRole("searchbox", { name: "Rechercher un modèle" }).fill("");
    for (const nom of [QWEN, CHER, "ByteDance Seed: Seedream 5.0 Flash"]) await selection(nom).click();
    await selection("E2E: Tarif inconnu").click();
    await expect(zone.getByText("3 modèles au plus : retires-en un d’abord.")).toBeVisible();
    await expect(selection("E2E: Tarif inconnu")).toHaveAttribute("aria-pressed", "false");
    await expect(zone.getByText("3 modèles comparés")).toBeVisible();

    expect(garde.bloquees).toEqual([]);
    expect(erreursInattendues(journalConsole.erreurs)).toEqual([]);
  });

  test("devis : dans le budget, au-dessus avec le montant sur le bouton, et le devis du serveur sur un 409", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const lancements: Record<string, unknown>[] = [];
    let n = 0;
    await page.route("**/api/studio/generations", async (route) => {
      const corps = route.request().postDataJSON() as Record<string, unknown>;
      lancements.push(corps);
      if (corps.confirme !== true) {
        // Le serveur sait mieux : il demande une confirmation, avec SON devis (budget du compte).
        const devis = devisDuLancement({ modeles: [M_QWEN], nbCases: Number(corps.nbCases), budget: { budgetParSacEur: 0.05, tauxEurParUsd: TAUX } });
        return json(route, 409, { error: "Ce lancement est estimé à 0,06 € (budget par sac : 0,05 €) : confirmation requise.", code: "confirmation_requise", devis });
      }
      n++;
      return json(route, 200, { essai: { id: `e2e-genere-${n}`, numero: n, modele: corps.modele, coutEstimeUsd: 0.0184, coutReelUsd: 0.0184, dureeMs: 9000 } });
    });
    // L'avis IA demandé après une génération : simulé, jamais OpenRouter.
    await page.route("**/api/studio/essais/*/verifier", (route) => json(route, 200, { verdict: "ok", scoreGlobal: 80, details: [] }));
    const budgets: unknown[] = [];
    await page.route("**/api/studio/reglages", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      budgets.push(route.request().postDataJSON());
      await json(route, 200, { ok: true, modifieLe: new Date().toISOString(), budgetParSacEur: 2, tauxEurParUsd: TAUX });
    });

    await page.goto(FICHE);
    await ouvrirEtape(page, "Génération");
    const zone = page.locator('[data-emplacement="selecteur-modeles"]');
    const devisPanneau = page.getByRole("group", { name: "Devis du lancement" });
    await zone.getByRole("button", { name: QWEN, exact: true }).click();
    const texte = (await devisPanneau.innerText()).replace(/\s+/g, " ");
    const nbCases = Number(/(\d+) images? pour SDN\d+/.exec(texte)?.[1]);
    expect(nbCases).toBeGreaterThanOrEqual(3);
    await expect(devisPanneau).toContainText("Dans ton budget : part sans confirmation.");
    await expect(devisPanneau).toContainText("sur 0,30 € de budget par sac");

    // Un second modèle, cher : comparaison, au-dessus du budget.
    await zone.getByRole("button", { name: CHER, exact: true }).click();
    const attendu = devisDuLancement({ modeles: [M_QWEN, M_CHER], nbCases, budget: { budgetParSacEur: BUDGET, tauxEurParUsd: TAUX } });
    expect(attendu.raisonConfirmation).toBe("budget");
    const montant = `${attendu.montantConfirmationEur.toFixed(2).replace(".", ",")} €`;
    await expect(devisPanneau).toContainText(`${nbCases} prises × 2 modèles = ${nbCases * 2} images`);
    await expect(devisPanneau).toContainText("Au-delà de ton budget par sac");
    await devisPanneau.getByRole("button", { name: `Générer ${nbCases * 2} images` }).click();
    const fenetre = page.getByRole("alertdialog", { name: "Confirmer la dépense" });
    await expect(fenetre).toBeVisible();
    await expect(fenetre.getByRole("button", { name: `Confirmer ${montant}` })).toBeVisible();
    await expect(fenetre).toContainText(`au-delà de ton budget de 0,30 € par sac`);
    await expect(fenetre.getByRole("row", { name: new RegExp(`^${CHER}`) })).toContainText(`${nbCases} ×`);
    // Le focus part sur « Annuler » : Entrée ne dépense jamais par réflexe.
    await expect(fenetre.getByRole("button", { name: "Annuler" })).toBeFocused();
    await capturer(page, "modeles.confirmation-budget", { attendreReseau: false });
    await fenetre.getByRole("button", { name: "Annuler" }).click();
    await expect(fenetre).toBeHidden();
    expect(lancements).toEqual([]);

    // Le budget se règle depuis la génération : le devis suit tout de suite.
    await devisPanneau.getByRole("button", { name: "Modifier le budget" }).click();
    const reglage = page.getByRole("form", { name: "Budget du Studio" });
    await reglage.getByLabel(/Budget par sac/).fill("2");
    await reglage.getByRole("button", { name: "Enregistrer le budget" }).click();
    await expect(toast(page, "Budget enregistré : 2,00 € par sac")).toBeVisible();
    expect(budgets).toEqual([{ budgetParSacEur: 2, tauxEurParUsd: TAUX }]);
    await expect(devisPanneau).toContainText("sur 2,00 € de budget par sac");
    await expect(devisPanneau).toContainText("Dans ton budget");

    // Le serveur a le dernier mot : un 409 ouvre la même confirmation, avec son devis et ses mots.
    await zone.getByRole("button", { name: CHER, exact: true }).click();
    await devisPanneau.getByRole("button", { name: `Générer ${nbCases} images` }).click();
    await expect(fenetre).toBeVisible();
    await expect(fenetre).toContainText("Ce lancement est estimé à 0,06 € (budget par sac : 0,05 €) : confirmation requise.");
    await expect(fenetre).toContainText("Devis recalculé par le serveur");
    const duServeur = devisDuLancement({ modeles: [M_QWEN], nbCases, budget: { budgetParSacEur: 0.05, tauxEurParUsd: TAUX } });
    await expect(fenetre.getByRole("button", { name: `Confirmer ${duServeur.montantConfirmationEur.toFixed(2).replace(".", ",")} €` })).toBeVisible();
    expect(lancements).toHaveLength(1); // la première requête est partie seule
    await fenetre.getByRole("button", { name: /^Confirmer/ }).click();
    await expect(toast(page, new RegExp(`^${nbCases} images générées`))).toBeVisible();
    const confirmes = lancements.slice(1);
    expect(confirmes).toHaveLength(nbCases);
    expect(confirmes.every((c) => c.confirme === true && JSON.stringify(c.modeles) === JSON.stringify([M_QWEN.id]))).toBe(true);
    expect(new Set(confirmes.map((c) => c.lancementId)).size).toBe(1);

    expect(garde.bloquees).toEqual([]);
    expect(erreursInattendues(journalConsole.erreurs)).toEqual([]);
  });

  test("comparaison : la même prise par 3 modèles, côte à côte ; on en retient une, on annule, puis elle part", async ({ page, journalConsole }) => {
    await bloquerEcritures(page);
    const decisions: { id: string; decision: unknown }[] = [];
    await page.route("**/api/studio/essais/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const corps = route.request().postDataJSON() as { decision: unknown };
      decisions.push({ id: new URL(route.request().url()).pathname.split("/").pop()!, decision: corps.decision });
      await json(route, 200, { ok: true, decision: corps.decision, inchange: false });
    });
    await page.goto(NAVY);
    const comparaison = page.getByRole("region", { name: "Comparaison de 3 modèles" });
    await expect(comparaison).toBeVisible();
    await expect(comparaison.getByAltText("Vraie photo")).toBeVisible();
    await expect(comparaison.getByRole("button", { name: "Retenir celle-ci" })).toHaveCount(3);
    // Coût de chaque image, en euros : réel, estimé, jamais un zéro inventé ; et l'avis de l'IA comme une aide.
    await expect(comparaison).toContainText("0,016 € réel");
    await expect(comparaison).toContainText("≈ 0,026 € estimé");
    await expect(comparaison).toContainText("L’IA suggère corriger 62/100");
    await expect(comparaison).toContainText(QWEN); // noms lus dans le catalogue
    await capturer(page, "modeles.comparaison", { pleinePage: true });
    await sansViolationGrave(page, "#etape-a-juger");

    // Retenir Qwen (2e image) : rien ne part pendant 5 s, et « Annuler » remet la comparaison.
    await comparaison.getByRole("button", { name: "Retenir celle-ci" }).nth(1).click();
    const retenue = toast(page, `Retenue : ${QWEN} pour SDN7 · 2 autres rejetées`);
    await expect(retenue).toBeVisible();
    await expect(comparaison).toBeHidden();
    await retenue.getByRole("button", { name: "Annuler" }).click();
    await expect(comparaison).toBeVisible();
    await page.waitForTimeout(6_000);
    expect(decisions).toEqual([]);

    // Au clavier : « 2 » retient la même ; après le délai, une validation et deux rejets.
    await comparaison.getByAltText("Vraie photo").click();
    await page.keyboard.press("2");
    await expect(toast(page, `Retenue : ${QWEN}`)).toBeVisible();
    await expect.poll(() => decisions.length, { timeout: 15_000 }).toBe(3);
    expect([...decisions].sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: "e2e-essai-e20", decision: "rejete" },
      { id: "e2e-essai-e21", decision: "valide" },
      { id: "e2e-essai-e22", decision: "rejete" },
    ]);
    expect(erreursInattendues(journalConsole.erreurs)).toEqual([]);
  });

  test("historique : toutes les tentatives, échecs compris ; retenir une version, annuler une décision", async ({ page, journalConsole }) => {
    await bloquerEcritures(page);
    const decisions: { id: string; decision: unknown }[] = [];
    await page.route("**/api/studio/essais/*", async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const corps = route.request().postDataJSON() as { decision: unknown };
      decisions.push({ id: new URL(route.request().url()).pathname.split("/").pop()!, decision: corps.decision });
      await json(route, 200, { ok: true, decision: corps.decision, inchange: false });
    });
    await page.goto(FICHE);

    // L'image à juger n° 2 (Face · ouverte, Profil) : son essai et l'échec du même lancement.
    await page.getByRole("button", { name: "Image suivante" }).click();
    await expect(page.getByText("2 / 3", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Historique de la prise", exact: true }).click();
    const feuille = page.getByRole("dialog", { name: "Historique de la prise" });
    await expect(feuille).toContainText("Face · ouverte · Profil");
    await expect(feuille).toContainText("2 tentatives");
    await expect(feuille).toContainText("Échec");
    await expect(feuille).toContainText("Le modèle n'a renvoyé aucune image.");
    await expect(feuille).toContainText("0,002 € réel");
    await expect(feuille).toContainText("À juger");
    await capturer(page, "modeles.historique", { attendreReseau: false });
    await sansViolationGrave(page, '[role="dialog"]');
    await feuille.getByRole("button", { name: "Retenir cette version" }).click();
    await expect(toast(page, "Version retenue.")).toBeVisible();
    expect(decisions).toEqual([{ id: "e2e-essai-e5", decision: "valide" }]);
    await page.keyboard.press("Escape");
    await expect(feuille).toBeHidden();

    // Une prise validée après correction : le rejet purgé reste lisible, la validation s'annule.
    decisions.length = 0;
    await ouvrirEtape(page, "Validées");
    await page.getByRole("button", { name: "Historique de la prise Face · détail gauche, Trois-quarts face" }).click();
    await expect(feuille).toContainText("Purgée");
    await expect(feuille).toContainText("Validée · SDN3");
    await expect(feuille).toContainText("Rejetée");
    await expect(feuille).toContainText("L'image de cet essai rejeté a été effacée");
    await expect(feuille.getByRole("button", { name: "Retenir cette version" })).toHaveCount(0);
    await feuille.getByRole("button", { name: "Annuler la décision" }).click();
    await expect(toast(page, "Décision annulée : l’image revient dans la file « À juger ».")).toBeVisible();
    expect(decisions).toEqual([{ id: "e2e-essai-e3", decision: null }]);
    expect(erreursInattendues(journalConsole.erreurs)).toEqual([]);
  });

  test("bilan : réussite, dépenses par semaine, par modèle, par angle et par coloris", async ({ page, journalConsole }) => {
    await bloquerEcritures(page);
    await page.goto("/studio/bilan");
    await expect(page.getByText("RÉUSSITE AU 1ER ESSAI")).toBeVisible();
    for (const titre of ["Dépenses par semaine", "Par modèle", "Par angle", "Par coloris"]) {
      await expect(page.getByRole("heading", { level: 2, name: titre })).toBeVisible();
    }
    await expect(page.getByRole("list", { name: "Dépenses par semaine" }).getByRole("listitem")).toHaveCount(12);
    // Le coût inconnu n'est jamais compté zéro : le total est un minimum.
    await expect(page.getByText(/^≥ \d+,\d{2} €$/).first()).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(`^${QWEN}`) })).toContainText("50 % · 1/2");
    // Une version archivée d'un angle garde ses résultats, et le dit.
    await expect(page.getByText("Trois-quarts face · ancienne version")).toBeVisible();
    // Un modèle sans aucun coût réel connu : « inconnu », jamais « 0,00 € ».
    await expect(page.getByRole("row", { name: /^ByteDance Seed: Seedream/ })).toContainText("inconnu");
    await capturer(page, "modeles.bilan", { pleinePage: true });
    await sansViolationGrave(page, "#contenu");
    expect(erreursInattendues(journalConsole.erreurs)).toEqual([]);
  });

  test("une clé de coloris inconnue répond 404", async ({ page }) => {
    await bloquerEcritures(page);
    const reponse = await page.goto("/studio/coloris-qui-n-existe-pas");
    expect(reponse?.status()).toBe(404);
    await expect(page.getByText("Ce coloris n’existe pas (ou plus) dans SacBase.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Tous les coloris" }).last()).toHaveAttribute("href", "/studio");
  });
});
