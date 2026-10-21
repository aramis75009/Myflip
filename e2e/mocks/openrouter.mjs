// Faux OpenRouter de la suite e2e : http://127.0.0.1:<4010+D>/api/v1
// (OPENROUTER_BASE_URL du serveur de test, lue par lib/openrouterBase.ts).
//
// Spécification : docs/refonte/etude-2026-10-20/appels-externes.json,
// « openrouterMockSpec ». Les formes de réponse sont celles que lisent
// normaliserModele / tarifDepuisEndpoints (lib/studioModeles.ts),
// readImagesResponse / readChatResponse (lib/studioGeneration.ts),
// readVerifResponse (lib/studioVerif.ts), lireReponse (lib/openrouter.ts) et
// lib/openrouterChat.ts. Toute autre route : 404 bruyant sur stderr.
//
// Lancement : E2E_PORT_MOCK=4010 node e2e/mocks/openrouter.mjs

import { demarrerFauxServeur, portDepuisEnv } from "./commun.mjs";
import { pngSac } from "./image-synthetique.mjs";

const PREFIXE = "/api/v1";

const MODELES = [
  {
    id: "qwen/qwen-image-2.1-turbo",
    name: "Qwen: Qwen Image 2.1 Turbo",
    description: "Rapide.",
    architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
    supported_parameters: {
      aspect_ratio: { type: "enum", values: ["1:1", "3:4"] },
      input_references: { type: "range", min: 0, max: 4 },
    },
  },
  {
    id: "bytedance-seed/seedream-5-0-flash",
    name: "ByteDance Seed: Seedream 5.0 Flash",
    description: "",
    architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
    supported_parameters: { input_references: { type: "range", min: 0, max: 14 } },
  },
  {
    id: "google/gemini-3-pro-image",
    name: "Google: Nano Banana Pro",
    description: "",
    architecture: { input_modalities: ["image", "text"], output_modalities: ["image", "text"] },
    supported_parameters: { input_references: { type: "range", min: 0, max: 14 } },
  },
  {
    id: "e2e/modele-cher",
    name: "E2E: Modèle cher",
    description: "Au-dessus du seuil.",
    architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
    supported_parameters: {
      aspect_ratio: { type: "enum", values: ["3:4"] },
      input_references: { type: "range", min: 1, max: 2 },
    },
  },
  {
    id: "e2e/tarif-inconnu",
    name: "E2E: Tarif inconnu",
    description: "",
    architecture: { input_modalities: ["text", "image"], output_modalities: ["image"] },
    supported_parameters: {},
  },
  // Entrée texte seule : le Studio doit l'écarter SANS demander son tarif.
  {
    id: "recraft/recraft-v4.1-flash",
    name: "Recraft: V4.1 Flash",
    description: "",
    architecture: { input_modalities: ["text"], output_modalities: ["image"] },
    supported_parameters: {},
  },
];

/** Tarifs par modèle : prix réalistes, un modèle « au jeton » (sans prix à l'image), un modèle cher. */
const ENDPOINTS = {
  "qwen/qwen-image-2.1-turbo": {
    id: "qwen/qwen-image-2.1-turbo",
    endpoints: [
      {
        provider_name: "Alibaba",
        pricing: [
          { billable: "input_image", unit: "image", cost_usd: 0 },
          { billable: "output_image", unit: "image", cost_usd: 0.0184, variant: "1k" },
        ],
      },
    ],
  },
  "bytedance-seed/seedream-5-0-flash": {
    id: "bytedance-seed/seedream-5-0-flash",
    endpoints: [{ provider_name: "ByteDance", pricing: [{ billable: "output_image", unit: "image", cost_usd: 0.03 }] }],
  },
  "google/gemini-3-pro-image": {
    id: "google/gemini-3-pro-image",
    endpoints: [{ provider_name: "Google", pricing: [{ billable: "output_image", unit: "token", cost_usd: 0.000012 }] }],
  },
  "e2e/modele-cher": {
    id: "e2e/modele-cher",
    endpoints: [
      {
        provider_name: "E2E",
        pricing: [
          { billable: "input_image", unit: "image", cost_usd: 0.002 },
          { billable: "output_image", unit: "image", cost_usd: 0.134 },
        ],
      },
    ],
  },
  // « e2e/tarif-inconnu » : absent ⇒ 404 ⇒ tarif « inconnu », confirmation exigée.
};

const COUT_IMAGE = {
  "qwen/qwen-image-2.1-turbo": 0.0184,
  "bytedance-seed/seedream-5-0-flash": 0.03,
  "e2e/modele-cher": 0.136,
};

// Une clé FACTICE, reconnaissable à « e2e » (le seed pose « e2e-fausse-cle-… »
// sur le compte demo, la spécification citait « sk-or-v1-e2e-factice ») : toute
// autre clé, ou aucune, prend un 401 comme chez OpenRouter.
const cleE2E = (req) => /^Bearer\s+\S*e2e\S*$/i.test(String(req.headers.authorization ?? ""));
const nonAuthentifie = { statut: 401, json: { error: { message: "No auth credentials found" } } };

/** Les lignes « 1. détail » du bloc « Détails à contrôler » du prompt de vérification. */
function detailsDuPrompt(json) {
  const parts = json?.messages?.[0]?.content;
  const texte = Array.isArray(parts) ? parts.find((p) => p?.type === "text")?.text ?? "" : String(parts ?? "");
  const bloc = /Détails à contrôler :\n([\s\S]*?)(?:\n\n|$)/.exec(texte);
  if (!bloc) return [];
  return bloc[1]
    .split("\n")
    .map((l) => /^\d+\.\s+(.*)$/.exec(l.trim())?.[1])
    .filter(Boolean);
}

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

  // b) Vérification d'une image du Studio (lib/studioVerif.ts)
  if (nomSchema === "verification_studio") {
    appel.type = "verification";
    const details = detailsDuPrompt(json).map((detail) => ({ detail, statut: "fidele", note: "Conforme à la photo." }));
    return {
      statut: 200,
      json: {
        id: "gen-e2e-verif",
        model: modele,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({ details, angleRespecte: true, scoreGlobal: 86, verdict: "ok" }),
            },
          },
        ],
        usage: { cost: 0.0009 },
      },
    };
  }

  // d) Repli de génération d'image par chat (lib/studioGeneration.ts, 4d)
  if (Array.isArray(json?.modalities) && json.modalities.includes("image")) {
    appel.type = "image-chat";
    const b64 = pngSac(`chat:${modele}`).toString("base64");
    return {
      statut: 200,
      json: {
        id: "gen-e2e-image-chat",
        model: modele,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: "",
              images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } }],
            },
          },
        ],
        usage: { cost: 0.039 },
      },
    };
  }

  // c) Assistant (lib/openrouterChat.ts) : jamais d'appel d'outil par défaut,
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

function reponseImages(json, appel) {
  const modele = typeof json?.model === "string" ? json.model : "";
  appel.modele = modele;
  appel.type = "image";
  if (modele === "e2e/erreur-402") return { statut: 402, json: { error: { message: "Insufficient credits" } } };
  if (modele === "e2e/refus-securite") {
    return { statut: 200, json: { error: { message: "Request blocked by safety system" }, usage: { cost: 0 } } };
  }
  if (modele === "e2e/repli-chat") return { statut: 404, json: { error: { message: "Not found" } } };
  return {
    statut: 200,
    json: {
      created: 1760947200,
      model: modele,
      data: [{ b64_json: pngSac(`image:${modele}:${appel.n}`).toString("base64"), media_type: "image/png" }],
      usage: { cost: COUT_IMAGE[modele] ?? 0.0184 },
    },
  };
}

demarrerFauxServeur({
  nom: "OpenRouter factice",
  port: portDepuisEnv(4010),
  gerer: ({ req, url, json, appel }) => {
    if (!url.pathname.startsWith(PREFIXE + "/")) return null;
    const chemin = url.pathname.slice(PREFIXE.length);

    if (req.method === "GET" && chemin === "/images/models") {
      appel.type = "catalogue";
      return { statut: 200, json: { data: MODELES } };
    }

    const tarif = /^\/images\/models\/(.+)\/endpoints$/.exec(chemin);
    if (req.method === "GET" && tarif) {
      const id = decodeURIComponent(tarif[1]);
      appel.type = "tarif";
      appel.modele = id;
      const e = ENDPOINTS[id];
      return e ? { statut: 200, json: e } : { statut: 404, json: { error: { message: "not found" } } };
    }

    if (req.method === "POST" && chemin === "/images") {
      if (!cleE2E(req)) return nonAuthentifie;
      return reponseImages(json, appel);
    }

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
