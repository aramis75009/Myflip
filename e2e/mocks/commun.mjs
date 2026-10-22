// Socle commun des faux serveurs e2e (Node pur, aucune dépendance).
//
// Chaque faux serveur écoute sur 127.0.0.1 seulement et expose :
//   GET  /__e2e/appels       → { nom, compteur, appels: [...] } (preuve que c'est bien lui qui a répondu)
//   POST /__e2e/reinitialiser → remet le compteur et la liste à zéro
//   POST /__e2e/etat          → fusionne un JSON dans l'état (ex. { "panne": true } pour SacBase)
// et journalise chaque requête dans E2E_JOURNAL_MOCKS (JSONL) et sur stdout.
// Aucune en-tête n'est journalisée : seulement la présence d'un Bearer.

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const JOURNAL = process.env.E2E_JOURNAL_MOCKS || "";

function journaliser(entree) {
  if (!JOURNAL) return;
  try {
    fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
    fs.appendFileSync(JOURNAL, JSON.stringify(entree) + "\n");
  } catch {
    // Le journal est un confort : il ne doit jamais faire tomber le faux serveur.
  }
}

async function lireCorps(req) {
  const morceaux = [];
  for await (const m of req) morceaux.push(m);
  return Buffer.concat(morceaux);
}

export function envoyerJson(res, statut, corps, entetes = {}) {
  const octets = Buffer.from(JSON.stringify(corps));
  res.writeHead(statut, { "Content-Type": "application/json; charset=utf-8", "Content-Length": octets.length, ...entetes });
  res.end(octets);
}

export function portDepuisEnv(defaut) {
  const p = Number(process.env.E2E_PORT_MOCK || defaut);
  if (!Number.isInteger(p) || p <= 0 || p > 65535) throw new Error(`Port invalide : ${process.env.E2E_PORT_MOCK}`);
  return p;
}

/**
 * Démarre un faux serveur. `gerer({ req, url, corps, json, appel, etat })` rend
 * { statut, json } ou { statut, octets, type } ; `appel` peut être enrichi
 * (ex. appel.modele) pour les assertions. Rendre null = 404 bruyant.
 */
export function demarrerFauxServeur({ nom, port, gerer, etatInitial = {} }) {
  const appels = [];
  let compteur = 0;
  const etat = { ...etatInitial };

  const serveur = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname === "/__e2e/appels" && req.method === "GET") {
        return envoyerJson(res, 200, { nom, compteur, etat, appels });
      }
      if (url.pathname === "/__e2e/reinitialiser" && req.method === "POST") {
        appels.length = 0;
        compteur = 0;
        return envoyerJson(res, 200, { ok: true });
      }
      if (url.pathname === "/__e2e/etat" && req.method === "POST") {
        const maj = JSON.parse((await lireCorps(req)).toString("utf8") || "{}");
        Object.assign(etat, maj);
        return envoyerJson(res, 200, { ok: true, etat });
      }

      const corps = await lireCorps(req);
      let json = null;
      if (corps.length > 0 && String(req.headers["content-type"] ?? "").includes("json")) {
        try {
          json = JSON.parse(corps.toString("utf8"));
        } catch {
          json = null;
        }
      }
      compteur++;
      const appel = {
        n: compteur,
        quand: new Date().toISOString(),
        methode: req.method,
        chemin: url.pathname,
        bearer: /^Bearer\s+\S/.test(String(req.headers.authorization ?? "")),
      };

      let reponse = await gerer({ req, url, corps, json, appel, etat });
      if (!reponse) {
        process.stderr.write(`[${nom}] 404 ROUTE INCONNUE ${req.method} ${url.pathname}\n`);
        reponse = { statut: 404, json: { error: { message: `route inconnue du faux serveur ${nom}` } } };
      }
      appel.statut = reponse.statut;
      appels.push(appel);
      journaliser({ serveur: nom, ...appel });
      process.stdout.write(`[${nom}] ${req.method} ${url.pathname} → ${reponse.statut}\n`);

      if (reponse.octets) {
        res.writeHead(reponse.statut, { "Content-Type": reponse.type ?? "application/octet-stream", "Content-Length": reponse.octets.length });
        return res.end(reponse.octets);
      }
      return envoyerJson(res, reponse.statut, reponse.json ?? {});
    } catch (e) {
      process.stderr.write(`[${nom}] erreur interne : ${e instanceof Error ? e.message : String(e)}\n`);
      return envoyerJson(res, 500, { error: { message: "erreur interne du faux serveur" } });
    }
  });

  serveur.listen(port, "127.0.0.1", () => {
    process.stdout.write(`[${nom}] à l'écoute sur http://127.0.0.1:${port}\n`);
  });
  const arreter = () => serveur.close(() => process.exit(0));
  process.on("SIGTERM", arreter);
  process.on("SIGINT", arreter);
  return serveur;
}
