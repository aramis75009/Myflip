import "server-only";

import { normaliserModele, tarifDepuisEndpoints, type ModeleImage, type Tarif } from "@/lib/studioModeles";

/**
 * Lecture du catalogue des modèles d'image d'OpenRouter, avec leur tarif.
 *
 *  1. GET /api/v1/images/models (public, sans clé, 8 s) : la liste ;
 *  2. pour chaque modèle retenu par `normaliserModele`, GET
 *     /api/v1/images/models/{id}/endpoints (6 s chacun, en parallèle) : le tarif.
 *     Un échec sur un modèle ne coûte que le tarif de CE modèle (« inconnu »,
 *     donc confirmation requise) : on ne devine jamais un prix.
 *
 * Ne lève jamais. Réponse mémorisée CATALOGUE_TTL_MS ; liste vide ou erreur ⇒
 * dernière bonne réponse (« stale »), sinon « off » avec une liste vide. Un
 * résultat vide n'est jamais mis en cache.
 *
 * Calqué sur lib/studioColoris.ts (mêmes garanties, autre source). Aucune clé :
 * seuls les en-têtes d'attribution OpenRouter partent, comme dans studioVerif.
 */

export const CATALOGUE_TTL_MS = 10 * 60_000;
export const CATALOGUE_TIMEOUT_MS = 8_000;
export const ENDPOINTS_TIMEOUT_MS = 6_000;

const LISTE_URL = "https://openrouter.ai/api/v1/images/models";

const ENTETES = {
  Accept: "application/json",
  "HTTP-Referer": "https://myflip.app",
  "X-Title": "MyFlip",
};

const INCONNU: Tarif = { kind: "inconnu" };

export type EtatCatalogue = { kind: "live" } | { kind: "stale"; fetchedAt: string } | { kind: "off" };
export type Catalogue = { modeles: ModeleImage[]; fetchedAt: string | null; etat: EtatCatalogue };

let derniere: { modeles: ModeleImage[]; fetchedAt: number } | null = null;
let enCours: Promise<Catalogue> | null = null;

/** Hook de test : oublie la réponse mémorisée et la requête en cours. */
export function viderCacheCatalogue(): void {
  derniere = null;
  enCours = null;
}

const iso = (ms: number): string => new Date(ms).toISOString();

function vivant(d: { modeles: ModeleImage[]; fetchedAt: number }): Catalogue {
  return { modeles: [...d.modeles], fetchedAt: iso(d.fetchedAt), etat: { kind: "live" } };
}

/** Dernière bonne réponse (« stale »), ou rien (« off »). */
function repli(): Catalogue {
  if (!derniere) return { modeles: [], fetchedAt: null, etat: { kind: "off" } };
  const fetchedAt = iso(derniere.fetchedAt);
  return { modeles: [...derniere.modeles], fetchedAt, etat: { kind: "stale", fetchedAt } };
}

export async function getCatalogue(opts: { fetchImpl?: typeof fetch; now?: () => number; refresh?: boolean } = {}): Promise<Catalogue> {
  try {
    const now = (opts.now ?? Date.now)();
    if (!opts.refresh && derniere && now - derniere.fetchedAt < CATALOGUE_TTL_MS) return vivant(derniere);
    // Les appels concurrents partagent une seule lecture.
    enCours ??= lireCatalogue(opts.fetchImpl ?? fetch, now).finally(() => {
      enCours = null;
    });
    return await enCours;
  } catch {
    return repli();
  }
}

export async function trouverModele(id: string, opts?: Parameters<typeof getCatalogue>[0]): Promise<ModeleImage | null> {
  const { modeles } = await getCatalogue(opts);
  return modeles.find((m) => m.id === id) ?? null;
}

async function lireCatalogue(fetchImpl: typeof fetch, now: number): Promise<Catalogue> {
  let erreur: string;
  try {
    const res = await fetchImpl(LISTE_URL, {
      headers: ENTETES,
      cache: "no-store",
      signal: AbortSignal.timeout(CATALOGUE_TIMEOUT_MS),
    });
    if (!res.ok) {
      erreur = "HTTP " + res.status;
    } else {
      // Le signal couvre aussi la lecture du corps : un délai dépassé ici passe par le catch.
      const corps: unknown = await res.json();
      const bruts = typeof corps === "object" && corps !== null ? (corps as { data?: unknown }).data : undefined;
      if (Array.isArray(bruts)) {
        const modeles = await tarifer(bruts, fetchImpl);
        if (modeles.length > 0) {
          derniere = { modeles, fetchedAt: now };
          return vivant(derniere);
        }
        erreur = "aucun modèle exploitable";
      } else {
        erreur = "réponse invalide";
      }
    }
  } catch (e) {
    const nom = e instanceof Error ? e.name : "";
    erreur = nom === "TimeoutError" || nom === "AbortError" ? "délai dépassé" : nom === "SyntaxError" ? "réponse invalide" : "réseau";
  }
  // Seule `erreur`, une valeur fermée, sort d'ici : jamais le message d'une exception.
  console.error("[studio] catalogue OpenRouter indisponible : " + erreur);
  return repli();
}

/** Retient les modèles utilisables, puis lit le tarif de chacun en parallèle. Trié par nom. */
async function tarifer(bruts: unknown[], fetchImpl: typeof fetch): Promise<ModeleImage[]> {
  const vus = new Set<string>();
  const retenus: ModeleImage[] = [];
  for (const brut of bruts) {
    const m = normaliserModele(brut, INCONNU);
    if (!m || vus.has(m.id)) continue;
    vus.add(m.id);
    retenus.push(m);
  }

  const tarifs = await Promise.allSettled(retenus.map((m) => lireTarif(m.id, fetchImpl)));
  const echecs = tarifs.filter((t) => t.status === "rejected").length;
  if (echecs > 0) console.error(`[studio] catalogue OpenRouter : ${echecs} tarif(s) illisible(s), comptés « inconnu »`);

  return retenus
    .map((m, i) => {
      const t = tarifs[i];
      return { ...m, tarif: t.status === "fulfilled" ? t.value : INCONNU };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** « qwen/qwen-image » : les « / » de l'id restent des séparateurs de chemin, « : » reste lisible. */
const cheminModele = (id: string): string =>
  id
    .split("/")
    .map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ":"))
    .join("/");

/** Rejette sur une réponse non 2xx ou illisible : l'appelant en fait « inconnu ». */
async function lireTarif(id: string, fetchImpl: typeof fetch): Promise<Tarif> {
  const res = await fetchImpl(`${LISTE_URL}/${cheminModele(id)}/endpoints`, {
    headers: ENTETES,
    cache: "no-store",
    signal: AbortSignal.timeout(ENDPOINTS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return tarifDepuisEndpoints(await res.json());
}
