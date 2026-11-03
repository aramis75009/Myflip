// Client Ollama Cloud pour la génération d'annonces (serveur uniquement).
//
// Fournisseur par défaut depuis le 03/11/2026 (plus de crédit OpenRouter).
// `lib/openrouter.ts` reste en secours, intact. Même découpage que lui :
//   • PUR et testé : `partieImageOllama`, `construireRequeteOllama`,
//     `lireReponseOllama`, `allegerRequete`, `messageErreurOllama`,
//     `annonceAvecRelance` (dépendances injectées) ;
//   • RÉSEAU, non testé (convention de `vitest.config.ts`) : `posterOllama`,
//     `generateListingOllama`.
//
// Pas de SDK : l'API est compatible OpenAI (`POST <base>/chat/completions`,
// `Authorization: Bearer <clé>`), un `fetch` suffit. L'adresse vit dans
// `lib/ollamaBase.ts`. `posterOllama` est aussi celui de l'assistant
// (`lib/ollamaChat.ts`).
//
// ⚠️ DEUX DOUTES, tous deux issus de la documentation Ollama et jamais
// vérifiés par un appel réel (aucune clé disponible au moment de l'écriture) :
//   1. la forme de `image_url` (voir `partieImageOllama`) ;
//   2. le JSON structuré : la page de compatibilité OpenAI coche
//      `response_format`, la page « structured outputs » dit que le cloud ne le
//      supporte pas. On envoie le schéma ET on le décrit dans le prompt ET on
//      lit la réponse de façon tolérante ET on relance une fois si elle est
//      invalide. Si le cloud REFUSE le champ (400), `allegerRequete` le retire.
// Le premier appel réel dira lesquels de ces filets servent.

import { effortReflexion, MODELE_OLLAMA_PAR_DEFAUT, type EffortReflexion } from "@/lib/modelesIA";
import { urlOllama } from "@/lib/ollamaBase";
import { texteDuContenu, type ImageAnnonce, type ListingResult } from "@/lib/openrouter";

// ── Construction de la requête (pur) ────────────────────────────────────────

type PartTexte = { type: "text"; text: string };
type PartImage = { type: "image_url"; image_url: { url: string } | string };

/**
 * Forme de `image_url` envoyée à Ollama Cloud.
 *
 * Le DOUTE : l'exemple de la documentation Ollama écrit `image_url` comme une
 * CHAÎNE (`"image_url": "data:image/jpeg;base64,…"`), alors que la forme OpenAI
 * est un OBJET (`"image_url": { "url": "data:…" }`). La seconde est celle que
 * tout client compatible OpenAI produit, et le serveur Ollama en lecture
 * accepte, de mémoire, les deux — non vérifié. On construit donc l'objet.
 * Si le premier appel réel refuse les images, c'est ICI qu'il faut agir :
 * passer cette constante à `"chaine"`, rien d'autre ne change.
 */
export const FORME_IMAGE_URL: "objet" | "chaine" = "objet";

/**
 * Une photo, en data-URL base64 : Ollama Cloud ne lit pas les images par
 * adresse. Le type MIME suit le fichier (annoncer un PNG en JPEG fait refuser
 * l'image par certains serveurs).
 */
export function partieImageOllama(img: ImageAnnonce, forme: "objet" | "chaine" = FORME_IMAGE_URL): PartImage {
  const url = `data:${img.mimeType};base64,${img.data}`;
  return { type: "image_url", image_url: forme === "objet" ? { url } : url };
}

const CHAMPS = ["titre", "description", "motsCles"] as const;

/** Longueur maximale d'un titre Vinted, espaces compris. */
export const TITRE_MAX = 100;

const SCHEMA_ANNONCE = {
  type: "object" as const,
  properties: {
    titre: { type: "string" as const, description: `Titre de l'annonce, ${TITRE_MAX} caractères au maximum.` },
    description: { type: "string" as const, description: "Corps de l'annonce." },
    motsCles: { type: "string" as const, description: "Mots-clés séparés par des virgules." },
  },
  required: [...CHAMPS],
  additionalProperties: false as const,
};

export type CorpsRequeteOllama = {
  model: string;
  messages: { role: "user"; content: (PartTexte | PartImage)[] }[];
  response_format: {
    type: "json_schema";
    json_schema: { name: string; strict: boolean; schema: typeof SCHEMA_ANNONCE };
  };
  /** Absent pour un modèle sans réflexion connue : Ollama refuse le champ sur un modèle qui ne réfléchit pas. */
  reasoning_effort?: EffortReflexion;
};

/**
 * Le schéma, décrit EN TOUTES LETTRES à la suite du prompt.
 *
 * Le cloud ne garantit pas `response_format` : sans cette description, un
 * modèle qui n'a pas lu le schéma répond en prose. Elle recoupe volontairement
 * la consigne des prompts d'annonce (cf. `lib/metaPrompt.ts`) : redire ne coûte
 * rien, ne pas dire coûte une génération.
 */
export function instructionsFormat(): string {
  return [
    "FORMAT DE LA RÉPONSE — impératif.",
    "Réponds par UN SEUL objet JSON valide, sans aucun texte avant ou après et sans balise markdown, comportant exactement ces trois clés, toutes des chaînes de caractères :",
    '{"titre": "…", "description": "…", "motsCles": "…"}',
    `- titre : le titre de l'annonce, ${TITRE_MAX} caractères au maximum (espaces compris), jamais un de plus ;`,
    "- description : le corps de l'annonce ;",
    "- motsCles : les mots-clés, séparés par des virgules.",
  ].join("\n");
}

/**
 * Construit le corps de l'appel : prompt (suivi de la description du format),
 * puis les photos, dans UN seul message utilisateur.
 *
 * L'ordre compte, comme pour OpenRouter : les prompts d'annonce commencent par
 * des consignes qui portent sur les images qui suivent.
 *
 * `correction` n'existe qu'à la relance : la raison du refus de la première
 * réponse, redite au modèle pour qu'il ne refasse pas la même erreur.
 */
export function construireRequeteOllama(
  prompt: string,
  images: ImageAnnonce[],
  modele: string,
  correction?: string,
): CorpsRequeteOllama {
  const texte = [
    prompt,
    instructionsFormat(),
    correction
      ? `Ta réponse précédente a été refusée : ${correction.replace(/\.$/, "")}. Recommence en respectant strictement le format ci-dessus.`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const effort = effortReflexion(modele, "annonce");
  return {
    model: modele,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: texte }, ...images.map((img) => partieImageOllama(img))],
      },
    ],
    response_format: {
      type: "json_schema",
      // `strict` impose `additionalProperties: false` et tous les champs en
      // `required` : déjà vrai pour ce schéma.
      json_schema: { name: "annonce", strict: true, schema: SCHEMA_ANNONCE },
    },
    ...(effort ? { reasoning_effort: effort } : {}),
  };
}

// ── Lecture de la réponse (pur) ─────────────────────────────────────────────

/**
 * Une réponse reçue (HTTP 200) mais inutilisable : vide, pas du JSON, champ
 * manquant, titre trop long. C'est la SEULE erreur qui vaut une relance — une
 * erreur du fournisseur (clé, quota, modèle) ne se règle pas en redemandant.
 */
export class ErreurReponseOllama extends Error {}

/** Message d'erreur placé dans le corps d'une réponse, `null` s'il n'y en a pas. */
export function erreurDansCorps(json: unknown): string | null {
  const e = (json as { error?: unknown } | null | undefined)?.error;
  if (!e) return null;
  if (typeof e === "string") return e;
  const m = (e as { message?: unknown }).message;
  return typeof m === "string" && m ? m : "erreur sans détail";
}

/** Indice du `}` qui ferme l'objet ouvert en `debut`, ou -1. Tient compte des chaînes. */
function finDeObjet(t: string, debut: number): number {
  let profondeur = 0;
  let dansChaine = false;
  let echappe = false;
  for (let i = debut; i < t.length; i++) {
    const c = t[i];
    if (dansChaine) {
      if (echappe) echappe = false;
      else if (c === "\\") echappe = true;
      else if (c === '"') dansChaine = false;
      continue;
    }
    if (c === '"') dansChaine = true;
    else if (c === "{") profondeur++;
    else if (c === "}" && --profondeur === 0) return i;
  }
  return -1;
}

/**
 * Tous les objets JSON qu'on peut tirer d'un texte, du plus fidèle au plus
 * tolérant : le texte entier, puis le contenu des fences markdown, puis chaque
 * objet équilibré noyé dans de la prose.
 */
function objetsJson(texte: string): Record<string, unknown>[] {
  const trouves: Record<string, unknown>[] = [];
  const essayer = (s: string, profondeur = 0) => {
    try {
      const v: unknown = JSON.parse(s);
      if (v && typeof v === "object" && !Array.isArray(v)) trouves.push(v as Record<string, unknown>);
      // Un objet encodé deux fois : le modèle a renvoyé une CHAÎNE qui contient le JSON.
      else if (typeof v === "string" && profondeur === 0 && v.trim().startsWith("{")) essayer(v.trim(), 1);
    } catch {
      // Pas du JSON : on passe au candidat suivant.
    }
  };

  const t = texte.trim();
  essayer(t);
  if (trouves.length > 0) return trouves;

  for (const m of t.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) essayer(m[1].trim());
  if (trouves.length > 0) return trouves;

  for (let i = 0; i < t.length; i++) {
    if (t[i] !== "{") continue;
    const fin = finDeObjet(t, i);
    if (fin < 0) continue;
    const avant = trouves.length;
    essayer(t.slice(i, fin + 1));
    // Objet lu : on saute ce qu'il contient, ses sous-objets n'ont pas d'intérêt.
    if (trouves.length > avant) i = fin;
  }
  return trouves;
}

/** Valeur d'un champ, en texte : les tableaux (mots-clés en liste) sont recollés par des virgules. */
function enTexte(v: unknown): string {
  const brut =
    typeof v === "string"
      ? v
      : typeof v === "number"
        ? String(v)
        : Array.isArray(v)
          ? v
              .map((x) => (typeof x === "string" || typeof x === "number" ? String(x).trim() : ""))
              .filter(Boolean)
              .join(", ")
          : "";
  // Les sauts de ligne reviennent parfois échappés une seconde fois ("\\n"
  // littéral dans la chaîne déjà parsée) : même correctif que lib/openrouter.ts.
  return brut.trim().replace(/\\n/g, "\n");
}

/**
 * Valide l'objet lu : trois champs non vides, titre de 100 caractères au plus.
 * Lève `ErreurReponseOllama` (relançable) sinon.
 */
export function validerAnnonce(objet: Record<string, unknown>): ListingResult {
  const resultat = {
    titre: enTexte(objet.titre),
    description: enTexte(objet.description),
    motsCles: enTexte(objet.motsCles),
  };

  const manquants = CHAMPS.filter((c) => !resultat[c]);
  if (manquants.length > 0) {
    throw new ErreurReponseOllama(`Réponse incomplète du modèle : ${manquants.join(", ")}.`);
  }
  // Compté en caractères (points de code), pas en unités UTF-16 : un émoji en
  // vaut un pour Vinted.
  const longueur = Array.from(resultat.titre).length;
  if (longueur > TITRE_MAX) {
    throw new ErreurReponseOllama(`Titre trop long : ${longueur} caractères, ${TITRE_MAX} au maximum.`);
  }
  return resultat;
}

/**
 * Extrait l'annonce d'une réponse Ollama Cloud, tolérante : fences markdown,
 * texte autour du JSON, contenu en parts, mots-clés en tableau.
 *
 * Lève `ErreurReponseOllama` pour une réponse inutilisable (relançable) et une
 * `Error` simple quand c'est le fournisseur qui a mis une erreur dans le corps
 * d'un 200 (ne se règle pas en redemandant).
 */
export function lireReponseOllama(json: unknown): ListingResult {
  const enCorps = erreurDansCorps(json);
  if (enCorps) throw new Error(`Ollama Cloud : ${enCorps}`);

  const enveloppe = json as { choices?: { message?: { content?: unknown } }[] } | null | undefined;
  const texte = texteDuContenu(enveloppe?.choices?.[0]?.message?.content).trim();
  if (!texte) throw new ErreurReponseOllama("Réponse vide du modèle.");

  const objets = objetsJson(texte);
  if (objets.length === 0) throw new ErreurReponseOllama("Réponse du modèle non-JSON.");
  // Le premier objet qui porte un titre : un modèle qui « réfléchit à voix
  // haute » peut avoir semé d'autres accolades avant la vraie réponse.
  const objet = objets.find((o) => "titre" in o) ?? objets[0];
  return validerAnnonce(objet);
}

// ── Erreurs du fournisseur (pur) ────────────────────────────────────────────

/**
 * Message SÛR pour un statut HTTP d'Ollama Cloud (0 = injoignable).
 *
 * Ne reprend jamais le corps de la réponse : il peut décrire des détails
 * internes. `contexte: "chat"` préfixe comme les autres erreurs de l'assistant.
 */
export function messageErreurOllama(status: number, modele: string, contexte: "annonce" | "chat"): string {
  let fragment: string;
  if (status === 0) fragment = "Ollama Cloud est injoignable";
  else if (status === 401 || status === 403) fragment = "la clé Ollama Cloud est refusée";
  else if (status === 402) fragment = "Ollama Cloud demande un abonnement ou une limite plus haute pour cet usage";
  else if (status === 404) fragment = `le modèle ${modele} est inconnu d'Ollama Cloud`;
  else if (status === 429) fragment = "la limite d'usage d'Ollama Cloud est atteinte, réessaie dans un instant";
  else fragment = `Ollama Cloud a répondu ${status}`;

  if (contexte === "chat") return `Assistant indisponible : ${fragment}.`;
  return `${fragment[0].toUpperCase()}${fragment.slice(1)}.`;
}

/** Remplace toute occurrence du secret dans un texte destiné à un journal ou à une erreur. */
export function masquerSecret(texte: string, secret: string): string {
  return secret ? texte.split(secret).join("***") : texte;
}

/**
 * Si Ollama Cloud refuse la requête à cause d'un champ facultatif, la même
 * requête SANS ce champ ; sinon `null`.
 *
 * Deux champs seulement, ceux dont le support est douteux : `reasoning_effort`
 * (refusé sur un modèle qui ne réfléchit pas, ou pour une valeur inconnue de
 * lui) et `response_format` (le cloud ne tient pas le JSON structuré). Un
 * champ retiré à la fois : la boucle de `posterOllama` rappelle cette fonction
 * si un second champ pose problème, donc elle ne tourne jamais plus de deux
 * fois. Un 400 sans rapport (image refusée…) ne retire rien : l'erreur remonte.
 */
export function allegerRequete<T extends object>(corps: T, status: number, detail: string): T | null {
  if (status !== 400 && status !== 422) return null;
  const c = corps as Record<string, unknown>;
  const sans = (champ: string): T => {
    const { [champ]: _retire, ...reste } = c;
    void _retire;
    return reste as T;
  };
  if ("reasoning_effort" in c && /reason|think/i.test(detail)) return sans("reasoning_effort");
  if ("response_format" in c && /response_format|json_schema|structured|schema/i.test(detail)) {
    return sans("response_format");
  }
  return null;
}

// ── Réseau ──────────────────────────────────────────────────────────────────

/**
 * Échec HTTP d'Ollama Cloud. `status` vaut 0 quand le serveur est injoignable.
 *
 * `detail` est le corps de la réponse, clé masquée : pour les journaux, JAMAIS
 * pour le client (cf. `messageErreurOllama`).
 */
export class ErreurOllama extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(status === 0 ? "Ollama Cloud injoignable." : `Ollama Cloud a répondu ${status}.`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Statuts qui valent un nouvel essai : surcharge côté fournisseur. */
const RETENTABLES = new Set([429, 502, 503, 504]);

/**
 * `POST /chat/completions` avec la clé du compte ; renvoie le JSON de la
 * réponse. Partagé par les annonces et l'assistant.
 *
 * Réessaie sur les statuts de surcharge (3 essais, 2 s entre chaque) et
 * retire un champ facultatif refusé (`allegerRequete`). Lève `ErreurOllama`
 * pour toute autre erreur HTTP, `ErreurReponseOllama` si le corps n'est pas du
 * JSON. La clé n'apparaît jamais dans un journal ni dans une erreur.
 */
export async function posterOllama(corps: object, cle: string, etiquette: string): Promise<unknown> {
  const MAX_ESSAIS = 3;
  const modele = (corps as { model?: string }).model ?? "?";
  let courant = corps;

  for (let essai = 1; ; essai++) {
    let res: Response;
    try {
      res = await fetch(urlOllama("/chat/completions"), {
        method: "POST",
        headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
        body: JSON.stringify(courant),
        cache: "no-store",
      });
    } catch (err) {
      // Le message seul : l'objet d'erreur complet embarque la requête.
      console.error(`[${etiquette}] Appel injoignable :`, masquerSecret(err instanceof Error ? err.message : String(err), cle));
      throw new ErreurOllama(0, "");
    }

    if (res.ok) {
      try {
        return await res.json();
      } catch {
        throw new ErreurReponseOllama("Réponse illisible d'Ollama Cloud.");
      }
    }

    const detail = masquerSecret((await res.text().catch(() => "")).slice(0, 1000), cle);
    if (RETENTABLES.has(res.status) && essai < MAX_ESSAIS) {
      console.error(`[${etiquette}] ${res.status} (essai ${essai}/${MAX_ESSAIS}), nouvel essai dans 2 s…`);
      await sleep(2000);
      continue;
    }
    const allege = allegerRequete(courant, res.status, detail);
    if (allege) {
      console.error(`[${etiquette}] ${res.status} : champ facultatif refusé, nouvel essai sans lui — modèle=${modele} :`, detail);
      courant = allege;
      continue;
    }
    console.error(`[${etiquette}] ${res.status} après ${essai} essai(s) — modèle=${modele} :`, detail);
    throw new ErreurOllama(res.status, detail);
  }
}

/**
 * Demande l'annonce, et la redemande UNE fois si la réponse est inutilisable.
 *
 * Dépendances injectées (comme `lib/studioLancement.ts`) pour tester la relance
 * sans réseau. La relance redit au modèle POURQUOI sa réponse a été refusée.
 * Seule `ErreurReponseOllama` relance : une erreur du fournisseur, déjà passée
 * par les essais de `posterOllama`, remonte telle quelle.
 */
export async function annonceAvecRelance(
  construire: (correction?: string) => CorpsRequeteOllama,
  appeler: (corps: CorpsRequeteOllama) => Promise<unknown>,
): Promise<ListingResult> {
  let correction: string | undefined;
  for (let tentative = 1; ; tentative++) {
    try {
      return lireReponseOllama(await appeler(construire(correction)));
    } catch (err) {
      if (!(err instanceof ErreurReponseOllama)) throw err;
      if (tentative >= 2) {
        console.error(`[ollama] Réponse invalide après ${tentative} essais : ${err.message}`);
        throw new Error(
          `Ollama Cloud n'a pas rendu une annonce valide après un nouvel essai : ${err.message.replace(/\.$/, "")}.`,
        );
      }
      console.error(`[ollama] Réponse invalide (${err.message}), nouvel essai avec la correction.`);
      correction = err.message;
    }
  }
}

/**
 * Envoie le prompt compilé + les photos au modèle choisi et renvoie l'annonce.
 *
 * `modele` vient de `UserSettings.modeleOllamaIA` ; l'absence de réglage retombe
 * sur `MODELE_OLLAMA_PAR_DEFAUT`.
 */
export async function generateListingOllama(
  prompt: string,
  images: ImageAnnonce[],
  apiKey: string | null | undefined,
  modele?: string | null,
): Promise<ListingResult> {
  const cle = apiKey?.trim();
  if (!cle) {
    console.error("[ollama] Aucune clé : ni sur le compte, ni dans l'environnement.");
    throw new Error("Clé Ollama Cloud manquante. Ajoute-la dans Mon compte.");
  }
  const id = modele?.trim() || MODELE_OLLAMA_PAR_DEFAUT;

  try {
    return await annonceAvecRelance(
      (correction) => construireRequeteOllama(prompt, images, id, correction),
      (corps) => posterOllama(corps, cle, "ollama"),
    );
  } catch (err) {
    if (err instanceof ErreurOllama) throw new Error(messageErreurOllama(err.status, id, "annonce"));
    // Une erreur placée dans le corps d'un 200 repart au client : clé masquée
    // par précaution, même si un fournisseur n'a aucune raison de la répéter.
    if (err instanceof Error) throw new Error(masquerSecret(err.message, cle));
    throw err;
  }
}
