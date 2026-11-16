/**
 * Studio : l'outil « Pivoter » d'une photo de la planche.
 *
 * Desktop seulement. Garde d'écriture sur /api/** : le stockage d'images est
 * « niveau 0 » (aucun jeton), le serveur e2e ne sait donc ni lire ni écrire une
 * image ; l'enregistrement est SIMULÉ par une réponse du test, et le test vérifie
 * ce qui part (le corps du POST). Le rendu réel (sharp) est couvert par
 * lib/studioPivotRendu.test.ts ; ici on vérifie l'écran : curseur et case
 * synchronisés, aperçu en direct, Annuler qui ne fait rien.
 */
import { bloquerEcritures } from "./outils/ecritures";
import { capturer } from "./outils/capture";
import { expect, test, type Page } from "./outils/test";

const FICHE = "/studio/5039-black-pink";

test.describe("Studio, pivoter une photo", () => {
  test.use({ compte: "demo" });
  test.skip(({ isMobile }) => isMobile, "Studio : écrans d'ordinateur.");

  const toast = (page: Page, texte: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: texte }).first();

  async function ouvrirOutil(page: Page) {
    await page.goto(FICHE);
    const bouton = page.getByRole("heading", { level: 2, name: /^Photos/ }).getByRole("button");
    if ((await bouton.getAttribute("aria-expanded")) !== "true") await bouton.click();
    await page.getByRole("button", { name: "Actions pour la photo Face", exact: true }).click();
    await page.getByRole("menuitem", { name: /Pivoter la photo/ }).click();
    const fenetre = page.getByRole("dialog", { name: "Pivoter « Face »" });
    await expect(fenetre).toBeVisible();
    // L'aperçu connaît la taille de l'image (le cadre prend son ratio) quand elle est chargée.
    await expect.poll(() => fenetre.getByTestId("apercu-pivot").evaluate((el) => el.getBoundingClientRect().width / el.getBoundingClientRect().height)).toBeCloseTo(600 / 800, 2);
    return fenetre;
  }

  test("curseur et case restent synchronisés ; l'aperçu tourne et s'agrandit ; Enregistrer attend un angle", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const fenetre = await ouvrirOutil(page);
    const curseur = fenetre.getByRole("slider", { name: "Angle" });
    const saisie = fenetre.getByRole("textbox", { name: "Angle exact, en degrés" });
    const apercu = fenetre.getByAltText(/Aperçu de la photo « Face »/);
    const enregistrer = fenetre.getByRole("button", { name: "Enregistrer une copie" });

    // À 0° : rien n'est transformé, rien à enregistrer.
    await expect(curseur).toHaveAttribute("min", "-45");
    await expect(curseur).toHaveAttribute("max", "45");
    await expect(curseur).toHaveAttribute("step", "1");
    await expect(curseur).toHaveValue("0");
    await expect(saisie).toHaveValue("0");
    await expect(apercu).toHaveCSS("transform", "none");
    await expect(enregistrer).toBeDisabled();

    // Curseur → case et aperçu. 600 × 800 à 8° : agrandi de 1,1758.
    await curseur.fill("8");
    await expect(saisie).toHaveValue("8");
    await expect(apercu).toHaveAttribute("style", /rotate\(8deg\) scale\(1\.1758/);
    await expect(apercu).toHaveAttribute("alt", /pivotée de \+8°/);
    await expect(fenetre.getByText(/Agrandie de ×1,18/)).toBeVisible();
    await expect(enregistrer).toBeEnabled();
    await capturer(page, "pivoter.dialogue-8", { attendreReseau: false });

    // Case → curseur et aperçu, signe moins compris.
    await saisie.fill("-8");
    await expect(curseur).toHaveValue("-8");
    await expect(apercu).toHaveAttribute("style", /rotate\(-8deg\) scale\(1\.1758/);

    // Hors plage : ramené au bord, et la case montre ce qui est vraiment appliqué.
    await saisie.fill("90");
    await expect(saisie).toHaveValue("45");
    await expect(curseur).toHaveValue("45");
    await saisie.fill("-200");
    await expect(saisie).toHaveValue("-45");

    // Flèches dans la case : ±1.
    await saisie.fill("10");
    await saisie.press("ArrowUp");
    await expect(curseur).toHaveValue("11");
    await saisie.press("ArrowDown");
    await saisie.press("ArrowDown");
    await expect(curseur).toHaveValue("9");

    // Texte invalide : l'angle ne bouge pas, la case se remet d'aplomb en quittant le champ.
    await saisie.fill("abc");
    await expect(curseur).toHaveValue("9");
    await saisie.blur();
    await expect(saisie).toHaveValue("9");

    // Retour à 0°.
    await fenetre.getByRole("button", { name: "À 0°" }).click();
    await expect(curseur).toHaveValue("0");
    await expect(apercu).toHaveCSS("transform", "none");
    await expect(enregistrer).toBeDisabled();

    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("« Annuler » ne fait rien : aucune requête d'écriture, la fenêtre se ferme", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const fenetre = await ouvrirOutil(page);
    await fenetre.getByRole("slider", { name: "Angle" }).fill("12");
    await fenetre.getByRole("button", { name: "Annuler" }).click();
    await expect(fenetre).toBeHidden();
    // Rouvrir repart de 0° : rien n'a été gardé.
    await page.getByRole("button", { name: "Actions pour la photo Face", exact: true }).click();
    await page.getByRole("menuitem", { name: /Pivoter la photo/ }).click();
    await expect(page.getByRole("slider", { name: "Angle" })).toHaveValue("0");
    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("« Enregistrer une copie » envoie un seul POST avec l'angle ; un doublon (409) est dit clairement", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const envois: { chemin: string; corps: unknown }[] = [];
    let reponse: { status: number; body: unknown } = { status: 201, body: { id: "e2e-copie", angle: 8, largeur: 600, hauteur: 800 } };
    await page.route("**/api/studio/references/*/pivoter", async (route) => {
      const r = route.request();
      envois.push({ chemin: new URL(r.url()).pathname, corps: r.postDataJSON() });
      await route.fulfill({ status: reponse.status, contentType: "application/json", body: JSON.stringify(reponse.body) });
    });

    const fenetre = await ouvrirOutil(page);
    await fenetre.getByRole("textbox", { name: "Angle exact, en degrés" }).fill("8");
    await fenetre.getByRole("button", { name: "Enregistrer une copie" }).click();
    await expect(toast(page, "Copie à +8° enregistrée à côté de la photo « Face ».")).toBeVisible();
    await expect(fenetre).toBeHidden();
    expect(envois).toHaveLength(1);
    expect(envois[0].chemin).toMatch(/^\/api\/studio\/references\/e2e-ref-[^/]+\/pivoter$/);
    expect(envois[0].corps).toEqual({ angle: 8 });

    // La même copie existe déjà : l'avertissement du serveur est relayé, rien ne s'ajoute.
    reponse = { status: 409, body: { error: "Une copie à −8° existe déjà.", code: "deja_la", id: "e2e-copie" } };
    await page.getByRole("button", { name: "Actions pour la photo Face", exact: true }).click();
    await page.getByRole("menuitem", { name: /Pivoter la photo/ }).click();
    await page.getByRole("textbox", { name: "Angle exact, en degrés" }).fill("-8");
    await page.getByRole("button", { name: "Enregistrer une copie" }).click();
    await expect(toast(page, "Une copie à −8° existe déjà.")).toBeVisible();
    expect(envois).toHaveLength(2);
    expect(envois[1].corps).toEqual({ angle: -8 });

    expect(garde.bloquees).toEqual([]);
    // Seule erreur admise : le 409 simulé, que Chromium journalise comme toute réponse en erreur.
    expect(journalConsole.erreurs.filter((e) => !/status of 409/.test(e.texte))).toEqual([]);
  });
});
