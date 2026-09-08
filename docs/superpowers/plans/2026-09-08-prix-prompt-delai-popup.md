# Le prix dans le prompt, le délai dans un pop-up — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le prix de référence quitte sa table pour rejoindre le prompt qui le concerne, et la fourchette de délai anti-ban quitte `/compte` pour un pop-up ouvert au lancement d'un lot — supprimant au passage la seule donnée que l'extension allait lire dans le DOM.

**Architecture:** Une seule migration Prisma porte l'état final : `PromptTemplate.prixReference` apparaît, la table `PrixReference` et les deux colonnes `delaiVinted*` disparaissent. Côté résolution, `pickPrix` fusionne dans `pickPrompt` — les deux étaient la même cascade dupliquée. Côté délai, la valeur choisie dans le pop-up voyage dans la charge utile du `CustomEvent`, est stockée **sur chaque entrée de file**, et l'ordonnanceur pur de `file.js` décide si l'entrée part tout de suite ou attend son tirage.

**Tech Stack:** Next.js 15 / React 18 / TypeScript, Prisma 6 sur PostgreSQL (Neon), Vitest (environnement `node`), extension Firefox MV3 en JavaScript ES2022 sans bundler.

**Spec:** `docs/superpowers/specs/2026-09-08-prix-prompt-delai-popup-design.md`

---

## Global Constraints

- **Branche de travail** : `worktree-extension-vinted`, worktree monté sur `.claude/worktrees/extension-vinted/`. **Jamais `main`**, jamais le dépôt principal.
- **UNE SEULE migration**, `20260908120000_prix_dans_prompt_delai_par_lot`, qui porte l'état final. Les deux migrations en attente (`20260818000000_add_prix_reference`, `20260818200000_add_delai_vinted`) sont **appliquées sur dev** : les réécrire ferait diverger leur somme de contrôle. On ne les touche pas.
- **La migration est ÉCRITE À LA MAIN.** Ne jamais lancer `prisma migrate dev` ni `prisma db push` : les deux produisent un `DROP COLUMN "photosPretes"` sur la table `Article`, colonne qu'Aramis a explicitement demandé de conserver (24/07/2026, cf. `CLAUDE.md`). L'application se fait par `npx prisma migrate deploy`, qui rejoue les fichiers sans rien diffuser depuis le schéma.
- **La migration DÉTRUIT la table `PrixReference`, qui est peuplée sur dev.** Rien ne part avant que la Tâche 1 en ait relevé le contenu dans un fichier versionné.
- **Base visée : dev**, endpoint `ep-autumn-morning-asmqan0o`. Vérifier avant toute écriture — `npx prisma migrate status` affiche l'endpoint en clair. `.env` (gitignoré) fait autorité, pas `.env.local`.
- **Catégorie Vinted : `246`**, « Sacs à dos » sous **Hommes > Accessoires > Sacs et sacoches**. Jamais `157` (Femmes). `lib/vintedMapping.ts` fait foi, et un test garde la valeur. Aucune tâche de ce plan ne touche à cette table.
- **Les sélecteurs Vinted ne s'inventent jamais.** Ils viennent des trois relevés réels de `docs/audits/`. Aucune tâche de ce plan n'en ajoute ni n'en modifie.
- **Délai en minutes entières.** Les secondes ont été écartées explicitement le 08/09.
- **Le premier article d'un lot part tout de suite.** Le délai ne joue qu'entre les annonces.
- **Valeur par défaut du pop-up au premier lancement : fourchette 2 à 5 minutes.** Le dernier réglage est retenu dans le `localStorage` du navigateur, jamais en base.
- **Vérification** : `npx tsc --noEmit` et `npx vitest run` depuis la racine du worktree ; `npx web-ext lint --self-hosted` depuis `extension-vinted/` (0 erreur, 2 avertissements de baseline documentés dans `extension-vinted/README.md`). **Jamais `npm run build`** — il corrompt `.next` si un `npm run dev` tourne.
- **Rien de ce chantier n'aura tourné dans un navigateur à la fin de ce plan.** `tsc` et `vitest` ne disent rien du rendu React ni du DOM Vinted. Ne jamais écrire « vérifié » sur leur seule foi.
- **Langue** : code, noms de variables et messages de commit en anglais ; commentaires et libellés d'interface en français, comme tout le dépôt.

---

## Écarts assumés avec la spec

Trois points de la spec ne tiennent pas à la lecture du code. Ils sont tranchés ici, une fois, pour ne pas être re-débattus en cours d'exécution.

### 1. `lib/promptSelect.test.ts` n'existe pas

**La spec §4.4 affirme** : « Les tests de `lib/pickPrix.test.ts` qui portent sur la cascade sont déjà couverts par ceux de `pickPrompt` : ils ne sont pas à reporter, seulement à supprimer avec le fichier. »

**C'est faux.** `find lib -name "*.test.ts"` ne remonte aucun `promptSelect.test.ts`, et aucun fichier de test du dépôt n'importe `pickPrompt`. `lib/pickPrix.test.ts` est aujourd'hui le **seul** test de cette cascade. Le supprimer sans rien écrire ferait perdre les six cas — et ce serait la fonction survivante, celle qui reste en production, qui se retrouverait à découvert.

**Décision** : la Tâche 2 crée `lib/promptSelect.test.ts` avec les six cas portés depuis `pickPrix.test.ts`, **avant** de supprimer ce dernier.

### 2. Le critère du « premier article » de la spec §5.4 laisse passer tous les suivants

**La spec §5.4 propose** : « la file ne contient aucune entrée "en-cours", et aucune entrée n'a encore de `cibleMs`. C'est vrai exactement au premier passage d'un lot. »

**Ce n'est pas vrai exactement au premier passage.** Une entrée qui réussit est **supprimée** de la base (`await deleteEntry(entree.entryId)` dans le `browser.tabs.onUpdated` de `background.js`), et son onglet fermé. Juste après le premier succès, la file contient donc les articles 2..N — aucun « en-cours », aucun `cibleMs` — et le critère redevient vrai. L'article 2 partirait immédiatement, puis le 3, puis le 4 : **le garde-fou anti-ban serait annulé pour tout le lot sauf pour rien**, en silence, et c'est précisément le mode de panne que ce chantier existe pour supprimer.

**Décision** : le drapeau est posé **à la mise en file**, pas à la planification. Au moment où `background.js` reçoit `myflip:mise-en-file`, si la file est vide (après purge des échecs), la nouvelle entrée reçoit `premier: true`. `prochaineAction` se contente de le relire. L'intention de la spec est tenue à la lettre — le tout premier article d'un lot ne patiente pas — et les suivants attendent leur tirage, y compris quand un article isolé rejoint une file déjà en cours (spec §5.1).

Fonction pure, dans `file.js`, testée : la spec demandait que cette logique y vive, et elle y vit.

### 3. Une entrée sans délai ne doit pas ouvrir un onglet tout de suite

**La spec §5.5 demande** de retirer « la branche qui refuse de planifier sans fourchette réglée ». Retirée telle quelle, une entrée dont le `delai` serait absent ou abîmé (entrée déjà en base avant la mise à jour de l'extension, charge utile qui n'a pas traversé la frontière Xray) tomberait sur `tirerDelaiMs(undefined, undefined, …)` → `NaN` → `cibleMs = NaN` → `NaN > maintenant` est `false` → **ouverture immédiate**, sans le moindre message.

**Décision** : la branche disparaît bien, mais `delaiDeLEntree(entree)` — pure, dans `file.js`, testée — rend la fourchette de l'entrée si elle est exploitable, et un repli **2–5 minutes** sinon, avec un avertissement en console. On n'invente jamais un délai de zéro ; on invente un délai prudent.

---

## Structure des fichiers

**Créés**

| Fichier | Responsabilité |
|---|---|
| `scripts/exporter-prix-reference.ts` | Script ponctuel : relève les `PrixReference` de dev dans un fichier versionné avant que la migration ne détruise la table. Ne décide rien, n'écrit rien en base. |
| `docs/audits/2026-09-08-prix-reference-avant-migration.md` | Sortie du script ci-dessus. C'est la seule trace des prix après la migration ; Aramis les ressaisit à partir de là. |
| `prisma/migrations/20260908120000_prix_dans_prompt_delai_par_lot/migration.sql` | La migration unique. Écrite à la main. Destructive. |
| `lib/promptSelect.test.ts` | La cascade de `pickPrompt` (six cas portés depuis `pickPrix.test.ts`), le `prixReference` du prompt résolu, et `prixReferenceDepuisSaisie()`. |
| `app/mise-en-vente/_delaiVinted.ts` | Le délai en fonctions PURES : type, valeur par défaut, normalisation d'une valeur relue du `localStorage`, validation d'une saisie. Plus deux enveloppes minces de stockage. |
| `app/mise-en-vente/_delaiVinted.test.ts` | Normalisation et validation. Les enveloppes `localStorage` ne sont pas testées — elles n'ont pas de logique (même règle que `_persistance.ts`). |
| `app/mise-en-vente/_components/DialogueDelaiVinted.tsx` | Le pop-up. Aucune logique : il branche `_delaiVinted.ts` sur `components/Modal.tsx`. Non testé (React). |

**Modifiés**

| Fichier | Changement |
|---|---|
| `prisma/schema.prisma` | `PromptTemplate.prixReference Float?` ; modèle `PrixReference` supprimé ; relation `User.prixReferences` supprimée ; colonnes `UserSettings.delaiVinted*` supprimées. |
| `lib/types.ts` | `PromptTemplateDTO.prixReference` ; `PrixReferenceDTO` supprimé ; les deux champs de délai de `UserSettingsDTO` supprimés. |
| `lib/promptsServer.ts` | `toPromptDTO()` porte `prixReference`. |
| `lib/promptSelect.ts` | `prixReferenceDepuisSaisie()`, la seule logique nouvelle du versant prix. |
| `lib/hooks.ts` | `PromptInput.prixReference` ; les quatre hooks de prix et `useSetDelaiVinted` supprimés. |
| `app/api/prompts/route.ts`, `app/api/prompts/[id]/route.ts` | Acceptent et valident `prixReference`. |
| `app/api/user/settings/route.ts` | Le bloc de validation du délai et les deux champs disparaissent. |
| `app/parametres/page.tsx` | Le formulaire de prompt gagne « Prix de référence (€) » ; le bloc « Prix de référence » et sa modale disparaissent. |
| `app/compte/page.tsx` | La section « Extension Vinted » disparaît. |
| `app/mise-en-vente/_components/FicheArticle.tsx` | Le pré-remplissage du prix lit le prompt retenu, plus la liste de prix. |
| `app/mise-en-vente/_publierVinted.ts` + test | `DetailPublicationVinted.delai` ; `publierVinted()` passe à 4 arguments. |
| `app/mise-en-vente/page.tsx` | Le pop-up s'ouvre avant toute publication ; le délai confirmé descend jusqu'à l'événement. |
| `extension-vinted/file.js` + test | `prochaineAction` rend `immediat` ; `estPremiereEntree()` et `delaiDeLEntree()` ajoutées. |
| `extension-vinted/background.js` | `lireDelaiRegle()` supprimée ; le délai vient de l'entrée ; le premier article ne patiente pas. |
| `extension-vinted/content-myflip.js` | Transmet `delai` ; toute la synchronisation depuis le DOM de `/compte` disparaît. |
| `extension-vinted/manifest.json` | La permission `storage` disparaît avec son dernier usage. |
| `extension-vinted/README.md` | La section « Le délai doit être réglé » décrit un mode de panne qui n'existe plus. |
| `TODOS.md` | Le chantier cadré sort de la liste ; les deux reports différés y restent. |

**Supprimés**

| Fichier | Pourquoi |
|---|---|
| `lib/pickPrix.ts` | Duplication littérale de `pickPrompt()` — même `norm()`, même ordre. |
| `lib/pickPrix.test.ts` | Ses six cas sont portés dans `lib/promptSelect.test.ts` **avant** la suppression. |
| `lib/prixServer.ts` | N'existait que pour `toPrixDTO()`. |
| `app/api/prix/route.ts`, `app/api/prix/[id]/route.ts` | Les deux routes du modèle disparu. |
| `components/compte/ExtensionVinted.tsx` | Le réglage de délai n'est plus un réglage de compte. |

---

## Task 1: Sauvegarder les prix de dev avant de détruire la table

**Files:**
- Create: `scripts/exporter-prix-reference.ts`
- Create (généré) : `docs/audits/2026-09-08-prix-reference-avant-migration.md`

**Interfaces:**
- Consomme : `prisma.prixReference` (dernière tâche où ce modèle existe), `loadEnvConfig` de `@next/env`.
- Produit : un fichier Markdown versionné. Aucune API consommée par les tâches suivantes.

⚠️ **Pas de test pour cette tâche, et c'est délibéré** : le script n'a aucune logique — une requête, un formatage, une écriture. Le vérifier revient à le lancer et à lire sa sortie, ce que fait l'étape 4. Le seul risque réel est de le lancer sur la mauvaise base : c'est l'objet de l'étape 1.

- [ ] **Step 1: Vérifier sur quelle base on travaille**

Run: `npx prisma migrate status`

Expected : la sortie nomme l'endpoint. Attendu **`ep-autumn-morning-asmqan0o`** (dev), `11 migrations found`, `Database schema is up to date!`.

⚠️ Si l'endpoint est `ep-curly-haze-asq0mlqt`, c'est la **production** : s'arrêter immédiatement et prévenir Aramis. Rien de ce plan ne s'applique en production sans son geste explicite.

- [ ] **Step 2: Écrire le script**

Créer `scripts/exporter-prix-reference.ts` :

```ts
// Relève les prix de référence AVANT la migration qui détruit leur table.
//
// Le report vers les prompts est MANUEL (cf. spec §7) : plusieurs prompts
// peuvent correspondre à un même prix, et deviner lequel choisir serait pire
// que de ne rien faire. Ce script ne décide donc rien — il imprime, pour
// qu'Aramis ressaisisse les prix dans /parametres après la migration.
//
// Lecture seule. N'écrit rien en base.
//
//   npx tsx scripts/exporter-prix-reference.ts
import { writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

// Sans ce chargement, DATABASE_URL n'est pas lue : `.env` n'est pas injecté
// automatiquement hors du runtime Next (même parti que migrer-trello-env.ts).
loadEnvConfig(process.cwd());

const prisma = new PrismaClient();
const SORTIE = "docs/audits/2026-09-08-prix-reference-avant-migration.md";

async function main() {
  const refs = await prisma.prixReference.findMany({
    orderBy: [{ estDefaut: "desc" }, { marque: "asc" }, { categorie: "asc" }],
    include: { user: { select: { email: true } } },
  });

  const doc = [
    "# Prix de référence, relevés avant leur suppression",
    "",
    "Généré par `scripts/exporter-prix-reference.ts` le 2026-09-08 sur la base",
    "**dev**, juste avant la migration `20260908120000_prix_dans_prompt_delai_par_lot`,",
    "qui détruit la table `PrixReference`.",
    "",
    "Le report vers `PromptTemplate.prixReference` est **manuel** : plusieurs",
    "prompts peuvent correspondre à un même prix, la migration ne peut pas",
    "choisir. Cette page est la seule trace qui reste de ces valeurs.",
    "",
    `${refs.length} ligne(s).`,
    "",
    "| Compte | Marque | Catégorie | Prix (€) | Défaut |",
    "|---|---|---|---|---|",
    ...refs.map(
      (r) =>
        `| ${r.user.email} | ${r.marque ?? "*toutes*"} | ${r.categorie ?? "*toutes*"} | ${r.prix} | ${r.estDefaut ? "oui" : "non"} |`,
    ),
    "",
  ].join("\n");

  writeFileSync(SORTIE, doc, "utf8");
  console.log(doc);
  console.log(`\n→ écrit dans ${SORTIE}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Lancer le script**

Run: `npx tsx scripts/exporter-prix-reference.ts`

Expected : le tableau Markdown s'affiche, suivi de `→ écrit dans docs/audits/…`. Zéro ligne est un résultat valide (la table peut être vide) — le noter tel quel, ne pas conclure à une panne.

- [ ] **Step 4: Relire ce qui a été écrit**

Run: `cat docs/audits/2026-09-08-prix-reference-avant-migration.md`

Expected : le compte de lignes annoncé correspond au nombre de lignes du tableau. Si les deux divergent, s'arrêter : le fichier est la seule sauvegarde.

- [ ] **Step 6: Commit**

```bash
git add scripts/exporter-prix-reference.ts docs/audits/2026-09-08-prix-reference-avant-migration.md
git commit -m "chore: dump reference prices before the migration drops them"
```

- [ ] **Step 6: Signaler le relevé, sans s'arrêter**

Dire, en une phrase : les prix relevés sont dans `docs/audits/2026-09-08-prix-reference-avant-migration.md`, et la tâche suivante détruit la table.

⚠️ **Ce n'est pas un point d'arrêt.** Aramis a demandé le 08/09/2026 à n'intervenir qu'une seule fois, à la fin, quand tout sera en place dans MyFlip. Le fichier généré à l'étape 3 est la sauvegarde ; elle suffit pour continuer sans lui. La ressaisie est regroupée dans la section « Ce que ce plan ne couvre pas ».

---

## Task 2: La base prend sa forme finale

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260908120000_prix_dans_prompt_delai_par_lot/migration.sql`
- Create: `lib/promptSelect.test.ts`
- Modify: `lib/types.ts`, `lib/promptsServer.ts`, `lib/hooks.ts`
- Modify: `app/api/user/settings/route.ts`, `app/compte/page.tsx`, `app/parametres/page.tsx`
- Modify: `app/mise-en-vente/_components/FicheArticle.tsx`
- Delete: `lib/pickPrix.ts`, `lib/pickPrix.test.ts`, `lib/prixServer.ts`, `app/api/prix/route.ts`, `app/api/prix/[id]/route.ts`, `components/compte/ExtensionVinted.tsx`

⚠️ **Cette tâche est grosse, et elle ne se découpe pas.** La migration retire trois choses de la base d'un coup ; tout ce qui les référence casse `tsc` au même instant. Un découpage plus fin laisserait soit la compilation rouge entre deux tâches, soit l'application vivante avec des routes qui répondent 404 en silence — le pré-remplissage du prix cesserait alors de fonctionner sans erreur visible. La seule frontière propre est celle-ci. Ce qui n'est **pas** forcé (le champ de saisie du prix dans le formulaire de prompt) est sorti en Tâche 3.

**Interfaces:**
- Consomme : `PromptTemplateDTO` (`lib/types.ts`), `pickPrompt()` (`lib/promptSelect.ts`), la prop `prompts: PromptTemplateDTO[]` que `FicheArticle` reçoit déjà de `page.tsx`.
- Produit : `PromptTemplateDTO.prixReference: number | null`, lu par la Tâche 3.
- Disparaît : `PrixReferenceDTO`, `pickPrix()`, `toPrixDTO()`, `usePrixReferences()`, `useCreatePrix()`, `useUpdatePrix()`, `useDeletePrix()`, `useSetDelaiVinted()`, `UserSettingsDTO.delaiVintedMinMinutes`, `UserSettingsDTO.delaiVintedMaxMinutes`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/promptSelect.test.ts`. Les six premiers cas sont ceux de `lib/pickPrix.test.ts`, portés sur `pickPrompt` — c'est la même cascade, et elle perdrait toute couverture sans ce report (cf. « Écarts assumés », point 1). Les deux derniers couvrent le champ neuf.

```ts
import { describe, expect, it } from "vitest";
import { pickPrompt } from "./promptSelect";
import type { PromptTemplateDTO } from "./types";

function tmpl(p: Partial<PromptTemplateDTO>): PromptTemplateDTO {
  return {
    id: "id",
    nom: "Prompt",
    marque: null,
    categorie: null,
    contenu: "Rédige une annonce.",
    estDefaut: false,
    prixReference: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...p,
  };
}

describe("pickPrompt — la cascade", () => {
  it("choisit la correspondance exacte marque + catégorie", () => {
    const prompts = [
      tmpl({ id: "a", marque: "Tommy Hilfiger", categorie: "Pull" }),
      tmpl({ id: "b", marque: "Tommy Hilfiger", categorie: null }),
      tmpl({ id: "c", estDefaut: true }),
    ];
    expect(pickPrompt(prompts, "Tommy Hilfiger", "Pull")?.id).toBe("a");
  });

  it("retombe sur la marque seule si pas de correspondance catégorie", () => {
    const prompts = [
      tmpl({ id: "a", marque: "Ralph Lauren", categorie: null }),
      tmpl({ id: "b", estDefaut: true }),
    ];
    expect(pickPrompt(prompts, "Ralph Lauren", "Short")?.id).toBe("a");
  });

  it("retombe sur la catégorie seule si pas de correspondance marque", () => {
    const prompts = [
      tmpl({ id: "a", marque: null, categorie: "Polo" }),
      tmpl({ id: "b", estDefaut: true }),
    ];
    expect(pickPrompt(prompts, "Marque Inconnue", "Polo")?.id).toBe("a");
  });

  it("retombe sur le prompt par défaut si rien ne correspond", () => {
    const prompts = [tmpl({ id: "d", estDefaut: true })];
    expect(pickPrompt(prompts, "Inconnu", "Inconnu")?.id).toBe("d");
  });

  it("renvoie null si la liste est vide", () => {
    expect(pickPrompt([], "Nike", "Short")).toBeNull();
  });

  it("renvoie null si rien ne correspond et qu'aucun défaut n'existe", () => {
    const prompts = [tmpl({ id: "a", marque: "Nike", categorie: "Short" })];
    expect(pickPrompt(prompts, "Adidas", "Polo")).toBeNull();
  });

  it("ignore la casse et les espaces, des deux côtés", () => {
    const prompts = [tmpl({ id: "a", marque: "  NIKE ", categorie: "Sac à dos" })];
    expect(pickPrompt(prompts, "nike", "  sac à dos")?.id).toBe("a");
  });
});

describe("pickPrompt — le prix porté par le prompt", () => {
  it("rend le prix du prompt retenu", () => {
    const prompts = [
      tmpl({ id: "a", marque: "Nike", categorie: "Sac à dos", prixReference: 24.5 }),
      tmpl({ id: "b", estDefaut: true, prixReference: 10 }),
    ];
    expect(pickPrompt(prompts, "Nike", "Sac à dos")?.prixReference).toBe(24.5);
  });

  it("rend null quand le prompt retenu n'a pas de prix", () => {
    const prompts = [tmpl({ id: "a", marque: "Nike", categorie: "Sac à dos" })];
    expect(pickPrompt(prompts, "Nike", "Sac à dos")?.prixReference).toBeNull();
  });
});
```

- [ ] **Step 2: Lancer la vérification et constater l'échec**

⚠️ **Ici le garde-fou est `tsc`, pas Vitest.** Vitest ne vérifie pas les types (esbuild les efface, et `vitest.config.ts` n'active aucun `typecheck`) : le champ `prixReference` du fixture ne serait qu'une propriété de plus à l'exécution, et **le test passerait au vert sans qu'aucune implémentation existe**. C'est le compilateur qui porte l'échec attendu.

Run: `npx tsc --noEmit`
Expected: FAIL — `Object literal may only specify known properties, and 'prixReference' does not exist in type 'PromptTemplateDTO'`, sur `lib/promptSelect.test.ts`.

Run: `npx vitest run lib/promptSelect.test.ts`
Expected: PASS — et ce vert ne prouve rien tant que `tsc` est rouge. Ne pas le prendre pour un succès.

- [ ] **Step 3: Modifier le schéma Prisma**

Dans `prisma/schema.prisma`, model `PromptTemplate`, insérer après la ligne `estDefaut` :

```prisma
  // Prix pré-rempli dans le QCM de mise en vente ; null = ce prompt n'en porte
  // pas. `Float?` et non `Decimal` : c'est la forme qu'avait PrixReference.prix,
  // et la valeur ne sert qu'à remplir un <input> — elle n'entre dans aucun
  // calcul monétaire.
  prixReference Float?
```

Dans le model `User`, supprimer la ligne :

```prisma
  prixReferences PrixReference[]
```

Supprimer **tout** le model `PrixReference` (de `model PrixReference {` à son `}` fermant).

Dans le model `UserSettings`, supprimer le commentaire de quatre lignes « Extension Vinted (18/08/2026) … » et les deux lignes qui le suivent :

```prisma
  delaiVintedMinMinutes Int?
  delaiVintedMaxMinutes Int?
```

- [ ] **Step 4: Régénérer le client Prisma**

Run: `npx prisma generate`
Expected: `Generated Prisma Client (v6.x.x)`. Le client est produit **depuis `schema.prisma`**, pas depuis la base : il connaît déjà `prixReference` alors que la colonne n'existe pas encore. C'est normal, et c'est ce qui permet de compiler avant de migrer.

- [ ] **Step 5: Porter le champ dans les types et le DTO**

Dans `lib/types.ts`, `PromptTemplateDTO`, ajouter après `estDefaut` :

```ts
  /** Prix pré-rempli dans le QCM de mise en vente. `null` = ce prompt n'en porte pas. */
  prixReference: number | null;
```

Supprimer entièrement le type `PrixReferenceDTO`.

Dans `UserSettingsDTO`, supprimer le bloc de commentaire « Fourchette de délai anti-ban … » et les deux champs `delaiVintedMinMinutes` / `delaiVintedMaxMinutes`.

Dans `lib/promptsServer.ts`, `toPromptDTO()`, ajouter après `estDefaut: p.estDefaut,` :

```ts
    prixReference: p.prixReference,
```

- [ ] **Step 6: Lancer le test et vérifier qu'il passe**

Run: `npx tsc --noEmit`
Expected : plus aucune erreur sur `lib/promptSelect.test.ts`. D'autres erreurs peuvent subsister ailleurs — la migration n'est pas encore appliquée et le versant `PrixReference` n'est pas encore retiré ; elles tombent aux étapes 9 à 12.

Run: `npx vitest run lib/promptSelect.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 7: Écrire la migration**

Créer `prisma/migrations/20260908120000_prix_dans_prompt_delai_par_lot/migration.sql` :

```sql
-- Le prix rejoint le prompt, le délai devient un réglage par lot (08/09/2026).
--
-- ⚠️  MIGRATION ÉCRITE À LA MAIN — cf. l'en-tête de 20260808150000_user_settings.
--     `prisma migrate dev` et `prisma db push` produisent un
--     DROP COLUMN "photosPretes" (table Article) : les refuser.
--
-- Cette migration porte l'ÉTAT FINAL. Les deux qui la précèdent
-- (20260818000000_add_prix_reference, 20260818200000_add_delai_vinted) sont
-- déjà appliquées sur la base de dev : les réécrire ferait diverger leur somme
-- de contrôle, d'où le choix d'en ajouter une plutôt que de les corriger. La
-- production, qui n'a vu aucune des trois, les appliquera d'affilée et
-- atterrira directement dans l'état voulu — la table PrixReference y existera
-- le temps d'une transaction.
--
-- ⚠️  DESTRUCTIVE. La table "PrixReference" est peuplée sur dev. Son contenu a
--     été relevé dans docs/audits/2026-09-08-prix-reference-avant-migration.md
--     et doit être ressaisi À LA MAIN dans les prompts. Cette migration ne fait
--     pas le report : plusieurs prompts peuvent correspondre à un même prix, et
--     elle ne saurait pas lequel choisir.

-- Le prix vit désormais sur le prompt qui le concerne.
ALTER TABLE "public"."PromptTemplate" ADD COLUMN "prixReference" DOUBLE PRECISION;

-- La table de prix disparaît, avec sa clé étrangère et ses quatre index.
DROP TABLE "public"."PrixReference";

-- La fourchette de délai n'est plus un réglage de compte : elle est choisie
-- dans un pop-up au lancement et voyage avec le lot.
ALTER TABLE "public"."UserSettings"
    DROP COLUMN "delaiVintedMinMinutes",
    DROP COLUMN "delaiVintedMaxMinutes";
```

- [ ] **Step 8: Appliquer la migration sur dev**

Run: `npx prisma migrate deploy`
Expected : `1 migration found`, puis `Applying migration '20260908120000_prix_dans_prompt_delai_par_lot'` et `The following migration(s) have been applied`.

⚠️ **`migrate deploy`, jamais `migrate dev`** : `deploy` rejoue les fichiers tels quels, sans comparer le schéma à la base, donc sans jamais proposer de supprimer `photosPretes`.

Puis vérifier : `npx prisma migrate status`
Expected : `12 migrations found`, `Database schema is up to date!`, sur l'endpoint dev.

- [ ] **Step 9: Supprimer le versant `PrixReference`**

```bash
git rm lib/pickPrix.ts lib/pickPrix.test.ts lib/prixServer.ts
git rm app/api/prix/route.ts "app/api/prix/[id]/route.ts"
```

Dans `lib/hooks.ts` : retirer `PrixReferenceDTO` de la liste d'imports de `@/lib/types`, puis supprimer tout le bloc allant du commentaire `// ---------- Prix de référence (Extension Vinted) ----------` jusqu'à la fin de `useDeletePrix()` — soit le type `PrixInput` et les quatre hooks `usePrixReferences`, `useCreatePrix`, `useUpdatePrix`, `useDeletePrix`.

- [ ] **Step 10: Supprimer le versant « délai réglé dans le compte »**

Dans `lib/hooks.ts`, supprimer `useSetDelaiVinted()` **et le bloc de commentaire de neuf lignes qui la précède** (« Fourchette de délai anti-ban de l'extension Vinted… ») : il décrit une contrainte de validation serveur qui disparaît à l'étape suivante.

Dans `app/api/user/settings/route.ts` :
- dans le type `Body`, supprimer le commentaire `// Extension Vinted (18/08/2026)…` et les deux champs `delaiVintedMinMinutes` / `delaiVintedMaxMinutes` ;
- dans le `GET`, supprimer les deux lignes `delaiVintedMinMinutes: s?.delaiVintedMinMinutes ?? null,` et `delaiVintedMaxMinutes: s?.delaiVintedMaxMinutes ?? null,` ;
- dans le `PUT`, supprimer **tout** le bloc qui commence par le commentaire `// Extension Vinted : fourchette de délai anti-ban avant remplissage` et se termine par `if (maxPresent) data.delaiVintedMaxMinutes = maxN;` suivi de sa `}` fermante. C'est le `if ("delaiVintedMinMinutes" in body || "delaiVintedMaxMinutes" in body) { … }` entier.

```bash
git rm components/compte/ExtensionVinted.tsx
```

Dans `app/compte/page.tsx` : supprimer la ligne d'import `import ExtensionVinted from "@/components/compte/ExtensionVinted";` et la ligne `<ExtensionVinted />` en fin de `<Frame>`.

- [ ] **Step 11: Retirer le bloc « Prix de référence » de `/parametres`**

Dans `app/parametres/page.tsx` :
- imports : retirer `PrixInput`, `useCreatePrix`, `useDeletePrix`, `usePrixReferences`, `useUpdatePrix` de l'import `@/lib/hooks`, et `PrixReferenceDTO` de l'import `@/lib/types` ;
- supprimer le type `PrixFormState` et la fabrique `emptyPrixForm`, avec leur commentaire ;
- dans `PromptsPage`, supprimer le bloc d'état des prix (du commentaire `// Prix de référence (Extension Vinted) — même schéma d'état…` jusqu'à `const prixPending = …` inclus) : les quatre hooks, les cinq `useState`, `openNewPrix`, `openEditPrix`, `submitPrix`, `supprimerUnPrix` ;
- supprimer le `<Module>` « Prix de référence » entier, avec son commentaire d'ouverture ;
- supprimer la seconde `<Modal open={prixOpen} …>` entière ;
- si `Loader` ou `euros` ne sont plus utilisés ailleurs dans le fichier, retirer aussi leur import. **Vérifier avant de retirer** : `Loader` sert au chargement des prompts (`{isLoading && <Loader size="sm" />}`) et `euros` à la carte d'objectif mensuel — les deux restent, en principe. `tsc` ne signale pas un import inutilisé ; `npx next lint` le ferait, mais il n'est pas au programme de vérification de ce plan.

- [ ] **Step 12: Pré-remplir le prix depuis le prompt dans la fiche article**

Dans `app/mise-en-vente/_components/FicheArticle.tsx` :

Remplacer les deux imports

```tsx
import { usePrixReferences } from "@/lib/hooks";
```
et
```tsx
import { pickPrix } from "@/lib/pickPrix";
```

par le seul

```tsx
import { pickPrompt } from "@/lib/promptSelect";
```

(`useMemo`, `useEffect` et `useRef` sont déjà importés depuis `react` ; `PromptTemplateDTO` est déjà importé depuis `@/lib/types`.)

Puis remplacer le bloc du prix suggéré — du commentaire `// Prix suggéré — pré-rempli depuis les prix de référence…` jusqu'à la fin de son `useEffect` — par :

```tsx
  // Le prompt retenu pour CETTE fiche. Se résout comme côté serveur
  // (app/api/listings/generate/route.ts) : le choix manuel s'il existe, sinon
  // la cascade marque + catégorie de pickPrompt(). C'est ce prompt qui porte
  // désormais le prix de référence — la table PrixReference a disparu, et avec
  // elle la seconde cascade qui la lisait, calque littéral de celle-ci.
  const promptRetenu = useMemo(
    () =>
      prompts.find((p) => p.id === fiche.promptId) ??
      pickPrompt(prompts, qcm.marque || null, qcm.categorie || null),
    [prompts, fiche.promptId, qcm.marque, qcm.categorie],
  );

  // Prix suggéré.
  //
  // Ce composant n'existe QUE quand `fiche.article` est résolu (page.tsx ne le
  // monte pas avant) : cet effet ne peut donc jamais tourner sur une fiche pas
  // encore rattachée à un article, et ne verrouille jamais un prix par défaut
  // avant que marque/catégorie soient réellement connues.
  //
  // Invariant INCHANGÉ : ne JAMAIS écraser un `qcm.prix` non vide, qu'il vienne
  // d'une saisie manuelle ou d'un pré-remplissage précédent — une fois posé, le
  // champ devient la source de vérité et cesse d'être suivi.
  const onQcmRef = useRef(onQcm);
  onQcmRef.current = onQcm;
  useEffect(() => {
    if (qcm.prix !== "") return;
    const prix = promptRetenu?.prixReference;
    if (prix == null) return;
    onQcmRef.current("prix", String(prix));
  }, [promptRetenu, qcm.prix]);
```

⚠️ Ne pas déplacer la déclaration de `onQcmRef` : les deux `useEffect` qui suivent dans le fichier (taille « Unique », matières par défaut) l'utilisent et doivent continuer à la voir déclarée avant eux.

- [ ] **Step 13: Vérifier l'ensemble**

Run: `npx tsc --noEmit`
Expected : aucune sortie, exit 0.

Run: `npx vitest run`
Expected : tous les fichiers passent. Le total de tests change par rapport aux 177 de la baseline : `lib/pickPrix.test.ts` (6) disparaît, `lib/promptSelect.test.ts` (9) arrive. Ne pas figer le nombre — vérifier qu'il n'y a **aucun échec**.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: move the reference price onto the prompt and drop the per-account Vinted delay"
```

---

## Task 3: Le prix se saisit dans le formulaire de prompt

**Files:**
- Modify: `lib/promptSelect.ts`, `lib/promptSelect.test.ts`
- Modify: `lib/hooks.ts`, `app/api/prompts/route.ts`, `app/api/prompts/[id]/route.ts`
- Modify: `app/parametres/page.tsx`

**Interfaces:**
- Consomme : `PromptTemplateDTO.prixReference` (Tâche 2).
- Produit : `prixReferenceDepuisSaisie(v: unknown): { ok: true; prix: number | null } | { ok: false }`, utilisée par les deux routes et par l'écran ; `PromptInput.prixReference: number | null`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `lib/promptSelect.test.ts` :

```ts
describe("prixReferenceDepuisSaisie", () => {
  it("accepte un nombre positif", () => {
    expect(prixReferenceDepuisSaisie(24.5)).toEqual({ ok: true, prix: 24.5 });
  });

  it("accepte une chaîne numérique", () => {
    expect(prixReferenceDepuisSaisie("18")).toEqual({ ok: true, prix: 18 });
  });

  it("traite le vide comme « pas de prix », pas comme une erreur", () => {
    expect(prixReferenceDepuisSaisie("")).toEqual({ ok: true, prix: null });
    expect(prixReferenceDepuisSaisie("   ")).toEqual({ ok: true, prix: null });
    expect(prixReferenceDepuisSaisie(null)).toEqual({ ok: true, prix: null });
    expect(prixReferenceDepuisSaisie(undefined)).toEqual({ ok: true, prix: null });
  });

  it("refuse zéro et les négatifs", () => {
    expect(prixReferenceDepuisSaisie(0)).toEqual({ ok: false });
    expect(prixReferenceDepuisSaisie("-3")).toEqual({ ok: false });
  });

  it("refuse ce qui n'est pas un nombre", () => {
    expect(prixReferenceDepuisSaisie("gratuit")).toEqual({ ok: false });
    expect(prixReferenceDepuisSaisie(Number.NaN)).toEqual({ ok: false });
    expect(prixReferenceDepuisSaisie(Number.POSITIVE_INFINITY)).toEqual({ ok: false });
    expect(prixReferenceDepuisSaisie({})).toEqual({ ok: false });
  });
});
```

Et compléter la ligne d'import en tête du fichier :

```ts
import { pickPrompt, prixReferenceDepuisSaisie } from "./promptSelect";
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run lib/promptSelect.test.ts`
Expected: FAIL — `"prixReferenceDepuisSaisie" is not exported by "lib/promptSelect.ts"`.

- [ ] **Step 3: Écrire l'implémentation**

Ajouter à la fin de `lib/promptSelect.ts` :

```ts
/**
 * Normalise un prix de référence saisi.
 *
 * Trois issues, pas deux : un prix valide, l'ABSENCE de prix (champ laissé
 * vide — c'est le cas le plus courant, la plupart des prompts n'en portent
 * pas), et une saisie invalide. Confondre les deux dernières ferait refuser un
 * formulaire simplement parce que son champ facultatif est vide.
 *
 * Zéro est refusé : un prix de 0 € pré-rempli dans le QCM serait indiscernable
 * d'une absence de prix à l'écran, mais bloquerait le pré-remplissage suivant
 * (l'invariant « ne jamais écraser un prix déjà posé » le figerait).
 */
export function prixReferenceDepuisSaisie(
  v: unknown,
): { ok: true; prix: number | null } | { ok: false } {
  if (v == null) return { ok: true, prix: null };
  if (typeof v === "string" && v.trim() === "") return { ok: true, prix: null };
  if (typeof v !== "number" && typeof v !== "string") return { ok: false };
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return { ok: false };
  return { ok: true, prix: n };
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx vitest run lib/promptSelect.test.ts`
Expected: PASS.

- [ ] **Step 5: Accepter le prix côté API**

Dans `app/api/prompts/route.ts`, ajouter l'import (ce fichier n'importe rien de `promptSelect` aujourd'hui) :

```ts
import { prixReferenceDepuisSaisie } from "@/lib/promptSelect";
```

Ajouter au type `Body` :

```ts
  prixReference?: number | string | null;
```

Dans `POST`, après le calcul de `estDefaut` et avant la construction de `data` :

```ts
    // Facultatif : un prompt sans prix est le cas ordinaire. Une saisie
    // invalide, elle, doit être refusée plutôt que silencieusement remise à
    // null — le prix serait perdu sans que personne ne le voie.
    const prix = prixReferenceDepuisSaisie(body.prixReference);
    if (!prix.ok) {
      return NextResponse.json(
        { error: "Prix de référence invalide : un nombre supérieur à 0, ou vide." },
        { status: 400 },
      );
    }
```

et dans l'objet `data`, après `estDefaut,` :

```ts
      prixReference: prix.prix,
```

Dans `app/api/prompts/[id]/route.ts` : même import, même ajout au type `Body`, et dans `PATCH`, à la suite des autres champs optionnels (après la ligne `if (body.estDefaut !== undefined) data.estDefaut = Boolean(body.estDefaut);`) :

```ts
    if (body.prixReference !== undefined) {
      const prix = prixReferenceDepuisSaisie(body.prixReference);
      if (!prix.ok) {
        return NextResponse.json(
          { error: "Prix de référence invalide : un nombre supérieur à 0, ou vide." },
          { status: 400 },
        );
      }
      data.prixReference = prix.prix;
    }
```

- [ ] **Step 6: Ouvrir le champ dans le hook**

Dans `lib/hooks.ts`, type `PromptInput`, ajouter après `estDefaut: boolean;` :

```ts
  /** `null` = ce prompt ne porte pas de prix. */
  prixReference: number | null;
```

- [ ] **Step 7: Ajouter le champ au formulaire de `/parametres`**

Dans `app/parametres/page.tsx` :

Compléter l'import de `@/lib/promptSelect` (il n'y en a pas encore dans ce fichier) :

```tsx
import { prixReferenceDepuisSaisie } from "@/lib/promptSelect";
```

Dans `FormState`, ajouter `prix: string;` après `contenu` — la valeur reste une **chaîne** le temps de la saisie, comme l'objectif mensuel du même fichier, et ne devient un nombre qu'à la soumission. Dans `emptyForm()`, ajouter `prix: "",`.

Dans `openEdit(p)`, ajouter à l'objet passé à `setForm` :

```tsx
      prix: p.prixReference != null ? String(p.prixReference) : "",
```

Dans `submit()`, avant la construction de `input` :

```tsx
    const prix = prixReferenceDepuisSaisie(form.prix);
    if (!prix.ok) return setError("Le prix doit être un nombre supérieur à 0, ou vide.");
```

et ajouter au littéral `input` :

```tsx
      prixReference: prix.prix,
```

Dans la modale de prompt, insérer un champ juste après la grille « Marque / Catégorie » et avant le bloc « Contenu du prompt » :

```tsx
          <div>
            <label className={labelCls}>Prix de référence (€)</label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.5"
              value={form.prix}
              onChange={(e) => setForm({ ...form, prix: e.target.value })}
              placeholder="Facultatif — ex : 24"
              className={inputCls}
            />
            <p className="mt-1.5 font-mono text-[10.5px] text-[var(--faint)]">
              Pré-rempli dans le QCM de mise en vente quand ce prompt est retenu.
            </p>
          </div>
```

Enfin, dans le panneau de détail, ajouter un jeton après celui de la catégorie, pour que le prix se voie sans ouvrir la modale :

```tsx
                {selected.prixReference != null && (
                  <span className={chipCls}>{euros(selected.prixReference)}</span>
                )}
```

- [ ] **Step 8: Vérifier**

Run: `npx tsc --noEmit`
Expected : aucune sortie, exit 0.

Run: `npx vitest run`
Expected : aucun échec.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: edit the reference price from the prompt form"
```

⚠️ **Pas de point d'arrêt ici.** Le champ existe désormais, mais la ressaisie des prix relevés en Tâche 1 attend la fin du plan : Aramis a demandé le 08/09/2026 à n'ouvrir MyFlip qu'une fois, quand tout sera en place. Enchaîner directement sur la Tâche 4.

---

## Task 4: Le délai, en module pur

**Files:**
- Create: `app/mise-en-vente/_delaiVinted.ts`
- Test: `app/mise-en-vente/_delaiVinted.test.ts`

**Interfaces:**
- Consomme : rien.
- Produit : `type DelaiVinted = { minMinutes: number; maxMinutes: number }`, `type ModeDelai = "fixe" | "fourchette"`, `DELAI_PAR_DEFAUT: DelaiVinted`, `normaliserDelai(brut: unknown): DelaiVinted | null`, `delaiDepuisSaisie(mode: ModeDelai, min: string, max: string): { ok: true; delai: DelaiVinted } | { ok: false; erreur: string }`, `lireDelai(): DelaiVinted`, `ecrireDelai(d: DelaiVinted): void`. Consommés par les Tâches 5.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `app/mise-en-vente/_delaiVinted.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import {
  DELAI_PAR_DEFAUT,
  delaiDepuisSaisie,
  normaliserDelai,
} from "./_delaiVinted";

describe("DELAI_PAR_DEFAUT", () => {
  it("est la fourchette 2 à 5 minutes décidée le 08/09", () => {
    expect(DELAI_PAR_DEFAUT).toEqual({ minMinutes: 2, maxMinutes: 5 });
  });
});

describe("normaliserDelai", () => {
  it("accepte une fourchette d'entiers", () => {
    expect(normaliserDelai({ minMinutes: 2, maxMinutes: 5 })).toEqual({
      minMinutes: 2,
      maxMinutes: 5,
    });
  });

  it("accepte un délai fixe, min = max", () => {
    expect(normaliserDelai({ minMinutes: 3, maxMinutes: 3 })).toEqual({
      minMinutes: 3,
      maxMinutes: 3,
    });
  });

  it("accepte zéro : « pas de délai » est un choix explicite", () => {
    expect(normaliserDelai({ minMinutes: 0, maxMinutes: 0 })).toEqual({
      minMinutes: 0,
      maxMinutes: 0,
    });
  });

  it("refuse une fourchette à l'envers", () => {
    expect(normaliserDelai({ minMinutes: 6, maxMinutes: 2 })).toBeNull();
  });

  it("refuse les non-entiers et les négatifs", () => {
    expect(normaliserDelai({ minMinutes: 1.5, maxMinutes: 5 })).toBeNull();
    expect(normaliserDelai({ minMinutes: -1, maxMinutes: 5 })).toBeNull();
  });

  it("refuse tout ce qui n'a pas la forme attendue", () => {
    expect(normaliserDelai(null)).toBeNull();
    expect(normaliserDelai(undefined)).toBeNull();
    expect(normaliserDelai("2-5")).toBeNull();
    expect(normaliserDelai({ minMinutes: 2 })).toBeNull();
    expect(normaliserDelai({ minMinutes: "2", maxMinutes: "5" })).toBeNull();
  });
});

describe("delaiDepuisSaisie — fourchette", () => {
  it("rend la fourchette saisie", () => {
    expect(delaiDepuisSaisie("fourchette", "2", "5")).toEqual({
      ok: true,
      delai: { minMinutes: 2, maxMinutes: 5 },
    });
  });

  it("accepte min = max", () => {
    expect(delaiDepuisSaisie("fourchette", "4", "4")).toEqual({
      ok: true,
      delai: { minMinutes: 4, maxMinutes: 4 },
    });
  });

  it("refuse une fourchette à l'envers, et le dit", () => {
    const r = delaiDepuisSaisie("fourchette", "9", "3");
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty("erreur");
  });

  it("refuse un champ vide", () => {
    expect(delaiDepuisSaisie("fourchette", "", "5").ok).toBe(false);
    expect(delaiDepuisSaisie("fourchette", "2", "").ok).toBe(false);
  });

  it("refuse les décimales : minutes entières", () => {
    expect(delaiDepuisSaisie("fourchette", "2,5", "5").ok).toBe(false);
    expect(delaiDepuisSaisie("fourchette", "2.5", "5").ok).toBe(false);
  });
});

describe("delaiDepuisSaisie — fixe", () => {
  it("rend min = max, et ignore le second champ", () => {
    expect(delaiDepuisSaisie("fixe", "3", "99")).toEqual({
      ok: true,
      delai: { minMinutes: 3, maxMinutes: 3 },
    });
  });

  it("refuse un champ vide", () => {
    expect(delaiDepuisSaisie("fixe", "", "").ok).toBe(false);
  });

  it("refuse un négatif", () => {
    expect(delaiDepuisSaisie("fixe", "-2", "").ok).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run app/mise-en-vente/_delaiVinted.test.ts`
Expected: FAIL — `Failed to resolve import "./_delaiVinted"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `app/mise-en-vente/_delaiVinted.ts` :

```ts
// Le délai anti-ban entre deux mises en brouillon Vinted.
//
// Ce n'est plus un réglage de compte. Il est choisi dans un pop-up au moment
// de lancer un lot, voyage avec la charge utile de l'événement, et chaque
// entrée de la file de l'extension porte le sien — ce qui permet à deux lots
// lancés avec des réglages différents de s'enchaîner sans que le second
// impose le sien au premier.
//
// PUR pour la normalisation et la validation (testées) ; les deux fonctions
// qui touchent `localStorage` sont des enveloppes minces, sans logique — même
// parti que `_persistance.ts`.

export type DelaiVinted = {
  minMinutes: number;
  maxMinutes: number;
};

/** Un délai fixe s'exprime `minMinutes === maxMinutes` : ce n'est pas un cas
 *  particulier à coder, `tirerDelaiMs()` (extension) traite déjà l'égalité. */
export type ModeDelai = "fixe" | "fourchette";

/** Premier lancement, aucune valeur retenue. Décidé avec Aramis le 08/09/2026. */
export const DELAI_PAR_DEFAUT: DelaiVinted = { minMinutes: 2, maxMinutes: 5 };

/** Clé versionnée : un futur changement de forme ne doit pas relire l'ancienne. */
export const CLE_DELAI = "mev_delai_vinted_v1";

const entierPositif = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0;

/**
 * Valide une valeur relue du stockage, ou `null` si elle n'a pas exactement la
 * forme attendue. Rien de ce qui vient du `localStorage` n'est digne de
 * confiance : la clé a pu être écrite par une version antérieure, ou à la main.
 *
 * Zéro est ACCEPTÉ. « Pas de délai pour ce lot » est un choix légitime — c'est
 * même celui qu'on prend pour un essai — et le refuser obligerait à inventer
 * une valeur à la place de celle demandée.
 */
export function normaliserDelai(brut: unknown): DelaiVinted | null {
  if (!brut || typeof brut !== "object") return null;
  const d = brut as Partial<DelaiVinted>;
  if (!entierPositif(d.minMinutes) || !entierPositif(d.maxMinutes)) return null;
  if (d.minMinutes > d.maxMinutes) return null;
  return { minMinutes: d.minMinutes, maxMinutes: d.maxMinutes };
}

/** Chaîne de saisie → entier, ou `null`. Refuse le vide et les décimales :
 *  minutes entières, décision explicite du 08/09/2026. */
function versEntier(v: string): number | null {
  const s = v.trim();
  if (s === "") return null;
  // `Number("2,5")` vaut NaN, `Number("2.5")` vaut 2.5 : les deux formes de
  // décimale sont donc bien refusées, mais par deux chemins différents.
  const n = Number(s);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

/**
 * Valide la saisie du pop-up. En mode « fixe », seul `min` est lu — le second
 * champ n'est pas affiché, et sa valeur résiduelle ne doit rien décider.
 */
export function delaiDepuisSaisie(
  mode: ModeDelai,
  min: string,
  max: string,
): { ok: true; delai: DelaiVinted } | { ok: false; erreur: string } {
  const INVALIDE = "Un délai en minutes entières, à partir de 0.";

  const m = versEntier(min);
  if (m === null) return { ok: false, erreur: INVALIDE };

  if (mode === "fixe") return { ok: true, delai: { minMinutes: m, maxMinutes: m } };

  const M = versEntier(max);
  if (M === null) return { ok: false, erreur: INVALIDE };
  if (m > M) {
    return { ok: false, erreur: "Le minimum doit être inférieur ou égal au maximum." };
  }
  return { ok: true, delai: { minMinutes: m, maxMinutes: M } };
}

// ── Enveloppes localStorage (non testées : elles n'ont pas de logique) ─────

/**
 * Le dernier délai retenu, ou la valeur par défaut.
 *
 * `localStorage` et non la base : ça n'a pas à survivre à un changement de
 * machine, et ça évite une colonne — celle qu'on vient précisément de
 * supprimer. À n'appeler que côté navigateur (au clic, jamais au rendu) :
 * `window` n'existe pas au rendu serveur.
 */
export function lireDelai(): DelaiVinted {
  try {
    const brut = window.localStorage.getItem(CLE_DELAI);
    if (!brut) return DELAI_PAR_DEFAUT;
    return normaliserDelai(JSON.parse(brut)) ?? DELAI_PAR_DEFAUT;
  } catch {
    return DELAI_PAR_DEFAUT;
  }
}

export function ecrireDelai(d: DelaiVinted): void {
  try {
    window.localStorage.setItem(CLE_DELAI, JSON.stringify(d));
  } catch {
    /* stockage refusé : le réglage ne sera pas retenu, le lot part quand même */
  }
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx vitest run app/mise-en-vente/_delaiVinted.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Vérifier le typage et commiter**

Run: `npx tsc --noEmit`
Expected : aucune sortie, exit 0.

```bash
git add app/mise-en-vente/_delaiVinted.ts app/mise-en-vente/_delaiVinted.test.ts
git commit -m "feat: add the pure delay module for the Vinted batch popup"
```

---

## Task 5: Le pop-up, et le délai dans la charge utile

**Files:**
- Create: `app/mise-en-vente/_components/DialogueDelaiVinted.tsx`
- Modify: `app/mise-en-vente/_publierVinted.ts`
- Test: `app/mise-en-vente/_publierVinted.test.ts`
- Modify: `app/mise-en-vente/page.tsx`

**Interfaces:**
- Consomme : `DelaiVinted`, `ModeDelai`, `DELAI_PAR_DEFAUT`, `delaiDepuisSaisie`, `lireDelai`, `ecrireDelai` (Tâche 4) ; `Modal` (`components/Modal.tsx`) ; `inputCls`, `labelCls` (`app/mise-en-vente/_ui.tsx`).
- Produit : `DetailPublicationVinted.delai: DelaiVinted` — c'est le champ que `content-myflip.js` lira en Tâche 7 ; `publierVinted(f, delai, enregistrerUn, emettreEvenement)` ; `detailPublicationVinted(f, delai)`.

- [ ] **Step 1: Mettre à jour le test**

Dans `app/mise-en-vente/_publierVinted.test.ts` :

Compléter les imports :

```ts
import { DELAI_PAR_DEFAUT } from "./_delaiVinted";
```

Remplacer les **six** appels à `publierVinted(…)` du fichier par leur forme à quatre arguments — le délai arrive en **deuxième** position, avec les autres données de la publication, avant les effets injectés :

```ts
    const resultat = await publierVinted(
      ficheDeTest(),
      DELAI_PAR_DEFAUT,
      enregistrerUn,
      emettreEvenement,
    );
```

(idem pour les trois autres, en gardant leurs arguments respectifs : `sansArticle`, `ficheAvec({…})`, `async () => true` / `async () => false`, `vi.fn()`.)

Dans le test « passe l'id CLIENT de la fiche », l'appel devient :

```ts
    await publierVinted(f, DELAI_PAR_DEFAUT, enregistrerUn, vi.fn());
```

Mettre à jour l'attendu de `detailPublicationVinted` :

```ts
describe("detailPublicationVinted", () => {
  it("porte l'id article, le texte de l'annonce, le prix, les blobs photo et le délai", () => {
    const detail = detailPublicationVinted(ficheDeTest(), { minMinutes: 4, maxMinutes: 9 });
    expect(detail).toEqual({
      articleId: "art_PRL1",
      titre: "Polo Ralph Lauren M",
      description: "Description.",
      prix: "25",
      photos: [{ id: "p1" }],
      delai: { minMinutes: 4, maxMinutes: 9 },
    });
  });

  it("transporte un délai fixe tel quel, min = max", () => {
    const detail = detailPublicationVinted(ficheDeTest(), { minMinutes: 3, maxMinutes: 3 });
    expect(detail.delai).toEqual({ minMinutes: 3, maxMinutes: 3 });
  });
});
```

Et compléter les quatre appels à `detailPublicationVinted(f)` du dernier `describe` (« champs Vinted ») en `detailPublicationVinted(f, DELAI_PAR_DEFAUT)`.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run app/mise-en-vente/_publierVinted.test.ts`
Expected: FAIL — à l'exécution, pas seulement au typage. `detailPublicationVinted` ignore encore son second argument, donc `detail.delai` est `undefined` et le `toEqual` tombe ; et `publierVinted` reçoit `DELAI_PAR_DEFAUT` là où il attend `enregistrerUn`, donc `enregistrerUn is not a function`.

Run: `npx tsc --noEmit`
Expected: FAIL également — `Expected 1 arguments, but got 2` sur `detailPublicationVinted`, `Expected 3 arguments, but got 4` sur `publierVinted`.

- [ ] **Step 3: Faire voyager le délai dans la charge utile**

Dans `app/mise-en-vente/_publierVinted.ts` :

Ajouter l'import :

```ts
import type { DelaiVinted } from "./_delaiVinted";
```

Dans `DetailPublicationVinted`, ajouter après `photos` :

```ts
  /**
   * Délai anti-ban choisi pour CE lancement, en minutes.
   *
   * Il voyage avec l'annonce plutôt que d'être stocké quelque part et relu :
   * chaque entrée de la file de l'extension porte donc le sien, et deux lots
   * lancés avec des réglages différents s'enchaînent sans que le second impose
   * le sien au premier. Un délai fixe s'exprime `minMinutes === maxMinutes`.
   */
  delai: DelaiVinted;
```

Signature et corps de `detailPublicationVinted` :

```ts
export function detailPublicationVinted(
  f: ArticleEnCours,
  delai: DelaiVinted,
): DetailPublicationVinted {
  const vinted = champsVinted(f);
  return {
    articleId: f.article!.id,
    titre: f.annonce.titre,
    description: f.annonce.description,
    prix: f.qcm.prix,
    photos: f.photos.map((p) => p.blob),
    delai,
    ...(vinted ? { vinted } : {}),
  };
}
```

Signature et corps de `publierVinted` :

```ts
export async function publierVinted(
  f: ArticleEnCours,
  delai: DelaiVinted,
  enregistrerUn: (id: string, statut: string) => Promise<boolean>,
  emettreEvenement: (detail: DetailPublicationVinted) => void,
): Promise<boolean> {
  if (!f.article) return false;
  // ⚠️ `f.id` — l'identité CLIENT de la fiche, PAS `f.article.id` : c'est ce
  // que `enregistrer()` (page.tsx) sait résoudre.
  const succes = await enregistrerUn(f.id, "Brouillon");
  if (!succes) return false;
  emettreEvenement(detailPublicationVinted(f, delai));
  return true;
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx vitest run app/mise-en-vente/_publierVinted.test.ts`
Expected: PASS.

- [ ] **Step 5: Écrire le pop-up**

Créer `app/mise-en-vente/_components/DialogueDelaiVinted.tsx` :

```tsx
"use client";

// Le pop-up de choix du délai anti-ban, ouvert avant qu'un seul article ne
// parte en file.
//
// Il remplace un réglage de compte que l'extension allait lire dans le DOM de
// /compte — le mécanisme le plus fragile du chantier précédent, et le seul à
// produire un mode de panne muet : /compte jamais visité, et la file ne
// démarrait pas sans que rien ne le dise.
//
// AUCUNE LOGIQUE ICI. La validation et le format vivent dans `_delaiVinted.ts`,
// en fonctions pures testées ; ce composant ne fait que les brancher sur la
// modale de l'application. React ne se teste pas sur ce projet (cf.
// vitest.config.ts) : tout ce qui est décidable doit rester en dehors.

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { delaiDepuisSaisie, type DelaiVinted, type ModeDelai } from "../_delaiVinted";
import { inputCls, labelCls } from "../_ui";

export default function DialogueDelaiVinted({
  open,
  initial,
  libelleAction,
  onAnnuler,
  onConfirmer,
}: {
  open: boolean;
  /**
   * Dernier délai retenu, relu du `localStorage` par l'appelant.
   *
   * ⚠️ Sa RÉFÉRENCE doit être stable entre deux rendus : l'effet ci-dessous
   * réinitialise les champs quand elle change, et un objet recréé à chaque
   * rendu effacerait la saisie en cours à chaque frappe. `page.tsx` le range
   * dans un `useState` posé au clic, exactement pour cette raison.
   */
  initial: DelaiVinted;
  /** Ce que fait le bouton de confirmation. Ex. « Lancer le lot ». */
  libelleAction: string;
  onAnnuler: () => void;
  onConfirmer: (delai: DelaiVinted) => void;
}) {
  const [mode, setMode] = useState<ModeDelai>("fourchette");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  // Réarmé à CHAQUE ouverture, pas seulement au montage : le dialogue reste
  // monté entre deux lancements, et la saisie abandonnée du précédent ne doit
  // pas revenir telle quelle.
  useEffect(() => {
    if (!open) return;
    setMode(initial.minMinutes === initial.maxMinutes ? "fixe" : "fourchette");
    setMin(String(initial.minMinutes));
    setMax(String(initial.maxMinutes));
    setErreur(null);
  }, [open, initial]);

  function confirmer() {
    const r = delaiDepuisSaisie(mode, min, max);
    if (!r.ok) {
      setErreur(r.erreur);
      return;
    }
    onConfirmer(r.delai);
  }

  const ongletCls = (actif: boolean) =>
    `inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border-[1.5px] px-4 text-[13.5px] font-semibold transition-all ${
      actif
        ? "border-[var(--acc)] bg-[var(--acc)] text-[var(--acc-ink)]"
        : "border-[var(--border)] bg-surface text-[var(--ink2)] hover:border-[var(--border-strong)]"
    }`;

  return (
    <Modal
      open={open}
      onClose={onAnnuler}
      title="Délai entre deux brouillons"
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onAnnuler}
            className="min-h-[44px] rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 text-[12.5px] font-medium text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)]"
          >
            Annuler
          </button>
          <button
            onClick={confirmer}
            className="min-h-[44px] rounded-full bg-[var(--acc)] px-5 text-[12.5px] font-semibold text-[var(--acc-ink)] transition-colors hover:bg-[var(--acc-hover)]"
          >
            {libelleAction}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-[var(--ink2)]">
          Le premier article part tout de suite. Ce délai s&apos;applique entre
          les annonces suivantes — c&apos;est le garde-fou anti-ban.
        </p>

        <div className="flex gap-2.5">
          <button
            type="button"
            aria-pressed={mode === "fixe"}
            onClick={() => setMode("fixe")}
            className={ongletCls(mode === "fixe")}
          >
            Délai fixe
          </button>
          <button
            type="button"
            aria-pressed={mode === "fourchette"}
            onClick={() => setMode("fourchette")}
            className={ongletCls(mode === "fourchette")}
          >
            Fourchette aléatoire
          </button>
        </div>

        {mode === "fixe" ? (
          <div>
            <label className={labelCls} htmlFor="delai-fixe">
              Minutes
            </label>
            <input
              id="delai-fixe"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className={inputCls}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="delai-min">
                Minimum (min)
              </label>
              <input
                id="delai-min"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="delai-max">
                Maximum (min)
              </label>
              <input
                id="delai-max"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {erreur && (
          <p className="font-mono text-[12px] text-[var(--neg)]">{erreur}</p>
        )}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 6: Câbler le pop-up dans la page**

Dans `app/mise-en-vente/page.tsx` :

Ajouter les imports :

```tsx
import DialogueDelaiVinted from "./_components/DialogueDelaiVinted";
import {
  DELAI_PAR_DEFAUT,
  ecrireDelai,
  lireDelai,
  type DelaiVinted,
} from "./_delaiVinted";
```

Ajouter deux états, à la suite de `const [choixPrompt, setChoixPrompt] = useState(false);` :

```tsx
  // Ce que le pop-up de délai est en train de demander, ou null s'il est fermé.
  const [demandeDelai, setDemandeDelai] = useState<
    { cible: "tout" } | { cible: "fiche"; id: string } | null
  >(null);
  const [delaiInitial, setDelaiInitial] = useState<DelaiVinted>(DELAI_PAR_DEFAUT);
```

Modifier `publierVinted` et `publierVintedTout` pour recevoir le délai et le transmettre :

```tsx
  async function publierVinted(f: ArticleEnCours, delai: DelaiVinted) {
    const ok = await orchestrerPublicationVinted(
      f,
      delai,
      (id, statut) => enregistrer([id], statut),
      (detail) => window.dispatchEvent(new CustomEvent("myflip:publier-vinted", { detail })),
    );
```

(le reste du corps, y compris le repli `window.open` quand l'extension est absente, ne change pas)

```tsx
  async function publierVintedTout(delai: DelaiVinted) {
```

et, dans sa boucle, `const ok = await publierVinted(fraiche, delai);`.

Ajouter, juste après `publierVintedTout`, les deux fonctions qui ouvrent et confirment le pop-up :

```tsx
  // ── Le pop-up de délai ──────────────────────────────────────────────────
  // `lireDelai()` touche `localStorage` : appelée AU CLIC, jamais au rendu —
  // ce composant est aussi rendu côté serveur, où `window` n'existe pas. La
  // valeur est rangée dans un état pour que sa RÉFÉRENCE reste stable tant que
  // le dialogue est ouvert : il réinitialise ses champs quand `initial` change,
  // et un objet recréé à chaque rendu effacerait la saisie à chaque frappe.
  function ouvrirDialogueDelai(cible: { cible: "tout" } | { cible: "fiche"; id: string }) {
    setDelaiInitial(lireDelai());
    setDemandeDelai(cible);
  }

  function confirmerDelai(delai: DelaiVinted) {
    const cible = demandeDelai;
    setDemandeDelai(null);
    if (!cible) return;
    // Retenu pour le prochain lancement, dans le navigateur — pas en base :
    // ça n'a pas à survivre à un changement de machine.
    ecrireDelai(delai);
    if (cible.cible === "tout") {
      void publierVintedTout(delai);
      return;
    }
    const f = etatRef.current.fiches.find((x) => x.id === cible.id);
    if (f) void publierVinted(f, delai);
  }
```

Remplacer les deux props de `<ExportAnnonces>` :

```tsx
            onPublierVinted={(id) => ouvrirDialogueDelai({ cible: "fiche", id })}
            onPublierVintedTout={() => ouvrirDialogueDelai({ cible: "tout" })}
```

⚠️ `ExportAnnonces.tsx` n'est PAS modifié : ses deux callbacks gardent leur signature, seul ce qu'elles déclenchent change.

Enfin, monter le dialogue juste après le bloc « Zoom photo » et avant la barre d'action collante :

```tsx
      {/* Délai anti-ban — demandé avant que le moindre article ne parte. */}
      <DialogueDelaiVinted
        open={demandeDelai !== null}
        initial={delaiInitial}
        libelleAction={demandeDelai?.cible === "tout" ? "Lancer le lot" : "Lancer le brouillon"}
        onAnnuler={() => setDemandeDelai(null)}
        onConfirmer={confirmerDelai}
      />
```

- [ ] **Step 7: Vérifier**

Run: `npx tsc --noEmit`
Expected : aucune sortie, exit 0.

Run: `npx vitest run`
Expected : aucun échec.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: ask for the anti-ban delay in a popup before queueing drafts"
```

---

## Task 6: L'ordonnanceur — premier article immédiat, délai porté par l'entrée

**Files:**
- Modify: `extension-vinted/file.js`
- Test: `extension-vinted/file.test.js`

**Interfaces:**
- Consomme : rien (module pur, sans `browser.*` ni IndexedDB).
- Produit : `estPremiereEntree(entrees): boolean`, `delaiDeLEntree(entree): { minMinutes, maxMinutes }`, `DELAI_REPLI`, et `prochaineAction` dont l'action `"planifier"` porte désormais `immediat: boolean`. Consommés par `background.js` en Tâche 7.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `extension-vinted/file.test.js` :

Compléter l'import :

```js
import {
  DELAI_REPLI,
  delaiDeLEntree,
  entreesPerimees,
  estPremiereEntree,
  prochaineAction,
  tirerDelaiMs,
} from "./file.js";
```

Compléter la fabrique d'entrée pour qu'elle porte les deux champs neufs :

```js
const enAttente = (entryId, ts, cibleMs = null, extra = {}) => ({
  entryId,
  etat: "en-attente",
  ts,
  cibleMs,
  tabId: null,
  premier: false,
  delai: { minMinutes: 2, maxMinutes: 5 },
  ...extra,
});
```

Remplacer le test « demande à planifier une entrée qui n'a pas encore de cible » par les deux suivants :

```js
  it("demande à planifier avec attente une entrée qui n'a pas encore de cible", () => {
    expect(prochaineAction([enAttente("a", 100)], 1000)).toEqual({
      type: "planifier",
      entryId: "a",
      immediat: false,
    });
  });

  it("demande à planifier SANS attente le premier article d'un lot", () => {
    const file = [enAttente("a", 100, null, { premier: true })];
    expect(prochaineAction(file, 1000)).toEqual({
      type: "planifier",
      entryId: "a",
      immediat: true,
    });
  });
```

Et ajouter, à la fin du fichier, trois nouveaux `describe` :

```js
describe("estPremiereEntree", () => {
  // Le drapeau est posé À LA MISE EN FILE, pas à la planification.
  //
  // Le critère « aucune entrée n'a de cibleMs » aurait été rejoué après CHAQUE
  // succès : une entrée réussie est supprimée de la base (background.js,
  // tabs.onUpdated), donc la file y retombe entre deux articles et tout le lot
  // serait parti sans attendre — le garde-fou annulé en silence.
  it("est vraie quand la file est vide", () => {
    expect(estPremiereEntree([])).toBe(true);
  });

  it("est fausse dès qu'une entrée attend déjà", () => {
    expect(estPremiereEntree([enAttente("a", 100)])).toBe(false);
  });

  it("est fausse quand un article est en vol", () => {
    const file = [{ entryId: "a", etat: "en-cours", ts: 100, cibleMs: 0, tabId: 7 }];
    expect(estPremiereEntree(file)).toBe(false);
  });
});

describe("delaiDeLEntree", () => {
  it("rend la fourchette portée par l'entrée", () => {
    const e = enAttente("a", 100, null, { delai: { minMinutes: 4, maxMinutes: 9 } });
    expect(delaiDeLEntree(e)).toEqual({ minMinutes: 4, maxMinutes: 9 });
  });

  it("accepte un délai fixe et un délai nul", () => {
    const fixe = enAttente("a", 100, null, { delai: { minMinutes: 3, maxMinutes: 3 } });
    expect(delaiDeLEntree(fixe)).toEqual({ minMinutes: 3, maxMinutes: 3 });
    const nul = enAttente("b", 100, null, { delai: { minMinutes: 0, maxMinutes: 0 } });
    expect(delaiDeLEntree(nul)).toEqual({ minMinutes: 0, maxMinutes: 0 });
  });

  it("replie sur 2–5 min une entrée sans délai — jamais sur zéro", () => {
    const e = enAttente("a", 100, null, { delai: undefined });
    expect(delaiDeLEntree(e)).toEqual(DELAI_REPLI);
    expect(DELAI_REPLI).toEqual({ minMinutes: 2, maxMinutes: 5 });
  });

  it("replie aussi sur un délai abîmé", () => {
    expect(delaiDeLEntree(enAttente("a", 1, null, { delai: null }))).toEqual(DELAI_REPLI);
    expect(delaiDeLEntree(enAttente("b", 1, null, { delai: {} }))).toEqual(DELAI_REPLI);
    expect(
      delaiDeLEntree(enAttente("c", 1, null, { delai: { minMinutes: "2", maxMinutes: 5 } })),
    ).toEqual(DELAI_REPLI);
    expect(
      delaiDeLEntree(enAttente("d", 1, null, { delai: { minMinutes: -1, maxMinutes: 5 } })),
    ).toEqual(DELAI_REPLI);
  });

  it("laisse passer une fourchette à l'envers : tirerDelaiMs la réordonne déjà", () => {
    const e = enAttente("a", 100, null, { delai: { minMinutes: 9, maxMinutes: 4 } });
    expect(delaiDeLEntree(e)).toEqual({ minMinutes: 9, maxMinutes: 4 });
  });
});
```

- [ ] **Step 2: Lancer les tests et vérifier qu'ils échouent**

Run: `npx vitest run extension-vinted/file.test.js`
Expected: FAIL — `No "estPremiereEntree" export is defined on the "./file.js" mock` / `SyntaxError: The requested module './file.js' does not provide an export named 'DELAI_REPLI'`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `extension-vinted/file.js` :

Compléter le commentaire de tête, qui décrit la forme d'une entrée :

```js
// Une entrée de file :
//   { entryId, etat, ts, cibleMs, tabId, titre, description, prix,
//     photos, vinted, delai, premier }
//
//   etat : "en-attente" — mise en file, pas encore ouverte
//          "en-cours"   — son onglet Vinted est ouvert et se remplit
//          "echouee"    — le remplissage a échoué ; la chaîne est suspendue
//   ts      : epoch ms de mise en file. Donne l'ordre de traitement.
//   cibleMs : epoch ms ABSOLU à partir duquel l'onglet peut s'ouvrir.
//             null tant que le délai anti-ban n'a pas été tiré.
//   delai   : { minMinutes, maxMinutes } choisi dans le pop-up au lancement du
//             lot. Porté par CHAQUE entrée, pas par l'extension : deux lots
//             lancés avec des réglages différents s'enchaînent alors sans que
//             le second impose le sien au premier.
//   premier : posé à la mise en file, quand la file était vide. Cette entrée
//             part sans attendre.
```

Ajouter la constante de repli, sous les constantes de tête :

```js
/**
 * Fourchette utilisée quand une entrée n'en porte pas d'exploitable : entrée
 * mise en file par une version antérieure de l'extension, ou charge utile
 * abîmée en route.
 *
 * On ne replie PAS sur zéro. Un délai nul ouvrirait tous les onglets d'affilée
 * — exactement ce que ce garde-fou existe pour empêcher — et l'ancien code
 * refusait de planifier pour cette raison. Ce refus produisait un mode de
 * panne muet (rien ne partait, rien ne le disait) ; un repli prudent le
 * remplace.
 */
export const DELAI_REPLI = { minMinutes: 2, maxMinutes: 5 };
```

Modifier les deux dernières lignes de `prochaineAction` concernant `cibleMs` :

```js
  if (suivante.cibleMs == null) {
    // `immediat` est LU sur l'entrée, pas déduit de l'état de la file. Le
    // critère « aucune entrée n'a encore de cibleMs » serait vrai à nouveau
    // après chaque succès — une entrée réussie est supprimée de la base — et
    // tout le lot partirait sans attendre.
    return {
      type: "planifier",
      entryId: suivante.entryId,
      immediat: suivante.premier === true,
    };
  }
```

Ajouter les deux fonctions, après `tirerDelaiMs` :

```js
/**
 * Cette mise en file est-elle la première d'un lot ?
 *
 * Appelée par background.js AVANT d'enregistrer la nouvelle entrée, et après
 * la purge des entrées en échec : une file vide veut dire qu'aucun article
 * n'est en vol ni en attente, donc que celui qui arrive n'a personne devant
 * lui. Un article isolé envoyé pendant qu'un lot tourne n'est donc pas
 * « premier » — il rejoint la file et attend son tour, comme le veut la spec.
 */
export function estPremiereEntree(entrees) {
  return entrees.length === 0;
}

/**
 * La fourchette de délai d'une entrée, ou le repli si elle n'en porte pas
 * d'exploitable.
 *
 * Une fourchette à l'envers est laissée telle quelle : `tirerDelaiMs()` la
 * réordonne déjà, et la corriger ici ferait deux endroits à tenir d'accord.
 */
export function delaiDeLEntree(entree) {
  const d = entree && entree.delai;
  const entier = (n) => typeof n === "number" && Number.isInteger(n) && n >= 0;
  if (!d || !entier(d.minMinutes) || !entier(d.maxMinutes)) return DELAI_REPLI;
  return { minMinutes: d.minMinutes, maxMinutes: d.maxMinutes };
}
```

Enfin, corriger le commentaire de `tirerDelaiMs`, qui renvoie encore à `/compte` :

```js
/**
 * Tire un délai en millisecondes dans une fourchette exprimée en MINUTES.
 *
 * `alea` est injecté (au lieu d'appeler Math.random ici) pour que les bornes
 * soient testables. La fourchette est réordonnée si elle arrive à l'envers :
 * elle est saisie à la main dans le pop-up de lancement, rien ne garantit
 * min <= max, et un délai négatif ouvrirait tous les onglets d'un coup —
 * exactement le comportement que ce garde-fou existe pour empêcher.
 */
```

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run extension-vinted/file.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add extension-vinted/file.js extension-vinted/file.test.js
git commit -m "feat: carry the delay on each queue entry and let the first draft start at once"
```

---

## Task 7: Le worker et le pont consomment le délai de l'entrée

**Files:**
- Modify: `extension-vinted/background.js`
- Modify: `extension-vinted/content-myflip.js`
- Modify: `extension-vinted/manifest.json`

**Interfaces:**
- Consomme : `estPremiereEntree()`, `delaiDeLEntree()`, `prochaineAction().immediat` (Tâche 6) ; `detail.delai` du `CustomEvent` (Tâche 5).
- Produit : le message `myflip:mise-en-file` porte `delai` ; l'entrée en base porte `delai` et `premier`.

⚠️ **Aucun test ne couvre ces deux fichiers, et c'est structurel** : `background.js` branche des API `browser.*` et `content-myflip.js` vit dans une page. Toute la décision a été extraite en Tâche 6, où elle est testée. Ici, la vérification est `web-ext lint`, la relecture, et le passage réel qui reste à faire.

- [ ] **Step 1: Le worker lit le délai sur l'entrée**

Dans `extension-vinted/background.js` :

Compléter l'import :

```js
import {
  delaiDeLEntree,
  entreesPerimees,
  estPremiereEntree,
  prochaineAction,
  tirerDelaiMs,
} from "./file.js";
```

Supprimer entièrement `lireDelaiRegle()` **et son commentaire de quatre lignes** (« Les bornes de délai ne sont pas lisibles par API… ») : le délai n'est plus lu nulle part, il arrive avec l'entrée.

Dans le handler `myflip:mise-en-file`, après `await purgerEchecs();`, insérer :

```js
    // La file est relue APRÈS la purge : une entrée en échec qui vient d'être
    // retirée ne doit pas faire passer ce nouvel envoi pour un article qui
    // rejoint un lot en cours. Le drapeau est posé maintenant, une fois pour
    // toutes — pas recalculé à la planification, où il redeviendrait vrai
    // après chaque succès (cf. estPremiereEntree dans file.js).
    const premier = estPremiereEntree(await getAllEntries());
```

et compléter l'objet passé à `saveEntry` en ajoutant, après `vinted: msg.vinted,` :

```js
      // Fourchette choisie dans le pop-up de /mise-en-vente, en minutes.
      // Portée par l'entrée : deux lots lancés avec des réglages différents
      // s'enchaînent sans que le second impose le sien au premier.
      delai: msg.delai,
      premier,
```

Dans la branche `if (action.type === "planifier")`, supprimer les huit lignes qui commencent par `const delai = await lireDelaiRegle();` et vont jusqu'à la fin du `if (!delai) { … }`. Puis remplacer la ligne qui calcule `cibleMs` par :

```js
    const { minMinutes, maxMinutes } = delaiDeLEntree(entree);
    entree.cibleMs = action.immediat
      ? // Premier article du lot : il ne patiente pas. Le délai anti-ban n'a
        // de sens qu'ENTRE deux annonces.
        Date.now()
      : Date.now() + tirerDelaiMs(minMinutes, maxMinutes, Math.random);
```

- [ ] **Step 2: Le pont transmet le délai et cesse de lire `/compte`**

Dans `extension-vinted/content-myflip.js` :

Réécrire le commentaire de tête, qui annonce deux responsabilités dont une disparaît :

```js
// extension-vinted/content-myflip.js
//
// Content script injecté sur tout le domaine MyFlip (voir manifest.json). Une
// seule responsabilité depuis le 08/09/2026 : sur /mise-en-vente, écouter le
// CustomEvent "myflip:publier-vinted" (émis par
// app/mise-en-vente/_publierVinted.ts) et le transmettre au service worker
// sous forme de message runtime.
//
// Ce qu'il ne fait PLUS : recopier la fourchette de délai anti-ban depuis le
// DOM de /compte vers browser.storage.local. Le délai est désormais choisi
// dans un pop-up au lancement du lot et voyage avec chaque annonce — c'était
// le mécanisme le plus fragile du chantier, et le seul à produire une panne
// muette (/compte jamais visité, la file ne démarrait pas, rien ne le disait).
//
// ⚠️ Le manifest matche TOUT le domaine, et pas seulement /mise-en-vente,
// alors même que /compte n'est plus concerné : MyFlip navigue en SPA
// (next/link), et un content script ne s'injecte qu'à un CHARGEMENT DE PAGE
// RÉEL. Restreindre le match empêcherait l'injection pour qui atterrit sur
// /dashboard après connexion puis clique vers /mise-en-vente — un parcours
// parfaitement normal.
```

Supprimer les deux variables devenues sans objet :

```js
let compteSyncEnCours = false;
let nettoyerCompteSync = null;
```

Réduire `reagirALaRoute()` à sa seule branche restante :

```js
function reagirALaRoute() {
  if (location.pathname.startsWith("/mise-en-vente") && !publicationEcoutee) {
    ecouterPublicationVinted();
    publicationEcoutee = true;
  }
}
```

Supprimer entièrement `synchroniserDelaiVinted()`, `versNombre()` et `copierDelaiVersStorage()`, avec leurs blocs de commentaires.

Dans `ecouterPublicationVinted()`, compléter la déstructuration :

```js
    const { articleId, titre, description, prix, photos, vinted, delai } = e.detail;
```

et, dans le `sendMessage`, ajouter après `vinted,` :

```js
      // Reconstruit champ par champ, contrairement à `vinted` qui passe tel
      // quel. Ce n'est pas de la coquetterie : un `delai` qui arriverait
      // abîmé de l'autre côté de la frontière Xray produirait un `cibleMs` à
      // NaN, `NaN > maintenant` vaut `false`, et l'onglet s'ouvrirait
      // IMMÉDIATEMENT — le garde-fou anti-ban annulé sans un mot. Un objet
      // mal formé arrive ici en `null` et déclenche le repli de
      // delaiDeLEntree() (file.js), qui lui est prudent.
      delai:
        delai && typeof delai === "object"
          ? { minMinutes: Number(delai.minMinutes), maxMinutes: Number(delai.maxMinutes) }
          : null,
```

⚠️ `Number("2")` vaut `2`, mais `delaiDeLEntree()` exige un **entier** : une valeur non entière retombe sur le repli 2–5 min, jamais sur zéro. C'est le comportement voulu.

- [ ] **Step 3: Retirer la permission `storage`, devenue inutile**

`browser.storage` n'a plus aucun appelant : `lireDelaiRegle()` et `copierDelaiVersStorage()` étaient ses deux seuls usages. Dans `extension-vinted/manifest.json` :

```json
  "permissions": ["tabs", "alarms"],
```

- [ ] **Step 4: Vérifier qu'aucun usage de storage ne subsiste**

Run: `grep -rn "storage" extension-vinted/`
Expected : plus aucune occurrence de `browser.storage`. Les seules correspondances acceptables sont des mots dans des commentaires ou dans `README.md` — et celles du README sont traitées en Tâche 8. S'il reste un `browser.storage.*`, ne pas retirer la permission.

- [ ] **Step 5: Lint de l'extension**

Run: `cd extension-vinted && npx web-ext lint --self-hosted`
Expected : `errors 0`, `warnings 2` — les deux avertissements de baseline documentés dans `extension-vinted/README.md`. Un troisième avertissement est un signal, pas un détail : le lire.

- [ ] **Step 6: Vérifier l'ensemble**

Run: `npx tsc --noEmit` (depuis la racine du worktree)
Expected : aucune sortie, exit 0.

Run: `npx vitest run`
Expected : aucun échec.

- [ ] **Step 7: Commit**

```bash
git add extension-vinted/background.js extension-vinted/content-myflip.js extension-vinted/manifest.json
git commit -m "feat: read the anti-ban delay from the queue entry instead of the account page"
```

---

## Task 8: Documentation et vérification d'ensemble

**Files:**
- Modify: `extension-vinted/README.md`
- Modify: `TODOS.md`

**Interfaces:** aucune. Cette tâche ne change aucun comportement.

- [ ] **Step 1: Corriger le parcours décrit dans le README de l'extension**

Dans `extension-vinted/README.md`, section « Ce que fait l'extension », remplacer les points 1 à 4 par :

```markdown
1. Dans `/mise-en-vente`, étape 4, « Tout mettre en brouillon sur Vinted » (ou
   « Publier sur Vinted » sur une seule fiche).
2. Un pop-up demande le délai à laisser entre deux annonces : un délai fixe, ou
   une fourchette aléatoire, en minutes entières. Le dernier réglage est
   reproposé au lancement suivant.
3. MyFlip enregistre chaque article en statut *Brouillon*, puis met l'annonce en
   file dans l'extension. **Aucun onglet ne s'ouvre à ce moment-là.**
4. L'extension traite **un article à la fois**. Le premier part tout de suite ;
   pour chacun des suivants, elle attend un délai tiré dans la fourchette du
   lot, ouvre un onglet Vinted, remplit tout le formulaire, puis clique
   « Sauvegarder le brouillon ».
5. L'onglet se ferme tout seul quand le brouillon est enregistré, et l'article
   suivant démarre son propre délai.
```

Remplacer entièrement la section « Le délai doit être réglé » par :

```markdown
## Le délai voyage avec le lot

Il n'y a plus rien à régler avant de lancer, et plus rien à visiter : le délai
se choisit dans le pop-up, au moment où il sert, et **chaque entrée de la file
porte le sien**. Deux lots lancés avec des réglages différents s'enchaînent donc
correctement, au lieu que le second impose le sien au premier.

Jusqu'au 08/09/2026, la fourchette était un réglage de compte que ce content
script allait lire dans le DOM de `/compte`. Si `/compte` n'avait jamais été
visité, rien ne partait et rien ne le disait — c'est ce mode de panne muet que
le pop-up supprime.

Une entrée qui arriverait sans délai exploitable (mise en file par une version
antérieure de l'extension) retombe sur 2 à 5 minutes, jamais sur zéro.
```

- [ ] **Step 2: Corriger le commentaire orphelin de `lib/vintedMapping.ts`**

Sa ligne 4 renvoie à une fonction qui n'existe plus depuis la Tâche 2 :

```ts
// Pas de cascade façon pickPrompt()/pickPrix() (marque seule, catégorie
```

devient

```ts
// Pas de cascade façon pickPrompt() (marque seule, catégorie
```

Une seule ligne, et rien d'autre dans ce fichier : c'est un orphelin créé par ce chantier, pas une amélioration de voisinage.

- [ ] **Step 3: Restaurer l'explication perdue dans `content-myflip.js`**

La réécriture de l'en-tête en Tâche 7 a emporté le paragraphe qui disait **pourquoi** `reagirALaRoute()` doit être ré-évaluée à chaque navigation SPA. Le mécanisme est intact ; seule sa raison d'être a disparu, et c'est elle qui empêche un successeur de « simplifier » la fonction en lecture unique — un bug déjà trouvé en revue lors du chantier précédent.

Ajouter ce commentaire **juste au-dessus de `function reagirALaRoute()`** (l'en-tête du fichier, lui, ne bouge plus : il traite désormais la question distincte du périmètre du manifest) :

```js
/**
 * Ré-évaluée à CHAQUE navigation détectée, pas seulement à l'injection.
 *
 * MyFlip navigue en SPA (`components/Sidebar.tsx` utilise `next/link`) : un
 * content script s'injecte une fois par CHARGEMENT DE PAGE RÉEL, jamais par
 * changement de route côté client. Quelqu'un qui atterrit sur `/dashboard`
 * après connexion puis clique vers `/mise-en-vente` dans la barre latérale ne
 * provoque donc AUCUNE nouvelle injection. Si `location.pathname` n'était lu
 * qu'une fois au chargement du script, l'écouteur de publication ne
 * s'attacherait jamais dans ce parcours pourtant banal — c'est exactement le
 * bug trouvé en revue lors du chantier de remplissage (09/2026).
 */

- [ ] **Step 4: Mettre `TODOS.md` à jour**

Supprimer la section `## P2 · Le prix dans le prompt, le délai dans un pop-up — cadré le 08/09/2026` et la remplacer par :

```markdown
## P2 · Suites du chantier « prix dans le prompt, délai en pop-up » — livré le 08/09/2026

Plan : `docs/superpowers/plans/2026-09-08-prix-prompt-delai-popup.md`.
Deux choses ont été différées par le cadrage, notées ici pour ne pas les perdre :

- [ ] **La matière, la taille et la catégorie Vinted dans le prompt.** Décision
      du 08/09 : le prix seul pour l'instant. Le reste continue de venir de
      `lib/vintedMapping.ts`. La catégorie pose un problème propre — la rendre
      éditable obligerait à connaître les identifiants Vinted par cœur, donc
      elle demanderait une liste déroulante alimentée par un relevé.
- [ ] **Les délais en secondes.** Écartés explicitement : minutes entières.
      À rouvrir seulement si un essai réel montre que la minute est trop grossière.
```

L'item « Reporter les prix de `PrixReference` dans les prompts » disparaît : il est traité par la Tâche 1 (relevé) et la Tâche 3 (ressaisie).

Puis ajouter, juste après cette section, un item neuf — relevé le 08/09/2026 en comparant MyFlip au concurrent **Le Troc Futé**, et **hors périmètre de ce chantier** :

```markdown
## P2 · Voyant « connecté à Vinted » — relevé le 08/09/2026

**Quoi.** Un écran qui dit, avant de lancer quoi que ce soit : extension
installée ✓, session Vinted détectée ✓. Sa place naturelle est `/compte`, dans
la section que ce chantier vient d'y vider.

**Pourquoi.** Le concurrent Le Troc Futé ouvre son parcours par une page
« Connexion Vinted » qui affiche « Connexion Vinted détectée ». Ce n'est PAS
une autorisation façon OAuth — Vinted n'en propose aucune à un tiers — et sa
capture d'écran le dit elle-même : le service repose sur **une extension
Firefox** (« Vérifiez que l'extension dispose des autorisations nécessaires »,
« Version actuellement installée : 2.0.9 »), plus une session Vinted ouverte
dans le navigateur. C'est exactement la mécanique de MyFlip.

**Donc rien à construire côté connexion.** Ce qui manque n'est pas une
capacité, c'est un **retour visible** : aujourd'hui on lance et on espère.
C'est le même défaut que les pannes muettes corrigées par ce chantier.

⚠️ Aramis a écarté le 08/09/2026 l'hypothèse d'un fonctionnement navigateur
fermé chez le concurrent : il n'y a pas d'écart de capacité entre les deux
produits, seulement d'affichage. Ne pas rouvrir ce point.

**Ce que ça demande.** `extensionPresente()` existe déjà
(`app/mise-en-vente/_publierVinted.ts`) pour le premier voyant. Le second
— « session Vinted détectée » — demande que l'extension regarde vinted.fr, ce
qu'aucune permission actuelle ne couvre : `host_permissions` s'arrête à
`https://www.vinted.fr/items/new*`.
```

- [ ] **Step 5: Vérification finale, les trois commandes**

Run: `npx tsc --noEmit`
Expected : aucune sortie, exit 0.

Run: `npx vitest run`
Expected : aucun échec. Reporter le total tel qu'il s'affiche, sans le comparer aux 177 de la baseline — six tests ont disparu avec `pickPrix.test.ts`, une trentaine sont arrivés.

Run: `cd extension-vinted && npx web-ext lint --self-hosted`
Expected : `errors 0`, `warnings 2`.

⚠️ **Ne pas lancer `npm run build`.**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: describe the batch delay popup and close the priced-prompt chantier"
```

- [ ] **Step 7: Dire ce qui n'a pas été vérifié**

En rendant la main, énoncer explicitement — et sans l'adoucir :

- **Rien n'a tourné dans un navigateur.** Le pop-up, le champ de prix du
  formulaire de prompt, le pré-remplissage de la fiche, le message porté par le
  `CustomEvent` et sa traversée de la frontière Xray : aucun n'a été exécuté.
  `tsc`, `vitest` et `web-ext lint` n'en disent rien.
- **Le prix d'un vrai brouillon Vinted n'a toujours jamais été vérifié.** C'est
  l'inconnu du chantier précédent, et il reste entier.

---

## Ce que ce plan ne couvre pas, et qui reste à Aramis

**Tout est regroupé ici, en une seule fois.** Aramis a demandé le 08/09/2026 à
n'ouvrir MyFlip qu'une seule fois, une fois tout en place : aucune tâche de ce
plan ne s'interrompt pour lui.

1. **Ressaisir les prix dans les prompts.** Ils sont relevés dans
   `docs/audits/2026-09-08-prix-reference-avant-migration.md` ; la migration ne
   les reporte pas, elle ne saurait pas quel prompt choisir quand plusieurs
   correspondent. Dans `/parametres`, champ « Prix de référence (€) » du
   formulaire de prompt.

   ℹ️ **Relevé du 08/09/2026 : la table était VIDE sur dev — 0 ligne.** La spec
   §4.2 l'annonçait peuplée ; elle ne l'était pas (vérifié deux fois, sur
   l'endpoint dev `ep-autumn-morning-asmqan0o`, avec 16 prompts et 14 comptes
   au même instant). Il n'y a donc rien à ressaisir côté dev.

   ⚠️ **Mais la production n'a pas été interrogée** — aucun accès production
   n'a été autorisé pour cette session. **Avant d'appliquer la migration en
   production**, relever la table là-bas :
   `SELECT * FROM "PrixReference";`. Si elle porte des lignes, elles seront
   détruites par `DROP TABLE`, et elles sont les seules à ne pas avoir de
   sauvegarde. C'est le point 2 ci-dessous qui en dépend.
2. **Appliquer les migrations en production avant toute fusion dans `main`.**
   `vercel.json` s'arrête à `prisma generate`, jamais `migrate deploy` :
   fusionner sans ça déploie du code qui interroge une colonne absente, ce qui
   donne une page vide, pas une erreur. Les trois migrations en attente
   s'appliqueront d'affilée.
3. **Le premier passage réel de l'extension**, et la vérification du prix du
   brouillon créé. Le mode d'emploi est dans `HANDOFF.md` ; il faut un
   `npm run dev` depuis la racine du worktree et `http://localhost:3000` —
   `myflip-app.vercel.app` tourne sur `main`, qui n'a rien de ce chantier.
   Le réglage de délai à mettre pour l'essai n'est plus dans `/compte` : c'est
   « délai fixe, 0 minute » dans le pop-up.
