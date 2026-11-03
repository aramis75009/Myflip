// Réglages par utilisateur (serveur uniquement) : lecture, déchiffrement et
// résolution de l'accès Trello.
//
// ⚠️ Depuis le 15/08/2026, IL N'Y A PLUS DE REPLI SUR L'ENVIRONNEMENT pour
// Trello. Jusque-là, un compte sans réglages retombait sur `TRELLO_API_KEY` /
// `TRELLO_TOKEN` / `TRELLO_BOARD_ID` du déploiement : n'importe quel
// utilisateur lisait et écrivait sur le board du propriétaire. Le repli reste
// en place pour les clés IA, où il n'expose que le quota de l'application —
// pas les données d'un tiers.

import { prisma } from "@/lib/prisma";
import { dechiffrerOuNull } from "@/lib/crypto";
import { credentialsApp } from "@/lib/trelloOAuth";
import { estFournisseurIA, type FournisseurIA } from "@/lib/modelesIA";
import type { UserSettings } from "@prisma/client";

/** D'où vient l'accès Trello réellement utilisé. */
export type SourceTrello = "oauth" | "heritee" | "absente";

/** Tout ce qu'il faut pour appeler l'API Trello au nom d'un utilisateur. */
export type TrelloContexte = {
  key: string;
  token: string;
  /** Secret d'API, uniquement pour valider la signature des webhooks entrants. */
  secret: string | null;
  boardId: string | null;
  /** Étiquette « À comptabiliser » : celle qui déclenche l'entrée en compta. */
  labelId: string | null;
  /** Étiquette « Comptabilisé » : posée après validation. */
  comptabiliseLabelId: string | null;
  /**
   * « oauth » : jeton obtenu par le parcours de connexion, associé à la clé de
   * l'application. « heritee » : clé et jeton saisis à la main avant le
   * 15/08/2026. La distinction compte à la déconnexion — seul un jeton OAuth
   * appartient à MyFlip et peut être révoqué par elle.
   */
  source: "oauth" | "heritee";
};

/**
 * Réglages Trello d'un compte, secrets DÉJÀ DÉCHIFFRÉS.
 *
 * Ce type existe pour que `contexteDepuisReglages` soit pure : le déchiffrement
 * lit `process.env`, la cascade non. C'est la cascade qu'on veut pouvoir
 * tester, parce que c'est elle qui décide qui accède à quel board.
 */
export type ReglagesTrelloBruts = {
  oauthToken: string | null;
  heriteeKey: string | null;
  heriteeToken: string | null;
  heriteeSecret: string | null;
  boardId: string | null;
  labelId: string | null;
  comptabiliseLabelId: string | null;
};

export type ReglagesResolus = {
  openrouterKey: string | null;
  /** Clé Ollama Cloud : celle du compte, sinon `OLLAMA_API_KEY` (même cascade qu'OpenRouter). */
  ollamaKey: string | null;
  trello: TrelloContexte | null;
  /**
   * Fournisseur choisi par le compte, `null` = rien de choisi. Le défaut
   * (Ollama Cloud) s'applique dans `modeleChoisi` / `choisirIA`, pas ici : cette
   * valeur reste le CHOIX du compte, pas sa résolution.
   */
  fournisseurIA: FournisseurIA | null;
  /** Identifiant OpenRouter du modèle qui rédige les annonces. */
  modeleIA: string | null;
  /** Identifiant OpenRouter du modèle de l'assistant conversationnel. */
  modeleChatIA: string | null;
  /** Identifiant Ollama Cloud du modèle qui rédige les annonces. */
  modeleOllamaIA: string | null;
  /** Identifiant Ollama Cloud du modèle de l'assistant conversationnel. */
  modeleOllamaChatIA: string | null;
  objectifMensuel: number | null;
  /** Pour la clé IA : la valeur vient-elle du compte ou de l'application ? */
  source: {
    openrouter: "utilisateur" | "app" | "absente";
    ollama: "utilisateur" | "app" | "absente";
    trello: SourceTrello;
  };
};

const vide = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);

/** Ligne brute des réglages, secrets encore chiffrés. */
export function reglagesBruts(userId: string): Promise<UserSettings | null> {
  return prisma.userSettings.findUnique({ where: { userId } });
}

/**
 * Cascade Trello : jeton OAuth → clés héritées du compte → rien.
 *
 * ⚠️ Ne pas réintroduire de repli sur l'environnement ici sous prétexte de
 * « faire marcher un compte neuf ». Un compte neuf doit se connecter, pas
 * emprunter l'accès de quelqu'un d'autre. C'est exactement le trou qui a été
 * fermé le 15/08/2026.
 */
export function contexteDepuisReglages(
  s: ReglagesTrelloBruts | null,
  app: { key: string; secret: string } | null,
): TrelloContexte | null {
  const ids = {
    boardId: vide(s?.boardId),
    labelId: vide(s?.labelId),
    comptabiliseLabelId: vide(s?.comptabiliseLabelId),
  };

  const oauth = vide(s?.oauthToken);
  if (oauth) {
    // Un jeton OAuth n'est utilisable qu'avec la clé de l'application qui l'a
    // émis : sans elle, il ne sert à rien de tenter l'appel.
    if (!app) return null;
    return { key: app.key, token: oauth, secret: app.secret, ...ids, source: "oauth" };
  }

  // Connexion héritée : clé ET jeton vont ensemble, ils forment un même accès.
  const key = vide(s?.heriteeKey);
  const token = vide(s?.heriteeToken);
  if (key && token) {
    return { key, token, secret: vide(s?.heriteeSecret), ...ids, source: "heritee" };
  }

  return null;
}

/**
 * Résout la configuration effective d'un utilisateur.
 *
 * Un secret illisible (clé maîtresse changée, colonne corrompue) ne fait pas
 * échouer l'appel : `dechiffrerOuNull` journalise et renvoie null. Pour les
 * clés IA, la cascade retombe alors sur l'environnement ; pour Trello, elle
 * rend « non connecté », ce qui est le comportement voulu — mieux vaut demander
 * une reconnexion que synchroniser sur le board d'autrui.
 */
export async function resoudreReglages(userId: string): Promise<ReglagesResolus> {
  const s = await reglagesBruts(userId);

  const cascade = (
    duCompte: string | null,
    delApp: string | undefined,
  ): [string | null, "utilisateur" | "app" | "absente"] => {
    if (duCompte) return [duCompte, "utilisateur"];
    const env = vide(delApp);
    return env ? [env, "app"] : [null, "absente"];
  };

  const [openrouter, srcOpenrouter] = cascade(
    dechiffrerOuNull(s?.openrouterKey),
    process.env.OPENROUTER_API_KEY,
  );
  const [ollama, srcOllama] = cascade(
    dechiffrerOuNull(s?.ollamaKey),
    process.env.OLLAMA_API_KEY,
  );

  const trello = contexteDepuisReglages(
    {
      oauthToken: dechiffrerOuNull(s?.trelloOauthToken),
      heriteeKey: dechiffrerOuNull(s?.trelloKey),
      heriteeToken: dechiffrerOuNull(s?.trelloToken),
      heriteeSecret: dechiffrerOuNull(s?.trelloSecret),
      boardId: s?.trelloBoardId ?? null,
      labelId: s?.trelloLabelId ?? null,
      comptabiliseLabelId: s?.trelloComptabiliseLabelId ?? null,
    },
    credentialsApp(),
  );

  return {
    openrouterKey: openrouter,
    ollamaKey: ollama,
    trello,
    // Une valeur périmée en base (fournisseur retiré) vaut « rien de choisi ».
    fournisseurIA: estFournisseurIA(s?.fournisseurIA) ? s.fournisseurIA : null,
    modeleIA: vide(s?.modeleIA),
    modeleChatIA: vide(s?.modeleChatIA),
    modeleOllamaIA: vide(s?.modeleOllamaIA),
    modeleOllamaChatIA: vide(s?.modeleOllamaChatIA),
    objectifMensuel: s?.objectifMensuel ?? null,
    source: {
      openrouter: srcOpenrouter,
      ollama: srcOllama,
      trello: trello?.source ?? "absente",
    },
  };
}

/**
 * Contexte Trello d'un utilisateur, ou `null` s'il n'a aucun accès utilisable.
 * Les appels Trello sont best-effort (cf. CLAUDE.md) : l'absence de contexte
 * doit faire renoncer à la synchro, jamais échouer l'opération métier.
 */
export async function contexteTrello(userId: string): Promise<TrelloContexte | null> {
  return (await resoudreReglages(userId)).trello;
}

/**
 * Retrouve l'utilisateur propriétaire d'un board Trello.
 *
 * C'est le routage du webhook entrant, qui n'a pas de session : il ne porte que
 * l'id du board. `UserSettings.trelloBoardId` est unique, donc la réponse est
 * sans ambiguïté.
 *
 * ⚠️ Plus de repli sur `TRELLO_BOARD_ID` + `TRELLO_OWNER_EMAIL` depuis le
 * 15/08/2026 : un board non rattaché à un compte est un board qu'on ignore. Le
 * compte historique a été migré en base par `scripts/migrer-trello-env.ts`.
 */
export async function utilisateurDuBoard(boardId: string): Promise<string | null> {
  const parReglages = await prisma.userSettings.findUnique({
    where: { trelloBoardId: boardId },
    select: { userId: true },
  });
  return parReglages?.userId ?? null;
}
