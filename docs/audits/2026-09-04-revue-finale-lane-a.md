# Revue finale — Lane A (MyFlip), branche `worktree-extension-vinted`

**Date** : 2026-09-04
**Périmètre** : `ed917d6..52dad5e` sur `app lib prisma components vitest.config.ts` — 1224 lignes, 22 fichiers.
**Méthode** : relecteur indépendant (Opus), contexte fraîchement construit, lecture seule.
**Vérifié pendant la revue** : `npx vitest run` → 145/145, `npx tsc --noEmit` → 0 erreur.

> **Lane B (le dossier `extension-vinted/`) n'a PAS été relue.** Le relecteur
> qui en avait la charge a été interrompu avant de rendre. Voir `HANDOFF.md`
> pour la recette de relance.

---

## Le constat qui compte : C1

**`prixVente` n'est jamais enregistré, et la colonne est écrasée à `null`.**

`app/mise-en-vente/page.tsx:370` envoie bien `prixVente`. Mais
`app/api/articles/[id]/route.ts:113-117` fait :

```ts
const derived = deriveVente({ statut, prixAchat, prixVente, dateVente });
data.prixVente = derived.prixVente;   // inconditionnel
```

et `deriveVente()` (`lib/calc.ts`) renvoie `prixVente: null` pour **tout**
statut différent de `Vendu` :

```ts
if (input.statut === STATUT_VENDU && input.prixVente != null) {
  return { prixVente: input.prixVente, ... };
}
return { prixVente: null, ... };
```

`enregistrer()` n'envoie jamais que `"Brouillon"` ou `"En vente"`. **Le prix
saisi au QCM n'atteint donc la base dans aucun cas.**

**Vérification indépendante** : les trois points ci-dessus ont été relus
directement après la remise du rapport, pas repris sur parole. `deriveVente`
renvoie bien `null` hors `Vendu`, la ligne 117 est bien inconditionnelle, et
`grep deriveVente lib/calc.test.ts` renvoie **0** — la fonction n'a aucun test.

### Pourquoi personne ne l'a vu

La route répond 200. L'update optimiste de `useUpdateArticle` affiche le prix
une fraction de seconde, puis l'invalidation de fin de boucle refetch et le
remet à `null`. Rien en console, rien en toast, rien dans les logs.

C'est le **troisième défaut à panne silencieuse** de cette branche, de la même
famille que les deux déjà corrigés (transport des photos, remplissage React) :
il réussit visiblement et échoue invisiblement.

Il a traversé six filets : revue CEO, revue Eng, revue Design, le plan,
l'étape de vérification manuelle de la Task 7, et l'audit du 03/09. La cause
commune : le design affirme
(`docs/superpowers/specs/2026-08-18-extension-vinted-design.md:66`) qu'« un
`prixVente` posé au statut `Brouillon` est stocké tel quel ». C'est faux —
`deriveVente` ne se contente pas de sauter le calcul des marges, elle annule
aussi le prix. Chaque relecture successive a repris cette affirmation au lieu
de lire ce que la route écrit. L'audit du 03/09 a vérifié le type
`PatchBody`, pas le comportement.

### La nuance qui change la correction

**Ce comportement préexiste sur `main`.** N'importe quel PATCH avec un statut
non-`Vendu` annule déjà `prixVente` aujourd'hui — c'est la sémantique actuelle
de la colonne : « prix de vente », vide tant que l'article n'est pas vendu.
Ce n'est donc pas une régression introduite par la branche.

Ce que la branche change, c'est le **sens** de la colonne : `prixVente` devient
aussi un « prix d'annonce », renseigné bien avant toute vente. Les deux sens
entrent en collision dans la même colonne.

La correction n'est donc pas un `if` à ajouter. Il faut trancher :

- soit `prixVente` porte les deux sens, et `deriveVente` doit préserver le prix
  hors `Vendu` — **ce qui change aussi le comportement de `/stock` et
  `/a-comptabiliser`**, qui appellent la même route (un article repassé de
  `Vendu` à `En stock` conserverait son prix au lieu de le perdre) ;
- soit le prix d'annonce mérite sa propre colonne, et `prixVente` garde son
  sens actuel.

Dans les deux cas : **ajouter un test sur `deriveVente`**, sans quoi le
prochain passage rejouera le bug.

### Ordre des blocages

Peupler `PrixReference` (R11 de l'audit du 03/09) ne suffira **pas** à faire
marcher la fonctionnalité. Le champ se pré-remplirait à l'écran, l'extension
recevrait bien le prix par le `CustomEvent` (qui lit `f.qcm.prix` en mémoire,
pas la base), mais le prix resterait introuvable dans `/stock`. R11 et C1 sont
deux blocages indépendants.

---

## Important

### I1 — Clic mort sur une fiche sans article résolu

Le bouton « Publier sur Vinted » (`_components/ExportAnnonces.tsx`) n'est gardé
que par `disabled={enregistrementEnCours}`, **jamais par `f.article`**.
`page.tsx:580` fait `void publierVinted(f)` et jette le booléen, et
`_publierVinted.ts` commence par `if (!f.article) return false;`.

Le clic ne produit alors **rien** : pas d'onglet, pas d'événement, pas de
message, aucun changement visuel. L'utilisateur reclique.

Atteignable : `_persistance.ts` restaure directement à l'étape 4 dès qu'une
annonce a survécu, **avant** que la recherche de SKU ait résolu. Si elle échoue
(SKU supprimé, réseau, 500), on reste à l'étape 4 avec un bouton mort.

**Correction** : ajouter `f.article` au `disabled`, et faire remonter l'échec
de `publierVinted` (toast, ou `dispatch({ type: "enregistrement/echec" })` qui
réutilise l'affichage par fiche existant).

### I2 — Publication réussie sans aucune photo après restauration de session

Même chemin, mais quand la recherche de SKU **réussit**. `_persistance.ts`
documente que les photos ne survivent pas (« un `Blob` ne rentre pas dans
`sessionStorage` »). `f.photos` vaut `[]`, et `detailPublicationVinted()`
émet un événement avec un tableau vide.

L'article passe en `Brouillon`, l'onglet s'ouvre, l'extension file une entrée
sans photo, remplit le texte, et n'ayant aucune photo à injecter n'a aucune
raison de signaler un échec partiel. **Une annonce Vinted sans photo est
produite et personne n'est prévenu.**

Plus grave que I1 : ça réussit au lieu d'échouer.

**Correction** : garder `publierVinted` sur `f.photos.length > 0`, ou exiger
une confirmation explicite. Le garde appartient à Lane A — c'est elle qui
décide de ce qui part.

### I3 — Une 500 de `/api/prix` s'affiche comme « Aucun prix de référence »

`app/parametres/page.tsx:205` : `const { data: prixRefs = [], isLoading } =
usePrixReferences();`. Aucun `isError`. En React Query v5, sur erreur
`isPending` retombe à `false`, donc la branche « liste vide » s'affiche.

**C'est l'état garanti de la production entre la fusion et l'application des
migrations** : `/api/prix` répondra 500 (table absente) et l'UI annoncera
sereinement qu'il n'y a rien à afficher.

L'audit du 03/09 qualifiait cette dégradation de « contenue, rien ne plante ».
**Ce jugement était faux** : une erreur serveur rendue comme un état vide
légitime est indiscernable du cas nominal.

Même défaut, plus discret, dans `_components/FicheArticle.tsx` : si le GET
échoue, le prix ne se pré-remplit pas, sans explication.

### I4 — Une entrée « Toutes marques × Toutes catégories » non-défaut est inapplicable

`submitPrix` ne valide que `prix > 0`. Rien n'empêche d'enregistrer
`marque = Toutes`, `categorie = Toutes`, `estDefaut = false` : les deux critères
deviennent `null`, et `pickPrix()` ne peut la sélectionner à aucun des quatre
niveaux. L'entrée s'affiche normalement et n'est **jamais** appliquée.

Le design avait laissé la question ouverte (ligne 318, « marque/catégorie vides
ou dupliquées → à définir en implémentation ») ; elle n'a jamais été tranchée,
et la valeur par défaut du formulaire est précisément `TOUTES`/`TOUTES`.

### I5 — Le champ « Prix suggéré » ne peut plus être vidé

`_components/FicheArticle.tsx:137-141` : `qcm.prix` est dans les dépendances de
l'effet de pré-remplissage. Dès que l'utilisateur vide le champ, l'effet se
redéclenche et réécrit la suggestion. Taper `30` après avoir vidé donne `2530`.

L'invariant documenté (« ne jamais écraser un `qcm.prix` non vide ») est
respecté ; c'est son revers qui n'a pas été pensé — l'état vide n'est jamais
stable.

**Correction** : un `useRef` « suggestion déjà posée » plutôt que la lecture de
`qcm.prix` en dépendance.

### I6 — Une fourchette de délai refusée par le serveur part quand même dans l'extension

`components/compte/ExtensionVinted.tsx` : en cas d'erreur, `onError` affiche un
toast mais **ne rétablit pas l'état local**. Or `content-myflip.js` s'abonne au
`change` natif des deux `<input>`, qui se déclenche au même instant que le
`onBlur` — donc **avant** la réponse du PUT.

L'utilisateur passe le minimum de 3 à 10 alors que le maximum vaut 8 : le
serveur refuse, et l'extension a déjà copié une fourchette inversée `10 / 8`
qu'elle gardera jusqu'à la prochaine visite de `/compte` avec des valeurs
valides.

Aggravation de R8 : celui-ci parle d'une valeur **périmée**, ici il s'agit
d'une valeur **invalide, refusée par le serveur, et propagée quand même**.

### I7 — `noopener` contre `openerTabId` · À CONFIRMER EN NAVIGATEUR

`page.tsx:408` ouvre l'onglet avec
`window.open(url, "_blank", "noopener,noreferrer")` (repris tel quel du plan,
ce n'est pas un écart). Or tout l'appariement repose sur `openerTabId` :
`background.js` fait `if (tab.openerTabId == null) return;` — un `return` sec,
sans log ni bannière.

`noopener` met l'`opener` du nouveau contexte à `null` au sens de la
spécification HTML. **Si Firefox en déduit l'absence d'`openerTabId`,
l'appariement n'a jamais lieu** : aucune entrée assignée, `content-vinted.js`
reste neutre, rien ne remplit. Panne totale et muette, même famille que R2.

Non tranché sans navigateur : `openerTabId` vient de la relation d'onglet côté
`tabbrowser`, qui n'est pas strictement `window.opener`, et le comportement a
bougé selon les versions.

**Vérification, deux minutes** : `about:debugging`, cliquer « Publier sur
Vinted », regarder si `tabs.onCreated` reçoit un `openerTabId` non nul. Si non,
retirer `noopener` — il n'apporte rien ici, la page ouverte n'ayant aucun usage
de `window.opener`.

### Contrainte sur R12 (découverte par cette revue)

Des deux issues proposées par l'audit du 03/09 pour R12, **« naviguer un onglet
déjà ouvert » ne déclenche aucun `tabs.onCreated` et supprime donc
l'appariement à la racine.** Seule « ouvrir l'onglet au clic, puis le fermer si
le PATCH échoue » est compatible avec l'architecture actuelle — `pairing.js`
documente qu'un événement orphelin reste non apparié sans décaler les suivants.

---

## Mineur

- **`prisma/migrations/20260818000000_add_prix_reference/migration.sql` n'a pas
  l'en-tête d'avertissement du dépôt.** Les autres migrations écrites à la main
  portent toutes le bloc « ⚠️ MIGRATION ÉCRITE À LA MAIN — `prisma migrate dev`
  / `db push` produisent un `DROP COLUMN "photosPretes"` : les refuser ».
  Celle-ci a l'apparence d'un fichier généré. C'est celle que quelqu'un
  régénérera. (`20260818200000_add_delai_vinted` l'a bien.)
- **`CREATE TABLE` / `ADD COLUMN` sans `IF NOT EXISTS`.** Si la prod a déjà reçu
  un `prisma db push`, `migrate deploy` échouerait sur « relation already
  exists », marquerait la migration en échec et bloquerait toutes les
  suivantes.
- **`lib/hooks.ts`, docstring de `useSetDelaiVinted` : périmée.** Elle affirme
  que la validation serveur ne compare que les champs présents dans le corps —
  faux depuis `f7fcee8`. Dans un dépôt où les commentaires portent les
  invariants, un commentaire périmé est un piège.
- **`app/parametres/page.tsx:259` — `supprimerPrix.mutate(p.id)` sans
  `onError`.** Un DELETE en échec ne produit rien. Défaut hérité du code des
  prompts.
- **`critere()` lève sur une valeur non-string** : un `marque` envoyé en nombre
  fait planter `v.trim()`, rendu en 500 au lieu d'un 400. Hérité de
  `/api/prompts`.
- **PATCH avec un corps vide** réussit et bouge `updatedAt`.
- **Doublons `(marque, categorie)` autorisés**, aucune contrainte d'unicité :
  deux entrées « Lacoste · Polo » rendent le pré-remplissage non déterministe
  (`orderBy` ne les départage pas). Question laissée ouverte par le design.
- **Aucune borne supérieure sur `prix`** : `999999999` passe.
- **Pas de validation inline sur le champ prix du QCM**, alors que le design la
  demandait explicitement (ligne 720). Seul écart du lot qui retire quelque
  chose au design au lieu d'ajouter.
- **`step={0.5}`** sur un champ adossé à un `Float` libre : une suggestion à
  22,90 € rend l'`<input>` `:invalid`. Cosmétique.
- **`copier()` n'attrape pas le rejet de `navigator.clipboard.writeText`** :
  rejet non géré et zéro retour visuel si l'écriture échoue.
- **`onBlur={enregistrerFourchette}`** envoie un PUT même sans modification, et
  passer de min à max au clavier envoie un état intermédiaire souvent invalide.
- **`min === max` refusé** : un délai fixe est impossible. Conforme au design,
  mais à savoir.
- **Duplication `pickPrix` / `pickPrompt`** : 40 lignes identiques au type
  près. Défendable, mais un générique partagé rendrait toute dérive future
  impossible.

---

## Points forts (vérifiés, pas supposés)

- **`_publierVinted.ts` : l'invariant est réel, pas décoratif.** Fonction pure à
  effets injectés, couverte dans les deux sens. Le test « passe l'id CLIENT,
  jamais l'id article » commence par asserter que la fixture a bien
  `f.id !== f.article.id` — il échoue donc bruyamment si quelqu'un aligne un
  jour les deux et rend le test creux.
- **L'implémentation corrige un bug du plan.** Le plan (Task 8, ligne 874)
  écrit `enregistrer([f.article.id], …)`, qui ne matche jamais aucune fiche :
  aucun PATCH ne serait parti et la publication aurait été structurellement
  impossible. Le code utilise `f.id` et documente pourquoi.
- **Les migrations sont strictement additives** et écrites à la main **contre**
  le plan, qui demandait `prisma migrate dev` (Tasks 1 et 9) — ce qui aurait
  produit le `DROP COLUMN "photosPretes"` que tout le dépôt interdit. Écart
  justifié.
- **Multi-tenance : aucun trou.** `findFirst({ id, userId })` avant PATCH,
  `deleteMany({ id, userId })` + contrôle de `count` pour DELETE, `updateMany`
  du singleton `estDefaut` scopé par `userId` dans la transaction.
- **`enregistrer()` renvoie la bonne valeur pour le cas mono-id**, y compris sur
  le chemin « fiche sautée » : le `continue` laisse l'id hors du Set, donc
  `ids.every(...)` renvoie `false`. Le saut silencieux ne peut pas se faire
  passer pour un succès.
- **La validation `delaiVinted*` est meilleure que le plan** : relecture de la
  borne absente en base avant comparaison, et `Number.isInteger` au lieu du
  `Number.isFinite` du plan (correct pour une colonne `Int`).
- **`pickPrix()` est bien un calque exact de `pickPrompt()`**, comparaison ligne
  à ligne faite.

---

## Évaluation

**Prêt à fusionner ?** **Avec corrections.**

C1 rend la Task 7 entièrement inopérante et écrit `null` dans
`Article.prixVente` à chaque enregistrement depuis `/mise-en-vente`, sans aucun
signal côté UI, logs ou tests. Le reste (I1 à I6) tient en une poignée de gardes
et de `onError` sur des fichiers déjà écrits. L'infrastructure — migrations
additives, cloisonnement `userId`, invariant de publication testé — est saine
et ne demande aucune reprise.

**Ordre recommandé** :

1. Trancher la sémantique de `prixVente` (C1) + test sur `deriveVente`
2. I1, I2, I3 — les trois pannes silencieuses restantes
3. Appliquer les deux migrations sur la base de production
4. Vérifier I7 en navigateur, et trancher R12 (une seule issue reste possible)
5. **Faire relire Lane B**, jamais relue
6. Fusionner
