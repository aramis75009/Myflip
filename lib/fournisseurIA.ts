// Choix du fournisseur IA d'un compte, et aiguillage des appels (serveur uniquement).
//
// Ollama Cloud est le fournisseur par défaut depuis le 03/11/2026 ; OpenRouter
// reste en secours et Anthropic (clé API Claude, 04/11/2026) est le troisième
// choix, tous deux choisis dans « Mon compte ». Ce module est la SEULE couture
// entre les routes (`/api/listings/generate`, `/api/chat`) et les trois
// clients : les routes ne savent pas quel fournisseur parle.
//
// ⚠️ Le Studio IA (`lib/studio*`) n'en dépend PAS : ni Ollama Cloud ni ce module
// ne génèrent d'images, il appelle OpenRouter directement avec la clé OpenRouter
// du compte, quel que soit le fournisseur choisi ici. Ne pas le brancher sur ce
// module.
//
// Pur et testé : `choisirIA`, `messageCleManquante`. Le reste n'aiguille que.

import {
  libelleFournisseur,
  modeleChoisi,
  type ChoixModeleBrut,
  type FournisseurIA,
  type UsageIA,
} from "@/lib/modelesIA";
import { appelerChatAnthropic, construireCorpsChatAnthropic } from "@/lib/anthropicChat";
import { generateListingAnthropic } from "@/lib/anthropic";
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

/** Ce que `resoudreReglages` fournit pour décider : le choix du compte et ses trois clés. */
export type ReglagesIA = ChoixModeleBrut & {
  openrouterKey: string | null;
  ollamaKey: string | null;
  anthropicKey: string | null;
  source: { openrouter: SourceReglage; ollama: SourceReglage; anthropic: SourceReglage };
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
 * choisi OpenRouter ou Anthropic garde sa clé et son modèle chez ce
 * fournisseur. La clé est toujours celle du fournisseur retenu : une clé
 * OpenRouter n'est jamais envoyée à Ollama ni à Anthropic, et ainsi de suite.
 */
export function choisirIA(usage: UsageIA, r: ReglagesIA): ChoixIA {
  const { fournisseur, modele } = modeleChoisi(r, usage);
  if (fournisseur === "ollama") return { fournisseur, modele, cle: r.ollamaKey, source: r.source.ollama };
  if (fournisseur === "anthropic") return { fournisseur, modele, cle: r.anthropicKey, source: r.source.anthropic };
  return { fournisseur, modele, cle: r.openrouterKey, source: r.source.openrouter };
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
  if (choix.fournisseur === "ollama") return generateListingOllama(prompt, images, choix.cle, choix.modele);
  if (choix.fournisseur === "anthropic") return generateListingAnthropic(prompt, images, choix.cle, choix.modele);
  return generateListing(prompt, images, choix.cle, choix.modele);
}

/**
 * Un appel de l'assistant lié au fournisseur retenu : `(historique) → réponse brute`.
 *
 * La réponse se lit ensuite avec `texteAssistant`, `appelsOutils` et
 * `messageAssistantBrut` (`lib/openrouterChat.ts`), valables pour les trois
 * fournisseurs : même format OpenAI (Anthropic est traduit par
 * `lib/anthropicChat.ts`). L'historique est relu à chaque appel, la route y
 * ajoute les tours d'outils entre deux.
 */
export function creerAppelChat(
  choix: ChoixIA,
  system: string,
  outils: OutilChat[],
): (historique: MessageChat[]) => Promise<unknown> {
  const cle = choix.cle ?? "";
  if (choix.fournisseur === "ollama") {
    return (historique) => appelerChatOllama(construireCorpsChatOllama(system, outils, historique, choix.modele), cle);
  }
  if (choix.fournisseur === "anthropic") {
    return (historique) =>
      appelerChatAnthropic(construireCorpsChatAnthropic(system, outils, historique, choix.modele), cle);
  }
  return (historique) => appelerChat(construireCorpsChat(system, outils, historique, choix.modele), cle);
}
