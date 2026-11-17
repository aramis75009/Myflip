# CLAUDE.md — MyFlip

Guidance for Claude Code when working in this repository.

## 📱 Mobile Design Rules — iPhone 14 (390px)

APPROCHE MOBILE FIRST : styles de base = mobile (pas de préfixe), desktop = préfixe md:

### Breakpoints MyFlip
- Pas de préfixe → < 768px (iPhone 14, tous les téléphones)
- md: → ≥ 768px (desktop/tablette)

### Touch Targets (Apple HIG)
Tout élément cliquable : min-height 44px. Utiliser h-11, py-3 ou min-h-[44px] sur boutons, lignes de liste, icônes nav.

### Safe Area iPhone
Dans app/layout.tsx, meta viewport doit avoir : viewport-fit=cover
La bottom navigation doit avoir : paddingBottom: env(safe-area-inset-bottom)

### Tables → Jamais sur mobile
Pattern obligatoire :
<div className="hidden md:block">tableau</div>
<div className="md:hidden">cartes</div>

### Sidebar
Mobile : masquée, bottom nav visible, pas de décalage sur le contenu
Desktop (md+) : largeur pilotée par `--sidebar-w` — **236px déployée, 76px repliée**.
Le contenu suit avec `md:pl-[var(--sidebar-w)]` (`components/AppShell.tsx:26`), jamais
avec une valeur en dur. L'état de repli vit dans `localStorage["myflip-sidebar"]` et est
posé sur `<html data-sidebar>` avant le premier paint.

### Typographie mobile
text-3xl md:text-4xl pour les titres de page
Jamais en dessous de text-sm pour le contenu

### Espacement mobile
px-4 sur mobile, px-6 sur md+
Empiler : flex-col md:flex-row
Pleine largeur : w-full md:w-auto

### Règle générale
Chaque nouveau composant/page : tester mentalement à 390px avant 1280px.

---

## 🏗️ Architecture

### Auth (NextAuth v5)
Split obligatoire en deux fichiers — ne jamais fusionner :
- `auth.config.ts` : version légère sans Prisma ni bcrypt, utilisée par le middleware Edge
- `auth.ts` : version complète avec Prisma + bcryptjs, utilisée côté Node (API routes, Server Components)

Les credentials sont stockés en base de données (table `User` Prisma/Neon), pas en variables d'env.
`AUTH_EMAIL` / `AUTH_PASSWORD` dans `.env.local` sont des reliquats de bootstrap initial — ne pas s'y fier pour la logique d'auth.

### Base de données
Prisma ORM + Neon PostgreSQL. Schéma dans `prisma/schema.prisma`.
Modèle `User` : `id`, `email`, `password` (bcrypt), `resetToken`, `resetTokenExp`, `createdAt`.

**Marque / catégorie / lot des articles.** Trois champs distincts depuis la normalisation du 24/07/2026 :
- `Article.marque` — la marque réelle : `Adidas`, `Ralph Lauren`, `Lacoste`, `Tommy Hilfiger`, `Dickies`, `Helly Hansen`, `COOGI`, `TNF/PAT/COL`, ou `Mix` pour les lots sans marque identifiable.
- `Article.categorie` — le type d'article seul : `Polo`, `Pull`, `Short`, `Chemise`, `Polaire`, `Coupe-vent`, `Short de bain`, ou `Mix` quand le lot mélange les pièces.
- `Article.lot` — le **libellé du lot d'achat** (« Short Adidas », « Crazy Polaires »), conservé tel quel. C'est lui qui alimente le filtre « Tous les lots » du Stock (`?lot=`), à côté du filtre « Toutes les marques » (`?marque=`).

Avant cette normalisation, `marque` et `categorie` portaient tous deux le libellé de lot. La migration one-shot a réparti les 1 243 articles sur les 17 libellés existants ; `listingLabels()` (`app/mise-en-vente/page.tsx`) ne fait plus que neutraliser les libellés collectifs (`Mix`, `TNF/PAT/COL`) qui n'ont pas leur place dans une annonce.

⚠️ **Reste à traiter.** `components/NewCommandeModal.tsx` propose encore `["Polo Ralph Lauren", "Lacoste", "Tommy Hilfiger"]` comme marques : la première est un libellé de lot, pas une marque. Toute nouvelle commande créée ainsi réintroduit le problème sur ses articles. Corriger la liste implique de revoir les préfixes SKU (`skuPrefix` dans `lib/calc.ts` : « Polo Ralph Lauren » → `PRL`, mais « Ralph Lauren » → `RL`) — décision utilisateur, ne pas trancher seul.

⚠️ **Colonne `photosPretes`.** La table `Article` en base contient `photosPretes` (booléen) qui n'est **pas** déclarée dans `prisma/schema.prisma` et n'est lue nulle part dans le code (le suivi passe par le statut « Photos prêtes »). **L'utilisateur a demandé explicitement de la conserver (24/07/2026)** : ne jamais la supprimer. Conséquence pratique : `prisma db push` proposera de la dropper à chaque changement de schéma — refuser, et faire un `ALTER TABLE` ciblé à la place.

### Emails transactionnels
`lib/emails.ts` expose `sendWelcomeEmail()` et `sendResetEmail()`.
SDK Resend, expéditeur `onboarding@resend.dev`. Requiert `RESEND_API_KEY` dans `.env.local`.

---

## 🗂️ Pages & Routes

### Pages principales
- `/dashboard` — KPIs, CA par semaine, par marque
- `/stock` — liste articles, filtres, virtualisation
- `/mise-en-vente` — génération d'annonces IA
- `/a-comptabiliser` — articles à comptabiliser
- `/calendrier` — ventes par mois
- `/commandes` — gestion des commandes fournisseur
- `/statistiques` — stats avancées
- `/parametres` — prompts IA (modèles d'annonces)
- `/compte` — Mon compte, mot de passe, et configuration des clés IA / Trello
  (`components/compte/Integrations.tsx`)
- `/login` — connexion + mot de passe oublié (inline)
- `/reset-password` — réinitialisation via token email

### Pages légales (sans sidebar, sans auth)
- `/legal/mentions-legales`
- `/legal/cgu`
- `/legal/confidentialite`

### API Routes
- `/api/auth/forgot-password` — génère un token, envoie l'email via Resend
- `/api/auth/reset-password` — valide le token, met à jour le mot de passe
- `/api/user/password` — changement de mot de passe (authentifié)
- `/api/user/settings` — réglages du compte : clés IA (chiffrées), board et étiquettes
  Trello, objectif mensuel. Un secret n'est jamais renvoyé en clair, seulement
  « renseigné » + 4 derniers caractères. Champ absent du corps = inchangé, champ vide =
  effacé. **N'accepte plus aucun secret Trello** : l'accès passe par l'OAuth.
  Enregistrer un board y déclenche la création du webhook.
- `/api/user/settings/test` — teste la clé IA réellement utilisée : `?fournisseur=ollama|openrouter|anthropic`.
  OpenRouter = lecture seule (`/key`) ; **Ollama Cloud et Anthropic = une requête d'UN jeton**
  (la liste de modèles d'Ollama est publique, elle validerait une clé fausse ; le crédit
  Anthropic épuisé ne se voit qu'à l'usage), seulement au clic sur « Tester »
- `/api/user/settings/trello` — liste boards et étiquettes ; POST (re)crée le webhook
- `/api/trello/connect` — démarre l'autorisation OAuth (302 vers Trello)
- `/api/trello/callback` — retour de Trello : vérifie l'appartenance, échange et stocke
- `/api/trello/disconnect` — supprime le webhook, révoque le jeton, efface tout
- `/api/articles`, `/api/articles/[id]` — CRUD articles
- `/api/commandes`, `/api/commandes/[id]` — CRUD commandes
- `/api/dashboard`, `/api/stats`, `/api/calendar` — données agrégées
- `/api/prompts`, `/api/prompts/[id]` — CRUD prompts IA
- `/api/listings/generate` — génération d'annonces (**Ollama Cloud par défaut, OpenRouter en
  secours** ; fournisseur et modèle au choix du compte, cf. « Fournisseur IA » plus bas)
- `/api/chat` — chatbot IA (même fournisseur que les annonces)
- `/api/webhooks/trello` — intégration Trello

### API Hermes — `/api/hermes/*`

Petite API **hors session**, consommée par l'agent de sourcing Hermes qui tourne
sur un serveur tiers. Authentification par jeton porteur (`Authorization: Bearer`),
comparé en temps constant à `HERMES_API_TOKEN` ; le compte visé est
`HERMES_USER_EMAIL`, **jamais choisi par l'appelant** — sinon le jeton serait une
clé passe-partout sur toute la base. Sans ces deux variables : **503**, jamais un
accès libre.

- `GET  /api/hermes` — contrôle de configuration : compte visé, volumes, statuts autorisés, liste des routes
- `GET  /api/hermes/commandes` — commandes récentes + décompte par statut (filtres `fournisseur`, `depuis`, pagination)
- `POST /api/hermes/commandes` — crée commande + lots + articles, renvoie les SKU générés
- `GET  /api/hermes/commandes/{id}` — la commande, ses lots, ses articles et leur statut
- `GET  /api/hermes/stock` — stock filtré (`statut`, `sku`, `q`, `commandeId`, `marque`, `categorie`, `lot`, pagination)
- `POST /api/hermes/stock/statut` — change le statut d'articles désignés par `skus` ou `commandeId`

⚠️ **Surface d'écriture volontairement close : deux actions, pas une de plus.**
Aucune route de suppression, aucune modification de champ arbitraire, et « Vendu »
est refusé (il exige un prix — ça passe par la validation comptable). Ne pas
élargir sans demande explicite : c'est la contrepartie d'un jeton qui vit sur une
machine hors du périmètre.

⚠️ **Le code métier n'est PAS dupliqué.** Ces routes appellent `creerCommande`
(`lib/commandes.ts`) et `changerStatutArticles` (`lib/stock.ts`), les mêmes
fonctions que le formulaire « Nouvelle commande » et que la barre d'action groupée
du Stock. Toute évolution de la génération des SKU ou du prorata des frais de port
se fait là, une seule fois.

### API SacBase — `GET /api/sacbase/stock`

Adresse **en lecture seule** pour SacBase, le tableau de bord des sacs Hipobuy
(Next 16, sur le VPS). Même modèle que l'API Hermes mais **séparée** : jeton
`SACBASE_API_TOKEN` (Bearer, temps constant), compte fixé par
`SACBASE_USER_EMAIL`, 503 sans ces variables, 401 sur un mauvais jeton. Le jeton
SacBase n'ouvre aucune route d'écriture. Code : `lib/sacbaseAuth.ts`,
`lib/sacbaseStock.ts`.

- Périmètre : les articles du compte dont `commande.fournisseur` contient
  « hipobuy » (casse libre), triés par SKU naturel.
- Réponse : `{ genere_le, comptes, articles }`, chaque article porte **exactement**
  `sku`, `statut`, `compte`, `prixVente`, `dateVente`, `dateMiseEnVente` (dates en
  `AAAA-MM-JJ`, jour de Paris).
- ⚠️ **SacBase rejette toute la réponse au moindre écart** (SKU hors
  `^[A-Z]{2,5}\d+$`, compte hors enum, date avec heure). Ajouter un champ est sans
  danger ; en retirer un ou changer un type casse la synchro.

### Comptes de vente et date de mise en vente

- `lib/comptesVente.ts` est la **seule** source des libellés : `VINTED_PRO` =
  « Fripandtrend », `VINTED_SECOND` = « Enorab18 », `VINTED_AXL` = « axl_cldr » (3e compte, 23/10/2026, sacs vintage). Le compte se choisit AVANT la
  vente (colonne « Compte » du Stock, fiche de mise en vente) ; la comptabilisation
  garde le compte choisi, `VINTED_PRO` seulement s'il n'y en a aucun.
- `Article.dateMiseEnVente` (29/09/2026) : posée par `lib/dateMiseEnVente.ts` au
  **passage** en « En vente » (pas quand l'article l'est déjà), jamais remise à
  zéro par un retour en brouillon, jamais écrasée si saisie à la main. Appliquée
  dans le PATCH article, la barre d'action groupée (`changerStatutArticles`,
  option `dateMiseEnVente: true`) et l'outil statut de l'assistant.
  ⚠️ **Pas dans l'API Hermes** (`POST /api/hermes/stock/statut` n'active pas
  l'option) : décision laissée à Aramis. Pas de rattrapage des articles existants.

### Studio — `/studio` (variantes d'angle, 20/10/2026)

Génère des variantes d'angle des vraies photos d'un sac ; **une image validée par
Aramis part dans l'annonce du sac cible** (`StudioEssai.skuCible`). Ce n'est plus
un banc de test. Spec : `docs/superpowers/specs/2026-10-17-studio-ia-design.md`
(§2 remplacé par le PRD `2026-10-19-studio-ia-generation-api-prd.md`, §7
assoupli le 20/10), maquettes : projet Claude Design « Fiche coloris -
lisibilite », tour 2. Desktop uniquement : les règles mobile de ce fichier ne
s'appliquent pas à ces écrans.

- **Écrans** : `/studio` (catalogue rangé par prochaine action : « Juger 3 images »,
  « Photographier le sac », « Générer pour SDN3 », « Rien à préparer » ; filtres
  génération / filtre / recherche **dans l'URL**, `?generation=V2&filtre=a_juger&q=…`),
  `/studio/[cle]` (fiche, refaite le 22/10 : carte **« Prochaine action »** en haut,
  puis cinq étapes repliables dans l'ordre du travail — Photos (planche), Angles
  (tableau **une ligne par vraie photo × une colonne par prompt d'angle**, sans
  sélecteur de prise), Génération, À juger, Validées ; seule l'étape de la
  prochaine action est dépliée à l'ouverture), `/studio/bilan`, et l'onglet
  « Studio » de `/parametres` (`?onglet=studio`, `components/parametres/PromptsStudio.tsx`),
  joignable depuis la fiche (« Réglages du Studio ») et la sous-navigation.
  Logique pure du parcours : `app/studio/_parcours.ts` (phrase d'action, prochaine
  action, filtres d'URL, répartition d'un dépôt) et `app/studio/_decisions.ts`.
  ⚠️ **Aucun `loading.tsx` dans `app/studio/` ni `app/studio/[cle]/`** : un
  squelette de segment enveloppe la fiche, le statut part avec lui (200) et une
  clé inconnue ne répond plus 404 (`[cle]/not-found.tsx`). Le squelette du
  catalogue est un `<Suspense>` dans `app/studio/page.tsx`.
- **Vue « chez toi »** (10/11, en tête de `/studio` : `app/studio/_components/ChezToi.tsx`, règles pures
  dans `lib/studioChezToi.ts`) : « N sacs chez toi », trois tuiles cliquables (`?etat=a_photographier|
  a_generer|pret`, un second clic l'enlève), puis les sacs **rangés par Commande**, la plus récente
  d'abord (à prendre en photo, puis à générer, puis prêts). Un sac est « chez toi » selon `estChezToi`
  (`lib/studioCases.ts`, la règle du sac cible) : non vendu, statut En stock ou Photos prêtes, le statut
  MyFlip l'emportant sur celui de SacBase. État (`etatSac`) : **prêt** = au moins une image validée pour
  ce SKU, au sens de `whereImagesValidees` (`lib/studioAnnonce.ts`, **la même condition que
  `GET /api/studio/annonce`**, lue par les deux : ne pas la réécrire) ; sinon **à prendre en photo** si la
  carte du coloris a `photos === 0`, sinon **à générer**. Le numéro de Commande vient de FLIPO :
  `commande` (entier ≥ 1 ou null) sur chaque sac de `GET /api/studio/coloris`, **facultatif** (absent
  ou invalide = null : ce champ ne rejette **jamais** le catalogue) ; sans numéro, un seul groupe « Chez toi » (« Commande inconnue » pour les sacs
  sans numéro quand d'autres en ont). L'alias Studio s'applique avant : SDN60 sort sous 5880 Black Gold.
- **Accueil et filtres** (`?filtre=`, `lib/studioCases.ts` `passeFiltres`, `app/studio/_parcours.ts`
  `listeAccueil`) : sous la vue « chez toi », une ligne de texte « Catalogue : N coloris sans vraies
  photos, sur M · K à commander », dont les deux nombres sont des boutons (`jamais_photographies`,
  `a_commander`). Elle porte sur **tout le catalogue** (`bilanPhotos`) : ni la
  génération, ni le filtre, ni la recherche ne la changent ; un clic sur un nombre vide la
  génération et la recherche pour que la liste compte bien N. Filtres, dans l'ordre : « Tous »,
  « Avec vraies photos » (`photographies` : au moins une vraie photo importée, **tableau ou non** —
  les photos gardées à la mise en vente ont `ordre` null et ne comptent pas dans `prises`), « Sans
  vraies photos » (`jamais_photographies`, le complément ; rangée en deux sections chez toi / à
  commander), « À juger » (`a_juger`), « Doublons chez toi ». L'ancien id `a_photographier` reste
  lu dans l'URL et mène à `a_photographier_chez_toi` (`FILTRES_ANCIENS`). Le compte « photos » d'une
  carte = toutes les `StudioReference` rattachées au coloris.
- ⚠️ **« Jamais acheté »** (`libelleStock`, `app/studio/_parcours.ts`) : seulement si SacBase
  ne connaît **aucun sac** du coloris (`nbSacs` = 0) ET qu'aucune photo n'a été importée. Avant
  le 10/11, la carte l'affichait dès qu'aucun sac n'était « chez toi » (En stock / Photos
  prêtes) ni vendu : un sac « En vente » ou « En livraison » passait pour jamais acheté.
- ⚠️ **V / R ne partent pas tout de suite** : l'image quitte la file, un toast
  « Annuler » de 5 s s'affiche, et le `PATCH` n'est envoyé qu'après
  (`DecisionsDifferees`) ; quitter la page envoie ce qui attend (`keepalive`).
  Un « Annuler » après l'envoi remet la décision à `null`. Les tests e2e qui
  pressent V ou R DOIVENT intercepter `/api/studio/essais/**`.
- **Planche** : une seule façon de ranger (glisser ; au clavier, menu de la photo
  « Déplacer vers… »). Un dépôt remplit les cases libres et nomme le surplus.
  « Retirer » = `DELETE` ; « Remplacer » sort l'ancienne de la planche (`ordre: null`,
  gardée hors tableau) puis dépose la nouvelle. Une photo qui a servi ne se retire ni
  ne se remplace (409, et le menu le dit avant).
- **Copies pivotées** (16/11/2026, « Pivoter la photo… » dans le menu d'une photo de la planche) :
  curseur de −45° à +45°, au degré, plus une case où l'on tape l'angle (les deux restent
  synchronisés), aperçu CSS en direct sans aller-retour serveur (`PivoterPhoto.tsx`).
  « Enregistrer » = `POST /api/studio/references/[id]/pivoter` `{ angle }` : une **nouvelle copie**,
  l'originale n'est jamais touchée ; « Annuler » ne fait rien. Rendu serveur par **sharp**
  (`lib/studioPivotRendu.ts` : rotation sans perte, découpe centrée, agrandissement aux dimensions
  EXACTES de l'original, un seul JPEG q92 4:4:4). Le recadrage « sans coin vide » est
  `echelleRecadrage` (`lib/studioPivot.ts`, pur) : **la même fonction pour l'aperçu et le rendu**,
  ne pas en écrire une seconde. Orchestration à dépendances injectées : `lib/studioCopie.ts`
  (testée sans réseau), branchée sur Prisma et le stockage dans `lib/studioCopieServeur.ts`.
  - ⚠️ **Empreinte** : la copie suit le chemin de l'import (`references/<userId>/<sha>.jpg`,
    `deposerImage`) avec l'empreinte de **ses propres octets**, jamais celle de l'original :
    `deposerImage` écrase un même nom (`x-upsert`), réutiliser l'empreinte de l'original
    **réécrirait l'original**. Le dédoublonnage de l'import (`POST /api/studio/references`) est
    inchangé et ne connaît pas les copies ; la copie n'est refusée que si les mêmes octets sont
    déjà conservés (même photo, même angle : le rendu est déterministe).
  - **Une copie n'est jamais une ligne du tableau** : `ordre` null, donc ni génération (les routes
    exigent `ordre` non null), ni annonce, ni swap de `PATCH`. Elle s'affiche **sous sa photo, dans
    la même case de la planche**, avec son angle, un lien vers l'image et « Retirer ». Elle ne
    compte pas dans `photos` de la carte du catalogue (`copieDeId` null seulement).
  - Colonnes `StudioReference.copieDeId` (auto-relation, `ON DELETE CASCADE`) et `angleCopie`,
    index unique `(copieDeId, angleCopie)` : une copie par photo et par angle (deux clics ne
    font pas deux copies). Migration `20261116120000_studio_copie_pivotee`, idempotente, **à coller
    à la main dans l'éditeur SQL de Supabase AVANT le merge** (comme les précédentes). Retirer une
    photo (`DELETE`) retire ses copies **et leurs fichiers** (seulement s'ils sont orphelins).
  - On ne pivote pas une copie (400) : chaque copie part de l'original, sans rééchantillonnages
    en cascade. Une copie « n'est pas rattachée » à une photo remplacée (`Remplacer` sort l'ancienne
    du tableau) : ses copies restent en base, masquées avec elle.
  - **`sharp` est une dépendance directe** depuis le 16/11/2026 (`package.json`). Il était déjà
    dans le lockfile, mais seulement comme dépendance **optionnelle** de `next` : l'importer sans
    la déclarer, c'est compter sur un paquet qu'`npm` a le droit de sauter. Aucune nouvelle version.
- **Retouches par lot et Versions** (17/11/2026, PRD `docs/prd/2026-11-16-studio-retouches-par-lot.md`,
  étape 2) : chaque photo de la planche a une case ; « Tout cocher », puis « Retoucher N photos »
  ouvre UN panneau (`RetoucheLot.tsx`) avec un aperçu en direct de chaque photo cochée
  (`ApercuRetouche.tsx`) : **pivoter** (−45° à +45°, curseur et case synchronisés ; mode « zoom »
  sans coin vide, ou « bords blancs » image entière), **recadrer** (0 à 30 %, centré), **cadre**
  (pastilles Blanc / Noir / Gris / Beige ou couleur libre, épaisseur 0 à 15 % de la largeur, défaut
  4 %, bord adouci 0 à 100 %, défaut 35 %). Les réglages forment un objet `Retouche`
  (`lib/studioRetouche.ts`).
  - ⚠️ **Une seule géométrie** : `geometrieRetouche` (`lib/studioRetouche.ts`, pure) part
    d'`echelleRecadrage` (étendue à une image d'autres dimensions que le cadre, plus son pendant
    `echelleContenue` pour les bords blancs) ; l'aperçu (CSS en `cqw` + un calque `<canvas>` pour le
    bord adouci, tiré de `masqueAdoucissement`) et le rendu sharp (`rendreCopieRetouchee`,
    `lib/studioPivotRendu.ts`) lisent les mêmes nombres. Ne pas écrire une seconde formule.
    « Pivoter » passe par ce même rendu et produit **les mêmes octets qu'avant** (vérifié au bit près).
  - « **Enregistrer en Version N** » = `POST /api/studio/versions` `{ cle, skuSource, referenceIds,
    retouche }` (`lib/studioVersionLot.ts`, dépendances injectées, Prisma dans
    `lib/studioVersionServeur.ts`) : une copie retouchée par photo (`creerCopieRetouchee`,
    `lib/studioCopie.ts` généralisé : empreinte de **ses** octets, original jamais touché, plafond
    4 Mo), puis **toujours une nouvelle version**. **Plus d'étape Juger / Valider** pour ces copies.
    La même retouche sur la même photo **réutilise** la copie (clé `cleRetouche`, index unique
    `copieDeId, retoucheCle`) ; les copies pivotées d'avant (`angleCopie` seul) sont reprises comme
    « angle seul, zoom » (`retoucheDeCopie`). Sans aucune retouche, la version montre les photos
    d'origine elles-mêmes (rien n'est rendu). Tout est vérifié avant le premier rendu ; un échec en
    cours de lot retire les copies créées par ce lot.
  - **Versions** (`StudioVersion`, `StudioVersionPhoto`) : elles appartiennent au **coloris** (la
    fiche), numérotées 2, 3… ; titre, description (tirets) et mots-clés **copiés** de la Version 1 à la
    création, `skuAnnonce` saisi par Aramis (`PATCH /api/studio/versions/[id]`, seul champ
    modifiable). ⚠️ **La Version 1 n'est jamais stockée** : c'est l'état actuel de l'annonce du sac
    affiché dans l'en-tête (le sac cible, sinon le premier du coloris), relu à chaque affichage
    (`chargerVersionsUn` : `Article.titreAnnonce/descriptionAnnonce/motsClesAnnonce` en LECTURE, images
    de `whereImagesValidees`) ; son SKU est celui du sac, non modifiable.
  - Écran **Versions** (`Versions.tsx`, section de la fiche après « Photos ») : une carte par version,
    photos, case SKU, titre, description en trois blocs (tirets verrouillés, mots-clés, ligne SKU),
    « Copier le titre » et « Copier la description ». ⚠️ Le format copié (`texteDescription`,
    `lib/studioVersion.ts`) est : tirets, **une** ligne vide, mots-clés, puis le SKU **juste en
    dessous** (un seul retour à la ligne). Il diffère volontairement de l'export de Mise en vente
    (ligne vide aussi avant le SKU), qui n'a pas changé.
  - Une photo (ou une de ses copies) montrée par une version ne se retire plus (409, et le menu le
    dit) ; la clé `StudioVersionPhoto.referenceId` est en `NO ACTION` (vérifié : même un `DELETE` de
    `User` échoue tant qu'il a des versions, comme avec les essais en `RESTRICT` : supprimer
    d'abord `StudioVersion`, ce que fait le seed e2e). Les copies qu'une version
    montre ne s'affichent plus sous leur photo sur la planche (elles sont dans « Versions »).
  - Migration `20261117120000_studio_versions`, idempotente, **à coller dans Supabase AVANT le merge**.
  - Hors de l'étape 2 : le choix de la version dans Mise en vente (étape 5), la suppression de la
    génération (étape 6). « Pivoter la photo… » reste dans le menu.
- **« Reformuler », texte modifiable à la main, zip des photos, réglages affichés** (17/11/2026, étape 4,
  aucune migration : `titre`, `description`, `motsCles` existent déjà sur `StudioVersion`).
  - **« Reformuler »** (Version 2 et suivantes seulement ; la Version 1 dit « elle n'est pas
    reformulée ») : `POST /api/studio/versions/[id]/reformuler`, sans corps. Le serveur part du titre
    et des mots-clés **enregistrés** de la version (ce qu'Aramis a corrigé à la main compris : l'écran
    enregistre d'abord ce qui vient d'être tapé), fait **UN** appel au sélecteur d'IA des annonces
    (`choisirIA("annonce", …)` + `genererAnnonce`, `lib/studioReformulationServeur.ts` ; aucun réglage
    ni fournisseur de plus, aucune photo envoyée) et rend `{ proposition: { titre, motsCles } }`.
    **N'écrit rien** : seul « Garder » enregistre (`PATCH` `{ titre, motsCles }`) ; « Proposer autre
    chose » refait un appel ; fermer l'encadré n'enregistre rien. **Aucun appel sans clic** (pas de
    reformulation à la création d'une version, pas de lot). Règles pures et testées :
    `lib/studioReformulation.ts` (prompt, validation, diff mot à mot surligné, erreurs).
  - ⚠️ **Jamais `description` (les tirets) ni `skuAnnonce` pour l'IA** : ils ne lui sont pas envoyés ;
    le format de réponse d'annonce impose les trois clés, `description` y est demandée « sans objet » et
    **jetée** à la lecture (`lireProposition` ne garde que `titre` et `motsCles`). Sortie inutilisable
    (JSON illisible, titre > 100 caractères, mots-clés vides) : « Proposition inutilisable, réessaie »
    (502), rien n'est enregistré ; panne du fournisseur (clé, crédits) : son message passe tel quel.
  - ⚠️ **`lib/studioReformulationServeur.ts` est le SEUL fichier du Studio qui importe
    `lib/fournisseurIA`** (texte). La génération d'images et l'avis IA restent sur OpenRouter, avec la
    clé OpenRouter du compte ; `lib/studioReformulation.test.ts` le garde. **Jamais vérifié par un
    appel réel** : le premier appel dira si le prompt rend un JSON utilisable chez chaque fournisseur.
  - **Modifier à la main** (Version 2+ ; la Version 1 reste en lecture seule, refusée en 400) : titre,
    tirets et mots-clés sont des champs (`TexteAnnonce.tsx`) enregistrés par `PATCH
    /api/studio/versions/[id]` (`lireModificationVersion`, `lib/studioVersion.ts`) : **seuls les champs
    présents dans le corps sont écrits**, un champ à la fois depuis l'écran (Entrée ou en quittant le
    champ ; bouton « Enregistrer » pour les tirets). Une file (`enfiler`, `Versions.tsx`) envoie les
    enregistrements un par un : chaque réponse porte la version entière, deux requêtes en vol feraient
    reculer un champ. « Copier la description » copie la description telle qu'elle est à l'écran.
  - **« Télécharger les N photos »**, sur chaque version, Version 1 comprise :
    `GET /api/studio/versions/zip?cle=&numero=[&sku=]` (`lib/studioZip.ts`, dépendances injectées,
    Prisma et stockage dans `lib/studioZipServeur.ts`). Un seul `.zip` nommé `<SKU>-version-<n>.zip`
    (SKU d'annonce, sinon le sac, sinon le coloris), photos `01.jpg`, `02.jpg`… dans l'ordre de la
    version (l'extension suit le vrai type : une image générée peut être en PNG ou WebP), **octets du
    stockage tels quels** (entrées rangées sans compression), tout lu avant de répondre, **une photo
    absente ou d'un autre compte refuse tout** (404). Aucun identifiant de photo ne vient du
    navigateur : le serveur relit la version pour le compte. Bibliothèque : `fflate` (voir la PR).
    ⚠️ Un lien `download` n'est pas interceptable par `page.route` : l'e2e vérifie le lien et les refus du
    vrai serveur, le contenu du zip l'est par vitest et par `unzip -t`.
  - **Réglages de retouche** sous le titre de la version (2+) : `ligneReglages`
    (`lib/studioReglagesVersion.ts`, pur) lit les réglages sur les copies (`StudioReference.retouche`,
    sinon `angleCopie` des anciennes copies « Pivoter » ; `VersionEnBase.retouches`, relu par
    `versionEnBase`) : « Pivoté 8° (zoom) · Recadré 10 % · Cadre beige 4 %, bord adouci 35 % », réglages
    neutres omis, « Photos d'origine » si rien n'est réglé, « Réglages variés » (détail au survol) quand
    les photos diffèrent. Pas de ligne pour la Version 1.
  - Hors de cette étape : le choix de la version dans Mise en vente (étape 5), la suppression de la
    génération (étape 6).
- **Avis IA** : plus jamais lancé à l'ouverture d'une fiche (c'était payant) ;
  seulement après une génération, ou par « Demander l'avis ». Un échec est rangé
  dans `verifIA` (`{ erreur: { code, message } }`, sans migration, jamais
  par-dessus un avis lisible) : « Avis IA en échec » reste distinct de « Pas
  encore d'avis » après un rechargement.
- **Sélecteur de modèles** (`SelecteurModeles.tsx`, logique pure
  `app/studio/_modeles.ts`) : recherche, favoris épinglés, filtres « dans le
  budget » / « déjà testé », tri par coût du sac ou par réussite ; pour chaque
  modèle, prix par image, coût d'un sac complet (15 prises) en € contre le
  budget (« Hors budget », « 2,1 × le budget »), réussite du premier coup et coût
  réel moyen (`agregats` de `GET /api/studio/modeles` ; « jamais essayé », jamais
  0 % sans décision). 1 à 3 modèles, mémorisés dans le navigateur ; catalogue en
  panne ⇒ dernier relevé (serveur, sinon ce navigateur) et « Rafraîchir »
  (`?rafraichir=1`).
- **Comparaison** : 2 ou 3 modèles sur les mêmes cases en un lancement (un
  `lancementId`). Dans « À juger », les images d'une même case et d'un même
  lancement se jugent côte à côte (`Comparaison.tsx`, `app/studio/_comparaison.ts`) :
  « Retenir celle-ci » valide l'une et REJETTE les autres (touches 1 / 2 / 3),
  « Aucune ne convient » les rejette toutes ; différé de 5 s comme V / R.
- **Historique d'une prise** (`HistoriquePrise.tsx`, `GET /api/studio/historique`) :
  toutes les tentatives, rejets purgés et échecs compris. « Retenir cette
  version » = DEUX appels : rejeter l'image qui tient la case, puis valider
  celle-ci (remise en l'état si le second échoue).
- **Prompts** : un **prompt maître** par compte (`StudioReglages`), collé une
  fois par conversation Gemini, placé en tête de chaque appel API ; des **prompts
  d'angle** courts (`StudioAngle`, « Angle: … »). Aucun amorçage : Aramis les
  saisit. Un angle qui a pris une case ne se supprime pas, et changer son texte
  **archive l'ancien et crée une nouvelle version** (`archiveLe`).
- **Cases** (`lib/studioCases.ts`, pur) : une case = (vraie photo, prompt
  d'angle). Verrouillée si un essai non rejeté y existe (« à juger »,
  « validée », ou « en vente » quand l'`Article` du `skuCible` n'est plus En
  stock / Photos prêtes). **Un rejet libère la case.** Choix automatique : la
  première case libre de chaque photo pas encore couverte pour le sac cible.
  Le serveur revérifie le verrou (409 `case_prise`) ; seule une correction
  (`essaiParentId`) régénère une case prise.
- **Vraies photos** : `StudioReference.ordre` (1 à 15) = la ligne,
  `prise` = son nom (liste fixe `PRISES`). `ordre` null = photo gardée hors
  tableau (photos conservées à la mise en vente).
- **Génération par API (19/10)** : `POST /api/studio/generations`, **une requête
  par modèle** en parallèle (`maxDuration = 300`), regroupées par `lancementId`.
  Modules : `lib/studioModeles.ts` (pur, isomorphe : tarif, estimation, devis,
  budget), `lib/studioCatalogue.ts` (`/images/models` + `/images/models/{id}/endpoints`
  pour le prix par image, cache 10 min, dernière bonne réponse, ne lève jamais),
  `lib/studioGeneration.ts` (`/images`, repli `chat/completions` sur 404/405,
  erreurs typées), `lib/studioLancement.ts` (orchestration à dépendances
  injectées, testée sans réseau). Catalogue et favoris : `GET /api/studio/modeles`,
  `POST|DELETE /api/studio/modeles/favoris`.
- ⚠️ **Budget par sac** (`StudioReglages.budgetParSacEur`, 1 € par défaut, et
  `tauxEurParUsd`, 0,86 : réglables dans l'onglet Studio de /parametres et depuis
  l'étape Génération, `PUT /api/studio/reglages`). Le devis d'un lancement (cases ×
  modèles, `devisDuLancement`) est en euros et **vérifié côté serveur** : total
  estimé > budget strict, ou un seul tarif inconnu (« au jeton », au mégapixel,
  absent) ⇒ 409 `confirmation_requise` avec le devis, sans `confirme: true`. Le
  bouton de confirmation affiche le montant au centime supérieur (« Confirmer
  1,34 € »). Le seuil fixe de 0,10 $ n'existe plus. **Jamais un prix inventé** : l'estimation est un majorant (max des
  fournisseurs et variantes, coût par référence `input_reference` compris — il
  atteint 0,20 $ sur riverflow). Le coût réel (`usage.cost`) est rangé sur
  l'essai, null s'il manque, **jamais compté zéro**.
- ⚠️ **Clé OpenRouter du compte uniquement** pour générer (`cleDuCompte`) : **pas
  de repli `OPENROUTER_API_KEY`**, sinon tout compte générerait aux frais du
  déploiement (même trou que Trello). La vérification IA garde, elle, la cascade
  de `resoudreReglages`.
- **Numérotation par coloris × angle × modèle** (unique
  `colorisId, angleId, modele, numero`, gardé tel quel au 20/10) : le numéro
  court par colonne, pas par case ; le « premier essai » d'une case est celui
  sans `essaiParentId`. « Corriger un détail » sur un essai API régénère avec
  le même modèle, l'image ratée en 1re référence ; l'essai raté passe `rejete`,
  le nouveau pointe vers lui (`essaiParentId`).
- **Échecs** dans `StudioEchec` (code, message, coût éventuel) : ni numéro
  d'essai ni taux, comptés à part au bilan (blocages `securite` distingués).
  `incertain` (502/504, délai) = peut-être facturé : vérifier l'activité
  OpenRouter avant de relancer.
- **Sept tables** (migrations `20261018120000_studio_ia`,
  `20261019120000_studio_generation_api` et `20261020120000_studio_variantes_angle`,
  écrites à la main, sans DROP de donnée ; la troisième ajoute `StudioReglages`,
  `StudioAngle.archiveLe` (les 7 angles du banc archivés), `StudioReference.ordre/prise`,
  `StudioEssai.referenceId` (RESTRICT) / `skuCible`, `StudioEchec.referenceId` ; la seconde ajoute
  à `StudioEssai` `modele` (NOT NULL, défaut `manuel`), `coutEstimeUsd`,
  `coutReelUsd`, `lancementId`, `essaiParentId`, plus `StudioModeleFavori` et
  `StudioEchec`) :
  `StudioColoris` (clé SacBase `5039-black-pink`, détails un par ligne),
  `StudioReference` (vraie photo ; `colorisId` null = pas encore rattachée),
  `StudioAngle` (prompts d'angle, `StudioEssai.angleId` en `RESTRICT`), `StudioEssai` (`source` manuel | api).
  Aucune contrainte vers `Article`.
- **Supabase Storage, bucket `myflip-studio`, privé** (`lib/studioBlob.ts`, nom
  gardé de l'époque Vercel Blob ; migré le 24/10/2026). Deux
  préfixes et seulement deux : `references/<userId>/<sha256>.jpg` (vraies
  photos, l'empreinte du fichier d'origine dédoublonne) et
  `generees/<userId>/<uuid>.(jpg|png|webp)` (l'extension suit le type renvoyé par
  le modèle). Une image générée ne transite jamais par une réponse JSON. Le chemin est toujours construit par le module ;
  à la lecture et à la suppression l'URL en base est revérifiée contre le
  préfixe. Le bucket étant privé, les écrans lisent par
  `GET /api/studio/image?ref=|essai=` (ligne relue en base, scopée par userId).
  Le client compresse en JPEG 1600 px avant tout envoi (limite de 4,5 Mo).
  ⚠️ Accès par `fetch` sur l'API REST de Supabase avec `SUPABASE_SECRET_KEY` (pas
  de SDK). **Lecture et suppression se font par le chemin, jamais en suivant
  l'hôte de l'URL en base** : les lignes d'avant la migration portent encore des
  adresses `*.blob.vercel-storage.com`, lues sans réécriture parce que leurs
  fichiers ont été copiés au même chemin. Nouvelles images : adresse
  `<SUPABASE_URL>/storage/v1/object/myflip-studio/<chemin>`. L'ancien store Vercel
  Blob est gardé en sauvegarde, plus lu ni écrit.
- **Coloris : SacBase**, `GET <SACBASE_URL>/api/studio/coloris`
  (`lib/studioColoris.ts` : 4 s, cache 60 s, dernière bonne réponse, ne lève
  jamais). Les pages et la route des références l'appellent **une fois** puis
  construisent l'index `sku → cle`. Les photos non rattachées le sont au
  prochain chargement d'une page Studio où SacBase répond.
- **Images validées → annonce** : quand la mise en vente résout le SKU d'un sac
  Hipobuy, `imagesValideesStudio` (`_referencesPhotos.ts`) lit
  `GET /api/studio/annonce?sku=` (essais `decision = "valide"` de ce
  `skuCible`, ordre des prises) et ajoute les images à la fiche, **sans** les
  renvoyer vers `conserverReferences` (`ajouterPhotos(…, { studio: true })`).
- **Photos de mise en vente conservées** : `app/mise-en-vente/_referencesPhotos.ts`,
  appelé sans `await` depuis `ajouterPhotos`. Best-effort : aucun toast, aucune
  erreur remontée, une panne Blob ou SacBase ne bloque jamais une annonce. Sacs
  Hipobuy uniquement (filtre client sur `commandeFournisseur`, revérifié par
  `whereSacbase` côté serveur **avant** tout envoi au Blob). Rotation : la photo
  conservée est celle du dépôt, non tournée.
- **Un essai rejeté se purge** (image effacée du Blob), **la ligne reste** avec
  `urlImage = ""` : effacer un rejet gonflerait le taux de réussite.
- ⚠️ **Cloisonnement (spec §7, assoupli le 20/10)**, gardé par
  **`lib/studioCloisonnement.test.ts`** : `app/mise-en-vente/**`,
  `app/api/hermes/**`, `app/api/sacbase/**` et `extension-vinted/*.js`
  n'importent aucun `lib/studio*` ; `lib/studio*`, `app/api/studio/**` et
  `app/studio/**` n'importent rien de la vente, de l'export ni de l'extension, et
  n'écrivent jamais sur `Article` (ils le LISENT pour le statut des sacs et, depuis le 17/11, pour
  le texte de l'annonce actuelle : la Version 1). Côté
  vente, un seul fichier parle au Studio (`_referencesPhotos.ts`) et seulement à
  `/api/studio/references`, `/api/studio/annonce` et `/api/studio/image` ; la
  route de l'annonce ne rend que les images **validées par Aramis**, jamais selon
  l'avis IA. Ne pas affaiblir ce test pour faire passer un changement.
- **Vignettes** : `GET /api/studio/vignette?cle=` relaie `/img/…` de SacBase
  avec `SACBASE_STUDIO_TOKEN` (SacBase accepte ce jeton en GET sur `/img/*`
  depuis le 20/10) ; le chemin vient du catalogue, jamais du client.
- **Non fait, connu** : **aucune génération réelle par API n'a encore été
  faite** (premier test prévu en prod) ; pas de déclaration manuelle des cases
  utilisées avant le Studio (décision du 20/10) ; choisir plusieurs sacs d'un
  coup dans la fiche est hors périmètre.

---

## 🧩 Composants clés

- `components/Sidebar.tsx` — sidebar desktop + bottom nav mobile. Nav : Dashboard, Stock, Mise en vente, À comptabiliser, Calendrier, Commandes, Statistiques, Prompts (/parametres), Mon compte (/compte). Footer : liens légaux + © 2026 MyFlip.
- `components/AppShell.tsx` — enveloppe l'app. Exclut la sidebar pour `/login`, `/reset-password`, et `/legal/*`.
- `components/Loader.tsx` — animation TRACE (logo M monoline qui se dessine, keyframes `atlas-draw` + `atlas-dots` dans `globals.css`). Props : `label` (string) et `size` ("sm" | "md"). Remplace tous les spinners et skeleton loaders.
- `components/WelcomeModal.tsx` — modal premier lancement, affiché une fois via `localStorage.myflip_welcomed`.
- `components/ChatBot.tsx` — assistant IA flottant.

Pour tout état de chargement : utiliser `<Loader>`. Il n'y a plus de composant skeleton.

---

## 🎨 Assets & Design

### Logo ATLAS
`public/logo-atlas/` contient le pack logo :
- `myflip-favicon-32.png` — favicon 32×32 (référencé dans `layout.tsx` metadata icons)
- `myflip-icon-180.png` — apple-touch-icon 180×180
- `myflip-icon-192.png` / `myflip-icon-512.png` — icônes du manifeste PWA (`app/manifest.ts`), la 512 servant aussi de `maskable`
- `myflip-sidebar.svg` — icône + wordmark, fond transparent
- `myflip-icon.svg` — icône seule sur fond `#1B4332`

⚠️ Ces SVG embarquent l'ancien vert `#1B4332` en dur. Ils **ne sont plus utilisés
dans la sidebar** (qui pose une tuile `var(--acc)` + wordmark texte, cf.
`components/Sidebar.tsx:154`) : sur le fond graphite du thème sombre ils sont
illisibles. Ils restent servis comme favicon et icône iOS uniquement.

### Design system
`docs/design-system.md` — **« Direction C — Console tactile »**, source de vérité.
Relevé sur le code, pas sur une intention : toute divergence entre ce fichier et
`app/globals.css` se tranche en faveur du code.

- Polices : **Space Grotesk** (interface) + **JetBrains Mono** (SKU, montants,
  micro-libellés). Plus Jakarta Sans a été retirée à la refonte — si tu la vois
  citée quelque part, la doc est périmée.
- Palette : variables CSS dans `app/globals.css`, **deux thèmes de premier rang**.
  L'accent change de teinte : `--acc` = `#0f5132` en clair, `#c7f751` (lime) en
  sombre. **Ne jamais coder l'accent en dur** — toujours `var(--acc)`. Un
  `bg-[#0f5132]` passe la revue en clair et casse le sombre sans bruit.
- Neutres verdis (`--bg` `#e7ece8` clair / `#0b0e0d` sombre), profondeur par
  filets et empilement tonal, pas par ombres.
- Le thème est posé avant le premier paint par un script inline
  (`app/layout.tsx:70`). Ne pas le déplacer dans un `useEffect`.

**Règle de `tailwind.config.ts` : tout alias de couleur pointe sur une variable
CSS, sans exception.** Les alias `primary` / `primary-dark` / `on-primary` /
`error` sont les anciens noms de `--acc` / `--acc-hover` / `--acc-ink` / `--neg`,
ils suivent donc le thème. Y écrire un hex, c'est refabriquer le bug qui a été
nettoyé le 09/08/2026.

⚠️ **Pas de modificateur d'opacité sur une variable CSS.** Tailwind ne sait
appliquer une opacité qu'à un hex, pas à un `var(--*)` : depuis que `primary`
pointe sur `--acc`, `ring-primary/15` ne produit plus aucun halo. Utiliser les
tokens dédiés `--acc-ring` et `--acc-ring-strong`.

Écarts résiduels assumés (logos SVG, `--alert`/`--notice` invariants,
`lib/statutColors.ts`) : listés en fin de `docs/design-system.md` avec leur
raison.

---

## 🔗 Intégration Trello

⚠️ **Depuis le 15/08/2026, l'accès Trello s'obtient par OAuth 1.0a.** L'utilisateur
clique sur « Connecter Trello » (`/api/trello/connect`), autorise MyFlip chez Trello,
et revient sur `/api/trello/callback`. Le jeton est chiffré dans
`UserSettings.trelloOauthToken` et **ne transite jamais par le navigateur**. Aucun
champ de saisie de clé/token/secret ne subsiste dans l'interface.

⚠️ **L'origine de rappel DOIT être déclarée chez Trello.** Contrairement à ce qu'on
pourrait croire d'un flux OAuth 1.0a où le `oauth_callback` est transmis à chaque
demande, Trello le valide contre la liste **« Allowed Origins »** du Power-Up
(trello.com/power-ups/admin → le Power-Up → onglet API key). Une origine absente
donne, sur l'écran d'autorisation : *« Invalid return_url. The return URL should match
the application's allowed origins. »* — après que le jeton de requête a été obtenu avec
succès, ce qui fait croire à tort à un problème de signature.

Origines à déclarer : `https://myflip-app.vercel.app` (l'hôte de l'application, celui
d'où part la connexion), plus `http://localhost:3000` pour le développement. Les
wildcards (`*`) sont dépréciés côté Trello et ne fonctionnent plus.

**Pourquoi OAuth 1.0a et pas 2.0** : Trello n'a pas d'OAuth 2.0 sur son API REST. Le
seul autre flux, `/1/authorize`, ne sait rendre le jeton qu'au navigateur (fragment
d'URL ou `postMessage`) — d'où son rejet. Le protocole vit dans `lib/trelloOAuth.ts` ;
le jeton obtenu s'utilise comme un `key=…&token=…` ordinaire, **donc `lib/trello.ts`
n'a pas bougé**.

**Cascade de résolution** (`lib/settings.ts`, `contexteDepuisReglages`, fonction pure
et testée) : jeton OAuth → clés héritées du compte → **rien**.
⚠️ **Il n'y a plus de repli sur les variables d'environnement.** C'est par lui qu'un
utilisateur atteignait le board du propriétaire du déploiement. Ne pas le
réintroduire « pour faire marcher un compte neuf » : un compte neuf se connecte, il
n'emprunte pas. Le repli subsiste pour les clés IA, où il n'expose qu'un quota.

Les **connexions héritées** sont les clé+token saisis à la main avant cette date. Elles
restent lues ; `trelloKey`/`trelloToken`/`trelloSecret` ne doivent pas être supprimées
tant qu'un compte en dépend, et **plus rien ne doit les écrire** (`SECRETS` de
`/api/user/settings` ne les accepte plus).

Le webhook entrant n'a pas de session : il s'identifie par `data.board.id`, résolu en
`userId` via `UserSettings.trelloBoardId` (colonne **unique**). Le secret qui valide sa
signature `x-trello-webhook` suit la connexion : `TRELLO_API_SECRET` (celui de
l'application) pour l'OAuth, `UserSettings.trelloSecret` pour une connexion héritée.
Sans secret, l'événement passe et l'absence de vérification est journalisée.

Le webhook s'enregistre **automatiquement** à l'enregistrement du board
(`brancherWebhook` dans `/api/user/settings`), et son id est conservé dans
`trelloWebhookId` pour pouvoir le supprimer à la déconnexion. `/api/trello/disconnect`
supprime le webhook **avant** de révoquer le jeton : un webhook appartient au jeton qui
l'a créé, l'ordre inverse laisse un webhook orphelin impossible à effacer.

Deux sens de synchronisation, à ne pas confondre :

**Trello → MyFlip** (`app/api/webhooks/trello/route.ts`)
L'étiquette violette « À comptabiliser » (`TRELLO_LABEL_ID`) sur une carte fait passer les articles correspondants au statut « À comptabiliser ». Le nom de la carte peut contenir plusieurs SKUs (`"SDM11 SDM36 ADI36"`). Le webhook ne crée jamais d'article : un SKU inconnu est loggé et ignoré.

⚠️ **Piège.** Trello n'émet `addLabelToCard` que si l'étiquette est posée **après coup**. Une carte qui *arrive* déjà étiquetée (création avec étiquette cochée, duplication, déplacement depuis un autre board) ne déclenche aucun événement d'étiquette. Le webhook écoute donc aussi `createCard`, `copyCard`, `moveCardToBoard`, `updateCard` et `convertToCardFromCheckItem`, et interroge l'API pour lire les étiquettes réelles de la carte (cf. `CARD_ACTIONS`). Ne pas restreindre ce filtrage sans comprendre ce piège.

**MyFlip → Trello** (`app/api/articles/[id]/comptabiliser/route.ts`)
À la validation comptable : retrait de « À comptabiliser » puis pose de « Comptabilisé » (`TRELLO_COMPTABILISE_LABEL_ID`). Les deux appels sont **best-effort** et indépendants : un échec Trello ne doit jamais bloquer la validation comptable. La carte n'est pas archivée.

Le transporteur d'un article est déduit du nom de l'**autre** étiquette de la carte (Mondial Relay, Colissimo, UPS…) — d'où l'exclusion explicite des deux étiquettes de statut lors de cette détection.

Les IDs d'étiquettes se listent avec :
`GET https://api.trello.com/1/boards/{TRELLO_BOARD_ID}/labels?key={KEY}&token={TOKEN}`

---

## 🤖 Fournisseur IA — Ollama Cloud par défaut (03/11/2026)

Plus de crédit OpenRouter : **Ollama Cloud sert les annonces et l'assistant par défaut**,
OpenRouter reste en secours (code, catalogues et clé intacts). Un compte choisit son
fournisseur et ses modèles dans `/compte` (`components/compte/Integrations.tsx`).

- **Aiguillage** : `lib/fournisseurIA.ts` est la seule couture entre les routes
  (`/api/listings/generate`, `/api/chat`) et les deux clients. `choisirIA(usage, reglages)`
  (pur, testé) rend `{ fournisseur, modele, cle, source }` : rien de choisi ⇒ Ollama Cloud +
  `deepseek-v4.1-flash`. **La clé suit toujours le fournisseur retenu** : une clé OpenRouter
  n'est jamais envoyée à Ollama, ni l'inverse.
- **Clients** : `lib/ollama.ts` (annonces : requête, lecture tolérante, relance unique,
  `posterOllama` partagé), `lib/ollamaChat.ts` (assistant ; les lecteurs `texteAssistant` /
  `appelsOutils` / `messageAssistantBrut` sont ceux d'`openrouterChat.ts`, format OpenAI commun),
  `lib/ollamaBase.ts` (adresse `https://ollama.com/v1`, `OLLAMA_BASE_URL` acceptée **seulement
  si locale**, comme OpenRouter).
- **Colonnes `UserSettings`** (migration `20261103120000_ollama_cloud`, 4 colonnes nullables,
  aucun DROP) : `ollamaKey` (chiffrée comme `openrouterKey`, jamais renvoyée en clair),
  `fournisseurIA` (`ollama` | `openrouter`, null = Ollama), `modeleOllamaIA`,
  `modeleOllamaChatIA`. ⚠️ **`modeleIA` / `modeleChatIA` restent les modèles OPENROUTER** : un
  modèle n'existe que chez son fournisseur, donc une colonne par fournisseur
  (`champModele`, `modeleChoisi` dans `lib/modelesIA.ts`). Sans cela, `google/gemini-…`
  partirait chez Ollama pour tout compte qui avait choisi un modèle avant le 03/11.
- **Catalogues** (`lib/modelesIA.ts`) : `MODELES_OLLAMA_PROPOSES` (annonces, exige `vision`) et
  `MODELES_CHAT_OLLAMA_PROPOSES` (assistant, exige `tools`) : `deepseek-v4.1-flash` (défaut),
  `gemma4:31b`, `glm-5.3-flash`, noms relevés sur `ollama.com/api/tags`. Pas de prix au jeton
  (`prix: null`, forfait Ollama). `MODELE_PAR_DEFAUT` / `MODELE_CHAT_PAR_DEFAUT` restent les
  défauts **OpenRouter** : `lib/studioVerif.ts` lit le premier, ne pas le remplacer.
- **Clé** : celle du compte, sinon `OLLAMA_API_KEY` (même cascade qu'OpenRouter, pas de repli
  pour Trello). Aucune variable `NEXT_PUBLIC_`.
- ⚠️ **Le Studio IA (`lib/studio*`) n'en dépend PAS** : Ollama Cloud ne génère pas d'images,
  le Studio (génération et avis IA) reste sur OpenRouter avec la clé OpenRouter du compte, quel
  que soit le fournisseur choisi. Ne pas le brancher sur `fournisseurIA`. **Seule exception, du
  texte** : « Reformuler » (`lib/studioReformulationServeur.ts`, 17/11/2026) utilise
  `choisirIA("annonce", …)` et `genererAnnonce` sans image.
- **Trois doutes de la documentation Ollama, JAMAIS vérifiés par un appel réel** (le premier
  appel en dira plus ; chacun a son filet) :
  1. forme de `image_url` : l'exemple Ollama l'écrit en chaîne, la forme OpenAI est un objet
     `{ url }`. On construit l'objet ; `FORME_IMAGE_URL` (`lib/ollama.ts`) bascule en chaîne ;
  2. `response_format` : coché dans la page de compatibilité, nié par la page « structured
     outputs ». On envoie le schéma **et** on le décrit dans le prompt **et** on lit de façon
     tolérante (fences, texte autour) **et** on valide (`titre` ≤ 100) **et** on relance UNE
     fois en redisant la raison du refus ; un 400 qui nomme le champ le fait retirer
     (`allegerRequete`) ;
  3. `reasoning_effort` : envoyé seulement pour un modèle dont la réflexion est connue
     (`reflexion` du catalogue : deepseek `medium` annonces / `low` assistant, rien pour les
     autres) ; un 400 qui parle de réflexion le fait retirer.
- `maxDuration` de `/api/listings/generate` : 60 → **120 s** (la relance double le pire cas).
  Assistant Ollama : `max_tokens` 4096 (la réflexion compte dans le plafond).
- **e2e** : `OLLAMA_BASE_URL` pointe sur le faux OpenRouter (même format), `OLLAMA_API_KEY` est
  vidée et contrôlée (`e2e/outils/environnement.ts`). Le compte de test n'a pas de clé Ollama.

### Anthropic, troisième fournisseur (04/11/2026)

Un compte peut choisir **Anthropic** dans « Mon compte → Mes clés IA » avec sa clé API Anthropic
(`console.anthropic.com/settings/keys`) : annonces (photos + JSON) et assistant (outils).

- **Clients** (`fetch` direct, aucune dépendance) : `lib/anthropic.ts` (annonces : requête,
  lecture tolérante, relance unique, `posterAnthropic` partagé), `lib/anthropicChat.ts`
  (assistant), `lib/anthropicBase.ts` (adresse `https://api.anthropic.com/v1`,
  `ANTHROPIC_BASE_URL` acceptée **seulement si locale**, en-têtes `x-api-key` et
  `anthropic-version: 2023-06-01`). `POST /messages`.
- **Modèles** (`lib/modelesIA.ts`, identifiants SANS suffixe de date) : annonces
  `claude-haiku-5-5` (défaut) / `claude-sonnet-5-5` ; assistant `claude-sonnet-5-5` (défaut) /
  `claude-haiku-5-5`. Saisie libre possible (`claude-opus-5-5`…). `effortAnthropic` : `output_config.effort`
  envoyé seulement pour le catalogue (annonces `medium`, assistant Sonnet `medium`, Haiku `low`) ;
  un 400 qui nomme `effort` ou le schéma le fait retirer (`allegerRequeteAnthropic`).
- ⚠️ **Haiku 5.5 et Sonnet 5.5 refusent `temperature`/`top_p`/`top_k`** (400) : ne jamais en
  envoyer. Sonnet 5.5 refuse aussi `tool_choice` `any`/`tool` : l'assistant reste en `auto`.
  Ils réfléchissent par défaut : les jetons de réflexion comptent dans `max_tokens`
  (annonces 8192, assistant 4096).
- **Annonces** : photos en blocs `image` base64 AVANT le texte ; `media_type` déduit de la
  signature du fichier (`typeMimeImage`) car Anthropic refuse un type qui ne correspond pas aux
  octets ; JSON par `output_config.format` (schéma) + format redit dans le prompt + lecture
  tolérante + une relance. Seuls les blocs `text` portent l'annonce.
- **Assistant** : la route parle toujours le format OpenAI. `lib/anthropicChat.ts` traduit
  l'historique vers Anthropic (`versMessagesAnthropic`) et la réponse vers le format OpenAI
  (`reponseEnFormatChat`). ⚠️ **La réflexion signée (blocs `thinking`) doit être rejouée telle
  quelle** quand on renvoie un résultat d'outil : la réponse traduite l'embarque dans
  `anthropic_content`, que `messageAssistantBrut` remet dans l'historique. Ne pas retirer ce
  champ d'`openrouterChat.ts`.
- **Colonnes `UserSettings`** (migration `20261104120000_anthropic_provider`, idempotente,
  `ADD COLUMN IF NOT EXISTS`) : `anthropicKey` (EXISTAIT déjà, redéclarée dans le schéma ;
  chiffrée comme les autres), `modeleAnthropicIA`, `modeleAnthropicChatIA` (une colonne par
  fournisseur, comme Ollama). **Prod migrée à la main : coller le SQL de la migration dans
  l'éditeur SQL de Supabase.**
- **Clé** : celle du compte, sinon `ANTHROPIC_API_KEY`. Le Studio IA n'en dépend pas.
- **Jamais vérifié par un appel réel** (aucune clé au moment de l'écriture) : tout le format
  des requêtes vient de la documentation. Le premier appel dira si `output_config.format` +
  `effort` ensemble, les images base64 et le tour d'outil avec réflexion passent.
- **e2e** : `ANTHROPIC_BASE_URL` pointe sur le faux serveur local, `ANTHROPIC_API_KEY` est vidée
  et contrôlée ; la garde réseau fait échouer la suite si un refus vise `anthropic.com`.

---

## 🔧 Scripts

- `scripts/init-user.mjs` — crée l'utilisateur en base + envoie l'email de bienvenue. One-shot, gitignored.
- `scripts/setup-trello-webhook.ts` — configure le webhook Trello. À relancer si le board change.
- `scripts/organiser_annonces.py` — organise les ZIPs d'annonces dans le Finder. Usage Mac local uniquement.

---

## 🔑 Variables d'environnement requises

Les clés **IA** ci-dessous sont des **valeurs de repli** : elles servent aux comptes
qui n'ont pas saisi les leurs dans `/compte`.

⚠️ **Ce n'est PAS le cas de Trello.** `TRELLO_API_KEY` / `TRELLO_API_SECRET` sont les
identifiants de l'*application*, pas un repli : elles servent à obtenir les jetons des
utilisateurs, jamais à accéder à un board à leur place. Les six anciennes variables
`TRELLO_TOKEN`, `TRELLO_SECRET`, `TRELLO_BOARD_ID`, `TRELLO_LABEL_ID`,
`TRELLO_COMPTABILISE_LABEL_ID` et `TRELLO_OWNER_EMAIL` **ne sont plus lues par
l'application** — seul `scripts/migrer-trello-env.ts` les consulte, une fois.

⚠️ **`GEMINI_API_KEY` n'est plus lue** depuis le passage à OpenRouter (13/08/2026).
Depuis le 03/11/2026 la génération d'annonces passe d'abord par le fournisseur du compte
(Ollama Cloud par défaut, cf. « Fournisseur IA ») ; `lib/openrouter.ts` n'est appelée que si le
compte a choisi OpenRouter, avec le modèle de `UserSettings.modeleIA` (repli
`MODELE_PAR_DEFAUT` de `lib/modelesIA.ts`).
La colonne `UserSettings.geminiKey` survit en base mais n'est lue nulle part —
même consigne que `photosPretes` : `prisma db push` proposera de la dropper, refuser.

⚠️ **`ANTHROPIC_API_KEY` et `UserSettings.anthropicKey` sont de nouveau lues depuis le
04/11/2026**, mais seulement quand le compte choisit le fournisseur **Anthropic** (cf. « Fournisseur
IA — Anthropic » plus bas). Entre le 15/08 et le 04/11 elles ne servaient plus : l'assistant
passait par OpenRouter (`lib/openrouterChat.ts`, modèle `UserSettings.modeleChatIA`, repli
`MODELE_CHAT_PAR_DEFAUT` de `lib/modelesIA.ts`), qui reste le chemin du fournisseur OpenRouter.
Le contenu ancien de la colonne `anthropicKey` (clé de l'ancien assistant direct) est relu tel
quel : si le compte affiche « Ta clé » alors qu'il n'a rien saisi depuis le 04/11, c'est cette
vieille clé, sans doute périmée : la remplacer.

**Deux catalogues de modèles distincts dans `lib/modelesIA.ts`**, pas superposables :
- `MODELES_PROPOSES` (génération d'annonces) — exige `input_modalities: image` ET
  `supported_parameters: structured_outputs` sur `openrouter.ai/api/v1/models`. Sans
  les deux, une génération échoue à *chaque* fois, pas une fois sur dix.
- `MODELES_CHAT_PROPOSES` (assistant) — exige seulement `supported_parameters:
  tools` : l'assistant appelle des outils, il ne lit ni image ni JSON forcé. C'est ce
  qui permet d'y proposer des modèles texte-seul (DeepSeek, entre autres) qui
  n'auraient jamais leur place dans le premier catalogue.

Vérifier la bonne exigence avant d'ajouter une ligne à l'un ou l'autre.

```
AUTH_SECRET
AUTH_TRUST_HOST=true
NEXTAUTH_URL
INVITE_CODES            # codes d'invitation acceptés sur /signup ; absente = aucune inscription
ENCRYPTION_KEY          # 32 octets hex : chiffre les secrets de UserSettings (AES-256-GCM)
OLLAMA_API_KEY         # génération d'annonces + assistant (Ollama Cloud, fournisseur par défaut) : repli quand le compte n'a pas sa clé
ANTHROPIC_API_KEY      # génération d'annonces + assistant quand le compte choisit Anthropic : repli quand il n'a pas sa clé
ANTHROPIC_BASE_URL     # e2e seulement : serveur factice local ; absente = https://api.anthropic.com/v1 (lib/anthropicBase.ts, toute adresse non locale est ignorée)
OLLAMA_BASE_URL        # e2e seulement : serveur factice local ; absente = https://ollama.com/v1 (lib/ollamaBase.ts, toute adresse non locale est ignorée)
OPENROUTER_API_KEY      # génération d'annonces + assistant quand le compte choisit OpenRouter : repli quand il n'a pas sa clé (JAMAIS pour la génération d'images du Studio)
OPENROUTER_BASE_URL     # e2e seulement : serveur factice local ; absente = https://openrouter.ai/api/v1 (lib/openrouterBase.ts, toute adresse non locale est ignorée)
TRELLO_API_KEY          # clé de l'APPLICATION MyFlip (trello.com/power-ups/admin)
TRELLO_API_SECRET       # « OAuth Secret » : signe l'OAuth et valide les webhooks
RESEND_API_KEY
DATABASE_URL            # PostgreSQL : Supabase en Production depuis le 24/10/2026 ; Neon pour dev et Preview
HERMES_API_TOKEN        # API Hermes : jeton porteur. Absente = /api/hermes/* répond 503
HERMES_USER_EMAIL       # API Hermes : compte MyFlip sur lequel l'agent écrit
SACBASE_API_TOKEN       # API SacBase (lecture seule) : jeton porteur. Absente = /api/sacbase/stock répond 503
SACBASE_USER_EMAIL      # API SacBase : compte MyFlip dont SacBase lit les sacs Hipobuy
SACBASE_URL             # Studio IA : URL de SacBase (https, ou http://localhost en dev). Absente = Studio sans catalogue
SACBASE_STUDIO_TOKEN    # Studio IA : jeton de GET /api/studio/coloris (= SACSBASE_STUDIO_TOKEN côté SacBase, avec le S)
SUPABASE_URL           # Studio IA : https://<projet>.supabase.co (stockage des images). Absente = dépôt et lecture d'images échouent
SUPABASE_SECRET_KEY    # Studio IA : clé secrète `sb_secret_…` du projet, serveur uniquement (jamais NEXT_PUBLIC_*)
BLOB_READ_WRITE_TOKEN   # PLUS LU depuis le 24/10/2026 (ancien store Vercel Blob `myflip-studio`, gardé comme sauvegarde)
```

⚠️ **`ENCRYPTION_KEY` perdue = tous les secrets de `UserSettings` illisibles.** La
sauvegarder hors Vercel. La changer invalide l'existant (il faudrait déchiffrer avec
l'ancienne et rechiffrer avec la nouvelle).

`NEXT_PUBLIC_USER_NAME` a été retirée : le prénom vit sur `User.prenom` et transite par
la session (`lib/useIdentite.ts`). Une variable inlinée au build ne pouvait pas différer
d'un compte à l'autre.
