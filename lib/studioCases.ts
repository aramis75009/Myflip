// Le tableau de la fiche coloris : une ligne par vraie photo (une prise), une
// colonne par prompt d'angle, une case = photo × angle.
//
// PUR et isomorphe : ni base, ni réseau. Les écrans et les routes lui passent
// des lignes déjà lues ; c'est ce qui permet de tester les règles de
// verrouillage sans base.

/**
 * Les prises d'un sac, toujours les mêmes, dans l'ordre où on les fait. Liste
 * fixe (décision du 20/10) : 14 prises plus une libre.
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

export const MAX_PRISES = PRISES.length;

/** Nom de la prise n° `ordre` (1-indexé), « Prise n » au-delà de la liste. */
export const nomPrise = (ordre: number) => PRISES[ordre - 1] ?? `Prise ${ordre}`;

/**
 * Statuts MyFlip d'un sac encore « chez moi », sans annonce : mêmes valeurs que
 * `CHEZ_MOI_STATUTS` côté SacBase. Tout autre statut connu (En vente, Vendu,
 * À comptabiliser…) veut dire que l'annonce existe.
 */
export const STATUTS_SANS_ANNONCE: ReadonlySet<string> = new Set(["En stock", "Photos prêtes"]);

/**
 * Le texte envoyé pour une case : le prompt maître en tête, puis le prompt
 * d'angle. Dans Gemini, le maître est collé une fois par conversation ; par
 * l'API il n'y a pas de conversation, d'où sa répétition à chaque appel.
 */
export function promptVariante(maitre: string, angle: string): string {
  const m = maitre.trim();
  const a = angle.trim();
  return m ? `${m}\n\n${a}` : a;
}

// ── État d'une case ─────────────────────────────────────────────────────────

export type EssaiCase = {
  referenceId: string | null;
  angleId: string;
  decision: string | null;
  skuCible: string | null;
};

export type EtatCase =
  | { kind: "vente"; sku: string }
  | { kind: "validee"; sku: string | null }
  | { kind: "a_juger" }
  | { kind: "libre" };

/**
 * L'état d'une case, d'après ses essais NON rejetés (décision 1 du 20/10 : une
 * case rejetée sans correction redevient libre).
 *
 * - un essai validé pour un sac dont l'annonce existe → « vente » (verrouillée) ;
 * - un essai validé pour un sac encore sans annonce → « validée » ;
 * - un essai sans décision → « à juger » ;
 * - sinon → « libre ».
 *
 * `statutDe(sku)` rend le statut MyFlip du sac, null s'il est inconnu. Un SKU
 * inconnu (sac supprimé) n'est pas « en vente » : la case reste validée, donc
 * verrouillée quand même.
 */
export function etatCase(essais: readonly EssaiCase[], statutDe: (sku: string) => string | null): EtatCase {
  const vivants = essais.filter((e) => e.decision !== "rejete");
  const valides = vivants.filter((e) => e.decision === "valide");
  for (const v of valides) {
    if (!v.skuCible) continue;
    const statut = statutDe(v.skuCible);
    if (statut !== null && !STATUTS_SANS_ANNONCE.has(statut)) return { kind: "vente", sku: v.skuCible };
  }
  if (valides.length > 0) return { kind: "validee", sku: valides[0].skuCible };
  if (vivants.length > 0) return { kind: "a_juger" };
  return { kind: "libre" };
}

export const cleCase = (referenceId: string, angleId: string) => `${referenceId}:${angleId}`;

/** Les états de toutes les cases du tableau, par `cleCase`. */
export function etatsDesCases(
  lignes: readonly { id: string }[],
  angles: readonly { id: string }[],
  essais: readonly EssaiCase[],
  statutDe: (sku: string) => string | null,
): Map<string, EtatCase> {
  const parCase = new Map<string, EssaiCase[]>();
  for (const e of essais) {
    if (!e.referenceId) continue;
    const k = cleCase(e.referenceId, e.angleId);
    parCase.set(k, [...(parCase.get(k) ?? []), e]);
  }
  const out = new Map<string, EtatCase>();
  for (const l of lignes) {
    for (const a of angles) {
      const k = cleCase(l.id, a.id);
      out.set(k, etatCase(parCase.get(k) ?? [], statutDe));
    }
  }
  return out;
}

/**
 * La ligne a-t-elle déjà son image pour ce sac (validée ou à juger) ? Une photo
 * ne donne qu'une image par annonce : une ligne couverte n'a pas de choix
 * automatique.
 */
export function ligneCouverte(referenceId: string, essais: readonly EssaiCase[], skuCible: string | null): boolean {
  if (!skuCible) return false;
  return essais.some((e) => e.referenceId === referenceId && e.skuCible === skuCible && e.decision !== "rejete");
}

/**
 * Le choix automatique : pour chaque ligne non couverte, la première case libre
 * (dans l'ordre des colonnes). null = rien à choisir sur cette ligne.
 */
export function choixAutomatique(
  lignes: readonly { id: string }[],
  angles: readonly { id: string }[],
  etats: ReadonlyMap<string, EtatCase>,
  essais: readonly EssaiCase[],
  skuCible: string | null,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const l of lignes) {
    if (ligneCouverte(l.id, essais, skuCible)) {
      out.set(l.id, null);
      continue;
    }
    const libre = angles.find((a) => etats.get(cleCase(l.id, a.id))?.kind === "libre");
    out.set(l.id, libre?.id ?? null);
  }
  return out;
}

/** La case peut-elle être générée (ni prise, ni à juger, ni validée) ? */
export const caseLibre = (e: EtatCase | undefined) => e?.kind === "libre";

// ── Sac cible ───────────────────────────────────────────────────────────────

export type SacCatalogue = { sku: string; statut: string; vendu: boolean };

/**
 * Les sacs qui peuvent recevoir des images : ceux encore sans annonce. Le
 * statut MyFlip, s'il est connu, l'emporte sur celui relayé par SacBase.
 */
export function sacsCibles(sacs: readonly SacCatalogue[], statutDe: (sku: string) => string | null): string[] {
  return sacs
    .filter((s) => {
      const statut = statutDe(s.sku) ?? s.statut;
      return !s.vendu && STATUTS_SANS_ANNONCE.has(statut);
    })
    .map((s) => s.sku)
    .sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
}

// ── Utilisation d'un prompt d'angle ─────────────────────────────────────────

export type UsageAngle = { cases: number; skus: string[] };

/**
 * Cases prises par un angle, tous coloris confondus : une case avec au moins
 * un essai non rejeté. C'est ce qui interdit de supprimer ou de réécrire
 * l'angle (décision 2 du 20/10 : une modification crée une nouvelle version).
 */
export function usageAngles(essais: readonly (EssaiCase & { colorisId?: string })[]): Map<string, UsageAngle> {
  const cases = new Map<string, Set<string>>();
  const skus = new Map<string, Set<string>>();
  for (const e of essais) {
    if (e.decision === "rejete") continue;
    const k = `${e.colorisId ?? ""}:${e.referenceId ?? "∅"}`;
    cases.set(e.angleId, (cases.get(e.angleId) ?? new Set()).add(k));
    if (e.skuCible && e.decision === "valide") skus.set(e.angleId, (skus.get(e.angleId) ?? new Set()).add(e.skuCible));
  }
  const out = new Map<string, UsageAngle>();
  for (const [angleId, c] of cases) {
    out.set(angleId, {
      cases: c.size,
      skus: [...(skus.get(angleId) ?? [])].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })),
    });
  }
  return out;
}

// ── Accueil ─────────────────────────────────────────────────────────────────

export const GENERATIONS = ["V1", "V2", "V3"] as const;
export type Generation = (typeof GENERATIONS)[number];
export const estGeneration = (v: unknown): v is Generation => GENERATIONS.includes(v as Generation);

export const FILTRES_ACCUEIL = ["doublons", "a_juger", "a_photographier"] as const;
export type FiltreAccueil = (typeof FILTRES_ACCUEIL)[number];

export type CarteAccueil = {
  generation: string | null;
  chezMoi: number | null;
  prises: number;
  aJuger: number;
};

/** Le coloris passe-t-il les filtres de l'accueil ? `null` = pas de filtre. */
export function passeFiltres(c: CarteAccueil, generation: Generation | null, filtre: FiltreAccueil | null): boolean {
  if (generation && c.generation !== generation) return false;
  if (filtre === "doublons") return (c.chezMoi ?? 0) >= 2;
  if (filtre === "a_juger") return c.aJuger > 0;
  if (filtre === "a_photographier") return (c.chezMoi ?? 0) > 0 && c.prises === 0;
  return true;
}
