// Test de validité d'une clé IA (serveur uniquement).
//
// OpenRouter : le test est une lecture (`/key` interroge le compte). Aucune
// génération n'est déclenchée — vérifier une clé ne doit rien coûter à
// l'utilisateur ni consommer son quota.
//
// Ollama Cloud : EXCEPTION assumée. Sa liste de modèles (`/api/tags`) est
// publique, elle répondrait « valide » à une clé fausse ; nous ne connaissons
// pas de lecture authentifiée à vérifier sans appel réel. Le seul test fiable
// est donc une requête d'UN jeton (`corpsTestOllama`), la plus petite possible :
// elle consomme une fraction infime du forfait, et seulement quand l'utilisateur
// clique sur « Tester ».

import { MODELE_OLLAMA_PAR_DEFAUT } from "@/lib/modelesIA";
import { urlOllama } from "@/lib/ollamaBase";
import { urlOpenRouter } from "@/lib/openrouterBase";

export type Fournisseur = "openrouter" | "ollama";

export type ResultatTest = { ok: boolean; message: string };

async function verdict(res: Response, ok: string): Promise<ResultatTest> {
  if (res.ok) return { ok: true, message: ok };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: "Clé refusée par le fournisseur." };
  }
  return { ok: false, message: `Le fournisseur a répondu ${res.status}.` };
}

/**
 * Corps de la requête de test d'une clé Ollama Cloud : un message de deux
 * lettres, UN jeton en sortie, ni outil ni image ni réflexion. Pur et testé
 * pour que personne n'y glisse de quoi coûter plus qu'un jeton.
 */
export function corpsTestOllama() {
  return {
    model: MODELE_OLLAMA_PAR_DEFAUT,
    messages: [{ role: "user" as const, content: "ok" }],
    max_tokens: 1,
  };
}

export async function testerCle(
  fournisseur: Fournisseur,
  cle: string,
): Promise<ResultatTest> {
  try {
    switch (fournisseur) {
      case "openrouter": {
        const res = await fetch(urlOpenRouter("/key"), {
          headers: { Authorization: `Bearer ${cle}` },
          cache: "no-store",
        });
        return verdict(res, "Clé OpenRouter valide.");
      }
      case "ollama": {
        const res = await fetch(urlOllama("/chat/completions"), {
          method: "POST",
          headers: { Authorization: `Bearer ${cle}`, "Content-Type": "application/json" },
          body: JSON.stringify(corpsTestOllama()),
          cache: "no-store",
        });
        return verdict(res, "Clé Ollama Cloud valide.");
      }
    }
  } catch (e) {
    console.error(`[ia] test de clé ${fournisseur} injoignable`, e);
    return { ok: false, message: "Fournisseur injoignable." };
  }
}
