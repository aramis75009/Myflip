/**
 * Studio : S1 à S8 (PRD § 1) et les relevés X0, X10, X11, X12.
 *
 * Données : compte « sonde » (e2e/sondes/graines.ts), jamais demo ni neuf.
 *  - `probe-noir` : 15 photos, 9 angles, 2 essais à juger AVEC avis IA, 1 essai rejeté
 *    à image conservée (photo 01, 2e angle), 1 essai validé (photo 15) ;
 *  - `probe-14` : 14 photos (1 prise libre) ; `probe-sansverif` : 1 essai à juger SANS avis IA.
 *
 * Aucune écriture réelle, jamais : chaque requête d'écriture est simulée par
 * `page.route` (rien n'atteint le serveur) et le filet de e2e/sondes/test.ts
 * avorte tout le reste. Aucune touche V ou R n'est pressée sans que le PATCH
 * soit déjà intercepté (S3, seule sonde qui les presse). Les sondes qui demandent
 * une interaction mesurent la PRÉSENCE de l'affordance (bouton, rôle, aria).
 */
import { type Page } from "@playwright/test";

import { catalogueFactice, type RequeteEnregistree, servirCatalogue, simulerEcriture } from "./catalogue-faux";
import { arrondi } from "./couleurs";
import { CLES_SONDE, ID_ESSAI_REJETE } from "./graines";
import { DESKTOP, DESKTOP_CLAIR, etape, type MesureSonde, type Sonde } from "./harness";
import { aller } from "./pages";
import { imageSynthetique } from "./png";

const FICHE = `/studio/${CLES_SONDE.noir}`;
/** Fiche d'un coloris du catalogue SacBase : des sacs cibles existent, le sélecteur de modèles et « Générer » sont actifs. */
const FICHE_CATALOGUE = `/studio/${CLES_SONDE.catalogue}`;
/** Fiche à 14 photos : une prise libre, donc le 4e mécanisme de rangement (dépôt sur une case vide) est visible. */
const FICHE_UNE_LIBRE = `/studio/${CLES_SONDE.quatorze}`;
const PLANCHE = "ol[aria-label='Planche des prises']";

const visible = (page: Page, selecteur: string) => page.locator(selecteur).first().waitFor({ state: "visible", timeout: 60_000 });

export const SONDES_STUDIO: readonly Sonde[] = [
  {
    id: "S1",
    titre: "La planche de 15 cases passe avant la file « À juger »",
    route: FICHE,
    critere:
      "La section « À juger » est visible au chargement (jugerVisible = true, sans défiler) et précède la planche (jugerY < plancheY), ou la planche est repliée (aria-expanded = false).",
    projets: DESKTOP,
    compte: "sonde",
    executer: async (page, ctx) => {
      await aller(page, FICHE, { repere: "h1" });
      await visible(page, "h2:has-text('À juger')");
      const m = await page.evaluate(() => {
        const h = (t: string) => [...document.querySelectorAll("h2")].find((x) => (x.textContent ?? "").trim() === t);
        const planche = h("Photographie le sac");
        const juger = h("À juger");
        if (!planche || !juger) return null;
        const repliee = [...document.querySelectorAll("[aria-expanded]")].some((b) => planche.parentElement?.parentElement?.contains(b) && b.getAttribute("aria-expanded") === "false");
        return {
          scrollY: Math.round(window.scrollY),
          plancheY: Math.round(planche.getBoundingClientRect().top + window.scrollY),
          jugerY: Math.round(juger.getBoundingClientRect().top + window.scrollY),
          jugerVisible: juger.getBoundingClientRect().top < window.innerHeight,
          plancheRepliee: repliee,
          cases: document.querySelectorAll("ol[aria-label='Planche des prises'] > li").length,
          titres: [...document.querySelectorAll("main h2")].map((x) => (x.textContent ?? "").trim()).slice(0, 8),
        };
      });
      if (!m) return { mesure: { erreur: "Sections « Photographie le sac » ou « À juger » introuvables." }, corrige: null };
      const capture = await ctx.capturer();
      return { mesure: m, corrige: m.jugerVisible && (m.jugerY < m.plancheY || m.plancheRepliee), capture };
    },
  },

  {
    id: "S2",
    titre: "On ne peut pas retirer une photo de la planche",
    route: FICHE,
    critere:
      "Chaque photo de la planche offre un contrôle « Retirer » et un contrôle « Remplacer » (au moins un de chaque par photo), au survol ou au focus ; un clic sur Retirer envoie exactement 1 DELETE (vérifié ici sans cliquer : présence seulement).",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    executer: async (page, ctx) => {
      const suppressions: RequeteEnregistree[] = [];
      await simulerEcriture(page, /\/api\/studio\/references\/[^/]+$/, suppressions);
      await aller(page, FICHE, { repere: PLANCHE });
      // Survol puis focus de quelques photos : un contrôle qui n'apparaît qu'alors doit être compté.
      const photos = page.locator(`${PLANCHE} button[draggable=true]`);
      const n = await photos.count();
      for (let i = 0; i < Math.min(n, 3); i++) {
        await photos.nth(i).hover();
        await photos.nth(i).focus();
        await page.waitForTimeout(80);
      }
      const m = await page.evaluate(() => {
        const ol = document.querySelector("ol[aria-label='Planche des prises']");
        if (!ol) return null;
        const controles = [...ol.querySelectorAll("button, [role=menuitem], a")].map((b) => `${b.getAttribute("aria-label") ?? ""} ${b.textContent ?? ""}`.trim());
        return {
          photos: ol.querySelectorAll("img").length,
          retirer: controles.filter((t) => /retirer|supprimer/i.test(t)).length,
          remplacer: controles.filter((t) => /remplacer/i.test(t)).length,
        };
      });
      if (!m) return { mesure: { erreur: "Planche introuvable." }, corrige: null };
      const capture = await ctx.capturer(page.locator(PLANCHE));
      return {
        mesure: { ...m, controles: m.retirer + m.remplacer, deleteEnvoyes: suppressions.length },
        corrige: m.photos > 0 && m.retirer >= m.photos && m.remplacer >= m.photos,
        capture,
      };
    },
  },

  {
    id: "S3",
    titre: "V et R valident ou rejettent sur-le-champ, sans annulation",
    route: FICHE,
    critere:
      "La touche R (comme V) affiche un toast avec un bouton « Annuler » qui reste au moins 4 s ; un clic sur Annuler remet l'essai dans la file ; à l'expiration, exactement 1 PATCH définitif.",
    projets: DESKTOP,
    compte: "sonde",
    delaiMs: 240_000,
    executer: async (page, ctx) => {
      // Le PATCH est intercepté AVANT la moindre touche : aucune décision n'atteint le serveur.
      const patches: (RequeteEnregistree & { t: number })[] = [];
      await page.route(/\/api\/studio\/essais\/[^/]+$/, async (route) => {
        const r = route.request();
        if (r.method() !== "PATCH") {
          await route.fallback();
          return;
        }
        patches.push({ t: Date.now(), methode: "PATCH", url: new URL(r.url()).pathname, corps: r.postDataJSON() });
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      });
      await aller(page, FICHE, { repere: "h1" });
      await visible(page, "h2:has-text('À juger')");

      const lire = () =>
        page.evaluate(() => ({
          annuler: [...document.querySelectorAll("button")].filter((b) => b.offsetParent !== null && getComputedStyle(b).visibility !== "hidden" && /annuler/i.test(b.textContent ?? "")).length,
          toast: document.querySelector("[data-sonner-toast]")?.textContent ?? null,
        }));
      const essai = async (touche: "r" | "v") => {
        await page.locator("h1").first().click();
        const avant = patches.length;
        const t0 = Date.now();
        await page.keyboard.press(touche);
        await page.waitForTimeout(300);
        const a300 = await lire();
        await page.waitForTimeout(4000);
        const a4s = await lire();
        const recus = patches.slice(avant);
        return {
          touche,
          patches: recus.map((p) => ({ delaiMs: p.t - t0, corps: p.corps })),
          annulerApres300ms: a300.annuler,
          annulerApres4s: a4s.annuler,
          toast: a300.toast,
        };
      };

      const r = await essai("r");
      const v = await essai("v");
      const capture = await ctx.capturer();
      const aUnAnnuler = (e: { annulerApres300ms: number; annulerApres4s: number }) => e.annulerApres300ms >= 1 && e.annulerApres4s >= 1;
      return {
        mesure: { rejet: r, validation: v, patchTotal: patches.length, patchDecisionNull: patches.some((p) => (p.corps as { decision?: unknown } | null)?.decision === null) },
        corrige: aUnAnnuler(r) && aUnAnnuler(v),
        capture,
      };
    },
  },

  {
    id: "S4",
    titre: "Une image rejetée disparaît sans historique",
    route: FICHE,
    critere:
      "L'historique de la prise 01 montre l'image rejetée (imgsRejet >= 1) avec sa décision « Rejetée » (decisionsAffichees >= 1) et une action « Retenir cette version ».",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    executer: async (page, ctx) => {
      await aller(page, FICHE, { repere: "h1" });
      await visible(page, `${PLANCHE} img`);
      const historique = page.locator("button, a, [role=button]").filter({ hasText: /historique|tentatives/i });
      const nbControles = await historique.count();
      if (nbControles > 0) {
        await historique.first().click();
        await page.waitForTimeout(500);
      }
      const m = await page.evaluate((idRejet) => {
        const ligne01 = [...document.querySelectorAll("[role=row]")].find((r) => /^01/.test((r.querySelector("[role=rowheader]")?.textContent ?? "").trim()));
        return {
          casesLigne01: ligne01 ? [...ligne01.children].filter((c) => c.getAttribute("role") !== "rowheader").map((c) => (c.textContent ?? "").trim().slice(0, 24)) : null,
          imgsRejet: document.querySelectorAll(`img[src*='essai=${idRejet}']`).length,
          decisionsAffichees: ((document.body.innerText.match(/rejetée/gi) ?? []) as string[]).length,
          actionRetenir: [...document.querySelectorAll("button")].some((b) => /retenir cette version/i.test(b.textContent ?? "")),
        };
      }, ID_ESSAI_REJETE);
      const capture = await ctx.capturer();
      return {
        mesure: { controlesHistorique: nbControles, ...m },
        corrige: nbControles > 0 && m.imgsRejet >= 1 && m.decisionsAffichees >= 1 && m.actionRetenir,
        capture,
      };
    },
  },

  {
    id: "S5",
    titre: "Quatre façons concurrentes de placer une prise",
    route: `${FICHE_UNE_LIBRE} (14 photos, 1 prise libre)`,
    critere:
      "Plus de <select> « Prise de la photo N » dans le tableau, plus de sélection par toucher ni de sélecteur de fichier par case : un seul mécanisme pointeur (glisser) et une alternative clavier (chaque photo glissable porte aria-keyshortcuts ou aria-describedby).",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    executer: async (page, ctx) => {
      await aller(page, FICHE_UNE_LIBRE, { repere: PLANCHE });
      await visible(page, `${PLANCHE} img`);
      const m = await page.evaluate(() => {
        const ol = document.querySelector("ol[aria-label='Planche des prises']");
        if (!ol) return null;
        const glissables = [...ol.querySelectorAll("[draggable=true]")];
        return {
          glisser: glissables.length,
          toucherPuisCase: ol.querySelectorAll("button[aria-pressed]").length,
          fichierParCase: [...ol.querySelectorAll("button")].filter((b) => /Dépose ici|Ranger ici/.test(b.textContent ?? "")).length,
          selectTableau: document.querySelectorAll("select[aria-label^='Prise de la photo']").length,
          alternativeClavier: glissables.length > 0 && glissables.every((g) => g.hasAttribute("aria-keyshortcuts") || g.hasAttribute("aria-describedby")),
        };
      });
      if (!m) return { mesure: { erreur: "Planche introuvable." }, corrige: null };
      const mecanismes = [m.glisser > 0, m.toucherPuisCase > 0, m.fichierParCase > 0, m.selectTableau > 0].filter(Boolean).length;
      return {
        mesure: { ...m, mecanismes },
        corrige: m.selectTableau === 0 && m.toucherPuisCase === 0 && m.fichierParCase === 0 && m.glisser > 0 && m.alternativeClavier,
        capture: await ctx.capturer(page.locator(PLANCHE)),
      };
    },
  },

  {
    id: "S6",
    titre: "Les étoiles de favoris ne réagissent pas",
    route: `${FICHE_CATALOGUE} (mode Par API)`,
    critere:
      "Une bascule favori par modèle, dont aria-pressed reflète l'état ; un clic envoie exactement 1 POST (ajout) ou 1 DELETE (retrait) vers /api/studio/modeles/favoris ; les favoris sont épinglés en tête.",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    executer: async (page, ctx) => {
      await servirCatalogue(page, catalogueFactice(6, ["e2e/m2"]));
      const favoris: RequeteEnregistree[] = [];
      await simulerEcriture(page, "**/api/studio/modeles/favoris", favoris);
      await aller(page, FICHE_CATALOGUE, { repere: "h1" });
      await visible(page, "button[aria-pressed]:has-text('Modèle m2')");
      const lire = () =>
        page.evaluate(() => ({
          bascules: document.querySelectorAll("button[aria-label*='favori' i]").length,
          etoiles: document.querySelectorAll("svg[aria-label=favori]").length,
          pressed: [...document.querySelectorAll("button[aria-pressed=true]")].map((b) => (b.textContent ?? "").trim().slice(0, 30)),
        }));
      const avant = await lire();
      await page.locator("svg[aria-label=favori]").first().click();
      await page.waitForTimeout(400);
      const apresEtoile = await lire();
      const requetesApresEtoile = favoris.length;
      const capture = await ctx.capturer(page.locator("span:has-text('MODÈLE')").first().locator(".."));
      return {
        mesure: { avant, apresClicEtoile: apresEtoile, requetesFavorisApresClic: requetesApresEtoile, requetesFavoris: favoris },
        corrige: avant.bascules >= 6 && requetesApresEtoile === 1,
        capture,
      };
    },
  },

  {
    id: "S7",
    titre: "Les réglages des prompts sont rangés sous « Prompts »",
    route: "/studio, fiche, /parametres",
    critere:
      "Depuis /studio et depuis une fiche, au moins un lien ou bouton mène aux réglages du Studio (prompt maître, angles, budget) : liensReglages >= 1 ; et aucune entrée de menu nommée seulement « Prompts ».",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    executer: async (page, ctx) => {
      const lire = () =>
        page.evaluate(() => ({
          menu: (document.querySelector("aside a[href^='/parametres']") as HTMLElement | null)?.innerText.trim() ?? null,
          liensReglages: [...document.querySelectorAll("a[href], button")].filter(
            (e) =>
              (e as HTMLElement).offsetParent !== null &&
              (/onglet=studio|[/]studio[/](reglages|parametres)/.test(e.getAttribute("href") ?? "") || /réglages|prompt maître|budget/i.test(e.textContent ?? "")),
          ).length,
        }));
      const sorties: MesureSonde[] = [];
      let menu: string | null = null;
      for (const chemin of ["/studio", FICHE]) {
        sorties.push(
          ...(await etape(chemin, async () => {
            await aller(page, chemin, { repere: "main" });
            const r = await lire();
            menu = r.menu;
            return { route: chemin, mesure: r, corrige: r.liensReglages >= 1 && !/^prompts$/i.test(r.menu ?? ""), capture: chemin === "/studio" ? await ctx.capturer() : undefined };
          })),
        );
      }
      sorties.push(
        ...(await etape("/parametres (titre de la barre du haut)", async () => {
          await aller(page, "/parametres", { repere: "main" });
          const titre = await page.evaluate(() => (document.querySelector(".sticky .truncate") as HTMLElement | null)?.innerText.trim() ?? null);
          return { route: "/parametres (titre de la barre du haut)", mesure: { menu, titreBarre: titre }, corrige: titre === null ? null : !/^prompts$/i.test(titre) };
        })),
      );
      return sorties;
    },
  },

  {
    id: "S8",
    titre: "Choix des modèles « amateur » : ni coût par sac, ni comparaison",
    route: `${FICHE_CATALOGUE} (mode Par API, catalogue de 8 modèles)`,
    critere:
      "Chaque modèle affiche son prix par image ET son coût pour 15 prises (m6 : 15 × 0,134 = 2,01 $) avec l'équivalent en euros, un badge « Hors budget » au-delà de 1 €, son taux de réussite du premier coup, une bascule favori, recherche et filtres ; 2 ou 3 modèles sélectionnables (payload.modeles.length = 2 ou 3) ; devis comparé à « 1,00 € ».",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    delaiMs: 240_000,
    executer: async (page, ctx) => {
      await servirCatalogue(page, catalogueFactice(8, ["e2e/m2", "e2e/m6"]));
      // Jamais de génération réelle : la requête est interceptée et refusée (409), et le filet avorte tout le reste.
      const generations: RequeteEnregistree[] = [];
      await simulerEcriture(page, "**/api/studio/generations", generations, { status: 409, json: { error: "confirmation_requise" } });
      await aller(page, FICHE_CATALOGUE, { repere: "h1" });
      await visible(page, "button[aria-pressed]:has-text('Modèle m2')");

      const zone = () =>
        page.evaluate(() => {
          const z = [...document.querySelectorAll("span")].find((s) => (s.textContent ?? "").trim() === "MODÈLE")?.parentElement;
          if (!z) return null;
          const t = z.textContent ?? "";
          return {
            pilules: z.querySelectorAll("button[aria-pressed]").length,
            options: Math.max(0, z.querySelectorAll("select[aria-label='Autre modèle'] option").length - 1),
            parSac: /sac|15 prises/i.test(t),
            taux: /%/.test(t),
            euro: /€/.test(t),
            horsBudget: /hors budget/i.test(t),
            seuils: t.match(/[0-9]+,[0-9]+ [$]/g),
            recherche: !!z.querySelector("input[type=search], input[type=text]"),
            pressed: z.querySelectorAll("button[aria-pressed=true]").length,
          };
        });
      const initial = await zone();
      if (!initial) return { mesure: { erreur: "Zone « MODÈLE » introuvable." }, corrige: null };

      await page.locator("button[aria-pressed]:has-text('Modèle m2')").first().click();
      const apresM2 = await zone();
      await page.locator("button[aria-pressed]:has-text('Modèle m6')").first().click();
      const apresM6 = await zone();
      const capture = await ctx.capturer(page.locator("span:has-text('MODÈLE')").first().locator("../.."));

      // Un lancement avec ce qui est sélectionné : la requête part vers le faux, jamais vers OpenRouter.
      await page.getByRole("button", { name: /^Générer/ }).first().click();
      const confirmer = page.getByRole("button", { name: /Confirmer/ }).first();
      if (await confirmer.isVisible({ timeout: 3000 }).catch(() => false)) await confirmer.click();
      await page.waitForTimeout(1200);
      const modeles = (generations[0]?.corps as { modeles?: unknown[] } | undefined)?.modeles;

      return {
        mesure: { initial, apresClicM2: apresM2, apresClicM6: apresM6, generationsSimulees: generations.length, payloadModeles: modeles ?? null, nbModelesDuPayload: modeles?.length ?? null },
        corrige:
          initial.parSac && initial.euro && initial.taux && initial.horsBudget && (modeles?.length ?? 0) >= 2 && (modeles?.length ?? 0) <= 3,
        capture,
      };
    },
  },

  {
    id: "X0",
    titre: "Ouvrir une fiche lance des appels payants tout seul",
    route: `/studio/${CLES_SONDE.sansVerif} (essai sans avis IA)`,
    critere:
      "L'ouverture d'une fiche n'envoie aucune vérification payante sans action de l'utilisateur : 0 requête POST /api/studio/essais/<id>/verifier au chargement (à trancher avec le produit : aujourd'hui l'avis manquant est relancé à l'ouverture).",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    executer: async (page, ctx) => {
      const vues: string[] = [];
      const openrouter: string[] = [];
      page.on("request", (r) => {
        const u = new URL(r.url());
        if (r.method() === "POST" && /\/api\/studio\/essais\/[^/]+\/verifier$/.test(u.pathname)) vues.push(u.pathname);
        if (/openrouter\.ai/.test(u.hostname)) openrouter.push(u.hostname);
      });
      await aller(page, `/studio/${CLES_SONDE.sansVerif}`, { repere: "h1" });
      await page.waitForTimeout(2500);
      return {
        mesure: {
          requetesVerifier: vues.length,
          cibles: vues,
          requetesOpenRouterDuNavigateur: openrouter.length,
          note: "La requête est interceptée par le filet de sondes (réponse 503) : elle n'atteint jamais le serveur ni OpenRouter.",
        },
        corrige: vues.length === 0,
        capture: await ctx.capturer(),
      };
    },
  },

  {
    id: "X10",
    titre: "Déposer plus de photos que de prises libres refuse tout le lot",
    route: `/studio/${CLES_SONDE.quatorze} (14 photos, 1 prise libre)`,
    critere: "Le dépôt remplit les prises libres et signale le surplus : 1 POST /api/studio/references avec 1 fichier, et un message qui signale 2 photos en trop.",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    executer: async (page, ctx) => {
      const posts: { corps: unknown; fichiers: number }[] = [];
      await page.route("**/api/studio/references", async (route) => {
        const r = route.request();
        if (r.method() !== "POST") {
          await route.fallback();
          return;
        }
        const brut = r.postDataBuffer()?.toString("latin1") ?? "";
        posts.push({ corps: `(${r.postDataBuffer()?.length ?? 0} octets)`, fichiers: (brut.match(/name="photo"/g) ?? []).length });
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ conservees: 1, doublons: 0 }) });
      });
      await aller(page, `/studio/${CLES_SONDE.quatorze}`, { repere: PLANCHE });
      const entree = page.locator("section, div").filter({ has: page.locator("h2", { hasText: "Photographie le sac" }) }).locator("input[type=file][multiple]").first();
      await entree.setInputFiles(
        [1, 2, 3].map((n) => ({ name: `sonde-${n}.png`, mimeType: "image/png", buffer: imageSynthetique(300, 400, n) })),
      );
      await page.waitForTimeout(2500);
      const toast = await page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((t) => (t.textContent ?? "").trim()));
      return {
        mesure: { posts: posts.length, fichiersParPost: posts.map((p) => p.fichiers), toasts: toast },
        corrige: posts.length === 1 && posts[0].fichiers === 1 && toast.some((t) => /\b2\b/.test(t)),
        capture: await ctx.capturer(),
      };
    },
  },

  {
    id: "X11",
    titre: "Les filtres du catalogue Studio ne sont pas dans l'URL",
    route: "/studio (puce de génération)",
    critere: "La génération choisie est dans l'URL (par exemple ?generation=V1) et le filtre persiste au rechargement (la puce reste active, aria-pressed = true).",
    projets: DESKTOP_CLAIR,
    compte: "demo",
    executer: async (page, ctx) => {
      await aller(page, "/studio", { repere: "[role=group][aria-label='Génération']" });
      const puce = page.locator("[role=group][aria-label='Génération'] button").filter({ hasText: /^V1/ }).first();
      await puce.click();
      await page.waitForTimeout(500);
      const recherche = await page.evaluate(() => location.search);
      const pressedAvant = await puce.getAttribute("aria-pressed");
      await page.reload({ waitUntil: "load" });
      await page.locator("[role=group][aria-label='Génération']").waitFor({ state: "visible" });
      await page.waitForTimeout(500);
      const pressedApres = await page
        .locator("[role=group][aria-label='Génération'] button")
        .filter({ hasText: /^V1/ })
        .first()
        .getAttribute("aria-pressed");
      return {
        mesure: { recherche, pressedAvantRechargement: pressedAvant, pressedApresRechargement: pressedApres },
        corrige: /generation=/i.test(recherche) && pressedApres === "true",
        capture: await ctx.capturer(page.locator("[role=group][aria-label='Génération']")),
      };
    },
  },

  {
    id: "X12",
    titre: "Le tableau des angles défile horizontalement dès 8 prompts",
    route: `${FICHE} (9 angles)`,
    critere: "Avec 9 angles, le tableau des angles tient dans sa zone à 1440 px : scrollW <= clientW (ou un défilement interne avec un indice visuel).",
    projets: DESKTOP_CLAIR,
    compte: "sonde",
    executer: async (page, ctx) => {
      await aller(page, FICHE, { repere: "[role=table]" });
      const m = await page.evaluate(() => {
        const t = document.querySelector("[role=table][aria-label^='Photos']")?.parentElement;
        if (!t) return null;
        return {
          scrollW: t.scrollWidth,
          clientW: t.clientWidth,
          angles: document.querySelectorAll("[role=table][aria-label^='Photos'] [role=columnheader]").length - 1,
          debordeDeLaPage: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      if (!m) return { mesure: { erreur: "Tableau des angles introuvable." }, corrige: null };
      return { mesure: { ...m, excedent: arrondi(m.scrollW - m.clientW, 0) }, corrige: m.scrollW <= m.clientW, capture: await ctx.capturer(page.locator("[role=table]").first()) };
    },
  },
];
