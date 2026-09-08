# HANDOFF — MyFlip

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le et archive celui que
tu remplaces dans `docs/handoffs/`.

Le mode d'emploi complet est dans [`AGENTS.md`](AGENTS.md), section
« Terminer une session ». L'index des passations passées est en bas de page.

---

# Passation — 2026-09-08 · Remplissage Vinted livré, prochain chantier cadré

| | |
|---|---|
| **Agent** | Claude Code (Opus 5) + Aramis |
| **Branche** | `worktree-extension-vinted`, poussée sur `origin`. `main` intouché. |
| **Commits** | `305a3fe` → `95e92ac`, 20 commits |

## Goal — l'objectif

Exécuter le plan `2026-09-08-vinted-remplissage-auto.md` (14 tâches) pour que
l'extension Firefox remplisse **tout** le formulaire Vinted et clique
« Sauvegarder le brouillon », puis cadrer le chantier suivant.

## Current state — ce qui a été fait

**Le remplissage automatique est livré.** L'extension ouvre son propre onglet,
remplit catégorie, marque, état, couleur, matériau, unisexe, format de colis,
titre, description, prix et photos dans l'ordre imposé par Vinted, puis
sauvegarde le brouillon. Elle ne clique **jamais** « Ajouter ». Un seul article
en vol à la fois, avec un délai tiré au hasard entre chacun.

Les 14 tâches sont passées par une revue individuelle et une revue finale de
branche. Trois tâches ont eu un round de correction ; la revue finale en a
déclenché un quatrième, sur cinq points de panne muette.

**Ce qui n'a PAS été fait alors qu'on aurait pu le croire :**

- **Rien n'a jamais tourné dans un navigateur.** `tsc`, `vitest` et
  `web-ext lint` ne disent rien du DOM Vinted ni du rendu React. Aucune ligne de
  `formulaire.js`, `content-vinted.js` ni `background.js` n'a été exécutée.
- **Le prix n'est pas vérifié.** C'est le seul vrai inconnu du chantier, et il
  reste entier — cf. Blockers.
- Le chantier suivant (prix dans le prompt, pop-up de délai) est **cadré et
  spécifié, pas commencé**. Aucune ligne écrite.

## Decisions — choix critiques ou irréversibles

**La catégorie Vinted est `246`, Hommes > Accessoires > Sacs et sacoches.**
Corrigé en fin de session : la spec §6 enregistrait la décision **à l'envers**,
elle retenait `157` (Femmes) et qualifiait `246` d'erreur de navigation. C'est
`157` qui était l'erreur — elle vient de ce que le relevé automatique avait
remonté la branche Femmes. Les sacs vendus sont des sacs homme. Le test-garde
qui interdisait `246` interdit désormais `157`. Effet secondaire favorable :
`246` est la seule des deux feuilles dont on ait vérifié **en écriture** qu'elle
accepte un brouillon.

**Un échec suspend toute la chaîne, et la suspension a deux sorties.** Un seul
échec arrête les articles suivants — la cause est presque toujours commune
(Vinted a changé son DOM), enchaîner ne ferait qu'aggraver. La file repart en
fermant l'onglet en échec, **ou** en relançant depuis `/mise-en-vente`. Ces deux
sorties ont été ajoutées après la revue finale : sans elles, l'état `"echouee"`
était absorbant et un seul échec briquait la file définitivement, en silence.

**Le brouillon n'est jamais sauvegardé sur un remplissage incomplet**, et **un
prix vide interdit le clic**. Un brouillon à 0 € est invisible une fois l'onglet
fermé : il faut aller le rechercher dans Vinted sans savoir ce qui manque.

**Aucune migration Prisma n'a été ajoutée**, délibérément. Les deux qui
attendaient (`PrixReference`, `delai_vinted`) sont **appliquées sur dev**
(vérifié : `prisma migrate status` → « Database schema is up to date ») mais
**pas en production**.

**Le prochain chantier les rend obsolètes toutes les deux.** D'où la décision
d'Aramis de ne pas les appliquer telles quelles : le prix déménage dans le
prompt, le délai devient un réglage par lot. Spec :
`docs/superpowers/specs/2026-09-08-prix-prompt-delai-popup-design.md`.

## Changed — fichiers et composants

| Fichier | Nature |
|---|---|
| `lib/vintedReferentiels.ts` + test | Créé — 29 couleurs, état → `condition_id`, matière → `material_id` |
| `lib/vintedMapping.ts` + test | Créé — Nike + « Sac à dos » → catégorie **246**, marque 53, colis 1 |
| `app/mise-en-vente/_reducer.ts` + test | `Qcm.couleurs: number[]` ; l'action `qcm` accepte `number[]` |
| `app/mise-en-vente/_components/FicheArticle.tsx` | Carte Vinted, 29 pastilles couleur, taille masquée, matières pré-remplies |
| `app/mise-en-vente/_publierVinted.ts` + test | Bloc `vinted` d'identifiants numériques ; `publierVinted` à 3 args ; `extensionPresente()` |
| `app/mise-en-vente/page.tsx` | Plus de `window.open` par défaut ; `publierVintedTout()` en série |
| `app/mise-en-vente/_components/ExportAnnonces.tsx` | Bouton groupé ; bouton par fiche qui dit pourquoi il est grisé |
| `extension-vinted/file.js` + test | Créé — ordonnanceur pur, 14 tests. Remplace `pairing.js` |
| `extension-vinted/formulaire.js` | Créé — 11 primitives de pilotage du DOM Vinted |
| `extension-vinted/background.js` | Réécrit — ordonnanceur séquentiel, alarmes, `tabs.create` |
| `extension-vinted/content-vinted.js` | Réécrit — remplissage complet, badge, bannières |
| `extension-vinted/content-myflip.js` | Transmet `vinted` ; pose `data-myflip-vinted="1"` |
| `extension-vinted/db.js` | v3, store `pendingEvents` supprimé |
| `extension-vinted/manifest.json` | Permission `alarms` ; `formulaire.js` avant `content-vinted.js` |
| `extension-vinted/pairing.js` + test | **Supprimés** |
| `extension-vinted/README.md`, `TODOS.md` | Parcours réel, vérification du prix, chaîne suspendue |

## Validations — passants / échoués / non lancés

**Passants**, lancés par moi sur le HEAD de branche :

```
$ npx tsc --noEmit
(aucune sortie, exit 0)

$ npx vitest run
 Test Files  16 passed (16)
      Tests  177 passed (177)

$ cd extension-vinted && npx web-ext lint --self-hosted
errors          0
notices         0
warnings        2
```

Les 2 avertissements sont ceux de la baseline, voulus et documentés dans
`extension-vinted/README.md`.

**Échoués** : aucun.

**NON LANCÉS — c'est ici qu'il faut regarder en premier :**

- **Toute exécution navigateur.** Le DOM Vinted, le rendu React, le pop-up, le
  badge, les bannières : rien n'a jamais tourné.
- **`npm run build`** — interdit par consigne tant qu'un `npm run dev` tourne.
- **Le prix sur un vrai brouillon.** La parade est en place (frappe caractère
  par caractère, setter natif, `blur`, relecture), mais aucune vérification
  faite depuis la page ne peut prouver que le prix est commité.

## Blockers — ce qui bloque

**Pour fusionner dans `main`** : les migrations doivent être appliquées en
production d'abord. `vercel.json` s'arrête à `prisma generate`, jamais
`migrate deploy` — fusionner sans ça déploie du code qui interroge une table
absente, ce qui donne une page vide, pas une erreur.

⚠️ **Mais ne pas les appliquer telles quelles.** Le chantier cadré les remplace
par une seule migration. Voir la spec, §4.2.

**Pour tester** : rien ne bloque. Aramis peut essayer dès maintenant, sans
appliquer aucune migration :

1. `cd extension-vinted && npx web-ext sign --channel=unlisted`, installer le `.xpi`
2. Ouvrir la console du worker (`about:debugging` → Inspecter) et coller :
   `browser.storage.local.set({ delaiMin: 1, delaiMax: 1 })`
3. Taper le prix à la main dans le questionnaire (le prix de référence ne fait
   que pré-remplir, il n'est pas obligatoire)
4. Lancer sur **un seul** article, puis **ouvrir le brouillon créé dans Vinted et
   regarder le prix**

## Next — la prochaine action

Écrire le plan d'implémentation du chantier cadré, avec
`superpowers:writing-plans`, à partir de
`docs/superpowers/specs/2026-09-08-prix-prompt-delai-popup-design.md`. Aramis a
donné son feu vert explicite pour enchaîner plan puis code.

Trois choses à ne pas redécouvrir en route :

- `pickPrompt` (`lib/promptSelect.ts`) et `pickPrix` (`lib/pickPrix.ts`) sont la
  **même cascade dupliquée** — c'est ce qui justifie la fusion.
- La nouvelle migration **détruit la table `PrixReference`**, peuplée sur dev.
  Les prix doivent être reportés dans les prompts avant de l'appliquer.
- Le premier article d'un lot ne doit plus attendre : la logique vit dans
  `file.js`, en fonction pure, donc elle se teste.

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-09-08 | Remplissage Vinted livré, prochain chantier cadré | Claude Code (Opus 5) | *(passation courante)* |
| 2026-09-03 | Audit du chantier Vinted, correctifs, rangement de `main` | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-03-audit-chantier-vinted.md) |
| 2026-08-19 | Extension Vinted — 16 tâches implémentées, revue finale restante | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-19-extension-vinted-implementation.md) |
| 2026-08-18 | Extension Vinted, design en cours | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-18-extension-vinted-design.md) |
