<!-- /autoplan restore point: /Users/ams/.gstack/projects/aramis75009-compta-polos/main-autoplan-restore-20260818-193019.md -->
# Extension Firefox de pré-remplissage Vinted — design

**Date** : 18/08/2026
**État** : validé par Aramis — revue `/autoplan` (CEO + Design + Eng) complète, 14 décisions actées, prêt pour `writing-plans`

## Le problème

Aramis publie ses annonces générées par `/mise-en-vente` à la main sur Vinted :
copier le titre, la description, le prix, puis re-uploader chaque photo — pour
~150 articles. Le copier-coller est le goulot, pas la génération d'annonce
elle-même.

Automatiser à l'aveugle est disqualifié d'entrée : un enchaînement
programmatique de créations de brouillon est exactement le pattern qu'un
système anti-fraude Vinted repère, et un ban vend son fonds de commerce.
Chaque décision de ce design se lit d'abord contre ce risque.

## L'objectif

Un clic sur « Publier sur Vinted » dans MyFlip enregistre l'article en
brouillon **et** transmet titre/description/prix/photos à une extension
Firefox. En arrivant sur l'onglet Vinted ouvert dans la foulée, un délai
aléatoire s'écoule puis les champs texte se remplissent seuls — jamais les
menus à sélection (marque, catégorie, taille, état), jamais le clic final.
Aramis reste le seul geste humain qui publie réellement l'annonce.

## Portée et invariants (anti-ban, non négociables)

- **Firefox uniquement** — c'est le navigateur qu'utilise Aramis sur Vinted, pas de portage Chrome en V1.
- **Champs texte/nombre + photos seulement.** Marque, catégorie, taille, état restent saisis à la main : ce sont des menus à recherche/autocomplete, plus fragiles à automatiser et plus proches d'un pattern détectable, pour un gain de temps marginal vu leur nombre.
- **Aucun clic automatique sur « Enregistrer en brouillon ».** Toujours un geste humain final. Conséquence acceptée : rien ne garantit que les champs obligatoires soient tous remplis avant ce clic — ce n'est pas un problème, Aramis termine et valide.
- **Le risque réel, précisé (vérifié le 18/08/2026).** Les recherches publiques 2026 sur les sanctions Vinted montrent que la détection active cible surtout la **republication/rotation d'annonces existantes** (une pratique différente de la création d'un nouveau brouillon), avec pour pire cas documenté un **gel temporaire de 24h** (boutons « modifier »/« mettre en vente » désactivés), pas une suspension définitive. Ça ne change aucune décision ci-dessous — les garde-fous restent une prudence raisonnable pour un mécanisme encore neuf — mais ça recalibre l'enjeu : ce n'est pas la perte du compte qui est en jeu dans le pire cas connu, c'est une gêne temporaire.
- **Rythme semi-auto, un onglet à la fois.** L'ouverture d'un onglet Vinted reste déclenchée par un clic humain dans MyFlip, jamais par l'extension elle-même. Choisi explicitement contre un mode automatique en rafale.
- **Délai aléatoire avant remplissage, tiré indépendamment par onglet**, dans une fourchette (min/max en minutes) réglée par Aramis dans `/compte` — pas de valeur imposée par défaut.
- **Pas d'API serveur MyFlip pour l'extension, pas d'OAuth, pas de token.** L'extension ne parle qu'aux deux onglets ouverts dans le navigateur (MyFlip via sa session NextAuth, Vinted via la sienne). Raison technique impérative : les photos ne vivent qu'en `Blob` en mémoire du navigateur pendant la session `/mise-en-vente` (`app/mise-en-vente/_reducer.ts`, type `Photo`), jamais uploadées sur un serveur — elles doivent donc être transmises pendant que l'onglet MyFlip est encore ouvert.
- **Sans extension installée, rien ne change** : le bouton « Publier sur Vinted » garde son comportement actuel de lien simple. Aucune dépendance dure.

## Le flux en 7 étapes

1. **QCM** — Aramis remplit `/mise-en-vente` (marque, catégorie, taille, état, matière, détails) + un nouveau champ **prix suggéré**, pré-rempli par `pickPrix()` à partir du nouveau modèle `PrixReference` (marque × catégorie), modifiable avant génération.
2. **Génération IA** — titre/description via OpenRouter, inchangé.
3. **Clic « Publier sur Vinted »** (`ExportAnnonces.tsx:204`) déclenche en séquence :
   - **(a)** PATCH `/api/articles/[id]` → statut `Brouillon` + `prixVente` (le champ existe déjà côté API, cf. Architecture ci-dessous) ;
   - **(b)** si et seulement si (a) réussit : le content script MyFlip capture titre/description/prix/photos (`Blob`) et envoie un message de mise en file au service worker de l'extension.
4. **Ouverture d'onglet, gatée sur le succès du PATCH** (correction Eng, voir ci-dessous) — le clic n'ouvre plus l'onglet directement via `target="_blank"` : il déclenche `preventDefault()` + le PATCH (3a), et **seulement en cas de succès** un `window.open()` explicite vers `vinted.fr/items/new`. **Le service worker associe cet onglet précis à cette entrée précise dès sa création** (`browser.tabs.onCreated`, apparié par ordre d'arrivée à l'entrée mise en file par le même onglet MyFlip via `openerTabId`) — voir « Correction Eng » ci-dessous : ce n'est plus une file consommée au hasard par le premier onglet Vinted qui charge, et il ne peut plus y avoir d'onglet ouvert sans entrée correspondante.
5. **Lecture du délai** — le content script sur `vinted.fr/items/new*` récupère l'entrée assignée à SON `tabId` (pas la tête d'une file générique) et **lit** l'heure cible déjà tirée et persistée par le service worker (le tirage lui-même a lieu côté service worker, pas dans le content script — une seule source de vérité, voir Correction Eng), affiche un badge de compte à rebours **avec une miniature + le début du titre de l'article assigné**, pour qu'Aramis puisse vérifier visuellement avant que le remplissage ne commence.
6. **Remplissage** — délai écoulé : champs texte/nombre remplis via de vrais événements `input`/`change`, photos injectées via `DataTransfer` sur l'input fichier. Un champ déjà saisi à la main n'est jamais écrasé.
7. **Validation humaine** — marque, catégorie, taille, état restent à saisir à la main ; aucun clic automatique sur « Enregistrer » ; Aramis termine et publie lui-même.

## Architecture

### Côté MyFlip (`app/mise-en-vente/`)

| Fichier | Changement |
|---|---|
| `_reducer.ts` | Ajouter un champ `prix: string` au type `Qcm` (`_reducer.ts:76-86`, actuellement marque/categorie/taille/etat/matiere/matiere2/details, pas de prix), **affiché en dernier dans le QCM** (après « details ») pour ne pas rejouer l'ordre des champs existants. Rendu en JetBrains Mono (convention Direction C pour les montants), pas Space Grotesk. |
| `page.tsx`, fonction `enregistrer()` (`page.tsx:349`) | Ajouter `prixVente: Number(f.qcm.prix)` au PATCH envoyé — **la route accepte déjà ce champ**, voir ci-dessous. |
| `_components/ExportAnnonces.tsx`, bouton « Publier sur Vinted » (`:204`, aujourd'hui un `<a>` simple `target="_blank"`) | **`onClick` avec `preventDefault()`** (correction Eng — un `<a target="_blank">` ouvrirait l'onglet immédiatement au clic, indépendamment du succès du PATCH asynchrone, ce qui créerait un onglet Vinted orphelin sans entrée de file correspondante en cas d'échec) : déclenche l'enregistrement (a), et **seulement en cas de succès**, poste l'événement `CustomEvent` (b) puis ouvre l'onglet via `window.open()`. Bouton désactivé pendant `enregistrementEnCours` comme ses voisins (`:186`, `:193`) — décision #10. |
| Nouveau : `lib/pickPrix.ts` | Calqué sur `pickPrompt()` (`lib/promptSelect.ts:24`) : correspondance par précision décroissante marque+catégorie exactes → marque seule → catégorie seule → défaut. |
| Nouveau : modèle Prisma `PrixReference` | Voir Modèle de données. |
| Nouveau : `/api/prix`, `/api/prix/[id]` | **Trouvé manquant en revue Eng** : rien dans la conception initiale ne permettait à Aramis de créer/éditer une entrée `PrixReference` — sans ça, `pickPrix()` n'a jamais de donnée à lire. CRUD calqué exactement sur `/api/prompts`, `/api/prompts/[id]` (`app/api/prompts/route.ts`) : même normalisation de critère (`""`/`"Toutes"` → `null`), mêmes garde-fous. |
| `app/parametres/page.tsx` | Nouvelle section de gestion des `PrixReference` (liste + modale d'édition), sur le même modèle que la section prompts déjà présente sur cette page (`openEdit`, `:187`) — c'est déjà la page où Aramis gère ce type de données de référence, pas une nouvelle page. |
| `UserSettings` | Deux champs numériques nullable, délai min/max en minutes, éditables dans un nouveau bloc **« Extension Vinted »** de `/compte`, séparé du bloc Intégrations existant (`components/compte/Integrations.tsx`) — sujet différent, ne pas mélanger. Cibles tactiles 44px comme le reste de `/compte` (cette page reste mobile-responsive, contrairement à `/mise-en-vente`). |

**Ce qui existe déjà et ne bouge pas** : `PATCH /api/articles/[id]` (`app/api/articles/[id]/route.ts:16`) accepte déjà `prixVente?: number | null` dans son `PatchBody`, le valide (`:90-95`) et le fait transiter par `deriveVente()` (`lib/calc.ts:274`) — qui ne recalcule les marges qu'au statut `Vendu`, donc un `prixVente` posé au statut `Brouillon` est stocké tel quel, sans effet de bord sur la comptabilité. **Aucun changement d'API n'est nécessaire** : seul l'appelant (`enregistrer()`) doit désormais envoyer ce champ, ce qui corrige une hypothèse de la session de brainstorming précédente qui prévoyait, à tort, d'étendre la route.

### Modèle de données

```prisma
model PrixReference {
  id        String   @id @default(cuid())
  marque    String?  // null = toutes les marques
  categorie String?  // null = toutes les catégories
  prix      Float
  estDefaut Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, estDefaut])
  @@index([marque])
  @@index([categorie])
}
```

Structure et index identiques à `PromptTemplate` (`prisma/schema.prisma:247`), pour la même raison : `estDefaut` est un singleton par utilisateur, pas global. `pickPrix()` reproduit exactement la logique de `pickPrompt()` (`lib/promptSelect.ts:24-48`) : marque+catégorie exactes → marque seule → catégorie seule → défaut → `null`.

Exemples donnés par Aramis : Pull/Polo Tommy Hilfiger → 22 €, Pull Ralph Lauren → 24 €.

### Extension Firefox (nouveau sous-dossier `extension-vinted/` à la racine de MyFlip)

**Firefox desktop uniquement** — le manifest doit explicitement exclure `android` (`browser_specific_settings.gecko_android`), Firefox pour Android supportant certaines extensions et ce n'est pas la cible.

**Manifest V3.** Conséquence directe sur l'architecture : pas de `background` persistant, un service worker qui peut être tué et réveillé par Firefox à tout moment. Toute la file d'attente **et** l'état des minuteurs en cours doivent donc être entièrement reconstructibles depuis IndexedDB à chaque réveil — rien ne doit vivre uniquement en mémoire du service worker au-delà d'un seul tick d'exécution.

Trois composants :

1. **Content script sur MyFlip** (`*/mise-en-vente*`) — écoute l'événement `CustomEvent` du clic « Publier », lit titre/description/prix/`Blob`s photos depuis le DOM/état de la page, envoie un message de mise en file au service worker (horodaté, associé au `tabId` de l'onglet MyFlip lui-même via `sender.tab.id`).
2. **Service worker** — stocke chaque entrée en IndexedDB (les `Blob` ne tiennent pas dans `storage.local`), **non consommée par ordre FIFO générique** (cf. Correction Eng ci-dessous) mais associée dès la création du nouvel onglet Vinted à l'entrée correspondante, via `browser.tabs.onCreated` apparié par `openerTabId` = le `tabId` MyFlip qui a émis le message, dans l'ordre d'arrivée. À chaque réveil : relit les paires onglet↔entrée en attente, pour toute entrée sans minuteur actif tire un délai aléatoire indépendant dans la fourchette réglée par Aramis et persiste l'heure cible en IndexedDB (pas juste un `setTimeout` en mémoire, qui ne survit pas à un redémarrage du worker). **Si aucun délai min/max n'est encore réglé dans `/compte`** (cas du tout premier usage, les deux champs `UserSettings` sont nullable sans défaut) : ne tire aucun délai, ne remplit rien — le content script Vinted affiche directement une bannière « réglez le délai anti-ban dans /compte avant de publier automatiquement ». Un délai de 0 par défaut annulerait le garde-fou anti-ban que tout le reste du design construit.
3. **Content script sur Vinted** (`vinted.fr/items/new*`) — au chargement, s'identifie par son propre `tabId` et récupère **l'entrée qui lui a été assignée** (pas la tête d'une file générique — cf. Correction Eng), affiche un badge de compte à rebours **avec miniature + début du titre de l'article assigné** jusqu'à l'heure cible persistée, puis remplit les champs texte/nombre (`input`/`change` réels) et les photos (`DataTransfer`) — en vérifiant avant chaque écriture qu'Aramis n'a pas déjà saisi le champ à la main. Ne clique jamais sur « Enregistrer ». Retire l'entrée une fois consommée. **Aucune entrée assignée à ce `tabId`** (trouvé en revue Eng — le content script tourne sur *toute* création d'annonce Vinted, y compris manuelle, sans lien avec MyFlip) → état neutre, rien ne s'affiche, ni badge ni bannière. **Traitement visuel du badge** (revue Design) : minimal, ancré dans un coin de l'écran, texte de compte à rebours brut (jamais une couleur seule) + un petit repère dans l'accent MyFlip pour la reconnaissance — volontairement **hors Direction C** et sans dépendance au CSS de l'app. Isolation technique requise (précision Eng) : rendu dans un **Shadow DOM** avec `z-index` élevé, pour ne pas hériter des styles de Vinted ni en être cassé par un reflow de sa page.

### Correction Eng — pourquoi pas une simple file FIFO

Trouvé en revue `/autoplan` (design indépendant) : une file FIFO générique
« le premier onglet Vinted qui charge consomme la tête de file » a une
**race condition réelle**. Si Aramis enchaîne 5-10 clics « Publier » (le
scénario Heure 4-5 explicitement identifié comme le plus exigeant, cf. revue
CEO 0E) puis ouvre/visite ses onglets Vinted dans un ordre différent de
l'ordre de création (bascule entre onglets déjà ouverts, pas forcément
gauche-à-droite), rien ne garantit que l'onglet A reçoive bien l'article
destiné à l'onglet A — le mauvais titre/prix/photos pourrait atterrir sur le
mauvais brouillon, sans signal.

**Fix retenu** : l'association onglet↔article se fait **à la création de
l'onglet**, pas à la consommation. Le `window.open()` déclenché après succès
du PATCH (voir plus haut) provoque un événement `browser.tabs.onCreated`
quasi immédiat, avec `openerTabId` pointant exactement vers l'onglet MyFlip
qui l'a ouvert. Comme Aramis ne peut pas cliquer deux fois à la même
milliseconde, apparier dans l'ordre d'arrivée les événements `onCreated`
(filtrés par `openerTabId` = onglet MyFlip) aux messages de mise en file
(mêmes `openerTabId`, même ordre) donne un appariement déterministe
onglet↔article — bien plus robuste qu'une file consommée par le premier
arrivé. Le badge affichant l'identité de l'article (miniature + titre) reste
une seconde ligne de défense visuelle, pas le seul garde-fou.

**Trouvé en second passage (revue Eng, sur cette correction elle-même)** :
si le PATCH avait encore été suivi d'un `<a target="_blank">` classique,
l'onglet se serait ouvert **au clic**, avant la résolution du PATCH
asynchrone et indépendamment de son résultat — un PATCH en échec aurait quand
même produit un onglet, donc un événement `tabs.onCreated` orphelin sans
message de mise en file correspondant, ce qui aurait décalé l'appariement de
tous les onglets suivants ouverts depuis le même onglet MyFlip dans la
session : exactement la race condition que cette correction visait à
éliminer, réintroduite silencieusement par le mécanisme d'ouverture
lui-même. **C'est pour ça que l'étape 4 gate désormais l'ouverture d'onglet
sur le succès du PATCH** (`preventDefault()` + `window.open()` manuel après
coup, jamais un `<a target="_blank">` direct) : aucun onglet ne peut plus
exister sans une entrée de file qui lui correspond, l'appariement par ordre
d'arrivée reste donc valide par construction.

**À vérifier avant l'implémentation (spike ~10 min, revue Eng)** : la chaîne
de transport des `Blob` photos — `runtime.sendMessage` (content script MyFlip
→ service worker) puis IndexedDB puis `DataTransfer` (service worker/content
script → input Vinted) — est supposée fonctionner par structured clone, mais
n'a pas été vérifiée sur ce repo. Si le clone d'un `Blob` casse à l'étape
`sendMessage`, c'est une conversion ArrayBuffer/base64 à ajouter, pas un
simple correctif — à découvrir avant l'implémentation, pas pendant.

Permissions limitées aux deux domaines (`mise-en-vente` de MyFlip + `vinted.fr/items/new*`) — aucune permission large (`<all_urls>`, `tabs`, etc.) au-delà de ce qui est strictement nécessaire à ces deux content scripts et au messaging service worker ↔ content script.

**Signature et installation (vérifié le 18/08/2026).** Firefox exige qu'une extension soit signée par Mozilla pour rester installée durablement, **même en usage strictement privé** — non négociable sur Firefox stable, il n'y a pas de mode « développeur » permanent hors Firefox Developer Edition/Nightly/ESR. Le chemin retenu : distribution **auto-hébergée non répertoriée** (« self-distributed, unlisted ») — un compte développeur Mozilla gratuit, puis `web-ext sign` (ou l'API AMO) pour obtenir un `.xpi` signé après chaque build, installé via *Modules complémentaires → Installer un module depuis un fichier*. La validation automatique de Mozilla est rapide pour une extension aux permissions restreintes comme celle-ci (pas de code distant, deux domaines seulement). Cette étape doit être budgétée dans le plan d'implémentation — elle n'existait pas dans la conception initiale.

## Gestion des erreurs et cas limites

- **PATCH `/api/articles/[id]` échoue** (étape 3a) → rien n'est empilé dans la file (3b n'a pas lieu) : jamais de brouillon Vinted désynchronisé du stock MyFlip. Le comportement d'échec actuel de `enregistrer()` (`page.tsx:365-372`, toast d'erreur) est inchangé.
- **Plusieurs clics « Publier » avant d'aller sur Vinted** (« faire 10 articles vite, puis remplir les onglets ») → supporté nativement par la file FIFO : chaque entrée attend son tour, aucune n'écrase la précédente.
- **Onglet Vinted fermé puis rouvert avant la fin du délai** → le content script relit l'heure cible depuis IndexedDB au chargement, le compte à rebours reprend là où il en était, pas de nouveau tirage.
- **Champ déjà rempli à la main par Aramis** → jamais écrasé ; le remplissage automatique ne touche que les champs vides au moment de l'écriture.
- **Extension non installée ou désactivée** → le bouton garde son comportement actuel de lien simple ; aucun code de `ExportAnnonces.tsx` ne suppose la présence de l'extension pour fonctionner.
- **`PrixReference` sans correspondance** → `pickPrix()` renvoie `null` comme `pickPrompt()`, le champ prix du QCM reste vide et éditable à la main, aucun blocage de la génération.
- **Vinted a changé son DOM, un sélecteur attendu est introuvable** (trouvé en revue CEO, absent de la conception initiale) → échec **visible**, jamais silencieux : le content script affiche une bannière « l'extension a besoin d'une mise à jour — continue à la main pour cet article, la mise à jour n'est pas automatique » sur l'onglet Vinted concerné plutôt que de ne rien faire. Le texte dit explicitement à Aramis quoi faire ensuite (continuer manuellement) plutôt que de le laisser deviner s'il doit attendre. C'est le seul mode de panne qui, laissé silencieux, ferait perdre confiance dans l'outil sans qu'Aramis comprenne pourquoi.
- **Délai anti-ban jamais configuré** (trouvé en revue Design, contradiction dans la conception initiale — « pas de valeur par défaut » ne veut pas dire « vide accepté ») → l'extension ne remplit rien et affiche « réglez le délai anti-ban dans /compte avant de publier automatiquement » plutôt que de retomber sur un délai de 0 qui annulerait le garde-fou anti-ban.

## Hors scope (V1)

- Portage Chrome de l'extension.
- Remplissage des menus à sélection (marque, catégorie, taille, état).
- Clic automatique sur « Enregistrer en brouillon » ou publication automatique.
- Un mode « rafale » sans intervention humaine entre deux onglets.
- API serveur ou OAuth dédiés à l'extension.

## Revue `/autoplan` — Phase Eng

### Step 0 — Défi de portée

Réutilise l'audit déjà fait en revue CEO (0B/0D) : 9 fichiers MyFlip + 3
composants extension, seuil mécanique dépassé, décision #3 (PrixReference)
déjà surfacée en goût pour le gate final. **Une pièce manquante trouvée ici**
(décision #9) : `/api/prix` + UI `/parametres`, sans quoi `PrixReference`
n'a aucun moyen d'être peuplé — corrigé dans le corps du spec, pas une
préférence, un trou de fonctionnement.

**Vérification (recherche)** : le pattern `browser.tabs.onCreated` +
`openerTabId` pour associer un onglet à son origine est l'API standard
WebExtensions (Chrome et Firefox), pas une invention custom — aucune
alternative « built-in » plus simple n'existe pour ce besoin précis
(assigner une donnée à un onglet pas-encore-créé au moment de la décision).
`[Layer 1]`.

### Section 1 — Architecture

Diagramme déjà produit en revue CEO (Section 1) et affiné en revue Design
(Correction Eng, appariement `tabs.onCreated`). Point supplémentaire trouvé
ici : le bouton « Publier sur Vinted » (`ExportAnnonces.tsx:204`) est
aujourd'hui un `<a>` simple sans état `disabled` — les deux autres boutons du
même bloc (`:186`, `:193`) ont `disabled={enregistrementEnCours}`. En lui
ajoutant un `onClick` qui déclenche un PATCH, il a besoin de la **même
protection contre le double-clic** que ses voisins, sinon un double-clic
rapide déclenche deux PATCH et potentiellement deux mises en file pour le
même article. **Corrigé** : le bouton doit lire le même état
`enregistrementEnCours` que les boutons Brouillon/Mettre en vente.

### Section 2 — Qualité de code

`pickPrompt()` (`lib/promptSelect.ts:24-48`), le modèle exact de `pickPrix()`,
**n'a lui-même aucun fichier de test** (absent de la liste des fichiers
`*.test.ts` du repo). Calquer le code sans calquer cette lacune : `pickPrix()`
doit avoir son propre `lib/pickPrix.test.ts` dès sa création, pas différé.
Le reste (organisation, nommage) suit directement le fichier copié — pas
d'autre écart trouvé.

### Section 3 — Tests

Framework détecté : **Vitest** (`package.json` script `test`), 11 fichiers
`*.test.ts` existants dans le repo, aucune infrastructure de test pour les
WebExtensions (première extension du repo — attendu, pas un gap à combler
maintenant).

```
CHEMINS DE CODE (MyFlip)                              PARCOURS UTILISATEUR
[+] lib/pickPrix.ts (nouveau)                         [+] Publier un article
  └── pickPrix()                                        ├── [GAP] Brouillon enregistré + mis en file
      ├── [GAP] marque+catégorie exactes                ├── [GAP][CRITIQUE] PATCH échoue → RIEN n'est
      ├── [GAP] marque seule                             │   mis en file (invariant du design)
      ├── [GAP] catégorie seule                          ├── [GAP] Double-clic sur "Publier" → un seul
      ├── [GAP] défaut                                   │   PATCH, une seule mise en file
      └── [GAP] aucune correspondance → null            └── [GAP] Extension absente → lien simple inchangé
[+] app/api/prix/route.ts (nouveau)                   [+] Session à plusieurs articles
  ├── [GAP] GET liste                                    ├── [GAP][→E2E] 10 clics Publier, ouverture des
  └── [GAP] POST création                                │   onglets Vinted DANS LE DÉSORDRE → chaque
[+] app/api/prix/[id]/route.ts (nouveau)                 │   onglet reçoit le bon article (test direct
  ├── [GAP] PATCH édition                                │   de la Correction Eng, tabs.onCreated)
  └── [GAP] DELETE                                       └── [GAP] Onglet fermé/rouvert avant fin du
[+] _reducer.ts — Qcm.prix                                   délai → reprend l'heure cible persistée
  └── [★★  TESTÉ] cas générique déjà couvert par        [+] Garde-fous anti-ban
      _reducer.test.ts (action "qcm" générique)           ├── [GAP] Aucun délai réglé → bannière, 0 fill
[+] page.tsx — enregistrer()                              ├── [GAP] Champ déjà rempli à la main → jamais
  └── [GAP] le corps du PATCH inclut bien prixVente           écrasé
[+] ExportAnnonces.tsx — onClick "Publier"               └── [GAP] Sélecteur DOM introuvable → bannière
  ├── [GAP][CRITIQUE] événement de mise en file              "mise à jour nécessaire", pas de fill
  │   émis SEULEMENT si le PATCH réussit                [+] Erreurs partielles
  └── [GAP] bouton désactivé pendant enregistrementEnCours   └── [GAP] Photos échouent, texte réussit →
                                                              texte rempli + bannière (pas un succès net)
CHEMINS DE CODE (Extension — pas de harnais de test WebExtension, logique
pure testable en Vitest isolément de l'API browser.*) :
[+] Appariement onglet↔article (service worker)
  ├── [GAP] Deux mises en file rapprochées → deux tabs.onCreated dans le
  │   même ordre → paires correctes (fonction pure, extractible et testable)
  └── [GAP] Réveil worker après redémarrage Firefox → paires en attente
      relues depuis IndexedDB, aucune perdue

LLM/prompt : aucun changé par ce plan — pas de suite d'évaluation à lancer.
COUVERTURE : 0/22 chemins testés (0%) — attendu, aucun code n'existe encore.
Ce diagramme EST la liste des tests à écrire pendant l'implémentation.
```

**Règle de régression (obligatoire)** : deux invariants du design sont des
candidats directs à une régression silencieuse s'ils ne sont pas testés dès
l'implémentation — **marqués CRITIQUE ci-dessus** : (1) rien n'est mis en
file si le PATCH échoue, (2) le bon article atterrit sur le bon onglet même
en cas d'ouverture désordonnée. Les deux doivent avoir un test avant que la
fonctionnalité soit considérée livrée, pas après.

Artefact de plan de test écrit sur disque pour `/qa` :
`~/.gstack/projects/aramis75009-compta-polos/ams-main-eng-review-test-plan-20260818-195641.md`

### Section 4 — Performance

Un seul utilisateur, volumes de l'ordre de la centaine d'articles, aucune
requête réseau nouvelle côté serveur pour l'extension (elle ne parle jamais
au backend). Le seul point à surveiller : la taille des `Blob` photos en
IndexedDB si plusieurs mises en file s'accumulent avant consommation — sans
objet au volume d'Aramis (quelques articles en attente au plus, pas
des centaines). **Examiné, rien à optimiser à cette échelle.**

### Stratégie de parallélisation en worktree

Deux workstreams réellement indépendants :

| Étape | Modules touchés | Dépend de |
|---|---|---|
| Champ prix + `PrixReference` + `/api/prix` + UI `/parametres` | `app/mise-en-vente/`, `app/api/prix/`, `app/parametres/`, `prisma/` | — |
| Extension Firefox (3 composants) | nouveau dossier `extension-vinted/` | Le champ prix côté MyFlip doit exister pour que l'extension ait un prix à transmettre, mais peut être développée en parallèle avec des données de test statiques |

`Lane A: prix + PrixReference + API + UI (séquentiel, un seul module partagé : prisma/)`
`Lane B: extension Firefox (indépendante, aucun module partagé avec Lane A)`
Exécution : lancer A et B en parallèle (deux worktrees), fusionner les deux,
puis un dernier test d'intégration bout-en-bout (Lane A doit être fusionnée
en premier pour que Lane B ait un vrai prix à lire pendant ce test final).

### Ce qui existe déjà (Eng)

`pickPrompt()`/`PromptTemplate`, `/api/prompts` (CRUD complet), la validation
`prixVente` déjà en place côté `PATCH /api/articles/[id]`, le pattern de
bouton `disabled={enregistrementEnCours}` déjà utilisé deux fois dans le même
fichier. Rien de tout ça n'est reconstruit — chaque nouvelle pièce (`/api/prix`,
`pickPrix()`, le bouton Publier) copie un pattern voisin déjà en prod.

### Hors scope (Eng)

Portage de l'infrastructure de test à la WebExtension elle-même (content
scripts, service worker) — Vitest ne peut tester que la logique pure
extractible (appariement onglet↔article), pas l'intégration `browser.*`
réelle ; validée manuellement par Aramis en usage réel (déjà noté dans
« Testing » du corps du spec). Portage Chrome, remplissage des menus à
sélection — déjà hors scope V1 acté en CEO.

### Registre des modes de panne (Eng, complète celui de la revue CEO)

| Codepath | Mode de panne | Sauvé ? | Testé ? | Aramis voit | CRITIQUE ? |
|---|---|---|---|---|---|
| Double-clic « Publier » | Deux PATCH/mises en file | Oui (comblé, décision #10) | À écrire | Rien (un seul effet) | Non (comblé) |
| Appariement onglet↔article | Deux mises en file quasi simultanées | Oui (par construction, ordre `tabs.onCreated`) | À écrire (test direct requis, pas seulement manuel) | Rien si correct | **Oui si non testé** — silencieux si faux |
| `/api/prix` POST/PATCH | Marque/catégorie vides ou dupliquées | À définir en implémentation (même normalisation que `/api/prompts`) | À écrire | Erreur de validation ou silencieux selon implémentation | À trancher en implémentation, pas un gap de design |

Aucune ligne à SAUVÉ=N / TESTÉ=N / VOIT=silencieux qui ne soit pas déjà
marquée comme test obligatoire ci-dessus → pas de CRITICAL GAP non couvert
par le plan de test.

### 0.5 · Double voix — Eng

Codex indisponible → voix unique `[subagent-only]`. Cette voix a trouvé le
finding le plus consequential de toute la revue `/autoplan` : un bug
**dans la correction issue de la Phase Design elle-même** (décisions #11-14
ci-dessus).

```
ENG — CONSENSUS
════════════════════════════════════════════════════════════════
  Dimension                        Orchestrateur  Subagent   Consensus
  ──────────────────────────────── ─────────────  ─────────  ─────────
  1. Architecture saine ?          Oui (+ 1 fix)   Non — bug* RÉSOLU (critique corrigé)
  2. Couverture de tests suffisante? Diagramme fait  Non*     RÉSOLU (pairing rendu testable)
  3. Risques de performance couverts? Oui (sans objet à l'échelle) Non signalé CONFIRMED
  4. Menaces de sécurité couvertes ? Oui (aucune surface neuve) Oui (aucune)  CONFIRMED
  5. Chemins d'erreur gérés ?       Oui             Oui (+ 1 gap) RÉSOLU (état neutre ajouté)
  6. Risque de déploiement gérable? Oui (signature Firefox) Non signalé CONFIRMED
════════════════════════════════════════════════════════════════
* Bug trouvé : ouverture d'onglet non gatée sur le succès du PATCH
  réintroduisait silencieusement la race condition corrigée en Phase
  Design (décision #11) ; le plan de test disait « aucun test automatisé
  pour l'extension » alors que l'appariement, seule pièce déjà buggée,
  a impérativement besoin d'un test direct (décision #13).
```

### Résumé de complétion — Phase Eng

```
+====================================================================+
|         /autoplan — PHASE ENG — RÉSUMÉ DE COMPLÉTION               |
+====================================================================+
| Step 0 (portée)        | acceptée telle quelle (complexité déjà     |
|                         | actée en CEO 0D, 1 trou comblé : /api/prix)|
| Section 1  (Archi)      | 1 issue trouvée et corrigée (bouton)      |
| Section 2  (Qualité)    | 1 note (pickPrompt sans test → ne pas     |
|                         | reproduire pour pickPrix)                 |
| Section 3  (Tests)      | diagramme complet, 22 chemins, 2 marqués  |
|                         | CRITIQUE (régression), artefact écrit     |
| Section 4  (Perf)       | sans objet à cette échelle (examiné)      |
+--------------------------------------------------------------------+
| Hors scope              | écrit (harnais de test WebExtension)      |
| Ce qui existe déjà       | écrit (4 réutilisations directes)         |
| Registre modes de panne  | complété, 0 CRITICAL GAP résiduel         |
| Parallélisation          | 2 lanes (MyFlip / extension), 1 dépendance|
| Voix extérieure          | subagent — 1 bug critique trouvé DANS la  |
|                         | correction de la Phase Design, 4 décisions|
|                         | corrigées (#11-14)                        |
| Lake Score               | 14/14 décisions ont choisi l'option       |
|                         | complète, pas le raccourci                |
+====================================================================+
```

## Thèmes transverses (les 3 phases)

**Chaque voix indépendante a trouvé un problème dans la correction de la
phase précédente, pas seulement des problèmes frais.** La revue Design a
trouvé une contradiction et une race condition dans le design initial ; la
revue Eng a trouvé un bug **dans le fix de la race condition lui-même**
(l'ouverture d'onglet non gatée). Signal de confiance élevé, pas un hasard :
la zone « file d'attente / appariement onglet↔article » est la partie la
plus subtile de tout le design, et c'est exactement pour ça que la décision
#13 en fait la seule pièce de l'extension à exiger un test automatisé direct
plutôt qu'une validation manuelle. À traiter avec le plus grand soin en
implémentation — relire ce fil du spec (décisions #7, #11, #12, #13) avant
d'écrire le service worker.

## Implementation Tasks

Synthétisé à partir des trois phases de revue. À cocher pendant l'implémentation.

- [ ] **T1 (P1, humain: ~3h / CC: ~30min)** — MyFlip/QCM — Ajouter le champ prix au `Qcm`, `pickPrix()`, modèle `PrixReference`, routes `/api/prix`, section `/parametres`
  - Surfacé par : corps du spec + décision #9 (Eng)
  - Fichiers : `app/mise-en-vente/_reducer.ts`, `lib/pickPrix.ts`, `lib/pickPrix.test.ts`, `prisma/schema.prisma`, `app/api/prix/route.ts`, `app/api/prix/[id]/route.ts`, `app/parametres/page.tsx`
  - Vérifier : `pickPrix()` couvre les 5 cas du test diagram (exact, marque, catégorie, défaut, null)
- [ ] **T2 (P1, humain: ~30min / CC: ~10min)** — MyFlip/mise-en-vente — Étendre `enregistrer()` pour envoyer `prixVente`
  - Surfacé par : corps du spec (Architecture)
  - Fichiers : `app/mise-en-vente/page.tsx`
  - Vérifier : test d'intégration confirmant `prixVente` dans le corps du PATCH
- [ ] **T3 (P1, humain: ~1h / CC: ~15min)** — MyFlip/ExportAnnonces — `preventDefault` + PATCH + `window.open` gaté sur succès + bouton désactivé pendant l'enregistrement
  - Surfacé par : décisions #10, #11 (Eng, bug critique)
  - Fichiers : `app/mise-en-vente/_components/ExportAnnonces.tsx`
  - Vérifier : test confirmant qu'aucun onglet ne s'ouvre si le PATCH échoue
- [ ] **T4 (P1, humain: ~2h / CC: ~30min)** — Extension/setup — Manifest V3, exclusion Android, signature Firefox (`web-ext sign`)
  - Surfacé par : décision #6 (CEO)
  - Fichiers : `extension-vinted/manifest.json`
  - Vérifier : `.xpi` signé installable via *Installer un module depuis un fichier*
- [ ] **T5 (P1, humain: ~1j / CC: ~2h)** — Extension/service worker — Appariement onglet↔article via `tabs.onCreated` + `openerTabId`, extrait en fonction pure et testé
  - Surfacé par : Correction Design + décisions #11, #13 (Eng)
  - Fichiers : `extension-vinted/background.js`, `extension-vinted/pairing.js`, `extension-vinted/pairing.test.js`
  - Vérifier : test couvrant appariement simple, deux mises en file rapprochées, événement orphelin
- [ ] **T6 (P1, humain: ~3h / CC: ~45min)** — Extension/service worker — Tirage + persistance du délai anti-ban, blocage si non réglé
  - Surfacé par : décisions #8, #12 (Design + Eng)
  - Fichiers : `extension-vinted/background.js`
  - Vérifier : reprise correcte de l'heure cible après redémarrage simulé du worker
- [ ] **T7 (P1, humain: ~1j / CC: ~2h)** — Extension/content script Vinted — Badge (miniature+titre, Shadow DOM), état neutre sans entrée assignée, bannière DOM cassé, bannière échec partiel
  - Surfacé par : décisions #3 Design, #14 Eng, Section 2 CEO
  - Fichiers : `extension-vinted/content-vinted.js`
  - Vérifier : validation manuelle (pas de harnais WebExtension dans ce repo)
- [ ] **T8 (P2, humain: ~2h / CC: ~10min)** — MyFlip/ExportAnnonces — Bouton « copier tout » presse-papier
  - Surfacé par : décision #2 (CEO, auto-approuvé)
  - Fichiers : `app/mise-en-vente/_components/ExportAnnonces.tsx`
- [ ] **T9 (P2, humain: ~1h / CC: ~20min)** — MyFlip/compte — Bloc « Extension Vinted », réglages délai min/max
  - Surfacé par : corps du spec (Architecture)
  - Fichiers : `app/compte/page.tsx` (ou composant dédié), `prisma/schema.prisma`
- [ ] **T10 (P1, humain: ~10min / CC: ~10min)** — Extension/spike — Vérifier le transport de `Blob` à travers `sendMessage` → IndexedDB → `DataTransfer` AVANT d'écrire T5-T7
  - Surfacé par : revue Eng (finding #4)
  - Vérifier : un `Blob` créé dans un content script survit intact au passage par `runtime.sendMessage`

## Testing

- `pickPrix()` : tests unitaires purs sur le modèle de `pickPrompt()` (précision décroissante, cas `null`) — **`pickPrompt()` lui-même n'a aucun fichier de test existant** (trouvé en revue Eng) : ne pas reproduire cette lacune, `lib/pickPrix.test.ts` est un livrable dès la création du fichier, pas un différé.
- `enregistrer()` : vérifier que `prixVente` transite bien dans le corps du PATCH et que l'échec du PATCH empêche toute mise en file (test d'intégration ou mock du `CustomEvent`).
- **Algorithme d'appariement onglet↔article (service worker)** : contrairement à une conception initiale qui prévoyait « pas de test automatisé, validation manuelle » pour toute l'extension, ce point précis **doit** être unit-testé (Vitest) en l'extrayant en fonction pure — liste d'événements `tabs.onCreated` + liste de messages de mise en file, groupés par `openerTabId`, en ordre d'arrivée → paires onglet↔entrée. Trouvé en revue Eng : c'est la seule pièce du design qui a déjà eu un bug réel (la race condition FIFO), et un test manuel en usage normal ne reproduit pas de façon fiable les cas limites (ordre d'arrivée inversé, événement `onCreated` orphelin si un PATCH échoue malgré tout). Cas à couvrir explicitement : appariement simple, deux mises en file rapprochées, événement orphelin (ne doit pas décaler les paires suivantes).
- Reste de l'extension (rendu du badge, remplissage DOM, `DataTransfer`) : pas de harnais de test WebExtension dans ce repo (première extension) — validation manuelle par Aramis sur son usage réel, en particulier la reprise du minuteur après fermeture/réouverture d'onglet.

## Points restés informatifs (non bloquants)

Un concurrent proposerait déjà ce type d'extension (nom incertain à l'oral —
« Trocathlon »/« Clemz »/« Vlim » — non confirmé). N'a pas influencé les choix
d'architecture ci-dessus, qui reposent sur les garde-fous anti-ban déjà actés
indépendamment.

## Alternative écartée : l'API officielle « Vinted Pro Integrations »

Vérifiée le 18/08/2026 pendant la revue `/autoplan` (doc officielle
`pro-docs.svc.vinted.com`) : Vinted expose une vraie API REST pour les comptes
Pro (`POST/PUT/DELETE /api/v1/items`, jusqu'à 100 annonces par requête,
`GET /api/v1/ontologies` pour marque/catégorie/taille officielles, webhooks,
500 annonces actives). Une intégration par cette API aurait éliminé tout le
risque de ban et toute la complexité anti-ban de ce design.

**Écartée** : la page d'aide Vinted Pro destinée aux vendeurs ne mentionne
aucune API, et les seuls utilisateurs identifiés de cette API sont des
plateformes multi-canal tierces (ExportYourStore, Sellenvo, listapro.ai) qui
gèrent les annonces de plusieurs vendeurs à la fois — l'allowlisting se fait
au niveau entreprise/logiciel, pas vendeur individuel. Aramis a vérifié dans
son propre compte Vinted Pro : rien d'exposé. Passer par un de ces outils
tiers ajouterait un système payant supplémentaire à synchroniser avec MyFlip
au lieu d'en retirer un. L'extension Firefox reste le chemin retenu.

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|-------|----------|-----------------|-----------|-----------|----------|
| 1 | CEO — Premise Gate | Explorer l'API Vinted Pro Integrations avant de valider l'extension | User Challenge (résolu, non auto-décidé) | Claimed Limitations Need Evidence | Vérification factuelle a montré une vraie API existante, mais réservée à un allowlisting entreprise/logiciel, inaccessible à un vendeur Pro individuel — confirmé par Aramis dans son propre compte | Intégration API directe ; passage par un outil multi-canal tiers (coût récurrent, système supplémentaire à synchroniser) |
| 2 | CEO — Scope addition | Ajouter un bouton « copier tout » (presse-papier) à côté de l'extension | Mechanical (auto-approuvé) | P2 Boil the lake (dans le rayon, < 1 jour CC) | Piste 1 de `TODOS.md:83-90`, jamais tentée, quasi gratuite, complémentaire à l'extension (utile même sans elle, ou pendant sa construction) | — |
| 3 | CEO — Complexity check (0D) | Garder `PrixReference`/`pickPrix()` dans ce plan plutôt que de le différer | Taste Decision — **résolue par Aramis au gate final : garder** | Eng phase : P5 explicite + P3 pragmatique vs P1 complétude | Le plan dépasse le seuil mécanique « > 8 fichiers ou > 2 nouvelles classes » (9 fichiers, 2 nouveaux concepts : table de prix + file d'attente extension). Le champ prix pourrait être une simple saisie manuelle en v1 ; `PrixReference` est un confort, pas un bloquant | Champ prix manuel sans table de référence, `PrixReference` en fast-follow |
| 4 | CEO — Dual voice (subagent) | Tester un concurrent (Trocathlon/Clemz/Vlim) avant de construire | Résolu par Aramis (non auto-décidé) | Bias toward action (P6) | Aramis confirme n'avoir jamais testé, n'y voit pas d'intérêt (« impression que ça marche pas »), préfère construire en interne pour garder le contrôle | Adopter un outil tiers existant |
| 5 | CEO — Dual voice (subagent) | Le volume ~150 articles est-il ponctuel ou récurrent ? | Résolu par Aramis (non auto-décidé) | P1 Complétude — confirme la cible | Cette commande est la dernière grosse commande ; les suivantes seront de petites commandes régulières. **Confirme un usage récurrent** : l'effort L de l'extension s'amortit dans la durée, pas sur un seul lot | Se limiter à l'approche B (copier-tout) pour un usage jugé à tort ponctuel |
| 6 | CEO — Dual voice (subagent) | Signature Firefox de l'extension, absente du design initial | Mechanical (auto-approuvé) | Claimed Limitations Need Evidence — vérifié | Firefox exige une extension signée par Mozilla (gratuit, `web-ext sign`) même en usage privé/non listé pour qu'elle reste installée durablement sur Firefox stable | — |
| 7 | Design — Dual voice (subagent) | File FIFO générique remplacée par un appariement onglet↔article à la création | Mechanical (auto-approuvé, bug corrigé) | Explicit over clever (P5) — corrige une race condition réelle | Un FIFO consommé par le premier onglet Vinted chargé ne garantit pas que le bon article atterrisse dans le bon onglet lors d'une session à plusieurs clics (scénario Heure 4-5 de la revue CEO) | Garder la file FIFO simple avec seulement un identifiant visuel sur le badge (mitige mais ne corrige pas le risque) |
| 8 | Design — Dual voice (subagent) | Comportement de l'extension quand aucun délai n'est encore réglé dans /compte | Mechanical (auto-approuvé, bug corrigé) | Claimed Limitations Need Evidence | La Section 11 initiale disait « jamais vide, pas de défaut » — contradictoire : sans réglage, les champs sont nuls. Un délai implicite de 0 annulerait le garde-fou anti-ban | Défaut de délai imposé par le code (rejeté — Aramis doit choisir sa propre fourchette, décision déjà actée) |
| 9 | Eng — Step 0 (orchestrateur) | Ajouter `/api/prix` + UI `/parametres` pour gérer `PrixReference` | Mechanical (trou comblé, pas une préférence) | What already exists (0B) — calque exact de `/api/prompts` | Sans route ni UI, `PrixReference` n'a aucun moyen d'être peuplé par Aramis — `pickPrix()` renverrait toujours `null` en pratique | Saisie manuelle en base (rejeté — pas un usage viable au quotidien) |
| 10 | Eng — Section 1 (orchestrateur) | Le bouton « Publier sur Vinted » doit être désactivé pendant `enregistrementEnCours` | Mechanical (cohérence avec le code existant) | DRY / cohérence avec les boutons voisins (`ExportAnnonces.tsx:186,193`) | Sans ça, un double-clic déclenche potentiellement deux PATCH et deux mises en file pour le même article | — |
| 11 | Eng — Dual voice (subagent) | Gater l'ouverture d'onglet sur le succès du PATCH (`preventDefault` + `window.open`), pas un `<a target="_blank">` direct | Mechanical (bug corrigé — critique) | Explicit over clever (P5) — corrige une régression sur la correction #7 | Un `<a target="_blank">` ouvre l'onglet au clic, avant la résolution du PATCH asynchrone : un échec produirait un onglet orphelin sans entrée de file, décalant l'appariement de tous les onglets suivants — réintroduisait silencieusement la race condition que #7 corrigeait | Tolérer les événements orphelins par timeout côté pairing (rejeté — plus complexe, toujours probabiliste) |
| 12 | Eng — Dual voice (subagent) | Le tirage du délai est fait par le service worker, le content script Vinted ne fait que le lire | Mechanical (contradiction corrigée) | Cohérence interne du document | Le corps du spec attribuait le tirage tantôt au service worker (« persiste l'heure cible »), tantôt au content script (« tire un délai ») — deux acteurs décrits pour la même responsabilité | — |
| 13 | Eng — Dual voice (subagent) | L'algorithme d'appariement onglet↔article doit être unit-testé (fonction pure), pas laissé à la seule validation manuelle | Mechanical (cohérence — c'est la seule pièce déjà buggée une fois) | Well-tested code non négociable (préférence Eng) | Un test manuel en usage normal ne reproduit pas fiablement l'ordre d'arrivée inversé ni l'événement orphelin (#11) | « Pas de test automatisé pour l'extension » (rejeté pour cette pièce précise, conservé pour le reste : rendu DOM, badge) |
| 14 | Eng — Dual voice (subagent) | Ajouter un état neutre quand aucune entrée n'est assignée à l'onglet Vinted courant | Mechanical (gap comblé) | Edge case paranoia | Le content script tourne sur toute création d'annonce Vinted, y compris manuelle et sans lien avec MyFlip — sans cet état, un futur bug pourrait afficher une bannière d'erreur sur un usage Vinted ordinaire | — |

---

## Revue `/autoplan` — Phase CEO, Étape 0

### 0B · Ce qui existe déjà (levier)

| Sous-problème | Code existant réutilisé |
|---|---|
| Enregistrer le brouillon + son prix | `PATCH /api/articles/[id]` accepte déjà `prixVente` (`route.ts:16-95`) ; `deriveVente()` (`lib/calc.ts:274`) stocke sans effet de bord hors statut `Vendu`. **Zéro changement d'API.** |
| Choisir un prix par défaut selon marque/catégorie | `pickPrompt()` + `PromptTemplate` (`lib/promptSelect.ts:24`, `prisma/schema.prisma:247`) — pattern de correspondance déjà en prod depuis plus d'un mois, calqué tel quel pour `pickPrix()`/`PrixReference`. |
| Écriture séquentielle multi-articles sans corruption de cache | Le commentaire de `enregistrer()` (`page.tsx:349`) documente déjà pourquoi les invalidations sont groupées en fin de boucle — la mise en file de l'extension doit suivre la même discipline (empiler séquentiellement après chaque PATCH réussi, pas en парallèle). |
| Statuts d'article (`Brouillon`, etc.) | `STATUTS` de `lib/calc.ts`, réutilisé tel quel. |

Rien de tout ça n'est reconstruit : la seule zone réellement neuve est l'extension WebExtension elle-même (aucun précédent dans ce repo — première extension navigateur de MyFlip).

### 0C · État rêvé à 12 mois

```
ÉTAT ACTUEL                         CE PLAN                              IDÉAL 12 MOIS
Copie manuelle de tout      --->    Titre/description/prix/photos  --->  Le prix vient de l'historique réel
(titre, description, prix,          pré-remplis après délai anti-ban ;   de ventes, pas d'une table éditée
photos, marque, catégorie,          marque/catégorie/taille/état         à la main ; génération d'annonce
taille, état) sur ~150 articles     restent manuels ; clic final         en tâche de fond (P2 TODOS.md)
                                     toujours humain                     supprime le seul temps d'attente
                                                                          restant ; si Vinted ouvre un jour
                                                                          Pro Integrations aux vendeurs
                                                                          individuels, le bouton « Publier »
                                                                          ne change pas pour Aramis, seul
                                                                          son intérieur est remplacé
```

### 0C-bis · Alternatives d'implémentation

```
APPROCHE A (retenue) : Extension Firefox Manifest V3
  Effort:  L (humain ~1-2 semaines / CC ~1-2 jours)
  Risque:  Moyen (ban si mal exécuté, mitigé par les garde-fous ; maintenance si Vinted change son DOM)
  Pour:    Automatise le vrai goulot (photos + texte) ; sous contrôle total de MyFlip
  Contre:  Surface de code neuve (WebExtension), aucun précédent dans le repo

APPROCHE B : Bouton « copier tout » presse-papier (TODOS.md piste 1)
  Effort:  S (CC ~10 min)
  Risque:  Nul
  Pour:    Quasi gratuit, complémentaire, utile même sans l'extension
  Contre:  Ne résout qu'une partie du problème (pas les photos, toujours du copier-coller champ par champ)

APPROCHE C : API Vinted Pro Integrations — ÉCARTÉE après vérification
  Effort:  Aurait été M si accessible
  Risque:  Inconnu (allowlisting entreprise/logiciel, pas vendeur individuel)
  Pour:    Aurait éliminé tout risque de ban
  Contre:  Non accessible à un vendeur Pro individuel (cf. section dédiée ci-dessus)
```

**RECOMMANDATION** : Approche A reste la cible (elle seule règle le vrai goulot identifié en revue CEO du 11/08/2026). Approche B est auto-approuvée en complément (décision #2 ci-dessus) — cheap, dans le rayon, ne retarde pas A. Approche C est écartée (décision #1).

### 0D · Analyse SELECTIVE EXPANSION

**Complexity check** : le plan touche 6 points côté MyFlip + 3 composants neufs côté extension = 9 fichiers, et introduit 2 concepts neufs (`PrixReference`/`pickPrix`, la file d'attente de l'extension) — au-dessus du seuil mécanique de vigilance (> 8 fichiers ou > 2 classes neuves). Décision #3 ci-dessus surface la partie séparable (`PrixReference`) comme choix de goût plutôt que de la couper silencieusement : elle réutilise un pattern déjà prouvé (`pickPrompt`), son coût marginal est faible, mais elle n'est pas indispensable au fonctionnement de l'extension elle-même.

**Minimum viable pour l'objectif énoncé** (automatiser le remplissage Vinted) : l'extension (3 composants) + le champ prix côté QCM (juste une saisie, sans table de référence) + l'événement de mise en file dans `ExportAnnonces.tsx`. `PrixReference` et le bouton « copier tout » sont tous deux des ajouts, pas des prérequis.

**Scan d'expansion (candidats, non inclus dans ce plan)** :
1. Généraliser le même mécanisme à Vestiaire Collective (lien déjà existant dans `ExportAnnonces.tsx`, cf. `TODOS.md`) — effort L, différé.
2. Mini-panneau dans l'extension listant les onglets Vinted en attente (au-delà du compte à rebours par onglet) — effort S.
3. Notification sonore/visuelle quand un compte à rebours se termine — effort S.
4. Bascule « test » dans `/compte` qui remplit les champs sans qu'Aramis ait encore validé la confiance dans l'extension sur les premiers articles — effort S.
5. Détection que Vinted a changé son DOM (sélecteurs introuvables) → bannière « l'extension a besoin d'une mise à jour » au lieu d'un échec silencieux — effort M, à fort relief (relié à la Section 2, voir plus bas).

Ces 5 candidats sont différés vers `TODOS.md` (aucun n'est dans le rayon à coût quasi nul comme la décision #2) — voir section TODOS.md updates plus bas.

**Potentiel plateforme** : si le format de la file d'attente (extension) et le protocole de message content-script ↔ service worker restent génériques (pas de nom de champ ni de logique spécifiques à Vinted dans la couche de transport), le même squelette pourrait servir Vestiaire Collective plus tard sans réécriture. Contrainte de conception à noter pour la phase Eng, pas un engagement de scope.

### 0E · Interrogation temporelle

```
HEURE 1 (fondations)   : Aramis clique « Publier » sur un premier article de test.
                          Le PATCH enregistre le brouillon, l'entrée atterrit dans la
                          file IndexedDB de l'extension.
HEURE 1-2 (logique)    : Onglet Vinted ouvert, badge de compte à rebours affiché,
                          champs remplis après le délai réglé. Aramis vérifie
                          qu'aucun champ auto-rempli n'est faux, termine à la main.
HEURE 4-5 (intégration): Aramis enchaîne 5-10 clics « Publier » avant d'aller remplir
                          les onglets un par un (« faire 10 articles vite, puis
                          remplir »). C'est le test réel de la file FIFO à plusieurs
                          entrées ET de la persistance du minuteur en Manifest V3 —
                          le service worker peut avoir été tué et réveillé entre le
                          premier et le dixième onglet. Scénario le plus susceptible
                          de révéler un bug de persistance IndexedDB.
HEURE 6+ (rodage)      : Après plusieurs sessions réelles, Aramis aura une intuition
                          du bon réglage de délai — le plan ne fixe pas de valeur par
                          défaut (décision actée), donc un mauvais réglage initial
                          (trop court) doit rester facile à corriger dans /compte
                          sans redéploiement.
```

### 0F · Mode confirmé

**SELECTIVE EXPANSION** (fixé par `/autoplan` — cf. règles d'override). Scope de base = design de l'extension tel qu'écrit ; une expansion quasi gratuite auto-approuvée (#2) ; une décision de bundling surfacée en goût (#3) ; cinq candidats différés vers `TODOS.md`.

### 0.5 · Double voix — table de consensus CEO

Codex indisponible sur cette machine (binaire absent) → voix unique, tag `[subagent-only]`. « Orchestrateur » = l'analyse Étape 0 ci-dessus ; « Subagent » = revue indépendante à froid (n'a vu que le fichier spec, aucun contexte de session).

```
CEO — CONSENSUS
════════════════════════════════════════════════════════════════
  Dimension                          Orchestrateur  Subagent  Consensus
  ──────────────────────────────────  ─────────────  ────────  ─────────
  1. Prémisses valides ?              Oui            Non*      RÉSOLU (Aramis)
  2. Bon problème à résoudre ?        Oui             Oui*      CONFIRMED
  3. Calibrage du périmètre correct ? Oui (taste #3)  Oui       CONFIRMED
  4. Alternatives explorées ?         Oui (3 pistes)  Non*      RÉSOLU (Aramis)
  5. Risques concurrentiels couverts? N/A (outil interne, pas produit)  CONFIRMED
  6. Trajectoire 6 mois saine ?       Non vu          Non*      RÉSOLU (signature + échec visible ajoutés)
════════════════════════════════════════════════════════════════
* Le subagent a soulevé : concurrents jamais testés, risque de ban non
  sourcé, signature Firefox absente, alternative text-expander non listée.
  Les quatre ont été creusés (décisions #1, #4, #5, #6 ci-dessus) : deux
  tranchés par Aramis, deux vérifiés et corrigés dans le design.
```

### Sections 1-11 — revue approfondie

Calibrage explicite : MyFlip est un outil solo pour un seul utilisateur (pas
de multi-tenant, pas de SLA, pas de trafic à charge variable). Les sections
ci-dessous sont traitées à profondeur réelle, mais sans gonfler artificiellement
des sujets qui ne s'appliquent pas à ce contexte (ex. scaling à 10x/100x
utilisateurs sur un outil à un seul utilisateur) — chaque « rien trouvé » est
justifié, jamais une case cochée sans examen.

**Section 1 — Architecture.**
```
  MyFlip (/mise-en-vente)                    Extension Firefox (nouveau)
  ┌─────────────────────┐   CustomEvent      ┌───────────────────────┐
  │ ExportAnnonces.tsx   │ ──────────────────▶│ content script MyFlip │
  │  clic "Publier"      │  (titre, desc,     └───────────┬───────────┘
  └──────────┬───────────┘   prix, photos)                │ message
             │ PATCH                                       ▼
             ▼                                   ┌───────────────────────┐
  ┌─────────────────────┐                        │ service worker         │
  │ /api/articles/[id]   │  (existant, inchangé)  │  file FIFO IndexedDB   │
  │  accepte déjà        │                        │  (Manifest V3, pas de  │
  │  prixVente           │                        │  état en mémoire)      │
  └─────────────────────┘                        └───────────┬───────────┘
                                                               │ tire délai,
                                                               ▼ consomme
                                                   ┌───────────────────────┐
                                                   │ content script Vinted  │
                                                   │  badge compte à rebours│
                                                   │  remplit champs texte  │
                                                   │  + photos (DataTransfer│
                                                   │  jamais "Enregistrer")│
                                                   └───────────────────────┘
```
Couplage neuf : aucun côté MyFlip (l'extension ne parle jamais au backend —
invariant déjà acté). Côté extension, les 3 composants sont couplés par le
schéma de message et le format de la file IndexedDB — à garder générique
(pas de champ nommé "vinted_*") pour ne pas fermer la porte à un futur
Vestiaire Collective (0D, potentiel plateforme).
Panne de prod réaliste : le service worker est tué par Firefox entre
l'empilement et la consommation d'une entrée (Manifest V3, comportement
normal, pas un bug) → **couvert** : le design relit tout depuis IndexedDB à
chaque réveil (décision déjà actée), pas d'état en mémoire qui survivrait
seul.
Rollback : désinstaller l'extension revient instantanément au comportement
actuel (lien simple) — c'est déjà le kill-switch, pas besoin d'un interrupteur
dédié en plus (finding subagent #8 — jugé suffisant, pas d'action).
Sécurité : aucune surface neuve côté serveur MyFlip (l'extension ne l'appelle
jamais). Côté extension : permissions limitées aux deux domaines, pas de
`<all_urls>`. **Aucun problème trouvé.**

**Section 2 — Erreurs & sauvetage.**
| Codepath | Ce qui peut casser | Classe | Sauvé ? | Action | Ce que voit Aramis |
|---|---|---|---|---|---|
| PATCH `/api/articles/[id]` (étape 3a) | Réseau, validation serveur | Erreur réseau/HTTP | Oui (déjà existant) | toast d'erreur, rien n'est empilé | Toast « enregistrement impossible » |
| Écriture IndexedDB (content script MyFlip) | Quota dépassé (photos volumineuses), transaction avortée | `QuotaExceededError` | **GAP → comblé** | retenter une fois, sinon toast explicite côté MyFlip | « La mise en file a échoué, republie depuis Vinted directement » |
| Réveil service worker, lecture file | Entrée corrompue (Blob perdu entre deux versions de schema) | Parsing/désérialisation | **GAP → comblé** | ignorer l'entrée corrompue, la logger, continuer la file | Rien (l'entrée disparaît, article reste en Brouillon dans MyFlip — pas de perte de données MyFlip) |
| Content script Vinted, sélecteur DOM introuvable | Vinted a changé son HTML | Sélecteur non trouvé | **GAP → comblé (finding subagent)** | bannière visible « extension à mettre à jour », ne rien remplir | Bannière sur l'onglet Vinted |
| Injection photos via `DataTransfer` | Navigateur refuse le transfert (permissions, format) | Exception DOM | **GAP → comblé** | même bannière que ci-dessus, dégradation vers remplissage texte seul | Bannière + champs texte quand même remplis |

**Section 3 — Sécurité.** Surface neuve : deux content scripts + un service
worker, permissions limitées à `mise-en-vente` MyFlip et `vinted.fr/items/new*`.
Pas de nouvel endpoint serveur, pas de nouveau secret, pas de nouvelle donnée
personnelle traitée (titre/description/prix/photos sont déjà celles
qu'Aramis publie lui-même publiquement sur Vinted). Seul vecteur théorique :
un site tiers malveillant qui imiterait `vinted.fr/items/new*` pour capter
les données transmises — mitigé par le `match_pattern` strict du manifest
(le content script ne s'active que sur ce domaine exact). **Aucun problème
High/Medium trouvé.**

**Section 4 — Flux de données et cas limites d'interaction.** Déjà couvert en
détail dans la section « Gestion des erreurs et cas limites » du design
ci-dessus (PATCH échoue, plusieurs clics avant d'aller sur Vinted, onglet
fermé/rouvert, champ déjà rempli à la main, extension absente). Le seul ajout
de cette revue : le cas « sélecteur DOM introuvable » (Section 2) rattaché à
cette table d'interaction.

**Section 5 — Qualité de code.** `pickPrix()` doit être un copier-coller
structurel de `pickPrompt()` (`lib/promptSelect.ts:24-48`), pas une
réinvention — la revue Eng doit vérifier cette parenté ligne à ligne plutôt
que juste "s'en inspirer". Pas de sur-ingénierie détectée (pas d'abstraction
prématurée) ; pas de sous-ingénierie non plus une fois les gaps de la
Section 2 comblés.

**Section 6 — Tests.** Diagramme complet et gaps : voir l'artefact de plan de
test dédié, produit en Phase 3 (Eng) — cette section CEO se contente de
confirmer qu'aucun flux LLM/prompt n'est touché par ce plan (pas d'eval suite
à lancer).

**Section 7 — Performance.** Un seul utilisateur, volumes de l'ordre de la
centaine d'articles, aucune requête réseau nouvelle côté serveur. **Sans
objet à cette échelle — examiné, rien à optimiser.**

**Section 8 — Observabilité.** Le seul point neuf : la bannière « extension à
mettre à jour » (Section 2) EST le mécanisme d'observabilité pour Aramis lui
-même, qui est son propre opérateur. Pas de dashboard/alerting distinct
nécessaire pour un outil solo — **proportionné, rien à ajouter.**

**Section 9 — Déploiement.** Traité en détail ci-dessus (signature Firefox,
`web-ext sign`, installation manuelle via fichier). Pas de migration DB
risquée : `PrixReference` est un nouveau modèle (pas une modification de
table existante), et les deux champs `UserSettings` sont nullable — déploiement
Prisma sans downtime, cohérent avec les migrations précédentes du repo.

**Section 10 — Trajectoire long terme.** Réversibilité : 5/5 côté MyFlip
(désinstaller l'extension = retour instantané au comportement actuel).
Dette : la seule dette assumée est la maintenance des sélecteurs DOM Vinted
(inhérente à toute automatisation DOM, comblée par l'échec visible plutôt que
silencieux). Pas de verrouillage architectural : le format de message/file
générique (0D) garde la porte ouverte à un futur second site.

**Section 11 — Design & UX** (portée UI confirmée manuellement en Étape 0 du
pipeline, le détecteur mécanique ne lit pas le français).
| Fonctionnalité | Chargement | Vide | Erreur | Succès | Partiel |
|---|---|---|---|---|---|
| Champ prix (QCM) | — | vide, éditable | validation inline avant soumission (nombre, > 0) **en plus** de la validation serveur existante (`route.ts:90-95`) — ne pas attendre le PATCH pour signaler une erreur | valeur pré-remplie par `pickPrix()` | — |
| Badge compte à rebours (extension) | affiché dès l'ouverture d'onglet, avec miniature + titre de l'article assigné | délai jamais réglé → bannière dédiée (Section 2), pas de badge | bannière « à mettre à jour » (Section 2) | disparaît, champs remplis | **deux cas distincts** : (a) réouverture d'onglet avant la fin du délai → reprend l'heure cible persistée ; (b) délai écoulé mais échec partiel de l'injection photos → texte rempli quand même + bannière (Section 2), le badge ne doit pas laisser croire à un succès complet |
| Réglages délai min/max (`/compte`) | — | **premier usage : les deux champs sont vides** (nullable, pas de défaut) → tant qu'ils le sont, l'extension bloque le remplissage (Section 2), ne jamais interpréter « vide » comme « délai 0 » | validation min < max à ajouter en Eng | enregistré | — |
Recommandation : `/plan-design-review` pour un audit visuel complet du badge
et des nouveaux champs (Phase 2 ci-dessous, déjà planifiée par `/autoplan`).

---

## Revue `/autoplan` — Phase Design

Portée confirmée manuellement (le détecteur mécanique ne lit pas le français,
cf. Étape 0). Classificateur : le champ prix et les réglages `/compte` sont
de l'**App UI** (Direction C, existant) ; le badge de l'extension est un
**cas à part** — une injection sur la page d'un tiers (Vinted), pas une
surface MyFlip. Pas de mockup généré (le designer gstack est disponible mais
la surface est trop petite — un champ, deux inputs, un badge — pour justifier
un rendu visuel ; l'analyse texte suffit à trancher les décisions réelles).

### 0.5 · Double voix — design

Codex indisponible → voix unique `[subagent-only]`, revue indépendante à
froid (aucun contexte de session, uniquement le fichier spec).

```
DESIGN — CONSENSUS
════════════════════════════════════════════════════════════════
  Dimension                        Orchestrateur  Subagent   Consensus
  ──────────────────────────────── ─────────────  ─────────  ─────────
  1. Hiérarchie de l'information   Oui             Non*       RÉSOLU
  2. États manquants ?             Oui (partiel)   Non — bug* RÉSOLU (critique corrigé)
  3. Parcours cohérent ?           Oui             Non — bug* RÉSOLU (architecture corrigée)
  4. Spécificité (pas générique) ? Oui             Non*       RÉSOLU
  5. Décisions à risque pour Eng ? Oui             Oui        CONFIRMED
════════════════════════════════════════════════════════════════
* Le subagent a trouvé deux bugs réels que ma propre passe avait manqués :
  (a) contradiction "jamais vide / pas de défaut" sur les réglages de délai
  — un premier usage sans réglage aurait remplacé le garde-fou anti-ban par
  un délai de facto nul ; (b) race condition dans l'association file↔onglet
  qui pouvait faire atterrir le mauvais article sur le mauvais onglet Vinted
  lors d'une session à plusieurs clics. Les deux sont corrigés directement
  dans le corps du spec (mécanisme d'appariement par `tabs.onCreated`,
  blocage explicite si délai non réglé).
```

### Passes 1-7

**Pass 1 — Architecture de l'information (6/10 → 9/10).** Deux emplacements
non précisés dans le design initial :
- Champ prix : placé **après « details »** dans le QCM (dernier des champs
  existants) — évite de rejouer l'ordre d'un formulaire qui fonctionne déjà
  pour une simple insertion.
- Réglages délai min/max : nouveau petit bloc « Extension Vinted » dans
  `/compte`, à côté du bloc Intégrations existant (`components/compte/Integrations.tsx`) —
  pas mélangé aux clés IA/Trello, sujet différent.

**Pass 2 — États d'interaction.** Couvert par le tableau de la revue CEO
Section 11 (ci-dessus). Ajout : le prix suggéré par `pickPrix()` est un
calcul pur, synchrone, sans appel réseau — **aucun état de chargement à
prévoir** pour ce champ.

**Pass 3 — Parcours utilisateur et arc émotionnel.** Le point de bascule
émotionnel du parcours est le **premier badge de compte à rebours vu en
vrai** : confiance encore à construire, avant que l'habitude ne s'installe.
C'est exactement ce que sert le candidat différé « bascule test » (`TODOS.md`,
P2) — ce pass confirme sa valeur sans le faire remonter en scope (déjà décidé
en CEO 0D).

**Pass 4 — Risque de générique (9/10, un risque réel identifié).** Aucun
pattern « AI slop » applicable (pas de landing page, pas de grille de
cartes). Risque concret : sans direction précise, le badge de compte à
rebours pourrait ressembler à une notification/toast générique — sur la page
d'un tiers, ça se lirait comme une bannière suspecte plutôt qu'un outil
reconnaissable d'Aramis. **Décision (auto-fixée, structurelle)** : badge
minimal, ancré dans un coin, texte de compte à rebours brut + un petit repère
visuel dans l'accent MyFlip (pas la palette complète Direction C — l'extension
ne doit pas dépendre du CSS de l'app, et doit rester sobre sur une page qui
n'est pas la sienne).

**Pass 5 — Alignement design system (7/10 → 9/10).** Champ prix et réglages
`/compte` : tokens Direction C existants (`var(--acc)`, Space Grotesk).
**Précision ajoutée** : le prix est un montant — `docs/design-system.md`
établit déjà JetBrains Mono pour les montants (SKU, prix) ; le champ prix
doit suivre cette convention, pas Space Grotesk. Badge extension : **volontairement
hors Direction C** (Pass 4) — styles inline autonomes, pas de dépendance au
bundle CSS de l'app.

**Pass 6 — Responsive et accessibilité.** `/mise-en-vente` est desktop-only
par décision déjà actée (11/08/2026) — le champ prix n'a pas besoin de
spec mobile, cohérent avec l'existant. Les réglages `/compte`, eux, suivent
les règles mobile-first du reste de l'app (cibles tactiles 44px) — à ne pas
oublier parce qu'ils vivent dans une page qui, elle, reste responsive.
L'extension Firefox est desktop uniquement (portée déjà actée) — **à
confirmer explicitement dans le manifest** : ne pas cibler Firefox pour
Android, qui supporte pourtant certaines extensions. Badge : texte de
compte à rebours lisible seul, jamais uniquement une couleur.

**Pass 7 — Décisions résolues dans cette revue.** Les trois décisions
ci-dessus (emplacement prix, emplacement réglages, traitement visuel du
badge) sont désormais actées dans le corps du spec ci-dessous plutôt que
laissées ouvertes pour l'implémentation.

### Complétion Design

```
+====================================================================+
|         /autoplan — PHASE DESIGN — RÉSUMÉ DE COMPLÉTION            |
+====================================================================+
| Pass 1  (Info Arch)  | 4/10 → 9/10 (emplacements précisés)         |
| Pass 2  (États)       | 5/10 → 9/10 (2 bugs trouvés par le subagent : |
|                        | délai jamais réglé, partiel photos non distingué) |
| Pass 3  (Parcours)    | 4/10 → 9/10 (race condition file↔onglet corrigée par appariement à la création) |
| Pass 4  (AI Slop)     | 9/10 (1 décision structurelle sur le badge)|
| Pass 5  (Design Sys)  | 7/10 → 9/10 (JetBrains Mono pour le prix)  |
| Pass 6  (Responsive)  | 8/10 (exclusion Android à expliciter)      |
| Pass 7  (Décisions)   | 5 résolues, 0 différée                     |
+--------------------------------------------------------------------+
| Mockups               | 0 générés (surface jugée trop petite)      |
| Score global           | 6/10 → 9/10 (2 findings critiques du subagent inclus) |
+====================================================================+
```

### Registre des modes de panne

| Codepath | Mode de panne | Sauvé ? | Testé ? | Aramis voit | Loggé ? |
|---|---|---|---|---|---|
| PATCH brouillon | Échec réseau/validation | Oui (existant) | Oui (existant) | Toast d'erreur | Oui (existant) |
| Mise en file IndexedDB | Quota dépassé | Oui (comblé) | À écrire (Eng) | Toast explicite | À ajouter |
| Réveil service worker | Entrée corrompue | Oui (comblé) | À écrire (Eng) | Rien (article reste en Brouillon) | À ajouter |
| Remplissage Vinted | Sélecteur DOM introuvable | Oui (comblé) | À écrire (Eng) | Bannière visible | À ajouter |
| Remplissage Vinted | Champ déjà rempli à la main | Oui (déjà acté) | À écrire (Eng) | Rien (pas écrasé) | Non nécessaire |

Aucune ligne à SAUVÉ=N / TESTÉ=N / VOIT=silencieux après les corrections
ci-dessus → **aucun CRITICAL GAP résiduel.**

### « Hors scope » (déjà écrit dans le corps du spec, résumé ici)

Portage Chrome, remplissage des menus à sélection, clic auto sur
« Enregistrer », mode rafale, API/OAuth serveur dédiés — chacun avec sa
justification dans la section « Hors scope (V1) » du design. Ajout de cette
revue : test réel d'un concurrent (décidé — non, cf. décision #4), API Vinted
Pro (décidé — non, cf. section dédiée), généralisation multi-plateforme
(décidé — différé, cf. 0D scan d'expansion).

### Delta état-rêvé

Ce plan avance vers l'idéal 12 mois (0C) sans s'y substituer : il règle le
vrai goulot identifié en revue CEO du 11/08/2026 (remplissage manuel), sans
toucher à la génération en tâche de fond (P2 déjà dans `TODOS.md`, toujours
pertinente et non affectée par ce plan) ni à un hypothétique accès API futur
(dépend de Vinted, hors du contrôle de MyFlip).

### Résumé de complétion — Phase CEO

```
+====================================================================+
|            /autoplan — PHASE CEO — RÉSUMÉ DE COMPLÉTION            |
+====================================================================+
| Mode                  | SELECTIVE EXPANSION                        |
| Audit système          | TODOS.md P2 "vrai goulot" = origine directe|
| Étape 0                | Prémisse API Vinted Pro vérifiée + écartée |
| Section 1  (Archi)     | 0 issue résiduelle, diagramme produit      |
| Section 2  (Erreurs)   | 5 codepaths, 4 gaps comblés, 0 résiduel    |
| Section 3  (Sécurité)  | 0 issue (aucune surface serveur neuve)     |
| Section 4  (Data/UX)   | couvert par le corps du spec + Section 2   |
| Section 5  (Qualité)   | 1 note (pickPrix = calque de pickPrompt)   |
| Section 6  (Tests)     | renvoyé à la Phase Eng (artefact dédié)    |
| Section 7  (Perf)      | sans objet à cette échelle (examiné)       |
| Section 8  (Observ.)   | proportionné, rien à ajouter (examiné)     |
| Section 9  (Déploie)   | signature Firefox ajoutée, migration sûre  |
| Section 10 (Trajectoire)| réversibilité 5/5, dette = maintenance DOM|
| Section 11 (Design)    | tableau d'états produit, /plan-design-review recommandé |
+--------------------------------------------------------------------+
| Hors scope              | 6 items (listés ci-dessus)                |
| Ce qui existe déjà       | 4 réutilisations directes (0B)            |
| Registre erreurs         | 5 codepaths, 0 CRITICAL GAP résiduel      |
| Modes de panne           | 5, 0 CRITICAL GAP résiduel                |
| TODOS.md mis à jour      | 4 nouveaux items (P2×1, P3×3) + 1 mise à jour |
| Propositions de scope    | 2 (copier-tout auto-approuvé, PrixReference en taste decision) |
| Voix extérieure          | subagent Claude (Codex indisponible) — 4 findings, tous résolus |
| Diagrammes produits      | architecture, flux, registre d'erreurs    |
| Décisions non résolues   | 1 (bundling PrixReference — gate final)   |
+====================================================================+
```
