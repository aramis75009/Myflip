// Vérification d'une image générée par le Studio IA (serveur uniquement).
//
// Le Studio fait générer à Aramis, dans Gemini, un sac sous un angle donné à
// partir de vraies photos. Ce module demande à un modèle de vision de NOTER cette
// image face aux photos de référence, détail par détail (spec §6).
//
// ⚠️ Il ne GÉNÈRE aucune image : il en lit et rend du JSON. Et son verdict n'est
// qu'une aide — Valider / Rejeter reste la décision d'Aramis, et c'est elle qui
// alimente les statistiques. Rien ici ne recalcule ni ne corrige le verdict.
//
// Même découpage que `lib/openrouter.ts` : DEUX morceaux purs et testés
// (`buildVerifRequest`, `readVerifResponse`) et UNE seule fonction qui touche le
// réseau (`verifyGeneratedImage`) — c'est la convention de `vitest.config.ts`.
//
// Pourquoi un module séparé plutôt qu'un `generateListing` élargi : le
// `CorpsRequete` d'`openrouter.ts` impose un `json_schema` nommé `annonce`, qui
// n'est pas le schéma de sortie d'ici. Décision prise : on ne touche pas à
// `openrouter.ts`, on en recopie la forme.
//
// Les noms de domaine du contrat JSON (`detail`, `statut`, `fidele`,
// `angleRespecte`, `scoreGlobal`…) viennent de la spec et restent en français.

import { MODELE_PAR_DEFAUT } from "@/lib/modelesIA";
import type { ImageAnnonce } from "@/lib/openrouter";
import { urlOpenRouter } from "@/lib/openrouterBase";
import { resoudreReglages } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Contrat d'entrée et de sortie
// ---------------------------------------------------------------------------

export const DETAIL_STATUSES = ["fidele", "derive", "absent"] as const;
export type DetailStatus = (typeof DETAIL_STATUSES)[number];

export const VERDICTS = ["ok", "a_corriger", "rejet"] as const;
export type Verdict = (typeof VERDICTS)[number];

/**
 * Début de la note d'un détail que l'angle demandé ne peut pas montrer (un patch
 * côté gauche sur une vue de dos). Le contrat n'a que trois statuts : un tel
 * détail sort en « absent », et c'est ce préfixe qui le distingue d'un détail
 * réellement oublié par le générateur. L'interface peut le tester pour ne pas
 * le compter comme un échec.
 */
export const OUT_OF_FRAME_PREFIX = "Hors champ";

export type DetailCheck = {
  detail: string;
  statut: DetailStatus;
  note: string;
};

export type VerifResult = {
  details: DetailCheck[];
  angleRespecte: boolean;
  /** Entier de 0 à 100. */
  scoreGlobal: number;
  verdict: Verdict;
};

export type VerifInput = {
  /** Vraies photos du sac (au moins une). Base64 SANS le préfixe `data:`. */
  references: ImageAnnonce[];
  /** L'image générée à noter. */
  generated: ImageAnnonce;
  /** Détails à préserver pour ce coloris, un par entrée. Peut être vide. */
  details: string[];
  /**
   * Texte de l'angle demandé (« Dos ¾ haut gauche »). Facultatif, mais sans lui
   * `angleRespecte` ne peut pas être jugé sur la demande : le modèle se contente
   * alors de vérifier que le point de vue est net et unique.
   */
  angle?: string | null;
};

// ---------------------------------------------------------------------------
// Erreurs typées
// ---------------------------------------------------------------------------

/**
 * `message` est écrit pour être affiché tel quel (la route le renvoie comme le
 * fait `/api/listings/generate`) ; `code` permet à l'interface de réagir sans
 * lire le texte — par exemple proposer un lien vers « Mon compte » sur
 * `missing_key`, `bad_key` et `no_credits`.
 */
export type VerifErrorCode =
  | "invalid_input"
  | "missing_key"
  | "settings_unreadable"
  | "unreachable"
  | "bad_key"
  | "no_credits"
  | "unknown_model"
  | "provider"
  | "invalid_response";

export class StudioVerifError extends Error {
  readonly code: VerifErrorCode;

  constructor(code: VerifErrorCode, message: string) {
    super(message);
    this.name = "StudioVerifError";
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Construction de la requête (pur)
// ---------------------------------------------------------------------------

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image_url"; image_url: { url: string } };

/**
 * Schéma de sortie. Deux contraintes de l'API en mode `strict`, toutes deux
 * tenues par un test :
 *  - chaque objet porte `additionalProperties: false` ET liste toutes ses
 *    propriétés dans `required` — sinon le schéma est refusé ;
 *  - aucun mot-clé de bornes (`minimum`, `minItems`, `pattern`…) : certains
 *    fournisseurs rejettent le schéma entier à sa seule vue. Les bornes (score
 *    0-100, nombre de détails) sont donc vérifiées à la lecture, pas ici.
 */
const VERIF_SCHEMA = {
  type: "object",
  properties: {
    details: {
      type: "array",
      items: {
        type: "object",
        properties: {
          detail: { type: "string" },
          statut: { type: "string", enum: [...DETAIL_STATUSES] },
          note: { type: "string" },
        },
        required: ["detail", "statut", "note"],
        additionalProperties: false,
      },
    },
    angleRespecte: { type: "boolean" },
    scoreGlobal: { type: "integer", description: "Entier de 0 à 100." },
    verdict: { type: "string", enum: [...VERDICTS] },
  },
  required: ["details", "angleRespecte", "scoreGlobal", "verdict"],
  additionalProperties: false,
} as const;

export type VerifRequestBody = {
  model: string;
  messages: { role: "user"; content: (TextPart | ImagePart)[] }[];
  response_format: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: true;
      schema: typeof VERIF_SCHEMA;
    };
  };
  reasoning: { max_tokens: number };
};

/** Compare sans tenir compte de la casse, des accents ni des espaces multiples. */
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Nettoie la liste des détails : espaces nettoyés, lignes vides retirées,
 * doublons écartés (à la casse et aux accents près).
 *
 * Les doublons comptent : la lecture rapproche les détails rendus par le modèle
 * de ceux demandés d'après leur intitulé, deux intitulés identiques seraient
 * indiscernables.
 */
function cleanDetails(details: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of details) {
    const d = raw.replace(/\s+/g, " ").trim();
    if (!d) continue;
    const key = normalize(d);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

function buildPrompt(details: string[], nbReferences: number, angle: string | null): string {
  const refs =
    nbReferences === 1
      ? "UNE photo de RÉFÉRENCE (une vraie photo du sac)"
      : `${nbReferences} photos de RÉFÉRENCE (de vraies photos du même sac)`;

  const angleBloc = angle
    ? `Angle demandé au générateur : ${angle}`
    : "Aucun angle précis n'a été fourni : mets « angleRespecte » à true si l'image générée montre le sac sous un point de vue net et unique, à false si c'est un collage, un montage, ou si le sac est coupé ou illisible.";

  const detailsBloc =
    details.length > 0
      ? `Détails à contrôler :\n${details.map((d, i) => `${i + 1}. ${d}`).join("\n")}`
      : "Aucun détail précis n'est à contrôler : rends « details » vide et note l'image sur sa fidélité d'ensemble.";

  return `Tu es contrôleur qualité pour des photos de sacs. Tu reçois ${refs}, puis UNE image GÉNÉRÉE par IA, censée montrer exactement le même sac sous un autre angle. Chaque image est précédée d'une étiquette qui dit ce qu'elle est ; l'image générée vient en dernier.

Seules les photos de référence font foi. Ne juge jamais d'après ce qui te paraît plausible pour ce type de sac, et ne note pas la beauté ou la netteté de l'image générée : seulement sa fidélité au sac de référence.

${angleBloc}

${detailsBloc}

Pour chaque détail, compare-le à la référence et choisis un statut :
- "fidele" : identique à la référence (forme, position, couleur, texte, nombre d'éléments).
- "derive" : présent mais altéré (teinte changée, côté inversé, texte déformé ou mal orthographié, taille ou proportions modifiées, élément en trop ou en moins).
- "absent" : introuvable sur l'image générée.
Dans « note », écris une phrase courte en français qui dit ce qui diffère, ou ce qui est conforme. Recopie l'intitulé du détail à l'identique dans « detail » et rends les détails dans l'ordre de la liste.
Si l'angle demandé ne peut pas montrer un détail (un patch côté gauche sur une vue de dos, par exemple), mets "absent" et commence la note par « ${OUT_OF_FRAME_PREFIX} : ». Ce cas ne pénalise ni le score ni le verdict.

« angleRespecte » : true si l'image générée montre le sac sous l'angle demandé.

« scoreGlobal » : entier de 0 à 100 pour la fidélité d'ensemble (silhouette, matière, couleur de base, détails). Repères : 85 et plus, indiscernable du sac de référence ; 50 à 84, écarts visibles mais corrigeables ; moins de 50, ce n'est plus le même sac.

« verdict » :
- "ok" : angle respecté, aucun détail dérivé ou absent (hors « ${OUT_OF_FRAME_PREFIX} »), sac identique.
- "a_corriger" : angle respecté, silhouette, matière et couleur fidèles, mais un ou deux détails dérivés ou absents : un nouvel essai peut suffire.
- "rejet" : angle non respecté, ou sac visiblement différent (forme, couleur de base, matière), ou plusieurs détails absents.

Réponds uniquement par le JSON demandé.`;
}

function toImagePart(img: ImageAnnonce, label: string): ImagePart {
  // Garde-fous sur ce que l'appelant fournit : une image vide ou un préfixe
  // `data:` déjà posé donnent, chez le fournisseur, une erreur sans rapport avec
  // la cause. Mieux vaut échouer ici, avec le mot juste.
  if (!/^image\/[\w.+-]+$/i.test(img.mimeType)) {
    throw new StudioVerifError(
      "invalid_input",
      `Type d'image invalide pour ${label} : « ${img.mimeType} ».`,
    );
  }
  if (!img.data) {
    throw new StudioVerifError("invalid_input", `Image vide : ${label}.`);
  }
  if (/^data:/i.test(img.data)) {
    throw new StudioVerifError(
      "invalid_input",
      `L'image « ${label} » doit être en base64 sans le préfixe data:.`,
    );
  }
  return {
    type: "image_url",
    // Le type MIME suit le fichier : annoncer un PNG en JPEG fait refuser
    // l'image par certains fournisseurs.
    image_url: { url: `data:${img.mimeType};base64,${img.data}` },
  };
}

/**
 * Construit le corps de l'appel : consigne d'abord, puis chaque image précédée
 * d'une étiquette, dans UN seul message utilisateur.
 *
 * Les étiquettes (« Photo de référence 2 sur 3 », « Image GÉNÉRÉE à noter »)
 * évitent que le modèle ait à deviner, au simple décompte, laquelle des images
 * est celle qu'on lui demande de juger. L'image générée vient toujours en
 * dernier.
 */
export function buildVerifRequest(input: VerifInput, model: string): VerifRequestBody {
  if (input.references.length === 0) {
    throw new StudioVerifError(
      "invalid_input",
      "Aucune photo de référence à comparer : ajoute au moins une vraie photo.",
    );
  }

  const details = cleanDetails(input.details);
  const angle = input.angle?.replace(/\s+/g, " ").trim() || null;
  const n = input.references.length;

  const content: (TextPart | ImagePart)[] = [
    { type: "text", text: buildPrompt(details, n, angle) },
  ];
  input.references.forEach((img, i) => {
    const label = `Photo de référence ${i + 1} sur ${n}`;
    content.push({ type: "text", text: `${label} :` });
    content.push(toImagePart(img, label));
  });
  const generatedLabel = "Image GÉNÉRÉE à noter";
  content.push({ type: "text", text: `${generatedLabel} :` });
  content.push(toImagePart(input.generated, generatedLabel));

  return {
    model,
    messages: [{ role: "user", content }],
    response_format: {
      type: "json_schema",
      json_schema: { name: "verification_studio", strict: true, schema: VERIF_SCHEMA },
    },
    // Même budget que la génération d'annonces. Comparer détail par détail avec
    // un point de vue différent gagne à être raisonné ; OpenRouter ignore le
    // paramètre pour les modèles qui ne savent pas réfléchir.
    reasoning: { max_tokens: 1024 },
  };
}

// ---------------------------------------------------------------------------
// Lecture de la réponse (pur)
// ---------------------------------------------------------------------------

const invalidResponse = (message: string) => new StudioVerifError("invalid_response", message);

/** Recolle un `content` renvoyé en tableau de parts plutôt qu'en chaîne. */
function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        p && typeof p === "object" && typeof (p as TextPart).text === "string"
          ? (p as TextPart).text
          : "",
      )
      .join("");
  }
  return "";
}

/**
 * Isole le JSON d'un texte que les modèles entourent parfois, malgré le schéma
 * imposé : fences markdown (```json … ```, même non fermées) ou phrase d'intro
 * avant l'objet. En dernier recours, on garde ce qui va de la première
 * accolade à la dernière.
 */
function extractJson(text: string): string {
  let t = text.trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)\s*(?:```|$)/i);
  if (fenced) t = fenced[1].trim();
  if (!t.startsWith("{")) {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start !== -1 && end > start) t = t.slice(start, end + 1);
  }
  return t;
}

/**
 * Les sauts de ligne reviennent parfois échappés une seconde fois (« \\n »
 * littéral dans une chaîne déjà parsée) : la note arrivait alors sur une seule
 * ligne, parsemée de `\n` visibles.
 */
const cleanText = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/\\n/g, "\n");

function readStatus(v: unknown): DetailStatus {
  const s = typeof v === "string" ? normalize(v) : "";
  const found = DETAIL_STATUSES.find((x) => x === s);
  if (!found) {
    throw invalidResponse(`Statut de détail inconnu dans la réponse : « ${String(v).slice(0, 40)} ».`);
  }
  return found;
}

function readVerdict(v: unknown): Verdict {
  const s = typeof v === "string" ? normalize(v).replace(/[\s-]+/g, "_") : "";
  const found = VERDICTS.find((x) => x === s);
  if (!found) {
    throw invalidResponse(`Verdict inconnu dans la réponse : « ${String(v).slice(0, 40)} ».`);
  }
  return found;
}

/** Accepte un nombre ou une chaîne numérique, arrondit, ramène dans 0-100. */
function readScore(v: unknown): number {
  const n =
    typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : Number.NaN;
  if (!Number.isFinite(n)) {
    throw invalidResponse("Score global absent ou illisible dans la réponse.");
  }
  return Math.min(100, Math.max(0, Math.round(n)));
}

function readDetail(v: unknown): DetailCheck {
  if (!v || typeof v !== "object") {
    throw invalidResponse("Détail illisible dans la réponse.");
  }
  const d = v as Record<string, unknown>;
  return { detail: cleanText(d.detail), statut: readStatus(d.statut), note: cleanText(d.note) };
}

/**
 * Remet les détails rendus dans l'ordre et sous l'intitulé de la demande.
 *
 * C'est le cœur de la fiabilité de la grille : un détail qui disparaît ou qui
 * change de ligne fausse silencieusement les statistiques. Donc :
 *  - le NOMBRE de détails doit être exactement celui demandé, sinon on échoue ;
 *  - on apparie d'abord par intitulé (insensible à la casse et aux accents), ce
 *    qui tient même si le modèle a réordonné la liste ;
 *  - un intitulé reformulé par le modèle prend, dans l'ordre, la place restante.
 * Le libellé rendu à l'appelant est toujours celui de la demande.
 */
function matchDetails(received: DetailCheck[], expected: string[]): DetailCheck[] {
  if (received.length !== expected.length) {
    throw invalidResponse(
      `Réponse incomplète du modèle : ${received.length} détail(s) rendu(s) sur ${expected.length} attendu(s).`,
    );
  }

  const taken = new Array<boolean>(received.length).fill(false);
  const byLabel = expected.map((label) => {
    const key = normalize(label);
    const i = received.findIndex((r, k) => !taken[k] && normalize(r.detail) === key);
    if (i === -1) return null;
    taken[i] = true;
    return { ...received[i], detail: label };
  });

  const leftovers = received.filter((_, k) => !taken[k]);
  let next = 0;
  return byLabel.map((m, k) => m ?? { ...leftovers[next++], detail: expected[k] });
}

/**
 * Extrait la vérification d'une réponse OpenRouter.
 *
 * Séparée de l'appel réseau pour être testable : c'est ici que vivent tous les
 * écarts de comportement entre modèles, donc c'est ici qu'il faut des tests.
 * `expectedDetails` est la liste donnée à `buildVerifRequest` (la même nettoyée
 * ici de la même façon).
 */
export function readVerifResponse(json: unknown, expectedDetails: string[]): VerifResult {
  const envelope = json as {
    error?: { message?: string };
    choices?: { message?: { content?: unknown } }[];
  };

  // OpenRouter répond parfois 200 avec l'erreur dans le corps (crédits épuisés,
  // modèle indisponible). Sans cette garde, l'utilisateur lisait « réponse
  // vide » là où le fournisseur avait donné une raison exploitable.
  if (envelope?.error?.message) {
    throw new StudioVerifError("provider", `OpenRouter : ${envelope.error.message}`);
  }

  const text = extractJson(contentText(envelope?.choices?.[0]?.message?.content));
  if (!text) throw invalidResponse("Réponse vide du modèle.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw invalidResponse("Réponse du modèle non-JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw invalidResponse("Réponse du modèle inattendue : un objet JSON était attendu.");
  }
  const raw = parsed as Record<string, unknown>;

  if (typeof raw.angleRespecte !== "boolean") {
    throw invalidResponse("Réponse incomplète du modèle : angleRespecte absent ou invalide.");
  }

  const received = (Array.isArray(raw.details) ? raw.details : []).map(readDetail);

  return {
    details: matchDetails(received, cleanDetails(expectedDetails)),
    angleRespecte: raw.angleRespecte,
    scoreGlobal: readScore(raw.scoreGlobal),
    verdict: readVerdict(raw.verdict),
  };
}

// ---------------------------------------------------------------------------
// Erreurs HTTP (pur)
// ---------------------------------------------------------------------------

/** Statuts qui valent un nouvel essai : surcharge côté fournisseur. */
const RETRYABLE = new Set([429, 502, 503, 504]);

/**
 * Traduit un statut HTTP d'échec définitif en erreur typée. 402 a son propre
 * message : c'est le cas qui a motivé `openrouter.ts`.
 */
export function errorFromStatus(status: number, model: string): StudioVerifError {
  if (status === 402) return new StudioVerifError("no_credits", "Crédits OpenRouter épuisés.");
  if (status === 401 || status === 403) {
    return new StudioVerifError("bad_key", "Clé OpenRouter refusée.");
  }
  if (status === 404) {
    return new StudioVerifError("unknown_model", `Modèle inconnu d'OpenRouter : ${model}.`);
  }
  return new StudioVerifError("provider", `OpenRouter a répondu ${status}.`);
}

// ---------------------------------------------------------------------------
// Appel réseau (seul morceau non testé)
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 2000;

/**
 * Note l'image générée face aux photos de référence.
 *
 * La clé se résout par `resoudreReglages` : clé du compte, sinon
 * `OPENROUTER_API_KEY`, sinon rien. ⚠️ Il n'y a PAS de clé OpenRouter dans
 * l'environnement Vercel de ce projet : l'absence de clé est le cas ordinaire
 * d'un compte qui n'a pas encore rempli « Mon compte », pas une anomalie. Elle
 * sort donc en `missing_key`, avec un message qui dit quoi faire.
 *
 * `model` est facultatif et retombe sur `MODELE_PAR_DEFAUT` (qui lit les images
 * et sait rendre du JSON structuré). Le modèle de rédaction des annonces choisi
 * dans le compte n'est PAS repris : il peut être saisi librement, donc sans
 * garantie de vision ni de sortie structurée.
 */
export async function verifyGeneratedImage(
  input: VerifInput,
  userId: string,
  model?: string | null,
): Promise<VerifResult> {
  // D'abord l'entrée : inutile de lire les réglages pour une demande incomplète.
  const body = buildVerifRequest(input, model?.trim() || MODELE_PAR_DEFAUT);

  let apiKey: string | null;
  try {
    apiKey = (await resoudreReglages(userId)).openrouterKey?.trim() || null;
  } catch (err) {
    console.error("[studioVerif] Réglages du compte illisibles :", err);
    throw new StudioVerifError(
      "settings_unreadable",
      "Impossible de lire les réglages du compte. Réessaie dans un instant.",
    );
  }
  if (!apiKey) {
    console.error("[studioVerif] Aucune clé : ni sur le compte, ni dans l'environnement.");
    throw new StudioVerifError(
      "missing_key",
      "Clé OpenRouter manquante. Ajoute ta clé dans Mon compte.",
    );
  }

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(urlOpenRouter("/chat/completions"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          // Attribution OpenRouter : identifie l'app dans le tableau de bord.
          "HTTP-Referer": "https://myflip.app",
          "X-Title": "MyFlip",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (err) {
      console.error("[studioVerif] Appel injoignable :", err);
      throw new StudioVerifError("unreachable", "OpenRouter injoignable.");
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS) {
        console.error(
          `[studioVerif] ${res.status} (essai ${attempt}/${MAX_ATTEMPTS}), nouvel essai dans ${RETRY_PAUSE_MS / 1000} s…`,
        );
        await sleep(RETRY_PAUSE_MS);
        continue;
      }
      // Le corps de la requête (les images en base64) n'est jamais journalisé.
      console.error(
        `[studioVerif] ${res.status} après ${attempt} essai(s) — modèle=${body.model} :`,
        detail,
      );
      throw errorFromStatus(res.status, body.model);
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw invalidResponse("Réponse d'OpenRouter illisible.");
    }
    return readVerifResponse(json, input.details);
  }
}
