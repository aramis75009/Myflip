/**
 * Garde d'écriture du navigateur, pour les specs de captures et d'états :
 * toute requête vers /api/** qui n'est pas une lecture (GET, HEAD, OPTIONS)
 * est INTERCEPTÉE, notée, et reçoit une réponse 503 simulée. Elle n'atteint
 * jamais le serveur : une capture ne doit rien écrire, même dans la base e2e
 * jetable, sinon l'ordre des tests changerait ce que montrent les suivants.
 *
 * Exceptions, internes à Auth.js et sans écriture métier : le POST de
 * connexion (/api/auth/callback/*), la mise à jour de session
 * (/api/auth/session) et son journal d'erreurs (/api/auth/_log). Les routes
 * de l'application rangées sous /api/auth/ (signup, forgot-password,
 * reset-password) restent bloquées.
 *
 * Une réponse simulée par le test (page.route enregistré APRÈS la garde)
 * passe avant elle : Playwright exécute les routes de la plus récente à la
 * plus ancienne. Le test vérifie ensuite que `bloquees` est vide.
 */
import type { Page } from "@playwright/test";

export type EcritureBloquee = { methode: string; chemin: string };
export type GardeEcritures = { bloquees: EcritureBloquee[] };

const LECTURES = new Set(["GET", "HEAD", "OPTIONS"]);
const AUTH_INTERNE = /^\/api\/auth\/(callback\/|session$|_log$)/;

export async function bloquerEcritures(page: Page): Promise<GardeEcritures> {
  const garde: GardeEcritures = { bloquees: [] };
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const requete = route.request();
      const url = new URL(requete.url());
      if (LECTURES.has(requete.method()) || AUTH_INTERNE.test(url.pathname)) {
        await route.fallback();
        return;
      }
      garde.bloquees.push({ methode: requete.method(), chemin: url.pathname });
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Écriture bloquée par la suite e2e (garde d'écriture)." }),
      });
    },
  );
  return garde;
}
