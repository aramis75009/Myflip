/**
 * Accès des tests aux faux serveurs (e2e/mocks/*.mjs) : compteur et liste des
 * appels reçus, état simulé (panne SacBase), remise à zéro.
 *
 * ⚠️ Le serveur Next garde en mémoire le catalogue OpenRouter 10 min et SacBase
 * 60 s : changer l'état d'un faux serveur ne se voit qu'après expiration, ou
 * au lancement suivant.
 */
import type { APIRequestContext } from "@playwright/test";

import { PORTS } from "./environnement";

export type NomFaux = "openrouter" | "sacbase" | "resend";

export type AppelFaux = {
  n: number;
  quand: string;
  methode: string;
  chemin: string;
  bearer: boolean;
  statut: number;
  type?: string;
  modele?: string;
  [cle: string]: unknown;
};

export type EtatFaux = { nom: string; compteur: number; etat: Record<string, unknown>; appels: AppelFaux[] };

export const urlFaux = (nom: NomFaux): string => `http://127.0.0.1:${PORTS[nom]}`;

export async function appelsFaux(request: APIRequestContext, nom: NomFaux): Promise<EtatFaux> {
  const r = await request.get(`${urlFaux(nom)}/__e2e/appels`);
  if (!r.ok()) throw new Error(`Faux serveur ${nom} : /__e2e/appels a répondu ${r.status()}.`);
  return (await r.json()) as EtatFaux;
}

export async function modifierEtatFaux(request: APIRequestContext, nom: NomFaux, etat: Record<string, unknown>): Promise<void> {
  const r = await request.post(`${urlFaux(nom)}/__e2e/etat`, { data: etat });
  if (!r.ok()) throw new Error(`Faux serveur ${nom} : /__e2e/etat a répondu ${r.status()}.`);
}

export async function reinitialiserFaux(request: APIRequestContext, nom: NomFaux): Promise<void> {
  await request.post(`${urlFaux(nom)}/__e2e/reinitialiser`);
}
