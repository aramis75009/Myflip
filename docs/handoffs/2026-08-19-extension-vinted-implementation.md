# HANDOFF — MyFlip (worktree `extension-vinted`)

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le (et archive celui
que tu remplaces dans `docs/handoffs/` si ce dossier existe côté dépôt
principal).

Ce worktree n'a pas encore de `AGENTS.md`/`docs/handoffs/` propres — c'est
une passation minimale, pas l'installation complète du skill `handoff`.

---

# Passation — 2026-08-19 · Extension Vinted, 16 tâches implémentées, revue finale restante

| | |
|---|---|
| **Agent** | Claude Code (Sonnet 5) |
| **Branche** | `worktree-extension-vinted`, worktree à `.claude/worktrees/extension-vinted` (base : `main` @ `2ee3ba3`) |
| **Commits** | `491664b`..`70f3b05` (22 commits) |

## Goal — l'objectif

Implémenter l'extension Firefox de pré-remplissage Vinted décrite dans
`docs/superpowers/specs/2026-08-18-extension-vinted-design.md` (design validé
via `/autoplan` : CEO + Design + Eng, double voix) et
`docs/superpowers/plans/2026-08-18-extension-vinted.md` (16 tâches), en
suivant `superpowers:subagent-driven-development` — un subagent implémenteur
et un subagent reviewer indépendant par tâche, fix rounds jusqu'à revue
clean.

## Current state — ce qui a été fait

**Les 16 tâches du plan sont implémentées et relues, aucune n'est en
attente.** Chaque tâche a eu un reviewer indépendant ; 6 tâches ont nécessité
au moins un fix round (Task 8, 9, 12→doc du plan corrigée avant dispatch, 13,
14) — tous les findings Critical/Important ont été corrigés et re-vérifiés
par un re-reviewer scopé. Détail tâche par tâche, décisions et findings :
`.superpowers/sdd/2026-08-18-extension-vinted/progress.md` (le ledger SDD,
git-ignoré, **à lire avant de continuer** — il contient l'historique complet
que ce HANDOFF ne fait que résumer).

**Ce qui n'a PAS été fait, alors que c'est l'étape suivante immédiate** :
la **revue finale toute-branche** (whole-branch review) du process SDD —
jamais lancée. C'est le point d'arrêt exact : la session s'est interrompue
juste après la revue de la Task 15 (la dernière tâche), avant de dispatcher
cette revue finale, sur demande explicite de faire une passation avant un
`/clear`.

**Autres choses non faites, hors périmètre de ce qu'un agent peut faire ici** :
- Aucune vérification live sur le vrai site Vinted (impossible depuis cet
  environnement : pas de navigateur, MyFlip derrière l'auth — cf. mémoire
  projet). Les sélecteurs DOM Vinted dans `content-vinted.js` (titre,
  description, prix, input photo) sont des **hypothèses jamais confrontées à
  la vraie page** — le design prévoit un échec visible (bannière) si un
  sélecteur est faux, mais ça reste à vérifier en vrai.
- L'extension n'a jamais été signée (`web-ext sign`) ni chargée dans un
  Firefox réel.
- Rien n'a été mergé dans `main` ni poussé sur le remote.

## Decisions — choix critiques ou irréversibles

- **Appariement onglet↔article par ordre CAUSAL strict** (`message.ts <
  event.ts`), pas par rang ni FIFO simple. Deux bugs réels trouvés sur ce
  point précis avant même l'implémentation : la revue Design a trouvé qu'une
  file FIFO simple pouvait mélanger deux articles ; en retraçant à la main
  le code du plan avant de dispatcher la Task 12, j'ai trouvé que
  l'implémentation « corrigée » elle-même ne passait pas son propre test —
  corrigée dans le plan avant dispatch. C'est la pièce la plus fragile de
  tout le système, seule à avoir un test automatisé direct
  (`extension-vinted/pairing.test.js`).
- **`pendingEvents` DOIT être persisté en IndexedDB, pas seulement en
  mémoire** (Task 13, finding Critical). Un service worker Manifest V3 peut
  être tué à tout moment ; sans cette persistance, un événement perdu pouvait
  faire atterrir silencieusement les données d'un article ancien sur
  l'onglet Vinted d'un article plus récent (mauvais titre/prix/photos publiés,
  sans erreur visible). Corrigé : nouveau store IndexedDB dédié, `reconcile()`
  recharge les événements persistés à chaque réveil, purge TTL de 30 min pour
  les orphelins.
- **`enregistrer()` doit recevoir `f.id` (id client de la fiche), jamais
  `f.article.id`** (Task 8, finding Critical). Le code d'exemple du plan
  lui-même avait ce bug — sans ce correctif, le bouton « Publier sur Vinted »
  n'aurait jamais rien enregistré en production (le PATCH échouait
  silencieusement à chaque fois).
- **Le content script MyFlip doit se réévaluer sur navigation SPA**
  (`history.pushState`/`popstate`), pas seulement au chargement complet de
  la page (Task 14, finding Important). MyFlip navigue en client-side routing
  (sidebar en `next/link`) — sans ce correctif, cliquer « Mise en vente »
  depuis la sidebar (le chemin normal) laissait le bouton « Publier sur
  Vinted » sans effet, silencieusement. Fix sans permission supplémentaire :
  script injecté en contexte page (contournement Xray vision Firefox) qui
  patch `history.pushState`/`replaceState` et redispatche un événement DOM
  écouté par le content script.
- **API Vinted Pro Integrations existe réellement mais écartée** — vérifiée
  pendant la revue `/autoplan`, réservée à un allowlisting entreprise/logiciel
  (plateformes multi-canal), pas accessible à un vendeur Pro individuel.
  Aramis a confirmé dans son propre compte. Extension Firefox confirmée comme
  seul chemin réaliste.

## Changed — fichiers et composants

33 fichiers, +4954/−9. Résumé par zone :

| Zone | Fichiers | Nature |
|---|---|---|
| Prix de référence (MyFlip) | `prisma/schema.prisma`, `app/api/prix/**`, `lib/pickPrix.ts`, `lib/prixServer.ts`, `lib/hooks.ts`, `app/parametres/page.tsx` | Nouveau modèle `PrixReference`, CRUD complet, UI de gestion, sélection par précision décroissante (calque de `pickPrompt`) |
| QCM / publication (MyFlip) | `app/mise-en-vente/_reducer.ts`, `FicheArticle.tsx`, `page.tsx`, `_publierVinted.ts` (+test), `ExportAnnonces.tsx` | Champ prix pré-rempli, bouton « Publier sur Vinted » gaté sur succès du PATCH, bouton « copier tout » |
| Réglages anti-ban (MyFlip) | `app/api/user/settings/route.ts`, `app/compte/page.tsx`, `components/compte/ExtensionVinted.tsx` | Délai min/max, validation croisée y compris sur mise à jour partielle |
| Extension Firefox (nouveau) | `extension-vinted/*.js`, `manifest.json`, `README.md` | Manifest V3, pairing causal testé, service worker + IndexedDB, 2 content scripts |
| Docs | `docs/superpowers/specs/...`, `docs/superpowers/plans/...`, `TODOS.md` | Spec, plan, 4 items différés ajoutés à TODOS.md |

## Validations — passants / échoués / non lancés

| Commande | Résultat |
|---|---|
| `npm run test` | ✅ **145/145 passent** (14 fichiers) |
| `npx tsc --noEmit` | ✅ propre (aucune sortie) |
| `node --check` sur les 5 fichiers `extension-vinted/*.js` | ✅ tous valides syntaxiquement |
| `npx eslint` | ⏭️ **non lancé** — cassé structurellement dans ce worktree (conflit de plugin `@next/next` entre le `node_modules` du worktree et celui du dépôt parent, confirmé sans rapport avec le code de cette session — `EnterWorktree` place le worktree dans `.claude/worktrees/`, imbriqué dans le dépôt principal) |
| Vérification live sur `vinted.fr` | ⏭️ **non vérifié, à faire par Aramis** — aucun agent de cette session n'a accès à un navigateur ; les sélecteurs DOM sont des hypothèses |
| Chargement de l'extension dans Firefox réel | ⏭️ **non fait** — nécessite un compte développeur Mozilla + `web-ext sign` (voir `extension-vinted/README.md`) |

## Blockers — ce qui bloque

Rien ne bloque la suite du travail agent (revue finale toute-branche). Le
seul vrai blocage est la vérification sur le vrai site Vinted, qui revient à
Aramis (aucun contournement navigateur disponible pour un agent sur ce
projet — cf. mémoire).

## Next — la prochaine action

Reprendre le process `superpowers:subagent-driven-development` là où il s'est
arrêté : dispatcher la **revue finale toute-branche** (`scripts/review-package
docs/superpowers/plans/2026-08-18-extension-vinted.md 2ee3ba300db25be901c17818de60f840f64b495c HEAD`,
puis `superpowers:requesting-code-review`'s `code-reviewer.md`, sur le modèle
le plus capable disponible). Si elle remonte des findings, UNE seule vague de
correctifs groupés + une re-revue scopée, puis adjudication des résiduels
selon la doctrine du skill. Une fois clean : supprimer le workspace SDD
(`rm -rf .superpowers/sdd/2026-08-18-extension-vinted`) et enchaîner sur
`superpowers:finishing-a-development-branch` pour décider merge/PR avec
Aramis — **ne pas pousser ni fusionner sans lui demander explicitement.**

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-08-19 | Extension Vinted — 16 tâches implémentées, revue finale restante | Claude Code (Sonnet 5) | *(première passation de ce worktree, pas encore archivée)* |
