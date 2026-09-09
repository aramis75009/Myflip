# Design — Remplissage automatique du formulaire Vinted, scope Sacs à dos Nike

**Date** : 2026-09-07
**Branche** : `worktree-extension-vinted`
**Prédécesseur** : `2026-08-18-extension-vinted-design.md` (l'extension qui remplit
titre/description/prix/photos). Ce document en étend le périmètre, il ne le remplace pas.
**Sources** : trois relevés de `vinted.fr/items/new`, désormais dans le dépôt —
`docs/audits/2026-09-07-vinted-form-mapping.md` (cartographie générale),
`…-nike-backpack.md` (ids du scope Nike), et
`docs/audits/2026-09-08-vinted-mecanique-panneaux.md` (mécanique des panneaux, et
le piège du prix — §5.4 ci-dessous). Les deux premiers en lecture seule ; le
troisième a créé un vrai brouillon sur le compte de test.

---

## 1. Ce qu'on construit, en une phrase

Un lot de sacs à dos Nike généré dans `/mise-en-vente` part en **brouillons Vinted**
sans une seule saisie manuelle : l'extension ouvre un onglet par article, remplit
**tous** les champs du formulaire — y compris catégorie, marque, état, couleur,
matériau, format de colis et unisexe — et clique « Sauvegarder le brouillon », en
espaçant chaque geste pour ne pas ressembler à un robot.

**Le brouillon, pas la publication.** Le clic sur « Ajouter » reste hors de portée de
cette version. C'est un choix de prudence, pas une limite technique : un premier
essai raté produit un brouillon jetable, pas une annonce publiée sur un vrai compte.

---

## 2. Ce qui existe déjà, et qu'on ne refait pas

| Acquis | Où |
|---|---|
| Génération d'annonce (titre/description/mots-clés) par l'IA | `app/api/listings/generate/` |
| Passage du statut à `Brouillon` avant publication | `_publierVinted.ts` |
| Transport des photos page → extension en `{ type, buffer }` | `content-myflip.js` |
| Écriture dans un champ React via le setter natif | `content-vinted.js`, `ecrireValeur()` |
| Garde « ne jamais écraser un champ rempli à la main » | `content-vinted.js`, `devraitRemplirChamp()` |
| Fourchette de délai anti-ban réglée dans `/compte` | `UserSettings.delaiVintedMin/MaxMinutes` |
| Prix de référence par marque/catégorie | `PrixReference`, `pickPrix()` |

Trois choses **disparaissent** au contraire :

- **`pairing.js`** (72 lignes, 5 tests) et tout l'appariement onglet↔article par
  `openerTabId`. L'extension crée elle-même les onglets : elle sait lequel est lequel.
- **Le `window.open()` de `_publierVinted.ts`**, et avec lui le risque R12 de l'audit
  du 2026-09-03 (activation utilisateur perdue après un `await`, popup bloqué).
- **Le store `pendingEvents`** d'IndexedDB, qui n'existait que pour l'appariement.

---

## 3. Deux décisions qui s'écartent du PRD

Le PRD demandait de figer `condition_id = 2` et d'ajouter un champ « matériau Vinted »
distinct. Les deux sont inutiles.

**L'état se dérive.** Les cinq libellés de `ETATS` (`lib/listingOptions.ts`) sont
identiques au caractère près aux cinq libellés de l'attribut `condition` de Vinted.
Une table de cinq lignes suffit, et le champ « État » du QCM devient la source de
vérité — figer 2 aurait fait mentir l'annonce dès le premier sac en « Bon état ».

**Le matériau se dérive aussi.** Les dix suggestions de `MATIERES_SUGGESTIONS`
mappent toutes sur la liste Vinted. `Coton piqué` et `Coton` tombent tous deux sur
l'id 44 : la liste d'ids sortante est **dédupliquée**.

| MyFlip | Vinted | MyFlip | Vinted |
|---|---|---|---|
| Coton | 44 | Cuir | 43 |
| Coton piqué | 44 | Jean / Denim | 303 |
| Polyester | 45 | Cachemire | 123 |
| Laine | 46 | Nylon | 52 |
| Lin | 146 | Viscose | 48 |

Conséquence assumée : le QCM plafonne à **2 matières** là où Vinted en accepte 3.
Décision d'Aramis du 2026-09-07 : on garde 2.

**Reste vraiment neuf : la couleur.** Aucun champ couleur n'existe dans MyFlip.

---

## 4. Côté MyFlip

### 4.1 Le catalogue

`FicheArticle.tsx` : « Sac à dos » rejoint `CATEGORIES_LIST`, « Nike » rejoint
`MARQUES_CHIPS`. Rien d'autre — pas de famille sacs, pas d'autre marque.

### 4.2 `lib/vintedReferentiels.ts` (neuf, pur)

Recopie des relevés d'audit, sans logique :

- `COULEURS_VINTED` : 29 entrées `{ id, libelle, hex }` — elles alimentent les
  pastilles de l'écran, donc elles servent.
- `ETAT_VERS_CONDITION_ID` : les 5 libellés MyFlip → id Vinted.
- `MATIERE_VERS_MATERIAL_ID` : les 10 suggestions MyFlip → id Vinted.

Pas de liste des 55 matériaux Vinted : aucun écran ne la montre, puisque la matière
se saisit avec les 10 suggestions MyFlip. Elle reste consultable dans
`docs/audits/2026-09-07-vinted-form-mapping-nike-backpack.md` §3 le jour où une
catégorie en aura besoin.

### 4.3 `lib/vintedMapping.ts` (neuf, pur)

```ts
export type MappingVinted = {
  marque: string;          // libellé MyFlip
  categorie: string;       // libellé MyFlip
  categoryId: number;      // 246
  brandId: number;         // 53
  packageType: 1 | 2 | 3;  // 1 = Petit
  unisex: boolean;         // true
  materiauxDefaut: string[]; // ["Polyester", "Nylon"] — libellés MyFlip,
                             // puisqu'ils pré-remplissent les pastilles du QCM
  /** false ⇒ la catégorie Vinted n'a pas de champ taille. */
  aUneTaille: boolean;
  /** Texte à taper dans la recherche de catégorie Vinted. */
  rechercheCategorie: string; // "Sacs à dos"
};

export const MAPPINGS_VINTED: MappingVinted[] = [ /* une seule entrée */ ];
export function pickVintedMapping(marque: string, categorie: string): MappingVinted | null;
```

Correspondance **exacte** sur marque + catégorie, insensible à la casse et aux
espaces de bord. Pas de cascade façon `pickPrompt` : avec une entrée, une cascade
serait du code mort qui ment sur son intention. Le jour où une deuxième combinaison
arrive, la cascade se rajoute avec ses tests.

Le PRD demandait que les valeurs figées restent « visibles et modifiables ». Elles
sont visibles (§4.5) et modifiables **en changeant marque ou catégorie**, ce qui
change le mapping. Rendre `categoryId` éditable à la main dans l'UI reviendrait à
demander à Aramis de connaître les ids Vinted par cœur : ce serait une régression
d'ergonomie déguisée en liberté.

### 4.4 Le QCM

`Qcm` gagne un champ, et un seul :

```ts
couleurs: number[];   // ids Vinted, 0 à 2 entrées
```

L'action `qcm` du reducer accepte désormais `string | boolean | number[]`.
`_persistance.ts` n'a **pas** besoin de bump de version : `deserialiser()` fusionne
`{ ...base.qcm, ...f.qcm }`, une session v2 sans `couleurs` récupère le `[]` du QCM
vide.

`fichePrete()` **n'est pas touchée**. Quand le mapping dit `aUneTaille: false`, la
carte Taille est masquée et `qcm.taille` est **forcée à `"Unique"`** — la fiche reste
« prête » sans qu'on ait à relâcher une garde qui protège les autres catégories.

### 4.5 L'écran

Dans l'étape 2, quand `pickVintedMapping()` renvoie un mapping :

- La carte **Taille** disparaît.
- Une carte **Vinted** apparaît. Elle porte :
  - les valeurs figées en lecture (`Sacs à dos · Nike · Petit · Unisexe`), pour que
    l'écran dise ce qui va partir ;
  - un bloc **Couleur**, 29 pastilles avec la pastille de couleur en `hex`, sélection
    multiple plafonnée à 2, marqué « requis » ;
  - rien d'autre : état et matière restent où ils sont déjà.
- Si `matiere` et `matiere2` sont vides, elles sont pré-remplies avec
  `materiauxDefaut` traduit en libellés MyFlip (Polyester, Nylon).

La présence de cette carte est le signal que le pilote automatique est armé. Son
absence dit qu'on est sur un article que l'extension ne saura pas remplir seule.

**Où la couleur est-elle exigée ?** Sur le bouton Vinted de l'étape 4, jamais sur la
génération. Une fiche sans couleur se génère normalement — l'IA travaille sur les
photos, elle n'a pas besoin de l'information — mais son bouton « brouillon sur
Vinted » est désactivé, avec la raison affichée. Bloquer la génération punirait une
étape qui n'a rien à voir.

### 4.6 La sortie

`detailPublicationVinted()` gagne un objet `vinted`, absent quand aucun mapping ne
correspond :

```ts
vinted?: {
  categoryId: number;
  rechercheCategorie: string;
  filAriane: string;
  brandId: number;
  conditionId: number;
  packageType: 1 | 2 | 3;
  unisex: boolean;
  colorIds: number[];     // 1 à 2
  materialIds: number[];  // 0 à 2, dédupliqués
}
```

Que des entiers. C'est le critère d'acceptation du PRD : l'extension ne fait aucune
traduction de libellé.

### 4.7 Le déclenchement

Étape 4, à côté des boutons d'enregistrement groupé : **« Tout mettre en brouillon
sur Vinted (N) »**, visible dès qu'une fiche est générée et porte un mapping.

Il enchaîne, pour chaque fiche : `PATCH statut=Brouillon` (boucle en série
existante), puis émission de l'événement `myflip:publier-vinted`. **Aucun
`window.open`.** L'invariant de `publierVinted()` — ne rien émettre si le PATCH
échoue — est conservé ; seul le troisième effet (`ouvrirOnglet`) disparaît.

Le bouton par fiche reste, et fait la même chose pour une seule fiche.

**Sans extension installée**, rien ne répond : le bouton retombe sur le comportement
d'aujourd'hui (ouvrir `vinted.fr/items/new` à la main). `content-myflip.js` pose
`document.documentElement.dataset.myflipVinted = "1"` à l'injection ; la page lit ce
marqueur pour savoir laquelle des deux voies proposer.

---

## 5. Côté extension : de la file à l'ordonnanceur

### 5.1 Le flux

```
/mise-en-vente                background.js                    onglet Vinted
──────────────                ─────────────                    ─────────────
« Tout mettre en brouillon »
   PATCH ×N (série)
   N × CustomEvent      ────▶  N entrées en file (IndexedDB)
                               │
                               ▼
                         ┌──── boucle, UN article à la fois ────┐
                         │  alarme : délai tiré dans [min,max]  │
                         │  tabs.create("/items/new")           │
                         │  ─────────────────────────────────▶  │ content-vinted.js
                         │                                      │  « prêt »
                         │  ◀─────────────────────────────────  │
                         │  envoie l'entrée                     │
                         │  ─────────────────────────────────▶  │  remplit (§5.3)
                         │                                      │  clic brouillon
                         │  ◀─── statut ──────────────────────  │
                         │  tabs.remove() si succès             │
                         └──────────────────────────────────────┘
                                       article suivant
```

**Un seul article en vol à la fois.** Cinq onglets ouverts d'un coup seraient à la
fois un signal évident et un moyen sûr de saturer la mémoire du worker avec 100
photos pleine résolution.

### 5.2 Ce que ça change dans le manifest et le worker

- Permission **`alarms`** ajoutée. Un délai de 4 minutes ne survit pas à
  `setTimeout` dans un worker MV3 qui peut être tué à tout instant ; une alarme, si.
- `browser.tabs.onCreated` n'est plus écouté. `pairing.js`, `pairing.test.js` et le
  store `pendingEvents` sont supprimés.
- L'entrée IndexedDB gagne un `etat` : `"en-attente" | "en-cours" | "echouee"`, et le
  `tabId` est posé par `tabs.create()` au lieu d'être deviné.
- Au réveil du worker, la reprise est directe : s'il existe une entrée `en-cours`
  dont l'onglet n'existe plus, elle repasse `en-attente`.

L'ordonnanceur lui-même est une **fonction pure** — `(file, maintenant) → action` —
donc testable sans navigateur, comme `pairing.js` l'était.

### 5.3 L'ordre de remplissage n'est pas négociable

D'après `2026-09-07-vinted-form-mapping.md` §3, **marque, état, couleur, matériau,
unisexe et format de colis n'existent dans le DOM qu'après validation d'une catégorie
feuille.** L'ordre est donc imposé :

| # | Geste | Sélecteur |
|---|---|---|
| 1 | Ouvrir le panneau catégorie | clic sur `[data-testid="catalog-select-dropdown-input"]` |
| 2 | Chercher | écrire `rechercheCategorie` dans `#catalog-search-input` |
| 3 | Choisir | clic sur `#catalog-search-<categoryId>-result` — **le conteneur, pas le `-radio`** |
| 4 | Valider | clic sur `[data-testid="input-dropdown-save-button"]` |
| 5 | Attendre l'apparition de la marque | `MutationObserver`, plafond 10 s |
| 6 | Marque | ouvrir, `brand-radio-53`, « Fait » |
| 7 | État | ouvrir, `condition-radio-<id>`, « Fait » |
| 8 | Couleur | ouvrir, `color-checkbox-<id>` ×1-2, « Fait » |
| 9 | Matériau | ouvrir, `material-checkbox-<id>` ×0-2, « Fait » |
| 10 | Unisexe | checkbox `#unisex` |
| 11 | Colis | `package_type_selector_1` |
| 12 | Titre, description, prix | frappe simulée (§5.5) |
| 13 | Photos | `[data-testid="add-photos-input"]`, `DataTransfer` |
| 14 | Brouillon | pause, puis `[data-testid="upload-form-save-draft-button"]` |

Trois règles que le relevé du 2026-09-08 rend non négociables :

**Tous les panneaux se ferment par « Fait ».** `input-dropdown-save-button` est le
même pour les cinq. Ni `Échap`, ni un clic à l'extérieur, ni la sélection elle-même
ne ferment quoi que ce soit — et le bouton **X** (`<champ>-select-dropdown-close-button`)
ferme *en annulant la sélection*. **Ne jamais le cliquer.** C'est le piège le plus
facile à tomber dedans : il ressemble à « fermer », il veut dire « annuler ».

**On clique le conteneur, pas l'input.** Les `input[type=radio|checkbox]` sont
`aria-hidden="true"` et `tabindex="-1"` ; un `.click()` dessus marche par
intermittence. La cible est le `<div role="radio">` / `role="checkbox"` parent.

**On ne coche jamais plus que la limite.** Au-delà, Vinted décoche silencieusement
la plus ancienne sélection au lieu de refuser le clic (FIFO, complément Nike §5).
Une couleur de trop n'échoue pas : elle en évince une autre.

### 5.4 Le piège du prix — le vrai risque de ce chantier

Le relevé du 2026-09-08 a créé un brouillon complet et l'a relu par l'API. Tout est
correct **sauf le prix** : `15` saisi, `« 15,00 € »` affiché dans le champ, et
`price.amount = "0.0"` dans le brouillon enregistré.

Le champ prix a donc une logique de commit que ni `input.value = …` ni un `Event
("input")` synthétique ne déclenchent. Le titre, lui, est passé — c'est ce qui rend
la panne vicieuse : elle ne touche qu'un champ sur trois, et l'écran ment.

Trois parades, cumulées :

1. **Frappe caractère par caractère** avec `keydown` / `keypress` / `input` / `keyup`
   réels, plutôt qu'une écriture en bloc — c'est déjà la mesure anti-bot de §5.5, elle
   sert deux fois.
2. **`blur` explicite** après la saisie du prix, pour déclencher un éventuel commit
   sur perte de focus.
3. **Vérification par relecture** : après la frappe et le `blur`, relire
   `input.value`. *Insuffisant à lui seul* — le relevé montre que l'affichage était
   juste alors que l'état ne l'était pas — mais il attrape le cas où la frappe n'a
   rien écrit du tout.

**Aucune de ces parades ne prouve que le prix est commité.** Le seul juge est le
brouillon relu après coup. D'où la consigne opératoire : **au premier passage réel,
Aramis ouvre le brouillon créé et vérifie le prix**. Si `0,00 €`, c'est là qu'il faut
creuser, et nulle part ailleurs.

`ecrireValeur()` (setter natif du prototype), déjà dans `content-vinted.js`, est
conservé pour titre et description : c'est la parade documentée au *value tracker* de
React. Le relevé, lui, utilisait la méthode naïve — il ne dit donc pas si le setter
natif aurait suffi pour le prix. On ne parie pas dessus.

### 5.5 Les délais

Consigne d'Aramis : « le plus sûr possible, la lenteur n'est pas un problème ».

| Geste | Attente |
|---|---|
| Entre deux articles | fourchette `/compte`, en minutes, tirée uniformément |
| Frappe d'un caractère | 25–70 ms |
| Entre deux champs | 400–1800 ms |
| Après l'ouverture d'un panneau | 500–1200 ms |
| Avant le clic « Fait » | 300–900 ms |
| Avant le clic « Sauvegarder le brouillon » | 4–10 s |

Titre, description et prix sont tapés **caractère par caractère**. Coût : environ
30 s pour une description de 600 signes. Assumé — et pour le prix, c'est aussi la
parade n° 1 de §5.4.

Le tirage est une fonction pure `(min, max, alea) → ms`, testée avec un générateur
injecté.

### 5.6 Détecter le succès

Le clic sur « Sauvegarder le brouillon » déclenche
`POST /api/v2/item_upload/drafts` puis **redirige vers `/member/<id>`**. La page
`/items/new` disparaît, et avec elle le content script. Il n'y a pas de toast
exploitable.

Le succès se lit donc **depuis `background.js`**, par `tabs.onUpdated` sur l'onglet
qu'il a lui-même créé : une URL qui quitte `/items/new` pour `/member/` vaut
confirmation. Pas d'interception réseau, pas d'injection dans le monde de la page —
`tabs.onUpdated` suffit et ne coûte aucune permission de plus.

**Le bouton brouillon n'est jamais `disabled`**, même sur un formulaire vide : il ne
donne aucune information sur la complétion. L'extension vérifie elle-même que chaque
champ a bien pris avant de cliquer, et n'a droit à aucun raccourci.

### 5.7 États de sortie

| Statut | Sens | Suite |
|---|---|---|
| `echec-selecteurs` | un sélecteur introuvable, rien de commité | bannière, entrée gardée en file, onglet **laissé ouvert**, **pas de clic brouillon** |
| `succes-partiel` | un champ Vinted n'a pas pris, ou les photos manquent | idem : bannière, entrée gardée, onglet laissé ouvert, **pas de clic brouillon** |
| `succes` | tout rempli et vérifié, brouillon sauvegardé, redirection vue | entrée consommée, onglet fermé |

**Le clic brouillon n'a lieu que sur un remplissage complet.** Un brouillon à moitié
rempli sauvegardé automatiquement serait pire qu'un onglet laissé ouvert : il faut
aller le rechercher dans les brouillons Vinted pour le corriger, sans savoir ce qui
manque.

Un échec **suspend la chaîne** au lieu de passer à l'article suivant. Cinq brouillons
ratés à la suite coûtent plus cher qu'un seul, et la cause est presque toujours
commune (Vinted a changé son DOM).

---

## 6. La catégorie retenue : 246, Hommes > Accessoires > Sacs et sacoches

> **Corrigé le 2026-09-08.** Cette section disait l'inverse : elle retenait `157`
> (Femmes) et qualifiait `246` d'erreur de navigation. C'est `157` qui était
> l'erreur — elle vient de ce que le relevé automatique avait remonté la branche
> Femmes. Les sacs à dos vendus sont des sacs **homme** (Aramis, 2026-09-08).

**La catégorie visée est `246`, « Sacs à dos » sous Hommes > Accessoires > Sacs et
sacoches.**

Conséquence directe sur le remplissage : la recherche « Sacs à dos » renvoie
**plusieurs feuilles** portant le même libellé (246 Hommes, 157 Femmes, et l'équivalent
Enfants). Cliquer `#catalog-search-246-result` désambiguïse par l'id, mais un id qui
changerait chez Vinted ferait ranger les sacs dans le mauvais rayon **sans aucune
erreur visible**. On vérifie donc, avant de cliquer « Fait », que le fil d'Ariane de la
ligne choisie (`.web_ui__Cell__body`) vaut bien `Hommes > Accessoires > Sacs et
sacoches` ; sinon `echec-selecteurs`, et rien n'est validé.

Bonne nouvelle de ce changement : `246` est la seule des deux feuilles dont on ait
vérifié **en écriture** qu'elle accepte un brouillon (relevé du 2026-09-08). C'est
donc la mieux étayée des deux, pas la moins.

## 7. Tests

Vitest, environnement `node`, sur tout ce qui est pur :

| Cible | Ce qu'on vérifie |
|---|---|
| `pickVintedMapping` | correspondance exacte, casse, espaces, absence de mapping |
| `ETAT_VERS_CONDITION_ID` | les 5 libellés de `ETATS` ont tous un id |
| `MATIERE_VERS_MATERIAL_ID` | les 10 suggestions ont un id ; Coton/Coton piqué dédupliquent |
| `COULEURS_VINTED` | 29 entrées, ids uniques, hex non vide sauf Multicolore |
| `detailPublicationVinted` | `vinted` présent avec mapping, absent sans ; plafonds 2/2 tenus |
| ordonnanceur | file vide, une entrée, entrée `en-cours` dont l'onglet a disparu, ordre FIFO |
| tirage de délai | bornes respectées, min = max, fourchette inversée, générateur injecté |

Ce qui **ne** se teste **pas** ici : le remplissage du DOM Vinted réel. Il n'y a pas
de fixture honnête pour une page qu'on ne contrôle pas ; un faux DOM écrit à la main
testerait mes hypothèses, pas Vinted. La vérification est un passage réel dans le
Firefox d'Aramis, avec un article, en regardant le brouillon produit.

---

## 8. Hors périmètre

- **Le clic « Ajouter »** (publication réelle). Le sélecteur est connu
  (`upload-form-save-button`) ; le geste ne l'est pas.
- **Toute autre marque ou catégorie.** Chaque catégorie Vinted a ses propres champs
  (les sacs à main n'ont pas d'unisexe, les t-shirts ont une taille) : en ajouter une
  demande un relevé d'audit dédié, pas une ligne de mapping.
- **La suggestion de prix Vinted** (`POST /api/v2/item_price_suggestions`, repérée
  dans l'audit). `PrixReference` fait déjà ce travail côté MyFlip.
- **Toute nouvelle migration Prisma.** Ce chantier n'en ajoute aucune, délibérément :
  les deux existantes (`PrixReference`, `delai_vinted`) ne sont toujours pas
  appliquées en production et bloquent déjà la fusion.

---

## 9. Ce qui reste à la charge d'Aramis

1. ~~Trancher 157 ou 246~~ — tranché le 2026-09-08 : **246**, rayon Hommes (cf. §6).
2. Appliquer les migrations `PrixReference` et `delai_vinted` sur la base de
   production avant toute fusion dans `main`.
3. Peupler `PrixReference` dans `/parametres`, sans quoi le prix part vide.
4. Installer l'extension (`npx web-ext sign --channel=unlisted`) et faire le premier
   passage réel — tout MyFlip étant derrière l'authentification, aucun agent ne peut
   le faire à sa place.
5. **Au premier passage, ouvrir le brouillon créé et vérifier le prix** (§5.4). C'est
   le seul point du formulaire dont on sait qu'il a déjà échoué en silence.
