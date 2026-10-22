// Comparing models on one cell, and choosing again from a cell's history.
// PURE: no React, no fetch. Tested by app/studio/_comparaison.test.ts.
//
// A comparison = one launch (`lancementId`) that generated the SAME cell (real
// photo × angle prompt) with 2 or 3 models. Aramis keeps one image, or none.
//
// « Retenir cette version » (history) = two explicit calls, as agreed in
// docs/refonte/contrat-studio-api.md (question 1): reject the image that holds
// the cell, THEN validate this one. A cell carries one living image at a time
// (lib/studioDecision.ts), so the order matters.

import type { Tentative, TentativeEssai } from "@/lib/studioHistorique";

/** The fields of an essai the grouping needs (FicheClient essais fit). */
export type EssaiCompare = {
  id: string;
  referenceId: string;
  angleId: string;
  modele: string;
  lancementId: string | null;
  essaiParentId: string | null;
  createdAt: string;
};

/**
 * The images compared with `essai`: same launch, same cell, no correction,
 * among `candidats` (the screen passes the images still to judge). Returns
 * them in generation order, `essai` included, or [] when there is nothing to
 * compare (one model only, or a manual deposit without a launch).
 */
export function freresDeComparaison<E extends EssaiCompare>(essai: E, candidats: readonly E[]): E[] {
  if (!essai.lancementId || essai.essaiParentId) return [];
  const freres = candidats.filter(
    (x) =>
      x.lancementId === essai.lancementId &&
      x.referenceId === essai.referenceId &&
      x.angleId === essai.angleId &&
      !x.essaiParentId,
  );
  if (!freres.some((x) => x.id === essai.id)) freres.push(essai);
  if (new Set(freres.map((x) => x.modele)).size < 2) return [];
  return [...freres].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The decisions of a comparison: the kept image is validated, every other one
 * rejected (they lost the comparison: Aramis's choice is what feeds the rates).
 * `retenuId` null = « Aucune ne convient »: all rejected, the cell is free again.
 */
export function decisionsDeComparaison(
  freres: readonly { id: string }[],
  retenuId: string | null,
): { id: string; decision: "valide" | "rejete" }[] {
  return freres.map((f) => ({ id: f.id, decision: f.id === retenuId ? "valide" : "rejete" }));
}

export type PlanRetenir =
  | { ok: true; rejeter: string[]; valider: string }
  | { ok: false; message: string };

/**
 * « Retenir cette version » from a cell's history: the images still alive in
 * the cell (to judge or validated) are rejected first, then this one is
 * validated. Refused, with the reason, when the image is gone or already kept.
 */
export function planRetenir(tentatives: readonly Tentative[], id: string): PlanRetenir {
  const essais = tentatives.filter((t): t is TentativeEssai => t.kind === "essai");
  const cible = essais.find((e) => e.id === id);
  if (!cible) return { ok: false, message: "Cette version n’existe plus : recharge l’historique." };
  if (cible.decision === "valide") return { ok: false, message: "C’est déjà la version retenue." };
  if (cible.purgee || !cible.image) return { ok: false, message: "Son image a été effacée : elle ne peut plus être retenue." };
  const rejeter = essais.filter((e) => e.id !== id && e.decision !== "rejete").map((e) => e.id);
  return { ok: true, rejeter, valider: id };
}

/** « 18 s », « 1 min 05 », or null when the duration was not measured. */
export function libelleDuree(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return null;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}`;
}
