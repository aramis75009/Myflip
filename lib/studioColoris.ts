import "server-only";

/**
 * Client de GET <SACBASE_URL>/api/studio/coloris. Les SKU MyFlip (SDN1, SDN2…)
 * sont des identifiants d'unité : seul SacBase sait que SDN3 est un
 * « 5039 Black Pink ». Ne lève jamais : en cas d'échec, il rend la dernière
 * bonne réponse (« stale ») ou « off ». Les réponses sont mémorisées
 * COLORIS_TTL_MS pour ne pas appeler SacBase à chaque chargement de page.
 *
 * Calqué sur lib/myflip.server.ts de SacBase (même besoin, sens inverse).
 *
 * Variables : SACBASE_URL et SACBASE_STUDIO_TOKEN (sans le S, convention de ce
 * dépôt ; SacBase écrit SACSBASE_ de son côté).
 */

export const COLORIS_TTL_MS = 60_000;
export const COLORIS_TIMEOUT_MS = 4_000;

export interface SacbaseBag {
  sku: string;
  /** Statut SacBase tel quel ("En stock", "Photos prêtes", "Vendu"…). */
  statut: string;
  vendu: boolean;
}

export interface SacbaseColoris {
  /** "5039-black-pink" : identifiant stable, clé de StudioColoris. */
  cle: string;
  modele: string;
  coloris: string;
  /** Vignette du catalogue SacBase : un repère d'affichage, jamais une référence de génération. */
  image: string;
  sacs: SacbaseBag[];
  /** Sacs invendus physiquement à Paris, donc photographiables aujourd'hui. */
  chezMoi: number;
  /** Génération du modèle (« V1 », « V2 », « V3 »), null si SacBase ne la donne pas. */
  generation: string | null;
}

export interface SacbaseCatalogue {
  /** Instant ISO de la réponse SacBase. */
  genere: string;
  coloris: SacbaseColoris[];
  /** Éléments du catalogue que SacBase a écartés faute de clé exploitable (diagnostic seulement). */
  ecartes: string[];
}

/** Ce que le client rend à la page : données fraîches, dernière bonne réponse après un échec, ou rien. */
export type SacbaseColorisSource =
  | { kind: "live"; data: SacbaseCatalogue; fetchedAt: number }
  | { kind: "stale"; data: SacbaseCatalogue; fetchedAt: number; error: string }
  | { kind: "off"; reason: "non-configure" | "injoignable"; error: string | null };

export interface SacbaseConfig {
  /** URL de base sans « / » final. */
  url: string;
  token: string;
}

// trim : un retour à la ligne collé dans une variable Vercel rendrait l'en-tête
// Authorization invalide, et l'échec ressemblerait à une panne réseau.
const readEnv = (name: string): string | undefined => {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
};

/** Connexion à SacBase, ou null si non configurée. https exigé, sauf sur un hôte local (dev). */
export function getSacbaseConfig(): SacbaseConfig | null {
  const url = readEnv("SACBASE_URL");
  const token = readEnv("SACBASE_STUDIO_TOKEN");
  if (!url || !token) return null;
  const base = url.replace(/\/+$/, "");
  const local = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(base);
  if (!base.startsWith("https://") && !local) return null;
  return { url: base, token };
}

const CLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_RE = /^[A-Z]{2,5}\d+$/;
const ISO_TS_RE = /^\d{4}-\d{2}-\d{2}T/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * Validation stricte : TOUTE entrée malformée rejette la réponse entière (le
 * client retombe alors sur la dernière bonne réponse). Les champs inconnus sont
 * ignorés. Un SKU ou une clé en double rend la table sku → cle ambiguë : rejet.
 */
export function parseColorisCatalogue(v: unknown): SacbaseCatalogue | null {
  if (!isObj(v) || !Array.isArray(v.coloris)) return null;
  if (typeof v.genere !== "string" || !ISO_TS_RE.test(v.genere) || !Number.isFinite(Date.parse(v.genere))) return null;

  // Absent toléré (diagnostic seulement, la spec §4 ne le montre pas) ; présent, il doit être correct.
  const ecartes = v.ecartes ?? [];
  if (!Array.isArray(ecartes) || !ecartes.every((e): e is string => typeof e === "string")) return null;

  const cles = new Set<string>();
  const skus = new Set<string>();
  const coloris: SacbaseColoris[] = [];
  for (const c of v.coloris) {
    if (!isObj(c) || typeof c.cle !== "string" || !CLE_RE.test(c.cle) || cles.has(c.cle)) return null;
    if (typeof c.modele !== "string" || typeof c.coloris !== "string" || typeof c.image !== "string") return null;
    if (!Array.isArray(c.sacs)) return null;

    const sacs: SacbaseBag[] = [];
    for (const s of c.sacs) {
      if (!isObj(s) || typeof s.sku !== "string" || !SKU_RE.test(s.sku) || skus.has(s.sku)) return null;
      if (typeof s.statut !== "string" || s.statut === "" || typeof s.vendu !== "boolean") return null;
      skus.add(s.sku);
      sacs.push({ sku: s.sku, statut: s.statut, vendu: s.vendu });
    }
    if (!isCount(c.chezMoi) || c.chezMoi > sacs.length) return null;
    // Absente toléré (SacBase d'avant le 20/10) ; présente, une chaîne. "" = inconnue.
    if (c.generation !== undefined && c.generation !== null && typeof c.generation !== "string") return null;
    const generation = typeof c.generation === "string" && c.generation.trim() ? c.generation.trim() : null;

    cles.add(c.cle);
    coloris.push({ cle: c.cle, modele: c.modele, coloris: c.coloris, image: c.image, sacs, chezMoi: c.chezMoi, generation });
  }

  return { genere: v.genere, coloris, ecartes };
}

let lastGood: { data: SacbaseCatalogue; fetchedAt: number } | null = null;
let inflight: Promise<SacbaseColorisSource> | null = null;

/** Hook de test : oublie la réponse mémorisée. */
export function resetColorisCache(): void {
  lastGood = null;
  inflight = null;
}

export async function getColoris(opts: { now?: number; fetchImpl?: typeof fetch } = {}): Promise<SacbaseColorisSource> {
  const cfg = getSacbaseConfig();
  if (!cfg) return { kind: "off", reason: "non-configure", error: null };
  const now = opts.now ?? Date.now();
  if (lastGood && now - lastGood.fetchedAt < COLORIS_TTL_MS) return { kind: "live", ...lastGood };
  // Les appels concurrents partagent une seule requête.
  inflight ??= fetchOnce(cfg, now, opts.fetchImpl ?? fetch).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function fetchOnce(cfg: SacbaseConfig, now: number, fetchImpl: typeof fetch): Promise<SacbaseColorisSource> {
  let error: string;
  try {
    const res = await fetchImpl(cfg.url + "/api/studio/coloris", {
      headers: { Authorization: "Bearer " + cfg.token, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(COLORIS_TIMEOUT_MS),
    });
    if (res.ok) {
      // Le signal couvre aussi la lecture du corps : un délai dépassé ici passe par le catch.
      const data = parseColorisCatalogue(await res.json());
      if (data) {
        lastGood = { data, fetchedAt: now };
        return { kind: "live", data, fetchedAt: now };
      }
      error = "réponse invalide";
    } else {
      // 503 = SacBase non configuré, 401 = jeton refusé.
      error = "HTTP " + res.status;
    }
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    error = name === "TimeoutError" || name === "AbortError" ? "délai dépassé" : name === "SyntaxError" ? "réponse invalide" : "réseau";
  }
  // Ne jamais journaliser cfg.token ni e.message : seul `error`, une valeur fermée, sort d'ici.
  console.error("[studio] SacBase coloris sync failed: " + error);
  return lastGood ? { kind: "stale", ...lastGood, error } : { kind: "off", reason: "injoignable", error };
}

/**
 * Table sku → cle. Reconstruite à chaque appel, jamais stockée : le catalogue
 * SacBase est la seule source, et un SKU peut changer de coloris à son
 * prochain export.
 */
export function buildSkuIndex(catalogue: SacbaseCatalogue): Map<string, string> {
  const index = new Map<string, string>();
  for (const c of catalogue.coloris) for (const s of c.sacs) index.set(s.sku, c.cle);
  return index;
}

/**
 * Clé de coloris d'un SKU. `cle` est null si SacBase est injoignable (`kind`
 * "off") ou si le SKU lui est inconnu : dans les deux cas la photo reste « non
 * rattachée » et sera rattachée au prochain passage. Pour résoudre plusieurs
 * SKU d'un coup, préférer getColoris + buildSkuIndex (un seul appel réseau).
 */
export async function resolveSkuToCle(
  sku: string,
  opts: { now?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ cle: string | null; kind: SacbaseColorisSource["kind"] }> {
  const source = await getColoris(opts);
  if (source.kind === "off") return { cle: null, kind: "off" };
  return { cle: buildSkuIndex(source.data).get(sku) ?? null, kind: source.kind };
}

// ── Vignettes ───────────────────────────────────────────────────────────────

/** Chemin de vignette SacBase acceptable : sous /img/, sans remontée ni requête. */
const VIGNETTE_RE = /^\/img\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i;
export const estCheminVignette = (p: string) => VIGNETTE_RE.test(p) && !p.includes("..");

/**
 * La vignette d'un coloris, lue chez SacBase avec le jeton du Studio : SacBase
 * protège /img derrière sa session, et le jeton ne doit jamais partir au
 * navigateur. Le chemin vient du catalogue (jamais du client) et doit être un
 * /img/… Rend null si SacBase est injoignable, la clé inconnue ou l'image absente.
 */
export async function lireVignette(
  cle: string,
  opts: { now?: number; fetchImpl?: typeof fetch } = {},
): Promise<{ octets: ArrayBuffer; contentType: string } | null> {
  const cfg = getSacbaseConfig();
  if (!cfg) return null;
  const source = await getColoris(opts);
  if (source.kind === "off") return null;
  const chemin = source.data.coloris.find((c) => c.cle === cle)?.image ?? "";
  if (!estCheminVignette(chemin)) return null;
  try {
    const res = await (opts.fetchImpl ?? fetch)(cfg.url + chemin, {
      headers: { Authorization: "Bearer " + cfg.token },
      cache: "no-store",
      signal: AbortSignal.timeout(COLORIS_TIMEOUT_MS),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) return null;
    return { octets: await res.arrayBuffer(), contentType: type };
  } catch {
    return null;
  }
}
