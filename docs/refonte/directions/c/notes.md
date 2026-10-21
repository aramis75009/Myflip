# Piste C — « Studio lumineux »

Page : `index.html` (autonome, à ouvrir en `file://`). Captures : `captures/`.

## Intention

MyFlip se comporte comme un studio photo bien éclairé. Les surfaces sont claires et
légèrement teintées, comme un fond de studio en papier ; les produits (sacs, polos,
shorts) sont posés sur un « cyclo », ce fond courbe sans horizon, avec leur ombre
portée. Un seul accent, l'outremer, porte les actions et la sélection ; les chiffres
importants sont composés en large (Mona Sans à 125 % de chasse), nets et calmes,
comme les widgets d'iOS.

Pour Aramis, qui passe ses journées entre son stock (centaines de lignes) et le Studio
(qui juge des images). L'émotion visée : la confiance tranquille d'un outil natif
macOS/iOS bien fini. On voit ses chiffres sans effort, et les images passent en premier.

Ce qui la distingue :
- de **Direction C** : pas de vert forêt ni de lime, pas de vocabulaire « console », pas
  de capitales espacées ni de mono pour les micro-libellés ;
- de **Fruit Drama Studio** : clair d'abord (FDS est sombre seulement), l'accent est
  l'outremer (teinte OKLCH 266, contre le violet `#7C5CFF` de FDS, teinte 285), et la
  police est Mona Sans (FDS : Bricolage Grotesque et Geist).

## Signature (ce qui doit survivre à l'implémentation)

1. **Le fond de studio** (`.stage`) : un mur, un sol et un halo de lumière, avec une
   ombre de contact. Il sert aux vignettes du Stock, aux tiroirs, aux états vides et à
   la landing. En sombre, le halo devient un projecteur sur un cyclo de nuit.
2. **Les chiffres larges** : `font-stretch: 125%` sur le chiffre du mois, les
   indicateurs et la landing. On le fait avec la même famille, sans seconde police.
3. **Le verre, avec retenue** : il sert à la barre du haut, au dock mobile, à la barre
   d'actions groupées, aux toasts et au voile des fenêtres. Il ne sert jamais aux cartes
   de contenu. `prefers-reduced-transparency` rend ces surfaces opaques.
4. **Le menu latéral flottant** : un panneau arrondi détaché du bord, avec une entrée
   active en aplat d'accent, visible dès le rendu serveur (corrige M1).
5. **Le zéro barré des chiffres tabulaires** de Mona Sans : dans les SKU, on distingue
   `O` et `0` (`COO004`).

## Polices

| Famille | Rôle | Licence | Chargement |
|---|---|---|---|
| **Mona Sans** (GitHub), variable `wght 200–900`, `wdth 75–125` | toute l'interface, chiffres compris | SIL OFL 1.1 | Google Fonts → `next/font/google` (`Mona_Sans`, `axes: ['wdth']`, `variable: '--font-sans'`, posée sur `<html>`) |

Une seule famille. Pas de mono : les SKU, prix et coefficients utilisent les chiffres
tabulaires de Mona Sans.

**Couverture, vérifiée par rendu Chromium + CDP `CSS.getPlatformFontsForNode`
(dossier de travail, hors dépôt) :**
- accents français, `œ Œ « » ’ … É À Ç Ê È Ù Î Ï`, `€`, `×`, `−` et l'espace fine
  insécable U+202F : servis par Mona Sans ;
- `→` (U+2192) : **absent du sous-ensemble `latin` servi par Google** (sa plage
  s'arrête à U+2191 et U+2193). Il passe alors en police système. Sur 16 familles
  testées, seule Onest le sert ;
- `✕` (U+2715) : **absent de toutes les familles testées**, rendu par Zapf Dingbats.

→ Recommandation : les flèches et la croix de fermeture passent en icônes lucide
(`ArrowRight`, `X`), déjà en dépendance. Pour un multiplicateur dans le texte, on écrit
`×` (U+00D7), qui est couvert.

**Chiffres**
- `tabular-nums` partout où des chiffres s'alignent : tableaux, prix, coûts, SKU,
  axes. Dans Mona Sans, ce jeu est de style « mono » : le zéro est barré et le 1 a un
  empattement.
- `proportional-nums` seulement sur les chiffres d'affichage isolés (chiffre du mois,
  indicateurs, landing), où rien ne s'aligne : le zéro barré y ferait « code ».

## Tokens couleur (canaux R G B)

Ils sont conçus en OKLCH (teinte des neutres : 272, un gris perle froid à peine lilas),
puis convertis en sRGB. Les valeurs OKLCH d'origine sont dans les commentaires de
`index.html`.

En Tailwind 3, on écrit par exemple `surface: 'rgb(var(--surface) / <alpha-value>)'`,
ce qui fait marcher `bg-surface/90`, `bg-scrim/45`, etc. C'est la correction à la racine
des bugs O1, O2 et O3.

| Token | Rôle | Clair | Sombre |
|---|---|---|---|
| `--bg` | fond de page | 244 246 251 | 13 16 25 |
| `--surface` | cartes, fenêtres | 255 255 255 | 21 24 35 |
| `--surface-2` | en-têtes de tableau, champs inactifs | 239 241 248 | 28 32 44 |
| `--surface-3` | survol, pistes | 228 231 241 | 37 41 55 |
| `--line` | filets décoratifs | 220 223 233 | 42 45 57 |
| `--line-strong` | bord des champs et cases (≥ 3:1) | 133 139 159 | 101 107 126 |
| `--ink` | texte | 24 29 47 | 238 240 246 |
| `--ink-2` | texte secondaire | 73 79 99 | 191 194 205 |
| `--ink-3` | texte tertiaire (≥ 4,5:1 partout) | 103 109 127 | 154 158 171 |
| `--accent` | actions, sélection, focus | 40 80 226 | 126 161 255 |
| `--accent-hover` | survol de l'accent | 31 66 203 | 148 180 255 |
| `--accent-soft` | fonds accentués | 226 237 255 | 33 47 87 |
| `--accent-ink` | liens, texte accentué | 35 72 206 | 158 187 255 |
| `--on-accent` | texte sur accent | 255 255 255 | 10 19 49 |
| `--pos` / `--pos-soft` | réussite, marge | 5 119 59 / 224 247 229 | 109 212 141 / 22 50 31 |
| `--neg` / `--neg-soft` / `--on-neg` | erreur, danger | 194 39 45 / 255 235 233 / 255 255 255 | 252 126 118 / 69 30 28 / 37 14 13 |
| `--warn` / `--warn-soft` | alerte, hors budget | 172 79 0 / 255 238 219 | 255 172 94 / 64 40 17 |
| `--spark` | étoile de favori (mandarine) | 224 109 0 | 254 157 74 |
| `--scrim` | voile | 16 20 40 | 1 1 5 |
| `--stage-wall` / `-floor` / `-glow` | fond de studio | 237 240 248 / 219 223 236 / 252 253 255 | 49 53 67 / 32 35 48 / 104 110 129 |

En clair, l'accent est un outremer saturé avec du texte blanc. En sombre, il devient un
bleuet lumineux avec du texte encre : un outremer foncé disparaîtrait sur le fond de nuit.

**Statuts** : trois tokens par statut, `--st-<clé>` (texte), `-bg` (fond de pastille)
et `-dot` (pastille ou filet, ≥ 3:1 sur la carte). Chaque statut est aussi porté par une
icône et un mot.

| Statut (`lib/statutColors.ts`) | Clé | Icône | Teinte OKLCH |
|---|---|---|---|
| Brouillon | `brouillon` | cercle pointillé | neutre |
| En stock | `stock` | carton | 80 (ambre) |
| Photos prêtes | `photos` | appareil photo | 355 (rose) |
| En vente | `vente` | étiquette | 240 (bleu ciel) |
| En livraison | `livraison` | camion | 195 (sarcelle) |
| À comptabiliser | `compta` | reçu | 45 (mandarine) |
| Vendu | `vendu` | coche | 152 (vert) |
| En lavage | `lavage` | goutte | 325 (magenta) |
| Repassé | `repasse` | chemise | 292 (violet) |
| Perdu | `perdu` | cercle barré | 25 (brique) |

Les valeurs exactes sont dans `index.html`, dans les deux blocs de thème.

**Canaux de vente** (`lib/canalColors.ts`) : `--ch-<clé>` et `-bg`, toujours avec un
monogramme et le nom : Vinted `V`, Vinted Go `Go`, Vestiaire Collective `VC`,
Leboncoin `Lb`, En main propre `M`, Autre `?`.

## Contrastes (WCAG 2, vérifiés)

La section « Système » de la page les recalcule en JS à partir des tokens du thème
affiché. Un script Node (OKLCH vers sRGB, formule WCAG) les a vérifiés aussi, sans aucun
échec. Minimums mesurés :

- **texte** : `ink-3` sur `surface-2` 4,57 (clair) / 6,08 (sombre) ; `warn` sur
  `warn-soft` 4,78 / 7,40 ; `st-compta` sur son fond 4,81 / 7,80 ; toutes les autres
  paires texte sont plus hautes ;
- **interface (3:1)** : `line-strong` sur `surface-2` 3,01 / 3,06 ; accent (anneau de
  focus) sur `bg` 5,82 / 7,63 ; étoile `spark` sur `surface` 3,30 / 8,54 ; pastille de
  statut la plus faible (En stock) 3,47 sur la carte et 3,21 sur le fond.

## Échelles

- **Texte (8 tailles, en rem, aucune sous 12 px)** : `xs` .75, `sm` .8125, `md` .875
  (base de l'interface), `lg` 1 (corps, champs mobiles à 16 px), `xl` 1.25, `2xl` 1.75,
  `3xl` 2.75 (chiffre du mois), `4xl` 4 (landing). Chasses : 100 % pour le texte,
  112,5 % pour les titres, 125 % pour l'affichage. Interlignage serré au-dessus de 2xl.
  L'approche suit la taille : −0,01 à −0,045 em pour les grandes tailles, +0,01 em
  pour `xs`.
- **Espacements** (base 4 px, en rem) : 1, 2, 3, 4, 5, 6, 8, 10, 12, 16.
- **Rayons** (ils croissent avec la surface) : `xs` 6 (cases), `sm` 8 (vignettes),
  `md` 10 (boutons, champs), `lg` 14 (cartes, toasts), `xl` 20 (fenêtres, menu
  flottant), `2xl` 28 (dock, landing), `full` (pastilles).
- **Ombres** : `shadow-1` (carte), `shadow-2` (barre, info-bulle), `shadow-3` (fenêtre,
  toast). En sombre, elles s'ajoutent à un filet clair de 5 à 9 %.
- **Z-index nommés** : `base` 0, `raised` 1 (en-tête de tableau), `sticky` 10 (barre
  du haut), `nav` 20 (menu, dock), `actionbar` 30, `fab` 40 (bulle de l'assistant),
  `scrim` 50, `modal` 60, `popover` 70, `toast` 80. C'est la correction de M3, X2 et X3.
- **Mouvement** : `instant` 120 ms (appui, survol), `quick` 160 ms (sorties), `base`
  200 ms (toasts, apparitions), `slow` 240 ms (fenêtre, tiroir, déplacement). Courbes :
  `e-out` `cubic-bezier(.22,1,.36,1)` pour entrer, `e-in` `(.4,0,1,1)` pour sortir,
  `e-move` `(.65,0,.35,1)` pour les trajets. Le mouvement passe par des transitions CSS,
  donc on peut l'interrompre. Sous `prefers-reduced-motion`, les durées passent à 0 via
  les tokens, sans `!important` global, et le reflet du squelette s'arrête.

## Cadre et bugs traités dans la maquette

- **Hauteur** : une seule grille de cadre en `100dvh`, sans double `min-h-screen`
  (M2). La page ne défile pas à l'horizontale en 1440 ni en 390.
- **Menu** : groupes « Au quotidien », « Images » (Studio), « Pilotage », puis pied
  « Réglages » (ex « Prompts », S7) et « Compte ». Le repli en rail est inclus.
- **Mobile** : dock en verre flottant à 5 entrées (Accueil, Stock, Vendre, Compta,
  Plus). « Plus » ouvre une feuille avec Commandes, Studio, Calendrier, Statistiques,
  Réglages, Compte et la déconnexion (X9). Les libellés du dock font 12 px (F2). Le dock
  respecte la zone sûre, et les toasts et la barre groupée s'arrêtent au-dessus de lui
  (MO2, MO3).
- **Champs** à 16 px sous 768 px (MO1). La barre de défilement suit le thème via
  `scrollbar-color` (MO4).
- **Fenêtres** : `<dialog>` natif, donc voile, Échap, piège et retour du focus (X6),
  vérifiés au clavier. Le tiroir devient une feuille par le bas sur mobile.
- **Studio** : la prochaine action est en haut (S1). La vraie photo et l'image générée
  sont côte à côte. L'avis de l'IA est présenté comme une aide, et il montre le détail
  qui dérive sur l'image. V et R déclenchent un toast « Annuler » avec un compte à
  rebours (S3). L'historique de la prise garde les rejets (S4). Le sélecteur de modèles
  affiche prix par image, coût par sac de 15 prises, badge « Hors budget » face à 1 €,
  réussite du premier coup, coût moyen réel et étoile basculable (S6, S8).
- **Thème** : l'icône du bouton est choisie en CSS, donc juste avant l'hydratation
  (X13). `theme-color` suit le thème choisi (X7).

## Faiblesses connues

- **`→` et `✕`** ne sont pas servis par Mona Sans via Google Fonts (voir Polices).
  Il faut des icônes.
- **Chiffres tabulaires de style mono** : utiles pour les SKU, mais d'aspect technique.
  Les chiffres d'affichage passent en proportionnels, ce qui est un écart assumé au
  « tabular-nums partout ».
- **L'accent outremer est proche du bleu de « En vente »** (teinte 266 contre 240),
  surtout en sombre. L'icône et le mot les distinguent ; à surveiller dans le Stock.
- **Leboncoin et « À comptabiliser » partagent la teinte mandarine.** Leurs contextes
  diffèrent (canal ou statut) et le monogramme lève l'ambiguïté.
- **Le bleu peut croiser la piste A** (« instrument de précision »), qui n'a pas été
  vue. Si c'est le cas, la signature tient au cyclo, aux chiffres larges et au verre,
  pas à la teinte.
- **Le verre coûte du GPU** (`backdrop-filter`) sur un mobile ancien. Il est limité aux
  barres et aux fenêtres et coupé sous `prefers-reduced-transparency`.
- **Le voile de `<dialog>` en sombre** dépend d'un attribut posé en JS
  (`data-theme-eff`). Dans l'appli, il faut le poser dans le script inline d'avant le
  premier rendu.
- **Les vignettes et le sac sont des SVG dessinés à la main.** Les vraies photos
  Vinted, souvent claires, donneront des carrés lumineux dans le thème sombre. C'est
  normal, mais moins homogène que la maquette.
- **Les prix des modèles sont des exemples** (Seedream 4 à 0,030 $, Gemini 2.5 Flash
  Image à 0,039 $, FLUX.1 Kontext Pro à 0,040 $, Nano Banana Pro à 0,134 $), avec un
  taux de 0,86 € pour 1 $. Rien n'a été relu chez OpenRouter. La règle « jamais un prix
  inventé » reste celle de l'appli.
- **Navigateurs** : relu sous Chromium (1440 et 390, clair et sombre) et sous WebKit
  (390 sombre, rendu seul). L'animation d'entrée des fenêtres (`@starting-style`)
  demande Safari 17.5 ou plus ; en dessous, la fenêtre s'affiche sans animation.
- **Captures « page entière »** : le menu latéral est collant (100dvh), donc la colonne
  de gauche est vide plus bas. C'est un effet de la capture, pas du design.
