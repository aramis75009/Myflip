// Client OpenRouter pour la génération d'annonces (serveur uniquement).
//
// Remplace l'appel Gemini direct : une seule clé, une seule facture, et le
// choix du modèle devient un réglage de compte (`UserSettings.modeleIA`) au
// lieu d'une constante de fichier.
//
// Pas de SDK : l'API est compatible OpenAI et l'usage tient en un `fetch`.
// Ajouter une dépendance ici reviendrait à installer un client entier pour
// construire un objet JSON.
//
// Le module est découpé en TROIS morceaux dont deux sont purs et testés
// (`construireRequete`, `lireReponse`). Seul `generateListing` touche le
// réseau — c'est la convention de `vitest.config.ts`, qui ne couvre que le pur.

import { MODELE_PAR_DEFAUT } from "@/lib/modelesIA";
import { urlOpenRouter } from "@/lib/openrouterBase";

export type ListingResult = {
  titre: string;
  description: string;
  motsCles: string;
};

/** Une photo prête à partir : base64 SANS le préfixe `data:`. */
export type ImageAnnonce = { mimeType: string; data: string };

type PartTexte = { type: "text"; text: string };
type PartImage = { type: "image_url"; image_url: { url: string } };

export type CorpsRequete = {
  model: string;
  messages: { role: "user"; content: (PartTexte | PartImage)[] }[];
  response_format: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: boolean;
      schema: {
        type: "object";
        properties: Record<string, { type: "string" }>;
        required: string[];
        additionalProperties: false;
      };
    };
  };
  reasoning: { max_tokens: number };
};

const CHAMPS = ["titre", "description", "motsCles"] as const;

/**
 * Construit le corps de l'appel : prompt d'abord, photos ensuite, dans UN seul
 * message utilisateur.
 *
 * L'ordre compte. Les prompts d'annonce commencent par des consignes qui
 * portent sur les images qui suivent ; les inverser fait lire les photos sans
 * savoir quoi en tirer.
 */
export function construireRequete(
  prompt: string,
  images: ImageAnnonce[],
  modele: string,
): CorpsRequete {
  return {
    model: modele,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...images.map(
            (img): PartImage => ({
              type: "image_url",
              // Le type MIME suit le fichier : annoncer un PNG en JPEG fait
              // refuser l'image par certains fournisseurs.
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            }),
          ),
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "annonce",
        // `strict` impose `additionalProperties: false` et tous les champs en
        // `required` : l'API refuse le schéma si l'un des deux manque.
        strict: true,
        schema: {
          type: "object",
          properties: Object.fromEntries(
            CHAMPS.map((c) => [c, { type: "string" as const }]),
          ),
          required: [...CHAMPS],
          additionalProperties: false,
        },
      },
    },
    // Budget de réflexion conservé de l'implémentation Gemini, et pour la même
    // raison : les prompts demandent de saturer un titre à 100 caractères sans
    // le dépasser et de produire ~80 mots-clés sur 7 langues sans doublon. Un
    // modèle rate ces comptages en un seul passage. OpenRouter ignore le
    // paramètre pour les modèles qui ne savent pas réfléchir.
    reasoning: { max_tokens: 1024 },
  };
}

/** Recolle un `content` renvoyé en tableau de parts plutôt qu'en chaîne. */
function texteDuContenu(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        p && typeof p === "object" && typeof (p as PartTexte).text === "string"
          ? (p as PartTexte).text
          : "",
      )
      .join("");
  }
  return "";
}

/**
 * Retire les fences markdown (```json … ```) que les modèles ajoutent parfois
 * malgré le schéma imposé.
 */
function retirerFences(texte: string): string {
  const t = texte.trim();
  if (!t.startsWith("```")) return t;
  return t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

/**
 * Extrait l'annonce d'une réponse OpenRouter.
 *
 * Séparée de l'appel réseau pour être testable : c'est ici que vivent tous les
 * écarts de comportement entre modèles, donc c'est ici qu'il faut des tests.
 */
export function lireReponse(json: unknown): ListingResult {
  const enveloppe = json as {
    error?: { message?: string };
    choices?: { message?: { content?: unknown } }[];
  };

  // OpenRouter répond parfois 200 avec l'erreur dans le corps (crédits épuisés,
  // modèle indisponible). Sans cette garde, l'utilisateur lisait « réponse
  // vide » là où le fournisseur avait donné une raison exploitable.
  if (enveloppe?.error?.message) {
    throw new Error(`OpenRouter : ${enveloppe.error.message}`);
  }

  const texte = retirerFences(
    texteDuContenu(enveloppe?.choices?.[0]?.message?.content),
  );
  if (!texte) throw new Error("Réponse vide du modèle.");

  let parsed: Partial<Record<(typeof CHAMPS)[number], unknown>>;
  try {
    parsed = JSON.parse(texte);
  } catch {
    throw new Error("Réponse du modèle non-JSON.");
  }

  // Les sauts de ligne reviennent parfois échappés une seconde fois ("\\n"
  // littéral dans la chaîne déjà parsée) : la description arrivait alors sur
  // une seule ligne dans l'annonce publiée.
  const nettoyer = (v: unknown) =>
    String(v ?? "")
      .trim()
      .replace(/\\n/g, "\n");

  const resultat = {
    titre: nettoyer(parsed.titre),
    description: nettoyer(parsed.description),
    motsCles: nettoyer(parsed.motsCles),
  };

  // Un champ vide passait jusqu'à l'écran d'export, où il devenait une annonce
  // sans titre. Échouer ici laisse au moins une chance de relancer.
  const manquants = CHAMPS.filter((c) => !resultat[c]);
  if (manquants.length > 0) {
    throw new Error(`Réponse incomplète du modèle : ${manquants.join(", ")}.`);
  }
  return resultat;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Statuts qui valent un nouvel essai : surcharge côté fournisseur. */
const RETENTABLES = new Set([429, 502, 503, 504]);

/**
 * Envoie le prompt compilé + les photos au modèle choisi et renvoie l'annonce.
 *
 * `modele` vient de `UserSettings.modeleIA` ; l'absence de réglage retombe sur
 * `MODELE_PAR_DEFAUT`, qui est le modèle utilisé avant le passage par
 * OpenRouter — un compte qui n'a rien choisi ne voit donc aucun changement.
 */
export async function generateListing(
  prompt: string,
  images: ImageAnnonce[],
  apiKey: string | null | undefined,
  modele?: string | null,
): Promise<ListingResult> {
  const cle = apiKey?.trim();
  if (!cle) {
    console.error(
      "[openrouter] Aucune clé : ni sur le compte, ni dans l'environnement.",
    );
    throw new Error("Clé OpenRouter manquante. Ajoute-la dans Mon compte.");
  }

  const corps = construireRequete(prompt, images, modele?.trim() || MODELE_PAR_DEFAUT);

  const MAX_ESSAIS = 3;
  for (let essai = 1; ; essai++) {
    let res: Response;
    try {
      res = await fetch(urlOpenRouter("/chat/completions"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cle}`,
          "Content-Type": "application/json",
          // Attribution OpenRouter : identifie l'app dans le tableau de bord.
          "HTTP-Referer": "https://myflip.app",
          "X-Title": "MyFlip",
        },
        body: JSON.stringify(corps),
        cache: "no-store",
      });
    } catch (err) {
      console.error("[openrouter] Appel injoignable :", err);
      throw new Error("OpenRouter injoignable.");
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (RETENTABLES.has(res.status) && essai < MAX_ESSAIS) {
        console.error(
          `[openrouter] ${res.status} (essai ${essai}/${MAX_ESSAIS}), nouvel essai dans 2 s…`,
        );
        await sleep(2000);
        continue;
      }
      console.error(
        `[openrouter] ${res.status} après ${essai} essai(s) — modèle=${corps.model} :`,
        detail,
      );
      // 402 mérite son propre message : c'est le cas qui a motivé ce module.
      if (res.status === 402) {
        throw new Error("Crédits OpenRouter épuisés.");
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error("Clé OpenRouter refusée.");
      }
      if (res.status === 404) {
        throw new Error(`Modèle inconnu d'OpenRouter : ${corps.model}.`);
      }
      throw new Error(`OpenRouter a répondu ${res.status}.`);
    }

    return lireReponse(await res.json());
  }
}
