// Briques communes aux routes /api/hermes : forme des erreurs et pagination.
//
// Pourquoi ce fichier : cinq routes partagent le même contrat de réponse. Un
// agent qui tourne hors du dépôt ne peut pas « lire le code pour comprendre » —
// il a besoin que toutes les routes échouent de la même façon et paginent avec
// les mêmes paramètres. Centraliser est ici une garantie d'interface, pas un
// confort d'écriture.

import { NextResponse } from "next/server";

/** Erreur au format commun à toute l'API : `{ error }`, plus un contexte libre. */
export const erreurHermes = (message: string, status = 400, extra?: object) =>
  NextResponse.json({ error: message, ...extra }, { status });

export const PAGE_DEFAUT = 100;
export const PAGE_MAX = 500;

export type Pagination = { limit: number; offset: number };

/**
 * Lit `limit` et `offset`, ou rend l'erreur à renvoyer.
 *
 * Un `limit` hors bornes est REFUSÉ et non rogné en silence : un agent qui
 * demande 5 000 lignes et en reçoit 500 croirait avoir tout lu, et manquerait
 * les 4 500 autres sans jamais l'apprendre.
 */
export function lirePagination(
  params: URLSearchParams,
): Pagination | { erreur: NextResponse } {
  const brutLimit = params.get("limit");
  const brutOffset = params.get("offset");

  let limit = PAGE_DEFAUT;
  if (brutLimit != null) {
    limit = Number(brutLimit);
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX)
      return {
        erreur: erreurHermes(
          `« limit » doit être un entier entre 1 et ${PAGE_MAX}.`,
        ),
      };
  }

  let offset = 0;
  if (brutOffset != null) {
    offset = Number(brutOffset);
    if (!Number.isInteger(offset) || offset < 0)
      return { erreur: erreurHermes("« offset » doit être un entier positif.") };
  }

  return { limit, offset };
}

/**
 * Lit un paramètre multi-valué, accepté sous deux formes équivalentes :
 * `?statut=A&statut=B` et `?statut=A,B`. Les agents génèrent l'une ou l'autre
 * selon la bibliothèque HTTP ; refuser la seconde serait une chausse-trappe.
 */
export function listeParam(params: URLSearchParams, nom: string): string[] {
  return params
    .getAll(nom)
    .flatMap((v) => v.split(","))
    .map((v) => v.trim())
    .filter(Boolean);
}
