import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  allegerRequete,
  annonceAvecRelance,
  construireRequeteOllama,
  erreurDansCorps,
  ErreurOllama,
  ErreurReponseOllama,
  FORME_IMAGE_URL,
  instructionsFormat,
  lireReponseOllama,
  masquerSecret,
  messageErreurOllama,
  partieImageOllama,
  TITRE_MAX,
} from "./ollama";

const img = (data: string, mimeType = "image/jpeg") => ({ mimeType, data });

/** Enveloppe une réponse Ollama Cloud (format OpenAI) autour d'un contenu d'assistant. */
const reponse = (content: unknown, extra: Record<string, unknown> = {}) => ({
  choices: [{ message: { role: "assistant", content, ...extra } }],
});

const annonce = {
  titre: "Polo Ralph Lauren",
  description: "Belle pièce.",
  motsCles: "polo, ralph lauren",
};

describe("partieImageOllama", () => {
  it("construit une data-URL base64 avec le type MIME réel du fichier", () => {
    // Ollama Cloud ne lit pas les images par adresse : base64 uniquement.
    expect(partieImageOllama(img("AAA"), "objet")).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAA" },
    });
    expect(partieImageOllama(img("ZZZ", "image/png"), "objet")).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,ZZZ" },
    });
  });

  it("sait écrire `image_url` en chaîne, comme l'exemple de la documentation Ollama", () => {
    // Le doute documenté dans lib/ollama.ts : objet (forme OpenAI) ou chaîne
    // (exemple Ollama). Les deux formes existent pour qu'un seul réglage
    // (`FORME_IMAGE_URL`) suffise si le premier appel réel refuse les images.
    expect(partieImageOllama(img("AAA"), "chaine")).toEqual({
      type: "image_url",
      image_url: "data:image/jpeg;base64,AAA",
    });
  });

  it("construit par défaut la forme objet, celle de tout client compatible OpenAI", () => {
    expect(FORME_IMAGE_URL).toBe("objet");
    expect(partieImageOllama(img("AAA"))).toEqual(partieImageOllama(img("AAA"), "objet"));
  });
});

describe("construireRequeteOllama", () => {
  it("place le texte puis les photos dans un seul message utilisateur", () => {
    const corps = construireRequeteOllama("Rédige l'annonce.", [img("AAA"), img("BBB")], "gemma4:31b");
    expect(corps.messages).toHaveLength(1);
    expect(corps.messages[0].role).toBe("user");
    const [texte, ...photos] = corps.messages[0].content;
    expect(texte.type).toBe("text");
    expect(photos).toEqual([
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,BBB" } },
    ]);
  });

  it("commence le texte par le prompt, suivi de la description du format", () => {
    const corps = construireRequeteOllama("Rédige l'annonce.", [img("A")], "gemma4:31b");
    const texte = (corps.messages[0].content[0] as { text: string }).text;
    expect(texte.startsWith("Rédige l'annonce.")).toBe(true);
    expect(texte).toContain(instructionsFormat());
  });

  it("décrit le schéma en toutes lettres : clés, chaînes, titre à 100 caractères", () => {
    // Le cloud ne garantit pas `response_format` : sans cette description, un
    // modèle qui n'a pas lu le schéma répond en prose.
    const f = instructionsFormat();
    for (const cle of ["titre", "description", "motsCles"]) expect(f).toContain(`"${cle}"`);
    expect(f).toContain(String(TITRE_MAX));
    expect(f).toMatch(/JSON/);
  });

  it("envoie AUSSI le schéma JSON, sur les trois champs de l'annonce et eux seuls", () => {
    const { json_schema, type } = construireRequeteOllama("p", [img("A")], "gemma4:31b").response_format;
    expect(type).toBe("json_schema");
    expect(json_schema.strict).toBe(true);
    expect(json_schema.schema.additionalProperties).toBe(false);
    expect(Object.keys(json_schema.schema.properties).sort()).toEqual(["description", "motsCles", "titre"]);
    expect([...json_schema.schema.required].sort()).toEqual(["description", "motsCles", "titre"]);
  });

  it("passe le modèle demandé", () => {
    expect(construireRequeteOllama("p", [img("A")], "glm-5.3-flash").model).toBe("glm-5.3-flash");
  });

  it("n'envoie `reasoning_effort` que pour un modèle dont la réflexion est connue", () => {
    // Ollama refuse le champ sur un modèle qui ne réfléchit pas : mieux vaut
    // ne rien envoyer qu'échouer à chaque génération.
    expect(construireRequeteOllama("p", [img("A")], "deepseek-v4.1-flash").reasoning_effort).toBe("medium");
    expect("reasoning_effort" in construireRequeteOllama("p", [img("A")], "gemma4:31b")).toBe(false);
    expect("reasoning_effort" in construireRequeteOllama("p", [img("A")], "modele-saisi-a-la-main")).toBe(false);
  });

  it("n'ajoute aucune correction à la première demande", () => {
    const texte = (construireRequeteOllama("p", [img("A")], "x").messages[0].content[0] as { text: string }).text;
    expect(texte).not.toMatch(/refusée/);
  });

  it("redit au modèle pourquoi sa réponse a été refusée, à la relance", () => {
    const corps = construireRequeteOllama("p", [img("A")], "x", "Titre trop long : 130 caractères, 100 au maximum.");
    const texte = (corps.messages[0].content[0] as { text: string }).text;
    expect(texte).toContain("Ta réponse précédente a été refusée : Titre trop long : 130 caractères, 100 au maximum.");
  });
});

describe("lireReponseOllama", () => {
  it("lit une réponse JSON nominale", () => {
    expect(lireReponseOllama(reponse(JSON.stringify(annonce)))).toEqual(annonce);
  });

  it("retire les fences markdown", () => {
    const contenu = "```json\n" + JSON.stringify(annonce) + "\n```";
    expect(lireReponseOllama(reponse(contenu))).toEqual(annonce);
  });

  it("lit un JSON noyé dans du texte, avant comme après", () => {
    const contenu = `Voici l'annonce demandée :\n${JSON.stringify(annonce)}\nBonne vente !`;
    expect(lireReponseOllama(reponse(contenu))).toEqual(annonce);
  });

  it("lit un JSON fencé au milieu de prose", () => {
    const contenu = "Bien sûr.\n```json\n" + JSON.stringify(annonce) + "\n```\nJ'espère que ça convient.";
    expect(lireReponseOllama(reponse(contenu))).toEqual(annonce);
  });

  it("ignore les accolades de prose qui précèdent la vraie réponse", () => {
    // Un modèle qui réfléchit à voix haute sème des accolades avant la réponse.
    const contenu = `Je dois produire {titre, description, motsCles} sans dépasser 100 caractères.\n${JSON.stringify(annonce)}`;
    expect(lireReponseOllama(reponse(contenu))).toEqual(annonce);
  });

  it("garde l'objet qui porte un titre quand plusieurs objets sont présents", () => {
    const contenu = `{"note": "brouillon"}\n${JSON.stringify(annonce)}`;
    expect(lireReponseOllama(reponse(contenu))).toEqual(annonce);
  });

  it("supporte des accolades à l'intérieur des chaînes de l'annonce", () => {
    const avecAccolades = { ...annonce, description: "Taille {M}, coupe \"regular\" } fin." };
    const contenu = `Voilà : ${JSON.stringify(avecAccolades)} Terminé.`;
    expect(lireReponseOllama(reponse(contenu))).toEqual(avecAccolades);
  });

  it("lit un objet renvoyé encodé deux fois (une chaîne qui contient le JSON)", () => {
    expect(lireReponseOllama(reponse(JSON.stringify(JSON.stringify(annonce))))).toEqual(annonce);
  });

  it("accepte un contenu découpé en plusieurs blocs de texte", () => {
    const s = JSON.stringify(annonce);
    const parts = [
      { type: "text", text: s.slice(0, 10) },
      { type: "text", text: s.slice(10) },
    ];
    expect(lireReponseOllama(reponse(parts))).toEqual(annonce);
  });

  it("recolle des mots-clés renvoyés en tableau", () => {
    const brut = JSON.stringify({ ...annonce, motsCles: ["polo", "ralph lauren", " vintage "] });
    expect(lireReponseOllama(reponse(brut)).motsCles).toBe("polo, ralph lauren, vintage");
  });

  it("restaure les sauts de ligne doublement échappés", () => {
    const brut = JSON.stringify({ ...annonce, description: "Ligne 1\\nLigne 2" });
    expect(lireReponseOllama(reponse(brut)).description).toBe("Ligne 1\nLigne 2");
  });

  it("ignore le champ de réflexion que renvoie un modèle qui réfléchit", () => {
    const brut = reponse(JSON.stringify(annonce), { reasoning: "Je compte les caractères du titre…" });
    expect(lireReponseOllama(brut)).toEqual(annonce);
  });

  it("accepte un titre de exactement 100 caractères", () => {
    const titre = "x".repeat(TITRE_MAX);
    expect(lireReponseOllama(reponse(JSON.stringify({ ...annonce, titre }))).titre).toBe(titre);
  });

  it("compte les caractères, pas les unités UTF-16 : un émoji vaut un", () => {
    const titre = "😀".repeat(TITRE_MAX);
    expect(titre.length).toBe(TITRE_MAX * 2);
    expect(lireReponseOllama(reponse(JSON.stringify({ ...annonce, titre }))).titre).toBe(titre);
  });

  it("rejette un titre de plus de 100 caractères, avec un message clair", () => {
    const titre = "x".repeat(TITRE_MAX + 1);
    const lire = () => lireReponseOllama(reponse(JSON.stringify({ ...annonce, titre })));
    expect(lire).toThrow(ErreurReponseOllama);
    expect(lire).toThrow(/Titre trop long : 101 caractères, 100 au maximum/);
  });

  it("rejette une annonce à laquelle il manque un champ, en le nommant", () => {
    const partiel = JSON.stringify({ titre: "", description: "d", motsCles: "m" });
    expect(() => lireReponseOllama(reponse(partiel))).toThrow(/titre/i);
    const sansMotsCles = JSON.stringify({ titre: "t", description: "d" });
    expect(() => lireReponseOllama(reponse(sansMotsCles))).toThrow(/motsCles/);
    expect(() => lireReponseOllama(reponse(sansMotsCles))).toThrow(ErreurReponseOllama);
  });

  it("rejette un champ qui n'est pas du texte (objet)", () => {
    const brut = JSON.stringify({ ...annonce, description: { a: 1 } });
    expect(() => lireReponseOllama(reponse(brut))).toThrow(/description/);
  });

  it("rejette un contenu qui n'est pas du JSON, par une erreur relançable", () => {
    const lire = () => lireReponseOllama(reponse("Voici votre annonce !"));
    expect(lire).toThrow(/non-JSON/i);
    expect(lire).toThrow(ErreurReponseOllama);
  });

  it("rejette un JSON tronqué (marge de jetons épuisée)", () => {
    const tronque = JSON.stringify(annonce).slice(0, 40);
    expect(() => lireReponseOllama(reponse(tronque))).toThrow(ErreurReponseOllama);
  });

  it("lit une annonce emballée dans un tableau, mais rejette un tableau qui n'en contient pas", () => {
    expect(lireReponseOllama(reponse(JSON.stringify([annonce])))).toEqual(annonce);
    expect(() => lireReponseOllama(reponse(JSON.stringify(["a", "b"])))).toThrow(ErreurReponseOllama);
  });

  it("rejette une réponse vide ou sans choix, par une erreur relançable", () => {
    expect(() => lireReponseOllama(reponse(""))).toThrow(/vide/i);
    expect(() => lireReponseOllama(reponse(null))).toThrow(ErreurReponseOllama);
    expect(() => lireReponseOllama({ choices: [] })).toThrow(/vide/i);
    expect(() => lireReponseOllama(null)).toThrow(ErreurReponseOllama);
  });

  it("lève une erreur NON relançable quand le corps d'un 200 porte l'erreur du fournisseur", () => {
    const lire = () => lireReponseOllama({ error: { message: "model requires more system memory" } });
    expect(lire).toThrow(/Ollama Cloud : model requires more system memory/);
    expect(lire).not.toThrow(ErreurReponseOllama);
    // Variante : Ollama natif écrit l'erreur en chaîne.
    expect(() => lireReponseOllama({ error: "unauthorized" })).toThrow(/Ollama Cloud : unauthorized/);
  });
});

describe("erreurDansCorps", () => {
  it("lit l'erreur en objet, en chaîne, ou rend null", () => {
    expect(erreurDansCorps({ error: { message: "m" } })).toBe("m");
    expect(erreurDansCorps({ error: "m" })).toBe("m");
    expect(erreurDansCorps({ error: {} })).toBe("erreur sans détail");
    expect(erreurDansCorps({ choices: [] })).toBeNull();
    expect(erreurDansCorps({ error: null })).toBeNull();
    expect(erreurDansCorps(null)).toBeNull();
  });
});

describe("annonceAvecRelance", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const construire = (correction?: string) => construireRequeteOllama("Prompt.", [img("A")], "gemma4:31b", correction);
  const valide = reponse(JSON.stringify(annonce));
  const invalide = reponse("Voici votre annonce !");

  it("n'appelle qu'une fois quand la première réponse est valide", async () => {
    const appeler = vi.fn().mockResolvedValue(valide);
    await expect(annonceAvecRelance(construire, appeler)).resolves.toEqual(annonce);
    expect(appeler).toHaveBeenCalledTimes(1);
  });

  it("relance UNE fois quand la réponse est invalide, et rend la seconde", async () => {
    const appeler = vi.fn().mockResolvedValueOnce(invalide).mockResolvedValueOnce(valide);
    await expect(annonceAvecRelance(construire, appeler)).resolves.toEqual(annonce);
    expect(appeler).toHaveBeenCalledTimes(2);
  });

  it("redit la raison du refus dans la seconde requête, pas dans la première", async () => {
    const appeler = vi.fn().mockResolvedValueOnce(invalide).mockResolvedValueOnce(valide);
    await annonceAvecRelance(construire, appeler);
    const texte = (i: number) => (appeler.mock.calls[i][0].messages[0].content[0] as { text: string }).text;
    expect(texte(0)).not.toMatch(/refusée/);
    expect(texte(1)).toMatch(/refusée : Réponse du modèle non-JSON/);
  });

  it("relance aussi pour un titre trop long", async () => {
    const trop = reponse(JSON.stringify({ ...annonce, titre: "x".repeat(150) }));
    const appeler = vi.fn().mockResolvedValueOnce(trop).mockResolvedValueOnce(valide);
    await expect(annonceAvecRelance(construire, appeler)).resolves.toEqual(annonce);
    expect(appeler.mock.calls[1][0].messages[0].content[0].text).toMatch(/Titre trop long : 150/);
  });

  it("n'en fait JAMAIS plus de deux : après la relance, erreur claire", async () => {
    const appeler = vi.fn().mockResolvedValue(invalide);
    await expect(annonceAvecRelance(construire, appeler)).rejects.toThrow(
      /Ollama Cloud n'a pas rendu une annonce valide après un nouvel essai : Réponse du modèle non-JSON\./,
    );
    expect(appeler).toHaveBeenCalledTimes(2);
  });

  it("ne relance pas une erreur du fournisseur (clé, quota, modèle)", async () => {
    const appeler = vi.fn().mockRejectedValue(new ErreurOllama(401, "unauthorized"));
    await expect(annonceAvecRelance(construire, appeler)).rejects.toBeInstanceOf(ErreurOllama);
    expect(appeler).toHaveBeenCalledTimes(1);
  });

  it("ne relance pas une erreur placée dans le corps d'un 200", async () => {
    const appeler = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    await expect(annonceAvecRelance(construire, appeler)).rejects.toThrow(/Ollama Cloud : boom/);
    expect(appeler).toHaveBeenCalledTimes(1);
  });
});

describe("allegerRequete", () => {
  const corps = { model: "x", reasoning_effort: "medium", response_format: { type: "json_schema" } };

  it("retire `reasoning_effort` quand le serveur se plaint de la réflexion", () => {
    const allege = allegerRequete(corps, 400, '{"error":"\\"gemma4:31b\\" does not support thinking"}');
    expect(allege).toEqual({ model: "x", response_format: { type: "json_schema" } });
    // L'original n'est pas modifié.
    expect("reasoning_effort" in corps).toBe(true);
  });

  it("retire `response_format` quand le serveur refuse le JSON structuré", () => {
    const allege = allegerRequete({ model: "x", response_format: {} }, 400, "structured outputs are not supported");
    expect(allege).toEqual({ model: "x" });
  });

  it("retire un champ à la fois : le suivant se retire au tour d'après", () => {
    const sans1 = allegerRequete(corps, 400, "reasoning_effort invalide");
    expect(sans1).not.toBeNull();
    expect(allegerRequete(sans1!, 400, "reasoning_effort invalide")).toBeNull();
    const sans2 = allegerRequete(sans1!, 422, "response_format non supporté");
    expect(sans2).toEqual({ model: "x" });
  });

  it("ne touche à rien pour un autre statut", () => {
    expect(allegerRequete(corps, 401, "reasoning")).toBeNull();
    expect(allegerRequete(corps, 500, "reasoning")).toBeNull();
    expect(allegerRequete(corps, 429, "response_format")).toBeNull();
  });

  it("ne retire rien pour un 400 sans rapport (image refusée) : l'erreur doit remonter", () => {
    expect(allegerRequete(corps, 400, "invalid image data")).toBeNull();
    expect(allegerRequete(corps, 400, "")).toBeNull();
  });

  it("ne tourne pas dans le vide quand le champ est déjà absent", () => {
    expect(allegerRequete({ model: "x" }, 400, "reasoning is not supported")).toBeNull();
  });
});

describe("messageErreurOllama", () => {
  it("donne une phrase claire par statut, pour les annonces", () => {
    expect(messageErreurOllama(0, "m", "annonce")).toBe("Ollama Cloud est injoignable.");
    expect(messageErreurOllama(401, "m", "annonce")).toBe("La clé Ollama Cloud est refusée.");
    expect(messageErreurOllama(403, "m", "annonce")).toBe("La clé Ollama Cloud est refusée.");
    expect(messageErreurOllama(404, "gemma4:31b", "annonce")).toBe("Le modèle gemma4:31b est inconnu d'Ollama Cloud.");
    expect(messageErreurOllama(429, "m", "annonce")).toMatch(/limite d'usage/);
    expect(messageErreurOllama(402, "m", "annonce")).toMatch(/abonnement/);
    expect(messageErreurOllama(500, "m", "annonce")).toBe("Ollama Cloud a répondu 500.");
  });

  it("préfixe comme les autres erreurs de l'assistant, pour le chat", () => {
    expect(messageErreurOllama(401, "m", "chat")).toBe("Assistant indisponible : la clé Ollama Cloud est refusée.");
    expect(messageErreurOllama(0, "m", "chat")).toBe("Assistant indisponible : Ollama Cloud est injoignable.");
  });
});

describe("masquerSecret", () => {
  it("remplace toute occurrence du secret", () => {
    expect(masquerSecret("Bearer abc123 et encore abc123", "abc123")).toBe("Bearer *** et encore ***");
  });
  it("laisse le texte intact sans secret", () => {
    expect(masquerSecret("rien à masquer", "")).toBe("rien à masquer");
  });
});

describe("ErreurOllama", () => {
  it("porte le statut, et un message qui ne reprend pas le corps de la réponse", () => {
    const e = new ErreurOllama(401, "corps interne avec détails");
    expect(e.status).toBe(401);
    expect(e.message).not.toContain("détails");
    expect(new ErreurOllama(0, "").message).toMatch(/injoignable/);
  });
});
