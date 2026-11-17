/**
 * Studio : retouches par lot et Versions d'un sac (PRD 2026-11-16, étape 2).
 *
 * Desktop seulement. Garde d'écriture sur /api/** : le stockage d'images est
 * « niveau 0 » (aucun jeton), le serveur e2e ne sait ni lire ni écrire une
 * image ; l'enregistrement d'une version (rendu sharp + dépôt) et celui du SKU
 * sont donc SIMULÉS par le test, qui vérifie ce qui part (les corps des
 * requêtes). Le rendu réel est couvert par lib/studioPivotRendu.test.ts,
 * l'orchestration (original intact, 6 photos → 6 copies et une version) par
 * lib/studioVersionLot.test.ts. Ici : l'écran, de la case cochée au texte copié.
 * Rien n'est écrit en base (les mêmes tests tournent en clair et en sombre).
 */
import { nomPrise } from "@/lib/studioCases";

import { bloquerEcritures } from "./outils/ecritures";
import { capturer } from "./outils/capture";
import { expect, test, type Page } from "./outils/test";

const FICHE = "/studio/5039-black-pink";
const TITRE = "Sac à dos Nike Elite 5039 noir et rose - très bon état";
const TIRETS = ["- Sac à dos Nike Elite 5039, coloris noir et rose", "- Fermetures, bretelles et fond en bon état", "- Expédition soignée"].join("\n");
const MOTS = "sac à dos, sac à dos Nike, Nike Elite, sac de sport, noir et rose, backpack";
/** Les six premières photos de la planche de black-pink (seed : prises 1 à 6), dans l'ordre. */
const SIX = [1, 2, 3, 4, 5, 6].map((o) => ({ id: `e2e-ref-bp${String(o).padStart(2, "0")}`, nom: nomPrise(o, "V1") }));

type Envoi = { methode: string; chemin: string; corps: unknown };

test.describe("Studio, retouches par lot et versions", () => {
  test.use({ compte: "demo" });
  test.skip(({ isMobile }) => isMobile, "Studio : écrans d'ordinateur.");

  const toast = (page: Page, texte: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: texte }).first();

  async function ouvrirSection(page: Page, nom: string) {
    const bouton = page.getByRole("heading", { level: 2, name: new RegExp(`^${nom}`) }).getByRole("button");
    if ((await bouton.getAttribute("aria-expanded")) !== "true") await bouton.click();
    await expect(bouton).toHaveAttribute("aria-expanded", "true");
  }

  /** Le presse-papiers est observé : chaque texte copié est noté (Chromium headless refuse l'accès réel). */
  async function observerPressePapiers(page: Page) {
    await page.addInitScript(() => {
      const copies: string[] = [];
      Object.assign(window, { __copies: copies });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async (t: string) => void copies.push(t) },
      });
    });
    return () => page.evaluate(() => (window as unknown as { __copies: string[] }).__copies);
  }

  /** Le serveur, simulé : POST d'une version (rendu + dépôt impossibles ici) et PATCH de son SKU. */
  async function simulerVersions(page: Page) {
    const envois: Envoi[] = [];
    await page.route("**/api/studio/versions", async (route) => {
      const r = route.request();
      const corps = r.postDataJSON() as { referenceIds: string[]; skuSource: string };
      envois.push({ methode: r.method(), chemin: new URL(r.url()).pathname, corps });
      const version = {
        id: "e2e-version-2",
        numero: 2,
        skuSource: corps.skuSource,
        titre: TITRE,
        description: TIRETS,
        motsCles: MOTS,
        skuAnnonce: null,
        createdAt: "2026-11-17T10:00:00.000Z",
        photos: corps.referenceIds.map((_, i) => `e2e-copie-${i + 1}`),
      };
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ version, copiesCreees: corps.referenceIds.length, copiesReprises: 0, originales: 0 }) });
    });
    await page.route("**/api/studio/versions/*", async (route) => {
      const r = route.request();
      const corps = r.postDataJSON() as { skuAnnonce: string | null };
      envois.push({ methode: r.method(), chemin: new URL(r.url()).pathname, corps });
      const version = {
        id: "e2e-version-2",
        numero: 2,
        skuSource: "SDN3",
        titre: TITRE,
        description: TIRETS,
        motsCles: MOTS,
        skuAnnonce: corps.skuAnnonce,
        createdAt: "2026-11-17T10:00:00.000Z",
        photos: SIX.map((_, i) => `e2e-copie-${i + 1}`),
      };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ version }) });
    });
    return envois;
  }

  test("cocher, retoucher, enregistrer en Version 2, saisir le SKU, copier titre et description", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const copies = await observerPressePapiers(page);
    const envois = await simulerVersions(page);

    await page.goto(FICHE);
    await ouvrirSection(page, "Photos");
    const retoucher = page.getByRole("button", { name: /^Retoucher/ });
    await expect(retoucher).toBeDisabled();

    // « Tout cocher » coche les 9 photos de la planche, « Tout décocher » les retire.
    await page.getByRole("button", { name: "Tout cocher" }).click();
    await expect(retoucher).toHaveText("Retoucher 9 photos");
    await page.getByRole("button", { name: "Tout décocher" }).click();
    await expect(retoucher).toHaveText("Retoucher");

    // Six photos : cinq par leur case, la sixième en cliquant sur la photo elle-même.
    for (const p of SIX.slice(0, 5)) await page.getByRole("checkbox", { name: `Retoucher la photo ${p.nom}`, exact: true }).check();
    await page.getByRole("img", { name: `Photo ${SIX[5].nom}`, exact: true }).click();
    await expect(page.getByRole("checkbox", { name: `Retoucher la photo ${SIX[5].nom}`, exact: true })).toBeChecked();
    await expect(retoucher).toHaveText("Retoucher 6 photos");
    await capturer(page, "retouches.planche-cochee", { attendreReseau: false, pleinePage: false });

    // Le panneau : un aperçu par photo cochée.
    await retoucher.click();
    const panneau = page.getByRole("dialog", { name: "Retoucher 6 photos" });
    await expect(panneau).toBeVisible();
    const apercus = panneau.getByTestId("apercu-retouche");
    await expect(apercus).toHaveCount(6);
    const premiereImage = panneau.getByAltText(`Aperçu de la photo « ${SIX[0].nom} »`);
    // Centrée sur sa zone, ni tournée ni agrandie.
    await expect(premiereImage).toHaveAttribute("style", /transform: translate\(-50%, -50%\);/);

    // Pivoter : la case et le curseur restent synchronisés ; l'aperçu tourne.
    const curseur = panneau.getByRole("slider", { name: "Angle de rotation" });
    const saisie = panneau.getByRole("textbox", { name: "Angle exact, en degrés" });
    await saisie.fill("8");
    await expect(curseur).toHaveValue("8");
    await expect(premiereImage).toHaveAttribute("style", /rotate\(8deg\) scale\(1\.1758/);
    await expect(panneau.getByText("Agrandie de ×1,18 : aucun coin vide.")).toBeVisible();
    await curseur.fill("-12");
    await expect(saisie).toHaveValue("-12");
    await saisie.fill("8");

    // Mode « bords blancs » : l'image entière, plus petite.
    await panneau.getByRole("radio", { name: "Bords blancs (image entière)" }).click();
    await expect(panneau.getByRole("radio", { name: "Bords blancs (image entière)" })).toHaveAttribute("aria-checked", "true");
    await expect(panneau.getByText("Image entière : les coins restent blancs.")).toBeVisible();
    await expect(premiereImage).toHaveAttribute("style", /rotate\(8deg\) scale\(0\.8504/);

    // Recadrer de 10 %.
    await panneau.getByRole("slider", { name: "Recadrage, en pourcentage" }).fill("10");

    // Cadre : éteint par défaut, ses réglages hors d'atteinte ; allumé, beige, 4 %, bord adouci 35 %.
    const cadre = panneau.getByRole("switch", { name: "Cadre" });
    await expect(cadre).toHaveAttribute("aria-checked", "false");
    await cadre.click();
    await expect(cadre).toHaveAttribute("aria-checked", "true");
    await panneau.getByRole("radio", { name: "Beige" }).click();
    await expect(panneau.getByRole("radio", { name: "Beige" })).toHaveAttribute("aria-checked", "true");
    await expect(panneau.getByRole("slider", { name: "Épaisseur" })).toHaveValue("4");
    await expect(panneau.getByRole("slider", { name: "Bord adouci" })).toHaveValue("35");
    await expect(apercus.first()).toHaveCSS("background-color", "rgb(230, 220, 203)");
    await expect(apercus.first().locator("canvas")).toHaveCount(1);
    await expect(panneau.getByText("Les originales ne changent pas : 6 copies iront dans la Version 2.")).toBeVisible();
    await capturer(page, "retouches.panneau", { attendreReseau: false, pleinePage: false });

    // Enregistrer en Version 2 : UN envoi, les photos dans l'ordre de la planche, les réglages complets.
    await panneau.getByRole("button", { name: "Enregistrer en Version 2" }).click();
    await expect(toast(page, "Version 2 enregistrée : 6 copies. Les originales n’ont pas changé.")).toBeVisible();
    await expect(panneau).toBeHidden();
    expect(envois).toEqual([
      {
        methode: "POST",
        chemin: "/api/studio/versions",
        corps: {
          cle: "5039-black-pink",
          skuSource: "SDN3",
          referenceIds: SIX.map((p) => p.id),
          retouche: { angle: 8, modeRotation: "bordsBlancs", recadragePct: 10, cadre: { couleur: "#e6dccb", epaisseurPct: 4, adoucissement: 35 } },
        },
      },
    ]);

    // L'écran Versions s'ouvre sur la Version 2 : ses six photos, son texte, la case SKU vide.
    const onglet2 = page.getByRole("tab", { name: /^Version 2/ });
    await expect(onglet2).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tab", { name: /^Version 1 \(actuelle\)/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "Photos de la Version 2" }).getByRole("listitem")).toHaveCount(6);
    // Depuis l'étape 4, titre, tirets et mots-clés d'une version 2+ sont des champs modifiables à la main.
    await expect(page.getByRole("textbox", { name: "Titre" })).toHaveValue(TITRE);
    await expect(page.getByTestId("version-tirets")).toHaveValue(TIRETS);
    await expect(page.getByTestId("version-mots-cles")).toHaveValue(MOTS);

    // Le SKU d'annonce : saisi, enregistré (PATCH), repris par la ligne SKU et par la carte.
    const sku = page.getByRole("textbox", { name: "SKU d’annonce" });
    await expect(sku).toHaveValue("");
    await sku.fill("sdn40");
    await expect(page.getByTestId("version-ligne-sku")).toHaveText("SDN40");
    await sku.press("Enter");
    await expect(page.getByText("Enregistré", { exact: true })).toBeVisible();
    expect(envois.at(-1)).toEqual({ methode: "PATCH", chemin: "/api/studio/versions/e2e-version-2", corps: { skuAnnonce: "SDN40" } });
    await expect(sku).toHaveValue("SDN40");
    await expect(onglet2).toContainText("SDN40 · 6 photos");

    // Copier le titre, puis la description : tirets, UNE ligne vide, mots-clés, SKU juste en dessous.
    await page.getByRole("button", { name: "Copier le titre" }).click();
    await expect(toast(page, "Titre de la Version 2 copié.")).toBeVisible();
    await page.getByRole("button", { name: "Copier la description" }).click();
    await expect(toast(page, "Description de la Version 2 copiée.")).toBeVisible();
    expect(await copies()).toEqual([TITRE, `${TIRETS}\n\n${MOTS}\nSDN40`]);
    await page.getByRole("tabpanel").evaluate((el) => el.scrollIntoView({ block: "end" }));
    await capturer(page, "retouches.versions", { attendreReseau: false, pleinePage: false });

    // La Version 1 : l'annonce actuelle de SDN3, son SKU non modifiable, ses images validées.
    await page.getByRole("tab", { name: /^Version 1 \(actuelle\)/ }).click();
    await expect(page.getByRole("textbox", { name: "SKU d’annonce" })).toHaveValue("SDN3");
    await expect(page.getByRole("textbox", { name: "SKU d’annonce" })).toHaveAttribute("readonly", "");
    await expect(page.getByRole("list", { name: "Photos de la Version 1 (actuelle)" }).getByRole("listitem")).not.toHaveCount(0);

    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("« Annuler » ne fait rien : aucune requête, la planche garde ses cases cochées et le panneau ses réglages", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const envois = await simulerVersions(page);
    await page.goto(FICHE);
    await ouvrirSection(page, "Photos");
    await page.getByRole("checkbox", { name: `Retoucher la photo ${SIX[0].nom}`, exact: true }).check();
    await page.getByRole("button", { name: "Retoucher 1 photo" }).click();
    const panneau = page.getByRole("dialog", { name: "Retoucher 1 photo" });
    // Sans aucune retouche, la version reprendrait les photos d'origine : l'écran le dit.
    await expect(panneau.getByText("Aucune retouche : les photos d’origine iront telles quelles dans la Version 2.")).toBeVisible();
    await panneau.getByRole("textbox", { name: "Angle exact, en degrés" }).fill("-5");
    await panneau.getByRole("button", { name: "Annuler" }).click();
    await expect(panneau).toBeHidden();
    await expect(page.getByRole("checkbox", { name: `Retoucher la photo ${SIX[0].nom}`, exact: true })).toBeChecked();
    await page.getByRole("button", { name: "Retoucher 1 photo" }).click();
    await expect(page.getByRole("slider", { name: "Angle de rotation" })).toHaveValue("-5");
    expect(envois).toEqual([]);
    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });
});
