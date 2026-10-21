# Plan d'exécution — Fondations de la refonte MyFlip

> **Pour les agents :** SOUS-SKILL REQUIS : `superpowers:subagent-driven-development` (recommandé) ou
> `superpowers:executing-plans`. Chaque lot se suit case par case (`- [ ]`). Un lot est **autonome** : il dit ses
> fichiers, ses dépendances, ses étapes, ses critères et ses commandes. Ne lis pas la conversation qui l'a produit,
> elle n'existe pas pour toi.

**But.** Poser des fondations sans bug (tokens en canaux, échelles nommées, primitives accessibles, cadre, fenêtre de
vente unique) pour qu'Aramis n'ait plus qu'à remplacer des **valeurs** de tokens et deux familles de polices le jour
où il apporte son design system.

**Architecture.** Une seule source de valeurs, `app/tokens.css` (canaux `R G B`, deux thèmes), exposée à Tailwind 3
par `rgb(var(--x) / <alpha-value>)` avec des échelles **remplacées** (texte, rayons, ombres, z-index, durées). Des
primitives Radix habillées par tokens dans `components/ui/`. Un test Vitest garde-fou interdit toute valeur en dur
dans `app/` et `components/`. Les écrans migrent ensuite par lots aux fichiers disjoints, sans changer leur logique.

**Stack.** Next 15.5.19 (App Router) · React 18.3.1 installé · Tailwind 3.4.19 · TypeScript 5.9.3 · Vitest 3.2.7 ·
Playwright 1.63.0 + `@axe-core/playwright` 4.13.0 · sonner 2.0.7 · lucide-react 1.21.0. Ajouts : `radix-ui` 1.7.0,
`class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 2.6.1 (§ 1).

**Spec.** `docs/prd/2026-10-20-refonte-design.md` (§ 1, 3, 5, 8, 10) ; `docs/refonte/audit-better-2026-10-20.md`
(§ 0, § 2 en entier, § 6, § 7) ; `docs/refonte/etude-2026-10-20/bugs-sondes.json` ; structure (pas valeurs) :
`docs/design-system.md`, `docs/refonte/tokens.css`, `docs/refonte/tailwind-tokens.md`. Suite e2e :
`e2e/README.md`, `e2e/sondes/LISEZMOI.md`.

**Décision d'Aramis du 20/10, qui cadre tout ce plan.** Couleur, polices, animations et identité sont **reportées**
(design system à venir dans Claude Design). La palette **actuelle** de `app/globals.css` est gardée comme valeurs
provisoires, corrigée **seulement** là où le contraste AA échoue, et migrée dans l'architecture de tokens ci-dessous.

---

## Contraintes globales (valent pour chaque lot)

- Dossier : `"/Users/ams/Documents/02_Perso/Projets_perso/MyFlip/SAAS perso my flip"` (toujours entre guillemets).
  Branche `feat/refonte-design`, jamais `main`.
- **Jamais `npm run build`.** Vérifier par `npm run lint`, `npm run typecheck`, `npm test` et Playwright.
- `npm run typecheck` peut échouer pendant qu'une suite e2e tourne (deux `routes.d.ts`, cf. `e2e/README.md`) : si
  toutes les erreurs sont sous `.next-e2e-*`, relancer après la fin de la suite. Ne jamais toucher aux lignes
  `.next-e2e-*` que `next dev` ajoute à `tsconfig.json`, ni les stager.
- Aucun changement de calcul métier (`lib/calc.ts`, `lib/stock.ts`, `lib/commandes.ts`, routes `app/api/**`), ni de
  contrat d'API hors Studio. Seules exceptions de comportement, toutes nommées dans leur lot : les bloquants de
  données (ST-1, ST-2, QU-61, CA-02/QU-01), la fenêtre de vente unique (L3 : date de vente connue préremplie,
  compte de vente envoyé depuis le Stock quand il est choisi, par le même `PATCH`) et PI-36 (M7).
- Sélecteur de statut du Stock : `<select>` **natif**, conservé. Hauteur de ligne du Stock : jamais modifiée sans
  mettre à jour la virtualisation (lot M1).
- Textes d'interface en français, tutoiement ; code, noms et commits en anglais. **Aucun texte visible ne change**
  hors des textes fixés par ce plan (vocabulaire du cadre § 2.7 de l'audit, fenêtre de vente, confirmations).
- Aucun test n'appelle OpenRouter. Playwright passe **uniquement** par la suite `e2e/` (`E2E_DECALAGE` multiple de
  10 pour tourner en parallèle). Ne jamais presser V, R, C ni les flèches sur `/studio/<cle>` sans intercepter
  `/api/studio/essais/**`.
- Exclus de toute recherche et de toute modification : `.claude/worktrees/`, `extension-vinted/banc/`,
  `node_modules/`, `.next*`, et les doublons iCloud dont le nom contient `" 2"` (dossier ou fichier).
- `lib/studioCloisonnement.test.ts` ne s'affaiblit jamais. `components/ui/**` et `lib/format.ts` sont neutres :
  le Studio et la vente peuvent les importer.
- Les règles « Typographie mobile » (`text-3xl md:text-4xl`), « Touch targets » (`min-h-[44px]`) et « pas de
  modificateur d'opacité sur une variable CSS » du `CLAUDE.md` du projet décrivent l'**ancien** système : pendant
  cette vague, ce plan fait foi ; le lot LZ réécrit ces sections.
- Ne stager que les fichiers possédés par le lot (`git add <chemins>`). Commit seulement si la session principale
  l'a demandé ; jamais de push. Message en anglais, terminé par la ligne d'attribution donnée par la session.
- Toute dépendance s'installe en version exacte (`npm install --save-exact`), et seulement celles du § 1.

## Points de vigilance de la revue

1. **Toast « Annuler » ou d'erreur pendant qu'une modale Radix est ouverte** : Radix pose `pointer-events: none`
   hors du calque et ferme la modale sur un clic extérieur. Attendu : le toast reste cliquable et ne ferme pas la
   modale. Épinglé par `e2e/toasts.spec.ts` (lot L2b) et implémenté en L1 (Dialog) + L2b (Toaster).
2. **Hauteur de ligne du Stock après le codemod** : les tailles de texte changent d'un demi-pixel, la ligne réelle
   bouge, la virtualisation saute. Attendu : `getTotalSize()` égale la hauteur rendue. Épinglé par
   `[M1] virtualisation : hauteur totale = hauteur rendue` (lot LS), corrigé en M1.
3. **Premier affichage en thème sombre** : pas de flash clair, `theme-color` juste, bouton de thème nommé juste dès
   le HTML serveur, `<select>` natifs lisibles (`color-scheme`). Épinglé par X7, X13, M1 (sondes) et capturé en
   `desktop-sombre`.
4. **Feuille par le bas sur iPhone avec le clavier ouvert** : le bouton principal ne doit pas passer sous le clavier
   ni sous le dock. Attendu : contenu en `100dvh`, corps défilant, pied visible. Épinglé par
   `[L1] la feuille garde son pied visible à 390 × 500` (lot LS).
5. **Fusion de classes personnalisées par `tailwind-merge`** : `z-modal`, `shadow-pop`, `text-md`, `duration-fast`
   sont inconnues de sa configuration par défaut et seraient gardées en double ou classées à tort. Épinglé par
   `lib/cn.test.ts` (lot L1).

---

## 0. Préalables (session principale, pas un sous-agent)

- [ ] La suite e2e, `playwright.config.ts`, `docs/refonte/` et `lib/openrouterBase.ts` sont encore **non
  commités** (vérifié le 21/10 par `git status`). Les faire commiter (avec l'accord d'Aramis) **avant** L0, sinon
  chaque lot embarque la base de comparaison dans son commit.
- [ ] `e2e/captures.nosync/avant/<projet>/` contient 242 captures par projet et `e2e/rapports/avant/sondes.json`
  1 494 mesures (vérifié le 21/10). Ne jamais régénérer la série `avant`.
- [ ] Router chaque lot par Jev (`route.py --max-effort xhigh`) ; donner au sous-agent le chemin de ce fichier et
  l'identifiant de son lot.

---

## 1. Décisions techniques

### 1.1 Versions retenues

Lues le 21/10/2026 par `npm view <paquet> time --json` (code de sortie 0 pour les cinq). Règle : la version la plus
récente publiée il y a **au moins 14 jours** (au plus tard le 07/10/2026).

| Paquet | Version | Publiée le | Plus récente | Pourquoi |
|---|---|---|---|---|
| `radix-ui` | **1.7.0** | 05/10/2026 | 1.8.1 (12/10, trop récente) | primitives accessibles, paquet unifié |
| `class-variance-authority` | **0.7.1** | 26/11/2024 | 0.7.1 | variantes typées des primitives |
| `clsx` | **2.1.1** | 23/04/2024 | 2.1.1 | concaténation conditionnelle |
| `tailwind-merge` | **2.6.1** | 30/01/2026 | 3.7.0 | la ligne 3.x vise Tailwind 4 (SUPPOSÉ, connaissance du modèle : à confirmer par la doc context7 de `tailwind-merge` avant l'installation) ; MyFlip est en Tailwind 3.4.19 |
| `sonner` | **2.0.7** (inchangé) | 02/08/2025 | 2.0.8 | déjà en place ; `mobileOffset` et `theme` suffisent |

`radix-ui@1.7.0` déclare `react` et `react-dom` `^16.8 || ^17 || ^18 || ^19` en pairs et embarque, entre autres,
`react-dialog`, `react-alert-dialog`, `react-dropdown-menu`, `react-popover`, `react-tabs`, `react-tooltip`,
`react-radio-group`, `react-slot` (vérifié par `npm view radix-ui@1.7.0 peerDependencies dependencies --json`).

### 1.2 Primitives : Radix, paquet unifié, habillé à la main

- **Radix plutôt que `<dialog>` natif.** Le natif couvre la modale, mais pas le menu (flèches, saisie rapide),
  le popover avec gestion des collisions (bloquant CA-01), les onglets à tabindex itinérant, l'info-bulle ni le
  groupe radio. L'audit a trouvé quatre modales maison divergentes : réécrire ces modèles APG à la main
  reproduirait la même dette.
- **Paquet unifié `radix-ui` plutôt que `@radix-ui/react-*` séparés.** Une seule version pour toutes les
  primitives, donc un seul `DismissableLayer` et un seul `FocusScope` : un menu ouvert dans une modale ne mélange
  pas deux versions de calques. Une seule mise à jour. Les imports restent par primitive
  (`import { Dialog } from "radix-ui"`), le bundle n'embarque que ce qui est utilisé.
- **Pas la CLI shadcn.** Elle écrit ses propres variables (`--background`, `--foreground`…) en concurrence avec
  nos noms de tokens, ajoute une bibliothèque d'animation (identité reportée) et vise Tailwind 4 dans ses versions
  récentes. On lit le code source de shadcn comme **modèle** (Radix + `cva` + `cn`), on n'installe rien.

### 1.3 Polices : familles actuelles, chargement corrigé

- Familles provisoires gardées : Space Grotesk (interface) et JetBrains Mono (SKU, montants), par
  `next/font/google`, `subsets: ["latin"]`, `display: "swap"`.
- Variables `next/font` : `--font-famille-ui` et `--font-famille-mono`, posées sur **`<html>`** (cause racine de
  F1 : elles étaient sur `<body>`, invisibles de `:root`).
- `app/tokens.css` construit `--font-sans` et `--font-mono` à partir d'elles, avec un repli système. Tailwind lit
  `font-sans` = `var(--font-sans)`. **Aucun nom de famille littéral nulle part** (garde-fou R16).
- Changer de police plus tard = changer les deux imports de `app/layout.tsx`, rien d'autre.
- `→` (U+2192) et `✕` (U+2715) ne sont pas servis par le sous-ensemble `latin` : icônes `ArrowRight` et `X` de
  lucide-react.

### 1.4 Mouvement : aucune bibliothèque

- Aucune bibliothèque d'animation (identité reportée).
- Trois animations nommées dans la config Tailwind, toutes en `animation-fill-mode: backwards` (aucun `transform`
  résiduel, cause racine de CA-02/QU-01) : `entree` (opacité + 4 px), `fondu` (opacité), `pop` (échelle 0,96 → 1),
  plus `spin` (Tailwind) et `shimmer` (squelette). Toujours écrites `motion-safe:animate-*`.
- `prefers-reduced-motion` met `--d-fast`, `--d-base` et `--d-slow` à `0ms` **dans les tokens** ; le bloc
  `!important` global de `globals.css` survit jusqu'au lot LZ (filet tant que des écrans ont des animations en
  ligne), puis disparaît.
- Les ~28 keyframes de Direction C restent dans `globals.css` tant qu'un écran les utilise (identité reportée,
  § 5) ; LZ supprime celles qui ne servent plus.

### 1.5 Toasts : Sonner gardé, branché sur les tokens

`<AppToaster>` (lot L2b) : thème suivi par `MutationObserver` sur `data-theme`, classes tokens, `z-index` du jeton
`--z-toast`, décalages au-dessus de la bulle et du dock.

---

## 2. Architecture des tokens

### 2.1 Fichiers

| Fichier | Rôle | Contient des valeurs ? |
|---|---|---|
| `app/tokens.css` | **seule** source des valeurs : couleurs en canaux, deux thèmes, échelles, cadre | oui, et nulle part ailleurs |
| `app/globals.css` | `@tailwind`, couche `base` (corps, focus, barre de défilement, champs mobiles), utilitaires de thème | non : seulement des `var(--…)` |
| `tailwind.config.ts` | branchement des tokens, échelles **remplacées** | non : seulement des `var(--…)` |
| `app/layout.tsx` | importe `./tokens.css` puis `./globals.css`, charge les polices, script de thème ; plus de `viewport.themeColor` (la meta est créée et tenue par le script, hors de React : pas de conflit d'hydratation) | non |
| `lib/themeMeta.ts` | `FOND_THEME` (hex de `--bg` pour `theme-color` et le manifeste) et le script inline | oui, mais vérifié égal à `tokens.css` par le test |
| `lib/contraste.ts` | fonctions pures : lecture des canaux, ratio WCAG 2.x | non |
| `lib/designTokens.test.ts` | garde-fou (§ 2.7) et recalcul des contrastes (§ 2.8) | non |

Thème : le script inline pose **toujours** `data-theme="light"` ou `data-theme="dark"` sur `<html>` avant le
premier paint (choix enregistré, sinon `prefers-color-scheme`). `tokens.css` a donc deux blocs : `:root` (clair)
et `:root[data-theme="dark"]`. Pas de variante `dark:` dans les composants : les tokens changent seuls.

### 2.2 Couleurs (noms de `docs/design-system.md`, valeurs actuelles corrigées AA)

Canaux `R G B`. « Origine » = ancien token de `app/globals.css`. **Gras** = valeur corrigée pour AA.

| Token | Rôle | Clair | Sombre | Origine |
|---|---|---|---|---|
| `--bg` | fond de l'application | 231 236 232 | 11 14 13 | `--bg` |
| `--surface` | panneaux, modales, toasts | 255 255 255 | 20 24 23 | `--surface` |
| `--surface-2` | en-têtes, zones creuses, survol | 243 246 243 | 27 33 31 | `--surface-2`, `--tint` |
| `--surface-3` | élévation, désactivé, squelette | 233 238 234 | 35 42 39 | `--raise`, `--disabled` |
| `--line` | filet décoratif | 221 228 223 | 36 44 41 | `--border` |
| `--line-strong` | bord de champ, de case, de chip (≥ 3:1) | **126 136 130** | **99 109 105** | nouveau (`--border-input` de l'audit) ; remplace aussi `--border-strong` |
| `--ink` | texte principal | 14 20 18 | 234 241 236 | `--ink` |
| `--ink-2` | texte secondaire, libellés de champ | 76 91 84 | 159 174 166 | `--ink2`, `--nav` |
| `--ink-3` | texte tertiaire (un seul) | **93 108 100** | **129 147 138** | `--muted`, `--faint`, `--faint-2` (117 133 124 / 113 130 122) |
| `--accent` | action principale, sélection | 15 81 50 | 199 247 81 | `--acc` |
| `--accent-hover` | survol de l'action | 11 61 37 | 212 250 106 | `--acc-hover` |
| `--accent-ink` | texte sur l'accent | 255 255 255 | 11 14 13 | `--acc-ink`, `--acc-dim` |
| `--accent-text` | accent écrit (liens) | 15 81 50 | 199 247 81 | `--acc` en texte |
| `--accent-soft` | fond de sélection | 230 239 233 | 30 42 28 | `--acc-soft` |
| `--focus` | anneau de focus, opaque | 15 81 50 | 199 247 81 | remplace `--acc-ring`, `--acc-ring-strong` |
| `--pos` / `--pos-soft` | hausse, succès | 15 81 50 / 228 243 234 | 95 211 155 / 22 38 29 | `--pos`, `--pos-soft` |
| `--neg` / `--neg-soft` | baisse, erreur | 176 58 40 / 251 238 231 | 255 138 122 / 42 26 24 | `--neg`, `--neg-soft`, `--alert-soft` |
| `--warn` / `--warn-soft` | à surveiller | **146 102 0** / 251 243 226 | 229 187 99 / 38 32 25 | `--warn`, `--notice` ; `--warn-soft`, `--notice-soft` |
| `--danger` / `--danger-ink` | bouton destructif | 176 58 40 / 255 255 255 | 255 138 122 / 11 14 13 | `--neg`, `--alert` |
| `--veil` + `--veil-a` + `--veil-fort-a` | voile des modales ; voile de la visionneuse | 14 20 18 · 0,5 · 0,8 | 0 0 0 · 0,7 · 0,85 | nouveau |
| `--shadow` + `--sh-k` | teinte et intensité des ombres | 14 20 18 · 1 | 0 0 0 · 2,4 | nouveau (l'ancien `--shadow` était une ombre entière) |
| `--bar` / `--bar-ink` | barre d'actions groupées | 15 81 50 / 255 255 255 | 199 247 81 / 11 14 13 | `--acc`, `--acc-ink` |
| `--stage` | fond neutre des images du Studio | 233 238 234 | 35 42 39 | = `--surface-3` (provisoire) |
| `--chart` / `--chart-2` | série principale ; barres neutres | 15 81 50 / 126 136 130 | 199 247 81 / 99 109 105 | accent ; `--chart-bar` de l'audit |

Disparaissent sans remplaçant propre : `--acc-soft-strong` (→ `surface-3`), `--acc-ring`, `--acc-ring-strong`,
`--alert`, `--alert-soft`, `--notice`, `--notice-soft`, `--tint`, `--raise`, `--disabled`, `--nav`, `--muted`,
`--faint`, `--faint-2` (correspondances au § 2.6 A).

### 2.3 Statuts et canaux

**Statuts** (`--st-<clé>` repère, `--st-<clé>-ink` texte, `--st-<clé>-soft` fond de pastille). Textes vérifiés
≥ 4,5:1 sur leur fond, `--surface`, `--surface-2` et `--bg` dans les deux thèmes. Les repères (points, filets)
restent décoratifs : le libellé est toujours écrit (WCAG 1.4.1) ; leurs teintes sont reportées (§ 5).

| Statut | Clé | Clair : repère / texte / fond | Sombre : repère / texte / fond |
|---|---|---|---|
| Brouillon | `brouillon` | 154 167 159 / **94 108 102** / 241 244 239 | 154 167 159 / 154 167 159 / 47 53 50 |
| En stock | `stock` | 216 178 58 / **131 102 0** / 252 243 207 | 216 178 58 / 216 178 58 / 59 55 30 |
| En lavage | `lavage` | 196 79 208 / 163 47 173 / 250 232 251 | 196 79 208 / **214 96 226** / 55 35 60 |
| Repassé | `repasse` | 154 143 234 / 91 79 190 / 237 235 251 | 154 143 234 / 154 143 234 / 47 48 65 |
| Photos prêtes | `photos` | 229 140 180 / **176 62 114** / 251 234 241 | 229 140 180 / 229 140 180 / 62 47 54 |
| En vente | `vente` | 111 168 255 / **49 100 201** / 231 240 255 | 111 168 255 / 111 168 255 / 38 53 69 |
| En livraison | `livraison` | 217 169 78 / **140 96 0** / 251 243 226 | 217 169 78 / 217 169 78 / 59 53 34 |
| À comptabiliser | `compta` | 240 144 104 / **171 75 42** / 251 238 231 | 240 144 104 / 240 144 104 / 64 48 39 |
| Vendu | `vendu` | 95 211 155 / 27 67 50 / 234 243 237 | 95 211 155 / 95 211 155 / 35 61 49 |
| Perdu | `perdu` | 134 149 160 / 43 57 66 / 236 238 240 | 134 149 160 / **138 153 164** / 43 49 50 |

Fond sombre = repère à 20 % sur `--surface` sombre (avant : pastel clair identique dans les deux thèmes, QU-07).
Statut inconnu → `brouillon`. Le compteur rond (cloche, menu, dock) utilise `st-compta-soft` / `st-compta-ink`.

**Canaux** (`--ch-<clé>`, repère carré suivi du nom en `--ink` ; plus jamais de texte blanc sur une pastille
pleine). Repère ≥ 3:1 sur `--surface` et `--surface-2` dans les deux thèmes. Vestiaire et Leboncoin restent à 7°
de teinte : séparation reportée (§ 5).

| Canal | Clé | Clair | Sombre |
|---|---|---|---|
| Vinted | `vinted` | 0 144 249 | 0 150 255 |
| Vinted Go | `vinted-go` | 0 71 171 | 38 102 204 |
| Vestiaire Collective | `vc` | 234 101 0 | 249 115 22 |
| Leboncoin | `lbc` | 241 95 38 | 255 107 53 |
| En main propre | `mp` | 107 114 128 | 107 114 128 |
| Autre | `autre` | 141 142 146 | 229 231 235 |

### 2.4 Échelles nommées

**Texte** (rem, plancher 12 px, 8 tailles) — `--t-xs` 0,75 (12) · `--t-sm` 0,8125 (13) · `--t-base` 0,875 (14,
corps) · `--t-md` 1 (16, tous les champs sous 768 px) · `--t-lg` 1,25 (20) · `--t-xl` 1,75 (28) · `--t-2xl` 2,5
(40) · `--t-3xl` 3,5 (56). Interlignes `--lh-tight` 1,05 · `--lh-snug` 1,25 · `--lh-ui` 1,45 · `--lh-prose` 1,6.

**Espacements** : l'échelle Tailwind par défaut (pas de 0,25 rem) **est** l'échelle nommée (`p-4` = 1 rem), non
remplacée parce que tout le code en dépend. Les valeurs arbitraires sans équivalent exact (18, 22, 26 px…)
restent provisoires (§ 2.6 G) : ce ne sont ni des couleurs, ni des tailles de texte.

**Rayons** (valeurs **provisoires** proches de l'aspect actuel, à remplacer par le design system) — `--r-xs` 4px ·
`--r-sm` 10px (`rounded` par défaut) · `--r-md` 14px · `--r-lg` 22px · `--r-full` 9999px.

**Ombres** — `--shadow-pop: 0 6px 16px -4px rgb(var(--shadow) / calc(0.14 * var(--sh-k)))` (menus, popovers,
info-bulles) ; `--shadow-over: 0 28px 64px -16px rgb(var(--shadow) / calc(0.3 * var(--sh-k)))` (modale, feuille,
toast, barre groupée). Les panneaux n'ont pas d'ombre.

**Z-index** (valeurs du design system, posées sur `:root` : la sonde G5 les y lit) — `--z-base` 0 · `--z-raised`
10 · `--z-sticky` 20 · `--z-dock` 30 · `--z-fab` 35 · `--z-overlay` 40 · `--z-modal` 50 · `--z-popover` 60 ·
`--z-toast` 70 · `--z-tooltip` 80 · `--z-skip` 90. Tout élément `fixed` ou `sticky` porte une classe `z-*` (sinon
`z-index: auto` échoue en G5).

**Durées** — `--d-fast` 120ms · `--d-base` 180ms · `--d-slow` 240ms ; `--ease-out`
`cubic-bezier(0.2, 0.8, 0.2, 1)`, `--ease-in` `cubic-bezier(0.4, 0, 1, 1)`, `--ease-in-out`
`cubic-bezier(0.6, 0, 0.3, 1)`. Sous `prefers-reduced-motion: reduce` : les trois durées valent `0ms`.

**Cadre** (valeurs actuelles gardées) — `--sidebar-w` 236px (76px si `html[data-sidebar="collapsed"]`) ·
`--topbar-h` 62px · `--dock-h` 60px (hors zone sûre) · `--hit` 44px · `--fab-offset` 0px (écrit par la barre
d'actions ouverte, § 3 L1).

### 2.5 Branchement Tailwind (`tailwind.config.ts`)

- `content` : `./app/**/*.{ts,tsx}`, `./components/**/*.{ts,tsx}`, `./lib/**/*.{ts,tsx}` (les tables de classes
  de statut vivent dans `lib/`).
- `future: { hoverOnlyWhenSupported: true }` (CA-41).
- Fonction ``c = (n: string) => `rgb(var(--${n}) / <alpha-value>)` `` (une couleur par token, en canaux).
- **Remplacés** (clé directement sous `theme`, pas sous `extend`) :
  - `colors` : `transparent`, `current`, `inherit`, tous les tokens du § 2.2 et § 2.3 par `c()` en objets
    imbriqués (`surface: { DEFAULT, 2, 3 }`, `line: { DEFAULT, strong }`, `ink: { DEFAULT, 2, 3 }`,
    `accent: { DEFAULT, hover, ink, text, soft }`, `pos`, `neg`, `warn` avec `soft`, `danger: { DEFAULT, ink }`,
    `bar: { DEFAULT, ink }`, `chart: { DEFAULT, 2 }`, `stage`, `focus`, `st.<clé>: { DEFAULT, ink, soft }`,
    `ch.<clé>`) ; `veil: "rgb(var(--veil) / var(--veil-a))"` et `"veil-fort": "rgb(var(--veil) /
    var(--veil-fort-a))"` (sans `<alpha-value>` : l'opacité suit le thème). **Temporairement** `white` et `black`
    en canaux fixes, marqués « à retirer en LZ » (ils servent encore à quelques écrans, garde-fou R10).
  - `fontSize` : `xs sm base md lg xl 2xl 3xl` → `[var(--t-…), { lineHeight: var(--lh-…) }]` (xs, sm, base : ui ;
    md : prose ; lg, xl : snug ; 2xl, 3xl : tight).
  - `fontFamily` : `sans: ["var(--font-sans)"]`, `mono: ["var(--font-mono)"]`.
  - `borderRadius` : `none`, `xs`, `sm`, `DEFAULT` (= `--r-sm`), `md`, `lg`, `full`.
  - `boxShadow` : `none`, `pop`, `over`.
  - `zIndex` : `auto` + les 11 noms du § 2.4 en `var(--z-…)`.
  - `transitionDuration` : `0: "0ms"`, `DEFAULT`, `fast`, `base`, `slow` ; `transitionTimingFunction` :
    `DEFAULT`, `linear`, `out`, `in`, `in-out`.
- `extend` : `height/minHeight/minWidth: { hit: "var(--hit)" }`, `keyframes` + `animation` : `entree`, `fondu`,
  `pop`, `shimmer` (§ 1.4).
- Plugin `plugin(({ addVariant }) => addVariant("replie", ':root[data-sidebar="collapsed"] &'))` : `replie:hidden`
  remplace les classes `.sb-*` de `globals.css`.

### 2.6 Migration des valeurs en dur

Compté le 21/10 sur `app/` et `components/` (hors tests et doublons) : **1 376** classes `…-[var(--x)]`, **1 410**
valeurs arbitraires en px (dont 629 `text-[Npx]`, 158 `rounded-[…]`), 34 `shadow-[…]`, 29 z-index bruts,
142 `style={{`, 37 `fontSize` en ligne ; **133** hex dans `app/`, `components/`, `lib/`.

Le **codemod** `scripts/refonte/codemod-tokens.mjs` (lot L0) applique les tables A à G à `app/**` (hors
`app/api/**`) et `components/**`, en `.ts`/`.tsx`, hors tests et doublons « 2 ». Il travaille sur le texte brut
(les classes vivent aussi dans des chaînes et des `cva`), d'abord en `--dry-run` (rapport), puis pour de vrai. Ce
qu'il ne sait pas traiter (styles en ligne, cartes de couleurs, SVG) reçoit un marqueur de dette (§ 2.7) au nom du
lot qui le traitera.

**A. Ancien token → nouveau.** Dans une classe `préfixe-[var(--ancien)]` (avec modificateurs `hover:`, `md:`…
et opacité `/NN` conservés) → `préfixe-nouveau`. Dans toute autre chaîne (`style`, gabarits) : `var(--ancien)` →
`rgb(var(--nouveau))`.

| Ancien | Nouveau | Ancien | Nouveau |
|---|---|---|---|
| `bg`, `surface`, `surface-2`, `ink`, `pos`, `neg`, `warn`, `*-soft` | même nom | `tint` | `surface-2` |
| `raise`, `disabled`, `acc-soft-strong` | `surface-3` | `border` | `line` |
| `border-strong` | `line-strong` | `ink2`, `nav` | `ink-2` |
| `muted`, `faint`, `faint-2` | `ink-3` | `acc` | `accent-text` après `text-` ; `accent` ailleurs |
| `acc-hover` | `accent-hover` | `acc-ink`, `acc-dim` | `accent-ink` |
| `acc-soft` | `accent-soft` | `acc-ring`, `acc-ring-strong` | classe : `focus` ; chaîne : `rgb(var(--focus))` |
| `alert` | `danger` | `alert-soft` | `neg-soft` |
| `notice` | `warn` | `notice-soft` | `warn-soft` |
| `shadow` | classe `shadow-[var(--shadow)]` → `shadow-pop` ; chaîne → `var(--shadow-pop)` | `sidebar-w` | inchangé (dimension) |

**B. Anciens alias Tailwind** (préfixes de couleur `bg text border ring ring-offset outline fill stroke from via to
divide placeholder caret decoration accent`, les plus longs d'abord) : `primary-dark` → `accent-hover` ;
`on-primary` → `accent-ink` ; `primary` → `accent-text` après `text-`, `accent` ailleurs ; `surface-soft`,
`surface-container` → `surface-2` ; `ink-muted` → `ink-2` ; `ink-faint`, `muted`, `faint` → `ink-3` ; `nav` →
`ink-2` ; `tint` → `surface-2` ; `error` → `neg`. Aussi : `font-grotesk` → `font-sans` ; `text-label-sm` →
`text-xs` ; `text-body-md` → `text-base` ; `text-title-sm` → `text-lg`.

**C. Tailles de texte** `text-[Npx]` : 8,5 à 12 → `text-xs` ; 12,5 et 13 → `text-sm` ; 13,5 à 14,5 →
`text-base` ; 15 à 17 → `text-md` ; 18 à 22 → `text-lg` ; 23 à 30 → `text-xl` ; 34 à 44 → `text-2xl` ; 58 à 80 →
`text-3xl`. Les anciennes `text-lg` (18 px) gardent leur nom (elles passent à 20 px).

**D. Rayons** (directionnels compris, `rounded-t-[22px]` → `rounded-t-lg`) : `[3px]`, `[4px]` → `xs` ; `[8px]` à
`[11px]` → `rounded` ; `[12px]` à `[16px]`, ancien `rounded-md` (12), `rounded-lg` (16), `rounded-2xl` (16) → `md` ;
`[18px]` à `[26px]`, `rounded-xl` (24), `rounded-card` (20) → `lg` ; `rounded`, `rounded-full` inchangés. Une
seule passe avec une fonction de correspondance (ne jamais enchaîner `lg → md` puis `xl → lg`).

**E. Ombres** : supprimées (panneaux) : `shadow`, `shadow-sm`, `shadow-card`,
`shadow-[0_1px_2px_rgba(22,38,29,.03)]`. → `shadow-pop` : `shadow-[var(--shadow)]`,
`shadow-[0_10px_22px_-12px_rgba(20,53,40,.8)]`, `shadow-[0_14px_40px_-20px_rgba(20,53,40,.2)]`,
`shadow-[0_26px_60px_-24px_rgba(20,53,40,.5)]`, `shadow-[0_2px_10px_rgba(20,53,40,.14)]`,
`shadow-[0_18px_34px_-24px_rgba(20,53,40,.55)]`, `shadow-[0_14px_30px_-20px_rgba(20,53,40,.7)]`. → `shadow-over` :
`shadow-card-hover`, `shadow-[0_30px_80px_-20px_rgba(22,38,29,.55)]`, `shadow-[0_28px_60px_-20px_rgba(0,0,0,.7)]`,
`shadow-[0_24px_44px_-22px_rgba(20,53,40,.85)]`, `shadow-[0_18px_40px_-16px_rgba(0,0,0,.6)]`. Toute autre valeur :
dette R7.

**F. Z-index**, occurrence par occurrence (lignes relevées le 21/10) : `TopBar.tsx:36` z-40 → `z-sticky` ;
`Sidebar.tsx:153` z-40 → `z-sticky` ; `:159` z-50 → `z-raised` ; `:191` z-0 → `z-base` ; `:203`, `:210` z-10 →
`z-raised` ; `:275` z-40 → `z-dock` ; `ChatBot.tsx:117` z-50 → `z-fab` ; `:132` z-50 → `z-modal` ;
`Modal.tsx:66` z-[60] → `z-modal` ; `SellDialog.tsx:87` z-50 → `z-modal` ; `a-comptabiliser/page.tsx:316` z-50 →
`z-modal` ; `commandes/page.tsx:568` z-40 → `z-overlay` ; `:571` z-50 → `z-popover` ; `mise-en-vente/page.tsx:728`
z-[60] → `z-modal` ; `:758` z-40 → `z-dock` ; `FicheArticle.tsx:321`, `:328`, `:335`, `:342`, `:349` z-10 →
`z-raised` ; `statistiques/page.tsx:115` z-10 → `z-overlay` ; `:121`, `:144` z-20 → `z-popover` ;
`stock/page.tsx:1603` z-30 → `z-dock` ; `calendrier/page.tsx:553` z-[80] → `z-modal` ; `LandingNav.tsx:20` z-50 →
`z-sticky`. Les `zIndex` en ligne du calendrier (`:389`, `:446`) : dette R3 → M7. Si une ligne a bougé, retrouver
l'occurrence par son contexte ; ne jamais deviner une valeur.

**G. Durées, animations, espacements.** `duration-150` → `duration-fast` ; `duration-200` → `duration-base` ;
`duration-300`, `duration-500`, `duration-[260ms]` → `duration-slow` ; `[animation:stepIn…]`,
`[animation:fadeUp…]` → `motion-safe:animate-entree` ; `[animation:popIn…]`, `[animation:modalIn…]` →
`motion-safe:animate-pop` ; `[animation:overlayIn…]` → `motion-safe:animate-fondu` ; `animate-spin` →
`motion-safe:animate-spin`. Espacements : `préfixe-[Npx]` → `préfixe-<N/4>` **seulement si** N/4 appartient à
l'échelle par défaut (0.5 1 1.5 2 2.5 3 3.5 4 5 6 7 8 9 10 11 12 14 16 20 24 28 32 36 40 44 48 52 56 60 64 72 80
96), pour les préfixes `p px py pt pr pb pl m mx my mt mr mb ml gap gap-x gap-y space-x space-y w h size min-w
min-h max-h top right bottom left inset inset-x inset-y translate-x translate-y` (négatifs compris). Le reste
reste arbitraire ; le rapport du codemod en donne le compte.

**Hex (133).** `app/layout.tsx`, `app/manifest.ts` → `lib/themeMeta.ts` (L0) ; `Loader.tsx` → tokens (L2b) ;
`SellDialog.tsx` → supprimé (L3) ; `StatutPill.tsx`, `lib/statutColors.ts` (34), `lib/canalColors.ts` (12),
`lib/celebrate.tsx` (14) → tokens (L3) ; `ExportAnnonces.tsx` (bouton Vinted) → `Button` `primary` (M3) ;
`FicheArticle.tsx:660` (pastille « multicolore » d'un sélecteur de couleur Vinted) → exception documentée (donnée) ;
`stock/page.tsx:807` (`stroke="#fff"`) → `currentColor` (M1) ; commentaires → ignorés par le test. Restent hors
garde-fou, documentés : `lib/vintedReferentiels.ts` (28, couleurs de vêtements), `lib/emails.ts` (11, e-mails).

### 2.7 Garde-fou Vitest (`lib/designTokens.test.ts`)

**Fichiers lus** : `app/**/*.{ts,tsx,css}` sauf `app/api/**`, `app/tokens.css` et `*.test.ts` ;
`components/**/*.{ts,tsx}` ; `lib/statutColors.ts`, `lib/canalColors.ts`, `lib/celebrate.tsx`. Ignorer tout
chemin contenant `" 2/"` ou un nom contenant `" 2."`. Ignorer les lignes dont le premier caractère non blanc est
`//`, `*` ou `/*`.

Règles (motifs JavaScript, à recopier tels quels ; un bloc de code évite tout échappement Markdown) :

```text
R1  taille de texte arbitraire        /\btext-\[/
R2  taille en ligne ou attribut SVG   /\bfontSize\s*[:=]/            CSS : /font-size\s*:\s*(?!var\(--t-)/
R3  z-index brut                      /\bz-\[/  /\bz-\d/  /\bzIndex\s*[:=]\s*(?!["'`]var\(--z-)/
                                      CSS : /z-index\s*:\s*(?!var\(--z-)/
R4  hexadécimal                       /#[0-9a-fA-F]{3,8}\b/
R5  couleur littérale                 /\b(rgba?|hsla?)\(\s*\d/
R6  rayon arbitraire                  /\brounded(-[a-z]{1,2})?-\[/  /\bborderRadius\s*[:=]/
R7  ombre arbitraire                  /\bshadow-\[/  /\bboxShadow\s*[:=]/
R8  couleur en var() arbitraire       /\b(bg|text|border(-[trblxy])?|ring(-offset)?|outline|fill|stroke|from|via|to|divide|decoration|caret|accent|placeholder)-\[(color:)?var\(--/
R9  alias morts                       /\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder)-(primary-dark|primary|on-primary|surface-soft|surface-container|ink-muted|ink-faint|muted|faint|nav|tint|error)\b/
                                      /\bfont-grotesk\b/  /\btext-(label-sm|body-md|title-sm)\b/  /\b(rounded|shadow)-card/
R10 palette Tailwind par défaut       /\b(bg|text|border|ring|fill|stroke|from|via|to|outline|divide|placeholder|caret|decoration)-(white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/
R11 opacité qui casse un contraste    /\b(bg|text|border|ring|outline|fill|stroke)-(line-strong|focus|accent|st-(brouillon|stock|lavage|repasse|photos|vente|livraison|compta|vendu|perdu)|ch-[a-z-]+)\/\d/
R12 mouvement hors tokens             /\[animation:/  /\banimation\s*:/ (TS/TSX)  /\btransition-all\b/  /\b(duration|ease|delay)-\[/
                                      /(?<!motion-safe:)\banimate-(?!none\b)/
R13 focus retiré sans remplacement    ligne contenant « outline-none » sans « focus-visible: »
R14 hauteur plein écran hors cadre    /\b(min-h-screen|h-screen|max-h-screen)\b/  /100vh/
R15 confirmation native               /\bwindow\.confirm\(/  /(?<![\w.])confirm\(\s*[`"']/
R16 nom de police littéral            /font-?family\s*:\s*["'`](?!var\()/i
R17 !important                        /!important/ (CSS)
```

- **Exception documentée** (R4 et R5 seulement) : la ligne, ou celle juste au-dessus, contient
  `design-tokens-exception: <raison d'au moins 10 caractères>`.
- **Dette temporaire** : un fichier peut porter, dans ses 5 premières lignes, `// design-tokens-dette: R2 R3 → M7`
  (en CSS : `/* design-tokens-dette: R12 R17 → LZ */`). Le test tolère ces règles dans ce fichier, **échoue si une
  règle listée n'y a plus aucune violation** (il faut alors la retirer du marqueur) et échoue sur toute autre
  règle. Une constante `DETTE_AUTORISEE = true` ; LZ la passe à `false`, et plus aucun marqueur n'est toléré.
- Message d'échec : `fichier:ligne`, id de la règle, extrait, et la classe de remplacement attendue.
- Seul L0 crée ce test, seul LZ le modifie. Un lot qui croit trouver un faux positif **s'arrête et le signale**.

### 2.8 Contrastes recalculés

Le même fichier de test lit `app/tokens.css` (bloc `:root` et bloc `:root[data-theme="dark"]`), et vérifie dans
les **deux** thèmes :

- texte ≥ 4,5:1 : `ink`, `ink-2`, `ink-3` sur `bg`, `surface`, `surface-2`, `surface-3` (et `ink`, `ink-3` sur
  `accent-soft`) ; `accent-text` sur `bg`, `surface`, `surface-2`, `accent-soft` ; `accent-ink` sur `accent` et
  `accent-hover` ; `danger-ink` sur `danger` ; `bar-ink` sur `bar` ; `pos`, `neg` sur `surface` et leur `-soft` ;
  `warn` sur `surface`, `surface-2`, `warn-soft` ; chaque `st-<clé>-ink` sur `st-<clé>-soft`, `surface`,
  `surface-2`, `bg` ;
- interface ≥ 3:1 : `line-strong` et `focus` sur `bg`, `surface`, `surface-2` ; `accent` sur `bg`, `surface` ;
  `chart`, `chart-2` sur `surface` ; chaque `ch-<clé>` sur `surface`, `surface-2` ;
- `FOND_THEME.light` et `FOND_THEME.dark` de `lib/themeMeta.ts` égaux aux canaux de `--bg`.

**VÉRIFIÉ par calcul** (formule WCAG 2.x, script de session hors dépôt, le 21/10) sur les valeurs des § 2.2 et
§ 2.3 : toutes les paires passent. Minimums : `ink-3` 4,63 (clair) et 4,52 (sombre) ; `warn` 4,61 ; textes de
statut 4,54 et 4,52 ; `line-strong` 3,06 et 3,05 ; repères de canal 3,01 et 3,00 ; voile : un fond `--bg` passe à
25 % (clair) et 28 % (sombre) de sa luminance, au-delà des 15 % exigés par O1. **Non remesuré au rendu** : axe le
fera (X8).

---

## 3. Lots

### 3.0 Couverture

**Les 24 chantiers de l'audit § 2** (primitive ou règle, puis adoption) :

| § | Chantier | Lots |
|---|---|---|
| 2.1 | tokens en canaux | L0 |
| 2.2 | contraste AA | L0 (valeurs), L3 (statuts), M1 (barre groupée) |
| 2.3 | couleur jamais seule, formats | L1 (`lib/format.ts`), L2a (compteur du rail) ; application aux écrans : vague suivante |
| 2.4 | échelle typographique | L0 (codemod), M4 et M7 (tailles en ligne), M11 (`clamp`) |
| 2.5 | z-index | L0 (échelle, codemod), L2a, L2b (Toaster), M3 (carte collante) |
| 2.6 | hauteur unique, entrée sans `transform` | L2a (cadre, `Frame`), L2b (404), M1, M3, M7 (`<main>` propres) |
| 2.7 | menu latéral et rail | L2a |
| 2.8 | dock et « Plus » | L2a |
| 2.9 | barre du haut, titres, thème, évitement | L0 (thème, `theme-color`, survol), L2a (`h1`, évitement, cibles), L2b (titres d'onglet, `metadataBase`) |
| 2.10 | cloche | L2a |
| 2.11 | bulle et barres fixes | L1 (`BarreActions`), L2a (bulle), M1 et M3 (barres) |
| 2.12 | bouton | L1, puis chaque lot M |
| 2.13 | champs | L0 (16 px sous 768 px), L1, puis chaque lot M |
| 2.14 | case, choix unique, segmenté | L1, M1, M4, M5 |
| 2.15 | une seule modale | L1 (`Dialog`, façade `Modal`), L3, M1, M2, M3, M4, M7, M9, M10 |
| 2.16 | menu, liste, popover | L1, L2a (avatar, cloche), M4 (⋯), M6 (périmètre) |
| 2.17 | onglets | L1, L2a (Studio), M8, M9 |
| 2.18 | tableau, cellule modifiable | L1, L3 (`EditableCell`), M1 |
| 2.19 | statut, badge, canal, compteur | L3, L2a (compteurs), M6 |
| 2.20 | toasts | L2b |
| 2.21 | états, pages `error` et `loading` | L1 (composants), L2b (pages, Loader) ; états nouveaux par écran : vague suivante |
| 2.22 | données et requêtes | L2b, M11 (`callbackUrl`) |
| 2.23 | mouvement (fondation) | L0 (durées, survol), M7, M11, LZ |
| 2.24 | composants métier partagés | L3 (A), L1 + lots M (B), L2b `toastAnnulable` (C) |

**Les 10 bloquants** : CA-01 → L2a ; CA-02/QU-01 → L2a (cause), L3 (fenêtre), M2 (suppression) ; ST-1, ST-2 → M1 ;
ST-3 → L0 + M1 ; QU-61 → M3 ; PI-36 → M7, sous réserve d'accord ; SU-02 et SU-05 → **hors vague** (parcours
Studio), leurs fondations (`Menu`, `toastAnnulable`) sont livrées par L1 et L2b.

**Les bugs du PRD § 1 et leurs sondes** : F1 → L2b ; F2, F3, MO1, MO4 → L0 ; O1 → L1 ; O2 → L0 (+ M3 pour la
barre) ; O3 → M3 ; M1 → L2a ; M2 → L2a + L2b ; M3 → M3 + M4 ; MO2 → L2a + M1 + M3 ; MO3 → L2b ; S1 à S8 (Studio)
→ hors vague. Relevés en plus : X1 → L3 ; X2, X3, X5 → M3 ; X4, X9 → L2a ; X6 → L1 + M7 ; X7, X13 → L0 ; X8 → L0
puis tous ; X14 → LZ ; X15 → L2b ; X0, X10 à X12 → hors vague.

### 3.1 Ordonnancement

Au plus **trois** lots en parallèle (chaque suite e2e démarre son `next dev`, son Postgres et deux workers ; la
machine a déjà swappé). Deux lots parallèles ne partagent **aucun** fichier ; deux lots successifs peuvent.

| Vague | Lots (parallèles entre eux) | `E2E_DECALAGE` | Dépend de |
|---|---|---|---|
| 1 | L0 | 10 | préalables |
| 2 | LS · L1 | 20 · 30 | L0 |
| 3 | L2a · L2b | 10 · 20 | L1 (L2a, L2b) ; LS terminé |
| 4 | L3 | 30 | L2a, L2b |
| 5 | M1 Stock · M2 À comptabiliser · M3 Mise en vente | 10 · 20 · 30 | L3 |
| 6 | M4 Commandes · M5 Tableau de bord · M6 Statistiques | 10 · 20 · 30 | L3 |
| 7 | M7 Calendrier · M8 Studio · M9 Réglages | 10 · 20 · 30 | L3 |
| 8 | M10 Compte et Démarrage · M11 Pages publiques | 10 · 20 | L3 |
| 9 | LZ | 0 | tous |

Les vagues 5 à 8 n'ont pas d'ordre imposé entre elles : n'importe quels trois lots M, une fois L3 fini.

### 3.2 Contrat du DOM avec la suite e2e

La suite mesure des sélecteurs précis. Un lot qui les casse fait passer une sonde à « non mesurable », ce qui est
un défaut, pas une réussite. **À garder tels quels :**

| Sélecteur ou texte | Utilisé par | Propriétaire |
|---|---|---|
| `aside a[data-active="true"]` sur le lien actif, rendu dès le serveur ; pas de `span[aria-hidden]` enfant direct du parent du lien (sauf un indicateur) | M1, X4 | L2a |
| `aside a[href="/legal/mentions-legales"]` visible dans le pied du menu déplié | M3, X3 | L2a |
| dock = `<nav>` `fixed` en bas ; ses **enfants directs** sont les liens et le bouton ; l'un d'eux a pour seul texte « Plus » | MO2, MO3, X9 | L2a |
| `button[aria-label="Ouvrir l'assistant IA"]` ; titre « Assistant IA » ; champ « Écris un message… » | MO1, MO3, X2, états | L2a |
| `button` nommé `/^Notifications/` avec `aria-expanded` ; textes « N à traiter », « Tout est à jour — rien à faire » | états | L2a |
| `button` nommé `Mon compte (<prénom>)` avec `aria-expanded` ; texte « Connecté » | `e2e/outils/calme.ts`, états | L2a |
| barre du haut : `<header>` collant contenant un `<h1>` | F1, X5 (adaptées en LS) | L2a |
| bouton de thème `button[data-theme-toggle]`, nom accessible « Passer en thème clair » en sombre, « Passer en thème sombre » en clair | X13, états | L0 |
| `[role=dialog]` dont le premier ancêtre `position: fixed` (ou lui-même) est le **voile plein écran** qui le contient ; un formulaire de modale est un `<form>` dans ce voile | O1, X1, X6, MO1 | L1 |
| `getByRole("dialog", { name: "Nouveau prompt" })`, « Modifier le prompt », « Méta-prompt », « Nouvelle commande », `/Délai entre deux brouillons/` ; bouton « Fermer » dans chaque modale | états | L1 (titres inchangés) |
| `/a-comptabiliser` : bouton « Valider » ouvre la fenêtre de vente ; aucun autre `<form>` avant elle dans le DOM | X1, MO1 | M2 |
| `/stock` : `input[type=checkbox][aria-label^="Sélectionner "]`, bouton « Annuler la sélection », `combobox` « Statut de <SKU> », bouton `/^Voir le détail/` | MO2, états | M1 |
| `/commandes` : `button[aria-label="Actions"]` ; textes « Voir les articles », « Commandes récentes » ; boutons « Importer un fichier Excel », « Créer une commande » | M3, MO1, MO3, états | M4 |
| `/mise-en-vente` : placeholder « Ex : PRL1 », bouton `/^Continuer/`, `input[type=file]`, `button[aria-label="Agrandir la photo 1"]`, `button[aria-label="Supprimer la photo 1"]`, titre « Photos » | O2, O3, M3, X2, X3, X5 | M3 |
| `/parametres` : bouton « Nouveau prompt » ; onglets `role=tab` « Annonces… » et « Studio… » avec `aria-selected` | O1, X6, MO1, catalogue | M9 |
| `/calendrier` : chaque jour avec ventes est un `button[data-jour]` ; titre « Détail du jour » | X6 (adaptée en LS) | M7 |
| `/dashboard` : périodes en `button` (« 30J »…) ; texte « Bonjour » | états, sondes X7, X9, MO2 | M5 |
| `/statistiques` : bouton « Tout l’historique » qui ouvre un `role="listbox"` d'`option` ; image « Répartition des statuts » | états, catalogue | M6 |
| `/login` : `input[type=email][autocomplete=email]`, `input[type=password][autocomplete=current-password]`, bouton « Se connecter » | `e2e/auth.setup.ts`, sondes | M11 |
| Libellé du Loader du tableau de bord : un `div` dont le premier nœud est le texte « Chargement du dashboard » | F1 | L2b, M5 |
| Toute condition `attente` de `e2e/catalogue-routes.ts` (textes en capitales compris) | captures, sondes G | chaque lot M |

### 3.3 Gabarit des commandes de vérification

Depuis la racine du projet. `<D>` = décalage du lot, `<serie>` = `apres-<lot>` (par exemple `apres-m1`).

```bash
npm run lint && npm run typecheck && npm test
# sondes de bugs du lot (normal, puis strict)
E2E_DECALAGE=<D> CAPTURES_SERIE=<serie> npx playwright test e2e/sondes-bugs.spec.ts -g " (<ids>) · "
E2E_DECALAGE=<D> CAPTURES_SERIE=<serie> SONDES_STRICT=1 npx playwright test e2e/sondes-bugs.spec.ts -g " (<ids>) · "
# sondes globales sur les routes du lot
E2E_DECALAGE=<D> CAPTURES_SERIE=<serie> SONDES_STRICT=1 npx playwright test e2e/sondes-bugs.spec.ts -g "G · Sondes globales · .*\[route\.(neuf\.)?(<routes>)\]"
# captures, états, axe des routes du lot
E2E_DECALAGE=<D> CAPTURES_SERIE=<serie> npx playwright test e2e/captures.spec.ts -g "route\.(neuf\.)?(<routes>)( |\.)"
E2E_DECALAGE=<D> CAPTURES_SERIE=<serie> npx playwright test e2e/etats.spec.ts -g "etat\.(<groupes>)\."
E2E_DECALAGE=<D> CAPTURES_SERIE=<serie> A11Y_STRICT=1 npx playwright test e2e/a11y.spec.ts -g "\[route\.(neuf\.)?(<routes>)"
E2E_DECALAGE=<D> CAPTURES_SERIE=<serie> npx playwright test e2e/fondations.spec.ts -g "\[<lot>\]"
# lecture
CAPTURES_SERIE=<serie> npx tsx e2e/sondes/resume.ts
npx tsx e2e/outils/planche-avant-apres.ts --apres <serie>
```

Les tests `confirmation destructive : <écran>` d'`etats.spec.ts` ne commencent pas par `etat.` : les lancer par
`-g "confirmation destructive : <écran>"` (`stock`, `réglages`, `commandes`).

Une sonde qui mesure plusieurs routes dans un même test (MO1, MO2, M2, X6, O2, G par route) n'est exigée
« corrigé » que sur les routes du lot : la lancer en mode normal et lire `resume.ts --detail <id>`. Le mode strict
sur l'ensemble se juge en LZ.

Une commande verte se prouve par sa sortie (« N passed », code 0) recopiée dans le compte rendu du lot. Le lot
regarde **lui-même** la planche avant/après de ses routes (images) et décrit chaque différence : voulue (citer la
règle) ou régression (corriger).

---

### Lot L0 — Tokens, Tailwind, polices, thème, garde-fou

**Objectif.** Toutes les valeurs dans `app/tokens.css`, branchées sur Tailwind par canaux ; polices chargées sans
nom littéral ; thème et `theme-color` justes ; codemod des valeurs en dur ; garde-fou actif avec dette marquée.

**Fichiers possédés.**
- Créer : `app/tokens.css`, `lib/themeMeta.ts`, `lib/contraste.ts`, `lib/designTokens.test.ts`,
  `scripts/refonte/codemod-tokens.mjs`.
- Modifier : `package.json`, `package-lock.json`, `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`,
  `app/manifest.ts`, `components/ThemeToggle.tsx`.
- Modifier **mécaniquement** (codemod et marqueurs de dette seulement) : tout fichier `.ts`/`.tsx` de `app/` (hors
  `app/api/**`) et de `components/`. La liste exacte est la sortie du codemod, jointe au compte rendu.

**Dépendances.** Préalables. Seul en vague 1.

**Interfaces produites.**
- `lib/themeMeta.ts` : `export const FOND_THEME = { light: "#e7ece8", dark: "#0b0e0d" } as const` ;
  `export const CLE_THEME = "myflip-theme"` ; `export const SCRIPT_THEME: string` (script inline : lit
  `localStorage`, retombe sur `prefers-color-scheme`, pose `data-theme` explicite, crée
  `meta[name="theme-color"]` dans `<head>` si elle manque puis règle son `content` sur `FOND_THEME[thème]`, pose
  `data-sidebar="collapsed"` si `localStorage["myflip-sidebar"] === "collapsed"`, tout dans des `try/catch`) ; `export function appliquerTheme(theme: "light" | "dark"): void` (client : attribut,
  `localStorage`, meta).
- `lib/contraste.ts` : `type Rvb = { r: number; v: number; b: number }` ; `lireCanaux(s: string): Rvb` ;
  `ratioContraste(a: Rvb, b: Rvb): number` ; `lireBlocsTokens(css: string): { clair: Record<string, string>;
  sombre: Record<string, string> }`.
- Classes CSS globales : `.theme-seul-clair` (masquée en sombre), `.theme-seul-sombre` (masquée en clair).

**Étapes.**
- [ ] Installer : `npm install --save-exact radix-ui@1.7.0 class-variance-authority@0.7.1 clsx@2.1.1
  tailwind-merge@2.6.1` (avant, confirmer par context7 que `tailwind-merge` 2.x est la ligne Tailwind 3 ; sinon
  s'arrêter et le signaler).
- [ ] Écrire `lib/contraste.ts` et `lib/designTokens.test.ts` (§ 2.7, § 2.8). Lancer `npx vitest run
  lib/designTokens.test.ts` : **échec attendu** (pas de `tokens.css`).
- [ ] Écrire `app/tokens.css` : bloc `:root` (polices, échelles § 2.4, couleurs claires § 2.2 et § 2.3,
  `color-scheme: light`), bloc `:root[data-theme="dark"]` (couleurs sombres, `--sh-k: 2.4`, `--veil-a`,
  `--veil-fort-a`, `color-scheme: dark`), bloc `:root[data-sidebar="collapsed"] { --sidebar-w: 76px }`, bloc
  `@media (prefers-reduced-motion: reduce) { :root { --d-fast: 0ms; --d-base: 0ms; --d-slow: 0ms } }`.
- [ ] Réécrire `tailwind.config.ts` (§ 2.5).
- [ ] Réécrire `app/globals.css` : `@tailwind` ; `@layer base` avec `html { scrollbar-color:
  rgb(var(--line-strong)) rgb(var(--bg)); scroll-padding-top: calc(var(--topbar-h) + 12px) }`, `body {
  background-color: rgb(var(--bg)); color: rgb(var(--ink)); font-family: var(--font-sans); font-size:
  var(--t-base); line-height: var(--lh-ui); font-variant-numeric: tabular-nums }`, `:focus-visible { outline: 2px
  solid rgb(var(--focus)); outline-offset: 2px }`, `::selection { background: rgb(var(--accent) / 0.22) }`, et sous
  `@media (max-width: 767px)` : `:root input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]),
  :root select, :root textarea { font-size: var(--t-md) }` (spécificité (0,2,1) : l'emporte sur `text-base` sans
  `!important` ; plus aucun zoom iOS, MO1) ; classes `.theme-seul-*`. **Supprimer** : tout le bloc de variables
  Direction C, les règles `.sb-*`, `::-webkit-scrollbar*`, le `color-scheme` de `html, body`. **Garder** les
  keyframes et le bloc `prefers-reduced-motion` `!important` sous le marqueur `/* design-tokens-dette: R17 → LZ */`.
- [ ] `app/layout.tsx` : `import "./tokens.css"` puis `import "./globals.css"` ; `Space_Grotesk({ subsets:
  ["latin"], variable: "--font-famille-ui", display: "swap" })`, `JetBrains_Mono({ subsets: ["latin"], variable:
  "--font-famille-mono", display: "swap" })` ; `<html lang="fr" className={[ui.variable, mono.variable].join(" ")}
  suppressHydrationWarning>` ; `<body>` **sans** classe de police ni `min-h-screen` ; script inline
  `SCRIPT_THEME` en premier enfant de `<body>` ; **retirer** `themeColor` de `viewport` (la meta appartient au
  script et à `appliquerTheme`, sinon Next la réécrit et React signale un écart d'hydratation).
- [ ] `app/manifest.ts` : `background_color` et `theme_color` lus dans `FOND_THEME.light`.
- [ ] `components/ThemeToggle.tsx` : un seul `<button type="button" data-theme-toggle>` sans `aria-label` ni état
  React ; contenu : `<Sun className="theme-seul-sombre" aria-hidden />`, `<Moon className="theme-seul-clair"
  aria-hidden />`, `<span className="sr-only theme-seul-sombre">Passer en thème clair</span>`, `<span
  className="sr-only theme-seul-clair">Passer en thème sombre</span>` ; au clic, `appliquerTheme(<l'autre>)` lu sur
  `document.documentElement.dataset.theme`. Cible `h-11 w-11 md:h-10 md:w-10` (CA-49).
- [ ] Écrire le codemod (§ 2.6 A à G), le lancer en `--dry-run`, relire le rapport (nombre de remplacements par
  table, fichiers), puis l'appliquer. Rapport final : reste de valeurs px arbitraires, styles en ligne restants.
- [ ] Lancer le test : pour chaque fichier encore en violation, ajouter le marqueur de dette avec le lot
  propriétaire (table « Propriétaires » ci-dessous). Relancer : **vert**.
- [ ] Vérifier (commandes ci-dessous), relire la planche `apres-l0` route par route.

**Propriétaires des dettes** (pour les marqueurs) : `components/Sidebar.tsx`, `TopBar.tsx`,
`NotificationBell.tsx`, `AccountMenu.tsx`, `ChatBot.tsx`, `AppShell.tsx`, `console.tsx`, `app/studio/layout.tsx`
→ L2a ; `components/Loader.tsx`, `app/not-found.tsx` → L2b ; `components/Modal.tsx` → L1 ; `SellModal.tsx`,
`SellDialog.tsx`, `StatutPill.tsx`, `StatutBadge.tsx`, `CanalBadge.tsx`, `EditableCell.tsx`,
`lib/statutColors.ts`, `lib/canalColors.ts`, `lib/celebrate.tsx` → L3 ; `app/stock/**` → M1 ;
`app/a-comptabiliser/**` → M2 ; `app/mise-en-vente/**` → M3 ; `app/commandes/**`, `components/NewCommandeModal.tsx`
→ M4 ; `app/dashboard/**`, `components/DemarrageCard.tsx` → M5 ; `app/statistiques/**` → M6 ;
`app/calendrier/**` → M7 ; `app/studio/**` (hors layout) → M8 ; `app/parametres/**`, `components/parametres/**` →
M9 ; `app/compte/**`, `components/compte/**`, `app/demarrage/**` → M10 ; `app/login/**`, `app/signup/**`,
`app/reset-password/**`, `app/legal/**`, `app/page.tsx`, `components/landing/**` → M11 ; `app/globals.css` → LZ.

**Critères d'acceptation.**
- `lib/designTokens.test.ts` vert ; `grep -rn "\[var(--[a-z0-9-]*)\]/[0-9]" app components` ne renvoie rien.
- Sondes **vertes en strict** : F2, F3, O2, MO1, MO4, X7 ; G6 et G7 sur toutes les routes ; G3 sur toutes les
  routes sauf `calendrier`, `neuf.calendrier`, `commandes`, `neuf.commandes` (tailles en ligne : M7, M4).
- O1 reste rouge en sombre (le voile `bg-ink/30` éclaircit le fond sombre) : il passe en L1. X13 se juge après LS
  (sélecteur adapté) ; en L0, `etat.shell.theme-toggle` vert suffit.
- X8 et G1/G2 : aucune régression par rapport à `avant` (comparer `resume.ts`) ; les routes encore rouges sont
  celles dont un fichier porte une dette R2, R4 ou R5.
- `npm run lint`, `npm run typecheck`, `npm test` verts. Aucune erreur de console nouvelle dans
  `e2e/rapports/apres-l0/console.jsonl` (en particulier aucun écart d'hydratation).

**Vérification.** `<D>` = 10, `<serie>` = `apres-l0`, `<ids>` = `F2|F3|O1|O2|MO1|MO4|X7` (O1 en mode normal),
`<groupes>` = `shell`, sondes globales sur toutes les routes (sans `-g`), captures complètes
(`npx playwright test e2e/captures.spec.ts`).

**Couvre.** Audit § 2.1, § 2.2 (valeurs), § 2.4, § 2.5 (échelle), § 2.9 (thème, `theme-color`, survol tactile),
§ 2.23 (en partie) : CA-03, QU-04, CO-23, PI-7 (tokens), CA-51, CA-36, QU-46, QU-47, CA-11, PI-2, ST-10, QU-05,
SU-29, CO-8, CA-12 (token), QU-06, CO-9, SU-30, CO-7, PI-38 (token), CA-13 (token), PI-9 (token), ST-6, SU-61,
CO-45 (token), CA-09, PI-3, ST-37, ST-38, QU-12, QU-13, SU-32, CO-15, CA-52, CA-39, CA-40, CA-41, X7, X13 ;
PRD § 1 : F2, F3, O2, MO1, MO4, et la cause racine de O1 et O3 (opacités sur variables).

---

### Lot LS — Suite e2e : suivre le nouveau DOM, sans rien assouplir

**Objectif.** Adapter les sélecteurs que ce plan change **par conception**, écrire les tests des comportements
nouveaux, et l'outil de planche avant/après. Aucun critère, seuil ni route n'est retiré.

**Fichiers possédés.** Modifier : `e2e/sondes/bugs-cadre.ts`, `e2e/sondes/bugs-texte.ts`,
`e2e/sondes/bugs-divers.ts`, `e2e/etats.spec.ts`, `e2e/README.md`, `e2e/sondes/LISEZMOI.md`. Créer :
`e2e/fondations.spec.ts`, `e2e/outils/planche-avant-apres.ts`.

**Dépendances.** L0. Parallèle avec L1 (`E2E_DECALAGE=20`).

**Étapes.**
- [ ] X4 : repère `aside a[data-active=true]` ; « indicateur » = `aside nav > span[aria-hidden]` s'il existe, sinon
  le lien actif lui-même, **à condition** que son fond soit opaque et à ≥ 3:1 de l'aside (sinon `corrige: false`) ;
  bouton de repli = `aside button[aria-expanded]`, repli `aside button[aria-label='Réduire ou agrandir le menu']`.
- [ ] F1 : témoin = `header h1` s'il existe, sinon l'ancien `div` « Dashboard ».
- [ ] X5 : chercher les éléments collants parmi `div, header`.
- [ ] X6 (calendrier) : jour = `button[data-jour]`, repli `div[style*='cursor: pointer']`.
- [ ] X13 : bouton = `button[data-theme-toggle]`, repli `button[aria-label^='Passer en thème']` ; étiquette =
  `aria-label` sinon `innerText` normalisé.
- [ ] `etats.spec.ts` : `stock.sell-modal` → dialogue `/^Enregistrer la vente de PIS7/` ; `compta.sell-dialog` →
  bouton « Enregistrer la vente » ; `shell.session-expired` → toast « Session expirée. Reconnecte-toi pour reprendre
  ici. » ; « boîtes natives » remplacé par trois tests `confirmation destructive : <écran>` qui cliquent
  « Supprimer », attendent `getByRole("alertdialog")` de nom `/^Supprimer ADI1 \?/` (stock),
  `/^Supprimer le prompt « Prompt par défaut » \?/` (réglages), `/^Supprimer la commande /` (commandes ; l'entrée
  du menu est un `menuitem` « Supprimer »), cliquent « Annuler », et vérifient `garde.bloquees` vide.
- [ ] `e2e/fondations.spec.ts`, chaque titre préfixé par le lot qui le fera passer :
  - `[L1] la feuille garde son pied visible à 390 × 500` : `/parametres`, « Nouveau prompt », fenêtre 390 × 500 ;
    le bouton principal du pied est dans la fenêtre.
  - `[L2a] cloche dans l'écran à 390` : boîte du panneau entre 0 et 390.
  - `[L2a] feuille « Plus »` (mobile) : « Plus » ouvre un dialogue avec « Commandes », « Calendrier »,
    « Statistiques », « Réglages », « Mon compte », « Se déconnecter » ; Échap ferme ; focus rendu à « Plus ».
  - `[L2a] lien d'évitement` : premier Tab → « Aller au contenu » visible ; Entrée → focus sur `#contenu`.
  - `[L3] une seule fenêtre de vente` : depuis `/stock` (statut « Vendu » sur PIS7) et depuis `/a-comptabiliser`
    (« Valider » sur CHD3), le dialogue a le même gabarit (champs « Prix de vente », « Date de vente »,
    « Canal ») ; prix vide + « Enregistrer la vente » → message « Indique un prix de vente supérieur à 0 € » et
    `aria-invalid="true"`, aucune requête (`bloquerEcritures`).
  - `[M1] quitter Vendu demande confirmation` : LAC9, statut « En vente » → alertdialog « Annuler la vente de
    LAC9 ? » ; « Garder vendu » → aucune requête, statut affiché « Vendu ».
  - `[M1] la sélection n'écrit que sur les lignes visibles` : cocher 3 lignes dont une Vendu, filtrer sur une
    autre marque, statut « En stock », « Appliquer » → compteur « dont 2 masqués » visible ; corps de la requête
    groupée interceptée (`page.route`, réponse simulée) = les seuls ids visibles ; si un Vendu est visé,
    alertdialog d'abord.
  - `[M1] virtualisation : hauteur totale = hauteur rendue` : faire défiler `/stock` jusqu'en bas ; la hauteur du
    conteneur virtuel ne change pas de plus de 2 px entre le haut et le bas.
  - `[M3] nouvelle session protège les annonces` : session restaurée avec une annonce générée non enregistrée
    (même préparation que `etat.mev.session-restauree`) ; « Nouvelle session » → alertdialog « Abandonner
    1 annonce non enregistrée ? » ; « Annuler » → l'annonce est toujours là.
  - `[M7] détail du jour sur mobile` : à 390, toucher un jour avec ventes → la liste des articles est visible et
    aucun `[role=dialog]` n'est ouvert.
- [ ] `e2e/outils/planche-avant-apres.ts` : arguments `--avant <serie>` (défaut `avant`), `--apres <serie>`,
  `--filtre <regex>` ; écrit `e2e/captures.nosync/planche-<apres>.html` : par projet et par identifiant de
  capture, l'image avant et l'image après côte à côte, absentes signalées. Lecture seule ailleurs.
- [ ] Documenter les changements dans `e2e/README.md` et `e2e/sondes/LISEZMOI.md` (section « Écarts avec
  l'étude »).

**Critères d'acceptation.**
- Sur le code issu de L0, en mode normal : X4, F1, X5, X6 donnent **le même état** qu'en série `avant` (« bug
  présent ») ; X13 est « corrigé » (L0 l'a corrigé). Aucune sonde adaptée ne passe à « non mesurable ».
- `npx playwright test --list` liste les nouveaux tests ; `npm run typecheck` vert.
- Les tests de `fondations.spec.ts` et d'`etats.spec.ts` modifiés sont rouges tant que leur lot n'est pas passé :
  c'est attendu et écrit dans le compte rendu (tableau test → lot).

**Vérification.** `<D>` = 20, `<serie>` = `apres-ls`, `<ids>` = `X4|F1|X5|X6|X13`.

**Couvre.** Outillage des critères PRD § 3.1 et § 12 (parcours « une vente depuis le Stock et une depuis
À comptabiliser passent par la même fenêtre »).

---

### Lot L1 — Primitives `components/ui/**` et utilitaires

**Objectif.** Une implémentation de chaque primitive, accessible, habillée uniquement par tokens.

**Fichiers possédés.** Créer : `components/ui/button.tsx`, `field.tsx`, `input.tsx`, `textarea.tsx`,
`select.tsx`, `checkbox.tsx`, `radio-group.tsx`, `segmented.tsx`, `liste-choix.tsx`, `dialog.tsx`,
`alert-dialog.tsx`, `sheet.tsx`,
`menu.tsx`, `popover.tsx`, `tabs.tsx`, `tooltip.tsx`, `table.tsx`, `badge.tsx`, `panel.tsx`, `states.tsx`,
`spinner.tsx`, `barre-actions.tsx` ; `lib/cn.ts`, `lib/cn.test.ts`, `lib/format.ts`, `lib/format.test.ts`,
`lib/useMouvementReduit.ts`. Modifier : `components/Modal.tsx`. **Ne pas créer** `components/ui/toaster.tsx`
(L2b).

**Dépendances.** L0. Parallèle avec LS (`E2E_DECALAGE=30`).

**Interfaces produites** (toutes en `"use client"` sauf `lib/cn.ts`, `lib/format.ts`, `badge.tsx`, `panel.tsx`,
`table.tsx`) :
- `cn(...entrees: ClassValue[]): string` = `extendTailwindMerge({ extend: { classGroups: { "font-size": [{ text:
  ["xs","sm","base","md","lg","xl","2xl","3xl"] }], "z-index": [{ z: ["auto","base","raised","sticky","dock","fab",
  "overlay","modal","popover","toast","tooltip","skip"] }], shadow: [{ shadow: ["none","pop","over"] }], rounded:
  [{ rounded: ["none","xs","sm","md","lg","full"] }], duration: [{ duration: ["0","fast","base","slow"] }],
  animate: [{ animate: ["none","entree","fondu","pop","shimmer","spin"] }] } } })` appliqué à `clsx(entrees)`.
- `Button` : `cva` ; `variant: "primary" | "secondary" | "ghost" | "danger" | "bar"`, `size: "sm" | "md" | "lg"`,
  props `asChild?: boolean` (Radix `Slot`), `pending?: boolean`, `pendingLabel?: string`, `type` par défaut
  `"button"`. `primary` : `bg-accent text-accent-ink hover:bg-accent-hover` ; `secondary` : `bg-surface text-ink
  border border-line-strong hover:bg-surface-2` ; `ghost` : `text-ink-2 hover:bg-surface-2 hover:text-ink` ;
  `danger` : `bg-danger text-danger-ink` ; `bar` : `bg-bar-ink text-bar`. Tailles : `sm` h-8, `md` h-9, `lg` h-11 ;
  sous `md` toujours `min-h-hit`. Focus : `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus
  focus-visible:ring-offset-2 focus-visible:ring-offset-bg`. Désactivé : `disabled:bg-surface-3
  disabled:text-ink-3` (jamais d'opacité). En cours : `aria-busy="true"`, `aria-disabled="true"`, **pas**
  `disabled`, clics ignorés dans le gestionnaire, `Spinner` + `pendingLabel`, largeur figée (libellé normal et
  libellé en cours empilés dans une grille, l'un `invisible`).
- `IconButton` (même fichier) : props de `Button` sans `children` texte + `label: string` **obligatoire** →
  `aria-label` ; carré `h-11 w-11 md:h-9 md:w-9`.
- `Field({ label, hint?, error?, children, className? })` : `useId()` ; fournit par contexte `{ id,
  describedBy, invalid }` ; `<label htmlFor>` en `text-sm text-ink-2` ; aide `<p id>` ; erreur `<p id>` en
  `text-neg` avec icône `CircleAlert` (affichée seulement si `error`). `useChampField()` exporté.
- `Input`, `Textarea`, `Select` (natif, chevron `ChevronDown` décoratif) : `forwardRef`, lisent le contexte
  (`id`, `aria-describedby`, `aria-invalid`) ; `h-11 md:h-9`, `text-md md:text-base`, `bg-surface border
  border-line-strong rounded`, focus `ring-2 ring-focus`, erreur `border-neg bg-neg-soft`, lecture seule jamais
  habillée en champ.
- `Checkbox` : `<input type="checkbox">` **natif** (contrat MO2), `h-5 w-5 md:h-4 md:w-4`, `accent-accent`, dans
  un `<label>` à zone de 44 × 44 (`p-3 -m-3`) quand `label` est fourni.
- `RadioGroup({ legend, name, value, onChange, options })` : `<fieldset><legend>` + `<input type="radio">`
  natifs ; sélection = bordure accent 2 px + coche, jamais le fond seul.
- `Segmented({ label, value, onValueChange, options, mode?: "radio" | "boutons" })` : `mode="radio"` (défaut) =
  Radix `RadioGroup` (`role="radiogroup"`, flèches, tabindex itinérant) ; `mode="boutons"` = `role="group"
  aria-label` + `<button aria-pressed>` (repli permis par l'audit § 2.14, utilisé là où la suite e2e cherche des
  boutons : périodes du tableau de bord).
- `ListeChoix<T extends string>({ libelleId, valeur, options: { valeur: T; libelle: string }[], onChange, children
  /* contenu du déclencheur */ })` : déclencheur `<button aria-haspopup="listbox" aria-expanded>` + `Popover`
  contenant `<ul role="listbox" aria-labelledby={libelleId}>` d'`<li role="option" aria-selected>` ; à l'ouverture
  focus sur l'option active ; ↑ ↓ Début Fin, Entrée choisit et ferme, Échap ferme et rend le focus ;
  `overscroll-contain` (modèle APG listbox, PI-46).
- `Dialog({ open, onOpenChange, title, description?, children, footer?, size?: "sm" | "md" | "lg", as?: "div" |
  "form", onSubmit?, pending?, dirty?, veil?: "normal" | "fort", initialFocus?: RefObject<HTMLElement> })` sur Radix
  `Dialog`. Structure **imposée par le contrat § 3.2** : `Dialog.Portal` > `Dialog.Overlay` (`fixed inset-0 z-modal
  bg-veil` ou `bg-veil-fort`, `flex items-end md:items-center justify-center overflow-y-auto overscroll-contain
  p-0 md:p-4`) qui **contient** `Dialog.Content` (`relative`, pas `fixed`) ; Content : `bg-surface text-ink
  rounded-t-lg md:rounded-lg shadow-over w-full md:max-w-<sm 28rem | md 32rem | lg 42rem> flex flex-col
  max-h-[calc(100dvh-2rem)]`, `pb-[max(1rem,env(safe-area-inset-bottom))]` sous `md` ; en-tête titre `h2
  text-lg` + croix `IconButton label="Fermer"` (icône `X`) ; corps `min-h-0 flex-1 overflow-y-auto` ; pied
  `border-t border-line` toujours visible, boutons pleine largeur sous `md`. `as="form"` : `<form>` englobe corps et
  pied. `pending` : Échap, clic extérieur et croix sans effet. `dirty` : clic extérieur sans effet ; Échap ouvre
  l'`AlertDialog` « Abandonner la saisie en cours ? » (« Abandonner » / « Continuer la saisie »).
  `onInteractOutside` et `onPointerDownOutside` ignorent les cibles dans `[data-sonner-toaster]`. Animation :
  `motion-safe:animate-pop` sur Content, `motion-safe:animate-fondu` sur Overlay.
- `AlertDialog({ open, onOpenChange, title, description, confirmLabel, cancelLabel = "Annuler", onConfirm,
  pending?, tone?: "danger" | "neutre" })` sur Radix `AlertDialog`, même structure voile ⊃ contenu ; focus initial
  sur « Annuler » ; `confirmLabel` en `Button` `danger` (ou `primary`), `pending` → `pendingLabel`.
- `Sheet({ open, onOpenChange, title, side?: "bas" | "droite", children })` : même mécanique que `Dialog`,
  contenu collé en bas (ou à droite, 440 px, sur ordinateur).
- `Menu`, `MenuTrigger`, `MenuContent` (portail, `z-popover`, `bg-surface border border-line rounded-md
  shadow-pop`, `collisionPadding={8}`), `MenuItem` (`tone?: "danger"`, hauteur 36 px, 44 px sous `md`),
  `MenuSeparator`, `MenuLabel` sur Radix `DropdownMenu`.
- `Popover`, `PopoverTrigger`, `PopoverContent` (portail, `z-popover`, `collisionPadding={16}`,
  `w-[min(24rem,calc(100vw-2rem))]`) sur Radix `Popover`.
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` sur Radix `Tabs` (`role=tab`, `aria-selected`, flèches) ;
  `TabsLiens({ label, liens: { href, libelle, actif }[] })` : `<nav aria-label>` + `<Link aria-current="page">`.
- `Tooltip({ contenu, children, side? })` : Radix `Tooltip` avec son propre `Tooltip.Provider delayDuration={300}`,
  `z-tooltip`, `bg-bar text-bar-ink text-xs`.
- `Table`, `THead({ collant? })` (`sticky top-0 z-raised bg-surface-2`), `TH({ tri?: "asc" | "desc" | "none",
  onTri? })` (`scope="col"`, `aria-sort`, bouton interne), `TR`, `TD`, `TableDefilante` (conteneur `overflow-x-auto`
  avec ombre d'indice tant qu'il reste du contenu), `ColonneActions` (`sticky right-0 bg-surface`).
- `Badge({ ton: "neutre" | "pos" | "neg" | "warn" | "accent" })`, `CountBadge({ count, label })` (`min-w-4 h-4
  rounded-full text-xs bg-st-compta-soft text-st-compta-ink`, `aria-label={label}`).
- `Panel({ titre?, titreAs?: "h2" | "h3", aside?, actions?, pied?, padding?: "sm" | "md" | "lg", children })` :
  `bg-surface border border-line rounded-lg`, sans ombre.
- `EmptyState({ icone?, titre, description, action? })`, `ErrorState({ titre, description?, detail?, onRetry? })`
  (`role="alert"`, bouton « Réessayer »), `Skeleton({ className })` (`motion-safe:animate-shimmer bg-surface-3`),
  `SquelettePage()` (`aria-busy="true"`, texte `sr-only` « Chargement… »), `Spinner()` (`motion-safe:animate-spin`,
  `aria-hidden`).
- `BarreActions({ ouverte, ton: "surface" | "bar", "aria-label": string, children })` : `fixed z-dock inset-x-3
  bottom-[calc(var(--dock-h)+env(safe-area-inset-bottom)+0.5rem)] md:left-[calc(var(--sidebar-w)+1.5rem)]
  md:right-6 md:bottom-4 rounded-lg shadow-over`, fond opaque (`bg-surface border border-line` ou `bg-bar
  text-bar-ink`) ; tant qu'elle est ouverte, un `ResizeObserver` écrit `--fab-offset: <hauteur + 8>px` sur
  `document.documentElement.style`, remis à `0px` à la fermeture et au démontage.
- `lib/format.ts` : `eur(n: number): string` ; `signedEur(n: number): string` (`signDisplay: "exceptZero"`, signe
  moins U+2212) ; `ton(n: number): "pos" | "neg" | "neutre"` ; `pluriel(n: number, singulier: string,
  plurielForme: string): string` (`Intl.PluralRules("fr-FR")` : 0, 1 et 1,5 au singulier) ; `niveauCoef(n: number |
  null): { ton: "pos" | "warn" | "neg" | "neutre"; libelle: string }` (≥ 2,3 « objectif tenu » ; ≥ 2 « proche » ;
  < 2 « faible » ; `null` « — ») ; `dateCourte(d: Date | string): string` ; `majusculeInitiale(s: string): string` ;
  réexporte **sans les modifier** `coefLabel` (`lib/calc.ts`), `aujourdhuiParis` et `jourParis`
  (`lib/dateMiseEnVente.ts`).
- `useMouvementReduit(): boolean` (`useSyncExternalStore` sur `matchMedia`, instantané serveur `false`).
- `components/Modal.tsx` : **même signature** qu'aujourd'hui (`open`, `onClose`, `title`, `children`, `footer`),
  réimplémentée comme une fine façade sur `Dialog` (aucune mécanique propre) et marquée `@deprecated`. Les six
  appelants gagnent focus, piège, voile et retour du focus sans être modifiés.

**Étapes.**
- [ ] Écrire `lib/cn.test.ts` : `cn("text-sm text-ink", "text-md")` → `"text-ink text-md"` ; `cn("z-sticky",
  "z-modal")` → `"z-modal"` ; `cn("shadow-none", "shadow-pop")` → `"shadow-pop"` ; `cn("rounded-sm", "rounded-lg")`
  → `"rounded-lg"` ; `cn("duration-fast", "duration-slow")` → `"duration-slow"` ; `cn("bg-surface",
  "bg-surface-2")` → `"bg-surface-2"` ; `cn("text-ink-3", "text-xs")` garde les deux. Lancer : échec.
- [ ] Écrire `lib/format.test.ts` : `signedEur(-19.45)` → `"−19,45 €"` (U+2212, U+00A0 avant €) ;
  `signedEur(0)` → `"0,00 €"` ; `pluriel(1, "vendu", "vendus")` → `"1 vendu"` ; `pluriel(0.6, "vente", "ventes")` →
  `"0,6 vente"` ; `pluriel(2, …)` → pluriel ; `niveauCoef(2.3).libelle` → `"objectif tenu"` ;
  `niveauCoef(null).ton` → `"neutre"` ; `majusculeInitiale("samedi 3 octobre")` → `"Samedi 3 octobre"`. Échec.
- [ ] Implémenter `lib/cn.ts`, `lib/format.ts`, `lib/useMouvementReduit.ts` ; tests verts.
- [ ] Implémenter les primitives dans l'ordre : `spinner`, `button`, `field`, `input`, `textarea`, `select`,
  `checkbox`, `radio-group`, `segmented`, `dialog`, `alert-dialog`, `sheet`, `menu`, `popover`, `liste-choix`,
  `tabs`, `tooltip`, `table`, `badge`, `panel`, `states`, `barre-actions`. Aucun `text-[`, `z-[`, hex, `rounded-[`, `shadow-[`.
- [ ] Réécrire `components/Modal.tsx` en façade ; retirer son marqueur de dette.
- [ ] Vérifier.

**Critères d'acceptation.** Garde-fou vert sans marqueur dans `components/ui/**` et `components/Modal.tsx` ;
`lib/cn.test.ts`, `lib/format.test.ts` verts ; sonde O1 **stricte** verte (4 projets) ; X6 et MO1 « corrigé »
sur la modale « Nouveau prompt » (lecture de `resume.ts`, la partie calendrier de X6 relève de M7) ; `[L1] la feuille garde son pied visible à 390 × 500` vert ; états
`etat\.params\.(prompt-modal|metaprompt-modal)`, `etat\.stock\.(detail-modal|new-commande-modal)`,
`etat\.mev\.delai-modal` verts ; navigation au clavier de « Nouveau prompt » vérifiée (focus initial, 25 Tab, Échap
rend le focus).

**Vérification.** `<D>` = 30, `<serie>` = `apres-l1`, `<ids>` = `O1` en strict puis `X6|MO1` en mode normal, `<groupes>` = `params|stock|mev`,
`fondations.spec.ts -g "\[L1\]"`.

**Couvre.** Audit § 2.12 à § 2.18 (primitives), § 2.3 (formateurs), § 2.15 (mécanique, façade) : CO-32, QU-47,
CA-49, ST-32, CO-50 (règle), CA-10, QU-11, ST-29, SU-33, CO-14 (règle), CA-24, CO-11, CO-12, SU-26, CA-23, CO-13,
SU-27, CA-18, CA-19, CA-20 (mécanique), SU-28, PI-35 (mécanique), QU-43, QU-70, PI-25, SU-25 (primitives) ; X6
(partie modale).

---

### Lot L2a — Cadre : hauteur, menu, rail, dock, « Plus », barre du haut, cloche, bulle

**Objectif.** Un cadre sans défilement parasite, au z-index nommé, accessible, qui tient sur iPhone.

**Fichiers possédés.** Modifier : `components/AppShell.tsx`, `components/TopBar.tsx`,
`components/NotificationBell.tsx`, `components/AccountMenu.tsx`, `components/ChatBot.tsx` (bulle, couleurs et z du
panneau seulement), `components/console.tsx`, `app/studio/layout.tsx`. Créer : `components/cadre/navigation.ts`,
`components/cadre/MenuLateral.tsx`, `components/cadre/Dock.tsx`, `components/cadre/FeuillePlus.tsx`. Supprimer :
`components/Sidebar.tsx`, `lib/useDismiss.ts` (plus aucun importeur après ce lot ; vérifier par `grep`).

**Dépendances.** L1, LS. Parallèle avec L2b (`E2E_DECALAGE=10`).

**Interfaces.**
- Consomme : `Sheet`, `Menu*`, `Popover*`, `Tooltip`, `CountBadge`, `IconButton`, `cn`.
- Produit : `Frame({ children, className? })` (dans `console.tsx`) = `<main id="contenu" tabIndex={-1}
  className="flex min-h-0 flex-1 flex-col gap-3.5 p-3.5 min-[900px]:p-[18px] motion-safe:animate-fondu">` — ni
  `min-h-screen`, ni `transform`, ni fond (le fond est celui du corps) ; `Module` → `Panel` ; `CardTitle({ as?:
  "h2" | "h3" })` rend un titre réel (défaut `h2`) ; `Eyebrow` en `text-xs text-ink-3` (casse inchangée : c'est
  l'écran qui la changera, PI-6) ; mêmes exports et mêmes props qu'aujourd'hui (aucun appelant ne casse).
- `navigation.ts` : `type EntreeNav = { href: string; libelle: string; icone: LucideIcon; compteur?: boolean;
  section?: "studio"; dock?: boolean; plus?: boolean; ordinateur?: boolean }` ; `NAVIGATION: EntreeNav[]` ;
  `estActif(chemin: string, href: string): boolean`.

**Étapes.**
- [ ] `AppShell` : premier enfant `<a href="#contenu" className="sr-only focus:not-sr-only focus:fixed
  focus:left-3 focus:top-3 focus:z-skip …">Aller au contenu</a>` ; colonne `flex min-h-dvh flex-col
  md:pl-[var(--sidebar-w)] transition-[padding] duration-base` ; marge basse `pb-[calc(var(--dock-h)+env(safe-area-inset-bottom)+4.5rem+var(--fab-offset,0px))]
  md:pb-[calc(5.5rem+var(--fab-offset,0px))]` ; plus aucun `pb-24`. Pages sans cadre inchangées.
- [ ] `MenuLateral` : `<aside className="fixed inset-y-0 left-0 z-sticky hidden w-[var(--sidebar-w)] md:flex …">`
  avec `<nav aria-label="Navigation principale">` ; lien actif `data-active` + `aria-current="page"` + `bg-accent
  text-accent-ink`, calculés **pendant le rendu** par `usePathname()` (aucun `useLayoutEffect`, aucun indicateur
  mesuré) ; inactif `text-ink-2 hover:bg-surface-2 hover:text-ink`. Libellés : « Tableau de bord », « Stock »,
  « Mise en vente », « À comptabiliser », « Calendrier », « Commandes », « Statistiques », « Réglages », « Mon
  compte », séparateur, « Studio ». Rail (`replie:`) : icône seule, libellé passé en `replie:sr-only` (le nom
  accessible reste le texte du lien, jamais un `aria-label` qui écraserait le compteur), `Tooltip`, plus aucun code
  (« DASH »), compteur gardé en `CountBadge` ; nom du lien « À comptabiliser, 3 articles » (complément `sr-only`).
  Bouton de repli : `aria-expanded` tenu par `useSyncExternalStore` sur `data-sidebar` (absent du HTML serveur,
  posé à l'hydratation), libellé « Réduire le menu » ou « Agrandir le menu » par deux `span` (`sr-only
  replie:hidden` et `sr-only hidden replie:inline`), donc juste dès le premier affichage. Pied : « Se déconnecter » (`text-left`), puis liens légaux en
  `<Link>` `text-xs text-ink-2 inline-flex min-h-6 py-1 gap-x-3`, « © 2026 MyFlip » sans opacité ; replié, les
  liens légaux passent dans le menu de l'avatar.
- [ ] `Dock` (sous `md`) : `<nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-dock
  h-[calc(var(--dock-h)+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] grid grid-cols-5 …">`,
  **cinq enfants directs** : « Accueil » (`/dashboard`), « Stock », « Commandes », « À compta » (avec
  `CountBadge`), bouton « Plus ». (Question 6 du § 5 : « Vendre » à la place de « Commandes » si Aramis le
  choisit.) Libellés `text-xs`, `aria-current="page"`, aucun `overflow-x`.
- [ ] `FeuillePlus` : `Sheet side="bas" title="Plus"` avec « Mise en vente » et « Studio » (mention « sur
  ordinateur »), « Calendrier », « Statistiques », « Réglages », « Mon compte », liens légaux, « Se déconnecter ».
- [ ] `TopBar` : `<header className="sticky top-0 z-sticky h-[var(--topbar-h)] bg-bg/90 backdrop-blur border-b
  border-line …">`, titre en `<h1 className="text-lg font-bold">` pour les routes connues (« Tableau de bord »,
  « Réglages » au lieu de « Dashboard », « Prompts » ; ajouter `'/demarrage': 'Démarrage'`, `'/studio/bilan':
  'Studio — Bilan'`) ; route inconnue : titre en `<p>` (la 404 porte son propre `h1`). Sous-titre gardé en
  `text-xs text-ink-3`, masqué sous `md`. Cloche, thème, avatar en `h-11 w-11 md:h-10 md:w-10`.
- [ ] `NotificationBell` : `Popover` ; panneau tenu dans l'écran (CA-01) ; liste `max-h-[calc(100dvh-10rem)]
  overflow-y-auto overscroll-contain` ; sévérités par classes (`alert` → `bg-st-compta-soft text-st-compta-ink`,
  `notice` → `bg-warn-soft text-warn`, `info` → `bg-accent-soft text-accent-text`), plus aucun style en ligne ;
  badge `CountBadge`. Textes inchangés.
- [ ] `AccountMenu` : `Menu` ; déclencheur nommé `Mon compte (<prénom>)` inchangé ; entrées « Mon compte », liens
  légaux si le menu est replié, « Se déconnecter » (`tone="danger"`).
- [ ] `ChatBot` : bulle `fixed z-fab right-4 md:right-6 bottom-[calc(var(--dock-h)+env(safe-area-inset-bottom)+0.75rem+var(--fab-offset,0px))]
  md:bottom-[calc(1.5rem+var(--fab-offset,0px))]` ; panneau `z-modal`, `h-dvh` ; couleurs par tokens. Aucun
  changement de comportement du chat (CA-25, CA-28 : vague écrans).
- [ ] `app/studio/layout.tsx` : wrapper `flex flex-1 flex-col` (plus de `min-h-screen`) ; bandeau
  `role="note"` gardé avec son texte ; sous-navigation sortie du bandeau : `TabsLiens label="Studio"` avec
  « Coloris » (`/studio`), « Bilan » (`/studio/bilan`), « Réglages » (`/parametres?onglet=studio`) ;
  `export const metadata = { title: "Studio" }`.
- [ ] Retirer les marqueurs de dette de tous les fichiers possédés ; vérifier.

**Critères d'acceptation.** Sondes **strictes** vertes : M1, X4 (adaptée en LS), X9 ; M2 « corrigé » sur
`/a-comptabiliser` (compte neuf) et `/studio` (la 404 relève de L2b) ; M3 sur `/mise-en-vente` : `sansJeton` et
`memeZ` vides (le lien MENTIONS sera rendu atteignable par M3) ; tests `[L2a]` verts ; G4 sans défilement vertical
parasite sur `dashboard`, `a-comptabiliser`, `demarrage`, `studio`, `studio.bilan` ; axe `target-size` nul sur les
routes du cadre ; états `etat\.shell\.` verts.

**Vérification.** `<D>` = 10, `<serie>` = `apres-l2a`, `<ids>` = `M1|X4|X9` en strict, puis `M2|M3` en mode
normal lus par `resume.ts --detail`, sondes globales `<routes>` =
`dashboard|a-comptabiliser|demarrage|studio|studio\.bilan`, `<groupes>` = `shell`,
`fondations.spec.ts -g "\[L2a\]"`.

**Couvre.** Audit § 2.6, § 2.7, § 2.8, § 2.9 (h1, barre du haut, évitement, cibles), § 2.10, § 2.11 (bulle),
§ 2.17 (sous-navigation Studio) : CA-01 (**bloquant**), CA-04, CA-05, CA-06, CA-07, CA-08, CA-13 (badges), CA-27,
CA-29 (h1), CA-31, CA-42, CA-43, CA-44, CA-45, CA-46, CA-47, CA-48, CA-49, CA-53, PI-1, PI-4, QU-15, QU-16,
CO-35 (h1), CO-39, SU-36, SU-37 (en partie), SU-57, ST-30, ST-31, CO-38, QU-18 (bulle), cause racine de CA-02 et
QU-01 (plus de `transform` sur `<main>`) ; PRD § 1 : M1, M2.

---

### Lot L2b — Données, toasts, états de page, métadonnées

**Objectif.** Les erreurs se voient, les toasts suivent le thème et ne cachent rien, chaque segment a ses pages
de chargement et d'erreur, chaque onglet son titre.

**Fichiers possédés.** Modifier : `app/layout.tsx`, `app/providers.tsx`, `lib/hooks.ts`, `components/Loader.tsx`,
`app/not-found.tsx`. Créer : `components/ui/toaster.tsx`, `lib/toast.ts`, `lib/callbackUrl.ts`,
`lib/callbackUrl.test.ts`, `app/error.tsx`, `app/global-error.tsx`, `app/studio/error.tsx` ; `loading.tsx` dans
`app/dashboard`, `app/stock`, `app/commandes`, `app/a-comptabiliser`, `app/mise-en-vente`, `app/calendrier`,
`app/statistiques`, `app/studio`, `app/studio/[cle]`, `app/studio/bilan`, `app/parametres`, `app/compte`,
`app/demarrage` ; `layout.tsx` (métadonnées seules) dans `app/dashboard`, `app/stock`, `app/mise-en-vente`,
`app/a-comptabiliser`, `app/calendrier`, `app/commandes`, `app/statistiques`, `app/parametres`, `app/compte`,
`app/demarrage`, `app/login`, `app/signup`, `app/reset-password` ; `e2e/toasts.spec.ts` (LS est terminé).

**Dépendances.** L1, LS. Parallèle avec L2a (`E2E_DECALAGE=20`).

**Interfaces produites.**
- `lib/toast.ts` : `toastSucces(message: string, options?: { id?: string }): void` (4 s) ; `toastErreur(message:
  string, options?: { id?: string }): void` (`duration: Infinity`) ; `toastAnnulable(message: string, options: {
  onAnnuler: () => void; duree?: number /* 5000 */ }): void` (bouton « Annuler »).
- `AppToaster()` : `<Toaster theme={thème lu sur data-theme par MutationObserver} position="bottom-right"
  closeButton offset={{ bottom: "calc(6rem + var(--fab-offset, 0px))", right: 24 }} mobileOffset={{ bottom:
  "calc(var(--dock-h) + env(safe-area-inset-bottom) + 5rem + var(--fab-offset, 0px))" }} style={{ zIndex:
  "var(--z-toast)" }} toastOptions={{ classNames: { toast: "bg-surface text-ink border border-line shadow-over
  rounded-md font-sans text-sm pointer-events-auto" } }} />`.
- `lib/callbackUrl.ts` : `callbackUrlSur(brut: string | null | undefined, origine: string): string` → chemin
  relatif de même origine, sinon `"/dashboard"`.

**Étapes.**
- [ ] `lib/callbackUrl.test.ts` : `/stock?x=1` → `/stock?x=1` ; `https://autre-site/x` → `/dashboard` ;
  `//autre-site` → `/dashboard` ; `null` → `/dashboard` ; `https://<origine>/stock` → `/stock`. Échec, puis
  implémenter, vert.
- [ ] `app/layout.tsx` : `<Providers><AppToaster /><AppShell>{children}</AppShell></Providers>` (le Toaster
  **avant** le cadre : X15) ; `metadata.title = { template: "%s — MyFlip", default: "MyFlip" }` ; repli de
  `metadataBase` = `process.env.VERCEL_PROJECT_PRODUCTION_URL`, sinon `myflip-app.vercel.app` (plus
  `compta-polos`).
- [ ] `app/providers.tsx` : `QueryClient` avec `queries.retry: (n, e) => !estStatut(e, 401, 403, 404) && n < 1`,
  `retryDelay: 800`, `MutationCache({ onError })` qui appelle `toastErreur` avec le message du serveur et
  `meta.objet` (« Modification de LAC9 non enregistrée : … »), sauf si `mutation.meta?.erreurLocale === true`.
- [ ] `lib/hooks.ts` : `jsonFetch` sur 401 → `toastErreur("Session expirée. Reconnecte-toi pour reprendre ici.",
  { id: "session" })`, puis une seule redirection vers `/login?callbackUrl=<chemin courant encodé>` (garde-fou
  contre la double redirection), erreur levée sans nouvelle tentative ; `res.ok` lu avant `res.json()` (déjà le
  cas : ne pas régresser). Poser `meta.erreurLocale: true` sur chaque hook de mutation dont **tous** les appelants
  affichent déjà l'erreur (relevé par `grep -n "\.mutate(" app components` et lecture de chaque `onError` ou
  affichage `isError` ; lister la table hook → appelants dans le compte rendu). `placeholderData:
  keepPreviousData` sur `useDashboard`, `useStats`, `useCalendar`. Aucune URL, méthode ni corps de requête ne
  change.
- [ ] `components/Loader.tsx` : props inchangées ; `role="status" aria-live="polite"` ; svg `aria-hidden` ; tuile
  `bg-accent rounded-lg`, tracé `stroke-accent-ink`, rail `stroke-accent-ink/30`, points `bg-pos` ; libellé en
  `font-semibold text-sm` (`size="sm"`) ou `text-base` (`size="md"`) ; plus aucun style de police, de couleur, de
  rayon ni de taille de texte en ligne, plus de `filter: drop-shadow(rgba…)` (lueur : identité) ; le libellé reste
  le **premier nœud texte** de son `div` (contrat F1). Les deux animations TRACE (`atlas-draw`, `atlas-dots`,
  keyframes de `globals.css`, identité reportée) restent en `style` : remplacer le marqueur par
  `// design-tokens-dette: R12 → LZ` (L2b ne possède ni `globals.css` ni `tailwind.config.ts`).
- [ ] `app/not-found.tsx` : `export const metadata = { title: "Page introuvable" }` ; contenu centré dans le flux
  (pas de `min-h-screen`) : `h1` « Page introuvable », texte « Cette page n'existe pas. », lien `Button asChild`
  « Aller au tableau de bord ».
- [ ] `app/error.tsx` (client) : `ErrorState` titre « Cette page n'a pas pu s'afficher », texte « Réessaie ; si
  ça recommence, recharge la page. », boutons « Réessayer » (`reset()`) et « Aller au tableau de bord »,
  `error.digest` en petit. `app/global-error.tsx` : même contenu dans son propre `<html lang="fr"><body>`, importe
  `./tokens.css` puis `./globals.css`. `app/studio/error.tsx` : « Le Studio n'a pas pu se charger. » +
  « Réessayer ».
- [ ] Créer `e2e/toasts.spec.ts` (point de vigilance 1) : choisir, dans la table hook → appelants, une mutation
  déclenchable depuis une modale ouverte et dont l'erreur passe par le toast global ; simuler sa réponse en 500
  par `page.route` (jamais d'écriture réelle : `bloquerEcritures` pour le reste) ; vérifier que la croix du toast
  est cliquable et que la modale reste ouverte. S'il n'en existe aucune, le dire dans le compte rendu et le
  vérifier sur une capture.
- [ ] Chaque `loading.tsx` : `export default function Loading() { return <Frame><SquelettePage /></Frame> }`.
- [ ] Chaque `layout.tsx` de segment : `export const metadata = { title: "<titre>" }` et `export default
  function Layout({ children }) { return children }`. Titres : « Tableau de bord », « Stock », « Mise en vente »,
  « À comptabiliser », « Calendrier », « Commandes », « Statistiques », « Réglages », « Mon compte »,
  « Démarrage », « Connexion », « Créer un compte », « Nouveau mot de passe ».
- [ ] Vérifier.

**Critères d'acceptation.** Sondes **strictes** vertes : F1, MO3, X15 ; M2 sur la 404 connectée (lire
`resume.ts --detail M2`) ; état `etat\.shell\.session-expired` vert (un seul toast) ; titres
d'onglet vérifiés sur trois routes (`document.title` : « (N) Stock — MyFlip » avec le compteur) ;
`e2e/toasts.spec.ts` vert ; `lib/callbackUrl.test.ts` vert ; aucune requête réseau nouvelle ni modifiée (`e2e/rapports/apres-l2b/mocks.jsonl`
comparé à `avant`).

**Vérification.** `<D>` = 20, `<serie>` = `apres-l2b`, `<ids>` = `F1|MO3|X15|M2` (M2 en mode normal),
`<groupes>` = `shell|dashboard`, sondes globales `<routes>` = `404\.connecte|404\.studio-cle-inconnue`,
`E2E_DECALAGE=20 CAPTURES_SERIE=apres-l2b npx playwright test e2e/toasts.spec.ts`.

**Couvre.** Audit § 2.20, § 2.21 (pages et composants), § 2.22, § 2.9 (titres d'onglet, `metadataBase`) : CA-14,
CA-15, CO-4, CA-37, QU-20, CA-16, SU-22, CA-50, PI-5, PI-19 (en partie), CA-17, CA-38, PI-18 (données), ST-4,
CA-29, CO-35, CO-36, CA-65 (SUPPOSÉ), CA-34 (helper) ; PRD § 1 : F1, MO3.

---

### Lot L3 — Fenêtre de vente unique et composants métier partagés

**Objectif.** Une seule fenêtre de vente pour le Stock et À comptabiliser, montée sur `Dialog` ; statuts, canaux,
cellule modifiable et célébration branchés sur les tokens.

**Fichiers possédés.** Créer : `components/metier/FenetreVente.tsx`, `lib/vente.ts`, `lib/vente.test.ts`,
`lib/statutColors.test.ts`. Modifier : `lib/statutColors.ts`, `lib/canalColors.ts`, `lib/celebrate.tsx`,
`components/StatutPill.tsx`, `components/StatutBadge.tsx`, `components/CanalBadge.tsx`,
`components/EditableCell.tsx` ; dans `app/stock/page.tsx` **seulement** l'import de `SellModal`, la fonction
`confirmSell` et le bloc `<SellModal …/>` ; dans `app/a-comptabiliser/page.tsx` **seulement** l'import de
`SellDialog`, la fonction `confirm` et le bloc `<SellDialog …/>`. Supprimer : `components/SellModal.tsx`,
`components/SellDialog.tsx`.

**Dépendances.** L2a, L2b. Seul en vague 4 (`E2E_DECALAGE=30`).

**Interfaces produites.**
- `lib/vente.ts` : `validerPrix(saisie: string): { ok: true; prix: number } | { ok: false; message: "Indique un
  prix de vente supérieur à 0 €" }` ; `compteVisible(canal: string): boolean` (Vinted, Vinted Go, Vestiaire
  Collective) ; `valeursInitiales(article: ArticleVendable, contexte: ContexteVente, aujourdhui: string): {
  prix: string; date: string; canal: string; compte: CompteVente | null }` (date = `article.dateVente` si connue,
  sinon `aujourdhui` ; compte = `article.compteVente`, sinon `COMPTE_PAR_DEFAUT` en contexte « comptabiliser »,
  sinon `null`).
- `type ArticleVendable = Pick<ArticleDTO, "id" | "sku" | "prixVente" | "dateVente" | "canal" | "compteVente">` ;
  `type ContexteVente = "stock" | "comptabiliser"`.
- `FenetreVente({ article, contexte, onClose, onVendu? }: { article: ArticleVendable | null; contexte:
  ContexteVente; onClose: () => void; onVendu?: (article: ArticleDTO) => void })` : `Dialog as="form"` ouvert si
  `article`. Titre « Enregistrer la vente de <SKU> » (stock) ou « Comptabiliser la vente de <SKU> »
  (comptabiliser). Champs dans l'ordre, chacun dans `Field` : « Prix de vente (€) » (`Input type="number"
  inputMode="decimal" step="0.01" min="0.01"`, focus initial), « Date de vente » (`type="date"`, question 8),
  « Canal » (`Select`, `CANAUX`), « Compte de vente » (`Select`, `COMPTES_VENTE`, affiché si
  `compteVisible(canal)`). Pied : « Annuler » (`secondary`), « Enregistrer la vente » (`primary`, `pendingLabel`
  « Enregistrement… »). Mutation **propre à la fenêtre**, `reset()` à l'ouverture (ST-26) : contexte « stock » →
  `useUpdateArticle()` avec `patch: { statut: "Vendu", prixVente, dateVente: new Date(date).toISOString(), canal,
  …(compte ? { compteVente: compte } : {}) }` (même `PATCH`, champ `compteVente` déjà accepté) ; contexte
  « comptabiliser » → `useComptabiliser()` avec `{ id, prixVente, dateVente, canal, compteVente }` comme
  aujourd'hui. Prix invalide : message sous le champ, `aria-invalid`, focus sur le champ, aucune requête. Erreur
  serveur : `<p role="alert">`. Succès : `celebrateSale(prix, margeNette)`, `onVendu`, `onClose`. `dirty` dès
  qu'un champ change ; `pending` pendant l'envoi.
- `lib/statutColors.ts` : `type CleStatut = "brouillon" | "stock" | "lavage" | "repasse" | "photos" | "vente" |
  "livraison" | "compta" | "vendu" | "perdu"` ; `cleStatut(statut: string): CleStatut` ; `styleStatut(statut:
  string): { cle: CleStatut; pastille: string; texte: string; repere: string; trait: string; remplissage: string }`
  avec des classes **écrites en entier** (`"bg-st-vente-soft text-st-vente-ink"`, `"text-st-vente-ink"`,
  `"bg-st-vente"`, `"border-st-vente"`, `"fill-st-vente"`). Compatibilité jusqu'à LZ (`@deprecated`) :
  `statutColor(s)` → `{ color: "rgb(var(--st-<clé>))", bg: "rgb(var(--st-<clé>-soft))", ink:
  "rgb(var(--st-<clé>-ink))" }`, `statutMarker(s)` → `"rgb(var(--st-<clé>))"`, `STATUT_COLORS` idem. Plus aucun
  hex.
- `lib/canalColors.ts` : `cleCanal(canal: string)`, `styleCanal(canal: string): { repere: string }`
  (`"bg-ch-vinted"`…) ; compatibilité `canalColor(c)` → `{ bg: "rgb(var(--ch-<clé>))", text: "rgb(var(--ink))" }`.
  `CANAUX` inchangé.

**Étapes.**
- [ ] `lib/vente.test.ts` : `validerPrix("")`, `("0")`, `("-3")` → `ok: false` avec le message exact ;
  `("18.5")` → `18.5` ; `compteVisible("Leboncoin")` → `false` ; `valeursInitiales` avec `dateVente:
  "2026-10-03T…"` → `date: "2026-10-03"`, sans → `aujourdhui`, contexte « comptabiliser » sans compte →
  `"VINTED_PRO"`, contexte « stock » sans compte → `null`. `lib/statutColors.test.ts` : les dix statuts donnent
  leur clé, un statut inconnu → `brouillon`, chaque chaîne de classes contient la clé. Échec, implémenter, vert.
- [ ] `FenetreVente` ; brancher les deux appelants (`<FenetreVente article={sellTarget} contexte="stock"
  onClose={() => setSellTarget(null)} />` ; `<FenetreVente article={target} contexte="comptabiliser" onClose={()
  => setTarget(null)} />`), supprimer `confirmSell`, `confirm` et les deux anciens composants.
- [ ] `lib/celebrate.tsx` : pas de confettis si `margeNette < 0` ni sous `prefers-reduced-motion` ; le toast
  affiche la marge par `signedEur` ; couleurs des confettis lues en `rgb(var(--accent))`, `rgb(var(--pos))`,
  `rgb(var(--warn))`, `rgb(var(--st-photos))`, `rgb(var(--st-vente))`, `rgb(var(--st-lavage))`.
- [ ] `StatutPill` : `<select>` natif gardé (aria-label « Statut de <SKU> » inchangé), classes `styleStatut`,
  options sans style en ligne, focus `ring-2 ring-focus ring-offset-2`, taille `md` en `h-11 text-md`.
  `StatutBadge` : `styleStatut().pastille`. `CanalBadge` : carré `size-2.5 rounded-xs` en `styleCanal().repere`
  + nom en `text-ink text-xs`.
- [ ] `EditableCell` : nouvelles props **optionnelles** `champ?: string` et `sku?: string` ; la valeur devient
  `<button type="button" aria-label={champ && sku ? "Modifier " + champ + " de " + sku + " : " + affichage : "Modifier la
  valeur"}>` ; Entrée ou F2 ouvrent l'édition, Échap annule, Tab enregistre puis laisse le focus suivre, double-clic
  gardé.
- [ ] Retirer les marqueurs de dette des fichiers possédés ; vérifier.

**Critères d'acceptation.** Sonde **stricte** X1 verte (dialogue à `haut = 0`, `hauteur = innerHeight`, barre du
haut couverte, visible avec 30 lignes) ; MO1 (fenêtre « Valider ») verte ; `[L3] une seule fenêtre de vente` vert ;
états `etat\.stock\.sell-modal` et `etat\.compta\.sell-dialog` verts ; requêtes envoyées identiques à `avant`
(méthode, URL, champs ; `compteVente` seulement si un compte est choisi) ; axe sans violation dans la fenêtre,
clair et sombre ; navigation au clavier : focus sur le prix, Tab reste dans la fenêtre, Échap rend le focus au
déclencheur.

**Vérification.** `<D>` = 30, `<serie>` = `apres-l3`, `<ids>` = `X1|MO1`, `<groupes>` = `stock|compta`,
`<routes>` = `stock|a-comptabiliser`, `fondations.spec.ts -g "\[L3\]"`.

**Couvre.** Audit § 2.24 A, § 2.19, § 2.18 (cellule modifiable) : CA-02 et QU-01 (**bloquant**, côté fenêtre),
ST-28, QU-48, QU-09, CA-54, ST-27, QU-50, ST-8, ST-26, CA-23 et CA-24 (champs de vente), QU-59, QU-51 (en partie),
QU-49, ST-49, ST-9, ST-11, ST-13, ST-52, QU-07, ST-5, CA-67 (part SellDialog), PI-8 (tokens).

---

### Lots M — Migration par écran (règles communes)

**Ce que fait un lot M**, dans les seuls fichiers qu'il possède :
1. retirer **tous** ses marqueurs de dette en supprimant les violations (§ 2.7) ;
2. remplacer les contrôles faits main par les primitives : boutons → `Button`/`IconButton` ; champs → `Field` +
   `Input`/`Select`/`Textarea` ; cases → `Checkbox` ; choix → `RadioGroup`/`Segmented` ; modales maison et
   visionneuses → `Dialog`/`Sheet` ; menus → `Menu` ; listes flottantes → `Popover` ou `Select` natif ; onglets →
   `Tabs` ; tableaux → `Table` ; barres fixes → `BarreActions` ; `Module`/`CardTitle` → `Panel` ou gardés ;
3. remplacer chaque `window.confirm` par `AlertDialog` (textes donnés par lot) ;
4. remplacer un `<main>` propre à la page par `Frame` ;
5. passer les styles en ligne de couleur, taille, rayon, ombre, z-index et animation en classes de tokens ; les
   dimensions calculées (largeur en pourcentage calculée, par exemple) restent en ligne ;
6. donner un `z-*` à tout élément `fixed` ou `sticky`.

**Ce qu'un lot M ne fait pas** : aucun texte visible modifié (sauf ceux fixés ici), aucune nouvelle fonction ni
nouvel état d'écran (squelettes, états vides ou d'erreur **nouveaux** : vague écrans), aucun changement d'appel
d'API, de hook de données ou de calcul, aucun correctif d'écran du § 3 de l'audit autre que ceux nommés.

**Vérification commune.** Gabarit § 3.3 avec les identifiants du lot ; G1, G2, G3, G5, G6, G7 **stricts** sur ses
routes ; G4 strict sauf les exceptions du § 4 ; axe `A11Y_STRICT=1` sur ses routes ; planche avant/après relue.

### Lot M1 — Stock (avec ST-1, ST-2, ST-3)

**Fichiers.** `app/stock/**` (sauf `loading.tsx` et `layout.tsx` créés par L2b) ; créer
`app/stock/_selection.ts`, `app/stock/_selection.test.ts`, `app/stock/_confirmations.ts`,
`app/stock/_confirmations.test.ts`. `E2E_DECALAGE=10`, série `apres-m1`. Dépend de L3.

**Spécifique.**
- [ ] **ST-1** (bloquant) : `messageQuitterVendu(article: ArticleDTO, nouveau: string): { titre: string; corps:
  string } | null` dans `_confirmations.ts` → non nul si `article.statut === "Vendu" && nouveau !== "Vendu"` ;
  titre « Annuler la vente de LAC9 ? », corps « Le prix de vente (18,00 €), la date de vente et la marge seront
  effacés. Cette action est définitive. » (prix par `eur`). Dans `handleStatutChange` : ouvrir l'`AlertDialog`
  (« Annuler la vente », `danger` ; « Garder vendu ») au lieu d'écrire ; écrire seulement sur confirmation. Le
  `<select>` reste natif et contrôlé : sur « Garder vendu », il affiche toujours « Vendu ».
- [ ] **ST-2** (bloquant, question 7, défaut retenu : lignes visibles + compteur) : `cibleSelection(selection:
  ReadonlySet<string>, visibles: readonly ArticleDTO[]): { ids: string[]; masques: number; vendus: number }` dans
  `_selection.ts` ; « Appliquer » n'envoie que `ids` ; compteur « 3 sélectionnés, dont 2 masqués par les
  filtres » (`pluriel`) ; si `vendus > 0`, `AlertDialog` « Changer le statut de 12 articles ? » / « 4 articles
  vendus perdront leur prix, leur date et leur marge de vente. » / « Changer le statut » / « Annuler ». Le corps de
  la requête groupée garde sa forme actuelle.
- [ ] **ST-3** (bloquant) : barre groupée en `BarreActions ton="bar"` ; sélecteur `Select` (`bg-surface text-ink
  border-line-strong`) ; « Appliquer » en `Button variant="bar"` ; libellés et croix en `text-bar-ink`.
- [ ] Virtualisation (contrainte PRD § 10) : une constante `HAUTEUR_LIGNE_PX` (hauteur réelle mesurée après le
  codemod, en ordinateur) sert à la fois à `style={{ height }}` du `<tr>` et à `estimateSize` ; les cartes mobiles
  gardent `measureElement` avec une estimation égale à la hauteur réelle mesurée d'une carte. Aucune autre
  modification de hauteur.
- [ ] Table : `Table`/`TH` (`scope`, `aria-sort`, bouton de tri : ST-7), colonne d'actions `ColonneActions`
  (ST-14), `table-fixed` + `<colgroup>` (ST-47) **seulement si** la hauteur de ligne ne bouge pas (sinon le
  signaler et l'écarter) ; `EditableCell` reçoit `champ` et `sku`.
- [ ] `handleDelete` : `AlertDialog` « Supprimer ADI1 ? » / « L'article et ses données de vente seront supprimés
  définitivement. » / « Supprimer l'article » / « Annuler » (ST-23 ; le retrait optimiste reste à la vague écrans).
- [ ] Modale de détail → `Dialog` (titre = SKU, inchangé) ; `<main>` → `Frame` ; `stroke="#fff"` → `currentColor`.

**Acceptation.** `npx vitest run app/stock` vert ; MO2 « corrigé » sur `/stock (une ligne cochée)` et MO4 strict ;
`[M1]` verts ;
`etat\.stock\.` verts (dont `confirmation destructive : stock`) ; routes `stock|stock\.statut-brouillon|stock\.marque-nike`
vertes en G et axe. **Couvre** ST-1, ST-2, ST-3 (bloquants), ST-5, ST-6, ST-7, ST-14, ST-16, ST-23 (dialogue),
ST-29, ST-30, ST-31, ST-32, ST-43, CA-04 et QU-17 (Stock) ; PRD § 1 : MO2 (Stock).

### Lot M2 — À comptabiliser (avec CA-02/QU-01)

**Fichiers.** `app/a-comptabiliser/**` (sauf fichiers de L2b). `E2E_DECALAGE=20`, série `apres-m2`. Dépend de L3.

**Spécifique.**
- [ ] Modale de suppression maison → `AlertDialog` « Supprimer CHD3 ? » / « L'article et sa vente en attente
  seront supprimés définitivement. » / « Supprimer CHD3 » (QU-57, QU-03, CA-21) ; `pending` pendant l'envoi.
- [ ] Vérifier qu'aucun `<form>` ne précède la fenêtre de vente dans le DOM (contrat X1).
- [ ] Boutons de ligne (« Valider », « Remettre en stock », « Supprimer ») en primitives, libellés inchangés.

**Acceptation.** Sondes strictes X1, M2 ; `etat\.compta\.` verts ; à 390 px, « Vendre » et « Supprimer » ouvrent
une feuille entière au-dessus du dock (capture `mobile-*`). **Couvre** CA-02 et QU-01 (**bloquant**, fin), QU-03,
CA-21, CA-22, QU-60.

### Lot M3 — Mise en vente (avec QU-61)

**Fichiers.** `app/mise-en-vente/**` (`page.tsx`, `_ui.tsx`, `_barreAction.ts`, `_barreAction.test.ts`,
`_components/*.tsx` ; les autres modules `_*.ts` et leurs tests en lecture seule). `E2E_DECALAGE=30`, série
`apres-m3`. Dépend de L3.

**Spécifique.**
- [ ] **QU-61** (bloquant) : `DescripteurBarre` gagne `variante: "primary" | "secondary"` et `confirmation: {
  titre: string; confirmer: string } | null`. Étape 4 : `label` « Nouvelle session », `variante: "secondary"`,
  `confirmation` = `{ titre: "Abandonner N annonce(s) non enregistrée(s) ?", confirmer: "Abandonner et recommencer" }`
  (par `pluriel`) s'il reste des annonces non enregistrées, sinon `null`. Pas de nouvelle action principale
  (parcours P37 : vague suivante). Tests ajoutés à `_barreAction.test.ts` : 2 annonces → titre « Abandonner
  2 annonces non enregistrées ? » et `variante` « secondary » ; 1 → « Abandonner 1 annonce non enregistrée ? » ;
  0 → `confirmation: null`. Dans `page.tsx`, l'intention « nouvelle-session » ouvre l'`AlertDialog` si
  `confirmation`, sinon réinitialise comme aujourd'hui.
- [ ] Barre collante → `BarreActions ton="surface" aria-label="Actions de l'étape"` (opaque : O2 ; au-dessus du
  dock : MO2 ; à droite du menu : X3 ; bulle au-dessus : X2).
- [ ] Visionneuse de photo → `Dialog veil="fort"` (O3 : voile ≥ 0,6), fermeture « Fermer » et Échap gardées.
- [ ] Bouton « Supprimer la photo N » : `IconButton` opaque `bg-surface text-ink shadow-pop` (O3).
- [ ] Carte photos collante (`FicheArticle.tsx`) : `lg:top-[calc(var(--topbar-h)+1.25rem)] lg:z-base` (X5, G5).
- [ ] `DialogueDelaiVinted` → `Dialog` (titre inchangé) ; bouton Vinted d'`ExportAnnonces` → `Button primary` ;
  pastille « multicolore » de `FicheArticle.tsx:660` : exception documentée (`design-tokens-exception: pastille
  multicolore d'un nuancier Vinted, donnée`).
- [ ] `<main>` → `Frame`.

**Acceptation.** `npx vitest run app/mise-en-vente` vert ; sondes strictes O3, X2, X3, X5 ; « corrigé » (lecture
de `resume.ts`) pour O2 sur la barre, M3 sur `/mise-en-vente` (lien MENTIONS compris) et MO2 sur
`/mise-en-vente` ; `[M3]` vert ; `etat\.mev\.` verts. **Couvre** QU-61
(**bloquant**), QU-04, QU-08, QU-17, QU-18, QU-19, QU-68, QU-69, QU-70 (champs), QU-91, QU-03 (visionneuse) ;
PRD § 1 : O2 (barre), O3, M3, MO2.

### Lot M4 — Commandes

**Fichiers.** `app/commandes/**`, `components/NewCommandeModal.tsx`. `E2E_DECALAGE=10`, série `apres-m4`.

**Spécifique.** Menu ⋯ → `Menu` (déclencheur `aria-label="Actions"` inchangé, entrées « Voir les articles »,
« Supprimer » en `tone="danger"`), plus de voile maison (QU-30, M3) ; suppression → `AlertDialog` « Supprimer la
commande <fournisseur> du <date> ? » / « Ses N articles seront supprimés définitivement, y compris ceux déjà
vendus. » / « Supprimer la commande et ses N articles » si le nombre d'articles est déjà dans les données de la
ligne, sinon sans le nombre (QU-29) ; `fontSize` en ligne (`:104-113`, `:223-436`) → échelle ; choix « Au lot /
Pièce par pièce » → `RadioGroup` (QU-43, QU-10) ; liste des marques de `NewCommandeModal` **inchangée**
(question 9, en attente).

**Acceptation.** MO3 stricte ; « corrigé » (lecture de `resume.ts`) pour M3 sur `/commandes` (menu ⋯ ouvert) et MO1
sur « Créer une commande » ; `etat\.commandes\.` verts.
**Couvre** QU-10, QU-11, QU-12, QU-13 (tailles en ligne), QU-29 (dialogue), QU-30 (mécanique), QU-43.

### Lot M5 — Tableau de bord

**Fichiers.** `app/dashboard/**`, `components/DemarrageCard.tsx`. `E2E_DECALAGE=20`, série `apres-m5`.

**Spécifique.** Sélecteur de période → `Segmented label="Période" mode="boutons"` (la suite cherche
`getByRole("button", { name: "30J" })` ; libellés **inchangés**, les mots viendront avec PI-25) ; libellé du Loader « Chargement du dashboard » inchangé (contrat F1) ; aucun calcul touché
(PI-10, PI-11, PI-51 : question 3, en attente).

**Acceptation.** Sonde stricte F1 ; `etat\.dashboard\.` verts ; G sur `dashboard`, `neuf\.dashboard`.
**Couvre** PI-3, PI-9 (barres en `chart-2`), PI-25 (mécanique), PI-54.

### Lot M6 — Statistiques

**Fichiers.** `app/statistiques/**`. `E2E_DECALAGE=30`, série `apres-m6`.

**Spécifique.** Liste « Périmètre d'analyse » maison (`:114-197`) → `ListeChoix` (déclencheur « Tout
l’historique » toujours un bouton, `role="listbox"` et `role="option"` gardés : contrat de
`etat.stats.scope-listbox`), `libelleId` vers le libellé « Périmètre d'analyse » ; voile maison et ses z-index
supprimés (PI-46, CA-48, PI-1) ; segments et légendes par `styleStatut().remplissage` / `styleCanal().repere` ;
textes inchangés (« PÉRIMÈTRE D’ANALYSE » reste une condition d'attente du catalogue).

**Acceptation.** `etat\.stats\.` verts ; navigation au clavier de la liste (↑ ↓, Entrée, Échap rend le focus) ;
G sur `statistiques`, `neuf\.statistiques`. **Couvre** PI-1, PI-46, PI-8 (repères), PI-9.

### Lot M7 — Calendrier (avec PI-36, à confirmer)

**Fichiers.** `app/calendrier/**`. `E2E_DECALAGE=10`, série `apres-m7`.

**Spécifique.** Une soixantaine de `style={{…}}` → classes ; jours avec ventes → `<button type="button"
data-jour="AAAA-MM-JJ" aria-label="<jour>, <N> ventes">` (contrat X6) ; détail du jour → `Dialog` titre « Détail du
jour », croix nommée (CA-22, PI-35) ; **PI-36** : le `Dialog` ne s'ouvre qu'à partir de 768 px (état
`jourOuvertOrdinateur` distinct de l'accordéon mobile) — inclus parce que migrer cette fenêtre vers un `Dialog`
modal sans ce garde-fou **aggraverait** le bloquant sur mobile (piège de focus et verrou de défilement par-dessus
l'accordéon) ; à confirmer par Aramis (question posée avec ce plan). `CountUp` respecte `useMouvementReduit` (PI-44) ; couronne et reflet en
une seule itération, sans survol sur les cases inertes (PI-45, § 2.23) ; voile et ombres en tokens (PI-7) ;
`<main>` → `Frame`. Aucun calcul touché (PI-17 : question 3, en attente).

**Acceptation.** Sonde stricte X6 (calendrier) ; `[M7]` vert ; `etat\.cal\.` verts ; G sur `calendrier`,
`neuf\.calendrier` (G4 vertical compris). **Couvre** PI-7, PI-35, PI-36 (**bloquant**,
sous réserve), PI-38, PI-39, PI-43, PI-44, PI-45 (part fondation), CA-22.

### Lot M8 — Studio (styles seulement)

**Fichiers.** `app/studio/**` sauf `layout.tsx` (L2a), `error.tsx` et les `loading.tsx` (L2b).
`E2E_DECALAGE=20`, série `apres-m8`.

**Spécifique.** Migration de styles et de primitives **sans toucher au parcours** : ordre des sections, planche,
raccourcis V/R, sélecteur de modèles, devis et seuil de 0,10 $ restent tels quels (vague Studio). Faux onglets de
`TableauCases.tsx:326-345` → `Tabs` (SU-25) ; confirmations en ligne `role="alertdialog"` gardées telles quelles
(texte et logique) mais habillées par tokens ; `SelecteurModeles.tsx` (code mort) migré mécaniquement, pas
supprimé. Ne jamais presser V, R, C ni flèches sans `page.route` sur `/api/studio/essais/**`.

**Acceptation.** Sondes S1 à S8, X0, X10, X11, X12 lancées **en mode normal** : même état qu'en série `avant`,
aucune « non mesurable » nouvelle ; `etat\.studio\.` verts ; G sur `studio|studio\.(fiche\.[a-z0-9-]+|bilan)` en
ordinateur. `npx vitest run lib/studio` vert (aucun module `lib/studio*` touché). **Couvre** SU-25, SU-31, SU-32,
SU-61, SU-53 (règle de tableau), SU-55 (part).

### Lot M9 — Réglages

**Fichiers.** `app/parametres/**`, `components/parametres/**`. `E2E_DECALAGE=30`, série `apres-m9`.

**Spécifique.** Onglets → Radix `Tabs` synchronisés avec `?onglet=` (valeur lue côté serveur par `searchParams` et
passée en prop initiale : SU-37 ; `role="tab"` et `aria-selected` gardés pour le catalogue) ; libellés
**inchangés** (question 5) ; un seul défilement (`max-h-[70vh] overflow-y-auto` imbriqué retiré, § 2.15) ;
`confirm` de suppression → `AlertDialog` « Supprimer le prompt « <nom> » ? » / « Supprimer le prompt » (espaces
ordinaires autour des guillemets et avant « ? », comme le message actuel : le test LS les attend) ;
`PromptsStudio` : `window.confirm` → `AlertDialog` « Supprimer « <nom> » ? » ; `MetaPrompt` et modales sur
`Dialog` (titres inchangés).

**Acceptation.** O1 stricte ; « corrigé » (lecture de `resume.ts`) pour X6 sur `/parametres` et MO1 sur « Nouveau
prompt » ; S7 en mode normal (attendu :
« corrigé » grâce à L2a) ; `etat\.params\.` verts dont `confirmation destructive : réglages`. **Couvre** SU-25,
SU-26, SU-27, SU-28, SU-33, SU-37 (onglet initial), SU-61, SU-42 (dialogue).

### Lot M10 — Mon compte et Démarrage

**Fichiers.** `app/compte/**`, `components/compte/**`, `app/demarrage/**`. `E2E_DECALAGE=10`, série
`apres-m10`.

**Spécifique.** `Integrations.tsx:348` `window.confirm` → `AlertDialog` « Déconnecter Trello ? » / « MyFlip ne
recevra plus les cartes de ton tableau et l'autorisation sera révoquée chez Trello. Tu pourras le reconnecter
ensuite. » / « Déconnecter Trello » (CO-49) ; champ de clé d'API : `name="openrouter-key"`,
`autoComplete="new-password"`, `data-1p-ignore`, `data-lpignore="true"` (CO-47) ; bouton « danger » sans double
couleur (CO-50) ; pastille d'étape de `/demarrage` (`bg-accent-ink/15`) gardée, elle fonctionne depuis L0.

**Acceptation.** Sonde X15 (stricte) ; `etat\.(compte|demarrage)\.` verts ; G sur `compte|demarrage` et `neuf\.`.
**Couvre** CO-10, CO-11, CO-12, CO-13, CO-14, CO-32, CO-45, CO-47, CO-49, CO-50.

### Lot M11 — Pages publiques

**Fichiers.** `app/login/**`, `app/signup/**`, `app/reset-password/**`, `app/legal/**`, `app/page.tsx`,
`components/landing/**` (sauf `layout.tsx` de L2b). `E2E_DECALAGE=20`, série `apres-m11`.

**Spécifique.** Champs → `Field` (libellés reliés : axe `label` sur `/login`) en gardant `type`, `autocomplete` et
« Se connecter » (contrat) ; libellé « Adresse e-mail » au lieu de « Email » (CA-47) ; `callbackUrl` passé par
`callbackUrlSur` (CA-34) ; `min-h-screen` → `min-h-dvh` sur les pages hors cadre ; `metadata` des pages légales
(« Mentions légales », « Conditions générales d'utilisation », « Politique de confidentialité ») ; en-tête de la
landing `z-sticky bg-bg/90` ; frise et animations de la landing : une itération ou `motion-safe:` (CO-41) ; titres
`text-[clamp(…)]` → `text-2xl md:text-3xl`. Aucun texte de la landing ne change (question 2).

**Acceptation.** « Corrigé » (lecture de `resume.ts`) pour O2 sur la landing et MO1 sur `/login`, `/signup`,
`/reset-password` ; `A11Y_STRICT=1` vert
sur les pages publiques ; `etat\.(login|signup|reset|landing)\.` verts ; `e2e/auth.setup.ts` passe. **Couvre**
CA-10, CA-12, CA-23, CA-24, CA-29 (titres), CA-34, CA-47 (connexion), CO-23, CO-41.

---

### Lot LZ — Clôture de la vague

**Fichiers possédés.** `lib/designTokens.test.ts`, `tailwind.config.ts`, `app/globals.css`,
`components/Loader.tsx` (animations), `components/Modal.tsx` (suppression), `lib/statutColors.ts` et
`lib/canalColors.ts` (exports dépréciés), `CLAUDE.md`, `docs/design-system.md` (en-tête seulement),
`e2e/README.md`.

**Étapes.**
- [ ] `grep -rn "design-tokens-dette" app components lib` : seuls `globals.css` et `Loader.tsx` doivent rester ;
  passer les animations TRACE du Loader en utilitaires nommés, supprimer le bloc `!important` et les keyframes
  inutilisées (`grep` de chaque nom), passer `DETTE_AUTORISEE` à `false`.
- [ ] Retirer `white` et `black` de `colors` ; test vert.
- [ ] Supprimer `components/Modal.tsx` et les exports `statutColor`, `statutMarker`, `STATUT_COLORS`,
  `canalColor`, `CANAL_COLORS` **si** plus aucun importeur (`grep`) ; sinon les laisser et le dire.
- [ ] `CLAUDE.md` : section Design system (tokens en canaux dans `app/tokens.css`, opacités permises, alias
  supprimés, échelles, garde-fou, palette provisoire), Typographie mobile (`text-xl` pour un titre de page, champs
  à 16 px par la primitive), Touch targets (`min-h-hit`), Composants clés (`components/ui/`, `components/cadre/`,
  `FenetreVente`, `Skeleton` existe, ligne `WelcomeModal` retirée : X14).
- [ ] `docs/design-system.md` : ajouter en tête « Valeurs en vigueur : `app/tokens.css` (palette Direction C
  provisoire, corrigée AA le 21/10/2026) ; la structure ci-dessous reste la référence. » Rien d'autre.
- [ ] Vérification globale (§ 4).

**Acceptation.** Celle du § 4.

---

## 4. Stratégie de vérification globale (lot LZ, sur le code final)

1. **Logique** : `npm run lint`, `npm run typecheck`, `npm test` verts ; les tests existants (Studio, calculs,
   prompts, catalogue, lancement, statistiques, vérification, Trello, mise en vente) passent **sans avoir été
   modifiés**, sauf `_barreAction.test.ts` (complété en M3). `git diff --stat` ne montre aucun fichier de
   `app/api/**`, `lib/calc.ts`, `lib/stock.ts`, `lib/commandes.ts`, `lib/studio*.ts`, `prisma/**`.
2. **Suite complète, série `apres`** : `CAPTURES_SERIE=apres npx playwright test` (4 projets).
3. **Sondes strictes** : `CAPTURES_SERIE=apres SONDES_STRICT=1 npx playwright test e2e/sondes-bugs.spec.ts
   --grep-invert " (S[1-8]|X0|X10|X11|X12) · "` vert, **à une exception près** : G4 en `mobile-*` sur
   `route.parametres.onglet-studio`, `route.studio.bilan` et `route.studio.fiche.*` (débordement horizontal du
   Studio à 390 px, SU-34 et SU-35 : vague écrans, question 11). Pour ces routes, `npx tsx e2e/sondes/resume.ts`
   doit montrer que **seule** G4 échoue, et par `debordH` seulement.
4. **Sondes Studio** (S1 à S8, X0, X10 à X12) en mode normal : mêmes états qu'en série `avant` (elles relèvent de
   la vague Studio), aucune « non mesurable ».
5. **Axe** : `CAPTURES_SERIE=apres A11Y_STRICT=1 npx playwright test e2e/a11y.spec.ts` vert (avant : 184 couples
   route × projet en `color-contrast`, 66 en `target-size`, 8 en `label`).
6. **Captures** : `npx tsx e2e/outils/planche-avant-apres.ts --apres apres`, relue route par route dans les quatre
   projets ; chaque différence est classée « voulue » (règle citée : échelle, contraste, rayon, cadre) ou
   « régression » (corrigée avant de conclure). Les bugs du PRD § 1 hors Studio ont chacun une capture « après »
   citée dans le compte rendu (fichier `sonde-<id>.png` de la série `apres`).
7. **Clavier** : `fondations.spec.ts` et X6 couvrent focus initial, piège, Échap et retour du focus pour une
   modale, la feuille « Plus », une confirmation et la fenêtre de vente.
8. **Aucune requête nouvelle** : `e2e/rapports/apres/mocks.jsonl` et `reseau-serveur.jsonl` ne contiennent aucune
   URL, méthode ou route absente de la série `avant` ; aucun appel à openrouter.ai (le globalTeardown échoue sinon).
9. **Contrôle visuel en direct, par Aramis** (les agents n'ont pas de session sur son `npm run dev`, cf. mémoire
   projet) : dix vérifications à lui proposer, en clair puis en sombre, sur ordinateur et sur iPhone : menu actif
   au premier affichage ; rail replié ; dock et « Plus » ; cloche sur iPhone ; une vente depuis le Stock et une
   depuis À comptabiliser ; quitter « Vendu » ; sélection groupée filtrée ; « Nouvelle session » avec une annonce
   non enregistrée ; toasts en sombre ; zoom texte du navigateur à 200 %.

---

## 5. Hors de cette vague, et questions

### 5.1 Hors vague

- **Correctifs propres aux écrans** (audit § 3), sauf les bloquants traités ici. Notamment : squelettes, états
  vides et d'erreur **nouveaux** par écran (ST-18, QU-22, QU-23, QU-58, CO-34, PI-20, PI-33), retrait optimiste
  (ST-23), textes et casse des écrans (PI-6, SU-55, CO-53, QU-51 hors fenêtre de vente, QU-30 nom du bouton),
  formats d'affichage appliqués aux écrans (PI-12, PI-13, PI-14, PI-15, PI-16, ST-22, ST-39), cloche (CA-30),
  assistant (CA-25, CA-28, CA-35), PI-21, SU-34, QU-71, QU-72, QU-62, ST-24, ST-25, SU-41, CO-30, CO-5, CO-6, CO-3.
- **Bloquants non traités** : SU-02 et SU-05 (parcours Studio ; leurs fondations `Menu` et `toastAnnulable` sont
  prêtes) ; PI-36 l'est en M7 sous réserve de la question 1.
- **Parcours** (audit § 4, P1 à P61) : réordonner, fusionner, retirer des clics.
- **Fonctions Studio du PRD** : catalogue vivant, sélecteur de modèles, budget par sac en euros, historique,
  comparaison, annulation des décisions, planche (S1 à S8, X0, X10 à X12) ; aucune migration Prisma dans cette
  vague.
- **Identité** (audit § 5) : palette définitive, teintes des statuts et des canaux (séparation Vestiaire /
  Leboncoin), polices, rayons définitifs, mouvement (courbes, signatures), Loader « TRACE », confettis, couronne
  et reflet du calendrier, capitales espacées, favicon et icônes. Les valeurs posées ici sont **provisoires**.
- Rail automatique entre 768 et 1 099 px, recherche `/` de la barre du haut, sélecteur de thème à trois positions.

### 5.2 Questions de l'audit (§ 7) et valeur retenue si Aramis ne répond pas

| N° | Question | Valeur par défaut | Effet dans cette vague |
|---|---|---|---|
| 1 | Où vit l'objectif mensuel ? | Mon compte, carte Identité, ancre `#objectif`, lien depuis le tableau de bord | aucun (vague écrans) |
| 2 | Landing : tutoiement, sans essai ni tarifs, « sur invitation » ? | oui aux trois | aucun texte changé (M11) |
| 3 | Correctifs qui touchent un calcul ou une API hors Studio ? | **EN ATTENTE, aucune valeur par défaut** | aucun calcul touché |
| 4 | Sélecteurs de modèle d'IA : Mon compte ou Réglages ? | Mon compte, lien depuis Réglages | aucun |
| 5 | Nom de l'onglet des prompts ? | « Prompts d'annonce » | libellé inchangé en M9 ; menu « Réglages » (§ 2.7) |
| 6 | « Vendre » du dock : comment choisir l'article ? | tant qu'il n'y a pas de réponse : « Commandes » à la place de « Vendre » | dock de L2a |
| 7 | Sélection groupée : vider ou lignes visibles ? | lignes visibles + compteur « masqués » | M1 (ST-2) |
| 8 | Dates : natif puis `jj/mm/aaaa` ? | oui | fenêtre de vente en `type="date"` |
| 9 | Préfixe SKU de Ralph Lauren : PRL ou RL ? | **EN ATTENTE, aucune valeur par défaut** | `NewCommandeModal` inchangé |
| 10 | Réglages du Studio : route ou bouton ? | garder `/parametres?onglet=studio`, onglet « Réglages » dans la sous-navigation | L2a |
| 11 | Studio sur mobile : message ou correction ? | les deux (vague Studio) | exception G4 du § 4 |
| 12 | Prénom modifiable dans Mon compte ? | oui (nouvelle petite route, vague écrans) | aucun |
