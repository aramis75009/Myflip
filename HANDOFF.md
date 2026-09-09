# HANDOFF — MyFlip

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le et archive celui que
tu remplaces dans `docs/handoffs/`.

Le mode d'emploi complet est dans [`AGENTS.md`](AGENTS.md), section
« Terminer une session ». L'index des passations passées est en bas de page.

---

# Passation — 2026-09-09 · Le champ prix : diagnostic et correctifs

| | |
|---|---|
| **Agent** | Claude Code (Opus 5) + Aramis |
| **Branche** | `vinted-champ-prix`, partie de `origin/main` (`a31f369`). **Non poussée. Non fusionnée.** 11 commits. |
| **Commits** | `9763058` → HEAD (correctifs de code : `9763058`..`b1905b8`) |
| **Plan** | `docs/superpowers/plans/2026-09-09-champ-prix-et-onglet-cache.md` |
| **Spec** | `docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md` |

# 🎯 L'OBJECTIF DE CE CHANTIER : PASSER DE 6/10 À **9/10 MINIMUM**

**C'est la consigne la plus importante de cette passation, donnée par Aramis le
09/09/2026. Tout le reste en découle.**

L'extension MyFlip doit **ressembler le plus possible à celle du Troc Futé** —
dans ses mécanismes, jamais dans son code. Leur outil tourne depuis deux ans chez
des clients payants **sans se faire repérer par Vinted** ; c'est la seule preuve
de terrain disponible, et Aramis connaît personnellement leur développeur.

**Note actuelle : 6/10.** Le relevé complet, avec le détail de ce qui est aligné
et de ce qui manque, est dans
[`docs/audits/2026-09-09-ecart-avec-le-troc-fute.md`](docs/audits/2026-09-09-ecart-avec-le-troc-fute.md).

## Le chemin vers 9/10, chiffré et ordonné

| Rang | Ce qui manque | Gain | Note atteinte |
|---|---|---|---|
| **1** | **Lire la réponse de l'API Vinted** au lieu de deviner | **+2** | **8/10** |
| **2** | **De vrais événements souris** au lieu de `HTMLElement.click()` | **+1** | **9/10** ✅ |
| 3 | Oscillateur Web Audio anti-endormissement | +0,5 | 9,5/10 |
| 4 | Règles sur les en-têtes réseau (rôle non analysé) | +0,5 | 10/10 |

**Les rangs 1 et 2 suffisent à atteindre l'objectif.**

**Rang 1 — le manque le plus coûteux du projet.** Ils remplacent
`XMLHttpRequest` et attendent la réponse de `POST /api/v2/item_upload/drafts` :
ils savent **ce que Vinted a réellement enregistré**, champ par champ. MyFlip
déduit le succès d'un changement d'URL et ne sait rien du contenu. **Cette
interception aurait détecté le prix à 0,00 € au premier essai**, au lieu de
coûter un mois et deux chantiers. À faire porter par un script du monde de la
page — le `XMLHttpRequest` du monde isolé n'est pas celui que Vinted utilise.

**Rang 2 — `HTMLElement.click()` n'est pas un clic.** Il n'émet ni
`pointerdown` ni `mousedown`, donc **ne déplace pas le focus** — ce qui est tout
le sujet du champ prix. Ils composent la séquence complète.

## ⚠️ Le seul endroit où il NE FAUT PAS s'aligner

Leur mensonge de visibilité bloque `blur` en phase de **capture** sans
condition. `blur` ne bouillonne pas mais il capture : ce blocage tuerait
**n'importe quel écouteur `blur` d'élément de la page**. Si Vinted tourne en
React 16, cela **causerait** le brouillon à `0,00 €` au lieu de le corriger.

Celui de MyFlip ne bloque que les événements dont la **cible** est `window` ou
`document`. **C'est volontaire. Ne pas « aligner » ce point** — la revue finale
du 09/09 l'a exigé.

## ⚠️ La note vient d'une lecture PARTIELLE

Ont été lus : `manifest.json`, `content-always-focus.js`, `timer-worker.js`, et
dans `content-human-actions.js` la fonction du prix plus la table des matières.
**N'ont pas été analysés** : `background.js` (37 Ko), `content.js`,
`content-interceptor.js`, `rules/vinted-headers.json` (22 Ko).

**Premier travail pour viser 9/10 sérieusement : finir cette lecture.**
Aramis n'a rien à fournir : le `.xpi` est un téléchargement public. **La marche
à suivre exacte — commande, pièges, et inventaire de leurs 8 fichiers avec ce
qui a été lu ou non — est en tête de**
`docs/audits/2026-09-09-ecart-avec-le-troc-fute.md`.

**Ne recopier aucune ligne**, et supprimer le dossier après lecture : le lire est
légitime, le redistribuer ne l'est pas.

---

## La décision en attente, à relire à la lumière de l'objectif

Le diagnostic classait « ouvrir l'onglet **au premier plan** » (`active: true`
dans `background.js`) comme un correctif d'un mot, et la machinerie — mensonge
de visibilité + minuteurs en worker — comme « à n'envisager que si ce mot ne
suffit pas ». La machinerie a été construite **sans jamais essayer le mot**, et
l'arbitrage n'a pas été soumis à Aramis. C'est la faute de conduite de la
session du 09/09, relevée par la revue finale.

⚠️ **Mais la consigne du 9/10 la tranche en pratique : Le Troc Futé garde
l'onglet CACHÉ.** Retirer la machinerie ferait *baisser* la note. L'option
« essayer `active: true` et retirer la machinerie » est donc écartée, sauf
contre-ordre explicite d'Aramis.

`background.js` reste sur `active: false`. Ce qui subsiste, et qui est bon
marché : la mesure `avaitLeFocus` journalisée par `taperPrix()` dira au premier
passage si l'onglet caché était bien la cause racine. Si oui, `active: true`
reste un **repli de secours** — pas la voie principale.

## Goal — l'objectif

Que le prix arrive réellement dans le brouillon Vinted, au lieu de s'y
enregistrer à `0,00 €` alors que le champ affiche « 15,00 € » (relevé du
08/09/2026). C'était le seul inconnu du chantier Vinted.

## Current state — ce qui a été fait

**Le diagnostic vient de la lecture de l'extension concurrente.** Le Troc Futé
est publié sur addons.mozilla.org ; son `.xpi` a été téléchargé publiquement, lu,
puis supprimé. **Aucune ligne recopiée** — les deux documents produits consignent
des faits sur Vinted et sur React. Écart complet et note de ressemblance
(**6/10**) dans `docs/audits/2026-09-09-ecart-avec-le-troc-fute.md`.

**Quatre causes, quatre correctifs**, tous livrés sur la branche :

1. **Le mauvais événement.** Depuis React 17, `onBlur` est émulé depuis
   `focusout` ; `blur` ne bouillonne pas et n'atteint jamais l'écouteur posé à
   la racine. Le champ prix est le seul du formulaire à valider **au départ du
   focus** — c'est là qu'il reformate « 15 » en « 15,00 € » et commite. Le titre
   survivait parce qu'il commite sur `input`.
2. **Le séparateur décimal.** Le champ est en locale française :
   `prixPourVinted()` (`app/mise-en-vente/_publierVinted.ts`) convertit le point
   en virgule. **Seul maillon de la chaîne du prix couvert par des tests** (6).
3. **Le focus jamais réellement déplacé.** `taperPrix()` sort désormais le focus
   vers le champ description.
4. **L'onglet caché.** `forcerVisibilitePage()` (injectée dans le monde de la
   page) et `minuteur-worker.js`.

**Ce qui n'a PAS été fait :**

- **Rien n'a jamais tourné dans un navigateur.** Pas une fois.
- **Trois des quatre correctifs vivent dans des fichiers qu'aucun outil ne
  vérifie** : `tsconfig.json` n'inclut que `**/*.ts`/`**/*.tsx`, vitest ne
  collecte que `extension-vinted/**/*.test.js`. Les 219 tests verts ne couvrent
  que la conversion décimale.
- **Le prix d'un vrai brouillon Vinted n'a toujours jamais été relu.**

## Decisions — choix critiques

**La revue finale a rejeté la branche, et ses deux défauts bloquants venaient de
correctifs de cette session.** Corrigés dans `b1905b8` :

- **Le mensonge de visibilité était trop large.** Il bloquait `blur` en phase de
  **capture** sur `window`/`document` — donc tout écouteur `blur` d'élément de
  la page. Sous React 16, il aurait **causé** le bug au lieu de le corriger.
  Restreint aux événements dont la cible est `window` ou `document`.
- **Une pause pouvait ne jamais se résoudre.** Un worker qui se construit mais
  ne démarre pas émet un événement `error`, pas une exception. `remplir()`
  restait suspendue, aucun `vinted:resultat` ne partait, l'entrée restait
  `"en-cours"` — et `file.js:134` **exclut `"en-cours"` de la purge TTL**. File
  gelée jusqu'à fermeture manuelle de l'onglet, sans message. Garde-fou temporel
  + écouteur `error` ajoutés.
- **Le commit pouvait tourner deux fois.** Si le champ avait le focus,
  `el.blur()` commite déjà ; le `focusout` synthétique faisait recommencer sur
  « 15,00 € » déjà reformaté — qu'un parseur naïf rend `NaN`, c'est-à-dire
  `0,00 €`. On fabriquait le bug qu'on chassait. Rendu conditionnel sur
  `avaitLeFocus`.

⚠️ **`avaitLeFocus` est aussi la MESURE qui départage les causes.**
`taperPrix()` journalise `[myflip-vinted] prix : le champ avait le focus = …`.
En onglet caché : `false` ⇒ la cause racine est l'onglet (n° 4), pas
l'événement (n° 1). **La revue finale argumente que c'est le cas** — l'ancien
`el.blur()` produisait déjà un `focusout` réel, sauf si le focus n'avait jamais
été pris.

**Le sélecteur `[data-testid="price-input"]` (le conteneur) ne vient d'aucun
relevé DOM** — il vient de la lecture du concurrent. Le champ,
`[data-testid="price-input--input"]`, lui, est attesté. À confirmer au premier
passage.

**Un défaut critique préexistant, non corrigé** (documenté dans
`docs/audits/2026-09-04-revue-finale-lane-a.md`) : `Article.prixVente` est
écrasé à `null` à chaque sauvegarde. **Le brouillon Vinted reçoit bien le prix**
— il voyage en mémoire — mais il est absent de `/stock`. Décision d'Aramis du
09/09 : le prix d'annonce aura **sa propre colonne** (`TODOS.md`), après l'essai.

## Changed — fichiers

| Fichier | Nature |
|---|---|
| `app/mise-en-vente/_publierVinted.ts` + test | `prixPourVinted()`, 6 tests |
| `extension-vinted/formulaire.js` | `taperPrix()` ; `pause()` par worker + garde-fou |
| `extension-vinted/content-vinted.js` | `forcerVisibilitePage()` injectée en `textContent` ; `init()` différé |
| `extension-vinted/minuteur-worker.js` | Créé |
| `extension-vinted/manifest.json` | `run_at: document_start`, `web_accessible_resources`, version `1.2.0` |
| `extension-vinted/README.md` | Les quatre causes et leurs correctifs |
| `docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md` | Créé — la spec |
| `docs/audits/2026-09-09-ecart-avec-le-troc-fute.md` | Créé — écart et note 6/10 |

## Validations

```
$ npx tsc --noEmit          → exit 0, aucune sortie
$ npx vitest run            → 17 fichiers, 219 tests, 0 échec
$ cd extension-vinted && npx web-ext lint --self-hosted
                            → 0 erreur, 2 avertissements (baseline)
```

**Non lancés** : toute exécution navigateur. `npm run build` (interdit).

## Blockers

- **La décision d'Aramis sur `active: true`** (voir en tête).
- La branche n'est **ni poussée ni fusionnée**.
- `main` est à jour et déployé : le chantier précédent (prix dans le prompt,
  délai en pop-up) est en production, migrations appliquées.

## Next — la prochaine action

**L'objectif en tête de cette passation commande l'ordre ci-dessous.**

1. **Finir la lecture de l'extension concurrente** — `background.js` (37 Ko),
   `content.js`, `content-interceptor.js`, `rules/vinted-headers.json` (22 Ko).
   Sans ça, la note de 6/10 reste une estimation. Télécharger le `.xpi` depuis
   addons.mozilla.org, lire, supprimer, **ne rien recopier**.
2. **Rang 1 — lire la réponse de l'API Vinted** (+2 → 8/10). Le manque le plus
   coûteux du projet, et celui qui rendra la vérification du prix automatique
   au lieu de dépendre d'Aramis relisant un brouillon à la main.
3. **Rang 2 — de vrais événements souris** (+1 → **9/10, objectif atteint**).
4. **Le premier passage réel**, qu'Aramis fera lui-même : compte Vinted
   **jetable**, depuis son **PC Windows**, contre `myflip-app.vercel.app`. Il
   refuse d'essayer depuis le Mac — il n'y a accès qu'à son compte pro
   (700 avis). Charger l'extension par `about:debugging` → Charger un module
   temporaire. **Regarder le prix du brouillon créé**, et la console pour la
   ligne `le champ avait le focus = …`.
5. Ensuite : la colonne `prixAnnonce` (`TODOS.md`), puis la signature de
   l'extension en « unlisted » pour une installation permanente.

⚠️ **L'ordre entre 3 et 4 se discute.** Faire l'essai plus tôt donnerait une
mesure réelle plutôt qu'une hypothèse de plus — mais chaque session d'essai
coûte un compte jetable à Aramis, et le rang 1 est précisément ce qui rendrait
cet essai concluant du premier coup. À trancher avec lui.

⚠️ **Cette passation n'est pas passée par une relecture indépendante** :
écrite par le contrôleur en fin de session.

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-09-09 | Le champ prix : diagnostic et correctifs | Claude Code (Opus 5) | *(passation courante)* |
| 2026-09-09 | Le prix dans le prompt, le délai dans un pop-up | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-09-prix-prompt-delai-popup.md) |
| 2026-09-08 | Remplissage Vinted livré, prochain chantier cadré | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-08-remplissage-vinted-livre.md) |
| 2026-09-03 | Audit du chantier Vinted, correctifs, rangement de `main` | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-03-audit-chantier-vinted.md) |
| 2026-08-19 | Extension Vinted — 16 tâches implémentées | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-19-extension-vinted-implementation.md) |
| 2026-08-18 | Extension Vinted, design en cours | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-18-extension-vinted-design.md) |
