// Client Ollama Cloud pour l'assistant conversationnel (serveur uniquement).
//
// Jumeau de `lib/openrouterChat.ts`, pour le fournisseur par défaut. La forme
// des échanges est la MÊME (chat completions OpenAI, `tools` / `tool_calls`),
// donc la lecture des réponses est celle d'`openrouterChat` — `texteAssistant`,
// `appelsOutils`, `messageAssistantBrut` — et ne se duplique pas. Ce module ne
// porte que ce qui diffère : le modèle par défaut, l'effort de réflexion, la
// marge de jetons, l'appel réseau et ses messages d'erreur.
//
// Pur et testé : `construireCorpsChatOllama`. Réseau, non testé :
// `appelerChatOllama`.

import { effortReflexion, MODELE_CHAT_OLLAMA_PAR_DEFAUT } from "@/lib/modelesIA";
import {
  ErreurOllama,
  ErreurReponseOllama,
  erreurDansCorps,
  masquerSecret,
  messageErreurOllama,
  posterOllama,
} from "@/lib/ollama";
import {
  ErreurAssistant,
  type CorpsRequeteChat,
  type MessageChat,
  type OutilChat,
} from "@/lib/openrouterChat";

export type CorpsRequeteChatOllama = CorpsRequeteChat & {
  /** Absent pour un modèle sans réflexion connue (cf. `effortReflexion`). */
  reasoning_effort?: "low" | "medium" | "high";
};

/**
 * Marge de jetons de l'assistant sur Ollama Cloud.
 *
 * Plus large que les 1024 d'OpenRouter : sur un modèle qui réfléchit, les
 * jetons de réflexion comptent dans le plafond. À 1024, une réflexion longue
 * épuisait la marge avant le premier mot de la réponse.
 */
const MAX_JETONS_CHAT = 4096;

/** Construit le corps de l'appel : system prompt, puis l'historique tel quel. */
export function construireCorpsChatOllama(
  system: string,
  outils: OutilChat[],
  historique: MessageChat[],
  modele: string | null | undefined,
): CorpsRequeteChatOllama {
  const id = modele?.trim() || MODELE_CHAT_OLLAMA_PAR_DEFAUT;
  const effort = effortReflexion(id, "chat");
  return {
    model: id,
    messages: [{ role: "system", content: system }, ...historique],
    tools: outils,
    tool_choice: "auto",
    max_tokens: MAX_JETONS_CHAT,
    ...(effort ? { reasoning_effort: effort } : {}),
  };
}

/**
 * Envoie un tour de conversation à Ollama Cloud et renvoie la réponse brute —
 * encore à interpréter avec `texteAssistant` / `appelsOutils`
 * (`lib/openrouterChat.ts`).
 *
 * Une erreur placée dans le corps d'un 200 est levée ICI : les lecteurs
 * d'`openrouterChat` préfixeraient « OpenRouter : » un message d'Ollama.
 */
export async function appelerChatOllama(corps: CorpsRequeteChatOllama, apiKey: string): Promise<unknown> {
  let json: unknown;
  try {
    json = await posterOllama(corps, apiKey, "ollama-chat");
  } catch (err) {
    if (err instanceof ErreurOllama) {
      throw new ErreurAssistant(messageErreurOllama(err.status, corps.model, "chat"));
    }
    if (err instanceof ErreurReponseOllama) {
      throw new ErreurAssistant(`Assistant indisponible : ${err.message}`);
    }
    throw err;
  }

  const enCorps = erreurDansCorps(json);
  if (enCorps) throw new ErreurAssistant(masquerSecret(`Ollama Cloud : ${enCorps}`, apiKey));
  return json;
}
