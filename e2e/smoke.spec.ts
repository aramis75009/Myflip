/**
 * Smoke de l'infrastructure e2e : pages publiques dans les 4 projets, faux
 * serveurs joignables et conformes, puis, connecté, /dashboard et /studio dans
 * les 4 projets (données du seed, catalogue du faux SacBase) et la preuve que
 * le catalogue du Studio, lu CÔTÉ SERVEUR, vient du faux OpenRouter.
 */
import { COMPTES } from "./compte-test";
import { capturer } from "./outils/capture";
import { SACBASE_JETON_E2E, URL_OPENROUTER } from "./outils/environnement";
import catalogueSacbase from "./seed/sacbase-coloris.json";
import { appelsFaux, urlFaux } from "./outils/mocks";
import { expect, test } from "./outils/test";

/** Cartes attendues sur /studio : le catalogue du faux SacBase, plus le coloris « hors catalogue » du seed. */
const CLES_STUDIO = [...catalogueSacbase.coloris.map((c) => c.cle), "ancien-coloris-test"];

const PUBLIQUES = [
  { chemin: "/", id: "smoke-accueil", repere: "h1" },
  { chemin: "/login", id: "smoke-login", repere: "button:has-text('Se connecter')" },
  { chemin: "/legal/cgu", id: "smoke-cgu", repere: "h1" },
] as const;

test.describe("pages publiques", () => {
  for (const p of PUBLIQUES) {
    test(`${p.chemin} se charge avec le thème du projet`, async ({ page, themeMyflip, journalConsole }) => {
      const reponse = await page.goto(p.chemin);
      expect(reponse?.status(), "statut HTTP").toBeLessThan(400);
      await expect(page.locator(p.repere).first()).toBeVisible();

      // Le thème est posé avant le premier rendu : data-theme="dark" en sombre, absent en clair.
      const html = page.locator("html");
      if (themeMyflip === "dark") await expect(html).toHaveAttribute("data-theme", "dark");
      else await expect(html).not.toHaveAttribute("data-theme", "dark");

      const chemin = await capturer(page, p.id);
      expect(chemin).toContain(`${test.info().project.name}/${p.id}.png`);
      expect(journalConsole.erreurs.filter((e) => e.type === "pageerror")).toEqual([]);
    });
  }
});

test.describe("faux serveurs", () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== "desktop-clair", "Vérifié une fois, pas dans chaque projet.");
  });

  test("OpenRouter factice : catalogue, tarifs, clé exigée, compteur", async ({ request }) => {
    const avant = (await appelsFaux(request, "openrouter")).compteur;

    const liste = await request.get(`${URL_OPENROUTER}/images/models`);
    expect(liste.status()).toBe(200);
    const ids = ((await liste.json()) as { data: { id: string }[] }).data.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["qwen/qwen-image-2.1-turbo", "e2e/modele-cher", "recraft/recraft-v4.1-flash"]));

    const cher = await request.get(`${URL_OPENROUTER}/images/models/e2e/modele-cher/endpoints`);
    expect(((await cher.json()) as { endpoints: { pricing: { cost_usd: number }[] }[] }).endpoints[0].pricing[1].cost_usd).toBe(0.134);
    expect((await request.get(`${URL_OPENROUTER}/images/models/e2e/tarif-inconnu/endpoints`)).status()).toBe(404);

    expect((await request.post(`${URL_OPENROUTER}/chat/completions`, { data: { model: "x", messages: [] } })).status()).toBe(401);
    const annonce = await request.post(`${URL_OPENROUTER}/chat/completions`, {
      headers: { Authorization: "Bearer e2e-fausse-cle-test" },
      data: { model: "x", messages: [], response_format: { type: "json_schema", json_schema: { name: "annonce" } } },
    });
    expect(annonce.status()).toBe(200);
    const contenu = ((await annonce.json()) as { choices: { message: { content: string } }[] }).choices[0].message.content;
    expect(JSON.parse(contenu)).toMatchObject({ titre: expect.any(String), motsCles: expect.any(String) });

    const image = await request.post(`${URL_OPENROUTER}/images`, {
      headers: { Authorization: "Bearer e2e-fausse-cle-test" },
      data: { model: "qwen/qwen-image-2.1-turbo", prompt: "e2e", n: 1 },
    });
    const b64 = ((await image.json()) as { data: { b64_json: string }[] }).data[0].b64_json;
    expect([...Buffer.from(b64, "base64").subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);

    // ≥ : un autre worker peut faire appeler le faux serveur par Next en même temps.
    expect((await appelsFaux(request, "openrouter")).compteur).toBeGreaterThanOrEqual(avant + 6);
  });

  test("SacBase factice : jeton exigé, catalogue du seed, vignette image", async ({ request }) => {
    const base = urlFaux("sacbase");
    expect((await request.get(`${base}/api/studio/coloris`)).status()).toBe(401);
    const coloris = await request.get(`${base}/api/studio/coloris`, { headers: { Authorization: `Bearer ${SACBASE_JETON_E2E}` } });
    expect(coloris.status()).toBe(200);
    const corps = (await coloris.json()) as { genere: string; coloris: unknown[] };
    expect(corps.genere).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(corps.coloris)).toBe(true);

    const vignette = await request.get(`${base}/img/coloris/5039-black-pink.jpg`, {
      headers: { Authorization: `Bearer ${SACBASE_JETON_E2E}` },
    });
    expect(vignette.status()).toBe(200);
    expect(vignette.headers()["content-type"]).toMatch(/^image\//);
  });

  test("Resend factice : POST /emails", async ({ request }) => {
    const r = await request.post(`${urlFaux("resend")}/emails`, { data: { to: "e2e@myflip.test", subject: "e2e" } });
    expect(r.status()).toBe(200);
    expect(((await r.json()) as { id: string }).id).toMatch(/^e2e-email-/);
  });
});

test.describe("connecté (compte demo)", () => {
  test.use({ compte: "demo" });

  test("/dashboard s'ouvre avec la session du projet setup et les données du seed", async ({ page, journalConsole }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(`Bonjour ${COMPTES.demo.prenom}`)).toBeVisible();
    // Objectif de UserSettings (600 €) : l'anneau ne dépend pas de la date du jour.
    await expect(page.getByText(/cible 600,00\s€/)).toBeVisible();
    // Onboarding terminé : pas de carte de démarrage.
    await expect(page.getByText(/CONFIGURATION · ÉTAPE/i)).toHaveCount(0);
    expect(journalConsole.erreurs.filter((e) => e.type === "pageerror")).toEqual([]);
  });

  test("/studio montre les coloris du faux SacBase", async ({ page, request, journalConsole }) => {
    await page.goto("/studio");
    await expect(page).toHaveURL(/\/studio$/);

    // Catalogue accepté par parseColorisCatalogue : aucun bandeau « SacBase injoignable / non configuré ».
    await expect(page.getByText(/SacBase (injoignable|non configuré)/)).toHaveCount(0);
    // 6 coloris de e2e/seed/sacbase-coloris.json + 1 hors catalogue (seed), 2 photos SDN11 jamais rattachées.
    // Un catalogue rejeté ne laisserait que les 4 coloris déjà en base.
    await expect(page.getByText(/^7 coloris · .* · 2 photos non rattachées$/)).toBeVisible();
    for (const cle of CLES_STUDIO) {
      await expect(page.locator(`a[href="/studio/${cle}"]`), `carte ${cle}`).toBeVisible();
    }

    // Vignette relayée par le serveur depuis le faux SacBase (/img/*), affichée dans la carte.
    const vignette = page.locator('a[href="/studio/5039-black-pink"] img[src*="/api/studio/vignette"]');
    await expect.poll(() => vignette.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);

    // Cumulatif : le serveur garde le catalogue 60 s, un test précédent a pu le charger.
    const appels = (await appelsFaux(request, "sacbase")).appels;
    expect(appels.filter((a) => a.type === "coloris" && a.statut === 200 && a.bearer).length).toBeGreaterThanOrEqual(1);
    expect(appels.filter((a) => a.type === "image" && a.statut === 200 && a.bearer).length).toBeGreaterThanOrEqual(1);
    expect(journalConsole.erreurs.filter((e) => e.type === "pageerror")).toEqual([]);
  });

  test("/studio/bilan lit le catalogue côté serveur sur le faux OpenRouter", async ({ page, request }) => {
    test.skip(test.info().project.name !== "desktop-clair", "Vérifié une fois, pas dans chaque projet.");
    const avant = (await appelsFaux(request, "openrouter")).appels.filter((a) => a.type === "catalogue").length;
    await page.goto("/studio/bilan");
    await expect(page).toHaveURL(/\/studio\/bilan$/);

    const etat = await appelsFaux(request, "openrouter");
    const catalogues = etat.appels.filter((a) => a.type === "catalogue");
    test.info().annotations.push({ type: "faux OpenRouter", description: `catalogue lu ${catalogues.length - avant} fois pendant ce test` });
    // Cumulatif : le serveur garde le catalogue 10 min, un autre spec a pu le charger avant.
    expect(catalogues.length).toBeGreaterThanOrEqual(1);
    // Le modèle « texte seul » est écarté SANS demande de tarif.
    expect(etat.appels.filter((a) => a.type === "tarif" && a.modele === "recraft/recraft-v4.1-flash")).toEqual([]);
  });
});

test.describe("connecté (compte neuf)", () => {
  test.use({ compte: "neuf" });

  test("/dashboard s'ouvre sur un compte vide, carte de démarrage à l'étape 1", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText(`Bonjour ${COMPTES.neuf.prenom}`)).toBeVisible();
    await expect(page.getByText(/CONFIGURATION · ÉTAPE 1 SUR 3/i)).toBeVisible();
  });
});
