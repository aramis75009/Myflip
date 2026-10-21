# Suite e2e Playwright — référence de la refonte

Captures « avant » de toutes les routes (clair et sombre, 1440 et 390 px), états
d'interface, sondes des bugs du PRD § 1 et base d'accessibilité axe. PRD :
`docs/prd/2026-10-20-refonte-design.md` (§ 1, 11, 12, 13). Études préalables :
`docs/refonte/etude-2026-10-20/*.json`.

**Aucun test ne touche Neon ni une API réelle.** Base Postgres embarquée, faux
OpenRouter, SacBase et Resend, `next dev` dédié avec de fausses valeurs.

## Lancer

```bash
npm run e2e                 # toute la suite, série « courant »
npm run e2e:avant           # même chose, captures et rapports dans la série « avant »
npm run e2e:rapport         # ouvre le rapport HTML du dernier lancement
npx playwright test --list  # liste sans rien démarrer
npx playwright test e2e/smoke.spec.ts --project=desktop-clair
E2E_DECALAGE=10 npm run e2e # une deuxième suite en même temps que la première
E2E_LATENCE_API_MS=1500 CAPTURES_SERIE=courant-latence npx playwright test e2e/captures.spec.ts e2e/etats.spec.ts
                            # « éprouvette » : chaque réponse de /api/** arrive avec 0 à 1,5 s de retard, selon le
                            # chemin. Une capture qui diffère de celle d'un lancement normal repose sur une attente fragile.
CAPTURES_SERIE=avant npx tsx e2e/outils/resume-serie.ts --tests <rapport JSON de Playwright>
                            # écrit e2e/rapports/avant/RESUME.md (voir « Sorties »)
```

Premier lancement : rien à installer de plus que `npm install`. Le Chromium de
Playwright 1.63.0 (révision 1243) doit être dans `~/Library/Caches/ms-playwright` ;
sinon `npx playwright install chromium`.

Un lancement complet démarre, dans l'ordre :

1. au **chargement de `playwright.config.ts`** (processus principal) : contrôles
   de préparation (voir « Gardes ») et remise à zéro des journaux du lancement ;
2. les **webServer**, l'un après l'autre : faux OpenRouter, faux SacBase, faux
   Resend, puis `next dev` (prêt quand `/login` répond) ;
3. le **globalSetup** : vérifie que la garde réseau s'est chargée dans Next,
   démarre Postgres, recrée la base, `prisma migrate deploy`, lance le seed,
   précompile `/login`, `/` et `/legal/cgu` ;
4. le projet **setup** (connexion des comptes `demo` et `neuf`), puis les 4
   projets de captures ;
5. le **globalTeardown** : arrête Postgres, remet `next-env.d.ts` sur `.next`,
   échoue si le serveur a tenté de joindre openrouter.ai ; puis les webServer
   s'arrêtent.

> Ordre vérifié dans `@playwright/test` 1.63.0 (`createGlobalSetupTasks`) : les
> webServer démarrent **avant** le globalSetup. `next dev` démarre donc sans
> base, ce qui est sans effet : il ne s'y connecte qu'à la première requête qui
> lit des données, après le globalSetup.

## Architecture

| Élément | Où | Détail |
|---|---|---|
| Ports, dossiers, env du serveur, contrôles | `e2e/outils/environnement.ts` | seule source de ces valeurs |
| Postgres embarqué | `e2e/db/postgres.ts` | `.e2e-db.nosync/<D>/data`, port 5433+D, base `myflip_e2e` recréée à chaque lancement |
| Seed | `e2e/seed/seed-e2e.ts` | comptes `demo` (riche) et `neuf` (vide), ids fixes (`e2e/compte-test.ts`) |
| Faux OpenRouter | `e2e/mocks/openrouter.mjs` | `http://127.0.0.1:4010+D/api/v1` |
| Faux SacBase | `e2e/mocks/sacbase.mjs` | `http://127.0.0.1:4011+D`, sert `e2e/seed/sacbase-coloris.json` |
| Faux Resend | `e2e/mocks/resend.mjs` | `http://127.0.0.1:4014+D` |
| Garde réseau serveur | `e2e/garde-reseau.mjs` | chargée par `NODE_OPTIONS=--import=…` |
| Fixtures (`test`, `expect`) | `e2e/outils/test.ts` | thème, gardes, images, console, boîtes natives, compte |
| Calme réseau | `e2e/outils/calme.ts` | `attendreCalme(page)` : plus aucune requête en cours, fil principal libéré. Remplace `networkidle` (collant) |
| Captures | `e2e/outils/capture.ts` | `capturer(page, id, options)` |
| Résumé d'une série | `e2e/outils/resume-serie.ts` | `RESUME.md` : tests, captures, sondes, axe, console, faux serveurs, garde réseau |
| Faux serveurs vus des tests | `e2e/outils/mocks.ts` | `appelsFaux`, `modifierEtatFaux`, `reinitialiserFaux` |
| Connexion | `e2e/auth.setup.ts` | formulaire `/login`, `e2e/.auth/<compte>.json` |

### Le serveur de test

`next dev -p 3100+D`, avec `NEXT_DIST_DIR=.next-e2e-<port>.nosync` : il n'écrit
jamais dans le `.next` du `npm run dev` habituel. Son environnement complet est
`envServeur()` : base locale, secrets factices, faux serveurs, Blob vide,
`E2E=1`, `TZ=Europe/Paris`. Toute variable des fichiers `.env` y est **surchargée**
(une variable déjà dans l'environnement n'est jamais écrasée par les fichiers
`.env` de Next ; une chaîne vide suffit à neutraliser un vrai secret).

La seule couture dans le code de l'app : `OPENROUTER_BASE_URL`, lue par
`lib/openrouterBase.ts` (défaut `https://openrouter.ai/api/v1`, seule une adresse
locale acceptée sinon) et utilisée par les six modules qui appellent OpenRouter.

### Images (Blob « niveau 0 »)

`BLOB_READ_WRITE_TOKEN` et `VERCEL_OIDC_TOKEN` sont vides : le serveur ne lit ni
n'écrit aucune image. Le **navigateur** intercepte `GET /api/studio/image` et
sert un SVG synthétique (silhouette de sac et libellé, `e2e/outils/image-studio.ts`).
Pour libeller une image : `imagesStudio.libelles.set("ref:<id>", "Face")`. Les
vignettes `/api/studio/vignette` passent par le serveur, qui les relaie au faux
SacBase (`/img/*` → PNG synthétique). Jamais de vraie photo ni d'image générée
par IA. Conséquence connue : l'import de photos et la génération échouent côté
serveur à ce niveau (ils lisent le Blob) ; il faut intercepter leurs routes.

### Projets

| Projet | Fenêtre | Thème |
|---|---|---|
| `setup` | 1440×900 | clair — connexion seulement |
| `desktop-clair` / `desktop-sombre` | 1440×900 | `colorScheme` + `localStorage["myflip-theme"]` |
| `mobile-clair` / `mobile-sombre` | 390×844, `isMobile`, `hasTouch`, DPR 2 | idem |

Chromium seulement, `locale: fr-FR`, `timezoneId: Europe/Paris`, et
`ignoreDefaultArgs: ['--hide-scrollbars']` (sinon les bugs de barre de
défilement sont invisibles). `workers: 2`.

## Écrire un spec

```ts
import { capturer } from "./outils/capture";
import { expect, test } from "./outils/test"; // jamais @playwright/test directement

test.describe("stock", () => {
  test.use({ compte: "demo" }); // "demo" | "neuf" | "aucun" (défaut)

  test("liste", async ({ page, journalConsole, dialogues }) => {
    await page.goto("/stock");
    await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
    await capturer(page, "stock-liste", { masques: [page.locator("[data-date]")] });
    expect(journalConsole.erreurs).toEqual([]);
  });
});
```

- `capturer` attend le chargement, le calme réseau, `document.fonts.ready`, fige
  les animations et masque l'indicateur de `next dev`. Image :
  `e2e/captures.nosync/<serie>/<projet>/<id>.png`. Une capture d'un lancement
  partiel écrase la précédente ; rien n'est effacé.
- Le CountUp du Calendrier tourne en `requestAnimationFrame` : `attenteMs: 900`.
- Les dates dépendent du jour du seed : capturer « avant » et « après » le même
  jour, ou masquer les zones datées.
- Le serveur garde le catalogue OpenRouter 10 min et SacBase 60 s en mémoire :
  un changement d'état d'un faux serveur (`modifierEtatFaux(request, "sacbase",
  { panne: true })`) ne se voit qu'après expiration, ou au lancement suivant.
- Des GET du Studio écrivent en base (coloris, rattachement, prises) : la base
  est recréée à chaque lancement, pas entre deux tests.

## Gardes

1. **Préparation** (au chargement de la config, avant `next dev`) : refus si
   `DATABASE_URL` n'est pas locale ou ressemble à Neon, si `OPENROUTER_BASE_URL`,
   `SACBASE_URL`, `RESEND_BASE_URL`, `NEXTAUTH_URL` ou `AUTH_URL` ne sont pas
   locales, si un jeton Blob ou `OPENROUTER_API_KEY` n'est pas vide, et si **un
   seul nom** de `.env`, `.env.local`, `.env.development(.local)` n'est pas fixé
   dans l'env du serveur (la liste des noms en cause s'affiche, jamais les valeurs).
   Une nouvelle variable dans `.env.local` bloque donc la suite tant qu'elle n'est
   pas ajoutée à `envServeur()`.
2. **Navigateur** : `context.route` laisse passer localhost, 127.0.0.1 et [::1],
   avorte tout le reste (popups comprises) et fait échouer le test ; journal
   `e2e/rapports/<serie>/reseau-navigateur.jsonl`.
3. **Serveur** : `e2e/garde-reseau.mjs` enveloppe `globalThis.fetch` dans chaque
   processus Node de `next dev` et refuse tout hôte non local sauf
   `fonts.googleapis.com` et `fonts.gstatic.com` (polices de `next/font`). Chaque
   refus va dans `e2e/rapports/<serie>/reseau-serveur.jsonl`. Le globalSetup
   échoue si la garde ne s'est pas chargée dans Next ; le globalTeardown échoue
   si un refus vise openrouter.ai. Le contrôle de version de `next dev`
   (`registry.npmjs.org`) y apparaît à chaque lancement : c'est la preuve que la
   garde voit bien les `fetch` de Next.
   Limites : elle ne couvre ni undici appelé directement (put/del de
   `@vercel/blob`, inertes ici faute de jeton) ni `node:https` (téléchargement
   des polices Google par `next/font`).
4. **Base** : tout ce qui écrit (migrations, seed) refuse une `DATABASE_URL` non
   locale. Prisma est d'abord lancé en lecture (`migrate status`) pour vérifier
   qu'il vise bien `localhost:5433+D` avant toute écriture.
5. `reuseExistingServer: false` partout : si un port est pris, la suite s'arrête
   au lieu de piloter un serveur inconnu.

## Décalage (deux suites en même temps)

`E2E_DECALAGE=D` (multiple de 10, défaut 0) décale tout :

| | D = 0 | D = 10 |
|---|---|---|
| app | `http://localhost:3100` | `:3110` |
| faux OpenRouter / SacBase / Resend | 4010 / 4011 / 4014 | 4020 / 4021 / 4024 |
| Postgres | 5433, `.e2e-db.nosync/0/` | 5443, `.e2e-db.nosync/10/` |
| build Next | `.next-e2e-3100.nosync/` | `.next-e2e-3110.nosync/` |
| sessions | `e2e/.auth/` | `e2e/.auth/d10/` |
| série par défaut | `courant` | `courant-d10` |
| `test-results`, `playwright-report` | sans suffixe | `-d10` |

Un multiple de 10 parce que les faux serveurs sont à 4010+D et 4011+D : deux
décalages voisins (0 et 1) partageraient le port 4011.

## Sorties

- `e2e/captures.nosync/<serie>/<projet>/<id>.png` — gitignoré.
- `e2e/rapports/<serie>/` — `base.json` (migration, seed), `console.jsonl`,
  `reseau-serveur.jsonl`, `reseau-navigateur.jsonl`, `mocks.jsonl`. Vidés au
  début de chaque `playwright test`. `courant*` est gitignoré, `avant/` se commite.
- `e2e/rapports/<serie>/sondes.json`, `a11y.json`, `etats.json`, `captures.jsonl` —
  voir `e2e/sondes/LISEZMOI.md`. `sondes.json` et `a11y.json` sont **fusionnés** (clé
  id/projet/route) : effacer les deux avant un lancement de référence.
- `e2e/rapports/avant/RESUME.md` — la référence « avant » lisible : date, tests, durée,
  captures, sondes, axe, console, appels des faux serveurs, garde réseau, états non capturés.
- `.e2e-db.nosync/<D>/postgres.log` — journal de Postgres.

## Ce qu'il ne faut JAMAIS faire

- Lancer la suite contre Neon, ou retirer un contrôle de `controlerPreparation`
  pour « faire passer » un lancement. Une variable non surchargée s'ajoute à
  `envServeur()`, avec une valeur factice ou vide.
- Lancer `npm run seed` / `prisma db seed` / `prisma migrate reset` : c'est
  `prisma/seed.ts`, qui vide le stock du compte le plus ancien de la base visée.
- Mettre `reuseExistingServer: true`, ou servir l'e2e sur le port 3000 : la suite
  piloterait le `npm run dev` d'Aramis, qui a les vrais secrets.
- Lancer `npm run build` / `next build` pendant un `next dev`.
- Sur `/studio/<cle>`, presser **V** ou **R** (valident ou rejettent l'image sur
  le champ), **C** ou les flèches, sans intercepter `/api/studio/essais/**`.
- Déclencher un état marqué `safeToTriggerInTest: false` dans
  `docs/refonte/etude-2026-10-20/routes-etats.json` sans `page.route` qui rend
  une réponse simulée.
- Cliquer « Connecter Trello », « Déconnexion » ou « SORTIR ».
- Mettre une vraie photo ou une image générée par IA dans une fixture.
- Lancer `vercel` ou `vercel link` dans le dossier de l'app : `@vercel/blob`
  irait chercher un jeton OIDC sur api.vercel.com.
- Recopier le mot de passe des comptes de test (`e2e/compte-test.ts`) dans un
  rapport, un journal ou un message.

## Pièges connus

- **`waitForLoadState("networkidle")` est collant** : Playwright le déclare une fois par
  document (premier silence de 500 ms, souvent avant l'hydratation) et répond ensuite
  tout de suite, requêtes en cours ou non. Deux lancements identiques donnaient 72
  captures différentes (avatar « · », « Chargement du catalogue… », colonne
  « Rentabilité » vide, calendrier en chargement). Utiliser `attendreCalme` (calme.ts) ;
  `capturer`, `aller` (sondes) et `aller` (etats.spec) l'appellent déjà. Une requête
  retenue exprès (`retenir`) n'empêche pas le calme. Calme non atteint en 60 s (serveur
  figé, Mac qui swappe) : le test ÉCHOUE et liste les requêtes en cours, au lieu de
  photographier une page à moitié chargée (un lancement avec 18 captures « quand même » en
  avait produit 18 de plus qui différaient du lancement précédent).
- **Un repère de page doit exister APRÈS le chargement, pas pendant** : « CA TOTAL » du
  calendrier s'affiche à 0,00 € sous « Chargement du calendrier » ; le repère est « CA SEMAINE ».
- **Les toasts durent 4 s** : une capture par défaut ne doit pas en attraper un au
  passage (`attendreSansToast` dans etats.spec.ts). L'image du Studio ajoutée à une
  annonce de Mise en vente arrive après coup et déclenche un toast.
- **Ne jamais poser un attribut sur du HTML serveur avant l'hydratation** (sonde F1) :
  React lève « A tree hydrated but some attributes… » (console.error). Attendre `__reactFiber$`.
- Le nombre d'appels de catalogue reçus par les faux serveurs dépend du cache du serveur
  (OpenRouter 10 min, SacBase 60 s) : il varie d'un appel autour de l'unité entre deux lancements.
- Le délai du PATCH de la sonde S3 (5 à 8 ms) varie d'un lancement à l'autre ; son état, non.

- `next dev` réécrit `next-env.d.ts` (référence à `<distDir>/types/routes.d.ts`)
  et ajoute `.next-e2e-<port>.nosync/types/**/*.ts` à `tsconfig.json`. La ligne
  reste ; le globalTeardown remet `next-env.d.ts` sur `.next`. Pendant qu'une
  suite tourne, `npm run typecheck` peut voir deux `routes.d.ts` et échouer :
  relancer après la fin de la suite.
- Les polices Google sont téléchargées par `next dev` au premier démarrage
  (réseau requis) ; sans réseau, Next prend la police de repli et les captures
  ne sont plus fidèles.
- `/login` : les `<label>` ne sont pas liés aux champs (`getByLabel` échoue) ;
  `auth.setup.ts` utilise `input[type=email][autocomplete=email]` et
  `input[type=password][autocomplete=current-password]`.

- **`e2e/fondations.spec.ts`** : tests des comportements nouveaux de la refonte, titres préfixés par le lot qui
  les fait passer (`[M1] …`). Pour l'instant : `[M1] virtualisation : hauteur totale = hauteur rendue` (Stock,
  ordinateur et mobile : le conteneur virtuel garde sa hauteur de haut en bas et vaut la somme des places réelles
  des lignes ; mobile : la taille estimée d'une carte vaut une carte à ligne simple).
- **États et boîtes de confirmation** : depuis la refonte, la suppression d'un article du Stock et celle de
  l'écran « À comptabiliser » sont des `AlertDialog` (`getByRole("alertdialog")`), testées par
  `confirmation destructive : stock` et `etat.compta.delete-modal` ; Réglages et Commandes gardent leur
  `window.confirm` tant que M9 et M4 ne sont pas passés (test `confirm de suppression`).
