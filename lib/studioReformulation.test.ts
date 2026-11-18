import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { annonceAvecRelanceAnthropic, construireRequeteAnthropic, generateListingAnthropic } from "./anthropic";
import { annonceAvecRelance, construireRequeteOllama, generateListingOllama, TITRE_MAX as TITRE_MAX_OLLAMA } from "./ollama";
import { generateListing, lireReponse } from "./openrouter";
import {
  corpsGarder,
  diffMots,
  diffMotsCles,
  diffTitre,
  lireProposition,
  MESSAGE_INUTILISABLE,
  nbChanges,
  promptReformulation,
  reformulerVersion,
  sortieInutilisable,
  type DepsReformulation,
  type SortieIA,
  type VersionAReformuler,
} from "./studioReformulation";
import { lireModificationVersion, MESSAGE_VERSION_UN, TITRE_MAX } from "./studioVersion";

const TITRE = "Sac à dos Nike Elite noir et orange - très bon état";
const MOTS =
  "sac à dos, sac à dos Nike, Nike Elite, sac de sport, sac de cours, noir et orange, unisexe, rucksack, Nike Rucksack, mochila, mochila Nike, zaino, zaino Nike, backpack, school bag";
const TIRETS = "- Sac à dos Nike Elite, coloris noir et orange\n- Expédition soignée";

describe("diff mot à mot", () => {
  it("rien n'a changé : aucun mot marqué", () => {
    const d = diffTitre(TITRE, TITRE);
    expect(d.every((m) => !m.change)).toBe(true);
    expect(d.map((m) => m.texte).join(" ")).toBe(TITRE);
    expect(nbChanges(d)).toBe(0);
  });

  it("un mot remplacé : seul le nouveau mot est marqué", () => {
    const d = diffTitre(TITRE, "Sac à dos Nike Elite noir et orange - excellent état");
    expect(d.filter((m) => m.change).map((m) => m.texte)).toEqual(["excellent"]);
    expect(d.map((m) => m.texte).join(" ")).toBe("Sac à dos Nike Elite noir et orange - excellent état");
  });

  it("plusieurs mots changés, dont un groupe de deux", () => {
    const d = diffTitre(TITRE, "Sac à dos Nike Elite orange et noir - très bon état");
    // « noir et orange » → « orange et noir » : la plus longue suite commune garde « et » et un des deux couleurs.
    expect(nbChanges(d)).toBe(2);
    expect(d.map((m) => m.texte).join(" ")).toBe("Sac à dos Nike Elite orange et noir - très bon état");
  });

  it("un mot ajouté est marqué, un mot retiré n'apparaît pas (on affiche la nouvelle version)", () => {
    const ajoute = diffTitre("Sac Nike noir", "Sac Nike noir neuf");
    expect(ajoute).toEqual([
      { texte: "Sac", change: false },
      { texte: "Nike", change: false },
      { texte: "noir", change: false },
      { texte: "neuf", change: true },
    ]);
    const retire = diffTitre("Sac Nike noir neuf", "Sac Nike noir");
    expect(retire.every((m) => !m.change)).toBe(true);
    expect(retire).toHaveLength(3);
  });

  it("la casse compte : « Nike » devenu « nike » est un changement", () => {
    expect(diffTitre("Sac Nike", "Sac nike")).toEqual([
      { texte: "Sac", change: false },
      { texte: "nike", change: true },
    ]);
  });

  it("les espaces multiples ne créent ni mot vide ni changement", () => {
    expect(nbChanges(diffTitre("  Sac   Nike ", "Sac Nike"))).toBe(0);
  });

  it("les mots-clés : un mot-clé entier à la fois (« sac de cours » → « sac pour l’école »), les autres restent", () => {
    const apres = MOTS.replace("sac de cours", "sac pour l’école").replace("school bag", "schoolbag");
    const d = diffMotsCles(MOTS, apres);
    expect(d.filter((m) => m.change).map((m) => m.texte)).toEqual(["sac pour l’école", "schoolbag"]);
    expect(d).toHaveLength(MOTS.split(",").length);
  });

  it("les mots-clés se comparent sans tenir compte de « , » ou « ,  » (le format n'est pas un changement)", () => {
    expect(nbChanges(diffMotsCles("a, b, c", "a,b,  c"))).toBe(0);
    expect(nbChanges(diffMotsCles("a, b, c", "a, b, d"))).toBe(1);
  });

  it("listes vides et doublons", () => {
    expect(diffMots([], [])).toEqual([]);
    expect(diffMots([], ["a"])).toEqual([{ texte: "a", change: true }]);
    expect(diffMots(["a", "a"], ["a", "a", "a"]).filter((m) => m.change)).toHaveLength(1);
  });
});

describe("le prompt de reformulation", () => {
  const prompt = promptReformulation({ titre: TITRE, motsCles: MOTS });

  it("reçoit le titre et les mots-clés enregistrés", () => {
    expect(prompt).toContain(TITRE);
    expect(prompt).toContain(MOTS);
  });

  it("impose de garder les faits (marque, modèle, coloris, taille, état) et de ne rien ajouter de faux", () => {
    expect(prompt).toMatch(/GARDE LES FAITS/);
    for (const fait of ["marque", "modèle", "coloris", "taille", "état"]) expect(prompt).toContain(fait);
    expect(prompt).toMatch(/même orthographe, même casse/);
    expect(prompt).toMatch(/N'AJOUTE RIEN DE FAUX/);
    expect(prompt).toMatch(/aucune marque/);
  });

  it("impose la limite du titre, la langue de chaque mot-clé, le format et le nombre", () => {
    expect(prompt).toContain(`${TITRE_MAX} caractères au maximum`);
    expect(prompt).toMatch(/reste dans SA langue/);
    expect(prompt).toMatch(/UNE seule chaîne, séparés par des virgules/);
    expect(prompt).toMatch(/à peu près le même nombre de mots-clés/);
    expect(prompt).toMatch(/quelques mots/);
  });

  it("demande la clé « description » du format d'annonce, mais l'annonce sans objet", () => {
    expect(prompt).toMatch(/« description »/);
    expect(prompt).toContain("Sans objet.");
  });

  it("la limite du titre est celle du reste de l'application", () => {
    expect(TITRE_MAX).toBe(100);
    expect(TITRE_MAX).toBe(TITRE_MAX_OLLAMA);
  });
});

describe("lireProposition — ce que l'IA a rendu", () => {
  it("un titre et des mots-clés valides, normalisés", () => {
    expect(lireProposition({ titre: "  Sac à dos Nike \n Elite ", description: "x", motsCles: "sac à dos,Nike ,  rucksack" })).toEqual({
      ok: true,
      proposition: { titre: "Sac à dos Nike Elite", motsCles: "sac à dos, Nike, rucksack" },
    });
  });

  it("ne rend QUE titre et motsCles : description, SKU et autres clés sont jetés", () => {
    const lu = lireProposition({ titre: "T", motsCles: "a, b", description: "- tirets de l'IA", skuAnnonce: "HACK", id: "x", numero: 9 });
    expect(lu.ok && Object.keys(lu.proposition).sort()).toEqual(["motsCles", "titre"]);
    expect(JSON.stringify(lu)).not.toMatch(/tirets de l'IA|HACK/);
  });

  it("refuse un titre de plus de 100 caractères (un émoji compte pour un), accepte exactement 100", () => {
    expect(lireProposition({ titre: "a".repeat(101), motsCles: "a" }).ok).toBe(false);
    expect(lireProposition({ titre: "a".repeat(100), motsCles: "a" }).ok).toBe(true);
    expect(lireProposition({ titre: "🎒".repeat(100), motsCles: "a" }).ok).toBe(true);
    expect(lireProposition({ titre: "🎒".repeat(101), motsCles: "a" }).ok).toBe(false);
  });

  it("refuse un titre vide ou absent, des mots-clés vides ou absents", () => {
    for (const s of [
      { titre: "", motsCles: "a" },
      { titre: "   ", motsCles: "a" },
      { motsCles: "a" },
      { titre: 12, motsCles: "a" },
      { titre: "T", motsCles: "" },
      { titre: "T", motsCles: " , ,\n" },
      { titre: "T" },
      { titre: "T", motsCles: 12 },
      { titre: "T", motsCles: [] },
    ]) {
      expect(lireProposition(s).ok, JSON.stringify(s)).toBe(false);
    }
  });

  it("refuse ce qui n'est pas un objet (JSON invalide déjà réduit en texte, tableau, null)", () => {
    for (const s of [null, undefined, "pas du json", 42, ["titre"]]) expect(lireProposition(s).ok, String(s)).toBe(false);
  });

  it("tolère des mots-clés rendus en tableau", () => {
    expect(lireProposition({ titre: "T", motsCles: ["a", "b", 3] })).toEqual({ ok: true, proposition: { titre: "T", motsCles: "a, b" } });
  });
});

describe("« Garder » n'écrit que titre et motsCles", () => {
  it("le corps de Garder ne porte que ces deux clés, même si l'objet reçu en a d'autres", () => {
    const venu = { titre: "T", motsCles: "a, b", description: "- tirets de l'IA", skuAnnonce: "HACK" };
    expect(Object.keys(corpsGarder(venu))).toEqual(["titre", "motsCles"]);
  });

  it("de bout en bout : la reformulation puis Garder laissent la description (tirets) et le SKU intacts", async () => {
    // Une « base » en mémoire, comme la table StudioVersion : la version 2 d'Aramis.
    let ligne: { numero: number; titre: string; description: string; motsCles: string; skuAnnonce: string | null } = { numero: 2, titre: TITRE, description: TIRETS, motsCles: MOTS, skuAnnonce: "SDN13" };
    const deps: DepsReformulation = {
      lireVersion: async () => ({ ...ligne }),
      // L'IA est « désobéissante » : elle réécrit les tirets et renvoie un SKU.
      demanderIA: async () => ({ titre: "Sac à dos Nike Elite orange et noir - très bon état", description: "- AUTRE TEXTE", motsCles: "a, b", skuAnnonce: "HACK" }) as SortieIA,
    };
    const res = await reformulerVersion(deps, { versionId: "v2" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Le PATCH de « Garder » : le serveur n'écrit que ce que `lireModificationVersion` rend.
    const lu = lireModificationVersion(corpsGarder(res.proposition));
    expect(lu.ok).toBe(true);
    if (!lu.ok) return;
    expect(Object.keys(lu.donnees).sort()).toEqual(["motsCles", "titre"]);
    ligne = { ...ligne, ...lu.donnees };
    expect(ligne.description).toBe(TIRETS);
    expect(ligne.skuAnnonce).toBe("SDN13");
    expect(ligne.titre).toBe("Sac à dos Nike Elite orange et noir - très bon état");
    expect(ligne.motsCles).toBe("a, b");
  });
});

describe("reformulerVersion — l'orchestration, avec une IA simulée", () => {
  function faux(over: Partial<DepsReformulation> & { version?: VersionAReformuler | null; sortie?: SortieIA | Error } = {}) {
    const appels = { lire: [] as string[], ia: [] as string[] };
    const version = over.version === undefined ? { numero: 2, titre: TITRE, motsCles: MOTS } : over.version;
    const deps: DepsReformulation = {
      lireVersion: over.lireVersion ?? (async (id) => (appels.lire.push(id), version)),
      demanderIA:
        over.demanderIA ??
        (async (prompt) => {
          appels.ia.push(prompt);
          if (over.sortie instanceof Error) throw over.sortie;
          return over.sortie ?? { titre: "Sac à dos Nike Elite orange et noir - très bon état", description: "Sans objet.", motsCles: MOTS.replace("sac de cours", "sac pour l’école") };
        }),
    };
    return { deps, appels };
  }

  it("part du titre et des mots-clés ENREGISTRÉS de la version et rend la proposition", async () => {
    const { deps, appels } = faux();
    const res = await reformulerVersion(deps, { versionId: "v2" });
    expect(appels.ia).toHaveLength(1);
    expect(appels.ia[0]).toContain(TITRE);
    expect(appels.ia[0]).toContain(MOTS);
    expect(res).toEqual({
      ok: true,
      proposition: { titre: "Sac à dos Nike Elite orange et noir - très bon état", motsCles: MOTS.replace("sac de cours", "sac pour l’école") },
    });
  });

  it("jamais les tirets ni le SKU à l'IA : ce que la version contient d'autre ne sort pas de la base", async () => {
    // La dépendance ne rend QUE numero, titre et motsCles : la description et le SKU ne peuvent pas partir.
    const { deps, appels } = faux();
    await reformulerVersion(deps, { versionId: "v2" });
    expect(appels.ia[0]).not.toContain("Expédition soignée");
    expect(appels.ia[0]).not.toContain("SDN13");
  });

  it("la Version 1 est refusée (400) AVANT tout : ni lecture, ni appel IA", async () => {
    for (const versionId of [null, undefined, "", "1"]) {
      const { deps, appels } = faux();
      const res = await reformulerVersion(deps, { versionId });
      expect(res, String(versionId)).toEqual({ ok: false, code: "version_une", message: MESSAGE_VERSION_UN });
      expect(appels).toEqual({ lire: [], ia: [] });
    }
  });

  it("une ligne qui porterait le numéro 1 est refusée aussi, sans appel IA", async () => {
    const { deps, appels } = faux({ version: { numero: 1, titre: TITRE, motsCles: MOTS } });
    const res = await reformulerVersion(deps, { versionId: "autre" });
    expect(res.ok === false && res.code).toBe("version_une");
    expect(appels.ia).toEqual([]);
  });

  it("une version introuvable (ou d'un autre compte) : 404, aucun appel IA", async () => {
    const { deps, appels } = faux({ version: null });
    const res = await reformulerVersion(deps, { versionId: "inconnue" });
    expect(res.ok === false && res.code).toBe("introuvable");
    expect(appels.ia).toEqual([]);
  });

  it("sans titre ou sans mots-clés enregistrés : rien à reformuler, aucun appel IA", async () => {
    for (const version of [
      { numero: 2, titre: "", motsCles: MOTS },
      { numero: 2, titre: TITRE, motsCles: "" },
      { numero: 2, titre: "  ", motsCles: " , " },
    ]) {
      const { deps, appels } = faux({ version });
      const res = await reformulerVersion(deps, { versionId: "v2" });
      expect(res.ok === false && res.code).toBe("rien_a_reformuler");
      expect(appels.ia).toEqual([]);
    }
  });

  it("une sortie inutilisable : « Proposition inutilisable, réessaie », rien à enregistrer", async () => {
    for (const sortie of [
      { titre: "a".repeat(101), description: "x", motsCles: "a, b" },
      { titre: "T", description: "x", motsCles: "" },
      { titre: "", description: "x", motsCles: "a" },
      {},
    ]) {
      const { deps } = faux({ sortie });
      const res = await reformulerVersion(deps, { versionId: "v2" });
      expect(res.ok, JSON.stringify(sortie)).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe("proposition_inutilisable");
        expect(res.message).toBe(MESSAGE_INUTILISABLE);
      }
    }
  });

  it("un JSON invalide (erreur de lecture du client IA) : même message, même code", async () => {
    const { deps } = faux({ sortie: new Error("Réponse du modèle non-JSON.") });
    const res = await reformulerVersion(deps, { versionId: "v2" });
    expect(res).toMatchObject({ ok: false, code: "proposition_inutilisable", message: "Proposition inutilisable, réessaie" });
  });

  it("une panne du fournisseur (clé, crédits) passe avec son message, sans « inutilisable »", async () => {
    const { deps } = faux({ sortie: new Error("Clé OpenRouter refusée.") });
    const res = await reformulerVersion(deps, { versionId: "v2" });
    expect(res).toMatchObject({ ok: false, code: "ia_indisponible", message: "Clé OpenRouter refusée." });
  });

  it("UN appel IA par reformulation : « Proposer autre chose » en refait un, et un seul", async () => {
    const { deps, appels } = faux();
    await reformulerVersion(deps, { versionId: "v2" });
    expect(appels.ia).toHaveLength(1);
    await reformulerVersion(deps, { versionId: "v2" });
    expect(appels.ia).toHaveLength(2);
  });
});

describe("sortieInutilisable — rejoué contre les messages RÉELS des trois clients IA", () => {
  afterEach(() => vi.restoreAllMocks());
  const taire = () => vi.spyOn(console, "error").mockImplementation(() => undefined);
  const enveloppeOpenAI = (content: string) => ({ choices: [{ message: { content } }] });
  const enveloppeAnthropic = (texte: string) => ({ content: [{ type: "text", text: texte }], stop_reason: "end_turn" });
  const message = async (f: () => Promise<unknown> | unknown): Promise<string> => {
    try {
      await f();
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
    throw new Error("aucune erreur levée");
  };

  it("OpenRouter : JSON invalide, réponse vide, champ manquant", async () => {
    for (const contenu of ["pas du json", "", '{"titre":"T","description":"","motsCles":""}']) {
      const m = await message(() => lireReponse(enveloppeOpenAI(contenu)));
      expect(sortieInutilisable(m), m).toBe(true);
    }
  });

  it("Ollama Cloud : après la relance, « n'a pas rendu une annonce valide » (JSON invalide, titre trop long)", async () => {
    taire();
    for (const contenu of ["pas du json", JSON.stringify({ titre: "a".repeat(101), description: "x", motsCles: "a" })]) {
      const m = await message(() =>
        annonceAvecRelance(
          (correction) => construireRequeteOllama("p", [], "deepseek-v4.1-flash", correction),
          async () => enveloppeOpenAI(contenu),
        ),
      );
      expect(sortieInutilisable(m), m).toBe(true);
    }
  });

  it("Anthropic : après la relance, ou refus du modèle", async () => {
    taire();
    const m = await message(() =>
      annonceAvecRelanceAnthropic(
        (correction) => construireRequeteAnthropic("p", [], "claude-haiku-5-5", correction),
        async () => enveloppeAnthropic("pas du json"),
      ),
    );
    expect(sortieInutilisable(m), m).toBe(true);
    const refus = await message(() =>
      annonceAvecRelanceAnthropic(
        (correction) => construireRequeteAnthropic("p", [], "claude-haiku-5-5", correction),
        async () => ({ content: [], stop_reason: "refusal" }),
      ),
    );
    expect(sortieInutilisable(refus), refus).toBe(true);
  });

  it("une panne du fournisseur n'en est pas une : clé manquante des trois clients, erreur placée dans le corps", async () => {
    taire();
    for (const f of [() => generateListing("p", [], null, "m"), () => generateListingOllama("p", [], "", "m"), () => generateListingAnthropic("p", [], "", "m")]) {
      const m = await message(f);
      expect(m).toMatch(/Clé .* manquante/);
      expect(sortieInutilisable(m), m).toBe(false);
    }
    const enCorps = await message(() => lireReponse({ error: { message: "insufficient credits" } }));
    expect(sortieInutilisable(enCorps), enCorps).toBe(false);
    expect(sortieInutilisable("Crédits OpenRouter épuisés.")).toBe(false);
    expect(sortieInutilisable("OpenRouter injoignable.")).toBe(false);
  });
});

// ── Cloisonnement de la reformulation ───────────────────────────────────────

const RACINE = path.join(__dirname, "..");

function balayer(dossierRelatif: string): string[] {
  const out: string[] = [];
  for (const nom of readdirSync(path.join(RACINE, dossierRelatif))) {
    if (nom === "node_modules" || nom.startsWith(".")) continue;
    const rel = `${dossierRelatif}/${nom}`;
    if (statSync(path.join(RACINE, rel)).isDirectory()) out.push(...balayer(rel));
    else if (/\.[cm]?[jt]sx?$/.test(nom) && !/\.test\.[cm]?[jt]sx?$/.test(nom)) out.push(rel);
  }
  return out.sort();
}

const sansCommentaires = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

describe("la reformulation ne part que sur un clic, et le Studio ne dépend d'une IA de texte qu'ici", () => {
  const sources = [...balayer("lib"), ...balayer("app"), ...balayer("components")].map((f) => [f, sansCommentaires(readFileSync(path.join(RACINE, f), "utf8"))] as const);
  const importeurs = (motif: RegExp) => sources.filter(([, src]) => motif.test(src)).map(([f]) => f);

  it("seul lib/studioReformulationServeur.ts, côté Studio, parle à lib/fournisseurIA (le Studio n'a plus d'autre IA depuis le 17/11)", () => {
    const studio = importeurs(/from\s*["']@\/lib\/fournisseurIA["']|from\s*["']\.\/fournisseurIA["']/).filter((f) => /studio/i.test(f));
    expect(studio).toEqual(["lib/studioReformulationServeur.ts"]);
  });

  it("l'orchestration reformulerVersion n'est appelée que par la route /reformuler", () => {
    expect(importeurs(/\breformulerVersion\b/).filter((f) => f !== "lib/studioReformulation.ts")).toEqual(["app/api/studio/versions/[id]/reformuler/route.ts"]);
  });

  it("aucun appel à /reformuler hors du composant du clic : ni création de version, ni lot, ni autre route", () => {
    const permis = ["app/api/studio/versions/[id]/reformuler/route.ts", "app/studio/_components/TexteAnnonce.tsx"];
    expect(importeurs(/\/reformuler\b/).filter((f) => !permis.includes(f))).toEqual([]);
  });

  it("la route et ses dépendances n'écrivent rien : aucun create / update / delete / upsert", () => {
    for (const f of ["lib/studioReformulation.ts", "lib/studioReformulationServeur.ts", "app/api/studio/versions/[id]/reformuler/route.ts"]) {
      const src = sources.find(([nom]) => nom === f)?.[1] ?? "";
      expect(src.length, f).toBeGreaterThan(100);
      expect(src, f).not.toMatch(/\.\s*(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
    }
  });
});
