// Sélection du prix de référence (pur, client + serveur) — calque exact
// de pickPrompt() (lib/promptSelect.ts), même logique de précision décroissante.
import type { PrixReferenceDTO } from "./types";

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * Choisit le prix le plus pertinent pour un article, par précision décroissante :
 * 1. marque + catégorie exactes
 * 2. marque exacte (catégorie « toutes »)
 * 3. catégorie exacte (marque « toutes »)
 * 4. prix marqué par défaut
 * Renvoie null si la liste est vide ou si rien ne correspond.
 */
export function pickPrix(
  refs: PrixReferenceDTO[],
  marque: string | null,
  categorie: string | null,
): PrixReferenceDTO | null {
  const m = norm(marque);
  const c = norm(categorie);

  const exact = refs.find(
    (r) => r.marque && r.categorie && norm(r.marque) === m && norm(r.categorie) === c,
  );
  if (exact) return exact;

  const parMarque = refs.find((r) => r.marque && !r.categorie && norm(r.marque) === m);
  if (parMarque) return parMarque;

  const parCategorie = refs.find(
    (r) => r.categorie && !r.marque && norm(r.categorie) === c,
  );
  if (parCategorie) return parCategorie;

  const defaut = refs.find((r) => r.estDefaut);
  if (defaut) return defaut;

  return null;
}
