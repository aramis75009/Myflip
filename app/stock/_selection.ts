/**
 * Bulk selection of the Stock (ST-2, decision of 21/10: the bulk action only
 * applies to the rows the filters show; hidden selected rows are counted,
 * never written).
 */
import { STATUT_VENDU } from "@/lib/calc";
import { pluriel } from "@/lib/format";
import type { ArticleDTO } from "@/lib/types";

/**
 * What « Appliquer » targets: the selected rows that are visible (in display
 * order), how many selected rows the filters hide, and how many targeted
 * rows are sold (they would lose their sale data).
 */
export function cibleSelection(
  selection: ReadonlySet<string>,
  visibles: readonly Pick<ArticleDTO, "id" | "statut">[],
): { ids: string[]; masques: number; vendus: number } {
  const ids: string[] = [];
  let vendus = 0;
  for (const a of visibles) {
    if (!selection.has(a.id)) continue;
    ids.push(a.id);
    if (a.statut === STATUT_VENDU) vendus += 1;
  }
  return { ids, masques: selection.size - ids.length, vendus };
}

/** « 3 sélectionnés, dont 2 masqués par les filtres » (the tail only when some are hidden). */
export function libelleSelection(total: number, masques: number): string {
  const base = pluriel(total, "sélectionné", "sélectionnés");
  return masques > 0 ? `${base}, dont ${pluriel(masques, "masqué", "masqués")} par les filtres` : base;
}
