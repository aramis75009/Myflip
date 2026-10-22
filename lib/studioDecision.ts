// Changer la décision d'un essai : ce qui est permis, et pourquoi ce qui ne l'est
// pas. PUR et ISOMORPHE : la route (PATCH /api/studio/essais/[id]) lit les
// essais de la case et passe les lignes ici ; l'écran reçoit le même verdict
// dans l'historique (`peutAnnuler`, `peutValider`) pour griser un bouton avec
// sa raison.
//
// Une CASE (vraie photo × prompt d'angle d'un coloris) ne porte qu'une image
// vivante à la fois : un rejet libère la case, un essai non rejeté la verrouille
// (lib/studioCases.ts). Annuler une décision ne doit jamais casser cet invariant :
//
//  - un rejet dont l'image a été PURGÉE du Blob ne se rattrape pas : il n'y a
//    plus d'image à juger ni à valider ;
//  - remettre un essai rejeté à juger, ou le valider, reprend la case : si une
//    autre image la tient déjà (à juger ou validée), c'est refusé, avec les
//    identifiants des essais en cause pour que l'écran propose la suite ;
//  - une case ne porte qu'UNE image validée : l'annonce ne prend qu'une image par
//    prise (« on en valide une, ou aucune »).
//
// Seules les décisions d'Aramis alimentent les statistiques : ces garde-fous
// n'écrivent rien, ils disent seulement oui ou non.

import type { Decision } from "./studioFiche";

/** L'essai dont on change la décision. `purge` : son image a été effacée du Blob (`urlImage` vide). */
export type EssaiADecider = { id: string; decision: string | null; purge: boolean };

/** Un autre essai de la MÊME case (même coloris, même vraie photo, même prompt d'angle). */
export type EssaiDeLaCase = { id: string; decision: string | null };

export type CodeRefusDecision = "image_purgee" | "case_reprise" | "deja_validee";

export type VerdictDecision =
  | { ok: true; /** Vrai si la décision demandée est celle qu'il a déjà : rien à écrire. */ inchange: boolean }
  | { ok: false; status: 409; code: CodeRefusDecision; message: string; /** Les essais de la case qui bloquent ; vide pour `image_purgee`. */ autresEssaiIds: string[] };

/** « Oui » ou « non, parce que » : la forme que l'historique donne à l'écran. */
export type Autorisation = { possible: true } | { possible: false; code: CodeRefusDecision | "rien_a_annuler"; message: string };

const refus = (code: CodeRefusDecision, message: string, autres: readonly EssaiDeLaCase[] = []): VerdictDecision => ({
  ok: false,
  status: 409,
  code,
  message,
  autresEssaiIds: autres.map((e) => e.id),
});

/**
 * Peut-on passer cet essai à `nouvelle` ("valide", "rejete", ou null = « à juger ») ?
 * `autres` : les AUTRES essais de la même case (jamais l'essai lui-même).
 * Dans l'ordre :
 *  1. même décision : accepté, `inchange` (idempotent) ;
 *  2. image purgée : seul le rejet existe, tout le reste est refusé ;
 *  3. valider alors qu'une autre image de la case l'est déjà : refusé ;
 *  4. reprendre la case (un rejeté qui redevient à juger ou validé) alors qu'une
 *     autre image non rejetée la tient : refusé.
 */
export function verifierChangementDecision(
  essai: EssaiADecider,
  nouvelle: Decision | null,
  autres: readonly EssaiDeLaCase[],
): VerdictDecision {
  if (nouvelle === essai.decision) return { ok: true, inchange: true };

  if (essai.purge && nouvelle !== "rejete") {
    return refus("image_purgee", "L'image de cet essai rejeté a été effacée : il ne peut plus être remis à juger ni validé.");
  }

  if (nouvelle === "valide") {
    const validees = autres.filter((e) => e.decision === "valide");
    if (validees.length > 0) {
      return refus("deja_validee", "Une autre image de cette case est déjà validée : annule sa validation d'abord.", validees);
    }
  }

  if (essai.decision === "rejete" && nouvelle !== "rejete") {
    const vivants = autres.filter((e) => e.decision !== "rejete");
    if (vivants.length > 0) {
      return refus("case_reprise", "Cette case a été reprise par une autre image : rejette-la d'abord pour revenir à celle-ci.", vivants);
    }
  }

  return { ok: true, inchange: false };
}

/** Annuler = repasser à « à juger ». Rien à annuler si l'essai n'a pas de décision. */
export function peutAnnulerDecision(essai: EssaiADecider, autres: readonly EssaiDeLaCase[]): Autorisation {
  if (essai.decision === null) return { possible: false, code: "rien_a_annuler", message: "Cet essai n'a pas encore de décision." };
  return enAutorisation(verifierChangementDecision(essai, null, autres));
}

/** Valider cet essai (« retenir cette version ») est-il possible maintenant ? Non s'il l'est déjà. */
export function peutValiderEssai(essai: EssaiADecider, autres: readonly EssaiDeLaCase[]): Autorisation {
  if (essai.decision === "valide") return { possible: false, code: "deja_validee", message: "Cette image est déjà validée." };
  return enAutorisation(verifierChangementDecision(essai, "valide", autres));
}

function enAutorisation(v: VerdictDecision): Autorisation {
  return v.ok ? { possible: true } : { possible: false, code: v.code, message: v.message };
}
