// Client OpenRouter pour l'assistant conversationnel (serveur uniquement).
//
// Remplace l'appel direct à l'API Anthropic : même bascule que lib/openrouter.ts
// pour la génération d'annonces, mais en format "chat completions" avec appel
// d'outils (tool calling, convention OpenAI) au lieu de JSON schema forcé —
// l'assistant doit pouvoir AGIR (lire des stats, modifier des articles), pas
// produire un objet figé.
//
// Même découpage que lib/openrouter.ts : les fonctions pures de construction
// de requête et de lecture de réponse sont testées (openrouterChat.test.ts) ;
// seul l'appel réseau (`appelerChat`) ne l'est pas.

import { MODELE_CHAT_PAR_DEFAUT } from "@/lib/modelesIA";
import { urlOpenRouter } from "@/lib/openrouterBase";

/**
 * Erreur dont le message est SÛR à renvoyer tel quel au client.
 *
 * La route ne réexpose jamais `err.message` d'une erreur quelconque (une
 * erreur Prisma, par exemple, peut décrire le schéma) — seulement celui d'une
 * `ErreurAssistant`, qui ne porte que des messages français rédigés ici.
 */
export class ErreurAssistant extends Error {}

export type OutilChat = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/** Appel d'outil tel qu'OpenRouter le renvoie : arguments encore en chaîne JSON. */
export type AppelOutilBrut = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type MessageChat =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AppelOutilBrut[] }
  | { role: "tool"; tool_call_id: string; content: string };

/** Appel d'outil une fois les arguments parsés — ce que consomme la route. */
export type AppelOutil = { id: string; name: string; input: Record<string, unknown> };

export type CorpsRequeteChat = {
  model: string;
  messages: MessageChat[];
  tools: OutilChat[];
  tool_choice: "auto";
  max_tokens: number;
};

/** Construit le corps de l'appel : system prompt, puis l'historique tel quel. */
export function construireCorpsChat(
  system: string,
  outils: OutilChat[],
  historique: MessageChat[],
  modele: string | null | undefined,
): CorpsRequeteChat {
  return {
    model: modele?.trim() || MODELE_CHAT_PAR_DEFAUT,
    messages: [{ role: "system", content: system }, ...historique],
    tools: outils,
    tool_choice: "auto",
    max_tokens: 1024,
  };
}

/**
 * Extrait le message assistant d'une réponse OpenRouter.
 *
 * OpenRouter répond parfois 200 avec l'erreur dans le corps (crédits épuisés,
 * modèle indisponible) — même piège que `lireReponse` dans lib/openrouter.ts.
 */
function messageAssistant(json: unknown): {
  content?: unknown;
  tool_calls?: AppelOutilBrut[];
} {
  const enveloppe = json as {
    error?: { message?: string };
    choices?: {
      message?: { content?: unknown; tool_calls?: AppelOutilBrut[] };
    }[];
  };

  if (enveloppe?.error?.message) {
    throw new ErreurAssistant(`OpenRouter : ${enveloppe.error.message}`);
  }

  const message = enveloppe?.choices?.[0]?.message;
  if (!message) throw new ErreurAssistant("Réponse vide du modèle.");
  return message;
}

/** Texte de la réponse — vide si le tour ne contient que des appels d'outils. */
export function texteAssistant(json: unknown): string {
  const { content } = messageAssistant(json);
  return typeof content === "string" ? content.trim() : "";
}

/**
 * Appels d'outils demandés par le modèle, arguments déjà parsés.
 *
 * `arguments` arrive en chaîne JSON (convention OpenAI) : un modèle qui
 * produit un JSON invalide ne doit pas planter tout le tour de conversation
 * sans dire lequel des outils est en cause.
 */
export function appelsOutils(json: unknown): AppelOutil[] {
  const { tool_calls } = messageAssistant(json);
  if (!tool_calls || tool_calls.length === 0) return [];
  return tool_calls.map((t) => {
    let input: Record<string, unknown>;
    try {
      input = t.function.arguments ? JSON.parse(t.function.arguments) : {};
    } catch {
      throw new ErreurAssistant(`Arguments non-JSON pour l'outil ${t.function.name}.`);
    }
    return { id: t.id, name: t.function.name, input };
  });
}

/**
 * Le message assistant brut, à remettre tel quel dans l'historique envoyé au
 * tour suivant — OpenRouter exige de rejouer `tool_calls` verbatim avant les
 * `tool` results qui y répondent.
 */
export function messageAssistantBrut(json: unknown): MessageChat {
  const { content, tool_calls } = messageAssistant(json);
  return {
    role: "assistant",
    content: typeof content === "string" ? content : null,
    ...(tool_calls && tool_calls.length > 0 ? { tool_calls } : {}),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Statuts qui valent un nouvel essai : surcharge côté fournisseur. */
const RETENTABLES = new Set([429, 502, 503, 504]);

/**
 * Envoie un tour de conversation à OpenRouter et renvoie la réponse brute —
 * encore à interpréter avec `texteAssistant` / `appelsOutils`.
 */
export async function appelerChat(
  corps: CorpsRequeteChat,
  apiKey: string,
): Promise<unknown> {
  const MAX_ESSAIS = 3;
  for (let essai = 1; ; essai++) {
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
        body: JSON.stringify(corps),
        cache: "no-store",
      });
    } catch (err) {
      console.error("[openrouter-chat] Appel injoignable :", err);
      throw new ErreurAssistant("Assistant indisponible : OpenRouter injoignable.");
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      if (RETENTABLES.has(res.status) && essai < MAX_ESSAIS) {
        console.error(
          `[openrouter-chat] ${res.status} (essai ${essai}/${MAX_ESSAIS}), nouvel essai dans 2 s…`,
        );
        await sleep(2000);
        continue;
      }
      console.error(
        `[openrouter-chat] ${res.status} après ${essai} essai(s) — modèle=${corps.model} :`,
        detail,
      );
      if (res.status === 402) {
        throw new ErreurAssistant("Assistant indisponible : crédits OpenRouter épuisés.");
      }
      if (res.status === 401 || res.status === 403) {
        throw new ErreurAssistant("Assistant indisponible : clé OpenRouter refusée.");
      }
      if (res.status === 404) {
        throw new ErreurAssistant(`Assistant indisponible : modèle inconnu d'OpenRouter (${corps.model}).`);
      }
      if (res.status === 429) {
        throw new ErreurAssistant("Assistant indisponible : limite de requêtes atteinte, réessaie dans un instant.");
      }
      throw new ErreurAssistant(`Assistant indisponible : OpenRouter a répondu ${res.status}.`);
    }

    return res.json();
  }
}
