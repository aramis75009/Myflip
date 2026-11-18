/**
 * Écritures simulées des sondes du Studio : une requête d'écriture est
 * enregistrée puis reçoit une réponse factice, jamais transmise au serveur.
 *
 * Le catalogue de modèles d'image factice (GET /api/studio/modeles) qui vivait
 * ici est parti avec la génération d'images IA le 17/11/2026.
 */
import type { Page, Route } from "@playwright/test";

export type RequeteEnregistree = { methode: string; url: string; corps: unknown };

/** Enregistre puis simule (200 { ok: true } ou `reponse`) les requêtes d'écriture vers `motif` ; ne les laisse jamais passer. */
export async function simulerEcriture(
  page: Page,
  motif: string | RegExp,
  journal: RequeteEnregistree[],
  reponse: { status: number; json: unknown } = { status: 200, json: { ok: true } },
): Promise<void> {
  await page.route(motif, async (route: Route) => {
    const r = route.request();
    if (r.method() === "GET" || r.method() === "HEAD") {
      await route.fallback();
      return;
    }
    let corps: unknown = null;
    try {
      corps = r.postDataJSON();
    } catch {
      corps = r.postData() ? `(${r.postDataBuffer()?.length ?? 0} octets, ${r.headers()["content-type"] ?? "type inconnu"})` : null;
    }
    journal.push({ methode: r.method(), url: new URL(r.url()).pathname, corps });
    await route.fulfill({ status: reponse.status, contentType: "application/json", body: JSON.stringify(reponse.json) });
  });
}
