# HANDOFF — MyFlip

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le et archive celui que
tu remplaces dans `docs/handoffs/`.

Le mode d'emploi complet est dans [`AGENTS.md`](AGENTS.md), section
« Terminer une session ». L'index des passations passées est en bas de page.

---

# Passation — 2026-09-09 · Le prix dans le prompt, le délai dans un pop-up

| | |
|---|---|
| **Agent** | Claude Code (Opus 5) + Aramis |
| **Branche** | `worktree-extension-vinted`. **14 commits d'avance sur `origin`, non poussés.** `main` intouché. |
| **Commits** | `2368cc6` → `c2a9dee`, 13 commits |
| **Plan** | `docs/superpowers/plans/2026-09-08-prix-prompt-delai-popup.md` |
| **Spec** | `docs/superpowers/specs/2026-09-08-prix-prompt-delai-popup-design.md` |

## Goal — l'objectif

Déplacer deux réglages mal placés : le prix de référence rejoint le prompt qui
le concerne, et la fourchette de délai anti-ban se choisit dans un pop-up au
lancement d'un lot — au lieu d'être un réglage de compte que l'extension allait
lire dans le DOM de `/compte`.

## Current state — ce qui a été fait

**Les deux déplacements sont livrés.** Le plan de 8 tâches est exécuté, chaque
tâche relue par un agent frais, plus une revue finale de branche. Trois tâches
ont demandé une ronde de correction ; la revue finale en a déclenché une
quatrième, sur huit points.

- `PromptTemplate.prixReference` existe. La table `PrixReference`, sa route
  `/api/prix`, `lib/pickPrix.ts` et `lib/prixServer.ts` ont disparu.
  `pickPrompt()` est désormais la seule cascade — les deux étaient un calque
  littéral l'une de l'autre.
- Le champ « Prix de référence (€) » est dans le formulaire de prompt de
  `/parametres`, à la création **et** à la modification. La fiche article le
  pré-remplit depuis le prompt retenu, sans jamais écraser un prix déjà saisi.
- Un pop-up demande le délai au clic sur « Tout mettre en brouillon sur
  Vinted » **et** sur « Publier sur Vinted » d'une fiche seule. Délai fixe ou
  fourchette, minutes entières, dernier réglage retenu dans le `localStorage`,
  défaut 2–5 min.
- Le délai voyage dans la charge utile de l'événement ; **chaque entrée de file
  porte le sien**. La section « Extension Vinted » de `/compte` et les deux
  colonnes `delaiVinted*` ont disparu, avec toute la lecture du DOM.

**Ce qui n'a PAS été fait, alors qu'on pourrait le croire :**

- **Rien n'a jamais tourné dans un navigateur.** Le pop-up, le champ prix, le
  pré-remplissage, la traversée de l'événement vers l'extension : aucun n'a été
  exécuté une seule fois. `tsc`, `vitest` et `web-ext lint` n'en disent rien.
- **`background.js` et `content-myflip.js` ne sont ni typés ni testés**, et ne
  peuvent pas l'être : `tsconfig.json` n'inclut que `**/*.ts` / `**/*.tsx`, et
  vitest ne collecte que `extension-vinted/**/*.test.js`. Ce sont pourtant les
  deux fichiers qui portent `premier` et `delai` de bout en bout.
- **Le prix d'un vrai brouillon Vinted n'a toujours jamais été vérifié.** Ce
  chantier change la *source* du prix, pas sa frappe : il ne réduit pas ce
  risque et ne l'aggrave pas.

## Decisions — choix critiques ou irréversibles

**La table `PrixReference` était VIDE sur dev — 0 ligne.** La spec §4.2
l'annonçait peuplée et exigeait un report manuel des prix avant la migration.
Vérifié deux fois sur l'endpoint dev `ep-autumn-morning-asmqan0o`, avec 16
prompts et 14 comptes au même instant : ce n'était pas un problème de
connexion. Le relevé daté vit dans
`docs/audits/2026-09-08-prix-reference-avant-migration.md`. **Il n'y a donc rien
à ressaisir.**

**La production n'a jamais eu cette table** — elle n'a appliqué aucune des trois
migrations. Il n'y a rien à y relever et rien à y perdre.

**Le critère du « premier article » de la spec §5.4 était faux, et le plan l'a
remplacé.** La spec proposait « aucune entrée en-cours et aucune entrée avec
`cibleMs` ». Or une entrée réussie est **supprimée** de la base : juste après le
premier succès, la file retombe exactement dans cet état, et tout le lot serait
parti sans délai. Le drapeau `premier` est désormais posé **à la mise en file**,
quand la file est vide, et `prochaineAction` ne fait que le lire.

⚠️ **Conséquence à connaître : publier les articles UN PAR UN, en laissant la
file se vider entre chaque, marque chacun `premier: true` — donc aucun délai
n'est jamais appliqué.** C'est la règle décidée, elle est correcte, mais elle
rend le garde-fou inerte sur ce parcours. Le délai ne joue qu'en lot groupé.

**Une course a été trouvée et corrigée (`056e0fe`), introduite par ce
chantier.** `premier` est une décision *lue puis écrite*, et le handler de mise
en file n'était pas sérialisé. La page n'attend pas l'extension : son
`dispatchEvent` est synchrone et rend la main avant que le content script ait
converti ses photos. Deux articles pouvaient donc se croire tous deux premiers
et ouvrir deux onglets d'un coup. Une seconde chaîne de sérialisation
(`chaineFile`, sur le modèle de `chaineAvancer`) referme la fenêtre.

**Un délai absent ou abîmé ne retombe JAMAIS sur zéro** mais sur 2–5 min
(`DELAI_REPLI`). L'ancien code refusait de planifier, ce qui produisait un
arrêt muet ; un repli prudent le remplace.

**Le commentaire de `migration.sql:15` est faux et le reste.** Il affirme que la
table « est peuplée sur dev ». Prisma enregistre une somme de contrôle des
fichiers de migration appliqués : l'éditer ferait échouer `migrate status` et
`migrate deploy` sur dev. La vérité est portée par le fichier d'audit voisin.
Décision confirmée par la revue finale.

**`scripts/exporter-prix-reference.ts` a été créé puis supprimé** dans le même
chantier : `tsconfig.json` le typait, et il interrogeait un modèle Prisma
disparu. Sa sortie, elle, est committée.

## Changed — fichiers et composants

| Fichier | Nature |
|---|---|
| `prisma/schema.prisma` | `PromptTemplate.prixReference Float?` ; modèle `PrixReference` et colonnes `delaiVinted*` supprimés |
| `prisma/migrations/20260908120000_prix_dans_prompt_delai_par_lot/` | Créé — **écrit à la main**, appliqué sur dev par `migrate deploy` |
| `lib/promptSelect.ts` + test | `prixReferenceDepuisSaisie()` ; **`promptSelect.test.ts` créé** — la cascade n'avait aucun test |
| `lib/pickPrix.ts`, `lib/pickPrix.test.ts`, `lib/prixServer.ts` | **Supprimés** |
| `app/api/prix/**` | **Supprimé** (route + handlers `[id]`) |
| `app/api/prompts/**` | Acceptent et valident `prixReference` |
| `app/api/user/settings/route.ts` | Le bloc de validation du délai disparaît |
| `components/compte/ExtensionVinted.tsx` | **Supprimé**, avec sa section dans `/compte` |
| `app/parametres/page.tsx` | Champ prix dans le formulaire de prompt ; bloc « Prix de référence » retiré |
| `app/mise-en-vente/_delaiVinted.ts` + test | Créé — type, défaut, normalisation, validation. 16 tests |
| `app/mise-en-vente/_components/DialogueDelaiVinted.tsx` | Créé — le pop-up. Aucune logique : il branche le module pur |
| `app/mise-en-vente/_publierVinted.ts` + test | `DetailPublicationVinted.delai` ; `publierVinted()` à 4 arguments |
| `app/mise-en-vente/page.tsx` | Le pop-up s'ouvre avant toute publication ; le délai descend jusqu'à l'événement |
| `app/mise-en-vente/_components/FicheArticle.tsx` | Le pré-remplissage du prix lit le prompt retenu |
| `extension-vinted/file.js` + test | `estPremiereEntree()`, `delaiDeLEntree()`, `DELAI_REPLI` ; `prochaineAction` rend `immediat` |
| `extension-vinted/background.js` | `lireDelaiRegle()` supprimée ; délai lu sur l'entrée ; mise en file sérialisée |
| `extension-vinted/content-myflip.js` | Transmet `delai` ; **toute la lecture du DOM de `/compte` supprimée** (−167 lignes) |
| `extension-vinted/manifest.json` | Permission `storage` retirée ; version `1.1.0` |

## Validations — passants / échoués / non lancés

**Passants**, lancés sur le HEAD de branche :

```
$ npx tsc --noEmit
(aucune sortie, exit 0)

$ npx vitest run
 Test Files  17 passed (17)
      Tests  213 passed (213)

$ cd extension-vinted && npx web-ext lint --self-hosted
errors          0
warnings        2
```

Les 2 avertissements sont ceux de la baseline, documentés dans
`extension-vinted/README.md`. Le total de tests passe de 177 à 213.

**Échoués** : aucun.

**NON LANCÉS — c'est ici qu'il faut regarder en premier :**

- **Toute exécution navigateur.** Voir « Current state ».
- **`npm run build`** — interdit tant qu'un `npm run dev` tourne.
- **Le prix sur un vrai brouillon.**

## Blockers — ce qui bloque

⚠️ **UN DÉFAUT CRITIQUE PRÉEXISTANT, NON CORRIGÉ, QUI FAUSSERA LA LECTURE DU
PREMIER ESSAI.** Documenté sur `main` dans
`docs/audits/2026-09-04-revue-finale-lane-a.md`, découvert en fusionnant.

`Article.prixVente` **n'est jamais enregistré** : `/api/articles/[id]` appelle
`deriveVente()` (`lib/calc.ts`) et écrase `data.prixVente` sans condition, or
`deriveVente()` rend `prixVente: null` pour tout statut différent de « Vendu ».
`enregistrer()` n'envoie jamais que « Brouillon » ou « En vente ». Le prix est
donc systématiquement remis à `null`, la route répond 200, et l'update
optimiste l'affiche quand même à l'écran.

**Conséquence à l'essai** : le brouillon Vinted **recevra** le prix — le
`CustomEvent` lit `f.qcm.prix` en mémoire, pas la base — mais le prix restera
introuvable dans `/stock`. Un prix absent du stock après publication n'est
**pas** une régression de ce chantier.

Ce n'est pas réparable sans une décision produit, posée par l'audit : soit
`prixVente` porte deux sens (prix d'annonce **et** prix de vente) et
`deriveVente` doit cesser de l'effacer, soit le prix d'annonce mérite sa propre
colonne. À trancher avec Aramis, hors de ce chantier.


⚠️ **Pour fusionner dans `main` : appliquer les trois migrations en production
AVANT la fusion, jamais après.** `vercel.json` s'arrête à `prisma generate`.
Fusionner d'abord déploie du code qui interroge `PromptTemplate.prixReference`,
colonne absente en production → `GET /api/prompts` en 500, `/parametres` et le
pré-remplissage de `/mise-en-vente` tombent. **Ça donne une page vide, pas une
erreur.** Les trois migrations en attente s'enchaînent proprement : la table
`PrixReference` y est créée puis détruite, chaque fichier étant atomique.

**La branche n'est pas poussée.** 14 commits d'avance sur `origin/worktree-extension-vinted` — les 13 du chantier, plus cette passation.

**Pour tester : rien ne bloque.** La migration est déjà appliquée sur dev.

⚠️ **Le test se fait en local, pas sur `myflip-app.vercel.app`** — l'URL de
production tourne sur `main`, qui ne contient rien de ce chantier.

1. `npm run dev` depuis la racine du worktree, travailler sur
   `http://localhost:3000`.
2. Charger l'extension : `about:debugging` → « Ce Firefox » → **Charger un
   module temporaire** → `extension-vinted/manifest.json`.
3. Dans `/parametres`, ouvrir un prompt et lui donner un prix de référence.
   **Plus rien à régler dans `/compte`** : la section a disparu.
4. Dans `/mise-en-vente` : un SKU, des photos, marque « Nike », catégorie
   « Sac à dos », une couleur, puis générer.
5. **Lancer un LOT GROUPÉ, pas un article seul** — c'est le seul parcours où le
   délai s'applique (cf. Decisions). Le pop-up s'ouvre : mettre **délai fixe,
   0 minute** pour ne pas attendre.
6. **Ouvrir le brouillon créé dans Vinted et regarder le prix.** C'est le point
   de tout l'essai.

## Next — la prochaine action

**Le premier passage réel dans un navigateur**, selon la marche ci-dessus. Rien
d'autre ne devrait être entrepris avant : douze commits de logique n'ont jamais
vu un DOM.

Ensuite, dans l'ordre : appliquer les migrations en production, puis fusionner.

Le chantier suivant est cadré dans `TODOS.md` : **le voyant « connecté à
Vinted »**. Relevé en comparant MyFlip au concurrent Le Troc Futé, dont la page
« Connexion Vinted » repose — sa propre capture le dit — sur une extension
Firefox et une session Vinted ouverte, exactement comme MyFlip. Il n'y a donc
pas de connexion à construire : il manque un **retour visible**. Aramis a
écarté le 08/09/2026 l'hypothèse d'un fonctionnement navigateur fermé chez le
concurrent ; ne pas rouvrir ce point.

⚠️ **Cette passation n'est pas passée par une relecture indépendante**, contrairement
au reste du chantier : elle a été écrite par le contrôleur en fin de session.

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-09-09 | Le prix dans le prompt, le délai dans un pop-up | Claude Code (Opus 5) | *(passation courante)* |
| 2026-09-08 | Remplissage Vinted livré, prochain chantier cadré | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-08-remplissage-vinted-livre.md) |
| 2026-09-03 | Audit du chantier Vinted, correctifs, rangement de `main` | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-03-audit-chantier-vinted.md) |
| 2026-08-19 | Extension Vinted — 16 tâches implémentées, revue finale restante | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-19-extension-vinted-implementation.md) |
| 2026-08-18 | Extension Vinted, design en cours | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-18-extension-vinted-design.md) |
