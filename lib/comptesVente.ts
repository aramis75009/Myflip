// Comptes de vente — défini à UN seul endroit.
//
// Les libellés sont les vrais pseudos Vinted d'Aramis : ils s'affichent dans
// SellDialog, le Stock, la fiche de mise en vente, et sortent tels quels dans
// GET /api/sacbase/stock (SacBase les montre à l'écran). Les dupliquer, c'est
// le jour où l'un d'eux affiche encore « Vinted Second » à côté de « Enorab18 ».

import type { CompteVente } from "@/lib/types";

export const COMPTES_VENTE: ReadonlyArray<{ id: CompteVente; label: string }> = [
  { id: "VINTED_PRO", label: "Fripandtrend" },
  { id: "VINTED_SECOND", label: "Enorab18" },
  { id: "VESTIAIRE_COLLECTIVE", label: "Vestiaire Collective" },
];

export const isCompteVente = (v: unknown): v is CompteVente =>
  typeof v === "string" && COMPTES_VENTE.some((c) => c.id === v);

export const labelCompteVente = (id: CompteVente | null | undefined): string =>
  COMPTES_VENTE.find((c) => c.id === id)?.label ?? "—";

/** Compte par défaut à la comptabilisation, quand l'article n'en a aucun. */
export const COMPTE_PAR_DEFAUT: CompteVente = "VINTED_PRO";

export type PatchCompte =
  | { ok: true; change: false }
  | { ok: true; change: true; value: CompteVente | null }
  | { ok: false; error: string };

/**
 * Champ `compteVente` du PATCH d'un article.
 *
 * Absent = inchangé, `null` = effacé, valeur de l'enum = enregistrée. Tout le
 * reste est une erreur — et non un repli silencieux : un compte mal orthographié
 * par un client doit se voir, pas écraser le bon.
 */
export function parseCompteVentePatch(v: unknown): PatchCompte {
  if (v === undefined) return { ok: true, change: false };
  if (v === null) return { ok: true, change: true, value: null };
  if (isCompteVente(v)) return { ok: true, change: true, value: v };
  return { ok: false, error: "Compte de vente invalide." };
}

/**
 * Compte écrit à la validation comptable.
 *
 * Le corps l'emporte s'il porte un compte valide ; sinon on GARDE celui déjà
 * choisi sur l'article (fiche de mise en vente ou Stock). On ne retombe sur
 * VINTED_PRO que s'il n'y en a aucun — comportement d'avant l'ajout du choix.
 */
export function compteAComptabiliser(
  corps: unknown,
  existant: CompteVente | null,
): CompteVente {
  if (isCompteVente(corps)) return corps;
  return existant ?? COMPTE_PAR_DEFAUT;
}
