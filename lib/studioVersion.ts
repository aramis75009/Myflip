// Versions d'un sac (PRD 2026-11-16, §2 et §8) : les règles, sans base ni
// réseau. PUR et isomorphe : l'écran Versions, la route et les tests lisent
// les mêmes fonctions.

import type { Retouche } from "./studioRetouche";

/** Une photo d'une version, servie par /api/studio/image (`ref` = une ligne StudioReference, `essai` = une image validée). */
export type PhotoVersion = { type: "ref" | "essai"; id: string };

/** Une version telle que l'écran la manipule (Version 1 comprise, qui n'est pas en base). */
export type VersionAffichee = {
  /** null pour la Version 1 (virtuelle). */
  id: string | null;
  numero: number;
  titre: string;
  /** Les tirets : lecture seule, jamais modifiés. */
  description: string;
  motsCles: string;
  /** Version 1 : le SKU du sac (non modifiable ici) ; sinon le SKU d'annonce saisi par Aramis. */
  skuAnnonce: string | null;
  photos: PhotoVersion[];
  /** Les réglages de retouche de chaque photo (`ligneReglages`). Absent pour la Version 1 : ce sont les images de l'annonce actuelle. */
  retouches?: (Retouche | null)[];
};

/** Une version enregistrée (2, 3…), telle que la route la renvoie et que la fiche la charge. */
export type VersionEnBase = {
  id: string;
  numero: number;
  skuSource: string | null;
  titre: string;
  description: string;
  motsCles: string;
  skuAnnonce: string | null;
  /** ISO 8601. */
  createdAt: string;
  /** Les lignes StudioReference des photos, dans l'ordre. */
  photos: string[];
  /**
   * Les réglages de retouche de chaque photo, dans le même ordre : ceux de la
   * copie (`StudioReference.retouche`), neutres pour une photo d'origine, null
   * si la copie ne se relit pas. Absent d'une réponse qui ne les porte pas.
   */
  retouches?: (Retouche | null)[];
};

/** La Version 1 d'un sac : l'état actuel de son annonce, relu à chaque affichage. */
export type VersionUn = {
  sku: string;
  titre: string;
  description: string;
  motsCles: string;
  /** Les images validées pour ce sac (essais), dans l'ordre des prises. */
  photos: string[];
};

/**
 * « Copier la description » (décision du 16/11) : les tirets, UNE ligne vide,
 * les mots-clés, puis le SKU sur la ligne JUSTE en dessous (un seul retour à
 * la ligne, sans ligne vide).
 *
 *   - Sac à dos Nike Elite…        ← tirets, tels quels
 *   - Expédition soignée
 *                                  ← une ligne vide
 *   sac à dos, Nike Elite, …       ← mots-clés
 *   SDN12                          ← SKU, juste en dessous
 *
 * Diffère VOLONTAIREMENT de l'export de Mise en vente (une ligne vide aussi
 * avant le SKU), qui reste tel quel. Une partie vide disparaît avec son
 * séparateur. Les tirets ne sont pas réécrits : seuls les blancs de fin sont
 * retirés (sinon la ligne vide deviendrait double).
 */
export function texteDescription({ tirets, motsCles, sku }: { tirets: string; motsCles: string; sku: string | null }): string {
  const t = tirets.replace(/\s+$/, "");
  const bas = [motsCles.trim(), (sku ?? "").trim()].filter(Boolean).join("\n");
  return [t, bas].filter(Boolean).join("\n\n");
}

/** Format d'un SKU d'annonce : lettres, chiffres et tirets, comme les SKU MyFlip (« SDN12 », « PRL-001 »). */
const SKU_RE = /^[A-Z0-9][A-Z0-9-]{0,39}$/;

/**
 * Le SKU d'annonce saisi dans la case : espaces retirés, en majuscules ; vide =
 * pas encore renseigné (null). Refusé s'il contient autre chose que des lettres,
 * des chiffres et des tirets, ou dépasse 40 caractères.
 */
export function lireSkuAnnonce(v: unknown): { ok: true; sku: string | null } | { ok: false; message: string } {
  if (v === null || v === undefined) return { ok: true, sku: null };
  if (typeof v !== "string") return { ok: false, message: "SKU illisible." };
  const sku = v.trim().toUpperCase();
  if (sku === "") return { ok: true, sku: null };
  if (!SKU_RE.test(sku)) return { ok: false, message: "SKU : lettres, chiffres et tirets seulement, 40 caractères au plus." };
  return { ok: true, sku };
}

/** Titre d'une annonce Vinted : 100 caractères au plus (la limite de `lib/metaPrompt.ts` et de `lib/ollama.ts`). */
export const TITRE_MAX = 100;
/** Garde-fous de taille : bien au-delà d'une annonce, pour refuser un collage accidentel de tout un document. */
export const DESCRIPTION_MAX = 10_000;
export const MOTS_CLES_MAX = 5_000;

/** Nombre de caractères tel que Vinted le compte : un émoji vaut un, pas deux. */
export const longueurTitre = (s: string): number => Array.from(s).length;

/**
 * Les mots-clés d'une chaîne, un par entrée : séparés par des virgules (ou des
 * retours à la ligne, qu'une saisie ou un modèle y met parfois), espaces de
 * bord retirés, entrées vides écartées.
 */
export function decouperMotsCles(s: string): string[] {
  return s
    .split(/[,\r\n]+/)
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Le format des mots-clés d'une annonce MyFlip : UNE chaîne, séparée par des virgules et une espace. */
export const normaliserMotsCles = (s: string): string => decouperMotsCles(s).join(", ");

/** Le titre d'une saisie : espaces et retours à la ligne repliés en une espace, bords retirés. */
export const normaliserTitre = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * La Version 1 est l'annonce ACTUELLE : lue dans l'`Article`, jamais en base,
 * jamais modifiée ni reformulée par le Studio. Elle n'a pas d'id (`null` sur
 * l'écran) : un appel qui vise son numéro ou n'a pas d'id est refusé.
 */
export function viseVersionUn(id: string | null | undefined): boolean {
  const v = (id ?? "").trim();
  return v === "" || v === "1";
}

/** Une ligne de `StudioVersion` ne porte jamais le numéro 1 (la première enregistrée est la 2) : si elle le portait, ce serait la Version 1. */
export const estVersionUn = (v: { numero: number }): boolean => v.numero < 2;

export const MESSAGE_VERSION_UN = "La Version 1 est l’annonce actuelle : elle ne se modifie pas ici.";

/** Les champs d'une version que la main d'Aramis modifie (le SKU a sa propre saisie, plus bas). */
export type ChampTexte = "titre" | "description" | "motsCles";

/** Ce qu'une modification écrit : UNIQUEMENT les champs présents dans le corps de la requête. */
export type ModificationVersion = { titre?: string; description?: string; motsCles?: string; skuAnnonce?: string | null };

/**
 * Lit le corps d'un `PATCH /api/studio/versions/[id]` : n'importe quel sous-
 * ensemble de `titre`, `description`, `motsCles` et `skuAnnonce`, au moins un.
 * Chaque champ présent est validé et normalisé ; chaque champ ABSENT reste
 * absent du résultat, donc intact en base (modifier le titre n'écrit jamais la
 * description, et ainsi de suite). Toute autre clé du corps est ignorée.
 *
 *   - titre : espaces repliés, 100 caractères au plus (vide accepté : pas encore de titre) ;
 *   - description (les tirets) : retours à la ligne unifiés, blancs de fin retirés, lignes conservées ;
 *   - motsCles : une chaîne séparée par des virgules ;
 *   - skuAnnonce : `lireSkuAnnonce`.
 */
export function lireModificationVersion(corps: unknown): { ok: true; donnees: ModificationVersion } | { ok: false; message: string } {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return { ok: false, message: "Corps illisible." };
  const c = corps as Record<string, unknown>;
  const a = (cle: string) => Object.prototype.hasOwnProperty.call(c, cle);
  const donnees: ModificationVersion = {};

  if (a("titre")) {
    if (typeof c.titre !== "string") return { ok: false, message: "Titre illisible." };
    const titre = normaliserTitre(c.titre);
    const n = longueurTitre(titre);
    if (n > TITRE_MAX) return { ok: false, message: `Titre trop long : ${n} caractères, ${TITRE_MAX} au maximum.` };
    donnees.titre = titre;
  }
  if (a("description")) {
    if (typeof c.description !== "string") return { ok: false, message: "Description illisible." };
    const description = c.description.replace(/\r\n?/g, "\n").replace(/\s+$/, "");
    if (description.length > DESCRIPTION_MAX) return { ok: false, message: `Description trop longue : ${DESCRIPTION_MAX} caractères au maximum.` };
    donnees.description = description;
  }
  if (a("motsCles")) {
    if (typeof c.motsCles !== "string") return { ok: false, message: "Mots-clés illisibles." };
    const motsCles = normaliserMotsCles(c.motsCles);
    if (motsCles.length > MOTS_CLES_MAX) return { ok: false, message: `Mots-clés trop longs : ${MOTS_CLES_MAX} caractères au maximum.` };
    donnees.motsCles = motsCles;
  }
  if (a("skuAnnonce")) {
    const sku = lireSkuAnnonce(c.skuAnnonce);
    if (!sku.ok) return { ok: false, message: sku.message };
    donnees.skuAnnonce = sku.sku;
  }
  if (Object.keys(donnees).length === 0) return { ok: false, message: "Corps illisible." };
  return { ok: true, donnees };
}

/**
 * L'adresse du « Télécharger les N photos » d'une version (`GET /api/studio/versions/zip`).
 * La Version 1 est celle d'un sac : elle porte son SKU. Aucun identifiant de photo
 * dans l'adresse : le serveur relit les photos de la version pour le compte.
 */
export function urlZipVersion({ cle, numero, sku }: { cle: string; numero: number; sku: string | null }): string {
  const sacs = numero === 1 && sku ? `&sku=${encodeURIComponent(sku)}` : "";
  return `/api/studio/versions/zip?cle=${encodeURIComponent(cle)}&numero=${numero}${sacs}`;
}

/** Le numéro de la prochaine version d'un coloris : la 1 est l'état actuel, la première enregistrée est la 2. */
export function prochainNumero(numeros: readonly number[]): number {
  return Math.max(1, ...numeros) + 1;
}

/**
 * Les versions à afficher après une relecture du serveur : celles du serveur
 * font foi, et une version créée à l'instant (pas encore relue) n'est pas
 * perdue. Triées par numéro.
 */
export function fusionnerVersions(locales: readonly VersionEnBase[], serveur: readonly VersionEnBase[]): VersionEnBase[] {
  const connues = new Set(serveur.map((v) => v.id));
  return [...serveur, ...locales.filter((v) => !connues.has(v.id))].sort((a, b) => a.numero - b.numero);
}

/** Les versions d'un sac, dans l'ordre : la 1 (état actuel du sac), puis les enregistrées. */
export function versionsAffichees(un: VersionUn | null, enBase: readonly VersionEnBase[]): VersionAffichee[] {
  const premiere: VersionAffichee = {
    id: null,
    numero: 1,
    titre: un?.titre ?? "",
    description: un?.description ?? "",
    motsCles: un?.motsCles ?? "",
    skuAnnonce: un?.sku ?? null,
    photos: (un?.photos ?? []).map((id) => ({ type: "essai" as const, id })),
  };
  return [
    premiere,
    ...[...enBase]
      .sort((a, b) => a.numero - b.numero)
      .map((v) => ({
        id: v.id,
        numero: v.numero,
        titre: v.titre,
        description: v.description,
        motsCles: v.motsCles,
        skuAnnonce: v.skuAnnonce,
        photos: v.photos.map((id) => ({ type: "ref" as const, id })),
        retouches: v.retouches,
      })),
  ];
}

export const nomVersion = (numero: number) => (numero === 1 ? "Version 1 (actuelle)" : `Version ${numero}`);
