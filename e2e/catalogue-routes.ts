/**
 * Catalogue des routes capturées par e2e/captures.spec.ts : les 21 routes de
 * docs/refonte/etude-2026-10-20/routes-etats.json et leurs variantes d'URL.
 *
 * Chaque entrée donne :
 *  - `id` : identifiant STABLE de la capture (route.<id>.png, ou
 *    route.neuf.<id>.png pour le compte neuf) — ne pas le renommer, c'est la
 *    clé de comparaison avant / après la refonte ;
 *  - `etude` : la route de l'étude qu'elle couvre (contrôlé par un test) ;
 *  - `compte` : demo (riche), neuf (états vides) ou aucun (public) ;
 *  - `statut` : statut HTTP attendu du document ;
 *  - `attente` : ce qui prouve que la page est chargée AVEC ses données, et
 *    pas seulement son squelette (jamais d'attente fixe).
 *
 * Données : e2e/seed/seed-e2e.ts (comptes de e2e/compte-test.ts) et le
 * catalogue du faux SacBase (e2e/seed/sacbase-coloris.json).
 */
import type { Locator, Page } from "@playwright/test";

import { COMPTES } from "./compte-test";
import type { Compte } from "./outils/test";

export type EntreeRoute = {
  id: string;
  /** Chemin tel qu'il figure dans routes-etats.json (« /studio/[cle] », « (404) … »). */
  etude: string;
  chemin: string;
  compte: Compte;
  statut: number;
  /** URL finale attendue quand elle diffère du chemin (redirection). */
  urlFinale?: RegExp;
  /** Locators qui doivent tous être visibles avant la capture. */
  attente: (page: Page) => Locator[];
  /** Capturé à 390 px à titre informatif seulement (le Studio est desktop, CLAUDE.md). */
  informatifMobile?: string;
  /** prefers-reduced-motion: reduce, pour figer une animation en JavaScript. */
  mouvementReduit?: boolean;
  /**
   * Défaut CONNU de l'application « avant » : le thème demandé n'est pas
   * appliqué à <html> sur cette route. Le test le consigne (constat) au lieu
   * d'échouer ; sans ce champ, un thème non appliqué fait échouer le test.
   */
  themeInstable?: string;
  description: string;
};

/** Premier élément VISIBLE : desktop et mobile rendent souvent les deux variantes (hidden md:block / md:hidden). */
export const visible = (l: Locator): Locator => l.filter({ visible: true }).first();

const texte = (page: Page, t: string | RegExp): Locator => visible(page.getByText(t));

/**
 * Calendrier chargé AVEC ses ventes, dans les deux mises en page : cartes
 * « CA SEMAINE » de la grille (desktop), liste des jours vendus ou « Aucune
 * vente ce mois-ci. » (mobile, où la grille est masquée). Pas « CA TOTAL » :
 * ce récapitulatif s'affiche déjà (à 0,00 €) pendant « Chargement du calendrier ».
 */
export const calendrierCharge = (page: Page): Locator =>
  visible(
    page
      .getByText("CA SEMAINE")
      .or(page.getByText(/^\d+ articles?$/))
      .or(page.getByText("Aucune vente ce mois-ci.")),
  );

const STUDIO_INFORMATIF = "Studio : écrans desktop uniquement (CLAUDE.md) ; capture à 390 px informative, hors règles mobiles.";

const fiche = (cle: string, titre: string, extra: (p: Page) => Locator[] = () => []): Omit<EntreeRoute, "id" | "description"> => ({
  etude: "/studio/[cle]",
  chemin: `/studio/${cle}`,
  compte: "demo",
  statut: 200,
  attente: (p) => [p.getByRole("heading", { level: 1, name: titre }), texte(p, /\d+ \/ 15 prises/), ...extra(p)],
  informatifMobile: STUDIO_INFORMATIF,
});

/** Compte demo et pages publiques. Capture : route.<id>.png. */
export const ROUTES: EntreeRoute[] = [
  // ── Pages publiques ──────────────────────────────────────────────────────
  {
    id: "accueil",
    etude: "/",
    chemin: "/",
    compte: "aucun",
    statut: 200,
    // SkuLifecycle fait défiler ses étapes par setInterval : figé par reduced-motion.
    mouvementReduit: true,
    attente: (p) => [p.getByRole("heading", { level: 1, name: /Pilotez vos marges/ }), p.getByRole("link", { name: "Créer mon compte" }).first()],
    description: "Landing, non connecté, mouvement réduit (frise figée).",
  },
  {
    id: "login",
    etude: "/login",
    chemin: "/login",
    compte: "aucun",
    statut: 200,
    attente: (p) => [p.getByRole("button", { name: "Se connecter" }), p.getByRole("button", { name: "Mot de passe oublié ?" })],
    description: "Connexion, mode par défaut.",
  },
  {
    id: "signup",
    etude: "/signup",
    chemin: "/signup",
    compte: "aucun",
    statut: 200,
    attente: (p) => [p.getByText("Créer ton compte", { exact: true }), p.getByRole("button", { name: "Créer mon compte" })],
    description: "Inscription sans offre.",
  },
  ...(["solo", "atelier", "negoce"] as const).map(
    (plan): EntreeRoute => ({
      id: `signup.plan-${plan}`,
      etude: "/signup",
      chemin: `/signup?plan=${plan}`,
      compte: "aucun",
      statut: 200,
      attente: (p) => [p.getByText(`Créer ton compte ${{ solo: "Solo", atelier: "Atelier", negoce: "Négoce" }[plan]}`, { exact: true })],
      description: `Inscription, offre ${plan} (sous-titre).`,
    }),
  ),
  {
    id: "signup.plan-inconnu",
    etude: "/signup",
    chemin: "/signup?plan=inconnu",
    compte: "aucun",
    statut: 200,
    attente: (p) => [p.getByText("Créer ton compte", { exact: true })],
    description: "Inscription, offre inconnue : retombe sur le titre par défaut.",
  },
  {
    id: "reset-password.sans-jeton",
    etude: "/reset-password",
    chemin: "/reset-password",
    compte: "aucun",
    statut: 200,
    attente: (p) => [p.getByText(/Lien invalide\. Recommence la procédure/), p.getByRole("button", { name: "Mettre à jour le mot de passe" })],
    description: "Réinitialisation sans jeton : bandeau rouge, champs désactivés.",
  },
  {
    id: "reset-password.avec-jeton",
    etude: "/reset-password",
    chemin: "/reset-password?token=e2e-jeton-factice",
    compte: "aucun",
    statut: 200,
    attente: (p) => [p.getByRole("button", { name: "Mettre à jour le mot de passe", disabled: false })],
    description: "Réinitialisation avec jeton (factice, jamais soumis) : formulaire actif.",
  },
  {
    id: "legal.mentions-legales",
    etude: "/legal/mentions-legales",
    chemin: "/legal/mentions-legales",
    compte: "aucun",
    statut: 200,
    attente: (p) => [p.getByRole("heading", { level: 1 })],
    description: "Mentions légales, non connecté.",
  },
  {
    id: "legal.cgu",
    etude: "/legal/cgu",
    chemin: "/legal/cgu",
    compte: "aucun",
    statut: 200,
    attente: (p) => [p.getByRole("heading", { level: 1, name: "Conditions générales d'utilisation" })],
    description: "CGU, non connecté.",
  },
  {
    id: "legal.cgu.connecte",
    etude: "/legal/cgu",
    chemin: "/legal/cgu",
    compte: "demo",
    statut: 200,
    attente: (p) => [p.getByRole("heading", { level: 1, name: "Conditions générales d'utilisation" })],
    description: "CGU, connecté : doit être identique (route publique, sans châssis).",
  },
  {
    id: "legal.confidentialite",
    etude: "/legal/confidentialite",
    chemin: "/legal/confidentialite",
    compte: "aucun",
    statut: 200,
    attente: (p) => [p.getByRole("heading", { level: 1 })],
    description: "Politique de confidentialité, non connecté.",
  },

  // ── Application, compte demo ─────────────────────────────────────────────
  {
    id: "dashboard",
    etude: "/dashboard",
    chemin: "/dashboard",
    compte: "demo",
    statut: 200,
    attente: (p) => [p.getByText(`Bonjour ${COMPTES.demo.prenom}`), p.getByRole("img", { name: /Objectif mensuel atteint/ }), texte(p, "Par marque")],
    description: "Dashboard, période MOIS, objectif défini, onboarding terminé.",
  },
  {
    id: "stock",
    etude: "/stock",
    chemin: "/stock",
    compte: "demo",
    statut: 200,
    attente: (p) => [texte(p, "Articles au total"), p.getByRole("button", { name: "Tous 88" }), texte(p, /^ADI1$/)],
    description: "Stock complet (88 articles, virtualisé : seules les lignes proches de la fenêtre sont rendues).",
  },
  {
    id: "stock.statut-brouillon",
    etude: "/stock",
    chemin: "/stock?statut=Brouillon",
    compte: "demo",
    statut: 200,
    attente: (p) => [p.getByRole("button", { name: "Brouillon 3", pressed: true }), texte(p, /^PIS10$/), texte(p, "Réinitialiser")],
    description: "Stock pré-filtré par l'URL (lien de la cloche) : chip Brouillon et « Réinitialiser ».",
  },
  {
    id: "stock.marque-nike",
    etude: "/stock",
    chemin: "/stock?marque=Nike",
    compte: "demo",
    statut: 200,
    attente: (p) => [texte(p, /^SDN1$/), texte(p, "Réinitialiser")],
    description: "Stock pré-filtré par marque (lien du Dashboard).",
  },
  {
    id: "mise-en-vente",
    etude: "/mise-en-vente",
    chemin: "/mise-en-vente",
    compte: "demo",
    statut: 200,
    attente: (p) => [p.getByPlaceholder("Ex : PRL1"), p.getByRole("button", { name: "Continuer" })],
    description: "Mise en vente, étape 1 vide.",
  },
  {
    id: "a-comptabiliser",
    etude: "/a-comptabiliser",
    chemin: "/a-comptabiliser",
    compte: "demo",
    statut: 200,
    attente: (p) => [texte(p, "Ventes en attente"), texte(p, /^CHD3/), texte(p, /^SDN10/)],
    description: "À comptabiliser : 3 lignes (CHD3, PIS4, SDN10).",
  },
  {
    id: "calendrier",
    etude: "/calendrier",
    chemin: "/calendrier",
    compte: "demo",
    statut: 200,
    attente: (p) => [p.getByRole("heading", { level: 2 }).first(), calendrierCharge(p)],
    description: "Calendrier, mois courant (chiffres animés : la capture attend leur arrêt).",
  },
  {
    id: "commandes",
    etude: "/commandes",
    chemin: "/commandes",
    compte: "demo",
    statut: 200,
    attente: (p) => [texte(p, "TOTAL INVESTI"), texte(p, "Commandes récentes"), texte(p, /^Kilo Vintage Lyon$/)],
    description: "Commandes A à D, histogramme, pastilles de rentabilité.",
  },
  {
    id: "statistiques",
    etude: "/statistiques",
    chemin: "/statistiques",
    compte: "demo",
    statut: 200,
    attente: (p) => [texte(p, "PÉRIMÈTRE D’ANALYSE"), p.getByRole("img", { name: "Répartition des statuts" }), texte(p, "Meilleures ventes")],
    description: "Statistiques, tout l'historique.",
  },
  {
    id: "parametres",
    etude: "/parametres",
    chemin: "/parametres",
    compte: "demo",
    statut: 200,
    attente: (p) => [p.getByRole("tab", { name: /^Annonces/, selected: true }), texte(p, /^Prompt par défaut$/)],
    description: "Prompts, onglet Annonces (5 prompts).",
  },
  {
    id: "parametres.onglet-studio",
    etude: "/parametres",
    chemin: "/parametres?onglet=studio",
    compte: "demo",
    statut: 200,
    attente: (p) => [p.getByRole("tab", { name: /^Studio/, selected: true }), p.getByRole("heading", { name: "Prompt maître" })],
    description: "Prompts, onglet Studio (prompt maître + 4 angles).",
  },
  {
    id: "compte",
    etude: "/compte",
    chemin: "/compte",
    compte: "demo",
    statut: 200,
    attente: (p) => [texte(p, "Mes clés IA"), texte(p, "Mon Trello"), p.getByPlaceholder(/••••0000/)],
    description: "Mon compte : clé OpenRouter renseignée, Trello non connecté.",
  },
  {
    id: "demarrage",
    etude: "/demarrage",
    chemin: "/demarrage",
    compte: "demo",
    statut: 200,
    attente: (p) => [p.getByRole("button", { name: "Créer ma première commande" })],
    description: "Démarrage, onboarding terminé (étape 3, toutes cochées).",
  },
  {
    id: "studio",
    etude: "/studio",
    chemin: "/studio",
    compte: "demo",
    statut: 200,
    attente: (p) => [texte(p, /^7 coloris · /), p.locator('a[href="/studio/5039-black-pink"]')],
    informatifMobile: STUDIO_INFORMATIF,
    description: "Studio, accueil : 7 coloris (6 SacBase + 1 hors catalogue), vignettes du faux SacBase.",
  },
  {
    id: "studio.fiche.black-pink",
    ...fiche("5039-black-pink", "Black Pink", (p) => [p.getByRole("heading", { name: "À juger" }), texte(p, /^1 \/ 3$/), p.getByRole("button", { name: /^Générer \d+ images?/ })]),
    description: "Fiche la plus remplie : 9/15 prises avec trous, file « À juger » 3 images, tableau des cases.",
  },
  {
    id: "studio.fiche.elite-v3",
    ...fiche("elite-v3-black-gold", "Black Gold"),
    description: "Fiche V3 : 6/15 prises (noms de prises V3), aucun essai à juger.",
  },
  {
    id: "studio.fiche.navy-orange",
    ...fiche("5040-navy-orange", "Navy Orange", (p) => [p.getByRole("heading", { name: "À juger" })]),
    description: "Fiche V2 : 5 prises, 1 image à juger.",
  },
  {
    id: "studio.fiche.white-volt",
    ...fiche("5039-white-volt", "White Volt", (p) => [texte(p, /^0 \/ 15 prises$/)]),
    description: "Fiche à planche vide (« 14 à 15 vraies photos… ») : coloris créé à la première ouverture.",
  },
  {
    id: "studio.fiche.pure-platinum",
    ...fiche("5042-pure-platinum", "Pure Platinum"),
    description: "Fiche d'un coloris jamais acheté : aucun sac cible.",
  },
  {
    id: "studio.fiche.hors-catalogue",
    ...fiche("ancien-coloris-test", "Olive", (p) => [texte(p, "Hors catalogue SacBase")]),
    description: "Fiche d'un coloris absent de SacBase (pas de vignette).",
  },
  {
    id: "studio.bilan",
    etude: "/studio/bilan",
    chemin: "/studio/bilan",
    compte: "demo",
    statut: 200,
    attente: (p) => [texte(p, /RÉUSSITE AU 1ER ESSAI/), texte(p, "Par modèle")],
    informatifMobile: STUDIO_INFORMATIF,
    description: "Bilan : 20 essais, 3 échecs, coûts connus et inconnus.",
  },

  // ── 404 ──────────────────────────────────────────────────────────────────
  {
    id: "404.connecte",
    etude: "(404) toute URL inconnue + notFound()",
    chemin: "/page-inconnue",
    compte: "demo",
    statut: 404,
    attente: (p) => [p.getByText("Cette page n'existe pas."), p.getByRole("button", { name: /^Mon compte/ })],
    description: "404 connectée : dans le châssis (menu, barre du haut).",
  },
  {
    id: "404.studio-cle-inconnue",
    etude: "(404) toute URL inconnue + notFound()",
    chemin: "/studio/cle-inconnue",
    compte: "demo",
    statut: 404,
    attente: (p) => [p.getByText("Cette page n'existe pas.")],
    informatifMobile: STUDIO_INFORMATIF,
    themeInstable:
      "notFound() lancé par /studio/[cle] : en thème sombre, <html> perd data-theme (constat du 20/10 sous next dev) et la 404 s'affiche en clair.",
    description: "notFound() du Studio : 404 racine, sans le bandeau du Studio.",
  },
  {
    id: "404.public",
    etude: "(404) toute URL inconnue + notFound()",
    chemin: "/legal/inconnue",
    compte: "aucun",
    statut: 404,
    attente: (p) => [p.getByText("Cette page n'existe pas.")],
    description: "404 publique (sous /legal, sans châssis).",
  },
  {
    id: "404.non-connecte-redirige",
    etude: "(404) toute URL inconnue + notFound()",
    chemin: "/page-inconnue",
    compte: "aucun",
    statut: 200,
    urlFinale: /\/login\?callbackUrl=/,
    attente: (p) => [p.getByRole("button", { name: "Se connecter" })],
    description: "URL inconnue sans session : le middleware redirige vers /login (la 404 n'est jamais vue).",
  },
];

/** Compte neuf : les écrans qui ont un état vide. Capture : route.neuf.<id>.png. */
export const ROUTES_NEUF: EntreeRoute[] = [
  {
    id: "dashboard",
    etude: "/dashboard",
    chemin: "/dashboard",
    compte: "neuf",
    statut: 200,
    attente: (p) => [p.getByText(`Bonjour ${COMPTES.neuf.prenom}`), texte(p, /Configuration · étape 1 sur 3/i)],
    description: "Dashboard vide : carte de démarrage, objectif « À définir ».",
  },
  {
    id: "stock",
    etude: "/stock",
    chemin: "/stock",
    compte: "neuf",
    statut: 200,
    attente: (p) => [texte(p, "Articles au total"), p.getByRole("button", { name: "Tous 0" })],
    description: "Stock vide.",
  },
  {
    id: "commandes",
    etude: "/commandes",
    chemin: "/commandes",
    compte: "neuf",
    statut: 200,
    attente: (p) => [texte(p, "Aucune commande. Crée ta première commande !")],
    description: "Commandes : liste vide.",
  },
  {
    id: "mise-en-vente",
    etude: "/mise-en-vente",
    chemin: "/mise-en-vente",
    compte: "neuf",
    statut: 200,
    attente: (p) => [p.getByPlaceholder("Ex : PRL1")],
    description: "Mise en vente d'un compte sans article.",
  },
  {
    id: "a-comptabiliser",
    etude: "/a-comptabiliser",
    chemin: "/a-comptabiliser",
    compte: "neuf",
    statut: 200,
    attente: (p) => [p.getByRole("heading", { name: "Tout est à jour !" })],
    description: "À comptabiliser vide.",
  },
  {
    id: "calendrier",
    etude: "/calendrier",
    chemin: "/calendrier",
    compte: "neuf",
    statut: 200,
    attente: (p) => [p.getByRole("heading", { level: 2 }).first(), calendrierCharge(p)],
    description: "Calendrier sans vente.",
  },
  {
    id: "statistiques",
    etude: "/statistiques",
    chemin: "/statistiques",
    compte: "neuf",
    statut: 200,
    attente: (p) => [texte(p, "CADENCE NULLE — PROJECTION IMPOSSIBLE")],
    description: "Statistiques sans vente : cadence nulle.",
  },
  {
    id: "parametres",
    etude: "/parametres",
    chemin: "/parametres",
    compte: "neuf",
    statut: 200,
    attente: (p) => [p.getByRole("tab", { name: /^Annonces 1/, selected: true })],
    description: "Prompts : seul le prompt de l'inscription, objectif vide.",
  },
  {
    id: "compte",
    etude: "/compte",
    chemin: "/compte",
    compte: "neuf",
    statut: 200,
    attente: (p) => [texte(p, "Mes clés IA"), texte(p, "Mon Trello")],
    description: "Mon compte sans clé ni Trello.",
  },
  {
    id: "demarrage",
    etude: "/demarrage",
    chemin: "/demarrage",
    compte: "neuf",
    statut: 200,
    attente: (p) => [p.getByRole("button", { name: /Connecter ton Trello/ }), texte(p, "Mes clés IA")],
    description: "Démarrage à l'étape 1.",
  },
  {
    id: "studio",
    etude: "/studio",
    chemin: "/studio",
    compte: "neuf",
    statut: 200,
    attente: (p) => [texte(p, /^6 coloris · /)],
    informatifMobile: STUDIO_INFORMATIF,
    description: "Studio d'un compte sans donnée propre (catalogue SacBase seul).",
  },
  {
    id: "studio.bilan",
    etude: "/studio/bilan",
    chemin: "/studio/bilan",
    compte: "neuf",
    statut: 200,
    attente: (p) => [texte(p, "Aucun essai.")],
    informatifMobile: STUDIO_INFORMATIF,
    description: "Bilan sans essai.",
  },
];

/** Identifiant de fichier de capture d'une entrée. */
export const idCapture = (r: EntreeRoute): string => (r.compte === "neuf" ? `route.neuf.${r.id}` : `route.${r.id}`);
