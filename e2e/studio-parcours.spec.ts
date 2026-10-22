/**
 * Parcours du Studio (étape 4 du PRD 2026-10-20 : stories 8 à 14 et 21 à 25).
 *
 * Desktop seulement (le Studio est un écran d'ordinateur). Garde d'écriture
 * sur /api/** : tout POST/PATCH/DELETE est intercepté. Ceux que le parcours
 * DOIT faire sont simulés et comptés ; V et R ne sont pressés qu'avec
 * /api/studio/essais/** intercepté, et le test vérifie que rien ne part
 * pendant le délai d'annulation.
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
    const carte = page.locator('a[href="/studio/5039-black-pink"]');
    await expect(carte).toContainText("Juger 3 images");
    await expect(page.locator('a[href="/studio/5039-white-volt"]')).toContainText("Photographier le sac");
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

  test("fiche : la prochaine action en haut, cinq étapes dans l'ordre du travail", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const avis: string[] = [];
    page.on("request", (r) => r.url().includes("/verifier") && avis.push(r.url()));
    await page.goto(FICHE);
    await expect(page.getByText("PROCHAINE ACTION", { exact: true })).toBeVisible();
    await expect(page.locator("#prochaine-action")).toHaveText("Juger 3 images");

    const noms = ["Photos", "Angles", "Génération", "À juger", "Validées"];
    const hauts: number[] = [];
    for (const nom of noms) {
      const titre = page.getByRole("heading", { level: 2, name: new RegExp(`^${nom}`) });
      const boite = await titre.boundingBox();
      expect(boite, nom).not.toBeNull();
      hauts.push(boite!.y);
      await expect(titre.getByRole("button")).toHaveAttribute("aria-expanded", nom === "À juger" ? "true" : "false");
    }
    expect([...hauts].sort((a, b) => a - b)).toEqual(hauts);
    // La file à juger tient dans le premier écran (elle était à y ≈ 1 370 avant).
    expect(hauts[3]).toBeLessThan(900);
    await expect(page.getByText("9 / 15 prises")).toBeVisible();
    await capturer(page, "parcours.fiche", { pleinePage: true });

    // Ouvrir la fiche ne déclenche plus aucun avis IA payant.
    expect(avis).toEqual([]);

    // Réglages du Studio accessibles depuis la fiche.
    await expect(page.getByRole("link", { name: "Réglages du Studio" })).toHaveAttribute("href", "/parametres?onglet=studio");

    // Sous 768 px : le message « ordinateur ».
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Le Studio s’utilise sur ordinateur.")).toBeVisible();
    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("jugement : V puis « Annuler » n'envoie rien ; R part après le délai", async ({ page, journalConsole }) => {
    await bloquerEcritures(page);
    const decisions: { chemin: string; corps: unknown }[] = [];
    await page.route("**/api/studio/essais/**", async (route) => {
      const r = route.request();
      if (r.method() !== "PATCH") return route.fallback();
      const corps = r.postDataJSON() as { decision: unknown };
      decisions.push({ chemin: new URL(r.url()).pathname, corps });
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, decision: corps.decision, inchange: false }) });
    });
    await page.goto(FICHE);
    await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
    await expect(page.getByAltText("Vraie photo")).toBeVisible();
    await expect(page.getByAltText("Image générée")).toBeVisible();
    await expect(page.getByText(/L’IA suggère/)).toBeVisible();

    // Focus « nulle part » (corps de page) : les raccourcis de l'étape ouverte s'appliquent.
    await page.getByAltText("Vraie photo").click();
    await page.keyboard.press("v");
    const valide = toast(page, "Validée pour SDN4");
    await expect(valide).toBeVisible();
    await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
    await capturer(page, "parcours.jugement-annuler", { attendreReseau: false });
    await valide.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByText("1 / 3", { exact: true })).toBeVisible();
    await page.waitForTimeout(6_000);
    expect(decisions).toEqual([]);

    // R : rien avant 5 s, puis un seul PATCH.
    await page.getByAltText("Vraie photo").click();
    await page.keyboard.press("r");
    await expect(toast(page, "Image rejetée")).toBeVisible();
    await page.waitForTimeout(3_000);
    expect(decisions).toEqual([]);
    await expect.poll(() => decisions.length, { timeout: 10_000 }).toBe(1);
    expect(decisions[0].corps).toEqual({ decision: "rejete" });
    await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
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

  test("aperçu du prompt : le prompt maître, puis le prompt d'angle, tels qu'ils partent", async ({ page, journalConsole }) => {
    await bloquerEcritures(page);
    await page.goto(FICHE);
    await page.getByRole("button", { name: "Aperçu du prompt" }).click();
    const fenetre = page.getByRole("dialog", { name: "Aperçu du prompt" });
    await expect(fenetre).toBeVisible();
    const texte = (await fenetre.innerText()).replace(/\s+/g, " ");
    const maitre = texte.indexOf("You are a product photographer");
    const angle = texte.indexOf("PROMPT D’ANGLE");
    expect(maitre).toBeGreaterThan(-1);
    expect(angle).toBeGreaterThan(maitre);
    await capturer(page, "parcours.apercu-prompt");
    expect(journalConsole.erreurs).toEqual([]);
  });
});
