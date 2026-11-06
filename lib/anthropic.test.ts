import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allegerRequeteAnthropic,
  annonceAvecRelanceAnthropic,
  construireRequeteAnthropic,
  ErreurReponseAnthropic,
  lireReponseAnthropic,
  messageErreurAnthropic,
  partieImageAnthropic,
  texteDesBlocs,
  typeMimeImage,
} from "./anthropic";
import { instructionsFormat, TITRE_MAX } from "./ollama";

const img = (data: string, mimeType = "image/jpeg") => ({ mimeType, data });

/** Enveloppe une réponse Anthropic autour de blocs de contenu. */
const reponse = (content: unknown[], extra: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  content,
  stop_reason: "end_turn",
  ...extra,
});
const texte = (text: string) => ({ type: "text", text });

const annonce = {
  titre: "Polo Ralph Lauren",
  description: "Belle pièce.",
  motsCles: "polo, ralph lauren",
};

describe("typeMimeImage", () => {
  it("reconnaît le format d'après les premiers caractères du base64, quoi que dise le navigateur", () => {
    expect(typeMimeImage(img("/9j/4AAQSkZJRg==", "image/png"))).toBe("image/jpeg");
    expect(typeMimeImage(img("iVBORw0KGgoAAAANSUhEUg", "image/jpeg"))).toBe("image/png");
    expect(typeMimeImage(img("R0lGODlhAQABAIAAAAAAAP", "image/jpeg"))).toBe("image/gif");
    expect(typeMimeImage(img("UklGRiQAAABXRUJQVlA4", "image/jpeg"))).toBe("image/webp");
  });

  it("sans signature reconnue, garde le type annoncé s'il est valide", () => {
    expect(typeMimeImage(img("AAAA", "image/png"))).toBe("image/png");
    expect(typeMimeImage(img("AAAA", "IMAGE/WEBP"))).toBe("image/webp");
  });

  it("corrige image/jpg, et retombe sur JPEG pour un type que l'API refuserait", () => {
    expect(typeMimeImage(img("AAAA", "image/jpg"))).toBe("image/jpeg");
    expect(typeMimeImage(img("AAAA", "image/heic"))).toBe("image/jpeg");
    expect(typeMimeImage(img("AAAA", ""))).toBe("image/jpeg");
  });
});

describe("partieImageAnthropic", () => {
  it("construit un bloc image base64 avec media_type et data (sans préfixe data:)", () => {
    expect(partieImageAnthropic(img("AAA", "image/png"))).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: "AAA" },
    });
  });
});

describe("construireRequeteAnthropic", () => {
  it("un seul message utilisateur : les photos d'abord, puis le texte (prompt + format)", () => {
    const corps = construireRequeteAnthropic("Écris l'annonce.", [img("AAA"), img("BBB", "image/png")], "claude-haiku-5-5");
    expect(corps.messages).toHaveLength(1);
    const { role, content } = corps.messages[0];
    expect(role).toBe("user");
    expect(content.map((p) => p.type)).toEqual(["image", "image", "text"]);
    const t = content[2] as { type: "text"; text: string };
    expect(t.text.startsWith("Écris l'annonce.")).toBe(true);
    expect(t.text).toContain(instructionsFormat());
  });

  it("passe le modèle demandé et laisse une marge de jetons large (la réflexion compte)", () => {
    const corps = construireRequeteAnthropic("p", [img("A")], "claude-sonnet-5-5");
    expect(corps.model).toBe("claude-sonnet-5-5");
    expect(corps.max_tokens).toBeGreaterThanOrEqual(4096);
  });

  it("demande le JSON structuré avec un schéma strict : trois champs texte requis, rien d'autre", () => {
    const format = construireRequeteAnthropic("p", [], "claude-haiku-5-5").output_config?.format;
    expect(format?.type).toBe("json_schema");
    expect(format?.schema.required).toEqual(["titre", "description", "motsCles"]);
    expect(format?.schema.additionalProperties).toBe(false);
    expect(Object.keys(format?.schema.properties ?? {})).toEqual(["titre", "description", "motsCles"]);
  });

  it("règle l'effort d'après le catalogue, et n'en envoie pas pour un modèle saisi à la main", () => {
    expect(construireRequeteAnthropic("p", [], "claude-haiku-5-5").output_config?.effort).toBe("medium");
    expect(construireRequeteAnthropic("p", [], "claude-sonnet-5-5").output_config?.effort).toBe("medium");
    const libre = construireRequeteAnthropic("p", [], "claude-opus-5-5").output_config;
    expect(libre).toBeDefined();
    expect("effort" in (libre ?? {})).toBe(false);
  });

  it("n'envoie ni échantillonnage, ni prefill, ni outil, ni réglage de réflexion (refusés par ces modèles)", () => {
    const corps = construireRequeteAnthropic("p", [img("A")], "claude-haiku-5-5") as Record<string, unknown>;
    for (const champ of ["temperature", "top_p", "top_k", "thinking", "tools", "tool_choice", "system"]) {
      expect(champ in corps).toBe(false);
    }
    // Le dernier message est celui de l'utilisateur : pas de prefill.
    expect(corps.messages).toHaveLength(1);
  });

  it("n'ajoute la correction qu'à la relance", () => {
    const sans = construireRequeteAnthropic("p", [], "claude-haiku-5-5").messages[0].content.at(-1) as { text: string };
    const avec = construireRequeteAnthropic("p", [], "claude-haiku-5-5", "Titre trop long.").messages[0].content.at(
      -1,
    ) as { text: string };
    expect(sans.text).not.toMatch(/refusée/);
    expect(avec.text).toMatch(/refusée : Titre trop long\. Recommence/);
  });

  it("ne contient jamais la clé : elle voyage dans un en-tête, pas dans le corps", () => {
    expect(JSON.stringify(construireRequeteAnthropic("p", [img("A")], "claude-haiku-5-5"))).not.toMatch(/api[-_]?key/i);
  });
});

describe("texteDesBlocs", () => {
  it("ne garde que les blocs texte, bout à bout", () => {
    expect(
      texteDesBlocs([{ type: "thinking", thinking: "", signature: "x" }, texte("A"), { type: "tool_use" }, texte("B")]),
    ).toBe("A\nB");
  });

  it("rend une chaîne vide pour tout ce qui n'est pas une liste de blocs", () => {
    expect(texteDesBlocs(undefined)).toBe("");
    expect(texteDesBlocs("texte")).toBe("");
    expect(texteDesBlocs([null, 3, {}])).toBe("");
  });
});

describe("lireReponseAnthropic", () => {
  it("lit un JSON propre", () => {
    expect(lireReponseAnthropic(reponse([texte(JSON.stringify(annonce))]))).toEqual(annonce);
  });

  it("ignore le bloc de réflexion placé avant la réponse", () => {
    const r = reponse([{ type: "thinking", thinking: "", signature: "abc" }, texte(JSON.stringify(annonce))]);
    expect(lireReponseAnthropic(r)).toEqual(annonce);
  });

  it("tolère les fences markdown et la prose autour du JSON", () => {
    expect(lireReponseAnthropic(reponse([texte("```json\n" + JSON.stringify(annonce) + "\n```")]))).toEqual(annonce);
    expect(lireReponseAnthropic(reponse([texte("Voici l'annonce : " + JSON.stringify(annonce) + " Bonne vente !")]))).toEqual(
      annonce,
    );
  });

  it("recolle des mots-clés rendus en tableau", () => {
    const r = reponse([texte(JSON.stringify({ ...annonce, motsCles: ["polo", "ralph lauren"] }))]);
    expect(lireReponseAnthropic(r).motsCles).toBe("polo, ralph lauren");
  });

  it("refuse (relançable) une réponse vide, non-JSON, incomplète ou au titre trop long", () => {
    expect(() => lireReponseAnthropic(reponse([]))).toThrow(ErreurReponseAnthropic);
    expect(() => lireReponseAnthropic(reponse([texte("Voici votre annonce !")]))).toThrow(/non-JSON/);
    expect(() => lireReponseAnthropic(reponse([texte(JSON.stringify({ titre: "T" }))]))).toThrow(/incomplète/);
    const trop = reponse([texte(JSON.stringify({ ...annonce, titre: "x".repeat(TITRE_MAX + 1) }))]);
    expect(() => lireReponseAnthropic(trop)).toThrow(ErreurReponseAnthropic);
    expect(() => lireReponseAnthropic(trop)).toThrow(/trop long/);
  });

  it("signale une réponse tronquée par la limite de jetons", () => {
    const r = reponse([texte('{"titre": "Polo", "descr')], { stop_reason: "max_tokens" });
    expect(() => lireReponseAnthropic(r)).toThrow(/tronquée par la limite de jetons/);
    expect(() => lireReponseAnthropic(r)).toThrow(ErreurReponseAnthropic);
  });

  it("une erreur dans le corps ou un refus du modèle ne se relance pas", () => {
    const enCorps = { type: "error", error: { type: "overloaded_error", message: "Overloaded" } };
    expect(() => lireReponseAnthropic(enCorps)).toThrow(/Anthropic : Overloaded/);
    expect(() => lireReponseAnthropic(enCorps)).not.toThrow(ErreurReponseAnthropic);
    const refus = reponse([], { stop_reason: "refusal", stop_details: { type: "refusal", category: "general_harms" } });
    expect(() => lireReponseAnthropic(refus)).toThrow(/décliné/);
    expect(() => lireReponseAnthropic(refus)).not.toThrow(ErreurReponseAnthropic);
  });

  it("ne plante pas sur un corps absent ou étranger", () => {
    expect(() => lireReponseAnthropic(null)).toThrow(ErreurReponseAnthropic);
    expect(() => lireReponseAnthropic({ choices: [] })).toThrow(ErreurReponseAnthropic);
  });
});

describe("messageErreurAnthropic", () => {
  it("un message sûr par statut, qui nomme le modèle pour un 404", () => {
    expect(messageErreurAnthropic(401, "m", "annonce")).toBe("La clé Anthropic est refusée.");
    expect(messageErreurAnthropic(403, "m", "annonce")).toMatch(/refusée/);
    expect(messageErreurAnthropic(404, "claude-x", "annonce")).toBe("Le modèle claude-x est inconnu d'Anthropic.");
    expect(messageErreurAnthropic(429, "m", "annonce")).toMatch(/limite d'usage/);
    expect(messageErreurAnthropic(529, "m", "annonce")).toMatch(/surchargé/);
    expect(messageErreurAnthropic(413, "m", "annonce")).toMatch(/volumineuse/);
    expect(messageErreurAnthropic(0, "m", "annonce")).toBe("Anthropic est injoignable.");
    expect(messageErreurAnthropic(500, "m", "annonce")).toBe("Anthropic a répondu 500.");
  });

  it("reconnaît le crédit épuisé, signalé par un 400 et non un 402", () => {
    const detail = '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}';
    expect(messageErreurAnthropic(400, "m", "annonce", detail)).toMatch(/crédit .* épuisé/);
    expect(messageErreurAnthropic(402, "m", "annonce")).toMatch(/crédit .* épuisé/);
    expect(messageErreurAnthropic(400, "m", "annonce", "autre chose")).toBe("Anthropic a répondu 400.");
  });

  it("préfixe pour l'assistant, et ne reprend jamais le corps de la réponse", () => {
    expect(messageErreurAnthropic(401, "m", "chat")).toBe("Assistant indisponible : la clé Anthropic est refusée.");
    const m = messageErreurAnthropic(400, "m", "chat", "x-api-key: sk-ant-secret schema interne");
    expect(m).not.toContain("sk-ant-secret");
    expect(m).not.toContain("schema interne");
  });
});

describe("allegerRequeteAnthropic", () => {
  const corps = () => construireRequeteAnthropic("p", [], "claude-haiku-5-5");

  it("retire `effort` quand l'API le refuse, et garde le format", () => {
    const a = allegerRequeteAnthropic(corps(), 400, "This model does not support the effort parameter.");
    expect(a?.output_config?.effort).toBeUndefined();
    expect(a?.output_config?.format).toBeDefined();
  });

  it("retire `format` quand le JSON structuré est refusé, et garde l'effort", () => {
    const a = allegerRequeteAnthropic(corps(), 400, "output_config.format: json_schema is not supported");
    expect(a?.output_config?.format).toBeUndefined();
    expect(a?.output_config?.effort).toBe("medium");
  });

  it("supprime `output_config` quand il ne reste plus rien", () => {
    const sansEffort = allegerRequeteAnthropic(corps(), 400, "effort not supported");
    const vide = allegerRequeteAnthropic(sansEffort!, 400, "output_config.format not supported");
    expect("output_config" in (vide ?? { output_config: 1 })).toBe(false);
  });

  it("ne touche à rien pour un autre statut, un 400 sans rapport ou un corps sans output_config", () => {
    expect(allegerRequeteAnthropic(corps(), 401, "effort")).toBeNull();
    expect(allegerRequeteAnthropic(corps(), 500, "effort")).toBeNull();
    expect(allegerRequeteAnthropic(corps(), 400, "Your credit balance is too low")).toBeNull();
    expect(allegerRequeteAnthropic(corps(), 400, "image: Could not process image")).toBeNull();
    expect(allegerRequeteAnthropic({ model: "m" }, 400, "effort")).toBeNull();
  });

  it("ne modifie pas la requête d'origine", () => {
    const c = corps();
    allegerRequeteAnthropic(c, 400, "effort");
    expect(c.output_config?.effort).toBe("medium");
  });
});

describe("annonceAvecRelanceAnthropic", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const construire = (correction?: string) => construireRequeteAnthropic("Prompt.", [img("A")], "claude-haiku-5-5", correction);
  const valide = reponse([texte(JSON.stringify(annonce))]);
  const invalide = reponse([texte("Voici votre annonce !")]);
  const texteEnvoye = (appeler: ReturnType<typeof vi.fn>, i: number) =>
    (appeler.mock.calls[i][0].messages[0].content.at(-1) as { text: string }).text;

  it("n'appelle qu'une fois quand la première réponse est valide", async () => {
    const appeler = vi.fn().mockResolvedValue(valide);
    await expect(annonceAvecRelanceAnthropic(construire, appeler)).resolves.toEqual(annonce);
    expect(appeler).toHaveBeenCalledTimes(1);
  });

  it("relance UNE fois quand la réponse est invalide, et redit la raison seulement à la seconde", async () => {
    const appeler = vi.fn().mockResolvedValueOnce(invalide).mockResolvedValueOnce(valide);
    await expect(annonceAvecRelanceAnthropic(construire, appeler)).resolves.toEqual(annonce);
    expect(appeler).toHaveBeenCalledTimes(2);
    expect(texteEnvoye(appeler, 0)).not.toMatch(/refusée/);
    expect(texteEnvoye(appeler, 1)).toMatch(/refusée : Réponse du modèle non-JSON/);
  });

  it("abandonne après la seconde réponse invalide, avec un message clair", async () => {
    const appeler = vi.fn().mockResolvedValue(invalide);
    await expect(annonceAvecRelanceAnthropic(construire, appeler)).rejects.toThrow(
      /Anthropic n'a pas rendu une annonce valide après un nouvel essai/,
    );
    expect(appeler).toHaveBeenCalledTimes(2);
  });

  it("ne relance pas une erreur du fournisseur", async () => {
    const appeler = vi.fn().mockResolvedValue({ type: "error", error: { type: "api_error", message: "Boom" } });
    await expect(annonceAvecRelanceAnthropic(construire, appeler)).rejects.toThrow(/Anthropic : Boom/);
    expect(appeler).toHaveBeenCalledTimes(1);
  });

  it("ne relance pas un refus du modèle", async () => {
    const appeler = vi.fn().mockResolvedValue(reponse([], { stop_reason: "refusal" }));
    await expect(annonceAvecRelanceAnthropic(construire, appeler)).rejects.toThrow(/décliné/);
    expect(appeler).toHaveBeenCalledTimes(1);
  });
});
