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
- `/api/user/settings/test` — teste la clé IA réellement utilisée (lecture seule)
- `/api/user/settings/trello` — liste boards et étiquettes ; POST (re)crée le webhook
- `/api/trello/connect` — démarre l'autorisation OAuth (302 vers Trello)
- `/api/trello/callback` — retour de Trello : vérifie l'appartenance, échange et stocke
- `/api/trello/disconnect` — supprime le webhook, révoque le jeton, efface tout
- `/api/articles`, `/api/articles/[id]` — CRUD articles
- `/api/commandes`, `/api/commandes/[id]` — CRUD commandes
- `/api/dashboard`, `/api/stats`, `/api/calendar` — données agrégées
- `/api/prompts`, `/api/prompts/[id]` — CRUD prompts IA
- `/api/listings/generate` — génération d'annonces (OpenRouter, modèle au choix)
- `/api/chat` — chatbot IA
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
La génération d'annonces appelle `lib/openrouter.ts` avec le modèle choisi dans
`/compte` (`UserSettings.modeleIA`, repli `MODELE_PAR_DEFAUT` de `lib/modelesIA.ts`).
La colonne `UserSettings.geminiKey` survit en base mais n'est lue nulle part —
même consigne que `photosPretes` : `prisma db push` proposera de la dropper, refuser.

⚠️ **`ANTHROPIC_API_KEY` n'est plus lue non plus**, depuis le passage de l'assistant
(`/api/chat`) à OpenRouter (15/08/2026). L'assistant appelle `lib/openrouterChat.ts`
avec le modèle choisi dans `/compte` (`UserSettings.modeleChatIA`, repli
`MODELE_CHAT_PAR_DEFAUT` de `lib/modelesIA.ts`). Même consigne pour
`UserSettings.anthropicKey` : la colonne survit en base, `prisma db push` proposera
de la dropper, refuser.

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
OPENROUTER_API_KEY      # génération d'annonces + assistant : repli quand le compte n'a pas sa clé
TRELLO_API_KEY          # clé de l'APPLICATION MyFlip (trello.com/power-ups/admin)
TRELLO_API_SECRET       # « OAuth Secret » : signe l'OAuth et valide les webhooks
RESEND_API_KEY
DATABASE_URL            # Neon PostgreSQL (dans .env, géré par Vercel/Prisma)
HERMES_API_TOKEN        # API Hermes : jeton porteur. Absente = /api/hermes/* répond 503
HERMES_USER_EMAIL       # API Hermes : compte MyFlip sur lequel l'agent écrit
```

⚠️ **`ENCRYPTION_KEY` perdue = tous les secrets de `UserSettings` illisibles.** La
sauvegarder hors Vercel. La changer invalide l'existant (il faudrait déchiffrer avec
l'ancienne et rechiffrer avec la nouvelle).

`NEXT_PUBLIC_USER_NAME` a été retirée : le prénom vit sur `User.prenom` et transite par
la session (`lib/useIdentite.ts`). Une variable inlinée au build ne pouvait pas différer
d'un compte à l'autre.
