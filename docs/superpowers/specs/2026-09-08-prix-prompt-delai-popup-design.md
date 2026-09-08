# Design — Le prix dans le prompt, le délai dans un pop-up

**Date** : 2026-09-08
**Branche** : `worktree-extension-vinted`
**Prédécesseur** : `2026-09-07-vinted-remplissage-auto-design.md`, qui a livré le
remplissage automatique du formulaire Vinted. Ce document ne le remplace pas : il
déplace deux réglages que ce chantier avait laissés au mauvais endroit.

---

## 1. Ce qu'on construit, en une phrase

Le prix de référence rejoint le prompt qui le concerne, et la fourchette de délai
anti-ban se choisit dans un pop-up au moment de lancer la mise en brouillon — au lieu
d'être un réglage de compte que l'extension va lire dans le DOM de `/compte`.

---

## 2. Pourquoi — les deux irritants

**La même chose saisie deux fois.** `PromptTemplate` et `PrixReference` ont la même
clé en base : `marque` + `categorie` nullables, plus un `estDefaut`. Créer un prompt
« sac à dos Nike » et lui donner un prix demande donc deux entrées, dans deux listes,
sur la même page `/parametres`. C'est le doublon qu'Aramis a signalé.

**Un réglage lu dans le DOM.** L'extension n'a aucune API MyFlip à interroger — c'est
un invariant de design assumé. Pour connaître la fourchette de délai,
`content-myflip.js` **lit la valeur des deux `<input>` affichés sur `/compte`** et la
recopie dans `browser.storage.local`, en écoutant à la fois l'événement `change` et la
transition `disabled` → activé. C'est le mécanisme le plus fragile du chantier, et il
produit un mode de panne muet : si `/compte` n'a jamais été visité, la file ne démarre
pas et rien à l'écran ne le dit.

Le pop-up supprime les deux : le délai est choisi au moment où il sert, et voyage avec
le lot au lieu d'être stocké puis relu.

---

## 3. Décisions prises avec Aramis le 2026-09-08

| Question | Décision |
|---|---|
| Ce que le prompt gagne | **Le prix seul.** Pas la matière, pas la taille, pas la catégorie Vinted. |
| La liste « Prix de référence » de `/parametres` | **Elle disparaît.** Le prix ne vit plus que dans le prompt. |
| Le réglage de délai dans `/compte` | **Il disparaît**, avec ses deux colonnes en base. |
| Le tout premier article d'un lot | **Il part tout de suite.** Le délai ne joue qu'entre les annonces. |
| Précision du délai | **Minutes entières.** Les secondes ont été écartées explicitement. |

Ce que le prompt ne porte **pas**, et pourquoi : rendre `categoryId` éditable
obligerait Aramis à connaître les identifiants Vinted par cœur. La catégorie reste
dans `lib/vintedMapping.ts`, où elle est vérifiée par le fil d'Ariane avant toute
validation. Cette réserve vient de la spec précédente (§4.3) et tient toujours.

---

## 4. Le prix dans le prompt

### 4.1 La base

`PromptTemplate` gagne un champ, et un seul :

```prisma
prixReference Float?   // prix pré-rempli dans le QCM ; null = pas de prix pour ce prompt
```

`Float?` et non `Decimal` : c'est la forme qu'a déjà `PrixReference.prix`, et le champ
ne sert qu'à pré-remplir un `<input>` — il n'entre dans aucun calcul monétaire.

Le modèle `PrixReference` **disparaît**, avec sa route `/api/prix` et ses deux
handlers `[id]`.

### 4.2 Les migrations en attente

Deux migrations sont écrites mais **jamais appliquées en production** :
`20260818000000_add_prix_reference` et `20260818200000_add_delai_vinted`.

Elles sont appliquées sur la base de **dev**, ce qui interdit de les réécrire — Prisma
détecterait la dérive de somme de contrôle. Vérifié le 2026-09-08 :
`npx prisma migrate status` répond « 11 migrations found » et « Database schema is up
to date » sur l'endpoint dev `ep-autumn-morning-asmqan0o`. On ajoute donc **une
migration de plus**,
qui porte l'état final : elle ajoute `prixReference` à `PromptTemplate`, supprime la
table `PrixReference`, et supprime les deux colonnes `delaiVintedMinMinutes` /
`delaiVintedMaxMinutes`.

La production, qui n'a vu aucune des trois, les appliquera d'affilée et atterrira
directement dans l'état voulu. La table intermédiaire y existera le temps d'une
transaction.

⚠️ **Conséquence à ne pas manquer** : cette migration DÉTRUIT la table
`PrixReference`. Sur la base de dev, elle est peuplée. Les prix qui s'y trouvent
doivent être reportés dans les prompts correspondants **avant** de l'appliquer, ou ils
sont perdus. La migration ne fait pas ce report : elle ne peut pas deviner quel prompt
correspond à quel prix quand plusieurs correspondent.

### 4.3 L'écran

Sur `/parametres`, le formulaire de prompt gagne un champ « Prix de référence (€) »,
facultatif. Il apparaît **à la création et à la modification** — Aramis a déjà un
prompt « sac à dos Nike » et doit pouvoir lui ajouter le prix sans le recréer.

Le bloc « Prix de référence » et sa table disparaissent de la page.

### 4.4 La résolution du prix

`lib/pickPrix.ts` disparaît. `pickPrompt()` (dans `lib/promptSelect.ts`) fait déjà
**exactement la même cascade**, au corps près : correspondance marque + catégorie, puis
marque seule, puis catégorie seule, puis le défaut. Les deux fonctions sont une
duplication littérale l'une de l'autre, avec le même `norm()` et le même ordre — c'est
la preuve la plus directe que ces deux tables n'auraient jamais dû être séparées. Le
prompt résolu portant désormais son prix, une seule résolution suffit.

Les tests de `lib/pickPrix.test.ts` qui portent sur la cascade sont déjà couverts par
ceux de `pickPrompt` : ils ne sont pas à reporter, seulement à supprimer avec le
fichier.

Dans `FicheArticle.tsx`, l'effet qui pré-remplit le prix lit le prompt correspondant au
lieu de la liste de prix. **L'invariant ne bouge pas** : ne jamais écraser un
`qcm.prix` non vide, qu'il vienne d'une saisie manuelle ou d'un pré-remplissage
antérieur.

---

## 5. Le délai dans un pop-up

### 5.1 Le geste

Au clic sur « Tout mettre en brouillon sur Vinted » (étape 4), un pop-up s'ouvre avant
que quoi que ce soit ne parte. Il propose :

- un **délai fixe** : un champ, en minutes ;
- ou une **fourchette aléatoire** : deux champs, entre X et Y minutes.

Un bouton confirme et lance la chaîne ; annuler ne met rien en file.

Le bouton « Publier sur Vinted » d'une fiche seule ouvre le même pop-up. Un article
seul n'a pas de délai « entre annonces », mais il peut rejoindre une file déjà en
cours, et c'est alors ce réglage qui s'applique à son tour.

### 5.2 Ce qui est retenu

Le dernier réglage est gardé dans le `localStorage` du navigateur, pas en base : ça
n'a pas à survivre à un changement de machine, et ça évite une colonne. Au premier
lancement, la valeur par défaut est une fourchette de 2 à 5 minutes.

### 5.3 Le transport

Le délai part avec la charge utile du `CustomEvent("myflip:publier-vinted")`, à côté du
bloc `vinted` :

```ts
delai: { minMinutes: number; maxMinutes: number }
```

Un délai fixe est exprimé `minMinutes === maxMinutes`. Ce n'est pas un cas particulier
à coder : `tirerDelaiMs(min, max, alea)` traite déjà l'égalité, et un test le couvre.

`content-myflip.js` le transmet tel quel dans le message `myflip:mise-en-file`, comme
il le fait déjà pour `vinted`. `background.js` le stocke sur l'entrée de file.

**Chaque entrée porte donc son propre délai.** C'est ce qui permet à deux lots lancés
avec des réglages différents de s'enchaîner correctement au lieu que le second impose
le sien au premier.

### 5.4 Le premier article ne l'attend pas

`prochaineAction` renvoie aujourd'hui `"planifier"` pour toute entrée sans `cibleMs`,
donc le premier article attend comme les autres. Il faut distinguer le premier :
lorsqu'aucune entrée n'a encore été traitée dans la file, `cibleMs` est posé à
`Date.now()` au lieu d'un tirage.

Le critère retenu : **la file ne contient aucune entrée « en-cours », et aucune entrée
n'a encore de `cibleMs`**. C'est vrai exactement au premier passage d'un lot.

Cette logique vit dans `file.js`, en fonction pure, et se teste — c'est la raison pour
laquelle l'ordonnanceur y a été extrait.

### 5.5 Ce qui disparaît

- `components/compte/ExtensionVinted.tsx`, et la section correspondante de `/compte`.
- Les deux colonnes `delaiVintedMinMinutes` / `delaiVintedMaxMinutes` et leur
  validation dans `app/api/user/settings/route.ts`.
- Dans `content-myflip.js` : `synchroniserDelaiVinted()`, `copierDelaiVersStorage()`
  et leurs deux signaux d'écriture — la lecture du DOM de `/compte` n'a plus d'objet.
- Dans `background.js` : `lireDelaiRegle()` et la branche qui refuse de planifier sans
  fourchette réglée. Le délai arrive désormais avec l'entrée.

Le README de l'extension perd sa section « Le délai doit être réglé », qui décrivait un
mode de panne qui n'existe plus.

---

## 6. Tests

Vitest, environnement `node`, sur ce qui est pur :

| Cible | Ce qu'on vérifie |
|---|---|
| `pickPrompt` | le prompt résolu porte son `prixReference` ; `null` quand le prompt n'en a pas |
| `prochaineAction` | le premier article d'une file part sans attendre ; le deuxième attend |
| entrée de file | le `delai` porté par l'entrée est bien celui utilisé pour son tirage |

Ce qui **ne** se teste **pas**, comme précédemment : le rendu React (le pop-up, le champ
de prompt) et le DOM Vinted. La vérification est un passage réel.

---

## 7. Hors périmètre

- **La matière, la taille et la catégorie dans le prompt.** Décision explicite du
  2026-09-08 : le prix seul pour l'instant.
- **Les délais en secondes.** Écartés explicitement ; minutes entières.
- **Le report automatique des prix existants** de `PrixReference` vers les prompts.
  Aramis le fait à la main avant la migration — il y en a peu, et deviner la
  correspondance quand plusieurs prompts collent serait pire que de ne rien faire.

---

## 8. Ce qui reste à la charge d'Aramis

1. **Reporter les prix de `PrixReference` dans les prompts** avant d'appliquer la
   migration, sinon ils sont perdus.
2. Appliquer les migrations en production avant toute fusion dans `main` —
   `vercel.json` s'arrête à `prisma generate`.
3. Le premier passage réel de l'extension, et la vérification du prix du brouillon
   créé. Toujours pas fait, et toujours le seul vrai inconnu du chantier.
