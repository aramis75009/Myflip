// Les prises de la planche (une vraie photo par prise), le sac cible d'un
// coloris et les filtres de l'accueil /studio.
//
// PUR et isomorphe : ni base, ni réseau. Les écrans et les routes lui passent
// des lignes déjà lues ; c'est ce qui permet de tester les règles sans base.
//
// Le tableau photo × prompt d'angle (cases, verrous, choix automatique) a été
// retiré avec la génération d'images IA le 17/11/2026.

/**
 * Les prises d'un sac, toujours les mêmes, dans l'ordre où on les fait. Liste
 * fixe (décision du 20/10) : 14 prises plus une libre. C'est celle des V1 ; les
 * V2 la gardent tant qu'Aramis n'a pas photographié de V2.
 */
export const PRISES: readonly string[] = [
  "Face",
  "Face · détail gauche",
  "Face · poche droite",
  "Face · ouverte",
  "Swoosh et zip",
  "Dos",
  "Bretelle gauche",
  "Bretelle droite",
  "Boucle de poitrine",
  "Compartiment du haut",
  "Poche du haut",
  "Côté · patch",
  "Côté · poche",
  "Dessous",
  "Prise libre",
];

/** Les V3 ne montrent pas les mêmes détails (validé par Aramis le 20/10). */
const PRISES_V3: readonly string[] = [
  "Face",
  "Face · lettrage ELITE",
  "Face · poche ouverte",
  "Swoosh",
  "Compartiment principal ouvert",
  "Dos",
  "Bretelle gauche",
  "Bretelle droite",
  "Boucle de poitrine",
  "Poche latérale ouverte",
  "Compartiment du haut",
  "Côté gauche",
  "Côté droit",
  "Dessous",
  "Prise libre",
];

/** La liste des prises d'une génération (« V1 », « V2 », « V3 ») ; V1 par défaut. */
export const prisesPour = (generation?: string | null): readonly string[] => (generation === "V3" ? PRISES_V3 : PRISES);

/** Toutes les générations ont le même nombre de cases : un numéro de prise reste valable partout. */
export const MAX_PRISES = PRISES.length;

/** Nom de la prise n° `ordre` (1-indexé) pour cette génération, « Prise n » au-delà de la liste. */
export const nomPrise = (ordre: number, generation?: string | null) => prisesPour(generation)[ordre - 1] ?? `Prise ${ordre}`;

/**
 * Statuts MyFlip d'un sac encore « chez moi », sans annonce : mêmes valeurs que
 * `CHEZ_MOI_STATUTS` côté SacBase. Tout autre statut connu (En vente, Vendu,
 * À comptabiliser…) veut dire que l'annonce existe.
 */
export const STATUTS_SANS_ANNONCE: ReadonlySet<string> = new Set(["En stock", "Photos prêtes"]);

// ── Sac cible ───────────────────────────────────────────────────────────────

export type SacCatalogue = { sku: string; statut: string; vendu: boolean };

/**
 * Le sac est-il chez toi, sans annonce ? Statut « En stock » ou « Photos prêtes »,
 * non vendu. Le statut MyFlip, s'il est connu, l'emporte sur celui relayé par
 * SacBase. C'est LA règle du Studio : le sac cible d'un coloris et la vue
 * « chez toi » de l'accueil l'utilisent toutes les deux.
 */
export function estChezToi(s: SacCatalogue, statutDe: (sku: string) => string | null): boolean {
  const statut = statutDe(s.sku) ?? s.statut;
  return !s.vendu && STATUTS_SANS_ANNONCE.has(statut);
}

/** Les sacs à préparer : ceux chez toi, encore sans annonce. Le premier donne la Version 1 de la fiche. */
export function sacsCibles(sacs: readonly SacCatalogue[], statutDe: (sku: string) => string | null): string[] {
  return sacs
    .filter((s) => estChezToi(s, statutDe))
    .map((s) => s.sku)
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}

// ── Accueil ─────────────────────────────────────────────────────────────────

export const GENERATIONS = ["V1", "V2", "V3"] as const;
export type Generation = (typeof GENERATIONS)[number];
export const estGeneration = (v: unknown): v is Generation => GENERATIONS.includes(v as Generation);

export const FILTRES_ACCUEIL = [
  "doublons",
  "a_photographier_chez_toi",
  "a_commander",
  "photographies",
  "jamais_photographies",
] as const;
export type FiltreAccueil = (typeof FILTRES_ACCUEIL)[number];

/**
 * Identifiants d'URL d'avant le 10/11, toujours lisibles (liens enregistrés, retour de fiche
 * gardé en sessionStorage) : « À photographier » est devenu la tuile « Chez toi : à photographier ».
 */
export const FILTRES_ANCIENS: Readonly<Record<string, FiltreAccueil>> = { a_photographier: "a_photographier_chez_toi" };

/** Un identifiant lu dans l'URL → le filtre courant ; null s'il est inconnu. */
export function resoudreFiltre(v: unknown): FiltreAccueil | null {
  if (typeof v !== "string") return null;
  if (FILTRES_ACCUEIL.includes(v as FiltreAccueil)) return v as FiltreAccueil;
  return Object.prototype.hasOwnProperty.call(FILTRES_ANCIENS, v) ? FILTRES_ANCIENS[v] : null;
}

export type CarteAccueil = {
  generation: string | null;
  chezMoi: number | null;
  prises: number;
  /** Toutes les vraies photos importées, tableau ou non (celles de la mise en vente n'ont pas de ligne). */
  photos: number;
};

/** Le coloris passe-t-il les filtres de l'accueil ? `null` = pas de filtre. */
export function passeFiltres(c: CarteAccueil, generation: Generation | null, filtre: FiltreAccueil | null): boolean {
  if (generation && c.generation !== generation) return false;
  if (filtre === "doublons") return (c.chezMoi ?? 0) >= 2;
  // « Avec vraies photos » : au moins une vraie photo importée, où qu'elle soit rangée.
  if (filtre === "photographies") return c.photos > 0;
  // « Sans vraies photos » : le complément, ce qu'il reste à photographier ou à acheter.
  if (filtre === "jamais_photographies") return c.photos === 0;
  // Les deux moitiés de « Sans vraies photos » : le sac est là (à photographier) ou non (à commander).
  if (filtre === "a_photographier_chez_toi") return c.photos === 0 && (c.chezMoi ?? 0) > 0;
  if (filtre === "a_commander") return c.photos === 0 && (c.chezMoi ?? 0) === 0;
  return true;
}

export type BilanPhotos = {
  /** Toutes les cartes données. */
  total: number;
  sans: number;
  avec: number;
  /** Sans vraies photos, sac chez toi. */
  chezToi: number;
  /** Sans vraies photos, aucun sac chez toi. */
  aCommander: number;
};

/**
 * Le gros chiffre de l'accueil et ses deux tuiles. À appeler sur TOUT le
 * catalogue : ni la génération, ni le filtre, ni la recherche n'y changent rien.
 */
export function bilanPhotos(cartes: readonly CarteAccueil[]): BilanPhotos {
  const chezToi = cartes.filter((c) => passeFiltres(c, null, "a_photographier_chez_toi")).length;
  const aCommander = cartes.filter((c) => passeFiltres(c, null, "a_commander")).length;
  const sans = chezToi + aCommander;
  return { total: cartes.length, sans, avec: cartes.length - sans, chezToi, aCommander };
}
