import { describe, expect, it } from "vitest";
import {
  construireCorpsChatAnthropic,
  outilsAnthropic,
  reponseEnFormatChat,
  versMessagesAnthropic,
} from "./anthropicChat";
import {
  appelsOutils,
  ErreurAssistant,
  messageAssistantBrut,
  texteAssistant,
  type MessageChat,
  type OutilChat,
} from "./openrouterChat";

const outil: OutilChat = {
  type: "function",
  function: {
    name: "get_articles",
    description: "Liste les articles.",
    parameters: { type: "object", properties: { sku: { type: "string" } } },
  },
};

const reflexion = { type: "thinking", thinking: "", signature: "sig-opaque" };
const appelOutil = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

describe("outilsAnthropic", () => {
  it("traduit les outils OpenAI : name, description, input_schema", () => {
    expect(outilsAnthropic([outil])).toEqual([
      { name: "get_articles", description: "Liste les articles.", input_schema: outil.function.parameters },
    ]);
  });
});

describe("construireCorpsChatAnthropic", () => {
  const historique: MessageChat[] = [{ role: "user", content: "Combien de CA ?" }];

  it("met le system prompt dans son champ, pas dans les messages", () => {
    const corps = construireCorpsChatAnthropic("Tu es l'assistant.", [outil], historique, null);
    expect(corps.system).toBe("Tu es l'assistant.");
    expect(corps.messages).toEqual([{ role: "user", content: "Combien de CA ?" }]);
  });

  it("Sonnet 5.5 par défaut, le modèle demandé sinon", () => {
    expect(construireCorpsChatAnthropic("s", [], [], null).model).toBe("claude-sonnet-5-5");
    expect(construireCorpsChatAnthropic("s", [], [], "   ").model).toBe("claude-sonnet-5-5");
    expect(construireCorpsChatAnthropic("s", [], [], "claude-haiku-5-5").model).toBe("claude-haiku-5-5");
  });

  it("expose les outils, et laisse le modèle décider : jamais d'appel forcé (400 sur Sonnet 5.5)", () => {
    const corps = construireCorpsChatAnthropic("s", [outil], historique, null);
    expect(corps.tools).toHaveLength(1);
    expect(corps.tool_choice).toEqual({ type: "auto" });
  });

  it("laisse une marge de jetons large : la réflexion compte dans le plafond", () => {
    expect(construireCorpsChatAnthropic("s", [], [], null).max_tokens).toBeGreaterThanOrEqual(4096);
  });

  it("règle l'effort d'après le catalogue seulement", () => {
    expect(construireCorpsChatAnthropic("s", [], [], "claude-sonnet-5-5").output_config).toEqual({ effort: "medium" });
    expect(construireCorpsChatAnthropic("s", [], [], "claude-haiku-5-5").output_config).toEqual({ effort: "low" });
    expect("output_config" in construireCorpsChatAnthropic("s", [], [], "claude-opus-5-5")).toBe(false);
  });

  it("n'envoie aucun échantillonnage ni réglage de réflexion", () => {
    const corps = construireCorpsChatAnthropic("s", [outil], historique, null) as Record<string, unknown>;
    for (const champ of ["temperature", "top_p", "top_k", "thinking"]) expect(champ in corps).toBe(false);
  });
});

describe("versMessagesAnthropic", () => {
  it("traduit un tour d'outil de lecture : texte + appel, puis son résultat", () => {
    const h: MessageChat[] = [
      { role: "user", content: "Mes articles PRL ?" },
      {
        role: "assistant",
        content: "Je regarde.",
        tool_calls: [{ id: "toolu_1", type: "function", function: { name: "get_articles", arguments: '{"sku":"PRL"}' } }],
      },
      { role: "tool", tool_call_id: "toolu_1", content: '{"total":3}' },
    ];
    expect(versMessagesAnthropic(h)).toEqual([
      { role: "user", content: "Mes articles PRL ?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Je regarde." },
          appelOutil("toolu_1", "get_articles", { sku: "PRL" }),
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: '{"total":3}' }] },
    ]);
  });

  it("rejoue VERBATIM les blocs d'origine (réflexion signée comprise) quand l'assistant en porte", () => {
    const blocs = [reflexion, appelOutil("toolu_1", "get_articles", { sku: "PRL" })];
    const h: MessageChat[] = [
      { role: "user", content: "Q" },
      {
        role: "assistant",
        content: null,
        tool_calls: [{ id: "toolu_1", type: "function", function: { name: "get_articles", arguments: '{"sku":"PRL"}' } }],
        anthropic_content: blocs,
      },
      { role: "tool", tool_call_id: "toolu_1", content: "{}" },
    ];
    const m = versMessagesAnthropic(h);
    expect(m[1]).toEqual({ role: "assistant", content: blocs });
    expect((m[1].content as unknown[])[0]).toBe(reflexion);
  });

  it("regroupe les résultats de plusieurs outils d'un même tour dans UN seul message utilisateur", () => {
    const h: MessageChat[] = [
      { role: "user", content: "Q" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "a", type: "function", function: { name: "get_stats", arguments: "{}" } },
          { id: "b", type: "function", function: { name: "count_articles", arguments: "{}" } },
        ],
      },
      { role: "tool", tool_call_id: "a", content: "1" },
      { role: "tool", tool_call_id: "b", content: "2" },
    ];
    const m = versMessagesAnthropic(h);
    expect(m).toHaveLength(3);
    expect(m[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "a", content: "1" },
        { type: "tool_result", tool_use_id: "b", content: "2" },
      ],
    });
  });

  it("des arguments illisibles ou non objet deviennent {} : le tour n'est pas perdu", () => {
    const h: MessageChat[] = [
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "a", type: "function", function: { name: "x", arguments: "{pas du json" } },
          { id: "b", type: "function", function: { name: "y", arguments: "[1,2]" } },
          { id: "c", type: "function", function: { name: "z", arguments: "" } },
        ],
      },
    ];
    const blocs = versMessagesAnthropic(h)[0].content as { input: unknown }[];
    expect(blocs.map((b) => b.input)).toEqual([{}, {}, {}]);
  });

  it("écarte un message assistant vide et ignore les messages system", () => {
    const h: MessageChat[] = [
      { role: "system", content: "ignoré" },
      { role: "user", content: "Q" },
      { role: "assistant", content: null },
      { role: "assistant", content: "" },
    ];
    expect(versMessagesAnthropic(h)).toEqual([{ role: "user", content: "Q" }]);
  });
});

describe("reponseEnFormatChat", () => {
  const reponse = (content: unknown[], extra: Record<string, unknown> = {}) => ({
    role: "assistant",
    content,
    stop_reason: "end_turn",
    ...extra,
  });

  it("une réponse en texte se lit avec les lecteurs partagés, sans appel d'outil", () => {
    const r = reponseEnFormatChat(reponse([reflexion, { type: "text", text: " Le CA est de 1200 €. " }]));
    expect(texteAssistant(r)).toBe("Le CA est de 1200 €.");
    expect(appelsOutils(r)).toEqual([]);
  });

  it("un appel d'outil devient un tool_call OpenAI, arguments parsés par appelsOutils", () => {
    const r = reponseEnFormatChat(
      reponse([{ type: "text", text: "Je regarde." }, appelOutil("toolu_9", "get_articles", { sku: "PRL", limit: 5 })], {
        stop_reason: "tool_use",
      }),
    );
    expect(texteAssistant(r)).toBe("Je regarde.");
    expect(appelsOutils(r)).toEqual([{ id: "toolu_9", name: "get_articles", input: { sku: "PRL", limit: 5 } }]);
  });

  it("plusieurs appels dans le même tour", () => {
    const r = reponseEnFormatChat(
      reponse([appelOutil("a", "get_stats", {}), appelOutil("b", "count_articles", { marque: "Lacoste" })], {
        stop_reason: "tool_use",
      }),
    );
    expect(appelsOutils(r).map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("messageAssistantBrut emporte les blocs d'origine, réflexion comprise, pour le tour suivant", () => {
    const blocs = [reflexion, appelOutil("toolu_1", "get_stats", {})];
    const brut = messageAssistantBrut(reponseEnFormatChat(reponse(blocs, { stop_reason: "tool_use" })));
    expect(brut.role).toBe("assistant");
    expect(brut).toMatchObject({ anthropic_content: blocs });
    // Et la boucle complète : brut → messages Anthropic rejoue les blocs tels quels.
    const m = versMessagesAnthropic([{ role: "user", content: "Q" }, brut, { role: "tool", tool_call_id: "toolu_1", content: "{}" }]);
    expect(m[1]).toEqual({ role: "assistant", content: blocs });
  });

  it("une réponse sans appel n'embarque aucun bloc d'origine (rien à rejouer)", () => {
    const brut = messageAssistantBrut(reponseEnFormatChat(reponse([{ type: "text", text: "Bonjour" }])));
    expect("anthropic_content" in brut).toBe(false);
  });

  it("refuse proprement un refus du modèle et une réponse vide", () => {
    expect(() => reponseEnFormatChat(reponse([], { stop_reason: "refusal" }))).toThrow(ErreurAssistant);
    expect(() => reponseEnFormatChat(reponse([]))).toThrow(/Réponse vide/);
    expect(() => reponseEnFormatChat(null)).toThrow(ErreurAssistant);
  });

  it("une réponse coupée par la limite de jetons : le texte seul si elle en a, jamais un appel d'outil tronqué", () => {
    const avecTexte = reponseEnFormatChat(
      reponse([{ type: "text", text: "Début…" }, appelOutil("x", "get_stats", {})], { stop_reason: "max_tokens" }),
    );
    expect(texteAssistant(avecTexte)).toBe("Début…");
    expect(appelsOutils(avecTexte)).toEqual([]);
    expect(() => reponseEnFormatChat(reponse([reflexion], { stop_reason: "max_tokens" }))).toThrow(/limite de jetons/);
  });
});
