/**
 * Réponses simulées dans le navigateur (page.route), pour montrer les états de
 * chargement, d'erreur ou de succès sans appeler le vrai serveur ni une API
 * externe. À enregistrer APRÈS `bloquerEcritures` : la route la plus récente
 * passe en premier.
 */
import type { Page, Request, Route } from "@playwright/test";

import { ignorerRequete, reprendreRequete } from "./calme";

export type FiltreRequete = { chemin: string | RegExp; methode?: string };

const cheminCorrespond = (filtre: FiltreRequete, url: URL): boolean =>
  typeof filtre.chemin === "string" ? url.pathname === filtre.chemin : filtre.chemin.test(url.pathname);

function correspond(filtre: FiltreRequete, requete: Request): boolean {
  return cheminCorrespond(filtre, new URL(requete.url())) && (!filtre.methode || requete.method() === filtre.methode);
}

/** Réponse JSON simulée pour toute requête qui correspond au filtre. */
export async function simulerJson(page: Page, filtre: FiltreRequete, statut: number, corps: unknown): Promise<{ appels: number }> {
  const compteur = { appels: 0 };
  await page.route(
    (url) => cheminCorrespond(filtre, url),
    async (route) => {
      if (!correspond(filtre, route.request())) return route.fallback();
      compteur.appels += 1;
      await route.fulfill({ status: statut, contentType: "application/json", body: JSON.stringify(corps) });
    },
  );
  return compteur;
}

export type Retenue = {
  /** Résolue dès qu'une requête correspondante est retenue. */
  vue: Promise<void>;
  /** Relâche toutes les requêtes retenues (et les suivantes) avec cette action. */
  liberer: (action?: (route: Route) => Promise<void>) => void;
};

/**
 * Retient les requêtes correspondantes jusqu'à `liberer()` : l'écran reste
 * dans son état « chargement » le temps de la capture. Par défaut, la
 * libération laisse passer la requête vers le serveur (route.fallback).
 * Toujours libérer avant la fin du test.
 */
export async function retenir(page: Page, filtre: FiltreRequete): Promise<Retenue> {
  let signalerVue!: () => void;
  const vue = new Promise<void>((r) => (signalerVue = r));
  let fixerAction!: (a: (route: Route) => Promise<void>) => void;
  const action = new Promise<(route: Route) => Promise<void>>((r) => (fixerAction = r));
  await page.route(
    (url) => cheminCorrespond(filtre, url),
    async (route) => {
      if (!correspond(filtre, route.request())) return route.fallback();
      // Retenue exprès : ce n'est pas de l'activité réseau pour le calme (calme.ts).
      ignorerRequete(page, route.request());
      signalerVue();
      const faire = await action;
      reprendreRequete(page, route.request());
      await faire(route);
    },
  );
  return {
    vue,
    liberer: (a = (route) => route.fallback()) => fixerAction(a),
  };
}

/** Action de libération : réponse JSON simulée. */
export const repondreJson =
  (statut: number, corps: unknown) =>
  (route: Route): Promise<void> =>
    route.fulfill({ status: statut, contentType: "application/json", body: JSON.stringify(corps) });
