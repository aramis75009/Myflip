# Piste A — « Vernier »

Planche : `index.html` (autonome, à ouvrir dans un navigateur). Captures : `capture-*.png`.

## Intention

MyFlip devient un **instrument de mesure** : on l'ouvre pour lire où en est le mois, ce que vaut chaque pièce, ce que coûtera un sac au Studio. Le nom vient du vernier, la réglette fine d'un pied à coulisse ; la direction en tire sa signature : **des réglettes graduées avec une aiguille** pour tout ce qui se compare à une cible (objectif du mois, budget par sac, coefficient). Pour Aramis, 8 h par jour sur des centaines de lignes : l'émotion visée est le calme et la confiance (« je lis, je sais, j'agis »), pas l'excitation.

Ce qui la distingue :
- de **Direction C** : aucun vert ni lime, plus de neutres verdis, plus de « console » ni de capitales espacées ; rayons petits (3 à 12 px au lieu de 26 px), pas de pilules rondes ;
- de **Fruit Drama Studio** : clair ET sombre de premier rang (FDS est sombre seulement), pas de violet, ni Bricolage ni Geist. On reprend seulement ses idées de sélecteur (recherche, favoris épinglés, prix lisible, confirmation du montant).

## Signature (là où l'audace est dépensée)

1. **La réglette et l'aiguille** : objectif du mois (graduations tous les 250 €, aiguille sur le CA, repère du rythme attendu), budget par sac dans le sélecteur de modèles (zone hachurée au-delà de 1 €), micro-réglette du coefficient dans le Stock, réglette de vie d'un article sur la landing.
2. **L'aiguille comme marque de sélection** : un trait de 3 px couleur accent signale l'entrée active du menu, les lignes sélectionnées, la prochaine action du Studio, l'onglet actif du dock. Un seul geste visuel pour « c'est ici ».
3. **Les glyphes de cycle** : chaque statut a un anneau qui se remplit avec l'avancée vers la vente (1/8 pour En stock … 8/8 pour Vendu), anneau pointillé pour Brouillon, barré pour Perdu. La couleur s'ajoute au glyphe et au libellé, elle ne porte jamais seule le sens.
4. **Archivo large pour les titres** (axe de largeur à 116 %), Archivo normal pour l'interface : un titre de page se reconnaît sans capitales ni sur-titre.

Le reste est volontairement silencieux : neutres froids presque purs, filets de 1 px, ombres réservées aux superpositions.

## Polices

| Rôle | Famille | Graisses / axes | Licence |
|---|---|---|---|
| Interface, titres, chiffres | **Archivo** (Omnibus-Type) | variable, wght 100–900, wdth 62–125 | SIL OFL 1.1 (Google Fonts) |
| SKU, identifiants de modèle | **Fragment Mono** | 400 | SIL OFL 1.1 (Google Fonts) |

Chiffres : `font-variant-numeric: tabular-nums` partout dans l'appli (Archivo a des chiffres tabulaires vérifiés : `1111` et `0000` ont la même largeur). Fragment Mono a un **zéro barré** : `LAC045` ne se lit pas `LACO45`.

**Couverture, vérifiée dans Chromium** (police réellement utilisée par glyphe, protocole DevTools `CSS.getPlatformFontsForNode`, sur 28 familles candidates) :
- accents français, œ Œ, « », ’, …, –, €, × (U+00D7), − : **dans Archivo et Fragment Mono** ;
- **✕ (U+2715) : dans aucune des 28 familles testées**, Archivo et Fragment Mono compris. Décision : la croix de fermeture est l'icône `X` de lucide-react, le coefficient s'écrit avec × (U+00D7) ;
- **→ (U+2192)** : présent dans le fichier source d'Archivo et de Fragment Mono, mais **absent des sous-ensembles `latin` / `latin-ext` servis par Google** (donc aussi par `next/font/google`). Deux options : charger Archivo par `next/font/local` à partir du fichier OFL complet (dépôt google/fonts), ou dessiner la flèche en icône (`ArrowRight`). La planche n'utilise aucune flèche en texte.

Chargement Next 15 (à poser sur `<html>`, jamais de nom de famille en dur ailleurs) :

```ts
import { Archivo, Fragment_Mono } from "next/font/google";
const archivo = Archivo({ subsets: ["latin", "latin-ext"], axes: ["wdth"], variable: "--font-sans", display: "swap" });
const mono = Fragment_Mono({ subsets: ["latin"], weight: "400", variable: "--font-mono", display: "swap" });
// <html lang="fr" className={`${archivo.variable} ${mono.variable}`}>
```

## Couleurs (canaux R G B)

Format : `--surface: 255 255 255;` puis `rgb(var(--surface) / .9)`. Dans `tailwind.config.ts` : `surface: "rgb(var(--surface) / <alpha-value>)"`, ce qui fait marcher `bg-surface/90` (cause racine des voiles et barres transparents, PRD § 1).

Thèmes : `data-theme="light|dark"` sur `<html>`, sinon `prefers-color-scheme`. Le sombre est choisi, pas inversé : l'accent garde sa saturation en aplat, mais le texte d'accent s'éclaircit.

| Token | Clair | Sombre | Rôle |
|---|---|---|---|
| `--bg` | 245 247 249 | 20 22 25 | Fond de l'application |
| `--surface` | 255 255 255 | 28 30 34 | Panneaux, tableaux, modales |
| `--surface-2` | 239 241 244 | 34 37 41 | En-têtes de tableau, zones creuses |
| `--surface-3` | 229 232 236 | 42 45 50 | Survol, squelettes, désactivé |
| `--line` | 221 224 228 | 48 51 56 | Filets |
| `--line-strong` | 130 134 142 | 113 117 124 | Bords de champs, cases, graduations (≥ 3:1) |
| `--ink` | 23 27 33 | 240 242 244 | Texte principal |
| `--ink-2` | 68 72 79 | 193 196 201 | Texte secondaire |
| `--ink-3` | 96 101 109 | 158 162 168 | Libellés, texte discret (≥ 4,5:1 partout) |
| `--accent` | 30 84 228 | 46 101 238 | Action principale, sélection, aiguille |
| `--accent-hover` | 19 67 199 | 37 89 221 | Survol |
| `--accent-ink` | 255 255 255 | 255 255 255 | Texte sur accent |
| `--accent-text` | 29 82 222 | 144 182 255 | Liens, entrée active |
| `--accent-soft` | 232 240 255 | 29 45 78 | Fond de sélection |
| `--focus` | 30 84 228 | 144 182 255 | Anneau de focus 2 px, décalé de 2 px |
| `--pos` / `--pos-soft` | 5 119 59 / 228 248 232 | 106 209 138 / 27 52 34 | Hausse, succès |
| `--neg` / `--neg-soft` | 194 40 38 / 255 236 233 | 251 130 118 / 72 37 33 | Baisse, erreur |
| `--warn` / `--warn-soft` | 152 92 0 / 255 241 218 | 232 180 94 / 61 45 20 | Avertissement, hors budget |
| `--danger` / `--danger-ink` | 194 40 38 / 255 255 255 | 205 58 50 / 255 255 255 | Bouton destructif |
| `--veil` | 15 18 22 (à 50 %) | 1 2 2 (à 50 %) | Voile des modales |
| `--bar` / `--bar-ink` | 23 27 33 / 255 255 255 | 58 61 68 / 244 245 248 | Barre d'actions groupées, info-bulle |

**Statuts** (`--st-<k>` marqueur et glyphe, `--st-<k>-ink` texte, `--st-<k>-soft` fond de pastille), dans l'ordre du cycle :

| Statut | Clé | Clair (marqueur / texte / fond) | Sombre (marqueur / texte / fond) |
|---|---|---|---|
| Brouillon | `brouillon` | 130 134 142 / 82 85 92 / 239 240 242 | 142 146 153 / 206 209 214 / 45 46 48 |
| En stock | `stock` | 159 132 0 / 108 82 0 / 247 240 216 | 198 173 71 / 225 209 150 / 53 45 17 |
| En lavage | `lavage` | 0 151 172 / 0 100 120 / 220 246 251 | 79 191 212 / 158 221 234 / 19 51 57 |
| Repassé | `repasse` | 141 115 209 / 92 66 149 / 241 236 255 | 180 156 249 / 212 199 255 / 48 41 68 |
| Photos prêtes | `photos` | 199 91 144 / 136 48 93 / 255 231 243 | 241 134 183 / 251 188 214 / 65 35 48 |
| En vente | `vente` | 36 143 204 / 0 91 149 / 221 244 255 | 92 184 244 / 162 217 255 / 22 49 66 |
| En livraison | `livraison` | 188 115 0 / 130 67 0 / 255 236 216 | 229 156 70 / 245 200 152 / 62 41 16 |
| À comptabiliser | `compta` | 211 93 49 / 142 53 16 / 255 233 223 | 253 137 96 / 255 192 170 / 67 37 26 |
| Vendu | `vendu` | 57 157 87 / 0 104 42 / 224 247 228 | 106 197 128 / 172 224 182 / 26 53 32 |
| Perdu | `perdu` | 90 100 117 / 76 86 102 / 237 240 245 | 125 135 152 / 203 209 221 / 43 46 51 |

**Comptes de vente** (pastille carrée + nom, jamais la couleur seule) : `--ch-ft` Fripandtrend 0 148 155 / 16 166 173 ; `--ch-e18` Enorab18 198 108 0 / 204 122 32 ; `--ch-vc` Vestiaire Collective 144 61 139 / 179 87 173. Palette catégorielle passée au validateur du skill `dataviz` (bande de clarté, chroma, séparation daltonisme ΔE ≥ 8, contraste ≥ 3:1) : tout PASS en clair et en sombre.

**Contrastes** : 49 paires × 2 thèmes = 98 ratios calculés dans la page (section Système) à partir des variables CSS ; **98/98 au niveau AA**. Les plus serrés : `--ink-3` sur `--surface-3` 4,77 (clair) ; `--warn` sur `--warn-soft` 4,88 (clair) ; `--danger-ink` sur `--danger` 4,94 (sombre) ; `--accent-ink` sur `--accent` 4,99 (sombre) ; `--line-strong` sur `--surface-2` 3,23 (clair) ; `--accent` sur `--surface` 3,35 (sombre, élément d'interface).

## Échelles

- **Texte (8 tailles, rem)** : `--t-micro` 0,6875 (11 px, graduations, raccourcis) · `--t-xs` 0,75 (12) · `--t-sm` 0,8125 (13, cellules de tableau) · `--t-base` 0,875 (14, interface) · `--t-md` 1 (16, corps et tous les champs sur mobile) · `--t-lg` 1,25 (20) · `--t-xl` 1,75 (28, titres de page) · `--t-display` clamp(2,5 → 3,5 rem) (40 à 56, chiffre du mois, titre de landing). Interligne 1,45 interface, 1,6 prose, 1,02 à 1,15 titres.
- **Espacements** (pas de 4 px) : `--sp-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 · `-10` 40 · `-12` 48 · `-16` 64.
- **Rayons** : `--r-xs` 3 (pastilles, cases, touches) · `--r-sm` 5 (boutons, champs) · `--r-md` 8 (panneaux) · `--r-lg` 12 (modales, tiroir, menu Plus) · `--r-full` (avatar).
- **Ombres** : aucune sur les panneaux (filet 1 px) ; popover `0 1px 2px / .08, 0 6px 16px -4px / .14` ; superposition `0 2px 6px / .08, 0 28px 64px -16px / .36`. Teinte `--shadow`, intensité multipliée par `--sh-k` (1 en clair, 2,4 en sombre).
- **Z-index nommés** : `--z-raised` 10 (en-tête de tableau) · `--z-sticky` 20 (barre du haut, menu) · `--z-dock` 30 (dock, barre groupée mobile) · `--z-overlay` 40 (voile) · `--z-modal` 50 (modale, tiroir, menu Plus) · `--z-popover` 60 (menus, même dans une modale) · `--z-toast` 70 · `--z-tooltip` 80.
- **Mouvement** : `--d-fast` 120 ms (survol, appui, couleur) · `--d-base` 180 ms (toast, barre groupée, coche) · `--d-slow` 240 ms (modale, tiroir, déplacement de ligne). Courbes : `--ease-out` cubic-bezier(.2,.8,.2,1) pour les entrées, `--ease-in-out` cubic-bezier(.6,0,.3,1) pour les déplacements. Entrées et sorties symétriques, en transitions (interruptibles), pas en keyframes. `prefers-reduced-motion: reduce` met les trois durées à 0 ms (sans `!important`) et coupe le reflet des squelettes et la rotation du spinner.

## Cadre et mobile

- Menu latéral 232 px ≥ 1100 px, rail d'icônes 64 px de 768 à 1099 px, dock en dessous. Entrée active rendue dans le HTML (pas d'attente du JS).
- Dock : 5 places (Tableau, Stock, Vendre, À compta avec pastille, Plus) ; « Plus » ouvre une feuille avec voile, Échap, piège de focus et bouton Fermer. Le Studio y est marqué « conçu pour l'ordinateur ».
- Barre du haut collante en `rgb(var(--bg) / .9)` + flou : opaque à la lecture.
- Champs à 16 px et cibles à 44 px sous 768 px ; dock et barre groupée décalés de `env(safe-area-inset-bottom)` ; Stock en cartes sur mobile ; tableau large en défilement contenu avec ombres d'indice.
- `color-scheme` suit le thème (barres de défilement), `theme-color` suit le thème choisi dans l'appli, toasts sur `--surface`.

## Vérifié (Playwright, Chromium headless, file://)

- 1440 × 900 et 390 × 844, clair et sombre : aucune erreur console, aucun défilement horizontal (`scrollWidth` = 1440 et 390), Archivo et Fragment Mono chargées.
- Modale : ouverture au clavier, focus dedans (sur « Annuler » pour une dépense), Tab piégé, Échap ferme, focus rendu au déclencheur ; voile `rgba(15, 18, 22, 0.5)`.
- Studio : V valide, le toast « Annuler » rétablit la décision.
- Thème : bascule, `theme-color` et `color-scheme` suivent.
- Mobile : 10 champs visibles, tous à 16 px ; plus petit texte rendu 11 px ; dock 60 px.
- Mouvement réduit : `--d-slow` = 0 ms, squelette sans animation.
- Captures : `*-ecran.png` = premier écran tel qu'il s'affiche (menu, barre du haut et dock réellement collants) ; `capture-1440-clair.png` etc. = page entière, prise avec le menu, la barre du haut, le dock et la barre groupée remis en position normale (une capture pleine page ne sait pas rendre le collant) ; plus la modale ouverte, le tiroir ouvert et le menu « Plus » ouvert.

## Faiblesses connues

1. **Le bleu est l'accent le plus courant du logiciel pro.** L'identité tient aux réglettes, à l'aiguille et aux glyphes, pas à la couleur. Si ces motifs sont dilués à l'implémentation, on retombe sur un « Linear de plus ».
2. **✕ manque dans les deux polices**, et **→** exige `next/font/local` ou une icône (voir Polices).
3. **Glyphes de cycle à 14 px** : 1/8 de différence entre deux statuts voisins se voit, mais de peu. Le libellé reste obligatoire ; à 12 px, ne garder que l'anneau.
4. **Jaune, orange et corail** (En stock, En livraison, À comptabiliser) sont proches en teinte : la distinction repose sur la clarté, le remplissage du glyphe et le libellé.
5. **Hauteur de ligne du Stock** fixée à 44 px dans la planche : la virtualisation (`@tanstack/react-virtual`) doit être réglée en même temps (PRD § 10).
6. **La micro-réglette du coefficient** peut se lire comme du bruit sur 1 200 lignes ; à faire valider par Aramis, sinon la retirer.
7. **Archivo à 116 %** mange de la largeur : les titres de page doivent rester courts, surtout à 390 px.
8. Visuels de sac en SVG dessinés, pas de vraies photos ; aucun essai sur Safari iOS réel (zone sûre seulement en CSS), ni sur WebKit ou Firefox.
9. Les ratios portent sur les paires de tokens, pas sur chaque combinaison rendue (texte posé sur une barre hachurée, par exemple).
10. L'info-bulle du graphique répond à la souris et au focus clavier ; le toucher n'a pas été essayé.
