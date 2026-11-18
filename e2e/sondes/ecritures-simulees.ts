/**
 * Catalogue de modèles d'image FACTICE pour les sondes du Studio, servi par
 * `page.route("**\/api/studio/modeles")` : indépendant du faux OpenRouter (dont
 * le catalogue est gardé 10 min par le serveur) et jamais lié à un vrai prix.
 * Forme : celle de GET /api/studio/modeles (app/api/studio/modeles/route.ts) avec
 * des `ModeleImage` de lib/studioModeles.ts.
 */
import type { Page, Route } from "@playwright/test";

type TarifFactice = { kind: "image"; sortieUsd: number; entreeParImageUsd: number } | { kind: "jeton" } | { kind: "inconnu" };

type ModeleFactice = {
  id: string;
  nom: string;
  description: string;
  maxReferences: number;
  minReferences: number;
  ratios: string[] | null;
  tarif: TarifFactice;
};

const modele = (id: string, nom: string, tarif: TarifFactice): ModeleFactice => ({
  id,
  nom,
  description: `Modèle factice ${nom} (sonde)`,
  maxReferences: 4,
  minReferences: 0,
  ratios: ["3:4"],
  tarif,
});

const image = (usd: number): TarifFactice => ({ kind: "image", sortieUsd: usd, entreeParImageUsd: 0 });

/** m1 à m8 : 0,003 / 0,02 / 0,039 / 0,04 / 0,067 / 0,134 $ par image, un modèle au jeton, un au tarif inconnu. */
export const MODELES_FACTICES: readonly ModeleFactice[] = [
  modele("e2e/m1", "Modèle m1", image(0.003)),
  modele("e2e/m2", "Modèle m2", image(0.02)),
  modele("e2e/m3", "Modèle m3", image(0.039)),
  modele("e2e/m4", "Modèle m4", image(0.04)),
  modele("e2e/m5", "Modèle m5", image(0.067)),
  modele("e2e/m6", "Modèle m6 (type Nano Banana Pro)", image(0.134)),
  modele("e2e/m7", "Modèle m7 (au jeton)", { kind: "jeton" }),
  modele("e2e/m8", "Modèle m8 (tarif inconnu)", { kind: "inconnu" }),
];

export type CatalogueFactice = { modeles: ModeleFactice[]; favoris: string[]; etat: { kind: "live" }; fetchedAt: string };

export const catalogueFactice = (nbModeles: number, favoris: string[]): CatalogueFactice => ({
  modeles: MODELES_FACTICES.slice(0, nbModeles).map((m) => ({ ...m })),
  favoris,
  etat: { kind: "live" },
  fetchedAt: new Date().toISOString(),
});

/** Sert `catalogue` à la place de GET /api/studio/modeles (le navigateur ne parle jamais au vrai catalogue). */
export async function servirCatalogue(page: Page, catalogue: CatalogueFactice): Promise<void> {
  await page.route("**/api/studio/modeles", async (route: Route) => {
    if (route.request().method() !== "GET") {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(catalogue) });
  });
}

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
