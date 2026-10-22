---
name: Vernier
status: PROVISOIRE — rejeté visuellement par Aramis le 20/10/2026 (couleurs et rendu) ; la STRUCTURE (tokens en canaux, échelles, composants, cadre, navigation) sert de base, les VALEURS d'identité seront refaites
replaces: Direction C — Console tactile (ABANDONNÉE, ne pas la réintroduire)
reference: docs/refonte/reference.html   # page de référence, clair et sombre
tokens: docs/refonte/tokens.css          # à poser tel quel dans app/globals.css
tailwind: docs/refonte/tailwind-tokens.md
fonts:
  ui: Archivo            # next/font/google, variable --font-archivo, axes wdth 62-125 + wght 100-900, OFL 1.1
  mono: Fragment Mono    # next/font/google, variable --font-fragment-mono, 400, OFL 1.1 ; SKU et identifiants seulement
  title-stretch: 115%    # --wide
theme:
  mechanism: data-theme="light" | "dark" sur <html>, posé avant le premier paint ; sans choix, prefers-color-scheme
  storage: localStorage "myflip-theme" (absente = automatique)
  colors: canaux "R G B", utilisés en rgb(var(--x) / alpha)
colors-light:
  bg: "245 247 249"
  surface: "255 255 255"
  surface-2: "239 241 244"
  surface-3: "229 232 236"
  line: "221 224 228"
  line-strong: "123 129 135"
  ink: "22 27 33"
  ink-2: "67 72 79"
  ink-3: "94 100 107"
  accent: "31 79 204"        # cobalt
  accent-hover: "18 62 178"
  accent-ink: "255 255 255"
  accent-text: "28 76 200"
  accent-soft: "233 240 254"
  focus: "31 79 204"
  pos: "19 119 56"
  pos-soft: "229 249 232"
  neg: "186 43 40"
  neg-soft: "255 238 236"
  warn: "149 89 5"
  warn-soft: "255 242 221"
  danger: "186 43 40"
  danger-ink: "255 255 255"
  veil: "10 14 18"           # toujours à 50 %
  shadow: "15 18 22"
  bar: "27 32 38"
  bar-ink: "249 250 252"
  stage: "223 222 220"       # fond neutre des images à juger
  chart: "52 97 201"
  chart-2: "126 135 146"
colors-dark:
  bg: "15 19 24"
  surface: "23 27 33"
  surface-2: "30 35 41"
  surface-3: "38 44 51"
  line: "45 50 57"
  line-strong: "122 129 138"
  ink: "238 240 243"
  ink-2: "195 200 206"
  ink-3: "160 165 172"
  accent: "56 107 226"
  accent-hover: "43 91 209"
  accent-ink: "255 255 255"
  accent-text: "148 183 254"
  accent-soft: "30 47 84"
  focus: "148 183 254"
  pos: "117 215 141"
  pos-soft: "26 50 31"
  neg: "246 133 122"
  neg-soft: "71 33 29"
  warn: "240 190 103"
  warn-soft: "58 43 17"
  danger: "200 58 53"
  danger-ink: "255 255 255"
  veil: "1 2 2"
  shadow: "0 0 1"
  bar: "66 72 80"
  bar-ink: "244 245 247"
  stage: "46 46 44"
  chart: "105 144 226"
  chart-2: "99 106 114"
type-scale-rem: { xs: 0.75, sm: 0.8125, base: 0.875, md: 1, lg: 1.25, xl: 1.75, 2xl: 2.5, 3xl: 3.5 }  # 12 à 56 px, plancher 12 px
spacing-rem: { 1: 0.25, 2: 0.5, 3: 0.75, 4: 1, 5: 1.25, 6: 1.5, 8: 2, 10: 2.5, 12: 3, 16: 4 }
radii-px: { xs: 3, sm: 6, md: 8, lg: 12, full: 999 }
shadows: { pop: menus et info-bulles, over: modale, tiroir, feuille, toast, barre groupée, sh-k: "1 clair, 2,4 sombre" }
z-index: { base: 0, raised: 10, sticky: 20, dock: 30, fab: 35, overlay: 40, modal: 50, popover: 60, toast: 70, tooltip: 80, skip: 90 }
motion: { fast: 120ms, base: 180ms, slow: 240ms, ease-out: "cubic-bezier(.2,.8,.2,1)", ease-in: "cubic-bezier(.4,0,1,1)", ease-in-out: "cubic-bezier(.6,0,.3,1)" }
layout: { sidebar: 232px, rail: 64px, topbar: 56px, dock: 60px + zone sûre, row: 44px, hit: 44px, breakpoints: "mobile < 768, rail 768-1099, menu >= 1100" }
---

# Vernier, le système visuel de MyFlip

**Statut : PROVISOIRE.** Le 20/10/2026, Aramis a vu les trois pistes (Vernier, Atelier de revente, Studio lumineux) et n'en aime aucune, couleurs comprises. Ce document reste la référence de STRUCTURE (noms de tokens, canaux, échelles, z-index, mouvement, composants, cadre, navigation). Les VALEURS d'identité (palette, polices, rayons) sont provisoires et seront remplacées après un nouveau tour de direction avec Aramis : elles vivent toutes dans les tokens, jamais dans les composants.

> **Direction C, « Console tactile », est abandonnée. Ne pas la réintroduire** : ni son vert forêt `#0f5132`,
> ni son citron vert `#c7f751`, ni ses neutres verdis, ni son vocabulaire « console », ni ses micro-libellés
> en capitales espacées, ni ses codes de rail (`DASH`, `STOCK`, `COMPTA`), ni Space Grotesk et JetBrains Mono,
> ni ses rayons de 22 à 26 px. Si un fichier, un commentaire ou un prompt les cite comme règle, il est périmé.

Ce document dit l'intention et les règles. Les valeurs exactes vivent dans `docs/refonte/tokens.css` (source
unique), leur branchement Tailwind et next/font dans `docs/refonte/tailwind-tokens.md`, et leur rendu, dans les
deux thèmes, dans `docs/refonte/reference.html` (page autonome, s'ouvre sans serveur). Toute divergence entre ce
fichier et `tokens.css` se tranche en faveur de `tokens.css`, puis on corrige ici.

---

## 1. Intention

MyFlip est un **instrument de mesure** pour la revente. Aramis l'ouvre huit heures par jour pour lire où en est
le mois, ce que vaut chaque pièce et ce que coûtera un sac au Studio, puis agir. L'émotion visée est le calme
et la confiance : « je lis, je sais, j'agis ».

Le nom vient du **vernier**, la petite réglette d'un pied à coulisse qui glisse contre l'échelle principale pour
lire au dixième près. La signature en découle, et l'audace du système est dépensée là, nulle part ailleurs :

1. **La réglette et l'aiguille.** Tout ce qui se compare à une cible se lit sur une réglette graduée, avec une
   aiguille : l'objectif du mois (deux échelles qui se comparent : les euros et les jours du mois), le coût
   d'un sac face au budget au Studio, le coefficient face à sa cible dans la fiche, la vie d'un article sur une
   échelle de temps.
2. **Le trait de 3 px.** Un seul geste dit « c'est ici » : entrée de menu active, ligne sélectionnée, prochaine
   action du Studio, onglet actif, onglet du dock.
3. **Deux voix typographiques.** Archivo, élargi pour les titres et les grands chiffres, normal pour
   l'interface ; Fragment Mono pour les SKU et les identifiants de modèle, avec son zéro barré
   (`LAC045` ne se lit pas `LACO45`).
4. **Un seul accent**, le cobalt, pour l'action et la sélection. Le reste est neutre et froid ; la couleur vive
   est réservée aux statuts d'article.

Tout le reste se tait : neutres presque purs, filets de 1 px, ombres réservées à ce qui flotte, petits rayons.
Sans la réglette, l'aiguille et le trait de 3 px, Vernier redevient un tableau de bord bleu générique : ces
trois motifs sont obligatoires dans les écrans réels, pas seulement dans la page de référence.

Ce qui le distingue de Fruit Drama Studio (autre appli d'Aramis, régie sombre violette, Bricolage Grotesque et
Geist) : clair et sombre de premier rang, pas de violet, pas de verre ni de halo, d'autres polices. On ne
reprend de FDS que des idées de parcours (favoris épinglés, coût lisible, confirmation qui affiche le montant).

---

## 2. Thèmes

**Les deux thèmes sont de premier rang.** Le sombre est choisi, pas inversé : neutres graphite légèrement
bleutés (acier), accent éclairci pour l'écrit (`--accent-text`) mais gardé saturé en aplat, ombres plus denses
(`--sh-k` = 2,4).

Mécanisme (inchangé dans son principe) :

- `localStorage["myflip-theme"]` vaut `light`, `dark` ou rien (automatique).
- Un script inline dans `<head>` pose `data-theme="light"` ou `data-theme="dark"` sur `<html>` **avant le
  premier paint**. Jamais dans un `useEffect` (flash blanc).
- Choix automatique : aucun attribut ; `tokens.css` applique le sombre sous
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`. Le choix « clair » doit donc
  poser `data-theme="light"` explicitement.
- `color-scheme` suit le thème (barres de défilement, contrôles natifs) ; `scrollbar-color` est en tokens
  (bug MO4).
- `<meta name="theme-color">` suit le thème **choisi dans l'appli**, pas seulement celui du système (bug X7).
- L'icône du bouton de thème est choisie en CSS : juste dès le premier affichage (bug X13). Sur ordinateur, le
  sélecteur a trois positions : Clair, Sombre, Automatique.
- Toasts, info-bulles, barres de défilement, logos et favicon suivent le thème (bugs MO3, MO4).

---

## 3. Palette et rôles

Toutes les couleurs sont des **canaux « R G B »** : `--surface: 255 255 255;`, utilisés en
`rgb(var(--surface))` ou `rgb(var(--surface) / 0.9)`. Côté Tailwind :
`surface: "rgb(var(--surface) / <alpha-value>)"`. C'est ce qui fait marcher `bg-surface/90` et `bg-veil/50`,
cause racine des voiles et barres transparents de Direction C (bugs O1, O2, O3).

| Token | Rôle |
|---|---|
| `--bg` | fond de l'application |
| `--surface` | panneaux, tableaux, modales, toasts |
| `--surface-2` | en-têtes de tableau, zones creuses, champs désactivés |
| `--surface-3` | survol, squelettes, piste des réglettes |
| `--line` | filets de 1 px (décoratifs) |
| `--line-strong` | bords de champs et de cases, graduations : au moins 3:1 |
| `--ink`, `--ink-2`, `--ink-3` | texte principal (et aiguille), secondaire, libellés ; `--ink-3` tient 4,5:1 sur tous les fonds |
| `--accent` | action principale, case cochée, remplissage des réglettes, trait de 3 px |
| `--accent-hover` | survol et pression de l'action principale |
| `--accent-ink` | texte posé sur l'accent |
| `--accent-text` | accent écrit : liens, entrée de menu active |
| `--accent-soft` | fond de sélection (ligne, entrée active) |
| `--focus` | anneau de focus, 2 px, décalé de 2 px |
| `--pos` / `-soft`, `--neg` / `-soft`, `--warn` / `-soft` | hausse et succès ; baisse et erreur ; à vérifier, hors budget |
| `--danger` / `--danger-ink` | bouton destructif (réservé aux confirmations) |
| `--veil` | voile des modales, toujours à 50 % (`bg-veil/50`) |
| `--bar` / `--bar-ink` | barre d'actions groupées, info-bulle (surface inversée) |
| `--stage` | fond neutre derrière les images à juger : il ne fausse pas les couleurs du sac |
| `--chart`, `--chart-2` | barres à une série ; série de comparaison neutre |
| `--shadow` + `--sh-k` | teinte et intensité des ombres |

L'erreur (`--neg`, rouge) et le focus (`--focus`, cobalt) ne se ressemblent jamais : un champ en erreur porte
un filet rouge, un fond `--neg-soft`, une icône et un message ; un champ en focus, un anneau cobalt.

### Contrastes (WCAG AA dans les deux thèmes)

Calculés depuis les canaux de `tokens.css` (script de conception et section Système de `reference.html`, qui
recalcule 142 ratios à partir des variables CSS : 142 sur 142 au niveau AA). Un contrôle Playwright du rendu
réel (texte posé sur son fond composé, 1 484 nœuds de texte à 1440 px, 1 287 à 390 px) ne trouve aucun échec,
en clair comme en sombre.

| Paire | Clair | Sombre | Seuil |
|---|---|---|---|
| ink / bg | 16,12 | 16,33 | 4,5 |
| ink / surface | 17,31 | 15,14 | 4,5 |
| ink-2 / surface | 9,22 | 10,26 | 4,5 |
| ink-3 / bg | 5,57 | 7,52 | 4,5 |
| ink-3 / surface-2 | 5,29 | 6,38 | 4,5 |
| ink-3 / surface-3 | 4,87 | 5,68 | 4,5 |
| ink-3 / accent-soft | 5,23 | 5,33 | 4,5 |
| accent-text / surface | 7,20 | 8,61 | 4,5 |
| accent-text / accent-soft | 6,29 | 6,58 | 4,5 |
| accent-ink / accent | 6,89 | 4,81 | 4,5 |
| accent-ink / accent-hover | 8,91 | 5,97 | 4,5 |
| danger-ink / danger | 6,06 | 5,11 | 4,5 |
| bar-ink / bar | 15,69 | 8,46 | 4,5 |
| pos / pos-soft | 5,12 | 7,80 | 4,5 |
| neg / neg-soft | 5,40 | 5,69 | 4,5 |
| warn / warn-soft | 5,12 | 8,00 | 4,5 |
| texte des 10 pastilles de statut (minimum) | 6,49 | 8,56 | 4,5 |
| line-strong / surface | 3,94 | 4,39 | 3 |
| line-strong / surface-2 | 3,48 | 4,02 | 3 |
| line-strong / bg | 3,67 | 4,73 | 3 |
| focus / bg | 6,41 | 9,29 | 3 |
| accent / surface | 6,89 | 3,60 | 3 |
| chart / surface | 5,68 | 5,50 | 3 |
| icônes des 10 statuts sur surface et surface-2 (minimum) | 3,38 | 4,69 | 3 |
| marqueurs des 6 canaux (minimum) | 3,59 | 3,99 | 3 |

**Aucune opacité** sur `line-strong`, `focus`, `accent` ni sur les marqueurs `st-*` et `ch-*` : ils perdraient
leur contraste (seule exception : `::selection`, `accent` à 22 %).

---

## 4. Statuts et canaux

### Les 10 statuts (`lib/statutColors.ts`)

Chaque statut a **trois tokens par thème** et **une icône propre**, au moins 16 px, plus son libellé : on le
reconnaît sans lire, et jamais par la seule couleur. Les icônes viennent de lucide-react.

| Statut | Clé | Icône lucide | Marqueur / texte / fond, clair | Sombre |
|---|---|---|---|---|
| Brouillon | `brouillon` | `CircleDashed` | 123 129 135 / 73 77 84 / 237 239 241 | 141 147 154 / 205 209 216 / 43 46 50 |
| En stock | `stock` | `Package` | 161 121 12 / 108 76 2 / 251 240 207 | 215 179 85 / 236 214 155 / 55 44 21 |
| En lavage | `lavage` | `Droplet` | 33 140 181 / 0 90 123 / 223 244 253 | 97 183 222 / 172 220 245 / 23 49 62 |
| Repassé | `repasse` | `Shirt` | 136 100 192 / 92 58 139 / 242 237 255 | 182 153 235 / 218 204 247 / 52 42 70 |
| Photos prêtes | `photos` | `Camera` | 196 80 138 / 137 39 86 / 255 234 242 | 233 135 179 / 251 194 214 / 68 37 51 |
| En vente | `vente` | `Tag` | 6 140 140 / 4 92 94 / 218 247 246 | 87 197 197 / 166 225 224 / 17 52 53 |
| En livraison | `livraison` | `Truck` | 190 107 11 / 132 69 0 / 255 237 219 | 239 165 85 / 248 202 167 / 66 42 25 |
| À comptabiliser | `compta` | `Receipt` | 197 52 67 / 155 29 41 / 254 235 233 | 237 116 115 / 252 192 184 / 70 38 35 |
| Vendu | `vendu` | `CircleCheck` | 42 144 75 / 16 96 45 / 224 247 228 | 111 200 132 / 180 226 188 / 28 52 34 |
| Perdu | `perdu` | `CircleHelp` | 102 115 131 / 61 73 88 / 235 239 244 | 128 141 159 / 197 207 219 / 42 46 52 |

Tokens : `--st-<clé>` (icône, filet, barre), `--st-<clé>-ink` (texte), `--st-<clé>-soft` (fond de pastille).
« En vente » est sarcelle, loin du cobalt de l'accent : une ligne sélectionnée ne se confond pas avec une
pastille « En vente ».

`lib/statutColors.ts` cesse de porter des hexadécimaux en style inline : il devient une table de **classes
écrites en entier** (`{ pill: "bg-st-vente-soft text-st-vente-ink", icon: "text-st-vente", Icon: Tag }`), que
le JIT de Tailwind voit. La réserve d'accessibilité de Direction C (1,7:1 à 2,9:1) disparaît.

**Sélecteur de statut du Stock** : il reste un `<select>` natif habillé en pastille (icône à gauche, chevron à
droite, 28 px de haut, 150 px de large ; 40 px et 16 px de texte sur mobile). Il est natif exprès : la liste
s'affiche hors du conteneur virtualisé et reste utilisable au clavier (PRD § 10). Choisir « Vendu » ouvre la
fenêtre de vente au lieu de changer le statut sans prix.

**Graphiques par statut** : pas de donut à dix parts. Une liste de barres libellées (icône, libellé, barre en
`--st-<clé>`, valeur) : l'identité passe par le libellé.

### Canaux de vente (`lib/canalColors.ts`)

Un carré de 10 px en `--ch-<clé>`, puis le nom en encre. Jamais de texte blanc sur une pastille pleine.

| Canal | Token | Clair | Sombre |
|---|---|---|---|
| Vinted | `--ch-vinted` | 6 141 158 | 6 141 158 |
| Vinted Go | `--ch-vinted-go` | 161 131 8 | 176 146 46 |
| Vestiaire Collective | `--ch-vc` | 115 77 190 | 142 113 214 |
| Leboncoin | `--ch-lbc` | 220 99 30 | 223 108 50 |
| En main propre | `--ch-mp` | 188 58 131 | 199 76 142 |
| Autre | `--ch-autre` | 123 129 135 | 123 129 135 |

Validés comme palette catégorielle (ordre Vinted, Vinted Go, Vestiaire Collective, Leboncoin, En main propre)
par le validateur du skill `dataviz` dans les deux thèmes : bande de clarté, chroma, séparation des voisins
pour les daltonismes et en vision normale, contraste de 3:1 au moins.

### Comptes de vente (`lib/comptesVente.ts`)

Fripandtrend, Enorab18, Vestiaire Collective : ce sont des pseudos, pas des marques. Ils restent **neutres**,
avec l'icône `User` et le nom en `--ink-2`. Les graphiques « par compte » utilisent une seule teinte
(`--chart`) et des libellés directs.

---

## 5. Typographie

| Rôle | Famille | Réglage |
|---|---|---|
| Interface, titres, chiffres | Archivo | `font-stretch` 100 % pour l'interface, 115 % (`--wide`) pour les titres de page et de modale, 118 à 122 % pour le wordmark et la landing |
| SKU, identifiants de modèle (`bytedance/seedream-4`) | Fragment Mono 400 | zéro barré : distingue O et 0 |

- **Chiffres tabulaires partout** (`font-variant-numeric: tabular-nums` posé sur `body`) ; montants et
  coefficients alignés à droite dans les tableaux. Les prix restent en Archivo : **pas de zéro barré dans les
  montants**, seulement dans les SKU.
- Montants : `4 862,50 €` avec espace fine insécable (U+202F) pour les milliers et insécable (U+00A0) avant
  « € » ; coefficient `×3,8` avec le signe × (U+00D7). Guillemets « » avec espace fine insécable.
- La flèche (U+2192) et la croix (U+2715) ne sont servies par aucun sous-ensemble de `next/font/google` : icônes
  `ArrowRight` et `X` de lucide-react. Jamais de « → » collé à un lien ou un bouton.
- Couverture vérifiée dans Chromium (police réellement utilisée, glyphe par glyphe) : é è ê ë à â ç ù û ô î ï
  œ Œ É À « » ’ … € × − et les espaces U+202F et U+00A0 sont servis par Archivo.

### Échelle : 8 tailles, en rem, plancher 12 px

| Token | rem | px | Rôle |
|---|---|---|---|
| `--t-xs` | 0,75 | 12 | graduations, en-têtes de tableau, pastilles, libellés du dock |
| `--t-sm` | 0,8125 | 13 | cellules de tableau, aides, hints |
| `--t-base` | 0,875 | 14 | interface (taille du `body`) |
| `--t-md` | 1 | 16 | corps de texte, **tous les champs sur mobile** (pas de zoom iOS) |
| `--t-lg` | 1,25 | 20 | titres de panneau et de modale |
| `--t-xl` | 1,75 | 28 | titre de page (Archivo élargi) |
| `--t-2xl` | 2,5 | 40 | chiffre du mois sur mobile, titres de landing sur mobile |
| `--t-3xl` | 3,5 | 56 | chiffre du mois sur ordinateur, titre de landing |

Aucune taille en `em` dérivée (elles sortaient de l'échelle), aucune en px, aucune sous 12 px. Le zoom texte du
navigateur fonctionne (bugs F2, F3). Interlignes : `--lh-tight` 1,05 (grands chiffres), `--lh-snug` 1,25
(titres), `--lh-ui` 1,45 (interface), `--lh-prose` 1,6 (texte long). Graisses : 400 texte, 500 à 560 libellés,
600 à 650 titres et chiffres, 680 grands chiffres et wordmark. Pas de capitales espacées, pas de sur-titres.

---

## 6. Espacements, rayons, ombres, profondeur

- **Espacements** : pas de 4 px, en rem (`--sp-1` 4 px … `--sp-16` 64 px). Ce sont exactement les pas de
  Tailwind (`p-4` = 16 px). Gouttière 16 px sur mobile, 24 à 32 px sur ordinateur.
- **Rayons** petits et croissants avec la surface : `--r-xs` 3 px (pastilles, cases, touches), `--r-sm` 6 px
  (boutons, champs), `--r-md` 8 px (panneaux, cartes), `--r-lg` 12 px (modale, tiroir, feuille), `--r-full`
  (avatar, compteurs). Pas de pilules partout.
- **Profondeur** : les panneaux posés sur le fond n'ont **aucune ombre**, seulement un filet `--line`. Les
  ombres sont réservées à ce qui flotte : `--shadow-pop` (menus, listes, info-bulles) et `--shadow-over`
  (modale, tiroir, feuille, toast, barre groupée). Leur intensité est multipliée par `--sh-k` (1 en clair,
  2,4 en sombre).
- Empilement : fond `--bg` → panneau `--surface` → en-tête `--surface-2` → survol `--surface-3` → sélection
  `--accent-soft` + trait de 3 px.

---

## 7. Échelle de z-index

| Token | Valeur | Usage |
|---|---|---|
| `--z-base` | 0 | flux normal |
| `--z-raised` | 10 | en-tête de tableau collant |
| `--z-sticky` | 20 | barre du haut, menu latéral |
| `--z-dock` | 30 | dock mobile, barres d'actions fixes (Mise en vente, sélection du Stock) |
| `--z-fab` | 35 | bulle de l'assistant, décalée au-dessus des barres (bug X2) |
| `--z-overlay` | 40 | voile |
| `--z-modal` | 50 | modale, tiroir, feuille « Plus » |
| `--z-popover` | 60 | menus et listes, y compris ouverts dans une modale |
| `--z-toast` | 70 | toasts, au-dessus d'une modale pour garder « Annuler » |
| `--z-tooltip` | 80 | info-bulles |
| `--z-skip` | 90 | lien « Aller au contenu » |

Plus jamais deux éléments au même niveau départagés par l'ordre du DOM (bug M3). Pas de `z-[n]` ni de
`z-10`… dans un composant.

---

## 8. Mouvement

Le mouvement explique ce qui change (une apparition, un déplacement, une confirmation). Rien ne bouge au
chargement d'une page ; pas d'entrée en fondu sur chaque section.

| Token | Valeur | Usage |
|---|---|---|
| `--d-fast` | 120 ms | survol, appui, changement de couleur |
| `--d-base` | 180 ms | toast, coche, pastille, barre groupée |
| `--d-slow` | 240 ms | modale, tiroir, feuille, déplacement de ligne, aiguille d'une réglette |
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | entrées |
| `--ease-in` | `cubic-bezier(.4,0,1,1)` | sorties |
| `--ease-in-out` | `cubic-bezier(.6,0,.3,1)` | trajets |

- Tout est en **transitions** CSS, donc interruptible ; entrées et sorties symétriques (la sortie reprend la
  courbe `--ease-in`).
- `prefers-reduced-motion: reduce` met les trois durées à 0 ms **dans les tokens**, sans `!important` global ;
  le spinner s'arrête (`motion-safe:animate-spin`), le reflet du squelette aussi. Vérifié sur
  `reference.html` : aucune animation en cours (`document.getAnimations()`), `--d-slow` = 0 ms.
- Il ne reste que deux keyframes : `spin` et `shimmer`. Les ~30 de Direction C disparaissent.
- Bouton « en cours » : le libellé reste, un indicateur s'ajoute, la largeur ne change pas.
- Toast « Annuler » : 5 secondes, avec une barre de temps qui se vide (figée sous mouvement réduit).

---

## 9. Composants communs à créer (PRD § 8)

Une seule implémentation de chacun, dans `components/ui/`. Les pages les consomment ; plus aucun bouton ni champ
stylé à la main. Variantes avec `cva`, fusion de classes avec `tailwind-merge`.

**Bouton** (`Button`)
- Variantes : `primary` (accent, texte `accent-ink`), `secondary` (surface, filet `line-strong`), `ghost`
  (transparent, `ink-2`), `danger` (réservé aux confirmations destructives), `reject` (surface, texte `neg` :
  « Rejeter » au Studio), `bar` (sur la barre groupée).
- Tailles : `sm` 30 px, `md` 36 px, `lg` 44 px ; `icon` carré. Sur mobile, **44 px minimum** partout.
- États : survol, appui (descend de 1 px), focus (anneau), désactivé (`surface-3`, `ink-3`), en cours
  (`aria-busy`, spinner, largeur figée).
- Un raccourci clavier s'affiche dans une touche `Kbd` ; dans un bouton plein, la touche reprend l'encre du
  bouton sur fond transparent (aucun contraste composé à vérifier).
- Le libellé dit ce qui se passe : « Enregistrer la vente », « Confirmer 1,15 € », jamais « Valider » pour
  autre chose qu'une décision du Studio.

**Champ** (`Input`), **zone de texte** (`Textarea`), **sélecteur** (`Select` natif habillé)
- 36 px et `t-base` sur ordinateur ; **44 px et 16 px sur mobile**.
- Filet `line-strong`, survol `ink-3`, focus : anneau `focus` 2 px + filet `accent`.
- Erreur : `aria-invalid`, filet et anneau intérieur `neg`, fond `neg-soft`, message avec icône sous le champ,
  relié par `aria-describedby`. **L'erreur n'apparaît qu'après une tentative d'envoi**, jamais à l'ouverture.
- Affixes : unité (« € ») à droite, icône à gauche. Montants alignés à droite.
- Désactivé : `surface-2`, `ink-3`, filet `line`.
- Date : affichage et saisie `jj/mm/aaaa` quel que soit le navigateur (pas d'`input type=date` brut, qui
  affiche le format de la langue du système).

**Case à cocher** (`Checkbox`), **interrupteur** (`Switch`) : 16 px (20 px sur mobile, ligne de 44 px), cochée
en accent.

**Badge et pastille de statut** (`Badge`, `StatutPill`, `StatutSelect`) : pastille 26 px, `r-xs`, icône du
statut 16 px + libellé ; badges `pos`, `neg`, `warn`, `accent`, neutre ; compteur rond (`count-badge`) en
`st-compta-soft` / `st-compta-ink`.

**Carte / panneau** (`Panel`) : `surface`, filet `line`, `r-md`, sans ombre ; en-tête optionnel (titre `h3` +
aide), pied optionnel.

**Modale et tiroir** (`Dialog`, `Drawer`, `Sheet`) : **une seule mécanique** (Radix Dialog recommandé) :
voile `bg-veil/50` qui couvre tout l'écran (barre du haut et menu compris, bug X1), focus initial, piège de
focus, Échap, retour du focus au déclencheur, verrouillage du défilement, `role="dialog"` et `aria-modal`
(bug X6). Croix de fermeture de 44 px. Sous 768 px, modale et tiroir deviennent une **feuille par le bas**,
pleine largeur, bouton principal pleine largeur dans la zone du pouce. Le tiroir (fiche article) arrive de la
droite sur ordinateur, 440 px.

**Menu** (`Menu`) : `surface`, `shadow-pop`, `r-md`, entrées de 36 px avec icône, séparateur, entrée
destructive en `neg`, raccourcis à droite.

**Onglets** (`Tabs`) : texte `ink-2`, onglet actif en `ink` 620 avec le **trait de 3 px** accent en bas ;
compteur optionnel.

**Contrôle segmenté** (`Segmented`) : périodes (Mois, 30 jours, Trimestre, Tout) et thème.

**Tableau** (`DataTable`) : en-tête `surface-2`, collant (`z-raised`) ; lignes de **44 px** (`--row-h`, à
reporter dans `@tanstack/react-virtual`), une seule ligne de texte, filets `line`, pas de fond alterné ;
survol `surface-2` ; sélection `accent-soft` + trait de 3 px à gauche ; ligne de total à **double filet
comptable** sous les montants. Sur ordinateur, le Stock tient sans défilement horizontal (colonnes
masquables) pour que l'en-tête colle à la fenêtre ; un tableau large secondaire défile dans son conteneur avec
une ombre d'indice. Sous 768 px : cartes (règle du projet).

**États vide, erreur, chargement** (`EmptyState`, `ErrorState`, `Skeleton`) : icône dans un carré
`surface-2` (ou `neg-soft` pour l'erreur), titre, une phrase qui dit quoi faire, un bouton. Le squelette reprend
la forme du contenu (lignes de tableau de 32 px) avec `aria-busy`. L'ancien `Loader` « TRACE » disparaît.

**Toasts** (Sonner, stylé par tokens) : `surface`, filet `line`, `shadow-over`, icône `pos` / `neg` / `ink-3`,
bouton « Annuler » ou « Réessayer », barre de temps. Bas à droite sur ordinateur ; centrés au-dessus du dock et
de la zone sûre sur mobile.

**Réglette** (`Vernier`, signature) : piste `surface-3` de 10 px, remplissage `accent`, graduations
`line-strong` (majeures en `ink-3`), libellés `t-xs`, aiguille `ink` de 2 px avec sa valeur au-dessus, repère de
cible (trait plein ou pointillé `ink-2`), écart signé en `pos` ou `warn`. Variante double échelle pour
l'objectif du mois (euros en haut, jours du mois en bas, le jour se projette en rythme attendu) ; variante
courte pour le budget d'un sac (zone hachurée `warn` au-delà de la cible) et pour le coefficient dans la
fiche. Une réglette porte toujours une phrase de lecture et un `aria-label` complet. **Jamais une
micro-réglette par ligne de tableau** (bruit sur 1 200 lignes).

**Vie d'un article** (`LifeRuler`) : stations posées sur une échelle de temps (la distance est la durée
réelle), icône de statut dans un cercle `st-*-soft`, date sous chaque étape clé, durée en vente au-dessus.

**Vignette produit** (`Thumb`) : 32 px dans le Stock (colonne masquable, tient dans les 44 px), 40 px sur les
cartes mobiles, fond `--stage`.

---

## 10. Cadre

- **Hauteur** : un seul conteneur gère la hauteur, en `100dvh` ; plus de double `min-h-screen` sous la barre du
  haut (bug M2).
- **Menu latéral** (≥ 1 100 px) : 232 px, `surface`, filet droit. Logo (tuile cobalt avec graduations + mot
  « MyFlip » en Archivo élargi), trois groupes nommés en phrases (« Au quotidien », « Studio », « Analyse »),
  pied toujours visible (Réglages, Mon compte, liens légaux, © 2026 MyFlip). Entrée de 36 px ; active =
  `accent-soft`, texte `accent-text` 640 et trait de 3 px ; **rendue par `aria-current` dès le serveur**, aucun
  indicateur calculé en JS (bugs M1, X4). Compteurs à droite (« 1 243 », « 3 à juger », badge « 4 »).
- **Rail** (768 à 1 099 px, ou replié) : 64 px, icônes seules de 40 px, badges en exposant, mêmes règles
  d'entrée active. Le repli est conservé dans `localStorage["myflip-sidebar"]`, posé avant le paint.
- **Barre du haut** : 56 px, collante (`z-sticky`), `bg-bg/90` + flou : opaque à la lecture. Titre de l'écran,
  recherche (touche `/`, va droit à la fiche d'un SKU), notifications, thème, avatar (menu du compte avec « Se
  déconnecter »).
- **Dock mobile** (< 768 px) : 5 places fixes, 60 px + `env(safe-area-inset-bottom)` : Accueil, Stock,
  **Vendre** (au centre, ouvre la fenêtre de vente), À compta (badge), **Plus**. Libellés de 12 px, onglet
  actif en `accent-text` avec trait de 3 px en haut. Plus rien ne défile à l'horizontale (bug X9).
- **Feuille « Plus »** : une feuille du bas (même mécanique que la modale) avec Commandes, Calendrier,
  Statistiques, Mise en vente et Studio (marqués « sur ordinateur »), Réglages, Mon compte, liens légaux et
  « Se déconnecter ».
- **Barres fixes** (sélection du Stock, actions de Mise en vente) : flottantes et compactes, `bar`,
  `shadow-over`, `z-dock`, posées au-dessus du dock et de la zone sûre (bug MO2), sans recouvrir le pied du menu
  latéral (bug X3) ; la liste réserve en bas la place de la barre ouverte.
- **Bulle de l'assistant** : `z-fab`, décalée au-dessus de toute barre d'actions ouverte (bug X2).
- **Toasts** : voir § 9.

---

## 11. Navigation (nouveau découpage)

| Entrée | Route | Où | Ce qui change |
|---|---|---|---|
| **Au quotidien** | | | |
| Tableau de bord | `/dashboard` | menu ; dock « Accueil » | s'appelait « Dashboard » |
| Stock | `/stock` | menu (nombre d'articles) ; dock | — |
| Mise en vente | `/mise-en-vente` | menu ; « Plus » sur mobile, marqué « sur ordinateur » | écran pour ordinateur (décision du 11/08/2026) |
| À comptabiliser | `/a-comptabiliser` | menu (compteur) ; dock « À compta » | — |
| Commandes | `/commandes` | menu ; « Plus » | remonte dans « Au quotidien » |
| **Studio** | | | |
| Coloris | `/studio` | menu (« N à juger ») ; « Plus », sur ordinateur | était « Studio », entrée isolée en bas |
| Bilan | `/studio/bilan` | menu | devient une entrée du menu |
| **Analyse** | | | |
| Calendrier | `/calendrier` | menu ; « Plus » | — |
| Statistiques | `/statistiques` | menu ; « Plus » | — |
| **Pied du menu** | | | |
| Réglages | `/parametres` | pied du menu ; « Plus » | **remplace « Prompts »**. Onglets « Modèles d'annonce » (prompts d'annonces) et « Studio » (prompt maître, prompts d'angle, budget par sac, taux $ → €). Le Studio y mène par son bouton « Réglages du Studio » (`/parametres?onglet=studio`, route conservée). |
| Mon compte | `/compte` | pied du menu, menu de l'avatar ; « Plus » | — |
| Se déconnecter | — | menu de l'avatar ; bas de « Plus » | n'est plus une entrée du dock (« SORTIR ») |
| **Actions** | | | |
| Vendre | fenêtre « Enregistrer une vente » | dock mobile ; bouton de ligne du Stock et d'À comptabiliser | une seule fenêtre partout |
| Chercher | touche `/` | barre du haut, sur ordinateur | va droit à la fiche d'un SKU |

Aucune route n'est supprimée. `/demarrage`, la 404, `/login`, `/signup`, `/reset-password` et `/legal/*` gardent
leurs routes et prennent la nouvelle identité (sans menu pour les pages publiques).

---

## 12. Écrans clés

- **Tableau de bord** : répond d'abord à « où en est mon mois ». Chiffre d'affaires au centime en
  `t-3xl`, marge brute, reste à vendre, puis la **réglette double** (objectif en euros, jours du mois) et la
  phrase d'écart (« 991 € d'avance sur le rythme »). Ensuite 4 indicateurs, le chiffre d'affaires par semaine
  (barres `chart`, semaine en cours hachurée, ligne de rythme, info-bulle, tableau des valeurs), « À faire pour
  finir le mois » (À comptabiliser, images à juger, articles en vente depuis 60 jours), répartition par compte
  et par marque (barres libellées).
- **Stock** : barre d'outils (recherche SKU, marque, lot, commande, Colonnes), les 10 statuts visibles en puces
  avec compteurs (un sélecteur natif sur mobile), tableau de 44 px (case, vignette, SKU, article, lot, achat,
  prix, coefficient, statut, compte, en vente depuis, actions), total à double filet, barre groupée flottante
  (changer le statut, Vendu, compte de vente). Coefficient bas : texte `warn` + icône.
- **Fenêtre « Enregistrer une vente »** (remplace SellModal et SellDialog) : article (vignette, SKU, achat),
  prix, date (jj/mm/aaaa), canal, compte, **marge et coefficient recalculés en direct**, case « Mettre en
  À comptabiliser », boutons « Annuler » et « Enregistrer la vente ». Toast « Vente enregistrée » avec
  « Annuler ».
- **Studio, fiche d'un coloris** : en tête la **prochaine action** (trait de 3 px, bouton) et la réglette des
  6 étapes (Photos, Angles, Modèles, Génération, Juger, Annonce ; l'étape en cours porte l'aiguille).
  Jugement : vraie photo et image générée côte à côte sur `--stage`, **Rejeter (R) et Valider (V) juste
  sous les images**, « Corriger un détail » ; à droite (en dessous sur mobile) l'avis de l'IA détail par détail
  (« Fidèle » / « Dérive », « Montrer sur l'image » qui entoure la zone), présenté comme une aide, avec le
  modèle vérificateur et l'heure ; puis les **tentatives de la prise**, rejetées et échecs compris (image,
  modèle, coût, durée, verdict, décision). Chaque décision ouvre un toast « Annuler » de 5 s. États distincts
  « Vérification échouée » et « Pas encore vérifiée ».
- **Studio, modèles** : recherche, favoris épinglés en tête (étoile basculable, `aria-pressed`), filtres
  « Dans le budget » et « Déjà testé », tri par coût par sac ou par réussite. Par modèle : nom, identifiant en
  mono, prix par image, **coût d'un sac de 15 prises sur une jauge face au budget** (hachures au-delà), badges
  « Hors budget », « Prix inconnu », « Jamais testé », réussite au premier coup (sur n essais), coût moyen réel.
  Case pour lancer avec 1 à 3 modèles. **Devis** : budget par sac (1,00 € par défaut) et taux ($ → €)
  réglables, lignes par modèle, total, réglette du sac complet face au budget ; le bouton affiche le montant
  (« Générer 8 images, 0,24 € », ou « Confirmer 0,70 € » au-delà du budget ou si un prix est inconnu, qui ouvre
  la confirmation). **Comparaison** : vraie photo + 2 ou 3 images d'une même prise, coût et verdict, « Retenir »
  ou « Aucune ne convient ». Jamais de prix inventé ; catalogue hors ligne = dernière liste connue +
  « Rafraîchir ».
- **Landing** : titre « Achète en lot. Vends à l'unité. Garde le compte. » en Archivo élargi `t-3xl`, la vie
  d'une pièce sur une réglette de temps (achetée 6,80 €, vendue 26,00 €, marge), trois bandes (stock, annonces,
  Studio). Pas de faux navigateur, pas de dégradé décoratif.

---

## 13. Règles

1. **Aucune couleur, taille de texte ou z-index en dur dans un composant.** Tout passe par les tokens.
   Exceptions documentées : couleurs des vêtements et des sacs (données), e-mails transactionnels.
2. **Opacités par canaux** (`bg-surface/90`, `bg-veil/50`). Jamais d'opacité sur `line-strong`, `focus`,
   `accent`, `st-*`, `ch-*`.
3. **Aucun nom de famille de police** dans un composant : `font-sans` / `font-mono`, qui lisent `--font-sans` /
   `--font-mono` (bug F1).
4. **Chiffres tabulaires** partout, alignés à droite dans les tableaux ; zéro barré réservé aux SKU.
5. **Jamais la couleur seule** : statut = icône + libellé ; canal = carré + nom ; écart = flèche + texte +
   signe ; erreur = icône + message.
6. **Mobile** : cibles de 44 px, champs à 16 px, barres fixes au-dessus du dock et de la zone sûre, aucune page
   qui défile à l'horizontale (sauf un tableau large, dans son conteneur, avec indice).
7. **Pas de capitales espacées, pas de sur-titres, pas de codes** (« DASH », « STOCK »), pas de chaînes reliées
   par des points médians, pas de flèche ajoutée au texte d'un lien. L'interface parle français, en phrases,
   au tutoiement.
8. **Une seule implémentation** par primitive (§ 9) ; une page qui a besoin d'une variante l'ajoute au
   composant, pas en local.
9. **Le trait de 3 px, la réglette et l'aiguille** sont les seules signatures : on n'en ajoute pas d'autres
   (pas de verre, pas de halo, pas de dégradé décoratif).
10. Un test Vitest (étape 3) bloque les valeurs arbitraires (`text-[`, `z-[`, hexadécimaux, opacités interdites)
    et recalcule les contrastes de `tokens.css` dans les deux thèmes.

---

## 14. Limites connues et points à faire valider

- **Le bleu reste l'accent le plus répandu du logiciel pro.** L'identité tient à la réglette, à l'aiguille, au
  trait de 3 px et à Archivo élargi ; si l'implémentation les dilue, on obtient un tableau de bord générique.
- **Rien n'a été jugé sur de vraies photos de sacs** : les planches utilisent des dessins. À faire valider par
  Aramis sur un vrai coloris, en clair et en sombre (le fond `--stage` est fait pour ça).
- Testé dans Chromium uniquement (headless, 1440 et 390 px). Ni Safari iOS réel, ni Firefox : la zone sûre
  n'est gérée qu'en CSS.
- En stock, En livraison et À comptabiliser restent proches en teinte (ocre, orange, rouge) : l'icône et le
  libellé les distinguent. Pour les daltonismes, En lavage et Repassé (bleu, violet) aussi.
- Les prix et identifiants de modèles des planches sont des exemples de mise en page, pas une lecture
  d'OpenRouter.

---

## 15. Historique

- **20/10/2026** : Vernier adopté. Choisi parmi trois pistes (A « Vernier », B « Atelier de revente », C
  « Studio lumineux ») jugées sous trois lentilles (usage, identité, système). Retenu : A, la mieux placée sur
  l'usage quotidien et à un point de C sur le système, avec ses deux défauts mesurés corrigés (texte à 11 px
  sous 4,5:1, abus du 11 px : le plancher passe à 12 px). Greffes : de C, la mise en page du jugement, la
  fenêtre de vente avec calcul en direct, la vignette produit, la barre groupée flottante, le fond neutre des
  images ; de B, le double filet comptable, la case « À comptabiliser », la bande des tentatives, une icône
  propre par statut. Planches : `docs/refonte/directions/{a,b,c}/`.
- Avant : Direction C, « Console tactile » (09/08/2026), et avant elle « Forest Precision ». Toutes deux
  abandonnées.
