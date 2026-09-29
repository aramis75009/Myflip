# HANDOFF — MyFlip

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le et archive celui que
tu remplaces dans `docs/handoffs/`.

Le mode d'emploi complet est dans [`AGENTS.md`](AGENTS.md), section
« Terminer une session ». L'index des passations passées est en bas de page.

---

# Passation — 2026-09-29 · Comptes Vinted et dates pour SacBase

| | |
|---|---|
| **Agent** | Claude Code (Opus 5.5), session ouverte sur SacBase avec MyFlip ajouté en `--add-dir` |
| **Branches** | `feat/comptes-vinted-sacbase` (`59fc934`, `ec1303b`) puis `feat/dates-mise-en-vente` empilée dessus (`dd0ae3d`, `cec882e`, + ce commit de docs). Parties de `origin/main` (`b0f456b`). **Non poussées. Non fusionnées.** Worktree : `.claude/worktrees/comptes-vinted`. |
| **Specs** | `Fake hipobuy/Claude outputs/prompt5_claude_code_myflip_comptes_vinted.md` (comptes + API SacBase) et le brief « dates de mise en vente » (`prompt7_…`). |

## Goal — l'objectif
Que SacBase (tableau de bord des sacs Hipobuy) lise dans MyFlip, pour chaque sac, le statut, le prix, la date de vente, le compte Vinted et la date de mise en vente — et que MyFlip sache dire en combien de jours un article s'est vendu.

## Current state — ce qui a été fait
- **Comptes Vinted** : libellés réels dans `lib/comptesVente.ts` (Fripandtrend = `VINTED_PRO`, Enorab18 = `VINTED_SECOND`), choix du compte AVANT la vente (colonne « Compte » du Stock, sélecteur de la fiche de mise en vente), la comptabilisation garde le compte choisi.
- **`GET /api/sacbase/stock`** : lecture seule, jeton `SACBASE_API_TOKEN`, compte `SACBASE_USER_EMAIL`, 6 clés par article, dates en jour de Paris, lignes hors contrat écartées et journalisées.
- **Script** `scripts/fix-compte-vente-hipobuy.mjs` : passe les sacs Hipobuy vendus sur Enorab18. Simulation par défaut, `--apply` pour écrire. **Pas lancé sur Neon.**
- **Dates** : colonne `Article.dateMiseEnVente` (migration écrite à la main), posée au PASSAGE en « En vente », gardée à travers les brouillons, jamais écrasée si saisie ; colonnes « Mis en vente le », « Vendu le », « Jours en vente » dans `/stock` ; date modifiable dans la fiche (enregistrée à la sortie du champ) ; « aujourd'hui » des modaux de vente en jour de Paris.
- **Pas fait, volontairement** : la date n'est pas posée par l'API Hermes (voir Decisions) ; pas de rattrapage des articles existants.

## Decisions — choix critiques ou irréversibles
- **Migration AVANT le code.** Le build Vercel ne lance que `prisma generate`. `articleSelect` lit `dateMiseEnVente` sur chaque requête article : si le code part avant `prisma migrate deploy`, **toutes les pages articles tombent en 500 pour tous les comptes**.
- **Hermes non modifié.** `changerStatutArticles` a une option `{ dateMiseEnVente: true }` activée par la barre d'action du Stock, PAS par `POST /api/hermes/stock/statut`. L'activer = modifier cette route Hermes : décision d'Aramis, en attente.
- **Passage, pas état.** Un article déjà « En vente » sans date (antérieur) ne reçoit pas de date à la première édition venue : sinon on inventerait un rattrapage.
- **Année bornée 2000–2100** sur les dates saisies : un input date tapé au clavier émet « 0002-09-29 » en cours de frappe, et une telle date sortirait hors format vers SacBase, qui rejette alors tout le lot.

## Changed — fichiers et composants
| Fichier | Nature |
|---|---|
| `lib/comptesVente.ts` (+ test) | nouveau — libellés et règles de compte |
| `lib/sacbaseAuth.ts`, `lib/sacbaseStock.ts` (+ test), `app/api/sacbase/stock/route.ts` | nouveau — API SacBase |
| `lib/dateMiseEnVente.ts` (+ test) | nouveau — règle de date, jours en vente, validation des dates |
| `prisma/schema.prisma`, `prisma/migrations/20260929120000_date_mise_en_vente/` | colonne `dateMiseEnVente` |
| `app/api/articles/[id]/route.ts`, `…/comptabiliser/route.ts`, `app/api/articles/bulk/route.ts`, `app/api/chat/route.ts`, `lib/stock.ts` | écritures de statut |
| `lib/serialize.ts`, `lib/types.ts`, `lib/hooks.ts` | DTO / patch |
| `components/EditableCell.tsx` | variantes `select` et `date` |
| `app/stock/page.tsx`, `app/mise-en-vente/*`, `components/SellDialog.tsx`, `components/SellModal.tsx` | interface |
| `scripts/fix-compte-vente-hipobuy.mjs` | nouveau — correction ponctuelle |
| `CLAUDE.md` | API SacBase, règle de date, variables |

## Validations — passants / échoués / non lancés
- **Passants** : `npm run test` → 21 fichiers, **292 tests** ; `npm run typecheck` → 0 erreur ; lint (`npx eslint --no-eslintrc -c .eslintrc.json app lib components` — `npm run lint` échoue dans un worktree imbriqué, ESLint charge aussi le `.eslintrc` du dépôt parent) → 0 ; `npm run build` → OK (un avertissement `jose`/Edge préexistant).
- **Passants, sur une base Postgres jetable locale (PGlite, toutes les migrations rejouées)** : `prisma migrate deploy` OK, `migrate diff` base→schéma = seulement le `DROP photosPretes` connu ; route SacBase 401/200/405, périmètre (autre compte et autre fournisseur exclus), tri naturel ; la réponse réelle passe le parseur strict de SacBase ; PATCH compte / date (valide, `FOO`, `null`, année 0002) ; comptabilisation qui garde le compte ; barre d'action ; script `--apply` ; `/stock` et fiche vérifiés au navigateur à 1440 et 390 px.
- **Non lancés** : rien sur Neon (ni dev ni prod) ; `SellDialog` de `/a-comptabiliser` non ouvert au navigateur ; enregistrement complet d'une annonce (génération IA) non rejoué — la mise à jour de la fiche après `enregistrer` n'est vérifiée que par le code.
- **Relecture indépendante** faite (Opus) : 1 critique + 4 importants ; critique et 2 importants corrigés (`cec882e`), 2 soumis à Aramis (Blockers).

## Blockers — ce qui bloque
- **Décision Aramis — pseudos visibles par les autres comptes.** Les libellés Fripandtrend / Enorab18 sont globaux (demandé par la spec) : un autre utilisateur de MyFlip les voit à la place de « Vinted Pro / Vinted Second ». Pistes : libellés réglables par compte, ou réservés à `SACBASE_USER_EMAIL`.
- **Décision Aramis — date posée par Hermes ?** (voir Decisions).

## Next — la prochaine action
1. Poser `SACBASE_API_TOKEN` (`openssl rand -hex 32`) et `SACBASE_USER_EMAIL` dans Vercel (Production).
2. `npx prisma migrate status` sur la base de **prod**, puis `npx prisma migrate deploy` — lire d'abord la liste des migrations en attente (la `20260908…` supprime la table `PrixReference`, si la prod ne l'a pas encore vue).
3. Fusionner `feat/dates-mise-en-vente` (qui contient `feat/comptes-vinted-sacbase`) dans `main`, pousser `origin` (pas `alex`), laisser Vercel déployer.
4. `node --env-file=<env prod> scripts/fix-compte-vente-hipobuy.mjs`, lire la liste (6 sacs attendus), puis `--apply`.
5. `curl -H "Authorization: Bearer <jeton>" https://myflip-app.vercel.app/api/sacbase/stock` → 200.

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-09-29 | Comptes Vinted et dates pour SacBase | Claude Code (Opus 5.5) | *(passation courante)* |
| 2026-09-09 | Le champ prix : diagnostic et correctifs | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-09-champ-prix-diagnostic.md) |
| 2026-09-09 | Le prix dans le prompt, le délai dans un pop-up | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-09-prix-prompt-delai-popup.md) |
| 2026-09-08 | Remplissage Vinted livré, prochain chantier cadré | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-08-remplissage-vinted-livre.md) |
| 2026-09-03 | Audit du chantier Vinted, correctifs, rangement de `main` | Claude Code (Opus 5) | [fiche](docs/handoffs/2026-09-03-audit-chantier-vinted.md) |
| 2026-08-19 | Extension Vinted — 16 tâches implémentées | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-19-extension-vinted-implementation.md) |
| 2026-08-18 | Extension Vinted, design en cours | Claude Code (Sonnet 5) | [fiche](docs/handoffs/2026-08-18-extension-vinted-design.md) |
