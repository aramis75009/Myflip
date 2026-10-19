import "server-only";
import { resoudreReglages, type ReglagesResolus } from "@/lib/settings";
import { MIMES_IMAGE, type MimeImage } from "@/lib/studioBlob";

// Génération d'image par l'API OpenRouter pour le Studio IA (serveur uniquement).
//
// Contrairement à `lib/studioVerif.ts` (qui LIT une image et rend du JSON), ce
// module PRODUIT une image, donc COÛTE de l'argent à chaque appel réussi. Tout
// le découpage en découle :
//
//  - même forme que `studioVerif` : des constructeurs et lecteurs PURS et testés
//    (`buildImagesRequest`, `readImagesResponse`, `errorFromStatus`…), et un seul
//    morceau qui touche le réseau (`genererImage`, piloté par un `fetch` injecté
//    dans les tests, sans `vi.mock`) ;
//  - la clé est celle du COMPTE, jamais celle du déploiement (`cleDuCompte`) : un
//    repli sur `OPENROUTER_API_KEY` ferait payer le propriétaire de l'application
//    pour les essais de n'importe quel compte (PRD §10) ;
//  - un coût inconnu reste `null`, jamais 0 : c'est le chiffre qui nourrit le bilan ;
//  - une image PAYÉE ne se perd pas : un type de fichier ambigu retombe sur PNG
//    plutôt que sur une erreur, et chaque erreur porte le coût facturé quand la
//    réponse le disait (`coutUsd`) ;
//  - on ne réessaie JAMAIS ce qui a pu être facturé. Seuls 429 et 503 (jamais
//    facturés) valent une seconde tentative ; un délai dépassé ou un 502/504 se
//    disent `incertain`, avec la consigne de vérifier l'activité OpenRouter ;
//  - ni la clé, ni le corps d'une requête (les images en base64) ne sont journalisés.
//
// Formes lues dans la doc OpenRouter le 19/10/2026 : `POST /images` pour les
// modèles d'image ; repli sur `chat/completions` quand l'adresse n'existe pas
// (404/405), l'image y arrivant en data URL dans `message.images`.

// ---------------------------------------------------------------------------
// Contrat
// ---------------------------------------------------------------------------

export type GenerationErrorCode =
  | "missing_key"
  | "bad_key"
  | "no_credits"
  | "securite"
  | "no_image"
  | "unreachable"
  | "incertain"
  | "unknown_model"
  | "parametres"
  | "provider"
  | "invalid_response";

export class StudioGenerationError extends Error {
  readonly code: GenerationErrorCode;
  /** Coût facturé malgré l'échec, quand la réponse le disait ; sinon null (jamais 0). */
  readonly coutUsd: number | null;

  constructor(code: GenerationErrorCode, message: string, coutUsd: number | null = null) {
    super(message);
    this.name = "StudioGenerationError";
    this.code = code;
    this.coutUsd = coutUsd;
  }
}

export type DemandeImage = {
  modele: string;
  prompt: string;
  /** Data URLs, dans l'ordre d'envoi (l'image ratée d'une correction en tête). */
  references: string[];
  /** `null` : on n'envoie pas `aspect_ratio` (le modèle ne le liste pas). */
  ratio: string | null;
};

export type ImageGeneree = {
  octets: Buffer;
  mime: MimeImage;
  /** `usage.cost` de la réponse ; null si absent. Jamais 0 par défaut. */
  coutUsd: number | null;
};

// ---------------------------------------------------------------------------
// Corps des requêtes (pur)
// ---------------------------------------------------------------------------

const imagePart = (url: string) => ({ type: "image_url", image_url: { url } });

/** Corps de `POST /images`. Pas d'`aspect_ratio` sans ratio, pas d'`input_references` sans référence. */
export function buildImagesRequest(d: DemandeImage): Record<string, unknown> {
  const body: Record<string, unknown> = { model: d.modele, prompt: d.prompt, n: 1 };
  if (d.ratio) body.aspect_ratio = d.ratio;
  if (d.references.length > 0) body.input_references = d.references.map(imagePart);
  return body;
}

/** Corps du repli `POST /chat/completions` : consigne d'abord, puis les images, dans un seul message. */
export function buildChatRequest(d: DemandeImage): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: d.modele,
    messages: [{ role: "user", content: [{ type: "text", text: d.prompt }, ...d.references.map(imagePart)] }],
    modalities: ["image", "text"],
  };
  if (d.ratio) body.image_config = { aspect_ratio: d.ratio };
  return body;
}

// ---------------------------------------------------------------------------
// Petits utilitaires (purs)
// ---------------------------------------------------------------------------

const CLE_MASQUEE = "[clé masquée]";

/** Retire de tout texte destiné à un message ou à un journal ce qui ressemble à une clé OpenRouter. */
function masquer(texte: string, cle?: string): string {
  const sansCle = cle ? texte.split(cle).join(CLE_MASQUEE) : texte;
  return sansCle.replace(/sk-or-[A-Za-z0-9_-]+/g, CLE_MASQUEE);
}

const couper = (texte: string, max: number) => (texte.length > max ? texte.slice(0, max) : texte);

/** Une réponse (200 ou non) qui parle de filtre de sécurité ou de modération. */
const SECURITE_RE = /safety|moderation|content[\s_-]*policy|blocked|prohibited/i;

/** Le message lisible d'un corps d'erreur OpenRouter (`{error:{message}}`), ou son texte brut s'il n'est pas JSON. */
function messageDuCorps(body: string): string {
  const brut = body.trim();
  if (!brut) return "";
  let json: unknown;
  try {
    json = JSON.parse(brut);
  } catch {
    return brut;
  }
  const j = json as { error?: unknown; message?: unknown } | null;
  const e = j?.error;
  const message =
    typeof e === "string" ? e : typeof (e as { message?: unknown } | null)?.message === "string" ? (e as { message: string }).message : j?.message;
  return typeof message === "string" ? message.trim() : "";
}

function lireCout(json: unknown): number | null {
  const usage = (json as { usage?: unknown } | null)?.usage;
  const cout = usage && typeof usage === "object" ? (usage as { cost?: unknown }).cost : undefined;
  return typeof cout === "number" && Number.isFinite(cout) && cout >= 0 ? cout : null;
}

const CONSIGNE_FACTURATION =
  "la génération est peut-être facturée, vérifie ton activité OpenRouter avant de relancer.";

// ---------------------------------------------------------------------------
// Erreurs HTTP (pur)
// ---------------------------------------------------------------------------

function erreurDepuisStatus(status: number, body: string, modele: string, coutUsd: number | null): StudioGenerationError {
  const corps = masquer(body);
  const detail = couper(messageDuCorps(corps), 300);
  const err = (code: GenerationErrorCode, message: string) => new StudioGenerationError(code, message, coutUsd);

  if (status === 401) return err("bad_key", "Clé OpenRouter refusée. Vérifie-la dans Mon compte.");
  if (status === 402) return err("no_credits", "Crédits OpenRouter épuisés.");
  if (status === 403) {
    return err("securite", `Le fournisseur a refusé la demande (modération).${detail ? ` ${detail}` : ""}`);
  }
  if (status === 404) {
    return err("unknown_model", modele ? `Modèle inconnu d'OpenRouter : ${modele}.` : "Modèle inconnu d'OpenRouter.");
  }
  if (status === 400 || status === 422) {
    if (SECURITE_RE.test(corps)) {
      return err("securite", `Le modèle a bloqué la demande (filtre de sécurité).${detail ? ` ${detail}` : ""}`);
    }
    return err("parametres", `Paramètres refusés par le modèle${detail ? ` : ${detail}` : "."}`);
  }
  if (status === 413) return err("parametres", "Requête trop lourde pour ce modèle : moins de références, ou plus légères.");
  // Aucune de ces réponses ne dit si le fournisseur a lancé (et facturé) la génération.
  if (status === 408 || status === 502 || status === 504) {
    return err("incertain", `Passerelle OpenRouter en erreur (${status}) : ${CONSIGNE_FACTURATION}`);
  }
  if (status === 429) return err("provider", "OpenRouter limite le nombre de demandes. Réessaie dans un instant.");
  return err("provider", `OpenRouter a répondu ${status}${detail ? ` : ${detail}` : "."}`);
}

/**
 * Traduit un statut HTTP d'échec définitif en erreur typée. `body` : le corps de
 * la réponse, tel quel (JSON `{error:{message}}` ou texte). Le coût est toujours
 * `null` : un échec HTTP n'est pas facturé, sauf ce que `incertain` laisse craindre.
 */
export function errorFromStatus(status: number, body: string, modele: string): StudioGenerationError {
  return erreurDepuisStatus(status, body, modele, null);
}

/** Une réponse 200 qui porte une erreur dans son corps (OpenRouter le fait : modèle indisponible, modération). */
function erreurDuCorps(error: unknown, coutUsd: number | null): StudioGenerationError {
  const texte = typeof error === "string" ? error : JSON.stringify(error) ?? "";
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "number" && code >= 400 && code <= 599) return erreurDepuisStatus(code, texte, "", coutUsd);
  const message = couper(messageDuCorps(masquer(texte)), 300);
  return new StudioGenerationError(
    SECURITE_RE.test(texte) ? "securite" : "provider",
    `OpenRouter${message ? ` : ${message}` : " a renvoyé une erreur."}`,
    coutUsd,
  );
}

// ---------------------------------------------------------------------------
// Lecture des réponses (pur)
// ---------------------------------------------------------------------------

/** Décode une data URL en base64. null si ce n'en est pas une, ou si elle est vide. `mime` : "" quand non déclaré. */
export function decodeDataUrl(url: string): { octets: Buffer; mime: string } | null {
  const m = /^data:([^;,]*)((?:;[^;,]*)*),([\s\S]*)$/.exec(url);
  if (!m || !/;base64$/i.test(m[2])) return null;
  const octets = Buffer.from(m[3], "base64");
  if (octets.length === 0) return null;
  return { octets, mime: m[1].trim().toLowerCase() };
}

/** Le type d'une image d'après ses premiers octets, ou null si ce n'est ni du PNG, ni du JPEG, ni du WebP. */
function typeDepuisOctets(o: Buffer): MimeImage | null {
  if (o.length >= 4 && o[0] === 0x89 && o[1] === 0x50 && o[2] === 0x4e && o[3] === 0x47) return "image/png";
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "image/jpeg";
  if (o.length >= 12 && o.toString("latin1", 0, 4) === "RIFF" && o.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

function normaliserMime(declare: string | null | undefined): string {
  const m = (declare ?? "").split(";")[0].trim().toLowerCase();
  return m === "image/jpg" ? "image/jpeg" : m;
}

/**
 * Fabrique l'image à partir d'un contenu en base64 (ou d'une data URL).
 *
 * Le type : les OCTETS d'abord (c'est la vérité du fichier), puis le type
 * déclaré, puis PNG. Un type déclaré hors JPEG/PNG/WebP, sur des octets que rien
 * n'identifie, est refusé : on ne range pas ce qu'on ne sait pas servir. Toutes
 * les erreurs d'ici gardent le coût, parce que l'image a été facturée.
 */
function construireImage(contenu: string, declare: string | null | undefined, coutUsd: number | null): ImageGeneree {
  let octets: Buffer;
  let mimeDeclare = normaliserMime(declare);
  if (/^data:/i.test(contenu)) {
    const decode = decodeDataUrl(contenu);
    octets = decode?.octets ?? Buffer.alloc(0);
    if (!mimeDeclare) mimeDeclare = normaliserMime(decode?.mime);
  } else {
    octets = Buffer.from(contenu, "base64");
  }
  if (octets.length === 0) {
    throw new StudioGenerationError("invalid_response", "Le modèle a renvoyé une image vide.", coutUsd);
  }

  const lu = typeDepuisOctets(octets);
  if (lu) return { octets, mime: lu, coutUsd };
  if (!mimeDeclare) return { octets, mime: "image/png", coutUsd };
  if ((MIMES_IMAGE as readonly string[]).includes(mimeDeclare)) return { octets, mime: mimeDeclare as MimeImage, coutUsd };
  throw new StudioGenerationError(
    "invalid_response",
    `Format d'image non pris en charge : ${couper(mimeDeclare, 40)}. Seuls JPEG, PNG et WebP sont rangés.`,
    coutUsd,
  );
}

const illisible = () =>
  new StudioGenerationError("invalid_response", `Réponse d'OpenRouter illisible : ${CONSIGNE_FACTURATION}`);

/** Lit la réponse de `POST /images`. Lève `StudioGenerationError`, avec le coût s'il est connu. */
export function readImagesResponse(json: unknown): ImageGeneree {
  if (!json || typeof json !== "object") throw illisible();
  const coutUsd = lireCout(json);
  const r = json as { error?: unknown; data?: unknown };
  if (r.error) throw erreurDuCorps(r.error, coutUsd);

  const entrees: { b64_json?: unknown; url?: unknown; media_type?: unknown }[] = Array.isArray(r.data) ? r.data : [];
  for (const e of entrees) {
    if (!e || typeof e !== "object") continue;
    const contenu =
      typeof e.b64_json === "string" && e.b64_json
        ? e.b64_json
        : typeof e.url === "string" && /^data:/i.test(e.url)
          ? e.url
          : null;
    if (contenu) return construireImage(contenu, typeof e.media_type === "string" ? e.media_type : null, coutUsd);
  }
  throw new StudioGenerationError("no_image", "Le modèle n'a renvoyé aucune image.", coutUsd);
}

/** Le texte d'un `message.content` (chaîne, ou liste de parts), sans mise en forme. */
function texteDuMessage(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((p) => (p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string" ? (p as { text: string }).text : ""))
    .join("")
    .trim();
}

/** Lit la réponse du repli `chat/completions` : l'image est une data URL dans `choices[0].message.images`. */
export function readChatResponse(json: unknown): ImageGeneree {
  if (!json || typeof json !== "object") throw illisible();
  const coutUsd = lireCout(json);
  const r = json as { error?: unknown; choices?: { message?: { content?: unknown; images?: unknown } }[] };
  if (r.error) throw erreurDuCorps(r.error, coutUsd);

  const message = r.choices?.[0]?.message;
  const images: unknown[] = Array.isArray(message?.images) ? message.images : [];
  for (const img of images) {
    const url = (img as { image_url?: { url?: unknown } } | null)?.image_url?.url;
    if (typeof url === "string" && /^data:/i.test(url)) return construireImage(url, null, coutUsd);
  }

  // Refus poli ou réponse en texte seul : on cite le début de ce que le modèle a dit,
  // c'est ce qui permet de comprendre pourquoi (logo de marque, personne réelle…).
  const texte = couper(masquer(texteDuMessage(message?.content)), 300);
  throw new StudioGenerationError(
    "no_image",
    `Le modèle n'a renvoyé aucune image.${texte ? ` Il a répondu : « ${texte} »` : ""}`,
    coutUsd,
  );
}

// ---------------------------------------------------------------------------
// Clé : celle du compte, jamais celle du déploiement
// ---------------------------------------------------------------------------

/**
 * La clé d'un jeu de réglages résolus, ou `missing_key`. Pure, donc testée.
 *
 * ⚠️ `source.openrouter` DOIT valoir « utilisateur ». Pour les annonces et la
 * vérification, `resoudreReglages` retombe sur `OPENROUTER_API_KEY` quand le
 * compte n'a pas de clé ; ici ce repli ferait payer le propriétaire du
 * déploiement pour une génération qui coûte réellement. Ne pas l'assouplir.
 */
export function cleDepuisReglages(r: {
  openrouterKey: string | null;
  source: { openrouter: ReglagesResolus["source"]["openrouter"] };
}): string {
  const cle = r.openrouterKey?.trim();
  if (r.source.openrouter !== "utilisateur" || !cle) {
    throw new StudioGenerationError("missing_key", "Clé OpenRouter manquante. Ajoute ta clé dans Mon compte.");
  }
  return cle;
}

/**
 * La clé OpenRouter du compte. Lève `missing_key` sans clé propre au compte.
 * Une lecture de réglages qui échoue n'est PAS rattrapée : ce n'est pas une
 * génération ratée, et l'appelant ne doit pas en tirer une ligne d'échec.
 */
export async function cleDuCompte(userId: string): Promise<string> {
  return cleDepuisReglages(await resoudreReglages(userId));
}

// ---------------------------------------------------------------------------
// Appel réseau (seul morceau qui touche le réseau)
// ---------------------------------------------------------------------------

const API_BASE = "https://openrouter.ai/api/v1";
/** Délai total de la génération (la route a `maxDuration = 300`). */
const DELAI_TOTAL_MS = 280_000;
const PAUSE_AVANT_NOUVEL_ESSAI_MS = 2000;
/** Erreurs réseau qui prouvent que la requête n'est jamais partie : rien n'a pu être facturé. */
const JAMAIS_ENVOYE = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const estDelaiDepasse = (err: unknown) => {
  const nom = (err as { name?: unknown } | null)?.name;
  return nom === "TimeoutError" || nom === "AbortError";
};

function erreurReseau(err: unknown, modele: string): StudioGenerationError {
  const code = (err as { cause?: { code?: unknown } } | null)?.cause?.code;
  // Le nom et le code seulement : le message d'une erreur réseau peut citer l'URL ou des en-têtes.
  console.error(
    `[studioGeneration] Appel en échec — modèle=${modele} : ${(err as { name?: unknown } | null)?.name ?? "erreur"} ${typeof code === "string" ? code : ""}`.trim(),
  );
  if (typeof code === "string" && JAMAIS_ENVOYE.includes(code)) {
    return new StudioGenerationError("unreachable", "OpenRouter injoignable. Vérifie ta connexion.");
  }
  return new StudioGenerationError(
    "incertain",
    estDelaiDepasse(err)
      ? `OpenRouter n'a pas répondu à temps : ${CONSIGNE_FACTURATION}`
      : `Connexion coupée pendant l'envoi : ${CONSIGNE_FACTURATION}`,
  );
}

type Reponse = { kind: "ok"; json: unknown } | { kind: "http"; status: number; erreur: StudioGenerationError };

async function appeler(
  fetchImpl: typeof fetch,
  chemin: string,
  corps: Record<string, unknown>,
  apiKey: string,
  modele: string,
  pauseMs: number,
  echeance: number,
): Promise<Reponse> {
  const body = JSON.stringify(corps);
  for (let tentative = 1; ; tentative++) {
    let res: Response;
    try {
      res = await fetchImpl(`${API_BASE}${chemin}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Attribution OpenRouter : identifie l'app dans le tableau de bord.
          "HTTP-Referer": "https://myflip.app",
          "X-Title": "MyFlip",
        },
        body,
        signal: AbortSignal.timeout(Math.max(1000, echeance - Date.now())),
        cache: "no-store",
      });
    } catch (err) {
      throw erreurReseau(err, modele);
    }

    if (!res.ok) {
      const detail = masquer(await res.text().catch(() => ""), apiKey);
      // 429 et 503 : refusés avant tout travail, donc jamais facturés. Seuls à valoir un nouvel essai.
      const rejouable = (res.status === 429 || res.status === 503) && tentative === 1;
      if (rejouable && echeance - Date.now() > pauseMs + 5000) {
        console.error(`[studioGeneration] ${res.status} — modèle=${modele} : nouvel essai.`);
        await sleep(pauseMs);
        continue;
      }
      // Le corps de la REQUÊTE (les images en base64) n'est jamais journalisé.
      console.error(`[studioGeneration] ${res.status} — modèle=${modele} : ${couper(messageDuCorps(detail), 300)}`);
      return { kind: "http", status: res.status, erreur: errorFromStatus(res.status, detail, modele) };
    }

    try {
      return { kind: "ok", json: await res.json() };
    } catch (err) {
      // Une réponse 200 qu'on n'a pas pu lire : la génération a eu lieu, et sans doute été facturée.
      if (estDelaiDepasse(err)) throw erreurReseau(err, modele);
      console.error(`[studioGeneration] Réponse illisible — modèle=${modele}`);
      throw illisible();
    }
  }
}

/**
 * Génère une image. `apiKey` vient de `cleDuCompte`. `fetchImpl` et `pauseMs`
 * (la pause avant l'unique nouvel essai sur 429/503) s'injectent pour les tests.
 *
 * Sur 404/405 de `/images`, repli sur `chat/completions`. Un 200 sans image n'est
 * PAS un repli : c'est un refus du modèle, et il a pu être facturé.
 */
export async function genererImage(
  d: DemandeImage,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  pauseMs: number = PAUSE_AVANT_NOUVEL_ESSAI_MS,
): Promise<ImageGeneree> {
  const echeance = Date.now() + DELAI_TOTAL_MS;

  const images = await appeler(fetchImpl, "/images", buildImagesRequest(d), apiKey, d.modele, pauseMs, echeance);
  if (images.kind === "ok") return readImagesResponse(images.json);
  if (images.status !== 404 && images.status !== 405) throw images.erreur;

  const chat = await appeler(fetchImpl, "/chat/completions", buildChatRequest(d), apiKey, d.modele, pauseMs, echeance);
  if (chat.kind === "ok") return readChatResponse(chat.json);
  throw chat.erreur;
}
