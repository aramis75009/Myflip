// Studio : règles des vraies photos, sans base ni réseau. Ce que les routes et
// les pages font des lignes Prisma se décide ici, là où un test peut le voir.
//
// Isomorphe : importé par les routes et les écrans. Les règles des images IA
// (numéros d'essai, avis IA, choix des photos jointes à un prompt) ont été
// retirées avec la génération le 17/11/2026.

/** Rôle d'une vraie photo, colonne `StudioReference.role`. */
export const ROLES_REFERENCE = ["face", "dos", "cote", "detail", "ouvert"] as const;
export type RoleReference = (typeof ROLES_REFERENCE)[number];

export const ORIGINES = ["mise_en_vente", "studio"] as const;
export type Origine = (typeof ORIGINES)[number];

export const estRole = (v: unknown): v is RoleReference =>
  typeof v === "string" && (ROLES_REFERENCE as readonly string[]).includes(v);

export const estOrigine = (v: unknown): v is Origine =>
  typeof v === "string" && (ORIGINES as readonly string[]).includes(v);

/**
 * Rôle suggéré par l'ordre de chargement (spec §3) : 1re photo = face, 2e =
 * dos, 3e = côté, 4e = détail, 5e = ouvert, toutes les suivantes = détail.
 */
export function roleSuggere(position: number): RoleReference {
  if (!Number.isInteger(position) || position < 0) return "detail";
  return ROLES_REFERENCE[position] ?? "detail";
}

/**
 * Photos non rattachées qu'on peut rattacher maintenant : celles dont le SKU
 * est connu du catalogue SacBase. Les autres restent en attente, sans erreur.
 */
export function planRattachement(
  orphelines: readonly { id: string; sku: string | null }[],
  index: ReadonlyMap<string, string>,
): { id: string; cle: string }[] {
  const plan: { id: string; cle: string }[] = [];
  for (const o of orphelines) {
    const cle = o.sku ? index.get(o.sku) : undefined;
    if (cle) plan.push({ id: o.id, cle });
  }
  return plan;
}

/** Filtre « doublons chez moi » de la grille (spec §4 : chezMoi ≥ 2). */
export const estDoublon = (chezMoi: number) => chezMoi >= 2;
