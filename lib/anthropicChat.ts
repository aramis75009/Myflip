// Client Anthropic pour l'assistant conversationnel (serveur uniquement).
//
// Jumeau de `lib/ollamaChat.ts` pour le troisième fournisseur. La route
// `/api/chat` parle UN seul format, celui des chat completions OpenAI
// (`MessageChat`, `tool_calls`, `role: "tool"`), et lit les réponses avec
// `texteAssistant`, `appelsOutils` et `messageAssistantBrut`
// (`lib/openrouterChat.ts`). Anthropic parle un autre format (blocs `text`,
// `tool_use`, `tool_result`) : ce module TRADUIT, dans les deux sens, et la
// route n'a rien à savoir :
//   • `versMessagesAnthropic` : l'historique OpenAI → les messages Anthropic ;
//   • `reponseEnFormatChat`  : la réponse Anthropic → une réponse « chat
//     completions » que les lecteurs partagés comprennent.
//
// ⚠️ La réflexion (blocs `thinking`, signés) DOIT être rejouée telle quelle
// quand on renvoie le résultat d'un outil : sans elle, l'API refuse le tour. La
// traduction en format OpenAI la perdrait ; la réponse traduite embarque donc
// les blocs d'origine dans `anthropic_content`, `messageAssistantBrut` les
// remet dans l'historique, et `versMessagesAnthropic` les rejoue verbatim.
//
// Pur et testé : `construireCorpsChatAnthropic`, `versMessagesAnthropic`,
// `reponseEnFormatChat`. Réseau, non testé : `appelerChatAnthropic`.

import { posterAnthropic, ErreurAnthropic, ErreurReponseAnthropic, messageErreurAnthropic, texteDesBlocs } from "@/lib/anthropic";
import { effortAnthropic, MODELE_CHAT_ANTHROPIC_PAR_DEFAUT, type EffortAnthropic } from "@/lib/modelesIA";
import { erreurDansCorps, masquerSecret } from "@/lib/ollama";
import {
  ErreurAssistant,
  type AppelOutilBrut,
  type MessageChat,
  type OutilChat,
} from "@/lib/openrouterChat";

type BlocAnthropic = Record<string, unknown>;

export type MessageAnthropic =
  | { role: "user"; content: string | BlocAnthropic[] }
  | { role: "assistant"; content: BlocAnthropic[] };

export type OutilAnthropic = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type CorpsRequeteChatAnthropic = {
  model: string;
  max_tokens: number;
  system: string;
  tools: OutilAnthropic[];
  /**
   * Toujours `auto` : Claude Sonnet 5.5 refuse un appel d'outil forcé (400) et
   * l'assistant décide lui-même d'appeler un outil ou de répondre.
   */
  tool_choice: { type: "auto" };
  messages: MessageAnthropic[];
  /** Absent pour un modèle hors catalogue (cf. `effortAnthropic`). */
  output_config?: { effort: EffortAnthropic };
};

/**
 * Marge de jetons de l'assistant. Comme sur Ollama Cloud : les jetons de
 * réflexion comptent dans le plafond, 1024 s'épuisait avant le premier mot.
 */
const MAX_JETONS_CHAT = 4096;

/** Les outils de la route (format OpenAI) dans le format Anthropic. */
export function outilsAnthropic(outils: OutilChat[]): OutilAnthropic[] {
  return outils.map((o) => ({
    name: o.function.name,
    description: o.function.description,
    input_schema: o.function.parameters,
  }));
}

/** Arguments d'un appel d'outil (chaîne JSON) en objet ; `{}` si illisibles. */
function entreeOutil(brut: string): Record<string, unknown> {
  try {
    const v: unknown = brut ? JSON.parse(brut) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Vrai pour un message utilisateur qui ne porte que des résultats d'outils. */
function estResultatsOutils(m: MessageAnthropic | undefined): m is { role: "user"; content: BlocAnthropic[] } {
  return (
    m?.role === "user" &&
    Array.isArray(m.content) &&
    m.content.length > 0 &&
    m.content.every((b) => b.type === "tool_result")
  );
}

/**
 * L'historique de la route (format OpenAI) en messages Anthropic.
 *
 *   • `user` → un message utilisateur ;
 *   • `assistant` → ses blocs d'origine (`anthropic_content`, réflexion
 *     comprise) s'il en porte, sinon reconstruits : un bloc `text`, puis un
 *     bloc `tool_use` par `tool_calls` ;
 *   • `tool` → des blocs `tool_result`, TOUS dans un seul message utilisateur
 *     quand plusieurs outils ont été appelés dans le même tour (Anthropic veut
 *     les résultats d'un tour ensemble, et en tête du message) ;
 *   • `system` → ignoré : le system prompt a son propre champ.
 *
 * Un message assistant vide (ni texte ni appel) est écarté : l'API refuse un
 * contenu vide.
 */
export function versMessagesAnthropic(historique: MessageChat[]): MessageAnthropic[] {
  const sortie: MessageAnthropic[] = [];
  for (const m of historique) {
    if (m.role === "user") {
      sortie.push({ role: "user", content: m.content });
    } else if (m.role === "assistant") {
      let blocs: BlocAnthropic[];
      if (Array.isArray(m.anthropic_content) && m.anthropic_content.length > 0) {
        blocs = m.anthropic_content as BlocAnthropic[];
      } else {
        blocs = [];
        if (m.content) blocs.push({ type: "text", text: m.content });
        for (const t of m.tool_calls ?? []) {
          blocs.push({ type: "tool_use", id: t.id, name: t.function.name, input: entreeOutil(t.function.arguments) });
        }
      }
      if (blocs.length > 0) sortie.push({ role: "assistant", content: blocs });
    } else if (m.role === "tool") {
      const bloc = { type: "tool_result", tool_use_id: m.tool_call_id, content: m.content };
      const dernier = sortie[sortie.length - 1];
      if (estResultatsOutils(dernier)) dernier.content.push(bloc);
      else sortie.push({ role: "user", content: [bloc] });
    }
  }
  return sortie;
}

/** Construit le corps de l'appel : system prompt, outils, puis l'historique traduit. */
export function construireCorpsChatAnthropic(
  system: string,
  outils: OutilChat[],
  historique: MessageChat[],
  modele: string | null | undefined,
): CorpsRequeteChatAnthropic {
  const id = modele?.trim() || MODELE_CHAT_ANTHROPIC_PAR_DEFAUT;
  const effort = effortAnthropic(id, "chat");
  return {
    model: id,
    max_tokens: MAX_JETONS_CHAT,
    system,
    tools: outilsAnthropic(outils),
    tool_choice: { type: "auto" },
    messages: versMessagesAnthropic(historique),
    ...(effort ? { output_config: { effort } } : {}),
  };
}

/**
 * Une réponse Anthropic au format « chat completions » : ce que lisent
 * `texteAssistant`, `appelsOutils` et `messageAssistantBrut`.
 *
 * `anthropic_content` garde les blocs d'origine pour le tour suivant (voir
 * l'en-tête). Lève `ErreurAssistant` quand il n'y a rien d'exploitable : refus
 * du modèle, ou réponse coupée par la limite de jetons sans un mot ni un appel
 * complet (un `tool_use` tronqué porterait des arguments incomplets).
 */
export function reponseEnFormatChat(json: unknown): unknown {
  const reponse = json as { content?: unknown; stop_reason?: unknown } | null | undefined;
  if (reponse?.stop_reason === "refusal") {
    throw new ErreurAssistant("Assistant indisponible : Anthropic a décliné cette demande.");
  }

  const blocs = Array.isArray(reponse?.content)
    ? (reponse.content as unknown[]).filter((b): b is BlocAnthropic => Boolean(b) && typeof b === "object")
    : [];
  if (blocs.length === 0) throw new ErreurAssistant("Réponse vide du modèle.");

  const coupee = reponse?.stop_reason === "max_tokens";
  const texte = texteDesBlocs(blocs).trim();
  const appels: AppelOutilBrut[] = coupee
    ? []
    : blocs
        .filter((b) => b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string")
        .map((b) => ({
          id: b.id as string,
          type: "function" as const,
          function: { name: b.name as string, arguments: JSON.stringify(b.input ?? {}) },
        }));

  if (coupee && !texte) {
    throw new ErreurAssistant("Assistant indisponible : la réponse a été coupée par la limite de jetons, reformule plus court.");
  }

  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: texte || null,
          ...(appels.length > 0 ? { tool_calls: appels } : {}),
          // Une réponse coupée n'est pas rejouée : elle n'a pas d'appel d'outil.
          ...(appels.length > 0 ? { anthropic_content: blocs } : {}),
        },
      },
    ],
  };
}

/**
 * Envoie un tour de conversation à Anthropic et renvoie la réponse, déjà au
 * format « chat completions » — encore à interpréter avec `texteAssistant` /
 * `appelsOutils` (`lib/openrouterChat.ts`).
 *
 * Une erreur placée dans le corps d'un 200 est levée ICI, avec la clé masquée.
 */
export async function appelerChatAnthropic(corps: CorpsRequeteChatAnthropic, apiKey: string): Promise<unknown> {
  let json: unknown;
  try {
    json = await posterAnthropic(corps, apiKey, "anthropic-chat");
  } catch (err) {
    if (err instanceof ErreurAnthropic) {
      throw new ErreurAssistant(messageErreurAnthropic(err.status, corps.model, "chat", err.detail));
    }
    if (err instanceof ErreurReponseAnthropic) {
      throw new ErreurAssistant(`Assistant indisponible : ${err.message}`);
    }
    throw err;
  }

  const enCorps = erreurDansCorps(json);
  if (enCorps) throw new ErreurAssistant(masquerSecret(`Anthropic : ${enCorps}`, apiKey));
  return reponseEnFormatChat(json);
}
