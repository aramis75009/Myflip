/**
 * Texts of the Stock confirmations (AlertDialog), pure so they can be tested.
 */
import { STATUT_VENDU } from "@/lib/calc";
import { eur, pluriel } from "@/lib/format";
import type { ArticleDTO } from "@/lib/types";

export type Confirmation = { titre: string; corps: string };

/**
 * ST-1: leaving « Vendu » erases the sale (price, date, margin: the server
 * resets them). Not null only in that case.
 */
export function messageQuitterVendu(
  article: Pick<ArticleDTO, "sku" | "statut" | "prixVente">,
  nouveau: string,
): Confirmation | null {
  if (article.statut !== STATUT_VENDU || nouveau === STATUT_VENDU) return null;
  const prix = article.prixVente != null ? ` (${eur(article.prixVente)})` : "";
  return {
    titre: `Annuler la vente de ${article.sku} ?`,
    corps: `Le prix de vente${prix}, la date de vente et la marge seront effacés. Cette action est définitive.`,
  };
}

/** ST-23: deleting an article. */
export function messageSuppression(article: Pick<ArticleDTO, "sku">): Confirmation {
  return {
    titre: `Supprimer ${article.sku} ?`,
    corps: "L’article et ses données de vente seront supprimés définitivement.",
  };
}

/**
 * ST-2: a bulk status change that targets sold articles. Null when none of
 * the `n` targeted articles is sold (no confirmation then).
 */
export function messageChangementGroupe(n: number, vendus: number): Confirmation | null {
  if (vendus <= 0) return null;
  return {
    titre: `Changer le statut de ${pluriel(n, "article", "articles")} ?`,
    corps:
      vendus === 1
        ? "1 article vendu perdra son prix, sa date et sa marge de vente."
        : `${pluriel(vendus, "article vendu", "articles vendus")} perdront leur prix, leur date et leur marge de vente.`,
  };
}
