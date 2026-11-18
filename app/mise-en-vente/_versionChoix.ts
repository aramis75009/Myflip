// Mise en vente, étape 5 du PRD « Studio : retouches par lot » : le choix de la
// VERSION à publier pour un sac.
//
// CE FICHIER EST PUR : ni React, ni fetch, ni Prisma, et aucun import de
// `lib/studio*` (le cloisonnement l'interdit, cf. lib/studioCloisonnement.test.ts).
// La Mise en vente parle au Studio par des routes ; ce module ne fait que
// comprendre leur réponse et appliquer les règles du choix.
//
// ── Les versions ──────────────────────────────────────────────────────────
//   • Version 1 : VIRTUELLE, c'est l'état actuel du sac : titre, description et
//     mots-clés de l'`Article`, images validées dans le Studio (avant le 17/11),
//     SKU du sac. Jamais stockée.
//   • Versions 2, 3… : lignes `StudioVersion` créées dans le Studio (photos
//     retouchées, titre, tirets, mots-clés, SKU d'annonce saisi).
//
// ── Règles ────────────────────────────────────────────────────────────────
//   1. Un sac SANS version enregistrée n'a pas de menu : la Mise en vente se
//      comporte exactement comme avant (l'IA rédige, toutes les images validées
//      sont ajoutées).
//   2. Un sac avec au moins une version a un menu « Version ». Par défaut : la
//      Version 1 (le comportement actuel), sauf choix mémorisé.
//   3. L'IA ne rédige QUE si la version choisie n'a aucun texte. Une version qui
//      a un texte n'est jamais réécrite : ce texte est celui de l'annonce.
//   4. La version choisie apporte ses photos (à la place de « toutes les images
//      validées »), son titre, sa description en trois parties (tirets,
//      mots-clés, SKU) et son SKU.

import type { ArticleEnCours } from "./_reducer";

/** Une photo d'une version : `ref` = vraie photo ou copie retouchée, `essai` = image validée du Studio. */
export type PhotoStudio = { type: "ref" | "essai"; id: string; ordre: number };

/** Une version telle que la Mise en vente la manipule (la Version 1 comprise). */
export type VersionMev = {
  numero: number;
  titre: string;
  /** Les tirets. */
  description: string;
  /** Une chaîne séparée par des virgules. */
  motsCles: string;
  /** SKU de l'annonce. null = pas renseigné : c'est alors le SKU du sac. */
  skuAnnonce: string | null;
  photos: PhotoStudio[];
};

/** Ce que le Studio sait d'un sac : ses images validées (Version 1) et ses versions enregistrées (2, 3…). */
export type StudioDuSac = { images: PhotoStudio[]; versions: VersionMev[] };

export const STUDIO_VIDE: StudioDuSac = { images: [], versions: [] };

export type TexteAnnonce = { titre: string; description: string; motsCles: string };

const texte = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Lit la réponse de `GET /api/studio/annonce?sku=`. Tolérante : tout ce qui
 * n'est pas du bon type est écarté, une réponse illisible donne un Studio vide
 * (donc le comportement d'avant, jamais une erreur).
 */
export function lireReponseStudio(json: unknown): StudioDuSac {
  if (!json || typeof json !== "object") return STUDIO_VIDE;
  const j = json as { images?: unknown; versions?: unknown };

  const images: PhotoStudio[] = (Array.isArray(j.images) ? j.images : []).flatMap((i): PhotoStudio[] => {
    const e = i as { essaiId?: unknown; ordre?: unknown } | null;
    return e && typeof e.essaiId === "string" && typeof e.ordre === "number" ? [{ type: "essai", id: e.essaiId, ordre: e.ordre }] : [];
  });

  const versions: VersionMev[] = (Array.isArray(j.versions) ? j.versions : []).flatMap((x): VersionMev[] => {
    const v = x as { numero?: unknown; titre?: unknown; description?: unknown; motsCles?: unknown; skuAnnonce?: unknown; photos?: unknown } | null;
    // La 1 est virtuelle : une ligne qui porterait ce numéro serait une erreur du serveur.
    if (!v || typeof v.numero !== "number" || !Number.isInteger(v.numero) || v.numero < 2) return [];
    const photos = (Array.isArray(v.photos) ? v.photos : []).flatMap((p, i): PhotoStudio[] => {
      const r = p as { id?: unknown; ordre?: unknown } | null;
      return r && typeof r.id === "string" ? [{ type: "ref", id: r.id, ordre: typeof r.ordre === "number" ? r.ordre : i + 1 }] : [];
    });
    const sku = texte(v.skuAnnonce).trim();
    return [{ numero: v.numero, titre: texte(v.titre), description: texte(v.description), motsCles: texte(v.motsCles), skuAnnonce: sku || null, photos }];
  });

  return { images, versions: versions.sort((a, b) => a.numero - b.numero) };
}

/** Une version a-t-elle un texte ? Dès qu'une des trois parties est remplie, oui : elle n'est jamais réécrite. */
export const aUnTexte = (t: { titre?: string | null; description?: string | null; motsCles?: string | null }): boolean =>
  [t.titre, t.description, t.motsCles].some((p) => (p ?? "").trim() !== "");

type Source = Pick<ArticleEnCours, "article" | "studio" | "version">;

/** La Version 1 : l'état actuel de l'annonce du sac, relu de l'`Article`. */
export function versionUn(source: Pick<Source, "article" | "studio">): VersionMev | null {
  if (!source.article) return null;
  return {
    numero: 1,
    titre: source.article.titreAnnonce ?? "",
    description: source.article.descriptionAnnonce ?? "",
    motsCles: source.article.motsClesAnnonce ?? "",
    skuAnnonce: source.article.sku,
    photos: source.studio?.images ?? [],
  };
}

/**
 * Les versions proposées dans le menu : la 1, puis les enregistrées. VIDE (donc
 * pas de menu, comportement d'avant) tant que le sac n'a aucune version 2+.
 */
export function versionsChoisissables(source: Pick<Source, "article" | "studio">): VersionMev[] {
  const enBase = source.studio?.versions ?? [];
  const un = versionUn(source);
  return un && enBase.length > 0 ? [un, ...enBase] : [];
}

/** La version choisie ; la Version 1 si le numéro n'existe plus. null sans menu. */
export function versionChoisie(source: Source): VersionMev | null {
  const liste = versionsChoisissables(source);
  if (liste.length === 0) return null;
  return liste.find((v) => v.numero === source.version) ?? liste[0];
}

/** Le numéro à retenir au chargement : le choix mémorisé s'il existe encore, sinon la Version 1 (comportement d'avant). */
export function choixInitial(versions: readonly { numero: number }[], memorise: number | null): number {
  return memorise !== null && versions.some((v) => v.numero === memorise) ? memorise : 1;
}

/**
 * RÈGLE « l'IA ne génère que si la version choisie n'a pas de texte ».
 *
 * Rend le texte à utiliser TEL QUEL (sans appel à l'IA), ou null quand l'IA doit
 * rédiger : sac sans menu, ou version sans aucun texte. `skuAnnonce` est celui
 * de la version, à défaut le SKU du sac.
 */
export function texteSansIA(source: Source): (TexteAnnonce & { skuAnnonce: string; numero: number }) | null {
  const v = versionChoisie(source);
  if (!v || !aUnTexte(v)) return null;
  return {
    numero: v.numero,
    titre: v.titre,
    description: v.description,
    motsCles: v.motsCles,
    skuAnnonce: v.skuAnnonce?.trim() || source.article?.sku || "",
  };
}

/** Faut-il appeler l'IA pour cette fiche ? Le contraire exact de `texteSansIA`. */
export const faudraitGenerer = (source: Source): boolean => texteSansIA(source) === null;

/** Le texte d'une version, dans le format de la copie « Description + mots-clés » de Mise en vente (description, ligne vide, mots-clés, ligne vide, SKU). */
export function descriptionComplete(f: { description: string; motsCles: string }, sku: string): string {
  return `${f.description}\n\n${f.motsCles}\n\n${sku}`;
}

export const libelleVersion = (numero: number): string => (numero === 1 ? "Version 1 (actuelle)" : `Version ${numero}`);

// ── Mémoire du choix, par SKU ─────────────────────────────────────────────
// Dans le navigateur (localStorage) : aucune colonne, aucune migration. Un
// choix n'a pas à suivre Aramis d'une machine à l'autre.

export const CLE_MEMOIRE = "myflip-mev-version";

/** Lit la table sku → numéro ; tout ce qui n'est pas exactement ça est ignoré. */
export function lireMemoire(brut: string | null): Record<string, number> {
  if (!brut) return {};
  try {
    const j: unknown = JSON.parse(brut);
    if (!j || typeof j !== "object" || Array.isArray(j)) return {};
    return Object.fromEntries(Object.entries(j).filter(([, n]) => typeof n === "number" && Number.isInteger(n) && n >= 1));
  } catch {
    return {};
  }
}

/** La table après un choix : la Version 1 (le défaut) n'est pas retenue, elle efface le choix précédent. */
export function memoireApresChoix(memoire: Record<string, number>, sku: string, numero: number): Record<string, number> {
  const cle = sku.trim().toUpperCase();
  const suite = { ...memoire };
  delete suite[cle];
  if (numero !== 1) suite[cle] = numero;
  return suite;
}

export function choixMemorise(sku: string): number | null {
  try {
    return lireMemoire(window.localStorage.getItem(CLE_MEMOIRE))[sku.trim().toUpperCase()] ?? null;
  } catch {
    return null;
  }
}

export function memoriserChoix(sku: string, numero: number): void {
  try {
    const suite = memoireApresChoix(lireMemoire(window.localStorage.getItem(CLE_MEMOIRE)), sku, numero);
    if (Object.keys(suite).length === 0) window.localStorage.removeItem(CLE_MEMOIRE);
    else window.localStorage.setItem(CLE_MEMOIRE, JSON.stringify(suite));
  } catch {
    /* stockage refusé : le choix ne survivra pas, tant pis */
  }
}
