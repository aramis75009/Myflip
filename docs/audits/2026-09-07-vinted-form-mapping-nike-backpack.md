# Complément — Vinted "Sacs à dos" (category_id=157), scope Nike uniquement

Ce document complète `vinted_form_mapping.md` (cartographie générale du formulaire). Il ne couvre que les points manquants demandés pour finaliser l'étape 0, scope resserré : **catégorie = Sacs à dos, marque = Nike**. Exploration en lecture seule, aucune annonce publiée, sur le même compte de test.

---

## 1. ID exact de la marque "Nike"

`GET /api/v2/item_upload/brands?keyword=Nike&category_id=157`

```json
{
  "id": 53,
  "title": "Nike",
  "requires_authenticity_check": true,
  "is_luxury": true,
  "is_hvf": true,
  "has_children": false
}
```

**→ `brand_id = 53`** (ne pas confondre avec Jordan id 2703, Nike Air id 5977, Nike SB id 283953, Nike Mercurial id 370427, Nike Sportswear id 5774166, Nike ACG id 687713, NIK&NIK id 941408 / 6587303, Nikelodeon id 5746884 — tous des matches proches sur "Nike" renvoyés par la recherche).

`requires_authenticity_check: true` confirme que Nike déclenche potentiellement le contrôle anti-contrefaçon Vinted (cf. `offline_verification/criteria/157` déjà documenté : champs requis = `brand` + `price`).

---

## 2. JSON brut complet — `POST /api/v2/item_upload/attributes` (category_id=157)

Capturé intégralement (non tronqué), c'est la source de vérité pour tous les id numériques de cette catégorie :

```json
{
  "code": 0,
  "message": null,
  "attributes": [
    { "code": "unisex", "value_ids": null, "value": null, "configuration": null },
    { "code": "brand", "value_ids": null, "value": null, "configuration": null },
    {
      "id": 431,
      "code": "condition",
      "value_ids": null,
      "value": null,
      "configuration": {
        "title": "État",
        "description": null,
        "placeholder": "",
        "field_placeholder": "Sélectionne un état",
        "validation_error_message": "",
        "display_type": "list",
        "selection_type": "single",
        "selection_limit": 1,
        "sorting_order": null,
        "required": true,
        "banner": null,
        "options": [
          {
            "id": 1,
            "title": "Condition",
            "group_title": null,
            "type": "group",
            "options": [
              { "id": 6, "title": "Neuf avec étiquette", "description": "Article neuf, jamais porté/utilisé avec étiquettes ou dans son emballage d’origine.", "type": "default", "has_children": false },
              { "id": 1, "title": "Neuf sans étiquette", "description": "Article neuf, jamais porté/utilisé, sans étiquettes ni emballage d’origine.", "type": "default", "has_children": false },
              { "id": 2, "title": "Très bon état", "description": "Article très peu porté/utilisé qui peut présenter de légères imperfections, mais qui reste en très bon état. Précise avec des photos et une description détaillée, les défauts de ton article.", "type": "default", "has_children": false },
              { "id": 3, "title": "Bon état", "description": "Article porté/utilisé quelques fois, présentant des imperfections et des signes d’usure. Précise avec des photos et une description détaillée, les défauts de ton article.", "type": "default", "has_children": false },
              { "id": 4, "title": "Satisfaisant", "description": "Article porté/utilisé plusieurs fois, présentant des imperfections et des signes d’usure. Précise avec des photos et une description détaillée, les défauts de ton article.", "type": "default", "has_children": false }
            ]
          }
        ]
      }
    },
    { "code": "color", "value_ids": null, "value": null, "configuration": null },
    {
      "id": 8,
      "code": "material",
      "value_ids": null,
      "value": null,
      "configuration": {
        "title": "Matériau (recommandé)",
        "description": null,
        "placeholder": "Sélectionne jusqu'à %{count} options",
        "field_placeholder": "Sélectionne un matériau",
        "validation_error_message": "Merci de sélectionner une matière",
        "display_type": "list",
        "selection_type": "multi",
        "selection_limit": 3,
        "sorting_order": null,
        "required": false,
        "banner": null,
        "options": [
          {
            "id": 1,
            "title": "Matière",
            "group_title": null,
            "type": "group",
            "options": [
              { "id": 468, "title": "Acier" }, { "id": 149, "title": "Acrylique" }, { "id": 122, "title": "Alpaga" },
              { "id": 461, "title": "Argent" }, { "id": 440, "title": "Bambou" }, { "id": 467, "title": "Bois" },
              { "id": 123, "title": "Cachemire" }, { "id": 301, "title": "Caoutchouc" }, { "id": 442, "title": "Carton" },
              { "id": 44, "title": "Coton" }, { "id": 43, "title": "Cuir" }, { "id": 447, "title": "Cuir synthétique" },
              { "id": 305, "title": "Cuir verni" }, { "id": 443, "title": "Céramique" }, { "id": 298, "title": "Daim" },
              { "id": 303, "title": "Denim" }, { "id": 455, "title": "Dentelle" }, { "id": 445, "title": "Duvet" },
              { "id": 446, "title": "Fausse fourrure" }, { "id": 448, "title": "Feutre" }, { "id": 451, "title": "Flanelle" },
              { "id": 454, "title": "Jute" }, { "id": 46, "title": "Laine" }, { "id": 302, "title": "Latex" },
              { "id": 146, "title": "Lin" }, { "id": 456, "title": "Maille" }, { "id": 152, "title": "Mohair" },
              { "id": 449, "title": "Mousse" }, { "id": 444, "title": "Mousseline" }, { "id": 121, "title": "Mérinos" },
              { "id": 457, "title": "Métal" }, { "id": 52, "title": "Nylon" }, { "id": 178, "title": "Néoprène" },
              { "id": 453, "title": "Or" }, { "id": 463, "title": "Paille" }, { "id": 458, "title": "Papier" },
              { "id": 177, "title": "Peluche" }, { "id": 462, "title": "Pierre" }, { "id": 300, "title": "Plastique" },
              { "id": 120, "title": "Polaire" }, { "id": 45, "title": "Polyester" }, { "id": 459, "title": "Porcelaine" },
              { "id": 460, "title": "Rotin" }, { "id": 311, "title": "Satin" }, { "id": 226, "title": "Sequin" },
              { "id": 470, "title": "Silicone" }, { "id": 49, "title": "Soie" }, { "id": 441, "title": "Toile" },
              { "id": 464, "title": "Tulle" }, { "id": 465, "title": "Tweed" }, { "id": 466, "title": "Velours" },
              { "id": 299, "title": "Velours côtelé" }, { "id": 452, "title": "Verre" }, { "id": 48, "title": "Viscose" },
              { "id": 53, "title": "Élasthanne" }
            ]
          }
        ]
      }
    }
  ]
}
```

(Descriptions omises pour Coton/Cuir/etc. dans le tableau matériau ci-dessus — toutes vides dans le JSON source, comme pour l'ensemble de la liste matière.)

**Point important pour le point 6 (unisexe)** : `unisex` **apparaît bien dans la liste `attributes`** au même niveau que `brand` et `color`, mais avec `"configuration": null`. Cela confirme que ce n'est **pas un attribut piloté par une liste d'options** (contrairement à `condition` ou `material`) : c'est juste un indicateur "ce champ s'applique à cette catégorie", et le champ réel est une simple checkbox HTML indépendante (`id="unisex" name="unisex"`, pas de `data-testid`, `aria-label="Unisexe"`). Donc : oui, "unisex" fait partie du payload `attributes` de la catégorie 157 (comme code de champ activé), mais son état (coché/non coché) n'est pas géré via ce payload — c'est un booléen simple envoyé séparément.

---

## 3. IDs numériques du matériau — tableau complet

Extraits du JSON ci-dessus (55 valeurs). Les deux demandées explicitement :

| Libellé | id |
|---|---|
| **Polyester** | **45** |
| **Nylon** | **52** |

Tableau complet (id → libellé) :

| id | Libellé | id | Libellé | id | Libellé |
|---|---|---|---|---|---|
| 468 | Acier | 454 | Jute | 462 | Pierre |
| 149 | Acrylique | 46 | Laine | 300 | Plastique |
| 122 | Alpaga | 302 | Latex | 120 | Polaire |
| 461 | Argent | 146 | Lin | 45 | Polyester |
| 440 | Bambou | 456 | Maille | 459 | Porcelaine |
| 467 | Bois | 152 | Mohair | 460 | Rotin |
| 123 | Cachemire | 449 | Mousse | 311 | Satin |
| 301 | Caoutchouc | 444 | Mousseline | 226 | Sequin |
| 442 | Carton | 121 | Mérinos | 470 | Silicone |
| 44 | Coton | 457 | Métal | 49 | Soie |
| 43 | Cuir | 52 | Nylon | 441 | Toile |
| 447 | Cuir synthétique | 178 | Néoprène | 464 | Tulle |
| 305 | Cuir verni | 453 | Or | 465 | Tweed |
| 443 | Céramique | 463 | Paille | 466 | Velours |
| 298 | Daim | 458 | Papier | 299 | Velours côtelé |
| 303 | Denim | 177 | Peluche | 452 | Verre |
| 455 | Dentelle | | | 48 | Viscose |
| 445 | Duvet | | | 53 | Élasthanne |
| 446 | Fausse fourrure | | | | |
| 448 | Feutre | | | | |
| 451 | Flanelle | | | | |

Défaut produit décidé ("Polyester + Nylon") → à envoyer comme `material_ids: [45, 52]` (ou l'inverse, l'ordre n'a pas d'importance pour l'API — voir point 5 sur l'affichage réordonné).

---

## 4. JSON brut complet — `GET /api/v2/item_upload/colors`

```json
{
  "colors": [
    { "id": 1, "title": "Noir", "hex": "000000", "order": 1, "code": "BLACK" },
    { "id": 3, "title": "Gris", "hex": "919191", "order": 2, "code": "GREY" },
    { "id": 12, "title": "Blanc", "hex": "FFFFFF", "order": 3, "code": "WHITE" },
    { "id": 20, "title": "Crème", "hex": "F8F8E1", "order": 4, "code": "CREAM" },
    { "id": 4, "title": "Beige", "hex": "f4e0c8", "order": 5, "code": "BODY" },
    { "id": 21, "title": "Abricot", "hex": "FFCC98", "order": 6, "code": "APRICOT" },
    { "id": 11, "title": "Orange", "hex": "FFA500", "order": 7, "code": "ORANGE" },
    { "id": 22, "title": "Corail", "hex": "FE7F5D", "order": 8, "code": "CORAL" },
    { "id": 7, "title": "Rouge", "hex": "CC3300", "order": 9, "code": "RED" },
    { "id": 23, "title": "Bordeaux", "hex": "AE2E3D", "order": 10, "code": "BURGUNDY" },
    { "id": 5, "title": "Fuchsia", "hex": "ff0080", "order": 11, "code": "PINK" },
    { "id": 24, "title": "Rose", "hex": "FFCCCA", "order": 12, "code": "ROSE" },
    { "id": 6, "title": "Violet", "hex": "800080", "order": 13, "code": "PURPLE" },
    { "id": 25, "title": "Lila", "hex": "D297D2", "order": 14, "code": "LILAC" },
    { "id": 26, "title": "Bleu clair", "hex": "89CFF0", "order": 15, "code": "LIGHT-BLUE" },
    { "id": 9, "title": "Bleu", "hex": "007bc4", "order": 16, "code": "BLUE" },
    { "id": 27, "title": "Marine", "hex": "35358D", "order": 17, "code": "NAVY" },
    { "id": 17, "title": "Turquoise", "hex": "B7DEE8", "order": 18, "code": "TURQUOISE" },
    { "id": 30, "title": "Menthe", "hex": "A2FFBC", "order": 19, "code": "MINT" },
    { "id": 10, "title": "Vert", "hex": "369a3d", "order": 20, "code": "GREEN" },
    { "id": 28, "title": "Vert foncé", "hex": "356639", "order": 21, "code": "DARK-GREEN" },
    { "id": 16, "title": "Kaki", "hex": "86814A", "order": 22, "code": "KHAKI" },
    { "id": 2, "title": "Marron", "hex": "663300", "order": 23, "code": "BROWN" },
    { "id": 29, "title": "Moutarde", "hex": "E5B539", "order": 24, "code": "MUSTARD" },
    { "id": 8, "title": "Jaune", "hex": "fff200", "order": 25, "code": "YELLOW" },
    { "id": 13, "title": "Argenté", "hex": "dddddd", "order": 26, "code": "SILVER" },
    { "id": 14, "title": "Doré", "hex": "be9927", "order": 27, "code": "GOLD" },
    { "id": 15, "title": "Multicolore", "hex": "", "order": 28, "code": "VARIOUS" },
    { "id": 32, "title": "Transparence", "hex": "F8FDFD", "order": 29, "code": "CLEAR" }
  ],
  "code": 0
}
```

---

## 5. Comportement DOM à la sélection (pour qui codera le remplissage automatique)

Observé en interceptant les changements DOM avant/après clic sur chaque type de champ, sur category_id=157 :

### Marque, état (choix unique)
- Chaque option de la liste déroulante est un `input[type=radio]` avec `id`/`name` au format **`brand-radio-<id>`** (ex. `brand-radio-53` pour Nike) ou **`condition-radio-<id>`** (ex. `condition-radio-2` pour "Très bon état"). `value="on"`.
- Le champ visible (`brand-select-dropdown-input` / `category-condition-single-list-input`) est un `<input readonly>` dont l'attribut `value` est mis à jour avec le **libellé texte** ("Nike", "Très bon état") — **pas l'id numérique**. L'id numérique n'existe que dans l'état interne React/Redux de la page, jamais exposé dans le DOM une fois la liste refermée (les `input[type=radio]` sont démontés du DOM à la fermeture du panneau).
- ⚠️ Conséquence pratique : on ne peut pas se contenter de faire `input.value = "Nike"` en JS pour remplir le champ — cela ne déclenche pas le state React sous-jacent. Il faut simuler un vrai clic sur le radio correspondant (`document.getElementById('brand-radio-53').click()` fonctionne, car cela déclenche l'event React normalement) pendant que le panneau est ouvert, ou passer par l'extension qui pilote de vrais événements souris/clavier.

### Couleur, matériau (choix multiple)
- Chaque option est un `input[type=checkbox]` au format **`color-checkbox-<id>`** (ex. `color-checkbox-1` = Noir) ou **`material-checkbox-<id>`** (ex. `material-checkbox-45` = Polyester).
- Le champ visible affiche les libellés sélectionnés séparés par `", "`, mais **dans l'ordre de la liste canonique** (l'ordre des `options` renvoyées par l'API), **pas dans l'ordre de clic**. Exemple observé : cliqué Polyester (45) puis Nylon (52) → affiché "Nylon, Polyester" car Nylon précède Polyester dans la liste source.
- **Comportement à la limite de sélection (FIFO)** : au-delà de la limite (`selection_limit`, ex. 3 pour matériau), cliquer une nouvelle option **ne bloque pas le clic et ne le refuse pas** — elle **remplace automatiquement la plus ancienne sélection**. Testé : Cuir + Nylon + Polyester (3/3) → clic sur Coton → résultat "Coton, Nylon, Polyester" (Cuir a été décoché automatiquement). Aucun message d'erreur, aucun attribut `disabled` sur les options au-delà de la limite — c'est purement un comportement JS interne (premier entré, premier sorti).
- Chaque case reste cochable/décochable individuellement (clic = toggle).

### Unisexe
- Checkbox HTML simple, indépendante des composants dropdown ci-dessus : `id="unisex" name="unisex"`, toggle classique, pas de logique de limite.

### Format du colis
- `input[type=radio]`, `name`/`id` = `package_type_selector_1` / `_2` / `_3` directement (pas de suffixe id numérique, car il n'y a que 3 valeurs fixes, non pilotées par API).

---

## 6. Statut du champ "unisexe" — réponse synthétique

Voir point 2 : **oui**, `unisex` apparaît comme entrée dans le tableau `attributes` renvoyé par `POST /api/v2/item_upload/attributes` pour category_id=157 (aux côtés de `brand` et `color`), mais avec `"configuration": null` — c'est un simple indicateur de présence du champ pour cette catégorie, pas une structure de valeurs. La valeur réelle (coché/non coché) est gérée par une checkbox HTML indépendante, sans lien direct avec ce payload JSON. Pour la logique d'intégration MyFlip : il suffit de savoir que `unisex` fait partie des champs de la catégorie 157 (contrairement à ce qu'on a vu sur T-shirts/Sacs à main où ce code n'apparaît pas du tout dans `attributes`), puis d'envoyer un booléen simple.

---

## 7. Bonus (non demandé, mais repéré en cours d'exploration) — suggestion de prix automatique

Une fois **catégorie + marque + état** renseignés (et probablement couleur), Vinted appelle `POST /api/v2/item_price_suggestions` et affiche 3 fourchettes de prix cliquables sous le champ Prix ("Bonne affaire", "Prix idéal", "Premium"). Exemple de réponse observée pour Sacs à dos / Nike / Très bon état :

```json
{
  "price_suggestion": {
    "minimum": { "amount": "4.0", "currency_code": "EUR" },
    "maximum": { "amount": "10.0", "currency_code": "EUR" },
    "price": { "amount": "9.0", "currency_code": "EUR" },
    "midpoint": { "amount": "7.0", "currency_code": "EUR" }
  },
  "similar_sold_items_present": true,
  "code": 0
}
```

Potentiellement utile si MyFlip veut un jour proposer son propre prix suggéré basé sur les mêmes données Vinted, ou pour calibrer les prix par défaut de vos annonces Nike. Non creusé plus loin (hors périmètre demandé), mais l'endpoint est identifié si besoin d'y revenir.

---

## Résumé — configuration finale figée pour l'automatisation "Sacs à dos Nike"

| Champ | Valeur à envoyer | Constante ? |
|---|---|---|
| Catégorie | `category_id = 157` | Fixe |
| Marque | `brand_id = 53` (Nike) | Fixe |
| État | `condition_id = 2` (Très bon état) | Fixe |
| Format colis | `package_type_selector_1` (Petit) | Fixe |
| Unisexe | `true` | Fixe |
| Matériau (défaut) | `material_ids = [45, 52]` (Polyester, Nylon) | Pré-rempli, modifiable |
| Couleur | `color_id(s)` parmi la liste de 29 (section 4) | Variable par annonce |
| Titre / Description / Prix / Photos | Saisie libre | Variable par annonce |
