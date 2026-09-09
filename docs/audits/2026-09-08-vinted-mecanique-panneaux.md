# Complément — Mécanique d'ouverture/fermeture des panneaux Vinted (formulaire "Vends ton article")

Ce document complète `2026-09-07-vinted-form-mapping.md` et
`2026-09-07-vinted-form-mapping-nike-backpack.md`. Il répond aux 6 points demandés sur la
mécanique DOM d'ouverture/fermeture des panneaux, nécessaire pour coder le remplissage
automatique par l'extension.

**Correction de scope importante** : cette exploration porte sur la catégorie **"Sacs à dos" sous Hommes > Accessoires > Sacs et sacoches, `category_id = 246`** — et non la catégorie "Sacs à dos" sous Femmes > Sacs (`category_id = 157`) utilisée dans les deux documents précédents. Les deux catégories partagent le même libellé affiché ("Sacs à dos") mais sont des feuilles différentes de l'arbre, avec des `category_id` différents. Bonne nouvelle : les champs disponibles et leur mécanique sont identiques sur les deux (unisexe présent, marque/état/couleur/matériau avec les mêmes structures), seul le `category_id` à envoyer change. **Si l'automatisation doit cibler 246, remplacer toutes les références à `category_id=157` des documents précédents par `246`.**

---

## 0. Découverte transversale — un seul et même composant pour tous les panneaux

Avant de détailler les 6 points : catégorie, marque, état, couleur et matériau utilisent tous le **même composant "InputDropdown"** sous le capot, avec la même mécanique d'ouverture/fermeture. Comprendre ce composant une fois permet de coder les 5 panneaux de la même façon.

Comportements communs observés :
- **Ouverture** : un simple clic sur le champ visible (l'`<input readonly>`) suffit — pas besoin de viser un chevron séparé (voir point 2).
- **Sélection** : cliquer une option (radio ou checkbox) coche/décoche immédiatement l'élément et met à jour le texte affiché dans le champ visible en temps réel — **mais ne ferme pas le panneau**, y compris pour les champs à choix unique (marque, état). C'est une correction par rapport à une impression précédente : la fermeture automatique n'existe pas, il faut toujours une action explicite de fermeture.
- **Fermeture avec sauvegarde** : bouton **"Fait"**, `data-testid="input-dropdown-save-button"` — commun à tous les panneaux (catégorie, marque, état, couleur, matériau). Le cliquer ferme le panneau ET conserve la sélection faite.
- **Fermeture sans sauvegarde ("annuler")** : bouton **"X"** en haut du panneau, `data-testid="<champ>-select-dropdown-close-button"` (ex. `color-select-dropdown-close-button`, `catalog-select-dropdown-close-button`). Le cliquer ferme le panneau mais **annule la sélection en cours** — testé sur couleur : après avoir coché Noir puis cliqué sur le X, le champ revient à vide au lieu d'afficher "Noir". **Piège à éviter absolument dans l'extension : ne jamais cliquer sur ce bouton pour fermer un panneau après sélection.**
- **Touche Échap** : **ne ferme pas** le panneau (testé sur couleur : panneau toujours ouvert après Échap, sélection intacte).
- **Clic à l'extérieur du panneau** (ex. sur le titre "Vends ton article") : **ne ferme pas non plus** le panneau (testé sur couleur : reste ouvert).

**Conclusion pratique pour l'extension** : après avoir coché/sélectionné les valeurs voulues dans n'importe quel panneau (catégorie, marque, état, couleur, matériau), toujours terminer par un clic explicite sur `[data-testid="input-dropdown-save-button"]`. C'est le seul moyen fiable et universel de fermer + valider.

---

## 1. Panneau catégorie — champ de recherche et structure d'une ligne résultat

- Champ de recherche à l'intérieur du panneau : **pas de `data-testid`**, mais un `id`/`name` stable : **`id="catalog-search-input"`** (`class="web_ui__InputBar__value"`, `maxlength="100"`).
- Taper dans ce champ déclenche `GET /api/v2/item_upload/catalogs/search?keyword=<texte>` (confirmé en observant le réseau après un `dispatchEvent(new Event('input', {bubbles:true}))` sur le champ — un simple événement `input` suffit à déclencher la recherche, pas besoin de simuler des `keydown` un par un).
- **Chaque ligne de résultat a bien un id numérique exploitable**, au format prévisible :
  - Conteneur cliquable (le vrai élément à cibler) : `id="catalog-search-<category_id>-result"`, `role="radio"`, `aria-checked="true|false"`, classe `web_ui__Cell__cell web_ui__Cell__clickable`.
  - Input radio associé (visuel uniquement, ne pas cibler celui-ci) : `id="catalog-search-<category_id>-radio"`, `aria-hidden="true"`, `tabindex="-1"` — **cliquer directement sur cet input ne suffit pas à déclencher la sélection de façon fiable** (voir point 2, le clic doit viser le conteneur `-result`, pas l'input caché).

Exemple exact rencontré en cherchant "Sacs à dos" :
```html
<li class="web_ui__Item__item web_ui__Item__with-divider">
  <div aria-checked="false" aria-posinset="1" aria-setsize="48"
       id="catalog-search-157-result"
       class="web_ui__Cell__cell web_ui__Cell__default web_ui__Cell__clickable"
       role="radio" tabindex="0">
    <div class="web_ui__Cell__content">
      <div class="web_ui__Cell__heading"><div class="web_ui__Cell__title">Sacs à dos</div></div>
      <div class="web_ui__Cell__body">Femmes &gt; Sacs</div>
    </div>
    <div class="web_ui__Cell__suffix">
      <label for="catalog-search-157-radio" class="web_ui__Radio__radio">
        <input id="catalog-search-157-radio" tabindex="-1" aria-hidden="true" type="radio" name="catalog-search-157-radio">
      </label>
    </div>
  </div>
</li>
```
Et pour la catégorie visée par l'automatisation : `id="catalog-search-246-result"` / `catalog-search-246-radio`, `Sacs à dos` / `Hommes > Accessoires > Sacs et sacoches`.

Le texte "Femmes > Sacs" ou "Hommes > Accessoires > Sacs et sacoches" dans `.web_ui__Cell__body` est le fil d'Ariane complet de la catégorie — très utile pour désambiguïser par du texte si jamais l'id venait à changer, ou pour vérifier automatiquement qu'on clique la bonne branche avant de valider.

**Après avoir cliqué le conteneur `-result` (voir point 2 pour la méthode de clic fiable), le panneau ne se ferme toujours pas automatiquement** — comme documenté au point 0, il faut cliquer `[data-testid="input-dropdown-save-button"]` ("Fait") pour valider la catégorie et faire apparaître les champs suivants (marque, état, couleur, matériau...).

---

## 2. Comment ouvrir chaque panneau

| Champ | Suffit-il de cliquer le champ visible ? | Détail |
|---|---|---|
| `catalog-select-dropdown-input` | ✅ Oui | Un clic simple ouvre le panneau (accueil avec 8 catégories racines + champ de recherche) |
| `brand-select-dropdown-input` | ✅ Oui | Idem — ouvre directement la liste "Marques populaires" + champ de recherche |
| `category-condition-single-list-input` | ✅ Oui | Ouvre directement la liste des 5 états |
| `color-select-dropdown-input` | ✅ Oui | Ouvre directement la liste des 29 couleurs |
| `category-material-multi-list-input` | ✅ Oui | Ouvre directement la liste des 55 matériaux |

Aucun de ces 5 champs n'a besoin qu'on vise un chevron ou une icône distincte : le chevron (`<champ>-chevron-down` / `<champ>-chevron-up`) n'est qu'un indicateur visuel qui change d'état en même temps que le panneau s'ouvre/ferme, il n'a pas besoin d'être cliqué séparément — cliquer n'importe où sur le champ `<input readonly>` (y compris via son `data-testid` principal) suffit.

⚠️ **Point d'attention sur le clic à l'intérieur du panneau une fois ouvert** : un `.click()` JS brut sur l'`input[type=radio/checkbox]` caché (`aria-hidden="true"`, `tabindex="-1"`) fonctionne de façon incohérente selon les cas testés — parfois il met à jour l'état interne (`aria-checked` passe à `true`) sans rafraîchir le texte affiché, parfois cela fonctionne du premier coup. **La méthode fiable à 100 % dans tous les tests de cette session** est de cliquer sur l'élément conteneur visible (le `<div role="radio">` / `<div role="checkbox">` parent, ou directement le libellé texte affiché) plutôt que sur l'input caché lui-même — c'est ce que ferait un vrai clic utilisateur, et c'est ce qu'une extension pilotant de vrais événements souris devrait naturellement faire.

---

## 3. Comment se referme un panneau multi-sélection (et, en réalité, tous les panneaux)

Testé précisément sur **Couleur** (choix multiple, max 2) :

1. Ouverture du panneau → cocher `color-checkbox-1` (Noir) → le champ affiche déjà "Noir" en direct, panneau toujours ouvert.
2. Testé **Échap** → panneau reste ouvert, valeur inchangée. **Ne fonctionne pas.**
3. Testé **clic en dehors du panneau** (sur le titre de page) → panneau reste ouvert. **Ne fonctionne pas.**
4. Testé **clic sur le bouton "X"** (`color-select-dropdown-close-button`) → panneau se ferme, **mais la sélection est perdue** (champ revient à vide). **Fonctionne pour fermer, mais annule tout — à ne jamais utiliser après une sélection qu'on veut garder.**
5. Testé **clic sur "Fait"** (`input-dropdown-save-button`) après avoir coché Noir + Gris → panneau se ferme et le champ affiche bien "Noir, Gris". **C'est la seule méthode qui ferme ET conserve la sélection.**

Comportement identique observé sur **Matériau** (Polyester + Nylon → "Fait" → champ affiche "Nylon, Polyester", ordre de la liste canonique et non ordre de clic, comme déjà noté dans le complément précédent).

**Réponse courte : bouton "Fait" (`input-dropdown-save-button`), toujours — ni Échap, ni clic extérieur, ni fermeture automatique ne fonctionnent.**

---

## 4. Unicité de l'input photos

Sur `vinted.fr/items/new` (page vide, avant tout remplissage), il y a **exactement un seul `input[type="file"]` sur toute la page** :

```json
{"testid":"add-photos-input","name":"photos","accept":"image/jpeg,image/gif,image/png,image/webp","multiple":true,"visible":false}
```

Vérifié par balayage de `document.querySelectorAll('input[type=file]')` sur la page complète (pas seulement dans le formulaire) : longueur du tableau = 1. Aucun input file caché trouvé dans le bandeau cookies (OneTrust) ni ailleurs sur cette page.

**Cela dit**, `visible:false` — l'input existe dans le DOM dès le chargement (il n'est pas démonté comme les panneaux radio/checkbox), mais il est masqué visuellement (technique classique de zone de dépôt stylée par-dessus). Donc `document.querySelector('input[type="file"]')` sans filtre est **actuellement sans risque sur cette page précise** (un seul candidat), mais je recommande quand même de garder le filtre `[data-testid="add-photos-input"]` en dur dans le code de l'extension plutôt que de compter sur l'unicité — un changement futur de la page (ex. ajout d'un widget de chat avec upload de fichier) pourrait introduire un second `input[type=file]` sans prévenir, et le sélecteur par `data-testid` reste stable et sans ambiguïté quoi qu'il arrive.

---

## 5. État du bouton "Sauvegarder le brouillon" (`upload-form-save-draft-button`)

**Testé à plusieurs stades de remplissage — le bouton n'est jamais `disabled`, à aucun moment :**

| État du formulaire | `disabled` | classes |
|---|---|---|
| Page vide (aucun champ rempli) | `false` | `web_ui__Button__button web_ui__Button__outlined web_ui__Button__default web_ui__Button__primary web_ui__Button__inline web_ui__Button__truncated` |
| Formulaire complet (catégorie, marque, état, couleur, matériau, unisexe, format colis, titre, prix — sans photo) | `false` | identique, aucune classe "disabled" ajoutée |

Le bouton **"Ajouter"** (`upload-form-save-button`, publication réelle) présente le même comportement : `disabled: false` même à l'état vide.

**Conclusion : ce bouton ne reflète PAS l'état de complétion du formulaire.** Il n'y a donc **aucune vérification gratuite possible** via l'attribut `disabled` avant de cliquer — Vinted valide manifestement côté clic (probablement avec affichage d'erreurs inline sous les champs manquants, non testé ici puisque le point 6 demandait justement un remplissage complet). L'extension devra implémenter sa propre logique de vérification de complétion (catégorie + éventuellement marque si authenticity check, etc.) avant de cliquer, plutôt que de se fier à cet attribut.

---

## 6. Résultat du clic réel sur "Sauvegarder le brouillon"

Formulaire rempli avant le clic (catégorie 246, sans photo) :

| Champ | Valeur envoyée |
|---|---|
| Titre | "Test sac a dos Nike (brouillon exploration)" |
| Catégorie | Sacs à dos (246) |
| Marque | Nike |
| État | Très bon état |
| Couleur | Noir, Gris |
| Matériau | Nylon, Polyester |
| Unisexe | coché |
| Format colis | Petit |
| Prix | "15" saisi |
| Photo | Aucune |

**Résultat observé après le clic :**

- Requête réseau déclenchée : `POST /api/v2/item_upload/drafts` → `200`.
- **La page ne reste pas sur `/items/new`** : redirection immédiate vers **`https://www.vinted.fr/member/<user_id>`** (le profil public du vendeur, onglet "Annonces"), pas vers une page dédiée à l'annonce ni vers une page de confirmation intermédiaire.
- **Aucun message de confirmation (toast/bannière) n'a pu être observé** — la redirection est trop rapide pour l'intercepter ; il est probable qu'un toast s'affiche brièvement sur la page de destination, mais ce n'est pas la mécanique à utiliser pour détecter le succès.
- **Le brouillon est bien créé et persiste** : vérifié via `GET /api/v2/wardrobe/<user_id>/items?cond=draft` qui retourne l'item nouvellement créé avec `is_draft:true`, `title`, `brand:"Nike"`, `status:"Très bon état"` correctement enregistrés, et `photos:[]` — **confirmant qu'une photo n'est pas obligatoire pour sauvegarder un brouillon.**
- ⚠️ **Découverte importante non demandée mais critique pour l'extension : le prix n'a PAS été enregistré** (`price: {"amount":"0.0"}` dans la réponse de l'API alors que "15" avait été saisi et s'affichait correctement "15,00 €" dans le champ juste avant le clic). Cause probable : le prix a été rempli via `input.value = "15"` + `dispatchEvent(new Event('input'))`, ce qui suffit à mettre à jour l'affichage formaté du champ mais **ne déclenche apparemment pas la mise à jour de l'état interne réellement soumis** (contrairement au titre, qui lui a bien été sauvegardé avec la même méthode). Le champ prix semble avoir une logique de validation/commit supplémentaire (probablement sur `blur` ou sur une séquence de frappe clavier réelle) qui n'est pas déclenchée par un simple événement `input` synthétique.

**Recommandation forte pour l'extension** : pour le champ prix spécifiquement, ne pas se contenter de `value + dispatchEvent('input')` — soit simuler une vraie frappe clavier caractère par caractère, soit ajouter un `dispatchEvent(new Event('blur', {bubbles:true}))` après avoir positionné la valeur, et **vérifier après coup** (ex. en relisant `input.value` après un court délai, ou en inspectant la réponse de `item_price_suggestions`/le state) que le prix a bien été pris en compte avant de cliquer sur "Sauvegarder le brouillon" ou "Ajouter". Ce piège toucherait très probablement aussi le clic sur "Ajouter" (publication réelle) — donc à corriger avant tout test de publication réelle avec un vrai prix.

**Conséquence pratique pour le comportement de l'extension** : puisque la sauvegarde redirige loin de `/items/new` sans confirmation visuelle fiable, l'extension doit détecter le succès soit par le changement d'URL (`/member/<id>`), soit — plus robuste — en observant la requête réseau `POST /api/v2/item_upload/drafts` elle-même et son code de statut, plutôt que d'attendre un élément visuel de confirmation sur la page.

---

## Tableau récapitulatif des sélecteurs stables identifiés dans ce complément

| Élément | Sélecteur stable |
|---|---|
| Champ de recherche catégorie | `#catalog-search-input` (pas de data-testid) |
| Ligne résultat recherche catégorie | `#catalog-search-<category_id>-result` (cliquer ceci, pas le `-radio`) |
| Bouton fermer+garder (tous panneaux) | `[data-testid="input-dropdown-save-button"]` ("Fait") |
| Bouton fermer+annuler (tous panneaux) | `[data-testid="<champ>-select-dropdown-close-button"]` (à éviter) |
| Input photos (unique sur la page) | `[data-testid="add-photos-input"]` |
| Bouton brouillon | `[data-testid="upload-form-save-draft-button"]` — jamais disabled, ne pas s'y fier pour valider la complétion |
