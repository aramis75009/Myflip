# HANDOFF — MyFlip

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le et archive celui que
tu remplaces dans `docs/handoffs/`.

Le mode d'emploi complet est dans [`AGENTS.md`](AGENTS.md), section
« Terminer une session ». L'index des passations passées est en bas de page.

---

# Passation — 2026-09-03 · Audit du chantier Vinted, correctifs, rangement de `main`

| | |
|---|---|
| **Agent** | Claude Code (Opus 5) + Aramis |
| **Branches** | `main` (rangement + audit), `worktree-extension-vinted` (correctifs) |
| **Commits** | `main` : `4f76dc7`, `7f24cd5`, `6545684`, `cd8e9dc`, merge `3f414aa` · branche : `51505fb` |

## Goal — l'objectif

Aramis a demandé un audit de `/mise-en-vente` et de « ce qui a été commencé »
sur l'extension, pour alimenter une IA qui concevrait ensuite l'architecture
de l'intégration Vinted.

**La prémisse était périmée de trois semaines.** La conception existait déjà
(design 902 l. + plan 1795 l., passés par `/autoplan`), et l'extension était
implémentée à ~90 % — mais tout vivait sur `worktree-extension-vinted`, une
branche **poussée nulle part**, avec les documents de design non commités sur
`main`. Depuis `main`, le chantier était invisible.

L'objectif est donc devenu : dire l'état réel, sauver ce qui n'était pas
sauvé, refermer ce qui pouvait l'être, ranger le reste.

## Current state — ce qui a été fait

**Audit** : `docs/audits/2026-09-03-etat-chantier-vinted.md`, sur `main`.
Cartographie de `/mise-en-vente` (génération, statuts, champs, écarts avec un
formulaire Vinted), état réel de l'extension, et douze risques dont chacun
porte sa mention `CORRIGÉ` ou `OUVERT`.

**Correctifs** (commit `51505fb` sur la branche). `web-ext lint` renvoyait
**2 erreurs bloquantes** : `web-ext sign` n'aurait jamais produit de `.xpi`
installable, l'extension était inutilisable à 100 %.

- `background` ne déclarait que `service_worker`, la forme Chrome de MV3.
  Firefox l'ignore et ne chargeait donc **aucun** script d'arrière-plan :
  pas de file, pas d'appariement, et `content-vinted.js` traitait le worker
  injoignable en « état neutre » silencieux. Le manifest déclare maintenant
  `scripts` (utilisée par Firefox) **et** `service_worker` (gardée pour un
  portage Chrome ultérieur).
- `gecko_android.strict_min_version` valait `null` là où le schéma exige une
  chaîne. Android étant hors scope, la clé est retirée.
- `data_collection_permissions` ajoutée (Mozilla l'exige désormais), ce qui
  monte le plancher à Firefox 140.
- Les photos ne circulent plus en `Blob` mais en `{ type, buffer }`.
- Le remplissage des champs passe par le setter natif du prototype.
- Le badge se construit noeud par noeud, plus d'`innerHTML`.

**Rangement de `main`** : `AGENTS.md`, `HANDOFF.md`, `docs/handoffs/` et la
mise à jour de `TODOS.md` étaient non suivis. `.gitignore` ignore désormais
`.env*` et `.claude/worktrees/`. `git status` est propre.

## Decisions — choix critiques ou irréversibles

- **`worktree-extension-vinted` est poussée sur `origin`, mais PAS fusionnée.**
  Deux raisons : `vercel.json` lance `prisma generate`, **pas**
  `migrate deploy`, donc fusionner déploierait du code interrogeant une table
  `PrixReference` absente de la production ; et le bouton « Publier » change de
  nature (d'un `<a target="_blank">` à un `<button>` qui PATCH puis
  `window.open()`) sans avoir jamais tourné dans un navigateur.

- **Les photos passent en `ArrayBuffer`, décision de fond.** Le spike qui
  devait valider le transport des `Blob` (Task 10 du plan) n'a jamais été fait,
  alors qu'un commentaire de `content-myflip.js` affirmait son résultat. Plutôt
  que de documenter l'inconnu, il est supprimé : `ArrayBuffer` est
  structured-cloneable sans réserve à travers le messaging et IndexedDB.

- **Deux copies périmées supprimées de `main`.** Les fichiers non suivis
  `docs/superpowers/{plans,specs}/2026-08-18-extension-vinted*.md` doublonnaient
  des fichiers commités sur la branche. Celle du plan était la **périmée** :
  elle portait encore l'appariement par rang que `10691f9` a remplacé par
  l'ordre causal. Les committer aurait figé un bug déjà corrigé et garanti un
  conflit add/add. Elles reviendront avec la fusion de la branche.

- **L'URL du remote `origin` est corrigée** en
  `https://github.com/aramis75009/Myflip.git`. Elle pointait sur
  `compta-polos.git` ; GitHub redirigeait, donc git marchait, mais `gh` et les
  URL de PR échouaient. Le remote `alex` n'a pas été touché.

- **R12 laissé ouvert volontairement.** `window.open()` s'exécute après un
  `await` réseau et perd donc l'activation utilisateur (~5 s chez Firefox) :
  l'onglet s'ouvre sur une connexion rapide et le popup est bloqué sur une
  lente. Les issues (ouvrir puis fermer si échec, ou naviguer un onglet déjà
  ouvert) sont des choix de conception qui reviennent à Aramis.

## Changed — fichiers et composants

Sur `worktree-extension-vinted` (`51505fb`) : `extension-vinted/manifest.json`,
`content-myflip.js`, `content-vinted.js`, `background.js`, `README.md`.

Sur `main` : `docs/audits/2026-09-03-etat-chantier-vinted.md` (nouveau),
`AGENTS.md`, `HANDOFF.md`, `docs/handoffs/*`, `TODOS.md`, `.gitignore`.

## Validations — passants / échoués / non lancés

| Commande | Résultat |
|---|---|
| `npx vitest run` | ✅ **145/145** (14 fichiers) |
| `npx tsc --noEmit` | ✅ propre |
| `npx web-ext lint --self-hosted` | ✅ **0 erreur** (contre 2 avant), 2 avertissements voulus et documentés |
| `npm run build` | ⏭️ **non lancé** — un `next dev` tournait (celui du projet `brief`), invariant `AGENTS.md` |
| Chargement dans Firefox réel | ⏭️ **non fait** — demande un navigateur |
| Vérification sur `vinted.fr` | ⏭️ **non fait** — revient à Aramis |

## Blockers — ce qui bloque

Rien côté agent. Les trois points restants demandent tous un navigateur ou une
décision d'Aramis : relever le DOM de `vinted.fr/items/new` (R3), trancher R12,
et appliquer les deux migrations Prisma en production avant toute fusion.

## Next — la prochaine action

Dans l'ordre du §5 de l'audit :

1. Relever le DOM réel de `vinted.fr/items/new` — c'est le seul vrai inconnu
   qui reste sur le remplissage.
2. Charger l'extension via `about:debugging` et vérifier que `background.js`
   démarre maintenant que le manifest est corrigé.
3. Trancher R12.
4. Appliquer les migrations `PrixReference` et `delai_vinted` en production,
   puis fusionner `worktree-extension-vinted`.

**Note** : la passation du 19/08 signalait qu'une **revue finale toute-branche**
(`superpowers:requesting-code-review`) n'avait jamais été lancée. Elle ne l'est
toujours pas. Les deux défauts à panne silencieuse corrigés aujourd'hui sont
exactement le genre de chose qu'elle aurait attrapée — la lancer avant de
fusionner reste une bonne idée.

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-09-03 | Audit du chantier Vinted, correctifs, rangement de `main` | Claude Code (Opus 5) | *(passation courante)* |
| 2026-08-19 | Extension Vinted — 16 tâches implémentées, revue finale restante | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-19-extension-vinted-implementation.md) |
| 2026-08-18 | Extension Vinted, design en cours | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-18-extension-vinted-design.md) |
