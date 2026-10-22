# Studio IA — Génération par API OpenRouter : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** sur chaque ligne d'angle, cocher plusieurs modèles d'image OpenRouter, voir un devis, confirmer au-delà de 0,10 $ ou si un tarif est inconnu, générer, ranger chaque essai avec son coût réel, le faire noter, et classer les modèles au bilan.

**Architecture :** trois modules neufs sous `lib/studio*` (estimateur pur et isomorphe, catalogue serveur en cache, client de génération serveur), une orchestration testable par injection (`lib/studioLancement.ts`) que câblent deux routes neuves, une migration écrite à la main, et l'extension des écrans existants. Rien n'est partagé avec la vente : le test de cloisonnement balaie déjà `lib/studio*`, `app/api/studio/**` et `app/studio/**`.

**Tech Stack :** Next 15.3 / React 18, Prisma 6.19 sur Neon, `@vercel/blob` 2.8.2 (store privé), vitest 3 (environnement `node`, logique pure seulement, **pas de `vi.mock`** : convention de `vitest.config.ts`).

**Spec :** `docs/superpowers/specs/2026-10-19-studio-ia-generation-api-prd.md` (PRD validé le 19/10), sur fond de `2026-10-17-studio-ia-design.md` (§7 cloisonnement toujours en vigueur) et du plan `2026-10-18-studio-ia.md`.

## Global Constraints

- Branche `feat/studio-ia`, **rien commité** (T7–T9 non commités volontairement). Aucune étape « commit » dans ce plan : on ne commite que si Aramis le demande.
- Migration **écrite à la main**, appliquée par `npx prisma migrate deploy` sur la base de dev (`grep -o 'ep-[a-z-]*' .env | tail -1` doit afficher `ep-autumn-morning-asmqan`). Jamais `db push` ni `migrate dev`. `Article.photosPretes`, `UserSettings.geminiKey`, `UserSettings.anthropicKey` intactes, vérifiées sur `information_schema`.
- Seuil : **confirmation si total estimé > 0,10 $ (strict) OU si un tarif est inconnu**, vérifié **côté serveur**. Un lancement = un angle × les modèles cochés.
- **Jamais un prix inventé** : pas de prix par image publié ⇒ « tarif au jeton » ou « tarif inconnu », comptés comme inconnus.
- Clé : **celle du compte uniquement** (`resoudreReglages(userId)` avec `source.openrouter === "utilisateur"`). Pas de repli `OPENROUTER_API_KEY` pour la génération (PRD §10). Erreur `missing_key` nommée, lien « Mon compte ».
- `lib/openrouter.ts` intouché. Modules neufs préfixés `studio`. Ni images ni clé dans les logs.
- Une image générée ne repart jamais vers le navigateur dans une réponse JSON : elle va au Blob, l'écran la lit par `GET /api/studio/image?essai=`.
- Pas de `npm run build` (un `npm run dev` tourne). Vérification : `npm test`, `npm run typecheck`, `npm run lint`.
- Code, identifiants, `describe`/`it` en anglais ou dans la langue du fichier voisin (le Studio nomme en français : suivre le voisin) ; libellés d'interface en français ; tokens CSS, jamais de hex.

## Écarts assumés avec le PRD

1. **`StudioEssai.modele` est `NOT NULL DEFAULT 'manuel'`, pas `String?`.** La numérotation est unique par (coloris, angle, modèle, numéro) ; avec un `NULL`, Postgres tiendrait deux dépôts manuels n° 1 pour distincts et l'unique ne protégerait plus rien. `'manuel'` est exactement la valeur que le PRD demande au bilan pour un dépôt manuel.
2. **Favoris : table `StudioModeleFavori`** (PRD §14 laissé au plan). Une colonne JSON sur `UserSettings` toucherait la table des colonnes protégées ; une table reste dans le continent Studio.
3. **Échecs de génération : table `StudioEchec`.** Le PRD veut compter les blocages de sécurité à part au bilan ; un échec ne doit ni consommer un numéro d'essai ni entrer dans les taux. Il a sa ligne, avec son code et son coût réel éventuel.
4. **La vérification IA est déclenchée par l'écran** juste après chaque génération réussie (`POST /api/studio/essais/[id]/verifier`, comme pour un dépôt manuel), pas dans la route de génération : celle-ci reste sous 300 s et l'échec du contrôle n'invalide pas un essai payé.
5. **Une requête par modèle.** L'écran envoie N requêtes parallèles à `POST /api/studio/generations`, chacune portant la liste complète des modèles cochés, `lancementId` (uuid tiré par l'écran) et `confirme`. Le serveur recalcule le devis **sur la liste complète** et refuse si le seuil l'exige sans `confirme: true`.
6. **Prix par image lu sur `GET /api/v1/images/models/{id}/endpoints`** (`pricing[]` avec `billable`, `unit`, `cost_usd`, relevé le 19/10). `/models?output_modalities=image` ne publie que des prix au jeton. Estimation **prudente** : le maximum sur tous les fournisseurs et variantes.

## Review Focus

1. **Un modèle refuse `aspect_ratio`** ou n'a pas `3:4` : on n'envoie `aspect_ratio: "3:4"` que si le catalogue le liste pour ce modèle. Test : `buildImagesRequest` sans `3:4` dans `ratios` n'a pas de clé `aspect_ratio`.
2. **Plus de références que le modèle n'en accepte** (`input_references.max` de 1 à 20, parfois `min: 1`) : tronquer à `maxReferences` (moins 1 pour l'image ratée d'une correction), le dire dans la réponse (`referencesEnvoyees`, `referencesTronquees`). Test dans `studioLancement.test.ts`.
3. **Réponse 200 sans image** (refus poli du modèle, texte seul) : erreur `no_image` nommée, citant le début du texte, pas un 500. Test dans `studioGeneration.test.ts`.
4. **Le modèle rend du PNG ou du WebP** : le Blob n'acceptait que du `.jpg`. L'extension suit le type renvoyé (`jpg|png|webp`), et la vérification IA transmet le vrai type. Test dans `studioBlob.test.ts`.
5. **Deux générations du même modèle en même temps** sur le même angle (double clic, deux onglets) : la contrainte unique (coloris, angle, modèle, numéro) en refuse une, on recalcule le numéro et on retente une fois, comme `POST /api/studio/essais`. Test : `numeroSuivant` filtré par modèle dans `studioFiche.test.ts`.

---

## Structure des fichiers

| Fichier | Nature |
|---|---|
| `prisma/migrations/20261019120000_studio_generation_api/migration.sql` | **neuf**, écrit à la main |
| `prisma/schema.prisma` | `StudioEssai` (+5 colonnes, unique par modèle, relation parent), `StudioModeleFavori`, `StudioEchec`, relations inverses |
| `lib/studioModeles.ts` (+test) | **neuf**, pur, isomorphe : normalisation du catalogue, tarif, estimation, devis, seuil, libellés |
| `lib/studioCatalogue.ts` (+test) | **neuf**, `server-only` : lecture OpenRouter, cache 10 min, dernière bonne réponse |
| `lib/studioGeneration.ts` (+test) | **neuf**, `server-only` : requête image, lecture de réponse, erreurs typées, appel réseau |
| `lib/studioLancement.ts` (+test) | **neuf**, `server-only` : contrôle du lancement et orchestration d'une génération, dépendances injectées |
| `lib/studioBlob.ts` (+test) | extension `jpg|png|webp`, `lireImageEnBase64` rend aussi le type |
| `lib/studioFiche.ts` (+test) | `numeroSuivant` par modèle |
| `lib/studioStats.ts` (+test) | dimension par modèle, agrégats de coût, total dépensé, échecs |
| `lib/studioServeur.ts` | fiche et bilan lisent les nouvelles colonnes et les échecs |
| `app/api/studio/modeles/route.ts` | **neuf** : `GET` catalogue + favoris |
| `app/api/studio/modeles/favoris/route.ts` | **neuf** : `POST` / `DELETE` un favori |
| `app/api/studio/generations/route.ts` | **neuf** : `POST`, une génération, `maxDuration = 300` |
| `app/api/studio/essais/route.ts`, `essais/[id]/verifier/route.ts` | numéro par modèle (`manuel`), type réel de l'image |
| `app/studio/_components/SelecteurModeles.tsx` | **neuf** : catalogue, favoris, cases, devis, confirmation |
| `app/studio/_components/LigneAngle.tsx`, `CarteEssai.tsx`, `FicheColoris.tsx` | lancement, états par modèle, essais groupés par modèle, correction par régénération |
| `app/studio/bilan/page.tsx` | tableau par modèle, total dépensé |
| `lib/studioCloisonnement.test.ts` | sentinelles des fichiers neufs |

---

### Task 1 : Migration

**Files :** Create `prisma/migrations/20261019120000_studio_generation_api/migration.sql` ; Modify `prisma/schema.prisma`.

**Interfaces — Produces :**
- `StudioEssai` : `modele String @default("manuel")`, `coutEstimeUsd Float?`, `coutReelUsd Float?`, `lancementId String?`, `essaiParentId String?` (FK vers `StudioEssai.id`, `ON DELETE SET NULL`), `@@unique([colorisId, angleId, modele, numero])` à la place de `@@unique([colorisId, angleId, numero])`.
- `StudioModeleFavori { id, userId (FK User Cascade), modele String, createdAt, @@unique([userId, modele]) }`.
- `StudioEchec { id, userId (FK User Cascade), colorisId (FK StudioColoris Cascade), angleId (FK StudioAngle Restrict), modele String, code String, message String @db.Text, lancementId String?, coutReelUsd Float?, createdAt, @@index([userId]) }`.

- [ ] **Step 1 :** écrire le SQL : `ALTER TABLE "public"."StudioEssai" ADD COLUMN …` (`modele TEXT NOT NULL DEFAULT 'manuel'`, les deux `DOUBLE PRECISION`, deux `TEXT`), `DROP INDEX "public"."StudioEssai_colorisId_angleId_numero_key"`, `CREATE UNIQUE INDEX "StudioEssai_colorisId_angleId_modele_numero_key"`, FK `StudioEssai_essaiParentId_fkey`, deux `CREATE TABLE` avec index et FK nommés à la Prisma. Aucune instruction sur `Article` ni `UserSettings`.
- [ ] **Step 2 :** schéma Prisma aligné, relations inverses sur `User`, `StudioColoris`, `StudioAngle`, auto-relation `parent`/`corrections`.
- [ ] **Step 3 :** `npx prisma validate` puis `npx prisma migrate deploy` (endpoint vérifié avant). Attendu : `Applying migration 20261019120000_studio_generation_api`.
- [ ] **Step 4 :** `npx prisma generate` ; script ponctuel (scratchpad) qui lit `information_schema.columns` / `pg_indexes` : 5 colonnes neuves, l'ancien unique absent, le neuf présent, 2 tables, `photosPretes` / `geminiKey` / `anthropicKey` présentes. `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` ne doit signaler que les `DROP` connus des trois colonnes protégées.

### Task 2 : Estimateur et catalogue (parallélisable avec 3 et 4)

**Files :** Create `lib/studioModeles.ts`, `lib/studioModeles.test.ts`, `lib/studioCatalogue.ts`, `lib/studioCatalogue.test.ts`.

**Interfaces — Produces (`lib/studioModeles.ts`, isomorphe, aucun import serveur) :**
```ts
export const SEUIL_CONFIRMATION_USD = 0.1;
export const RATIO_STUDIO = "3:4";
export type Tarif =
  | { kind: "image"; sortieUsd: number; entreeParImageUsd: number }   // prix publiés par image
  | { kind: "jeton" }                                                  // seulement au jeton
  | { kind: "inconnu" };
export type ModeleImage = { id: string; nom: string; description: string; maxReferences: number; minReferences: number; ratios: string[] | null; tarif: Tarif };
export type Estimation = { modele: string; usd: number | null; raison: "image" | "jeton" | "inconnu" };
export type Devis = { lignes: Estimation[]; totalConnuUsd: number; inconnus: number; confirmationRequise: boolean };
export function normaliserModele(raw: unknown, tarif: Tarif): ModeleImage | null;   // null si sortie ≠ image OU entrée sans image OU input_references.max < 1
export function tarifDepuisEndpoints(raw: unknown): Tarif;
export function estimerEssai(m: Pick<ModeleImage, "id" | "tarif">, nbReferences: number): Estimation;
export function devisLancement(estimations: Estimation[]): Devis;
export function libelleTarif(t: Tarif): string;   // "0,018 $/image" | "tarif au jeton" | "tarif inconnu"
export function formatUsd(usd: number | null): string;   // null → "inconnu" ; 0.0184 → "0,018 $" ; 1.5 → "1,50 $"
```
Règles : `tarifDepuisEndpoints` lit `endpoints[].pricing[]` ; si **au moins un** `billable: "output_image"` existe et que **tous** sont en `unit: "image"`, `sortieUsd` = max des `cost_usd` (tous fournisseurs, toutes variantes) et `entreeParImageUsd` = max des `input_image` en `unit: "image"` (0 s'il n'y en a pas, `"jeton"` si une entrée est au jeton) ; si un `output_image` est au jeton ⇒ `jeton` ; sinon ou forme illisible ⇒ `inconnu`. `estimerEssai` = `sortieUsd + entreeParImageUsd × nbReferences`, arrondi à 1e-4. `confirmationRequise = inconnus > 0 || totalConnuUsd > SEUIL_CONFIRMATION_USD`.

**Interfaces — Produces (`lib/studioCatalogue.ts`, `import "server-only"`) :**
```ts
export type EtatCatalogue = { kind: "live" } | { kind: "stale"; fetchedAt: string } | { kind: "off" };
export type Catalogue = { modeles: ModeleImage[]; fetchedAt: string | null; etat: EtatCatalogue };
export async function getCatalogue(opts?: { fetchImpl?: typeof fetch; now?: () => number; refresh?: boolean }): Promise<Catalogue>;  // ne lève jamais
export async function trouverModele(id: string, opts?: Parameters<typeof getCatalogue>[0]): Promise<ModeleImage | null>;
export function viderCacheCatalogue(): void;   // tests
```
`GET https://openrouter.ai/api/v1/images/models` (sans clé, 8 s), puis `GET /images/models/{id}/endpoints` pour chaque modèle retenu, en parallèle (`Promise.allSettled`, 6 s chacun, un échec ⇒ `inconnu` pour ce modèle). Cache module 10 min ; liste vide ou erreur ⇒ dernière bonne réponse (`stale`), sinon `off` avec liste vide, et pas de mise en cache d'un résultat vide. Trié par nom.

- [ ] **Step 1 : tests `studioModeles.test.ts`** — fixtures recopiées du relevé du 19/10 (`qwen/qwen-image-2.1-turbo` : `output_image` image 0,0184 ×2 variantes, `input_image` image 0 ; `google/gemini-3-pro-image` : `output_image` au jeton) :
  - `tarifDepuisEndpoints(qwen)` → `{ kind: "image", sortieUsd: 0.0184, entreeParImageUsd: 0 }` ; `(gemini)` → `{ kind: "jeton" }` ; `({})`, `null`, `{endpoints: []}` → `{ kind: "inconnu" }` ; deux fournisseurs 0,02 et 0,03 → `sortieUsd: 0.03`.
  - `normaliserModele` : `recraft/recraft-v4.1-flash` (entrée texte seule) → `null` ; sortie sans `image` → `null` ; `qwen` → `maxReferences: 4`, `ratios` contient `"3:4"` ; sans `supported_parameters.aspect_ratio` → `ratios: null`.
  - `estimerEssai({tarif:{kind:"image",sortieUsd:0.02,entreeParImageUsd:0.001}}, 3).usd` → `0.023` ; jeton → `{usd:null, raison:"jeton"}`.
  - `devisLancement` : 0,05 + 0,05 → `confirmationRequise: false` (**0,10 pile ne confirme pas**) ; 0,05 + 0,0501 → `true` ; 0,01 + jeton → `true`, `inconnus: 1`, `totalConnuUsd: 0.01` ; liste vide → `false`, total 0.
  - `libelleTarif` et `formatUsd(null)` → `"inconnu"`.
- [ ] **Step 2 :** `npx vitest run lib/studioModeles.test.ts` → FAIL (module absent).
- [ ] **Step 3 :** implémenter `lib/studioModeles.ts`.
- [ ] **Step 4 : tests `studioCatalogue.test.ts`** avec `fetchImpl` factice (routeur sur l'URL) : liste filtrée et tarifée ; endpoints d'un modèle en 500 ⇒ ce modèle `inconnu`, les autres tarifés ; 2e appel dans les 10 min ⇒ aucun fetch ; `/images/models` en échec après un succès ⇒ `stale` avec l'ancienne liste ; échec à froid ⇒ `off`, `[]`, et l'appel suivant refait un fetch ; jamais d'exception (fetch qui lève).
- [ ] **Step 5 :** implémenter `lib/studioCatalogue.ts`, puis `npx vitest run lib/studioModeles.test.ts lib/studioCatalogue.test.ts` → PASS.

### Task 3 : Client de génération et Blob (parallélisable avec 2 et 4)

**Files :** Create `lib/studioGeneration.ts`, `lib/studioGeneration.test.ts` ; Modify `lib/studioBlob.ts`, `lib/studioBlob.test.ts`, `app/api/studio/essais/[id]/verifier/route.ts`.

**Interfaces — Produces (`lib/studioGeneration.ts`, `import "server-only"`) :**
```ts
export type GenerationErrorCode = "missing_key" | "bad_key" | "no_credits" | "securite" | "no_image" | "unreachable" | "incertain" | "unknown_model" | "parametres" | "provider" | "invalid_response";
export class StudioGenerationError extends Error { readonly code: GenerationErrorCode; readonly coutUsd: number | null; }
export type DemandeImage = { modele: string; prompt: string; references: string[] /* data URLs */; ratio: string | null };
export type ImageGeneree = { octets: Buffer; mime: "image/jpeg" | "image/png" | "image/webp"; coutUsd: number | null };
export function buildImagesRequest(d: DemandeImage): Record<string, unknown>;     // POST /images
export function buildChatRequest(d: DemandeImage): Record<string, unknown>;       // repli chat/completions
export function readImagesResponse(json: unknown): ImageGeneree;                  // lève StudioGenerationError
export function readChatResponse(json: unknown): ImageGeneree;
export function errorFromStatus(status: number, body: string, modele: string): StudioGenerationError;
export function decodeDataUrl(url: string): { octets: Buffer; mime: string } | null;
export async function cleDuCompte(userId: string): Promise<string>;              // lève missing_key si source ≠ "utilisateur"
export async function genererImage(d: DemandeImage, apiKey: string, fetchImpl?: typeof fetch): Promise<ImageGeneree>;
```
Formes (doc OpenRouter lue le 19/10) : `/images` ← `{ model, prompt, n: 1, aspect_ratio?, input_references: [{type:"image_url", image_url:{url}}] }` → `{ data: [{ b64_json, media_type }], usage: { cost } }`. Repli sur 404/405 : `chat/completions` ← `{ model, messages:[{role:"user", content:[{type:"text"},…image_url]}], modalities:["image","text"], image_config?: { aspect_ratio } }` → `choices[0].message.images[0].image_url.url` (data URL), `usage.cost`. Statuts : 401 → `bad_key` ; 402 → `no_credits` ; 403, ou 400/422 dont le corps parle de `safety|moderation|content policy|blocked|prohibited` → `securite` ; 404 → `unknown_model` ; autres 400/422 → `parametres` (message d'OpenRouter repris, tronqué à 300) ; 502/504 et timeout → `incertain` (« peut-être facturée, vérifie ton activité OpenRouter avant de relancer ») ; erreur réseau avant envoi (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`) → `unreachable` ; autre 5xx → `provider`. Une seule nouvelle tentative, et seulement sur 429/503 (jamais facturés). Timeout 280 s. Mime hors `jpeg|png|webp` → `invalid_response`. Ni clé ni corps de requête journalisés.

**Interfaces — Produces (`lib/studioBlob.ts`) :** `cheminImage(prefixe, userId, id?, ext: "jpg" | "png" | "webp" = "jpg")` ; `deposerImage(prefixe, userId, corps, id?, mime: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg")` ; `lireImageEnBase64(...)` rend `{ data: string; mimeType: string } | null` ; `FICHIER_RE` accepte les trois extensions. `erreurFichier` (dépôts manuels) reste JPEG seul.

- [ ] **Step 1 : tests `studioGeneration.test.ts`** : `buildImagesRequest` avec `ratio: "3:4"` → `aspect_ratio: "3:4"`, avec `ratio: null` → pas de clé ; `input_references` dans l'ordre ; `readImagesResponse` avec `b64_json` + `media_type: "image/png"` + `usage.cost: 0.0184` → `octets` décodés, `mime: "image/png"`, `coutUsd: 0.0184` ; sans `usage` → `coutUsd: null` (**jamais 0**) ; `data: []` → `no_image` ; `readChatResponse` avec data URL jpeg → décodé ; avec `content: "I can't create images of trademarked logos"` et sans `images` → code `no_image`, message contenant le début du texte ; `errorFromStatus` : 402, 401, 403, 400 + `"content policy"`, 400 + `"invalid aspect_ratio"`, 404, 502, 500 → les codes ci-dessus ; `genererImage` avec `fetchImpl` qui répond 404 sur `/images` puis 200 sur chat → résultat du chat ; 503 puis 200 → succès en 2 appels ; 502 → `incertain` sans 2e appel ; la clé n'apparaît dans aucun `console.error` (espion sur `console.error`).
- [ ] **Step 2 :** FAIL, puis implémenter, puis PASS (`npx vitest run lib/studioGeneration.test.ts`).
- [ ] **Step 3 : Blob** — tests ajoutés : `cheminImage("generees", uid, uuid, "png")` finit par `.png` ; `urlAppartientA` accepte `.png`/`.webp`, refuse `.gif` et `.jpg.png`. Puis implémentation, puis `npx vitest run lib/studioBlob.test.ts` → PASS.
- [ ] **Step 4 :** `essais/[id]/verifier` passe le `mimeType` lu (plus de `"image/jpeg"` en dur) ; `npm run typecheck` → 0 erreur.

### Task 4 : Statistiques par modèle et numérotation (parallélisable avec 2 et 3)

**Files :** Modify `lib/studioStats.ts`, `lib/studioStats.test.ts`, `lib/studioFiche.ts`, `lib/studioFiche.test.ts`.

**Interfaces — Produces :**
- `StudioEssaiStat` gagne `modele?: string` (absent ⇒ `"manuel"`) et `coutReelUsd?: number | null`. Les paires de `averageTries` deviennent (coloris, angle, **modèle**) partout. Les tests existants restent verts sans modification de leurs données.
- `export type EchecStat = { modele: string; code: string; coutReelUsd: number | null }`.
- `export type ModelStat = GroupStat & { essais: number; validated: number; coutConnus: number; coutTotalUsd: number; coutMoyenUsd: number | null; coutParValideeUsd: number | null; coutIncomplet: boolean; scoreMoyen: number | null; echecs: number; blocagesSecurite: number }`.
- `export type Depense = { totalUsd: number; essaisSansCout: number }` — somme des `coutReelUsd` connus des essais **et** des échecs.
- `computeStudioStats(essais, echecs: EchecStat[] = [])` ajoute `byModel: ModelStat[]` (ordre par id) et `depense: Depense`.
- `numeroSuivant(essais: readonly { numero: number; modele?: string }[], modele = "manuel")` : ne compte que les essais de ce modèle (absent ⇒ `"manuel"`).

Règles : `coutMoyenUsd` = moyenne des coûts **connus** (null si aucun) ; `coutParValideeUsd` = `coutTotalUsd / validated` (null si 0 validé) ; `coutIncomplet` = au moins un essai `api` du modèle sans coût ; un coût null n'est jamais compté zéro ; `scoreMoyen` via `scoreVerif` ; `blocagesSecurite` = échecs de code `"securite"`.

- [ ] **Step 1 : tests** : deux modèles A et B lancés ensemble sur la même paire, chacun n° 1 validé ⇒ `byModel` A et B à `rate: 1`, `global.averageTries: 1` (et non 2) ; A : coûts 0,02 / null / 0,04, 1 validé ⇒ `coutMoyenUsd: 0.03`, `coutParValideeUsd: 0.06`, `coutIncomplet: true`, `coutConnus: 2` ; essai sans `modele` ⇒ ligne `"manuel"` ; échecs `[{modele:"A",code:"securite",coutReelUsd:null},{modele:"A",code:"no_image",coutReelUsd:0.01}]` ⇒ `echecs: 2`, `blocagesSecurite: 1`, et `depense.totalUsd` inclut 0,01 ; un modèle qui n'a que des échecs a quand même sa ligne. `numeroSuivant([{numero:1,modele:"A"},{numero:3}], "A")` → 2 ; `(…, "manuel")` → 4 ; `([{numero:2}])` → 3.
- [ ] **Step 2 :** FAIL, implémenter, `npx vitest run lib/studioStats.test.ts lib/studioFiche.test.ts` → PASS.

### Task 5 : Orchestration et routes (après 1 à 4)

**Files :** Create `lib/studioLancement.ts`, `lib/studioLancement.test.ts`, `app/api/studio/generations/route.ts`, `app/api/studio/modeles/route.ts`, `app/api/studio/modeles/favoris/route.ts` ; Modify `app/api/studio/essais/route.ts`, `lib/studioServeur.ts`, `lib/studioCloisonnement.test.ts`.

**Interfaces — Produces (`lib/studioLancement.ts`) :**
```ts
export const MAX_MODELES_PAR_LANCEMENT = 6;
export type CorpsGeneration = { cle: string; angleId: string; modele: string; modeles: string[]; lancementId: string; confirme: boolean; essaiParentId?: string | null; detailsCorrection?: string[] };
export function lireCorpsGeneration(body: unknown): CorpsGeneration | { erreur: string };   // uuid, 1..6 modèles distincts, modele ∈ modeles
export function controlerLancement(p: { modeles: (ModeleImage | null)[]; nbReferences: number; confirme: boolean }):
  | { ok: true; devis: Devis }
  | { ok: false; status: 400 | 409; code: "modele_inconnu" | "confirmation_requise" | "sans_reference"; devis?: Devis };
export function referencesAEnvoyer(refs: string[], maxReferences: number, avecImageRatee: boolean): { envoyees: string[]; tronquees: number };
export function promptDeCorrection(promptBase: string, details: string[]): string | null;  // compilerCorrection + phrase « la 1re image est l'essai précédent »
export type DepsGeneration = {
  chargerContexte(userId: string, c: CorpsGeneration): Promise<ContexteGeneration | null>;
  catalogue(id: string): Promise<ModeleImage | null>;
  cle(userId: string): Promise<string>;
  generer(d: DemandeImage, apiKey: string): Promise<ImageGeneree>;
  deposer(userId: string, img: ImageGeneree): Promise<string>;
  creerEssai(data: NouvelEssai): Promise<{ id: string; numero: number }>;
  rejeterParent(essaiId: string): Promise<void>;
  creerEchec(data: NouvelEchec): Promise<void>;
};
export async function executerGeneration(deps: DepsGeneration, userId: string, c: CorpsGeneration):
  Promise<{ status: number; body: Record<string, unknown> }>;
```
`ContexteGeneration` = `{ colorisId, angleId, details, angleTexte, references: string[] /* data URLs, déjà choisies par referencesPourAngle */, parent: { id, modele, image: string /* data URL */ } | null }` ; `NouvelEssai` = colonnes de `StudioEssai` (source `"api"`) ; `NouvelEchec` = colonnes de `StudioEchec`.

Ordre de `executerGeneration` : contexte (null ⇒ 404) → modèles du catalogue pour **toute** la liste → `controlerLancement` (refus ⇒ réponse sans **aucun** appel à `cle`, `generer` ni `deposer`) → parent : même modèle exigé, `promptDeCorrection` non null exigé, `rejeterParent` → `cle` (`missing_key` ⇒ 400 code `missing_key`) → `generer` → `deposer` → `creerEssai` avec `coutEstimeUsd` = estimation de CE modèle, `coutReelUsd` = `img.coutUsd`. `StudioGenerationError` ⇒ `creerEchec` puis `{ status: 502 (400 pour missing_key/bad_key/no_credits/parametres/securite), body: { error, code } }`. Réponse de succès : `{ essai: { id, numero, modele, coutEstimeUsd, coutReelUsd }, referencesEnvoyees, referencesTronquees }`, **sans image**.

**Routes :**
- `POST /api/studio/generations` (`runtime = "nodejs"`, `maxDuration = 300`) : `getUserId`, `lireCorpsGeneration`, câble les vraies dépendances (Prisma scopé par userId ; numéro par `numeroSuivant(…, modele)` avec une nouvelle tentative sur P2002 ; `deposerImage("generees", userId, img.octets, undefined, img.mime)` ; `lireImageEnBase64` → data URL).
- `GET /api/studio/modeles` → `{ modeles, favoris: string[], etat, fetchedAt }`.
- `POST /api/studio/modeles/favoris` `{ modele }` (doit exister au catalogue, sinon 400) → upsert ; `DELETE` même corps → `deleteMany` scopé.
- `POST /api/studio/essais` (dépôt manuel) : `numeroSuivant(existants, "manuel")`, existants filtrés `modele: "manuel"`.
- `chargerFiche` : essais avec `modele`, `coutEstimeUsd`, `coutReelUsd`, `lancementId`, `essaiParentId`, plus `references` complètes. `chargerBilan` : essais avec `modele`, `coutReelUsd`, et `echecs` (`modele`, `code`, `coutReelUsd`).

- [ ] **Step 1 : tests `studioLancement.test.ts`** (deps factices qui enregistrent leurs appels) : 2 modèles au jeton, `confirme: false` ⇒ 409 `confirmation_requise`, `generer` jamais appelé ; même chose avec `confirme: true` ⇒ 200, `generer` appelé une fois avec le bon modèle ; 0,06 + 0,05 sans confirmation ⇒ 409 ; 0,05 + 0,05 ⇒ 200 sans confirmation ; modèle hors catalogue dans `modeles` ⇒ 400 `modele_inconnu` ; `generer` lève `securite` ⇒ `creerEchec` appelé avec `code: "securite"`, `creerEssai` jamais ; `cle` lève `missing_key` ⇒ 400 code `missing_key` ; coût réel null ⇒ `creerEssai` reçoit `coutReelUsd: null` ; correction : `generer` reçoit l'image ratée en 1re référence, `rejeterParent` appelé, modèle différent du parent ⇒ 400 ; `referencesAEnvoyer(5 refs, 4, true)` → 3 envoyées, 2 tronquées ; `lireCorpsGeneration` refuse `modele ∉ modeles`, 7 modèles, doublons, lancementId non uuid.
- [ ] **Step 2 :** FAIL, implémenter `lib/studioLancement.ts`, PASS.
- [ ] **Step 3 :** les trois routes, `essais/route.ts`, `studioServeur.ts` ; `npm run typecheck` → 0.
- [ ] **Step 4 : cloisonnement** — sentinelles ajoutées : `lib/studioModeles.ts`, `lib/studioCatalogue.ts`, `lib/studioGeneration.ts`, `lib/studioLancement.ts`, `app/api/studio/generations/route.ts`, `app/api/studio/modeles/route.ts`. `npx vitest run lib/studioCloisonnement.test.ts` → PASS. **Injection de faute** (puis retour arrière) : `import "@/app/mise-en-vente/_publierVinted"` dans `lib/studioGeneration.ts`, et `prisma.article.update(` dans `app/api/studio/generations/route.ts` ⇒ 2 échecs attendus, sortie collée.

### Task 6 : Écran de la ligne d'angle (après 5)

**Files :** Create `app/studio/_components/SelecteurModeles.tsx` ; Modify `LigneAngle.tsx`, `CarteEssai.tsx`, `FicheColoris.tsx`.

**Interfaces — Consumes :** `GET /api/studio/modeles`, `POST|DELETE /api/studio/modeles/favoris`, `POST /api/studio/generations`, `estimerEssai`, `devisLancement`, `libelleTarif`, `formatUsd`, `referencesPourAngle`.

- `FicheColoris` charge le catalogue **une fois** (`fetch` au montage) et le passe à chaque `LigneAngle` ; le texte d'en-tête dit les deux voies (génération par API, ou dépôt d'une image faite dans Gemini).
- `SelecteurModeles` : favoris en tête (étoile cliquable), puis le reste repliable avec un champ de filtre ; chaque ligne : case, nom, `libelleTarif`, « jusqu'à N réf. » ; le devis sous la liste (`formatUsd(total)` + « N tarif(s) inconnu(s) ») ; bouton « Générer (N) ». Si `confirmationRequise`, le bouton ouvre un encadré « Ce lancement est estimé à X (plus N tarif inconnu) : confirmer ? » avec « Confirmer et générer » / « Annuler ».
- `LigneAngle.lancer` : `lancementId = crypto.randomUUID()`, une requête par modèle en parallèle, état par modèle (`en cours…`, `fait · coût`, `erreur : message`) ; `missing_key`/`bad_key`/`no_credits` ⇒ lien « Mon compte » ; `incertain` affiché tel quel ; à chaque succès : `verifier(id)` puis `router.refresh()`. Si le serveur répond 409 `confirmation_requise` (devis serveur différent de l'écran), rouvrir l'encadré de confirmation avec le devis du serveur.
- Essais groupés par modèle : une colonne par modèle (titre = nom du modèle ou « Dépôt manuel », coût total de la colonne), côte à côte, défilement horizontal au-delà de 3.
- `CarteEssai` : badge modèle + `formatUsd(coutReelUsd)` (« estimé X » quand le réel manque) ; pour un essai `api`, « Corriger un détail » propose « Régénérer avec <modèle> » qui appelle `POST /api/studio/generations` avec `essaiParentId`, `detailsCorrection`, `modeles: [modele]` (le seuil s'applique aussi) ; pour un essai manuel, le prompt à copier existant reste.

- [ ] **Step 1 :** implémenter ; `npm run typecheck` et `npx eslint app/studio` → 0.
- [ ] **Step 2 :** au navigateur intégré (dev, compte de test) : catalogue visible avec prix, favori qui survit au rechargement, devis qui bouge en cochant, encadré de confirmation sur un modèle au jeton. Pas d'appel payant à cette étape (annuler la confirmation).

### Task 7 : Bilan par modèle (après 4 et 5 ; parallélisable avec 6)

**Files :** Modify `app/studio/bilan/page.tsx`.

- [ ] **Step 1 :** chiffre « TOTAL DÉPENSÉ » (`formatUsd(depense.totalUsd)`, sous-titre « N essai(s) sans coût connu » quand > 0) ; tableau « Par modèle » : modèle, 1er essai (taux et n/n), essais moy., coût moyen, coût par image validée (suffixe « ≥ » quand `coutIncomplet`), score IA moyen, échecs (dont sécurité). Trié par coût par image validée croissant, les `null` à la fin.
- [ ] **Step 2 :** `npm run typecheck` ; au navigateur : le tableau s'affiche sur les données de dev.

### Task 8 : Parcours réel, vérifications, documentation (après tout)

- [ ] **Step 1 :** annoncer à Aramis les 2-3 modèles choisis (les moins chers à prix publié) et le coût estimé ; **un seul appel payant par modèle**. Lancement, essais côte à côte avec coût réel, vérification IA, correction sur un modèle, bilan par modèle.
- [ ] **Step 2 :** `npm test`, `npm run typecheck`, `npm run lint` : sorties collées dans la passation.
- [ ] **Step 3 :** `CLAUDE.md` (section Studio IA : la génération passe aussi par l'API, nouvelles routes, tables, seuil, clé du compte uniquement), `TODOS.md` (option B faite ; différés), `HANDOFF.md` remplacé selon `AGENTS.md` (l'actuel archivé en `docs/handoffs/2026-10-18-studio-ia-moitie-back.md`), rapport `report.py` collé.
