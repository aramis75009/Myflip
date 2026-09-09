# Cartographie du formulaire "Vends ton article" — Vinted (vinted.fr/items/new)

Exploration effectuée le 2026-09-07 sur un compte de test, en lecture seule (aucune annonce publiée). Deux méthodes combinées : inspection DOM (`data-testid`) et inspection des appels réseau déclenchés par le formulaire (les vraies sources de vérité pour les listes de valeurs).

Catégories explorées en profondeur :
- **Sacs à dos** (Femmes > Sacs > Sacs à dos, `category_id=157`)
- **T-shirts** (Femmes > Vêtements > Hauts et t-shirts > T-shirts, `category_id=221`)
- **Sacs à main** (Femmes > Sacs > Sacs à main, `category_id=156`)

Le bandeau de cookies (`ot-group-id-*`, `ot-sub-group-id-*`) est explicitement exclu : aucun rapport avec le formulaire de vente.

---

## 1. Architecture générale

Le formulaire est piloté par une série d'appels API déclenchés dynamiquement. Aucun photo n'est en réalité nécessaire pour faire apparaître les champs de catégorie : dès qu'une catégorie est choisie jusqu'à une feuille de l'arborescence, l'app appelle en parallèle :

| Endpoint | Méthode | Paramètres | Rôle |
|---|---|---|---|
| `/api/v2/item_upload/catalogs` | GET | — | Arbre complet des catégories (racines : Femmes, Hommes, Articles de créateurs, Enfants, Maison, Électronique, Livres et médias, Loisirs et collections, Sport) |
| `/api/v2/item_upload/catalogs/search` | GET | `keyword` | Recherche de catégorie en texte libre (utilisée par le champ "Trouve une catégorie") |
| `/api/v2/item_upload/attributes` | POST | `category_id` (body) | Renvoie les attributs génériques dynamiques de la catégorie choisie (état, taille, matière, etc. selon la catégorie) avec leurs libellés et leur config (obligatoire, single/multi, limite de sélection) |
| `/api/v2/item_upload/brands` | GET | `category_id`, `keyword` (optionnel) | Liste de marques, filtrée/pertinente pour la catégorie ; recherche texte via `keyword` |
| `/api/v2/item_upload/colors` | GET | — | Liste globale des couleurs (indépendante de la catégorie) |
| `/api/v2/item_upload/suggestions/attributes` | POST | — | Suggestions auto (probablement basées sur photo/titre — non creusé, hors périmètre lecture) |
| `/api/v2/item_upload/banners?category_id=X` | GET | `category_id` | Bandeaux d'info spécifiques à la catégorie (vide sur les 3 catégories testées) |
| `/api/v2/offline_verification/criteria/{category_id}` | GET | — | Champs requis pour la vérification anti-fraude ("authenticity check") : sur les 3 catégories testées, retourne `{"required_field_codes":["brand","price"]}` |

⚠️ Ces endpoints sont protégés par la protection anti-bot du site (Cloudflare challenge) : ils ne répondent qu'aux requêtes émises par la page elle-même (avec ses tokens/fingerprint), pas à un `fetch()` direct hors contexte. Pour une intégration réelle, il faudra passer par une extension navigateur agissant dans le contexte de la page (comme prévu) plutôt que par des appels serveur-à-serveur nus.

---

## 2. Champs de base (visibles quelle que soit la catégorie, dès l'arrivée sur la page)

| Champ | `data-testid` | `name` | Type | Obligatoire | Dépend de la catégorie ? | Notes |
|---|---|---|---|---|---|---|
| Photos | `add-photos-input` | `photos` | `input[type=file]`, multiple | Oui (pour publier réellement ; pas nécessaire pour voir apparaître les champs suivants) | Non | `accept="image/jpeg,image/gif,image/png,image/webp"`, `multiple=true`. Zone de dépôt : `media-upload` / `dropzone` / `dropzone-overlay` |
| Titre | `title--input` | `title` | `input[type=text]` | Oui (implicite) | Non | Placeholder : "Dis aux acheteurs ce que tu vends" |
| Description | `description--input` | `description` | `textarea` | Oui (implicite) | Non | Placeholder : "Ajoute des informations utiles" |
| Catégorie | `catalog-select-dropdown-input` | `category` | Dropdown recherche + arborescence à niveaux | Oui | — | Ouvre un panneau de navigation (racines → sous-catégories → feuilles) ou une recherche texte plein (`catalogs/search?keyword=`) |
| Prix | `price-input--input` | `price` | `input[type=text]` | Oui | Non | Placeholder "0,00 €" |
| Bouton brouillon | `upload-form-save-draft-button` | — | button | — | — | "Sauvegarder le brouillon" |
| Bouton publier | `upload-form-save-button` | — | button | — | — | "Ajouter" — **jamais cliqué pendant cette exploration** |
| Mention légale | `item-transparency-law` | — | texte statique | — | — | Rappel Article L.132-2 Code conso |

---

## 3. Champs qui apparaissent après sélection d'une catégorie (feuille de l'arborescence)

Ces champs sont **conditionnels à la catégorie** — leur présence, leur ordre et parfois leurs valeurs changent. Tableau consolidé des 3 catégories testées :

| Champ | `data-testid` | `name` | Type | Sacs à dos (157) | T-shirts (221) | Sacs à main (156) |
|---|---|---|---|---|---|---|
| Unisexe | — (checkbox `id="unisex" name="unisex"`, pas de testid, `aria-label="Unisexe"`) | `unisex` | checkbox | ✅ Présent | ❌ Absent | ❌ Absent |
| Marque | `brand-select-dropdown-input` (+ recherche `brand-search--input`) | `brand` | Dropdown recherche | ✅ | ✅ | ✅ |
| Taille | `category-size-single-grid_chips-input` | `size` | Dropdown à grille avec onglets de système de taille | ❌ Absent | ✅ Présent | ❌ Absent |
| Dimensions (recommandé) | `measurement-width--input`, `measurement-length--input` | — | 2× `input` numérique (cm) | ❌ | ✅ ("Largeur des épaules", "Longueur") | ❌ |
| État | `category-condition-single-list-input` | `condition` | Dropdown liste simple | ✅ | ✅ | ✅ |
| Couleur | `color-select-dropdown-input` | `color` | Dropdown multi (max 2) | ✅ | ✅ | ✅ |
| Matériau (recommandé) | `category-material-multi-list-input` | `material` | Dropdown multi (max 3) | ✅ | ✅ | ✅ |
| Format du colis (Envoi) | `package_type_selector_1/2/3` (+ `--input`, `--text`) | `package_type_selector_1/2/3` | Radio (3 options) | ✅ (recommandé : **Moyen**) | ✅ (recommandé : **Petit**) | ✅ (recommandé : **Moyen**) |

Champs mentionnés dans l'exploration manuelle initiale mais **non rencontrés** sur les 3 catégories testées :
- `manufacturer-label--input` (étiquetage légal/sécurité) — probablement lié aux catégories soumises au règlement européen sur la sécurité des produits (jouets, puériculture, cosmétiques, électronique). Aucune des catégories testées (sacs, t-shirts) n'y est soumise. À vérifier séparément si Frip & Trend vend un jour dans ces rayons.

---

## 4. Détail des champs à choix (valeurs réelles, via API)

### 4.1 État (`condition`) — universel, identique sur les 3 catégories testées

Source : `attributes` (id `431`, `code: "condition"`), `display_type: list`, `selection_type: single`, `selection_limit: 1`, **`required: true`**.

| id | Libellé | Description |
|---|---|---|
| 6 | Neuf avec étiquette | Article neuf, jamais porté/utilisé avec étiquettes ou dans son emballage d'origine. |
| 1 | Neuf sans étiquette | Article neuf, jamais porté/utilisé, sans étiquettes ni emballage d'origine. |
| 2 | Très bon état | Article très peu porté/utilisé, légères imperfections possibles. |
| 3 | Bon état | Article porté/utilisé quelques fois, imperfections et signes d'usure. |
| 4 | Satisfaisant | Article porté/utilisé plusieurs fois, imperfections et signes d'usure. |

### 4.2 Couleur (`color`) — globale, indépendante de la catégorie

Source : `GET /api/v2/item_upload/colors`. Champ multi-sélection, **max 2 couleurs**.

| id | Libellé | Hex | Code |
|---|---|---|---|
| 1 | Noir | 000000 | BLACK |
| 3 | Gris | 919191 | GREY |
| 12 | Blanc | FFFFFF | WHITE |
| 20 | Crème | F8F8E1 | CREAM |
| 4 | Beige | f4e0c8 | BODY |
| 21 | Abricot | FFCC98 | APRICOT |
| 11 | Orange | FFA500 | ORANGE |
| 22 | Corail | FE7F5D | CORAL |
| 7 | Rouge | CC3300 | RED |
| 23 | Bordeaux | AE2E3D | BURGUNDY |
| 5 | Fuchsia | ff0080 | PINK |
| 24 | Rose | FFCCCA | ROSE |
| 6 | Violet | 800080 | PURPLE |
| 25 | Lila | D297D2 | LILAC |
| 26 | Bleu clair | 89CFF0 | LIGHT-BLUE |
| 9 | Bleu | 007bc4 | BLUE |
| 27 | Marine | 35358D | NAVY |
| 17 | Turquoise | B7DEE8 | TURQUOISE |
| 30 | Menthe | A2FFBC | MINT |
| 10 | Vert | 369a3d | GREEN |
| 28 | Vert foncé | 356639 | DARK-GREEN |
| 16 | Kaki | 86814A | KHAKI |
| 2 | Marron | 663300 | BROWN |
| 29 | Moutarde | E5B539 | MUSTARD |
| 8 | Jaune | fff200 | YELLOW |
| 13 | Argenté | dddddd | SILVER |
| 14 | Doré | be9927 | GOLD |
| 15 | Multicolore | (aucun) | VARIOUS |
| 32 | Transparence | F8FDFD | CLEAR |

### 4.3 Matériau (`material`) — globale (même liste observée sur les 3 catégories)

Source : `attributes` (id `8`, `code: "material"`), `display_type: list`, `selection_type: multi`, **`selection_limit: 3`**, `required: false`.

55 valeurs (liste complète) : Acier, Acrylique, Alpaga, Argent, Bambou, Bois, Cachemire, Caoutchouc, Carton, Coton, Cuir, Cuir synthétique, Cuir verni, Céramique, Daim, Denim, Dentelle, Duvet, Fausse fourrure, Feutre, Flanelle, Jute, Laine, Latex, Lin, Maille, Mohair, Mousse, Mousseline, Mérinos, Métal, Nylon, Néoprène, Or, Paille, Papier, Peluche, Pierre, Plastique, Polaire, Polyester, Porcelaine, Rotin, Satin, Sequin, Silicone, Soie, Toile, Tulle, Tweed, Velours, Velours côtelé, Verre, Viscose, Élasthanne.

### 4.4 Taille (`size`) — uniquement pour les catégories vêtements/chaussures (ex. T-shirts, id 221)

Source : `attributes` (id `8001`, `code: "size"`), `display_type: grid_chips`, `selection_type: single`, `selection_limit: 1`, **`required: true`**.

Le sélecteur propose plusieurs **groupes de systèmes de taille** en onglets, chacun avec son propre jeu de valeurs :
- **S/M/L** : XXXS, XXS, XS, S, M, L, XL, XXL, XXXL, 4XL…9XL, Autre, Taille unique
- **EU** : EU 30 à EU 58 (pas de 2), Autre, Taille unique
- **UK** : UK 2 à UK 30 (pas de 2), Autre, Taille unique
- **FR** : FR 30 à FR 60 (pas de 2), Autre, Taille unique
- **IT** : IT 34 à IT 62+ (pas de 2), Autre, Taille unique
- **US** : (groupe présent, valeurs non détaillées ici)

Chaque groupe a son propre id d'option (ex. XS = 1737, M = 1739) — l'ensemble complet est disponible via l'endpoint `attributes` pour la catégorie ciblée ; à re-extraire précisément avant intégration si My Flip doit proposer un sélecteur de taille par système.

Un lien "Guide des tailles" (FAQ code `SIZE-GROUPS-WOMEN-CLOTHING` / `SIZE-CHART-WOMEN-CLOTHING`) est associé à ce champ.

### 4.5 Dimensions (T-shirts et probablement autres vêtements) — recommandé, non obligatoire

Deux champs numériques en cm : "Largeur des épaules" (`measurement-width--input`) et "Longueur" (`measurement-length--input`), avec un lien vers un "guide sur les dimensions". `selection` n'est pas applicable ici (saisie libre numérique).

### 4.6 Marque (`brand`) — recherche dynamique, liste énorme, non énumérable intégralement

Champ à saisie + recherche live. Deux modes observés :
- **Sans texte** : `GET /api/v2/item_upload/brands?category_id=X` renvoie une liste "Marques populaires" pré-triée pour la catégorie (~50 marques les plus pertinentes).
- **Avec texte** : `GET /api/v2/item_upload/brands?keyword=<texte>&category_id=X` renvoie les correspondances (max ~10 par requête observée).

Champs de chaque marque : `id`, `title`, `requires_authenticity_check` (bool — déclenche le contrôle anti-contrefaçon Vinted), `is_luxury` (bool), `is_hvf` ("high value fashion" ? bool), `has_children` (bool — certaines marques comme Louis Vuitton, Gucci, Prada ont des sous-marques/lignes).

Exemples "populaires" pour Sacs à dos (157) : Fjällräven, Loungefly, Cabaïa, GUESS, Michael Kors, Primark, Kapten & Son, Eastpak, Parfois, adidas, Nike, Desigual, Disney, Zara, Kipling, Vans, Rains, Herschel, Longchamp, Tommy Hilfiger, Zaino, carpisa, Shein, River Island, Stradivarius, Roka, The North Face, Liu Jo, H&M, Calvin Klein, Crocs, Victoria's Secret, Quechua, New Look, Cath Kidston, Puma, Anekke, Iné, Accessorize, Dr. Martens, Sinsay, Fiorelli, Pull & Bear, Vera Pelle, Coach, New Balance, David Jones, Love Moschino, Mandarina Duck, Moschino, Karl Lagerfeld.

Exemples "populaires" pour Sacs à main (156), incluant les marques de luxe pertinentes pour Frip & Trend : GUESS, Michael Kors, Longchamp, Coach, Louis Vuitton (`has_children:true`), Gucci (`has_children:true`), Valentino, Prada (`has_children:true`), Furla, Mulberry, Marc Jacobs, Jacquemus, Polène, Lancel, Kate Spade, Coccinelle, Radley, Lancaster, DKNY, Zadig & Voltaire, Juicy Couture, Karl Lagerfeld.

Recherche "Nike" sur catégorie 157 renvoie par exemple : Nike, Jordan, Nike Air, NIK&NIK, Nike SB, Nike Mercurial, Nike Sportswear, Nikelodeon, Nike ACG, NIK & NIK.

**Pour l'intégration MyFlip → Vinted** : ne pas tenter de télécharger/mettre en cache la liste complète des marques (des dizaines de milliers). Utiliser l'endpoint de recherche à la volée avec le nom de marque déjà saisi dans MyFlip, et proposer les correspondances à l'utilisateur (comme le fait Vinted lui-même).

### 4.7 Format du colis (`package_type_selector_1/2/3`)

Toujours 3 options fixes, non dépendantes d'une API (texte statique dans le DOM) :

| Option | testid | Libellé | Description |
|---|---|---|---|
| 1 | `package_type_selector_1` | Petit | Convient pour un article qui tient dans une grande enveloppe. |
| 2 | `package_type_selector_2` | Moyen | Convient pour un article qui tient dans une boîte à chaussures. |
| 3 | `package_type_selector_3` | Grand | Convient pour un article qui tient dans un carton de déménagement. |

La case pré-cochée par défaut ("Recommandé") change selon la catégorie : Moyen pour Sacs à dos et Sacs à main, Petit pour T-shirts. Une bannière "Recommandé" (`package-size-suggestion-badge-id-N`) marque l'option suggérée.

---

## 5. Contrôle anti-fraude ("authenticity check")

`GET /api/v2/offline_verification/criteria/{category_id}` renvoie, pour les 3 catégories testées, `{"required_field_codes":["brand","price"]}` : Marque et Prix sont les champs nécessaires pour que Vinted déclenche (le cas échéant) une procédure de vérification physique — pertinent pour Frip & Trend qui vend du premium/luxe, car certaines marques (`requires_authenticity_check: true` dans la réponse `/brands`) déclenchent ce contrôle à la publication.

---

## 6. Arborescence des catégories

Racines (`/api/v2/item_upload/catalogs`, ids observés dans le DOM) : Femmes (1904), Hommes (5), Articles de créateurs (2993), Enfants (1193), Maison (1918), Électronique (2994), Livres et médias (2309), Loisirs et collections (4824), Sport (4332).

Sous Femmes : Vêtements, Chaussures, **Sacs**, Accessoires, Beauté. Sous "Sacs" : Sacs à main (156), Sacs à dos (157), Sacs à bandoulière, etc. — structure profonde (jusqu'à 4-5 niveaux), consultable via `catalogs` (arbre complet) ou `catalogs/search?keyword=` (recherche).

Recherche "Sacs à dos" renvoie aussi la catégorie équivalente côté Hommes (Hommes > Accessoires > Sacs et sacoches) et côté Enfants — utile si Frip & Trend vend des sacs unisexes/enfants.

---

## 7. Recommandations pour l'intégration MyFlip → Vinted

1. **Catégorie** : nécessite de répliquer (ou d'appeler à la volée, dans le contexte navigateur de l'extension) l'arbre `catalogs` pour laisser l'utilisateur choisir une feuille — les attributs disponibles ensuite dépendent entièrement de cette feuille.
2. **Champs universels** (état, couleur, matériau) : peuvent être pré-remplis/mappés une fois pour toutes dans MyFlip, indépendamment de la catégorie Vinted.
3. **Champs conditionnels** (taille, dimensions, unisexe) : nécessitent un appel `attributes` (et vérif de présence du champ `unisex`) à chaque changement de catégorie pour savoir quoi afficher/envoyer.
4. **Marque** : ne pas embarquer de liste statique — rechercher à la volée via `brands?keyword=&category_id=`.
5. **Format colis** : les 3 options sont fixes ; MyFlip peut pré-calculer une suggestion par défaut par catégorie si souhaité, mais Vinted la calcule déjà côté serveur (badge "Recommandé").
6. Les endpoints sont protégés par une protection anti-bot : toute automatisation (extension Firefox) doit opérer **dans le contexte de la page Vinted déjà authentifiée**, pas via des appels serveur nus depuis un backend externe.
