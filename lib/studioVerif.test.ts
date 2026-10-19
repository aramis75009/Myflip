import { describe, expect, it } from "vitest";
import {
  buildVerifRequest,
  DETAIL_STATUSES,
  errorFromStatus,
  OUT_OF_FRAME_PREFIX,
  readVerifResponse,
  StudioVerifError,
  VERDICTS,
  type VerifInput,
} from "./studioVerif";

const img = (data: string, mimeType = "image/jpeg") => ({ mimeType, data });

const DETAILS = ["patch ELITE côté gauche", "swoosh blanc cassé", "motif camouflage bordeaux"];

const input = (over: Partial<VerifInput> = {}): VerifInput => ({
  references: [img("REF1"), img("REF2")],
  generated: img("GEN"),
  details: DETAILS,
  angle: "Dos ¾ haut gauche",
  ...over,
});

/** Texte des parts de type `text`, dans l'ordre. */
const texts = (body: ReturnType<typeof buildVerifRequest>) =>
  body.messages[0].content.flatMap((p) => (p.type === "text" ? [p.text] : []));

/** Enveloppe une réponse OpenRouter autour d'un contenu d'assistant. */
const reponse = (content: unknown) => ({
  choices: [{ message: { role: "assistant", content } }],
});

/** Une vérification nominale pour `DETAILS`, avec écarts éventuels. */
const verif = (over: Record<string, unknown> = {}) => ({
  details: [
    { detail: DETAILS[0], statut: "fidele", note: "Patch bien placé à gauche." },
    { detail: DETAILS[1], statut: "derive", note: "Le swoosh est blanc pur." },
    { detail: DETAILS[2], statut: "absent", note: "Motif introuvable." },
  ],
  angleRespecte: true,
  scoreGlobal: 72,
  verdict: "a_corriger",
  ...over,
});

const lire = (content: unknown, details = DETAILS) =>
  readVerifResponse(reponse(content), details);

/** Vérifie qu'une erreur est une `StudioVerifError` de ce code, et rend son message. */
function erreurDe(fn: () => unknown, code: string): string {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(StudioVerifError);
    expect((err as StudioVerifError).code).toBe(code);
    return (err as StudioVerifError).message;
  }
  throw new Error("aucune erreur levée");
}

describe("buildVerifRequest", () => {
  it("puts the prompt first, then each labelled image, generated image last, in one user message", () => {
    const body = buildVerifRequest(input(), "x/y");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");

    const parts = body.messages[0].content;
    expect(parts).toHaveLength(1 + 2 * 2 + 2); // prompt + 2 références + générée
    expect(parts[0].type).toBe("text");
    expect(parts.slice(1)).toEqual([
      { type: "text", text: "Photo de référence 1 sur 2 :" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,REF1" } },
      { type: "text", text: "Photo de référence 2 sur 2 :" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,REF2" } },
      { type: "text", text: "Image GÉNÉRÉE à noter :" },
      { type: "image_url", image_url: { url: "data:image/jpeg;base64,GEN" } },
    ]);
  });

  it("follows the real MIME type of each image in its data URL", () => {
    const body = buildVerifRequest(
      input({ references: [img("R", "image/webp")], generated: img("G", "image/png") }),
      "x/y",
    );
    const urls = body.messages[0].content.flatMap((p) =>
      p.type === "image_url" ? [p.image_url.url] : [],
    );
    expect(urls).toEqual(["data:image/webp;base64,R", "data:image/png;base64,G"]);
  });

  it("passes the requested model", () => {
    expect(buildVerifRequest(input(), "anthropic/claude-haiku-4.5").model).toBe(
      "anthropic/claude-haiku-4.5",
    );
  });

  it("lists every detail, numbered, and states the requested angle", () => {
    const [prompt] = texts(buildVerifRequest(input(), "x/y"));
    expect(prompt).toContain("1. patch ELITE côté gauche");
    expect(prompt).toContain("2. swoosh blanc cassé");
    expect(prompt).toContain("3. motif camouflage bordeaux");
    expect(prompt).toContain("Angle demandé au générateur : Dos ¾ haut gauche");
  });

  it("tells the model how many references there are", () => {
    const un = texts(buildVerifRequest(input({ references: [img("R")] }), "x/y"))[0];
    const trois = texts(
      buildVerifRequest(input({ references: [img("A"), img("B"), img("C")] }), "x/y"),
    )[0];
    expect(un).toContain("UNE photo de RÉFÉRENCE");
    expect(trois).toContain("3 photos de RÉFÉRENCE");
  });

  it("gives the prompt a fallback when no angle is provided", () => {
    for (const angle of [undefined, null, "   "]) {
      const [prompt] = texts(buildVerifRequest(input({ angle }), "x/y"));
      expect(prompt).not.toContain("Angle demandé au générateur");
      expect(prompt).toContain("Aucun angle précis n'a été fourni");
    }
  });

  it("accepts a colourway with no detail to check", () => {
    const [prompt] = texts(buildVerifRequest(input({ details: [] }), "x/y"));
    expect(prompt).toContain("Aucun détail précis n'est à contrôler");
  });

  it("trims details, drops blank lines and duplicates", () => {
    const [prompt] = texts(
      buildVerifRequest(
        input({ details: ["  swoosh  blanc ", "", "   ", "SWOOSH blanc", "patch ELITE"] }),
        "x/y",
      ),
    );
    expect(prompt).toContain("1. swoosh blanc\n2. patch ELITE\n");
    expect(prompt).not.toContain("3. ");
  });

  it("documents the out-of-frame convention the UI relies on", () => {
    const [prompt] = texts(buildVerifRequest(input(), "x/y"));
    expect(prompt).toContain(`${OUT_OF_FRAME_PREFIX} :`);
  });

  it("constrains the output to the contract, and nothing else", () => {
    const { json_schema } = buildVerifRequest(input(), "x/y").response_format;
    expect(json_schema.name).toBe("verification_studio");
    expect(json_schema.strict).toBe(true);

    const { schema } = json_schema;
    expect(Object.keys(schema.properties).sort()).toEqual([
      "angleRespecte",
      "details",
      "scoreGlobal",
      "verdict",
    ]);
    expect(Object.keys(schema.properties.details.items.properties).sort()).toEqual([
      "detail",
      "note",
      "statut",
    ]);
    expect(schema.properties.details.items.properties.statut.enum).toEqual([...DETAIL_STATUSES]);
    expect(schema.properties.verdict.enum).toEqual([...VERDICTS]);
    expect([...DETAIL_STATUSES]).toEqual(["fidele", "derive", "absent"]);
    expect([...VERDICTS]).toEqual(["ok", "a_corriger", "rejet"]);
  });

  it("keeps the schema valid for strict mode, at every level", () => {
    // `strict` exige, sur CHAQUE objet, `additionalProperties: false` et toutes
    // les propriétés dans `required` : l'API refuse le schéma si l'un manque.
    const verifierStrict = (node: unknown, chemin: string): void => {
      if (!node || typeof node !== "object") return;
      const n = node as Record<string, unknown>;
      if (n.type === "object") {
        const props = n.properties as Record<string, unknown>;
        expect(n.additionalProperties, chemin).toBe(false);
        expect([...(n.required as string[])].sort(), chemin).toEqual(Object.keys(props).sort());
        for (const [k, v] of Object.entries(props)) verifierStrict(v, `${chemin}.${k}`);
      }
      if (n.type === "array") verifierStrict(n.items, `${chemin}[]`);
    };
    verifierStrict(buildVerifRequest(input(), "x/y").response_format.json_schema.schema, "schema");
  });

  it("uses no bound keyword some providers reject in strict mode", () => {
    const schema = JSON.stringify(buildVerifRequest(input(), "x/y").response_format.json_schema.schema);
    expect(schema).not.toMatch(
      /"(minimum|maximum|exclusiveMinimum|exclusiveMaximum|minItems|maxItems|minLength|maxLength|pattern|format)"/,
    );
  });

  it("keeps a reasoning budget", () => {
    expect(buildVerifRequest(input(), "x/y").reasoning).toEqual({ max_tokens: 1024 });
  });

  it("refuses a request with no reference photo", () => {
    const message = erreurDe(() => buildVerifRequest(input({ references: [] }), "x/y"), "invalid_input");
    expect(message).toContain("Aucune photo de référence");
  });

  it("refuses an empty image, naming which one", () => {
    expect(
      erreurDe(() => buildVerifRequest(input({ generated: img("") }), "x/y"), "invalid_input"),
    ).toContain("Image GÉNÉRÉE à noter");
    expect(
      erreurDe(
        () => buildVerifRequest(input({ references: [img("OK"), img("")] }), "x/y"),
        "invalid_input",
      ),
    ).toContain("Photo de référence 2 sur 2");
  });

  it("refuses a data URL passed where raw base64 is expected", () => {
    erreurDe(
      () => buildVerifRequest(input({ generated: img("data:image/jpeg;base64,AAA") }), "x/y"),
      "invalid_input",
    );
  });

  it("refuses a MIME type that is not an image", () => {
    erreurDe(
      () => buildVerifRequest(input({ generated: img("G", "application/pdf") }), "x/y"),
      "invalid_input",
    );
  });
});

describe("readVerifResponse", () => {
  it("reads a nominal response", () => {
    expect(lire(JSON.stringify(verif()))).toEqual({
      details: [
        { detail: "patch ELITE côté gauche", statut: "fidele", note: "Patch bien placé à gauche." },
        { detail: "swoosh blanc cassé", statut: "derive", note: "Le swoosh est blanc pur." },
        { detail: "motif camouflage bordeaux", statut: "absent", note: "Motif introuvable." },
      ],
      angleRespecte: true,
      scoreGlobal: 72,
      verdict: "a_corriger",
    });
  });

  it("strips the markdown fences models add despite the schema", () => {
    const json = JSON.stringify(verif());
    expect(lire("```json\n" + json + "\n```").verdict).toBe("a_corriger");
    expect(lire("```\n" + json + "\n```").verdict).toBe("a_corriger");
    expect(lire("```JSON\n" + json + "\n```").verdict).toBe("a_corriger");
  });

  it("survives a fence that was never closed", () => {
    expect(lire("```json\n" + JSON.stringify(verif())).scoreGlobal).toBe(72);
  });

  it("finds the JSON behind an introductory sentence, fenced or not", () => {
    const json = JSON.stringify(verif());
    expect(lire(`Voici ma vérification :\n${json}`).scoreGlobal).toBe(72);
    expect(lire(`Voici ma vérification :\n\`\`\`json\n${json}\n\`\`\`\nBonne journée.`).scoreGlobal).toBe(72);
  });

  it("prefers the fenced block when the surrounding prose contains braces", () => {
    // Sans le bloc fencé comme point d'appui, le repli « première { → dernière } »
    // avalerait la prose et le JSON ne serait plus parsable.
    const json = JSON.stringify(verif());
    const r = lire(`Voici {ma} vérification :\n\`\`\`json\n${json}\n\`\`\`\nFin {du} message.`);
    expect(r.scoreGlobal).toBe(72);
  });

  it("restores line breaks that were escaped twice", () => {
    const r = lire(JSON.stringify(verif({ details: [
      { detail: DETAILS[0], statut: "derive", note: "Ligne 1\\nLigne 2" },
      { detail: DETAILS[1], statut: "fidele", note: "ok" },
      { detail: DETAILS[2], statut: "fidele", note: "ok" },
    ] })));
    expect(r.details[0].note).toBe("Ligne 1\nLigne 2");
  });

  it("accepts a content split in several text blocks", () => {
    const json = JSON.stringify(verif());
    const moitie = Math.floor(json.length / 2);
    const r = lire([
      { type: "text", text: json.slice(0, moitie) },
      { type: "text", text: json.slice(moitie) },
    ]);
    expect(r.verdict).toBe("a_corriger");
  });

  it("surfaces an error returned inside an otherwise valid 200 body", () => {
    const message = erreurDe(
      () => readVerifResponse({ error: { message: "Insufficient credits" }, choices: [] }, DETAILS),
      "provider",
    );
    expect(message).toBe("OpenRouter : Insufficient credits");
  });

  it("rejects a response with no choice, or an empty content", () => {
    expect(erreurDe(() => readVerifResponse({}, DETAILS), "invalid_response")).toContain("vide");
    expect(erreurDe(() => readVerifResponse({ choices: [] }, DETAILS), "invalid_response")).toContain("vide");
    expect(erreurDe(() => lire("   "), "invalid_response")).toContain("vide");
    expect(erreurDe(() => lire(null), "invalid_response")).toContain("vide");
  });

  it("rejects a content that is not JSON", () => {
    expect(erreurDe(() => lire("Je ne peux pas évaluer cette image."), "invalid_response")).toContain("non-JSON");
    expect(erreurDe(() => lire("{ pas du json"), "invalid_response")).toContain("non-JSON");
  });

  it("rejects JSON that is not an object", () => {
    erreurDe(() => lire("[1, 2]"), "invalid_response");
    erreurDe(() => lire("null"), "invalid_response");
    erreurDe(() => lire('"texte"'), "invalid_response");
  });

  describe("details", () => {
    it("fails when the model returns fewer details than requested", () => {
      const message = erreurDe(
        () => lire(JSON.stringify(verif({ details: verif().details.slice(0, 2) }))),
        "invalid_response",
      );
      expect(message).toContain("2 détail(s) rendu(s) sur 3");
    });

    it("fails when the model returns more details than requested", () => {
      const extra = { detail: "bretelles", statut: "fidele", note: "" };
      erreurDe(() => lire(JSON.stringify(verif({ details: [...verif().details, extra] }))), "invalid_response");
    });

    it("fails when details are missing altogether but some were requested", () => {
      erreurDe(() => lire(JSON.stringify({ ...verif(), details: undefined })), "invalid_response");
    });

    it("accepts an empty list when nothing was requested", () => {
      const r = lire(JSON.stringify(verif({ details: [] })), []);
      expect(r.details).toEqual([]);
      expect(r.scoreGlobal).toBe(72);
    });

    it("puts details back in the requested order when the model reordered them", () => {
      const [a, b, c] = verif().details;
      const r = lire(JSON.stringify(verif({ details: [c, a, b] })));
      expect(r.details.map((d) => [d.detail, d.statut])).toEqual([
        [DETAILS[0], "fidele"],
        [DETAILS[1], "derive"],
        [DETAILS[2], "absent"],
      ]);
    });

    it("matches labels regardless of case, accents and spacing", () => {
      const r = lire(
        JSON.stringify(
          verif({
            details: [
              { detail: "PATCH elite  cote gauche", statut: "fidele", note: "" },
              { detail: "swoosh BLANC cassé", statut: "derive", note: "" },
              { detail: "Motif camouflage bordeaux", statut: "absent", note: "" },
            ],
          }),
        ),
      );
      // Le libellé rendu est celui de la demande, pas celui du modèle.
      expect(r.details.map((d) => d.detail)).toEqual(DETAILS);
      expect(r.details.map((d) => d.statut)).toEqual(["fidele", "derive", "absent"]);
    });

    it("assigns a reworded label to the remaining slot, in order", () => {
      const r = lire(
        JSON.stringify(
          verif({
            details: [
              { detail: "le patch ELITE", statut: "fidele", note: "" },
              { detail: "swoosh blanc cassé", statut: "derive", note: "" },
              { detail: "motif camouflage bordeaux", statut: "absent", note: "" },
            ],
          }),
        ),
      );
      expect(r.details).toEqual([
        { detail: DETAILS[0], statut: "fidele", note: "" },
        { detail: DETAILS[1], statut: "derive", note: "" },
        { detail: DETAILS[2], statut: "absent", note: "" },
      ]);
    });

    it("matches labels first, so a reworded one does not steal another's result", () => {
      // Le modèle a reformulé le 1er intitulé ET inversé les deux autres : seuls
      // les intitulés exacts peuvent tenir la correspondance.
      const [a, b, c] = verif().details;
      const r = lire(
        JSON.stringify(verif({ details: [c, { ...a, detail: "patch gauche" }, b] })),
      );
      expect(r.details.map((d) => [d.detail, d.statut])).toEqual([
        [DETAILS[0], "fidele"],
        [DETAILS[1], "derive"],
        [DETAILS[2], "absent"],
      ]);
    });

    it("dedupes the requested details the same way the request does", () => {
      const r = readVerifResponse(
        reponse(
          JSON.stringify(
            verif({
              details: [
                { detail: "swoosh", statut: "fidele", note: "" },
                { detail: "patch", statut: "derive", note: "" },
              ],
            }),
          ),
        ),
        ["swoosh", "  SWOOSH ", "", "patch"],
      );
      expect(r.details.map((d) => d.detail)).toEqual(["swoosh", "patch"]);
    });

    it("tolerates a missing note, and keeps the out-of-frame prefix visible", () => {
      const r = lire(
        JSON.stringify(
          verif({
            details: [
              { detail: DETAILS[0], statut: "absent", note: `${OUT_OF_FRAME_PREFIX} : patch côté gauche, vue de dos.` },
              { detail: DETAILS[1], statut: "fidele" },
              { detail: DETAILS[2], statut: "fidele", note: null },
            ],
          }),
        ),
      );
      expect(r.details[0].note.startsWith(OUT_OF_FRAME_PREFIX)).toBe(true);
      expect(r.details[1].note).toBe("");
      expect(r.details[2].note).toBe("");
    });

    it("normalises accented or capitalised statuses", () => {
      const r = lire(
        JSON.stringify(
          verif({
            details: [
              { detail: DETAILS[0], statut: "Fidèle", note: "" },
              { detail: DETAILS[1], statut: " DÉRIVE ", note: "" },
              { detail: DETAILS[2], statut: "Absent", note: "" },
            ],
          }),
        ),
      );
      expect(r.details.map((d) => d.statut)).toEqual(["fidele", "derive", "absent"]);
    });

    it("rejects an unknown or missing status rather than guessing", () => {
      const avec = (statut: unknown) =>
        JSON.stringify(
          verif({
            details: [
              { detail: DETAILS[0], statut, note: "" },
              verif().details[1],
              verif().details[2],
            ],
          }),
        );
      expect(erreurDe(() => lire(avec("partiel")), "invalid_response")).toContain("partiel");
      erreurDe(() => lire(avec(undefined)), "invalid_response");
      erreurDe(() => lire(avec(3)), "invalid_response");
    });

    it("rejects a detail that is not an object", () => {
      erreurDe(
        () => lire(JSON.stringify(verif({ details: ["patch", "swoosh", "motif"] }))),
        "invalid_response",
      );
    });
  });

  describe("verdict", () => {
    it.each([
      ["ok", "ok"],
      ["a_corriger", "a_corriger"],
      ["rejet", "rejet"],
      ["à corriger", "a_corriger"],
      ["A_CORRIGER", "a_corriger"],
      ["a-corriger", "a_corriger"],
      [" Rejet ", "rejet"],
    ])("reads %j as %s", (brut, attendu) => {
      expect(lire(JSON.stringify(verif({ verdict: brut }))).verdict).toBe(attendu);
    });

    it("rejects an unknown verdict", () => {
      expect(erreurDe(() => lire(JSON.stringify(verif({ verdict: "valide" }))), "invalid_response")).toContain("valide");
      erreurDe(() => lire(JSON.stringify(verif({ verdict: undefined }))), "invalid_response");
    });

    it("does not second-guess the verdict against the statuses", () => {
      // Le verdict est une aide, pas un calcul : la décision finale est à Aramis.
      const r = lire(JSON.stringify(verif({ verdict: "ok" })));
      expect(r.verdict).toBe("ok");
      expect(r.details.some((d) => d.statut === "absent")).toBe(true);
    });
  });

  describe("scoreGlobal", () => {
    it.each([
      [0, 0],
      [100, 100],
      [85.6, 86],
      ["85", 85],
      [" 42 ", 42],
      [140, 100],
      [-3, 0],
    ])("reads %j as %d", (brut, attendu) => {
      expect(lire(JSON.stringify(verif({ scoreGlobal: brut }))).scoreGlobal).toBe(attendu);
    });

    it.each([["abc"], [""], [null], [undefined], [true], [{}], ["85/100"]])("rejects %j", (brut) => {
      expect(
        erreurDe(() => lire(JSON.stringify(verif({ scoreGlobal: brut }))), "invalid_response"),
      ).toContain("Score global");
    });
  });

  describe("angleRespecte", () => {
    it("reads both booleans", () => {
      expect(lire(JSON.stringify(verif({ angleRespecte: false }))).angleRespecte).toBe(false);
      expect(lire(JSON.stringify(verif({ angleRespecte: true }))).angleRespecte).toBe(true);
    });

    it.each([["true"], ["oui"], [1], [null], [undefined]])("rejects %j", (brut) => {
      expect(
        erreurDe(() => lire(JSON.stringify(verif({ angleRespecte: brut }))), "invalid_response"),
      ).toContain("angleRespecte");
    });
  });
});

describe("errorFromStatus", () => {
  it("gives out-of-credits its own message", () => {
    const e = errorFromStatus(402, "x/y");
    expect(e).toBeInstanceOf(StudioVerifError);
    expect(e.code).toBe("no_credits");
    expect(e.message).toBe("Crédits OpenRouter épuisés.");
  });

  it.each([401, 403])("reads %d as a refused key", (status) => {
    const e = errorFromStatus(status, "x/y");
    expect(e.code).toBe("bad_key");
    expect(e.message).toBe("Clé OpenRouter refusée.");
  });

  it("names the model on 404", () => {
    const e = errorFromStatus(404, "google/inconnu");
    expect(e.code).toBe("unknown_model");
    expect(e.message).toBe("Modèle inconnu d'OpenRouter : google/inconnu.");
  });

  it.each([400, 429, 500, 502, 503, 504])("falls back to a generic message on %d", (status) => {
    const e = errorFromStatus(status, "x/y");
    expect(e.code).toBe("provider");
    expect(e.message).toBe(`OpenRouter a répondu ${status}.`);
  });
});

describe("StudioVerifError", () => {
  it("is an Error carrying a code the UI can switch on", () => {
    const e = new StudioVerifError("missing_key", "Clé OpenRouter manquante. Ajoute ta clé dans Mon compte.");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("StudioVerifError");
    expect(e.code).toBe("missing_key");
    expect(e.message).toContain("Mon compte");
  });
});
