# Sondes chiffrées des bugs et base d'accessibilité

Étape 1 de la refonte : mesurer l'« avant » en chiffres, pour que l'« après » se prouve par la
même commande. Une sonde ne regarde pas une capture : elle **mesure** dans la page
(`getComputedStyle`, `getBoundingClientRect`, `scrollHeight`, DevTools, pixels d'une
capture, contraste WCAG calculé) et range des valeurs brutes plus un verdict.

| Quoi | Où |
|---|---|
| Sondes des 21 bugs du PRD § 1, des 15 relevés en plus de l'étude, et globales par route | `e2e/sondes-bugs.spec.ts` (définitions : `e2e/sondes/bugs-*.ts`, `globales.ts`) |
| Base d'accessibilité axe | `e2e/a11y.spec.ts` |
| Résultats | `e2e/rapports/<serie>/sondes.json` et `a11y.json` |
| Captures ciblées | `e2e/captures.nosync/<serie>/<projet>/sonde-<id>[-<suffixe>].png` |
| Résumé lisible | `npx tsx e2e/sondes/resume.ts [--detail F1]` (lecture seule) |

Source des bugs : `docs/refonte/etude-2026-10-20/bugs-sondes.json` (causes racines et sondes
imaginées), PRD `docs/prd/2026-10-20-refonte-design.md` (§ 1, 3, 11, 12).

## Lancer

```bash
E2E_DECALAGE=100 npx playwright test e2e/sondes-bugs.spec.ts e2e/a11y.spec.ts   # l'« avant » : ne fait jamais échouer sur un bug
SONDES_STRICT=1 npx playwright test e2e/sondes-bugs.spec.ts                      # la refonte doit le faire passer au vert
A11Y_STRICT=1   npx playwright test e2e/a11y.spec.ts                             # échoue sur toute violation serious ou critical
npx playwright test e2e/sondes-bugs.spec.ts --project=desktop-clair -g "S3 "     # une sonde (le titre commence par son id et une espace)
CAPTURES_SERIE=avant npx playwright test e2e/sondes-bugs.spec.ts e2e/a11y.spec.ts  # écrit dans e2e/rapports/avant/ (commité)
```

L'infrastructure (Postgres embarqué, faux OpenRouter / SacBase / Resend, `next dev` dédié,
gardes réseau, `E2E_DECALAGE`) est décrite dans `e2e/README.md`. Les sondes n'y changent rien.
Deux suites en même temps : `E2E_DECALAGE` différent (multiple de 10).

`sondes.json` et `a11y.json` sont **fusionnés**, pas réécrits : un lancement partiel ne remplace
que les entrées qu'il a mesurées (clé : id, projet, route, variante). Pour repartir de zéro,
effacer les deux fichiers avant de lancer. Écriture sous verrou (2 workers).

## Format des résultats

`sondes.json` est un tableau. Une entrée :

```jsonc
{
  "id": "O1", "titre": "Aucun voile derrière les modales",
  "projet": "desktop-sombre",          // desktop-clair | desktop-sombre | mobile-clair | mobile-sombre
  "route": "/parametres (modale « Nouveau prompt »)",
  "variante": null,                    // entrée du catalogue de routes (« route.stock », « route.neuf.stock »), sondes globales et X8
  "mesure": { "voile": "rgba(0, 0, 0, 0)", "alphaVoile": 0 },   // valeurs brutes
  "critere": "…",                      // ce qui doit être vrai une fois corrigé
  "etat": "bug présent",               // "bug présent" | "corrigé" | "non mesurable"
  "capture": "e2e/captures.nosync/courant/desktop-sombre/sonde-O1.png",
  "lancement": "…", "mesureLe": "…"
}
```

`etat` : **corrigé** = le critère est vrai ; **bug présent** = faux ; **non mesurable** = la
sonde n'a pas pu mesurer (état introuvable, plantage consigné dans `mesure.erreur`, police
web absente…). Un bug confirmé dans le code qui sort « corrigé » ou « non mesurable » est un
défaut de la sonde, pas une bonne nouvelle : à creuser.

`a11y.json` : une entrée par route du catalogue (`variante` : `route.<id>` ou
`route.neuf.<id>`, comme les captures) et par projet, avec `violations[]`
(`regle`, `impact`, `aide`, `noeuds`, `cibles` : 20 sélecteurs au plus), `parImpact` et
`noeudsParImpact` (minor, moderate, serious, critical), `totalRegles`, `totalNoeuds`, `graves`
(règles serious ou critical : ce que `A11Y_STRICT=1` fait échouer).

## Comptes et données

- **Pages publiques** : contexte sans session (sinon `/` redirige vers `/dashboard`).
- **`demo`** et **`neuf`** : comptes du seed (`e2e/compte-test.ts`), en lecture seule ici.
- **`sonde`** : compte à part, créé à la demande par `e2e/sondes/graines.ts` (une fois par
  lancement, sous verrou, dans une transaction), connecté par le vrai formulaire `/login`
  (`e2e/sondes/session.ts`). Il évite d'imposer aux comptes `demo` et `neuf` des configurations
  précises que les captures n'attendent pas. Contenu : 9 prompts d'angle actifs ; coloris
  `probe-noir` (15 photos, 2 essais à juger avec avis IA, 1 essai rejeté à image conservée,
  1 validé), `probe-14` (14 photos, 1 prise libre), `probe-sansverif` (1 essai à juger sans avis
  IA), `5039-white-volt` (coloris du faux SacBase : 15 photos, sacs cibles, bouton « Générer »
  actif) ; 30 articles « À comptabiliser » (SND1 à SND30) ; un article `TST1` « En stock ».

Garde-fous propres aux sondes (`e2e/sondes/test.ts`) :

- **Filet d'écriture** : toute requête POST, PUT, PATCH ou DELETE vers `/api/` (hors
  `/api/auth/`) qu'une sonde n'a pas simulée elle-même par `page.route` est avortée et journalisée
  dans `e2e/rapports/<serie>/sondes-ecritures-avortees.jsonl`. Aucune sonde ne modifie donc une
  donnée « par accident ».
- La vérification IA que la fiche Studio lance toute seule à l'ouverture
  (`POST /api/studio/essais/<id>/verifier`) répond 503 sans atteindre le serveur.
- **S3** est la seule sonde qui presse V et R : le `PATCH /api/studio/essais/*` est intercepté
  et simulé AVANT la première touche (et le filet avorterait de toute façon la requête).
- Génération (S8) : `POST /api/studio/generations` simulé en 409, jamais d'appel OpenRouter.
- Images : jamais de vraie photo ni d'image générée (`e2e/sondes/png.ts` fabrique des PNG
  synthétiques).

## Sondes de bugs

« Avant » = valeurs relevées sur la branche `feat/refonte-design` avant toute modification de
l'interface (`next dev`, Chromium, barres de défilement visibles).

### Polices et texte

| Id | Ce que la sonde mesure | Projets | Corrigé quand |
|---|---|---|---|
| **F1** | `/dashboard` tenu en chargement (`/api/dashboard` retenue) : famille déclarée du libellé du Loader vs corps, styles `font-family` inline hors variable, police réellement rendue (`CSS.getPlatformFontsForNode`) | desktop clair et sombre | `memeQueCorps` vrai et aucun `font-family` inline hors `var(--font…)`, et police rendue = police web |
| **F2** | Textes visibles sous 10 px et sous 11 px sur `/dashboard` (sidebar, dock, barre du haut) | les 4 | `lt11 = 0` (toutes les routes : G1) |
| **F3** | Part des textes dont la taille double quand la taille racine passe de 16 à 32 px (zoom texte simulé) : `/dashboard`, `/stock`, `/login` | desktop clair | `ratio >= 0,95` |

### Opacités sans effet

| Id | Ce que la sonde mesure | Projets | Corrigé quand |
|---|---|---|---|
| **O1** | `/parametres`, « Nouveau prompt » : fond du voile (premier ancêtre `fixed` du dialogue), luminance d'un pixel de la page avant/après ouverture | les 4 | alpha du voile >= 0,3 **et** pixel assombri d'au moins 15 % |
| **O2** (barre) | `/mise-en-vente` : fond de la barre d'actions fixe et son flou | les 4 | alpha >= 0,9 |
| **O2** (landing) | `/` sans session, page défilée de 1200 px : fond de l'en-tête collant, contraste de son texte | les 4 | alpha >= 0,85 et contraste >= 4,5:1 |
| **O3** | `/mise-en-vente` étape 2 (TST1, photo synthétique) : fond du bouton X « Supprimer la photo », fond de l'overlay du zoom, balayage des classes `bg/text/border/ring-…/NN` sans règle CSS | desktop clair et sombre | overlay alpha >= 0,6 ; bouton X opaque (ou alpha >= 0,5 avec icône à >= 3:1) ; balayage vide |

### Menu et cadre

| Id | Ce que la sonde mesure | Projets | Corrigé quand |
|---|---|---|---|
| **M1** | `/dashboard`, `/stock`, `/studio` avec les scripts de l'app avortés (HTML serveur seul) : couleur du lien actif, fond effectif, présence de l'indicateur | desktop clair et sombre | contraste du texte >= 4,5:1 et marqueur actif présent dès le HTML serveur à >= 3:1 contre l'aside |
| **M2** | 404 connecté, `/studio`, `/a-comptabiliser` vide (compte neuf) : `scrollHeight − innerHeight`, éléments à `min-height` >= fenêtre, vide sous le dernier contenu | les 4 | `pleineHauteur <= 1`, pas de défilement parasite (`debordV > 0` avec plus de 150 px vides), pas de défilement horizontal |
| **M3** | `/mise-en-vente` (1440 et 390) et `/commandes` menu ⋯ ouvert : éléments `fixed`/`sticky` et leur z-index, variables `--z-*`, recouvrements à z égal, lien MENTIONS atteignable | desktop clair, mobile clair | chaque z-index = valeur d'un jeton `--z-*`, aucun recouvrement à z égal, MENTIONS atteignable |

### Mobile

| Id | Ce que la sonde mesure | Projets | Corrigé quand |
|---|---|---|---|
| **MO1** | Taille de police calculée des champs : `/login`, `/signup`, `/reset-password`, `/stock`, `/compte`, modales (Nouveau prompt, fenêtre Vendre, Créer une commande), assistant IA | mobile clair | minimum >= 16 px partout |
| **MO2** | Dock, barre de Mise en vente, barre groupée du Stock (une ligne cochée), bulle du chat : chevauchement avec le dock, zone sûre simulée à 0 puis 34 px (`Emulation.setSafeAreaInsetsOverride`, disponible dans le Chromium de Playwright 1.63) | mobile clair | `chevauche = 0` pour chaque barre, aux deux zones sûres |
| **MO3** | Un toast (« Import Excel », sans réseau) : thème, fond, police, recouvrement de la bulle du chat et du dock | les 4 | thème suivi (sombre en sombre), police de l'app, `surChat = 0`, `surDock = 0` |
| **MO4** | `/stock` : pouce de la barre de défilement (`::-webkit-scrollbar-thumb` calculé, sinon `scrollbar-color`), contraste avec le fond, luminance maximale des pixels de la bande de la barre (capture) | desktop clair et sombre | contraste pouce/fond >= 1,5:1 et, en sombre, luminance du pouce et des pixels <= 0,6 |
| **X9** | Dock mobile : `scrollWidth` vs `clientWidth`, entrées hors écran, menu « Plus » | mobile clair | `scrollW <= clientW` et un menu « Plus » |

### Studio (compte `sonde`, 1440 px)

| Id | Ce que la sonde mesure | Projets | Corrigé quand |
|---|---|---|---|
| **S1** | `/studio/probe-noir` : positions Y de « Photographie le sac » et « À juger » au chargement | desktop clair et sombre | « À juger » visible sans défiler et avant la planche, ou planche repliée |
| **S2** | Contrôles Retirer / Remplacer par photo de la planche (survol et focus compris). N'en clique aucun | desktop clair | au moins un Retirer et un Remplacer par photo |
| **S3** | Touches R puis V avec le PATCH simulé : délai du PATCH, bouton « Annuler » à 300 ms et à 4 s, toast | desktop clair et sombre | un toast avec « Annuler » reste au moins 4 s, pour R comme pour V |
| **S4** | Historique de la prise 01 : image rejetée affichée, décision « Rejetée », action « Retenir cette version », état des cases de la ligne 01 | desktop clair | image rejetée visible dans un historique avec sa décision et l'action |
| **S5** | `/studio/probe-14` : glisser, toucher puis case, dépôt par case vide, `<select>` du tableau | desktop clair | plus de `<select>`, de toucher puis case, de dépôt par case ; glisser + alternative clavier (`aria-keyshortcuts` / `aria-describedby`) |
| **S6** | `/studio/5039-white-volt` avec un catalogue factice (6 modèles, favori m2) : bascules favori, étoiles, requêtes `/favoris` après un clic sur l'étoile | desktop clair | une bascule par modèle et un clic envoie exactement 1 POST ou DELETE |
| **S7** | Liens vers les réglages Studio depuis `/studio` et une fiche ; libellé du menu et titre de la barre sur `/parametres` | desktop clair | au moins un lien vers les réglages et aucune entrée nommée seulement « Prompts » |
| **S8** | Zone « MODÈLE » avec un catalogue factice de 8 modèles : pilules, options du `<select>`, mention d'un coût par sac, d'euros, d'un taux de réussite, « Hors budget », payload d'un lancement simulé | desktop clair | coût par sac, euros, taux et « Hors budget » présents et 2 ou 3 modèles dans un lancement |

### Relevés en plus de l'étude

| Id | Ce que la sonde mesure | Projets | Corrigé quand |
|---|---|---|---|
| **X0** | `/studio/probe-sansverif` : requêtes `POST …/verifier` envoyées par le navigateur à l'ouverture | desktop clair | aucune requête sans action de l'utilisateur (**décision produit à trancher** : aujourd'hui l'avis manquant est relancé à l'ouverture) |
| **X1** | `/a-comptabiliser` (30 lignes), « Valider » : voile du dialogue (haut, hauteur), couverture de la barre du haut, dialogue visible | desktop clair et sombre | `haut = 0`, `hauteur = innerHeight`, barre du haut couverte, dialogue visible |
| **X2** | `/mise-en-vente` : aire d'intersection entre « Continuer » et la bulle du chat, élément qui reçoit le clic | desktop clair, mobile clair | aire = 0 et le clic va au bouton d'action |
| **X3** | `/mise-en-vente` : le lien MENTIONS de la sidebar reçoit-il le clic ? | desktop clair et sombre | oui |
| **X4** | `/statistiques` : écart haut/hauteur entre l'indicateur actif et l'entrée active, menu replié puis déplié | desktop clair | `dTop = 0` et `dH = 0` aux deux états |
| **X5** | `/mise-en-vente` étape 2, page défilée de 800 px : haut de la carte photos collante vs bas de la barre du haut | desktop clair | `carteTop >= topbarBas` |
| **X6** | Modale « Nouveau prompt » (focus initial, après 25 Tab, retour au déclencheur à Échap) et détail du jour du calendrier (`role=dialog`, fermeture à Échap) | desktop clair | focus dans le dialogue, y reste, revient au déclencheur ; le calendrier se ferme à Échap |
| **X7** | `/dashboard` : meta `theme-color` vs fond du thème de l'app, avec l'OS dans l'autre thème (deux combinaisons) | desktop clair | `theme-color` = fond de l'app dans les deux cas |
| **X8** | Règle axe `color-contrast` sur toutes les routes du catalogue (pages publiques, demo, neuf) ; ratio du kicker de `/dashboard` | desktop clair et sombre | aucune violation `color-contrast` |
| **X10** | `/studio/probe-14` (1 prise libre) : dépôt de 3 images, POST envoyés (simulés), message affiché | desktop clair | 1 POST avec 1 fichier et un message qui signale 2 photos en trop |
| **X11** | `/studio` : `location.search` après un clic sur la puce V1, puis état de la puce après rechargement | desktop clair | la génération est dans l'URL et la puce reste active |
| **X12** | `/studio/probe-noir` (9 angles) : `scrollWidth` vs `clientWidth` du tableau des angles | desktop clair | `scrollW <= clientW` |
| **X13** | `/dashboard` en sombre, scripts avortés : étiquette du bouton de thème vs thème posé | desktop sombre | étiquette cohérente (« Passer en thème clair » en sombre) |
| **X14** | Fichiers : `components/WelcomeModal.tsx` existe-t-il, `CLAUDE.md` le cite-t-il ? | desktop clair | la doc ne le cite plus, ou le fichier existe |
| **X15** | (hors étude) `/compte?trello=ok` : toast « Trello est connecté » visible après chargement | desktop clair | un toast « connecté » est affiché |

### Sondes globales (une visite par route du catalogue et par projet)

Routes : `e2e/catalogue-routes.ts` (pages publiques, compte demo, compte neuf et variantes
d'URL), adaptées par `e2e/sondes/routes.ts`. La page est prête quand toutes les conditions
`attente` de l'entrée sont visibles.

| Id | Mesure | Corrigé quand |
|---|---|---|
| **G1** | Textes visibles sous 10 px et sous 11 px (`lt10`, `lt11`), exemples | `lt11 = 0` |
| **G2** | Tailles de texte distinctes (px) et leur effectif | au plus 8 |
| **G3** | Part des textes qui suivent la taille racine (zoom simulé 16 → 32 px) | `ratio >= 0,95` |
| **G4** | Défilement horizontal, défilement vertical, éléments à `min-height` >= fenêtre, bas du contenu et vide sous la page | pas de défilement horizontal ; pas de défilement vertical avec plus de 150 px vides sous le contenu |
| **G5** | Éléments `fixed`/`sticky` : z-index, variables `--z-*` de `:root`, recouvrements à z égal | z-index = jetons nommés, aucun recouvrement à z égal |
| **G6** | (390 px seulement) champs de saisie sous 16 px | aucun |
| **G7** | Classes d'opacité Tailwind sans règle CSS générée | liste vide |

## Base d'accessibilité (axe)

`@axe-core/playwright` 4.13.0, balises `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`, sur chaque
route du catalogue et dans les 4 projets. L'outillage de `next dev` (`<nextjs-portal>`) est exclu.
Aucune touche n'est pressée (V et R du Studio). L'indicateur de `next dev` est masqué par une
feuille de style avant l'analyse : il recouvre le dock mobile et faisait varier les résultats
« incomplete » d'un lancement à l'autre.

## Stabilité (deux lancements identiques)

Chaque mesure attend d'abord le **calme réseau** (`e2e/outils/calme.ts` : plus aucune requête en
cours, fil principal libéré, avatar avec son prénom). Sans cela, deux lancements identiques
donnaient des mesures différentes (badge « 3 » du dock présent ou non, calendrier ou fiche Studio
en chargement : `G1` 131 textes ou 129, `X8` 83 éléments ou 62). Calme non atteint en 60 s : la
sonde ÉCHOUE, elle ne mesure pas une page à moitié chargée.

- **F1** attend l'hydratation (`__reactFiber$` sur le Loader et le titre) avant de poser ses
  attributs témoins : en poser avant faisait lever à React « A tree hydrated but some attributes… »,
  une `console.error` qui n'était pas celle de l'application.
- **S3** : le délai du PATCH (5 à 8 ms) varie d'un lancement à l'autre ; l'état de la sonde, non.
- Les nombres d'appels reçus par les faux serveurs dépendent du cache du serveur (OpenRouter
  10 min, SacBase 60 s), donc de la durée du lancement.

## Écarts avec l'étude, et limites

- **Sélecteurs suivis dans le nouveau DOM (lot LS, version minimale).** Aucun critère ni seuil n'a bougé :
  **X4** repère `aside a[data-active=true]` (le menu n'a plus d'indicateur mesuré : s'il n'y a pas de
  `aside nav > span[aria-hidden]`, l'indicateur est le lien actif lui-même, jugé sur son fond, opaque et à 3:1 au
  moins de celui de l'aside) et le bouton de repli `aside button[aria-expanded]` ; **F1** prend pour témoin
  `header h1` (sinon l'ancien `div` « Dashboard ») ; **X5** cherche les éléments collants parmi `div, header` ;
  **O2** (Mise en vente) capture `div.fixed` ou `section.fixed` (BarreActions est une `<section>`).
- **F1 : le symptôme ne se voit pas sous `next dev`.** En développement, `next/font` garde le
  nom « Space Grotesk » dans son `@font-face` : le Loader s'affiche, par hasard, dans la bonne
  police. En production le nom est hashé (`__Space_Grotesk_xxxx`) et le littéral retombe sur
  `sans-serif` (SUPPOSÉ : aucun `next build` n'a été lancé ici). La sonde juge donc la
  **déclaration** (famille du Loader vs corps, styles inline) et consigne la police rendue.
- **MO3** utilise le toast de « Importer un fichier Excel » (`/commandes`) et non
  `/compte?trello=ok` : ce dernier toast est lancé avant que le `<Toaster>` soit abonné et ne
  s'affiche jamais (relevé **X15**, cause supposée).
- **S5, S6, S8** : l'étude demandait « 2 photos et 1 angle », « 15 photos et 1 angle ». Le compte
  sonde a 9 angles (pour X12), donc les comptes de cases diffèrent, pas les critères. S6 et S8
  tournent sur `5039-white-volt` parce qu'une fiche sans sac cible désactive « Générer » ;
  S5 sur `probe-14` pour qu'une case vide existe (4e mécanisme).
- **MO2** : le dock mesure 67 px à zone sûre 0 (l'étude calculait 57), donc les écarts diffèrent
  de ceux de l'étude ; les chevauchements apparaissent à zone sûre 34 px comme prévu.
- **M2** sur `/studio` et **X1** : les valeurs (`debordV`, `haut`) dépendent des données et de la
  position de défilement ; seuls les critères sont stables.
- **M1, X13** avortent les scripts de l'app (`/_next/static/chunks/**`) pour lire le HTML serveur :
  le script inline du thème, lui, s'exécute.
- **MO4** : le verdict repose sur la couleur calculée du pouce ; les pixels de la bande de la
  barre sont relevés à titre de preuve (`mesure.bande`).
- Les sondes ne mesurent pas le **rendu pixel** avant/après : c'est le rôle des captures de
  l'autre agent (`e2e/captures.spec.ts`).
- Non fait : métriques de code statiques de l'étude (nombre de `text-[Npx]`, de hex en dur, de
  modales…), qui se relèvent par `grep` (voir `codeMetrics` de `bugs-sondes.json`).
