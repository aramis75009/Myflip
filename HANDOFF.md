# HANDOFF — MyFlip

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le et archive celui que
tu remplaces dans `docs/handoffs/`.

Le mode d'emploi complet est dans [`AGENTS.md`](AGENTS.md), section
« Terminer une session ». L'index des passations passées est en bas de page.

---

# Passation — 2026-10-19 · Studio IA : génération par API

| | |
|---|---|
| **Agent** | Claude Code (Opus 5.5), orchestrateur ; 5 sous-agents routés par Jev (3 Sonnet xhigh : estimateur/catalogue, client de génération, statistiques ; 2 Opus xhigh : orchestration/routes, écran). T7–T9 faits le même jour par une autre session Opus 5.5. |
| **Branche** | `feat/studio-ia` |
| **Commits** | `b3d8cae` (migration seule), `fb139b9` (T7–T9 + génération par API), `602507c` (docs), poussés sur `origin/feat/studio-ia` le 19/10 à la demande d'Aramis. **Non fusionnés dans `main`, rien déployé.** |

## Goal — l'objectif
Mettre plusieurs modèles d'image OpenRouter en concurrence sur chaque angle d'un
sac, avec devis, confirmation au-delà de 0,10 $, coût réel par essai et bilan par
modèle — sans qu'aucune image générée ne puisse rejoindre une annonce.

## Current state — ce qui a été fait
- **T7–T9 (autre session, 19/10)** : Blob privé `myflip-studio`, photos de mise en
  vente conservées comme références, les trois écrans `/studio`. Détail dans
  `CLAUDE.md`, section Studio IA.
- **PRD du 19/10 implémenté** (plan `docs/superpowers/plans/2026-10-19-studio-ia-generation-api.md`) :
  migration `20261019120000_studio_generation_api` (appliquée sur **dev**),
  `lib/studioModeles.ts` (tarif, devis, seuil), `lib/studioCatalogue.ts`
  (54 modèles retenus sur 61 le 19/10 : 25 à prix publié, 20 au jeton, 9
  inconnus), `lib/studioGeneration.ts`, `lib/studioLancement.ts`, routes
  `POST /api/studio/generations`, `GET /api/studio/modeles`,
  `POST|DELETE /api/studio/modeles/favoris`, sélecteur de modèles sur chaque
  ligne d'angle, essais groupés par modèle, régénération pour corriger, bilan
  par modèle et total dépensé.
- **Pas fait alors qu'on pouvait le croire : AUCUNE génération réelle n'a eu
  lieu.** Aramis a décidé de tester la génération directement en prod.
  Aucun coût réel n'a donc été affiché, ni aucune image générée notée.

## Decisions — choix critiques ou irréversibles
- **`StudioEssai.modele` NOT NULL DEFAULT `'manuel'`** (le PRD disait nullable) :
  la numérotation est unique par (coloris, angle, modèle, numéro), et un NULL
  rendrait deux dépôts manuels n° 1 distincts pour Postgres.
- **Échecs dans une table `StudioEchec`** : un échec ne consomme pas de numéro
  et n'entre dans aucun taux, mais il se compte au bilan (sécurité à part), avec
  son coût s'il a été facturé.
- **Favoris dans une table `StudioModeleFavori`**, pas en JSON sur
  `UserSettings`, la table des colonnes protégées.
- **Prix par image lu sur `/images/models/{id}/endpoints`**, en majorant (max
  des fournisseurs et variantes). **Le coût par référence (`input_reference`)
  est compté** : il atteint 0,20 $ par photo sur riverflow-v2-pro, et sans lui
  le seuil ne se déclenchait pas pour un lancement réel à 0,64 $.
- **Clé du compte uniquement pour générer** (`cleDuCompte`) : pas de repli
  `OPENROUTER_API_KEY`, sinon tout compte générerait aux frais du déploiement.
- **Une requête par modèle**, chacune portant la liste complète des modèles
  cochés : le serveur recalcule le devis sur toute la liste et refuse (409)
  sans `confirme: true`.
- **Vérification IA lancée par l'écran** après chaque génération réussie, pas
  dans la route, pour rester sous 300 s ; un échec du contrôle n'invalide pas
  un essai payé.
- **Modèles SVG seuls écartés** du catalogue : le Blob et la vérification ne
  lisent que jpg, png et webp.

## Changed — fichiers et composants
| Fichier | Nature |
|---|---|
| `prisma/migrations/20261019120000_studio_generation_api/migration.sql`, `prisma/schema.prisma` | neuf / modifié : 5 colonnes, unique par modèle, 2 tables |
| `lib/studioModeles.ts` (+test, 47) | neuf, isomorphe : tarif, estimation, devis, seuil, libellés |
| `lib/studioCatalogue.ts` (+test, 22) | neuf, serveur : catalogue OpenRouter en cache |
| `lib/studioGeneration.ts` (+test, 88) | neuf, serveur : `/images`, repli chat, erreurs typées, clé du compte |
| `lib/studioLancement.ts` (+test, 47) | neuf, serveur : contrôle du lancement et orchestration injectée |
| `lib/studioBlob.ts` (+test) | `jpg|png|webp`, `lireImageEnBase64` rend le type |
| `lib/studioStats.ts`, `lib/studioFiche.ts` (+tests) | dimension par modèle, coûts, `numeroSuivant` par modèle |
| `lib/studioServeur.ts` | fiche et bilan lisent coûts, modèles et échecs |
| `app/api/studio/generations/route.ts`, `modeles/route.ts`, `modeles/favoris/route.ts` | neufs |
| `app/api/studio/essais/route.ts`, `essais/[id]/verifier/route.ts` | numéro « manuel », vrai type d'image |
| `app/studio/_components/SelecteurModeles.tsx` | neuf : catalogue, favoris, devis, confirmation |
| `app/studio/_components/LigneAngle.tsx`, `CarteEssai.tsx`, `FicheColoris.tsx`, `app/studio/bilan/page.tsx` | lancement, colonnes par modèle, régénération, bilan par modèle |
| `lib/studioCloisonnement.test.ts` | sentinelles des fichiers neufs, tables `Echec`/`ModeleFavori` |
| `CLAUDE.md`, `TODOS.md`, `docs/superpowers/plans/2026-10-19-…` | documentation |

## Validations — passants / échoués / non lancés
- **Passants** :
  - `npm test` → `Tests 795 passed (795)` ;
  - `npm run typecheck` → `tsc --noEmit`, 0 erreur ;
  - `npm run lint` → `✔ No ESLint warnings or errors`.
- **Cloisonnement prouvé par injection de faute** : un import de
  `_publierVinted` dans `lib/studioGeneration.ts` et un `prisma.article.update(`
  dans la route de génération donnent `Tests 2 failed | 18 passed (20)`. Après
  retour arrière, 20/20.
- **Mutations** :
  - estimateur et catalogue : 23 sur 23 tuées après ajout d'un test ;
  - client de génération : 6 sur 7 (la 7e était une mutation infidèle) ;
  - migration vérifiée sur `information_schema` de dev : 5 colonnes, ancien
    unique supprimé et nouveau présent, 2 tables, clés étrangères aux bonnes
    règles, `photosPretes`, `geminiKey` et `anthropicKey` intactes ;
    `migrate diff` ne signale que le `DROP photosPretes` connu.
- **Navigateur (dev, port 3123, compte `studio-test@myflip.test`)** :
  - écran : catalogue affiché avec ses prix, badge « PAS DE 3:4 », favoris
    persistants, devis qui suit les cases, encadré de confirmation (annulé) ;
  - comportements vérifiés avec un faux `fetch` : 409 qui rouvre l'encadré,
    `missing_key` avec lien « Mon compte », succès suivi de la vérification ;
  - colonnes par modèle, sur 4 essais temporaires effacés ensuite ;
  - bilan avec tableau par modèle et total dépensé ;
  - **seuil serveur par appel direct** :
    - modèle au jeton sans confirmation → `409 confirmation_requise` ;
    - riverflow-v2-pro + qwen → 409, devis 0,548 $ ;
    - qwen à 0,018 $ et modèle au jeton confirmé → `400 missing_key`, sans
      appel OpenRouter ni ligne en base ;
    - modèle hors catalogue → `400 modele_inconnu`.
- **Non lancés** :
  - aucun appel OpenRouter payant, ni génération réelle, ni `usage.cost` réel ;
  - forme réelle des refus de sécurité (Nike) : supposée, pas observée ;
  - repli `chat/completions` contre le vrai service ;
  - `npm run build` ;
  - base de prod : sa lecture en lecture seule a été **refusée par le mode
    auto**, son état est inconnu ;
  - `/code-review` sur le diff ;
  - bandeau « SacBase injoignable » (SacBase local arrêté pendant le test).

## Blockers — ce qui bloque
- **La prod n'est pas prête** : base de prod non vérifiée (jusqu'à 3 migrations
  possibles en retard), `SACBASE_URL` et `SACBASE_STUDIO_TOKEN` absentes de
  Vercel, PR SacBase #18 non déployée, rien de commité. Check-list complète,
  non exécutée :
  `~/Library/Application Support/Claude/side-session-notes/local_14c446c8-f52c-4b42-bc96-60d310021637/2026-10-19-studio-ia-checklist-prod.md`.
- **Les prompts du 17/10 ne sont dans aucun dépôt** : les 7 angles sont une
  réécriture, à comparer avant de conclure sur un modèle.
- Le parent `MyFlip/.env.local` a été écrasé le 18/10 (sauvegarde :
  `.env.local.avant-blob-18-10`).

## Next — la prochaine action
1. Aramis lance, depuis la racine du dépôt, la lecture seule de la base de prod :
   `node ~/Library/Application\ Support/Claude/side-session-notes/local_14c446c8-f52c-4b42-bc96-60d310021637/prod-lecture.cjs`
   (transaction `READ ONLY`, lit `information_schema` et `_prisma_migrations`).
2. Avec son accord, une étape à la fois : commits (migration seule d'abord),
   `migrate deploy` sur la prod, variables Vercel, SacBase #18, fusion sur `main`.
3. Premier test en prod : sa clé dans « Mon compte », puis un lancement sur
   `qwen/qwen-image-2.1-turbo` + `bytedance-seed/seedream-5-0-flash`
   (0,018 $ chacun) ; contrôler coût réel, note IA et bilan.

### Coût Jev (`report.py`, historique cumulé, pas seulement cette session)
```
22 routed tasks
  fast         3  (14%)
  balanced    15  (68%)
  deep         4  (18%)
jev latency: median 509 ms, max 1023 ms
jev cost: 14051 input tokens, 0.000562 $ total (639 tokens per task, 0.04 $ per million, output free)
Estimated relative cost vs all-deep: 56% (weights fast=0.25, balanced=0.5, deep=1.0; assumed)
```
Cette session : 5 sous-agents (3 Sonnet, 2 Opus), environ 1,03 M de jetons de
sous-agents, aucun échec, donc aucune relance au cran du dessus.

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-10-19 | Studio IA : génération par API | Claude Code (Opus 5.5) | *(passation courante)* |
| 2026-10-18 | Studio IA, la moitié back | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-10-18-studio-ia-moitie-back.md) |
| 2026-09-29 | Comptes Vinted et dates pour SacBase | Claude Code (Opus 5.5) | [fiche](docs/handoffs/2026-09-29-comptes-vinted-dates-sacbase.md) |
| 2026-09-09 | Le champ prix : diagnostic et correctifs | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-09-champ-prix-diagnostic.md) |
| 2026-09-09 | Le prix dans le prompt, le délai dans un pop-up | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-09-prix-prompt-delai-popup.md) |
| 2026-09-08 | Remplissage Vinted livré, prochain chantier cadré | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-08-remplissage-vinted-livre.md) |
| 2026-09-03 | Audit du chantier Vinted, correctifs, rangement de `main` | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-03-audit-chantier-vinted.md) |
| 2026-08-19 | Extension Vinted — 16 tâches implémentées | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-19-extension-vinted-implementation.md) |
| 2026-08-18 | Extension Vinted, design en cours | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-18-extension-vinted-design.md) |
