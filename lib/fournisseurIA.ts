// Choix du fournisseur IA d'un compte, et aiguillage des appels (serveur uniquement).
//
// Ollama Cloud est le fournisseur par défaut depuis le 03/11/2026 ; OpenRouter
// reste en secours, choisi dans « Mon compte ». Ce module est la SEULE
// couture entre les routes (`/api/listings/generate`, `/api/chat`) et les deux
// clients : les routes ne savent pas quel fournisseur parle.
//
// ⚠️ Le Studio IA (`lib/studio*`) n'en dépend PAS : Ollama Cloud ne génère pas
// d'images, il appelle OpenRouter directement avec la clé OpenRouter du compte,
// quel que soit le fournisseur choisi ici. Ne pas le brancher sur ce module.
//
// Pur et testé : `choisirIA`, `messageCleManquante`. Le reste n'aiguille que.

import {
  libelleFournisseur,
  modeleChoisi,
  type ChoixModeleBrut,
  type FournisseurIA,
  type UsageIA,
} from "@/lib/modelesIA";
import { generateListingOllama } from "@/lib/ollama";
import { appelerChatOllama, construireCorpsChatOllama } from "@/lib/ollamaChat";
import { generateListing, type ImageAnnonce, type ListingResult } from "@/lib/openrouter";
import {
  appelerChat,
  construireCorpsChat,
  type MessageChat,
  type OutilChat,
} from "@/lib/openrouterChat";
import type { SourceReglage } from "@/lib/types";

/** Ce que `resoudreReglages` fournit pour décider : le choix du compte et ses deux clés. */
export type ReglagesIA = ChoixModeleBrut & {
  openrouterKey: string | null;
  ollamaKey: string | null;
  source: { openrouter: SourceReglage; ollama: SourceReglage };
};

export type ChoixIA = {
  fournisseur: FournisseurIA;
  /** Toujours concret : le défaut du fournisseur est déjà appliqué. */
  modele: string;
  /** La clé DE CE fournisseur : celle du compte, sinon celle de l'application, sinon `null`. */
  cle: string | null;
  source: SourceReglage;
};

/**
 * Fournisseur, modèle et clé réellement utilisés pour un usage.
 *
 * Rien de choisi → Ollama Cloud et son modèle par défaut. Un compte qui a
 * choisi OpenRouter garde sa clé et son modèle OpenRouter. La clé est toujours
 * celle du fournisseur retenu : une clé OpenRouter n'est jamais envoyée à
 * Ollama, ni l'inverse.
 */
export function choisirIA(usage: UsageIA, r: ReglagesIA): ChoixIA {
  const { fournisseur, modele } = modeleChoisi(r, usage);
  return fournisseur === "ollama"
    ? { fournisseur, modele, cle: r.ollamaKey, source: r.source.ollama }
    : { fournisseur, modele, cle: r.openrouterKey, source: r.source.openrouter };
}

/** Message à renvoyer quand le fournisseur retenu n'a aucune clé. */
export function messageCleManquante(f: FournisseurIA): string {
  return `Aucune clé ${libelleFournisseur(f)} : renseigne la tienne dans Mon compte, ou configure celle de l'application.`;
}

/** Rédige l'annonce avec le fournisseur retenu. */
export function genererAnnonce(
  choix: ChoixIA,
  prompt: string,
  images: ImageAnnonce[],
): Promise<ListingResult> {
  return choix.fournisseur === "ollama"
    ? generateListingOllama(prompt, images, choix.cle, choix.modele)
    : generateListing(prompt, images, choix.cle, choix.modele);
}

/**
 * Un appel de l'assistant lié au fournisseur retenu : `(historique) → réponse brute`.
 *
 * La réponse se lit ensuite avec `texteAssistant`, `appelsOutils` et
 * `messageAssistantBrut` (`lib/openrouterChat.ts`), valables pour les deux
 * fournisseurs : même format OpenAI. L'historique est relu à chaque appel, la
 * route y ajoute les tours d'outils entre deux.
 */
export function creerAppelChat(
  choix: ChoixIA,
  system: string,
  outils: OutilChat[],
): (historique: MessageChat[]) => Promise<unknown> {
  const cle = choix.cle ?? "";
  return choix.fournisseur === "ollama"
    ? (historique) => appelerChatOllama(construireCorpsChatOllama(system, outils, historique, choix.modele), cle)
    : (historique) => appelerChat(construireCorpsChat(system, outils, historique, choix.modele), cle);
}
