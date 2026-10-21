// Faux SacBase de la suite e2e : http://127.0.0.1:<4011+D> (SACBASE_URL).
//
// Spécification : docs/refonte/etude-2026-10-20/appels-externes.json,
// « sacbaseMockSpec ». Le catalogue servi est e2e/seed/sacbase-coloris.json,
// écrit par le seed (forme EXACTE attendue par parseColorisCatalogue,
// lib/studioColoris.ts) et relu à chaque requête. Absent ⇒ liste vide.
//
//   GET /api/studio/coloris  (Bearer = SACBASE_STUDIO_TOKEN, sinon 401)
//   GET /img/<chemin>         (Bearer) → image synthétique
//   POST /__e2e/etat {"panne": true} → 503 partout, pour capturer « stale » / « off »
//
// Lancement : E2E_PORT_MOCK=4011 E2E_SACBASE_JETON=… node e2e/mocks/sacbase.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { demarrerFauxServeur, portDepuisEnv } from "./commun.mjs";
import { pngSac } from "./image-synthetique.mjs";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(ICI, "..", "seed", "sacbase-coloris.json");
const JETON = process.env.E2E_SACBASE_JETON || "e2e-sacbase-jeton-factice";

function catalogue() {
  try {
    return JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  } catch {
    process.stderr.write(`[SacBase factice] ${FIXTURE} absent ou illisible : catalogue vide.\n`);
    return { genere: new Date().toISOString(), ecartes: [], coloris: [] };
  }
}

const IMAGE_RE = /^\/img\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*\.(?:jpe?g|png|webp)$/i;

demarrerFauxServeur({
  nom: "SacBase factice",
  port: portDepuisEnv(4011),
  etatInitial: { panne: false },
  gerer: ({ req, url, appel, etat }) => {
    const autorise = String(req.headers.authorization ?? "") === `Bearer ${JETON}`;

    if (req.method === "GET" && url.pathname === "/api/studio/coloris") {
      appel.type = "coloris";
      if (etat.panne) return { statut: 503, json: { error: "panne simulée (e2e)" } };
      if (!autorise) return { statut: 401, json: { error: "jeton invalide" } };
      return { statut: 200, json: catalogue() };
    }

    if (req.method === "GET" && url.pathname.startsWith("/img/")) {
      appel.type = "image";
      if (etat.panne) return { statut: 503, json: { error: "panne simulée (e2e)" } };
      if (!autorise) return { statut: 401, json: { error: "jeton invalide" } };
      if (!IMAGE_RE.test(url.pathname) || url.pathname.includes("..")) return { statut: 404, json: { error: "image inconnue" } };
      // Toujours un PNG, annoncé comme tel (le relais de MyFlip recopie le type reçu).
      return { statut: 200, octets: pngSac(`sacbase:${url.pathname}`, 240, 320), type: "image/png" };
    }

    return null;
  },
});
