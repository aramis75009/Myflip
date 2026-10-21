// Garde réseau du serveur e2e, chargée AVANT Next par
//   NODE_OPTIONS="--import=./e2e/garde-reseau.mjs"
// (chemin relatif : le dossier de l'app contient des espaces ; cwd = racine).
//
// Elle enveloppe globalThis.fetch et REFUSE toute requête vers un hôte non
// local, sauf les polices Google de next/font (publiques, gratuites). Chaque
// refus lève une TypeError (comme une panne réseau) et s'écrit dans
// E2E_JOURNAL_RESEAU (e2e/rapports/<serie>/reseau-serveur.jsonl) ; le
// globalTeardown fait échouer la suite si un refus vise openrouter.ai.
//
// Limites connues : elle ne voit ni undici appelé directement (put/del de
// @vercel/blob), ni node:http(s) (téléchargement des polices par next/font).
// Next enveloppe à son tour globalThis.fetch (cache de fetch) : son enveloppe
// appelle la nôtre, la garde reste donc en place. Les refus du contrôle de
// version de `next dev` (registry.npmjs.org) en sont la preuve à chaque
// lancement.
//
// Aucune en-tête ni chaîne de requête n'est journalisée : elles peuvent porter
// une clé (Trello met key= et token= dans l'URL).

import fs from "node:fs";
import path from "node:path";

const AUTORISES = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "fonts.googleapis.com", "fonts.gstatic.com"]);
const LOCAUX = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const JOURNAL = process.env.E2E_JOURNAL_RESEAU || path.resolve("e2e", "rapports", "courant", "reseau-serveur.jsonl");
const RUN = process.env.E2E_RUN_ID || "inconnu";

function journaliser(entree) {
  try {
    fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
    fs.appendFileSync(JOURNAL, JSON.stringify({ run: RUN, quand: new Date().toISOString(), pid: process.pid, ...entree }) + "\n");
  } catch {
    // Un journal illisible ne doit jamais casser le serveur : le refus, lui, a eu lieu.
  }
}

function urlDe(entree) {
  try {
    if (typeof entree === "string") return new URL(entree);
    if (entree instanceof URL) return entree;
    if (entree && typeof entree.url === "string") return new URL(entree.url);
  } catch {
    // URL relative ou illisible : fetch lèvera de lui-même.
  }
  return null;
}

const fetchOrigine = globalThis.fetch;

if (typeof fetchOrigine === "function" && !globalThis.__gardeReseauE2E) {
  globalThis.__gardeReseauE2E = true;

  globalThis.fetch = async function fetchGardeE2E(entree, init) {
    const url = urlDe(entree);
    if (url && (url.protocol === "http:" || url.protocol === "https:")) {
      const hote = url.hostname;
      if (!AUTORISES.has(hote)) {
        const methode = (init && init.method) || (entree && typeof entree === "object" && entree.method) || "GET";
        journaliser({ evenement: "refus", hote, methode: String(methode).toUpperCase(), chemin: url.pathname });
        process.stderr.write(`[garde-reseau e2e] REFUS ${String(methode).toUpperCase()} ${url.protocol}//${hote}${url.pathname}\n`);
        throw new TypeError(`[garde-reseau e2e] requête refusée vers ${hote} : la suite e2e n'appelle que des serveurs locaux.`);
      }
      if (!LOCAUX.has(hote)) journaliser({ evenement: "autorise", hote, chemin: url.pathname });
    }
    return fetchOrigine(entree, init);
  };

  journaliser({ evenement: "chargement", argv: process.argv.slice(1, 3).map((a) => path.basename(a)) });
  process.stderr.write(`[garde-reseau e2e] active dans le processus ${process.pid} (${path.basename(process.argv[1] ?? "?")})\n`);
}
