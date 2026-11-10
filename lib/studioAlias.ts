import type { SacbaseCatalogue, SacbaseColoris } from "@/lib/studioColoris";

/**
 * Alias de coloris propres au STUDIO : clé SacBase source → clé gardée.
 *
 * 10/11/2026, décision d'Aramis. SacBase liste deux coloris qui sont le même
 * sac, avec le même fichier photo : « 5883 Black Gold » (SDN40 vendu, SDN60 en
 * stock) et « 5880 Black Gold » (aucun sac). Le Studio montrait deux cartes, et
 * les photos de la seconde étaient refusées comme doublons (empreinte unique
 * sur tout le compte). Dans le Studio seulement, 5883 devient 5880 : une seule
 * carte, qui reprend les sacs de 5883. SacBase et le reste de MyFlip gardent
 * les deux clés. Les lignes déjà en base sont déplacées par
 * prisma/sql/2026-11-10-studio-alias-black-gold.sql (à coller à la main).
 *
 * Un seul saut : une cible n'est jamais elle-même une source (vérifié par le test).
 * Une Map et pas un objet : une clé comme « constructor » ne doit rien trouver.
 */
export const ALIAS_COLORIS_STUDIO: ReadonlyMap<string, string> = new Map([["5883-black-gold", "5880-black-gold"]]);

/** La clé sous laquelle le Studio range ce coloris (elle-même si elle n'a pas d'alias). */
export function cleStudio(cle: string, alias: ReadonlyMap<string, string> = ALIAS_COLORIS_STUDIO): string {
  return alias.get(cle) ?? cle;
}

/** Ajoute les sacs de `source` à `cible` (déjà copiée, donc modifiable). Libellés, vignette et génération : ceux de la cible d'abord. */
function absorber(cible: SacbaseColoris, source: SacbaseColoris): void {
  cible.sacs = [...cible.sacs, ...source.sacs];
  cible.chezMoi += source.chezMoi;
  cible.generation ??= source.generation;
  if (!cible.image) cible.image = source.image;
}

/**
 * Le catalogue SacBase vu par le Studio : chaque coloris source est fusionné
 * dans sa cible (`sacs` concaténés, `chezMoi` additionné) et sa carte disparaît.
 * Si la cible manque au catalogue, la source prend la clé cible à sa place.
 * Ne modifie pas `catalogue` ; le rend tel quel s'il n'a aucune source.
 * Les SKU restent uniques : ils l'étaient sur tout le catalogue (parseColorisCatalogue).
 */
export function fusionnerAliasCatalogue(
  catalogue: SacbaseCatalogue,
  alias: ReadonlyMap<string, string> = ALIAS_COLORIS_STUDIO,
): SacbaseCatalogue {
  if (!catalogue.coloris.some((c) => alias.has(c.cle))) return catalogue;
  const presentes = new Set(catalogue.coloris.filter((c) => !alias.has(c.cle)).map((c) => c.cle));

  // 1er passage : les coloris sans alias, et les sources dont la cible manque (elles en prennent la place).
  const sortie = new Map<string, SacbaseColoris>();
  for (const c of catalogue.coloris) {
    const cle = cleStudio(c.cle, alias);
    if (cle !== c.cle && presentes.has(cle)) continue;
    const deja = sortie.get(cle);
    if (deja) absorber(deja, c);
    else sortie.set(cle, { ...c, cle, sacs: [...c.sacs] });
  }
  // 2e passage : les sources dont la cible est au catalogue, quel que soit l'ordre des deux.
  for (const c of catalogue.coloris) {
    const cle = cleStudio(c.cle, alias);
    if (cle !== c.cle && presentes.has(cle)) absorber(sortie.get(cle)!, c);
  }
  return { ...catalogue, coloris: [...sortie.values()] };
}

/**
 * Les lignes `StudioColoris` lues en base, regroupées par clé Studio : une
 * ligne source (5883) qui existe encore compte pour sa cible (5880), photos et
 * essais compris, au lieu de revenir comme carte « hors catalogue ». Libellés
 * de la ligne cible si elle existe, sinon de la première ligne du groupe.
 */
export function regrouperParCleStudio<T extends { cle: string; references: readonly unknown[]; essais: readonly unknown[] }>(
  lignes: readonly T[],
  alias: ReadonlyMap<string, string> = ALIAS_COLORIS_STUDIO,
): T[] {
  const groupes = new Map<string, T[]>();
  for (const l of lignes) {
    const cle = cleStudio(l.cle, alias);
    groupes.set(cle, [...(groupes.get(cle) ?? []), l]);
  }
  return [...groupes].map(([cle, groupe]) => {
    if (groupe.length === 1 && groupe[0].cle === cle) return groupe[0];
    const base = groupe.find((l) => l.cle === cle) ?? groupe[0];
    return {
      ...base,
      cle,
      references: groupe.flatMap((l) => [...l.references]) as unknown as T["references"],
      essais: groupe.flatMap((l) => [...l.essais]) as unknown as T["essais"],
    };
  });
}
