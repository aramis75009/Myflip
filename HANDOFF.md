# HANDOFF — MyFlip

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le et archive celui que
tu remplaces dans `docs/handoffs/`.

Le mode d'emploi complet est dans [`AGENTS.md`](AGENTS.md), section
« Terminer une session ». L'index des passations passées est en bas de page.

---

# Passation — 2026-10-18 · Studio IA, la moitié back

| | |
|---|---|
| **Agent** | Claude Code (Opus 5), avec 5 sous-agents Sonnet pour les modules indépendants |
| **Branches** | MyFlip `feat/studio-ia` (8 commits, `ad0fdbb` → `2989f9c`), partie de `main` (`8b340c8`). SacBase `feat/studio-coloris` (2 commits, `0938765`, `cd9ed47`), partie de `main` (`a75dbfe`). **Poussées sur `origin`. Non fusionnées.** |
| **PR** | SacBase [#18](https://github.com/aramis75009/catalogue-sacs-nike-elite/pull/18) ouverte. MyFlip : pas encore (la fonctionnalité n'a pas d'écran). |
| **Spec** | `docs/superpowers/specs/2026-10-17-studio-ia-design.md` · **Plan** `docs/superpowers/plans/2026-10-18-studio-ia.md` |

## Goal — l'objectif
Mesurer, sur une dizaine de coloris, si Nano Banana Pro reproduit fidèlement un
sac sous d'autres angles — avec un banc de test dans MyFlip qui prépare les
prompts, range les essais et les note, **sans qu'aucune image générée ne puisse
rejoindre une annonce**.

## Current state — ce qui a été fait

**SacBase (phase A, livrée).** `GET /api/studio/coloris`, lecture seule, jeton
`SACSBASE_STUDIO_TOKEN`. `lib/v3/studio.ts` rend un coloris par item du
catalogue avec tous ses sacs (vendus compris) et `chezMoi` (non vendus à Paris).
`colorisKey()` produit la clé stable (`5039-black-pink`) qui sert de clé
primaire côté MyFlip. 25 tests.

**MyFlip (phase B + une partie de C).**
- **Migration `20261018120000_studio_ia`** écrite à la main, appliquée sur dev,
  **commitée seule avant tout code**. Quatre tables, 0 contrainte vers `Article`.
- `lib/studioColoris.ts` — client SacBase (4 s, cache 60 s, dernière bonne
  réponse, ne lève jamais, jeton hors des logs). 65 tests.
- `lib/studioAngles.ts` — bloc commun, 7 modèles d'angle, compilation des
  prompts, prompt de correction ciblée. 29 tests.
- `lib/studioVerif.ts` — notation d'une image générée par le modèle de vision,
  sortie JSON stricte, erreurs à `code`. 81 tests.
- `lib/studioStats.ts` — taux au 1er essai, essais moyens, top 3 des détails qui
  dérivent. 35 tests.
- `lib/studioCloisonnement.test.ts` — le garde-fou du §7. 17 tests.
- `components/Sidebar.tsx` — champ `section`, entrée « Studio (test) » derrière
  un séparateur, absente du dock mobile.
- `server-only` **installé** (il ne l'était pas) et aliasé dans `vitest.config.ts`.

**Pas fait** : le stockage Blob (T7), la conservation des photos de mise en
vente (T8), les trois écrans (T9), la documentation du `CLAUDE.md` (T13). **Aucun
écran n'existe : le lien « Studio (test) » de la sidebar pointe dans le vide.**

## Decisions — choix critiques ou irréversibles

- **Migration AVANT le code, commit séparé.** Le build Vercel ne lance que
  `prisma generate`. Vérifiée sur `information_schema`, pas sur le registre :
  4 tables créées, `photosPretes` / `geminiKey` / `anthropicKey` intactes,
  `migrate diff` ne signale que le `DROP photosPretes` connu.
- **`StudioEssai.angleId` est `RESTRICT`, pas `Cascade`.** Supprimer un modèle
  d'angle effacerait les mesures qui sont le but même du test (§11).
- **`StudioReference.colorisId` est `SET NULL`.** Une vraie photo se conserve
  sans limite : abandonner un coloris ne doit pas détruire des photos qu'on ne
  reprendra pas.
- **La chaîne `api/studio` n'est PAS interdite côté vente** par le test de
  cloisonnement. Le §7 autorise ce sens (« les vraies photos peuvent **entrer**
  dans le Studio ») et la T8 appellera exactement une telle route. Ce qui est
  interdit, et testé, c'est qu'un module de vente **importe** `lib/studio*`, et
  qu'un module Studio écrive sur `Article`.
- **`lib/openrouter.ts` n'a pas été élargi.** Son `CorpsRequete` impose un
  `json_schema` nommé `annonce`, qui n'est pas le schéma du §6.
- **Les statistiques se calculent sur `decision`, jamais sur `verifIA`** (§6).
  `verifIA` ne sert qu'à nommer les détails qui dérivent.
- **Un détail hors champ sort en `absent`**, avec une note préfixée
  (`OUT_OF_FRAME_PREFIX`), et `absent` ne compte pas comme une dérive : un
  détail invisible sous un angle donné ne doit pas faire baisser le score.
- **`server-only` installé explicitement.** Next le résout par un alias interne,
  jamais exercé dans ce dépôt. C'est ce qui garde le jeton SacBase hors du
  bundle navigateur : trop important pour reposer sur un chemin non documenté.
- **Cinq écarts entre la spec et le code** sont tranchés dans le plan
  (`docs/superpowers/plans/2026-10-18-studio-ia.md`, section « Écarts assumés »).
  Ne pas les re-débattre : sidebar sans section secondaire, HEIC non converti,
  proxy SacBase, photos non persistées, pas de `migration_lock.toml`.

## Changed — fichiers et composants

| Fichier | Nature |
|---|---|
| `prisma/migrations/20261018120000_studio_ia/migration.sql` | neuf — 4 tables, écrit à la main |
| `prisma/schema.prisma` | 4 modèles + 3 relations inverses sur `User` |
| `lib/studioColoris.ts` (+ test) | neuf — client SacBase |
| `lib/studioAngles.ts` (+ test) | neuf — prompts |
| `lib/studioVerif.ts` (+ test) | neuf — notation par le modèle de vision |
| `lib/studioStats.ts` (+ test) | neuf — statistiques du bilan |
| `lib/studioCloisonnement.test.ts` | neuf — garde-fou du §7 |
| `lib/__stubs__/server-only.ts`, `vitest.config.ts` | doublure de test + alias |
| `package.json`, `package-lock.json` | `server-only` ajouté |
| `components/Sidebar.tsx` | champ `section`, entrée Studio |
| `docs/superpowers/specs/…-studio-ia-design.md`, `docs/superpowers/plans/…` | spec et plan versionnés |
| **SacBase** `lib/v3/studio.ts`, `lib/studio-auth.ts`, `app/api/studio/coloris/route.ts`, `proxy.ts`, `lib/env.server.ts`, `.env.example`, `DEPLOY.md` | la route coloris |

## Validations — passants / échoués / non lancés

- **Passants (MyFlip)** : `npm test` → 26 fichiers, **519 tests** ;
  `npm run typecheck` → 0 erreur ; `npx eslint` sur tout le chantier → 0.
- **Passants (SacBase)** : `npx vitest run` → 197 passants ; `npx tsc --noEmit`
  → 0 hors `.next/` ; eslint → 0. Mes deux fichiers : 25 tests.
- **Passants, sur la base de dev Neon (`ep-autumn-morning`)** : `migrate deploy`
  des deux migrations en retard, puis lecture de `information_schema` — 4 tables
  Studio, 3 colonnes protégées intactes, 6 clés étrangères aux bonnes règles
  (`RESTRICT` sur `angleId`, `SET NULL` sur `StudioReference.colorisId`), et
  **0 contrainte de `Studio*` vers `Article`**.
- **Tests de mutation** : le client SacBase a été cassé 7 fois et le module de
  vérification 12 fois ; chaque cassure fait échouer au moins un test. L'une
  d'elles a révélé un vrai trou (retrait des fences markdown masqué par un
  repli), corrigé.
- **Non lancés** : `npm run build` (jamais, cf. invariants) ; **rien sur la base
  de prod** ; **aucun appel réel à la route SacBase de bout en bout** ; **aucun
  appel réel à OpenRouter** — ni le prompt, ni les repères de score, ni la
  convention « Hors champ » n'ont été essayés ; **aucun écran ouvert dans un
  navigateur**, y compris la sidebar modifiée.
- ⚠️ **Un test de SacBase échoue déjà sur `main`**, sans rapport avec ce
  chantier (vérifié par `git stash`) : `tests/v3/warehouse.test.ts` lit
  `data/hipobuy.json`, le fichier de données vivant, et attend deux commandes en
  dur ; `commandes_en_vol` y est vide depuis le refresh du 13/10 (`747ff2c`).

## Blockers — ce qui bloque

- **Les prompts testés le 17/10 ne sont dans aucun dépôt.** Les 7 angles ont été
  écrits d'après la spec. Aramis doit les comparer aux siens avant de conclure
  quoi que ce soit sur la fidélité du modèle — sinon le test mesure d'autres
  prompts que ceux qui ont marché.
- **Pas d'`OPENROUTER_API_KEY` sur Vercel.** La vérification IA dépend de la clé
  du compte (`/compte`). Sans elle, le module sort `missing_key`.
- ⚠️ **`vercel blob create-store` a écrasé `MyFlip/.env.local`** (le dossier
  parent, où vit `.vercel/project.json`), passé de 1281 octets à deux lignes. Le
  `.env.local` du dépôt n'a pas été touché ; le jeton Blob y a été recopié,
  sauvegarde dans `.env.local.avant-blob-18-10`. Contenu d'origine du parent :
  perdu, à vérifier par Aramis.
- **Décisions du 29/09 toujours ouvertes** : pseudos Vinted visibles par les
  autres comptes, et date de mise en vente posée par Hermes ou non.

## Next — la prochaine action

1. **T7 — le Blob.** `npm i @vercel/blob`, `lib/studioBlob.ts`, deux préfixes
   stricts `references/<userId>/` et `generees/<userId>/`. Le store
   `myflip-studio` (privé) existe et `BLOB_READ_WRITE_TOKEN` est en place.
2. **T8 — conserver les vraies photos.** Un seul point d'entrée :
   `ajouterPhotos` (`app/mise-en-vente/page.tsx:219-254`), sur le `Blob` JPEG
   déjà produit. **Sacs Hipobuy uniquement** (`whereSacbase`). Best-effort :
   un échec Blob ou SacBase ne doit jamais bloquer une mise en vente. Appeler
   `getColoris` **une fois** puis construire l'index, jamais `resolveSkuToCle`
   en boucle (4 s par appel si SacBase est tombé).
3. **T9 — les trois écrans**, puis **T13 — `CLAUDE.md`**.
4. Faire tourner la route SacBase pour de vrai : poser le jeton sur le VPS,
   vérifier que le fichier ecosystem pm2 le transmet (`DEPLOY.md:163-171` ne
   liste aucune variable MyFlip), puis `curl` avec le Bearer → 200.

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-10-18 | Studio IA, la moitié back | Claude Code (Opus 5) | *(passation courante)* |
| 2026-09-29 | Comptes Vinted et dates pour SacBase | Claude Code (Opus 5.5) | [fiche](docs/handoffs/2026-09-29-comptes-vinted-dates-sacbase.md) |
| 2026-09-09 | Le champ prix : diagnostic et correctifs | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-09-champ-prix-diagnostic.md) |
| 2026-09-09 | Le prix dans le prompt, le délai dans un pop-up | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-09-prix-prompt-delai-popup.md) |
| 2026-09-08 | Remplissage Vinted livré, prochain chantier cadré | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-08-remplissage-vinted-livre.md) |
| 2026-09-03 | Audit du chantier Vinted, correctifs, rangement de `main` | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-03-audit-chantier-vinted.md) |
| 2026-08-19 | Extension Vinted — 16 tâches implémentées | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-19-extension-vinted-implementation.md) |
| 2026-08-18 | Extension Vinted, design en cours | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-18-extension-vinted-design.md) |
