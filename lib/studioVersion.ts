// Versions d'un sac (PRD 2026-11-16, §2 et §8) : les règles, sans base ni
// réseau. PUR et isomorphe : l'écran Versions, la route et les tests lisent
// les mêmes fonctions.

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
      })),
  ];
}

export const nomVersion = (numero: number) => (numero === 1 ? "Version 1 (actuelle)" : `Version ${numero}`);
