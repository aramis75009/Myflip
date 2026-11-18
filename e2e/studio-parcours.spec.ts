/**
 * Parcours du Studio (étape 4 du PRD 2026-10-20 : stories 8 à 14 et 21 à 25 ;
 * la génération d'images IA en est retirée le 17/11/2026, PRD 2026-11-16 étape 6).
 *
 * Desktop seulement (le Studio est un écran d'ordinateur). Garde d'écriture
 * sur /api/** : tout POST/PATCH/DELETE est intercepté. Ceux que le parcours
 * DOIT faire sont simulés et comptés.
 */
import { capturer } from "./outils/capture";
import { bloquerEcritures } from "./outils/ecritures";
import { photosSynthetiques } from "./outils/photos";
import { expect, test, type Page } from "./outils/test";

const FICHE = "/studio/5039-black-pink";

test.describe("Studio, parcours", () => {
  test.use({ compte: "demo" });
  test.skip(({ isMobile }) => isMobile, "Studio : écrans d'ordinateur.");

  async function ouvrirEtape(page: Page, nom: string) {
    const bouton = page.getByRole("heading", { level: 2, name: new RegExp(`^${nom}`) }).getByRole("button");
    if ((await bouton.getAttribute("aria-expanded")) !== "true") await bouton.click();
    await expect(bouton).toHaveAttribute("aria-expanded", "true");
  }

  const toast = (page: Page, texte: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: texte }).first();

  test("catalogue : une phrase d'action par coloris, filtres gardés dans l'URL", async ({ page, journalConsole }) => {
    await bloquerEcritures(page);
    await page.goto("/studio");
    await expect(page.getByText(/^7 coloris · /)).toBeVisible();
    for (const groupe of ["À juger", "À photographier", "Rien à préparer"]) {
      await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${groupe}`) })).toBeVisible();
    }
    // Les lignes de la vue « chez toi » (data-sac) mènent aussi à la fiche : la carte du catalogue est le lien sans data-sac.
    const carte = page.locator('a[href="/studio/5039-black-pink"]:not([data-sac])');
    await expect(carte).toContainText("Juger 3 images");
    await expect(page.locator('a[href="/studio/5039-white-volt"]:not([data-sac])')).toContainText("Photographier le sac");
    await capturer(page, "parcours.catalogue", { pleinePage: true });

    // Filtre dans l'URL, gardé au rechargement et au retour depuis une fiche.
    const filtre = page.getByRole("group", { name: "Filtre" });
    await filtre.getByRole("button", { name: /^À juger/ }).click();
    await expect(page).toHaveURL(/\/studio\?filtre=a_juger$/);
    await page.reload();
    await expect(filtre.getByRole("button", { name: /^À juger/ })).toHaveAttribute("aria-pressed", "true");
    await carte.click();
    await expect(page.getByRole("heading", { level: 1, name: "Black Pink" })).toBeVisible();
    await page.getByRole("link", { name: "Tous les coloris" }).click();
    await expect(page).toHaveURL(/\/studio\?filtre=a_juger$/);
    await expect(filtre.getByRole("button", { name: /^À juger/ })).toHaveAttribute("aria-pressed", "true");
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("fiche : l'en-tête, la planche (retouche par lot) et les versions, plus rien de la génération d'images", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const appelsIA: string[] = [];
    page.on("request", (r) => /\/api\/studio\/(essais|generations|modeles|angles|reglages|historique)/.test(r.url()) && appelsIA.push(r.url()));
    await page.goto(FICHE);
    await expect(page.getByRole("heading", { level: 1, name: "Black Pink" })).toBeVisible();

    // Deux sections, dans cet ordre : Photos (planche et retouche par lot), puis Versions.
    const photos = page.getByRole("heading", { level: 2, name: /^Photos/ });
    const versions = page.getByRole("heading", { level: 2, name: /^Versions/ });
    await expect(photos.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    expect((await photos.boundingBox())!.y).toBeLessThan((await versions.boundingBox())!.y);
    await expect(page.getByText("9 / 15 prises")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Retoucher/ })).toBeVisible();

    // Plus aucune trace de la génération : ni étapes, ni prochaine action, ni prompt, ni réglages, ni bilan.
    for (const nom of ["Angles", "Génération", "À juger", "Validées"]) {
      await expect(page.getByRole("heading", { level: 2, name: new RegExp(`^${nom}`) }), nom).toHaveCount(0);
    }
    for (const t of ["PROCHAINE ACTION", "Aperçu du prompt", "Réglages du Studio", "Détails vérifiés par l’IA"]) {
      await expect(page.getByText(t), t).toHaveCount(0);
    }
    await expect(page.getByText(/Images générées par IA/)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Bilan", exact: true })).toHaveCount(0);

    // Le menu d'une photo n'a plus « Pivoter la photo… » (remplacé par la retouche par lot).
    await page.getByRole("button", { name: "Actions pour la photo Face", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /Déplacer vers/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Pivoter/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await capturer(page, "parcours.fiche", { pleinePage: true });

    // Ouvrir la fiche n'appelle aucune route de l'ancienne génération.
    expect(appelsIA).toEqual([]);

    // Sous 768 px : le message « ordinateur ».
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Le Studio s’utilise sur ordinateur.")).toBeVisible();
    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("planche : le surplus est signalé, un retrait refusé est dit clairement", async ({ page, journalConsole }) => {
    await bloquerEcritures(page);
    const imports: number[] = [];
    await page.route("**/api/studio/references", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const n = (route.request().postDataBuffer()?.toString("latin1") ?? "").split('name="photo"').length - 1;
      imports.push(n);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conservees: n, doublons: 0, rattachee: true }) });
    });
    await page.route("**/api/studio/references/*", async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Cette photo a déjà servi : elle ne peut plus être supprimée." }),
      });
    });
    await page.goto(FICHE);
    await ouvrirEtape(page, "Photos");

    // 8 photos pour 6 cases libres : 6 importées, 2 nommées, rien de refusé en bloc.
    const photos = await photosSynthetiques(page, 8);
    await page.locator("#etape-photos input[type=file][multiple]").setInputFiles(photos);
    await expect(toast(page, "2 photos en trop n’ont pas été importées : photo-test-7.png, photo-test-8.png.")).toBeVisible();
    await expect(toast(page, "6 photos importées sur la planche.")).toBeVisible();
    expect(imports.reduce((a, b) => a + b, 0)).toBe(6);
    await capturer(page, "parcours.planche-surplus", { attendreReseau: false });

    // Une photo qui a servi : retrait et remplacement désactivés, avec la raison.
    await page.getByRole("button", { name: "Actions pour la photo Face", exact: true }).click();
    await expect(page.getByRole("menuitem", { name: /Retirer de la planche/ })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Elle a déjà servi à une variante : ni retrait ni remplacement.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    // Une photo libre : le retrait part, le refus (409) s'affiche clairement.
    await page.getByRole("button", { name: "Actions pour la photo Compartiment du haut", exact: true }).click();
    await page.getByRole("menuitem", { name: /Retirer de la planche/ }).click();
    const fenetre = page.getByRole("alertdialog", { name: /Retirer la photo « Compartiment du haut »/ });
    await expect(fenetre).toBeVisible();
    await fenetre.getByRole("button", { name: "Retirer" }).click();
    await expect(toast(page, "Cette photo a déjà servi à une variante : elle reste sur la planche.")).toBeVisible();
    // Seule erreur admise : le 409 simulé, que Chromium journalise comme toute réponse en erreur.
    expect(journalConsole.erreurs.filter((e) => !/status of 409/.test(e.texte))).toEqual([]);
  });
});
