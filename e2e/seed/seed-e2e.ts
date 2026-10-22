/**
 * Seed déterministe des deux comptes de test e2e (base Postgres embarquée et
 * jetable de la suite Playwright, JAMAIS Neon).
 *
 * Ce que chaque bloc de données fait apparaître (compte « demo », sauf mention) :
 *
 *  - UserSettings (objectif 600 €, onboarding terminé, clé OpenRouter factice
 *    chiffrée) : anneau d'objectif du /dashboard (≈ 71 % le 20 du mois), pas de
 *    carte de démarrage, carte « clé renseignée ••••0000 » de /parametres et de
 *    /compte. Aucune donnée Trello : l'état « connecté » se simule dans le
 *    navigateur.
 *  - PromptTemplate (5) : onglet « Annonces » de /parametres, choix du prompt et
 *    prix de référence préremplis dans /mise-en-vente.
 *  - Commandes A à D (créées par creerCommande, le code de l'app) : /commandes
 *    avec les trois pastilles (A « Rentabilisée », B « Seuil proche » mais à
 *    perte, C « En cours »), histogramme sur 6 mois, modale de détail ; D est la
 *    commande Hipobuy dont les SKU (SDN1 à SDN11) alimentent le Studio.
 *  - Articles (88, les 10 statuts) : /stock (tous les statuts, canaux, comptes
 *    de vente, jours en vente, annonce rédigée, ligne sans date de mise en
 *    vente CHD8), /a-comptabiliser (3 lignes : PIS4, CHD3, SDN10), cloche de
 *    notifications (3 à comptabiliser, 2 annonces prêtes, 3 brouillons,
 *    5 photos prêtes, 16 sans photos), /mise-en-vente (SKU prêts à chercher :
 *    SDN3, PIS7).
 *  - Ventes datées (juin à octobre, relatives à « maintenant ») : /dashboard
 *    (CA du mois, écart avec le mois précédent, 8 semaines, six marques),
 *    /calendrier (ventes sur le mois en cours et les mois précédents),
 *    /statistiques (7 et 30 jours glissants, cadence, jours de la semaine),
 *    marges négatives sur les polos Lacoste (commande B).
 *  - StudioReglages (prompt maître, budget par sac de 0,30 €) : aperçu du
 *    prompt dans la fiche coloris, onglet Studio de /parametres avec sa date
 *    de modification. Le PETIT budget fait exister les deux cas du devis :
 *    « Qwen » tient un sac complet (0,24 €) et un lancement de quelques prises,
 *    « E2E: Modèle cher » dépasse dès 3 prises (0,117 € l'image) et demande
 *    la confirmation qui affiche le montant.
 *  - StudioAngle (4 actifs, 3 archivés) : 4 colonnes du tableau de la fiche,
 *    cases utilisées par angle dans /parametres?onglet=studio, angles archivés
 *    et versionnement dans /studio/bilan.
 *  - StudioColoris (4) : cartes de l'accueil /studio, dont une « hors catalogue
 *    SacBase » (ancien-coloris-test) ; les coloris white-volt, grey-red et
 *    pure-platinum sont VOLONTAIREMENT absents (la page les crée à la 1re
 *    ouverture : planche vide, « à photographier »).
 *  - StudioReference (26) : planche des prises avec des trous (black-pink),
 *    photos gardées hors tableau (« Prise libre » absente, 2 photos non
 *    rangées), prises V1 (black-pink, navy-orange) et V3 (elite-v3-black-gold),
 *    et 2 photos ORPHELINES (SDN11, hors catalogue) : bandeau « 2 photos non
 *    rattachées » de l'accueil, qui persiste d'un passage à l'autre.
 *  - StudioEssai (24) : file « À juger » de black-pink (3 images, les 3
 *    verdicts IA : ok, à corriger, rejet), cases « vente », « validée »,
 *    « à juger » et « libre » (case libérée par un rejet), corrections via
 *    essaiParentId, images purgées (urlImage ""), coûts connus, estimés
 *    seulement et inconnus, essai « au jeton », plusieurs modèles sur un même
 *    lancementId, 2 essais du banc de test (angles archivés), une COMPARAISON
 *    à juger sur navy-orange (la même case par 3 modèles d'un même lancement,
 *    dont Qwen et Seedream, du faux catalogue), et 2 essais Qwen décidés sur
 *    elite (taux de réussite réel dans le sélecteur). Tout essai à juger
 *    porte un verifIA : sinon la fiche relance seule la vérification
 *    (POST /verifier, donc OpenRouter) à l'ouverture.
 *  - StudioEchec (3 : securite, no_image, incertain) et StudioModeleFavori (2) :
 *    /studio/bilan (échecs, blocages de sécurité, dépense), étoiles du
 *    sélecteur de modèles.
 *  - Compte « neuf » : aucune UserSettings, un seul prompt (celui de
 *    l'inscription), rien d'autre. États vides de tous les écrans, carte de
 *    démarrage du dashboard, /demarrage à l'étape 1, Studio sans données
 *    propres.
 *
 * Dates : toujours relatives à « maintenant » (jour J, Europe/Paris), J-n à
 * 11:00 heure de Paris ; les valeurs sont fixes, rien d'aléatoire. Lancer le
 * seed ET le serveur avec TZ=Europe/Paris, et re-semer avant chaque série de
 * captures (des GET du Studio écrivent en base).
 *
 * Images : aucune n'est lue par le serveur. Les URL (store Blob privé factice)
 * ont le format exact que lib/studioBlob.ts attend ; le navigateur de test
 * intercepte /api/studio/image et sert une image synthétique.
 *
 * Sécurité : refuse de tourner si DATABASE_URL n'est pas une adresse locale
 * (localhost, 127.0.0.1, ::1), contient « neon.tech », si NODE_ENV=production
 * ou si VERCEL est défini. Aucune valeur d'environnement n'est affichée.
 *
 * Usage :
 *   import { seedE2E } from "./seed/seed-e2e";   // await seedE2E(prisma, new Date())
 *   TZ=Europe/Paris DATABASE_URL=… npx tsx --conditions=react-server e2e/seed/seed-e2e.ts
 * (le CLI ne lit AUCUN fichier .env : DATABASE_URL doit être dans l'environnement.)
 */

import { createHash } from "node:crypto";

import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, type CompteVente } from "@prisma/client";

import { deriveVente, STATUT_A_COMPTABILISER, STATUT_PHOTOS_PRETES, STATUT_VENDU, STATUTS } from "@/lib/calc";
import { chiffrer } from "@/lib/crypto";
import { DEFAULT_PROMPT_CONTENU } from "@/lib/promptSelect";
import { MODELE_MANUEL } from "@/lib/studioFiche";
import { nomPrise, promptVariante } from "@/lib/studioCases";

import { COMPTES, MOT_DE_PASSE_E2E } from "../compte-test";

// ── Constantes ──────────────────────────────────────────────────────────────

/** ENCRYPTION_KEY du serveur e2e : valeur factice, 64 caractères hexadécimaux. */
export const CLE_CHIFFREMENT_E2E = "e2e0".repeat(16);
const CLE_OPENROUTER_FACTICE = "e2e-fausse-cle-0000";

/** Hôte du store Blob factice : finit par « .blob.vercel-storage.com », comme l'exige cheminDepuisUrl. */
const HOTE_BLOB = "e2e.private.blob.vercel-storage.com";

const SUFFIXE_EMAIL_TEST = "@myflip.test";
const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

// ── Garde-fous ──────────────────────────────────────────────────────────────

/**
 * Refuse tout ce qui ne ressemble pas à la base e2e locale. N'affiche jamais
 * l'URL ni son hôte : le message dit seulement quelle règle a échoué.
 */
export function verifierBaseLocale(url: string | undefined = process.env.DATABASE_URL): void {
  if (process.env.NODE_ENV === "production") throw new Error("Seed e2e refusé : NODE_ENV vaut production.");
  if (process.env.VERCEL) throw new Error("Seed e2e refusé : la variable VERCEL est définie.");
  if (!url) throw new Error("Seed e2e refusé : DATABASE_URL absente de l'environnement.");
  let hote: string;
  try {
    hote = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error("Seed e2e refusé : DATABASE_URL illisible.");
  }
  if (hote.includes("neon.tech")) throw new Error("Seed e2e refusé : DATABASE_URL vise Neon.");
  if (!HOTES_LOCAUX.has(hote)) throw new Error("Seed e2e refusé : DATABASE_URL ne vise pas une adresse locale.");
}

// ── Dates relatives à « maintenant », en heure de Paris ─────────────────────

const FORMAT_PARIS_PARTIES = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Paris",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});
const FORMAT_PARIS_JOUR = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });

/** Écart Paris − UTC, en millisecondes, à l'instant `ts`. */
function decalageParisMs(ts: number): number {
  const p: Record<string, string> = {};
  for (const x of FORMAT_PARIS_PARTIES.formatToParts(new Date(ts))) p[x.type] = x.value;
  const murale = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return murale - Math.floor(ts / 1000) * 1000;
}

/** L'instant où il est `h`:`min` à Paris le jour calendaire donné. Deux passes : sûr aux changements d'heure. */
function instantParis(an: number, mois: number, jour: number, h: number, min: number): Date {
  const murale = Date.UTC(an, mois - 1, jour, h, min);
  const approx = murale - decalageParisMs(murale);
  return new Date(murale - decalageParisMs(approx));
}

type Calendrier = {
  /** J-n à l'heure donnée (11:00 par défaut), heure de Paris. */
  J: (n: number, h?: number, min?: number) => Date;
  /** Date d'une vente à J-n ; J-0 ne dépasse jamais « maintenant ». */
  vente: (n: number) => Date;
};

function creerCalendrier(maintenant: Date): Calendrier {
  const [an, mois, jour] = FORMAT_PARIS_JOUR.format(maintenant).split("-").map(Number);
  const J = (n: number, h = 11, min = 0): Date => {
    const d = new Date(Date.UTC(an, mois - 1, jour - n));
    return instantParis(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, min);
  };
  const vente = (n: number): Date =>
    n === 0 ? new Date(Math.min(maintenant.getTime() - 60_000, J(0, 8).getTime())) : J(n);
  return { J, vente };
}

// ── Identifiants et empreintes déterministes ────────────────────────────────

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** UUID au format 8-4-4-4-12, dérivé d'une graine : stable d'un seed à l'autre. */
function uuidDe(graine: string): string {
  const h = sha256(graine);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** URL privée d'une référence : empreinte SHA-256 en nom de fichier, comme le dépôt manuel. */
const urlReference = (userId: string, graine: string) =>
  `https://${HOTE_BLOB}/references/${userId}/${sha256(`e2e-ref:${graine}`)}.jpg`;

/** URL privée d'une image générée : uuid en nom de fichier, extension .png. */
const urlGeneree = (userId: string, idEssai: string) => `https://${HOTE_BLOB}/generees/${userId}/${uuidDe(`e2e-essai:${idEssai}`)}.png`;

// ── Prompts d'annonce ───────────────────────────────────────────────────────

/** Prompt structuré en balises XML, avec tous les marqueurs {marque} {categorie} {taille} {etat} {matiere} {sku}. */
function promptXml(role: string, conseils: string[]): string {
  return `<role>
${role}
</role>

<article>
Marque : {marque}
Catégorie : {categorie}
Taille : {taille}
État : {etat}
Matière : {matiere}
Référence interne : {sku}
</article>

<consignes>
${conseils.map((c) => `- ${c}`).join("\n")}
</consignes>

<format>
Réponds UNIQUEMENT avec un objet JSON valide ayant exactement ces clés :
"titre" (80 caractères au plus, avec la marque et le type d'article),
"description" (3 à 6 phrases), "motsCles" (mots-clés séparés par des virgules).
</format>`;
}

const PROMPTS_DEMO = [
  {
    nom: "Prompt par défaut",
    marque: null,
    categorie: null,
    contenu: DEFAULT_PROMPT_CONTENU,
    estDefaut: true,
    prixReference: null,
    jour: 199,
  },
  {
    nom: "Polos Tommy Hilfiger",
    marque: "Tommy Hilfiger",
    categorie: "Polo",
    contenu: promptXml("Tu es un expert Vinted des polos Tommy Hilfiger d'occasion.", [
      "Cite le logo brodé et la coupe (regular ou slim) si elle est visible.",
      "Mentionne la matière piquée et son entretien en une phrase.",
      "Reste honnête sur l'état : signale le moindre défaut visible sur les photos.",
    ]),
    estDefaut: false,
    prixReference: 25,
    jour: 160,
  },
  {
    nom: "Sacs à dos Nike Elite",
    marque: "Nike",
    categorie: "Sac à dos",
    contenu: promptXml("Tu es un expert Vinted des sacs à dos Nike Elite d'occasion.", [
      "Indique le modèle et le coloris exacts, la contenance et les compartiments.",
      "Décris l'état des fermetures éclair, des bretelles et du fond.",
      "Précise que le sac a été nettoyé et photographié sous plusieurs angles.",
    ]),
    estDefaut: false,
    prixReference: 79,
    jour: 45,
  },
  {
    nom: "Pulls islandais",
    marque: null,
    categorie: "Pull",
    contenu: promptXml("Tu es un expert Vinted des pulls en laine, dont les pulls islandais.", [
      "Mets en avant la maille, le motif jacquard et la chaleur du vêtement.",
      "Donne la composition et les conseils de lavage à la main.",
      "Évite les superlatifs : un acheteur de laine veut des faits.",
    ]),
    estDefaut: false,
    prixReference: 39,
    jour: 30,
  },
  {
    nom: "Chemises Dickies",
    marque: "Dickies",
    categorie: "Chemise",
    contenu: promptXml("Tu es un expert Vinted du workwear, en particulier des chemises Dickies.", [
      "Insiste sur la robustesse du tissu et la coupe workwear.",
      "Signale les poches, les boutons et toute trace d'usage normale.",
    ]),
    estDefaut: false,
    prixReference: 32,
    jour: 14,
  },
] as const;

// ── Commandes et articles ───────────────────────────────────────────────────

type LotCommande = {
  nom: string;
  marque: string;
  categorie: string;
  prefixeSku: string;
} & ({ modeSaisie: "LOT"; quantite: number; prixTotal: number } | { modeSaisie: "PIECE"; pieces: number[] });

type SpecCommande = {
  fournisseur: string;
  /** Jours avant J. */
  offset: number;
  grade: string;
  coefObjectif: number;
  fraisLivraison: number;
  lots: LotCommande[];
};

const COMMANDES: SpecCommande[] = [
  {
    // Rentabilisée : 668 € récupérés pour 275 € investis.
    fournisseur: "Grossiste KZ",
    offset: 150,
    grade: "A",
    coefObjectif: 2.5,
    fraisLivraison: 25,
    lots: [
      { nom: "Polo Tommy Hilfiger", marque: "Tommy Hilfiger", categorie: "Polo", prefixeSku: "PTH", modeSaisie: "LOT", quantite: 20, prixTotal: 160 },
      { nom: "Short Adidas", marque: "Adidas", categorie: "Short", prefixeSku: "ADI", modeSaisie: "LOT", quantite: 15, prixTotal: 90 },
    ],
  },
  {
    // « Seuil proche » mais à perte : coefficient projeté ≈ 0,73.
    fournisseur: "Kilo Vintage Lyon",
    offset: 95,
    grade: "B",
    coefObjectif: 2.0,
    fraisLivraison: 30,
    lots: [
      {
        nom: "Polo Lacoste",
        marque: "Lacoste",
        categorie: "Polo",
        prefixeSku: "LAC",
        modeSaisie: "PIECE",
        pieces: [14, 14, 16, 16, 18, 18, 20, 20, 22, 22, 25, 25],
      },
    ],
  },
  {
    // En cours : environ 47 % récupérés.
    fournisseur: "Grossiste KZ",
    offset: 12,
    grade: "A",
    coefObjectif: 3.0,
    fraisLivraison: 40,
    lots: [
      { nom: "Pulls islandais", marque: "Mix", categorie: "Pull", prefixeSku: "PIS", modeSaisie: "LOT", quantite: 18, prixTotal: 216 },
      { nom: "Chemise Dickies", marque: "Dickies", categorie: "Chemise", prefixeSku: "CHD", modeSaisie: "LOT", quantite: 12, prixTotal: 120 },
    ],
  },
  {
    // Hipobuy : ses SKU sont ceux des sacs du Studio.
    fournisseur: "Hipobuy",
    offset: 40,
    grade: "A",
    coefObjectif: 3.5,
    fraisLivraison: 35,
    lots: [
      {
        nom: "Sac à dos Nike",
        marque: "Nike",
        categorie: "Sac à dos",
        prefixeSku: "SDN",
        modeSaisie: "PIECE",
        pieces: [19, 19, 21, 21, 21, 23, 23, 24, 24, 26, 26],
      },
    ],
  },
];

/** Jours avant J de la commande de chaque série de SKU. */
const OFFSET_COMMANDE: Record<string, number> = { PTH: 150, ADI: 150, LAC: 95, PIS: 12, CHD: 12, SDN: 40 };

const CANAUX_VENTE_VINTED = "Vinted";

type SpecArticle = {
  statut: (typeof STATUTS)[number];
  prixVente?: number;
  /** Jours avant J de la vente (statut Vendu). */
  offsetVente?: number;
  canal?: string;
  compte?: CompteVente | null;
  /** Jours avant J de la mise en vente ; null = aucune date ; absent = dérivé pour un article vendu. */
  miseEnVente?: number | null;
  transporteur?: string | null;
  annonce?: keyof typeof ANNONCES;
};

const ANNONCES = {
  PTH18: {
    titre: "Polo Tommy Hilfiger bleu marine brodé - Taille M",
    description:
      "Polo Tommy Hilfiger en piqué de coton, bleu marine, logo brodé sur la poitrine. Coupe regular, taille M. Très bon état, aucun accroc ni décoloration. Expédition soignée sous 48 h.",
    motsCles: "polo, tommy hilfiger, piqué, bleu marine, homme, taille M",
  },
  CHD6: {
    titre: "Chemise Dickies manches longues - Taille L - workwear",
    description:
      "Chemise Dickies en coton épais, coupe workwear, deux poches poitrine boutonnées. Taille L. Légères traces d'usage normales, aucun défaut majeur. Idéale en surchemise.",
    motsCles: "chemise, dickies, workwear, coton, taille L, homme",
  },
  PIS10: {
    titre: "Pull islandais en laine - motif jacquard - Taille M",
    description:
      "Pull en laine à motif jacquard islandais, col rond, maille épaisse et chaude. Taille M. Très bon état, sans bouloches. Lavage à la main recommandé.",
    motsCles: "pull, islandais, laine, jacquard, hiver, taille M",
  },
  PIS11: {
    titre: "Pull norvégien laine épaisse - Taille L - col rond",
    description:
      "Pull de style norvégien en laine épaisse, motif en V sur la poitrine. Taille L. État impeccable, porté deux fois. Chaleur garantie pour l'hiver.",
    motsCles: "pull, norvégien, laine, hiver, taille L, col rond",
  },
} as const;

/** Le plan des 88 articles : statut, ventes, canaux, comptes, dates de mise en vente. */
function planArticles(): Map<string, SpecArticle> {
  const plan = new Map<string, SpecArticle>();

  const vendus = (
    prefixe: string,
    prix: number[],
    offsets: number[],
    opt: { canaux?: Record<number, string>; secondaires?: number[]; compte?: Record<number, CompteVente> } = {},
  ) => {
    prix.forEach((p, i) => {
      const n = i + 1;
      const canal = opt.canaux?.[n] ?? CANAUX_VENTE_VINTED;
      const compte = opt.compte?.[n] ?? (opt.secondaires?.includes(n) ? "VINTED_SECOND" : "VINTED_PRO");
      plan.set(`${prefixe}${n}`, { statut: "Vendu", prixVente: p, offsetVente: offsets[i], canal, compte });
    });
  };
  const autres = (prefixe: string, debut: number, fin: number, spec: SpecArticle) => {
    for (let n = debut; n <= fin; n++) plan.set(`${prefixe}${n}`, { ...spec });
  };

  // Commande A : Rentabilisée.
  vendus("PTH", [24, 26, 22, 29, 25, 27, 31, 24, 28, 26, 30, 23, 27, 25, 29, 32, 26], [118, 110, 103, 96, 88, 81, 74, 66, 59, 52, 45, 38, 31, 24, 12, 5, 1], {
    canaux: { 4: "Vinted Go", 9: "En main propre", 13: "Leboncoin" },
    secondaires: [6, 12, 16],
  });
  plan.set("PTH18", { statut: "En vente", miseEnVente: 21, compte: "VINTED_PRO", annonce: "PTH18" });
  plan.set("PTH19", { statut: "Perdu" });
  plan.set("PTH20", { statut: "En stock" });
  vendus("ADI", [16, 18, 15, 19, 17, 20, 16, 18, 17, 19, 21, 18], [125, 112, 99, 85, 71, 63, 50, 41, 29, 17, 8, 4], {
    canaux: { 5: "Vinted Go" },
    secondaires: [2, 8, 11],
  });
  plan.set("ADI13", { statut: "En vente", miseEnVente: 33, compte: "VINTED_SECOND" });
  plan.set("ADI14", { statut: "Repassé" });
  plan.set("ADI15", { statut: "En lavage" });

  // Commande B : à perte, plusieurs marges négatives.
  vendus("LAC", [19, 17, 21, 18, 20, 16, 22, 19, 18], [88, 80, 72, 64, 55, 47, 36, 27, 15], {
    canaux: { 3: "Vestiaire Collective" },
    compte: { 3: "VESTIAIRE_COLLECTIVE" },
  });
  autres("LAC", 10, 11, { statut: "Perdu" });
  plan.set("LAC12", { statut: "En vente", miseEnVente: 40, compte: "VINTED_PRO" });

  // Commande C : en cours, la plus récente, la plus variée en statuts.
  vendus("PIS", [39, 42, 36], [9, 6, 2], { canaux: { 2: "Vinted Go" } });
  plan.set("PIS4", { statut: STATUT_A_COMPTABILISER, transporteur: "Vinted Go", compte: "VINTED_SECOND", miseEnVente: 9 });
  plan.set("PIS5", { statut: "En vente", miseEnVente: 7, compte: "VINTED_PRO" });
  plan.set("PIS6", { statut: "En vente", miseEnVente: 4, compte: "VINTED_PRO" });
  autres("PIS", 7, 9, { statut: STATUT_PHOTOS_PRETES });
  plan.set("PIS10", { statut: "Brouillon", annonce: "PIS10" });
  plan.set("PIS11", { statut: "Brouillon", annonce: "PIS11" });
  plan.set("PIS12", { statut: "Brouillon" });
  autres("PIS", 13, 18, { statut: "En stock" });
  vendus("CHD", [28, 32], [7, 0]);
  plan.set("CHD3", { statut: STATUT_A_COMPTABILISER, transporteur: "Mondial Relay", compte: null, miseEnVente: 8 });
  plan.set("CHD4", { statut: "En livraison", transporteur: "Mondial Relay", miseEnVente: 8, compte: "VINTED_PRO" });
  plan.set("CHD5", { statut: "En livraison", transporteur: "Colissimo", miseEnVente: 6, compte: "VINTED_PRO" });
  plan.set("CHD6", { statut: "En vente", miseEnVente: 6, compte: "VINTED_PRO", annonce: "CHD6" });
  plan.set("CHD7", { statut: "En vente", miseEnVente: 3, compte: "VINTED_PRO" });
  plan.set("CHD8", { statut: "En vente", miseEnVente: null, compte: "VINTED_PRO" }); // sans date de mise en vente : « — »
  autres("CHD", 9, 12, { statut: "En stock" });

  // Commande D : les sacs du Studio.
  plan.set("SDN1", { statut: "Vendu", prixVente: 79, offsetVente: 20, canal: CANAUX_VENTE_VINTED, compte: "VINTED_PRO" });
  plan.set("SDN2", { statut: "En vente", miseEnVente: 9, compte: "VINTED_PRO" });
  plan.set("SDN3", { statut: STATUT_PHOTOS_PRETES });
  autres("SDN", 4, 6, { statut: "En stock" });
  plan.set("SDN7", { statut: STATUT_PHOTOS_PRETES });
  plan.set("SDN8", { statut: "En stock" });
  plan.set("SDN9", { statut: "Vendu", prixVente: 85, offsetVente: 3, canal: CANAUX_VENTE_VINTED, compte: "VINTED_SECOND" });
  plan.set("SDN10", { statut: STATUT_A_COMPTABILISER, transporteur: "Colissimo", compte: "VINTED_PRO", miseEnVente: 14 });
  plan.set("SDN11", { statut: "En stock" }); // volontairement absent de SacBase

  return plan;
}

const TRANSPORTEURS_VENTE = ["Mondial Relay", "Colissimo", "Chronopost"] as const;

// ── Studio ──────────────────────────────────────────────────────────────────

const MODELES = {
  G25: "google/gemini-2.5-flash-image",
  G3P: "google/gemini-3-pro-image-preview",
  GPT: "openai/gpt-5-image-mini",
  RIV: "sourceful/riverflow-v2-max-preview",
  KREA: "krea/k3-edit",
  // Au faux catalogue OpenRouter (e2e/mocks/openrouter.mjs) : leur nom et leur prix s'affichent.
  QWEN: "qwen/qwen-image-2.1-turbo",
  SEED: "bytedance-seed/seedream-5-0-flash",
} as const;

const PROMPT_MAITRE = `You are a product photographer shooting second-hand Nike Elite backpacks for an online marketplace.
The bag in the picture must be strictly identical to the reference photos: same logos, lettering, stitching, zips and wear.
Plain light grey studio backdrop, soft diffused daylight, gentle shadow under the bag.
Portrait framing, 3:4 ratio, the bag fills about 80% of the frame.
No props, no people, no added accessories, no text overlay.`;

type CleAngle = "A1" | "A2" | "A3" | "A4" | "A1v1" | "B1" | "B2";

const ANGLES: { cle: CleAngle; nom: string; roleReference: string; ordre: number; jourCreation: number; jourArchive: number | null; texte: string }[] = [
  { cle: "A1", nom: "Trois-quarts face", roleReference: "", ordre: 1, jourCreation: 13, jourArchive: null, texte: "Angle: three-quarter front view from the left, camera slightly above the bag, zip and front pocket clearly visible." },
  { cle: "A2", nom: "Profil", roleReference: "", ordre: 2, jourCreation: 30, jourArchive: null, texte: "Angle: pure side profile from the left, camera at mid-height, shoulder strap and side patch visible." },
  { cle: "A3", nom: "Plongée", roleReference: "", ordre: 3, jourCreation: 30, jourArchive: null, texte: "Angle: high-angle shot from above, looking down into the main opening, both straps laid flat." },
  { cle: "A4", nom: "Détail logo", roleReference: "", ordre: 4, jourCreation: 30, jourArchive: null, texte: "Angle: close-up of the embroidered logo on the front pocket, shallow depth of field, logo in sharp focus." },
  { cle: "A1v1", nom: "Trois-quarts face", roleReference: "", ordre: 1, jourCreation: 40, jourArchive: 13, texte: "Angle: three-quarter front view from the left, camera at the height of the bag." },
  { cle: "B1", nom: "Face", roleReference: "face", ordre: 5, jourCreation: 40, jourArchive: 16, texte: "Angle: straight front view, camera at the centre of the bag, perfectly symmetrical." },
  { cle: "B2", nom: "Dos", roleReference: "dos", ordre: 6, jourCreation: 40, jourArchive: 16, texte: "Angle: straight rear view showing the back panel and both shoulder straps." },
];

type CleColoris = "bp" | "nv" | "el" | "an";

const COLORIS_STUDIO: { cle: CleColoris; slug: string; modele: string; coloris: string; details: string[]; generation: "V1" | "V2" | "V3" | null }[] = [
  {
    cle: "bp",
    slug: "5039-black-pink",
    modele: "Nike Elite 5039",
    coloris: "Black Pink",
    details: [
      "Swoosh rose brodé sur la poche avant",
      "Lettrage ELITE blanc sur la bretelle gauche",
      "Zip YKK noir mat",
      "Patch caoutchouc au dos",
    ],
    generation: "V1",
  },
  {
    cle: "nv",
    slug: "5040-navy-orange",
    modele: "Nike Elite 5040",
    coloris: "Navy Orange",
    details: ["Swoosh orange brodé sur la poche avant", "Lettrage ELITE orange sur la bretelle droite", "Zip YKK orange"],
    generation: "V2",
  },
  {
    cle: "el",
    slug: "elite-v3-black-gold",
    modele: "Nike Elite V3",
    coloris: "Black Gold",
    details: ["Swoosh doré brodé sur la poche avant", "Lettrage ELITE doré au centre de la face", "Patch cuir noir sur le côté gauche"],
    generation: "V3",
  },
  // Hors catalogue SacBase : sans détails, sans génération connue (noms de prise V1).
  { cle: "an", slug: "ancien-coloris-test", modele: "Nike Elite 5030", coloris: "Olive", details: [], generation: null },
];

type SpecReference = {
  cle: string;
  coloris: CleColoris | null;
  ordre: number | null;
  role: string;
  origine: "studio" | "mise_en_vente";
  sku?: string;
};

const refs = (coloris: CleColoris, prefixe: string, liste: [number, string][]): SpecReference[] =>
  liste.map(([ordre, role]) => ({ cle: `${prefixe}${String(ordre).padStart(2, "0")}`, coloris, ordre, role, origine: "studio" }));

const SPECS_REFERENCES: SpecReference[] = [
  // black-pink (V1) : 9 photos rangées avec des trous dans la planche.
  ...refs("bp", "bp", [[1, "face"], [2, "detail"], [3, "detail"], [4, "ouvert"], [5, "detail"], [6, "dos"], [7, "detail"], [10, "ouvert"], [14, "detail"]]),
  // black-pink : 2 photos gardées HORS tableau (ni ordre ni prise).
  { cle: "bpLibre1", coloris: "bp", ordre: null, role: "detail", origine: "mise_en_vente", sku: "SDN2" },
  { cle: "bpLibre2", coloris: "bp", ordre: null, role: "detail", origine: "mise_en_vente", sku: "SDN2" },
  // navy-orange (V2, donc noms de prise V1) : 5 photos.
  ...refs("nv", "nv", [[1, "face"], [2, "detail"], [3, "detail"], [4, "ouvert"], [5, "detail"]]),
  // elite (V3) : prises V3 (Face · lettrage ELITE, Dos, Côté gauche, Côté droit…).
  ...refs("el", "el", [[1, "face"], [2, "detail"], [3, "ouvert"], [6, "dos"], [12, "cote"], [13, "cote"]]),
  // hors catalogue : 2 photos.
  ...refs("an", "an", [[1, "face"], [6, "dos"]]),
  // 2 ORPHELINES (SDN11 absent de SacBase : jamais rattachées).
  { cle: "orph1", coloris: null, ordre: null, role: "face", origine: "mise_en_vente", sku: "SDN11" },
  { cle: "orph2", coloris: null, ordre: null, role: "dos", origine: "mise_en_vente", sku: "SDN11" },
];

type Verif = Prisma.InputJsonObject;

const verif = (
  details: [string, "fidele" | "derive" | "absent", string][],
  angleRespecte: boolean,
  scoreGlobal: number,
  verdict: "ok" | "a_corriger" | "rejet",
): Verif => ({
  details: details.map(([detail, statut, note]) => ({ detail, statut, note })),
  angleRespecte,
  scoreGlobal,
  verdict,
});

const DETAILS_BP = COLORIS_STUDIO[0].details;
const HORS_CHAMP = "Hors champ : l'angle demandé ne montre pas le dos.";

const VERIF_OK_88 = verif(
  [[DETAILS_BP[0], "fidele", "Position et couleur conformes."], [DETAILS_BP[1], "fidele", "Lettrage conforme à la référence."], [DETAILS_BP[2], "fidele", "Zip identique."], [DETAILS_BP[3], "absent", HORS_CHAMP]],
  true,
  88,
  "ok",
);
const VERIF_A_CORRIGER_64 = verif(
  [[DETAILS_BP[0], "fidele", "Position et couleur conformes."], [DETAILS_BP[1], "derive", "Lettrage plus épais que sur la référence."], [DETAILS_BP[3], "absent", HORS_CHAMP]],
  true,
  64,
  "a_corriger",
);
const VERIF_REJET_31 = verif(
  [[DETAILS_BP[0], "absent", "Swoosh absent de l'image."], [DETAILS_BP[1], "derive", "Lettrage illisible."], [DETAILS_BP[2], "derive", "Zip doré au lieu de noir mat."], [DETAILS_BP[3], "absent", HORS_CHAMP]],
  false,
  31,
  "rejet",
);
const VERIF_OK_84_NAVY = verif(
  [["Swoosh orange brodé sur la poche avant", "fidele", "Position et couleur conformes."], ["Lettrage ELITE orange sur la bretelle droite", "fidele", "Lettrage conforme."], ["Zip YKK orange", "fidele", "Zip identique."]],
  true,
  84,
  "ok",
);
const verifOk = (score: number): Verif =>
  verif([["Logo principal", "fidele", "Conforme à la référence."], ["Coutures et zips", "fidele", "Conformes."]], true, score, "ok");

type CleEssai = string;
type SpecEssai = {
  id: CleEssai;
  coloris: CleColoris;
  /** Clé de la photo de référence ; null pour un essai du banc de test. */
  ref: string | null;
  angle: CleAngle;
  modele: string;
  numero: number;
  decision: "valide" | "rejete" | null;
  skuCible?: string;
  parent?: CleEssai;
  /** Image purgée : urlImage "". */
  purge?: boolean;
  verif?: Verif;
  estime?: number | null;
  reel?: number | null;
  /** Graine du lancement (UUID dérivé) ; absent = dépôt manuel. */
  lancement?: string;
  jour: number;
  heure: number;
  minute: number;
};

const ESSAIS: SpecEssai[] = [
  // ── black-pink, angle A1 (trois-quarts face) ───────────────────────────────
  { id: "E1", coloris: "bp", ref: "bp01", angle: "A1", modele: MODELES.G25, numero: 1, decision: "valide", skuCible: "SDN2", verif: verifOk(91), estime: 0.039, reel: 0.0388, lancement: "lanc-01", jour: 12, heure: 10, minute: 0 },
  { id: "E2", coloris: "bp", ref: "bp02", angle: "A1", modele: MODELES.G25, numero: 2, decision: "rejete", skuCible: "SDN3", purge: true, verif: verif([[DETAILS_BP[0], "derive", "Swoosh décalé vers la gauche."]], true, 41, "rejet"), estime: 0.039, reel: 0.0388, lancement: "lanc-01", jour: 12, heure: 10, minute: 5 },
  { id: "E3", coloris: "bp", ref: "bp02", angle: "A1", modele: MODELES.G25, numero: 3, decision: "valide", skuCible: "SDN3", parent: "E2", verif: verifOk(86), estime: 0.039, reel: 0.0391, lancement: "lanc-02", jour: 11, heure: 9, minute: 30 },
  { id: "E10", coloris: "bp", ref: "bp14", angle: "A1", modele: MODELES.G25, numero: 4, decision: "rejete", verif: verif([[DETAILS_BP[2], "derive", "Zip trop brillant."]], true, 58, "a_corriger"), estime: 0.039, reel: 0.0388, lancement: "lanc-02", jour: 11, heure: 9, minute: 40 },
  // ── black-pink, file « À juger » : les trois verdicts ──────────────────────
  { id: "E4", coloris: "bp", ref: "bp03", angle: "A2", modele: MODELES.G3P, numero: 1, decision: null, skuCible: "SDN4", verif: VERIF_OK_88, estime: 0.1351, reel: 0.1342, lancement: "lanc-03", jour: 1, heure: 9, minute: 0 },
  { id: "E5", coloris: "bp", ref: "bp04", angle: "A2", modele: MODELES.G3P, numero: 2, decision: null, verif: VERIF_A_CORRIGER_64, estime: 0.1351, reel: 0.1349, lancement: "lanc-03", jour: 1, heure: 9, minute: 5 },
  { id: "E6", coloris: "bp", ref: "bp05", angle: "A3", modele: MODELES.GPT, numero: 1, decision: null, verif: VERIF_REJET_31, estime: null, reel: null, lancement: "lanc-03", jour: 1, heure: 9, minute: 10 },
  // ── black-pink, essais déposés à la main ───────────────────────────────────
  { id: "E7", coloris: "bp", ref: "bp06", angle: "A3", modele: MODELE_MANUEL, numero: 1, decision: "rejete", purge: true, jour: 6, heure: 15, minute: 0 },
  { id: "E8", coloris: "bp", ref: "bp07", angle: "A4", modele: MODELE_MANUEL, numero: 1, decision: "valide", skuCible: "SDN4", jour: 5, heure: 15, minute: 0 },
  // ── black-pink, banc de test (angles archivés, sans photo de référence) ────
  { id: "E11", coloris: "bp", ref: null, angle: "B1", modele: MODELE_MANUEL, numero: 1, decision: "valide", jour: 9, heure: 14, minute: 0 },
  { id: "E12", coloris: "bp", ref: null, angle: "B2", modele: MODELE_MANUEL, numero: 1, decision: "rejete", purge: true, jour: 9, heure: 14, minute: 10 },
  // ── black-pink, ancienne version de l'angle A1 ─────────────────────────────
  { id: "E13", coloris: "bp", ref: "bp01", angle: "A1v1", modele: MODELES.G25, numero: 1, decision: "rejete", purge: true, verif: verif([[DETAILS_BP[1], "derive", "Lettrage déformé."]], true, 47, "a_corriger"), estime: 0.039, reel: 0.0388, lancement: "lanc-00", jour: 15, heure: 10, minute: 0 },
  { id: "E14", coloris: "bp", ref: "bp01", angle: "A1v1", modele: MODELES.G25, numero: 2, decision: "valide", skuCible: "SDN1", parent: "E13", verif: verifOk(89), estime: 0.039, reel: 0.0388, lancement: "lanc-00", jour: 15, heure: 10, minute: 10 },
  // ── navy-orange : une comparaison à juger (même case, même lancement, 3 modèles) ──
  { id: "E20", coloris: "nv", ref: "nv01", angle: "A1", modele: MODELES.G25, numero: 1, decision: null, skuCible: "SDN7", verif: VERIF_OK_84_NAVY, estime: 0.039, reel: 0.0388, lancement: "lanc-04", jour: 2, heure: 10, minute: 0 },
  { id: "E21", coloris: "nv", ref: "nv01", angle: "A1", modele: MODELES.QWEN, numero: 1, decision: null, skuCible: "SDN7", verif: verif([["Swoosh orange brodé sur la poche avant", "derive", "Swoosh trop pâle."]], true, 62, "a_corriger"), estime: 0.0184, reel: 0.0184, lancement: "lanc-04", jour: 2, heure: 10, minute: 1 },
  { id: "E22", coloris: "nv", ref: "nv01", angle: "A1", modele: MODELES.SEED, numero: 1, decision: null, skuCible: "SDN7", verif: VERIF_OK_84_NAVY, estime: 0.03, reel: null, lancement: "lanc-04", jour: 2, heure: 10, minute: 2 },
  // ── elite-v3-black-gold : plusieurs modèles sur un même lancement ──────────
  { id: "E30", coloris: "el", ref: "el01", angle: "A1", modele: MODELES.G25, numero: 1, decision: "valide", skuCible: "SDN9", verif: verifOk(92), estime: 0.039, reel: 0.0388, lancement: "lanc-05", jour: 4, heure: 16, minute: 0 },
  { id: "E31", coloris: "el", ref: "el02", angle: "A1", modele: MODELES.G25, numero: 2, decision: "valide", skuCible: "SDN9", verif: verifOk(87), estime: 0.039, reel: 0.0388, lancement: "lanc-05", jour: 4, heure: 16, minute: 5 },
  { id: "E32", coloris: "el", ref: "el03", angle: "A2", modele: MODELES.RIV, numero: 1, decision: "valide", skuCible: "SDN8", verif: verifOk(90), estime: 0.275, reel: 0.201, lancement: "lanc-05", jour: 3, heure: 11, minute: 0 },
  { id: "E33", coloris: "el", ref: "el06", angle: "A2", modele: MODELES.RIV, numero: 2, decision: "rejete", skuCible: "SDN8", purge: true, verif: verif([["Patch cuir noir sur le côté gauche", "absent", "Patch absent."]], true, 39, "rejet"), estime: 0.275, reel: 0.2, lancement: "lanc-06", jour: 3, heure: 11, minute: 10 },
  { id: "E34", coloris: "el", ref: "el06", angle: "A2", modele: MODELES.RIV, numero: 3, decision: "valide", skuCible: "SDN8", parent: "E33", verif: verifOk(85), estime: 0.275, reel: 0.203, lancement: "lanc-06", jour: 3, heure: 11, minute: 20 },
  // Coût réel absent : le total de la fiche devient un minimum.
  { id: "E35", coloris: "el", ref: "el13", angle: "A4", modele: MODELES.G3P, numero: 1, decision: "valide", skuCible: "SDN8", verif: verifOk(93), estime: 0.1351, reel: null, lancement: "lanc-06", jour: 3, heure: 11, minute: 30 },
  // Qwen (au faux catalogue), deux premiers coups décidés : 50 % dans le sélecteur.
  { id: "E36", coloris: "el", ref: "el12", angle: "A3", modele: MODELES.QWEN, numero: 1, decision: "valide", skuCible: "SDN8", verif: verifOk(88), estime: 0.0184, reel: 0.0184, lancement: "lanc-07", jour: 2, heure: 15, minute: 0 },
  { id: "E37", coloris: "el", ref: "el01", angle: "A2", modele: MODELES.QWEN, numero: 1, decision: "rejete", skuCible: "SDN9", purge: true, verif: verif([["Swoosh doré brodé sur la poche avant", "absent", "Swoosh absent."]], true, 35, "rejet"), estime: 0.0184, reel: 0.0184, lancement: "lanc-07", jour: 2, heure: 15, minute: 5 },
];

type SpecEchec = {
  coloris: CleColoris;
  angle: CleAngle;
  modele: string;
  code: string;
  message: string;
  lancement: string;
  reel: number | null;
  ref: string;
  jour: number;
  heure: number;
  minute: number;
};

const ECHECS: SpecEchec[] = [
  { coloris: "bp", angle: "A3", modele: MODELES.GPT, code: "securite", message: "Le fournisseur a refusé la demande (modération).", lancement: "lanc-03", reel: null, ref: "bp05", jour: 1, heure: 9, minute: 8 },
  { coloris: "bp", angle: "A2", modele: MODELES.G3P, code: "no_image", message: "Le modèle n'a renvoyé aucune image.", lancement: "lanc-03", reel: 0.0021, ref: "bp04", jour: 1, heure: 9, minute: 3 },
  { coloris: "el", angle: "A1", modele: MODELES.KREA, code: "incertain", message: "Passerelle OpenRouter en erreur (504) : vérifier l'activité avant de relancer", lancement: "lanc-05", reel: null, ref: "el01", jour: 4, heure: 16, minute: 8 },
];

const FAVORIS = [MODELES.G25, MODELES.G3P];

/** Budget par sac du compte demo (StudioReglages.budgetParSacEur), taux par défaut 0,86. */
export const BUDGET_E2E_EUR = 0.3;

// ── Nettoyage idempotent ────────────────────────────────────────────────────

/**
 * Supprime les comptes de test et tout ce qui en dépend, dans l'ordre imposé
 * par les clés RESTRICT (StudioEssai → angle et photo, StudioEchec → angle).
 * Refuse de toucher un utilisateur dont l'e-mail ne finit pas par @myflip.test.
 */
async function effacerComptes(prisma: PrismaClient): Promise<void> {
  const ids = Object.values(COMPTES).map((c) => c.id);
  const emails = Object.values(COMPTES).map((c) => c.email);
  for (const e of emails) {
    if (!e.endsWith(SUFFIXE_EMAIL_TEST)) throw new Error("Seed e2e refusé : un e-mail de test ne finit pas par @myflip.test.");
  }
  const existants = await prisma.user.findMany({
    where: { OR: [{ id: { in: ids } }, { email: { in: emails } }] },
    select: { id: true, email: true },
  });
  for (const u of existants) {
    if (!u.email.endsWith(SUFFIXE_EMAIL_TEST)) throw new Error("Seed e2e refusé : un compte à effacer n'est pas un compte de test.");
  }
  for (const { id } of existants) {
    await prisma.studioEssai.deleteMany({ where: { coloris: { userId: id } } });
    await prisma.studioEchec.deleteMany({ where: { userId: id } });
    await prisma.studioReference.deleteMany({ where: { userId: id } });
    await prisma.studioAngle.deleteMany({ where: { userId: id } });
    await prisma.studioColoris.deleteMany({ where: { userId: id } });
    await prisma.studioModeleFavori.deleteMany({ where: { userId: id } });
    await prisma.studioReglages.deleteMany({ where: { userId: id } });
  }
  // Le Cascade emporte le reste : réglages, prompts, articles, lots, commandes.
  await prisma.user.deleteMany({ where: { id: { in: existants.map((u) => u.id) } } });
}

// ── Seed ────────────────────────────────────────────────────────────────────

/**
 * Efface puis recrée les comptes « demo » et « neuf ». Idempotent. `maintenant`
 * fixe le jour J : toutes les dates en sont déduites.
 *
 * `creerCommande` (le code de l'app) passe par le client de lib/prisma : ce
 * client est donc aligné sur `prisma` avant de charger le module, et
 * DATABASE_URL doit désigner la même base que `prisma`.
 */
export async function seedE2E(prisma: PrismaClient, maintenant: Date): Promise<void> {
  verifierBaseLocale();
  const { J, vente } = creerCalendrier(maintenant);

  const global = globalThis as unknown as { prisma?: PrismaClient };
  if (!global.prisma) global.prisma = prisma;
  const { creerCommande } = await import("@/lib/commandes");

  await effacerComptes(prisma);

  const hash = await bcrypt.hash(MOT_DE_PASSE_E2E, 10);
  const demo = COMPTES.demo;
  const neuf = COMPTES.neuf;

  // ── Comptes ───────────────────────────────────────────────────────────────
  await prisma.user.create({
    data: { id: demo.id, email: demo.email, password: hash, prenom: demo.prenom, plan: demo.plan, createdAt: J(200) },
  });
  await prisma.user.create({
    data: { id: neuf.id, email: neuf.email, password: hash, prenom: neuf.prenom, plan: neuf.plan, createdAt: maintenant },
  });

  // Compte neuf : comme l'inscription (app/api/auth/signup/route.ts), un prompt par défaut et rien d'autre.
  await prisma.promptTemplate.create({
    data: { nom: "Prompt par défaut", contenu: DEFAULT_PROMPT_CONTENU, estDefaut: true, userId: neuf.id, createdAt: maintenant, updatedAt: maintenant },
  });

  // ── Réglages du compte demo ───────────────────────────────────────────────
  // La clé factice est chiffrée avec l'ENCRYPTION_KEY du serveur e2e, quelle que soit celle de l'environnement.
  const cleAvant = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = CLE_CHIFFREMENT_E2E;
  let openrouterKey: string;
  try {
    openrouterKey = chiffrer(CLE_OPENROUTER_FACTICE);
  } finally {
    if (cleAvant === undefined) delete process.env.ENCRYPTION_KEY;
    else process.env.ENCRYPTION_KEY = cleAvant;
  }
  await prisma.userSettings.create({
    data: {
      userId: demo.id,
      openrouterKey,
      objectifMensuel: 600,
      onboardingEtape: 3,
      onboardingTermine: true,
      createdAt: J(190),
    },
  });

  for (const p of PROMPTS_DEMO) {
    await prisma.promptTemplate.create({
      data: {
        nom: p.nom,
        marque: p.marque,
        categorie: p.categorie,
        contenu: p.contenu,
        estDefaut: p.estDefaut,
        prixReference: p.prixReference,
        userId: demo.id,
        createdAt: J(p.jour),
        updatedAt: J(p.jour),
      },
    });
  }

  // ── Commandes, lots, articles (code de l'app) ─────────────────────────────
  for (const c of COMMANDES) {
    const date = J(c.offset);
    const res = await creerCommande(demo.id, {
      fournisseur: c.fournisseur,
      date: date.toISOString(),
      grade: c.grade,
      coefObjectif: c.coefObjectif,
      fraisLivraison: c.fraisLivraison,
      lots: c.lots.map((l) =>
        l.modeSaisie === "LOT"
          ? { nom: l.nom, marque: l.marque, categorie: l.categorie, prefixeSku: l.prefixeSku, modeSaisie: "LOT", quantite: l.quantite, prixTotal: l.prixTotal }
          : { nom: l.nom, marque: l.marque, categorie: l.categorie, prefixeSku: l.prefixeSku, modeSaisie: "PIECE", pieces: l.pieces.map((prixAchat) => ({ prixAchat })) },
      ),
    });
    if (!res.ok) throw new Error(`Seed e2e : creerCommande a échoué (${res.error}).`);
    // createdAt vaut now() par défaut : sans réécriture, les 88 articles seraient « nouveaux ce mois » au dashboard.
    await prisma.commande.update({ where: { id: res.commande.id }, data: { createdAt: date } });
    await prisma.article.updateMany({ where: { commandeId: res.commande.id }, data: { createdAt: date } });
    for (const [i, lot] of res.commande.lots.entries()) {
      await prisma.lot.update({ where: { id: lot.id }, data: { createdAt: new Date(date.getTime() + i * 1000) } });
    }
  }

  // ── Statuts, ventes, annonces ─────────────────────────────────────────────
  const plan = planArticles();
  const articles = await prisma.article.findMany({ where: { userId: demo.id }, select: { id: true, sku: true, prixAchat: true } });
  if (articles.length !== plan.size) {
    throw new Error(`Seed e2e : ${articles.length} articles créés, ${plan.size} prévus.`);
  }
  let rangVente = 0;
  for (const a of articles.sort((x, y) => x.sku.localeCompare(y.sku, "fr", { numeric: true }))) {
    const spec = plan.get(a.sku);
    if (!spec) throw new Error(`Seed e2e : article ${a.sku} absent du plan.`);
    const serie = a.sku.replace(/\d+$/, "");
    const annonce = spec.annonce ? ANNONCES[spec.annonce] : null;

    let dateMiseEnVente: Date | null = null;
    if (spec.miseEnVente !== undefined) dateMiseEnVente = spec.miseEnVente === null ? null : J(spec.miseEnVente);
    else if (spec.statut === STATUT_VENDU) {
      dateMiseEnVente = J(Math.min((spec.offsetVente ?? 0) + 6, OFFSET_COMMANDE[serie] - 2));
    }

    const vendu = spec.statut === STATUT_VENDU;
    const d = deriveVente({
      statut: spec.statut,
      prixAchat: a.prixAchat,
      prixVente: spec.prixVente ?? null,
      dateVente: vendu ? vente(spec.offsetVente ?? 0) : null,
    });

    // Transporteur d'un article vendu : suit le canal (Vinted Go) ou alterne ; aucun en main propre.
    let transporteur = spec.transporteur ?? null;
    if (vendu) {
      if (spec.canal === "Vinted Go") transporteur = "Vinted Go";
      else if (spec.canal === "En main propre") transporteur = null;
      else transporteur = TRANSPORTEURS_VENTE[rangVente % TRANSPORTEURS_VENTE.length];
      rangVente += 1;
    }

    await prisma.article.update({
      where: { id: a.id },
      data: {
        statut: spec.statut,
        ...d,
        ...(spec.canal ? { canal: spec.canal } : {}),
        compteVente: spec.compte ?? null,
        dateMiseEnVente,
        transporteur,
        titreAnnonce: annonce?.titre ?? null,
        descriptionAnnonce: annonce?.description ?? null,
        motsClesAnnonce: annonce?.motsCles ?? null,
      },
    });
  }

  await semerStudio(prisma, demo.id, J);
}

/** Tout le Studio du compte demo. Voir l'en-tête pour l'écran que chaque bloc fait apparaître. */
async function semerStudio(prisma: PrismaClient, userId: string, J: Calendrier["J"]): Promise<void> {
  // Petit budget par sac : la confirmation « au-dessus du budget » se teste sans un lancement de 15 prises.
  await prisma.studioReglages.create({ data: { userId, promptMaitre: PROMPT_MAITRE, budgetParSacEur: BUDGET_E2E_EUR, updatedAt: J(1) } });

  const idAngle = (cle: CleAngle) => `e2e-angle-${cle.toLowerCase()}`;
  for (const a of ANGLES) {
    await prisma.studioAngle.create({
      data: {
        id: idAngle(a.cle),
        userId,
        nom: a.nom,
        roleReference: a.roleReference,
        angle: a.texte,
        ordre: a.ordre,
        archiveLe: a.jourArchive === null ? null : J(a.jourArchive),
        createdAt: J(a.jourCreation),
      },
    });
  }

  const idColoris = (cle: CleColoris) => `e2e-coloris-${cle}`;
  for (const c of COLORIS_STUDIO) {
    await prisma.studioColoris.create({
      data: { id: idColoris(c.cle), userId, cle: c.slug, modele: c.modele, coloris: c.coloris, details: c.details.join("\n"), createdAt: J(20) },
    });
  }
  const generationDe = (cle: CleColoris) => COLORIS_STUDIO.find((c) => c.cle === cle)?.generation ?? null;

  // Photos de référence : la prise porte le nom exact de la génération, sinon la fiche la renomme en base.
  const idRef = (cle: string) => `e2e-ref-${cle}`;
  for (const [i, r] of SPECS_REFERENCES.entries()) {
    const generation = r.coloris ? generationDe(r.coloris) : null;
    await prisma.studioReference.create({
      data: {
        id: idRef(r.cle),
        userId,
        colorisId: r.coloris ? idColoris(r.coloris) : null,
        sku: r.sku ?? null,
        origine: r.origine,
        role: r.role,
        urlImage: urlReference(userId, r.cle),
        ordre: r.ordre,
        prise: r.ordre === null ? null : nomPrise(r.ordre, generation),
        createdAt: new Date(J(21).getTime() + i * 1000),
      },
    });
  }

  const angleTexte = (cle: CleAngle) => ANGLES.find((a) => a.cle === cle)?.texte ?? "";
  const idEssai = (cle: CleEssai) => `e2e-essai-${cle.toLowerCase()}`;
  for (const e of ESSAIS) {
    await prisma.studioEssai.create({
      data: {
        id: idEssai(e.id),
        colorisId: idColoris(e.coloris),
        angleId: idAngle(e.angle),
        numero: e.numero,
        source: e.modele === MODELE_MANUEL ? "manuel" : "api",
        modele: e.modele,
        coutEstimeUsd: e.estime ?? null,
        coutReelUsd: e.reel ?? null,
        lancementId: e.lancement ? uuidDe(`e2e-${e.lancement}`) : null,
        essaiParentId: e.parent ? idEssai(e.parent) : null,
        promptUtilise: promptVariante(PROMPT_MAITRE, angleTexte(e.angle)),
        urlImage: e.purge ? "" : urlGeneree(userId, e.id),
        verifIA: e.verif ?? Prisma.DbNull,
        decision: e.decision,
        referenceId: e.ref ? idRef(e.ref) : null,
        skuCible: e.skuCible ?? null,
        createdAt: J(e.jour, e.heure, e.minute),
      },
    });
  }

  for (const f of ECHECS) {
    await prisma.studioEchec.create({
      data: {
        userId,
        colorisId: idColoris(f.coloris),
        angleId: idAngle(f.angle),
        modele: f.modele,
        code: f.code,
        message: f.message,
        lancementId: uuidDe(`e2e-${f.lancement}`),
        coutReelUsd: f.reel,
        referenceId: idRef(f.ref),
        createdAt: J(f.jour, f.heure, f.minute),
      },
    });
  }

  for (const modele of FAVORIS) {
    await prisma.studioModeleFavori.create({ data: { userId, modele, createdAt: J(10) } });
  }
}

// ── Point d'entrée en ligne de commande ─────────────────────────────────────

/** Vrai quand ce fichier est lancé directement (tsx e2e/seed/seed-e2e.ts), faux quand un test l'importe. */
const lanceEnDirect = /seed-e2e\.(?:ts|js|mjs|cjs)$/.test(process.argv[1] ?? "");

if (lanceEnDirect) {
  (async () => {
    verifierBaseLocale(); // avant même d'ouvrir une connexion
    const prisma = new PrismaClient();
    try {
      await seedE2E(prisma, new Date());
      console.log("Seed e2e terminé : comptes demo et neuf recréés.");
    } finally {
      await prisma.$disconnect();
    }
  })().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : "Seed e2e : erreur inconnue.");
    process.exit(1);
  });
}
