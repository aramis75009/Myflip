// Client Anthropic pour la génération d'annonces (serveur uniquement).
//
// Troisième fournisseur IA (04/11/2026), avec la clé API Anthropic du compte.
// Même découpage qu'`lib/ollama.ts`, dont ce module est le jumeau :
//   • PUR et testé : `typeMimeImage`, `partieImageAnthropic`,
//     `construireRequeteAnthropic`, `lireReponseAnthropic`,
//     `allegerRequeteAnthropic`, `messageErreurAnthropic`,
//     `annonceAvecRelanceAnthropic` (dépendances injectées) ;
//   • RÉSEAU, non testé (convention de `vitest.config.ts`) : `posterAnthropic`,
//     `generateListingAnthropic`.
//
// Pas de SDK : `POST <base>/messages` avec `x-api-key` et `anthropic-version`
// (`lib/anthropicBase.ts`), un `fetch` suffit. `posterAnthropic` est aussi celui
// de l'assistant (`lib/anthropicChat.ts`) et du test de clé (`lib/aiTest.ts`
// n'en dépend pas : il n'a besoin que du statut).
//
// Ce qui diffère d'Ollama Cloud :
//   • les photos sont des blocs `image` en base64 (`source.type: "base64"`,
//     `media_type` obligatoire et limité à jpeg, png, gif, webp) ;
//   • le JSON structuré est garanti par `output_config.format` (schéma JSON) ;
//     on décrit TOUT DE MÊME le format dans le prompt et on lit la réponse de
//     façon tolérante, comme pour Ollama : redire ne coûte rien ;
//   • Haiku 5.5 et Sonnet 5.5 réfléchissent par défaut (réflexion adaptative) et
//     refusent `temperature` / `top_p` / `top_k` : on n'envoie aucun des trois,
//     et le niveau de réflexion se règle par `output_config.effort` ;
//   • la réponse est une liste de blocs : seuls ceux de type `text` portent
//     l'annonce, les blocs `thinking` sont ignorés.

import { enTetesAnthropic, urlAnthropic } from "@/lib/anthropicBase";
import { effortAnthropic, MODELE_ANTHROPIC_PAR_DEFAUT, type EffortAnthropic } from "@/lib/modelesIA";
import {
  annonceDepuisTexte,
  erreurDansCorps,
  ErreurReponseOllama,
  instructionsFormat,
  masquerSecret,
  SCHEMA_ANNONCE,
} from "@/lib/ollama";
import type { ImageAnnonce, ListingResult } from "@/lib/openrouter";

// ── Construction de la requête (pur) ────────────────────────────────────────

/** Les seuls types d'image qu'Anthropic accepte. */
export type TypeMimeImage = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const TYPES_IMAGE: readonly string[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

type PartTexte = { type: "text"; text: string };
type PartImage = { type: "image"; source: { type: "base64"; media_type: TypeMimeImage; data: string } };

/**
 * Type MIME à déclarer pour une photo.
 *
 * Anthropic REFUSE (400) une image dont le `media_type` ne correspond pas aux
 * octets, et tout type hors des quatre ci-dessus. Le type annoncé par le
 * navigateur est donc vérifié contre la signature du fichier (les premiers
 * caractères du base64) : la signature l'emporte. Sans signature reconnue, on
 * retient le type annoncé s'il est valide (`image/jpg` est corrigé en
 * `image/jpeg`), sinon JPEG, le format des photos de téléphone.
 */
export function typeMimeImage(img: ImageAnnonce): TypeMimeImage {
  const debut = img.data.trimStart().slice(0, 12);
  if (debut.startsWith("/9j/")) return "image/jpeg";
  if (debut.startsWith("iVBORw0KGgo")) return "image/png";
  if (debut.startsWith("R0lGOD")) return "image/gif";
  if (debut.startsWith("UklGR")) return "image/webp";

  const annonce = img.mimeType.trim().toLowerCase().replace("image/jpg", "image/jpeg");
  return TYPES_IMAGE.includes(annonce) ? (annonce as TypeMimeImage) : "image/jpeg";
}

/** Une photo, en bloc `image` base64 (Anthropic ne lit pas les images par adresse ici). */
export function partieImageAnthropic(img: ImageAnnonce): PartImage {
  return {
    type: "image",
    source: { type: "base64", media_type: typeMimeImage(img), data: img.data.trim() },
  };
}

/**
 * Marge de jetons d'une annonce.
 *
 * Les jetons de réflexion comptent dans le plafond : un titre saturé à 100
 * caractères et ~80 mots-clés sur 7 langues tiennent en 2 000 jetons environ,
 * le reste est la marge de la réflexion.
 */
const MAX_JETONS_ANNONCE = 8192;

export type SortieStructuree = {
  type: "json_schema";
  schema: typeof SCHEMA_ANNONCE;
};

export type CorpsRequeteAnthropic = {
  model: string;
  max_tokens: number;
  messages: { role: "user"; content: (PartImage | PartTexte)[] }[];
  /**
   * `format` : le JSON structuré. `effort` : absent pour un modèle hors
   * catalogue (un modèle ancien refuse le champ, cf. `allegerRequeteAnthropic`).
   */
  output_config?: { format?: SortieStructuree; effort?: EffortAnthropic };
};

/**
 * Construit le corps de l'appel : les photos, puis le prompt suivi de la
 * description du format, dans UN seul message utilisateur.
 *
 * Les photos viennent AVANT le texte : c'est l'ordre que recommande Anthropic
 * (le modèle lit mieux une consigne qui suit les images qu'elle commente).
 *
 * `correction` n'existe qu'à la relance : la raison du refus de la première
 * réponse, redite au modèle pour qu'il ne refasse pas la même erreur.
 */
export function construireRequeteAnthropic(
  prompt: string,
  images: ImageAnnonce[],
  modele: string,
  correction?: string,
): CorpsRequeteAnthropic {
  const texte = [
    prompt,
    instructionsFormat(),
    correction
      ? `Ta réponse précédente a été refusée : ${correction.replace(/\.$/, "")}. Recommence en respectant strictement le format ci-dessus.`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const effort = effortAnthropic(modele, "annonce");
  return {
    model: modele,
    max_tokens: MAX_JETONS_ANNONCE,
    messages: [
      {
        role: "user",
        content: [...images.map(partieImageAnthropic), { type: "text", text: texte }],
      },
    ],
    output_config: {
      format: { type: "json_schema", schema: SCHEMA_ANNONCE },
      ...(effort ? { effort } : {}),
    },
  };
}

// ── Lecture de la réponse (pur) ─────────────────────────────────────────────

/**
 * Une réponse reçue (HTTP 200) mais inutilisable : vide, pas du JSON, champ
 * manquant, titre trop long, tronquée. C'est la SEULE erreur qui vaut une
 * relance — une erreur du fournisseur (clé, quota, modèle) ne se règle pas en
 * redemandant.
 */
export class ErreurReponseAnthropic extends Error {}

/** Le texte d'une réponse : les blocs `text` bout à bout, la réflexion et le reste ignorés. */
export function texteDesBlocs(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((b) =>
      b && typeof b === "object" && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string"
        ? (b as { text: string }).text
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

/**
 * Extrait l'annonce d'une réponse Anthropic, tolérante : fences markdown, texte
 * autour du JSON, mots-clés en tableau (même lecture qu'Ollama Cloud).
 *
 * Lève `ErreurReponseAnthropic` pour une réponse inutilisable (relançable) et
 * une `Error` simple quand le fournisseur a répondu par une erreur dans le
 * corps ou par un refus : redemander la même chose ne changerait rien.
 */
export function lireReponseAnthropic(json: unknown): ListingResult {
  const enCorps = erreurDansCorps(json);
  if (enCorps) throw new Error(`Anthropic : ${enCorps}`);

  const reponse = json as { content?: unknown; stop_reason?: unknown } | null | undefined;
  if (reponse?.stop_reason === "refusal") {
    throw new Error("Anthropic a décliné cette demande : le modèle a refusé de rédiger l'annonce.");
  }

  try {
    return annonceDepuisTexte(texteDesBlocs(reponse?.content));
  } catch (err) {
    if (!(err instanceof ErreurReponseOllama)) throw err;
    // Une annonce coupée par la limite de jetons est invalide pour une raison
    // que la relance doit connaître.
    const coupee = reponse?.stop_reason === "max_tokens" ? " (réponse tronquée par la limite de jetons)" : "";
    throw new ErreurReponseAnthropic(err.message.replace(/\.$/, "") + coupee + ".");
  }
}

// ── Erreurs du fournisseur (pur) ────────────────────────────────────────────

/**
 * Message SÛR pour un statut HTTP d'Anthropic (0 = injoignable).
 *
 * Ne reprend jamais le corps de la réponse : il peut décrire des détails
 * internes. `detail` ne sert qu'à reconnaître le cas du crédit épuisé, que
 * l'API signale par un 400 et non par un 402. `contexte: "chat"` préfixe comme
 * les autres erreurs de l'assistant.
 */
export function messageErreurAnthropic(
  status: number,
  modele: string,
  contexte: "annonce" | "chat",
  detail = "",
): string {
  let fragment: string;
  if (status === 0) fragment = "Anthropic est injoignable";
  else if (status === 401 || status === 403) fragment = "la clé Anthropic est refusée";
  else if (status === 402 || (status === 400 && /credit balance/i.test(detail))) {
    fragment = "le crédit de ton compte Anthropic est épuisé";
  } else if (status === 404) fragment = `le modèle ${modele} est inconnu d'Anthropic`;
  else if (status === 413) fragment = "la requête est trop volumineuse pour Anthropic (photos trop lourdes ?)";
  else if (status === 429) fragment = "la limite d'usage d'Anthropic est atteinte, réessaie dans un instant";
  else if (status === 529 || status === 503) fragment = "Anthropic est surchargé, réessaie dans un instant";
  else fragment = `Anthropic a répondu ${status}`;

  if (contexte === "chat") return `Assistant indisponible : ${fragment}.`;
  return `${fragment[0].toUpperCase()}${fragment.slice(1)}.`;
}

/**
 * Si Anthropic refuse la requête à cause d'un champ facultatif, la même requête
 * SANS ce champ ; sinon `null`.
 *
 * Deux champs seulement, ceux dont le support dépend du modèle : `effort`
 * (refusé par un modèle ancien, typiquement saisi à la main) et `format` (le
 * JSON structuré). Un champ retiré à la fois : la boucle de `posterAnthropic`
 * rappelle cette fonction si un second champ pose problème, donc elle ne tourne
 * jamais plus de deux fois. Un 400 sans rapport (image refusée, crédit épuisé…)
 * ne retire rien : l'erreur remonte.
 */
export function allegerRequeteAnthropic<T extends object>(corps: T, status: number, detail: string): T | null {
  if (status !== 400 && status !== 422) return null;
  const sortie = (corps as { output_config?: { format?: unknown; effort?: unknown } }).output_config;
  if (!sortie) return null;

  const sans = (champ: "effort" | "format"): T => {
    const { [champ]: _retire, ...reste } = sortie;
    void _retire;
    const copie = { ...corps } as Record<string, unknown>;
    if (Object.keys(reste).length > 0) copie.output_config = reste;
    else delete copie.output_config;
    return copie as T;
  };

  if ("effort" in sortie && /effort/i.test(detail)) return sans("effort");
  if ("format" in sortie && /output_config\.format|json_schema|structured|schema/i.test(detail)) return sans("format");
  return null;
}

// ── Réseau ──────────────────────────────────────────────────────────────────

/**
 * Échec HTTP d'Anthropic. `status` vaut 0 quand le serveur est injoignable.
 *
 * `detail` est le corps de la réponse, clé masquée : pour les journaux et pour
 * reconnaître un cas précis, JAMAIS pour le client (cf. `messageErreurAnthropic`).
 */
export class ErreurAnthropic extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(status === 0 ? "Anthropic injoignable." : `Anthropic a répondu ${status}.`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Statuts qui valent un nouvel essai : surcharge côté fournisseur (529 = « overloaded »). */
const RETENTABLES = new Set([429, 500, 502, 503, 504, 529]);

/**
 * `POST /messages` avec la clé du compte ; renvoie le JSON de la réponse.
 * Partagé par les annonces et l'assistant.
 *
 * Réessaie sur les statuts de surcharge (3 essais, 2 s entre chaque) et retire
 * un champ facultatif refusé (`allegerRequeteAnthropic`). Lève `ErreurAnthropic`
 * pour toute autre erreur HTTP, `ErreurReponseAnthropic` si le corps n'est pas
 * du JSON. La clé n'apparaît jamais dans un journal ni dans une erreur.
 */
export async function posterAnthropic(corps: object, cle: string, etiquette: string): Promise<unknown> {
  const MAX_ESSAIS = 3;
  const modele = (corps as { model?: string }).model ?? "?";
  let courant = corps;

  for (let essai = 1; ; essai++) {
    let res: Response;
    try {
      res = await fetch(urlAnthropic("/messages"), {
        method: "POST",
        headers: enTetesAnthropic(cle),
        body: JSON.stringify(courant),
        cache: "no-store",
      });
    } catch (err) {
      // Le message seul : l'objet d'erreur complet embarque la requête.
      console.error(`[${etiquette}] Appel injoignable :`, masquerSecret(err instanceof Error ? err.message : String(err), cle));
      throw new ErreurAnthropic(0, "");
    }

    if (res.ok) {
      try {
        return await res.json();
      } catch {
        throw new ErreurReponseAnthropic("Réponse illisible d'Anthropic.");
      }
    }

    const detail = masquerSecret((await res.text().catch(() => "")).slice(0, 1000), cle);
    if (RETENTABLES.has(res.status) && essai < MAX_ESSAIS) {
      console.error(`[${etiquette}] ${res.status} (essai ${essai}/${MAX_ESSAIS}), nouvel essai dans 2 s…`);
      await sleep(2000);
      continue;
    }
    const allege = allegerRequeteAnthropic(courant, res.status, detail);
    if (allege) {
      console.error(`[${etiquette}] ${res.status} : champ facultatif refusé, nouvel essai sans lui — modèle=${modele} :`, detail);
      courant = allege;
      continue;
    }
    console.error(`[${etiquette}] ${res.status} après ${essai} essai(s) — modèle=${modele} :`, detail);
    throw new ErreurAnthropic(res.status, detail);
  }
}

/**
 * Demande l'annonce, et la redemande UNE fois si la réponse est inutilisable.
 *
 * Dépendances injectées (comme `annonceAvecRelance` d'Ollama) pour tester la
 * relance sans réseau. La relance redit au modèle POURQUOI sa réponse a été
 * refusée. Seule `ErreurReponseAnthropic` relance : une erreur du fournisseur,
 * déjà passée par les essais de `posterAnthropic`, remonte telle quelle.
 */
export async function annonceAvecRelanceAnthropic(
  construire: (correction?: string) => CorpsRequeteAnthropic,
  appeler: (corps: CorpsRequeteAnthropic) => Promise<unknown>,
): Promise<ListingResult> {
  let correction: string | undefined;
  for (let tentative = 1; ; tentative++) {
    try {
      return lireReponseAnthropic(await appeler(construire(correction)));
    } catch (err) {
      if (!(err instanceof ErreurReponseAnthropic)) throw err;
      if (tentative >= 2) {
        console.error(`[anthropic] Réponse invalide après ${tentative} essais : ${err.message}`);
        throw new Error(
          `Anthropic n'a pas rendu une annonce valide après un nouvel essai : ${err.message.replace(/\.$/, "")}.`,
        );
      }
      console.error(`[anthropic] Réponse invalide (${err.message}), nouvel essai avec la correction.`);
      correction = err.message;
    }
  }
}

/**
 * Envoie le prompt compilé + les photos au modèle choisi et renvoie l'annonce.
 *
 * `modele` vient de `UserSettings.modeleAnthropicIA` ; l'absence de réglage
 * retombe sur `MODELE_ANTHROPIC_PAR_DEFAUT`.
 */
export async function generateListingAnthropic(
  prompt: string,
  images: ImageAnnonce[],
  apiKey: string | null | undefined,
  modele?: string | null,
): Promise<ListingResult> {
  const cle = apiKey?.trim();
  if (!cle) {
    console.error("[anthropic] Aucune clé : ni sur le compte, ni dans l'environnement.");
    throw new Error("Clé Anthropic manquante. Ajoute-la dans Mon compte.");
  }
  const id = modele?.trim() || MODELE_ANTHROPIC_PAR_DEFAUT;

  try {
    return await annonceAvecRelanceAnthropic(
      (correction) => construireRequeteAnthropic(prompt, images, id, correction),
      (corps) => posterAnthropic(corps, cle, "anthropic"),
    );
  } catch (err) {
    if (err instanceof ErreurAnthropic) throw new Error(messageErreurAnthropic(err.status, id, "annonce", err.detail));
    if (err instanceof ErreurReponseAnthropic) throw new Error(masquerSecret(err.message, cle));
    // Une erreur placée dans le corps d'un 200 repart au client : clé masquée
    // par précaution, même si un fournisseur n'a aucune raison de la répéter.
    if (err instanceof Error) throw new Error(masquerSecret(err.message, cle));
    throw err;
  }
}
