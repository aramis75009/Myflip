// Types DTO échangés entre les API routes et le client.

/** Compte sur lequel la vente a été encaissée. */
export type CompteVente =
  "VINTED_PRO" | "VINTED_SECOND" | "VESTIAIRE_COLLECTIVE";

export type ArticleDTO = {
  id: string;
  sku: string;
  marque: string; // marque réelle : Adidas, Ralph Lauren, Mix…
  categorie: string; // type d'article : Short, Polo, Pull…
  lot: string | null; // libellé du lot d'achat : « Short Adidas »
  grade: string | null;
  statut: string;
  prixAchat: number;
  prixVente: number | null;
  margeBrute: number | null;
  margeNette: number | null;
  coefficient: number | null;
  canal: string | null;
  dateVente: string | null; // ISO
  transporteur: string | null;
  trelloCardId: string | null;
  commandeId: string | null;
  /**
   * Moyenne du lot (coût total ÷ nombre d'articles), PAS le prix de cet
   * article — celui-ci est `prixAchat`. Les deux diffèrent dès qu'une commande
   * est en saisie détaillée. Aucun écran ne l'affiche aujourd'hui ; ne pas
   * l'utiliser comme prix d'une pièce.
   */
  prixUnitaire: number | null;
  coefObjectif: number | null; // objectif de coef de la commande
  titreAnnonce: string | null;
  descriptionAnnonce: string | null;
  motsClesAnnonce: string | null;
  commandeFournisseur: string | null;
  compteVente: CompteVente | null;
};

export type PromptTemplateDTO = {
  id: string;
  nom: string;
  marque: string | null;
  categorie: string | null;
  contenu: string;
  estDefaut: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type PrixReferenceDTO = {
  id: string;
  marque: string | null;
  categorie: string | null;
  prix: number;
  estDefaut: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};

export type CommandeDTO = {
  id: string;
  date: string;
  fournisseur: string;
  nbArticles: number;
  coutTotal: number;
  /**
   * Coût total ÷ nombre d'articles. En mode DETAILLE, c'est une MOYENNE et non
   * le prix d'une pièce : à libeller « P.U. moyen » partout où il s'affiche.
   */
  prixUnitaire: number;
  /** Part du coût total correspondant au transport, déjà répartie sur les articles. */
  fraisLivraison: number | null;
  /** "LISSE" (prix uniforme) ou "DETAILLE" (un prix saisi par pièce). */
  modeSaisie: string;
  marque: string | null;
  categorie: string | null;
  grade: string | null;
  coefObjectif: number | null;
  /** Les lots de la commande, dans l'ordre de saisie. */
  lots: LotDTO[];
};

/**
 * Un lot d'achat à l'intérieur d'une commande.
 *
 * `prixTotal` est HORS frais de livraison : le port vit sur la commande et se
 * répartit au prorata sur toutes les pièces de tous les lots.
 */
export type LotDTO = {
  id: string;
  nom: string;
  marque: string;
  categorie: string;
  prefixeSku: string;
  /** "LOT" (quantité + prix global) ou "PIECE" (un prix par pièce). */
  modeSaisie: string;
  quantite: number;
  prixTotal: number;
};

/**
 * Une ligne du tableau de répartition d'une commande.
 *
 * Le regroupement se fait par LOT depuis le 11/08/2026, plus par catégorie :
 * l'utilisateur veut lire « Polo Ralph Lauren », pas « Polo ». Voir
 * `cleRegroupement` dans `lib/calc.ts` pour la cascade de replis.
 */
export type CommandeStatsRow = {
  /** Identité de la ligne : un `Lot.id`, ou un libellé si l'article est orphelin. Jamais affichée. */
  cle: string;
  /** Ce qui s'affiche dans la colonne. */
  libelle: string;
  /**
   * @deprecated Ancien nom de `libelle`, conservé peuplé le temps qu'un onglet
   * servi par le bundle précédent finisse sa session. À retirer à la prochaine
   * livraison — sans lui, ces onglets afficheraient des cellules vides.
   */
  categorie: string;
  total: number;
  enStock: number;
  enVente: number;
  vendus: number;
  ca: number;
  margeNette: number;
  coefMoyen: number;
  pctVendu: number; // 0..1
};

export type CanalRow = {
  canal: string;
  vendus: number;
  ca: number;
  panierMoyen: number;
  pctCa: number; // 0..1
};

/**
 * Synthèse d'une commande : où en est la rentabilité, et où elle atterrit.
 * Tout est calculé côté serveur à partir des articles du lot.
 * Les champs nullables valent null quand la donnée est indisponible
 * (aucune vente, pas d'objectif de coef…) — jamais 0, qui serait un mensonge.
 */
export type CommandeResume = {
  // — Où on en est —
  coutTotal: number;
  totalArticles: number;
  vendus: number;
  restants: number; // ni vendus, ni perdus
  perdus: number;
  montantRecupere: number;
  resteARecuperer: number;
  margeNetteRealisee: number;
  panierMoyen: number | null;
  coefActuel: number | null; // CA encaissé / coût total
  coefObjectif: number | null;
  seuilArticles: number | null; // articles à vendre pour rembourser le lot

  // — Projection —
  caProjete: number | null; // si les restants partent au panier moyen
  margeProjetee: number | null;
  coefProjete: number | null;
  prixMoyenRequis: number | null; // prix moyen à tenir sur les restants pour l'objectif
  rythmeHebdo: number | null; // ventes par semaine
  rythmeRecent: boolean; // true = calculé sur les 28 derniers jours
  joursEcoulement: number | null; // jours estimés pour écouler les restants
  dateEcoulement: string | null; // ISO

  // — Temps —
  ageJours: number;
  datePointMort: string | null; // ISO — date de franchissement du seuil
  joursPointMort: number | null; // depuis la date de commande
  delaiMoyenVente: number | null; // jours entre l'achat du lot et la vente

  // — Canaux & angles morts —
  canaux: CanalRow[];
  dormants: number; // en stock, photos pas prêtes
  caDormant: number | null;
  // Depuis le 11/08/2026 ces deux champs portent un LOT, pas une catégorie :
  // ils sont dérivés des mêmes lignes que `rows`. Renommés pour que le libellé
  // affiché ne mente pas sur ce qu'il mesure.
  meilleurLot: { libelle: string; coefMoyen: number } | null;
  pireLot: { libelle: string; coefMoyen: number } | null;
};

export type CommandeStatsDTO = {
  rows: CommandeStatsRow[];
  resume: CommandeResume;
};

export type BrandRow = {
  marque: string;
  total: number;
  enStock: number;
  vendus: number;
  ca: number;
  margeNette: number;
  coefMoyen: number;
  panierMoyen: number;
  pctVendu: number;
};

export type WeekPoint = {
  semaine: string; // ex. "12 mai"
  ca: number;
};

// Évolution mois calendaire courant vs mois précédent (basée sur dateVente).
// pct est null quand le mois précédent est nul (pas de base de comparaison).
export type DashboardDelta = {
  pct: number | null;
  abs: number;
};

export type DashboardDTO = {
  caTotal: number;
  margeNetteTotal: number;
  margeMoyenne: number; // margeNetteTotal / caTotal (0..1)
  enStock: number;
  enVente: number; // articles actuellement au statut « En vente »
  nouveaux: number; // articles créés dans la période (createdAt)
  pctVendu: number;
  totalArticles: number;
  vendus: number;
  parMarque: BrandRow[];
  caParSemaine: WeekPoint[];
  caParJour: { jour: string; ca: number }[]; // CA jour par jour du mois en cours
  caMoisPrecedent: number; // CA du mois précédent, hors filtre de période
  caDelta: DashboardDelta; // CA mois courant vs mois précédent
  margeDelta: DashboardDelta; // marge nette mois courant vs mois précédent
};

export type CalendarArticle = {
  id: string;
  sku: string;
  marque: string;
  prixVente: number;
  margeNette: number;
  coefficient: number;
};

export type CalendarDay = {
  date: string; // YYYY-MM-DD
  ca: number;
  nbArticles: number;
  net: number;
  articles: CalendarArticle[];
};

export type CalendarWeek = {
  ca: number;
  nbArticles: number;
  net: number;
  coefMoyen: number;
  panierMoyen: number;
};

export type CalendarDTO = {
  month: string; // YYYY-MM
  days: CalendarDay[];
  total: { ca: number; nbArticles: number; net: number };
};

export type WeekdayPoint = {
  jour: string; // Lundi…Dimanche
  vendus: number;
  ca: number; // chiffre d'affaires cumulé sur ce jour de semaine
  dateRecente: string | null; // ISO : date la plus récente tombant ce jour-là
};

export type StatsBrandRow = {
  marque: string;
  ca: number; // chiffre d'affaires cumulé de la marque sur le périmètre
  margeNette: number;
  coefMoyen: number;
  vendus: number;
};

export type TopArticle = {
  sku: string;
  marque: string;
  prixVente: number;
  margeNette: number;
};

export type StatutCount = {
  statut: string;
  count: number;
};

export type CanalCA = {
  canal: string;
  ca: number;
};

// Notifications : rappels d'actions à mener, calculés côté serveur.
export type NotificationItem = {
  key: string; // identifiant stable (ex. "a-comptabiliser")
  severity: "action" | "info"; // action = à faire ; info = à surveiller
  title: string;
  message: string;
  count: number;
  href: string; // vue filtrée correspondante
};

export type NotificationsDTO = {
  items: NotificationItem[];
  total: number; // somme des compteurs
};

export type StatsDTO = {
  vitesse: {
    parJour7: number; // moyenne articles vendus / jour sur 7 jours
    parJour30: number; // moyenne sur 30 jours
    total7: number;
    total30: number;
  };
  parJourSemaine: WeekdayPoint[];
  marquesRentables: StatsBrandRow[];
  topArticles: TopArticle[];
  projection: {
    restants: number; // articles non vendus
    cadenceParJour: number; // base de calcul
    joursRestants: number | null; // null si cadence nulle
  };
  repartitionStatuts: StatutCount[];
  caParCanal: CanalCA[];
};

// ── Réglages du compte ─────────────────────────────────────────────────────

/**
 * État d'un secret vu du client. La valeur en clair ne traverse jamais l'API :
 * on ne renvoie que sa présence et ses 4 derniers caractères.
 */
export type SecretEtat = {
  renseigne: boolean;
  apercu: string | null; // « ••••a1b2 »
};

/** D'où vient la valeur réellement utilisée à l'exécution. */
export type SourceReglage = "utilisateur" | "app" | "absente";

/**
 * D'où vient l'accès Trello du compte.
 *
 * « heritee » = clé et jeton saisis à la main avant le 15/08/2026. Ils
 * fonctionnent toujours ; l'écran propose de basculer sur la connexion Trello.
 */
export type SourceTrello = "oauth" | "heritee" | "absente";

/**
 * État de la connexion Trello, vu du client.
 *
 * Aucun jeton ici, ni même son aperçu : contrairement aux clés IA, l'accès
 * Trello n'est jamais saisi par l'utilisateur, donc il n'a rien à y
 * reconnaître. Ce qu'il veut savoir, c'est « suis-je connecté, et à quel
 * compte ».
 */
export type TrelloEtatDTO = {
  connecte: boolean;
  source: SourceTrello;
  /** Nom du membre Trello, pour « connecté en tant que … ». */
  membreNom: string | null;
  boardId: string | null;
  labelId: string | null;
  comptabiliseLabelId: string | null;
  /** Vrai si un webhook est enregistré : sinon rien ne remonte de Trello. */
  webhookActif: boolean;
};

export type UserSettingsDTO = {
  openrouter: SecretEtat;
  trello: TrelloEtatDTO;
  /** Identifiant OpenRouter du modèle qui rédige les annonces. */
  modeleIA: string | null;
  /** Identifiant OpenRouter du modèle de l'assistant conversationnel. */
  modeleChatIA: string | null;
  objectifMensuel: number | null;
  /** Étape en cours du parcours de démarrage (1 à 3). */
  onboardingEtape: number;
  onboardingTermine: boolean;
  source: {
    openrouter: SourceReglage;
    trello: SourceTrello;
  };
  /** Faux si ENCRYPTION_KEY manque : aucun secret ne peut être enregistré. */
  chiffrementDisponible: boolean;
};

/** Un board Trello proposé au choix dans l'écran de configuration. */
export type TrelloBoardDTO = { id: string; name: string };
export type TrelloLabelDTO = { id: string; name: string; color: string | null };
