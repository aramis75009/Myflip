/**
 * Mise en vente, étape 5 du PRD « Studio : retouches par lot » : le menu
 * « Version » (PRD 2026-11-16, §13).
 *
 * Desktop clair seulement : le test écrit deux versions en base (coloris
 * white-volt, sac SDN5) et les retire à la fin ; deux projets en parallèle
 * s'y marcheraient dessus. Le serveur répond pour de vrai à
 * GET /api/studio/annonce (SacBase factice → coloris, base e2e → versions) ;
 * les photos sont servies par l'image synthétique du navigateur de test
 * (`/api/studio/image`, jamais une vraie photo). Aucune IA : la génération
 * d'annonce (POST /api/listings/generate) est SIMULÉE et comptée, c'est ce
 * compteur qui prouve « l'IA ne génère que si la version n'a pas de texte ».
 * Toute écriture /api/** est bloquée (garde d'écriture) : rien n'est enregistré.
 */
import { PrismaClient } from "@prisma/client";

import { capturer } from "./outils/capture";
import { DATABASE_URL_E2E } from "./outils/environnement";
import { bloquerEcritures } from "./outils/ecritures";
import { simulerJson } from "./outils/reseau-simule";
import { expect, test, type Page } from "./outils/test";

const USER = "e2edemo00000000000000001";
const COLORIS = "5039-white-volt";
const ORIGINALE = "e2e-ref-bp01";
const IDS = { coloris: "e2e-mev-coloris", v2: "e2e-mev-v2", v3: "e2e-mev-v3", copies: ["e2e-mev-c1", "e2e-mev-c2", "e2e-mev-c3", "e2e-mev-c4"] };

const V2 = {
  titre: "Sac à dos Nike Elite 5039 blanc et volt - très bon état",
  tirets: "- Sac à dos Nike Elite 5039 blanc et volt\n- Fermetures et bretelles en bon état\n- Expédition soignée",
  mots: "sac à dos, Nike Elite, blanc et volt, sac de sport",
  sku: "SDN5-V2",
};
const ANNONCE_IA = {
  titre: "Sac à dos Nike Elite blanc volt — rédigé par l'IA (simulation e2e)",
  description: "Description simulée par la suite e2e, aucun modèle appelé.",
  motsCles: "sac, nike, ia",
  promptNom: "Sacs à dos",
};

const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL_E2E });

test.describe("Mise en vente : menu « Version »", () => {
  test.use({ compte: "demo" });
  test.describe.configure({ mode: "serial" });
  test.skip(({ isMobile }) => isMobile, "Mise en vente avec versions : écran d'ordinateur.");
  // Desktop clair seulement (le mobile est déjà écarté plus haut) : les deux projets desktop écriraient les mêmes lignes en parallèle.
  test.skip(({ colorScheme }) => colorScheme !== "light", "Écrit en base : un seul projet à la fois.");

  test.beforeAll(async () => {
    const coloris = await prisma.studioColoris.upsert({
      where: { userId_cle: { userId: USER, cle: COLORIS } },
      create: { id: IDS.coloris, userId: USER, cle: COLORIS, modele: "Nike Elite 5039", coloris: "White Volt" },
      update: {},
    });
    // Les photos d'une version sont des copies retouchées d'une vraie photo (une copie n'est pas comptée comme photo de plus par l'accueil du Studio).
    for (const [i, id] of IDS.copies.entries()) {
      await prisma.studioReference.upsert({
        where: { id },
        create: {
          id,
          userId: USER,
          colorisId: coloris.id,
          origine: "studio",
          role: "face",
          urlImage: `references/${USER}/e2e-mev-${i + 1}.jpg`,
          copieDeId: ORIGINALE,
          retouche: { angle: 8, modeRotation: "zoom", recadragePct: 0, cadre: null },
          retoucheCle: `e2e-mev-${i + 1}`,
        },
        update: {},
      });
    }
    await prisma.studioVersion.deleteMany({ where: { id: { in: [IDS.v2, IDS.v3] } } });
    // Version 2 : un texte complet et un SKU d'annonce. Version 3 : des photos, mais AUCUN texte.
    await prisma.studioVersion.create({
      data: {
        id: IDS.v2,
        userId: USER,
        colorisId: coloris.id,
        numero: 2,
        skuSource: "SDN5",
        titre: V2.titre,
        description: V2.tirets,
        motsCles: V2.mots,
        skuAnnonce: V2.sku,
        photos: { create: [0, 1].map((i) => ({ referenceId: IDS.copies[i], ordre: i + 1 })) },
      },
    });
    await prisma.studioVersion.create({
      data: {
        id: IDS.v3,
        userId: USER,
        colorisId: coloris.id,
        numero: 3,
        skuSource: "SDN5",
        photos: { create: [2, 3].map((i, n) => ({ referenceId: IDS.copies[i], ordre: n + 1 })) },
      },
    });
  });

  test.afterAll(async () => {
    await prisma.studioVersion.deleteMany({ where: { id: { in: [IDS.v2, IDS.v3] } } });
    await prisma.studioReference.deleteMany({ where: { id: { in: IDS.copies } } });
    await prisma.$disconnect();
  });

  const toast = (page: Page, texte: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: texte }).first();

  async function observerPressePapiers(page: Page) {
    await page.addInitScript(() => {
      const copies: string[] = [];
      Object.assign(window, { __copies: copies });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void copies.push(t) } });
    });
    return () => page.evaluate(() => (window as unknown as { __copies: string[] }).__copies);
  }

  /** Étape 1 → 2 : le SKU est cherché, puis « Continuer ». */
  async function ouvrirFiche(page: Page, sku: string) {
    await page.goto("/mise-en-vente");
    const champ = page.getByPlaceholder("Ex : PRL1");
    await champ.fill(sku);
    await champ.press("Tab");
    const continuer = page.getByRole("button", { name: /^Continuer/ });
    await expect(continuer).toBeEnabled();
    await continuer.click();
    await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible();
  }

  const menu = (page: Page) => page.getByRole("combobox", { name: "Version", exact: true });

  test("un sac sans version (SDN3) : pas de menu, l'IA rédige comme avant", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const generation = await simulerJson(page, { chemin: "/api/listings/generate", methode: "POST" }, 200, ANNONCE_IA);

    await ouvrirFiche(page, "SDN3");
    // L'image validée du Studio rejoint les photos, comme avant l'étape 5.
    await expect(page.getByRole("button", { name: "Agrandir la photo 1" })).toBeVisible();
    await expect(toast(page, /1 image du Studio ajoutée à SDN3/)).toBeVisible();
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByText(/Choisis 2 à 3 photos pour l.IA/)).toBeVisible();

    // Les 2 photos et les caractéristiques : le bouton promet bien une génération.
    await expect(page.getByRole("button", { name: "Générer l'annonce" })).toBeDisabled();
    expect(generation.appels).toBe(0);
    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("version 2 avec texte : ses photos, son titre, ses tirets, ses mots-clés et son SKU, sans IA", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const generation = await simulerJson(page, { chemin: "/api/listings/generate", methode: "POST" }, 200, ANNONCE_IA);
    const copies = await observerPressePapiers(page);
    // Choix mémorisé d'une séance précédente : ici aucun.
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem("myflip-mev-version");
      } catch {
        /* stockage indisponible */
      }
    });

    await ouvrirFiche(page, "SDN5");

    // Le menu existe, la Version 1 (le comportement d'avant) est choisie par défaut : SDN5 n'a aucune image validée.
    await expect(menu(page)).toBeVisible();
    await expect(menu(page)).toHaveValue("1");
    await expect(menu(page).locator("option")).toHaveText(["Version 1 (actuelle) · 0 photo · sans texte", "Version 2 · 2 photos", "Version 3 · 2 photos · sans texte"]);
    await expect(page.getByRole("button", { name: /Agrandir la photo/ })).toHaveCount(0);

    // Version 2 : ses 2 photos arrivent, et l'écran dit que l'IA ne rédige rien.
    await menu(page).selectOption("2");
    await expect(page.getByRole("button", { name: "Agrandir la photo 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agrandir la photo 3" })).toHaveCount(0);
    await expect(toast(page, /2 photos de la Version 2 ajoutées à SDN5/)).toBeVisible();
    await expect(page.getByText(/l.IA ne rédige rien/)).toBeVisible();
    await expect(page.getByText(/Choisis 2 à 3 photos pour l.IA/)).toHaveCount(0);
    // Le toast dure 4 s : la capture ne doit pas l'attraper.
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
    await capturer(page, "mev-version-menu", { pleinePage: true });

    // Le choix est retenu dans le navigateur (aucune colonne, aucune migration).
    expect(await page.evaluate(() => window.localStorage.getItem("myflip-mev-version"))).toBe(JSON.stringify({ SDN5: 2 }));

    // Pas de photo à choisir pour l'IA : taille (« Unique », posée seule pour un sac) et état suffisent.
    await page.getByRole("button", { name: "Très bon état", exact: true }).click();
    const preparer = page.getByRole("button", { name: "Préparer l'annonce" });
    await expect(preparer).toBeEnabled();
    await preparer.click();

    // Direct à l'étape Annonces, sans file de génération ni appel à l'IA.
    await expect(page.getByLabel("Titre de l'annonce SDN5")).toHaveValue(V2.titre);
    await expect(page.getByLabel("Description de l'annonce SDN5")).toHaveValue(V2.tirets);
    await expect(page.getByLabel("Mots-clés de l'annonce SDN5")).toHaveValue(V2.mots);
    await expect(page.getByText(`Version 2 · SKU d'annonce ${V2.sku}`)).toBeVisible();
    await expect(page.getByText("Génération en cours…")).toHaveCount(0);
    expect(generation.appels).toBe(0);

    // La copie garde son format : description, ligne vide, mots-clés, ligne vide, SKU (celui de la version).
    await page.getByRole("button", { name: "Copier", exact: true }).nth(1).click();
    expect((await copies()).at(-1)).toBe(`${V2.tirets}\n\n${V2.mots}\n\n${V2.sku}`);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });
    await capturer(page, "mev-version-annonce", { pleinePage: true });

    // « Copier tout » (titre, description, mots-clés) n'a pas bougé non plus.
    await page.getByRole("button", { name: "Copier tout" }).click();
    expect((await copies()).at(-1)).toBe(`${V2.titre}\n\n${V2.tirets}\n\n${V2.mots}`);

    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("version 3 sans texte : l'IA rédige, sur les photos de la version ; la Version 2 n'est jamais réécrite", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const generation = await simulerJson(page, { chemin: "/api/listings/generate", methode: "POST" }, 200, ANNONCE_IA);

    // Une séance précédente a choisi la Version 2 pour SDN5 (chaque test a son propre navigateur : on pose la mémoire à l'ouverture).
    await page.addInitScript(() => {
      try {
        if (!window.sessionStorage.getItem("e2e-memoire-posee")) {
          window.localStorage.setItem("myflip-mev-version", JSON.stringify({ SDN5: 2 }));
          window.sessionStorage.setItem("e2e-memoire-posee", "1");
        }
      } catch {
        /* stockage indisponible */
      }
    });
    await ouvrirFiche(page, "SDN5");
    await expect(menu(page)).toHaveValue("2");
    await expect(page.getByRole("button", { name: "Agrandir la photo 2" })).toBeVisible();
    await expect(page.getByText(/l.IA ne rédige rien/)).toBeVisible();
    // Version 3 : ses photos remplacent celles de la Version 2, et l'IA est annoncée.
    await menu(page).selectOption("3");
    await expect(page.getByText(/Cette version n.a pas de texte : l.IA le rédigera/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Agrandir la photo 2" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Agrandir la photo 3" })).toHaveCount(0);
    await expect(page.getByText(/Choisis 2 à 3 photos pour l.IA/)).toBeVisible();

    await page.getByRole("button", { name: "Sélectionner la photo 1" }).click();
    await page.getByRole("button", { name: "Sélectionner la photo 2" }).click();
    await page.getByRole("button", { name: "Très bon état", exact: true }).click();
    await page.getByRole("button", { name: "Générer l'annonce" }).click();
    await page.getByRole("button", { name: "Voir les annonces" }).click();

    await expect(page.getByLabel("Titre de l'annonce SDN5")).toHaveValue(ANNONCE_IA.titre);
    expect(generation.appels).toBe(1);
    // Texte de l'IA : SKU du sac, et aucune pastille de version.
    await expect(page.getByText(/SKU d.annonce/)).toHaveCount(0);

    // Retour à la Version 2 : le texte de la version est repris, l'IA n'est PAS rappelée.
    await page.getByRole("button", { name: /^2\. Fiches/ }).click();
    await menu(page).selectOption("2");
    await expect(page.getByRole("button", { name: "Préparer l'annonce" })).toBeEnabled();
    await page.getByRole("button", { name: "Préparer l'annonce" }).click();
    await expect(page.getByLabel("Titre de l'annonce SDN5")).toHaveValue(V2.titre);
    expect(generation.appels).toBe(1);

    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("le contrat de GET /api/studio/annonce : images (Version 1) et versions 2+ avec leurs photos", async ({ page }) => {
    const rep = await page.request.get("/api/studio/annonce?sku=SDN5");
    expect(rep.status()).toBe(200);
    const j = (await rep.json()) as { sku: string; images: unknown[]; versions: { numero: number; titre: string; skuAnnonce: string | null; photos: { id: string; ordre: number }[] }[] };
    expect(j.sku).toBe("SDN5");
    expect(j.images).toEqual([]);
    expect(j.versions.map((v) => v.numero)).toEqual([2, 3]);
    expect(j.versions[0]).toMatchObject({ titre: V2.titre, skuAnnonce: V2.sku, photos: [{ id: IDS.copies[0], ordre: 1 }, { id: IDS.copies[1], ordre: 2 }] });
    expect(j.versions[1]).toMatchObject({ titre: "", skuAnnonce: null });
    // Un sac sans version : `versions` vide, `images` comme avant.
    const sans = (await (await page.request.get("/api/studio/annonce?sku=SDN3")).json()) as { images: unknown[]; versions: unknown[] };
    expect(sans.versions).toEqual([]);
    expect(sans.images).toHaveLength(1);
    // SKU inconnu de SacBase : aucune version, jamais une erreur.
    const inconnu = (await (await page.request.get("/api/studio/annonce?sku=ZZZ9")).json()) as { versions: unknown[] };
    expect(inconnu.versions).toEqual([]);
  });
});
