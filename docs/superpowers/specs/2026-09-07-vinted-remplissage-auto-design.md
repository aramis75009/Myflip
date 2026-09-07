# Design — Remplissage automatique du formulaire Vinted, scope Sacs à dos Nike

**Date** : 2026-09-07
**Branche** : `worktree-extension-vinted`
**Prédécesseur** : `2026-08-18-extension-vinted-design.md` (l'extension qui remplit
titre/description/prix/photos). Ce document en étend le périmètre, il ne le remplace pas.
**Sources externes** : `vinted_form_mapping.md` et
`vinted_form_mapping_complement_nike_backpack.md` — relevé du DOM et des API de
`vinted.fr/items/new` fait le 2026-09-07 en lecture seule sur un compte de test.

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

- `COULEURS_VINTED` : 29 entrées `{ id, libelle, hex }`.
- `MATERIAUX_VINTED` : 55 entrées `{ id, libelle }`.
- `ETAT_VERS_CONDITION_ID` : les 5 libellés MyFlip → id Vinted.
- `MATIERE_VERS_MATERIAL_ID` : les 10 suggestions MyFlip → id Vinted.

### 4.3 `lib/vintedMapping.ts` (neuf, pur)

```ts
export type MappingVinted = {
  marque: string;          // libellé MyFlip
  categorie: string;       // libellé MyFlip
  categoryId: number;      // 157
  brandId: number;         // 53
  packageType: 1 | 2 | 3;  // 1 = Petit
  unisex: boolean;         // true
  materiauxDefaut: number[]; // [45, 52] — Polyester, Nylon
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

D'après `vinted_form_mapping.md` §3, **marque, état, couleur, matériau, unisexe et
format de colis n'existent dans le DOM qu'après le choix d'une catégorie feuille.**
L'ordre est donc imposé :

1. **Catégorie** — ouvrir le panneau, taper `rechercheCategorie`, cliquer le résultat.
2. Attendre l'apparition du champ Marque (`MutationObserver`, plafond 10 s).
3. Marque → `brand-radio-53`.
4. État → `condition-radio-<id>`.
5. Couleur → `color-checkbox-<id>` ×1-2.
6. Matériau → `material-checkbox-<id>` ×0-2.
7. Unisexe → checkbox `#unisex`.
8. Colis → `package_type_selector_1`.
9. Titre, description, prix (code existant, setter natif).
10. Photos → `[data-testid="add-photos-input"]`, `DataTransfer`.
11. Pause, puis clic `upload-form-save-draft-button`.

Les listes déroulantes se remplissent **en cliquant l'option pendant que le panneau
est ouvert** — jamais par `input.value = …`. C'est le complément d'audit §5 :
les `input[type=radio]` sont démontés du DOM à la fermeture du panneau, et le champ
visible ne porte que le libellé.

**Attention au comportement FIFO** (complément §5) : au-delà de la limite de
sélection, Vinted décoche silencieusement la plus ancienne option au lieu de refuser
le clic. Une couleur de trop ne produit pas d'erreur, elle en évince une autre. On
ne coche donc jamais plus que la limite, on ne s'en remet pas au refus de Vinted.

### 5.4 Sélecteurs à confirmer

Ces six points ne sont pas dans les audits et sont demandés à Aramis. Tant qu'ils ne
sont pas connus, ils sont codés défensivement, avec repli sur la bannière « mise à
jour nécessaire » :

| # | Inconnue | Impact si faux |
|---|---|---|
| 1 | Le champ de recherche et la ligne de résultat **dans le panneau catégorie** | **Bloquant** : sans catégorie, aucun autre champ n'existe |
| 2 | Cliquer le champ visible suffit-il à ouvrir un panneau ? | Bloquant par champ |
| 3 | Comment refermer un panneau multi-sélection (bouton « Terminé » ?) | Le panneau reste ouvert et masque la suite |
| 4 | `add-photos-input` est-il bien le premier `input[type=file]` ? | Photos déposées sur le mauvais input |
| 5 | `upload-form-save-draft-button` est-il `disabled` tant que le formulaire est incomplet ? | Perte d'une vérification gratuite |
| 6 | La page reste-t-elle sur `/items/new` après le clic brouillon ? | Les deux cas sont codés ; sans l'info, on garde les deux |

### 5.5 Les délais

Consigne d'Aramis : « le plus sûr possible, la lenteur n'est pas un problème ».

| Geste | Attente |
|---|---|
| Entre deux articles | fourchette `/compte`, en minutes, tirée uniformément |
| Frappe d'un caractère | 25–70 ms |
| Entre deux champs | 400–1800 ms |
| Après l'ouverture d'un panneau | 500–1200 ms |
| Avant le clic « Sauvegarder le brouillon » | 4–10 s |

Titre et description sont tapés **caractère par caractère**, pas écrits d'un bloc :
un `<textarea>` de 600 signes rempli en 40 ms est le signal de robot le plus lisible
qui existe. Coût : environ 30 s par description. Assumé.

Le tirage est une fonction pure `(min, max, alea) → ms`, testée avec un générateur
injecté.

### 5.6 États de sortie

`remplirFormulaire()` garde son contrat à trois valeurs, enrichi :

| Statut | Sens | Suite |
|---|---|---|
| `echec-selecteurs` | rien trouvé, rien touché | bannière, entrée gardée en file, onglet **laissé ouvert** |
| `succes-partiel` | texte rempli, un champ Vinted manquant ou photos absentes | bannière, entrée gardée, onglet laissé ouvert, **pas de clic brouillon** |
| `succes` | tout rempli, brouillon sauvegardé | entrée consommée, onglet fermé |

**Le clic brouillon n'a lieu que sur un remplissage complet.** Un brouillon à moitié
rempli sauvegardé automatiquement serait pire qu'un onglet laissé ouvert : il faut
aller le rechercher dans Vinted pour le corriger.

---

## 6. Tests

Vitest, environnement `node`, sur tout ce qui est pur :

| Cible | Ce qu'on vérifie |
|---|---|
| `pickVintedMapping` | correspondance exacte, casse, espaces, absence de mapping |
| `ETAT_VERS_CONDITION_ID` | les 5 libellés de `ETATS` ont tous un id |
| `MATIERE_VERS_MATERIAL_ID` | les 10 suggestions ont un id ; Coton/Coton piqué dédupliquent |
| `COULEURS_VINTED` | 29 entrées, ids uniques |
| `detailPublicationVinted` | `vinted` présent avec mapping, absent sans ; plafonds 2/2 tenus |
| ordonnanceur | file vide, une entrée, entrée `en-cours` dont l'onglet a disparu, ordre FIFO |
| tirage de délai | bornes respectées, min = max, générateur injecté |

Ce qui **ne** se teste **pas** ici : le remplissage du DOM Vinted réel. Il n'y a pas
de fixture honnête pour une page qu'on ne contrôle pas ; un faux DOM écrit à la main
testerait mes hypothèses, pas Vinted. La vérification est un passage réel dans le
Firefox d'Aramis, avec un article, en regardant le brouillon produit.

---

## 7. Hors périmètre

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

## 8. Ce qui reste à la charge d'Aramis

1. Fournir les six inconnues de §5.4.
2. Appliquer les migrations `PrixReference` et `delai_vinted` sur la base de
   production avant toute fusion dans `main`.
3. Peupler `PrixReference` dans `/parametres`, sans quoi le prix part vide.
4. Installer l'extension (`npx web-ext sign --channel=unlisted`) et faire le premier
   passage réel — tout MyFlip étant derrière l'authentification, aucun agent ne peut
   le faire à sa place.
