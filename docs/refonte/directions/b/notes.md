# Piste B : Atelier de revente

Planche : `index.html` (autonome, à ouvrir en `file://`). Captures : `captures/`.
Tout ce qui est chiffré ci-dessous (contrastes, couverture des glyphes) est
recalculé par la page elle-même dans la section « Système ».

## Intention

MyFlip est le carnet de bord d'un revendeur de friperie. La piste B le traite
comme un atelier tenu avec soin : des fonds de papier et de lin, une encre
bleu-noir pour le texte, et un seul rouge sang-de-bœuf, couleur de cuir et de
maroquinerie, réservé à ce qui demande une action (bouton primaire, entrée
active, sélection, focus). Pour Aramis, qui l'ouvre tous les jours : l'émotion
visée est le calme d'un registre bien tenu, où l'on retrouve chaque pièce et
chaque euro sans effort.

Trois gestes portent l'identité, et seulement trois :

1. **L'étiquette SKU.** Chaque SKU est une petite étiquette de carton à coins
   coupés, avec un œillet en laiton. On la retrouve dans le Stock, sur la fiche
   Studio, dans la démo de mouvement et en grand sur la landing.
2. **Le double filet comptable.** Les totaux (chiffre du mois, total du
   tableau, devis du Studio, carnet de la landing) sont soulignés d'un double
   trait, comme dans un livre de comptes.
3. **Le mètre ruban.** L'objectif du mois est une règle graduée, avec un
   repère « aujourd'hui » : on voit d'un coup d'œil si le chiffre avance plus
   vite que le calendrier.

Ce qui la distingue :

- **De la Direction C** : aucun vert, aucun lime, pas de capitales espacées, pas
  de vocabulaire « console », pas de chasse fixe. Les neutres sont chauds, la
  profondeur vient du papier posé sur le lin.
- **De Fruit Drama Studio** : FDS est une régie vidéo sombre, violet électrique
  `#7C5CFF`, Bricolage Grotesque et Geist. Ici le clair est le thème de
  référence, l'accent est un rouge profond, les polices sont une Clarendon et
  une humaniste. Du sélecteur de modèles de FDS on a gardé les idées
  (favoris épinglés, coût lisible, confirmation qui affiche le montant), pas
  l'apparence.
- **Du piège « crème + serif + terracotta »** : le fond est un lin grisé
  (`236 231 223`), pas une crème jaune ; l'accent est un sang-de-bœuf
  (`122 31 46`), pas une terracotta ; le titrage est une Clarendon d'étiquette,
  pas une Didone de magazine ; et le texte est en encre bleu-noir, pas en brun.

## Polices

| Rôle | Famille | Graisses | Licence |
|---|---|---|---|
| Titres, chiffre du mois, SKU | **Besley** (Indestructible Type) | variable 400 à 900 | SIL Open Font License 1.1 |
| Interface, tableaux, chiffres | **Source Sans 3** (Adobe) | variable 400 à 700 | SIL Open Font License 1.1 |

Chiffres : `font-variant-numeric: tabular-nums lining-nums` partout où des
montants s'alignent (classe `.num`, tableaux, KPI).

**Couverture, vérifiée dans Chromium** par le test de la section Système
(chasse comparée à deux replis, `serif` et `sans-serif`) et recoupée avec les
`unicode-range` de la feuille Google Fonts :

- Présents dans les deux polices : é è ê ë à â ç ù û ô î ï œ Œ É « » ’ € × …
  et l'espace fine insécable.
- **Absents des deux : → (U+2192) et ✕ (U+2715).** Le sous-ensemble `latin`
  servi par Google s'arrête à U+2191 et U+2193 ; aucun sous-ensemble ne contient
  U+2192 ni U+2715. Ces deux signes s'affichent donc dans une police système.
  Parade retenue : l'interface les dessine en SVG (icônes `i-x`, chevrons) et
  ne les écrit jamais en texte. Si on tient à les avoir en texte, il faudra
  auto-héberger la fonte complète avec `next/font/local` et vérifier son cmap.
- ⌘ (raccourci de la recherche) vient aussi d'une police système.
- **Espace fine** : dans Source Sans 3, U+202F mesure 0,10 em (1,3 px à 13 px),
  invisible dans les petits corps. Les milliers sont donc séparés par une
  espace insécable normale (U+00A0, 0,20 em), sauf dans le grand chiffre en
  Besley où l'espace fine (0,15 em) reste lisible.

Chargement prévu dans l'appli (le fichier de planche, lui, passe par un
`<link>` Google Fonts) :

```ts
// app/layout.tsx
import { Besley, Source_Sans_3 } from "next/font/google";
const serif = Besley({ subsets: ["latin", "latin-ext"], variable: "--font-serif", display: "swap" });
const sans = Source_Sans_3({ subsets: ["latin", "latin-ext"], variable: "--font-sans", display: "swap" });
// <html className={`${serif.variable} ${sans.variable}`}>
```

Les composants n'écrivent jamais le nom littéral d'une famille : ils lisent
`var(--font-serif)` et `var(--font-sans)` (cause du bug F1).

## Tokens de couleur (canaux R G B)

Chaque couleur est un triplet de canaux, utilisé en `rgb(var(--c-x))` ou
`rgb(var(--c-x) / .9)`. Côté Tailwind 3 :

```ts
colors: { surface: "rgb(var(--c-surface) / <alpha-value>)", /* … */ }
```

ce qui rend `bg-surface/90`, `bg-scrim/50` et `ring-focus/20` fonctionnels
(cause racine des bugs O1, O2, O3).

| Token | Rôle | Clair | Sombre |
|---|---|---|---|
| `--c-canvas` | lin, fond de page | 236 231 223 | 27 24 21 |
| `--c-sidebar` | menu latéral | 229 223 213 | 22 20 17 |
| `--c-surface` | papier : cartes, tableaux | 252 250 246 | 35 31 27 |
| `--c-surface-2` | en-têtes, survols | 244 240 233 | 43 38 33 |
| `--c-raised` | modales, tiroirs | 255 254 251 | 46 41 35 |
| `--c-tag` | carton des étiquettes | 242 234 221 | 54 47 40 |
| `--c-line` | filet | 220 212 200 | 61 54 47 |
| `--c-line-strong` | contours, filet appuyé | 190 180 166 | 92 82 71 |
| `--c-control` | bordure de champ (≥ 3:1) | 135 125 113 | 136 125 112 |
| `--c-ink` | encre, texte | 28 30 41 | 240 233 223 |
| `--c-ink-2` | texte secondaire | 74 70 82 | 207 197 184 |
| `--c-muted` | méta, aides | 100 93 85 | 168 157 144 |
| `--c-accent` | sang-de-bœuf : fond d'action, sélection | 122 31 46 | 188 78 94 |
| `--c-accent-hover` | survol du primaire | 99 22 36 | 172 66 82 |
| `--c-accent-on` | texte sur l'accent | 252 250 246 | 255 255 255 |
| `--c-accent-text` | accent écrit en texte | 122 31 46 | 229 140 151 |
| `--c-accent-soft` | ligne sélectionnée | 244 228 227 | 60 36 39 |
| `--c-focus` | anneau clavier | 122 31 46 | 229 140 151 |
| `--c-eyelet` | laiton : œillet, étoile | 176 132 26 | 214 174 82 |
| `--c-pos` / `-soft` | marge, succès | 47 106 53 / 228 239 221 | 140 199 145 / 30 48 27 |
| `--c-neg` / `-soft` / `-on` | erreur, perte, danger | 181 58 22 / 249 227 220 / 255 255 255 | 244 147 107 / 61 33 26 / 27 24 21 |
| `--c-warn` / `-soft` | à vérifier | 133 89 10 / 245 236 212 | 226 182 92 / 53 43 23 |
| `--c-info` / `-soft` | neutre informatif | 46 76 143 / 228 233 247 | 157 179 238 / 31 38 64 |
| `--c-inverse` / `-ink` / `-pos` | toasts, barre groupée | 28 30 41 / 252 250 246 / 150 214 150 | 62 55 48 / 240 233 223 / 140 199 145 |
| `--c-scrim` | voile (utilisé à 50 %) | 28 24 22 | 6 5 4 |
| `--c-shadow` | teinte des ombres | 70 48 30 | 0 0 0 |
| `--c-chart` | barres de graphique | 122 31 46 | 188 78 94 |

En sombre, l'accent se dédouble volontairement : un grenat (`188 78 94`) pour
les fonds, avec du texte blanc à 4,78:1, et un rose garance (`229 140 151`)
pour l'accent écrit et le focus. Un seul rose clair en fond donnait des
boutons pastel, hors de la marque (essayé au premier tour de relecture).

Le thème : `data-theme` sur `<html>`, posé avant le premier rendu par un
script en tête (`localStorage["myflip-theme"]`, sinon `prefers-color-scheme`),
avec le même jeu sombre sous `@media (prefers-color-scheme: dark)` pour le cas
sans script. `color-scheme` suit le thème, donc la barre de défilement et les
contrôles natifs aussi (bug MO4). `theme-color` est recalculé à chaque bascule
depuis `--c-canvas` (bug X7). Le libellé du bouton de thème est juste dès le
premier affichage (bug X13).

## Statuts et canaux

Dix statuts, dans l'ordre de vie d'un article. Chacun a trois tokens par thème
(`--st-x` pastille, `--st-x-bg` fond, `--st-x-ink` texte), une icône propre et
son libellé : jamais la couleur seule.

| Statut | Icône | Clair (pastille / fond / texte) | Sombre |
|---|---|---|---|
| Brouillon | cercle pointillé | 150 141 131 / 238 234 228 / 87 80 73 | 154 144 132 / 48 43 38 / 211 202 191 |
| En stock | carton | 176 132 26 / 245 236 212 / 110 80 10 | 214 174 82 / 53 43 23 / 235 203 128 |
| En lavage | goutte | 44 138 160 / 222 239 242 / 20 88 104 | 95 183 203 / 22 47 53 / 154 214 227 |
| Repassé | fer | 132 120 196 / 236 233 247 / 78 66 144 | 167 157 224 / 41 37 61 / 201 194 240 |
| Photos prêtes | appareil photo | 190 95 148 / 247 229 238 / 138 52 99 | 222 141 185 / 58 34 49 / 240 185 214 |
| En vente | étiquette | 61 93 187 / 228 233 247 / 43 69 145 | 138 162 236 / 31 38 64 / 185 200 245 |
| En livraison | camion | 210 122 34 / 250 234 215 / 138 74 10 | 235 160 90 / 58 40 23 / 245 197 149 |
| À comptabiliser | stylo | 207 79 51 / 249 227 220 / 154 50 25 | 240 138 108 / 61 33 26 / 247 182 163 |
| Vendu | coche cerclée | 75 139 59 / 228 239 221 / 47 98 38 | 134 192 119 / 30 48 25 / 181 221 169 |
| Perdu | point d'interrogation | 90 99 111 / 229 231 234 / 59 67 77 | 154 163 174 / 40 43 48 / 201 207 214 |

Canaux de vente (`--ch-x` et `--ch-x-on`) : un monogramme coloré suivi du nom
en encre. Vinted « V », Vinted Go « Go », Vestiaire Collective « VC »,
Leboncoin « lbc », En main propre « MP », Autre « + ». Les comptes
(Fripandtrend, Enorab18, Vestiaire Collective) restent neutres, avec une icône
de personne : ce sont des pseudos, pas des marques.

## Contrastes (mesurés par la page)

54 paires mesurées dans chaque thème, toutes au niveau AA (4,5:1 texte, 3:1
interface et focus). Les marges les plus faibles :

- pastilles de statut sur papier clair : En livraison 3,08, Brouillon 3,13,
  En stock 3,27 (seuil 3:1, le libellé porte le sens) ;
- étoile de favori en laiton sur papier clair : 3,27 ;
- bordure de champ sur le lin clair : 3,28 ;
- en sombre, grenat sur papier sombre : 3,42 ; texte blanc sur grenat : 4,78 ;
- texte d'un badge d'erreur clair : 4,76.

## Échelles

**Texte** : 8 tailles en rem, plancher à 12 px.
`--fs-xs` 0.75rem (12) · `--fs-sm` 0.8125rem (13) · `--fs-base` 0.9375rem (15) ·
`--fs-md` 1rem (16, tous les champs : pas de zoom iOS) · `--fs-lg` 1.25rem (20) ·
`--fs-xl` 1.625rem (26) · `--fs-2xl` 2.25rem (36) · `--fs-3xl` 3.5rem (56).
Le contrôle automatique de la planche ne trouve aucun texte rendu sous
11,5 px, à 1440 comme à 390 px (les textes SVG sont comptés à leur taille
affichée).

**Espacements** : pas de 4 px, `--sp-1` à `--sp-16` (4, 8, 12, 16, 20, 24, 32,
40, 48, 64). Gouttière mobile 16 px, bureau 32 px.

**Rayons** : `--r-1` 3 px (étiquettes, statuts, touches), `--r-2` 6 px
(boutons, champs), `--r-3` 10 px (cartes, tableaux), `--r-4` 16 px (modales,
tiroirs, feuilles). Le rayon grandit avec la taille de l'objet.

**Ombres** (teinte brune en clair, noire et plus dense en sombre via `--sh-k`) :
`--sh-1` papier posé, `--sh-2` menus et info-bulles, `--sh-3` modales, tiroirs,
toasts.

**z-index nommés** : `--z-raised` 1 (en-tête de tableau), `--z-sticky` 10
(barre du haut), `--z-nav` 20 (menu, dock), `--z-actionbar` 30, `--z-chat` 35,
`--z-overlay` 40 (voile, modale, tiroir, feuille « Plus »), `--z-popover` 50,
`--z-toast` 60, `--z-skip` 70. Chaque niveau a un rôle, plus
d'égalité réglée par l'ordre du DOM (bug M3) ; le toast passe au-dessus de la modale pour garder « Annuler ».

**Mouvement** : `--dur-1` 120 ms (survol, pression), `--dur-2` 160 ms
(sorties, tampon), `--dur-3` 200 ms (toasts, apparitions, barre groupée),
`--dur-4` 240 ms (modale, tiroir, déplacement). Courbes : `--ease-out`
`cubic-bezier(.22,.8,.24,1)` à l'entrée, `--ease-in` `cubic-bezier(.5,0,.75,.2)`
à la sortie, `--ease-move` pour les déplacements, `--ease-swing`
`cubic-bezier(.3,1.45,.5,1)` réservée au balancement de l'étiquette. Tout est
en transitions CSS, donc interruptible. Sous `prefers-reduced-motion`, les
quatre durées valent 0 ms (sans `!important`) et le reflet des squelettes
s'arrête.

## Cadre et parcours proposés

- **Menu latéral** : Tableau de bord, Stock, Mise en vente, À comptabiliser
  (compteur), Commandes, Studio ; groupe « Pilotage » : Calendrier,
  Statistiques ; pied : Réglages (ex-« Prompts », les réglages du Studio
  passent dans le Studio), Mon compte, Se déconnecter, liens légaux. L'entrée
  active est rendue en CSS par `aria-current` (papier, filet sang-de-bœuf à
  gauche) : rien à attendre du JavaScript (bug M1).
- **Dock mobile** : Accueil, Stock, À compta., Commandes, Plus. « Plus » ouvre
  une feuille avec le reste ; Studio et Mise en vente y sont marqués « sur
  ordinateur ». Plus de défilement horizontal (bug X9).
- **Hauteur** : un seul conteneur en `100dvh`, pas de double `min-height`
  (bug M2).
- **Barres fixes mobiles** : la barre groupée et les toasts se posent
  au-dessus du dock et de `env(safe-area-inset-bottom)` (bug MO2).
- **Studio** : la fiche s'ouvre sur « Prochaine action », puis les six étapes
  numérotées (vraie suite, d'où les numéros). La vraie photo est à gauche de
  l'image générée ; l'avis de l'IA est encadré en pointillés et titré « une
  aide, pas une décision ». V et R valident ou rejettent, avec un toast
  « Annuler » de 5 s ; l'historique de la prise garde les images rejetées.
- **Sélecteur de modèles** : favoris épinglés et basculables, prix par image,
  coût par sac de 15 prises en euros (taux affiché), badge « Dans le budget »,
  « Hors budget » ou « Prix inconnu », réussite du premier coup avec le nombre
  d'essais, coût moyen réel. Le bouton de lancement affiche le montant
  (« Confirmer 1,59 € ») et ouvre un devis au-delà du budget ou si un prix
  manque.
- **Stock** : changer un statut dans la ligne garde le sélecteur natif
  (habillé en pastille) ; choisir « Vendu » ouvre la fenêtre de vente au lieu
  de changer le statut sans prix.

## Bugs du § 1 et de l'étude, traités dans la planche

| Bug | Réponse de la piste B |
|---|---|
| F1 | familles via variables CSS, jamais par leur nom |
| F2, F3 | 8 tailles en rem, plancher 12 px, vérifié par script |
| O1, O2, O3 | couleurs en canaux : voile à 50 %, barre du haut à 92 % opaque |
| M1 | entrée active en CSS (`aria-current`), visible dès le premier rendu |
| M2 | un seul `min-height: 100dvh` |
| M3 | échelle de z-index nommée |
| MO1 | tous les champs à 16 px en mobile, vérifié par script |
| MO2 | barres au-dessus du dock et de la zone sûre |
| MO3 | toasts sur `--c-inverse`, qui change avec le thème |
| MO4 | `color-scheme` par thème, `scrollbar-color` en tokens |
| X6 | modale : focus initial, piège de tabulation, Échap, retour du focus (testé) |
| X7, X13 | `theme-color` et libellé du bouton de thème suivent le thème choisi |
| X8 | `--c-muted` à 4,89:1 au pire (sur le menu clair) |
| X9 | dock de 5 entrées et feuille « Plus » |

## Ce qui a été vérifié (Chromium headless, Playwright du dépôt)

- 1440×900 et 390×844, clair et sombre : aucun défilement horizontal de la
  page, aucune erreur de console.
- Modale : focus dedans à l'ouverture, toujours dedans après 12 tabulations,
  fermée par Échap, focus rendu au bouton d'origine.
- Touche V : l'image passe à « 2 sur 3 », le toast propose « Annuler (5 s) »,
  « Annuler » ramène à « 1 sur 3 ».
- Statut « Vendu » dans une ligne : le tiroir de vente s'ouvre ; un prix à 0
  affiche l'erreur et pose `aria-invalid`.
- Bascule de thème : attribut, libellé, `theme-color` et stockage à jour.
- `reducedMotion: reduce` : `--dur-3` vaut 0 ms, le reflet des squelettes est
  coupé, la note de la section Mouvement le dit.

## Faiblesses connues

- **Proximité avec un cliché.** Fond chaud, titrage à empattements et accent
  rouge restent voisins du style « crème + serif + terracotta » des pages
  générées. Les parades (lin grisé, encre bleu-noir, Clarendon, sang-de-bœuf)
  éloignent sans effacer la parenté. C'est le premier point à juger à l'œil.
- **Deux rouges.** L'accent (sang-de-bœuf) et l'erreur (vermillon) sont deux
  rouges. Ils se séparent par la teinte, la clarté et une icône, et le bouton
  danger n'apparaît que dans les confirmations, mais une ligne sélectionnée
  près d'une erreur demandera de l'attention.
- **Accent dédoublé en sombre** (grenat pour les fonds, rose pour le texte) :
  deux valeurs à tenir au lieu d'une.
- **Marges de contraste minces** sur trois pastilles de statut en clair
  (3,08 à 3,27 pour un seuil de 3).
- **Besley à 13 px** dans les étiquettes SKU : lisible mais dense ; 1 200
  étiquettes dans un tableau pèsent plus qu'un texte simple. Une variante
  « filet seul » sera peut-être nécessaire dans le Stock virtualisé.
- **→ et ✕ hors police** (voir Polices).
- **Illustrations de sac en SVG** : de vraies photos changeront l'équilibre du
  Studio, surtout en sombre.
- **Données d'exemple** : prix et noms de modèles illustratifs, pas lus chez
  OpenRouter. La règle « jamais un prix inventé » vaut pour l'appli, pas pour
  cette maquette.
- **Non testé** dans Safari, Firefox ou sur un vrai iPhone ; la planche charge
  les polices depuis Google Fonts, l'appli les auto-hébergera via `next/font`.
- Le sélecteur de statut natif garde la liste déroulante du système, qui ne
  suit pas l'identité.
