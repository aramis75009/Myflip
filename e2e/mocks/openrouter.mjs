// Faux OpenRouter de la suite e2e : http://127.0.0.1:<4010+D>/api/v1
// (OPENROUTER_BASE_URL du serveur de test, lue par lib/openrouterBase.ts).
//
// Spécification : docs/refonte/etude-2026-10-20/appels-externes.json,
// « openrouterMockSpec ». Les formes de réponse sont celles que lisent
// lireReponse (lib/openrouter.ts) et lib/openrouterChat.ts. Toute autre route :
// 404 bruyant sur stderr. Les routes d'images du Studio (catalogue, tarifs,
// génération, avis IA) sont parties avec la génération d'images le 17/11/2026.
//
// Lancement : E2E_PORT_MOCK=4010 node e2e/mocks/openrouter.mjs

import { demarrerFauxServeur, portDepuisEnv } from "./commun.mjs";

const PREFIXE = "/api/v1";

// Une clé FACTICE, reconnaissable à « e2e » (le seed pose « e2e-fausse-cle-… »
// sur le compte demo, la spécification citait « sk-or-v1-e2e-factice ») : toute
// autre clé, ou aucune, prend un 401 comme chez OpenRouter.
const cleE2E = (req) => /^Bearer\s+\S*e2e\S*$/i.test(String(req.headers.authorization ?? ""));
const nonAuthentifie = { statut: 401, json: { error: { message: "No auth credentials found" } } };

function contientTexte(json, motif) {
  return JSON.stringify(json?.messages ?? []).includes(motif);
}

function reponseChat(json, appel) {
  const modele = typeof json?.model === "string" ? json.model : "e2e/modele";
  const nomSchema = json?.response_format?.json_schema?.name;

  // a) Génération d'annonce (lib/openrouter.ts)
  if (nomSchema === "annonce") {
    appel.type = "annonce";
    return {
      statut: 200,
      json: {
        id: "gen-e2e-annonce",
        model: modele,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                titre: "Polo Lacoste bleu marine taille L",
                description: "Polo Lacoste en piqué de coton.\nTrès bon état.",
                motsCles: "lacoste polo bleu marine",
              }),
            },
          },
        ],
        usage: { prompt_tokens: 1200, completion_tokens: 120, cost: 0.0011 },
      },
    };
  }

  // b) Assistant (lib/openrouterChat.ts) : jamais d'appel d'outil par défaut,
  //    sinon la boucle de /api/chat repartirait jusqu'à 5 fois.
  if (Array.isArray(json?.tools)) {
    appel.type = "assistant";
    if (contientTexte(json, "e2e-outil") && !contientTexte(json, "\"role\":\"tool\"")) {
      const outil = json.tools.find((t) => /^(lire|consulter|chercher|stat|get|list)/i.test(t?.function?.name ?? "")) ?? json.tools[0];
      return {
        statut: 200,
        json: {
          id: "gen-e2e-outil",
          model: modele,
          choices: [
            {
              index: 0,
              finish_reason: "tool_calls",
              message: {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "call_e2e", type: "function", function: { name: outil?.function?.name ?? "outil", arguments: "{}" } }],
              },
            },
          ],
        },
      };
    }
    return {
      statut: 200,
      json: {
        id: "gen-e2e-assistant",
        model: modele,
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Réponse factice de l'assistant (e2e)." } }],
        usage: { cost: 0.0002 },
      },
    };
  }

  appel.type = "chat-inconnu";
  return {
    statut: 200,
    json: {
      id: "gen-e2e-chat",
      model: modele,
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "Réponse factice (e2e)." } }],
    },
  };
}

demarrerFauxServeur({
  nom: "OpenRouter factice",
  port: portDepuisEnv(4010),
  gerer: ({ req, url, json, appel }) => {
    if (!url.pathname.startsWith(PREFIXE + "/")) return null;
    const chemin = url.pathname.slice(PREFIXE.length);

    if (req.method === "POST" && chemin === "/chat/completions") {
      if (!cleE2E(req)) return nonAuthentifie;
      appel.modele = typeof json?.model === "string" ? json.model : "";
      return reponseChat(json, appel);
    }

    if (req.method === "GET" && chemin === "/key") {
      appel.type = "cle";
      if (!cleE2E(req)) return nonAuthentifie;
      return { statut: 200, json: { data: { label: "e2e", usage: 0, limit: null, is_free_tier: false } } };
    }

    return null;
  },
});
