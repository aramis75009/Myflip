/**
 * Studio : S2, S5 (PRD § 1) et les relevés X10, X11. Les sondes de la génération
 * d'images IA (S1, S3, S4, S6, S7, S8, X0, X12 : file « À juger », V et R,
 * historique, favoris, réglages, modèles, avis IA, tableau des angles) sont
 * parties avec elle le 17/11/2026 (PRD 2026-11-16, étape 6).
 *
 * Données : compte « sonde » (e2e/sondes/graines.ts), jamais demo ni neuf.
 *  - `probe-noir` : 15 photos, 9 angles, 2 essais à juger AVEC avis IA, 1 essai rejeté
 *    à image conservée (photo 01, 2e angle), 1 essai validé (photo 15) ;
 *  - `probe-14` : 14 photos (1 prise libre) ; `probe-sansverif` : 1 essai à juger SANS avis IA.
 *
 * Aucune écriture réelle, jamais : chaque requête d'écriture est simulée par
 * `page.route` (rien n'atteint le serveur) et le filet de e2e/sondes/test.ts
 * avorte tout le reste. Les sondes qui demandent une interaction mesurent la
 * PRÉSENCE de l'affordance (bouton, rôle, aria).
 */
import { type Page } from "@playwright/test";

import { type RequeteEnregistree, simulerEcriture } from "./ecritures-simulees";
import { CLES_SONDE } from "./graines";
import { DESKTOP_CLAIR, type Sonde } from "./harness";
import { aller } from "./pages";
import { imageSynthetique } from "./png";

const FICHE = `/studio/${CLES_SONDE.noir}`;
/** Fiche à 14 photos : une prise libre, donc le 4e mécanisme de rangement (dépôt sur une case vide) est visible. */
const FICHE_UNE_LIBRE = `/studio/${CLES_SONDE.quatorze}`;
const PLANCHE = "ol[aria-label='Planche des prises']";

const visible = (page: Page, selecteur: string) => page.locator(selecteur).first().waitFor({ state: "visible", timeout: 60_000 });

export const SONDES_STUDIO: readonly Sonde[] = [
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

];
