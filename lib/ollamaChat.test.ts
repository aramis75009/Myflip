import { describe, expect, it } from "vitest";
import { construireCorpsChatOllama } from "./ollamaChat";
import {
  appelsOutils,
  messageAssistantBrut,
  texteAssistant,
  type MessageChat,
  type OutilChat,
} from "./openrouterChat";

const outil: OutilChat = {
  type: "function",
  function: { name: "get_stats", description: "…", parameters: { type: "object", properties: {} } },
};

describe("construireCorpsChatOllama", () => {
  it("place le system prompt en tête, avant l'historique", () => {
    const historique: MessageChat[] = [{ role: "user", content: "Combien de CA ?" }];
    const corps = construireCorpsChatOllama("Tu es l'assistant.", [outil], historique, null);
    expect(corps.messages[0]).toEqual({ role: "system", content: "Tu es l'assistant." });
    expect(corps.messages[1]).toEqual(historique[0]);
  });

  it("retombe sur deepseek-v4.1-flash si aucun modèle n'est fourni", () => {
    expect(construireCorpsChatOllama("s", [], [], null).model).toBe("deepseek-v4.1-flash");
    expect(construireCorpsChatOllama("s", [], [], "   ").model).toBe("deepseek-v4.1-flash");
  });

  it("passe le modèle demandé", () => {
    expect(construireCorpsChatOllama("s", [], [], "gemma4:31b").model).toBe("gemma4:31b");
  });

  it("expose les outils et laisse le modèle décider de les appeler", () => {
    const corps = construireCorpsChatOllama("s", [outil], [], null);
    expect(corps.tools).toEqual([outil]);
    expect(corps.tool_choice).toBe("auto");
  });

  it("laisse une marge de jetons large : la réflexion compte dans le plafond", () => {
    expect(construireCorpsChatOllama("s", [], [], null).max_tokens).toBeGreaterThanOrEqual(4096);
  });

  it("n'envoie `reasoning_effort` que pour un modèle dont la réflexion est connue", () => {
    expect(construireCorpsChatOllama("s", [], [], "deepseek-v4.1-flash").reasoning_effort).toBe("low");
    expect("reasoning_effort" in construireCorpsChatOllama("s", [], [], "gemma4:31b")).toBe(false);
    expect("reasoning_effort" in construireCorpsChatOllama("s", [], [], "inconnu")).toBe(false);
  });
});

// L'assistant lit les réponses d'Ollama Cloud avec les lecteurs d'openrouterChat :
// même format OpenAI. Ces tests tiennent cette hypothèse.
describe("lecture d'une réponse Ollama Cloud avec les lecteurs partagés", () => {
  const reponse = (message: Record<string, unknown>) => ({
    choices: [{ message: { role: "assistant", ...message } }],
  });

  it("lit le texte, et ignore le champ de réflexion", () => {
    const r = reponse({ content: "Le CA est de 1200€.", reasoning: "Je regarde les stats…" });
    expect(texteAssistant(r)).toBe("Le CA est de 1200€.");
  });

  it("lit un appel d'outil dont les arguments sont une chaîne JSON", () => {
    const r = reponse({
      content: "",
      tool_calls: [{ id: "call_1", type: "function", function: { name: "get_stats", arguments: '{"periode":"mois"}' } }],
    });
    expect(appelsOutils(r)).toEqual([{ id: "call_1", name: "get_stats", input: { periode: "mois" } }]);
  });

  it("rejoue le message assistant tel quel, appels d'outils compris", () => {
    const tool_calls = [{ id: "call_1", type: "function" as const, function: { name: "get_stats", arguments: "{}" } }];
    expect(messageAssistantBrut(reponse({ content: null, tool_calls }))).toEqual({
      role: "assistant",
      content: null,
      tool_calls,
    });
  });
});
