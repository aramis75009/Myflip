/**
 * Routes parcourues par les sondes globales (e2e/sondes/globales.ts), la base
 * d'accessibilité (e2e/a11y.spec.ts) et la sonde X8 : le catalogue COMMUN de la
 * suite, e2e/catalogue-routes.ts (routes publiques et compte `demo`, puis les
 * écrans à état vide du compte `neuf`), avec ses identifiants stables, ses
 * variantes d'URL et ses conditions d'attente (`attente`).
 *
 * Ce fichier ne fait que l'adapter : une route de sonde = une entrée du
 * catalogue. Quand le catalogue gagne une entrée, les sondes la mesurent sans
 * autre changement.
 *
 * `variante` est l'identifiant de capture de l'entrée (`route.<id>` ou
 * `route.neuf.<id>`) : il départage deux routes de même chemin (stock du compte
 * demo et du compte neuf, CGU connecté ou non) dans sondes.json et a11y.json.
 */
import { idCapture, ROUTES, ROUTES_NEUF, type EntreeRoute } from "../catalogue-routes";

export type RouteSonde = {
  /** Identifiant de capture de l'entrée du catalogue : `route.<id>` ou `route.neuf.<id>`. */
  variante: string;
  chemin: string;
  compte: EntreeRoute["compte"];
  entree: EntreeRoute;
};

export const ROUTES_SONDES: readonly RouteSonde[] = [...ROUTES, ...ROUTES_NEUF].map((entree) => ({
  variante: idCapture(entree),
  chemin: entree.chemin,
  compte: entree.compte,
  entree,
}));

/** Étiquette lisible d'une route : « /stock?statut=Brouillon [route.stock.statut-brouillon] ». */
export const etiquette = (r: RouteSonde): string => `${r.chemin} [${r.variante}]`;
