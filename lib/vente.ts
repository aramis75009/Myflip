/**
 * Pure logic of the single sale window (components/metier/FenetreVente.tsx),
 * shared by the Stock (« Vendu » chosen in the status select) and
 * À comptabiliser (« Valider »).
 */
import { COMPTE_PAR_DEFAUT } from "./comptesVente";
import type { ArticleDTO, CompteVente } from "./types";

export type ArticleVendable = Pick<ArticleDTO, "id" | "sku" | "prixVente" | "dateVente" | "canal" | "compteVente">;

/** Where the sale is recorded from: the Stock (PATCH) or the accounting queue (POST comptabiliser). */
export type ContexteVente = "stock" | "comptabiliser";

export const MESSAGE_PRIX_INVALIDE = "Indique un prix de vente supérieur à 0 €" as const;

/** Sale price typed in the field: a finite number strictly above 0. */
export function validerPrix(
  saisie: string,
): { ok: true; prix: number } | { ok: false; message: typeof MESSAGE_PRIX_INVALIDE } {
  const texte = saisie.trim().replace(",", ".");
  const prix = texte === "" ? Number.NaN : Number(texte);
  if (!Number.isFinite(prix) || prix <= 0) return { ok: false, message: MESSAGE_PRIX_INVALIDE };
  return { ok: true, prix };
}

/** Channels on which a selling account exists (the account field shows only for them). */
const CANAUX_AVEC_COMPTE: ReadonlySet<string> = new Set(["Vinted", "Vinted Go", "Vestiaire Collective"]);

export function compteVisible(canal: string): boolean {
  return CANAUX_AVEC_COMPTE.has(canal);
}

/**
 * Values the window opens with.
 * - date: the known sale date (« AAAA-MM-JJ », as stored), otherwise today;
 * - account: the one already chosen on the article; otherwise the default
 *   account when accounting (what the server writes anyway), nothing from
 *   the Stock (no account is sent then).
 */
export function valeursInitiales(
  article: ArticleVendable,
  contexte: ContexteVente,
  aujourdhui: string,
): { prix: string; date: string; canal: string; compte: CompteVente | null } {
  return {
    prix: article.prixVente != null ? String(article.prixVente) : "",
    date: article.dateVente ? article.dateVente.slice(0, 10) : aujourdhui,
    canal: article.canal || "Vinted",
    compte: article.compteVente ?? (contexte === "comptabiliser" ? COMPTE_PAR_DEFAUT : null),
  };
}
