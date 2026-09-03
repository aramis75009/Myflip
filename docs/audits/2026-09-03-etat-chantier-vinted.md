# Audit — État réel du chantier Vinted

**Date** : 2026-09-03
**Périmètre** : l'onglet « Mise en vente » et l'extension navigateur. Rien d'autre.
**Nature** : lecture seule. Aucun code modifié.

---

## Avertissement — ce que cet audit a trouvé en premier

La demande initiale supposait qu'il fallait auditer l'existant *avant* de faire
concevoir l'architecture de l'intégration Vinted par une IA séparée.

**Cette architecture existe déjà, est planifiée, et est implémentée à ~90 %.**

Elle n'est simplement visible nulle part depuis `main` :

| Artefact | Où | Taille |
|---|---|---|
| Design | `docs/superpowers/specs/2026-08-18-extension-vinted-design.md` | 902 lignes, passé par une revue `/autoplan` complète (CEO + Eng + Design) |
| Plan d'implémentation | `docs/superpowers/plans/2026-08-18-extension-vinted.md` | 1795 lignes, 16 tâches |
| Code | branche `worktree-extension-vinted` | 22 commits, +4954 lignes |
| Passation | `HANDOFF.md` (non commité sur `main`) | 195 lignes |

Les deux documents `docs/superpowers/` sont **non commités** sur `main`
(`git status` les montre en `??`) alors qu'ils sont **commités** sur la branche
worktree (commit `491664b`). C'est pour ça qu'ils passent inaperçus.

### Risque n°1, avant tout le reste

```
$ git ls-remote --heads origin | grep worktree
(rien)
```

La branche `worktree-extension-vinted` **n'est poussée sur aucun remote**. Elle
existe uniquement dans `.claude/worktrees/extension-vinted/` sur ce Mac. Un
disque perdu = trois semaines de conception et d'implémentation perdues.

C'est l'action la plus urgente de tout ce document, et elle prend dix secondes.

---

## 0. Où vit quoi

```
main (3644616)
 └─ /mise-en-vente : génère des annonces, enregistre en base.
    « Publier sur Vinted » = <a href="vinted.fr/items/new" target="_blank">.
    Rien d'autre. Aucune trace d'extension.

worktree-extension-vinted (70f3b05) — 22 commits devant main, 2 commits derrière
 ├─ MyFlip  : PrixReference, pickPrix, /api/prix, UI /parametres, champ prix au
 │            QCM, prixVente à l'enregistrement, bouton « Publier » réécrit,
 │            réglages de délai anti-ban dans /compte, bouton « copier tout »
 └─ extension-vinted/ : manifest + 5 scripts + tests
```

Emplacement physique du worktree :
`SAAS perso my flip/.claude/worktrees/extension-vinted/`

Les commits couvrent les Tasks 1→9 et 11→16 du plan. **La Task 10 n'a jamais
été faite** — voir §3, risque R1.

`npx vitest run` sur la branche worktree : **14 fichiers, 145 tests, tous
passent** (588 ms). Y compris `extension-vinted/pairing.test.js` (5 tests) et
`app/mise-en-vente/_publierVinted.test.ts` (5 tests).

---

## 1. Cartographie de l'onglet « Mise en vente »

### 1.1 Le parcours

Quatre étapes, pilotées par un reducer pur (`app/mise-en-vente/_reducer.ts`) :

```
  étape 1        étape 2         étape 3          étape 4
  ┌───────┐      ┌───────┐      ┌──────────┐     ┌─────────┐
  │  SKU  │─────▶│ photos│─────▶│  QCM +   │────▶│ export  │
  │lookup │      │ +sélec│      │génération│     │+ statut │
  └───────┘      └───────┘      └──────────┘     └─────────┘
```

De 1 à 5 fiches par session, traitées en parallèle dans l'UI mais **générées en
série**.

### 1.2 La génération d'annonces

**Route** : `app/api/listings/generate/route.ts` — `POST`, `maxDuration = 60`,
`dynamic = "force-dynamic"`. Authentification obligatoire (`getUserId()`), sans
quoi n'importe qui consommait la clé OpenRouter du déploiement.

**Fournisseur** : OpenRouter, appelé en `fetch` brut depuis `lib/openrouter.ts`
(pas de SDK, volontairement). Endpoint
`https://openrouter.ai/api/v1/chat/completions`.

**Modèle** : `UserSettings.modeleIA`, réglable par compte. Défaut si non réglé :
`MODELE_PAR_DEFAUT = "google/gemini-3.6-flash"` (`lib/modelesIA.ts`). Six
modèles proposés au catalogue, tous filtrés sur deux capacités non négociables :
lecture d'image en entrée + sortie JSON structurée.

**Prompt** : table `PromptTemplate` par utilisateur. Sélection par
`pickPrompt()` (`lib/promptSelect.ts`), par précision décroissante :

1. marque + catégorie exactes
2. marque exacte (catégorie « toutes »)
3. catégorie exacte (marque « toutes »)
4. prompt marqué `estDefaut`

Un `promptId` peut aussi être imposé manuellement côté client ; s'il appartient
à un autre compte il est traité comme inexistant et on retombe sur la sélection
auto. Le prompt est ensuite compilé par `compilePrompt()`, qui remplace les
placeholders `{marque} {categorie} {taille} {etat} {matiere} {sku} {details}`.
Prompt de repli en dur : `DEFAULT_PROMPT_CONTENU` dans `lib/promptSelect.ts`.

**Entrées de l'appel** : un seul message utilisateur contenant, dans cet ordre
(l'ordre est documenté comme important) :

1. le texte du prompt compilé — c'est là que passent marque, catégorie, taille,
   état, matière et détails libres ;
2. les photos sélectionnées, en `data:<mime>;base64,…`, compressées côté client
   par `compressForApi()` avant envoi.

Les caractéristiques de l'article ne sont donc **pas** envoyées en champs
structurés : elles sont interpolées dans le texte du prompt.

**Sortie — exhaustive** : le schéma JSON est `strict: true` avec
`additionalProperties: false` et exactement trois champs requis :

| Champ | Type | Contenu |
|---|---|---|
| `titre` | string | titre de l'annonce |
| `description` | string | description rédigée |
| `motsCles` | string | mots-clés séparés par des virgules |

**C'est tout.** L'IA ne produit ni prix, ni taille, ni marque, ni état, ni
catégorie. Tout le reste vient du QCM rempli à la main ou de la fiche article.

**Robustesse** : 3 essais max avec 2 s d'attente sur 429/502/503/504. Erreurs
nommées : 402 « Crédits OpenRouter épuisés », 401/403 « Clé refusée », 404
« Modèle inconnu ». `lireReponse()` gère les fences markdown parasites, les
`\n` doublement échappés, et les erreurs renvoyées en 200 dans le corps.
`reasoning: { max_tokens: 1024 }` conservé de l'implémentation Gemini.

### 1.3 Champs disponibles par article — liste exhaustive

**Saisis à la main (QCM)** — type `Qcm`, `_reducer.ts` :

| Champ | Valeurs | Note |
|---|---|---|
| `marque` | libre ou repris de l'article | vidé si « Mix », « TNF/PAT/COL », « À définir » |
| `categorie` | libre ou repris de l'article | vidé si « Mix », « À définir » |
| `taille` | XS, S, M, L, XL, XXL, 3XL, Unique | `lib/listingOptions.ts`, **obligatoire** |
| `etat` | Neuf avec étiquette, Neuf sans étiquette, Très bon état, Bon état, Satisfaisant | **obligatoire** |
| `matiere` / `matiere2` | 10 suggestions + libre | jointes par « / » pour le prompt |
| `details` | texte libre | ajouté au prompt |
| `prix` | numérique | **branche worktree uniquement**, pré-rempli par `pickPrix()` |

**Produits par l'IA** : `titre`, `description`, `motsCles` (éditables ensuite
dans l'UI).

**Venant de la fiche article en base** (`model Article`) : `sku`, `marque`,
`categorie`, `lot`, `grade`, `statut`, `prixAchat`, `prixVente`, `canal`
(défaut `"Vinted"`), `margeBrute`, `margeNette`, `coefficient`, `dateVente`,
`transporteur`, `trelloCardId`, `titreAnnonce`, `descriptionAnnonce`,
`motsClesAnnonce`.

**Photos** — type `Photo`, `_reducer.ts` :

| Attribut | Détail |
|---|---|
| `blob` | JPEG **jamais dégradé**, plein format. C'est celui destiné à Vinted. |
| `base` | canvas pleine résolution (~48 Mo par photo iPhone), **libéré** au passage à l'étape 3 |
| `url` | object URL pour l'affichage |
| `rotation` | angle appliqué |

Plafonds : `MAX_PHOTOS = 20` par fiche, `MAX_SELECT = 3` envoyées à l'IA,
`MIN_SELECT = 2` requises pour générer.

Point important pour Vinted : `detailPublicationVinted()`
(`_publierVinted.ts`) envoie `f.photos.map(p => p.blob)` — **toutes** les
photos, pas seulement les 2-3 sélectionnées pour l'IA.

### 1.4 Les statuts « Brouillon » / « En vente »

**Modèle** : `Article.statut`, colonne `String @default("En stock")`, indexée.
Pas d'enum en base. La validation vit dans le code : `STATUTS` dans
`lib/calc.ts` — 10 valeurs :

```
Brouillon · En stock · Photos prêtes · En vente · En livraison
À comptabiliser · Vendu · En lavage · Repassé · Perdu
```

**Écriture** : `PATCH /api/articles/[id]`. La route :

- vérifie l'appartenance par `findFirst({ id, userId })` — l'article d'un autre
  compte est indiscernable d'un id inexistant ;
- refuse un statut hors de `STATUTS` (400) ;
- refuse le passage à `Vendu` sans `prixVente` (400) ;
- recalcule les dérivés (`margeBrute`, `margeNette`, `coefficient`,
  `dateVente`) via `deriveVente()`, qui ne calcule les marges que pour `Vendu`.

**Déclenchement côté UI** (`_components/ExportAnnonces.tsx`) — deux niveaux :

- boutons groupés « tout enregistrer en Brouillon / En vente », visibles dès
  2 annonces générées ;
- boutons par fiche « Brouillon » / « Mettre en vente ».

Les deux appellent `enregistrer(ids, statut)` dans `page.tsx:357`, qui boucle
**en série, jamais en parallèle** : `useUpdateArticle` prend un instantané du
cache `["articles"]` entier dans `onMutate` et le restaure dans `onError`, donc
deux enregistrements qui se chevauchent perdent l'update optimiste. Les
invalidations de cache sont différées et faites une seule fois en sortie de
boucle (`differerInvalidation: true`).

Le PATCH envoie : `titreAnnonce`, `descriptionAnnonce`, `motsClesAnnonce`,
`statut`, et — sur la branche worktree — `prixVente`.

### 1.5 Les 5 annonces par lot

**Ce n'est pas une limite technique.** `_reducer.ts` :

```js
/** Plafond de fiches par session. Au-delà, le rail devient illisible et la
 *  file d'attente séquentielle dépasse la patience de qui la regarde. */
export const MAX_FICHES = 5;
```

Contrainte **ergonomique**, assumée en commentaire. Aucun quota d'API, aucun
plafond de coût, aucun batching : `genererFiches()` (`page.tsx:270`) fait une
requête HTTP indépendante par fiche, en série. Le coût est linéaire en nombre
de fiches, pas en nombre de lots.

Les trois autres plafonds de la même zone, tous ergonomiques eux aussi :

| Constante | Valeur | Raison documentée |
|---|---|---|
| `MAX_FICHES` | 5 | lisibilité du rail + patience |
| `MAX_PHOTOS` | 20 | la grille de vignettes déborde au-delà |
| `MAX_SELECT` | 3 | photos envoyées à l'IA |
| `MIN_SELECT` | 2 | minimum pour générer |

Passer de 5 à 10 est un changement d'une constante. Ce qui bougera, ce sont le
temps total (série) et la facture OpenRouter, tous deux linéaires.

### 1.6 Écarts avec le formulaire Vinted

Le formulaire `vinted.fr/items/new` **n'a jamais été inspecté par personne sur
ce projet** — c'est écrit noir sur blanc dans `content-vinted.js`. La colonne
« champ Vinted » ci-dessous est donc une reconstitution d'usage, pas un relevé
du DOM.

| Champ Vinted | Donnée MyFlip | Écart |
|---|---|---|
| Photos | `Photo.blob[]`, jusqu'à 20, pleine qualité | Aucun écart de contenu. Écart de **transport** : les Blobs ne vivent qu'en mémoire du navigateur, jamais uploadés. |
| Titre | `annonce.titre` | Aucun. Longueur max Vinted non vérifiée ; le prompt par défaut vise 80 car., un commentaire du code parle de 100. |
| Description | `annonce.description` | Aucun. `motsCles` est un champ **séparé** côté MyFlip : Vinted n'a pas de champ mots-clés, il faut décider s'ils vont dans la description. Le bouton « copier » de l'UI les concatène déjà (`description\n\nmotsCles\n\nsku`). |
| Catégorie | `Article.categorie` / `qcm.categorie` | **Écart fort.** Texte libre côté MyFlip (« Polo », « Short »). Vinted attend un nœud d'un arbre de catégories fermé, choisi par autocomplete. Aucune table de correspondance n'existe. |
| Marque | `qcm.marque` | **Écart fort.** Texte libre côté MyFlip. Vinted a un référentiel de marques fermé, avec autocomplete. Pas de correspondance. |
| Taille | `qcm.taille` (8 valeurs) | **Écart fort.** Le référentiel Vinted dépend de la catégorie (un short et une paire de chaussures n'ont pas la même grille). « Unique » n'a pas d'équivalent évident. |
| État | `qcm.etat` (5 valeurs) | **Écart probablement faible.** Les 5 libellés MyFlip sont calqués sur ceux de Vinted, mais l'appariement exact n'a pas été vérifié. |
| Prix | `qcm.prix` → `Article.prixVente` | Aucun sur le fond. Format à vérifier (séparateur décimal, devise implicite). |
| Couleur | — | **Absent de MyFlip.** Aucun champ couleur nulle part. |
| Matière | `qcm.matiere` / `matiere2` | Texte libre + 10 suggestions. Vinted a une liste fermée. Écart moyen. |
| Colis / poids | — | **Absent de MyFlip.** Aucune donnée d'expédition côté annonce. |
| Lot / unité | — | Absent. |

Le design existant a déjà tranché ce sujet : l'extension ne remplit **que**
titre, description, prix et photos. Marque, catégorie, taille et état restent
saisis à la main dans l'UI Vinted, précisément parce que ce sont des menus à
autocomplete. Les écarts « forts » ci-dessus sont donc des écarts *assumés*,
pas des trous à combler.

---

## 2. État réel de l'extension

### 2.1 Emplacement et forme

`extension-vinted/` à la racine du projet, sur la branche
`worktree-extension-vinted`. Pas de bundler, pas de TypeScript, pas de
`package.json` propre : du JavaScript ES2022 chargé tel quel. Installation
documentée dans `extension-vinted/README.md` : `npx web-ext sign --channel=unlisted`,
puis installation manuelle du `.xpi` dans Firefox. À refaire à chaque
changement de code.

| Fichier | Lignes | Rôle |
|---|---|---|
| `manifest.json` | 38 | MV3, ciblage Firefox |
| `background.js` | 160 | file IndexedDB, appariement onglet↔article, tirage du délai |
| `content-myflip.js` | 236 | capture l'événement de publication, synchronise les réglages de délai |
| `content-vinted.js` | 282 | badge, compte à rebours, remplissage du formulaire |
| `db.js` | 90 | wrapper IndexedDB (2 stores : `entries`, `pendingEvents`) |
| `pairing.js` | 72 | algorithme d'appariement, fonction pure |
| `pairing.test.js` | 69 | 5 tests, tous passants |

### 2.2 Le flux tel qu'implémenté

```
 /mise-en-vente                    extension                    vinted.fr/items/new
 ──────────────                    ─────────                    ───────────────────
 clic « Publier sur Vinted »
        │
        ▼
 PATCH /api/articles/[id]
 statut = « Brouillon »
        │
   échec ├──────▶ stop. Ni événement, ni onglet.
        │
   succès
        ▼
 CustomEvent
 "myflip:publier-vinted"  ──────▶  content-myflip.js
 { articleId, titre,               runtime.sendMessage
   description, prix,              "myflip:mise-en-file"
   photos: Blob[] }                       │
        │                                 ▼
        │                          background.js
        │                          saveEntry() → IndexedDB
        ▼
 window.open(vinted.fr/items/new)
        │
        └────────────────────────▶ tabs.onCreated
                                   pairEvents() apparie
                                   par openerTabId + ordre causal
                                          │
                                          ▼
                                                        content-vinted.js
                                                        "vinted:qui-suis-je"
                                                              │
                                          tirage du délai ◀────┘
                                          (min/max, aléatoire)
                                                              │
                                                        badge + compte à rebours
                                                              │
                                                        attente
                                                              │
                                                        remplirFormulaire()
                                                        titre, description, prix
                                                        + photos (DataTransfer)
                                                              │
                                                        JAMAIS de clic
                                                        « Enregistrer »
```

### 2.3 Ce qui est solide

- **`pairing.js`** : l'algorithme d'appariement est une fonction pure, testée
  (5 tests). Il apparie par `openerTabId` et par ordre **causal** (un message
  n'est éligible que si son `ts` est strictement antérieur à celui de
  l'événement `tabs.onCreated`). Un onglet orphelin ne décale pas les
  appariements suivants. Deux bugs de conception ont déjà été corrigés ici
  (file FIFO naïve, puis appariement par rang).
- **La garde succès/échec** : `_publierVinted.ts` est une fonction pure testée
  (5 tests) dont l'invariant est explicite — l'événement et l'onglet ne partent
  que si le PATCH a réussi.
- **La persistance MV3** : `pendingEvents` est écrit en IndexedDB *avant* toute
  logique d'appariement, avec purge TTL à 30 min. L'état est reconstructible à
  chaque réveil du worker.
- **Les garde-fous de remplissage** : `devraitRemplirChamp()` refuse d'écrire
  sur un champ non vide. `remplirFormulaire()` ne lève jamais et renvoie un
  statut à trois valeurs (`echec-selecteurs`, `succes-partiel`, `succes`), avec
  une bannière utilisateur distincte pour chacune. Pas de panne silencieuse.
- **Les permissions sont minimales** : `storage`, `tabs`, et trois
  `host_permissions` seulement. Aucun `<all_urls>`.

### 2.4 Ce qui n'est pas vérifié

Rien de tout ce qui suit n'est du code mort. C'est du code **écrit mais jamais
exécuté contre le monde réel** :

- Les sélecteurs Vinted (`[data-testid="title--input"]`, etc.) sont des
  hypothèses. Le commentaire du fichier le dit lui-même.
- Le transport des `Blob` (deux frontières successives, voir R1/R5/R6).
- Le comportement du manifest sous Firefox (voir R2).
- Le remplissage d'un champ React (voir R4).

Aucun test end-to-end n'a été fait. L'extension n'a jamais été signée ni
installée : `web-ext-artifacts/` n'existe pas.

### 2.5 Cible technique : Firefox, avec une incohérence

**Ce qui va dans le sens de Firefox** :

- `browser_specific_settings.gecko` avec un id d'extension et
  `strict_min_version: "115.0"` ;
- l'API est appelée via le namespace `browser.*` partout (`browser.tabs`,
  `browser.runtime`, `browser.storage`) — c'est du Firefox natif. Chrome
  exigerait `chrome.*` ou un polyfill ;
- `browser.runtime.onMessage.addListener(async …)` retourne une promesse :
  c'est le contrat Firefox. Chrome MV3 ignore la promesse et exige
  `return true` ;
- le contournement Xray dans `content-myflip.js` (patch de `history.pushState`
  via un `<script>` injecté) est un problème spécifiquement Firefox, résolu de
  façon spécifiquement Firefox.

**Ce qui ne va pas dans ce sens** : le manifest déclare

```json
"background": { "service_worker": "background.js", "type": "module" }
```

`background.service_worker` est la forme **Chrome** de MV3. Firefox implémente
MV3 avec des *event pages* et attend `"background": { "scripts": ["background.js"] }`
(avec `"type": "module"` pour les modules ES). Voir R2.

### 2.6 Contraintes déjà posées

- **Aucune API MyFlip dédiée à l'extension. Aucun OAuth, aucun token.**
  Invariant de design, motivé techniquement : les photos ne vivent qu'en
  mémoire du navigateur (`Photo.blob`, jamais uploadées), donc elles doivent
  transiter pendant que l'onglet MyFlip est ouvert.
- **L'extension ne parle qu'à deux pages ouvertes** : MyFlip (session NextAuth
  déjà établie) et Vinted (session Vinted déjà établie).
- **Le canal MyFlip → extension est un `CustomEvent` DOM** nommé
  `myflip:publier-vinted`, émis par `window.dispatchEvent`. Sans extension
  installée, l'événement part dans le vide et le bouton se contente d'ouvrir
  l'onglet : aucune dépendance dure.
- **Les réglages de délai transitent par le DOM**, pas par une API : le content
  script lit les `<input id="delai-vinted-min">` / `delai-vinted-max` de
  `/compte` et les copie dans `browser.storage.local`. Conséquence documentée :
  « réglé » veut dire « Aramis a visité `/compte` après son dernier
  changement ».
- **Trois hôtes en dur** dans le manifest : `https://myflip-app.vercel.app/*`,
  `http://localhost:3000/*`, `https://www.vinted.fr/items/new*`.
- **L'extension ne clique jamais sur « Enregistrer »** côté Vinted. Invariant
  anti-ban.

---

## 3. Inconnus et risques techniques

Repérés, pas résolus. Classés par ce qu'ils coûtent s'ils se réalisent.

### R1 — La Task 10 n'a jamais été faite, mais son résultat est affirmé dans le code

`content-myflip.js` porte ce commentaire :

> `// photos: Blob[] — le structured clone de runtime.sendMessage gère les`
> `// Blob nativement sur Firefox (vérifié en Task 10 spike ; ce projet est`
> `// Firefox-only, pas de fallback ArrayBuffer/base64 nécessaire).`

Or la Task 10 du plan est le spike qui devait précisément établir ce fait, et
elle porte la consigne « à faire AVANT d'écrire les Tasks 12-15 ». Aucun commit
ne lui correspond. Ses trois étapes sont non cochées — mais aucune case du plan
ne l'est, donc l'absence de coche ne prouve rien ; l'absence de commit, si.

Le code affirme donc une vérification dont il n'existe aucune trace. Si le
`Blob` ne survit pas au `sendMessage`, tout le chemin photos tombe, et la
correction (conversion `ArrayBuffer` aux deux bouts) touche `content-myflip.js`,
`background.js` et `content-vinted.js`.

### R2 — `background.service_worker` sous Firefox

Le manifest déclare la forme Chrome de MV3. Firefox utilise des event pages.
Si Firefox ignore la clé `service_worker`, `background.js` ne se charge jamais :
aucune entrée n'est mise en file, aucun appariement n'a lieu, et
`content-vinted.js` reçoit une erreur sur son `sendMessage` — qu'il traite en
« état neutre » silencieux (`return` sans bannière). **Panne totale et
silencieuse.**

À vérifier en premier, en chargeant l'extension via `about:debugging`. Coût de
la correction si c'est bien le cas : une clé du manifest.

### R3 — Les sélecteurs Vinted sont des hypothèses

Personne n'a inspecté `vinted.fr/items/new`. Les sélecteurs
(`[data-testid="title--input"]`, `input[name="title"]`,
`[data-testid="price-input--input"]`, `input[type="file"]`) sont plausibles mais
non relevés.

Cas dégradé prévu (bannière « l'extension a besoin d'une mise à jour »), donc
pas de panne silencieuse ici — mais tant que le DOM n'est pas relevé, la
probabilité que ça marche du premier coup est faible. Le `input[type="file"]`
est particulièrement exposé : `querySelector` prend le **premier** de la page,
sans garantie que ce soit celui des photos.

### R4 — Écrire `el.value` sur un champ React

`remplirChamp()` fait :

```js
el.value = valeur;
el.dispatchEvent(new Event("input", { bubbles: true }));
```

Vinted est une application React. React installe un *value tracker* sur les
inputs contrôlés : une affectation directe de `.value` modifie le DOM sans que
React s'en aperçoive, et l'événement `input` synthétique est alors ignoré parce
que la valeur suivie n'a pas « changé ». Résultat courant : le champ se remplit
visuellement puis se vide au premier re-render, ou l'état React reste vide et
la soumission part sans le champ.

Le contournement standard passe par le setter natif du prototype
(`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set`).
Il n'est pas utilisé ici. À vérifier sur le vrai formulaire.

C'est le risque le plus insidieux du lot : il produit un remplissage qui a
l'air de marcher, et `remplirFormulaire()` renvoie `"succes"` — donc l'entrée
est consommée et supprimée de la file.

### R5 — Le `Blob` à travers la frontière page ↔ content script

`_publierVinted.ts` construit le `CustomEvent` dans le contexte de la **page**,
avec des `Blob` dans `detail`. `content-myflip.js` l'écoute depuis le **monde
isolé** du content script. Firefox applique la Xray vision à cette frontière.

Le fichier connaît le problème — il l'a résolu explicitement pour
`history.pushState` — mais ne le traite pas pour `e.detail`. La lecture d'un
objet simple à travers un Xray fonctionne en général ; les `Blob` imbriqués
sont moins certains. Jamais testé.

C'est une frontière **distincte** de celle du R1. Il y en a deux à valider, pas
une :

```
page MyFlip ──[CustomEvent.detail]──▶ content script ──[sendMessage]──▶ worker
                    R5                                      R1/R6
```

### R6 — Le `Blob` à travers `runtime.sendMessage`

L'objet du spike jamais fait. Le passage `content script → service worker` est
sérialisé ; selon les versions et les chemins inter-processus, un `Blob` peut
arriver en objet vide. Jusqu'à 20 photos pleine résolution transitent par ce
canal, ce qui ajoute une question de volume que rien n'a mesurée.

### R7 — 22 commits sur un seul disque

Déjà dit en tête. `worktree-extension-vinted` n'est poussée nulle part, et le
worktree vit sous `.claude/worktrees/` — un dossier qu'un nettoyage d'outillage
peut raisonnablement supprimer.

### R8 — Le délai anti-ban transite par le DOM de `/compte`

Trois conséquences, toutes documentées dans le code mais aucune visible pour
l'utilisateur :

- si `/compte` n'a jamais été visité depuis l'installation, aucun délai n'est
  en `storage.local` : le remplissage est bloqué et une bannière s'affiche —
  comportement correct, mais l'utilisateur ne devinera pas pourquoi ;
- si la fourchette est modifiée depuis un autre appareil, le storage local reste
  périmé jusqu'à la prochaine visite de `/compte` ;
- la copie dépend de deux `MutationObserver` (apparition des champs, transition
  `disabled → activé`) avec un timeout de 20 s. Un chargement lent au-delà de
  20 s laisse le storage inchangé, en silence.

### R9 — « succès partiel » ne consomme pas l'entrée

Quand le texte est rempli mais pas les photos, `content-vinted.js` n'envoie pas
`vinted:entree-consommee`. L'entrée reste en file, avec son `tabId`, jusqu'à la
purge TTL de 30 min. Un rechargement retente (et n'écrase pas le texte grâce au
garde-fou). Comportement volontaire et documenté, mais il faut le savoir :
l'article n'est pas « fait » du point de vue de l'extension.

### R10 — Le poids du message

Jusqu'à 20 `Blob` pleine résolution par article, multipliés par le nombre
d'articles en file. Rien n'a mesuré ce que ça coûte en mémoire du service
worker ni en taille de base IndexedDB. Aucun plafond n'est posé côté extension.

### R11 — Le référentiel de prix est un modèle neuf, non éprouvé

`PrixReference` (marque, catégorie, prix, estDefaut) et `pickPrix()` sont un
calque exact de `PromptTemplate` / `pickPrompt()`. La logique est testée
(6 tests) mais la table est vide tant qu'elle n'est pas peuplée à la main dans
`/parametres` : sans entrée, `pickPrix()` renvoie `null` et le champ prix du
QCM reste vide, donc le prix envoyé à Vinted est la chaîne vide.

---

## 4. Ce que l'existant fait pour le mode hybride

Non demandé de le concevoir. Relevé de ce qui aide et de ce qui gêne.

**Ce qui aide, et beaucoup** :

- L'invariant « jamais de clic sur Enregistrer » **est** déjà le mode par
  défaut voulu. Il ne reste rien à faire pour obtenir le comportement
  « pré-remplir, je valide ».
- `devraitRemplirChamp()` protège déjà toute saisie manuelle en cours : le mode
  hybride n'écrasera jamais ce qui a été tapé à la main.
- Les trois statuts de retour de `remplirFormulaire()` donnent déjà les points
  d'accroche d'une UI de confiance (rempli / partiellement rempli / rien).
- Le délai aléatoire par entrée, persisté en IndexedDB, existe déjà.

**Ce qui gêne** :

- **Aucun drapeau par article ni par lot nulle part.** Ni `Article`, ni
  l'entrée IndexedDB, ni `UserSettings` ne portent quoi que ce soit qui
  ressemble à « celui-là, tu peux publier tout seul ». Un auto-publish « au cas
  par cas » demanderait un champ nouveau, transporté à travers les trois
  frontières du flux (page → content script → worker → content script Vinted).
- **Les réglages existants sont globaux au compte**, pas par lot. `TODOS.md`
  mentionne déjà une bascule « mode test » (P2), mais elle est globale elle
  aussi.
- **Le mode auto ferait cliquer un bouton dont les sélecteurs ne sont pas
  connus** (R3). Tant que le DOM Vinted n'est pas relevé, un auto-publish n'a
  pas de cible.
- **R4 est bloquant pour l'auto-publish.** En mode hybride manuel, un champ mal
  rempli se voit et se corrige. En auto-publish, il part tel quel.

---

## 5. Ce qui reste avant de pouvoir s'en servir

Par ordre, tel que l'audit le voit :

1. **Pousser `worktree-extension-vinted` sur `origin`.** Dix secondes. (R7)
2. **Faire la Task 10** — le spike `Blob`, aux deux frontières (R1, R5, R6).
3. **Charger l'extension dans Firefox via `about:debugging`** et regarder si
   `background.js` démarre (R2).
4. **Relever le DOM réel de `vinted.fr/items/new`** : sélecteurs des trois
   champs, de l'input fichier, et vérifier le comportement React d'un
   remplissage programmatique (R3, R4).
5. Signer l'extension (`web-ext sign`) et l'installer pour de vrai.
6. Un passage bout-en-bout sur un article réel.
7. Décider quoi faire de la branche : merge dans `main`, ou rebase d'abord
   (elle est 2 commits derrière).

Rien de tout cela n'est de la conception. Tout est de la vérification.

---

## Annexe — commandes de vérification

```bash
cd "SAAS perso my flip"

# Le chantier
git log --oneline main..worktree-extension-vinted
git diff main...worktree-extension-vinted --stat

# La branche est-elle sauvegardée ?
git ls-remote --heads origin | grep worktree

# Les tests
cd .claude/worktrees/extension-vinted && npx vitest run
```
