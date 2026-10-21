# Audit « better » de MyFlip : fondations, écrans, parcours

> Audit du 20/10/2026, synthèse rédigée le 21/10/2026. Six triages en lecture seule, plus une synthèse qui dédoublonne.
> Statut : **à valider par Aramis**. Ce document ne modifie aucun code.

**Le cadre posé par Aramis le 20/10/2026.** La couleur, les polices, les animations et l'identité visuelle sont
**reportées** : Aramis fera son design system dans Claude Design. Pour l'instant, il veut **de très bonnes
fondations** et une application qui ne bugue pas. Cet audit ne juge donc aucun goût, ni teinte, ni police, ni
style. Il juge ce qui fait une bonne application :

- la structure et les parcours, la hiérarchie ;
- la clarté de la langue ;
- l'accessibilité, l'échelle typographique, le contraste mesuré ;
- les états (chargement, vide, erreur, désactivé, en cours) et les retours d'action ;
- la cohérence entre écrans, le mobile, et les bugs.

La **structure** de `docs/design-system.md` (statut provisoire) est reprise telle quelle : noms de tokens, échelle
typographique de 8 tailles, échelle de z-index, liste des composants, cadre et navigation. Ses **valeurs**
d'identité restent provisoires. Ici, la palette actuelle est **gardée** et corrigée **seulement** là où le
contraste AA échoue (§ 2.2).

---

## 0. À retenir

- **384 symptômes localisés**, dont **10 bloquants**, 192 majeurs et 182 mineurs.
- **138 symptômes relèvent d'une fondation.** Ils se corrigent une seule fois, dans un token, une primitive ou le
  cadre, et se ramènent à **24 chantiers** (§ 2). Les 246 autres sont propres à un écran (§ 3).
- **Les 10 bloquants :**

| Id | Écran | Ce qui se passe |
|---|---|---|
| CA-01 | Cloche, mobile | Le panneau déborde de 70 px à gauche de l'écran : les notifications sont illisibles. |
| CA-02, QU-01 | « Vendre » et « Supprimer » d'À comptabiliser | La fenêtre se cale sur le `<main>` transformé : coupée sur mobile, « Confirmer la vente » passe sous le dock, et sur une longue liste elle peut sortir de l'écran. |
| PI-36 | Calendrier, mobile | Toucher un jour ouvre à la fois l'accordéon et la fenêtre prévue pour l'ordinateur. Résultat : la liste des articles vendus du jour n'est lisible sur aucun format. |
| ST-1 | Stock, pastille de statut | Quitter « Vendu » efface sans confirmation le prix, la date, les marges et le coefficient de vente. |
| ST-2 | Stock, actions groupées | La sélection survit aux filtres. « Appliquer » écrit sur des lignes invisibles et efface leurs ventes. |
| ST-3 | Stock, barre groupée, thème sombre | Le texte du sélecteur et le bouton « Appliquer » mesurent 1,22:1 et 1,25:1 : illisibles. |
| QU-61 | Mise en vente, étape 4 | Le bouton principal « Nouvelle session » efface les annonces générées et payées, sans confirmation. |
| SU-02 | Studio, planche | Impossible de retirer ou de remplacer une photo, alors que l'API le permet. |
| SU-05 | Studio, « À juger » | V ou R décide sur-le-champ, sans annulation. Un rejet ne donne aucun retour. |

- **Ordre de travail conseillé** (des fondations vers la finition) :
  1. tokens en canaux et corrections de contraste (§ 2.1 et 2.2) ;
  2. cadre : hauteur unique, animation d'entrée sans `transform`, échelle de z-index (§ 2.5 et 2.6) ;
  3. primitives Dialog, Champ, Bouton, toasts et états (§ 2.12 à 2.22) ;
  4. fenêtre de vente unique (§ 2.24) ;
  5. bloquants restants, écran par écran (§ 3) ;
  6. refontes de parcours (§ 4).
- **12 questions** attendent un arbitrage d'Aramis (§ 7). Les plus urgentes : où vit l'objectif mensuel, si
  l'on touche aux calculs du tableau de bord (hors périmètre selon le PRD § 5), et le nom de l'onglet des prompts.

---

## 1. Méthode, périmètre, chiffres

### 1.1 Méthode

Chaque triage a suivi le skill `better` : triage, puis symptômes localisés par `fichier:ligne` ou par écran avec
capture, puis attribution au skill propriétaire. Il a ensuite chargé les propriétaires réellement concernés :
`better-layout`, `better-writing`, `better-accessibility`, `better-typography`, `better-ui`, et `better-colors`
réduit au contraste, aux tokens et à la règle « la couleur ne porte jamais seule l'information ». Chaque symptôme
est qualifié par la règle du skill propriétaire et reçoit un correctif exact.

| Groupe | Préfixe | Écrans | Aiguilleur Jev au départ |
|---|---|---|---|
| Cadre | CA | menu, dock, barre du haut, cloche, assistant, toasts, modales, auth, pages légales, 404 | `better`, 0,79, chargé |
| Pilotage | PI | tableau de bord, statistiques, calendrier | `better`, 0,74, chargé |
| Stock | ST | `/stock`, fiche, fenêtre de vente du Stock | `better-interface`, 0,46 (sous le seuil) ; `better` chargé parce que la commande l'imposait |
| Quotidien | QU | commandes, nouvelle commande, à comptabiliser, mise en vente | `better`, 0,83, chargé |
| Studio | SU | catalogue, fiche, file à juger, modèles, Bilan, `/parametres` | `better`, 0,60, chargé |
| Compte | CO | mon compte, démarrage, landing | `better`, 0,23 (sous le seuil) ; chargé parce que la commande l'imposait |

**Écarts à la méthode `better`, assumés.** Le skill plafonne à 5 skills et recommande `better-interface` seul
au-delà de 5 domaines. Les triages ont chargé les 6 domaines parce que la commande les nommait, et chacun avait au
moins un symptôme localisé. `better-interface` n'a été chargé nulle part, puisqu'il ne s'empile pas avec ses
domaines. `break` et `state-machine` sont absents de la session : il faudra les lancer à la main (`/break`) pour
éprouver la future primitive Dialog. Quand le propriétaire était `dataviz`, `aucun` ou la performance, le triage
l'a dit sans forcer un `better-*` (SU-54, PI-17, PI-52, ST-16, ST-17, ST-53, ST-54, SU-59, CO-52).

**Ce que la synthèse a fait elle-même.**

- Elle a dédoublonné les 384 symptômes : une même cause donne une seule entrée, qui cite tous les ids concernés.
- Elle a recalculé les contrastes de § 2.2 avec la formule WCAG 2.x, sur les hex de `app/globals.css`,
  `lib/statutColors.ts` et `lib/canalColors.ts`. Les candidats de correction ont été trouvés en ne baissant que la
  luminosité OKLCH, à teinte constante.
- Elle a relu le code de 6 points pour confirmer : ST-1 (`app/stock/page.tsx:1154-1160`), ST-3 (`:1611-1626`),
  PI-36 (`app/calendrier/page.tsx:300` et `:549-556` : la fenêtre est bien hors du bloc `hidden md:block`), SU-05
  (`FileAJuger.tsx:80-92`), QU-61 (`_barreAction.ts:92-106`), et la bulle de l'assistant (`ChatBot.tsx:117` :
  `bottom-20` sur mobile, `md:bottom-6`).
- Elle a vérifié que `docs/design-system.md` § 5, § 7, § 9, § 10 et § 11 contient déjà l'échelle typographique et
  l'échelle de z-index que proposent les triages. Les deux concordent.

### 1.2 Sources

- **Captures** : `e2e/captures.nosync/courant/<projet>/`. Abréviations utilisées dans ce document :
  `dc/` desktop-clair, `ds/` desktop-sombre, `mc/` mobile-clair, `ms/` mobile-sombre.
- **Sondes** : le dossier `e2e/rapports/courant-d100/` cité par la commande **n'existe pas** (vérifié par `ls` :
  seuls `avant/`, `courant/` et `courant-latence/` existent). Les triages ont lu `e2e/rapports/avant/sondes.json`
  (lancement du 20/10 à 19 h 58 et 22 h 56, verdicts identiques à `courant/`), `e2e/rapports/courant/sondes.json`,
  `e2e/rapports/courant-latence/` (sondes S1, S3, X8, X11), et la base axe `avant/a11y.json` et `courant/a11y.json`.
- **Études** : `docs/refonte/etude-2026-10-20/` (`routes-etats.json`, `bugs-sondes.json`, `appels-externes.json`).
- **PRD** : `docs/prd/2026-10-20-refonte-design.md`, § 1, 3, 4, 5, 8 et 10.

### 1.3 Périmètre

**Inspecté :** toutes les routes de l'application connectée, l'authentification, les pages légales, la 404, la
landing, les modales et le cadre, en 1440 px et 390 px, en clair et en sombre.

**Non regardé :**

- l'extension Chrome Vinted et `extension-vinted/banc/` (hors périmètre, PRD § 5) ;
- les e-mails transactionnels ;
- `.claude/worktrees/`, `node_modules/`, `.next*/` et les doublons iCloud « * 2 » ;
- les écrans entre 768 et 1 200 px : ils n'ont pas été capturés, et les débordements dans cette plage sont déduits
  par calcul (PI-23, PI-24 : SUPPOSÉS) ;
- aucun test au lecteur d'écran réel (VoiceOver, NVDA) : les annonces sont déduites du code et d'axe.

### 1.4 Chiffres

**Par domaine et par gravité** (avant dédoublonnage) :

| Domaine | Bloquant | Majeur | Mineur | Total |
|---|---:|---:|---:|---:|
| Accessibilité | 0 | 42 | 32 | 74 |
| Écriture | 1 | 20 | 39 | 60 |
| Bugs fonctionnels | 5 | 29 | 17 | 51 |
| États et retours | 2 | 24 | 20 | 46 |
| Contraste et tokens | 1 | 24 | 12 | 37 |
| Mise en page | 0 | 14 | 17 | 31 |
| Parcours | 0 | 18 | 10 | 28 |
| Typographie | 0 | 8 | 14 | 22 |
| Mobile | 1 | 13 | 7 | 21 |
| Finition | 0 | 0 | 9 | 9 |
| Performance | 0 | 0 | 5 | 5 |
| **Total** | **10** | **192** | **182** | **384** |

**Par groupe :**

| Groupe | Symptômes | Bloquants | Majeurs | Mineurs | Dont fondation |
|---|---:|---:|---:|---:|---:|
| Cadre (CA) | 67 | 2 | 33 | 32 | 48 |
| Pilotage (PI) | 55 | 1 | 21 | 33 | 18 |
| Stock (ST) | 55 | 3 | 30 | 22 | 22 |
| Quotidien (QU) | 92 | 2 | 47 | 43 | 21 |
| Studio et Réglages (SU) | 62 | 2 | 36 | 24 | 13 |
| Compte, Démarrage, Landing (CO) | 53 | 0 | 25 | 28 | 16 |
| **Total** | **384** | **10** | **192** | **182** | **138** |

Cinq symptômes relèvent de l'identité et sont reportés (§ 5).

### 1.5 Vérifié ou supposé

- **369 symptômes VÉRIFIÉS** : vus dans le code, et pour la plupart aussi sur une capture ou une sonde.
- **15 symptômes SUPPOSÉS**, marqués comme tels dans le texte. Neuf viennent d'un calcul ou d'une lecture du code
  sans rendu : CA-35, CA-38, PI-23, PI-24, PI-52, ST-53, ST-54, SU-59, SU-60. Six autres n'ont pas été reproduits
  à l'écran : CA-65, CA-66, QU-46, CO-44, CO-47, CO-50.
- **Symptômes vérifiés dont une partie reste supposée :**
  - CA-15 et CO-4 : le toast Trello manque bien, mais sa cause (`<Toaster>` monté après `<AppShell>`) est supposée.
  - CA-17 : les doublons de toasts sur un 401 sont supposés.
  - CA-48 : le toucher iOS sur une zone non cliquable est supposé.
  - CA-57 : le blocage de `signIn` est supposé ; celui de `fetch` à l'inscription est vu dans le code.
  - ST-1 : l'écriture à chaque flèche du clavier sous Windows est supposée.
  - ST-40 : la lecture en texte par Excel FR est supposée.
  - SU-58 : la cause de la perte du thème sombre est supposée.
  - QU-84 : que l'extension sache déjà tenir une file est supposé.
- **Une incohérence entre triages, à remesurer.** ST-9 affirme qu'« en sombre, tout passe (4,19 à 8,78:1) ». Or
  4,19:1 échoue au seuil de 4,5:1. Au moins une pastille de statut échoue donc aussi en sombre. Laquelle n'est pas
  identifiée.

### 1.6 Conventions

- **Bloquant** : empêche une tâche, ou détruit des données sans confirmation. **Majeur** : gêne une tâche
  courante, trompe l'utilisateur ou échoue à une exigence WCAG AA. **Mineur** : finition, cohérence, confort.
- Les textes d'interface entre « » sont **prêts à coller**. Ils tutoient, comme le reste de l'application
  (`docs/design-system.md` § 13.7).
- « Fondation » signifie que la correction vit dans un token, une primitive de `components/ui/`, un helper de
  `lib/` ou le cadre, et qu'elle se fait **une seule fois**.

---

## 2. Spécification des fondations

Vingt-quatre chantiers, dans l'ordre où les faire. Pour chacun, on trouve :

- la cause, avec sa localisation ;
- les exigences : rôles, clavier, focus, annonces ;
- les états à dessiner ;
- les tailles sur mobile ;
- les ids couverts.

La structure suit `docs/design-system.md` : les **noms** y sont repris, les **valeurs** d'identité restent à
venir.

### 2.1 Tokens en canaux : les opacités qui ne marchent pas

**Cause.** Dans `tailwind.config.ts:14-38`, chaque couleur vaut `var(--x)`, sans canaux. Tailwind 3 ne sait donc
générer aucune classe d'opacité. `bg-ink/30`, `bg-surface/95`, `bg-[var(--bg)]/85` ou `hover:bg-surface-soft/60`
ne produisent **aucune règle CSS** (sondes O1 et O2 : `alphaVoile` vaut 0 dans les 4 projets ; G7).

**Effets observés :**

- aucun voile derrière les modales (`components/Modal.tsx:66`) ;
- la barre d'actions de Mise en vente est transparente (`app/mise-en-vente/page.tsx:758`) ;
- le zoom photo n'a pas de voile (`:728`) ;
- le bouton « Supprimer la photo » est invisible sur une photo claire (`_components/FicheArticle.tsx:328`, sonde O3 :
  1,2:1) ;
- la loupe n'a pas de fond (`:349`, où `bg-white/92` est en plus hors échelle) ;
- le survol de l'export est sans effet (`ExportAnnonces.tsx:194`) ;
- le survol de la Nouvelle commande est sans effet (`NewCommandeModal.tsx:430`) ;
- l'en-tête de la landing est transparent (`components/landing/LandingNav.tsx:20`) ;
- la pastille de l'étape active du démarrage manque (`app/demarrage/page.tsx:140`).

**Spécification.**

1. Chaque couleur est déclarée en canaux, dans les deux thèmes : `--ink: 14 20 18;`, et en sombre
   `--ink: 234 241 236;`. Dans Tailwind : `ink: 'rgb(var(--ink) / <alpha-value>)'`, pour **tous** les alias.
   Côté CSS : `rgb(var(--ink))`.
2. Nouveaux tokens de rôle, valeurs provisoires :
   - `--veil` : voile des modales ; par exemple l'encre à 50 % en clair et le noir à 70 % en sombre (PI-7) ;
   - `--shadow-sm` et `--shadow-lg`, qui remplacent les `rgba(22,38,29,…)` du calendrier (PI-7) ;
   - `--focus` : opaque, égal à `--acc` pour l'instant ;
   - `--placeholder`, nettement plus clair que `--ink` mais lisible (QU-46, SUPPOSÉ : à mesurer dans les deux
     thèmes) ;
   - `--disabled-bg` et `--disabled-ink` (QU-47) ;
   - `--border-input`, `--warn-ink`, `--alert-ink`, `--notice-ink`, `--chart-bar` et `--chart-bar-highlight`
     (§ 2.2) ;
   - les tokens de statut et de canal (§ 2.19).
3. Les alias morts sont supprimés après remplacement de leurs usages : `--muted`, `--faint-2`, `primary`,
   `primary-dark`, `on-primary`, `surface-container`. Il reste **un seul** token de texte tertiaire (CA-51).
4. Les couleurs de la barre de défilement passent par `html { scrollbar-color: var(--border-strong) transparent }`,
   redéfini par thème. Les règles `::-webkit-scrollbar` (`app/globals.css:357-367`), dont le pouce est codé en dur
   en `#e2e2e2`, sont supprimées (CA-36, sonde MO4 : 1,08:1 en clair, éblouissant en sombre).
5. En attendant les canaux, aucune opacité n'est appliquée à une couleur en `var()`. À la place :
   `bg-[color-mix(in_oklab,var(--acc-ink)_15%,transparent)]`.
6. Plus aucune couleur hex ni `rgba` dans un composant. Sont concernés : `SellDialog.tsx:20-22` (QU-09),
   `calendrier/page.tsx:554` et `:558` (PI-7), le blanc littéral de la barre groupée du Stock (ST-3), le bleu Vinted
   d'`ExportAnnonces.tsx:82` (QU-08). Les couleurs en dur restantes, dans `Loader.tsx`, relèvent de l'identité et
   sont reportées (CA-67).

**Vérification :** les sondes O1, O2 et G7 doivent remonter un alpha non nul, et
`grep -rn "\[var(--[a-z0-9-]*)\]/[0-9]" app components` doit renvoyer 0 résultat.

**Couvre :** CA-03, QU-04, CO-23, PI-7, CA-51, CA-36, QU-46, QU-47, ainsi que la cause commune de QU-08, QU-09 et
ST-3.

### 2.2 Contraste AA : les valeurs corrigées, palette gardée

Règle : un texte doit atteindre 4,5:1 sur **chacun** des fonds où son rôle le pose, dans les deux thèmes. Une
limite de composant, une barre de graphique ou un anneau de focus doit atteindre 3:1. Les candidats ci-dessous
**gardent la teinte** : seule la luminosité OKLCH change.

Ils sont VÉRIFIÉS par calcul : formule WCAG 2.x appliquée aux hex du dépôt, script dans le dossier temporaire de
session, pas dans le dépôt. Ils ne sont **pas** remesurés au rendu : il faut relancer axe après application. Ces
valeurs sont **provisoires** : le design system les remplacera. La contrainte, elle, reste.

**Tokens qui échouent aujourd'hui.** Mesures données sur `--bg`, `--surface` et `--surface-2`, sauf mention
contraire.

| Token et rôle | Thème | Valeur actuelle | Mesures actuelles | Candidat | Mesures du candidat | Ids |
|---|---|---|---|---|---|---|
| `--faint`, `--muted`, `--faint-2` : texte tertiaire (libellés, en-têtes de tableau, aides, pied, pages légales) | clair | `#75857c` | 3,25 · 3,89 · 3,57 | `#5d6c64` | 4,63 · 5,53 · 5,08 | CA-11, PI-2, ST-10, QU-05, SU-29, CO-8 |
| même rôle | sombre | `#71827a` | 4,78 · 4,41 · 4,03 | `#7a8c83` | 5,45 · 5,04 · 4,60 | idem |
| nouveau `--border-input` : bord de champ, de sélecteur, de chip (aujourd'hui `--border`) | clair | `#dde4df` | 1,29 sur `--surface`, 1,19 sur `--surface-2` | `#7e8882` | 3,66 sur `--surface`, 3,37 sur `--surface-2`, 3,06 sur `--bg` | CA-12, QU-10, SU-31, CO-10 |
| même rôle | sombre | `#242c29` | 1,25 et 1,14 | `#636d69` | 3,34 · 3,05 · 3,62 sur `--bg` | idem |
| nouveau `--warn-ink` : texte d'avertissement (aujourd'hui `--warn`) | clair | `#b5872e` | 3,25 sur `--surface`, 2,94 sur `--warn-soft` | `#926600` | 5,09 sur `--surface`, 4,61 sur `--warn-soft`, 4,68 sur `--surface-2` | QU-06, CO-9, SU-30, CO-7, PI-38 |
| `--warn` en sombre | sombre | `#e5bb63` | 9,91 | conforme | — | — |
| `--alert` : fond des badges compteurs, texte blanc | les deux | `#c2603f` | 4,17 avec le blanc ; 3,67 sur `--alert-soft` | `#af4f2e` | 5,28 avec le blanc ; 4,64 sur `--alert-soft` | CA-13 |
| `--notice` sur `--notice-soft` : pastilles du panneau de la cloche | clair | `#b5872e` | 2,94 | `--notice-ink` = `#926600` | 4,61 | CA-13 |
| Barres de graphique (`--surface-2` sur `--surface`) | les deux | `#f3f6f3` et `#1b211f` | 1,09 | `--chart-bar` = `#7e8882` (clair), `#636d69` (sombre) | 3,66 et 3,34 | PI-9 |
| Anneau de focus `--acc-ring-strong` (rgba 40 %) | clair | mélange sur `--tint` | 2,05 | `--focus` = `--acc` opaque | 8,60 sur `--tint` (clair) ; 14,37 sur `--surface` (sombre) | ST-13, ST-6, SU-61, CO-45 |

**Statuts** (`lib/statutColors.ts`). En clair, le texte de la pastille utilise `c.color` : de 1,71:1 à 3,59:1,
selon ST-9. Passer à `c.ink`, comme le propose ST-9, **ne suffit pas** pour 5 statuts. Mesures sur `--tint`
(= `--surface-2`) :

| Statut | `ink` actuel | Mesure | Candidat | Mesures du candidat (`--tint`, `--surface`, `--bg`) |
|---|---|---|---|---|
| Brouillon | `#71807A` | 3,80 | `#5e6c66` | 5,06 · 5,51 · 4,61 |
| Photos prêtes | `#BE4B7E` | 4,29 | `#b03e72` | 5,11 · 5,56 · 4,65 |
| En vente | `#3B6FD4` | 4,37 | `#3164c9` | 5,08 · 5,53 · 4,63 |
| En livraison | `#B5872E` | 2,98 | `#8c6000` | 5,09 · 5,54 · 4,64 |
| À comptabiliser | `#C2603F` | 3,83 | `#ab4b2a` | 5,11 · 5,57 · 4,66 |
| En stock | `#8A6D0F` | 4,51 | conforme, à la limite | — |
| Vendu, En lavage, Repassé, Perdu | — | 5,41 à 10,92 | conformes | — |

Le thème sombre doit être remesuré (voir l'incohérence de § 1.5). La pastille « À comptabiliser » reste un pastel
clair en sombre, à 3,67:1 (QU-07) : elle passe en paire de tokens à deux thèmes (§ 2.19).

**Canaux** (`lib/canalColors.ts`) :

| Canal | Fond et texte actuels | Mesure | Candidat | Mesure du candidat |
|---|---|---|---|---|
| Vinted | `#0096FF` et blanc | 3,09 | fond `#0074da` | 4,66 |
| Leboncoin | `#FF6B35` et blanc | 2,84 | fond `#d34200` | 4,62 |
| Vinted Go, Vestiaire Collective (texte noir), En main propre, Autre | — | 4,83 à 8,44 | conformes comme badges | — |

Dans un graphique, un segment doit atteindre 3:1 contre `--surface` (PI-8). Or Vestiaire mesure 2,80, Leboncoin
2,84 et Autre 1,24. De plus, Vestiaire et Leboncoin sont à moins de 15° de teinte l'un de l'autre. Il faut des
tokens `--canal-*` à deux thèmes, à 3:1 minimum et séparés de 15° au moins, et un liseré de 2 px couleur
`--surface` entre segments. Le choix des teintes est **reporté**. Ids : ST-11, PI-8.

Le bouton « Créer le brouillon Vinted » (`#09B1BA` et blanc, 2,62:1) se corrige de deux façons. Soit un texte
`--ink` foncé : 7,40:1 avec `#0b0e0d`. Soit un fond `#00818a` : 4,66:1 avec le blanc. Id : QU-08.

**Contrastes conformes, à réutiliser.** `--ink2` passe partout : 5,99 · 7,16 · 6,58 en clair ; 8,38 · 7,74 · 7,07 en
sombre. C'est le token des libellés de champ, du corps des pages légales, des en-têtes du calendrier et des
compteurs de chips.

**Paires cassées par un usage, pas par le token :**

| Paire | Mesure | Correction | Id |
|---|---|---|---|
| `opacity-70` sur le © du pied de menu | 2,40 en clair, 2,80 en sombre | retirer l'opacité | CA-11, CA-31 |
| `opacity-70` sur les compteurs des chips du Stock | 3,29 | passer en `--ink2` | ST-12 |
| Blanc sur le lime de la barre groupée, en sombre | 1,25 | `--acc-ink` sur `--acc` : 15,56 | ST-3 |
| `--warn` sur `--warn-soft` pour les en-têtes LUN à DIM | 2,94 | `--ink2`, sans fond | PI-38 |
| `--acc-soft` sur `--bg` pour la légende du calendrier | 1,02 | bordure `--acc` | PI-39 |
| État sélectionné « Au lot / Pièce par pièce » porté par le fond seul | 1,09 | bordure accent de 2 px et coche | QU-10 |
| Bord de focus de SellDialog | 2,85 | `--focus` | CA-21 |

**Vérification :** axe `color-contrast` (184 nœuds pour le cadre, 63 pour le Studio et les Réglages, 53 pour le
compte) et la sonde X8 (61 violations sur les écrans du quotidien) doivent tomber à 0, dans les 4 projets.

### 2.3 La couleur ne porte jamais seule l'information, et les nombres ont un seul format

Un nouveau fichier `lib/format.ts` regroupe des **formateurs d'affichage**. Ils ne touchent à aucun calcul métier,
conformément au PRD § 5.

| Helper | Règle | Source actuelle | Ids |
|---|---|---|---|
| `ton(n)` | `--pos` si n > 0, `--neg` si n < 0, `--ink2` si n = 0, **toujours** avec un signe explicite (« −19,45 € », avec le vrai signe moins U+2212) | — | PI-13, ST-22 |
| `signedEur(n)` | `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', signDisplay: 'exceptZero' })` | `app/dashboard/page.tsx:101` (à déplacer) | PI-12, ST-49 |
| `niveauCoef(n)` | renvoie `{ ton, libellé }` : 2,3 et plus, « objectif tenu » ; de 2 à 2,3, « proche » ; sous 2, « faible » ; aucune vente, « — » en neutre et sans pastille | seuils dans `app/calendrier/page.tsx:93-114` | PI-15, QU-33 |
| `coefLabel(n, 2)` | un seul format, « 2,42× » | `lib/calc.ts:359` ; supprimer `coef()` de `lib/calc.ts:339-342`, ou en faire un alias | PI-16, ST-39 |
| `pluriel(n, singulier, pluriel)` | `Intl.PluralRules('fr-FR')` : en français, un nombre sous 2 prend le singulier (« 1 vendu », « 0,6 vente / jour ») | `app/mise-en-vente/_barreAction.ts:39` (à déplacer) | PI-32, ST-22, QU-14, SU-52, CO-19 |
| `dateCourte(d)` | `Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })` | — | QU-36 |
| `aujourdhuiParis()` et `jourParis()` | toute date par défaut en heure de Paris | `lib/dateMiseEnVente.ts:17-22` | CA-64, QU-42, ST-24 |
| `majusculeInitiale(s)` | seule la première lettre d'une date passe en capitale (« Samedi 3 octobre 2026 ») | — | PI-53 |
| Espaces | U+202F avant ? ! ; : et U+00A0 entre un nombre et « € » | — | CO-42 |

**Règle transverse** (`better-colors` et WCAG 1.4.1). Un état, un signe, un verdict ou une sélection est
**toujours** doublé d'un texte, d'un signe ou d'une icône nommée. Les applications écran par écran sont en § 3 :

- PI-14 : CA et marge distingués par la seule couleur ;
- PI-28 : étape en cours du démarrage du tableau de bord ;
- QU-33 et QU-34 : verdicts des commandes ;
- ST-41 : annonce existante signalée par la couleur de l'icône ;
- CA-42 : compteur du menu replié ;
- SU-62 : prompt sélectionné ;
- CO-7 et CO-24 : origine de la clé, étapes du démarrage.

### 2.4 Échelle typographique en rem

**Cause.** Il existe une vingtaine de tailles arbitraires en px : `text-[8.5px]` à `text-[19px]`, `fontSize` en
ligne dans le calendrier (environ 60 objets `style`) et dans les commandes (`:104-113`, `:223-436`). Les sondes le
confirment :

- G1 : 55 textes sous 11 px sur le Stock, 30 sur le Bilan ;
- G2 : 11 à 22 tailles par écran ;
- G3 et F2 : 0 % des textes suivent la taille racine, donc le zoom texte du navigateur n'a aucun effet.

**Spécification** (identique à `docs/design-system.md` § 5) :

| Token | rem | px | Rôle | Interligne |
|---|---|---|---|---|
| `--t-xs` | 0,75 | 12 | libellés, en-têtes de tableau, pastilles, dock | 1,45 |
| `--t-sm` | 0,8125 | 13 | cellules, aides | 1,45 |
| `--t-base` | 0,875 | 14 | interface (`body`) | 1,45 |
| `--t-md` | 1 | 16 | corps de texte, **tous les champs sur mobile** | 1,5 |
| `--t-lg` | 1,25 | 20 | titres de panneau et de modale | 1,25 |
| `--t-xl` | 1,75 | 28 | titre de page | 1,25 |
| `--t-2xl` | 2,5 | 40 | chiffre du mois sur mobile | 1,05 |
| `--t-3xl` | 3,5 | 56 | chiffre du mois sur ordinateur | 1,05 |

- **Plancher de 12 px** pour tout texte. Il satisfait à la fois `better-typography` et le PRD § 3, qui interdit tout
  texte sous 11 px.
- Chaque `text-[Npx]` et chaque `fontSize` en ligne est remplacé par un pas de l'échelle. Les composants partagés
  `Eyebrow`, `CardTitle`, `Fact` et `MICRO` consomment ces noms.
- **Casse naturelle** dans les chaînes source (« Articles vendus », « Vraies photos ») ; les capitales, si on les
  garde, viennent de la classe `uppercase` du seul token de sur-titre. Le style « capitales espacées » relève de
  l'identité et il est reporté (CO-53). La casse naturelle, elle, est une fondation (PI-6, SU-55).
- **Mesure** : `max-w-[65ch]` sur tout paragraphe d'aide (SU-56, CO-37).
- **Polices** : les variables `next/font` sont posées sur `<html>` et non sur `<body>` (`app/layout.tsx:73`).
  `fontFamily.sans` vaut `['var(--font-…)', 'system-ui', 'sans-serif']`, jamais un nom littéral
  (`tailwind.config.ts:42-61`, `Loader.tsx:69`). Le choix des polices reste reporté (CA-52, CA-50, PI-5).
- **Troncature** : toujours avec un chemin vers le texte complet, par `line-clamp-2`, un nom accessible complet ou
  une aide sous le champ. Les applications sont en § 3 : PI-22, SU-49, CO-16, QU-63, QU-75.
- `tabular-nums` est posé sur `body`, puisque les chiffres changent en direct (PI-44, en partie).

**Vérification :** la sonde G3 doit donner un ratio rem de 1, et la sonde G1 0 texte sous 12 px.

**Couvre :** CA-09, PI-3, ST-37, ST-38, QU-12, QU-13, SU-32, CO-15, CA-52, PI-6, SU-55, PI-43 (styles en ligne du
calendrier).

### 2.5 Échelle de z-index

**Cause.** Aucune échelle nommée : à niveau égal, c'est l'ordre du DOM qui tranche. Les niveaux en concurrence :

- `z-40` : `TopBar.tsx:36`, `Sidebar.tsx:153` et `:275`, la barre de Mise en vente (`:758`), le menu ⋯ des
  commandes (`:568`) ;
- `z-50` : `ChatBot.tsx:117` et `:132`, `SellDialog.tsx:87`, `a-comptabiliser/page.tsx:316` ;
- `z-[60]` : `Modal.tsx:66` ;
- `z-[80]` : `calendrier/page.tsx:553` ;
- `z-30` : la barre groupée du Stock (`:1603`) ;
- 999999999 : Sonner.

**Spécification** (identique à `docs/design-system.md` § 7), dans `theme.extend.zIndex` :

| Nom | Valeur | Usage |
|---|---:|---|
| `base` | 0 | flux normal |
| `raised` | 10 | en-tête de tableau collant |
| `sticky` | 20 | barre du haut, menu latéral |
| `dock` | 30 | dock mobile, barres d'actions fixes |
| `fab` | 35 | bulle de l'assistant |
| `overlay` | 40 | voile |
| `modal` | 50 | modale, tiroir, feuille « Plus » |
| `popover` | 60 | menus et listes, y compris dans une modale |
| `toast` | 70 | toasts, au-dessus d'une modale pour garder « Annuler » |
| `tooltip` | 80 | info-bulles |
| `skip` | 90 | lien « Aller au contenu » |

Plus aucun `z-[n]` ni `z-10` dans un composant. Le Toaster reçoit `style={{ zIndex: toast }}`.

**Couvre :** CA-04, QU-17 (en partie), ainsi que l'empilement de CA-27, SU-57 et ST-30.

### 2.6 Cadre : une seule hauteur, et une animation d'entrée sans `transform`

**Deux causes, avec des effets en cascade.**

1. **Double `min-h-screen`.** On le trouve sur `body` (`app/layout.tsx:73`), puis sur chaque `<main>`
   (`components/console.tsx:14`, `app/calendrier/page.tsx:182`, `app/not-found.tsx:5`), sous une barre du haut de
   62 px. Chaque page défile donc pour rien (sonde M2 : +62 px sur ordinateur, +158 px sur mobile ; sonde G4 sur
   `/demarrage` en mobile : 445 px vides). La 404 est décentrée. `AppShell.tsx:29` (`pb-24`) réserve 96 px quand
   le dock en fait 57, et oublie à la fois la zone sûre et la bulle.
2. **`[animation:stepIn_.2s_ease_both]` sur le Frame** (`console.tsx:14`). Le mode `both` laisse
   `transform: translateY(0)` sur `<main>`. Ce `<main>` devient alors le bloc conteneur de tout descendant
   `position: fixed`. C'est la cause racine des deux bloquants CA-02 et QU-01 : SellDialog et la modale de
   suppression d'À comptabiliser. C'est aussi celle des voiles qui ne couvrent ni la barre du haut ni le menu
   (menu ⋯ des commandes, liste de périmètre des Statistiques).

**Spécification.**

- `AppShell` : colonne `flex min-h-dvh flex-col`, contenu en `flex-1 min-h-0`. `min-h-screen` est retiré de `body`,
  de `Frame`, de `calendrier/page.tsx:182` et de `not-found.tsx`.
- Marge basse du contenu sur mobile : `calc(var(--dock-h) + env(safe-area-inset-bottom) + 72px)`, avec
  `--dock-h: 57px` exposé par le dock et 72 px réservés à la bulle.
- Animation d'entrée en **opacité seule**, ou en `animation-fill-mode: backwards`. Aucun ancêtre d'un overlay ne
  garde de `transform`.
- Tout overlay (modale, menu, voile, liste) passe par un portail vers `document.body` (§ 2.15 et 2.16).

**Vérification :** la sonde M2 doit montrer un débordement nul, et la sonde X1 doit donner `couvreTopbar: true`
et `haut ≥ 0`.

**Couvre :** CA-05, PI-1, QU-16, CO-39, ainsi que la cause racine de CA-02, QU-01 et PI-46.

### 2.7 Cadre : menu latéral et rail

| Exigence | Correctif | Ids |
|---|---|---|
| Entrée active visible dès le premier affichage | Le fond va sur le lien lui-même : `active ? "bg-[var(--acc)] text-[var(--acc-ink)]"`. L'indicateur mesuré en JS disparaît (`Sidebar.tsx:140-148`, `:188-194`). Sondes M1 (1:1 en clair) et X4 (décalé de 12 px après repli). | CA-06 |
| État annoncé | `aria-current={active ? "page" : undefined}`, rendu dès le serveur, sur les liens du menu (`:206`) et du dock (`:279`). | CA-06 |
| Rail replié | Icône seule, avec `aria-label={item.label}` (« Tableau de bord ») et une info-bulle. Plus de code mono (« DASH »). Le compteur garde son **chiffre** en badge (`min-w-4`, 12 px) ; lien nommé « À comptabiliser, 3 articles ». | CA-08, CA-42 |
| Bouton de repli | `aria-expanded={!replie}`, avec le libellé « Réduire le menu » ou « Agrandir le menu » (`:155-162`). | CA-43 |
| Pied | Les liens légaux passent en `<Link>` (plus de rechargement complet), 12 px, `--ink2`, `inline-flex min-h-6 py-1 gap-x-3` ; le © perd son `opacity-70`. Menu replié : liens légaux dans le menu de l'avatar. Le pied reste visible : la barre de Mise en vente démarre à `left: var(--sidebar-w)` (§ 2.11). | CA-31 |
| Alignement | Ajouter `text-left` sur le bouton de déconnexion (`:249`). | CA-44 |
| Repères | `<nav aria-label="Navigation principale">`. | CA-45 |
| Vocabulaire unique | « Tableau de bord » (et non « Dashboard »), « Réglages » (et non « Prompts »), « Se déconnecter » (et non « Déconnexion » ni « SORTIR »), « Adresse e-mail » (et non « Email »). Fichiers : `Sidebar.tsx:38`, `:51`, `:252`, `:296` ; `TopBar.tsx:13`, `:20` ; `AccountMenu.tsx:55` ; `not-found.tsx:16` ; login `:76`, `:132` ; signup `:101`. | CA-47, SU-37, PI-29 |

### 2.8 Cadre : dock mobile et feuille « Plus »

- **Cause.** Dix tuiles de 62 px dans 390 px : quatre destinations sont hors écran sans aucun indice (sonde X9 :
  `scrollW` 620 pour 390). La tuile « SORTIR » déconnecte d'un geste, au milieu d'un ruban qu'on fait défiler au
  doigt (`Sidebar.tsx:65`, `:90-91`, `:274-298`).
- **Spécification** (`docs/design-system.md` § 10) :
  - **5 places fixes, sans `overflow-x`** : Accueil, Stock, Vendre, À compta (avec badge), Plus.
  - Libellés en mots, en 12 px ; `aria-current="page"` sur l'onglet actif.
  - Hauteur : `--dock-h` plus `env(safe-area-inset-bottom)`.
  - « Plus » ouvre une feuille (`Sheet`, § 2.15) avec Commandes, Calendrier, Statistiques, Mise en vente et Studio
    (marqués « sur ordinateur »), Réglages, Mon compte, les liens légaux et « Se déconnecter ».
  - « Vendre » ouvre la fenêtre de vente (§ 2.24). **Il manque une étape** : choisir l'article. Elle n'est
    spécifiée nulle part (question 6, § 7).
- **Couvre :** CA-07, CA-08.

### 2.9 Cadre : barre du haut, titres de page, thème, lien d'évitement

| Exigence | Correctif | Ids |
|---|---|---|
| Un `<h1>` par page | `TopBar` passe en `<header>` et rend le titre en `<h1>` (`TopBar.tsx:36-40`). `CardTitle` rend un `<h2>`, avec une prop `as` pour descendre en `h3` (`console.tsx:67-71`). `Module` reçoit `aria-labelledby`. Aujourd'hui aucune page n'a de `<h1>`, connexion comprise. | CA-29, PI-4, QU-15, CO-35, SU-36 |
| Titre d'onglet propre à chaque page | Layout racine : `title: { template: '%s — MyFlip', default: 'MyFlip' }`. Un `layout.tsx` par segment fixe `metadata.title` (« Stock », « Connexion », « Créer un compte », « Nouveau mot de passe », « Page introuvable », « Mon compte », « Démarrage »…). `TitreOnglet` garde son préfixe « (N) ». | CA-29, CO-35 |
| Titres manquants dans la barre | Ajouter `'/demarrage': { title: 'Démarrage' }`. La 404 affiche « Page introuvable », et `/studio/bilan` affiche « Studio — Bilan » au lieu de « Studio ». | CA-46, CO-36, SU-36 |
| Lien d'évitement | Premier enfant d'`AppShell` : `<a href="#contenu" className="sr-only focus:not-sr-only …">Aller au contenu</a>`. Sur le `<main>` du Frame : `id="contenu" tabIndex={-1}`. | CA-45 |
| Focus non masqué par la barre collante | `html { scroll-padding-top: 74px }`, soit 62 + 12, et `5.5rem` sur la landing. | CA-53, CO-44 (SUPPOSÉ) |
| Cibles tactiles | Thème, cloche et avatar en `h-11 w-11 md:h-10 md:w-10` (`ThemeToggle.tsx:34`, `NotificationBell.tsx:41`, `AccountMenu.tsx:22`). | CA-49 |
| Bouton de thème | L'état est lu par `useSyncExternalStore`, avec un instantané serveur à `null`. L'icône est choisie en CSS (`[data-theme=dark]` montre le soleil). Tant que l'état est inconnu, `aria-label="Changer de thème"`. | CA-40 |
| `theme-color` | Une seule `<meta name="theme-color">`, sans `media`. Le script inline et `ThemeToggle` la règlent sur la valeur de `--bg` du thème appliqué (`app/layout.tsx:44`, `:59-62`, `:77-81`). | CA-39 |
| Survol tactile | `tailwind.config.ts` : `future: { hoverOnlyWhenSupported: true }`. | CA-41 |
| Repli de `metadataBase` | Remplacer le repli sur l'ancien hôte `compta-polos.vercel.app` (`app/layout.tsx:29-31`) par `VERCEL_PROJECT_PRODUCTION_URL` ou par l'hôte `myflip-app`. SUPPOSÉ : cela dépend de la variable en production. | CA-65 |

### 2.10 Cadre : cloche de notifications

- **Mobile (bloquant).** Le panneau, positionné `absolute right-0 w-[min(384px,92vw)]`, s'aligne sur la cloche et
  déborde d'environ 70 px à gauche (`NotificationBell.tsx:54` ; captures `mc/etat.shell.notifications-panel.png`
  et `ms/…vide.png`). Sous `md`, il faut le fixer à l'écran :
  `fixed inset-x-4 top-[70px] md:absolute md:inset-x-auto md:right-0 md:top-[calc(100%+10px)] md:w-[384px]`, avec
  `max-h-[calc(100dvh-160px)]` sur la liste.
- **Fermeture.** `useDismissOnOutside(open, onClose, triggerRef)` (`lib/useDismiss.ts:16-35`) :
  - Échap rend le focus via `triggerRef.current?.focus()` ;
  - le clic extérieur s'écoute sur `pointerdown`, pas seulement sur `mousedown` (le comportement du toucher iOS
    est SUPPOSÉ) ;
  - les listes reçoivent `overscroll-contain` (`NotificationBell.tsx:78`, `ChatBot.tsx:158`).
- **Badges :** voir § 2.2 (`--alert`, `--notice-ink`) et § 2.19.
- **Couvre :** CA-01, CA-48. Le compte faux du badge (CA-30) est traité en § 3.1.

### 2.11 Cadre : bulle de l'assistant et barres fixes

**Bulle de l'assistant** (`ChatBot.tsx:117` : `fixed bottom-20 right-6 z-50`, `md:bottom-6`). Elle recouvre :

- le dock avec la barre d'accueil iPhone (sondes MO2 : 11 px ; X2) ;
- les boutons Détail et Supprimer des cartes du Stock (ST-31) ;
- « Continuer » et « Générer l'annonce » de Mise en vente (QU-18) ;
- le bouton ⋯ de la dernière commande ;
- « Générer 8 images » et la confirmation de dépense du Studio (SU-57) ;
- les flèches des sélecteurs de Mon compte (CO-38).

Spécification :

- `z-fab` ;
- `bottom: calc(var(--dock-h) + env(safe-area-inset-bottom) + 12px)` sur mobile, `md:bottom-6` ;
- le cadre expose `--fab-offset` : une page qui ouvre une barre d'actions y inscrit la hauteur de sa barre, et la
  bulle remonte d'autant ;
- le contenu réserve une gouttière basse égale à la hauteur de la bulle plus 16 px (72 px sur mobile, 88 px sur
  ordinateur) ;
- la bulle est masquée tant qu'une sélection du Stock est active (ST-30).

**Barres d'actions fixes** (sélection du Stock `:1603-1604` ; Mise en vente `:758`). Spécification :

- `z-dock`, fond opaque, possible grâce aux canaux (§ 2.1) ;
- sur mobile : `bottom: calc(var(--dock-h) + env(safe-area-inset-bottom) + 8px)` ;
- sur ordinateur : `left: var(--sidebar-w)` au lieu de `left-0`, pour ne plus recouvrir le pied du menu (sondes X3
  et M3) ;
- la liste réserve en bas la place de la barre ouverte.

Sonde MO2 avec une zone sûre de 34 px : la barre de Mise en vente chevauche le dock de 33 px, la barre groupée du
Stock de 37 px.

**Couvre :** CA-27, QU-18, QU-19, ST-30, ST-31, SU-57, CO-38, QU-17.

### 2.12 Bouton

Variantes et tailles : celles de `docs/design-system.md` § 9 (`primary`, `secondary`, `ghost`, `danger`, `bar` ;
`sm`, `md`, `lg`, `icon`).

- **Mobile :** 44 px minimum de hauteur et de zone de clic (CA-49, ST-32, QU-60, QU-91, PI-54).
- **Focus :** `focus-visible:outline-2 outline-offset-2 outline-[var(--focus)]`.
- **Désactivé :** par tokens (`--disabled-bg`, `--disabled-ink`), jamais par opacité. En sombre, un bouton lime à
  60 % ressemble à un bouton actif (QU-47).
- **En cours :** `aria-busy="true"` et `aria-disabled="true"`, **pas** `disabled`. Le `disabled` natif retire le
  focus, qui retombe sur `<body>` (CO-32). Spinner à côté du libellé, libellé en cours (« Enregistrement… »),
  largeur figée, clics suivants ignorés dans le gestionnaire. Cela supprime les doubles envois (CO-29) et place le
  spinner sur le bouton réellement cliqué (CO-31).
- **Raison d'un blocage :** le texte est **visible** à côté du bouton et relié par `aria-describedby`. Jamais dans
  le `title` d'un bouton `disabled` (SU-13, SU-43, CO-25, QU-39).
- **Bouton à icône seule :** `aria-label` qui nomme l'action **et** l'objet (« Supprimer ADI1 », « Fermer le
  détail du jour ») (ST-41, CA-22, SU-42, SU-43).
- **Libellé :** un verbe et un objet (« Enregistrer la vente », « Supprimer l'article »), jamais « OK », « Valider »
  ou « Appliquer » seul.
- **Variante `danger`** sans double couleur de texte (`Integrations.tsx:38` et `:714` mélangent `--ink2` et
  `--neg` : CO-50, SUPPOSÉ). Fusion des classes avec `tailwind-merge`.

**Couvre :** CO-32, QU-47, CA-49, ST-32, CO-50. La règle s'applique aussi aux ids d'écran cités plus haut.

### 2.13 Champ, zone de texte, sélecteur, date

| Exigence | Spécification | Ids |
|---|---|---|
| Pas de zoom iOS | `text-base md:text-sm`, soit 16 px sous 768 px, et 44 px de haut, pour `input`, `select` et `textarea`. Cela inclut l'authentification, le chat, les fenêtres de vente, la nouvelle commande, les filtres du Stock, la pastille de statut des cartes (`StatutPill` taille `md`), le sélecteur groupé, `/parametres`, Mon compte et le Studio. Sondes MO1 et G6. | CA-10, QU-11, ST-29, SU-33, CO-14 |
| Libellé relié | `useId()`, `<label htmlFor>`, jamais un placeholder en guise de libellé. Le placeholder montre un exemple. Les aides sont reliées par `aria-describedby`. | CA-24, CO-11, CO-12, SU-26, CA-26, ST-8, QU-68, QU-69, QU-70 |
| Erreur | Prop `error` : `aria-invalid`, message **sous** le champ avec son id, relié par `aria-describedby`. Focus sur le premier champ invalide à l'envoi. L'erreur n'apparaît qu'**après** une tentative d'envoi. Les erreurs générales vont dans un `<p role="alert">`. Le toast est réservé au succès. | CA-23, CO-13, SU-27, QU-39, QU-59, CA-59 |
| Bord visible | `--border-input` à 3:1 minimum (§ 2.2) ; fond du champ = `--surface` (aujourd'hui `--tint`, à 1,09:1 de la carte). | CA-12, QU-10, SU-31, CO-10 |
| Focus visible | `focus-visible:ring-2 ring-[var(--focus)] ring-offset-2`. Plus aucun `outline-none` sans remplacement. `_ui.tsx:14` et `PromptsStudio.tsx:41` le font déjà : c'est le modèle. | ST-6, SU-61, CO-45, QU-68 |
| Saisie automatique | `name` et `autoComplete` justes : `current-password`, `new-password`, `email`, `username`. Champ secret d'une clé d'API : `name="openrouter-key"`, `autoComplete="new-password"`, `data-1p-ignore`, `data-lpignore="true"`. | CO-11, CO-47 |
| Nombres | `inputMode="decimal"` pour les prix. `min="0.01"` quand le prix doit dépasser 0, avec un message plutôt qu'un `return` muet. | CA-54, ST-27, QU-50 |
| Date | Provisoirement, `type="date"` avec `jourParis`. À terme, la primitive `jj/mm/aaaa` de `docs/design-system.md` § 9 (question 8). | ST-24 |
| Valeur en lecture seule | Elle ne prend jamais l'apparence d'un champ (`<dl>` en texte simple). | SU-44 |

**États à dessiner :** repos, survol (pointeur fin seulement), focus, rempli, erreur, désactivé, lecture seule, en
cours de chargement des options (« Chargement des étiquettes… », CO-30).

### 2.14 Case à cocher, choix unique, contrôle segmenté

- **Case à cocher :** 16 px, 20 px sur mobile, dans un `<label>` de 44 × 44 px (`p-3 -m-3`) (ST-32 :
  `app/stock/page.tsx:686-692`).
- **Choix unique :** un `<input type="radio">` natif stylé, dans `<fieldset><legend>`. Ce n'est jamais un bouton
  `role="radio"` sans gestion des flèches (QU-43 : `NewCommandeModal.tsx:410-441`), ni un groupe de boutons à
  bascule (QU-70 : `FicheArticle.tsx`). L'état sélectionné est porté par une bordure accent de 2 px et une coche,
  jamais par le fond seul (QU-10).
- **Contrôle segmenté** (périodes du tableau de bord, « Façon de générer » du Studio) :
  `role="radiogroup" aria-label="Période"`, boutons `role="radio" aria-checked`, tabindex itinérant et flèches. À
  défaut, un groupe de boutons `aria-pressed`. Libellés en mots : « Mois », « 30 jours », « Trimestre », « Tout »
  (PI-25, SU-25).

### 2.15 Une seule modale : Dialog, AlertDialog, Sheet

**Cause.** Quatre implémentations divergentes :

- `components/Modal.tsx` gère Échap et le verrou de défilement, mais pas le focus (sonde X6 : `focusInitial`
  faux, focus sur « Dashboard » après 25 Tab, pas de retour au déclencheur) ;
- `SellDialog.tsx:86-203`, sans portail ;
- `a-comptabiliser/page.tsx:314-356`, sans portail ni Échap ;
- `calendrier/page.tsx:551-615`, sans portail ni Échap, avec une croix sans nom.

S'y ajoutent le zoom photo de Mise en vente (`:725-744`, un `<div onClick>`) et quatre `window.confirm` natifs
(`stock:1162`, `commandes:508`, `parametres:410`, `Integrations.tsx:348`).

**Spécification.**

- **Mécanique :** `<dialog>` ouvert par `showModal()`, ou Radix Dialog. Une nouvelle dépendance doit être justifiée
  (PRD § 10) ; `<dialog>` n'en demande aucune. Rendu par portail vers `document.body`.
- **Rôles :** `role="dialog"`, ou `"alertdialog"` pour une confirmation destructive, `aria-modal="true"`,
  `aria-labelledby` vers le titre.
- **Focus :**
  - à l'ouverture, sur `[autofocus]`, sinon sur le premier champ, sinon sur le titre ;
  - piégé dans la fenêtre, arrière-plan `inert` ;
  - à la fermeture, rendu au déclencheur mémorisé à l'ouverture.
- **Fermeture :** Échap, croix de 44 px (`aria-label="Fermer"`), clic sur le voile.
  - Prop `pending` : pendant l'envoi, ni Échap ni clic extérieur, et « Annuler » est désactivé.
  - Formulaire modifié : le clic extérieur est inactif, et Échap demande « Abandonner la saisie en cours ? », avec
    les boutons « Abandonner » et « Continuer la saisie ».
- **Voile :** token `--veil` (§ 2.1), qui couvre la barre du haut et le menu.
- **Mise en page :**
  - `max-h-[calc(100dvh-2rem)]`, seul le corps défile ;
  - pied fixe et **obligatoire** pour un formulaire : `<Modal as="form" onSubmit footer={…}>` ;
  - un seul défilement par vue : retirer le `max-h-[70vh] overflow-y-auto` imbriqué de `parametres/page.tsx:465`.
- **Mobile, sous 768 px :** feuille par le bas (`Sheet`), pleine largeur, bouton principal pleine largeur dans la
  zone du pouce, `pb-[max(1rem,env(safe-area-inset-bottom))]`.
- **Empilement :** `z-modal`, au-dessus de la bulle (`z-fab`). Les toasts (`z-toast`) restent au-dessus pour garder
  « Annuler ».

**Variante AlertDialog** (confirmation destructive) :

- titre = action + objet (« Supprimer CHD3 ? ») ;
- corps = ce qui est perdu, chiffré (« L'article et son historique seront effacés. Cette action est
  définitive. ») ;
- boutons = verbe + objet (« Supprimer l'article », « Annuler ») ;
- focus initial sur « Annuler ».

**Migrations :** les quatre implémentations ci-dessus, le zoom photo et les quatre `window.confirm`. Les textes de
chaque écran sont en § 3. Le volet de l'assistant reçoit les mêmes règles de dialogue (rôle, Échap, focus) sans
voile sur ordinateur (CA-25, § 3.1).

**Vérification :** la sonde X6 doit renvoyer `focusInitial` vrai, un focus resté dans la fenêtre après 25 Tab et un
retour au déclencheur. La sonde X1 doit montrer que le voile couvre la barre du haut. Après la refonte, éprouver la
primitive avec `/break` (à lancer à la main).

**Couvre :** CA-02, CA-18, CA-19, CA-20, CA-21, QU-01, QU-02, QU-03, ST-43, SU-28, PI-35, CA-25 (en partie),
ST-23 (en partie).

### 2.16 Menu, liste déroulante, popover

- **Menu** (⋯ des commandes, avatar, « Plus ») :
  - le déclencheur porte `aria-haspopup="menu"`, `aria-expanded` et `aria-controls` ;
  - à l'ouverture, focus sur le premier item ; ↑ ↓ Début Fin pour naviguer, Entrée pour choisir ;
  - Échap ferme le menu et rend le focus ; le clic extérieur s'écoute sur `pointerdown` ;
  - rendu en portail, `z-popover`.
  - Les menus maison qui n'ont rien de tout cela, comme le ⋯ des commandes (QU-30), migrent sur cette primitive.
- **Liste de choix** (périmètre des Statistiques, `statistiques/page.tsx:114-197`) : modèle APG listbox, ou
  `<select>` natif.
  - `aria-labelledby` pointe vers « Périmètre d'analyse » ;
  - à l'ouverture, focus sur l'option active ; ↑ ↓ Début Fin, Entrée, Échap ;
  - voile en portail, `overscroll-behavior: contain` (PI-46).
- **Popover** (cloche) : voir § 2.10.

**Couvre :** PI-46, CA-48, CA-01, ainsi que la mécanique de QU-30.

### 2.17 Onglets

- Onglets dans une page : modèle APG (tabindex itinérant, ← →, `aria-controls` vers un `tabpanel`). Onglets qui
  changent l'URL : des `<Link aria-current="page">`. Les faux onglets de `TableauCases.tsx:326-345` et
  `parametres/page.tsx:250-270` (`role="tab"` sans panneau ni flèches) disparaissent (SU-25).
- L'onglet actif se lit côté serveur par `searchParams`, pour que `?onglet=studio` ne fasse plus d'abord flasher
  l'onglet Annonces (`parametres/page.tsx:185-188`, SU-37).
- La sous-navigation du Studio sort du bandeau `role="note"` (`app/studio/layout.tsx:16-24`) : onglets « Coloris ·
  Bilan · Réglages » avec `aria-current="page"` (SU-36).

**Couvre :** SU-25, SU-36, SU-37 (en partie).

### 2.18 Tableau et cellule modifiable

- **Sémantique :** `<table>`, `<th scope="col">` partout, y compris la première colonne (SU-53 : Bilan ; QU-35 :
  détail des commandes, aujourd'hui une grille de `<div>`).
- **Tri :** `<th aria-sort="ascending|descending|none"><button type="button">Libellé<span aria-hidden="true">↑</span></button></th>`
  (ST-7 : `stock/page.tsx:1458-1469`).
- **Colonnes :** `table-fixed` avec un `<colgroup>` de largeurs, et le même padding sur `th` et `td`, pour que rien
  ne bouge à l'édition ni à l'arrivée des données (ST-47).
- **Actions :** colonne collante à droite (`position: sticky; inset-inline-end: 0`), fond `--surface`, filet, et
  ombre de bord tant qu'il reste du contenu à droite (ST-14).
- **Débordement :** un tableau large secondaire défile dans son propre conteneur, avec une ombre d'indice. La page,
  elle, ne défile jamais à l'horizontale (PRD § 3, critère 5). Sous 768 px, le tableau devient des cartes.
- **Virtualisation :** **une seule constante** `ROW_H` (et `CARD_H`) sert à la fois au CSS (`h-[var(--row-h)]` sur
  le `<tr>`) et à `estimateSize`. Ou bien on mesure la première ligne montée. Aujourd'hui l'estimation dit 45 px
  pour une ligne réelle de 52, et 116 px pour une carte réelle de 190 : sur 1 200 articles, l'écart atteint
  environ 8 400 px sur ordinateur et 88 800 px sur mobile (`stock/page.tsx:1053-1073`). Un test Playwright doit
  comparer `getTotalSize()` à la hauteur rendue. C'est la règle du PRD § 10 (ST-16).
- **Cellule modifiable** (`components/EditableCell.tsx:119-127`, un `<div onDoubleClick>`) :
  - la valeur devient un `<button type="button" aria-label="Modifier {champ} de {sku} : {valeur}">` ;
  - Entrée ou F2 ouvrent l'édition, Tab enregistre et passe à la cellule suivante, Échap annule ;
  - le double-clic reste pour la souris (ST-5).
- Le **sélecteur de statut natif** du Stock est **conservé** (PRD § 10).

**Couvre :** ST-5, ST-7, ST-14, ST-16, ST-47, ainsi que la règle de SU-53 et QU-35.

### 2.19 Pastille de statut, badge, canal, compteur

- **Tokens :** `--statut-<x>-texte`, `--statut-<x>-fond`, `--statut-<x>-repere`, et `--canal-<x>-texte`,
  `--canal-<x>-fond`, redéfinis par thème (PRD § 8). Ils remplacent les hex en ligne de `lib/statutColors.ts`,
  `lib/canalColors.ts`, `StatutPill.tsx:62-74` (options figées en `#ffffff` et `#1a1c1c`) et `StatutBadge.tsx:10`
  (ST-52, QU-07).
- **Texte :** toujours le token `texte`, à 4,5:1 minimum (valeurs de § 2.2). La couleur « repère » (`c.color`) sert
  au point et au filet, jamais au texte (ST-9).
- **Focus :** anneau `--focus` de 2 px, décalé de 2 px (ST-13 : 2,05:1 aujourd'hui).
- **Canal :** texte à 4,5:1 minimum, au moins 12 px (ST-11 : texte de 10 px aujourd'hui).
- **Compteur :** 12 px minimum ; fond `--alert` corrigé (§ 2.2) ; chiffre toujours visible, menu replié compris ;
  nom accessible complet (CA-13, CA-42).
- Le nom du statut est **toujours** écrit : la couleur ne le porte jamais seule.
- Les teintes elles-mêmes sont **reportées** (§ 5).

**Couvre :** ST-9, ST-11, ST-13, ST-52, QU-07, CA-13, CA-42, PI-8.

### 2.20 Toasts

Créer un composant client `<AppToaster>`, à rendre **avant** `<AppShell>` dans `app/layout.tsx:82-85`, pour qu'il
s'abonne en premier : c'est la cause supposée du toast Trello perdu (CA-15 = CO-4).

- **Thème :** lu sur `data-theme`, par `MutationObserver`. Aujourd'hui les toasts sont blancs en sombre et en police
  système (sonde MO3).
- **Position :** `bottom-right` ; `offset={{ bottom: 96 }}` sur ordinateur (au-dessus de la bulle) ;
  `mobileOffset={{ bottom: 'calc(var(--dock-h) + env(safe-area-inset-bottom) + 12px)' }}`. Sonde MO3 : les toasts
  couvrent aujourd'hui 2 996 px² de la bulle et 18 258 px² du dock.
- **Style :** `toastOptions.className` branché sur les tokens (`bg-surface`, bord `--border`, `text-ink`,
  `font-sans`) ; `z-toast`.
- **Durée :** `closeButton` activé. Un toast d'erreur ou porteur d'une action reste jusqu'à sa fermeture
  (`duration: Infinity`, via un wrapper `toastErreur`). Un succès dure 4 s. Un toast avec « Annuler » dure 5 s
  (CA-37).
- **Doublons :** un `id` fixe pour les messages récurrents (`id: 'session'`).
- Les erreurs de formulaire ne passent **pas** par un toast : elles s'affichent sous le champ (§ 2.13).

**Couvre :** CA-14, CA-15, CO-4, CA-37, QU-20.

### 2.21 États vide, erreur, chargement ; pages `error` et `loading`

**Composants :**

- `EmptyState` : titre, une phrase qui dit quoi faire, un bouton.
- `ErrorState` : `role="alert"`, titre « Impossible de charger … », texte « Vérifie ta connexion puis réessaie. »,
  bouton « Réessayer » qui appelle `refetch()`, et le détail technique en petit, sous le reste.
- `Skeleton` : `aria-busy="true"`, avec la forme du contenu.

Le `Loader` actuel est remplacé. En attendant, il reçoit `role="status" aria-live="polite"`, est rendu dès le
montage, porte un `svg aria-hidden`, et sa police vient de la classe `font-sans` (`Loader.tsx:15-76`, sonde F1)
(CA-50, PI-5).

**Règles :**

- Chargement, vide et erreur sont trois états distincts. On n'affiche **jamais** « 0 », « 0,00 € », « Aucune
  commande » ou « Non défini » pendant un chargement ou une erreur. Les écrans concernés sont en § 3 : ST-18,
  QU-22, QU-23, QU-58, CO-34, PI-20, PI-33.
- Le cadre de la page (titre, sélecteur de période, filtres) reste affiché pendant le chargement et l'erreur
  (PI-18, PI-19).
- Pages par segment :
  - `app/error.tsx` (client), avec le titre « Cette page n'a pas pu s'afficher », le texte « Réessaie ; si ça
    recommence, recharge la page. » et les boutons « Réessayer » (`reset()`) et « Aller au tableau de bord » ;
  - `app/global-error.tsx`, équivalent, avec son propre `<html>` ;
  - un `loading.tsx` (squelette) par segment : `dashboard`, `stock`, `commandes`, `a-comptabiliser`,
    `mise-en-vente`, `calendrier`, `statistiques`, `studio`, `studio/[cle]`, `studio/bilan`, `parametres`,
    `compte`, `demarrage` ;
  - un `error.tsx` sous `app/studio/`, avec le texte « Le Studio n'a pas pu se charger. » et le bouton
    « Réessayer ».

**Couvre :** CA-16, SU-22, CA-50, PI-5, PI-19, ainsi que la règle de PI-18.

### 2.22 Données et requêtes : erreurs visibles, pas de page blanche

Ce chantier est réglé une fois, dans `app/providers.tsx` et `lib/hooks.ts`.

- **Nouvelles tentatives :** `defaultOptions.queries.retry: (n, e) => !estStatut(e, 401, 403, 404) && n < 1`, et
  `retryDelay: 800`. Aujourd'hui, 3 tentatives repoussent l'état d'erreur à environ 7 s (CA-38, SUPPOSÉ ; PI-19).
- **Données précédentes :** `placeholderData: keepPreviousData` sur `useDashboard`, `useStats` et `useCalendar`.
  Pendant `isFetching`, les cartes passent à 60 % d'opacité et la section porte `aria-busy="true"`. Plus de page
  blanche à chaque clic sur une période (PI-18).
- **Erreurs de mutation :** un `MutationCache.onError` global affiche un toast qui nomme l'objet et reprend le
  message du serveur : « Modification de LAC9 non enregistrée : Ce SKU existe déjà. ». Aujourd'hui le retour
  arrière est silencieux (`lib/hooks.ts:189-191`). Les succès passent par `meta.succes` (ST-4, et la cause de
  QU-52 et SU-42).
- **Session expirée :** un seul gestionnaire de 401.
  - `toast.error('Session expirée. Reconnecte-toi pour reprendre ici.', { id: 'session' })` ;
  - puis `location.href = '/login?callbackUrl=' + encodeURIComponent(location.pathname + location.search)`, avec un
    garde-fou contre la double redirection ;
  - pas de nouvelle tentative sur un 401 (CA-17).
- **`callbackUrl` validé :** il doit être de même origine, sinon on renvoie vers `/dashboard` (CA-34, § 3.2).
- **Appels hors React Query :** toujours `try/catch/finally`.
  - L'état « en cours » est remis à zéro dans `finally`.
  - En cas d'échec : « Impossible de joindre le serveur. Vérifie ta connexion et réessaie. ».
  - `res.ok` est lu avant `res.json()`.
  - Écrans concernés (§ 3) : CA-28, CA-33, CA-57, SU-19, SU-20, CO-29, QU-38, ST-51, QU-88.
- **Une source par donnée :** les réglages passent tous par `useReglages()`, et toute mutation qui les modifie
  appelle `invalidateQueries({ queryKey: ['reglages'] })` (CO-2, CO-48, § 3.14).

**Couvre :** CA-17, CA-38, PI-18, ST-4, ainsi que le patron des ids cités.

### 2.23 Mouvement : ce qui n'est pas de l'identité

Le style du mouvement (courbes, durées, animations signatures) est **reporté**. Restent des règles de fondation :

- Aucun `transform` résiduel sur un ancêtre d'overlay (§ 2.6, PI-1).
- `prefers-reduced-motion` est respecté **aussi** par les animations pilotées en JS. Le `CountUp` du calendrier
  l'ignore aujourd'hui (`calendrier/page.tsx:27-55`, PI-44). Pas de `!important` global.
- Le survol est réservé aux pointeurs qui le supportent et aux éléments **interactifs**. Ni KPI ni ligne inerte ne
  se soulève au survol (ST-46, PI-45, CA-41).
- La transition porte sur des propriétés nommées, jamais `transition-all` (PI-45).
- Aucune animation infinie de plus de 5 s sans bouton de pause (WCAG 2.2.2) : couronne et reflet du calendrier
  (PI-45), frise de la landing (CO-41).

### 2.24 Composants métier partagés

**A. Fenêtre de vente unique (`FenetreVente`).** Elle remplace `SellModal` (Stock) et `SellDialog` (À
comptabiliser). Le PRD § 8 et la story 31 le demandent.

- **Mécanique :** montée sur la primitive Dialog (§ 2.15), avec portail. C'est ce qui corrige le bloquant CA-02 et
  QU-01 côté fenêtre.
- **Champs**, chacun avec `<label htmlFor>` et l'ordre suivant :
  1. Prix de vente : `autoFocus`, prérempli, `inputMode="decimal"`, `min="0.01"`, 16 px sur mobile ;
  2. Date de vente : prérempli avec `dateVente` si elle est connue, sinon `aujourdhuiParis()` ;
  3. Canal ;
  4. Compte de vente : affiché pour Vinted, Vinted Go et Vestiaire Collective seulement, prérempli avec
     `article.compteVente`.
- **Erreur :** un prix nul ou absent n'est plus un `return` muet (`SellModal.tsx:47-52`, `SellDialog.tsx:78-83`).
  Le message « Indique un prix de vente supérieur à 0 € » s'affiche sous le champ, avec `aria-invalid` et le focus
  sur le champ. Les erreurs du serveur vont dans un `role="alert"`.
- **Textes :**
  - titre « Enregistrer la vente de CHD3 » depuis le Stock, « Comptabiliser la vente de CHD3 » depuis À
    comptabiliser ;
  - bouton principal « Enregistrer la vente », puis « Enregistrement… » pendant l'envoi ;
  - bouton secondaire « Annuler ».
- **État propre :** une instance de mutation dédiée, `sell.reset()` à l'ouverture. Aujourd'hui, dans le Stock, une
  erreur laissée par l'édition en ligne s'affiche dans la fenêtre, et une édition en cours désactive « Confirmer la
  vente » (ST-26 : `stock/page.tsx:931`, `:1647-1648`).
- **Couleurs :** tokens seulement. Le `#16261D` codé en dur, qui garde la fenêtre sombre en thème clair, disparaît
  (QU-09).
- **Mobile :** feuille par le bas, bouton principal sous le pouce.
- **Célébration :** pas de confettis si la marge est négative ; la marge s'affiche par `signedEur` (ST-49).
- **Contrat d'API inchangé :** même `PATCH` qu'aujourd'hui (PRD § 5).

**Couvre :** ST-28, QU-48, QU-09, CA-54, ST-27, QU-50, ST-8, ST-26, CA-23 et CA-24 (champs de vente), QU-59, et
QU-51 pour le vocabulaire. La date par défaut d'À comptabiliser (QU-49) est traitée en § 3.8.

**B. Confirmation destructive** (`AlertDialog`, § 2.15). Elle remplace les quatre `window.confirm`. Les textes de
chaque écran sont en § 3 : ST-1, ST-2, ST-23, QU-29, QU-57, QU-61, SU-42, SU-43, CO-49.

**C. « Annuler » plutôt que « Êtes-vous sûr ? ».** Pour une action fréquente et réversible, on agit tout de suite
et le toast propose « Annuler » pendant 5 s : décision du Studio (SU-05), remise en stock (QU-52), suppression
d'un lot dans une commande en cours de saisie (QU-45), suppression d'un prompt (SU-42).

---

## 3. Correctifs par écran

Ne figurent ici que les symptômes **non couverts** par une fondation de § 2. Ils sont classés du bloquant au
mineur. Quand une fondation s'applique à l'écran, on y renvoie en une ligne. Les correctifs qui toucheraient un
calcul métier ou un contrat d'API hors Studio sont signalés **PRD § 5**. Ils sont hors du périmètre de la refonte
et demandent l'accord d'Aramis (question 3, § 7). Pour chacun, une variante limitée à l'affichage est proposée
quand elle existe.

Format : **id** · gravité · localisation : symptôme. **Correctif.** **Textes** prêts à coller.

### 3.1 Cadre : assistant IA et cloche

- **CA-30** · majeur · `components/NotificationBell.tsx:33`, `:39`, `:46-49`, `:60-63` ;
  `dc/etat.shell.notifications-panel.png`. Le badge et l'en-tête disent « 5 » et « 5 à traiter », alors que les
  lignes totalisent 29 éléments (3 + 2 + 3 + 5 + 16), dont 16 seulement « à surveiller ». Le badge compte des
  catégories, pas des actions.
  **Correctif :** badge = somme des `n.count` de sévérité « action » (13 ici).
  **Textes :** en-tête « 13 actions à faire · 16 à surveiller » ; nom du bouton « Notifications, 13 actions à
  faire ».
- **CA-28** · majeur · `ChatBot.tsx:62-63`, `:74`, `:92-93`, `:97`. `res.json()` est lu avant `res.ok`. Une page
  d'erreur HTML (500, 504) s'affiche donc « ❌ Unexpected token '<'… », sinon « ❌ Erreur. ». Pas de piste, pas de
  bouton pour renvoyer.
  **Correctif :** lire le corps dans un `try/catch` ; un 401 suit le parcours de session (§ 2.22) ; ajouter un
  bouton « Renvoyer » qui rejoue le dernier message.
  **Texte :** « Je n'ai pas pu répondre. Vérifie ta connexion, puis renvoie ton message. »
- **CA-25** · majeur · `ChatBot.tsx:113-128`, `:131-155`. Le volet n'est pas un dialogue : ni rôle, ni Échap. Le
  focus n'entre pas dans la zone de saisie. Le bouton flottant est démonté, si bien que le focus tombe sur
  `<body>`, et il n'est pas rendu à la fermeture.
  **Correctif :**
  - `role="dialog"` et `aria-labelledby` vers le titre « Assistant IA » ;
  - focus sur la zone de saisie à l'ouverture, Échap ferme ;
  - bouton flottant gardé monté (`hidden`) et refocalisé à la fermeture ;
  - croix en `h-11 w-11` sur mobile.
- **CA-26** · majeur · `ChatBot.tsx:158`, `:193-199`, `:205-217`. Les réponses ne sont pas annoncées, l'attente
  n'est qu'un « … » muet, et la zone de saisie n'a pour nom que son placeholder.
  **Correctif :** `role="log" aria-live="polite"` sur la liste ; bulle d'attente en `role="status"` ;
  `aria-label="Message à l'assistant"` sur la zone de saisie.
  **Texte :** bulle d'attente « L'assistant rédige… ».
- **CA-35** · majeur · SUPPOSÉ · `ChatBot.tsx:132`, `:203` ; `app/layout.tsx:54` (`viewportFit: cover`). Volet
  plein écran en `h-screen` (100vh), sans marge de zone sûre. Sur iPhone, la zone de saisie passe probablement sous
  la barre de Safari.
  **Correctif :** `h-dvh` ; conteneur de saisie en `pb-[max(0.75rem,env(safe-area-inset-bottom))]`. À vérifier
  sur un vrai iPhone.
- **CA-55** · mineur · `ChatBot.tsx:174-187`. Une action groupée se valide par « ✓ Confirmer » ou « ✗ Annuler »,
  en 12 px et environ 28 px de haut.
  **Correctif :** libellé tiré de l'action en attente ; `min-h-11` sur mobile.
  **Textes :** « Passer 3 articles en Vendu », « Ne rien changer ».

Fondations qui s'appliquent ici : panneau de la cloche (§ 2.10), bulle (§ 2.11), toasts (§ 2.20).

### 3.2 Connexion, inscription, mot de passe, pages légales, 404

Fondations qui s'appliquent ici :

- champs reliés à leur libellé : `login-email`, `login-password`, `oubli-email`, `reset-nouveau`,
  `reset-confirmation` (CA-24, axe `label` critique sur 8 nœuds) ;
- erreurs annoncées par `role="alert"` et `aria-invalid` (CA-23) ;
- 16 px sur mobile (CA-10) ;
- contraste des libellés (CA-11, CA-12) ;
- un `<h1>` et un titre d'onglet par page (CA-29).

Symptômes propres à ces écrans :

- **CA-34** · majeur · `app/login/page.tsx:10`, `:39`. `router.push(callbackUrl)` accepte n'importe quelle URL
  absolue lue dans la requête. C'est une **redirection ouverte**, vue dans le code mais non exploitée en test.
  **Correctif :**
  `const u = new URL(raw ?? '/dashboard', location.origin); const dest = u.origin === location.origin ? u.pathname + u.search : '/dashboard'; router.push(dest);`
- **CA-33** · majeur · `app/login/page.tsx:43-53`. Le formulaire « mot de passe oublié » n'a ni `try` ni lecture
  de `res.ok`. Une coupure réseau laisse « Envoi… » bloqué, et une erreur serveur affiche quand même le message de
  succès.
  **Correctif :** `try/finally` ; message de succès seulement sur une réponse 2xx.
  **Textes :** erreur « L'envoi a échoué. Réessaie dans un instant. » (`role="alert"`) ; succès « Si cette adresse
  est enregistrée, un lien de réinitialisation vient de partir. »
- **CA-32** · majeur · `app/reset-password/page.tsx:61-71`, `:33` ; `mc/route.reset-password.sans-jeton.png`,
  `ds/etat.reset.erreurs.lien-expire.png`. La page est une impasse : aucun lien vers `/login`, aucun moyen de
  redemander un lien, et le succès redirige au bout de 2,5 s sans lien immédiat.
  **Correctif :** un bouton
  `<Link href="/login?mode=oubli">` ; en cas de succès, un lien vers `/login`.
  **Textes :** « Ce lien n'est plus valable. Demande un nouveau lien : il arrive en une minute. » ; bouton
  « Recevoir un nouveau lien » ; succès : « Mot de passe modifié. » et le lien « Se connecter maintenant ».
- **CA-56** · mineur · `app/reset-password/page.tsx:72-99`. La règle « 8 caractères minimum » n'est qu'un
  placeholder. Il n'y a ni `minLength` ni `autoComplete="new-password"`, et le libellé dit seulement « Confirmer ».
  **Correctif :** aide visible `<p id="reset-aide">` reliée par `aria-describedby` ; `minLength={8}` ;
  `autoComplete="new-password"` sur les deux champs ; aucun placeholder.
  **Textes :** aide « 8 caractères minimum. » ; libellé « Confirmer le mot de passe ».
- **CA-57** · mineur · `app/login/page.tsx:25-41` ; `app/signup/page.tsx:34-38`. Il n'y a pas de `try/finally`. Si
  `fetch` lève une exception (vu dans le code de l'inscription), le bouton reste bloqué sur « Création… ». Même
  risque pour `signIn` à la connexion (SUPPOSÉ).
  **Correctif :** `try/catch/finally`.
  **Texte :** « Connexion impossible. Vérifie ta connexion et réessaie. »
- **CA-58** · mineur · `app/login/page.tsx:35-37` ; `ds/etat.login.erreur.png`. « Identifiants invalides. »
  s'affiche pour toute erreur, panne serveur comprise.
  **Textes :** pour `CredentialsSignin`, « E-mail ou mot de passe incorrect. Vérifie-les ou utilise « Mot de passe
  oublié ? ». » ; pour toute autre erreur, « Connexion impossible pour le moment. Réessaie dans un instant. »
- **CA-59** · mineur · `app/signup/page.tsx:44`, `:147-170`. Les erreurs du serveur s'affichent en bloc, loin du
  champ concerné. « Un compte existe déjà… » ne propose aucune suite. Les CGU ne sont mentionnées nulle part.
  **Correctif :** chaque erreur sous son champ (code, e-mail), avec deux liens dans le cas du compte existant ;
  mention légale sous le bouton.
  **Textes :**
  - « Un compte existe déjà avec cette adresse. Connecte-toi ou réinitialise ton mot de passe. » ;
  - sous le bouton : « En créant un compte, tu acceptes les CGU et la politique de confidentialité. » ;
  - au-dessus du champ de code (CO-22) : « Inscription sur invitation : MyFlip te fournit un code. »
- **CA-60** · mineur · `app/login/page.tsx:21`, `:109-127`, `:150-156`. L'e-mail déjà tapé n'est pas repris dans
  le mode « oublié », et le focus ne bouge pas au changement de mode. « ← Retour à la connexion » est aligné à
  gauche après l'envoi et centré avant. Il n'y a pas de lien vers l'inscription.
  **Correctif :** `setForgotEmail(email)` au passage en mode oublié, puis focus sur le champ ; mêmes classes
  (`text-center mt-4`) pour les deux liens de retour ; lecture de `?mode=oubli` ; lien « Créer un compte ».
- **CA-61** · mineur · `app/legal/*/page.tsx` ; `AppShell.tsx:18`. Les pages légales n'ont aucune navigation : seul
  le bouton Précédent du navigateur permet d'en sortir.
  **Correctif :** un `app/legal/layout.tsx` avec :
  - « ← Retour » (`router.back()`, repli sur `/`) ;
  - le lien MyFlip, vers `/dashboard` si une session existe, vers `/` sinon ;
  - les onglets « Mentions · CGU · Confidentialité » ;
  - un `metadata.title` par page.
- **CA-62** · mineur · `app/not-found.tsx:6-17`. « 404 » est un `<div>`, pas un titre. La page propose « ← Retour
  au dashboard » à un visiteur non connecté comme dans le Studio. La flèche est lue par le lecteur d'écran.
  **Correctif :** un vrai `<h1>`, un lien qui dépend de la session, et une icône décorative masquée.
  **Textes :**
  - titre `<h1>Page introuvable</h1>`, texte « Cette adresse ne mène à aucune page. » ;
  - bouton « Aller au tableau de bord » avec une session, « Aller à l'accueil » sinon ;
  - icône `ArrowLeft` en `aria-hidden`.

### 3.3 Tableau de bord

Fondations qui s'appliquent ici :

- barres de graphique en `--chart-bar`, graphes refaits avec `dataviz` (PI-9) ;
- `ton()` pour les marges : le taux de marge est toujours en `--pos` à `:363`, et `positive` est imposé à `:226`
  (PI-13) ;
- `niveauCoef()` pour la pastille coef (PI-15) ;
- conserver les données précédentes au changement de période (PI-18) ;
- `ErrorState` (PI-19) ;
- échelle typographique (PI-3) et casse naturelle (PI-6).

Symptômes propres à l'écran :

- **PI-10** · majeur · `app/dashboard/page.tsx:196-202`, `:282-303` ; `app/api/dashboard/route.ts:187-229` ;
  `dc/etat.dashboard.periode.tout.png`. En vue « Tout », le héros affiche 1 179,00 € à côté de « ▲ +54,0 % » et
  « vs 276,00 € en septembre ». Le badge compare toujours le mois en cours au mois précédent, quelle que soit la
  période affichée.
  **Correctif d'affichage, dans le périmètre :** n'afficher le badge et la ligne de comparaison qu'en vue Mois.
  **Correctif complet, PRD § 5 :** calculer le delta de la période contre la période précédente équivalente.
- **PI-11** · majeur · `app/api/dashboard/route.ts:163-167` ; `app/dashboard/page.tsx:155`, `:200`, `:252` ;
  `dc/etat.dashboard.periode.30j.png`. Le graphe « 8 dernières semaines » met à 0 les semaines qui sortent de la
  période (31 août, 7 et 14 septembre à 0, alors que la vue Tout affiche 62, 41 et 49). En vue Mois, la courbe du
  héros reste plate avant le début du mois.
  **Correctif PRD § 5 :** calculer les 8 semaines glissantes sur `allVendus`.
  **Variante d'affichage :** ne tracer que les semaines comprises dans la période.
  **Texte :** remplacer l'aparté « 8 DERNIÈRES » par « 8 dernières semaines ».
- **PI-12** · majeur · `app/dashboard/page.tsx:637-639` ; `dc/route.dashboard.png` (Lacoste « +-8,02 € »). Un
  « + » est codé en dur : une marge négative s'affiche « +-8,02 € », et en vert.
  **Correctif :** `signedEur(b.margeNette)` et `ton()` (§ 2.3).
- **PI-14** · majeur · `app/dashboard/page.tsx:631-650` ; `mc/route.dashboard.png`. Le CA et la marge ne se
  distinguent que par leur couleur et leur position. Le coef, la barre et « 17 % » n'ont ni libellé ni en-tête.
  **Correctif :** libeller chaque valeur sur mobile ; ajouter une ligne d'en-têtes sur ordinateur, reprise dans un
  `aria-label` sur chaque ligne.
  **Textes :** mobile, « CA 454,00 € · Marge 275,43 € · 17 vendus · Coef 3,03× » ; en-têtes « Coef », « CA »,
  « Marge », « Part vendue ».
- **PI-21** · majeur · `app/dashboard/page.tsx:564-587` ; `mc/etat.dashboard.periode.tout.png` (862 px pour 780).
  À 390 px, les 8 libellés de date élargissent les colonnes : le graphe sort de sa carte et la page défile à
  l'horizontale de 41 px.
  **Correctif :** `min-w-0` sur chaque colonne ; sous 640 px, libellés courts (« 14/9 »), ou un sur deux.
- **PI-31** · mineur · `app/dashboard/page.tsx:219`, `:232-234` ; `app/statistiques/page.tsx:272`, `:317`. Un même
  dénominateur s'appelle « catalogue » puis « stock ». Or « stock » désigne ailleurs le statut En stock.
  **Textes :** « 51,1 % des articles vendus », « 10,2 % des articles en vente ». « Stock » est réservé au statut.
- **PI-51** · mineur · `app/dashboard/page.tsx:256`, `:601-608` ; `app/api/dashboard/route.ts:117-147`. Hors vue
  Mois, la liste « Par marque » reprend les marques sans vente (lignes à 0,00 €, coef 0,0×) et les compte comme
  « ACTIVES ». L'état vide ne peut donc jamais s'afficher.
  **Correctif d'affichage :** filtrer `vendus > 0` côté page.
  **Texte :** aparté « 6 marques vendues ».
- **PI-22** · mineur · `app/dashboard/page.tsx:497` ; `mc/route.dashboard.png` (« NOUVEAUX AU ST… »). Libellé de
  KPI tronqué, sans accès au texte complet.
  **Correctif :** `line-clamp-2 leading-[1.3]`, ou « Nouveaux » avec « au stock · octobre » en sous-ligne.
- **PI-23** · mineur · SUPPOSÉ (calcul) · `app/dashboard/page.tsx:245`, `:298`, `:618`. Entre 900 et environ
  1 200 px, sidebar dépliée, la colonne du nom de marque tomberait à 0, et un héros à 5 chiffres serait rogné.
  **Correctif :** requête de conteneur (`@container`) au lieu de `min-[900px]:` ; `min-w-[8rem]` sur le nom ; héros
  en `clamp()`.
- **PI-25** · mineur · `app/dashboard/page.tsx:174-190`. Le sélecteur de période n'expose pas son état, et
  « TRIM. » ou « 30J » sont lus tels quels.
  **Correctif :** contrôle segmenté (§ 2.14).
  **Textes :** « Mois », « 30 jours », « Trimestre », « Tout ».
- **PI-26** · mineur · `app/dashboard/page.tsx:611-619`. La ligne de marque est un `<button>` qui navigue : pas de
  Cmd-clic, pas d'URL au survol, aucun indice qu'elle mène au Stock.
  **Correctif :**
  `<Link href={`/stock?marque=${encodeURIComponent(b.marque)}`} aria-label={`Voir le stock ${b.marque}`}>` et un
  chevron en fin de ligne.
- **PI-27** · mineur · `components/DemarrageCard.tsx:39-42`, `:48`. Le paragraphe sur Trello reste affiché aux
  étapes 2 et 3, et le bouton dit « Reprendre » alors que rien n'a été commencé.
  **Textes :**
  - étape 1 : « Branche Trello pour que tes ventes remontent dans « À comptabiliser ». » ;
  - étape 2 : « Choisis le tableau et les étiquettes que MyFlip doit suivre. » ;
  - étape 3 : « Crée ta première commande pour remplir ton stock. » ;
  - boutons : « Connecter Trello », « Préparer le tableau », « Créer ma commande ».
- **PI-28** · mineur · `components/DemarrageCard.tsx:53-75`. L'étape en cours ne se distingue que par la couleur.
  **Correctif :** `aria-current="step"` et graisse 600 sur l'étape en cours ; « (faite) » en `sr-only` sur les
  étapes terminées.
- **PI-29** · mineur · `app/dashboard/page.tsx:405-420`, `:428-473`. Le lien renvoie à « Paramètres », alors que le
  menu affiche « Prompts ». Une fois l'objectif fixé, aucun chemin ne permet de le modifier.
  **Correctif :** lien direct vers l'endroit où vit l'objectif (question 1, § 7), avec une ancre
  `id="objectif"`.
  **Textes :** « Définir mon objectif mensuel » ; une fois fixé, « Modifier l'objectif ».
- **PI-30** · mineur · `app/dashboard/page.tsx:411`, `:461`. La carte Objectif ne précise pas qu'elle porte sur le
  mois en cours.
  **Textes :** titre « Objectif d'octobre » (mois courant formaté) ; ligne « 425 € sur 600 € · reste 175 € ».
- **PI-33** · mineur · `app/dashboard/page.tsx:157-258` ; `dc/route.neuf.dashboard.png`. Sur un compte neuf, un
  mur de « 0,00 € », une courbe plate et « vs 0,00 € ».
  **Correctif :** tant que `totalArticles === 0`, un état vide à la place du héros et des KPI.
  **Textes :** titre « Pas encore de ventes » ; texte « Crée ta première commande pour remplir ton stock : tes
  chiffres apparaîtront ici. » ; bouton « Créer une commande » vers `/commandes`.
- **PI-50** · mineur · `app/dashboard/page.tsx:570-572`, `:584`, `:430-434`. Les barres affichent « 262 » sans
  unité, et « 28–4 » sans mois. Les `svg` ont un nom mais pas de rôle.
  **Correctif :** valeurs via `Intl` (`maximumFractionDigits: 0`) ; `role="img"` et un `aria-label` qui résume le
  graphe.
  **Textes :** « 262 € », « 28 sept.–4 oct. » ; nom du graphe « CA par semaine : meilleure semaine du 12 au 18
  octobre, 262 € ».
- **PI-52** · mineur · SUPPOSÉ · `app/dashboard/page.tsx:529-551` contre `app/api/dashboard/route.ts:174-185`. Si
  le serveur tourne en UTC, entre 0 h et 2 h le 1er du mois, les barres suivent le nouveau mois côté navigateur et
  l'ancien côté serveur.
  **Correctif PRD § 5 :** fuseau `Europe/Paris` côté serveur, et mois passé par le client (`?mois=2026-10`).

### 3.4 Statistiques

Fondations qui s'appliquent ici :

- barres en `--chart-bar` (PI-9), segments de canal (PI-8), `ton()` pour les marges (PI-13) ;
- liste de périmètre accessible (PI-46, § 2.16) ;
- conserver les données précédentes (PI-18), `ErrorState` (PI-19) ;
- `pluriel()` (PI-32).

Symptômes propres à l'écran :

- **PI-14** (volet mobile) · majeur · `app/statistiques/page.tsx:612-616`. « 454,00 € 275,43 € 17 VENDUS »
  s'affiche sans libellés.
  **Texte :** « CA 454,00 € · Marge 275,43 € · 17 vendus ».
- **PI-47** · mineur · `app/statistiques/page.tsx:283-317` ; `app/api/stats/route.ts:126-128`. Le grand chiffre
  est la moyenne sur 7 jours, sans le dire, et la pastille juste dessous le répète. La projection voisine utilise
  la cadence sur 30 jours : « 1 vente / jour » et « 43 restants, 76 jours » se contredisent.
  **Correctif :** fusion des deux cartes (parcours P19, § 4).
  **Textes :** « 0,6 vente / jour sur 30 jours » ; « 7 derniers jours : 1 » ; « Au rythme de 0,6 vente / jour, les
  43 articles restants partent en 76 jours. »
- **PI-48** · mineur · `app/statistiques/page.tsx:411-424`. En cas d'égalité, deux barres sont mises en avant mais
  l'aparté ne nomme que le premier jour.
  **Texte :** « Lundi et samedi · 10 ventes ».
- **PI-49** · mineur · `app/statistiques/page.tsx:303`, `:321-327`. Sans cadence, la carte affiche « — jours » en
  38 px, plus « CADENCE NULLE — PROJECTION IMPOSSIBLE ».
  **Textes :** « Pas de projection » ; « Aucune vente sur les 30 derniers jours : la projection reprendra après la
  prochaine vente. »
- **PI-55** · mineur · `app/statistiques/page.tsx:509` ; `mc/route.statistiques.png`. À 390 px, le donut occupe
  seul une rangée, et le titre de la carte vient après lui.
  **Correctif :** sortir `CardTitle` du flex pour le placer en tête, puis le donut centré avec son total au centre,
  puis la légende.
  **Texte :** total « 88 articles ».
- **PI-50** (volet stats) · mineur · `app/statistiques/page.tsx:442-446`, `:510-514`. La date de dernière vente
  n'existe que dans un `title`, au survol. Le donut n'a pas de `role="img"`.
  **Correctif :** la date en texte ; `role="img"` et un `aria-label` sur le donut.
- **PI-31**, **PI-33** (volets stats) : mêmes textes qu'en § 3.3 (« des articles » ; état vide de compte neuf).

### 3.5 Calendrier

Fondations qui s'appliquent ici :

- fenêtre « Détail du jour » sur la primitive Dialog (PI-35) ;
- structure : `MoisEnTete`, `TotauxMois`, `GrilleMois`, `RecapSemaine` et `DetailJour`, qui consomment `Module`,
  `CardTitle` et l'échelle ; environ 60 `style={{…}}` en moins ; un seul seuil de bascule (PI-43) ;
- voile et ombres en tokens (PI-7), `niveauCoef()` (PI-15), `coefLabel()` (PI-16) ;
- conserver les données précédentes (PI-18).

Symptômes propres à l'écran :

- **PI-36** · **bloquant** · `app/calendrier/page.tsx:258`, `:551`, `:555` ; `mc/etat.cal.day-detail.png`. Sur
  mobile, toucher un jour pose `selected`. Cela ouvre l'accordéon **et** la fenêtre prévue pour l'ordinateur, que
  rien ne masque puisqu'elle est hors du bloc `hidden md:block` (relu en synthèse : `:300` et `:549-556`). Fermer la
  fenêtre replie l'accordéon. La liste des articles vendus du jour n'est donc lisible sur aucun format.
  **Correctif :** ne rendre la fenêtre qu'à partir de 768 px (`hidden md:flex` sur le voile, ou un état
  `jourOuvertDesktop` séparé). Extraire un `DetailJour` qui liste les articles (SKU, prix, net, coef) et le
  réutiliser dans l'accordéon et dans la fenêtre.
- **PI-17** · majeur · `app/calendrier/page.tsx:148`, `:155`, `:343-344` ; `app/api/calendar/route.ts:61`. Le
  calendrier fait entrer dans sa moyenne les pièces offertes (coef 0) et les coefs absents (`null` converti en
  `0`). Le tableau de bord et les statistiques les excluent avec `moyenneCoefs`. Les chiffres divergent d'un écran à
  l'autre.
  **Correctif PRD § 5** (il touche un calcul et une réponse d'API) : `moyenneCoefs` aux lignes 155 et 344 ;
  l'API renvoie `coefficient: a.coefficient`, `null` conservé. La règle existe déjà dans `lib/calc.ts:317-328` :
  le correctif ne crée pas de règle, il aligne l'écran sur celle qui existe.
- **PI-20** · majeur · `app/calendrier/page.tsx:233-247`, `:330-335`, `:518-547`. En erreur, la page affiche le
  bandeau d'erreur puis « Aucune vente ce mois-ci. » sur mobile, ou une grille vide à 0,00 € sur ordinateur.
  L'erreur se lit comme un mois sans vente.
  **Correctif :** si `isError`, rendre seulement `ErrorState`.
  **Textes :** « Impossible de charger octobre 2026. » ; bouton « Réessayer ».
- **PI-34** · majeur · `app/calendrier/page.tsx:368-392`, `:450`. Les cases de la grille sont des `<div onClick>` :
  le détail d'un jour ne s'ouvre pas au clavier, et le seul indice est une info-bulle au survol.
  **Correctif :** chaque jour qui a des ventes devient un `<button type="button">` ; les jours sans vente restent
  des `<div>` inertes.
  **Texte :** nom accessible « Samedi 3 octobre : 19,00 €, 1 article. Voir le détail ».
- **PI-38** · majeur · `app/calendrier/page.tsx:307-318` ; sonde X8 (2,93:1). Les en-têtes LUN à DIM, une
  information neutre, portent la couleur d'alerte et échouent au contraste.
  **Correctif :** `--ink2`, fond transparent, sans bordure. `--warn` reste réservé au niveau « proche » du coef.
- **PI-41** · majeur · `app/calendrier/page.tsx:300`, `:517-547`. Les totaux du mois sont sous cinq semaines de
  grille sur ordinateur (vers y = 1 290 pour un écran de 900), et **absents** sur mobile.
  **Correctif :** remonter la bande des totaux sous le titre du mois et l'afficher aussi sur mobile, en grille de 2
  colonnes.
- **PI-24** · majeur · SUPPOSÉ (calcul) · `app/calendrier/page.tsx:240`, `:300`, `:306`, `:354`. Entre 768 et
  environ 1 150 px, les montants déborderaient des cases (29 px utiles pour « 32,00 € »).
  **Correctif :** n'afficher la grille que si la carte mesure au moins 900 px (requête de conteneur), sinon la
  liste ; `min-w-0` sur les cases ; montants en `clamp()`.
- **CA-22** · majeur · `app/calendrier/page.tsx:571-576`. La croix de fermeture n'a pas de nom accessible.
  **Correctif :** `aria-label="Fermer le détail du jour"`, icône en `aria-hidden`, 44 × 44 px.
- **PI-37** · mineur · `app/calendrier/page.tsx:257-277`. L'accordéon n'expose pas son état et n'a pas de chevron.
  **Correctif :** `aria-expanded={active}`, `aria-controls={`jour-${dd.date}`}`, chevron qui pivote.
- **PI-39** · mineur · `app/calendrier/page.tsx:224-230`. La pastille de légende « Jour avec ventes » est invisible
  (1,02:1).
  **Correctif :** `border: 1px solid var(--acc)`.
- **PI-40** · mineur · `app/calendrier/page.tsx:185-231`. Une légende occupe la première ligne, le mois est séparé
  de ses flèches, et la légende est répétée. Sur mobile, la phrase parle d'une couronne qui ne s'affiche pas.
  **Correctif :** une seule ligne « ‹ Octobre 2026 › [Aujourd'hui] », le mois en `<h2 aria-live="polite">` entre
  les flèches ; une seule légende, à droite, à partir de 768 px ; plus de sur-titre.
- **PI-42** · mineur · `app/calendrier/page.tsx:354`, `:375`, `:466-509` ; sonde G4 (page de 1 324 px). Chaque
  semaine prend la hauteur de son récap, environ 180 px.
  **Correctif :** récap compacté (CA et net sur deux lignes, détail dans un dépliant), cases d'environ 88 px : le
  mois tient dans 900 px.
- **PI-44** · mineur · `app/calendrier/page.tsx:27-55`. Le comptage de 0 à la valeur ignore
  `prefers-reduced-motion`, et les chiffres ne sont pas tabulaires.
  **Correctif :** dans `CountUp`,
  `if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setDisplay(value); return; }` ; `tabular-nums`.
  Le principe même du comptage relève de l'identité (§ 5).
- **PI-53** · mineur · `app/calendrier/page.tsx:262`, `:565`. `capitalize` donne « Samedi 3 Octobre 2026 ».
  **Correctif :** `majusculeInitiale()` (§ 2.3), pour obtenir « Samedi 3 octobre 2026 ».
- **PI-54** · mineur · `app/calendrier/page.tsx:194`, `:202`, `:209`. Les boutons de navigation font 40 px sur
  téléphone.
  **Correctif :** `h-11 w-11 md:h-10 md:w-10`.

### 3.6 Stock

Fondations qui s'appliquent ici :

- cellule modifiable au clavier (ST-5), tri accessible (ST-7), colonne Actions collante (ST-14) ;
- constante de hauteur de ligne pour la virtualisation (ST-16), `table-fixed` (ST-47) ;
- focus visible (ST-6, ST-13) ;
- contrastes des pastilles, de `--faint` et des canaux (ST-9, ST-10, ST-11) ;
- 16 px sur mobile (ST-29), barre groupée sur la zone sûre (ST-30), bulle (ST-31), cibles de 44 px (ST-32) ;
- échelle typographique (ST-37, ST-38), `coefLabel` (ST-39), modale unique (ST-43), statuts en tokens (ST-52) ;
- erreurs de mutation visibles (ST-4) ;
- fenêtre de vente unique (ST-8, ST-26, ST-27, ST-28).

Note PRD § 8 : la barre groupée doit **inclure** « Vendu ». Aujourd'hui elle l'exclut (`:1615`). Il faut passer
par une saisie de prix, via la fenêtre de vente.

- **ST-1** · **bloquant** · `app/stock/page.tsx:1154-1158` (relu en synthèse) ; `app/api/articles/[id]/route.ts:138`
  ; `lib/calc.ts:273-301`. Sur un article Vendu, choisir un autre statut dans le sélecteur natif efface en silence
  le prix, la date, la marge brute, la marge nette et le coefficient. Supposé : sous Windows, les flèches du
  clavier sur un sélecteur fermé écrivent à chaque appui.
  **Correctif :** dans `handleStatutChange`, si `a.statut === STATUT_VENDU && value !== STATUT_VENDU`, ouvrir un
  AlertDialog au lieu d'écrire. Le sélecteur natif est gardé (PRD § 10) et le calcul ne change pas.
  **Textes :** titre « Annuler la vente de LAC9 ? » ; corps « Le prix de vente (18,00 €), la date de vente et la
  marge seront effacés. Cette action est définitive. » ; boutons « Annuler la vente » et « Garder vendu ».
- **ST-2** · **bloquant** · `app/stock/page.tsx:987`, `:1003-1010`, `:1290-1330`, `:1397`, `:1205-1213`,
  `:1449-1454` ; `lib/stock.ts:173-181`. La sélection survit aux changements de recherche, de marque, de lot, de
  commande et de chip. « Appliquer » écrit sur des lignes devenues invisibles, et efface les ventes des articles
  vendus, sans confirmation.
  **Correctif :**
  1. Appliquer seulement à l'intersection `sorted ∩ selected`, et le dire par un compteur (« 3 sélectionnés,
     dont 2 masqués par les filtres »). Ou bien vider la sélection à chaque changement de filtre (question 7).
  2. Si la sélection contient des articles Vendu, ouvrir un AlertDialog.
  **Textes :** titre « Changer le statut de 12 articles ? » ; corps « 4 articles vendus perdront leur prix, leur
  date et leur marge de vente. » ; boutons « Changer le statut » et « Annuler ».
- **ST-3** · **bloquant** · `app/stock/page.tsx:1613`, `:1624`, `:1631` (relu en synthèse) ;
  `ds/etat.stock.selection-bar.png`. En sombre, la barre groupée passe au lime : le sélecteur blanc sur lime mesure
  1,22:1, et « Appliquer » (lime sur blanc) 1,25:1.
  **Correctif :**
  - sélecteur : `bg-[var(--surface)] text-[var(--ink)] border-[var(--border-input)]` ;
  - bouton : `bg-[var(--acc-ink)] text-[var(--acc)]` ;
  - libellé et croix : `text-[var(--acc-ink)]` ;
  - remesurer à 4,5:1 minimum dans les deux thèmes.
- **ST-50** · majeur · `app/stock/page.tsx:1653-1782`, `:1773-1778`. La fiche détail ne montre ni compte, ni lot,
  ni commande, ni date de mise en vente, ni grade, et ne propose aucune action. « Créer une annonce » ouvre la
  mise en vente sans l'article, par un `<a>` qui recharge toute la page.
  **Correctif :** une fiche complète, champs modifiables par de vrais champs, et un lien vers la mise en vente du
  SKU (`?sku=` à ajouter côté mise en vente).
  **Textes :** actions « Vendre », « Changer le statut », « Supprimer » ; lien `next/link` « Créer l'annonce » vers
  `/mise-en-vente?sku=LAC9`.
- **ST-21** · majeur · `app/stock/page.tsx:1078-1105`, `:1253-1265` ; `ds/etat.stock.chips-statut.png`.
  « Articles au total » et « Valeur du stock » changent avec les filtres : sur Brouillon, on lit « Articles au
  total 3 ».
  **Correctif :** calculer les KPI sans filtre, ou les renommer quand `hasFilters` est vrai.
  **Textes :** « Articles affichés », « Valeur des articles affichés ».
- **ST-25** · majeur · `app/stock/page.tsx:474`, `:489`, `:1695-1697`. Vider un prix enregistre 0 (`Number("")`
  vaut 0), et les marges sont recalculées fausses.
  **Correctif :** garde dans les trois `onSave` : `if (v.trim() === "") { … return; }`. Un 0 saisi explicitement
  reste permis.
  **Texte :** « Saisis un prix (0 si la pièce était offerte). »
- **ST-24** · majeur · `app/stock/page.tsx:1700-1718` contre `:546-566`. La date de vente de la fiche est un champ
  texte prérempli en UTC. Taper « 20/10/2026 » fait lever `RangeError` dans `onSave` : rien n'est enregistré, et
  aucun message ne s'affiche.
  **Correctif :** `type="date"` et `value={detail.dateVente ? jourParis(new Date(detail.dateVente)) : null}`, comme
  le tableau à la ligne 552.
- **ST-40** · majeur · `app/stock/page.tsx:112-131`, `:1115`. L'export CSV utilise le séparateur « ; » d'Excel FR,
  mais écrit des nombres bruts, avec un point (« 2.4242424242424243 »). Supposé : Excel FR les lit comme du texte.
  **Correctif :**
  `new Intl.NumberFormat('fr-FR', { useGrouping: false, maximumFractionDigits: 2 }).format(n)` pour les colonnes
  numériques.
- **ST-41** · majeur · `app/stock/page.tsx:637-652`, `:755-763`. On entend 88 fois « Supprimer » sans savoir de
  quel article il s'agit. L'existence d'une annonce n'est signalée que par la couleur de l'icône.
  **Correctif :** `aria-label={`Voir le détail de ${a.sku}`}` et `aria-label={`Supprimer ${a.sku}`}` ; une icône
  distincte (`FileCheck`) ou un texte `sr-only` « annonce générée ».
- **ST-42** · majeur · `app/stock/page.tsx:1605-1620`. Le sélecteur de la barre groupée n'a pas de nom, et le
  nombre d'articles sélectionnés n'est pas annoncé.
  **Correctif :** `<label htmlFor="bulk-statut">Statut</label>` ; compteur dans un `<span role="status">`, rendu
  vide dès le montage.
- **ST-15** · majeur · `app/stock/page.tsx:1387` ; `dc/route.stock.png`. À 1 440 px, « En lavage » est coupé, et
  « Repassé » et « Perdu » sont invisibles, sans indice.
  **Correctif :** `md:flex-wrap md:overflow-visible` ; sur mobile, garder le défilement avec un fondu de bord.
- **ST-18** · majeur · `app/stock/page.tsx:900`, `:1078-1105`, `:1252-1266`, `:1388-1393`, `:1538-1542`, `:1550`,
  `:1476` contre `:1483` et `:1490`. Pendant le chargement et en erreur, les KPI affichent « 0 » et « 0,00 € », les
  chips 0, et le pied « 0 ligne affichée ». Sur mobile, le loader est sous le pli.
  **Correctif :**
  - pendant `isLoading` : KPI en « — » avec `aria-busy`, chips sans compteur, pied masqué, squelette juste sous la
    barre d'outils ;
  - en erreur : KPI et pied masqués ;
  - un seul `colSpan`, égal à `colCount`.
- **ST-19** · majeur · `app/stock/page.tsx:1481-1487`, `:1551-1555`. Le message brut du serveur s'affiche seul, en
  rouge.
  **Correctif :** `ErrorState`.
  **Textes :** « Impossible de charger le stock. Vérifie ta connexion puis réessaie. » ; bouton « Réessayer » ;
  détail technique en dessous.
- **ST-20** · majeur · `app/stock/page.tsx:1488-1494`, `:1556-1559`. Le même « Aucun article. » s'affiche pour un
  compte neuf et pour une recherche sans résultat.
  **Textes :**
  - compte vide : titre « Aucun article en stock », texte « Les articles se créent quand tu enregistres une
    commande de lots. », bouton « Nouvelle commande » ;
  - vue filtrée : « Aucun article pour « ZZZ999 » avec ces filtres. », bouton « Effacer les filtres ».
- **ST-34** · majeur · `app/stock/page.tsx:1252-1422` ; `mc/route.stock.png` (première carte vers y = 630 sur
  844). Aucun article n'est visible sans défiler.
  **Correctif :** parcours P25 (§ 4).
- **ST-12** · mineur · `app/stock/page.tsx:1416-1418`. Compteur des chips en `opacity-70` : 3,29:1.
  **Correctif :** retirer l'opacité ; `--ink2`, 12 px minimum.
- **ST-17** · mineur (performance) · `app/stock/page.tsx:983`, `:1149-1171`. `memo(ArticleRow)` ne sert à rien :
  les callbacks et `shownColumns` changent d'identité à chaque rendu.
  **Correctif :** `useCallback` sur `[update.mutate]` et `[del.mutate]` ;
  `const shownColumns = useMemo(() => COLUMN_META.filter(c => visibleCols[c.key]), [visibleCols])`.
- **ST-22** · mineur · `app/stock/page.tsx:1224-1236`. Une marge nette négative s'afficherait en vert, et on lit
  « 1 vendus ».
  **Correctif :** `ton()` et `pluriel()` (§ 2.3).
- **ST-23** · majeur · `app/stock/page.tsx:1162-1170` ; `lib/hooks.ts:212-219`. Le `window.confirm` « Supprimer
  ADI1 ? » ne dit pas que la suppression est définitive. La ligne reste affichée jusqu'au rechargement, ce qui
  permet une double suppression.
  **Correctif :** AlertDialog ; retrait optimiste de la ligne ; bouton en cours pendant la requête.
  **Textes :** titre « Supprimer ADI1 ? » ; corps « L'article et ses données de vente seront supprimés
  définitivement. » ; boutons « Supprimer l'article » et « Annuler ».
- **ST-33** · mineur · `app/stock/page.tsx:173`. Les trois sélecteurs s'arrêtent à 220 px sur mobile.
  **Correctif :** `max-w-none md:max-w-[220px]`.
- **ST-35** · mineur · `app/stock/page.tsx:712-741`. Sur la carte, les chiffres n'ont pas de libellé, et un article
  non vendu affiche « → — · — ».
  **Correctif :** masquer Vente et Marge quand elles sont vides ; ajouter la catégorie après la marque.
  **Texte :** « Achat 6,60 € · Vente 16,00 € · Marge 8,38 € · 6 j en vente ».
- **ST-36** · mineur · `app/stock/page.tsx:1140-1147`, `:1436-1471`. On ne peut ni trier ni tout sélectionner sur
  mobile.
  **Correctif :** parcours P25.
- **ST-44** · mineur · `app/stock/page.tsx:1014-1026`. Une fois « Nike » choisie, la liste des marques ne contient
  plus que Nike.
  **Correctif :** calculer `marqueOptions` sans le filtre de marque, et `lotOptions` sans le filtre de lot.
- **ST-45** · mineur · `app/stock/page.tsx:864-865`, `:887-890`, `:1397`. Les filtres ne sont pas tenus dans l'URL :
  actualiser ramène un ancien filtre, et la cloche ne refiltre pas.
  **Correctif :** l'URL devient la source de vérité (`router.replace` avec les `searchParams`).
- **ST-46** · mineur · `app/stock/page.tsx:796-800`. Des KPI non cliquables se soulèvent au survol.
  **Correctif :** retirer l'effet, ou en faire de vrais liens (parcours P30).
- **ST-48** · mineur · `app/stock/page.tsx:1228`, `:1361`, `:1626`, `:1682` ; `EditableCell.tsx:121`. Le même geste
  s'appelle « éditer », « modifier » ou « corriger ».
  **Textes :**
  - « Double-clic sur une cellule pour la modifier » ;
  - « Changer le statut », puis « Changement… » pendant l'envoi (au lieu de « Appliquer » et « … ») ;
  - « Effacer les filtres » (au lieu de « Réinitialiser »).
- **ST-49** · mineur · `lib/celebrate.tsx:95`. Une vente à perte affiche « marge +-8,02 € » avec des confettis.
  **Correctif :** `signedEur()` ; pas de confettis si la marge est inférieure à 0.
- **ST-51** · mineur · `app/stock/page.tsx:1803-1812`. La copie ne gère pas un refus du presse-papiers, et « Copié
  ✓ » n'est pas annoncé.
  **Correctif :** `try/catch`, puis `<span role="status">Copié</span>`.
  **Texte :** « Copie impossible : sélectionne le texte à la main. »
- **ST-53** · mineur · SUPPOSÉ · `app/stock/page.tsx:392-400`, `:516-526`. L'alerte « Objectif : x… » exige un
  `prixVente` hors Vendu, alors que tout chemin le remet à `null`. La branche serait du code mort.
  **Correctif :** relire `creerCommande`, puis retirer la branche si elle ne s'affiche jamais.
- **ST-54** · mineur · SUPPOSÉ · `app/stock/page.tsx:1064`, `:1072`. `scrollMargin` est lu dans `offsetTop`
  pendant le rendu : décalage possible après l'ouverture de « Colonnes ».
  **Correctif :** mesurer dans un `useLayoutEffect` ou un `ResizeObserver`, et garder la valeur en état.
- **ST-55** · mineur · `app/stock/page.tsx:1274`, `:1349-1363`. À 1 440 px, « Nouvelle commande » passe seul sur
  une deuxième ligne, et « Réinitialiser » fait bouger la rangée.
  **Correctif :** filtres à gauche en `flex-1` ; Colonnes, Export et Nouvelle commande groupés à droite
  (`ms-auto`) ; place réservée à « Effacer les filtres ».

### 3.7 Commandes et Nouvelle commande

Fondations qui s'appliquent ici :

- contrastes (QU-05, QU-06), 16 px sur mobile (QU-11), échelle (QU-12, QU-13), titres (QU-15) ;
- un seul conteneur de hauteur (QU-16), z-index (QU-17), bulle (QU-18), toasts (QU-20) ;
- choix unique natif (QU-43), placeholder (QU-46), bouton désactivé lisible (QU-47) ;
- `pluriel()` (QU-14), `dateCourte()` (QU-36), `aujourdhuiParis()` (QU-42 = CA-64).

Symptômes propres à ces écrans :

- **QU-22** · majeur · `app/commandes/page.tsx:696`, `:703-712`, `:799-811`, `:840-849`. Pendant le chargement et
  en erreur, les modules du haut affichent « 0,00 € », « 0 COMMANDE », « AUCUNE COMMANDE ENREGISTRÉE ».
  **Correctif :** des squelettes pendant `isLoading` ; un `ErrorState` de page en erreur ; l'état vide seulement
  si `!isLoading && !isError && length === 0`.
- **QU-25** · majeur · `app/commandes/page.tsx:819`. Cliquer sur un fournisseur ouvre le Stock complet, sans
  filtre.
  **Correctif :** `/stock?commande=<id>` quand le fournisseur n'a qu'une commande, sinon une ligne non cliquable,
  jusqu'à l'ajout d'un filtre fournisseur (parcours P41).
- **QU-28** · majeur · `app/commandes/page.tsx:845-849`, `:513` ; `NewCommandeModal.tsx:630-634`. Les erreurs du
  serveur s'affichent brutes.
  **Textes :** liste, « Impossible de charger les commandes. Vérifie ta connexion. » avec le bouton « Réessayer » ;
  création, « La commande n'a pas été créée. Vérifie ta connexion et réessaie. », détail technique en second.
- **QU-29** · majeur · `app/commandes/page.tsx:508-516`. La suppression en cascade passe par `window.confirm`,
  sans le nombre d'articles ni la mention des ventes perdues.
  **Correctif :** AlertDialog, avec « Suppression… » pendant l'envoi.
  **Textes :** titre « Supprimer la commande Grossiste KZ du 08/10/2026 ? » ; corps « Ses 30 articles seront
  supprimés définitivement, y compris ceux déjà vendus. » ; boutons « Supprimer la commande et ses 30 articles »
  et « Annuler ».
- **QU-30** · majeur · `app/commandes/page.tsx:547-589`. Le bouton ⋯ s'appelle seulement « Actions », sans
  `aria-expanded`. Le menu ne se ferme pas à Échap. « Détail / Masquer » n'expose pas son état.
  **Correctif :** primitive Menu (§ 2.16) ; `aria-expanded={expanded}` sur « Détail ».
  **Texte :** nom du bouton « Actions pour Grossiste KZ du 08/10/2026 ».
- **QU-31** · majeur · `app/commandes/page.tsx:610-669`. Sur mobile, on ne peut ni voir les articles d'une
  commande ni la supprimer.
  **Correctif :** deux boutons de 44 px dans le détail déplié.
  **Textes :** « Voir les articles », « Supprimer la commande ».
- **QU-33** · majeur · `app/commandes/page.tsx:414-430`, `:314-316`, `:126-130`. Coef moyen, % vendu et coef
  projeté ne sont qualifiés que par la couleur.
  **Correctif :** `niveauCoef()` avec libellé, ou une icône ▲ ▼ avec `aria-label`.
  **Textes :** « sous l'objectif », « objectif tenu ».
- **QU-38** + **CA-63** (volet erreur) · majeur · `NewCommandeModal.tsx:145-183`, `:172-182`, `:630-634` ;
  `lib/hooks.ts:314-324`. Après « Créer », la fenêtre se ferme sans rien dire. En cas d'échec, `mutateAsync`
  rejette sans `try` : la promesse n'est pas gérée, et l'erreur s'affiche en bas du corps, hors de vue.
  **Correctif :** `try/catch` ; en cas d'erreur, la fenêtre reste ouverte et l'erreur s'affiche dans le pied
  (`role="alert"`) ; en cas de succès, un toast construit à partir de la réponse.
  **Texte :** « Commande créée : 30 pièces, SKU PIS1 à PIS30. »
- **QU-39** + **CA-63** (volet bouton) · majeur · `NewCommandeModal.tsx:189-211`, `:224`. « Créer » reste
  désactivé, et sur mobile rien n'explique pourquoi (l'indice est masqué sous `sm`).
  **Correctif :** bouton toujours actif ; à l'envoi, `aria-invalid`, un message sous chaque champ fautif et le
  focus sur le premier.
  **Textes :** « Indique le nombre de pièces du lot 1 », « Indique le prix du lot 1 ».
- **QU-41** · majeur · `NewCommandeModal.tsx:15`, `:44` ; CLAUDE.md du projet (« Reste à traiter »). La marque
  proposée par défaut est « Polo Ralph Lauren », un libellé de lot. Chaque commande réintroduit une marque fausse.
  **Correctif :** une liste de marques normalisées (Ralph Lauren, Lacoste, Tommy Hilfiger…), et une marque vide
  par défaut. **Décision d'Aramis requise** sur le préfixe SKU, PRL ou RL (question 9).
- **QU-44** + **CA-63** (volet libellé) · mineur · `NewCommandeModal.tsx:227`, `:502`, `:587`, `:601`, `:607`.
  Libellés génériques ou flous.
  **Textes :**
  - bouton « Créer la commande » ;
  - « Grade (optionnel) », avec le placeholder « A, B… » ;
  - « Coefficient visé (×) » ;
  - placeholder du prix « 12,00 » ;
  - « Le total s'affiche quand chaque lot a un nombre de pièces et un prix. »
- **QU-14** · mineur · `app/commandes/page.tsx:762-836`, `:639` ; `app/a-comptabiliser/page.tsx:219`. Les
  capitales sont écrites dans les chaînes, et les pluriels recollés à la main (`COMMANDE{n>1?"S"}`).
  **Correctif :** casse naturelle et `pluriel()`.
- **QU-23** · mineur · `app/commandes/page.tsx:465-466`, `:502-506`. La colonne Rentabilité affiche « — » pendant le
  chargement, exactement comme en l'absence de donnée.
  **Correctif :** une pastille squelette pendant le chargement.
- **QU-24** · mineur (performance) · `app/commandes/page.tsx:502`, `:619`. Une requête de statistiques part par
  commande (N+1).
  **Correctif PRD § 5** (ajout d'un champ à `GET /api/commandes`) : renvoyer `montantRecupere` agrégé.
  **Variante dans le périmètre :** ne charger les statistiques qu'à l'ouverture du détail, et afficher la
  pastille à ce moment-là.
- **QU-26** · mineur · `app/commandes/page.tsx:791-797`. « Importer un fichier Excel » affiche « bientôt
  disponible ».
  **Correctif :** retirer le bouton.
- **QU-27** · mineur · `app/commandes/page.tsx:850-854`, `:808-811`. L'état vide n'a pas de bouton.
  **Correctif :** masquer la courbe et « Par fournisseur » tant que la liste est vide.
  **Textes :** titre « Aucune commande pour l'instant » ; texte « Une commande regroupe les lots achetés chez un
  fournisseur et crée leurs SKU. » ; bouton « Créer une commande ».
- **QU-32** · mineur · `app/commandes/page.tsx:229-239`, `:400-402`. Les lignes de lot se cassent sur trois
  lignes, et le tableau par lot exige 760 px.
  **Correctif :** sous 768 px, `flex-col` ; tableau par lot en cartes.
- **QU-34** · mineur · `app/commandes/page.tsx:121-122`. « En cours » est en `--neg`, la couleur de danger.
  **Correctif :** neutre (`--ink2` sur `--surface-2`).
- **QU-35** · mineur · `app/commandes/page.tsx:399-435`. Le tableau par lot est fait de grilles de `<div>`.
  **Correctif :** un vrai `<table>` (§ 2.18).
- **QU-36** · mineur · `app/commandes/page.tsx:528`, `:639` contre `:82-89`, `:867`. Deux formats de date, et des
  abréviations.
  **Correctif :** `dateCourte()`.
  **Textes :** « Prix moyen par pièce », « 30 articles ».
- **QU-37** · mineur · `mc/route.commandes.png`. Sur mobile, la liste commence après environ 700 px.
  **Correctif :** parcours P40.
- **QU-40** · mineur · `NewCommandeModal.tsx:235-283` contre `:592-620`. Grade et Objectif coef arrivent après le
  récapitulatif.
  **Correctif :** parcours P39.
- **QU-45** · mineur · `NewCommandeModal.tsx:319-331`. La corbeille d'un lot le supprime sans retour possible.
  **Correctif :** un toast avec annulation.
  **Texte :** « Lot 2 supprimé. » avec l'action « Annuler ».

### 3.8 À comptabiliser

Fondations qui s'appliquent ici :

- la fenêtre de vente unique (QU-50 = CA-54 = ST-27, QU-59) ;
- la suppression et la fenêtre sur la primitive Dialog (CA-21, QU-03) ;
- la pastille de statut en tokens (QU-07).

Symptômes propres à l'écran :

- **QU-49** · majeur · `app/a-comptabiliser/page.tsx:302-312` ; `SellDialog.tsx:62`. La fenêtre s'ouvre sans la
  date de vente connue de l'article : la comptabilisation enregistre la date du jour.
  **Correctif :** `defaultDate={target?.dateVente}`.
- **QU-51** · majeur · `app/a-comptabiliser/page.tsx:192`, `:272` ; `SellDialog.tsx:97`, `:199`. Le même geste
  porte quatre noms : « Valider », « Vendre CHD3 », « Confirmer la vente », « À comptabiliser ».
  **Textes :** bouton de ligne « Comptabiliser » ; titre « Comptabiliser la vente de CHD3 » ; bouton « Enregistrer
  la vente », puis « Enregistrement… ».
- **QU-52** · majeur · `app/a-comptabiliser/page.tsx:95-98` ; `lib/hooks.ts:189-191`. « Remettre en stock » ne
  donne aucun retour, ni pendant, ni après, ni en cas d'échec (retour arrière silencieux).
  **Correctif :** état en cours sur le bouton, toasts de succès et d'échec.
  **Textes :** pendant l'envoi, « Remise en stock… » ; succès, « CHD3 remis en stock. » avec l'action « Annuler »
  (qui renvoie le statut « À comptabiliser ») ; échec, « CHD3 n'a pas été remis en stock. Réessaie. »
- **QU-53** · majeur · `app/a-comptabiliser/page.tsx:116-124` ; `dc/route.neuf.a-comptabiliser.png`. La tuile
  « Synchro · Temps réel », avec sa pastille verte, est codée en dur : elle s'affiche même sans Trello.
  **Correctif :** lire l'état de Trello depuis `/api/user/settings` et adapter l'état vide.
  **Textes :** connecté, « Trello connecté : les ventes étiquetées arrivent ici automatiquement. » ; non connecté,
  « Trello non connecté » avec le lien « Connecter Trello » vers `/compte`.
- **QU-54** · majeur · `app/a-comptabiliser/page.tsx:161-212` ; `mc/route.a-comptabiliser.png`. La carte mobile
  omet le prix, la date et le transporteur, et empile trois boutons pleine largeur, dont « Supprimer ».
  **Correctif :** ajouter Transporteur, Prix de vente et Date de vente ; « Comptabiliser » en pleine largeur ;
  « Remettre en stock » et « Supprimer » côte à côte, en secondaire.
- **QU-55** · mineur · `app/a-comptabiliser/page.tsx:223-290`, `:247`. Boutons et en-têtes se cassent sur deux
  lignes ; la pastille de statut est identique sur toutes les lignes.
  **Correctif :** `whitespace-nowrap` ; retirer la pastille ; « Supprimer » dans un menu ⋯.
- **QU-56** · mineur · `app/a-comptabiliser/page.tsx:105-125`, `:216-220`. Trois tuiles redondantes repoussent la
  liste d'environ 600 px sur mobile.
  **Texte :** une seule ligne de synthèse, « 3 ventes en attente · Trello connecté ».
- **QU-57** · mineur · `app/a-comptabiliser/page.tsx:323-352`. Titre et bouton de suppression génériques.
  **Textes :** titre « Supprimer CHD3 ? » ; corps « L'article et sa vente en attente seront supprimés
  définitivement. » ; bouton « Supprimer CHD3 ».
- **QU-58** · mineur · `app/a-comptabiliser/page.tsx:106-110`, `:150-155`. Pendant le chargement, la tuile affiche
  « 0 » ; l'erreur est brute.
  **Correctif :** squelette ; `ErrorState`.
  **Texte :** « Impossible de charger les ventes à comptabiliser. »
- **QU-60** · mineur · `SellDialog.tsx:104` ; `app/a-comptabiliser/page.tsx:339-352`. Des cibles de 30 et 36 px.
  **Correctif :** 44 px minimum, couvert par les primitives Bouton et Dialog.

### 3.9 Mise en vente

C'est un écran pour ordinateur, d'après la décision du 11/08/2026. Fondations qui s'appliquent ici :

- tokens en canaux pour la barre, le zoom et les vignettes (QU-04) ;
- `--warn-ink` (QU-06), échelle typographique (QU-12, QU-13) ;
- barre d'actions (QU-17, QU-19), bulle (QU-18), toasts (QU-20) ;
- champs reliés à leur libellé (QU-68 à QU-70, § 2.13) ;
- zoom photo sur la primitive Dialog (QU-03).

Symptômes propres à l'écran :

- **QU-61** · **bloquant** · `app/mise-en-vente/_barreAction.ts:92-106` (relu en synthèse) ; `page.tsx:539-541` ;
  `dc/etat.mev.etape-generation.annonce.png`. À l'étape 4, le bouton principal est « Nouvelle session », actif
  même quand des annonces ne sont pas enregistrées. Un clic efface la session, annonces générées et payées et
  photos comprises.
  **Correctif :** « Nouvelle session » passe en bouton secondaire. S'il reste des annonces non enregistrées, il
  ouvre un AlertDialog. L'action principale de l'étape devient « Tout mettre en vente », ou aucune (parcours P37).
  **Textes :** titre « Abandonner 2 annonces non enregistrées ? » ; boutons « Abandonner et recommencer » et
  « Annuler ».
- **QU-72** · majeur · `app/mise-en-vente/page.tsx:147-155` ; `components/Sidebar.tsx:206`, `:279`. Seule la
  fermeture d'onglet est protégée. Un clic dans le menu ou le dock perd photos et génération sans avertissement.
  **Correctif :** garde de navigation interne (interception des liens du cadre).
  **Textes :** « Quitter la mise en vente ? Les photos de 2 fiches seront perdues. » ; boutons « Quitter » et
  « Rester ».
- **QU-73** · majeur · `_publierVinted.ts:146-158` ; `ExportAnnonces.tsx:229` ;
  `dc/etat.mev.session-restauree.annonces.png`. Après restauration d'une session, une fiche sans photos part quand
  même en brouillon Vinted.
  **Correctif :** si `f.photos.length === 0`, le bouton est remplacé par un bouton qui ramène à la fiche, plus une
  garde dans `publierVinted`.
  **Texte :** « Ajouter les photos ».
- **QU-71** · majeur · `_components/EtapeSku.tsx:138-147` ; `RailArticles.tsx:74` ; `page.tsx:621-629`. Sous
  768 px, l'étape 1 accepte 5 SKU, mais l'étape 2 cache le rail : seule la fiche 1 est atteignable.
  **Correctif :** sous 768 px, `MAX_FICHES = 1` et « Ajouter un article » masqué, conformément à la décision du
  11/08.
- **QU-62** · majeur · `_barreAction.ts:78-90` ; `dc/etat.mev.etape-generation.terminee.png`, `…echec.png`. La
  barre affiche « Génération… » désactivé, sans Retour, même quand la génération est terminée ou a échoué.
  **Correctif :** passer `genEnCours` au descripteur de la barre ; Retour actif dans les deux cas.
  **Textes :** terminé, « 1 annonce prête » et le bouton « Voir les annonces » ; échec, « 1 génération échouée »
  et le bouton « Relancer les échecs ».
- **QU-63** · majeur · `FileGeneration.tsx:43-56`, `:95-103` ; `mc/etat.mev.etape-generation.echec.png`. Le titre
  « 0 annonce sur 1 » et sa consigne ne collent pas, et le message d'erreur est tronqué.
  **Correctif :** retirer `truncate` et afficher le message en entier.
  **Textes :** si rien n'a abouti, titre « La génération a échoué » et texte « Relance PIS7 ou reviens corriger sa
  fiche. » ; sinon « 2 annonces sur 3 générées ».
- **QU-64** · majeur · `ExportAnnonces.tsx:237`, `:84` ; `_publierVinted.ts:155` ;
  `DialogueDelaiVinted.tsx:79` ; `page.tsx:750`. « Publier sur Vinted » crée en réalité un brouillon.
  **Textes :** « Créer le brouillon Vinted », « Créer les 2 brouillons Vinted » ; fenêtre « Délai entre deux
  brouillons Vinted » ; boutons « Créer le brouillon » et « Créer les 2 brouillons ».
- **QU-08** · majeur · `ExportAnnonces.tsx:82`, `:231-238`. Les boutons Vinted ont un texte blanc sur `#09B1BA` :
  2,62:1.
  **Correctif :** un token `--vinted-bg` avec texte foncé (7,40:1), ou un fond `#00818a` (4,66:1).
- **QU-66** · majeur · `ExportAnnonces.tsx:55-93`, `:203-257` ; `page.tsx:782-793`. Cinq boutons pleins sur le même
  écran.
  **Correctif :** parcours P37.
- **QU-67** · majeur · `ExportAnnonces.tsx:100`, `:229-238` ; `_reducer.ts:440-448` ; `FicheArticle.tsx:605-671`.
  La couleur exigée par Vinted ne se révèle qu'à l'étape 4.
  **Correctif :** parcours P35.
  **Textes :** indice de l'étape 2, « la couleur (Vinted) » ; bouton de l'étape 4, « Choisir la couleur ».
- **QU-68** · majeur · `EtapeSku.tsx:34`, `:48-76`. Les champs SKU n'ont ni libellé ni focus visible : la bordure
  accent est la même au repos et au focus.
  **Correctif :** bordure neutre au repos, accent au focus ; anneau `--focus`.
  **Texte :** `aria-label="SKU de l'article 1"`.
- **QU-69** · majeur · `ExportAnnonces.tsx:142-147`, `:159-170`, `:279-281`. Titre, description et mots-clés sont
  des `<textarea>` sans libellé associé ni focus visible.
  **Correctif :** `id` et `<label htmlFor>` ; anneau de focus.
  **Texte :** libellé « Titre de l'annonce PIS7 ».
- **QU-70** · majeur · `FicheArticle.tsx:398`, `:440`, `:529-561`, `:674-716`. Les libellés ne sont pas reliés, et
  les groupes de chips n'ont ni `fieldset` ni `legend`.
  **Correctif :** § 2.13 et § 2.14 : boutons radio natifs pour les choix uniques, cases à cocher pour Matière et
  Couleur, `aria-label` sur le sélecteur de prompt.
- **QU-75** · majeur · `page.tsx:760-766` ; `mc/etat.mev.etape-fiches.prete.png` (« 1 fic… »). L'indice de la barre
  est tronqué.
  **Correctif :** retirer `truncate` ; sous 768 px, l'indice sur sa propre ligne, en `role="status"`.
- **QU-78** · majeur · `FicheArticle.tsx:674`, `:566-583` ; `page.tsx:411`. « Prix suggéré » est en réalité le prix
  de vente, et « Compte Vinted » propose aussi Vestiaire Collective.
  **Textes :** « Prix de vente », avec l'aide « Proposé par le prompt Pulls islandais, modifiable » ; « Compte de
  vente ».
- **QU-21** · mineur · `FicheArticle.tsx:276` ; sonde X5. La carte Photos collante glisse sous la barre du haut.
  **Correctif :** `top: calc(var(--topbar-h) + 16px)`.
- **QU-65** · mineur · `ExportAnnonces.tsx:60-73`, `:206-220`.
  **Textes :** par fiche, « Enregistrer en brouillon » et « Mettre en vente » ; en groupe, « Tout enregistrer en
  brouillon » et « Tout mettre en vente ».
- **QU-74** · mineur · `page.tsx:768-781`. « Retour » depuis l'étape 4 mène à l'écran de génération.
  **Correctif :** l'étape 4 revient à l'étape 2.
- **QU-76** · mineur · `_reducer.ts:339` ; `FicheArticle.tsx:240-264`. Les limites s'appliquent en silence.
  **Correctif :** message en ligne, en `role="status"`.
  **Textes :** « 3 photos maximum : désélectionne-en une. », « 2 couleurs maximum. »
- **QU-77** · mineur · `FicheArticle.tsx:299-319`. Les photos ajoutées ne sont pas présélectionnées.
  **Correctif :** parcours P34.
- **QU-79** · mineur · `FicheArticle.tsx:569-602` ; `page.tsx:653-663`. Le compte et la date s'enregistrent sans
  retour visible.
  **Textes :** mention en ligne « Enregistré » (`role="status"`) ; échec, « Compte de vente non enregistré.
  Réessaie. »
- **QU-80** · mineur · `FicheArticle.tsx:608-635`, `:706-712`. Des pastilles rouges « requis » apparaissent dès
  l'arrivée sur la fiche.
  **Textes :** « Obligatoire » en neutre, puis « À choisir » après une première tentative ; « Remplissage
  automatique Vinted · activé ».
- **QU-81** · mineur · `FileGeneration.tsx:58-89`. La progression n'est pas accessible.
  **Correctif :** `role="progressbar"` avec `aria-valuenow` et `aria-valuemax` ; une région `role="status"` rendue
  vide d'avance.
  **Textes :** « Annonce PIS7 générée », « Échec pour PIS7 ».
- **QU-82** · mineur · `page.tsx:314`, `:687`. « Relancer » une fiche efface les autres de l'écran.
  **Correctif :** ajouter l'id relancé à `lotGeneration` au lieu de l'écraser.
- **QU-83** · mineur · `page.tsx:448-462`. Aucun retour après l'envoi à Vinted, et l'onglet ouvert peut être bloqué
  comme popup.
  **Textes :** « PIS7 envoyé en brouillon Vinted (file : 2 annonces, délai 2 à 5 min). » ; si `window.open` renvoie
  `null`, un toast avec le lien « Ouvrir Vinted ».
- **QU-84** · mineur · `page.tsx:705`, `:508-511`. La fenêtre de délai s'ouvre aussi pour un seul article.
  **Correctif :** parcours P38.
- **QU-85** · mineur · `_barreAction.ts:47-55`. « 2 articles trouvés » s'affiche pour un même SKU saisi deux fois.
  **Texte :** « 1 article trouvé · 1 doublon ».
- **QU-86** · mineur · `EtapeSku.tsx:36` ; `FicheArticle.tsx:295` ; `page.tsx:201`.
  **Textes :** « Appuie sur Entrée pour vérifier le SKU et passer au suivant. » ; « La 1re photo sélectionnée
  compte le plus pour l'IA. » ; « Recherche impossible. Vérifie ta connexion et réessaie. »
- **QU-87** · mineur · `ExportAnnonces.tsx:97`, `:148-150`, `:242-248`. « Copier » ajoute le SKU, « Copier tout »
  non.
  **Correctif :** même contenu copié partout ; option explicite pour le SKU ; compteur en `--neg` au-delà de la
  limite.
  **Textes :** « Copier avec le SKU » ; compteur « 43 / 100 caractères ».
- **QU-88** · mineur · `ExportAnnonces.tsx:46-50`, `:251-256`. La copie n'a pas de `try`, et rien n'est annoncé.
  **Textes :** échec, « Copie impossible : sélectionne le texte et copie-le à la main. » ; succès, « Copié » en
  `role="status"`.
- **QU-89** · mineur · `page.tsx:565-596`. Les étapes n'exposent pas l'étape en cours, et le sur-titre fait doublon.
  **Correctif :** `<ol aria-label="Étapes">` avec `aria-current="step"` ; supprimer le sur-titre ; 44 px sur
  mobile.
- **QU-90** · mineur · `page.tsx:733`, `:738-742`. La photo agrandie a `alt=""`, et « Fermer » chevauche l'avatar.
  **Correctif :** « Fermer » placé dans le cadre de l'image.
  **Texte :** `alt="Photo 1 de PIS7"`.
- **QU-91** · mineur · `EtapeSku.tsx:93` ; `FicheArticle.tsx:328-351` ; `FileGeneration.tsx:109` ;
  `ExportAnnonces.tsx:284`. Des cibles de 28 à 34 px.
  **Correctif :** zone étendue à 44 px sous 768 px. Priorité basse, puisque l'écran est pour ordinateur.

### 3.10 Studio : catalogue

- **SU-45** · majeur · `app/studio/_components/Accueil.tsx:25-27` ; sonde X11. La génération, le filtre et la
  recherche se perdent au rechargement et au retour depuis une fiche.
  **Correctif :** `?generation=V2&filtre=a_juger&q=…`, lu par `useSearchParams` et écrit par
  `router.replace(…, { scroll: false })`. Le lien « Tous les coloris » de la fiche renvoie vers cette URL.
- **SU-46** · majeur · `Accueil.tsx:133-147`, `:175-183`, `:207-212`. Les phrases d'action sont floues,
  « À photographier » apparaît deux fois, et la jauge des cases prises porte le libellé des cases libres.
  **Correctif :** retirer le badge « À photographier » quand le bouton le dit déjà.
  **Textes :** « Juger 3 images », « Photographier le sac », « Ranger 2 photos », « Générer 30 variantes pour
  SDN3 », « Rien à préparer » ; jauge « Variantes utilisées 6 / 36 ».
- **SU-47** · mineur · `Accueil.tsx:112-115`, `:16`. L'état vide filtré n'offre aucune sortie, et le filtre parle à
  la première personne.
  **Textes :** « Aucun coloris pour « zzz-aucun » en V2. » avec le bouton « Effacer les filtres » ; sans aucun
  coloris, « Aucun coloris dans SacBase pour l'instant. » ; filtre « Doublons chez toi ».

### 3.11 Studio : fiche (planche, angles, modèles, génération, file à juger)

Fondations qui s'appliquent ici : `loading.tsx` et `error.tsx` (SU-22), champs (SU-26, SU-61), onglets (SU-25),
bulle (SU-57). Le Studio est pour ordinateur seulement (CLAUDE.md du projet).

- **SU-02** · **bloquant** · `ImportPrises.tsx:261-296`, `:180` ; `app/api/studio/references/[id]/route.ts:54-74`
  (le `DELETE` existe, avec un 409 si la photo a servi) ; sonde S2. Aucun moyen de retirer ou de remplacer une
  photo, et une planche pleine bloque tout ajout.
  **Correctif :**
  - sur chaque photo, un bouton de menu `aria-haspopup="menu"` qui propose « Remplacer la photo » (un sélecteur de
    fichier ciblé sur cet ordre) et « Retirer de la planche » (`DELETE`, puis `router.refresh()`) ;
  - pendant l'appel, la case affiche « Retrait… ».
  **Textes :** nom du bouton « Actions pour la photo Face » ; sur un 409, « Cette photo a déjà servi à une
  variante : elle reste sur la planche. »
- **SU-05** · **bloquant** · `FileAJuger.tsx:80-92` (relu en synthèse), `:167-168` ;
  `app/api/studio/essais/[id]/route.ts:22` (`decision: null` accepté) ; sonde S3. V ou R écrit la décision 5 ms
  après l'appui, sans annulation. Un rejet ne donne aucun retour.
  **Correctif :** la décision s'applique, l'image suivante s'affiche, et un toast de 5 s propose « Annuler »
  (`PATCH { decision: null }`, l'image revient dans la file).
  **Textes :** « Validée pour SDN3 » ; « Image rejetée » ; action « Annuler ».
- **SU-01** · majeur · `Fiche.tsx:152-156` (le commentaire de `:31-34` dit le contraire) ; sonde S1 (« À juger » à
  y = 1 370 pour un écran de 900). La planche de 15 cases passe avant la file à juger.
  **Correctif :** parcours P44.
- **SU-03** · majeur · `ImportPrises.tsx:78-81` ; sonde X10. Un dépôt plus gros que les cases libres refuse tout le
  lot, avec une consigne impossible à suivre (« retire-en d'abord »).
  **Correctif :** importer les N premières photos, puis afficher un `toast.warning` avec `pluriel()`.
  **Texte :** « 2 photos en trop n'ont pas été importées : IMG_2041.jpg, IMG_2042.jpg. Retire ou remplace une photo
  pour les ajouter. »
- **SU-04** · majeur · `ImportPrises.tsx:262-295` ; `TableauCases.tsx:271-284`. Quatre façons de ranger une prise.
  **Correctif :** parcours P45. Il supprime le `<select>` de `TableauCases.tsx:271-284` (PRD § 8).
- **SU-06** · majeur · `FileAJuger.tsx:162-177`. Les raccourcis à une touche écoutent `window` : V valide même
  depuis la confirmation de dépense, et ← → empêchent de faire défiler le tableau au clavier.
  **Correctif :** écoute sur la section « À juger » (`tabIndex={-1}`, `onKeyDown`) ; touches ignorées sur un
  bouton, un `[role=alertdialog]` ou une zone défilable ; interrupteur mémorisé (WCAG 2.1.4).
  **Texte :** interrupteur « Raccourcis V / R / C ».
- **SU-07** · majeur · `Fiche.tsx:70-72` ; `lib/studioCases.ts:106` ; `TableauCases.tsx:64` ; sonde S4. Une image
  rejetée disparaît sans trace.
  **Correctif :** parcours P46 (historique).
  **Textes :** « Tentatives (3) » avec `aria-expanded` ; case « Libre · 2 rejets » ; action « Retenir cette
  version ».
- **SU-08** · majeur · `TableauCases.tsx:86-91`, `:372` ; `SelecteurModeles.tsx:204-389` (jamais importé) ;
  `useModeles.ts:52-71` ; sonde S6. Les étoiles de favoris sont décoratives : le vrai sélecteur est du code mort.
  **Correctif :** parcours P48 ; chaque étoile devient un `<button aria-pressed>` qui appelle `basculerFavori`.
  **Texte :** nom de l'étoile « Épingler Seedream 5.0 Flash en favori ».
- **SU-09** · majeur · `TableauCases.tsx:360-394` ; `dc/etat.studio.modeles-selection.autre-modele.png`. Le modèle
  choisi dans « Autre modèle… » n'est visible nulle part.
  **Correctif :** `value={modele && !proposes.includes(modele) ? modele.id : ""}`, ou une pastille
  `aria-pressed="true"` ajoutée ; à terme, le sélecteur unique.
- **SU-10** · majeur · `TableauCases.tsx:397-408`, `:121` ; `lib/studioModeles.ts:17` ; sonde S8. Aucune
  information de décision ne figure à côté de « Générer ».
  **Correctif :** parcours P48 et P49.
- **SU-11** · majeur · `FileAJuger.tsx:183`, `:111-113`, `:333` ; `dc/etat.studio.correction-panel.png`. Pour un
  modèle absent du catalogue, le serveur demande une confirmation (409), mais l'encadré ne s'affiche jamais : la
  correction est impossible.
  **Correctif :** afficher l'`alertdialog` dès que `confirmation === true`, avec `r.devis`, et afficher le devis sur
  « Régénérer » avant le clic.
  **Texte :** « Coût inconnu : ce modèle n'est plus au catalogue. Confirmer quand même ? »
- **SU-12** · majeur · `TableauCases.tsx:93-97`, `:357`, `:403-404`. Quand le catalogue est indisponible, la page
  affiche « Choisis au moins une case. » alors que 8 cases sont choisies, et l'erreur est technique.
  **Correctif :** inclure `!modele` dans `bloque` ; afficher `bloque` sous le devis.
  **Textes :** en chargement, « Chargement des modèles… » ; catalogue indisponible, « Catalogue OpenRouter
  indisponible. » avec le bouton « Réessayer » et la suite « ou génère « À la main, dans Gemini ». »
- **SU-13** · majeur · `TableauCases.tsx:93-95`, `:414`, `:464` ; `dc/route.studio.fiche.hors-catalogue.png`. La
  raison du blocage n'existe que dans le `title` d'un bouton désactivé, et le devis affirme « part sans
  confirmation ».
  **Correctif :** `bloque` en texte visible (`role="status"`) ; quand il n'y a pas de cible, devis et choix des
  cases masqués.
  **Texte :** « Aucun sac de ce coloris sans annonce : rien à préparer. Les photos restent disponibles pour un
  prochain sac. »
- **SU-14** · majeur · `Fiche.tsx:39-40`, `:117-146` ; `TableauCases.tsx:64-67`, `:221-227`, `:306`. La file juge
  le sac SDN4 pendant que le tableau prépare SDN3, et les compteurs se contredisent (3 contre 0).
  **Correctif :** parcours P47.
  **Textes :** « À juger (tous sacs) » ; « SDN3 : 1 photo prête · 0 à juger pour ce sac · 8 à générer ».
- **SU-15** · majeur · `FileAJuger.tsx:194`, `:286`. Pour un essai sans `skuCible`, l'écran promet que l'image
  rejoindra une annonce, alors qu'elle ne part dans aucune.
  **Textes :** « Cette image n'est rattachée à aucun sac : validée, elle compte au bilan mais ne part dans aucune
  annonce. » ; bouton « Valider sans annonce ».
- **SU-16** · majeur · `FileAJuger.tsx:268-281` ; `lancer.ts:63-72`. Un avis IA en échec s'affiche comme un avis
  jamais demandé.
  **Correctif :** conserver l'échec (code et message) ; un échec lié au compte garde le lien « Mon compte ».
  **Textes :** « Avis IA en échec : <raison>. » avec le bouton « Relancer l'avis » ; « Pas encore d'avis. » avec le
  bouton « Demander l'avis ».
- **SU-17** · majeur · `Fiche.tsx:74-82` ; `lancer.ts:64` ; sonde X0. Ouvrir une fiche déclenche des vérifications
  IA **payantes**.
  **Correctif :** supprimer la relance automatique.
  **Textes :** « 3 images sans avis IA. » avec le bouton « Demander les avis (≈ coût) » ; option dans les Réglages
  du Studio, « Vérifier automatiquement les nouvelles images ».
- **SU-18** · majeur · `TableauCases.tsx:83`, `:99-148`, `:418`. La progression vit dans un `useState` : changer de
  page perd le lancement payé.
  **Correctif :** parcours P51 ; garde de navigation et `beforeunload` ; progression dans un `role="status"`.
  **Texte :** « Une génération payée est en cours. »
- **SU-19** · majeur · `FileAJuger.tsx:133-148`. Le dépôt d'une version corrigée rejette d'abord l'original. Si
  l'envoi échoue, l'original reste rejeté et sa case libérée.
  **Correctif :** poster d'abord la nouvelle image (avec `essaiParentId`), puis rejeter l'ancienne ; ou, en cas
  d'échec, `PATCH { decision: null }`.
  **Texte :** « Dépôt impossible : l'image d'origine reste à juger. »
- **SU-23** · majeur · `TableauCases.tsx:210`, `:250-251` ; sonde X12. Le tableau des angles défile à l'horizontale
  à partir de 8 angles, sans indice.
  **Correctif :** colonnes en `minmax(0,1fr)` avec en-têtes en `line-clamp-2` (nom complet accessible) ; colonne
  photo à 160 px ; au-delà de 8 angles, tableau transposé ou onglets ; si un défilement reste, une ombre de bord.
  **Texte :** indice « 3 angles de plus → ».
- **SU-20** · mineur · `FileAJuger.tsx:80-92` ; `Fiche.tsx:183-194` ; `envoi.ts:48-55` ;
  `ImportPrises.tsx:139-145`. Une coupure réseau fige les boutons ou la planche.
  **Correctif :** `try/catch/finally` : `occupe` et `envoi` remis à `null`, `enVol` décrémenté.
  **Texte :** « Connexion perdue : réessaie. »
- **SU-21** · mineur · `Fiche.tsx:183-194`. Aucun retour après l'enregistrement des détails.
  **Texte :** « Détails enregistrés : ils serviront au prochain avis IA. »
- **SU-24** · mineur · `TableauCases.tsx:521-536`, `:264-284`. Chaque case s'annonce « Libre », sans photo ni
  angle.
  **Correctif :**
  `aria-label={`${choisie ? "Choisie" : "Libre"} — ${nomPrise(l.ordre)} × ${a.nom}`}` ; en-tête de ligne en texte
  simple (« 01 Face »).
- **SU-30** · mineur · `Fiche.tsx:118` (3,25:1) ; `TableauCases.tsx:374` (3,87:1).
  **Correctif :** « Hors catalogue SacBase » en `--ink`, précédé d'une icône d'alerte en `--warn` ; prix en `--ink2`
  sans opacité.
- **SU-48** · mineur · `ImportPrises.tsx:294`, `:202`, `:209`. Le bouton s'appelle « Dépose ici » alors qu'il ouvre
  un sélecteur de fichiers, et l'aide dit « touche » sur un écran d'ordinateur.
  **Textes :**
  - bouton « Ajouter une photo » ;
  - aide « Glisse chaque photo sur sa prise : sur une case occupée, les deux s'échangent. Au clavier : Déplacer,
    puis choisis la prise. » ;
  - bandeau « Photo Face sélectionnée : choisis la case où la ranger. »
- **SU-49** · mineur · `ImportPrises.tsx:259` ; `TableauCases.tsx:276`. Les noms de prise sont tronqués.
  **Correctif :** `line-clamp-2` (cellule de 2 lignes) ; nom complet dans le nom accessible.
- **SU-50** · mineur · `FileAJuger.tsx:27-31`. Le verdict de l'IA emprunte le vocabulaire de la décision.
  **Textes :** « L'IA suggère : valider », « …corriger », « …rejeter » ; « Score IA 31/100 (indicatif) ».
- **SU-51** · mineur · `TableauCases.tsx:424` ; `SelecteurModeles.tsx:64-69`. « Tarif au jeton » est affiché pour
  tout tarif inconnu, et « 8 tarifs inconnus » pour un seul modèle.
  **Correctif :** « au jeton » seulement si `raison === "jeton"`.
  **Textes :** « 8 images avec E2E Tarif inconnu : coût inconnu (ce modèle ne publie pas son prix). Confirmer ? » ;
  devis « inconnu (tarif non publié) ».
- **SU-56** · mineur · `ImportPrises.tsx:199` ; `TableauCases.tsx:217`. Des lignes d'environ 150 caractères.
  **Correctif :** `max-w-[65ch]`.
- **SU-58** · mineur · `app/studio/[cle]/page.tsx:17` ; `ds/route.404.studio-cle-inconnue.png`. Une clé inconnue
  affiche la 404 générique, en clair, avec « Retour au dashboard ».
  **Correctif :** créer `app/studio/[cle]/not-found.tsx`, puis revérifier le thème sombre. La cause du thème perdu
  est SUPPOSÉE.
  **Textes :** « Ce coloris n'existe pas (ou plus) dans SacBase. » ; lien « Tous les coloris ».
- **SU-59** · mineur · SUPPOSÉ (non mesuré) · `app/api/studio/image/route.ts:19-41` ; `Fiche.tsx:49-64`. Les
  vignettes chargent les JPEG de 1 600 px, et chaque avis IA relance un rendu serveur complet.
  **Correctif :** paramètre `?w=160` (redimensionnement et cache) ; un seul `router.refresh()` quand la file est
  vide.
- **SU-60** · mineur · SUPPOSÉ · `ImportPrises.tsx:204-214`, `:131-146`. La région `aria-live` est en
  `visibility: hidden`, et les déplacements ne sont pas annoncés.
  **Correctif :** une région `sr-only` en `role="status"`, toujours présente.
  **Texte :** « Face rangée sous Dos, échangée avec Dos. »
- **SU-35** (volet fiche) · mineur · `Fiche.tsx:143`. À 390 px, la fiche déborde de 51 px.
  **Correctif :** `flex flex-wrap` sur la rangée de KPI, ou le message de § 3.12.

### 3.12 Studio : Bilan

- **SU-54** · majeur · `app/studio/bilan/page.tsx:41-109`. Le Bilan n'a que des chiffres et des tableaux, et il
  n'est pas accessible depuis la fiche d'un coloris.
  **Correctif :** graphiques faits avec le skill `dataviz` (réussite au premier essai, coût par image validée par
  modèle, petits multiples par angle).
  **Texte :** lien « Bilan de ce coloris » vers `/studio/bilan?coloris=…`.
- **SU-52** · mineur · `bilan/page.tsx:44-51`, `:74`, `:104`, `:125`, `:151`, `:172`. Des pluriels en « (s) »,
  deux lignes d'angle homonymes, des états vides sans suite.
  **Correctif :** `pluriel()` ; note « ≥ » masquée tant qu'il n'y a pas de données.
  **Textes :** « 9 couples coloris × angle », « 16 décidés · 3 échecs » ; « Trois-quarts face (v1, archivée) » ;
  « Aucun essai pour l'instant. » avec le bouton « Ouvrir le Studio ».
- **SU-53** · mineur · `bilan/page.tsx:130`, `:157`. La première colonne n'a pas d'en-tête.
  **Correctif :** `<th scope="col">Modèle</th>` (ou Angle, ou Coloris) ; `scope="row"` sur la cellule de libellé.
- **SU-35** (volet Bilan) · mineur · `bilan/page.tsx:71` ; sonde G4. À 390 px, la page déborde de 28 px.
  **Correctif :** `grid-cols-1 min-[900px]:grid-cols-2` ; tableaux dans un `overflow-x-auto` avec ombre ; ou un
  message sous 768 px (question 11).
  **Texte :** « Le Studio s'utilise sur ordinateur. »
- **SU-56** (volet Bilan) · mineur · `bilan/page.tsx:56`, `:65`.
  **Correctif :** `max-w-[65ch]`.

### 3.13 Réglages (`/parametres`)

Fondations qui s'appliquent ici : modale unique (SU-28), libellés (SU-26), contraste (SU-29), 16 px sur mobile
(SU-33), onglets (SU-25, SU-37), focus (SU-61).

- **SU-34** · majeur · `components/parametres/PromptsStudio.tsx:180-181` ; sonde G4 (débordement de 516 px) ;
  `mc/route.parametres.onglet-studio.png`. À 390 px, l'onglet Studio déborde : « Modifier » et la corbeille sont
  hors écran.
  **Correctif :** `grid grid-cols-1 min-[900px]:grid-cols-[320px_minmax(0,1fr)]` et `min-w-0` sur le module de
  liste.
- **SU-27** · majeur · `app/parametres/page.tsx:465`, `:562-581` ; `dc/etat.params.prompt-modal.erreur.png`. Dans la
  modale de prompt, « Le nom est requis. » apparaît tout en bas, loin du champ, et les boutons sont rognés par un
  défilement imbriqué.
  **Correctif :** retirer le conteneur `max-h` (§ 2.15) ; boutons dans le `footer` ; une erreur par champ.
  **Textes :** « Donne un nom au prompt. », « Écris le contenu du prompt. », « Saisis un prix supérieur à 0 €, ou
  laisse vide. »
- **SU-38** · majeur · `PromptsStudio.tsx:157-176`, `:281-302` ; `lib/studioCases.ts:71-75`. Le bloc « Ce qui
  part pour une photo » décrit le flux manuel, pas le texte réellement envoyé par l'API. Le budget n'est réglable
  nulle part.
  **Correctif :** un bloc en lecture seule qui montre `promptVariante(maître, angle)` avec « Copier » ; deux
  nouveaux réglages (ajout de colonnes Studio, PRD § 8).
  **Textes :** « Prompt envoyé par l'API » ; « Budget par sac (€) » (1 par défaut) ; « Taux $ → € ».
- **SU-39** · majeur · `app/parametres/page.tsx:313-322` ; `MetaPrompt.tsx:66`, `:83`, `:120` ; `TopBar.tsx:20`.
  « Modèle » désigne trois choses.
  **Correctif :** « prompt » pour le texte, « modèle » réservé au moteur IA.
  **Textes :** « Prompts enregistrés », « Faire écrire un prompt par une IA », « Enregistrer le prompt », toast
  « Prompt enregistré. » ; sous-titre « Prompts d'annonce ». Voir la question 5 : `docs/design-system.md` § 11
  propose « Modèles d'annonce », ce qui réintroduit l'ambiguïté.
- **SU-40** · majeur · `app/parametres/page.tsx:283-458` ; `mc/route.parametres.png` (la liste arrive après environ
  2 écrans). La gestion des prompts arrive en dernier.
  **Correctif :** parcours P53.
- **SU-41** · majeur · `app/parametres/page.tsx:102-111`, `:152-157`. Saisir « -5 », « 0 » ou une valeur
  invalide efface l'objectif existant, avec un toast de succès.
  **Correctif :** champ vide, bouton explicite « Retirer l'objectif » ; valeur invalide, une erreur sous le champ
  (`aria-invalid`) et aucun appel réseau ; pendant l'envoi, « Enregistrement… ».
  **Texte :** « Saisis un montant supérieur à 0 €. »
- **SU-42** · majeur · `app/parametres/page.tsx:233-238`, `:410-417` ; `lib/hooks.ts:471-477`. Créer ou modifier un
  prompt ne confirme rien, et une suppression qui échoue est silencieuse.
  **Correctif :** toasts de succès ; suppression avec annulation (recréation), ou AlertDialog ; en cas d'erreur, la
  sélection est conservée ; nom accessible de la corbeille.
  **Textes :**
  - « Prompt créé. », « Prompt enregistré. » ;
  - « Prompt « Polos Tommy Hilfiger » supprimé. » avec l'action « Annuler » ;
  - « Suppression impossible : <raison> » ;
  - `aria-label={`Supprimer le prompt ${selected.nom}`}`.
- **SU-43** · mineur · `PromptsStudio.tsx:89-99`, `:199-202`, `:242-251`. L'erreur de chargement n'a pas d'action,
  la suppression est muette, changer d'angle perd la saisie, et la raison du blocage est dans une info-bulle.
  **Textes :**
  - « Impossible de charger les prompts du Studio. » avec le bouton « Réessayer » ;
  - « Prompt d'angle supprimé. » ;
  - « Abandonner les modifications de « 8° à droite » ? » ;
  - sous la corbeille, « Utilisé par 5 cases : il ne peut plus être supprimé. » ;
  - `aria-label={`Supprimer ${sel.nom}`}`.
- **SU-44** · mineur · `PromptsStudio.tsx:259`, `:278`. Des valeurs en lecture seule ont l'apparence d'un champ.
  **Correctif :** `<dl>` en texte simple.
- **SU-62** · mineur · `app/parametres/page.tsx:369-377`. Le prompt sélectionné n'est signalé que par la couleur.
  **Correctif :** `aria-pressed={actif}` et une coche, ou une barre latérale.

### 3.14 Mon compte

Fondations qui s'appliquent ici : contraste (CO-8, CO-9, CO-10), libellés et `autocomplete` (CO-11, CO-12),
erreurs en ligne (CO-13), 16 px sur mobile (CO-14), échelle (CO-15), bouton en cours (CO-32), titres (CO-35),
focus (CO-45), toasts et bulle (CO-38).

- **CO-4** (= CA-15) · majeur · `components/compte/Integrations.tsx:239-252` ; sonde X15. Au retour de Trello,
  aucun message, ni de succès ni de refus.
  **Correctif :** un bandeau dans la carte « Mon Trello » plutôt qu'un toast : `role="status"` en cas de succès,
  `role="alert"` avec `messageErreur(code)` sinon, et un bouton « Fermer ».
  **Texte :** « Trello est connecté. »
- **CO-5** · majeur · `Integrations.tsx:102-110`, `:283-293`. « Tester » teste la clé **enregistrée**, pas celle
  qui vient d'être collée : c'est une fausse assurance.
  **Correctif :** option A, libellé explicite, bouton masqué sans clé et placé après « Enregistrer » ; option B,
  envoyer la clé saisie dans le POST.
  **Textes :** option A, « Tester la clé enregistrée » ; option B, « Tester cette clé ».
- **CO-6** · majeur · `Integrations.tsx:418-423` contre `:45-49`. Le paragraphe dit « tes annonces utilisent celle
  de MyFlip » alors que la pastille dit « la génération échouera ».
  **Correctif :** un texte selon `dto.source.openrouter`.
  **Textes :**
  - `app` : « Tant que tu n'enregistres pas ta clé, tes annonces utilisent celle de MyFlip, sur son quota. » ;
  - `absente` : « Aucune clé n'est configurée : colle ta clé OpenRouter pour générer tes annonces. » ;
  - `utilisateur` : « Ta clé est chiffrée : seuls ses 4 derniers caractères restent visibles. »
- **CO-7** · majeur · `Integrations.tsx:50-57`. L'état le plus grave, « absente », est le moins visible (`--faint`,
  3,89:1) ; l'état sain, « app », est en ambre (3,25:1).
  **Correctif :** « absente » en `--neg` (6,03:1) avec `AlertTriangle` ; « app » en `--warn-ink` avec `Info` ;
  « utilisateur » en `--pos` avec `Check` ; 12 px minimum.
- **CO-16** · majeur · `Integrations.tsx:94-98`, `:470-475`, `:530-535` ; `mc/route.compte.png`. Les sélecteurs
  sont tronqués à 390 px, et l'état de la clé est logé dans le placeholder.
  **Correctif :** prix et note dans l'aide sous le sélecteur ; état de la clé en texte visible sous le libellé.
  **Textes :** option « Gemini 3.6 Flash (par défaut) » ; « Clé enregistrée : ••••0000 ».
- **CO-28** · majeur · `Integrations.tsx:205-208`, `:376` ; `app/demarrage/page.tsx:50-53`, `:109`. Ni état de
  chargement ni état d'erreur : la page reste blanche, ou les cartes disparaissent en silence.
  **Correctif :** squelette avec `aria-busy` ; `ErrorState` ; `try/catch`.
  **Texte :** « Impossible de charger tes réglages. » avec le bouton « Réessayer ».
- **CO-29** · majeur · `Integrations.tsx:283-374` ; `app/demarrage/page.tsx:64-107`, `:303-323`. Les promesses
  rejetées ne sont pas gérées, un double clic envoie deux PUT, et un 500 laisse partir vers `/commandes`.
  **Correctif :** patron de § 2.22, `res.ok` vérifié avant `router.push`.
- **CO-30** · majeur · `Integrations.tsx:653-657`, `:157-162`, `:692-696`. Changer de tableau conserve les
  étiquettes de l'ancien : rien ne remonte plus. Pendant le chargement, les champs affichent des identifiants
  bruts.
  **Correctif :** `setLabelId("")` et `setComptaLabelId("")` au changement de tableau ; sélecteur désactivé pendant
  le chargement.
  **Texte :** option « Chargement des étiquettes… ».
- **CO-17** · mineur · `lib/modelesIA.ts:40-110`. Les prix des modèles s'écrivent à l'anglaise, et la note du
  modèle par défaut trouble.
  **Correctif :** formater avec `Intl` ; supprimer « via Anthropic direct ».
  **Textes :** « 0,75 $ en entrée, 3,75 $ en sortie par million de jetons » ; « Modèle par défaut : bon équilibre
  entre coût et qualité. »
- **CO-18** · mineur · `Integrations.tsx:513`, `:573`. Deux boutons portent le même nom.
  **Textes :** « Enregistrer le modèle de rédaction », « Enregistrer le modèle de l'assistant », ou un seul envoi
  (parcours P59).
- **CO-19** · mineur · `app/compte/page.tsx:61-63`, `:164` ; `Integrations.tsx:312`, `:700`.
  **Textes :** « Changer le mot de passe » ; « Enregistrer le tableau et les étiquettes » ; « Mot de passe
  modifié. » ; « Impossible de changer le mot de passe. Réessaie dans un instant. » ; « 1 tableau trouvé » ou
  « 4 tableaux trouvés » (`pluriel()`).
- **CO-20** · mineur · `Integrations.tsx:602-708` ; `app/demarrage/page.tsx:33-254` ; `lib/trelloErreurs.ts:37-38`.
  « Board » et « tableau » désignent la même chose.
  **Textes :** « tableau » partout : « Tableau surveillé », « Recharger mes tableaux », « Préparer le tableau »,
  « Créer tout sur mon tableau », « Choisis ton tableau ».
- **CO-31** · mineur · `Integrations.tsx:182`, `:300-302` ; `app/demarrage/page.tsx:253-263`. Le spinner apparaît
  sur le mauvais bouton, et le chargement des tableaux désactive tout.
  **Correctif :** `enCours: "tout" | "sans" | null` ; un état en cours par action.
- **CO-33** · mineur · `app/compte/page.tsx:16-18`, `:86-95` ; `lib/useIdentite.ts:10-37`. La carte affiche
  « e2e-demo », tandis que la barre du haut affiche le prénom.
  **Correctif :** `const { nom, email, initiale } = useIdentite()` ; supprimer `initiales()`.
- **CO-34** · mineur · `app/compte/page.tsx:37`, `:100-103`. « Non défini » s'affiche pendant le chargement.
  **Correctif :** squelette tant que `isLoading`.
- **CO-40** · mineur · `app/compte/page.tsx:82`, `:99-105`. Trois boutons pleins, une carte étirée, une tuile
  « Authentification : Mot de passe » sans information.
  **Correctif :** `items-start` ; un envoi par carte ; supprimer la tuile.
- **CO-46** · mineur · `Integrations.tsx:411-416`, `:89-110`. Quand le chiffrement est indisponible, le champ reste
  actif et le message est technique.
  **Correctif :** `readOnly` et `aria-describedby`.
  **Texte :** « Impossible d'enregistrer une clé pour l'instant : le chiffrement n'est pas configuré sur le serveur.
  Ajoute ENCRYPTION_KEY dans les variables d'environnement Vercel. »
- **CO-47** · mineur · SUPPOSÉ · `Integrations.tsx:89-91`. Le gestionnaire de mots de passe peut remplir le mot de
  passe de connexion dans « Clé OpenRouter ».
  **Correctif :** § 2.13 (`name`, `new-password`, `data-1p-ignore`).
- **CO-48** · mineur (performance) · `app/compte/page.tsx:37` ; `Integrations.tsx:205-206`. Deux `GET` par page,
  et un cache périmé jusqu'à 60 s.
  **Correctif :** § 2.22 (`useReglages`, `invalidateQueries`).
- **CO-49** · mineur · `Integrations.tsx:348-353`. La déconnexion de Trello passe par `window.confirm`.
  **Correctif :** AlertDialog.
  **Textes :** titre « Déconnecter Trello ? » ; corps « MyFlip ne recevra plus les cartes de ton tableau et
  l'autorisation sera révoquée chez Trello. Tu pourras le reconnecter ensuite. » ; boutons « Déconnecter Trello »
  et « Annuler ».

### 3.15 Démarrage

Fondations qui s'appliquent ici : titre de la barre du haut (CO-36 = CA-46), une seule hauteur (CO-39), tokens en
canaux pour la pastille de l'étape (CO-23).

- **CO-1** · majeur · `Integrations.tsx:597`, `:627` ; `app/api/trello/connect/route.ts:26`. Lancée depuis le
  démarrage, la connexion Trello ramène sur `/compte` : on sort du parcours.
  **Correctif :** une prop `origine` sur `Integrations` ; le lien devient
  `/api/trello/connect?depuis=demarrage` ; `app/demarrage/page.tsx:181` passe `origine="demarrage"`.
- **CO-2** · majeur · `app/demarrage/page.tsx:45-62`, `:111`, `:184-194` ; `Integrations.tsx:181-273`. Une fois
  le tableau enregistré, « Continuer » reste désactivé, parce que la page tient sa propre copie des réglages. Il
  faut recharger.
  **Correctif :** `useReglages()` partout et `invalidateQueries` (§ 2.22).
- **CO-3** · majeur · `app/demarrage/page.tsx:124`, `:130`, `:296-323` ; `dc/etat.demarrage.steps.etape-3.png`. On
  peut sauter aux étapes futures : les précédentes s'affichent cochées, l'étape 3 affirme « Tout est branché », et
  les deux boutons terminent le démarrage.
  **Correctif :**
  - `faite = (n === 1 && trelloPret) || (n === 2 && etiquettesPretes) || (n === 3 && dto.onboardingTermine)` ;
  - seules une étape faite ou la première étape non faite sont cliquables, les autres reçoivent
    `aria-disabled="true"` ;
  - « Tout est branché. » ne s'affiche que si `trelloPret && etiquettesPretes`.
- **CO-24** · majeur · `app/demarrage/page.tsx:122-157`. L'étape active n'est signalée que par la couleur, et
  l'étape faite par une coche masquée aux lecteurs d'écran.
  **Correctif :** `aria-current="step"` ; un `<span className="sr-only">` d'état ; `<nav>` nommée.
  **Textes :** états « Étape terminée », « Étape en cours », « Étape à venir » ; nom de la navigation « Étapes du
  démarrage ».
- **CO-25** · majeur · `app/demarrage/page.tsx:184-194`, `:247-285`. La consigne est écrite dans un bouton
  désactivé.
  **Correctif :** libellé stable « Continuer » ; consigne visible au-dessus, reliée par `aria-describedby`, avec
  `aria-disabled` au lieu de `disabled`.
  **Textes :** « Connecte Trello puis choisis ton tableau pour continuer. » ; à l'étape 2 sans Trello, « Connecte
  d'abord Trello à l'étape 1. » avec le bouton « Revenir à l'étape 1 ».
- **CO-26** · majeur · `app/demarrage/page.tsx:168-197` ; `Integrations.tsx:399-577`. L'étape 1 embarque toute la
  carte IA, soit environ 700 px avant Trello.
  **Correctif :** parcours P55, qui scinde la carte en `<CartesIA/>` et `<CarteTrello/>`.
- **CO-27** · mineur · `app/demarrage/page.tsx:286-288`. « Les choisir à la main » renvoie vers `/compte`.
  **Correctif :** parcours P56, avec le bouton « Enregistrer les étiquettes ».
- **CO-37** · mineur · `app/demarrage/page.tsx:172`, `:202`, `:238`, `:296`. Environ 170 caractères par ligne.
  **Correctif :** `max-w-[65ch]`.
- **CO-51** · mineur · `app/demarrage/page.tsx:293-326`. Un compte déjà configuré voit encore « Ta première
  commande ».
  **Correctif :** si `onboardingTermine`, une carte d'état terminé.
  **Textes :** titre « Tout est prêt » ; texte « Trello est branché et ton tableau est préparé. » ; boutons « Voir
  mes commandes » et « Revenir au tableau de bord ».

### 3.16 Landing

Fondations qui s'appliquent ici : en-tête opaque, grâce aux canaux (CO-23) ; `scroll-padding` (CO-44) ;
contraste (CO-8) ; échelle (CO-15) ; espaces insécables (CO-42, § 2.3).

- **CO-22** · majeur · `components/landing/Landing.tsx:247-256`, `:442`, `:475`, `:561` ;
  `app/signup/page.tsx:134-142`. La FAQ promet un import CSV qui n'existe pas, et situe l'export ailleurs qu'il
  n'est. Elle promet un essai de 14 jours, alors que l'inscription exige un code d'invitation.
  **Correctif :** retirer les mentions d'essai et de tarif (question 2).
  **Textes :**
  - question sur l'import : « Pas encore : ton stock se crée à partir de tes commandes de lots. » ;
  - question sur les données : « Tu peux exporter ton stock en CSV depuis la page Stock. » ;
  - sous chaque bouton d'inscription : « Inscription sur invitation : MyFlip te fournit un code. »
- **CO-21** · mineur · `Landing.tsx:282-287`, `:442`, `:522` contre `app/signup/page.tsx:81`. La landing vouvoie,
  l'application tutoie.
  **Correctif :** passer la landing au tutoiement (question 2).
  **Textes :** « Pilote tes marges de l'achat à la pièce. », « Crée ton compte ».
- **CO-41** · mineur · `components/landing/SkuLifecycle.tsx:57-68`, `:118-147`. La carte change toutes les 2,4 s
  sans fin, la frise contient 4 `<li>` vides, et l'état réduit affiche « Animation désactivée ».
  **Correctif :** bouton de pause (`aria-pressed`), pause au survol et au focus ; `<span className="sr-only">` avec
  le statut dans chaque `<li>` ; supprimer les lignes 143 à 147.
  **Textes :** « Mettre en pause l'animation », « Reprendre l'animation ».
- **CO-43** · mineur · `Landing.tsx:51`, `:57`. Sur mobile, des chapeaux de 3 à 4 lignes sont centrés.
  **Correctif :** `text-left sm:text-center`.
- **CO-52** · mineur · `Landing.tsx:555`. Le bouton final pointe vers `/signup` en relatif, au lieu de `lienApp`.
  **Correctif :** `href={lienApp("/signup")}`.

---

## 4. Parcours

Les refontes ci-dessous fusionnent des écrans ou des fenêtres, réordonnent des étapes ou retirent des clics. Les
six triages en proposaient 64. Après dédoublonnage, il en reste 61.

Elles respectent deux sections du PRD :

- **§ 5** : aucun calcul métier ni contrat d'API modifié hors Studio ; seuls des ajouts au schéma, et pour le
  Studio uniquement ;
- **§ 10** : sélecteur de statut natif gardé ; hauteur de ligne du Stock liée à la virtualisation ; pas de
  bibliothèque sans justification ; pas de valeur en dur.

Une contrainte du PRD qu'un parcours touche est signalée.

### Cadre et pages publiques

- **P1. Dock à 5 places et feuille « Plus ».** Accueil, Stock, Vendre, À compta et Plus, à la place d'un ruban de
  10 tuiles.
  - *Gain :* Statistiques, Réglages et Mon compte passent d'invisibles à 2 touches. On ne se déconnecte plus par
    erreur en faisant défiler.
  - *Risque :* « Vendre » exige de choisir l'article, une étape non spécifiée (question 6).
  - *Ids :* CA-07, CA-08.
- **P2. Une seule fenêtre de vente**, ouverte depuis le Stock, À comptabiliser et le dock (§ 2.24).
  - *Gain :* un formulaire au lieu de deux, le compte de vente partout, la date connue conservée.
  - *Risque :* la comptabilisation déplace des étiquettes Trello. L'appel de `comptabiliser` doit rester
    identique, et les deux chemins doivent être testés.
  - *PRD :* contrat d'API inchangé.
  - *Ids :* ST-28, QU-48, QU-49, CA-02.
- **P3. Une seule mécanique de fenêtre** (§ 2.15). Quatre overlays deviennent un seul, et trois écrans gagnent
  d'un coup Échap et le retour du focus.
  - *Risque :* Radix est une nouvelle dépendance à justifier (PRD § 10) ; `<dialog>` n'en demande aucune.
  - *Ids :* CA-18 à CA-22, QU-01 à QU-03.
- **P4. Mot de passe oublié en accès direct.** Un lien invalide mène à `/login?mode=oubli`, avec l'e-mail
  prérempli.
  - *Gain :* on passe de « impasse, retaper l'URL, cliquer, retaper l'e-mail » à un clic, puis Envoyer.
  - *Ids :* CA-32, CA-60.
- **P5. Session expirée.** Retour sur la page en cours après reconnexion, avec un seul toast.
  - *Risque :* une redirection ouverte, d'où la validation de même origine (CA-34).
  - *Ids :* CA-17.
- **P6. Pages légales avec un en-tête commun** (Retour, MyFlip, onglets), ouvertes par `<Link>`.
  - *Gain :* plus de rechargement complet, une sortie visible.
  - *Ids :* CA-61, CA-31.
- **P7. 404 selon le contexte.** Tableau de bord, accueil ou « Retour aux coloris ».
  - *Ids :* CA-62, SU-58.
- **P8. La cloche compte les actions.** Le badge passe de 5 à 13, et le panneau devient une feuille sur mobile.
  - *Risque :* la notion de sévérité « action » est déduite du code ; elle est à confirmer sur des données réelles.
  - *Ids :* CA-01, CA-30.
- **P9. Connexion et inscription reliées.** Lien « Créer un compte » sur `/login`, liens légaux en pied, mention
  des CGU et de l'invitation, redirection vers `/dashboard` si une session existe déjà.
  - *Ids :* CA-59, CA-60, CO-22.

### Tableau de bord, statistiques, calendrier

- **P10. Période du tableau de bord dans l'URL** (`/dashboard?periode=30j`), données gardées pendant le changement.
  - *Gain :* plus de page blanche à chaque clic ; la période survit au retour arrière.
  - *Ids :* PI-18, PI-25.
- **P11. Une comparaison juste dans le héros.** On masque le delta hors vue Mois, ce qui reste de l'affichage ; ou
  on calcule une période équivalente, ce qui relève du PRD § 5.
  - *Gain :* une seule lecture juste de « où en est mon mois ».
  - *Ids :* PI-10, PI-11.
- **P12. L'objectif mensuel vit à un seul endroit, avec un lien direct.** Proposé : Mon compte, ancre `#objectif`,
  modifiable dans la carte Identité. Le tableau de bord y renvoie (« Définir mon objectif mensuel », puis
  « Modifier l'objectif »), et la carte disparaît de `/parametres`.
  - *Gain :* un clic au lieu de chercher « Paramètres » sous le nom « Prompts », puis de défiler.
  - *Ids :* PI-29, PI-30, SU-40, SU-41 ; question 1.
- **P13. Marques et meilleures ventes cliquables.** Chaque ligne de marque mène à `/stock?marque=…`, chaque
  « Meilleure vente » à `/stock?q=<SKU>`.
  - *Risque :* le Stock lit `?marque=`, mais que `?q=` soit lu est SUPPOSÉ.
  - *Ids :* PI-26.
- **P14. Totaux du mois en haut du calendrier, aussi sur mobile.**
  - *Gain :* la réponse sans défiler ; elle est aujourd'hui sous environ 1 300 px de grille, et absente du mobile.
  - *Ids :* PI-41.
- **P15. En-tête du calendrier sur une ligne** (« ‹ Octobre 2026 › Aujourd'hui »).
  - *Gain :* une rangée et une légende en moins.
  - *Ids :* PI-40.
- **P16. Un seul « Détail du jour »** : fenêtre sur ordinateur, accordéon sur mobile, jamais les deux.
  - *Gain :* l'information redevient accessible, sur tous les formats.
  - *Ids :* PI-36, PI-35.
- **P17. Mois du calendrier dans l'URL** (`?mois=2026-09`). On retrouve le mois consulté au retour d'un article.
- **P18. Périmètre des statistiques dans l'URL** (`?commande=<id>`), et lien « Voir les statistiques » sur chaque
  commande.
  - *Gain :* 1 clic au lieu de 3.
  - *Ids :* PI-46.
- **P19. « Vitesse de vente » et « Projection » fusionnées** sur la cadence à 30 jours.
  - *Gain :* une carte et une contradiction chiffrée en moins.
  - *Risque :* que l'API renvoie déjà la cadence à 30 jours est SUPPOSÉ ; sinon, c'est un ajout de champ, PRD § 5.
  - *Ids :* PI-47.
- **P20. Compte neuf : un seul état vide**, qui renvoie vers le démarrage ou « Créer une commande », au lieu de 20
  tuiles à zéro.
  - *Ids :* PI-33.

### Stock

- **P21. Sélection groupée sûre.** Écriture seulement sur les lignes visibles, compteur des lignes masquées, et
  confirmation chiffrée seulement si des articles vendus sont touchés.
  - *Gain :* on ne peut plus effacer des dizaines de ventes d'un clic, sans ajouter un clic dans le cas courant.
  - *Ids :* ST-2 ; question 7.
- **P22. Sortir de « Vendu » demande confirmation** (§ 3.6).
  - *PRD § 10 :* le sélecteur natif est gardé.
  - *Ids :* ST-1.
- **P23. Colonne Actions collante, et clic sur une ligne qui ouvre la fiche** (hors cellule modifiable).
  - *Gain :* plus de défilement horizontal à 1 440 px, un geste de moins par article.
  - *Risque :* un clic sur la ligne entre en conflit avec le double-clic d'édition et la sélection par glissement.
    Il faut limiter la zone de clic à la colonne SKU, ou ajouter un délai.
  - *Ids :* ST-14.
- **P24. Édition au clavier** (Entrée ou F2, puis Tab).
  - *Gain :* corriger une série de prix sans lâcher le clavier.
  - *Ids :* ST-5.
- **P25. Stock sur mobile.** KPI en une rangée ; feuille « Filtres (n) » qui contient aussi « Trier par » ; « Tout
  sélectionner (n) » au-dessus des cartes.
  - *Gain :* la première carte remonte d'environ 600 px, et le tri devient possible sur téléphone.
  - *Ids :* ST-34, ST-36.
- **P26. Filtres dans l'URL** : statut, marque, lot, commande, recherche, tri.
  - *Gain :* Retour et actualiser gardent la vue ; la cloche refiltre à chaque clic.
  - *Ids :* ST-45.
- **P27. Filtre Marque calculé sans lui-même.** On passe de Nike à Adidas en un choix au lieu de deux.
  - *Ids :* ST-44.
- **P28. Fiche détail complète**, avec « Vendre », « Changer le statut », « Supprimer » et « Créer l'annonce » vers
  `/mise-en-vente?sku=`.
  - *Gain :* elle remplace le double-tap invisible sur mobile, et on ne retape plus le SKU.
  - *Risque :* la mise en vente doit lire `?sku=`, ce qui est un ajout côté client.
  - *Ids :* ST-50.
- **P29. États vides utiles** : « Nouvelle commande » sur un compte neuf, « Effacer les filtres » sur une vue
  filtrée.
  - *Ids :* ST-20.
- **P30. KPI cliquables vers la vue filtrée correspondante, ou statiques sans effet de survol.**
  - *Ids :* ST-46.
- **P31. Chips de statut en retour à la ligne sur ordinateur.** Les 11 statuts visibles d'un coup.
  - *Ids :* ST-15.
- **P32. Suppression par une modale de l'application, avec retrait immédiat de la ligne.**
  - *Ids :* ST-23.

### Commandes, À comptabiliser, Mise en vente

- **P33. À comptabiliser : une action principale par ligne.** « Comptabiliser » ; « Remettre en stock » agit tout de
  suite avec « Annuler » ; « Supprimer » passe dans un menu ⋯ ; une ligne de synthèse remplace les trois tuiles ;
  la carte mobile affiche prix, date et transporteur.
  - *Gain :* environ 600 px de défilement en moins sur mobile, et plus besoin d'ouvrir la fenêtre pour lire le
    prix.
  - *Ids :* QU-52 à QU-56.
- **P34. Mise en vente, étape 2.** Les 2 ou 3 premières photos sont présélectionnées, et les champs obligatoires
  remontent en tête (Taille, État, Couleur si Vinted, Prix de vente) ; le reste se replie.
  - *Gain :* 10 à 15 clics par session de 5 articles.
  - *Ids :* QU-77, QU-80.
- **P35. La couleur Vinted est signalée dès l'étape 2**, et l'étape 4 offre « Choisir la couleur », qui ramène sur
  la fiche.
  - *Gain :* on ne découvre plus l'oubli à la fin.
  - *Ids :* QU-67.
- **P36. Mise en vente, étape 3.** La barre suit l'état réel, et le Retour de l'étape 4 mène à l'étape 2.
  - *Gain :* plus d'écran figé, un écran de passage en moins.
  - *Ids :* QU-62, QU-74.
- **P37. Mise en vente, étape 4 : une seule action pleine par fiche.** « Créer le brouillon Vinted » si l'article
  a un mapping, sinon « Mettre en vente ». « Nouvelle session » devient secondaire, avec confirmation.
  - *Gain :* plus de perte d'annonces payées, et la décision suivante se lit d'un coup d'œil.
  - *Ids :* QU-61, QU-64, QU-65, QU-66.
- **P38. Délai Vinted mémorisé pour un seul article** (« Délai 2 à 5 min · Modifier »). Une fenêtre et un clic de
  moins par publication.
  - *Risque :* que l'extension sache déjà tenir une file est SUPPOSÉ.
  - *Ids :* QU-84.
- **P39. Nouvelle commande réordonnée.** Fournisseur (avec la liste des fournisseurs connus), Date et Frais en tête,
  puis les lots, puis « Options » repliées (Grade, Coefficient visé). Bouton toujours actif ; toast avec la plage
  de SKU.
  - *Gain :* deux champs visibles en moins, et plus de passage au Stock pour vérifier les SKU.
  - *Ids :* QU-38, QU-39, QU-40.
- **P40. Commandes sur mobile.** « Créer une commande » et la liste d'abord ; total et fournisseurs repliés ;
  actions dans le détail ; bouton d'import retiré.
  - *Gain :* la liste visible sans défiler 700 px.
  - *Ids :* QU-26, QU-31, QU-37.
- **P41. Un fournisseur mène au Stock filtré.**
  - *Risque :* le Stock n'a pas de filtre fournisseur. Si le filtrage se fait côté client sur la liste chargée,
    c'est un ajout d'interface ; sinon, c'est un paramètre d'API, PRD § 5 (SUPPOSÉ, non vérifié).
  - *Ids :* QU-25.
- **P42. Mise en vente mono-article sous 768 px** (décision du 11/08).
  - *Ids :* QU-71.
- **P43. Garde de navigation sur la mise en vente.**
  - *Ids :* QU-72.

### Studio et Réglages

- **P44. La fiche s'ouvre sur la prochaine action.** « À juger » en tête quand la file n'est pas vide, puis
  Génération et Angles ; la planche se replie en bandeau (« 9 / 15 prises · Ajouter des photos · Afficher la
  planche », avec `aria-expanded`) ; toutes les sections sont repliables.
  - *Gain :* la file passe d'environ y = 1 370 px à y = 250 px, soit 1 100 px de défilement en moins par séance.
  - *Ids :* SU-01.
- **P45. Un seul geste pour ranger.** Glisser, plus un menu « Déplacer vers… » au clavier. Le `<select>` des angles
  et le sélecteur de fichiers par case vide disparaissent. Le dépôt global remplit les cases libres et signale le
  surplus. Un menu « Retirer / Remplacer » est ajouté sur chaque photo.
  - *Gain :* quatre mécanismes deviennent un seul, aucun lot n'est plus refusé, une photo erronée se corrige en
    deux clics.
  - *Ids :* SU-02, SU-03, SU-04, SU-48, SU-60.
- **P46. Juger sans erreur irréversible.** V ou R applique la décision et passe à l'image suivante, avec un toast
  « Annuler » de 5 s. Les raccourcis sont limités à la section. Chaque prise a son historique, rejets compris, avec
  « Retenir cette version ».
  - *Gain :* une touche par image, et chaque erreur se rattrape.
  - *PRD :* la durée de génération est un ajout de colonne Studio, autorisé.
  - *Ids :* SU-05, SU-06, SU-07.
- **P47. Un seul sac cible**, choisi en tête de la zone de travail, qui filtre à la fois la file et le tableau.
  - *Gain :* une seule source de vérité au lieu de deux chiffres contradictoires.
  - *Ids :* SU-14.
- **P48. Un seul sélecteur de modèles**, refonte de `SelecteurModeles`, aujourd'hui du code mort.
  - Recherche, favoris épinglés et basculables.
  - Par modèle : prix par image, coût par sac, réussite au premier essai, coût moyen réel, badge « hors budget ».
  - 1 à 3 modèles par lancement.
  - *Gain :* deux contrôles deviennent un seul, et l'on peut comparer.
  - *Ids :* SU-08, SU-09, SU-10.
- **P49. Devis en euros, comparé au budget** : « 8 images × Seedream : 0,24 $ ≈ 0,22 € · sac complet ≈ 0,41 € ·
  budget 1 €/sac ». La confirmation ne se déclenche qu'au-delà du budget ou pour un prix inconnu (« Confirmer
  1,34 € »).
  - *PRD :* le budget et le taux sont des ajouts de colonnes Studio, et le serveur recalcule le devis.
  - *Ids :* SU-10, SU-38, SU-51.
- **P50. Réglages du Studio accessibles depuis le Studio.** Un onglet « Réglages » dans la sous-navigation.
  - *Gain :* 1 clic au lieu de 3, sans flash d'onglet.
  - *Ids :* SU-37 ; question 10.
- **P51. Une génération se retrouve, et l'avis IA n'est plus automatique.** Le lancement est conservé côté serveur
  (`lancementId`), avec sa progression « 3 / 8 » sur la fiche et sur la carte du catalogue. Les avis IA se
  demandent par un bouton.
  - *Gain :* aucun lancement payé n'est perdu, et l'ouverture d'une page ne déclenche plus de dépense.
  - *Ids :* SU-17, SU-18.
- **P52. Le catalogue devient une liste d'actions**, une phrase verbe-objet par carte, filtres dans l'URL.
  - *Ids :* SU-45, SU-46, SU-47.
- **P53. Réglages d'annonce recentrés.** La liste maître-détail des prompts passe en tête ; la carte compte, la
  tuile « Modèle IA » et l'objectif en sortent ; un seul « Nouveau prompt » ; sur mobile, la sélection ouvre le
  détail.
  - *Gain :* la liste visible au chargement (y ≈ 150 au lieu de 600 sur ordinateur), et deux écrans de moins sur
    mobile.
  - *Ids :* SU-40 ; questions 1 et 4.
- **P54. Un Bilan lisible**, fait avec le skill `dataviz`, et un lien « Bilan de ce coloris » depuis la fiche.
  - *Ids :* SU-54.

### Compte, démarrage, landing

- **P55. Démarrage, étape 1 : Trello seul.** Le retour OAuth revient sur `/demarrage`, et l'étape 2 s'ouvre seule
  quand le tableau est enregistré.
  - *Gain :* environ 700 px de défilement en moins (1,5 écran sur mobile), une page parasite et un rechargement
    supprimés.
  - *Ids :* CO-1, CO-2, CO-26.
- **P56. Démarrage, étape 2 : les étiquettes dans l'étape**, puis passage direct à l'étape 3 quand les deux
  étiquettes sont désignées.
  - *Ids :* CO-27.
- **P57. Un fil d'étapes honnête** : retour seulement vers une étape faite ; une carte au lieu de deux par étape ;
  un état « Tout est prêt ».
  - *Ids :* CO-3, CO-25, CO-51.
- **P58. Rangement des réglages d'IA.** Les deux sélecteurs de modèle sont dans Mon compte, à côté de la clé ;
  Réglages y renvoie.
  - *Ids :* SU-40 ; question 4.
- **P59. Un seul formulaire pour les clés d'IA** : clé et deux modèles, bouton « Enregistrer les réglages IA »,
  puis « Tester la clé enregistrée ». Trois envois deviennent un seul.
  - *Ids :* CO-5, CO-18, CO-40.
- **P60. Erreurs de formulaire en ligne, avec focus.** Plus d'erreur en toast loin du formulaire, ni de bouton
  masqué sur mobile.
  - *Ids :* CO-13.
- **P61. De la landing à l'inscription : annoncer l'invitation** avant le formulaire, et faire passer le bouton
  final par `lienApp`.
  - *Ids :* CO-22, CO-52.

---

## 5. Reporté : à reprendre avec le design system

Ces points relèvent de l'identité : couleur, police, mouvement, style. Ils ne sont **pas** corrigés maintenant.
Seule leur part de fondation est traitée en § 2.

| Id | Ce qui est reporté | Ce qui est fait dès maintenant |
|---|---|---|
| CA-66 | Couper les transitions pendant la bascule de thème (`ThemeToggle.tsx:16-27`), pour éviter une page qui bave 150 à 200 ms. SUPPOSÉ. | rien |
| CA-67 | Couleurs codées en dur dans `Loader.tsx:31-51`, `SellDialog.tsx:20-22` et `calendrier/page.tsx:554-558`, à remplacer par des tokens à deux thèmes. | La partie SellDialog disparaît avec la fenêtre de vente unique (§ 2.24) ; voile et ombres du calendrier passent en tokens (§ 2.1, PI-7). |
| PI-45 | Couronne flottante, reflet, survols animés du calendrier. | Une seule itération, aucun survol sur un élément inerte, propriétés de transition nommées (§ 2.23). |
| QU-92 | Animations d'entrée, confettis de vente, translation au survol, barre de rentabilité à rebond. | Aucune animation ne laisse de `transform` sur `<main>` (§ 2.6). |
| CO-53 | Micro-libellés en capitales mono très espacées (style Direction C). | Casse naturelle dans les chaînes, `uppercase` en CSS (§ 2.4). |

Également reportés, sans id propre :

- les teintes des statuts et des canaux (ST-9, ST-11, ST-52, PI-8, QU-07). Seule la clarté est corrigée en § 2.2 ;
- le choix des polices (CA-52), le `Loader` « TRACE » (CA-50), le principe du comptage animé (PI-44), et
  l'esthétique des micro-libellés (ST-37) ;
- l'accent `--acc` vert forêt et lime de la Direction C, que `docs/design-system.md` interdit de réintroduire. Les
  corrections de § 2.2 le gardent **provisoirement**, puisque la palette actuelle est conservée.

**À mettre à jour avec la refonte** (PRD § 9) : le `CLAUDE.md` du projet décrit encore la Direction C comme source
de vérité et dit qu'« il n'y a plus de composant skeleton ». Ces deux points contredisent le PRD § 8. Ce n'est pas
corrigé ici (lecture seule).

---

## 6. Bugs fonctionnels

Comportements faux, indépendants du design. Le correctif est dans la section citée. « Supp. » signale un bug
SUPPOSÉ.

### 6.1 Données détruites ou écrasées

| Id | Reproduire | Observé, puis attendu | Correctif |
|---|---|---|---|
| ST-1 | Stock, article Vendu (LAC9), pastille de statut : choisir « En vente ». | Prix, date, marges et coef effacés sans confirmation. Attendu : « Annuler la vente de LAC9 ? » | § 3.6 |
| ST-2 | Stock, cocher 3 lignes dont une Vendu, filtrer sur une autre marque, statut « En stock », « Appliquer ». | Les 3 lignes invisibles changent, la vente est effacée. Attendu : écriture limitée aux lignes visibles, avec confirmation. | § 3.6 |
| QU-61 | Mise en vente : générer une annonce, ne pas l'enregistrer, cliquer « Nouvelle session ». | Annonce payée et photos perdues. Attendu : confirmation. | § 3.9 |
| QU-72 | Mise en vente : ajouter des photos, cliquer « Stock » dans le menu. | Photos perdues sans avertissement. | § 3.9 |
| SU-05 | Studio, file « À juger » : appuyer sur R. | Rejet écrit en 5 ms, sans retour ni annulation. | § 3.11 |
| SU-19 | Studio : « Corriger un détail » en mode manuel, puis couper le réseau pendant le dépôt. | L'original reste rejeté et sa case libérée. | § 3.11 |
| ST-25 | Stock : double-clic sur le prix d'achat, vider le champ, Entrée. | 0 € enregistré, marges fausses. | § 3.6 |
| SU-41 | Réglages : objectif « 0 » ou « -5 », valider. | Objectif effacé, avec un toast de succès. | § 3.13 |
| CO-30 | Mon compte, Trello connecté : changer de tableau, enregistrer. | Les étiquettes de l'ancien tableau sont gardées, et plus rien ne remonte. | § 3.14 |
| QU-41 | Nouvelle commande, marque par défaut. | « Polo Ralph Lauren », un libellé de lot, réintroduit sur les articles. | § 3.7 |
| QU-49 | À comptabiliser : « Vendre » un article dont la date de vente est connue. | Date du jour enregistrée. | § 3.8 |
| CA-64, QU-42 | Créer une commande entre 0 h et 2 h, heure de Paris. | Commande datée de la veille (UTC). | § 2.3 |
| QU-73 | Mise en vente : restaurer une session, puis « Publier sur Vinted » sur une fiche sans photos. | Brouillon Vinted créé sans photo. | § 3.9 |

### 6.2 Écran inutilisable ou contenu inaccessible

| Id | Reproduire | Observé | Correctif |
|---|---|---|---|
| CA-02, QU-01 | 390 px, À comptabiliser, « Vendre » ou « Supprimer ». | Fenêtre coupée, bouton sous le dock. Sur une longue liste, fenêtre hors écran (sonde X1 : haut à −797 px). | § 2.6, § 2.15 |
| CA-01 | 390 px : ouvrir la cloche. | Panneau coupé de 70 px à gauche. | § 2.10 |
| PI-36 | 390 px, Calendrier : toucher un jour avec ventes. | Accordéon et fenêtre s'ouvrent ensemble ; fermer replie tout ; les articles du jour ne sont visibles nulle part. | § 3.5 |
| PI-1, PI-46 | Statistiques : ouvrir le sélecteur de périmètre. | Le voile ne couvre ni la barre du haut ni le menu. | § 2.6 |
| PI-21 | 390 px, Tableau de bord, période « Tout ». | La page défile de 41 px à l'horizontale. | § 3.3 |
| SU-34 | 390 px, `/parametres?onglet=studio`. | Débordement de 516 px ; « Modifier » hors écran. | § 3.13 |
| QU-71 | 390 px, Mise en vente : 3 SKU, puis étape 2. | Les fiches 2 et 3 sont inatteignables. | § 3.9 |
| ST-16 | Stock de 1 200 articles : défiler jusqu'en bas. | La barre de défilement saute (estimation de 45 px pour 52 réels). | § 2.18 |
| SU-02 | Studio : vouloir retirer une photo de la planche. | Aucun moyen, alors que l'API le permet. | § 3.11 |

### 6.3 Données ou textes faux

| Id | Reproduire | Observé | Correctif |
|---|---|---|---|
| PI-10 | Tableau de bord, « Tout ». | « +54,0 % vs septembre » sous un total historique. | § 3.3 |
| PI-11 | Tableau de bord, « 30J ». | Semaines hors période à 0. | § 3.3 |
| PI-12 | Tableau de bord, « Par marque », marge négative. | « +-8,02 € », en vert. | § 3.3 |
| PI-17 | Calendrier, « Coef moyen ». | Pièces offertes comptées à 0 : la valeur diffère du tableau de bord. | § 3.5 |
| PI-20 | Calendrier, API en erreur. | « Aucune vente ce mois-ci. » | § 3.5 |
| PI-48 | Statistiques, égalité de deux jours. | Un seul jour est nommé. | § 3.4 |
| PI-51 | Tableau de bord, « Trimestre ». | Des marques sans vente, comptées « actives ». | § 3.3 |
| CA-30 | Cloche. | Badge à 5 pour 29 éléments. | § 3.1 |
| ST-21 | Stock filtré sur Brouillon. | « Articles au total 3 ». | § 3.6 |
| QU-53 | À comptabiliser, compte sans Trello. | « Synchro · Temps réel » avec une pastille verte. | § 3.8 |
| CO-5 | Mon compte : coller une nouvelle clé, puis « Tester ». | L'ancienne clé est testée, et déclarée valide. | § 3.14 |
| CO-6 | Mon compte, sans clé. | Le paragraphe et la pastille se contredisent. | § 3.14 |
| CO-3 | Démarrage, compte neuf : cliquer sur l'étape 3. | Étapes 1 et 2 cochées ; « Tout est branché ». | § 3.15 |
| CO-33 | Mon compte, carte Identité. | La partie locale de l'e-mail au lieu du prénom. | § 3.14 |
| SU-15 | Studio, essai sans sac cible. | Promet « rejoint l'annonce ». | § 3.11 |
| SU-08, SU-09 | Studio : cliquer une étoile, ou choisir « Autre modèle… ». | Étoile sans effet ; modèle choisi invisible. | § 3.11 |
| QU-62 | Mise en vente, génération terminée ou échouée. | Barre figée sur « Génération… », sans Retour. | § 3.9 |
| QU-82 | Mise en vente : relancer une fiche. | Les annonces déjà faites disparaissent ; compteur « 0 / 1 ». | § 3.9 |
| QU-85 | Mise en vente : même SKU saisi deux fois. | « 2 articles trouvés ». | § 3.9 |
| CA-28 | Assistant, réponse 504. | « ❌ Unexpected token '<'… » | § 3.1 |

### 6.4 Échecs silencieux ou états bloqués

| Id | Reproduire | Observé | Correctif |
|---|---|---|---|
| CA-15, CO-4 | Revenir de Trello sur `?trello=ok`, ou après un refus. | Aucun message (sonde X15). | § 2.20, § 3.14 |
| CA-33 | Mot de passe oublié, réseau coupé ; ou serveur en 500. | « Envoi… » bloqué ; ou faux succès. | § 3.2 |
| CA-57 | Inscription, réseau coupé. | « Création… » bloqué. | § 3.2 |
| CA-54, ST-27, QU-50 | Fenêtre de vente, prix 0. | « Confirmer la vente » ne fait rien. | § 2.24 |
| ST-24 | Fiche, date de vente « 20/10/2026 ». | `RangeError`, rien n'est enregistré. | § 3.6 |
| ST-26 | Stock : une édition échoue, puis on ouvre « Vendre ». | L'erreur précédente s'affiche dans la fenêtre. | § 2.24 |
| SU-11 | Studio : « Corriger un détail » sur un modèle hors catalogue. | Un 409 en boucle, aucun encadré. | § 3.11 |
| SU-20 | Studio, réseau coupé pendant une décision. | Boutons figés jusqu'au rechargement. | § 3.11 |
| SU-03 | Studio : 3 photos pour 1 case libre. | Tout le lot est refusé. | § 3.11 |
| SU-17 | Studio : ouvrir une fiche. | Des vérifications IA payantes partent seules (sonde X0). | § 3.11 |
| CO-1 | Démarrage, « Connecter Trello ». | Retour sur `/compte`. | § 3.15 |
| CO-2 | Démarrage : enregistrer le tableau. | « Continuer » reste désactivé jusqu'au rechargement. | § 3.15 |
| ST-45 | `/stock?statut=Brouillon`, puis « Tous », puis actualiser. | Retour sur Brouillon. | § 3.6 |

### 6.5 Sécurité, métadonnées, liens

| Id | Reproduire | Observé | Correctif |
|---|---|---|---|
| CA-34 | `/login?callbackUrl=https://autre-site`, puis se connecter. | Redirection hors du site (vue dans le code, non exploitée). | § 3.2 |
| CA-39 | Choisir le thème sombre avec un OS en clair. | La barre d'état reste claire. | § 2.9 |
| CA-65 | Supp. Partager un lien sans `NEXT_PUBLIC_LANDING_HOST`. | Open Graph vers `compta-polos.vercel.app`. | § 2.9 |
| SU-58 | `/studio/cle-inconnue` en thème sombre. | 404 générique en clair (cause supposée). | § 3.11 |
| CO-23 | Landing : faire défiler. | L'en-tête est transparent. | § 2.1 |
| CO-52 | Landing, bouton final, hôtes séparés. | Une redirection de trop. | § 3.16 |
| PI-52, ST-53, ST-54, CO-47 | Supp. Voir § 3. | Fuseau serveur, code mort, décalage de virtualisation, remplissage automatique. | § 3 |

---

## 7. Questions pour Aramis

1. **Où vit l'objectif mensuel ?** Aujourd'hui il est dans `/parametres`. Le tableau de bord pointe vers
   « Paramètres » (PI-29) ; SU-40 propose de le déplacer ; le triage Compte le propose dans Mon compte. *Conseil :*
   dans Mon compte, carte Identité, avec l'ancre `#objectif`, et un lien direct depuis le tableau de bord.
2. **Landing : passer au tutoiement, retirer « 14 jours d'essai » et les tarifs, et annoncer « sur invitation » ?**
   (CO-21, CO-22) *Conseil :* oui aux trois. L'inscription exige un code (`INVITE_CODES`), et aucune facturation
   n'existe.
3. **Autorises-tu les correctifs qui touchent un calcul ou une API hors Studio ?** Ils sont hors périmètre selon le
   PRD § 5 : PI-10, PI-11, PI-17, PI-51, PI-52, QU-24, et le filtre fournisseur de P41. *Conseil :*
   - oui pour PI-17, qui aligne le calendrier sur la règle déjà écrite dans `lib/calc.ts`, et pour PI-11 ;
   - pour PI-10, PI-51 et QU-24, commencer par la variante d'affichage ;
   - PI-52 seulement après avoir vérifié le fuseau en production.
4. **Les sélecteurs de modèle d'IA (rédaction, assistant) vont-ils dans Mon compte ou dans Réglages ?** Les triages
   se contredisent : SU-40 dit Mon compte, le parcours du Compte dit Réglages. *Conseil :* Mon compte, à côté de la
   clé qui les paie. Réglages affiche un lien.
5. **Comment nommer l'onglet des prompts : « Prompts d'annonce » (SU-39) ou « Modèles d'annonce »
   (`docs/design-system.md` § 11) ?** *Conseil :* « Prompts d'annonce ». Le mot « modèle » est réservé au moteur
   d'IA, puisque le Studio l'emploie déjà dans ce sens.
6. **Le bouton « Vendre » du dock : comment choisit-on l'article ?** *Conseil :* une recherche par SKU en tête de
   la feuille de vente, la même que la touche `/` de la barre du haut. Sinon, mettre « Commandes » à la place de
   « Vendre ».
7. **Sélection groupée du Stock : la vider à chaque filtre, ou n'appliquer qu'aux lignes visibles avec un compteur
   « masqués » ?** *Conseil :* lignes visibles et compteur. On garde son travail, et rien ne s'écrit en dehors de
   ce qu'on voit.
8. **Dates : `type="date"` natif tout de suite, puis la primitive `jj/mm/aaaa` du design system ?** *Conseil :*
   oui. Le natif corrige ST-24 tout de suite ; la primitive viendra avec les composants.
9. **Quel préfixe SKU pour Ralph Lauren dans les nouvelles commandes : PRL ou RL ?** (QU-41 ; le CLAUDE.md du
   projet dit « décision utilisateur ».) *Conseil :* RL, pour suivre la marque normalisée, sans toucher aux SKU
   existants.
10. **Réglages du Studio : une route `/studio/reglages` (SU-37), ou un bouton vers `/parametres?onglet=studio`
    (`docs/design-system.md` § 11) ?** *Conseil :* garder la route existante, avec l'onglet « Réglages » dans la
    sous-navigation du Studio qui y mène. Le gain est le même, sans nouvelle route.
11. **Studio sur mobile : afficher « Le Studio s'utilise sur ordinateur » sous 768 px, ou corriger les
    débordements ?** (SU-35) *Conseil :* les deux, puisque ce sont deux lignes. Ce choix est cohérent avec le
    CLAUDE.md du projet, qui réserve le Studio à l'ordinateur.
12. **Le prénom doit-il être modifiable dans Mon compte ?** (proposé par le triage Compte) *Conseil :* oui. La
    colonne `User.prenom` existe déjà ; il faut une petite route d'écriture, qui s'ajoute sans modifier les
    contrats existants.

---

### Réponses d'Aramis (21/10/2026, 00 h 40)

- **Q2 (landing)** : oui. Tutoiement, retrait de « 14 jours d'essai » et des tarifs, mention « sur invitation ».
- **Q3 (calculs et API hors Studio)** : oui, autorisé. Garder les précautions du conseil : PI-52 seulement après
  vérification du fuseau en production ; tests Vitest avant/après sur chaque calcul touché.
- **Q9 (préfixe SKU)** : **PRL reste pour « Polo Ralph Lauren »** ; les **half-zip Ralph Lauren prennent HTR**.
  Ne PAS passer à RL. Vérifier le libellé de lot exact et les SKU existants avant d'ajouter l'entrée à
  `PREFIXES` (`lib/calc.ts`), sans toucher aux SKU déjà créés.
- Les autres questions (1, 4 à 8, 10 à 12) : conseils de l'audit appliqués par défaut.

---

## Annexe : index des symptômes

Chaque id et la ou les sections où il est traité. Cette annexe est générée à partir du texte ci-dessus.

**Cadre (CA, 67).** CA-01 (bloquant) : § 2.10, § 2.16, P8, § 6.2 · CA-02 (bloquant) : § 2.6, § 2.15, § 2.24, P2, § 6.2 · CA-03 : § 2.1 · CA-04 : § 2.5 · CA-05 : § 2.6 · CA-06 : § 2.7 · CA-07 : § 2.8, P1 · CA-08 : § 2.7, § 2.8, P1 · CA-09 : § 2.4 · CA-10 : § 2.13, § 3.2 · CA-11 : § 2.2, § 3.2 · CA-12 : § 2.2, § 2.13, § 3.2 · CA-13 : § 2.2, § 2.19 · CA-14 : § 2.20 · CA-15 : § 2.20, § 3.14, § 6.4 · CA-16 : § 2.21 · CA-17 : § 2.22, P5 · CA-18 : § 2.15, P3 · CA-19 : § 2.15, P3 · CA-20 : § 2.15, P3 · CA-21 : § 2.2, § 2.15, § 3.8, P3 · CA-22 : § 2.12, § 3.5, P3 · CA-23 : § 2.13, § 2.24, § 3.2 · CA-24 : § 2.13, § 2.24, § 3.2 · CA-25 : § 2.15, § 3.1 · CA-26 : § 2.13, § 3.1 · CA-27 : § 2.5, § 2.11 · CA-28 : § 2.22, § 3.1, § 6.3 · CA-29 : § 2.9, § 3.2 · CA-30 : § 2.10, § 3.1, P8, § 6.3 · CA-31 : § 2.2, § 2.7, P6 · CA-32 : § 3.2, P4 · CA-33 : § 2.22, § 3.2, § 6.4 · CA-34 : § 2.22, § 3.2, P5, § 6.5 · CA-35 : § 3.1 · CA-36 : § 2.1 · CA-37 : § 2.20 · CA-38 : § 2.22 · CA-39 : § 2.9, § 6.5 · CA-40 : § 2.9 · CA-41 : § 2.9, § 2.23 · CA-42 : § 2.3, § 2.7, § 2.19 · CA-43 : § 2.7 · CA-44 : § 2.7 · CA-45 : § 2.7, § 2.9 · CA-46 : § 2.9, § 3.15 · CA-47 : § 2.7 · CA-48 : § 2.10, § 2.16 · CA-49 : § 2.9, § 2.12 · CA-50 : § 2.4, § 2.21, § 5 · CA-51 : § 2.1 · CA-52 : § 2.4, § 5 · CA-53 : § 2.9 · CA-54 : § 2.13, § 2.24, § 3.8, § 6.4 · CA-55 : § 3.1 · CA-56 : § 3.2 · CA-57 : § 2.22, § 3.2, § 6.4 · CA-58 : § 3.2 · CA-59 : § 2.13, § 3.2, P9 · CA-60 : § 3.2, P4, P9 · CA-61 : § 3.2, P6 · CA-62 : § 3.2, P7 · CA-63 : § 3.7 · CA-64 : § 2.3, § 3.7, § 6.1 · CA-65 : § 2.9, § 6.5 · CA-66 : § 5 · CA-67 : § 2.1, § 5.

**Pilotage (PI, 55).** PI-1 : § 2.6, § 2.23, § 6.2 · PI-2 : § 2.2 · PI-3 : § 2.4, § 3.3 · PI-4 : § 2.9 · PI-5 : § 2.4, § 2.21 · PI-6 : § 2.4, § 3.3 · PI-7 : § 2.1, § 3.5, § 5 · PI-8 : § 2.2, § 2.19, § 3.4, § 5 · PI-9 : § 2.2, § 3.3, § 3.4 · PI-10 : § 3.3, P11, § 6.3, § 7 · PI-11 : § 3.3, P11, § 6.3, § 7 · PI-12 : § 2.3, § 3.3, § 6.3 · PI-13 : § 2.3, § 3.3, § 3.4 · PI-14 : § 2.3, § 3.3, § 3.4 · PI-15 : § 2.3, § 3.3, § 3.5 · PI-16 : § 2.3, § 3.5 · PI-17 : § 3.5, § 6.3, § 7 · PI-18 : § 2.21, § 2.22, § 3.3, § 3.4, § 3.5, P10 · PI-19 : § 2.21, § 2.22, § 3.3, § 3.4 · PI-20 : § 2.21, § 3.5, § 6.3 · PI-21 : § 3.3, § 6.2 · PI-22 : § 2.4, § 3.3 · PI-23 : § 3.3 · PI-24 : § 3.5 · PI-25 : § 2.14, § 3.3, P10 · PI-26 : § 3.3, P13 · PI-27 : § 3.3 · PI-28 : § 2.3, § 3.3 · PI-29 : § 2.7, § 3.3, P12, § 7 · PI-30 : § 3.3, P12 · PI-31 : § 3.3, § 3.4 · PI-32 : § 2.3, § 3.4 · PI-33 : § 2.21, § 3.3, § 3.4, P20 · PI-34 : § 3.5 · PI-35 : § 2.15, § 3.5, P16 · PI-36 (bloquant) : § 3.5, P16, § 6.2 · PI-37 : § 3.5 · PI-38 : § 2.2, § 3.5 · PI-39 : § 2.2, § 3.5 · PI-40 : § 3.5, P15 · PI-41 : § 3.5, P14 · PI-42 : § 3.5 · PI-43 : § 2.4, § 3.5 · PI-44 : § 2.4, § 2.23, § 3.5, § 5 · PI-45 : § 2.23, § 5 · PI-46 : § 2.6, § 2.16, § 3.4, P18, § 6.2 · PI-47 : § 3.4, P19 · PI-48 : § 3.4, § 6.3 · PI-49 : § 3.4 · PI-50 : § 3.3, § 3.4 · PI-51 : § 3.3, § 6.3, § 7 · PI-52 : § 3.3, § 6.5, § 7 · PI-53 : § 2.3, § 3.5 · PI-54 : § 2.12, § 3.5 · PI-55 : § 3.4.

**Stock (ST, 55).** ST-1 (bloquant) : § 2.24, § 3.6, P22, § 6.1 · ST-2 (bloquant) : § 2.24, § 3.6, P21, § 6.1 · ST-3 (bloquant) : § 2.1, § 2.2, § 3.6 · ST-4 : § 2.22, § 3.6 · ST-5 : § 2.18, § 3.6, P24 · ST-6 : § 2.2, § 2.13, § 3.6 · ST-7 : § 2.18, § 3.6 · ST-8 : § 2.13, § 2.24, § 3.6 · ST-9 : § 2.2, § 2.19, § 3.6, § 5 · ST-10 : § 2.2, § 3.6 · ST-11 : § 2.2, § 2.19, § 3.6, § 5 · ST-12 : § 2.2, § 3.6 · ST-13 : § 2.2, § 2.19, § 3.6 · ST-14 : § 2.18, § 3.6, P23 · ST-15 : § 3.6, P31 · ST-16 : § 2.18, § 3.6, § 6.2 · ST-17 : § 3.6 · ST-18 : § 2.21, § 3.6 · ST-19 : § 3.6 · ST-20 : § 3.6, P29 · ST-21 : § 3.6, § 6.3 · ST-22 : § 2.3, § 3.6 · ST-23 : § 2.15, § 2.24, § 3.6, P32 · ST-24 : § 2.3, § 2.13, § 3.6, § 6.4, § 7 · ST-25 : § 3.6, § 6.1 · ST-26 : § 2.24, § 3.6, § 6.4 · ST-27 : § 2.13, § 2.24, § 3.6, § 3.8, § 6.4 · ST-28 : § 2.24, § 3.6, P2 · ST-29 : § 2.13, § 3.6 · ST-30 : § 2.5, § 2.11, § 3.6 · ST-31 : § 2.11, § 3.6 · ST-32 : § 2.12, § 2.14, § 3.6 · ST-33 : § 3.6 · ST-34 : § 3.6, P25 · ST-35 : § 3.6 · ST-36 : § 3.6, P25 · ST-37 : § 2.4, § 3.6, § 5 · ST-38 : § 2.4, § 3.6 · ST-39 : § 2.3, § 3.6 · ST-40 : § 3.6 · ST-41 : § 2.3, § 2.12, § 3.6 · ST-42 : § 3.6 · ST-43 : § 2.15, § 3.6 · ST-44 : § 3.6, P27 · ST-45 : § 3.6, P26, § 6.4 · ST-46 : § 2.23, § 3.6, P30 · ST-47 : § 2.18, § 3.6 · ST-48 : § 3.6 · ST-49 : § 2.3, § 2.24, § 3.6 · ST-50 : § 3.6, P28 · ST-51 : § 2.22, § 3.6 · ST-52 : § 2.19, § 3.6, § 5 · ST-53 : § 3.6, § 6.5 · ST-54 : § 3.6, § 6.5 · ST-55 : § 3.6.

**Quotidien (QU, 92).** QU-01 (bloquant) : § 2.6, § 2.15, § 2.24, P3, § 6.2 · QU-02 : § 2.15, P3 · QU-03 : § 2.15, § 3.8, § 3.9, P3 · QU-04 : § 2.1, § 3.9 · QU-05 : § 2.2, § 3.7 · QU-06 : § 2.2, § 3.7, § 3.9 · QU-07 : § 2.2, § 2.19, § 3.8, § 5 · QU-08 : § 2.1, § 2.2, § 3.9 · QU-09 : § 2.1, § 2.24 · QU-10 : § 2.2, § 2.13, § 2.14 · QU-11 : § 2.13, § 3.7 · QU-12 : § 2.4, § 3.7, § 3.9 · QU-13 : § 2.4, § 3.7, § 3.9 · QU-14 : § 2.3, § 3.7 · QU-15 : § 2.9, § 3.7 · QU-16 : § 2.6, § 3.7 · QU-17 : § 2.5, § 2.11, § 3.7, § 3.9 · QU-18 : § 2.11, § 3.7, § 3.9 · QU-19 : § 2.11, § 3.9 · QU-20 : § 2.20, § 3.7, § 3.9 · QU-21 : § 3.9 · QU-22 : § 2.21, § 3.7 · QU-23 : § 2.21, § 3.7 · QU-24 : § 3.7, § 7 · QU-25 : § 3.7, P41 · QU-26 : § 3.7, P40 · QU-27 : § 3.7 · QU-28 : § 3.7 · QU-29 : § 2.24, § 3.7 · QU-30 : § 2.16, § 3.7 · QU-31 : § 3.7, P40 · QU-32 : § 3.7 · QU-33 : § 2.3, § 3.7 · QU-34 : § 2.3, § 3.7 · QU-35 : § 2.18, § 3.7 · QU-36 : § 2.3, § 3.7 · QU-37 : § 3.7, P40 · QU-38 : § 2.22, § 3.7, P39 · QU-39 : § 2.12, § 2.13, § 3.7, P39 · QU-40 : § 3.7, P39 · QU-41 : § 3.7, § 6.1, § 7 · QU-42 : § 2.3, § 3.7, § 6.1 · QU-43 : § 2.14, § 3.7 · QU-44 : § 3.7 · QU-45 : § 2.24, § 3.7 · QU-46 : § 2.1, § 3.7 · QU-47 : § 2.1, § 2.12, § 3.7 · QU-48 : § 2.24, P2 · QU-49 : § 2.24, § 3.8, P2, § 6.1 · QU-50 : § 2.13, § 2.24, § 3.8, § 6.4 · QU-51 : § 2.24, § 3.8 · QU-52 : § 2.22, § 2.24, § 3.8, P33 · QU-53 : § 3.8, P33, § 6.3 · QU-54 : § 3.8, P33 · QU-55 : § 3.8, P33 · QU-56 : § 3.8, P33 · QU-57 : § 2.24, § 3.8 · QU-58 : § 2.21, § 3.8 · QU-59 : § 2.13, § 2.24, § 3.8 · QU-60 : § 2.12, § 3.8 · QU-61 (bloquant) : § 2.24, § 3.9, P37, § 6.1 · QU-62 : § 3.9, P36, § 6.3 · QU-63 : § 2.4, § 3.9 · QU-64 : § 3.9, P37 · QU-65 : § 3.9, P37 · QU-66 : § 3.9, P37 · QU-67 : § 3.9, P35 · QU-68 : § 2.13, § 3.9 · QU-69 : § 2.13, § 3.9 · QU-70 : § 2.13, § 2.14, § 3.9 · QU-71 : § 3.9, P42, § 6.2 · QU-72 : § 3.9, P43, § 6.1 · QU-73 : § 3.9, § 6.1 · QU-74 : § 3.9, P36 · QU-75 : § 2.4, § 3.9 · QU-76 : § 3.9 · QU-77 : § 3.9, P34 · QU-78 : § 3.9 · QU-79 : § 3.9 · QU-80 : § 3.9, P34 · QU-81 : § 3.9 · QU-82 : § 3.9, § 6.3 · QU-83 : § 3.9 · QU-84 : § 3.9, P38 · QU-85 : § 3.9, § 6.3 · QU-86 : § 3.9 · QU-87 : § 3.9 · QU-88 : § 2.22, § 3.9 · QU-89 : § 3.9 · QU-90 : § 3.9 · QU-91 : § 2.12, § 3.9 · QU-92 : § 5.

**Studio et Réglages (SU, 62).** SU-01 : § 3.11, P44 · SU-02 (bloquant) : § 3.11, P45, § 6.2 · SU-03 : § 3.11, P45, § 6.4 · SU-04 : § 3.11, P45 · SU-05 (bloquant) : § 2.24, § 3.11, P46, § 6.1 · SU-06 : § 3.11, P46 · SU-07 : § 3.11, P46 · SU-08 : § 3.11, P48, § 6.3 · SU-09 : § 3.11, P48, § 6.3 · SU-10 : § 3.11, P48, P49 · SU-11 : § 3.11, § 6.4 · SU-12 : § 3.11 · SU-13 : § 2.12, § 3.11 · SU-14 : § 3.11, P47 · SU-15 : § 3.11, § 6.3 · SU-16 : § 3.11 · SU-17 : § 3.11, P51, § 6.4 · SU-18 : § 3.11, P51 · SU-19 : § 2.22, § 3.11, § 6.1 · SU-20 : § 2.22, § 3.11, § 6.4 · SU-21 : § 3.11 · SU-22 : § 2.21, § 3.11 · SU-23 : § 3.11 · SU-24 : § 3.11 · SU-25 : § 2.14, § 2.17, § 3.11, § 3.13 · SU-26 : § 2.13, § 3.11, § 3.13 · SU-27 : § 2.13, § 3.13 · SU-28 : § 2.15, § 3.13 · SU-29 : § 2.2, § 3.13 · SU-30 : § 2.2, § 3.11 · SU-31 : § 2.2, § 2.13 · SU-32 : § 2.4 · SU-33 : § 2.13, § 3.13 · SU-34 : § 3.13, § 6.2 · SU-35 : § 3.11, § 3.12, § 7 · SU-36 : § 2.9, § 2.17 · SU-37 : § 2.7, § 2.17, § 3.13, P50, § 7 · SU-38 : § 3.13, P49 · SU-39 : § 3.13, § 7 · SU-40 : § 3.13, P12, P53, P58, § 7 · SU-41 : § 3.13, P12, § 6.1 · SU-42 : § 2.12, § 2.22, § 2.24, § 3.13 · SU-43 : § 2.12, § 2.24, § 3.13 · SU-44 : § 2.13, § 3.13 · SU-45 : § 3.10, P52 · SU-46 : § 3.10, P52 · SU-47 : § 3.10, P52 · SU-48 : § 3.11, P45 · SU-49 : § 2.4, § 3.11 · SU-50 : § 3.11 · SU-51 : § 3.11, P49 · SU-52 : § 2.3, § 3.12 · SU-53 : § 2.18, § 3.12 · SU-54 : § 3.12, P54 · SU-55 : § 2.4 · SU-56 : § 2.4, § 3.11, § 3.12 · SU-57 : § 2.5, § 2.11, § 3.11 · SU-58 : § 3.11, P7, § 6.5 · SU-59 : § 3.11 · SU-60 : § 3.11, P45 · SU-61 : § 2.2, § 2.13, § 3.11, § 3.13 · SU-62 : § 2.3, § 3.13.

**Compte, Démarrage, Landing (CO, 53).** CO-1 : § 3.15, P55, § 6.4 · CO-2 : § 2.22, § 3.15, P55, § 6.4 · CO-3 : § 3.15, P57, § 6.3 · CO-4 : § 2.20, § 3.14, § 6.4 · CO-5 : § 3.14, P59, § 6.3 · CO-6 : § 3.14, § 6.3 · CO-7 : § 2.2, § 2.3, § 3.14 · CO-8 : § 2.2, § 3.14, § 3.16 · CO-9 : § 2.2, § 3.14 · CO-10 : § 2.2, § 2.13, § 3.14 · CO-11 : § 2.13, § 3.14 · CO-12 : § 2.13, § 3.14 · CO-13 : § 2.13, § 3.14, P60 · CO-14 : § 2.13, § 3.14 · CO-15 : § 2.4, § 3.14, § 3.16 · CO-16 : § 2.4, § 3.14 · CO-17 : § 3.14 · CO-18 : § 3.14, P59 · CO-19 : § 2.3, § 3.14 · CO-20 : § 3.14 · CO-21 : § 3.16, § 7 · CO-22 : § 3.2, § 3.16, P9, P61, § 7 · CO-23 : § 2.1, § 3.15, § 3.16, § 6.5 · CO-24 : § 2.3, § 3.15 · CO-25 : § 2.12, § 3.15, P57 · CO-26 : § 3.15, P55 · CO-27 : § 3.15, P56 · CO-28 : § 3.14 · CO-29 : § 2.12, § 2.22, § 3.14 · CO-30 : § 2.13, § 3.14, § 6.1 · CO-31 : § 2.12, § 3.14 · CO-32 : § 2.12, § 3.14 · CO-33 : § 3.14, § 6.3 · CO-34 : § 2.21, § 3.14 · CO-35 : § 2.9, § 3.14 · CO-36 : § 2.9, § 3.15 · CO-37 : § 2.4, § 3.15 · CO-38 : § 2.11, § 3.14 · CO-39 : § 2.6, § 3.15 · CO-40 : § 3.14, P59 · CO-41 : § 2.23, § 3.16 · CO-42 : § 2.3, § 3.16 · CO-43 : § 3.16 · CO-44 : § 2.9, § 3.16 · CO-45 : § 2.2, § 2.13, § 3.14 · CO-46 : § 3.14 · CO-47 : § 2.13, § 3.14, § 6.5 · CO-48 : § 2.22, § 3.14 · CO-49 : § 2.24, § 3.14 · CO-50 : § 2.12 · CO-51 : § 3.15, P57 · CO-52 : § 3.16, P61, § 6.5 · CO-53 : § 2.4, § 5.

