# MyFlip

MyFlip est un mini-SaaS de gestion pour un revendeur de vêtements de marque
d'occasion (Polo Ralph Lauren, Lacoste, Tommy Hilfiger…). L'activité consiste à
acheter des lots chez des fournisseurs, puis à revendre les articles à l'unité
sur Vinted et Vestiaire Collective.

L'application couvre toute la chaîne :

1. **Commandes** — on enregistre un lot acheté (coût total, nombre d'articles,
   coefficient objectif). MyFlip en déduit le prix de revient unitaire.
2. **Stock** — chaque article du lot reçoit un SKU (`PRL1`, `LAC50`…), un état et
   un statut. On suit ce qui est en stock, en vente, vendu.
3. **Mise en vente** — un assistant en 4 étapes (photos → détails → génération →
   export) qui rédige l'annonce par IA à partir des photos, puis exporte un ZIP
   prêt à publier.
4. **Comptabilité** — marges, coefficients, chiffre d'affaires par semaine, par
   marque et par mois.

C'est une application **mono-utilisateur** : un seul compte propriétaire, protégé
par authentification.

---

## Stack technique

| Domaine | Choix |
|---|---|
| Framework | Next.js 15 (App Router) + React 18 + TypeScript |
| Styles | Tailwind CSS — design system « Direction C — Console tactile » (`docs/design-system.md`), Space Grotesk + JetBrains Mono, thèmes clair/sombre |
| Base de données | PostgreSQL (Neon) via Prisma 6 |
| Authentification | NextAuth v5 (credentials, mot de passe bcrypt stocké en base) |
| État client | TanStack Query (+ TanStack Virtual pour la liste du stock) |
| IA | Google Gemini (génération d'annonces) · Anthropic Claude (chatbot) |
| Emails | Resend (bienvenue, réinitialisation de mot de passe) |
| Intégration | Trello : connexion OAuth par utilisateur + webhook (cartes articles) |
| Hébergement | Vercel |

---

## Architecture

### Pages

| Route | Rôle |
|---|---|
| `/dashboard` | KPIs, CA par semaine, CA par marque |
| `/stock` | Liste des articles, filtres, édition en ligne, virtualisation |
| `/mise-en-vente` | Assistant de génération d'annonces IA (4 étapes) |
| `/a-comptabiliser` | Articles vendus en attente de saisie comptable |
| `/calendrier` | Ventes par mois |
| `/commandes` | Commandes fournisseur et leur rentabilité |
| `/statistiques` | Statistiques avancées |
| `/parametres` | Modèles de prompts IA |
| `/compte` | Mon compte, changement de mot de passe |
| `/login`, `/reset-password` | Connexion, mot de passe oublié |
| `/legal/*` | Mentions légales, CGU, confidentialité (sans sidebar ni auth) |

### API

| Route | Rôle |
|---|---|
| `/api/articles`, `/api/articles/[id]`, `/api/articles/bulk` | CRUD articles |
| `/api/articles/[id]/comptabiliser` | Passage d'un article en « comptabilisé » |
| `/api/commandes`, `/api/commandes/[id]`, `/api/commandes/[id]/stats` | CRUD commandes et rentabilité |
| `/api/dashboard`, `/api/stats`, `/api/calendar` | Données agrégées |
| `/api/listings/generate` | Génération d'annonce (Gemini : photos + prompt compilé) |
| `/api/prompts`, `/api/prompts/[id]` | CRUD des modèles de prompts |
| `/api/chat` | Chatbot IA (Anthropic) |
| `/api/auth/[...nextauth]` | NextAuth |
| `/api/auth/forgot-password`, `/api/auth/reset-password` | Réinitialisation par email |
| `/api/user/password` | Changement de mot de passe (authentifié) |
| `/api/webhooks/trello` | Webhook Trello entrant |
| `/api/trello/connect` | Démarre l'autorisation Trello (redirection) |
| `/api/trello/callback` | Retour de Trello : échange et stocke le jeton |
| `/api/trello/disconnect` | Révoque l'autorisation et efface la configuration |

### Composants clés

- `AppShell.tsx` — enveloppe l'application (sidebar + chatbot). Exclut la sidebar
  pour `/login`, `/reset-password` et `/legal/*`.
- `Sidebar.tsx` — sidebar sur desktop, barre de navigation basse sur mobile.
- `Loader.tsx` — animation de chargement « TRACE ». Remplace tous les spinners.
- `Modal.tsx`, `SellModal.tsx`, `NewCommandeModal.tsx`, `WelcomeModal.tsx` — modales.
- `EditableCell.tsx` — édition en ligne dans le tableau du stock.
- `ChatBot.tsx` — assistant IA flottant.

### Modules (`lib/`)

- `hooks.ts` — tous les hooks TanStack Query : **source unique** des appels API.
- `prisma.ts` — client Prisma (singleton).
- `gemini.ts` — appel Gemini et parsing de l'annonce générée.
- `promptSelect.ts` — choix du prompt le plus spécifique et compilation des
  placeholders (`{marque}`, `{categorie}`, `{taille}`, `{etat}`, `{matiere}`,
  `{sku}`, `{details}`).
- `imageProcessing.ts` — rotation, compression et encodage des photos (navigateur).
- `calc.ts` — marge, coefficient, prix de revient.
- `emails.ts` — emails transactionnels (Resend).
- `types.ts`, `serialize.ts` — DTOs et conversion Prisma → API.

### Modèle de données (`prisma/schema.prisma`)

`User` · `Commande` · `Article` · `PromptTemplate`

> **Piège à connaître.** En base, `Article.marque` et `Article.categorie`
> contiennent le **libellé du lot** (« Polo Ralph Lauren »), identique dans les
> deux colonnes. C'est cette valeur qui pilote les filtres du Stock. Pour
> l'annonce, `app/mise-en-vente/page.tsx` la redécoupe en marque + catégorie
> exploitables (« Ralph Lauren » + « Polo ») via `MARQUE_LISTING_MAP`. Cette
> conversion est **purement d'affichage** : ne jamais l'écrire en base, sous peine
> de casser les filtres du Stock et l'import de commandes.

---

## Setup local

### Prérequis

- Node.js 20+
- Une base PostgreSQL (Neon en production, n'importe quelle instance en local)

### Installation

```bash
npm install                       # postinstall lance `prisma generate`
cp .env.local.example .env.local  # puis renseigner les variables
npx prisma db push                # crée le schéma dans la base
npm run seed                      # (optionnel) données de départ
npm run dev                       # http://localhost:3000
```

Le compte propriétaire se crée avec `node scripts/init-user.mjs` : le script
insère l'utilisateur en base (mot de passe hashé en bcrypt) et envoie l'email de
bienvenue. Il est volontairement non versionné.

### Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Connexion PostgreSQL (Neon) |
| `AUTH_SECRET` | Secret NextAuth — `npx auth secret` |
| `AUTH_TRUST_HOST` | `true` en dev et derrière un proxy |
| `NEXTAUTH_URL` | URL de l'app (`http://localhost:3000` en dev) |
| `OLLAMA_API_KEY` | Génération d'annonces + chatbot via Ollama Cloud (fournisseur par défaut) : repli quand le compte n'a pas saisi sa clé dans `/compte` |
| `OPENROUTER_API_KEY` | Génération d'annonces + chatbot quand le compte choisit OpenRouter (secours) |
| `RESEND_API_KEY` | Emails transactionnels |
| `TRELLO_API_KEY`, `TRELLO_API_SECRET` | Identifiants de l'application Trello (parcours OAuth). Les utilisateurs ne saisissent aucune clé. |
| `NEXT_PUBLIC_USER_NAME` | Prénom affiché dans le dashboard |

Les identifiants de connexion vivent **en base** (table `User`), pas dans
l'environnement.

### Commandes

| Commande | Effet |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production (type-check inclus) |
| `npm run start` | Serveur de production |
| `npm run lint` | ESLint |
| `npm run seed` | Alimente la base (`prisma/seed.ts`) |
| `npm run setup-trello` | Hérité : configure le webhook du board du déploiement. Le webhook des comptes se crée seul. |
| `npm run migrer-trello` | One-shot : recopie l'accès Trello des variables d'env vers le compte propriétaire |

---

## Déploiement

Application sur **Vercel**, base sur **Neon**. Tout push sur `main` déclenche un
déploiement de production ; les variables ci-dessus doivent être définies dans les
réglages du projet Vercel (cibles Production **et** Preview).

### Workflow git

Le projet se développe depuis plusieurs machines (Mac / Windows) :

```bash
git pull                 # toujours, avant de commencer
# … développement …
git add -A && git commit -m "…" && git push
```

Ne jamais coder sur deux machines en parallèle sans `pull` / `push` entre les
deux. Comme `main` part directement en production, passer par une branche pour
tout changement non trivial.

---

## Structure des dossiers

```
app/                  Pages (App Router) ; routes API sous app/api/
components/           Composants React réutilisables
lib/                  Métier, hooks, accès données, IA, emails
prisma/               schema.prisma + seed
public/logo-atlas/    Logos, favicons, icônes PWA
scripts/              Scripts utilitaires (voir ci-dessous)
docs/                 Documentation (design system)
auth.ts               NextAuth complet (Prisma + bcrypt) — runtime Node
auth.config.ts        NextAuth allégé, sans Prisma — runtime Edge (middleware)
middleware.ts         Protection des routes
CLAUDE.md             Consignes pour l'agent Claude Code
```

`auth.ts` et `auth.config.ts` sont **volontairement séparés** : le middleware
tourne sur le runtime Edge, qui ne supporte ni Prisma ni bcrypt. Ne pas les
fusionner.

### Scripts

- `scripts/setup-trello-webhook.ts` — hérité : (re)configure le webhook du board
  du déploiement (`npm run setup-trello`). Depuis le 15/08/2026, le webhook d'un
  compte se crée tout seul à l'enregistrement de son board.
- `scripts/migrer-trello-env.ts` — one-shot idempotent : recopie l'accès Trello
  des variables d'environnement vers le compte propriétaire, avant la suppression
  du repli (`npm run migrer-trello`).
- `scripts/init-user.mjs` — crée le compte propriétaire et envoie l'email de
  bienvenue. One-shot, non versionné.
- `scripts/organiser_annonces.py` — utilitaire **local macOS**, sans lien avec
  l'application web : range dans le Finder les ZIP d'annonces exportés par la page
  Mise en vente.
