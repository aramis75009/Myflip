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
//
// Anthropic : même exception, même raison. Aucune lecture authentifiée gratuite
// ne dit si la clé SERT (le crédit épuisé ne se voit qu'à l'usage) : le test est
// un message de deux lettres, UN jeton en sortie (`corpsTestAnthropic`), sur le
// modèle le moins cher du catalogue.

import { enTetesAnthropic, urlAnthropic } from "@/lib/anthropicBase";
import { MODELE_ANTHROPIC_PAR_DEFAUT, MODELE_OLLAMA_PAR_DEFAUT } from "@/lib/modelesIA";
import { urlOllama } from "@/lib/ollamaBase";
import { urlOpenRouter } from "@/lib/openrouterBase";

export type Fournisseur = "openrouter" | "ollama" | "anthropic";

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

/**
 * Corps de la requête de test d'une clé Anthropic : un message de deux lettres,
 * UN jeton en sortie, ni outil, ni image, ni schéma, ni `effort`. Pur et testé
 * pour que personne n'y glisse de quoi coûter plus qu'un jeton.
 */
export function corpsTestAnthropic() {
  return {
    model: MODELE_ANTHROPIC_PAR_DEFAUT,
    max_tokens: 1,
    messages: [{ role: "user" as const, content: "ok" }],
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
      case "anthropic": {
        const res = await fetch(urlAnthropic("/messages"), {
          method: "POST",
          headers: enTetesAnthropic(cle),
          body: JSON.stringify(corpsTestAnthropic()),
          cache: "no-store",
        });
        if (res.status === 400 || res.status === 402) {
          // Un crédit épuisé est un 400 chez Anthropic : la clé est bonne, mais
          // elle ne servira à rien. Le dire plutôt que « a répondu 400 ».
          const detail = await res.text().catch(() => "");
          if (res.status === 402 || /credit balance/i.test(detail)) {
            return { ok: false, message: "Clé reconnue, mais le crédit du compte Anthropic est épuisé." };
          }
          return { ok: false, message: `Le fournisseur a répondu ${res.status}.` };
        }
        return verdict(res, "Clé Anthropic valide.");
      }
    }
  } catch (e) {
    console.error(`[ia] test de clé ${fournisseur} injoignable`, e);
    return { ok: false, message: "Fournisseur injoignable." };
  }
}
