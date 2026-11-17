/**
 * Studio, étape 4 : « Reformuler », modification à la main du texte d'une
 * version, téléchargement des photos et réglages de retouche (PRD 2026-11-16).
 *
 * Desktop seulement. Garde d'écriture sur /api/** (e2e/outils/ecritures.ts) :
 * le serveur e2e ne sait ni lire ni écrire une image et n'a aucune clé d'IA.
 * Le serveur de versions est donc SIMULÉ par le test, qui note chaque requête
 * (dans l'ordre) et répond comme la vraie route :
 *   • POST /api/studio/versions : crée la Version 2 (puis la 3) ;
 *   • PATCH /api/studio/versions/<id> : n'écrit QUE les champs du corps ;
 *   • POST /api/studio/versions/<id>/reformuler : la réponse IA est INTERCEPTÉE
 *     (aucune IA réelle, aucune clé) ;
 *   • le zip n'est pas simulé : un téléchargement lancé par un lien `download` ne passe pas par
 *     `page.route` (Chromium le gère hors du réseau de la page) ; on vérifie le lien, et le
 *     vrai serveur par `request`.
 * Les règles elles-mêmes sont couvertes par vitest (lib/studioReformulation,
 * lib/studioVersion, lib/studioZip, lib/studioReglagesVersion). Ici : l'écran,
 * du clic à ce qui part sur le réseau.
 */
import { nomPrise } from "@/lib/studioCases";

import { request as playwrightRequest } from "@playwright/test";

import { bloquerEcritures } from "./outils/ecritures";
import { capturer } from "./outils/capture";
import { expect, test, type Page } from "./outils/test";

const FICHE = "/studio/5039-black-pink";
/** Les six premières photos de la planche de black-pink (seed : prises 1 à 6), dans l'ordre. */
const SIX = [1, 2, 3, 4, 5, 6].map((o) => nomPrise(o, "V1"));
const TITRE = "Sac à dos Nike Elite 5039 noir et rose - très bon état";
const TIRETS = ["- Sac à dos Nike Elite 5039, coloris noir et rose", "- Fermetures, bretelles et fond en bon état", "- Expédition soignée"].join("\n");
const MOTS = "sac à dos, sac à dos Nike, Nike Elite, sac de sport, noir et rose, backpack";
const BEIGE = { couleur: "#e6dccb", epaisseurPct: 4, adoucissement: 35 };

type Retouche = { angle: number; modeRotation: "zoom" | "bordsBlancs"; recadragePct: number; cadre: null | typeof BEIGE };
type Version = {
  id: string;
  numero: number;
  skuSource: string | null;
  titre: string;
  description: string;
  motsCles: string;
  skuAnnonce: string | null;
  createdAt: string;
  photos: string[];
  retouches: Retouche[];
};
/** Une requête vue par le faux serveur, dans l'ordre. */
type Requete = { methode: string; chemin: string; corps: unknown };

const UNIFORME: Retouche = { angle: 8, modeRotation: "zoom", recadragePct: 10, cadre: BEIGE };

test.describe("Studio, étape 4 : reformuler, modifier à la main, télécharger", () => {
  test.use({ compte: "demo" });
  test.skip(({ isMobile }) => isMobile, "Studio : écrans d'ordinateur.");

  const toast = (page: Page, texte: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: texte }).first();

  async function ouvrirSection(page: Page, nom: string) {
    const bouton = page.getByRole("heading", { level: 2, name: new RegExp(`^${nom}`) }).getByRole("button");
    if ((await bouton.getAttribute("aria-expanded")) !== "true") await bouton.click();
    await expect(bouton).toHaveAttribute("aria-expanded", "true");
  }

  async function observerPressePapiers(page: Page) {
    await page.addInitScript(() => {
      const copies: string[] = [];
      Object.assign(window, { __copies: copies });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => void copies.push(t) } });
    });
    return () => page.evaluate(() => (window as unknown as { __copies: string[] }).__copies);
  }

  /** Les deux propositions de l'IA, rendues dans l'ordre ; ensuite la première revient. */
  const PROPOSITIONS = [
    { titre: "Sac à dos Nike Elite 5039 noir et rose - excellent état", motsCles: MOTS.replace("sac de sport", "sac sport").replace("backpack", "rucksack") },
    { titre: "Sac à dos de sport Nike Elite 5039 noir et rose - très bon état", motsCles: MOTS.replace("noir et rose", "rose et noir") },
  ];

  /**
   * Le serveur des versions, simulé. `etat` est la version telle que la base la
   * tiendrait : le PATCH n'y écrit que les champs reçus (comme la vraie route).
   */
  async function simulerServeur(page: Page, options: { reponseIA?: "propositions" | "inutilisable" } = {}) {
    const journal: Requete[] = [];
    const versions = new Map<string, Version>();
    const vusParIA: { titre: string; motsCles: string }[] = [];
    const retouches = [Array.from({ length: 6 }, () => UNIFORME), [UNIFORME, UNIFORME, { angle: -3, modeRotation: "zoom" as const, recadragePct: 0, cadre: null }, UNIFORME, UNIFORME, UNIFORME]];
    let creations = 0;
    let propositions = 0;

    await page.route(
      (url) => url.pathname.startsWith("/api/studio/versions"),
      async (route) => {
        const r = route.request();
        const chemin = new URL(r.url()).pathname;
        const json = (status: number, corps: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(corps) });

        const corps = r.method() === "GET" ? null : (r.postDataJSON?.() ?? null);
        if (r.method() === "POST" && chemin === "/api/studio/versions") {
          const c = corps as { referenceIds: string[]; skuSource: string };
          journal.push({ methode: r.method(), chemin, corps: c });
          creations++;
          const numero = creations + 1;
          const v: Version = {
            id: `e2e-version-${numero}`,
            numero,
            skuSource: c.skuSource,
            titre: TITRE,
            description: TIRETS,
            motsCles: MOTS,
            skuAnnonce: null,
            createdAt: "2026-11-17T10:00:00.000Z",
            photos: c.referenceIds.map((_, i) => `e2e-copie-${numero}-${i + 1}`),
            retouches: retouches[Math.min(creations, 2) - 1].slice(0, c.referenceIds.length),
          };
          versions.set(v.id, v);
          await json(201, { version: v, copiesCreees: c.referenceIds.length, copiesReprises: 0, originales: 0 });
          return;
        }

        const m = chemin.match(/^\/api\/studio\/versions\/([^/]+)(\/reformuler)?$/);
        const v = m ? versions.get(m[1]) : undefined;
        if (r.method() === "PATCH" && m && !m[2] && v) {
          journal.push({ methode: "PATCH", chemin, corps });
          // Comme la route : seuls les champs PRÉSENTS dans le corps sont écrits.
          for (const cle of ["titre", "description", "motsCles", "skuAnnonce"] as const) {
            if (corps && typeof corps === "object" && cle in (corps as object)) (v as Record<string, unknown>)[cle] = (corps as Record<string, unknown>)[cle];
          }
          await json(200, { version: v });
          return;
        }
        if (r.method() === "POST" && m && m[2] && v) {
          journal.push({ methode: "POST", chemin, corps });
          // La reformulation part de ce qui est ENREGISTRÉ : on note ce que le serveur « voit ».
          vusParIA.push({ titre: v.titre, motsCles: v.motsCles });
          if (options.reponseIA === "inutilisable") {
            await json(502, { error: "Proposition inutilisable, réessaie", code: "proposition_inutilisable" });
            return;
          }
          await json(200, { proposition: PROPOSITIONS[propositions++ % PROPOSITIONS.length] });
          return;
        }
        await route.fallback();
      },
    );
    return { journal, versions, vusParIA };
  }

  /** Coche les `nbPhotos` premières photos, retouche, « Enregistrer en Version N » : le serveur simulé crée la version. */
  async function creerVersion(page: Page, numero: number, nbPhotos = 1) {
    await ouvrirSection(page, "Photos");
    for (const nom of SIX.slice(0, nbPhotos)) await page.getByRole("checkbox", { name: `Retoucher la photo ${nom}`, exact: true }).check();
    await page.getByRole("button", { name: nbPhotos === 1 ? "Retoucher 1 photo" : `Retoucher ${nbPhotos} photos`, exact: true }).click();
    const panneau = page.getByRole("dialog", { name: /^Retoucher/ });
    await panneau.getByRole("button", { name: `Enregistrer en Version ${numero}` }).click();
    await expect(toast(page, new RegExp(`^Version ${numero} enregistrée`))).toBeVisible();
    await expect(panneau).toBeHidden();
    await expect(page.getByRole("tab", { name: new RegExp(`^Version ${numero}`) })).toHaveAttribute("aria-selected", "true");
  }

  /** Pour les captures : une fenêtre assez haute, calée sur le détail de la version. */
  async function cadrer(page: Page) {
    await page.setViewportSize({ width: 1440, height: 1500 });
    await page.getByRole("tabpanel").evaluate((el) => {
      el.scrollIntoView({ block: "start" });
      window.scrollBy(0, -90); // sous l'en-tête collant
    });
  }

  const ecrits = (journal: Requete[]) => journal.filter((q) => q.methode === "PATCH");
  const reformulations = (journal: Requete[]) => journal.filter((q) => q.chemin.endsWith("/reformuler"));

  test("Version 1 : lecture seule, pas de Reformuler ; aucun appel IA sans clic", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const serveur = await simulerServeur(page);
    await page.goto(FICHE);
    await creerVersion(page, 2);

    await page.getByRole("tab", { name: /^Version 1 \(actuelle\)/ }).click();
    await expect(page.getByText("La Version 1 est l’annonce actuelle : elle n’est pas reformulée.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reformuler", exact: true })).toHaveCount(0);
    // L'annonce actuelle ne se modifie pas ici : ni titre, ni tirets, ni mots-clés en champ de saisie.
    await expect(page.getByRole("textbox", { name: "Titre" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Tirets" })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Mots-clés" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enregistrer", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("version-tirets")).toBeVisible();
    // Pas de ligne de réglages : ce sont les images de l'annonce actuelle.
    await expect(page.getByTestId("version-reglages")).toHaveCount(0);

    // La Version 2, ouverte puis quittée, retouchée ou non : aucune reformulation n'est partie.
    await page.getByRole("tab", { name: /^Version 2/ }).click();
    await page.getByRole("tab", { name: /^Version 1 \(actuelle\)/ }).click();
    expect(reformulations(serveur.journal)).toEqual([]);
    expect(ecrits(serveur.journal)).toEqual([]);
    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("modifier à la main le titre, les tirets et les mots-clés : chaque enregistrement n'envoie que son champ", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const copies = await observerPressePapiers(page);
    const serveur = await simulerServeur(page);
    await page.goto(FICHE);
    await creerVersion(page, 2);

    const titre = page.getByRole("textbox", { name: "Titre" });
    const tirets = page.getByRole("textbox", { name: "Tirets" });
    const mots = page.getByRole("textbox", { name: "Mots-clés" });
    await expect(titre).toHaveValue(TITRE);
    await expect(tirets).toHaveValue(TIRETS);
    await expect(mots).toHaveValue(MOTS);

    // Titre : Entrée enregistre.
    const nouveauTitre = "Sac à dos Nike Elite 5039 noir et rose - bon état";
    await titre.fill(nouveauTitre);
    await expect(page.getByText(`${[...nouveauTitre].length} car.`, { exact: true })).toBeVisible();
    await titre.press("Enter");
    await expect(page.getByText("Enregistré", { exact: true }).first()).toBeVisible();
    expect(ecrits(serveur.journal).at(-1)).toEqual({ methode: "PATCH", chemin: "/api/studio/versions/e2e-version-2", corps: { titre: nouveauTitre } });

    // Tirets (plusieurs lignes) : le bouton « Enregistrer » est visible ; sans rien à enregistrer, il ne part rien.
    const enregistrer = page.getByRole("button", { name: "Enregistrer", exact: true });
    await expect(enregistrer).toBeVisible();
    await enregistrer.click();
    expect(ecrits(serveur.journal)).toHaveLength(1);
    const nouveauxTirets = ["- Sac à dos Nike Elite 5039, noir et rose", "- Bretelles et fond en très bon état", "- Envoi sous 24 h"].join("\n");
    await tirets.fill(nouveauxTirets);
    await enregistrer.click();
    await expect.poll(() => ecrits(serveur.journal).length).toBe(2);
    expect(ecrits(serveur.journal).at(-1)).toEqual({ methode: "PATCH", chemin: "/api/studio/versions/e2e-version-2", corps: { description: nouveauxTirets } });

    // Mots-clés : en quittant le champ.
    await mots.fill("sac à dos,  Nike Elite ,rucksack");
    await mots.press("Tab");
    await expect.poll(() => ecrits(serveur.journal).length).toBe(3);
    expect(ecrits(serveur.journal).at(-1)).toEqual({ methode: "PATCH", chemin: "/api/studio/versions/e2e-version-2", corps: { motsCles: "sac à dos, Nike Elite, rucksack" } });
    await expect(mots).toHaveValue("sac à dos, Nike Elite, rucksack");

    // Chaque PATCH n'a envoyé QU'UN champ ; le reste de la version est resté tel quel côté « base ».
    for (const q of ecrits(serveur.journal)) expect(Object.keys(q.corps as object)).toHaveLength(1);
    expect(serveur.versions.get("e2e-version-2")).toMatchObject({ titre: nouveauTitre, description: nouveauxTirets, motsCles: "sac à dos, Nike Elite, rucksack", skuAnnonce: null });

    // « Copier la description » copie la description MODIFIÉE (tirets, ligne vide, mots-clés, SKU juste dessous).
    const sku = page.getByRole("textbox", { name: "SKU d’annonce" });
    await sku.fill("sdn40");
    await sku.press("Enter");
    await expect.poll(() => ecrits(serveur.journal).length).toBe(4);
    expect(ecrits(serveur.journal).at(-1)?.corps).toEqual({ skuAnnonce: "SDN40" });
    await page.getByRole("button", { name: "Copier la description" }).click();
    await page.getByRole("button", { name: "Copier le titre" }).click();
    expect(await copies()).toEqual([`${nouveauxTirets}\n\nsac à dos, Nike Elite, rucksack\nSDN40`, nouveauTitre]);

    // Un titre de plus de 100 caractères n'est pas enregistré.
    const avant = ecrits(serveur.journal).length;
    await titre.fill("x".repeat(101));
    await expect(page.getByText("101 car. · 100 au plus")).toBeVisible();
    await titre.press("Enter");
    await expect(toast(page, /Titre non enregistré : Titre trop long/)).toBeVisible();
    expect(ecrits(serveur.journal)).toHaveLength(avant);

    // Rien de tout cela n'a appelé l'IA.
    expect(reformulations(serveur.journal)).toEqual([]);
    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("Reformuler : surlignage, Proposer autre chose, Fermer n'enregistre rien, Garder n'écrit que le titre et les mots-clés", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const serveur = await simulerServeur(page);
    await page.goto(FICHE);
    await creerVersion(page, 2, 6);
    // La création d'une version ne reformule rien.
    expect(reformulations(serveur.journal)).toEqual([]);

    const titre = page.getByRole("textbox", { name: "Titre" });
    const mots = page.getByRole("textbox", { name: "Mots-clés" });
    const tirets = page.getByRole("textbox", { name: "Tirets" });
    const marques = (id: string) => page.getByTestId(id).locator("mark").allTextContents();

    // Un clic : UN appel, une proposition ; les mots changés sont surlignés.
    await page.getByRole("button", { name: "Reformuler", exact: true }).click();
    const encadre = page.getByRole("region", { name: "Proposition de reformulation" });
    await expect(encadre).toBeVisible();
    await expect(page.getByTestId("proposition-titre")).toHaveText(PROPOSITIONS[0].titre);
    expect(await marques("proposition-titre")).toEqual(["excellent"]);
    expect(await marques("proposition-mots-cles")).toEqual(["sac sport", "rucksack"]);
    await expect(encadre.getByText("Les tirets et le SKU ne bougent pas.")).toBeVisible();
    expect(reformulations(serveur.journal)).toHaveLength(1);
    expect(reformulations(serveur.journal)[0].chemin).toBe("/api/studio/versions/e2e-version-2/reformuler");
    await cadrer(page);
    await capturer(page, "reformuler.proposition", { attendreReseau: false, pleinePage: false });

    // Proposer autre chose : un deuxième appel, une autre proposition, surlignée contre le texte ENREGISTRÉ.
    await encadre.getByRole("button", { name: "Proposer autre chose" }).click();
    await expect(page.getByTestId("proposition-titre")).toHaveText(PROPOSITIONS[1].titre);
    expect(await marques("proposition-titre")).toEqual(["de", "sport"]);
    expect(await marques("proposition-mots-cles")).toEqual(["rose et noir"]);
    expect(reformulations(serveur.journal)).toHaveLength(2);

    // Fermer : rien n'est enregistré, le texte de la version n'a pas bougé.
    await encadre.getByRole("button", { name: "Fermer la proposition" }).click();
    await expect(encadre).toBeHidden();
    await expect(titre).toHaveValue(TITRE);
    await expect(mots).toHaveValue(MOTS);
    expect(ecrits(serveur.journal)).toEqual([]);

    // Reformuler, puis Garder : UN PATCH, titre et mots-clés SEULEMENT.
    await page.getByRole("button", { name: "Reformuler", exact: true }).click();
    await expect(page.getByTestId("proposition-titre")).toHaveText(PROPOSITIONS[0].titre);
    await page.getByRole("button", { name: "Garder" }).click();
    await expect(toast(page, "Titre et mots-clés de la Version 2 mis à jour.")).toBeVisible();
    await expect(encadre).toBeHidden();
    expect(ecrits(serveur.journal)).toEqual([
      { methode: "PATCH", chemin: "/api/studio/versions/e2e-version-2", corps: { titre: PROPOSITIONS[0].titre, motsCles: PROPOSITIONS[0].motsCles } },
    ]);
    await expect(titre).toHaveValue(PROPOSITIONS[0].titre);
    await expect(mots).toHaveValue(PROPOSITIONS[0].motsCles);
    // Les tirets et le SKU n'ont pas bougé.
    await expect(tirets).toHaveValue(TIRETS);
    expect(serveur.versions.get("e2e-version-2")).toMatchObject({ description: TIRETS, skuAnnonce: null });
    expect(reformulations(serveur.journal)).toHaveLength(3);

    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("Reformuler part de ce qui vient d'être corrigé à la main : le texte tapé est enregistré AVANT l'appel", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const serveur = await simulerServeur(page);
    await page.goto(FICHE);
    await creerVersion(page, 2);

    // Le titre est modifié, sans Entrée ni sortie du champ : le clic sur « Reformuler » le quitte, puis l'enregistre.
    const corrige = "Sac à dos Nike Elite 5039 noir et rose - comme neuf";
    await page.getByRole("textbox", { name: "Titre" }).fill(corrige);
    await page.getByRole("button", { name: "Reformuler", exact: true }).click();
    await expect(page.getByTestId("proposition-titre")).toHaveText(PROPOSITIONS[0].titre);

    // Dans l'ordre : le PATCH du titre, puis la reformulation, qui a VU le titre corrigé.
    expect(serveur.journal.map((q) => `${q.methode} ${q.chemin}`)).toEqual([
      "POST /api/studio/versions",
      "PATCH /api/studio/versions/e2e-version-2",
      "POST /api/studio/versions/e2e-version-2/reformuler",
    ]);
    expect(serveur.vusParIA).toEqual([{ titre: corrige, motsCles: MOTS }]);
    // La proposition est surlignée contre le titre corrigé, pas contre l'ancien.
    await expect(page.getByTestId("proposition-titre")).toHaveText(PROPOSITIONS[0].titre);
    // (contre l'ANCIEN titre, « état » n'aurait pas été surligné : « comme neuf » ne le contient pas)
    expect(await page.getByTestId("proposition-titre").locator("mark").allTextContents()).toEqual(["excellent", "état"]);
    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("une proposition inutilisable : « Proposition inutilisable, réessaie », rien n'est enregistré", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const serveur = await simulerServeur(page, { reponseIA: "inutilisable" });
    await page.goto(FICHE);
    await creerVersion(page, 2);

    await page.getByRole("button", { name: "Reformuler", exact: true }).click();
    const alerte = page.getByTestId("proposition-erreur");
    await expect(alerte).toHaveText("Proposition inutilisable, réessaie");
    await expect(page.getByRole("button", { name: "Garder" })).toHaveCount(0);
    expect(ecrits(serveur.journal)).toEqual([]);
    await expect(page.getByRole("textbox", { name: "Titre" })).toHaveValue(TITRE);

    // « Réessayer » refait UN appel.
    await page.getByRole("region", { name: "Proposition de reformulation" }).getByRole("button", { name: "Réessayer" }).click();
    await expect.poll(() => reformulations(serveur.journal).length).toBe(2);
    await expect(alerte).toHaveText("Proposition inutilisable, réessaie");
    expect(ecrits(serveur.journal)).toEqual([]);
    expect(garde.bloquees).toEqual([]);
    // Un 502 de la route est une réponse prévue : le navigateur en journalise l'échec de chargement, pas le code de l'écran.
    expect(journalConsole.erreurs.filter((e) => !/502/.test(e.texte))).toEqual([]);
  });

  test("télécharger les photos d'une version : un lien vers le zip, sur chaque version ; la route refuse sans compte et les requêtes invalides", async ({ page, baseURL, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const serveur = await simulerServeur(page);
    await page.goto(FICHE);
    await creerVersion(page, 2);

    // Version 2 : une photo cochée, le bouton le dit ; l'adresse ne porte que le coloris et le numéro.
    const lien = page.getByRole("link", { name: "Télécharger la photo", exact: true });
    await expect(lien).toHaveAttribute("href", "/api/studio/versions/zip?cle=5039-black-pink&numero=2");
    await expect(lien).toHaveAttribute("download", "");

    // Version 1 : les images validées du sac, avec son SKU. Le bouton compte les photos affichées.
    await page.getByRole("tab", { name: /^Version 1 \(actuelle\)/ }).click();
    const n = await page.getByRole("list", { name: "Photos de la Version 1 (actuelle)" }).getByRole("listitem").count();
    expect(n).toBeGreaterThan(0);
    const lienUn = page.getByRole("link", { name: n === 1 ? "Télécharger la photo" : `Télécharger les ${n} photos`, exact: true });
    await expect(lienUn).toHaveAttribute("href", "/api/studio/versions/zip?cle=5039-black-pink&numero=1&sku=SDN3");
    await cadrer(page);
    await capturer(page, "reformuler.version-1", { attendreReseau: false, pleinePage: false });

    // Le vrai serveur (le zip lui-même est vérifié par lib/studioZip.test.ts et par unzip) : authentifié, et il refuse
    // ce qui n'est pas une demande valide. Les lectures de stockage, elles, n'existent pas dans la suite (niveau 0).
    // Sans session : un contexte vide (le runner applique sinon le storageState du compte au nouveau contexte).
    const anonyme = await playwrightRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anonyme.get("/api/studio/versions/zip?cle=5039-black-pink&numero=2")).status()).toBe(401);
    await anonyme.dispose();
    const get = (q: string) => page.request.get(`/api/studio/versions/zip?${q}`);
    expect((await get("cle=5039-black-pink&numero=0")).status()).toBe(400);
    expect((await get("cle=5039-black-pink&numero=1")).status()).toBe(400); // la Version 1 est celle d'un sac : SKU exigé
    expect((await get("cle=5039-black-pink&numero=2&sku=SDN 3")).status()).toBe(400);
    expect((await get("numero=2")).status()).toBe(400);
    expect((await get("cle=coloris-inconnu&numero=2")).status()).toBe(404);
    expect((await get("cle=5039-black-pink&numero=2")).status()).toBe(404); // aucune version 2 en base pour ce compte
    const refus = await get("cle=5039-black-pink&numero=2");
    expect(await refus.json()).toMatchObject({ code: "introuvable" });
    expect(serveur.journal.filter((q) => q.chemin.startsWith("/api/studio/versions/zip"))).toEqual([]);

    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });

  test("les réglages de retouche, en une ligne sous le titre de la version ; « Réglages variés » avec le détail au survol", async ({ page, journalConsole }) => {
    const garde = await bloquerEcritures(page);
    const serveur = await simulerServeur(page);
    await page.goto(FICHE);
    // Six photos : la Version 2 a les mêmes réglages sur toutes ses photos.
    await creerVersion(page, 2, 6);

    const ligne = page.getByTestId("version-reglages");
    await expect(ligne).toHaveText("Pivoté 8° (zoom) · Recadré 10 % · Cadre beige 4 %, bord adouci 35 %");
    await expect(ligne).not.toHaveAttribute("title", /.+/);
    await cadrer(page);
    await capturer(page, "reformuler.reglages", { attendreReseau: false, pleinePage: false });

    // Version 3 : une photo a d'autres réglages (ancienne copie « Pivoter ») → « Réglages variés », détail au survol.
    await creerVersion(page, 3, 6);
    await expect(ligne).toHaveText("Réglages variés");
    await expect(ligne).toHaveAttribute(
      "title",
      ["Photos 1, 2, 4 à 6 : Pivoté 8° (zoom) · Recadré 10 % · Cadre beige 4 %, bord adouci 35 %", "Photo 3 : Pivoté −3° (zoom) · Sans cadre"].join("\n"),
    );
    // Revenir à la Version 2 : sa ligne est celle de SES photos.
    await page.getByRole("tab", { name: /^Version 2/ }).click();
    await expect(ligne).toHaveText("Pivoté 8° (zoom) · Recadré 10 % · Cadre beige 4 %, bord adouci 35 %");
    expect(serveur.versions.size).toBe(2);
    expect(garde.bloquees).toEqual([]);
    expect(journalConsole.erreurs).toEqual([]);
  });
});
