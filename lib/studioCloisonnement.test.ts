import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cloisonnement du Studio (spec 2026-10-17-studio-ia-design.md, §7, assoupli le
 * 20/10).
 *
 * Exigence : une image générée ne rejoint une annonce Vinted que si Aramis l'a
 * VALIDÉE pour ce sac, et par un seul chemin : GET /api/studio/annonce, appelé
 * depuis app/mise-en-vente/_referencesPhotos.ts. Tout autre passage reste
 * interdit. Ce n'est pas tenu par la discipline mais par ce test, qui lit le
 * SOURCE des fichiers (même technique que lib/sacbaseStock.test.ts) et inspecte
 * leurs imports.
 *
 * Mode de panne principal d'un test de ce genre : passer parce qu'il n'a rien
 * regardé (dossier renommé, glob qui ne matche plus, regex cassée). Trois
 * garde-fous y répondent :
 *   1. les dossiers sont balayés (jamais de chemins en dur), donc un fichier
 *      ajouté est couvert d'office ;
 *   2. chaque famille doit livrer des fichiers, dont des sentinelles nommées ;
 *   3. le détecteur d'imports est lui-même testé sur des chaînes synthétiques.
 */

const RACINE = path.join(__dirname, "..");

// ── Balayage ────────────────────────────────────────────────────────────────

const EXT_SOURCE = /\.(?:[cm]?[jt]sx?)$/;
const EST_TEST = /\.test\.[cm]?[jt]sx?$/;

/** Chemins relatifs à la racine, séparateur "/", triés. Ignore les tests. */
function balayer(
  dossierRelatif: string,
  { recursif, filtre }: { recursif: boolean; filtre?: (nom: string) => boolean },
): string[] {
  const dossier = path.join(RACINE, dossierRelatif);
  let entrees: string[];
  try {
    entrees = readdirSync(dossier);
  } catch {
    return []; // dossier absent : l'appelant décide si c'est une panne
  }
  const trouves: string[] = [];
  for (const nom of entrees) {
    if (nom === "node_modules" || nom.startsWith(".")) continue;
    const rel = `${dossierRelatif}/${nom}`;
    if (statSync(path.join(RACINE, rel)).isDirectory()) {
      if (recursif) trouves.push(...balayer(rel, { recursif, filtre }));
    } else if (EXT_SOURCE.test(nom) && !EST_TEST.test(nom) && (!filtre || filtre(nom))) {
      trouves.push(rel);
    }
  }
  return trouves.sort();
}

function lire(rel: string): string {
  return readFileSync(path.join(RACINE, rel), "utf8");
}

// ── Extraction des imports ──────────────────────────────────────────────────

/**
 * Tous les spécificateurs de module d'un source : `import … from "x"`,
 * `export … from "x"`, `import "x"`, `import("x")`, `require("x")`.
 * Les commentaires sont retirés d'abord, pour qu'une mention en commentaire
 * ne déclenche pas de faux positif.
 */
function specificateurs(source: string): string[] {
  const sansCommentaires = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const motifs = [
    /\b(?:import|export)\b[^"'`;]*?\bfrom\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*["'`]([^"'`]+)["'`]/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
  ];
  const out = new Set<string>();
  for (const m of motifs) {
    for (const hit of sansCommentaires.matchAll(m)) out.add(hit[1]);
  }
  return [...out];
}

/** Côté vente → studio : un segment du chemin commence par « studio ». */
function visePartieStudio(spec: string): boolean {
  return /(?:^|\/)studio[^/]*(?:\/|$)/i.test(spec);
}

/** Côté studio → vente / export. */
function viseVenteOuExport(spec: string): boolean {
  return (
    /(?:^|\/)mise-en-vente(?:\/|$)/.test(spec) ||
    /(?:^|\/)extension-vinted(?:\/|$)/.test(spec) ||
    /(?:^|\/)[^/]*(?:export|publierVinted)[^/]*(?:\/|$)/i.test(spec)
  );
}

/** Écriture sur le modèle Article : `<client>.article.<écriture>(`. */
const ECRITURE_ARTICLE =
  /\.\s*article\s*\.\s*(?:create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\b/;

function violationsDeSources(sources: Record<string, string>, interdit: (spec: string) => boolean) {
  const trouves: string[] = [];
  for (const [f, src] of Object.entries(sources)) {
    for (const spec of specificateurs(src)) {
      if (interdit(spec)) trouves.push(`${f} importe "${spec}"`);
    }
  }
  return trouves;
}

function violations(fichiers: string[], interdit: (spec: string) => boolean) {
  return violationsDeSources(Object.fromEntries(fichiers.map((f) => [f, lire(f)])), interdit);
}

// ── Le détecteur lui-même ───────────────────────────────────────────────────

describe("détecteur d'imports (garde-fou contre un test aveugle)", () => {
  it("voit toutes les formes d'import vers un module studio", () => {
    const sources = [
      `import { x } from "@/lib/studioImages";`,
      `import x from '../../lib/studio';`,
      `import type { T } from "@/lib/studioTypes"`,
      `import {\n  a,\n  b,\n} from "@/lib/v3/studio";`,
      `export * from "./studioBilan";`,
      `export { y } from "@/lib/studio/bilan";`,
      `import "@/lib/studioEffet";`,
      `const m = await import("@/lib/studioLazy");`,
      `const r = require("../lib/studioCjs");`,
    ];
    for (const src of sources) {
      const specs = specificateurs(src);
      expect(specs.length, src).toBe(1);
      expect(visePartieStudio(specs[0]), src).toBe(true);
    }
  });

  it("ne confond pas un module voisin avec un module studio", () => {
    for (const spec of ["@/lib/stock", "@/lib/prisma", "./_reducer", "react", "@/lib/sacbaseStock", "@/lib/estudio"]) {
      expect(visePartieStudio(spec), spec).toBe(false);
    }
  });

  it("ignore un import cité en commentaire", () => {
    expect(specificateurs(`// import x from "@/lib/studioA"\n/* import y from "@/lib/studioB" */\nimport z from "react";`)).toEqual(["react"]);
  });

  it("voit les modules vente / export côté studio", () => {
    for (const spec of ["@/app/mise-en-vente/_publierVinted", "../app/mise-en-vente/page", "@/app/mise-en-vente/_components/ExportAnnonces", "@/lib/exportAnnonces", "../extension-vinted/file", "./publierVinted"]) {
      expect(viseVenteOuExport(spec), spec).toBe(true);
    }
    for (const spec of ["@/lib/prisma", "@/lib/openrouter", "./studioImages", "react"]) {
      expect(viseVenteOuExport(spec), spec).toBe(false);
    }
  });

  it("remonte le fichier fautif (injection d'une faute sur des sources synthétiques)", () => {
    const sources = {
      "app/mise-en-vente/_ok.ts": `import { a } from "@/lib/stock";`,
      "app/mise-en-vente/_fautif.ts": `import { b } from "@/lib/studioImages";`,
    };
    expect(violationsDeSources(sources, visePartieStudio)).toEqual([
      'app/mise-en-vente/_fautif.ts importe "@/lib/studioImages"',
    ]);
  });

  it("reconnaît une écriture sur Article, pas une lecture", () => {
    for (const w of ["prisma.article.update({", "tx.article.createMany(", "prisma .article .upsert(", "db.article.deleteMany("]) {
      expect(ECRITURE_ARTICLE.test(w), w).toBe(true);
    }
    for (const r of ["prisma.article.findMany({", "prisma.article.count(", "prisma.studioImage.update({", "prisma.articleVinted.update("]) {
      expect(ECRITURE_ARTICLE.test(r), r).toBe(false);
    }
  });
});

// ── Sens vente → studio ─────────────────────────────────────────────────────

const FAMILLES_VENTE: {
  nom: string;
  dossier: string;
  recursif: boolean;
  filtre?: (nom: string) => boolean;
  sentinelles: string[];
}[] = [
  {
    nom: "app/mise-en-vente",
    dossier: "app/mise-en-vente",
    recursif: true,
    sentinelles: [
      "app/mise-en-vente/page.tsx",
      "app/mise-en-vente/_publierVinted.ts",
      "app/mise-en-vente/_components/ExportAnnonces.tsx",
    ],
  },
  {
    nom: "app/api/hermes",
    dossier: "app/api/hermes",
    recursif: true,
    sentinelles: ["app/api/hermes/route.ts", "app/api/hermes/stock/route.ts"],
  },
  {
    nom: "app/api/sacbase",
    dossier: "app/api/sacbase",
    recursif: true,
    sentinelles: ["app/api/sacbase/stock/route.ts"],
  },
  {
    nom: "extension-vinted/*.js",
    dossier: "extension-vinted",
    recursif: false, // les sous-dossiers (banc Playwright) ne sont pas chargés par l'extension
    filtre: (nom) => nom.endsWith(".js"),
    sentinelles: ["extension-vinted/background.js", "extension-vinted/content-vinted.js"],
  },
];

describe("cloisonnement : la vente n'importe jamais le Studio", () => {
  for (const famille of FAMILLES_VENTE) {
    describe(famille.nom, () => {
      const fichiers = balayer(famille.dossier, famille);

      it("le balayage a bien trouvé des fichiers, sentinelles comprises", () => {
        expect(fichiers.length, `rien trouvé sous ${famille.dossier}`).toBeGreaterThan(0);
        for (const s of famille.sentinelles) expect(fichiers, s).toContain(s);
      });

      it("aucun fichier n'importe un module studio", () => {
        expect(violations(fichiers, visePartieStudio)).toEqual([]);
      });
    });
  }
});

// ── Sens studio → vente ─────────────────────────────────────────────────────

/**
 * Côté Studio : tout fichier de `lib/` (récursif) dont le nom commence par
 * « studio », ou situé dans un dossier « studio* » (la spec évoque aussi
 * `lib/v3/studio.ts`), plus tout ce qui est sous `app/api/studio/`.
 * Les deux peuvent légitimement ne pas exister encore.
 */
function fichiersStudioLib(): string[] {
  return balayer("lib", { recursif: true }).filter((f) =>
    f
      .slice("lib/".length)
      .split("/")
      .some((seg) => /^studio/i.test(seg)),
  );
}
const fichiersStudioApi = () => balayer("app/api/studio", { recursif: true });
/** Les écrans /studio : ils ne doivent pas plus atteindre la vente que les routes. */
const fichiersStudioPages = () => balayer("app/studio", { recursif: true });

describe("cloisonnement : le Studio n'atteint jamais la vente ni l'export", () => {
  it("n'importe aucun module de mise en vente, d'export ou d'extension", () => {
    const fichiers = [...fichiersStudioLib(), ...fichiersStudioApi(), ...fichiersStudioPages()];
    expect(violations(fichiers, viseVenteOuExport)).toEqual([]);
  });

  it("n'écrit jamais sur Article (lib/studio*, app/api/studio/**, app/studio/**)", () => {
    const fichiers = [...fichiersStudioLib(), ...fichiersStudioApi(), ...fichiersStudioPages()];
    const ecritures = fichiers.filter((f) => ECRITURE_ARTICLE.test(lire(f)));
    expect(ecritures).toEqual([]);
  });

  it("balaie bien les écrans et les routes du Studio (sentinelles)", () => {
    expect(fichiersStudioPages()).toEqual(
      expect.arrayContaining(["app/studio/page.tsx", "app/studio/[cle]/page.tsx", "app/studio/bilan/page.tsx"]),
    );
    expect(fichiersStudioApi()).toEqual(
      expect.arrayContaining([
        "app/api/studio/references/route.ts",
        "app/api/studio/essais/route.ts",
        // Génération par API (plan du 19/10) : les routes qui paient et qui écrivent.
        "app/api/studio/generations/route.ts",
        "app/api/studio/modeles/route.ts",
        "app/api/studio/modeles/favoris/route.ts",
        // Variantes d'angle (20/10) : prompts, vignettes et le chemin vers l'annonce.
        "app/api/studio/angles/route.ts",
        "app/api/studio/reglages/route.ts",
        "app/api/studio/vignette/route.ts",
        "app/api/studio/annonce/route.ts",
      ]),
    );
    expect(fichiersStudioLib()).toEqual(
      expect.arrayContaining([
        "lib/studioBlob.ts",
        "lib/studioServeur.ts",
        "lib/studioModeles.ts",
        "lib/studioCatalogue.ts",
        "lib/studioGeneration.ts",
        "lib/studioLancement.ts",
        "lib/studioCases.ts",
        "lib/studioPrompts.ts",
      ]),
    );
  });

  it("n'expose aucun chemin d'écriture vers l'export ou l'extension : pas de route Studio sous api/listings, api/hermes ou api/sacbase", () => {
    const vente = [...balayer("app/api/listings", { recursif: true }), ...balayer("app/api/hermes", { recursif: true }), ...balayer("app/api/sacbase", { recursif: true })];
    const lisentStudio = vente.filter((f) => /\.\s*studio(?:Coloris|Reference|Angle|Essai|Echec|ModeleFavori|Reglages)\s*\./.test(lire(f)));
    expect(lisentStudio).toEqual([]);
  });

  it("côté vente, deux contacts et un seul fichier : les vraies photos partent, les images validées reviennent", () => {
    const appels = balayer("app/mise-en-vente", { recursif: true }).flatMap((f) =>
      [...lire(f).matchAll(/["'`](\/api\/studio\/[^"'`?]*)/g)].map((m) => `${f} → ${m[1]}`),
    );
    expect(appels.sort()).toEqual([
      "app/mise-en-vente/_referencesPhotos.ts → /api/studio/annonce",
      "app/mise-en-vente/_referencesPhotos.ts → /api/studio/image",
      "app/mise-en-vente/_referencesPhotos.ts → /api/studio/references",
    ]);
  });

  it("la route de l'annonce ne rend que les images VALIDÉES par Aramis, jamais selon l'avis IA", () => {
    const src = lire("app/api/studio/annonce/route.ts");
    expect(src).toMatch(/decision:\s*"valide"/);
    expect(src).not.toMatch(/verifIA/);
    expect(ECRITURE_ARTICLE.test(src)).toBe(false);
  });

  it("une image générée ne repart jamais comme vraie photo : les images du Studio sautent conserverReferences", () => {
    const page = lire("app/mise-en-vente/page.tsx");
    expect(page).toMatch(/await ajouterPhotos\(ficheId, [^\n]*\{ studio: true \}\);/);
    expect(page).toMatch(/if \(!studio && pourStudio\.length > 0/);
  });

  it("traite l'absence de app/api/studio sans échouer, et ne la laisse pas vide quand elle existe", () => {
    // Le dossier n'existe pas tant qu'aucune route Studio n'est écrite : le
    // balayage renvoie alors [] et les deux tests ci-dessus n'ont rien à lire,
    // ce qui est normal. Dès que le dossier existe, il doit contenir des
    // sources, sinon le balayage est cassé (ex. extension non reconnue).
    let existe = true;
    try {
      statSync(path.join(RACINE, "app/api/studio"));
    } catch {
      existe = false;
    }
    if (existe) expect(fichiersStudioApi().length).toBeGreaterThan(0);
    else expect(fichiersStudioApi()).toEqual([]);
  });
});
