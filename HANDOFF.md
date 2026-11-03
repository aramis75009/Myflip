# HANDOFF — MyFlip

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le et archive celui que
tu remplaces dans `docs/handoffs/`.

Le mode d'emploi complet est dans [`AGENTS.md`](AGENTS.md), section
« Terminer une session ». L'index des passations passées est en bas de page.

---

# Passation — 2026-11-03 · Ollama Cloud par défaut

| | |
|---|---|
| **Agent** | Claude Code (Sonnet 5.5), sous-agent lancé par la session principale d'Aramis (Opus 5.5) ; aucun sous-agent propre. L'aiguilleur de skills proposait `vercel:ai-sdk` (0,70) : non chargé, la tâche imposait un simple `fetch` et aucune nouvelle dépendance. |
| **Branche** | `feat/ollama-cloud`, partie de `main` (`2256ac6`). **Non poussée, non fusionnée, rien déployé.** |
| **Commits** | `45c1970` (code, tests, migration, e2e) + le commit de documentation qui porte cette passation |

## Goal — l'objectif
Aramis n'a plus de crédit OpenRouter : faire passer la génération d'annonces et
l'assistant sur Ollama Cloud, avec sa clé Ollama Cloud, OpenRouter restant en secours.

## Current state — ce qui a été fait
- **Fait et vérifié par des tests purs** : aiguillage du fournisseur (`lib/fournisseurIA.ts`),
  clients `lib/ollama.ts` / `lib/ollamaChat.ts` / `lib/ollamaBase.ts`, catalogues Ollama
  (`deepseek-v4.1-flash` par défaut, `gemma4:31b`, `glm-5.3-flash`), résolution fournisseur +
  modèle par compte, test de clé, écran `/compte` (menu fournisseur, champ clé Ollama, menus de
  modèles par fournisseur), tuile « Modèle IA » de `/parametres`.
- **Pas fait alors qu'on pourrait le croire : AUCUN appel réel à Ollama Cloud.** Pas de clé au
  moment de l'écriture. Trois points de la documentation Ollama sont donc des paris, chacun avec
  son filet (cf. `CLAUDE.md`, section « Fournisseur IA », et `TODOS.md`) : la forme de
  `image_url` (objet, `FORME_IMAGE_URL` bascule en chaîne), `response_format` (schéma envoyé,
  décrit dans le prompt, lecture tolérante, une relance), `reasoning_effort` (seulement pour
  deepseek, retiré si le serveur le refuse).
- **La migration n'est appliquée sur aucune base.** Tant qu'elle ne l'est pas, tout code de cette
  branche qui lit `UserSettings` échoue (« column does not exist ») : l'appliquer AVANT de
  lancer ou déployer la branche.
- **L'écran `/compte` n'a pas été ouvert dans un navigateur** (pas de base prête, pas de dev
  serveur MyFlip). Seuls `tsc` et `eslint` le couvrent.
- **Les specs e2e ont été adaptées sans être lancées** (`e2e/etats.spec.ts` : bouton
  « Enregistrer mes clés », deux boutons « Tester », placeholder `nom-du-modele`).
- Le Studio IA (`lib/studio*`) n'est pas touché et reste sur OpenRouter.

## Decisions — choix critiques ou irréversibles
- **Une colonne de modèle par fournisseur** (`modeleOllamaIA`, `modeleOllamaChatIA`) ; `modeleIA` /
  `modeleChatIA` restent les modèles OpenRouter. Pourquoi : un modèle n'existe que chez son
  fournisseur ; sans colonnes séparées, un compte qui avait choisi `google/gemini-…` l'enverrait
  à Ollama dès la bascule (404 à chaque génération). Une migration était de toute façon
  nécessaire pour la clé : `UserSettings` n'a aucun champ JSON, et `geminiKey` / `anthropicKey`
  sont des colonnes mortes à ne pas recycler.
- **Défaut = Ollama Cloud** (`fournisseurIA` null). Les comptes existants basculent donc à leur
  première génération après déploiement : sans clé Ollama, l'erreur est « Clé Ollama Cloud
  manquante. Ajoute-la dans Mon compte. ».
- **La clé suit toujours le fournisseur retenu** (`choisirIA`), avec la cascade des clés IA :
  clé du compte, sinon `OLLAMA_API_KEY`. Jamais de repli pour Trello (inchangé). Pourquoi le
  repli env : parité avec OpenRouter, il n'expose qu'un quota ; à retirer en une ligne
  (`lib/settings.ts`) si Aramis ne le veut pas.
- **`MODELE_PAR_DEFAUT` reste le défaut OpenRouter** : `lib/studioVerif.ts` l'importe et appelle
  OpenRouter avec ; y mettre un identifiant Ollama casserait l'avis IA du Studio.
- **Test de clé Ollama = requête d'un jeton** et non une lecture : la liste des modèles est
  publique, elle validerait une clé fausse. Seul entorse au « test en lecture seule » de
  `lib/aiTest.ts`, documentée dans le fichier.
- **`maxDuration` de la génération 60 → 120 s** : la relance unique double le pire cas.
- **`texteDuContenu` exportée de `lib/openrouter.ts`** (un mot-clé, aucun autre changement) pour
  ne pas dupliquer la lecture d'un `content` en parts.

## Changed — fichiers et composants
| Fichier | Nature |
|---|---|
| `lib/ollama.ts` (+test, 52) | neuf : requête, lecture tolérante, relance, allègement, `posterOllama` |
| `lib/ollamaChat.ts` (+test, 9) | neuf : corps et appel de l'assistant sur Ollama Cloud |
| `lib/ollamaBase.ts` (+test) | neuf : adresse, `OLLAMA_BASE_URL` locale seulement |
| `lib/fournisseurIA.ts` (+test) | neuf : `choisirIA`, `genererAnnonce`, `creerAppelChat` |
| `lib/modelesIA.ts` (+test, 26) | catalogues Ollama, `modeleChoisi`, `champModele`, défauts par fournisseur |
| `lib/settings.ts`, `lib/types.ts` | clé et choix Ollama dans les réglages résolus et le DTO |
| `lib/aiTest.ts` (+test) | test de clé Ollama (`corpsTestOllama`, un jeton) |
| `app/api/listings/generate/route.ts`, `app/api/chat/route.ts` | passent par `choisirIA` ; `maxDuration` 120 |
| `app/api/user/settings/route.ts`, `…/test/route.ts` | `ollamaKey` chiffrée, `fournisseurIA` validé, test Ollama |
| `components/compte/Integrations.tsx`, `app/parametres/page.tsx` | menu fournisseur, deux clés, modèles par fournisseur |
| `prisma/schema.prisma`, `prisma/migrations/20261103120000_ollama_cloud/` | 4 colonnes nullables, aucun DROP, **non appliquée** |
| `e2e/outils/environnement.ts`, `e2e/global-teardown.ts`, `e2e/etats.spec.ts`, `e2e/README.md` | variables Ollama neutralisées, garde sur ollama.com, specs adaptées |
| `CLAUDE.md`, `README.md`, `TODOS.md`, `lib/metaPrompt.ts` | documentation |

## Validations — passants / échoués / non lancés
**Passants** (03/11/2026, depuis la racine du dépôt) :
```
$ npx vitest run
 Test Files  58 passed (58)
      Tests  1193 passed (1193)          # avant : 52 fichiers, 1088 tests
$ npx eslint --no-cache app components lib --ext .ts,.tsx      -> exit 0
$ npx tsc --noEmit -p <tsconfig sans les doublons « … 2.ts »>   -> exit 0
```
`npx tsc --noEmit` sur le dépôt entier garde **une** erreur, qui n'est pas de cette branche :
`lib/statutColors.test 2.ts` (doublon Finder non suivi, `Retour` manquant). Avant la branche :
la même.

**Non lancés** : `npm run build` (jamais, cf. `AGENTS.md`) ; la suite e2e (a besoin de sa base
Postgres embarquée) ; `prisma migrate deploy` (interdit sans accord) ; tout appel réseau, Ollama
comme OpenRouter. `npm run lint` (`next lint`) remplacé par `npx eslint` sur les mêmes dossiers.

## Blockers — ce qui bloque
- **La clé Ollama Cloud** : Aramis la saisit dans `/compte` → « Clé Ollama Cloud ». Sans elle, rien
  ne génère.
- **La migration** doit être appliquée sur la base visée avant d'utiliser la branche.
- Rien d'autre.

## Next — la prochaine action
1. Aramis applique la migration sur la base de dev puis de prod (additive, sans risque pour le
   code actuel de `main` : il ignore les colonnes) :
   `DATABASE_URL=<url de la base> npx prisma migrate deploy`. **Jamais `db push`** (il proposerait
   de dropper `photosPretes`, `geminiKey` et `anthropicKey`).
2. Il saisit sa clé, clique sur « Tester », puis génère une annonce avec photos et pose une
   question à l'assistant : c'est le premier appel réel, check-list dans `TODOS.md`
   (« Ollama Cloud — premier appel réel »).
3. Puis lancer la suite e2e une fois, relire la branche (`/code-review`), fusionner.

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-11-03 | Ollama Cloud par défaut, OpenRouter en secours | Claude Code (Sonnet 5.5) | *(passation courante)* |
| 2026-10-19 | Studio IA : génération par API | Claude Code (Opus 5.5) | [fiche](docs/handoffs/2026-10-19-studio-ia-generation-api.md) |
| 2026-10-18 | Studio IA, la moitié back | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-10-18-studio-ia-moitie-back.md) |
| 2026-09-29 | Comptes Vinted et dates pour SacBase | Claude Code (Opus 5.5) | [fiche](docs/handoffs/2026-09-29-comptes-vinted-dates-sacbase.md) |
| 2026-09-09 | Le champ prix : diagnostic et correctifs | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-09-champ-prix-diagnostic.md) |
| 2026-09-09 | Le prix dans le prompt, le délai dans un pop-up | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-09-prix-prompt-delai-popup.md) |
| 2026-09-08 | Remplissage Vinted livré, prochain chantier cadré | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-08-remplissage-vinted-livre.md) |
| 2026-09-03 | Audit du chantier Vinted, correctifs, rangement de `main` | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-03-audit-chantier-vinted.md) |
| 2026-08-19 | Extension Vinted — 16 tâches implémentées | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-19-extension-vinted-implementation.md) |
| 2026-08-18 | Extension Vinted, design en cours | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-18-extension-vinted-design.md) |
