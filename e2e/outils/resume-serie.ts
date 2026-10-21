/**
 * Résumé lisible d'une série de la suite e2e : écrit e2e/rapports/<serie>/RESUME.md
 * à partir de ce que le lancement a laissé (rapports JSON, journaux, captures)
 * et, pour le nombre de tests et la durée, du rapport JSON de Playwright.
 *
 *   PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/pw.json CAPTURES_SERIE=avant \
 *     npx playwright test --reporter=list,json
 *   CAPTURES_SERIE=avant npx tsx e2e/outils/resume-serie.ts --tests /tmp/pw.json [--stabilite stabilite.md]
 *
 * --stabilite : un fichier Markdown (comparaison de deux lancements identiques)
 * recopié tel quel dans une section « Stabilité » ; sans lui, la section manque.
 *
 * Lecture seule hors du RESUME.md : ne démarre rien, ne touche ni à la base ni
 * au réseau. Sans --tests, la section « Tests » le dit au lieu d'inventer.
 */
import fs from "node:fs";
import path from "node:path";

import { DOSSIERS, RACINE, SERIE } from "./environnement";
import { lireLignes } from "./journaux";
import type { ResultatA11y, ResultatSonde } from "../sondes/resultats";

const PROJETS = ["desktop-clair", "desktop-sombre", "mobile-clair", "mobile-sombre"] as const;

// ── Lecture ─────────────────────────────────────────────────────────────────

function lireJson<T>(fichier: string, defaut: T): T {
  try {
    return JSON.parse(fs.readFileSync(fichier, "utf8")) as T;
  } catch {
    return defaut;
  }
}

const rapport = (nom: string): string => path.join(DOSSIERS.rapports, nom);
const md = (texte: unknown): string => String(texte).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const court = (texte: unknown, max: number): string => {
  const t = String(texte).replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

function tableau(entetes: string[], lignes: unknown[][]): string {
  const corps = lignes.map((l) => `| ${l.map(md).join(" | ")} |`);
  return [`| ${entetes.join(" | ")} |`, `| ${entetes.map(() => "---").join(" | ")} |`, ...corps].join("\n");
}

// ── Tests (rapport JSON de Playwright) ──────────────────────────────────────

type TestJson = { projet: string; fichier: string; statut: string };
type SuiteJson = {
  suites?: SuiteJson[];
  specs?: { file?: string; tests?: { projectName: string; status: string }[] }[];
};
type RapportPlaywright = {
  stats?: { startTime?: string; duration?: number; expected?: number; skipped?: number; unexpected?: number; flaky?: number };
  suites?: SuiteJson[];
};

function testsDuRapport(r: RapportPlaywright): TestJson[] {
  const sortie: TestJson[] = [];
  const parcourir = (s: SuiteJson): void => {
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) sortie.push({ projet: t.projectName, fichier: spec.file ?? "?", statut: t.status });
    }
    for (const enfant of s.suites ?? []) parcourir(enfant);
  };
  for (const s of r.suites ?? []) parcourir(s);
  return sortie;
}

const duree = (ms: number): string => `${Math.floor(ms / 60_000)} min ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")} s`;

function sectionTests(cheminJson: string | null): string {
  if (!cheminJson) return "Rapport JSON de Playwright non fourni (option `--tests`) : nombre de tests et durée non consignés.";
  const r = lireJson<RapportPlaywright>(cheminJson, {});
  const tests = testsDuRapport(r);
  if (tests.length === 0) return `Rapport JSON illisible ou vide (${cheminJson}).`;
  const compte = (liste: TestJson[], statut: string) => liste.filter((t) => t.statut === statut).length;
  const ligne = (nom: string, liste: TestJson[]) => [
    nom, liste.length, compte(liste, "expected"), compte(liste, "skipped"), compte(liste, "unexpected"), compte(liste, "flaky"),
  ];
  const parProjet = [...new Set(tests.map((t) => t.projet))].map((p) => ligne(p, tests.filter((t) => t.projet === p)));
  // Les sondes sont déclarées dans sondes/harness.ts, enregistrées par sondes-bugs.spec.ts.
  const nomFichier = (f: string): string => (f.endsWith("sondes/harness.ts") ? "sondes-bugs.spec.ts (sondes F1-X15 et G1-G7, via sondes/harness.ts)" : f);
  const parFichier = [...new Set(tests.map((t) => t.fichier))].sort().map((f) => ligne(nomFichier(f), tests.filter((t) => t.fichier === f)));
  const entetes = ["", "Total", "Passés", "Sautés", "Échoués", "Instables"];
  const s = r.stats ?? {};
  return [
    `**${tests.length} tests** : ${compte(tests, "expected")} passés, ${compte(tests, "skipped")} sautés, ` +
      `${compte(tests, "unexpected")} échoués, ${compte(tests, "flaky")} instables (réussis au 2e essai ; \`retries: 0\`, donc 0 attendu). ` +
      `Durée : ${duree(s.duration ?? 0)}${s.startTime ? `, démarrage ${s.startTime}` : ""}.`,
    "",
    tableau(["Projet", ...entetes.slice(1)], parProjet),
    "",
    tableau(["Fichier", ...entetes.slice(1)], parFichier),
    "",
    "Les tests sautés sont les états réservés à une seule vue (desktop ou mobile), les sondes limitées à certains projets et les contrôles statiques lancés une seule fois.",
  ].join("\n");
}

// ── Captures ────────────────────────────────────────────────────────────────

function listerPng(serie: string, projet: string): string[] {
  const dossier = path.join(RACINE, "e2e", "captures.nosync", serie, projet);
  return fs.existsSync(dossier) ? fs.readdirSync(dossier).filter((f) => f.endsWith(".png") && !/ \d+\.png$/.test(f)) : [];
}

function sectionCaptures(): string {
  const lignes: (string | number)[][] = PROJETS.map((p) => {
    const f = listerPng(SERIE, p);
    const routes = f.filter((x) => x.startsWith("route.") && !x.startsWith("route.neuf.")).length;
    const neuf = f.filter((x) => x.startsWith("route.neuf.")).length;
    const etats = f.filter((x) => x.startsWith("etat.")).length;
    const sondes = f.filter((x) => x.startsWith("sonde-")).length;
    return [p, routes, neuf, etats, sondes, f.length];
  });
  const total = (i: number) => lignes.reduce((n, l) => n + Number(l[i]), 0);
  lignes.push(["**Total**", total(1), total(2), total(3), total(4), total(5)]);

  const racine = path.join(RACINE, "e2e", "captures.nosync");
  const series = fs.existsSync(racine) ? fs.readdirSync(racine).filter((d) => fs.statSync(path.join(racine, d)).isDirectory()).sort() : [];
  const parSerie: (string | number)[][] = series.map((s) => [s, ...PROJETS.map((p) => listerPng(s, p).length), PROJETS.reduce((n, p) => n + listerPng(s, p).length, 0)]);
  return [
    `Série **${SERIE}**, dans \`e2e/captures.nosync/${SERIE}/<projet>/<id>.png\` (gitignoré).`,
    "",
    tableau(["Projet", "Routes (demo ou public)", "Routes (compte neuf)", "États", "Sondes", "Total"], lignes),
    "",
    "Séries présentes sur le disque (toutes les captures, sondes comprises) :",
    "",
    tableau(["Série", ...PROJETS, "Total"], parSerie),
  ].join("\n");
}

// ── Sondes ──────────────────────────────────────────────────────────────────

type Mesure = Record<string, unknown>;
const nombre = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const lire = (m: Mesure, ...chemin: string[]): unknown =>
  chemin.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Mesure)[k] : undefined), m);
const tailleListe = (v: unknown): number | string => (Array.isArray(v) ? v.length : "?");

/** Représentant d'une sonde multi-projets : desktop clair d'abord (c'est la mesure de référence). */
function representant(entrees: ResultatSonde[]): ResultatSonde {
  return [...entrees].sort((a, b) => PROJETS.indexOf(a.projet as (typeof PROJETS)[number]) - PROJETS.indexOf(b.projet as (typeof PROJETS)[number]))[0];
}

/** Mesure clé, en une phrase, pour chaque sonde. Repli : trois premiers champs scalaires. */
const MESURE_CLE: Record<string, (m: Mesure, e: ResultatSonde[]) => string> = {
  F1: (m) => `déclarée « ${lire(m, "declaree")} » ≠ corps (même police : ${lire(m, "memeQueCorps")}), ${lire(m, "enLigneSansVariable")} font-family en ligne sans variable`,
  F2: (m) => `${lire(m, "lt10")} textes < 10 px, ${lire(m, "lt11")} < 11 px sur ${lire(m, "textesVisibles")}`,
  F3: (m) => `${lire(m, "suivent")} textes sur ${lire(m, "total")} suivent la taille racine (ratio ${lire(m, "ratio")})`,
  O1: (m) => `voile alpha ${lire(m, "alphaVoile")}, assombrissement ${lire(m, "assombrissement")}`,
  O2: (m) => `fond ${lire(m, "fond")} (alpha ${lire(m, "alpha")}), contraste ${lire(m, "contraste")}`,
  O3: (m) => `overlay alpha ${lire(m, "alphaOverlay")}, bouton X alpha ${lire(m, "alphaBouton")}, contraste icône/bouton ${lire(m, "contrasteIconeBouton")}`,
  M1: (m) => `contraste de l'entrée active ${lire(m, "contrasteTexte")}:1 (${lire(m, "fg")} sur ${lire(m, "fondEffectif")})`,
  M2: (m) => `débordement vertical ${lire(m, "debordV")} px, vide en bas ${lire(m, "videEnBas")} px, pleine hauteur ${JSON.stringify(lire(m, "pleineHauteur"))}`,
  M3: (m) => `z-index : ${JSON.stringify(lire(m, "nbParZ"))}, éléments sans jeton --z-* : ${tailleListe(lire(m, "sansJeton"))}`,
  MO1: (m) => `${lire(m, "sous16")} champs sur ${lire(m, "champs")} sous 16 px (minimum ${lire(m, "minimum")} px)`,
  MO2: (m) => {
    const barres = lire(m, "zoneSure34", "barres");
    const pire = Array.isArray(barres) ? Math.max(...barres.map((b) => nombre((b as Mesure).chevauche) ?? 0)) : "?";
    return `dock ${lire(m, "zoneSure0", "dockH")} px ; à zone sûre 34 px, chevauchement jusqu'à ${pire} px`;
  },
  MO3: (m) => `toast en thème ${lire(m, "theme")} : fond ${lire(m, "fond")}, suit le thème : ${lire(m, "suitLeTheme")}, police de l'app : ${lire(m, "policeDeLApp")}`,
  MO4: (m) => `pouce de défilement ${lire(m, "pouce")} (luminance ${lire(m, "luminancePouce")}), contraste avec le fond ${lire(m, "contrastePouceFond")}:1`,
  S1: (m) => `planche à y=${lire(m, "plancheY")} px, file « À juger » à y=${lire(m, "jugerY")} px (visible : ${lire(m, "jugerVisible")})`,
  S2: (m) => `${lire(m, "photos")} photos, ${lire(m, "retirer")} commande « retirer », ${lire(m, "remplacer")} « remplacer »`,
  S3: (m) => {
    const delais = [lire(m, "rejet", "patches", "0", "delaiMs"), lire(m, "validation", "patches", "0", "delaiMs")].map(nombre).filter((v): v is number => v !== null);
    // Le délai exact (5 à 8 ms) change d'un lancement à l'autre : on ne garde que « immédiat ou non ».
    const immediat = delais.length > 0 && Math.max(...delais) < 100;
    return `PATCH envoyé ${immediat ? "sans délai (< 100 ms)" : `${Math.max(...delais)} ms`} après la touche, « Annuler » : ${lire(m, "rejet", "annulerApres300ms")}`;
  },
  S4: (m) => `${lire(m, "controlesHistorique")} contrôle d'historique, ${lire(m, "decisionsAffichees")} décision affichée`,
  S5: (m) => `${lire(m, "mecanismes")} mécanismes concurrents (glisser, toucher puis case, fichier par case, sélecteur), alternative clavier : ${lire(m, "alternativeClavier")}`,
  S6: (m) => `${lire(m, "requetesFavorisApresClic")} requête de favori après clic sur l'étoile, bascules ${lire(m, "apresClicEtoile", "bascules")}`,
  S7: (m) => `menu « ${lire(m, "menu")} », titre de barre « ${lire(m, "titreBarre")} »`,
  S8: (m) => `${lire(m, "initial", "pilules")} pilules, ${lire(m, "initial", "options")} options, coût par sac : ${lire(m, "initial", "parSac")}, « Hors budget » : ${lire(m, "initial", "horsBudget")}, ${lire(m, "nbModelesDuPayload")} modèle dans le payload`,
  X0: (m) => `${lire(m, "requetesVerifier")} requête /verifier partie à l'ouverture (interceptée, aucun coût réel)`,
  X1: (m) => `dialogue décalé de ${lire(m, "haut")} px, hauteur ${lire(m, "hauteur")} px pour une fenêtre de ${lire(m, "hauteurFenetre")} px`,
  X2: (m) => `bulle du chat sur le bouton principal : aire ${lire(m, "aire")} px², point du bouton = « ${lire(m, "pointDuBouton")} »`,
  X3: (m) => `pied de la sidebar atteignable : ${lire(m, "atteignable")}, couvert par ${lire(m, "couvertPar")}`,
  X4: (m) => `après repli : dTop ${lire(m, "replie", "dTop")} px, dH ${lire(m, "replie", "dH")} px`,
  X5: (m) => `carte à y=${lire(m, "carteTop")} px sous une barre qui finit à y=${lire(m, "topbarBas")} px`,
  X6: (m) => `role=dialog : ${lire(m, "roleDialogue")}, dialogue encore ouvert après Échap : ${lire(m, "dialogueEncoreOuvertApresEchap")}`,
  X7: (m) => `theme-color ${lire(m, "themeColor")} pour un thème d'app « ${lire(m, "themeApp")} »`,
  X8: (_m, e) => `jusqu'à ${Math.max(0, ...e.map((x) => nombre(lire(x.mesure, "violations")) ?? 0))} éléments sous AA par page`,
  X9: (m) => `scrollWidth ${lire(m, "scrollW")} px pour ${lire(m, "clientW")} px, hors écran : ${JSON.stringify(lire(m, "horsEcran"))}`,
  X10: (m) => `${lire(m, "posts")} envoi de photos, toast « ${lire(m, "toasts", "0")} »`,
  X11: (m) => `filtre actif avant rechargement : ${lire(m, "pressedAvantRechargement")}, après : ${lire(m, "pressedApresRechargement")}`,
  X12: (m) => `tableau des angles : scrollWidth ${lire(m, "scrollW")} px pour ${lire(m, "clientW")} px (${lire(m, "angles")} angles)`,
  X13: (m) => `libellé « ${lire(m, "label")} » au lieu de « ${lire(m, "attendu")} »`,
  X14: (m) => `fichier cité existe : ${lire(m, "fichierExiste")} (${JSON.stringify(lire(m, "citationsDansLaDoc"))})`,
  X15: (m) => `toasts affichés après ?trello=ok : ${tailleListe(lire(m, "toasts"))} (URL nettoyée : ${lire(m, "urlApres")})`,
};

/** Sondes globales G1-G7 : une mesure par route et par projet, on résume le pire cas. */
const MESURE_GLOBALE: Record<string, (e: ResultatSonde[]) => string> = {
  G1: (e) => pire(e, "lt10", "textes < 10 px"),
  G2: (e) => pire(e, "nbTailles", "tailles distinctes"),
  G3: (e) => {
    const r = e.map((x) => nombre(lire(x.mesure, "ratio"))).filter((v): v is number => v !== null);
    return r.length ? `ratio de texte qui suit le zoom : de ${Math.min(...r)} à ${Math.max(...r)}` : "?";
  },
  G4: (e) => `${e.filter((x) => (nombre(lire(x.mesure, "debordH")) ?? 0) > 0).length} mesures avec débordement horizontal ; ${pire(e, "debordV", "px de débordement vertical")}`,
  G5: (e) => pire(e, "sansJeton", "éléments fixes/sticky sans jeton --z-*", true),
  G6: (e) => pire(e, "sous16", "champs < 16 px"),
  G7: (e) => `${new Set(e.flatMap((x) => (lire(x.mesure, "classesSansRegle") as string[] | undefined) ?? [])).size} classes d'opacité sans règle CSS`,
};

function pire(e: ResultatSonde[], cle: string, libelle: string, liste = false): string {
  let max = -1;
  let ou = "";
  for (const x of e) {
    const brut = lire(x.mesure, cle);
    const v = liste ? (Array.isArray(brut) ? brut.length : null) : nombre(brut);
    if (v !== null && v > max) {
      max = v;
      ou = `${x.route} ${x.projet}`;
    }
  }
  return max < 0 ? "?" : `pire cas ${max} ${libelle} (${court(ou, 50)})`;
}

function mesureGenerique(m: Mesure): string {
  const scalaires = Object.entries(m).filter(([, v]) => ["number", "string", "boolean"].includes(typeof v)).slice(0, 3);
  return scalaires.map(([k, v]) => `${k}=${court(v, 40)}`).join(", ");
}

function sectionSondes(sondes: ResultatSonde[]): string {
  if (sondes.length === 0) return "Aucun résultat (sondes.json absent).";
  const ordre = (id: string) => {
    const m = /^([A-Z]+)(\d+)$/.exec(id);
    return m ? `${["F", "O", "M", "MO", "S", "X", "G"].indexOf(m[1])}-${m[2].padStart(3, "0")}` : id;
  };
  const ids = [...new Set(sondes.map((s) => s.id))].sort((a, b) => ordre(a).localeCompare(ordre(b)));
  const cumul: Record<string, number> = {};
  for (const s of sondes) cumul[s.etat] = (cumul[s.etat] ?? 0) + 1;

  const lignes = ids.map((id) => {
    const e = sondes.filter((s) => s.id === id);
    const etats = (["bug présent", "corrigé", "non mesurable"] as const)
      .map((n) => [n, e.filter((s) => s.etat === n).length] as const)
      .filter(([, n]) => n > 0)
      .map(([nom, n]) => `${nom} ×${n}`)
      .join(", ");
    const rep = representant(e);
    let cle: string;
    try {
      cle = id.startsWith("G") ? (MESURE_GLOBALE[id]?.(e) ?? mesureGenerique(rep.mesure)) : (MESURE_CLE[id]?.(rep.mesure, e) ?? mesureGenerique(rep.mesure));
    } catch {
      cle = mesureGenerique(rep.mesure);
    }
    const projets = [...new Set(e.map((s) => s.projet))].length;
    return [id, rep.titre, `${etats} (${e.length} mesure${e.length > 1 ? "s" : ""}, ${projets} projet${projets > 1 ? "s" : ""})`, `${cle}${id.startsWith("G") ? "" : ` — ${rep.route}, ${rep.projet}`}`];
  });
  return [
    `**${sondes.length} résultats**, ${ids.length} identifiants : bug présent ${cumul["bug présent"] ?? 0}, corrigé ${cumul["corrigé"] ?? 0}, non mesurable ${cumul["non mesurable"] ?? 0}. ` +
      "« Corrigé » = le critère de la sonde est déjà vrai (voir `e2e/sondes/LISEZMOI.md`). Valeurs complètes dans `sondes.json`.",
    "",
    tableau(["Id", "Titre", "État", "Mesure clé (desktop clair d'abord)"], lignes),
  ].join("\n");
}

// ── Accessibilité (axe) ─────────────────────────────────────────────────────

function sectionA11y(a11y: ResultatA11y[]): string {
  if (a11y.length === 0) return "Aucun résultat (a11y.json absent).";
  const impacts = ["critical", "serious", "moderate", "minor"] as const;
  const parImpactProjet = PROJETS.map((p) => {
    const e = a11y.filter((a) => a.projet === p);
    return [
      p, e.length, e.filter((a) => a.graves > 0).length,
      ...impacts.map((i) => `${e.reduce((n, a) => n + (a.parImpact[i] ?? 0), 0)} (${e.reduce((n, a) => n + (a.noeudsParImpact[i] ?? 0), 0)})`),
    ];
  });
  const tot = (i: (typeof impacts)[number], cle: "parImpact" | "noeudsParImpact") => a11y.reduce((n, a) => n + (a[cle][i] ?? 0), 0);
  parImpactProjet.push([
    "**Total**", a11y.length, a11y.filter((a) => a.graves > 0).length,
    ...impacts.map((i) => `${tot(i, "parImpact")} (${tot(i, "noeudsParImpact")})`),
  ]);

  const regles = new Map<string, { impact: string; pages: number; noeuds: number; aide: string }>();
  for (const a of a11y) {
    for (const v of a.violations) {
      const r = regles.get(v.regle) ?? { impact: v.impact ?? "?", pages: 0, noeuds: 0, aide: v.aide };
      r.pages += 1;
      r.noeuds += v.noeuds;
      regles.set(v.regle, r);
    }
  }
  const parRegle = [...regles]
    .sort((x, y) => y[1].pages - x[1].pages || y[1].noeuds - x[1].noeuds)
    .map(([nom, r]) => [nom, r.impact, r.pages, r.noeuds, r.aide]);

  return [
    `axe-core, balises wcag2a, wcag2aa, wcag21aa, wcag22aa. **${a11y.length} pages × projets** mesurées, ` +
      `${a11y.filter((a) => a.graves > 0).length} avec au moins une violation serious ou critical.`,
    "",
    "Règles en infraction par impact, éléments (nœuds) entre parenthèses :",
    "",
    tableau(["Projet", "Pages", "Pages avec serious/critical", ...impacts], parImpactProjet),
    "",
    "Par règle (nombre de pages × projets touchées, nœuds cumulés) :",
    "",
    tableau(["Règle", "Impact", "Pages", "Nœuds", "Aide"], parRegle),
  ].join("\n");
}

// ── Console, faux serveurs, garde réseau ────────────────────────────────────

type LigneCapture = {
  projet: string;
  id: string;
  chemin: string;
  console?: { type: string; texte: string; fois?: number }[];
};

/** Message de console sans le décor de `next dev` (`%c%s%c … background: …`). */
function nettoyerMessage(texte: string): string {
  return texte.replace(/^%c%s%c\s*/, "").replace(/\s*background:[\s\S]*$/, "").replace(/\s+/g, " ").trim();
}

/** « F1 », « G », « axe »… : de quel test vient une ligne de console.jsonl (le titre du test cite la sonde). */
function origineConsole(test: string): string {
  if (test.startsWith("a11y.spec.ts")) return "axe";
  const sonde = /› ([A-Z]{1,2}\d+) · /.exec(test);
  if (sonde) return sonde[1];
  if (/› G · Sondes globales/.test(test)) return "G";
  return test.split(" › ")[0] ?? "?";
}

function sectionConsole(): string {
  const lignes = lireLignes(rapport("captures.jsonl")) as unknown as LigneCapture[];
  if (lignes.length === 0) return "captures.jsonl absent : aucune erreur de console consignée.";
  const parRoute = new Map<string, { chemin: string; projets: Set<string>; messages: Map<string, { type: string; fois: number }> }>();
  for (const l of lignes) {
    const r = parRoute.get(l.id) ?? { chemin: l.chemin, projets: new Set<string>(), messages: new Map() };
    for (const c of l.console ?? []) {
      const cle = court(nettoyerMessage(c.texte), 160);
      const m = r.messages.get(cle) ?? { type: c.type, fois: 0 };
      m.fois += c.fois ?? 1;
      r.messages.set(cle, m);
      r.projets.add(l.projet);
    }
    parRoute.set(l.id, r);
  }
  const avecErreurs = [...parRoute].filter(([, r]) => r.messages.size > 0);
  const lignesTable = avecErreurs.flatMap(([id, r]) =>
    [...r.messages].map(([texte, m]) => [id, r.chemin, `${r.projets.size}/4`, m.type === "pageerror" ? "pageerror" : "console.error", m.fois, texte]),
  );
  const distincts = new Set(lignesTable.map((l) => l[5]));

  // Les sondes et axe visitent aussi les pages : leurs erreurs vont dans console.jsonl, pas dans captures.jsonl.
  const horsCaptures = lireLignes(rapport("console.jsonl")).filter((l) => !/^(captures|etats)\.spec\.ts/.test(String(l.test)));
  const groupes = new Map<string, { type: string; fois: number; projets: Set<string>; origines: Set<string> }>();
  for (const l of horsCaptures) {
    const cle = court(nettoyerMessage(String(l.texte)), 120);
    const g = groupes.get(cle) ?? { type: String(l.type), fois: 0, projets: new Set<string>(), origines: new Set<string>() };
    g.fois += 1;
    g.projets.add(String(l.projet));
    g.origines.add(origineConsole(String(l.test)));
    groupes.set(cle, g);
  }
  const lignesSondes = [...groupes]
    .sort((a, b) => b[1].fois - a[1].fois)
    .map(([texte, g]) => [g.type === "pageerror" ? "pageerror" : "console.error", g.fois, [...g.projets].sort().join(", "), [...g.origines].sort().join(", "), texte]);

  return [
    `${lignes.length} captures consignées (routes et états), **${avecErreurs.length} avec au moins une erreur de console ou pageerror**, ` +
      `${distincts.size} message(s) distinct(s). Les erreurs sont relevées, elles ne font pas échouer la suite (état « avant » de l'application). ` +
      "La plupart viennent d'états volontairement en erreur (404 attendues, réponses 401/403/409/500/503 simulées par le test).",
    "",
    lignesTable.length ? tableau(["Capture", "Chemin", "Projets", "Type", "Occurrences", "Message (160 car. max)"], lignesTable) : "Aucune.",
    "",
    `Hors captures (sondes et axe, \`console.jsonl\`) : ${horsCaptures.length} ligne(s), ${groupes.size} message(s) distinct(s). ` +
      "Les `net::ERR_FAILED` sur `/_next/static/chunks/*` viennent des sondes M1 et X13, qui bloquent volontairement les scripts pour mesurer le HTML rendu par le serveur : ce ne sont pas des erreurs de l'application.",
    "",
    lignesSondes.length ? tableau(["Type", "Occurrences", "Projets", "Sondes", "Message (120 car. max)"], lignesSondes) : "Aucune.",
  ].join("\n");
}

function normaliserChemin(c: string): string {
  return c
    .replace(/\/img\/coloris\/[^/]+$/, "/img/coloris/<fichier>")
    .replace(/\/[0-9a-f]{8,}(?=\/|$)/g, "/<id>")
    .replace(/\?.*$/, "");
}

function sectionMocks(): string {
  const lignes = lireLignes(rapport("mocks.jsonl"));
  if (lignes.length === 0) return "mocks.jsonl absent ou vide.";
  const groupes = new Map<string, number>();
  for (const l of lignes) {
    const cle = [l.serveur, l.methode, normaliserChemin(String(l.chemin)), l.statut].join("\u0000");
    groupes.set(cle, (groupes.get(cle) ?? 0) + 1);
  }
  const rows = [...groupes]
    .map(([cle, n]) => [...cle.split("\u0000"), n] as string[] | (string | number)[])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || Number(b[4]) - Number(a[4]));
  const parServeur = [...new Set(lignes.map((l) => String(l.serveur)))].sort().map((s) => `${s} : ${lignes.filter((l) => l.serveur === s).length}`);
  return [
    `**${lignes.length} appels reçus** (${parServeur.join(", ")}). Le nombre d'appels de catalogue dépend du cache du serveur (10 min pour OpenRouter, 60 s pour SacBase) : il varie un peu d'un lancement à l'autre.`,
    "",
    tableau(["Faux serveur", "Méthode", "Chemin", "Statut", "Appels"], rows),
  ].join("\n");
}

function sectionReseau(): string {
  const serveur = lireLignes(rapport("reseau-serveur.jsonl"));
  const navigateur = lireLignes(rapport("reseau-navigateur.jsonl"));
  const refus = serveur.filter((l) => l.evenement === "refus");
  const chargements = serveur.filter((l) => l.evenement === "chargement");
  const parHote = new Map<string, number>();
  for (const r of refus) parHote.set(String(r.hote), (parHote.get(String(r.hote)) ?? 0) + 1);
  const versOpenRouter = refus.filter((r) => /(^|\.)openrouter\.ai$/i.test(String(r.hote))).length;
  return [
    `- **Garde réseau du serveur** (\`e2e/garde-reseau.mjs\`) : chargée dans ${chargements.length} processus Node (le serveur Next et ses processus enfants) ; ` +
      `${refus.length} requête(s) refusée(s)${refus.length ? ` : ${[...parHote].map(([h, n]) => `${h} ×${n}`).join(", ")}` : ""}.`,
    `- **Refus vers openrouter.ai : ${versOpenRouter}** (le globalTeardown fait échouer la suite si ce nombre dépasse 0).`,
    "- Le refus de `registry.npmjs.org` est le contrôle de version de `next dev` : il prouve que la garde voit bien les `fetch` de Next.",
    `- **Garde du navigateur** (\`context.route\`) : ${navigateur.length} requête(s) refusée(s) vers un hôte non local${navigateur.length ? " (voir reseau-navigateur.jsonl)" : ""}.`,
  ].join("\n");
}

// ── États non capturés ──────────────────────────────────────────────────────

function sectionEtats(): string {
  const etats = lireJson<{ captures?: unknown[]; nonCaptures?: { id: string; raison: string }[]; simules?: unknown[] }>(rapport("etats.json"), {});
  const non = etats.nonCaptures ?? [];
  if (!etats.captures && non.length === 0) return "etats.json absent.";
  return [
    `${etats.captures?.length ?? "?"} états capturés (sur les 73 de \`routes-etats.json\`, plus des états hors étude) ; **${non.length} non capturés** :`,
    "",
    tableau(["État", "Raison"], non.map((n) => [n.id, n.raison])),
  ].join("\n");
}

// ── Assemblage ──────────────────────────────────────────────────────────────

function main(): void {
  const i = process.argv.indexOf("--tests");
  const cheminTests = i >= 0 ? process.argv[i + 1] : null;
  const j = process.argv.indexOf("--stabilite");
  const stabilite = j >= 0 && fs.existsSync(process.argv[j + 1]) ? fs.readFileSync(process.argv[j + 1], "utf8").trim() : null;
  const base = lireJson<{ lancement?: string; migration?: string; seed?: string; dureeMs?: number }>(rapport("base.json"), {});
  const sondes = lireJson<ResultatSonde[]>(rapport("sondes.json"), []);
  const a11y = lireJson<ResultatA11y[]>(rapport("a11y.json"), []);
  const lancements = new Set([...sondes.map((s) => s.lancement), ...a11y.map((a) => a.lancement)]);

  const texte = [
    `# Référence « ${SERIE} » — suite e2e MyFlip`,
    "",
    `- **Date** : ${(base.lancement ?? new Date().toISOString()).slice(0, 10)} · lancement \`${base.lancement ?? "?"}\``,
    `- **Commande** : \`CAPTURES_SERIE=${SERIE} E2E_DECALAGE=0 npx playwright test\` (workers : valeur par défaut de \`playwright.config.ts\`)`,
    `- **Base** : Postgres embarqué local, \`${base.migration ?? "?"}\` + seed e2e en ${base.dureeMs ?? "?"} ms. Aucun accès à Neon ni à une API réelle.`,
    `- **Cohérence** : ${lancements.size === 1 ? "toutes les mesures de sondes et d'axe viennent du même lancement" : `ATTENTION, ${lancements.size} lancements mélangés dans sondes.json et a11y.json`}.`,
    "",
    "Régénérer ce fichier : `CAPTURES_SERIE=" + SERIE + " npx tsx e2e/outils/resume-serie.ts --tests <rapport JSON de Playwright>`.",
    "",
    "## Tests",
    "",
    sectionTests(cheminTests),
    "",
    ...(stabilite ? ["## Stabilité", "", stabilite, ""] : []),
    "## Captures",
    "",
    sectionCaptures(),
    "",
    "## Sondes des bugs",
    "",
    sectionSondes(sondes),
    "",
    "## Accessibilité (axe)",
    "",
    sectionA11y(a11y),
    "",
    "## Erreurs de console par route",
    "",
    sectionConsole(),
    "",
    "## Appels reçus par les faux serveurs",
    "",
    sectionMocks(),
    "",
    "## Garde réseau",
    "",
    sectionReseau(),
    "",
    "## États non capturés",
    "",
    sectionEtats(),
    "",
  ].join("\n");

  fs.writeFileSync(rapport("RESUME.md"), texte);
  console.log(`RESUME.md écrit : ${path.relative(RACINE, rapport("RESUME.md"))} (${texte.split("\n").length} lignes)`);
}

main();
