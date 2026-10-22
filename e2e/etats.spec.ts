/**
 * Captures des ÉTATS d'interface (modales, barres, menus, toasts, étapes,
 * chargements et erreurs) recensés dans
 * docs/refonte/etude-2026-10-20/routes-etats.json (73 états).
 *
 * Règles :
 *  - chaque état est joué dans les projets de sa vue (desktop, mobile ou les
 *    deux), donc en clair ET en sombre ;
 *  - garde d'écriture sur /api/** (e2e/outils/ecritures.ts) : aucune écriture
 *    n'atteint le serveur ; un état qui en dépend est rendu par une réponse
 *    SIMULÉE (page.route), notée dans le rapport ;
 *  - sur /studio/<cle>, AUCUNE touche n'est jamais pressée (V et R valident ou
 *    rejettent sur-le-champ) : seulement des clics sur des boutons sans effet
 *    serveur, écritures bloquées en plus ;
 *  - les boîtes natives (confirm, beforeunload) n'apparaissent pas sur une
 *    capture : leur texte est vérifié par un test à part (celles qui sont
 *    devenues des AlertDialog le sont par « confirmation destructive ») ;
 *  - les états non capturés sont listés dans NON_CAPTURES avec leur raison,
 *    et un test vérifie que les 73 états de l'étude sont couverts par l'un ou
 *    l'autre.
 */
import fs from "node:fs";
import path from "node:path";

import { calendrierCharge, visible } from "./catalogue-routes";
import { COMPTES } from "./compte-test";
import { attendreCalme, requetesEnCours } from "./outils/calme";
import { capturer, type OptionsCapture } from "./outils/capture";
import { bloquerEcritures } from "./outils/ecritures";
import { RACINE } from "./outils/environnement";
import { photosSynthetiques } from "./outils/photos";
import { DOSSIER_RAPPORTS, consignerCapture } from "./outils/rapport";
import { repondreJson, retenir, simulerJson } from "./outils/reseau-simule";
import { expect, test, type Compte, type FixturesE2E, type Page, type ThemeMyflip } from "./outils/test";

test.describe.configure({ mode: "parallel" });

// ── Cadre ────────────────────────────────────────────────────────────────────

type Vue = "desktop" | "mobile" | "both";

type Ctx = {
  page: Page;
  mobile: boolean;
  theme: ThemeMyflip;
  dialogues: FixturesE2E["dialogues"];
  /** Capture `etat.<id>[.<suffixe>]` ; fenêtre seule par défaut (les surcouches sont fixes). */
  capture: (suffixe?: string, options?: OptionsCapture) => Promise<void>;
  /** Note une réponse simulée par page.route, pour lire la capture. */
  simule: (description: string) => void;
};

type DefEtat = {
  id: string;
  /** Identifiants des états de routes-etats.json que ce test capture. */
  etude: string[];
  vue: Vue;
  compte: Compte;
  chemin: string;
  executer: (c: Ctx) => Promise<void>;
};

const surMobile = (vue: Vue, mobile: boolean) => vue === "both" || (vue === "mobile") === mobile;

/**
 * Va sur la page, vérifie qu'une session n'a pas été perdue en route, puis
 * attend que la page ait fini de charger ses données (calme réseau, voir
 * outils/calme.ts) : avatar, notifications, colonnes calculées après coup.
 * Sans cela, un état photographié tout de suite (toast, menu ouvert) montre un
 * écran à moitié chargé, différent d'un lancement à l'autre. Une requête
 * retenue exprès par `retenir` ne compte pas.
 */
async function aller(page: Page, chemin: string, compte: Compte): Promise<void> {
  const reponse = await page.goto(chemin);
  expect(reponse?.status() ?? 0, `statut HTTP de ${chemin}`).toBeLessThan(400);
  if (compte !== "aucun") await expect(page, "session perdue : renvoi vers /login").not.toHaveURL(/\/login/);
  await calme(page, chemin);
}

/**
 * Calme réseau, ou échec qui liste les requêtes en cours. Pour un état de « chargement » (une requête
 * retenue par `retenir`) : le reste de la page doit avoir fini de charger AVANT la photo immédiate,
 * sinon avatar, notifications ou listes dépendent de la vitesse du serveur. La requête retenue ne compte pas.
 */
async function calme(page: Page, contexte: string): Promise<void> {
  if (!(await attendreCalme(page))) {
    throw new Error(`${contexte} : réseau jamais calme (requêtes en cours : ${requetesEnCours(page).join(", ") || "aucune"}).`);
  }
}

/** Plus aucun toast à l'écran : ils durent 4 s, une capture ne doit pas en attraper un au passage. */
const attendreSansToast = (page: Page) => expect(page.locator("[data-sonner-toast]")).toHaveCount(0, { timeout: 15_000 });

const defiler = (page: Page, fraction = 0.5) =>
  page.evaluate((f) => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - window.innerHeight) * f)), fraction);

/** Toast Sonner visible (toast() de sonner). */
const toast = (page: Page, texte?: string | RegExp) =>
  texte ? page.locator("[data-sonner-toast]").filter({ hasText: texte }).first() : page.locator("[data-sonner-toast]").first();

const IMMEDIAT: OptionsCapture = { attendreReseau: false };

/**
 * Note (sans échouer) si un toast émis au montage de la page s'affiche. Constat
 * de l'étude du 20/10 : au chargement direct, l'effet de la page passe avant
 * celui du <Toaster> de sonner (frère suivant dans app/layout.tsx), qui ne
 * s'est pas encore abonné : le toast est perdu. La capture montre ce que voit
 * l'utilisateur ; l'annotation et le rapport disent ce qui manque.
 */
async function constaterToast(page: Page, texte: string | RegExp | undefined, contexte: string): Promise<boolean> {
  const present = await toast(page, texte)
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  test.info().annotations.push({
    type: "constat",
    description: `${contexte} : toast ${present ? "affiché" : "ABSENT (émis avant l'abonnement du Toaster)"}.`,
  });
  return present;
}

async function attendreDashboard(page: Page, prenom: string = COMPTES.demo.prenom) {
  await expect(page.getByText(`Bonjour ${prenom}`)).toBeVisible();
}

async function attendreStock(page: Page) {
  await expect(visible(page.getByText("Articles au total"))).toBeVisible();
  await expect(page.getByRole("button", { name: "Tous 88" })).toBeVisible();
}

/** Recherche un SKU (débounce 300 ms) ; choisir un SKU sans homonyme plus long (PIS7, pas ADI1 qui ramène ADI10…). */
async function chercherSku(page: Page, sku: string) {
  await page.getByPlaceholder("Rechercher un SKU…").fill(sku);
  await expect(page.getByRole("combobox", { name: /^Statut de / }).filter({ visible: true })).toHaveCount(1);
  await expect(visible(page.getByRole("combobox", { name: `Statut de ${sku}`, exact: true }))).toBeVisible();
}

/** Coche un article : en desktop la case est pointer-events-none, c'est sa cellule qui reçoit le clic (glisser-sélectionner). */
async function cocher(c: Ctx, sku: string) {
  const caseSku = c.page.getByRole("checkbox", { name: `Sélectionner ${sku}`, exact: true });
  if (c.mobile) await visible(caseSku).check();
  else await c.page.locator("td[data-select-cell]").filter({ has: caseSku }).click();
  await expect(visible(caseSku)).toBeChecked();
}

// Fiche Studio la plus remplie (file « À juger » de 3 images).
const FICHE = "/studio/5039-black-pink";
async function attendreFiche(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Black Pink" })).toBeVisible();
  await expect(page.getByText("PROCHAINE ACTION", { exact: true })).toBeVisible();
}

/**
 * Déplie une étape de la fiche (Photos, Angles, Génération, À juger, Validées) : depuis le
 * parcours du 22/10, seule l'étape de la prochaine action s'ouvre au chargement.
 */
async function ouvrirEtape(page: Page, nom: string) {
  const bouton = page.getByRole("heading", { level: 2, name: new RegExp(`^${nom}`) }).getByRole("button");
  if ((await bouton.getAttribute("aria-expanded")) !== "true") await bouton.click();
  await expect(bouton).toHaveAttribute("aria-expanded", "true");
}

// Mise en vente : session de 2 annonces déjà rédigées (sessionStorage, format v2
// de app/mise-en-vente/_persistance.ts). SDN3 est un sac Nike (correspondance
// Vinted + couleur : « Publier sur Vinted » actif), PIS8 un pull sans correspondance.
const SESSION_MEV = {
  version: 2,
  active: "e2e-f1",
  fiches: [
    {
      id: "e2e-f1",
      sku: "SDN3",
      qcm: { marque: "Nike", marqueCustom: false, categorie: "Sac à dos", categorieCustom: false, taille: "Unique", etat: "Très bon état", matiere: "Polyester", matiere2: "", details: "", prix: "79", couleurs: [1] },
      promptId: null,
      annonce: {
        titre: "Sac à dos Nike Elite noir et rose — très bon état",
        description: "Sac à dos Nike Elite coloris noir et rose, swoosh brodé sur la poche avant. Très bon état, zip noir mat fonctionnel. (Texte de test e2e.)",
        motsCles: "nike, elite, sac à dos, noir, rose",
      },
      genere: true,
    },
    {
      id: "e2e-f2",
      sku: "PIS8",
      qcm: { marque: "Mix", marqueCustom: false, categorie: "Pull", categorieCustom: false, taille: "L", etat: "Bon état", matiere: "Laine", matiere2: "", details: "", prix: "35", couleurs: [3] },
      promptId: null,
      annonce: {
        titre: "Pull islandais en laine, taille L",
        description: "Pull islandais en laine, motif jacquard. Bon état général. (Texte de test e2e.)",
        motsCles: "pull, islandais, laine, jacquard",
      },
      genere: true,
    },
  ],
};

async function poserSessionMev(page: Page) {
  await page.addInitScript((s: string) => {
    try {
      window.sessionStorage.setItem("mev_session_v2", s);
    } catch {
      // about:blank : sans effet sur la page de l'app.
    }
  }, JSON.stringify(SESSION_MEV));
}

/** Étapes 1 et 2 de la mise en vente jusqu'à une fiche prête (PIS7, pull sans correspondance Vinted). */
async function preparerFiche(c: Ctx, captures: boolean) {
  const { page } = c;
  await aller(page, "/mise-en-vente", "demo");
  const champ = page.getByPlaceholder("Ex : PRL1");
  await champ.fill("PIS7");
  // Tab (perte de focus) lance la recherche ; Entrée ajouterait une 2e ligne vide.
  await champ.press("Tab");
  await expect(visible(page.getByText("Lot : Pulls islandais"))).toBeVisible();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("button", { name: "Ajouter des photos" })).toBeVisible();
  if (captures) {
    await c.capture("sans-photo", { pleinePage: true });
    await defiler(page);
    await c.capture("sans-photo-defile");
  }
  await page.locator('input[type="file"]').first().setInputFiles(await photosSynthetiques(page, 3));
  await expect(page.getByRole("button", { name: "Sélectionner la photo 3" })).toBeVisible();
  if (captures) await c.capture("photos", { pleinePage: true });
  await page.getByRole("button", { name: "Sélectionner la photo 1" }).click();
  await page.getByRole("button", { name: "Sélectionner la photo 2" }).click();
  await page.getByRole("button", { name: "L", exact: true }).click();
  await page.getByRole("button", { name: "Très bon état", exact: true }).click();
  await expect(page.getByRole("button", { name: "Générer l'annonce" })).toBeEnabled();
}

const ANNONCE_SIMULEE = {
  titre: "Pull islandais jacquard en laine — taille L",
  description: "Pull islandais en laine épaisse, motif jacquard traditionnel. Très bon état. (Annonce simulée par la suite e2e, aucun modèle appelé.)",
  motsCles: "pull, islandais, laine, jacquard, hiver",
  promptNom: "Pulls islandais",
};

// ── États ────────────────────────────────────────────────────────────────────

const ETATS: DefEtat[] = [
  // ── Cadre (châssis) ──
  {
    id: "shell.sidebar-desktop",
    etude: ["shell.sidebar-desktop", "shell.chatbot-fab"],
    vue: "desktop",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      await aller(c.page, "/dashboard", "demo");
      await attendreDashboard(c.page);
      await expect(c.page.getByRole("button", { name: "Ouvrir l'assistant IA" })).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "shell.sidebar-collapsed",
    etude: ["shell.sidebar-collapsed"],
    vue: "desktop",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      await c.page.addInitScript(() => {
        try {
          window.localStorage.setItem("myflip-sidebar", "collapsed");
        } catch {
          // about:blank
        }
      });
      await aller(c.page, "/dashboard", "demo");
      await expect(c.page.locator("html")).toHaveAttribute("data-sidebar", "collapsed");
      await attendreDashboard(c.page);
      await c.capture();
    },
  },
  {
    id: "shell.topbar",
    etude: ["shell.topbar"],
    vue: "both",
    compte: "demo",
    chemin: "/stock",
    executer: async (c) => {
      await aller(c.page, "/stock", "demo");
      await attendreStock(c.page);
      await defiler(c.page, 0.4);
      await c.capture("defile");
    },
  },
  {
    id: "shell.dock-mobile",
    etude: ["shell.dock-mobile"],
    vue: "mobile",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      await aller(c.page, "/dashboard", "demo");
      await attendreDashboard(c.page);
      await c.capture();
      await defiler(c.page, 0.6);
      await c.capture("defile");
    },
  },
  {
    id: "shell.theme-toggle",
    etude: ["shell.theme-toggle"],
    vue: "both",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      await aller(c.page, "/dashboard", "demo");
      await attendreDashboard(c.page);
      const versSombre = c.theme === "light";
      await c.page.getByRole("button", { name: versSombre ? "Passer en thème sombre" : "Passer en thème clair" }).click();
      if (versSombre) await expect(c.page.locator("html")).toHaveAttribute("data-theme", "dark");
      else await expect(c.page.locator("html")).not.toHaveAttribute("data-theme", "dark");
      await c.capture("bascule");
    },
  },
  {
    id: "shell.notifications-panel",
    etude: ["shell.notifications-panel"],
    vue: "both",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      await aller(c.page, "/dashboard", "demo");
      await attendreDashboard(c.page);
      const cloche = c.page.getByRole("button", { name: /^Notifications/ });
      await cloche.click();
      await expect(cloche).toHaveAttribute("aria-expanded", "true");
      await expect(c.page.getByText(/\d+ à traiter/)).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "shell.notifications-panel.vide",
    etude: ["shell.notifications-panel"],
    vue: "both",
    compte: "neuf",
    chemin: "/dashboard",
    executer: async (c) => {
      await aller(c.page, "/dashboard", "neuf");
      await attendreDashboard(c.page, COMPTES.neuf.prenom);
      await c.page.getByRole("button", { name: /^Notifications/ }).click();
      await expect(c.page.getByText("Tout est à jour — rien à faire")).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "shell.account-menu",
    etude: ["shell.account-menu"],
    vue: "both",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      await aller(c.page, "/dashboard", "demo");
      await attendreDashboard(c.page);
      const avatar = c.page.getByRole("button", { name: `Mon compte (${COMPTES.demo.prenom})` });
      await avatar.click();
      await expect(avatar).toHaveAttribute("aria-expanded", "true");
      await expect(visible(c.page.getByText("Connecté", { exact: true }))).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "shell.chatbot-panel",
    etude: ["shell.chatbot-panel", "shell.chatbot-fab"],
    vue: "both",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      await aller(c.page, "/dashboard", "demo");
      await attendreDashboard(c.page);
      await c.page.getByRole("button", { name: "Ouvrir l'assistant IA" }).click();
      await expect(c.page.getByRole("heading", { name: "Assistant IA" })).toBeVisible();
      await expect(c.page.getByPlaceholder("Écris un message…")).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "shell.session-expired",
    etude: ["shell.session-expired", "shell.toaster"],
    vue: "both",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      // La page se charge normalement (avatar, notifications, données) ; le 401 n'arrive qu'à
      // l'interaction : un 401 au chargement ne laissait que 1,5 s avant la redirection vers /login
      // (lib/hooks.ts, jsonFetch), course perdue dès que la machine ralentit.
      await aller(c.page, "/dashboard", "demo");
      await attendreDashboard(c.page);
      // Redirection retenue : la navigation vers /login n'est jamais servie, la page et le toast restent.
      await c.page.route((u) => u.pathname === "/login", () => undefined);
      // 401 simulé : la vraie session reste intacte (aucun signOut).
      await simulerJson(c.page, { chemin: "/api/dashboard" }, 401, { error: "Non authentifié (simulation e2e)." });
      c.simule("GET /api/dashboard → 401 (au changement de période) ; navigation vers /login retenue");
      await c.page.getByRole("button", { name: "30J", exact: true }).click();
      await expect(toast(c.page, "Session expirée. Reconnecte-toi pour reprendre ici.")).toBeVisible();
      await c.capture(undefined, IMMEDIAT);
      // React Query relance la requête (1 s, 2 s, 4 s) : un 2e toast s'empile. La capture doit précéder le premier.
      await expect(c.page.locator("[data-sonner-toast]"), "un seul toast au moment de la capture").toHaveCount(1);
    },
  },

  // ── Dashboard ──
  {
    id: "dashboard.demarrage-card",
    etude: ["dashboard.demarrage-card", "dashboard.objectif"],
    vue: "both",
    compte: "neuf",
    chemin: "/dashboard",
    executer: async (c) => {
      await aller(c.page, "/dashboard", "neuf");
      await attendreDashboard(c.page, COMPTES.neuf.prenom);
      await expect(visible(c.page.getByText(/Configuration · étape 1 sur 3/i))).toBeVisible();
      await c.capture();
      const aDefinir = visible(c.page.getByText("À définir"));
      await aDefinir.scrollIntoViewIfNeeded();
      await expect(aDefinir).toBeVisible();
      await c.capture("objectif-a-definir");
    },
  },
  {
    id: "dashboard.periode",
    etude: ["dashboard.periode"],
    vue: "both",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      await aller(c.page, "/dashboard", "demo");
      await attendreDashboard(c.page);
      for (const [code, titre, suffixe] of [
        ["30J", "30 JOURS", "30j"],
        ["TRIM.", "3 MOIS", "trimestre"],
        ["TOUT", "TOUT L’HISTORIQUE", "tout"],
      ] as const) {
        await c.page.getByRole("button", { name: code, exact: true }).click();
        await expect(visible(c.page.getByText(`CA TOTAL — ${titre}`))).toBeVisible();
        await c.capture(suffixe, { pleinePage: true });
      }
    },
  },
  {
    id: "dashboard.loader",
    etude: ["dashboard.loader"],
    vue: "both",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      const r = await retenir(c.page, { chemin: "/api/dashboard" });
      c.simule("GET /api/dashboard retenue (chargement)");
      await aller(c.page, "/dashboard", "demo");
      await r.vue;
      await expect(visible(c.page.getByText("Chargement du dashboard"))).toBeVisible();
      await calme(c.page, "dashboard en chargement");
      await c.capture(undefined, IMMEDIAT);
      r.liberer();
      await attendreDashboard(c.page);
    },
  },
  {
    id: "dashboard.erreur",
    etude: ["dashboard.loader"],
    vue: "both",
    compte: "demo",
    chemin: "/dashboard",
    executer: async (c) => {
      await simulerJson(c.page, { chemin: "/api/dashboard" }, 500, { error: "Erreur simulée (e2e) : tableau de bord indisponible." });
      c.simule("GET /api/dashboard → 500 (React Query réessaie 3 fois)");
      await aller(c.page, "/dashboard", "demo");
      await expect(c.page.getByText("Erreur simulée (e2e) : tableau de bord indisponible.")).toBeVisible({ timeout: 30_000 });
      await c.capture();
    },
  },

  // ── Stock ──
  {
    id: "stock.chips-statut",
    etude: ["stock.chips-statut"],
    vue: "both",
    compte: "demo",
    chemin: "/stock",
    executer: async (c) => {
      await aller(c.page, "/stock", "demo");
      await attendreStock(c.page);
      await c.page.getByRole("button", { name: "Brouillon 3" }).click();
      await expect(c.page.getByRole("button", { name: "Brouillon 3" })).toHaveAttribute("aria-pressed", "true");
      await expect(visible(c.page.getByText(/^PIS10$/))).toBeVisible();
      await c.capture(undefined, { pleinePage: true });
    },
  },
  {
    id: "stock.colonnes",
    etude: ["stock.colonnes"],
    vue: "desktop",
    compte: "demo",
    chemin: "/stock",
    executer: async (c) => {
      await aller(c.page, "/stock", "demo");
      await attendreStock(c.page);
      const bouton = c.page.getByRole("button", { name: "Colonnes" });
      await bouton.click();
      await expect(bouton).toHaveAttribute("aria-expanded", "true");
      await c.capture();
    },
  },
  {
    id: "stock.selection-bar",
    etude: ["stock.selection-bar"],
    vue: "both",
    compte: "demo",
    chemin: "/stock",
    executer: async (c) => {
      await aller(c.page, "/stock", "demo");
      await attendreStock(c.page);
      await cocher(c, "ADI1");
      await cocher(c, "ADI2");
      await expect(visible(c.page.getByText("2 sélectionnés"))).toBeVisible();
      await expect(c.page.getByRole("button", { name: "Annuler la sélection" })).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "stock.detail-modal",
    etude: ["stock.detail-modal"],
    vue: "both",
    compte: "demo",
    chemin: "/stock",
    executer: async (c) => {
      await aller(c.page, "/stock", "demo");
      await attendreStock(c.page);
      // Article vendu : « Informations de vente » (cellules éditables), aucune annonce.
      await chercherSku(c.page, "LAC9");
      await visible(c.page.getByRole("button", { name: /^Voir le détail/ })).click();
      const dialogue = c.page.getByRole("dialog");
      await expect(dialogue).toBeVisible();
      await expect(dialogue.getByText("Informations de vente")).toBeVisible();
      await c.capture("vendu");
      await dialogue.getByRole("button", { name: "Fermer" }).click();
      await expect(dialogue).toBeHidden();
      // Article en vente avec une annonce rédigée.
      await chercherSku(c.page, "CHD6");
      await visible(c.page.getByRole("button", { name: /^Voir le détail/ })).click();
      await expect(c.page.getByRole("dialog")).toBeVisible();
      await c.capture("annonce");
    },
  },
  {
    id: "stock.sell-modal",
    etude: ["stock.sell-modal"],
    vue: "both",
    compte: "demo",
    chemin: "/stock",
    executer: async (c) => {
      await aller(c.page, "/stock", "demo");
      await attendreStock(c.page);
      await chercherSku(c.page, "PIS7");
      await visible(c.page.getByRole("combobox", { name: "Statut de PIS7" })).selectOption("Vendu");
      const dialogue = c.page.getByRole("dialog", { name: /^Enregistrer la vente de PIS7/ });
      await expect(dialogue).toBeVisible();
      await c.capture();
      await dialogue.getByRole("button", { name: "Annuler" }).click();
      await expect(dialogue).toBeHidden();
    },
  },
  {
    id: "stock.new-commande-modal",
    etude: ["stock.new-commande-modal"],
    vue: "both",
    compte: "demo",
    chemin: "/stock",
    executer: async (c) => {
      await aller(c.page, "/stock", "demo");
      await attendreStock(c.page);
      await c.page.getByRole("button", { name: "Nouvelle commande" }).click();
      await expect(c.page.getByRole("dialog", { name: "Nouvelle commande" })).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "stock.cell-edit",
    etude: ["stock.cell-edit"],
    vue: "desktop",
    compte: "demo",
    chemin: "/stock",
    executer: async (c) => {
      await aller(c.page, "/stock", "demo");
      await attendreStock(c.page);
      const cellule = c.page.locator('[title="Double-clic pour modifier"]').first();
      await cellule.dblclick();
      const champ = c.page.locator("table input:focus, table select:focus");
      await expect(champ).toHaveCount(1);
      await c.capture();
      // Échap annule sans écrire (garde d'écriture en plus).
      await c.page.keyboard.press("Escape");
      await expect(champ).toHaveCount(0);
    },
  },
  {
    id: "stock.vide-chargement-erreur",
    etude: ["stock.empty-error-loader"],
    vue: "both",
    compte: "demo",
    chemin: "/stock",
    executer: async (c) => {
      await aller(c.page, "/stock", "demo");
      await attendreStock(c.page);
      await c.page.getByPlaceholder("Rechercher un SKU…").fill("ZZZ999");
      await expect(visible(c.page.getByText("Aucun article."))).toBeVisible();
      await c.capture("vide");

      const r = await retenir(c.page, { chemin: "/api/articles" });
      c.simule("GET /api/articles retenue (chargement)");
      await c.page.reload();
      await r.vue;
      await expect(visible(c.page.getByText("Chargement du stock"))).toBeVisible();
      await calme(c.page, "stock en chargement");
      await c.capture("chargement", IMMEDIAT);
      r.liberer();
      await attendreStock(c.page);

      await simulerJson(c.page, { chemin: "/api/articles" }, 500, { error: "Erreur simulée (e2e) : stock indisponible." });
      c.simule("GET /api/articles → 500");
      await c.page.reload();
      await expect(visible(c.page.getByText("Erreur simulée (e2e) : stock indisponible."))).toBeVisible({ timeout: 30_000 });
      await c.capture("erreur");
    },
  },

  // ── Commandes ──
  {
    id: "commandes.row-expanded",
    etude: ["commandes.row-expanded"],
    vue: "both",
    compte: "demo",
    chemin: "/commandes",
    executer: async (c) => {
      await aller(c.page, "/commandes", "demo");
      await expect(visible(c.page.getByText("Commandes récentes"))).toBeVisible();
      if (c.mobile) await visible(c.page.getByRole("button", { name: /ART\./ })).click();
      else await c.page.getByRole("button", { name: "Détail", exact: true }).first().click();
      const titre = visible(c.page.getByRole("heading", { name: "Rentabilité" }));
      await expect(titre).toBeVisible();
      await titre.scrollIntoViewIfNeeded();
      await c.capture();
    },
  },
  {
    id: "commandes.row-menu",
    etude: ["commandes.row-menu"],
    vue: "desktop",
    compte: "demo",
    chemin: "/commandes",
    executer: async (c) => {
      await aller(c.page, "/commandes", "demo");
      await expect(visible(c.page.getByText("Commandes récentes"))).toBeVisible();
      await c.page.getByRole("button", { name: "Actions" }).first().click();
      await expect(visible(c.page.getByText("Voir les articles"))).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "commandes.toast-import",
    etude: ["commandes.toast-import", "shell.toaster"],
    vue: "both",
    compte: "demo",
    chemin: "/commandes",
    executer: async (c) => {
      await aller(c.page, "/commandes", "demo");
      await expect(visible(c.page.getByText("Commandes récentes"))).toBeVisible();
      await c.page.getByRole("button", { name: "Importer un fichier Excel" }).click();
      await expect(toast(c.page, "Import Excel — bientôt disponible.")).toBeVisible();
      await c.capture(undefined, IMMEDIAT);
    },
  },
  {
    id: "commandes.nouvelle-commande",
    etude: ["stock.new-commande-modal"],
    vue: "both",
    compte: "demo",
    chemin: "/commandes",
    executer: async (c) => {
      await aller(c.page, "/commandes", "demo");
      await expect(visible(c.page.getByText("Commandes récentes"))).toBeVisible();
      await c.page.getByRole("button", { name: "Créer une commande" }).click();
      await expect(c.page.getByRole("dialog", { name: "Nouvelle commande" })).toBeVisible();
      await c.capture();
    },
  },

  // ── Mise en vente ──
  {
    id: "mev.etape-sku",
    etude: ["mev.etape-sku", "mev.action-bar"],
    vue: "both",
    compte: "demo",
    chemin: "/mise-en-vente",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/mise-en-vente", "demo");
      const premier = page.getByPlaceholder("Ex : PRL1");
      await premier.fill("PIS7");
      await premier.press("Enter");
      await expect(visible(page.getByText("Lot : Pulls islandais"))).toBeVisible();
      // Entrée sur la dernière ligne en ajoute une, focalisée : doublon puis SKU inconnu.
      const suivants = page.getByPlaceholder("SKU suivant…");
      await suivants.nth(0).fill("PIS7");
      await suivants.nth(0).press("Enter");
      await suivants.nth(1).fill("ZZZ9");
      await suivants.nth(1).press("Enter");
      await expect(visible(page.getByText(/Aucun article pour « ZZZ9 »/))).toBeVisible();
      await expect(visible(page.getByText(/Ce SKU apparaît plusieurs fois/))).toBeVisible();
      await c.capture(undefined, { pleinePage: true });
      await defiler(page);
      await c.capture("defile");
    },
  },
  {
    id: "mev.etape-fiches",
    etude: ["mev.etape-fiches", "mev.action-bar", "mev.photo-zoom"],
    vue: "both",
    compte: "demo",
    chemin: "/mise-en-vente",
    executer: async (c) => {
      await preparerFiche(c, true);
      const { page } = c;
      await c.capture("prete", { pleinePage: true });
      await defiler(page);
      await c.capture("prete-defile");
      await page.getByRole("button", { name: "Agrandir la photo 1" }).click();
      const fermer = page.getByRole("button", { name: "Fermer" });
      await expect(fermer).toBeVisible();
      await c.capture("zoom");
      await page.keyboard.press("Escape");
      await expect(fermer).toBeHidden();
    },
  },
  {
    id: "mev.etape-generation",
    etude: ["mev.etape-generation", "mev.etape-annonces", "mev.action-bar"],
    vue: "both",
    compte: "demo",
    chemin: "/mise-en-vente",
    executer: async (c) => {
      const { page } = c;
      await preparerFiche(c, false);
      // 1. Génération retenue : la file montre « rédaction… ».
      const premiere = await retenir(page, { chemin: "/api/listings/generate", methode: "POST" });
      c.simule("POST /api/listings/generate retenue, puis 500, puis 200 (annonce simulée, aucun modèle appelé)");
      await page.getByRole("button", { name: "Générer l'annonce" }).click();
      await premiere.vue;
      await expect(visible(page.getByText("rédaction…"))).toBeVisible();
      await c.capture("en-cours", { ...IMMEDIAT, pleinePage: true });
      // 2. Échec : « Relancer ».
      premiere.liberer(repondreJson(500, { error: "Le modèle n'a pas répondu (simulation e2e)." }));
      await expect(page.getByRole("button", { name: "Relancer" })).toBeVisible();
      await c.capture("echec", { pleinePage: true });
      // 3. Succès au 2e essai.
      await simulerJson(page, { chemin: "/api/listings/generate", methode: "POST" }, 200, ANNONCE_SIMULEE);
      await page.getByRole("button", { name: "Relancer" }).click();
      await expect(page.getByRole("button", { name: "Voir les annonces" })).toBeVisible();
      await c.capture("terminee", { pleinePage: true });
      // 4. Étape 4, une annonce.
      await page.getByRole("button", { name: "Voir les annonces" }).click();
      await expect(visible(page.getByText(ANNONCE_SIMULEE.titre))).toBeVisible();
      await c.capture("annonce", { pleinePage: true });
      await defiler(page);
      await c.capture("annonce-defile");
    },
  },
  {
    id: "mev.session-restauree",
    etude: ["mev.session-restored", "mev.etape-annonces", "mev.action-bar"],
    vue: "both",
    compte: "demo",
    chemin: "/mise-en-vente",
    executer: async (c) => {
      const { page } = c;
      await poserSessionMev(page);
      c.simule("sessionStorage mev_session_v2 : 2 annonces déjà rédigées (aucune génération)");
      // 1. Chargement direct (rechargement réel de l'utilisateur).
      await aller(page, "/mise-en-vente", "demo");
      await expect(visible(page.getByText(SESSION_MEV.fiches[0].annonce.titre))).toBeVisible();
      await expect(visible(page.getByText("2 annonces — tout enregistrer en :"))).toBeVisible();
      await constaterToast(page, /Session restaurée : 2 articles/, "chargement direct de /mise-en-vente");
      // L'image validée du Studio s'ajoute à SDN3 APRÈS le chargement (requête puis toast) : on la
      // attend, puis on laisse le toast s'éteindre, sinon la page capturée dépend de la vitesse du serveur.
      await expect(visible(page.getByText(/Photos \(1\)/i))).toBeVisible();
      await attendreSansToast(page);
      await c.capture("annonces", { pleinePage: true });
      await defiler(page);
      await c.capture("annonces-defile");
      // 2. Arrivée par le menu (navigation interne) : le Toaster est déjà monté, le toast s'affiche.
      await aller(page, "/dashboard", "demo");
      await attendreDashboard(page);
      if (c.mobile) {
        // Sur mobile, « Mise en vente » n'est plus dans le dock mais dans la feuille « Plus » (L2a).
        await page.getByRole("navigation", { name: "Navigation mobile" }).getByRole("button", { name: "Plus", exact: true }).click();
        await page.getByRole("dialog", { name: "Plus", exact: true }).getByRole("link", { name: /^Mise en vente/ }).click();
      } else {
        await visible(page.locator('a[href="/mise-en-vente"]')).click();
      }
      await expect(toast(page, /Session restaurée : 2 articles/)).toBeVisible();
      // Le toast de l'image du Studio arrive après sa requête : sans lui, la pile de toasts varie.
      await expect(toast(page, /1 image du Studio ajoutée à SDN3/)).toBeVisible();
      await c.capture("toast", IMMEDIAT);
    },
  },
  {
    id: "mev.delai-modal",
    etude: ["mev.delai-modal"],
    vue: "both",
    compte: "demo",
    chemin: "/mise-en-vente",
    executer: async (c) => {
      const { page } = c;
      await poserSessionMev(page);
      c.simule("sessionStorage mev_session_v2 : 2 annonces déjà rédigées");
      await aller(page, "/mise-en-vente", "demo");
      // Même attente que mev.session-restauree : l'image du Studio s'ajoute après coup (toast de 4 s).
      await expect(visible(page.getByText(/Photos \(1\)/i))).toBeVisible();
      await attendreSansToast(page);
      const publier = page.getByRole("button", { name: /Publier sur Vinted/ }).first();
      await expect(publier).toBeEnabled();
      await publier.click();
      const dialogue = page.getByRole("dialog", { name: /Délai entre deux brouillons/ });
      await expect(dialogue).toBeVisible();
      await c.capture();
      // NE PAS confirmer : PATCH article + ouverture de Vinted.
      await dialogue.getByRole("button", { name: "Annuler" }).click();
      await expect(dialogue).toBeHidden();
    },
  },

  // ── À comptabiliser ──
  {
    id: "compta.sell-dialog",
    etude: ["compta.sell-dialog"],
    vue: "both",
    compte: "demo",
    chemin: "/a-comptabiliser",
    executer: async (c) => {
      await aller(c.page, "/a-comptabiliser", "demo");
      await expect(visible(c.page.getByText(/^CHD3/))).toBeVisible();
      await visible(c.page.getByRole("button", { name: "Valider" })).click();
      // La même fenêtre que depuis le Stock (FenetreVente), titrée « Comptabiliser… ».
      const dialogue = c.page.getByRole("dialog", { name: /^Comptabiliser la vente de CHD3/ });
      await expect(dialogue).toBeVisible();
      await expect(dialogue.getByRole("button", { name: "Enregistrer la vente" })).toBeVisible();
      await c.capture();
      await dialogue.getByRole("button", { name: "Annuler" }).click();
      await expect(dialogue).toBeHidden();
    },
  },
  {
    id: "compta.delete-modal",
    etude: ["compta.delete-modal"],
    vue: "both",
    compte: "demo",
    chemin: "/a-comptabiliser",
    executer: async (c) => {
      await aller(c.page, "/a-comptabiliser", "demo");
      await expect(visible(c.page.getByText(/^CHD3/))).toBeVisible();
      await visible(c.page.getByRole("button", { name: "Supprimer" })).click();
      // Une boîte de confirmation (AlertDialog), plus une modale à titre simple.
      const dialogue = c.page.getByRole("alertdialog", { name: /^Supprimer CHD3 \?/ });
      await expect(dialogue).toBeVisible();
      await c.capture();
      await dialogue.getByRole("button", { name: "Annuler" }).click();
      await expect(dialogue).toBeHidden();
    },
  },
  {
    id: "compta.remettre-en-stock",
    etude: ["compta.remettre-en-stock"],
    vue: "both",
    compte: "demo",
    chemin: "/a-comptabiliser",
    executer: async (c) => {
      await aller(c.page, "/a-comptabiliser", "demo");
      await expect(visible(c.page.getByText(/^CHD3/))).toBeVisible();
      const r = await retenir(c.page, { chemin: /^\/api\/articles\/[^/]+$/, methode: "PATCH" });
      c.simule("PATCH /api/articles/<id> retenu puis refusé (503 simulé) : rien n'est écrit");
      await visible(c.page.getByRole("button", { name: "Remettre en stock" })).click();
      await r.vue;
      // Mise à jour optimiste : la pastille passe à « En stock » une fois la requête partie (après les
      // requêtes en cours que React Query annule d'abord) : on l'attend, sinon la capture dépend de la vitesse.
      await expect(visible(c.page.getByText("En stock", { exact: true }))).toBeVisible();
      await c.capture("en-cours", IMMEDIAT);
      r.liberer(repondreJson(503, { error: "Écriture refusée (simulation e2e)." }));
      // Retour arrière de la mise à jour optimiste : la ligne revient.
      await expect(visible(c.page.getByText(/^CHD3/))).toBeVisible();
      await c.capture("refuse");
    },
  },

  // ── Calendrier ──
  {
    id: "cal.day-detail",
    etude: ["cal.day-detail"],
    vue: "both",
    compte: "demo",
    chemin: "/calendrier",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/calendrier", "demo");
      await expect(calendrierCharge(page)).toBeVisible();
      // Un jour avec ventes : bouton d'accordéon (mobile) ou cellule de la grille (desktop).
      const jours = c.mobile
        ? page.getByRole("button", { name: /\d+ articles?/ }).filter({ visible: true })
        : page.locator('div[style*="min-height: 94px"]').filter({ hasText: "art." });
      const venteCeMois = await jours
        .first()
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      // Le 1er du mois, le mois courant peut être vide : le mois précédent en a toujours (seed).
      if (!venteCeMois) await page.getByRole("button", { name: "Mois précédent" }).click();
      await jours.first().click();
      if (c.mobile) await expect(visible(page.locator("li").filter({ hasText: /NET/ }))).toBeVisible();
      else await expect(page.getByText("Détail du jour")).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "cal.month-nav",
    etude: ["cal.month-nav"],
    vue: "both",
    compte: "demo",
    chemin: "/calendrier",
    executer: async (c) => {
      await aller(c.page, "/calendrier", "demo");
      await expect(calendrierCharge(c.page)).toBeVisible();
      const maintenant = new Date();
      const precedent = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 15);
      const titre = precedent.toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" });
      await c.page.getByRole("button", { name: "Mois précédent" }).click();
      await expect(c.page.getByRole("heading", { level: 2, name: titre })).toBeVisible();
      await c.capture(undefined, { pleinePage: true });
    },
  },

  // ── Statistiques ──
  {
    id: "stats.scope-listbox",
    etude: ["stats.scope-listbox"],
    vue: "both",
    compte: "demo",
    chemin: "/statistiques",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/statistiques", "demo");
      await expect(page.getByRole("img", { name: "Répartition des statuts" })).toBeVisible();
      await page.getByRole("button", { name: "Tout l’historique" }).click();
      const liste = page.getByRole("listbox");
      await expect(liste).toBeVisible();
      await c.capture("ouvert");
      const options = liste.getByRole("option");
      await expect(options.nth(1)).toBeVisible();
      await options.nth(1).click();
      await expect(liste).toBeHidden();
      await expect(visible(page.getByText(/LA PIÈCE EN MOYENNE/))).toBeVisible();
      await c.capture("commande", { pleinePage: true });
    },
  },

  // ── Paramètres (Prompts) ──
  {
    id: "params.tabs",
    etude: ["params.tabs"],
    vue: "both",
    compte: "demo",
    chemin: "/parametres",
    executer: async (c) => {
      await aller(c.page, "/parametres", "demo");
      await expect(visible(c.page.getByText(/^Prompt par défaut$/))).toBeVisible();
      await c.page.getByRole("tab", { name: /^Studio/ }).click();
      await expect(c.page.getByRole("tab", { name: /^Studio/ })).toHaveAttribute("aria-selected", "true");
      await expect(c.page.getByRole("heading", { name: "Prompt maître" })).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "params.prompt-modal",
    etude: ["params.prompt-modal"],
    vue: "both",
    compte: "demo",
    chemin: "/parametres",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/parametres", "demo");
      await expect(visible(page.getByText(/^Prompt par défaut$/))).toBeVisible();
      await visible(page.getByRole("button", { name: "Nouveau prompt" })).click();
      const nouveau = page.getByRole("dialog", { name: "Nouveau prompt" });
      await expect(nouveau).toBeVisible();
      await c.capture("nouveau");
      // Validation locale : « Enregistrer » sans nom n'envoie rien.
      await nouveau.getByRole("button", { name: "Enregistrer" }).click();
      await expect(nouveau.getByText("Le nom est requis.")).toBeVisible();
      await c.capture("erreur");
      await nouveau.getByRole("button", { name: "Annuler" }).click();
      await expect(nouveau).toBeHidden();
      await visible(page.getByRole("button", { name: "Modifier", exact: true })).click();
      await expect(page.getByRole("dialog", { name: "Modifier le prompt" })).toBeVisible();
      await c.capture("modifier");
    },
  },
  {
    id: "params.metaprompt-modal",
    etude: ["params.metaprompt-modal"],
    vue: "both",
    compte: "demo",
    chemin: "/parametres",
    executer: async (c) => {
      await aller(c.page, "/parametres", "demo");
      await expect(visible(c.page.getByText(/^Prompt par défaut$/))).toBeVisible();
      await c.page.getByRole("button", { name: "Obtenir le méta-prompt" }).click();
      await expect(c.page.getByRole("dialog", { name: "Méta-prompt" })).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "params.studio-editors",
    etude: ["params.studio-editors"],
    vue: "desktop",
    compte: "demo",
    chemin: "/parametres?onglet=studio",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/parametres?onglet=studio", "demo");
      await expect(page.getByRole("heading", { name: "Prompt maître" })).toBeVisible();
      await page.getByRole("button", { name: "Modifier", exact: true }).first().click();
      await expect(page.getByRole("textbox", { name: "Prompt maître" })).toBeVisible();
      await c.capture("prompt-maitre");
      await page.reload();
      await expect(page.getByRole("heading", { name: "Prompt maître" })).toBeVisible();
      await page.getByRole("button", { name: "Nouveau prompt d’angle" }).click();
      await expect(page.getByPlaceholder("8° à droite")).toBeVisible();
      await c.capture("nouvel-angle");
    },
  },

  // ── Mon compte ──
  {
    id: "compte.trello-toast-url",
    etude: ["compte.trello-toast-url", "shell.toaster"],
    vue: "both",
    compte: "demo",
    chemin: "/compte?trello=ok",
    executer: async (c) => {
      // Le retour de /api/trello/callback est un chargement complet : c'est ce qu'on rejoue.
      for (const code of ["ok", "refus"] as const) {
        await aller(c.page, `/compte?trello=${code}`, "demo");
        await expect(c.page.getByPlaceholder(/••••0000/)).toBeVisible();
        // L'effet a tourné : il retire ?trello= de l'URL après avoir émis le toast.
        await expect(c.page).toHaveURL(/\/compte$/);
        await constaterToast(c.page, code === "ok" ? "Trello est connecté." : undefined, `/compte?trello=${code} en chargement direct`);
        await c.capture(code, IMMEDIAT);
      }
    },
  },
  {
    id: "compte.integrations-forms",
    etude: ["compte.integrations-forms"],
    vue: "both",
    compte: "demo",
    chemin: "/compte",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/compte", "demo");
      await expect(page.getByPlaceholder(/••••0000/)).toBeVisible();
      await page.getByRole("button", { name: "Enregistrer ma clé" }).click();
      await expect(toast(page, "Aucune clé saisie.")).toBeVisible();
      await c.capture("cle-vide", IMMEDIAT);

      // Mots de passe factices, jamais envoyés (validation locale, garde d'écriture).
      const masques = page.getByPlaceholder("••••••••", { exact: true });
      await masques.nth(0).fill("ancien-e2e-factice");
      await page.getByPlaceholder("8 caractères minimum").fill("nouveau-e2e-1");
      await masques.nth(1).fill("nouveau-e2e-2");
      await page.getByRole("button", { name: "Mettre à jour" }).click();
      await expect(toast(page, "Les nouveaux mots de passe ne correspondent pas.")).toBeVisible();
      await c.capture("mots-de-passe-differents", IMMEDIAT);

      await page.getByRole("combobox", { name: "Modèle qui rédige les annonces" }).selectOption({ label: "Autre…" });
      const libre = page.getByPlaceholder("fournisseur/modele");
      await expect(libre).toBeVisible();
      await libre.scrollIntoViewIfNeeded();
      await c.capture("autre-modele");
    },
  },
  {
    id: "compte.trello-connecte",
    // L'écran « connecté » (bouton « Déconnecter Trello », alerte webhook) ; l'action n'est jamais jouée.
    etude: [],
    vue: "both",
    compte: "demo",
    chemin: "/compte",
    executer: async (c) => {
      const { page } = c;
      // Réglages réels du compte, Trello passé à « connecté » ; boards et étiquettes simulés.
      await page.route(
        (u) => u.pathname === "/api/user/settings",
        async (route) => {
          if (route.request().method() !== "GET") return route.fallback();
          const reponse = await route.fetch();
          const json = (await reponse.json()) as Record<string, unknown> & { source: Record<string, unknown> };
          json.trello = {
            connecte: true,
            source: "oauth",
            membreNom: "Jules (compte de test)",
            boardId: "e2e-board-1",
            labelId: "e2e-label-1",
            comptabiliseLabelId: "e2e-label-2",
            webhookActif: false,
          };
          json.source = { ...json.source, trello: "oauth" };
          await route.fulfill({ response: reponse, json });
        },
      );
      await simulerJson(page, { chemin: "/api/user/settings/trello", methode: "GET" }, 200, {
        boards: [{ id: "e2e-board-1", name: "Ventes (test e2e)" }],
        labels: [
          { id: "e2e-label-1", name: "À comptabiliser", color: "purple" },
          { id: "e2e-label-2", name: "Comptabilisé", color: "green" },
        ],
      });
      c.simule("GET /api/user/settings : trello connecté (OAuth), webhook inactif ; GET /api/user/settings/trello simulé");
      await aller(page, "/compte", "demo");
      await expect(page.getByRole("button", { name: "Déconnecter Trello" })).toBeVisible();
      await expect(visible(page.getByText(/Aucun webhook enregistré/))).toBeVisible();
      await visible(page.getByText(/Aucun webhook enregistré/)).scrollIntoViewIfNeeded();
      await c.capture();
    },
  },
  {
    id: "compte.chiffrement-indisponible",
    etude: ["compte.integrations-forms"],
    vue: "both",
    compte: "demo",
    chemin: "/compte",
    executer: async (c) => {
      const { page } = c;
      await page.route(
        (u) => u.pathname === "/api/user/settings",
        async (route) => {
          if (route.request().method() !== "GET") return route.fallback();
          const reponse = await route.fetch();
          const json = (await reponse.json()) as Record<string, unknown>;
          json.chiffrementDisponible = false;
          await route.fulfill({ response: reponse, json });
        },
      );
      c.simule("GET /api/user/settings : chiffrementDisponible = false");
      await aller(page, "/compte", "demo");
      const alerte = visible(page.getByText(/Le chiffrement n.est pas configuré/));
      await expect(alerte).toBeVisible();
      await alerte.scrollIntoViewIfNeeded();
      await c.capture();
    },
  },
  {
    id: "compte.test-cle",
    etude: ["compte.test-cle"],
    vue: "both",
    compte: "demo",
    chemin: "/compte",
    executer: async (c) => {
      await simulerJson(c.page, { chemin: "/api/user/settings/test", methode: "POST" }, 200, { ok: true, message: "Clé OpenRouter valide." });
      c.simule("POST /api/user/settings/test → { ok: true } (aucun appel OpenRouter)");
      await aller(c.page, "/compte", "demo");
      await expect(c.page.getByPlaceholder(/••••0000/)).toBeVisible();
      await c.page.getByRole("button", { name: "Tester" }).click();
      await expect(toast(c.page, "Clé OpenRouter valide.")).toBeVisible();
      await c.capture(undefined, IMMEDIAT);
    },
  },

  // ── Démarrage ──
  {
    id: "demarrage.steps",
    etude: ["demarrage.steps"],
    vue: "both",
    compte: "neuf",
    chemin: "/demarrage",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/demarrage", "neuf");
      await expect(page.getByRole("button", { name: /Connecter ton Trello/ })).toBeVisible();
      await page.getByRole("button", { name: /Préparer le board/ }).click();
      await expect(visible(page.getByRole("button", { name: /Créer tout sur mon board/ }))).toBeVisible();
      await c.capture("etape-2", { pleinePage: true });
      await page.getByRole("button", { name: /Ta première commande/ }).click();
      await expect(page.getByRole("button", { name: "Créer ma première commande" })).toBeVisible();
      await c.capture("etape-3", { pleinePage: true });
    },
  },

  // ── Studio (desktop) ──
  {
    id: "studio.layout-banner",
    etude: ["studio.layout-banner"],
    vue: "desktop",
    compte: "demo",
    chemin: "/studio",
    executer: async (c) => {
      await aller(c.page, "/studio", "demo");
      await expect(c.page.getByRole("note")).toContainText("Images générées par IA");
      await expect(c.page.getByText(/SacBase (injoignable|non configuré)/)).toHaveCount(0);
      await c.capture();
    },
  },
  {
    id: "studio.accueil-filtres",
    etude: ["studio.accueil-filtres"],
    vue: "desktop",
    compte: "demo",
    chemin: "/studio",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/studio", "demo");
      await expect(page.getByText(/^7 coloris · /)).toBeVisible();
      const filtre = page.getByRole("group", { name: "Filtre" });
      const generation = page.getByRole("group", { name: "Génération" });
      await filtre.getByRole("button", { name: /^À juger/ }).click();
      await expect(filtre.getByRole("button", { name: /^À juger/ })).toHaveAttribute("aria-pressed", "true");
      await c.capture("a-juger", { pleinePage: true });
      await filtre.getByRole("button", { name: /^Tous/ }).click();
      await generation.getByRole("button", { name: /^V3/ }).click();
      await expect(generation.getByRole("button", { name: /^V3/ })).toHaveAttribute("aria-pressed", "true");
      await c.capture("v3", { pleinePage: true });
      await generation.getByRole("button", { name: /^Toutes gén\./ }).click();
      await page.getByRole("searchbox").fill("zzz-aucun");
      await expect(page.getByText("Aucun coloris pour « zzz-aucun ».")).toBeVisible();
      await expect(page.getByRole("button", { name: "Effacer les filtres" })).toBeVisible();
      await c.capture("aucun-resultat", { pleinePage: true });
    },
  },
  {
    id: "studio.fiche-details-ia",
    etude: ["studio.fiche-details-ia"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      await aller(c.page, FICHE, "demo");
      await attendreFiche(c.page);
      const bouton = c.page.getByRole("button", { name: /^Détails vérifiés par l.IA/ });
      await bouton.click();
      await expect(bouton).toHaveAttribute("aria-expanded", "true");
      await c.capture();
    },
  },
  {
    id: "studio.fiche-sku-cible",
    etude: ["studio.fiche-sku-cible"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      await aller(c.page, FICHE, "demo");
      await attendreFiche(c.page);
      const sdn4 = c.page.getByRole("button", { name: /^SDN4/ });
      await sdn4.click();
      await expect(sdn4).toHaveAttribute("aria-pressed", "true");
      await c.capture(undefined, { pleinePage: true });
    },
  },
  {
    id: "studio.planche-selection",
    etude: ["studio.planche-selection"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      await aller(c.page, FICHE, "demo");
      await attendreFiche(c.page);
      // Depuis le 22/10, une seule façon de ranger : glisser, ou au clavier le menu de la photo
      // (« Déplacer vers… »). On ouvre le menu et son sous-menu, sans JAMAIS choisir (PATCH).
      await ouvrirEtape(c.page, "Photos");
      const actions = c.page.getByRole("button", { name: "Actions pour la photo Face", exact: true });
      await actions.scrollIntoViewIfNeeded();
      await actions.click();
      const menu = c.page.getByRole("menu");
      await expect(menu.getByRole("menuitem", { name: /Retirer de la planche/ })).toBeVisible();
      await menu.getByRole("menuitem", { name: /Déplacer vers/ }).hover();
      await expect(c.page.getByRole("menuitem", { name: /Dos/ }).first()).toBeVisible();
      await c.capture();
      await c.page.keyboard.press("Escape");
      await c.page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
    },
  },
  {
    id: "studio.file-a-juger",
    etude: ["studio.file-a-juger"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      const { page } = c;
      await aller(page, FICHE, "demo");
      await attendreFiche(page);
      // Aucune touche : V/R valident ou rejettent. Navigation à la souris seulement.
      const titre = page.getByRole("heading", { name: "À juger" });
      await titre.scrollIntoViewIfNeeded();
      for (const [rang, suffixe] of [["1 / 3", "image-1"], ["2 / 3", "image-2"], ["3 / 3", "image-3"]] as const) {
        if (rang !== "1 / 3") await page.getByRole("button", { name: "Image suivante" }).click();
        await expect(page.getByText(rang, { exact: true })).toBeVisible();
        await expect(page.getByText(/Avis de l.IA/)).toBeVisible();
        await c.capture(suffixe);
      }
    },
  },
  {
    id: "studio.correction-panel",
    etude: ["studio.correction-panel"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      await aller(c.page, FICHE, "demo");
      await attendreFiche(c.page);
      const bouton = c.page.getByRole("button", { name: /^Corriger un détail/ });
      await bouton.scrollIntoViewIfNeeded();
      await bouton.click();
      await expect(bouton).toHaveAttribute("aria-expanded", "true");
      await c.capture();
    },
  },
  {
    id: "studio.confirmation-depense",
    etude: ["studio.confirmation-depense"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      const { page } = c;
      await aller(page, FICHE, "demo");
      await attendreFiche(page);
      // Tarif inconnu : la confirmation est exigée avant toute requête. Si la
      // requête partait quand même, la garde d'écriture la bloquerait et le test échouerait.
      await ouvrirEtape(page, "Génération");
      await page.getByRole("button", { name: /^E2E: Tarif inconnu/ }).click();
      await page.getByRole("button", { name: /^Générer \d+ images?/ }).click();
      const dialogue = page.getByRole("alertdialog", { name: "Confirmer la dépense" });
      await expect(dialogue).toBeVisible();
      await dialogue.scrollIntoViewIfNeeded();
      await c.capture();
      await dialogue.getByRole("button", { name: "Annuler" }).click();
      await expect(dialogue).toBeHidden();
    },
  },
  {
    id: "studio.mode-generation",
    etude: ["studio.mode-generation"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      await aller(c.page, FICHE, "demo");
      await attendreFiche(c.page);
      await ouvrirEtape(c.page, "Génération");
      const onglet = c.page.getByRole("tab", { name: "À la main, dans Gemini" });
      await onglet.click();
      await expect(onglet).toHaveAttribute("aria-selected", "true");
      await onglet.scrollIntoViewIfNeeded();
      await c.capture();
    },
  },
  {
    id: "studio.cases-choix",
    etude: ["studio.cases-choix"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      const { page } = c;
      await aller(page, FICHE, "demo");
      await attendreFiche(page);
      await ouvrirEtape(page, "Angles");
      const tableau = page.getByRole("table", { name: /Photos × prompts d.angle/ });
      await tableau.scrollIntoViewIfNeeded();
      await page.getByRole("button", { name: "Tout décocher" }).click();
      await expect(tableau.getByRole("button", { name: "Choisie", pressed: true })).toHaveCount(0);
      await c.capture("aucune");
      await page.getByRole("button", { name: "Choisir automatiquement" }).click();
      await expect(tableau.getByRole("button", { name: "Choisie", pressed: true }).first()).toBeVisible();
      await c.capture("automatique");
    },
  },
  {
    id: "studio.modeles-catalogue",
    etude: ["studio.modeles-catalogue"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      const { page } = c;
      const r = await retenir(page, { chemin: "/api/studio/modeles", methode: "GET" });
      c.simule("GET /api/studio/modeles retenue, puis 500");
      await aller(page, FICHE, "demo");
      await r.vue;
      await ouvrirEtape(page, "Génération");
      const chargement = page.getByText("Chargement du catalogue…");
      await expect(chargement).toBeVisible();
      await calme(page, "catalogue des modèles en chargement");
      await chargement.scrollIntoViewIfNeeded();
      await c.capture("chargement", IMMEDIAT);
      r.liberer(repondreJson(500, { error: "Catalogue injoignable (simulation e2e)." }));
      const indisponible = visible(page.getByText(/Catalogue indisponible/));
      await expect(indisponible).toBeVisible();
      await c.capture("indisponible");
    },
  },
  {
    id: "studio.modeles-selection",
    etude: ["studio.modeles-catalogue"],
    vue: "desktop",
    compte: "demo",
    chemin: FICHE,
    executer: async (c) => {
      const { page } = c;
      await aller(page, FICHE, "demo");
      await attendreFiche(page);
      await ouvrirEtape(page, "Génération");
      const cher = page.getByRole("button", { name: /^E2E: Modèle cher/ });
      await cher.scrollIntoViewIfNeeded();
      await cher.click();
      await expect(cher).toHaveAttribute("aria-pressed", "true");
      await c.capture("modele-cher");
      // Un second modèle, trouvé par la recherche : la sélection devient une comparaison.
      await page.getByRole("searchbox", { name: "Rechercher un modèle" }).fill("seedream");
      const seedream = page.getByRole("button", { name: /^ByteDance Seed: Seedream/ });
      await seedream.click();
      await expect(seedream).toHaveAttribute("aria-pressed", "true");
      await c.capture("autre-modele");
    },
  },

  // ── Landing ──
  {
    id: "landing.menu-mobile",
    etude: ["landing.menu-mobile"],
    vue: "mobile",
    compte: "aucun",
    chemin: "/",
    executer: async (c) => {
      await c.page.emulateMedia({ reducedMotion: "reduce" });
      await aller(c.page, "/", "aucun");
      await c.page.getByRole("button", { name: "Ouvrir le menu" }).click();
      await expect(c.page.locator("#menu-mobile")).toBeVisible();
      await expect(c.page.getByRole("button", { name: "Fermer le menu" })).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "landing.header-sticky",
    etude: ["landing.header-sticky"],
    vue: "both",
    compte: "aucun",
    chemin: "/",
    executer: async (c) => {
      await c.page.emulateMedia({ reducedMotion: "reduce" });
      await aller(c.page, "/", "aucun");
      await expect(c.page.getByRole("heading", { level: 1 })).toBeVisible();
      await defiler(c.page, 0.45);
      await c.capture("defile");
    },
  },
  {
    id: "landing.faq-details",
    etude: ["landing.faq-details"],
    vue: "both",
    compte: "aucun",
    chemin: "/",
    executer: async (c) => {
      await c.page.emulateMedia({ reducedMotion: "reduce" });
      await aller(c.page, "/", "aucun");
      const question = c.page.locator("details").first();
      await question.locator("summary").click();
      await expect(question).toHaveAttribute("open", "");
      await question.scrollIntoViewIfNeeded();
      await c.capture();
    },
  },

  // ── Authentification ──
  {
    id: "login.forgot-mode",
    etude: ["login.forgot-mode"],
    vue: "both",
    compte: "aucun",
    chemin: "/login",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/login", "aucun");
      await page.getByRole("button", { name: "Mot de passe oublié ?" }).click();
      await expect(page.getByRole("button", { name: "Envoyer le lien" })).toBeVisible();
      await c.capture("formulaire");
      await simulerJson(page, { chemin: "/api/auth/forgot-password", methode: "POST" }, 200, { ok: true });
      c.simule("POST /api/auth/forgot-password → 200 (aucun e-mail, aucun jeton écrit)");
      await page.getByPlaceholder("aramis@exemple.com").fill(COMPTES.demo.email);
      await page.getByRole("button", { name: "Envoyer le lien" }).click();
      await expect(page.getByText(/Si cet email est enregistré/)).toBeVisible();
      await c.capture("envoye");
    },
  },
  {
    id: "login.erreur",
    etude: [],
    vue: "both",
    compte: "aucun",
    chemin: "/login",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/login", "aucun");
      // Mauvais mot de passe sur la base e2e locale : lecture seule.
      await page.locator("input[type=email]").fill(COMPTES.demo.email);
      await page.locator("input[type=password]").fill("mauvais-mot-de-passe-e2e");
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.getByText("Identifiants invalides.")).toBeVisible();
      await c.capture();
    },
  },
  {
    id: "login.chargement",
    etude: [],
    vue: "both",
    compte: "aucun",
    chemin: "/login",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/login", "aucun");
      const r = await retenir(page, { chemin: /^\/api\/auth\/callback\/credentials/, methode: "POST" });
      c.simule("POST /api/auth/callback/credentials retenue (chargement)");
      await page.locator("input[type=email]").fill(COMPTES.demo.email);
      await page.locator("input[type=password]").fill("mauvais-mot-de-passe-e2e");
      await page.getByRole("button", { name: "Se connecter" }).click();
      await r.vue;
      await expect(page.getByRole("button", { name: "Connexion…" })).toBeVisible();
      await c.capture(undefined, IMMEDIAT);
      r.liberer();
      await expect(page.getByText("Identifiants invalides.")).toBeVisible();
    },
  },
  {
    id: "signup.erreurs",
    etude: [],
    vue: "both",
    compte: "aucun",
    chemin: "/signup",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/signup?plan=solo", "aucun");
      await page.getByRole("textbox", { name: "Prénom" }).fill("Test");
      await page.getByRole("textbox", { name: "Email" }).fill("inscription-e2e@myflip.test");
      await page.getByRole("textbox", { name: "Mot de passe" }).fill("motdepasse-e2e");
      await page.getByRole("textbox", { name: "Code d'invitation" }).fill("MAUVAIS-CODE");
      await simulerJson(page, { chemin: "/api/auth/signup", methode: "POST" }, 403, { error: "Code d'invitation invalide." });
      c.simule("POST /api/auth/signup → 403 puis 409 (aucun compte créé)");
      await page.getByRole("button", { name: "Créer mon compte" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Code d'invitation invalide." })).toBeVisible();
      await c.capture("code-invalide");
      await simulerJson(page, { chemin: "/api/auth/signup", methode: "POST" }, 409, { error: "Un compte existe déjà avec cet email." });
      await page.getByRole("button", { name: "Créer mon compte" }).click();
      await expect(page.getByRole("alert").filter({ hasText: "Un compte existe déjà avec cet email." })).toBeVisible();
      await c.capture("email-pris");
    },
  },
  {
    id: "signup.chargement",
    etude: [],
    vue: "both",
    compte: "aucun",
    chemin: "/signup",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/signup", "aucun");
      await page.getByRole("textbox", { name: "Prénom" }).fill("Test");
      await page.getByRole("textbox", { name: "Email" }).fill("inscription-e2e@myflip.test");
      await page.getByRole("textbox", { name: "Mot de passe" }).fill("motdepasse-e2e");
      await page.getByRole("textbox", { name: "Code d'invitation" }).fill("MAUVAIS-CODE");
      const r = await retenir(page, { chemin: "/api/auth/signup", methode: "POST" });
      c.simule("POST /api/auth/signup retenue puis 403");
      await page.getByRole("button", { name: "Créer mon compte" }).click();
      await r.vue;
      await expect(page.getByRole("button", { name: "Création…" })).toBeVisible();
      await c.capture(undefined, IMMEDIAT);
      r.liberer(repondreJson(403, { error: "Code d'invitation invalide." }));
      await expect(page.getByRole("alert").filter({ hasText: "Code d'invitation invalide." })).toBeVisible();
    },
  },
  {
    id: "reset.invalid-token",
    etude: ["reset.invalid-token"],
    vue: "both",
    compte: "aucun",
    chemin: "/reset-password",
    executer: async (c) => {
      await aller(c.page, "/reset-password", "aucun");
      await expect(c.page.getByText(/Lien invalide\. Recommence/)).toBeVisible();
      await expect(c.page.getByRole("button", { name: "Mettre à jour le mot de passe" })).toBeDisabled();
      await c.capture();
    },
  },
  {
    id: "reset.erreurs",
    etude: [],
    vue: "both",
    compte: "aucun",
    chemin: "/reset-password?token=e2e-jeton-factice",
    executer: async (c) => {
      const { page } = c;
      await aller(page, "/reset-password?token=e2e-jeton-factice", "aucun");
      await page.getByPlaceholder("8 caractères minimum").fill("nouveau-e2e-1");
      await page.getByPlaceholder("••••••••").fill("nouveau-e2e-2");
      await page.getByRole("button", { name: "Mettre à jour le mot de passe" }).click();
      await expect(page.getByText("Les mots de passe ne correspondent pas.")).toBeVisible();
      await c.capture("differents");
      await simulerJson(page, { chemin: "/api/auth/reset-password", methode: "POST" }, 400, { error: "Lien invalide ou expiré." });
      c.simule("POST /api/auth/reset-password → 400 (jeton expiré simulé)");
      await page.getByPlaceholder("••••••••").fill("nouveau-e2e-1");
      await page.getByRole("button", { name: "Mettre à jour le mot de passe" }).click();
      await expect(page.getByText("Lien invalide ou expiré.")).toBeVisible();
      await c.capture("lien-expire");
    },
  },
  {
    id: "reset.succes",
    etude: [],
    vue: "both",
    compte: "aucun",
    chemin: "/reset-password?token=e2e-jeton-factice",
    executer: async (c) => {
      const { page } = c;
      await simulerJson(page, { chemin: "/api/auth/reset-password", methode: "POST" }, 200, { ok: true });
      c.simule("POST /api/auth/reset-password → 200 (aucun mot de passe changé)");
      await aller(page, "/reset-password?token=e2e-jeton-factice", "aucun");
      await page.getByPlaceholder("8 caractères minimum").fill("nouveau-e2e-1");
      await page.getByPlaceholder("••••••••").fill("nouveau-e2e-1");
      await page.getByRole("button", { name: "Mettre à jour le mot de passe" }).click();
      // Redirection vers /login 2,5 s plus tard : photo immédiate.
      await expect(page.getByText(/Mot de passe mis à jour/)).toBeVisible();
      await c.capture(undefined, IMMEDIAT);
    },
  },
];

/** États de l'étude volontairement NON capturés, avec la raison. */
const NON_CAPTURES: { id: string; raison: string }[] = [
  { id: "shell.logout", raison: "signOut détruit la session du contexte ; jamais déclenché." },
  { id: "shell.welcome-modal", raison: "N'existe plus dans le code (remplacée par la carte de démarrage, capturée : etat.dashboard.demarrage-card)." },
  { id: "stock.delete-confirm", raison: "AlertDialog (L1, M1), pas capturée : son titre et son annulation sont vérifiés par le test « confirmation destructive : stock » (aucune requête)." },
  { id: "stock.export-csv", raison: "Téléchargement local d'un fichier, sans rendu à l'écran." },
  { id: "params.delete-prompt", raison: "window.confirm natif ; texte vérifié par le test « boîtes natives »." },
  { id: "mev.beforeunload", raison: "Boîte native « Quitter le site ? », jamais rendue dans une capture." },
  { id: "compte.trello-connect", raison: "Lien vers trello.com (OAuth) : sortie vers un site externe, interdite." },
  {
    id: "compte.trello-disconnect",
    raison:
      "Appel Trello réel (webhook, révocation) précédé d'un confirm natif ; l'écran « connecté » qui porte le bouton est capturé par etat.compte.trello-connecte (réglages simulés).",
  },
  {
    id: "studio.bandeau-sacbase",
    raison:
      "Variantes « injoignable / non configuré / catalogue de HH:MM » : le cache SacBase de 60 s vit dans le processus Next, partagé par tous les tests ; il faudrait une panne du faux SacBase pendant plus de 60 s ou un 2e serveur. L'état nominal (aucun bandeau) est vérifié par etat.studio.layout-banner.",
  },
];

// ── Tests ────────────────────────────────────────────────────────────────────

const constats = (): string[] | undefined => {
  const liste = test.info().annotations.filter((a) => a.type === "constat").map((a) => a.description ?? "");
  return liste.length > 0 ? liste : undefined;
};

for (const d of ETATS) {
  test.describe(d.id, () => {
    test.use({ compte: d.compte });
    test.skip(({ isMobile }) => !surMobile(d.vue, isMobile), `état ${d.vue === "desktop" ? "desktop" : "mobile"} uniquement`);

    test(`etat.${d.id}`, async ({ page, isMobile, themeMyflip, journalConsole, dialogues }) => {
      const garde = await bloquerEcritures(page);
      const fichiers: string[] = [];
      const simulations: string[] = [];
      const ctx: Ctx = {
        page,
        mobile: isMobile,
        theme: themeMyflip,
        dialogues,
        simule: (s) => simulations.push(s),
        capture: async (suffixe, options) => {
          const id = suffixe ? `etat.${d.id}.${suffixe}` : `etat.${d.id}`;
          fichiers.push(await capturer(page, id, { pleinePage: false, ...options }));
        },
      };

      await d.executer(ctx);

      consignerCapture({
        type: "etat",
        id: `etat.${d.id}`,
        chemin: d.chemin,
        compte: d.compte,
        simulations: simulations.length > 0 ? simulations : undefined,
        constats: constats(),
        fichiers,
        console: journalConsole.erreurs,
      });
      expect(fichiers.length, "au moins une capture").toBeGreaterThan(0);
      expect(journalConsole.erreurs.filter((e) => e.type === "pageerror"), "exceptions de page").toEqual([]);
      expect(garde.bloquees, "écritures tentées (bloquées par la garde)").toEqual([]);
    });
  });
}

test.describe("boîtes natives", () => {
  test.use({ compte: "demo" });

  // Le Stock a une AlertDialog (L1, M1) : plus aucune boîte native, et l'annulation n'écrit rien.
  test("confirmation destructive : stock", async ({ page, dialogues, isMobile }) => {
    test.skip(isMobile, "Boutons desktop ; le texte ne dépend pas du viewport.");
    const garde = await bloquerEcritures(page);

    await aller(page, "/stock", "demo");
    await attendreStock(page);
    await page.getByRole("button", { name: "Supprimer", exact: true }).first().click();
    const confirmation = page.getByRole("alertdialog", { name: /^Supprimer ADI1 \?/ });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Annuler" }).click();
    await expect(confirmation).toBeHidden();

    expect(dialogues, "aucune boîte native").toEqual([]);
    expect(garde.bloquees).toEqual([]);
  });

  // Réglages et Commandes gardent leur window.confirm tant que M9 et M4 ne sont pas passés :
  // même assertions qu'avant la refonte (boîte refusée, texte exact, aucune requête).
  test("confirm de suppression : refusé, aucune requête", async ({ page, dialogues, isMobile }) => {
    test.skip(isMobile, "Boutons desktop ; le texte ne dépend pas du viewport.");
    const garde = await bloquerEcritures(page);

    await aller(page, "/parametres", "demo");
    await expect(visible(page.getByText(/^Prompt par défaut$/))).toBeVisible();
    await visible(page.getByRole("button", { name: "Supprimer", exact: true })).click();
    await expect.poll(() => dialogues.length).toBe(1);

    await aller(page, "/commandes", "demo");
    await page.getByRole("button", { name: "Actions" }).first().click();
    await visible(page.getByRole("button", { name: "Supprimer" })).click();
    await expect.poll(() => dialogues.length).toBe(2);

    test.info().annotations.push(...dialogues.map((d) => ({ type: `boîte ${d.type}`, description: d.message })));
    expect(dialogues.map((d) => [d.type, d.reponse])).toEqual([
      ["confirm", "refuse"],
      ["confirm", "refuse"],
    ]);
    expect(dialogues[0].message).toMatch(/^Supprimer le prompt « Prompt par défaut » \?/);
    expect(dialogues[1].message).toMatch(/^Supprimer la commande « .+ » et ses articles \?/);
    expect(garde.bloquees).toEqual([]);
  });
});

test("les 73 états de l'étude sont capturés ou expliqués", async () => {
  test.skip(test.info().project.name !== "desktop-clair", "Contrôle statique, une seule fois.");
  const etude = JSON.parse(
    fs.readFileSync(path.join(RACINE, "docs/refonte/etude-2026-10-20/routes-etats.json"), "utf8"),
  ) as { states: { id: string; safeToTriggerInTest: boolean }[] };
  expect(etude.states).toHaveLength(73);

  const couverts = new Set(ETATS.flatMap((d) => d.etude));
  const expliques = new Set(NON_CAPTURES.map((n) => n.id));
  const orphelins = etude.states.map((s) => s.id).filter((id) => !couverts.has(id) && !expliques.has(id));
  expect(orphelins, "états de l'étude ni capturés ni expliqués").toEqual([]);
  const inconnus = [...couverts, ...expliques].filter((id) => !etude.states.some((s) => s.id === id));
  expect(inconnus, "identifiants absents de l'étude").toEqual([]);

  const ids = ETATS.map((d) => d.id);
  expect(new Set(ids).size, "identifiants d'état en double").toBe(ids.length);

  fs.mkdirSync(DOSSIER_RAPPORTS, { recursive: true });
  fs.writeFileSync(
    path.join(DOSSIER_RAPPORTS, "etats.json"),
    JSON.stringify(
      {
        captures: ETATS.map((d) => ({ id: `etat.${d.id}`, etude: d.etude, vue: d.vue, compte: d.compte, chemin: d.chemin })),
        nonCaptures: NON_CAPTURES,
        rendusSursParSimulation: etude.states.filter((s) => !s.safeToTriggerInTest && couverts.has(s.id)).map((s) => s.id),
      },
      null,
      2,
    ) + "\n",
  );
});
