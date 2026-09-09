# Extension Vinted — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un clic sur « Publier sur Vinted » dans MyFlip enregistre l'article en brouillon et transmet titre/description/prix/photos à une extension Firefox qui, après un délai anti-ban, pré-remplit le formulaire Vinted — sans jamais toucher aux menus à sélection ni cliquer sur « Enregistrer ».

**Architecture:** Deux lanes indépendantes. Côté MyFlip : un champ prix suggéré (`pickPrix()`, calqué sur `pickPrompt()`), sa table de référence `PrixReference` avec CRUD dans `/parametres`, et le bouton « Publier » qui enregistre le brouillon puis notifie l'extension — jamais l'inverse. Côté extension (Manifest V3, nouveau dossier `extension-vinted/`, JS simple sans bundler) : un service worker apparie chaque nouvel onglet Vinted à son article via `tabs.onCreated` (jamais une file FIFO consommée au hasard — voir le spec), tire et persiste le délai anti-ban en IndexedDB, et un content script remplit les champs.

**Tech Stack:** Next.js 15 / React 18 / Prisma / Vitest (existant). Extension : WebExtensions API (Manifest V3), JavaScript ES2022 sans TypeScript ni bundler — décision de ce plan, voir Global Constraints.

**Spec:** `docs/superpowers/specs/2026-08-18-extension-vinted-design.md`

## Global Constraints

- **JS simple pour l'extension, pas de TypeScript ni de bundler.** ~500 lignes réparties sur 4 fichiers ne justifient pas d'ajouter un toolchain de build à un dossier qui n'en a pas besoin — et un `.xpi` signé se construit directement depuis les fichiers sources, sans étape de compilation à maintenir. Décision de ce plan (non tranchée dans le spec).
- **Manifest V3 obligatoire**, service worker non persistant — tout état (paires onglet↔article, minuteurs) doit être reconstructible depuis IndexedDB à chaque réveil. Aucun `setTimeout` en mémoire ne doit porter une information qui ne survit pas ailleurs.
- **Firefox desktop uniquement** — `browser_specific_settings.gecko_android` doit exclure Android.
- **Aucun clic automatique sur « Enregistrer en brouillon »** côté Vinted, en aucune circonstance.
- **Marque, catégorie, taille, état ne sont jamais remplis automatiquement** — seulement titre, description, prix, photos.
- **Rien n'est mis en file si le PATCH `/api/articles/[id]` échoue** — invariant testé, pas seulement documenté.
- **Convention de test du repo** : ce projet teste la logique pure (`lib/*.test.ts`, `_reducer.test.ts`), pas les routes API Next.js ni les composants React directement (aucun des 11 fichiers de test existants n'en est un). Ce plan suit cette convention — pas de test de route inventé où l'existant n'en a pas.
- **Vitest ramasse les fichiers `*.test.js`/`*.test.ts` par défaut sur tout le repo** (aucun `vitest.config.*` trouvé) — `extension-vinted/pairing.test.js` sera exécuté par `npm run test` sans configuration supplémentaire.

---

## Lane A — MyFlip (prix, PrixReference, bouton Publier)

### Task 1: Modèle Prisma `PrixReference` + migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: modèle `PrixReference { id, marque, categorie, prix, estDefaut, createdAt, updatedAt, userId }`, consommé par Task 2 (`pickPrix`) et Task 3-4 (routes API).

- [ ] **Step 1: Ajouter le modèle**

Ajouter à `prisma/schema.prisma`, juste après le modèle `PromptTemplate` (qu'il calque exactement) :

```prisma
model PrixReference {
  id        String   @id @default(cuid())
  marque    String? // critère de correspondance ; null = toutes les marques
  categorie String? // critère de correspondance ; null = toutes les catégories
  prix      Float
  estDefaut Boolean  @default(false) // prix de repli si aucune correspondance
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, estDefaut])
  @@index([marque])
  @@index([categorie])
}
```

Ajouter la relation inverse sur `model User` : `prixReferences PrixReference[]` à côté de `promptTemplates PromptTemplate[]` existant.

- [ ] **Step 2: Générer et appliquer la migration**

Run: `npx prisma migrate dev --name add_prix_reference`
Expected: migration créée dans `prisma/migrations/`, appliquée sans erreur, `PrixReference` visible dans `npx prisma studio`.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add PrixReference model"
```

---

### Task 2: `lib/pickPrix.ts` — sélection du prix par précision décroissante

**Files:**
- Create: `lib/pickPrix.ts`
- Create: `lib/pickPrix.test.ts`

**Interfaces:**
- Consumes: rien (fonction pure).
- Produces: `pickPrix(refs: PrixReferenceDTO[], marque: string | null, categorie: string | null): PrixReferenceDTO | null`, utilisée par Task 6 (QCM).
- Produces (type): `PrixReferenceDTO = { id: string; marque: string | null; categorie: string | null; prix: number; estDefaut: boolean; createdAt: string; updatedAt: string }` — à ajouter dans `lib/types.ts`, juste après `PromptTemplateDTO`.

- [ ] **Step 1: Ajouter le type DTO**

Dans `lib/types.ts`, après la définition de `PromptTemplateDTO` :

```ts
export type PrixReferenceDTO = {
  id: string;
  marque: string | null;
  categorie: string | null;
  prix: number;
  estDefaut: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
};
```

- [ ] **Step 2: Écrire les tests (avant l'implémentation)**

`pickPrompt()` — le modèle exact de cette fonction — n'a lui-même aucun test dans ce repo. Ne pas reproduire cette lacune : `pickPrix()` a les siens dès sa création.

```ts
// lib/pickPrix.test.ts
import { describe, expect, it } from "vitest";
import { pickPrix } from "./pickPrix";
import type { PrixReferenceDTO } from "./types";

function ref(p: Partial<PrixReferenceDTO>): PrixReferenceDTO {
  return {
    id: "id",
    marque: null,
    categorie: null,
    prix: 0,
    estDefaut: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...p,
  };
}

describe("pickPrix", () => {
  it("choisit la correspondance exacte marque + catégorie", () => {
    const refs = [
      ref({ marque: "Tommy Hilfiger", categorie: "Pull", prix: 22 }),
      ref({ marque: "Tommy Hilfiger", categorie: null, prix: 18 }),
      ref({ marque: null, categorie: null, prix: 10, estDefaut: true }),
    ];
    expect(pickPrix(refs, "Tommy Hilfiger", "Pull")?.prix).toBe(22);
  });

  it("retombe sur la marque seule si pas de correspondance catégorie", () => {
    const refs = [
      ref({ marque: "Ralph Lauren", categorie: null, prix: 24 }),
      ref({ marque: null, categorie: null, prix: 10, estDefaut: true }),
    ];
    expect(pickPrix(refs, "Ralph Lauren", "Short")?.prix).toBe(24);
  });

  it("retombe sur la catégorie seule si pas de correspondance marque", () => {
    const refs = [
      ref({ marque: null, categorie: "Polo", prix: 15 }),
      ref({ marque: null, categorie: null, prix: 10, estDefaut: true }),
    ];
    expect(pickPrix(refs, "Marque Inconnue", "Polo")?.prix).toBe(15);
  });

  it("retombe sur le prix par défaut si rien ne correspond", () => {
    const refs = [ref({ marque: null, categorie: null, prix: 10, estDefaut: true })];
    expect(pickPrix(refs, "Inconnu", "Inconnu")?.prix).toBe(10);
  });

  it("renvoie null si la liste est vide", () => {
    expect(pickPrix([], "Nike", "Short")).toBeNull();
  });

  it("renvoie null si rien ne correspond et pas de défaut", () => {
    const refs = [ref({ marque: "Nike", categorie: "Short", prix: 20 })];
    expect(pickPrix(refs, "Adidas", "Polo")).toBeNull();
  });
});
```

- [ ] **Step 3: Run pour vérifier l'échec**

Run: `npx vitest run lib/pickPrix.test.ts`
Expected: FAIL — `Cannot find module './pickPrix'`

- [ ] **Step 4: Implémenter**

```ts
// lib/pickPrix.ts
// Sélection du prix de référence (pur, client + serveur) — calque exact
// de pickPrompt() (lib/promptSelect.ts), même logique de précision décroissante.
import type { PrixReferenceDTO } from "./types";

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/**
 * Choisit le prix le plus pertinent pour un article, par précision décroissante :
 * 1. marque + catégorie exactes
 * 2. marque exacte (catégorie « toutes »)
 * 3. catégorie exacte (marque « toutes »)
 * 4. prix marqué par défaut
 * Renvoie null si la liste est vide ou si rien ne correspond.
 */
export function pickPrix(
  refs: PrixReferenceDTO[],
  marque: string | null,
  categorie: string | null,
): PrixReferenceDTO | null {
  const m = norm(marque);
  const c = norm(categorie);

  const exact = refs.find(
    (r) => r.marque && r.categorie && norm(r.marque) === m && norm(r.categorie) === c,
  );
  if (exact) return exact;

  const parMarque = refs.find((r) => r.marque && !r.categorie && norm(r.marque) === m);
  if (parMarque) return parMarque;

  const parCategorie = refs.find(
    (r) => r.categorie && !r.marque && norm(r.categorie) === c,
  );
  if (parCategorie) return parCategorie;

  const defaut = refs.find((r) => r.estDefaut);
  if (defaut) return defaut;

  return null;
}
```

- [ ] **Step 5: Run pour vérifier le succès**

Run: `npx vitest run lib/pickPrix.test.ts`
Expected: PASS — 6/6 tests.

- [ ] **Step 6: Commit**

```bash
git add lib/pickPrix.ts lib/pickPrix.test.ts lib/types.ts
git commit -m "feat: add pickPrix, the price-matching pure function for Vinted extension"
```

---

### Task 3: `GET/POST /api/prix`

**Files:**
- Create: `app/api/prix/route.ts`
- Create: `lib/prixServer.ts`

**Interfaces:**
- Consumes: `pickPrix` non utilisé ici (côté client, Task 6) ; réutilise `getUserId`, `unauthorized` de `lib/apiAuth.ts`.
- Produces: `toPrixDTO(p: PrixReference): PrixReferenceDTO`, réutilisée par Task 4.

- [ ] **Step 1: Le convertisseur DTO**

```ts
// lib/prixServer.ts
import type { PrixReference } from "@prisma/client";
import type { PrixReferenceDTO } from "./types";

export function toPrixDTO(p: PrixReference): PrixReferenceDTO {
  return {
    id: p.id,
    marque: p.marque,
    categorie: p.categorie,
    prix: p.prix,
    estDefaut: p.estDefaut,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 2: La route, calquée sur `/api/prompts/route.ts`**

```ts
// app/api/prix/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized } from "@/lib/apiAuth";
import { toPrixDTO } from "@/lib/prixServer";

export const dynamic = "force-dynamic";

type Body = {
  marque?: string | null;
  categorie?: string | null;
  prix?: number;
  estDefaut?: boolean;
};

// Normalise un critère : "" ou "Toutes" → null (s'applique à tout).
function critere(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "toutes") return null;
  return t;
}

// GET /api/prix — liste
export async function GET() {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const prix = await prisma.prixReference.findMany({
      where: { userId },
      orderBy: [{ estDefaut: "desc" }, { marque: "asc" }],
    });
    return NextResponse.json(prix.map(toPrixDTO));
  } catch (err) {
    console.error("GET /api/prix", err);
    return NextResponse.json(
      { error: "Erreur lors du chargement des prix de référence." },
      { status: 500 },
    );
  }
}

// POST /api/prix — création
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const body = (await req.json()) as Body;
    const prix = Number(body.prix);
    if (!Number.isFinite(prix) || prix <= 0) {
      return NextResponse.json({ error: "Prix invalide." }, { status: 400 });
    }

    const estDefaut = Boolean(body.estDefaut);
    const data = {
      prix,
      marque: critere(body.marque),
      categorie: critere(body.categorie),
      estDefaut,
      userId,
    };

    const created = await prisma.$transaction(async (tx) => {
      // Un seul prix par défaut à la fois — par utilisateur.
      if (estDefaut) {
        await tx.prixReference.updateMany({
          where: { userId, estDefaut: true },
          data: { estDefaut: false },
        });
      }
      return tx.prixReference.create({ data });
    });

    return NextResponse.json(toPrixDTO(created), { status: 201 });
  } catch (err) {
    console.error("POST /api/prix", err);
    return NextResponse.json(
      { error: "Erreur lors de la création du prix de référence." },
      { status: 500 },
    );
  }
}
```

Pas de test dédié à cette route : convention du repo (voir Global Constraints) — `/api/prompts`, son modèle exact, n'en a pas non plus. La logique de correspondance testée (Task 2) est ce qui compte.

- [ ] **Step 3: Vérification manuelle**

Run: `npm run dev`, puis dans un autre terminal (remplacer le cookie de session par le tien) :
```bash
curl -X POST http://localhost:3000/api/prix -H "Content-Type: application/json" -H "Cookie: <ta session>" -d '{"marque":"Tommy Hilfiger","categorie":"Pull","prix":22}'
curl http://localhost:3000/api/prix -H "Cookie: <ta session>"
```
Expected: 201 puis 200 avec le tableau contenant l'entrée créée.

- [ ] **Step 4: Commit**

```bash
git add app/api/prix/route.ts lib/prixServer.ts
git commit -m "feat(api): add GET/POST /api/prix"
```

---

### Task 4: `PATCH/DELETE /api/prix/[id]`

**Files:**
- Create: `app/api/prix/[id]/route.ts`

**Interfaces:**
- Consumes: `toPrixDTO` (Task 3), `getUserId`/`unauthorized`/`notFound` (`lib/apiAuth.ts`).

- [ ] **Step 1: Implémenter, calqué sur `/api/prompts/[id]/route.ts`**

```ts
// app/api/prix/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserId, unauthorized, notFound } from "@/lib/apiAuth";
import { toPrixDTO } from "@/lib/prixServer";

type Body = {
  marque?: string | null;
  categorie?: string | null;
  prix?: number;
  estDefaut?: boolean;
};

function critere(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (!t || t.toLowerCase() === "toutes") return null;
  return t;
}

// PATCH /api/prix/[id] — édition
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const owned = await prisma.prixReference.findFirst({
      where: { id: params.id, userId },
      select: { id: true },
    });
    if (!owned) return notFound("Prix de référence");

    const body = (await req.json()) as Body;
    const data: Record<string, unknown> = {};
    if (body.prix !== undefined) {
      const prix = Number(body.prix);
      if (!Number.isFinite(prix) || prix <= 0) {
        return NextResponse.json({ error: "Prix invalide." }, { status: 400 });
      }
      data.prix = prix;
    }
    if (body.marque !== undefined) data.marque = critere(body.marque);
    if (body.categorie !== undefined) data.categorie = critere(body.categorie);
    if (body.estDefaut !== undefined) data.estDefaut = Boolean(body.estDefaut);

    const updated = await prisma.$transaction(async (tx) => {
      if (data.estDefaut === true) {
        await tx.prixReference.updateMany({
          where: { userId, estDefaut: true, id: { not: params.id } },
          data: { estDefaut: false },
        });
      }
      return tx.prixReference.update({ where: { id: params.id }, data });
    });

    return NextResponse.json(toPrixDTO(updated));
  } catch (err) {
    console.error("PATCH /api/prix/[id]", err);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour." },
      { status: 500 },
    );
  }
}

// DELETE /api/prix/[id]
export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const userId = await getUserId();
  if (!userId) return unauthorized();

  try {
    const res = await prisma.prixReference.deleteMany({
      where: { id: params.id, userId },
    });
    if (res.count === 0) return notFound("Prix de référence");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/prix/[id]", err);
    return NextResponse.json(
      { error: "Erreur lors de la suppression." },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Vérification manuelle**

Run un PATCH puis un DELETE sur l'id créé à la Task 3, comme au step 3 de la Task 3.
Expected: 200 sur PATCH avec le prix mis à jour, `{ "ok": true }` sur DELETE.

- [ ] **Step 3: Commit**

```bash
git add app/api/prix/[id]/route.ts
git commit -m "feat(api): add PATCH/DELETE /api/prix/[id]"
```

---

### Task 5: Hooks + UI de gestion des `PrixReference` dans `/parametres`

**Files:**
- Modify: `lib/hooks.ts`
- Modify: `app/parametres/page.tsx`

**Interfaces:**
- Consumes: `PrixReferenceDTO` (Task 2), routes `/api/prix` (Tasks 3-4).
- Produces: hooks `usePrixReferences`, `useCreatePrix`, `useUpdatePrix`, `useDeletePrix`, consommés par Task 6 (lecture) et cette même Task (CRUD UI).

- [ ] **Step 1: Ajouter les hooks, juste après la section « Prompts (Mise en vente) » de `lib/hooks.ts`**

```ts
// ---------- Prix de référence (Extension Vinted) ----------

export type PrixInput = {
  marque: string | null;
  categorie: string | null;
  prix: number;
  estDefaut: boolean;
};

export function usePrixReferences() {
  return useQuery({
    queryKey: ["prixReferences"],
    queryFn: () => jsonFetch<PrixReferenceDTO[]>("/api/prix"),
  });
}

export function useCreatePrix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PrixInput) =>
      jsonFetch<PrixReferenceDTO>("/api/prix", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prixReferences"] }),
  });
}

export function useUpdatePrix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PrixInput> }) =>
      jsonFetch<PrixReferenceDTO>(`/api/prix/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prixReferences"] }),
  });
}

export function useDeletePrix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      jsonFetch<{ ok: true }>(`/api/prix/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prixReferences"] }),
  });
}
```

Ajouter `PrixReferenceDTO` à l'import de types en haut de `lib/hooks.ts` (à côté de `PromptTemplateDTO`).

- [ ] **Step 2: UI dans `/parametres`**

`app/parametres/page.tsx` gère déjà les prompts avec une liste + une modale d'édition (`openEdit`). Ajouter une section « Prix de référence » sur le même modèle, sous la section prompts existante :

```tsx
// Dans app/parametres/page.tsx, imports à ajouter en haut :
import {
  useCreatePrix,
  useDeletePrix,
  usePrixReferences,
  useUpdatePrix,
} from "@/lib/hooks";
import type { PrixReferenceDTO } from "@/lib/types";

// Dans le composant, à côté de l'état des prompts :
const { data: prixRefs, isLoading: prixEnCours } = usePrixReferences();
const creerPrix = useCreatePrix();
const modifierPrix = useUpdatePrix();
const supprimerPrix = useDeletePrix();
const [prixEnEdition, setPrixEnEdition] = useState<PrixReferenceDTO | null>(null);

// Section JSX, sous la liste des prompts :
<Module>
  <CardTitle>Prix de référence</CardTitle>
  <p className="mt-1 text-[13px] text-[var(--ink2)]">
    Prix suggéré automatiquement dans le QCM de mise en vente, par marque et
    catégorie.
  </p>
  {prixEnCours ? (
    <Loader label="Chargement…" size="sm" />
  ) : (
    <div className="mt-4 flex flex-col gap-2">
      {(prixRefs ?? []).map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between rounded-[14px] border border-[var(--border)] px-4 py-3"
        >
          <span className="font-mono text-[13px]">
            {p.marque ?? "Toutes marques"} · {p.categorie ?? "Toutes catégories"}
            {p.estDefaut && " · Défaut"}
          </span>
          <span className="flex items-center gap-3">
            <span className="font-mono text-[14px] font-semibold">
              {euros(p.prix)}
            </span>
            <button onClick={() => setPrixEnEdition(p)} aria-label="Modifier">
              <SquarePen className="h-4 w-4" />
            </button>
            <button
              onClick={() => supprimerPrix.mutate(p.id)}
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </span>
        </div>
      ))}
      <button
        onClick={() =>
          setPrixEnEdition({
            id: "",
            marque: null,
            categorie: null,
            prix: 0,
            estDefaut: false,
            createdAt: "",
            updatedAt: "",
          })
        }
        className={inputCls + " flex items-center justify-center gap-2"}
      >
        <Plus className="h-4 w-4" /> Ajouter un prix de référence
      </button>
    </div>
  )}
</Module>

{prixEnEdition && (
  <Modal onClose={() => setPrixEnEdition(null)} titre="Prix de référence">
    <div className="flex flex-col gap-3">
      <div>
        <label className={labelCls}>Marque (vide = toutes)</label>
        <input
          className={inputCls}
          value={prixEnEdition.marque ?? ""}
          onChange={(e) =>
            setPrixEnEdition({ ...prixEnEdition, marque: e.target.value })
          }
        />
      </div>
      <div>
        <label className={labelCls}>Catégorie (vide = toutes)</label>
        <input
          className={inputCls}
          value={prixEnEdition.categorie ?? ""}
          onChange={(e) =>
            setPrixEnEdition({ ...prixEnEdition, categorie: e.target.value })
          }
        />
      </div>
      <div>
        <label className={labelCls}>Prix (€)</label>
        <input
          type="number"
          min={0}
          step={0.5}
          className={inputCls}
          value={prixEnEdition.prix}
          onChange={(e) =>
            setPrixEnEdition({ ...prixEnEdition, prix: Number(e.target.value) })
          }
        />
      </div>
      <button
        onClick={() => {
          const input = {
            marque: prixEnEdition.marque,
            categorie: prixEnEdition.categorie,
            prix: prixEnEdition.prix,
            estDefaut: prixEnEdition.estDefaut,
          };
          if (prixEnEdition.id) {
            modifierPrix.mutate({ id: prixEnEdition.id, input });
          } else {
            creerPrix.mutate(input);
          }
          setPrixEnEdition(null);
        }}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[var(--acc)] text-[13px] font-bold text-[var(--acc-ink)]"
      >
        <Check className="h-4 w-4" /> Enregistrer
      </button>
    </div>
  </Modal>
)}
```

Pas de test dédié (convention du repo — aucun composant React n'est testé directement dans ce projet, cf. la liste des 11 fichiers de test existants).

- [ ] **Step 3: Vérification manuelle**

Run: `npm run dev`, ouvrir `/parametres`, créer un prix de référence, le modifier, le supprimer.
Expected : la liste se met à jour à chaque opération, une seule entrée `estDefaut` reste vraie à la fois.

- [ ] **Step 4: Commit**

```bash
git add lib/hooks.ts app/parametres/page.tsx
git commit -m "feat(parametres): manage PrixReference entries"
```

---

### Task 6: Champ prix dans le QCM, pré-rempli par `pickPrix()`

**Files:**
- Modify: `app/mise-en-vente/_reducer.ts`
- Modify: `app/mise-en-vente/_components/FicheArticle.tsx`
- Modify: `app/mise-en-vente/_reducer.test.ts`

**Interfaces:**
- Consumes: `pickPrix` (Task 2), `usePrixReferences` (Task 5).
- Produces: `Qcm.prix: string`, lu par Task 7 (`enregistrer()`).

- [ ] **Step 1: Étendre le test existant du reducer**

Ouvrir `app/mise-en-vente/_reducer.test.ts`, trouver le test qui exerce l'action `{ type: "qcm", champ, valeur }` sur un champ existant (ex. `"details"`), et ajouter un cas équivalent pour `"prix"` :

```ts
it("met à jour le champ prix du QCM comme n'importe quel autre champ", () => {
  const etat = /* état initial existant du test, ou un état minimal construit comme les autres tests du fichier */;
  const suivant = reducer(etat, {
    type: "qcm",
    id: PREMIERE_FICHE,
    champ: "prix",
    valeur: "22",
  });
  expect(suivant.fiches[0].qcm.prix).toBe("22");
});
```

(Le nom exact de l'état initial et de `PREMIERE_FICHE` doit reprendre celui déjà utilisé par les tests voisins dans ce fichier — le reducer traite déjà `"prix"` comme n'importe quel `keyof Qcm` sans code dédié, donc ce test documente le comportement plutôt que de piloter une nouvelle branche.)

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run app/mise-en-vente/_reducer.test.ts`
Expected: FAIL — `qcm.prix` est `undefined` (le champ n'existe pas encore sur le type `Qcm`).

- [ ] **Step 3: Ajouter le champ au type**

Dans `app/mise-en-vente/_reducer.ts`, étendre `Qcm` (dernier champ, après `details`) :

```ts
export type Qcm = {
  marque: string;
  marqueCustom: boolean;
  categorie: string;
  categorieCustom: boolean;
  taille: string;
  etat: string;
  matiere: string;
  matiere2: string;
  details: string;
  prix: string;
};
```

Mettre à jour l'état initial de chaque fiche (`prix: ""`) partout où un `Qcm` vide est construit dans ce fichier.

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npx vitest run app/mise-en-vente/_reducer.test.ts`
Expected: PASS.

- [ ] **Step 5: Champ dans le formulaire, pré-rempli par `pickPrix()`**

Dans `app/mise-en-vente/_components/FicheArticle.tsx`, après le bloc « Infos supplémentaires » (`details`, autour de la ligne 433), ajouter :

```tsx
<div className={`${cardCls} p-5 md:px-6`}>
  <label className={labelCls}>Prix suggéré</label>
  <input
    type="number"
    min={0}
    step={0.5}
    inputMode="decimal"
    value={qcm.prix}
    onChange={(e) => onQcm("prix", e.target.value)}
    placeholder="0,00"
    className={`${inputCls} mt-2 font-mono`}
  />
</div>
```

`font-mono` applique JetBrains Mono, convention Direction C pour les montants (décision de la revue Design).

Pré-remplissage : dans le composant parent qui possède déjà `usePrixReferences` (ou en important le hook directement dans `FicheArticle.tsx` si l'état des fiches y est géré), au moment où marque/catégorie sont détectées ou modifiées, appeler `pickPrix(prixRefs ?? [], qcm.marque, qcm.categorie)` et, **seulement si `qcm.prix` est encore vide** (ne jamais écraser une valeur déjà saisie par Aramis), dispatcher `onQcm("prix", String(match.prix))`.

- [ ] **Step 6: Vérification manuelle**

Run: `npm run dev`, aller sur `/mise-en-vente`, sélectionner une marque/catégorie qui correspond à un prix de référence créé en Task 5.
Expected : le champ prix se pré-remplit ; le modifier à la main puis changer de marque ne doit pas l'écraser.

- [ ] **Step 7: Commit**

```bash
git add app/mise-en-vente/_reducer.ts app/mise-en-vente/_reducer.test.ts app/mise-en-vente/_components/FicheArticle.tsx
git commit -m "feat(mise-en-vente): add price field to QCM, pre-filled by pickPrix"
```

---

### Task 7: `enregistrer()` envoie `prixVente`

**Files:**
- Modify: `app/mise-en-vente/page.tsx`

**Interfaces:**
- Consumes: `Qcm.prix` (Task 6). `PATCH /api/articles/[id]` accepte déjà `prixVente` — **aucun changement d'API nécessaire** (vérifié en revue CEO).

- [ ] **Step 1: Étendre le corps du PATCH**

Dans `enregistrer()` (`app/mise-en-vente/page.tsx:349`), le corps envoyé par `updateArticle.mutateAsync` :

```ts
await updateArticle.mutateAsync({
  id: f.article.id,
  patch: {
    titreAnnonce: f.annonce.titre,
    descriptionAnnonce: f.annonce.description,
    motsClesAnnonce: f.annonce.motsCles,
    prixVente: f.qcm.prix ? Number(f.qcm.prix) : undefined,
    statut,
  },
  differerInvalidation: true,
});
```

Pas de test dédié à cette fonction (convention du repo — aucun test existant sur `enregistrer()` elle-même) ; la Task 8 couvre le comportement critique (rien n'est publié si l'enregistrement échoue) au niveau du bouton, qui appelle cette fonction.

- [ ] **Step 2: Vérification manuelle**

Générer une annonce avec un prix rempli, cliquer « Brouillon », vérifier dans `/stock` que `prixVente` est bien enregistré sur l'article.

- [ ] **Step 3: Commit**

```bash
git add app/mise-en-vente/page.tsx
git commit -m "feat(mise-en-vente): include prixVente when saving an article"
```

---

### Task 8: Bouton « Publier sur Vinted » — PATCH gaté, événement de mise en file, anti-double-clic

**Files:**
- Modify: `app/mise-en-vente/_components/ExportAnnonces.tsx`
- Modify: `app/mise-en-vente/page.tsx`

**Interfaces:**
- Consumes: `enregistrer()` (Task 7).
- Produces: `CustomEvent("myflip:publier-vinted", { detail: { titre, description, prix, photos, articleId } })`, consommé par l'extension (Task 14).

- [ ] **Step 1: Nouvelle prop `onPublierVinted` sur `ExportAnnonces`**

Dans `page.tsx`, où `ExportAnnonces` est rendu, ajouter un gestionnaire qui réutilise `enregistrer()` :

```ts
async function publierVinted(f: ArticleEnCours) {
  if (!f.article) return;
  const succes = await enregistrer([f.article.id], "Brouillon");
  if (!succes) return; // rien n'est publié si l'enregistrement échoue
  window.dispatchEvent(
    new CustomEvent("myflip:publier-vinted", {
      detail: {
        articleId: f.article.id,
        titre: f.annonce.titre,
        description: f.annonce.description,
        prix: f.qcm.prix,
        photos: f.photos.map((p) => p.blob), // Blob pleine résolution, cf. _reducer.ts
      },
    }),
  );
  window.open("https://www.vinted.fr/items/new", "_blank", "noopener,noreferrer");
}
```

`enregistrer()` doit renvoyer un booléen de succès (actuellement elle ne renvoie rien) : modifier sa signature pour `return true` en fin de boucle si aucun `erreurEnregistrement` n'a été déclenché pour l'id concerné, `false` sinon.

- [ ] **Step 2: Le bouton dans `ExportAnnonces.tsx`**

Remplacer le `<a href="https://www.vinted.fr/items/new" target="_blank" ...>` (`:204`) par :

```tsx
<button
  disabled={enregistrementEnCours}
  onClick={() => onPublierVinted(f.id)}
  className="flex w-full items-center gap-2.5 rounded-[14px] bg-[#09B1BA] px-4 py-3 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
>
  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-white/20 font-grotesk text-[15px] font-extrabold text-white">
    V
  </span>
  <span className="text-[13px] font-bold text-white">Publier sur Vinted</span>
  <ArrowRight className="ml-auto h-4 w-4 flex-none text-white" strokeWidth={2.3} />
</button>
```

Ajouter `onPublierVinted: (id: string) => void` aux `Props` du composant, câblé depuis `page.tsx` vers `publierVinted`.

**Pourquoi un `<button>` avec `preventDefault` implicite plutôt qu'un `<a target="_blank">`** : un lien ouvrirait l'onglet Vinted *au clic*, avant que le PATCH asynchrone ait résolu — un échec produirait quand même un onglet, donc un événement `tabs.onCreated` orphelin côté extension, ce qui décalerait l'appariement onglet↔article de tous les onglets suivants ouverts dans la même session (bug trouvé en revue Eng sur ce point précis). `window.open()` n'est appelé qu'après succès confirmé.

- [ ] **Step 3: Test du gate succès/échec**

```ts
// Dans un test existant ou nouveau proche de _persistance.test.ts / _reducer.test.ts,
// selon où les mocks de mutation sont déjà en place dans ce fichier de test.
it("ne déclenche jamais l'événement de publication si l'enregistrement échoue", async () => {
  const dispatchSpy = vi.spyOn(window, "dispatchEvent");
  mockUpdateArticle.mutateAsync.mockRejectedValueOnce(new Error("réseau"));

  await publierVinted(ficheDeTest);

  expect(dispatchSpy).not.toHaveBeenCalledWith(
    expect.objectContaining({ type: "myflip:publier-vinted" }),
  );
});
```

Adapter les noms de mock (`mockUpdateArticle`, `ficheDeTest`) aux conventions déjà en place dans le fichier de test choisi — ce test matérialise l'invariant critique identifié par la revue Eng et doit exister avant que la fonctionnalité soit considérée livrée.

- [ ] **Step 4: Run et vérifier**

Run: `npx vitest run` (le fichier concerné)
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/mise-en-vente/_components/ExportAnnonces.tsx app/mise-en-vente/page.tsx
git commit -m "feat(mise-en-vente): gate Vinted tab opening on save success, add publish event"
```

---

### Task 9: Réglages délai anti-ban dans `/compte`

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `app/api/user/settings/route.ts`
- Modify: `components/compte/Integrations.tsx` (ou nouveau composant `components/compte/ExtensionVinted.tsx`, séparé — sujet différent des intégrations IA/Trello)

**Interfaces:**
- Produces: `UserSettings.delaiVintedMinMinutes`, `UserSettings.delaiVintedMaxMinutes` (nullable, pas de défaut — décision actée), lus par l'extension (Task 13) via un futur point d'accès (voir note Task 13).

- [ ] **Step 1: Champs Prisma**

Dans `model UserSettings`, ajouter :

```prisma
// Extension Vinted (18/08/2026) : fourchette de délai anti-ban avant
// remplissage automatique. Nullable, PAS de défaut — Aramis choisit sa
// propre fourchette ; un délai implicite de 0 annulerait le garde-fou.
delaiVintedMinMinutes Int?
delaiVintedMaxMinutes Int?
```

Run: `npx prisma migrate dev --name add_delai_vinted`

- [ ] **Step 2: API — étendre `/api/user/settings`**

Dans `app/api/user/settings/route.ts`, sur le modèle exact d'`objectifMensuel` :

Ajouter au type `Body` :
```ts
delaiVintedMinMinutes?: number | null;
delaiVintedMaxMinutes?: number | null;
```

Dans le GET, ajouter à la réponse :
```ts
delaiVintedMinMinutes: s?.delaiVintedMinMinutes ?? null,
delaiVintedMaxMinutes: s?.delaiVintedMaxMinutes ?? null,
```

Dans le PATCH, sur le modèle du bloc `objectifMensuel` (`:189-193`) :
```ts
if ("delaiVintedMinMinutes" in body || "delaiVintedMaxMinutes" in body) {
  const min = body.delaiVintedMinMinutes;
  const max = body.delaiVintedMaxMinutes;
  const minN = min == null ? null : Number(min);
  const maxN = max == null ? null : Number(max);
  if ((minN != null && (!Number.isFinite(minN) || minN < 0)) ||
      (maxN != null && (!Number.isFinite(maxN) || maxN < 0))) {
    return NextResponse.json({ error: "Délai invalide." }, { status: 400 });
  }
  if (minN != null && maxN != null && minN >= maxN) {
    return NextResponse.json(
      { error: "Le délai minimum doit être inférieur au maximum." },
      { status: 400 },
    );
  }
  if ("delaiVintedMinMinutes" in body) data.delaiVintedMinMinutes = minN;
  if ("delaiVintedMaxMinutes" in body) data.delaiVintedMaxMinutes = maxN;
}
```

- [ ] **Step 3: UI — nouveau bloc « Extension Vinted » dans `/compte`**

Nouveau composant, séparé de `Integrations.tsx` (sujet différent — décision de la revue Design) :

```tsx
// components/compte/ExtensionVinted.tsx
"use client";

import { useState } from "react";
import { Module, CardTitle } from "@/components/console";
import { useReglages, useUpdateReglages } from "@/lib/hooks"; // hooks existants de /compte, réutilisés tels quels

const labelCls =
  "font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--faint)]";
const inputCls =
  "min-h-[44px] w-full rounded-[16px] border border-[var(--border)] bg-[var(--surface-2)] px-4 text-[14px] text-[var(--ink)] outline-none transition-colors focus:border-[var(--acc)]";

export default function ExtensionVinted() {
  const { data: reglages } = useReglages();
  const update = useUpdateReglages();
  const [min, setMin] = useState(reglages?.delaiVintedMinMinutes ?? "");
  const [max, setMax] = useState(reglages?.delaiVintedMaxMinutes ?? "");

  return (
    <Module>
      <CardTitle>Extension Vinted</CardTitle>
      <p className="mt-1 text-[13px] text-[var(--ink2)]">
        Délai aléatoire avant remplissage automatique d'un nouvel onglet
        Vinted, garde-fou anti-ban. Tant qu'il n'est pas réglé, l'extension ne
        remplit rien.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Minimum (min)</label>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onBlur={() =>
              update.mutate({
                delaiVintedMinMinutes: min === "" ? null : Number(min),
              })
            }
          />
        </div>
        <div>
          <label className={labelCls}>Maximum (min)</label>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onBlur={() =>
              update.mutate({
                delaiVintedMaxMinutes: max === "" ? null : Number(max),
              })
            }
          />
        </div>
      </div>
    </Module>
  );
}
```

Monter `<ExtensionVinted />` dans `app/compte/page.tsx`, à côté de `<Integrations />`. (Adapter les noms `useReglages`/`useUpdateReglages` aux hooks réellement exportés par `lib/hooks.ts` pour `/api/user/settings` — vérifier leur nom exact en lisant ce fichier avant d'écrire ce composant, ils existent déjà puisque `objectifMensuel` les utilise.)

Cibles tactiles 44px déjà respectées (`min-h-[44px]`) — cette page reste mobile-responsive contrairement à `/mise-en-vente`.

- [ ] **Step 4: Vérification manuelle**

Régler un délai min/max dans `/compte`, recharger la page, vérifier la persistance. Essayer min ≥ max, vérifier le rejet.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/ app/api/user/settings/route.ts components/compte/ExtensionVinted.tsx app/compte/page.tsx
git commit -m "feat(compte): add Vinted extension delay settings"
```

---

### Task 16: Bouton « copier tout » (presse-papier)

**Files:**
- Modify: `app/mise-en-vente/_components/ExportAnnonces.tsx`

**Interfaces:** Aucune — fonctionnalité indépendante, P2 auto-approuvée en revue CEO.

- [ ] **Step 1: Ajouter le bouton, à côté de « Publier sur Vinted »**

```tsx
<button
  onClick={async () => {
    const texte = `${f.annonce.titre}\n\n${f.annonce.description}\n\n${f.annonce.motsCles}`;
    await navigator.clipboard.writeText(texte);
    setCopie(f.id);
    setTimeout(() => setCopie(null), 2000);
  }}
  className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-surface text-[13px] font-semibold text-[var(--ink2)] transition-colors hover:border-[var(--border-strong)]"
>
  {copie === f.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
  Copier tout
</button>
```

`copie`/`setCopie` existent déjà dans ce composant (état pour un autre bouton copier, visible dans l'en-tête du fichier). `Copy` et `Check` sont déjà importés de `lucide-react`.

- [ ] **Step 2: Vérification manuelle**

Cliquer « Copier tout », coller dans un éditeur de texte, vérifier titre/description/mots-clés dans l'ordre.

- [ ] **Step 3: Commit**

```bash
git add app/mise-en-vente/_components/ExportAnnonces.tsx
git commit -m "feat(mise-en-vente): add copy-all clipboard button"
```

---

## Lane B — Extension Firefox

### Task 10: Spike — vérifier le transport de `Blob` (content script → service worker → IndexedDB → DataTransfer)

**Files:**
- Create temporaire (non commité) : script de test manuel dans la console Firefox.

Ce n'est pas une tâche TDD classique — c'est une vérification factuelle à faire AVANT d'écrire Task 12-15, trouvée nécessaire en revue Eng.

- [ ] **Step 1: Créer une extension minimale jetable**

Manifest minimal (2 permissions, 1 content script, 1 background), avec :
```js
// content script de test
const blob = new Blob(["test"], { type: "text/plain" });
browser.runtime.sendMessage({ blob });
```
```js
// background de test
browser.runtime.onMessage.addListener((msg) => {
  console.log("Reçu :", msg.blob instanceof Blob, msg.blob?.size);
});
```

- [ ] **Step 2: Charger temporairement dans Firefox** (`about:debugging` → « Ce Firefox » → « Charger un module complémentaire temporaire ») et vérifier dans la console du background que `msg.blob instanceof Blob` est `true` et `size` correct.

Expected : si `true` → le structured clone gère les `Blob` nativement, Task 12-15 procèdent comme prévu. Si `false` (le `Blob` arrive comme objet vide ou `undefined`) → il faut convertir en `ArrayBuffer` avant l'envoi et reconstruire un `Blob` côté récepteur ; documenter ce changement dans les Tasks 14-15 avant de les écrire.

- [ ] **Step 3: Supprimer l'extension de test**, ne rien committer — ce n'est qu'une vérification.

---

### Task 11: Squelette de l'extension — manifest, structure, signature

**Files:**
- Create: `extension-vinted/manifest.json`
- Create: `extension-vinted/README.md`

- [ ] **Step 1: Le manifest**

```json
{
  "manifest_version": 3,
  "name": "MyFlip → Vinted",
  "version": "1.0.0",
  "description": "Pré-remplit un brouillon Vinted depuis une annonce générée dans MyFlip.",
  "browser_specific_settings": {
    "gecko": {
      "id": "myflip-vinted@aramis.local",
      "strict_min_version": "115.0"
    },
    "gecko_android": {
      "strict_min_version": null
    }
  },
  "permissions": ["storage", "tabs"],
  "host_permissions": [
    "https://myflip-app.vercel.app/mise-en-vente*",
    "http://localhost:3000/mise-en-vente*",
    "https://www.vinted.fr/items/new*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": [
        "https://myflip-app.vercel.app/mise-en-vente*",
        "http://localhost:3000/mise-en-vente*"
      ],
      "js": ["content-myflip.js"]
    },
    {
      "matches": ["https://www.vinted.fr/items/new*"],
      "js": ["content-vinted.js"]
    }
  ]
}
```

`gecko_android.strict_min_version: null` exclut explicitement Firefox pour Android (décision de la revue Design). Adapter le domaine de production si différent de `myflip-app.vercel.app`.

- [ ] **Step 2: `README.md` du dossier — comment signer et installer**

```md
# Extension Vinted — build & installation

Pas de build : les fichiers sources sont directement signés et packagés.

1. Compte développeur Mozilla gratuit sur https://addons.mozilla.org/developers/
2. `npx web-ext sign --api-key=<clé> --api-secret=<secret> --channel=unlisted`
   (lancé depuis ce dossier `extension-vinted/`)
3. Récupérer le `.xpi` signé produit dans `web-ext-artifacts/`
4. Firefox → Modules complémentaires et thèmes → roue crantée → « Installer
   un module depuis un fichier » → sélectionner le `.xpi`

À refaire à chaque changement de code (pas de mise à jour automatique tant
que l'extension n'est pas distribuée via l'AMO public).
```

- [ ] **Step 3: Commit**

```bash
git add extension-vinted/manifest.json extension-vinted/README.md
git commit -m "feat(extension): scaffold Vinted extension manifest"
```

---

### Task 12: Algorithme d'appariement onglet↔article (fonction pure, testée)

**Files:**
- Create: `extension-vinted/pairing.js`
- Create: `extension-vinted/pairing.test.js`

C'est la pièce la plus délicate de tout le design (seule à avoir eu un bug réel en revue) — décision #13 : elle doit avoir un test direct, pas seulement une validation manuelle.

**Interfaces:**
- Produces: `pairEvents(tabCreatedEvents, queueMessages) => { pairs: Array<{ tabId, entryId }>, unmatchedEvents: Array<...>, unmatchedMessages: Array<...> }`, consommé par Task 13.

- [ ] **Step 1: Écrire les tests (avant l'implémentation)**

```js
// extension-vinted/pairing.test.js
import { describe, expect, it } from "vitest";
import { pairEvents } from "./pairing.js";

describe("pairEvents", () => {
  it("apparie un événement à un message dans l'ordre d'arrivée, même openerTabId", () => {
    const events = [{ tabId: 100, openerTabId: 1, ts: 10 }];
    const messages = [{ entryId: "a", openerTabId: 1, ts: 5 }];
    const { pairs, unmatchedEvents, unmatchedMessages } = pairEvents(events, messages);
    expect(pairs).toEqual([{ tabId: 100, entryId: "a" }]);
    expect(unmatchedEvents).toHaveLength(0);
    expect(unmatchedMessages).toHaveLength(0);
  });

  it("apparie deux mises en file rapprochées dans l'ordre d'arrivée respectif", () => {
    const events = [
      { tabId: 100, openerTabId: 1, ts: 10 },
      { tabId: 101, openerTabId: 1, ts: 20 },
    ];
    const messages = [
      { entryId: "premier", openerTabId: 1, ts: 5 },
      { entryId: "second", openerTabId: 1, ts: 15 },
    ];
    const { pairs } = pairEvents(events, messages);
    expect(pairs).toEqual([
      { tabId: 100, entryId: "premier" },
      { tabId: 101, entryId: "second" },
    ]);
  });

  it("ne mélange pas les paires de deux onglets MyFlip différents (openerTabId distinct)", () => {
    const events = [
      { tabId: 100, openerTabId: 1, ts: 10 },
      { tabId: 200, openerTabId: 2, ts: 11 },
    ];
    const messages = [
      { entryId: "depuis-onglet-1", openerTabId: 1, ts: 5 },
      { entryId: "depuis-onglet-2", openerTabId: 2, ts: 6 },
    ];
    const { pairs } = pairEvents(events, messages);
    expect(pairs).toContainEqual({ tabId: 100, entryId: "depuis-onglet-1" });
    expect(pairs).toContainEqual({ tabId: 200, entryId: "depuis-onglet-2" });
  });

  it("un événement orphelin (PATCH échoué mais onglet quand même créé) ne décale pas les paires suivantes", () => {
    const events = [
      { tabId: 100, openerTabId: 1, ts: 10 }, // orphelin, aucun message correspondant
      { tabId: 101, openerTabId: 1, ts: 20 },
    ];
    const messages = [{ entryId: "second", openerTabId: 1, ts: 15 }];
    const { pairs, unmatchedEvents } = pairEvents(events, messages, {
      orphanTimeoutMs: 1000,
      now: 20,
    });
    // L'événement à ts:10 expire (now - ts > orphanTimeoutMs n'est pas encore
    // vrai ici à dessein — ce test vérifie surtout qu'il n'est PAS apparié
    // au message "second" juste parce qu'il est arrivé avant dans la liste
    // brute des événements) :
    expect(pairs.find((p) => p.entryId === "second")?.tabId).toBe(101);
  });

  it("un message sans événement correspondant reste non apparié, pas d'erreur", () => {
    const events = [];
    const messages = [{ entryId: "orphelin", openerTabId: 1, ts: 5 }];
    const { pairs, unmatchedMessages } = pairEvents(events, messages);
    expect(pairs).toHaveLength(0);
    expect(unmatchedMessages).toEqual([messages[0]]);
  });
});
```

- [ ] **Step 2: Run pour vérifier l'échec**

Run: `npx vitest run extension-vinted/pairing.test.js`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

```js
// extension-vinted/pairing.js
//
// Apparie chaque événement tabs.onCreated à son message de mise en file,
// PAR openerTabId, par ordre CAUSAL — un message n'est éligible pour un
// événement que si son ts est strictement antérieur à celui de l'événement,
// parce que la séquence réelle est toujours : succès du PATCH → message de
// mise en file envoyé → window.open() → tabs.onCreated. Jamais "le premier
// onglet qui charge consomme la tête d'une file générique" (bug trouvé en
// revue Design : ça mélange les articles quand plusieurs onglets sont
// ouverts dans le désordre) — et jamais un simple appariement par RANG au
// sein du même openerTabId non plus (un rang ignore l'ordre causal réel et
// peut apparier un événement à un message qui n'existait pas encore quand
// l'onglet a été créé).
//
// Un événement sans message éligible (le plus ancien message non consommé
// a un ts >= au sien, ou il n'en reste aucun) reste dans unmatchedEvents :
// il NE consomme PAS le message suivant. C'est ce qui rend le mécanisme
// robuste à un événement orphelin (PATCH échoué mais onglet quand même créé
// avant la correction Eng, ou tout autre cas non prévu) sans avoir besoin
// d'un mécanisme d'expiration par timeout séparé.

export function pairEvents(tabCreatedEvents, queueMessages) {
  const pairs = [];
  const usedMessageIndexes = new Set();
  const usedEventIndexes = new Set();

  const byOpener = new Map();
  for (let i = 0; i < queueMessages.length; i++) {
    const m = queueMessages[i];
    if (!byOpener.has(m.openerTabId)) byOpener.set(m.openerTabId, []);
    byOpener.get(m.openerTabId).push(i);
  }
  for (const indexes of byOpener.values()) {
    indexes.sort((a, b) => queueMessages[a].ts - queueMessages[b].ts);
  }

  const eventsByOpener = new Map();
  for (let i = 0; i < tabCreatedEvents.length; i++) {
    const e = tabCreatedEvents[i];
    if (!eventsByOpener.has(e.openerTabId)) eventsByOpener.set(e.openerTabId, []);
    eventsByOpener.get(e.openerTabId).push(i);
  }
  for (const indexes of eventsByOpener.values()) {
    indexes.sort((a, b) => tabCreatedEvents[a].ts - tabCreatedEvents[b].ts);
  }

  for (const [openerTabId, eventIndexes] of eventsByOpener) {
    const messageIndexes = byOpener.get(openerTabId) ?? [];
    let msgPtr = 0;
    for (const ei of eventIndexes) {
      const eventTs = tabCreatedEvents[ei].ts;
      if (msgPtr < messageIndexes.length && queueMessages[messageIndexes[msgPtr]].ts < eventTs) {
        const mi = messageIndexes[msgPtr];
        pairs.push({
          tabId: tabCreatedEvents[ei].tabId,
          entryId: queueMessages[mi].entryId,
        });
        usedEventIndexes.add(ei);
        usedMessageIndexes.add(mi);
        msgPtr++;
      }
      // Sinon : aucun message éligible pour cet événement (le plus ancien
      // message restant n'était pas encore là quand l'onglet a été créé) —
      // l'événement reste orphelin, msgPtr n'avance pas.
    }
  }

  const unmatchedEvents = tabCreatedEvents.filter((_, i) => !usedEventIndexes.has(i));
  const unmatchedMessages = queueMessages.filter((_, i) => !usedMessageIndexes.has(i));

  return { pairs, unmatchedEvents, unmatchedMessages };
}
```

- [ ] **Step 4: Run pour vérifier le succès**

Run: `npx vitest run extension-vinted/pairing.test.js`
Expected: PASS — 5/5 tests.

(Trace du test « événement orphelin » contre l'implémentation ci-dessus, vérifiée avant dispatch : événements triés `[{100,ts10},{101,ts20}]`, messages triés `[{second,ts15}]`. Pour l'événement `ts10` : `messages[0].ts=15 < 10` est faux → aucun message éligible, l'événement `100` reste orphelin, `msgPtr` n'avance pas. Pour l'événement `ts20` : `messages[0].ts=15 < 20` est vrai → apparié à `second`. Résultat : `{tabId:101, entryId:"second"}`, conforme à l'assertion du test. C'est la contrainte causale — un message n'est éligible que s'il est antérieur à l'événement — qui rend ce test correct, pas un simple appariement par rang.)

- [ ] **Step 5: Commit**

```bash
git add extension-vinted/pairing.js extension-vinted/pairing.test.js
git commit -m "feat(extension): add tab-to-article pairing algorithm with tests"
```

---

### Task 13: Service worker — file IndexedDB, tirage/persistance du délai, câblage `tabs.onCreated`

**Files:**
- Create: `extension-vinted/background.js`
- Create: `extension-vinted/db.js`

**Interfaces:**
- Consumes: `pairEvents` (Task 12).
- Consumes (données) : message `{ type: "myflip:mise-en-file", entryId, titre, description, prix, photos, openerTabId, ts }` envoyé par Task 14.
- Produces: message `{ type: "vinted:mon-entree", entry, delaiMs }` répondu à Task 15 sur demande.

- [ ] **Step 1: Le stockage IndexedDB**

```js
// extension-vinted/db.js
const DB_NAME = "myflip-vinted";
const DB_VERSION = 1;
const STORE = "entries";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "entryId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveEntry(entry) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllEntries() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteEntry(entryId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(entryId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
```

Chaque `entry` porte : `{ entryId, titre, description, prix, photos, openerTabId, ts, tabId: null, cibleMs: null }`. `tabId` et `cibleMs` (l'heure cible du délai, timestamp epoch) sont posés une fois l'appariement fait (Step 3) et le délai tiré (Step 4) — jamais recalculés après.

- [ ] **Step 2: Récupérer le délai réglé par Aramis**

```js
// dans background.js
async function lireDelaiRegle() {
  // UserSettings.delaiVintedMinMinutes/MaxMinutes (Task 9) ne sont PAS
  // exposés à l'extension via une API MyFlip (invariant : pas d'API dédiée,
  // pas d'OAuth). L'extension les lit directement dans son propre
  // browser.storage.local, où le content script MyFlip les aura copiés
  // depuis le DOM de /compte au dernier chargement de cette page — donc
  // "réglé" veut dire "Aramis a visité /compte au moins une fois après son
  // dernier changement". Documenté dans le README utilisateur de
  // l'extension (hors scope de ce plan de code).
  const { delaiMin, delaiMax } = await browser.storage.local.get(["delaiMin", "delaiMax"]);
  if (delaiMin == null || delaiMax == null) return null;
  return { delaiMin, delaiMax };
}
```

- [ ] **Step 3: Écouter les messages et les créations d'onglet**

```js
// extension-vinted/background.js
import { deleteEntry, getAllEntries, saveEntry } from "./db.js";
import { pairEvents } from "./pairing.js";

const pendingEvents = []; // { tabId, openerTabId, ts }

browser.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId == null) return;
  pendingEvents.push({ tabId: tab.id, openerTabId: tab.openerTabId, ts: Date.now() });
  reconcile();
});

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "myflip:mise-en-file") {
    await saveEntry({
      entryId: msg.entryId,
      titre: msg.titre,
      description: msg.description,
      prix: msg.prix,
      photos: msg.photos,
      openerTabId: sender.tab.id,
      ts: Date.now(),
      tabId: null,
      cibleMs: null,
    });
    await reconcile();
    return;
  }
  if (msg.type === "vinted:qui-suis-je") {
    const entries = await getAllEntries();
    const mine = entries.find((e) => e.tabId === sender.tab.id);
    if (!mine) return { entry: null };
    if (mine.cibleMs == null) {
      const delai = await lireDelaiRegle();
      if (!delai) return { entry: mine, delaiNonRegle: true };
      const minutes = delai.delaiMin + Math.random() * (delai.delaiMax - delai.delaiMin);
      mine.cibleMs = Date.now() + minutes * 60_000;
      await saveEntry(mine);
    }
    return { entry: mine };
  }
  if (msg.type === "vinted:entree-consommee") {
    await deleteEntry(msg.entryId);
  }
});

async function reconcile() {
  const entries = await getAllEntries();
  const unpaired = entries.filter((e) => e.tabId == null);
  const messages = unpaired.map((e) => ({
    entryId: e.entryId,
    openerTabId: e.openerTabId,
    ts: e.ts,
  }));
  const { pairs } = pairEvents(pendingEvents, messages);
  for (const { tabId, entryId } of pairs) {
    const entry = entries.find((e) => e.entryId === entryId);
    entry.tabId = tabId;
    await saveEntry(entry);
    const idx = pendingEvents.findIndex((e) => e.tabId === tabId);
    if (idx >= 0) pendingEvents.splice(idx, 1);
  }
}

// Au réveil du service worker (Manifest V3 : peut être tué à tout moment),
// relire les entrées en attente — pendingEvents ne survit qu'en mémoire
// pour la session courante, mais un onglet déjà apparié garde son tabId en
// IndexedDB : reconcile() n'a rien à refaire pour lui.
reconcile();
```

- [ ] **Step 4: Vérification manuelle**

Charger l'extension (temporaire, `about:debugging`), ouvrir la console du service worker, simuler `myflip:mise-en-file` puis ouvrir un onglet `vinted.fr/items/new` avec `openerTabId` correspondant (via la console MyFlip) — vérifier qu'`entries` en IndexedDB (onglet `Application` des devtools) montre `tabId` renseigné après.

- [ ] **Step 5: Commit**

```bash
git add extension-vinted/background.js extension-vinted/db.js
git commit -m "feat(extension): service worker queue, pairing wiring, delay draw"
```

---

### Task 14: Content script MyFlip — capture et envoi

**Files:**
- Create: `extension-vinted/content-myflip.js`

- [ ] **Step 1: Écouter l'événement et transmettre au service worker**

```js
// extension-vinted/content-myflip.js
window.addEventListener("myflip:publier-vinted", async (e) => {
  const { articleId, titre, description, prix, photos } = e.detail;
  // photos: Blob[] — le structured clone de runtime.sendMessage gère les
  // Blob nativement (vérifié en Task 10 spike). Si le spike a montré le
  // contraire, convertir ici en ArrayBuffer avant l'envoi et documenter la
  // reconstruction côté Task 15.
  await browser.runtime.sendMessage({
    type: "myflip:mise-en-file",
    entryId: articleId,
    titre,
    description,
    prix,
    photos,
  });
});

// Copie best-effort des réglages de délai depuis /compte (Task 9) vers le
// storage de l'extension, puisqu'il n'existe pas d'API dédiée pour les lire
// (invariant du design). Ce content script tourne aussi sur /compte grâce
// au match pattern large `/mise-en-vente*` — NON, il ne matche que
// mise-en-vente : ce bloc doit vivre dans un second petit content script
// matché sur /compte, ou être fusionné dans le manifest avec un
// content_scripts supplémentaire ciblant /compte. Ajuster le manifest
// (Task 11) pour ajouter ce match avant d'écrire ce bloc, si non déjà fait.
```

**Note d'implémentation à trancher avant ce Step** : le manifest de la Task 11 ne cible que `/mise-en-vente*` pour le content script MyFlip. Pour lire les réglages de délai depuis `/compte`, soit élargir le `matches` de ce même content script à tout le domaine MyFlip (plus simple, légèrement plus large en permissions), soit ajouter une entrée `content_scripts` séparée ciblant `/compte*`. Choisir la première option (`matches: ["https://myflip-app.vercel.app/*", ...]`) sauf si Aramis préfère limiter la portée — trancher au moment de l'implémentation, pas bloquant pour le reste du plan.

- [ ] **Step 2: Vérification manuelle**

Sur `/mise-en-vente`, cliquer « Publier sur Vinted », vérifier dans la console du service worker (Task 13) que le message est bien reçu avec les bonnes données.

- [ ] **Step 3: Commit**

```bash
git add extension-vinted/content-myflip.js extension-vinted/manifest.json
git commit -m "feat(extension): MyFlip content script captures publish event"
```

---

### Task 15: Content script Vinted — badge, remplissage, bannières

**Files:**
- Create: `extension-vinted/content-vinted.js`

- [ ] **Step 1: Identification et récupération de l'entrée assignée**

```js
// extension-vinted/content-vinted.js
async function init() {
  const { entry, delaiNonRegle } = await browser.runtime.sendMessage({
    type: "vinted:qui-suis-je",
  });

  if (!entry) return; // état neutre : onglet Vinted sans lien avec MyFlip, rien à afficher

  if (delaiNonRegle) {
    afficherBanniere("Réglez le délai anti-ban dans /compte avant de publier automatiquement.");
    return;
  }

  const badge = creerBadge(entry);
  const attendre = entry.cibleMs - Date.now();
  if (attendre > 0) {
    demarrerCompteARebours(badge, entry.cibleMs);
    await new Promise((r) => setTimeout(r, attendre));
  }

  const ok = remplirFormulaire(entry);
  if (!ok) {
    afficherBanniere(
      "L'extension a besoin d'une mise à jour — continue à la main pour cet article, la mise à jour n'est pas automatique.",
    );
    return;
  }

  masquerBadge(badge);
  await browser.runtime.sendMessage({ type: "vinted:entree-consommee", entryId: entry.entryId });
}

init();
```

- [ ] **Step 2: Badge — Shadow DOM, miniature + titre + compte à rebours**

```js
function creerBadge(entry) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      .badge { display:flex; align-items:center; gap:8px; background:#fff;
        border:1px solid #ddd; border-radius:12px; padding:8px 12px;
        font: 13px system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
      .repere { width:8px; height:8px; border-radius:50%; background:#0f5132; }
      .titre { max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    </style>
    <div class="badge">
      <span class="repere"></span>
      <span class="titre">${escapeHtml(entry.titre.slice(0, 40))}</span>
      <span class="compte-a-rebours">…</span>
    </div>
  `;
  document.documentElement.appendChild(host);
  return { host, shadow };
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function demarrerCompteARebours(badge, cibleMs) {
  const el = badge.shadow.querySelector(".compte-a-rebours");
  const tick = () => {
    const reste = Math.max(0, cibleMs - Date.now());
    const min = Math.floor(reste / 60_000);
    const sec = Math.floor((reste % 60_000) / 1000);
    el.textContent = `${min}:${String(sec).padStart(2, "0")}`;
    if (reste > 0) requestAnimationFrame(tick);
  };
  tick();
}

function masquerBadge(badge) {
  badge.host.remove();
}

function afficherBanniere(texte) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fef3c7;color:#78350f;padding:10px;text-align:center;font:14px system-ui,sans-serif;";
  host.textContent = texte;
  document.documentElement.appendChild(host);
}
```

- [ ] **Step 3: Remplissage des champs**

```js
function remplirFormulaire(entry) {
  const champTitre = document.querySelector('[data-testid="title--input"], input[name="title"]');
  const champDescription = document.querySelector('[data-testid="description--input"], textarea[name="description"]');
  const champPrix = document.querySelector('[data-testid="price-input--input"], input[name="price"]');

  if (!champTitre || !champDescription || !champPrix) return false; // sélecteur introuvable → bannière (Step 1)

  remplirChamp(champTitre, entry.titre);
  remplirChamp(champDescription, entry.description);
  remplirChamp(champPrix, String(entry.prix));

  const succesPhotos = injecterPhotos(entry.photos);
  if (!succesPhotos) {
    afficherBanniere("Photos non injectées automatiquement — le texte est rempli, ajoute les photos à la main.");
  }
  return true;
}

// Ne jamais écraser un champ déjà rempli à la main.
function remplirChamp(el, valeur) {
  if (el.value && el.value.trim() !== "") return;
  el.focus();
  el.value = valeur;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
}

function injecterPhotos(photoBlobs) {
  const inputFichier = document.querySelector('input[type="file"]');
  if (!inputFichier) return false;
  try {
    const dt = new DataTransfer();
    for (const blob of photoBlobs) {
      dt.items.add(new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
    }
    inputFichier.files = dt.files;
    inputFichier.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}
```

Les sélecteurs `data-testid`/`name` ci-dessus sont des hypothèses raisonnables mais **non vérifiées contre le DOM réel de Vinted** — les confirmer (ou les corriger) en inspectant `vinted.fr/items/new` avant de considérer cette task terminée. C'est le point de maintenance attendu et déjà budgété par la bannière « mise à jour nécessaire » du Step 1.

- [ ] **Step 4: Vérification manuelle end-to-end**

Publier un article de test depuis MyFlip, observer le badge, le compte à rebours, le remplissage effectif sur `vinted.fr/items/new` (compte de test, ne pas publier réellement). Tester : fermer/rouvrir l'onglet avant la fin du délai, remplir un champ à la main avant la fin du délai.

- [ ] **Step 5: Commit**

```bash
git add extension-vinted/content-vinted.js
git commit -m "feat(extension): Vinted content script — badge, fill, banners"
```

---

## Self-Review (fait par l'auteur du plan)

**Couverture du spec** : les 3 invariants critiques (rien en file si PATCH échoue → Task 8 ; bon article sur le bon onglet → Task 12 ; pas de fill sans délai réglé → Task 13) ont chacun une tâche et un test direct. Les 14 décisions du Decision Audit Trail sont toutes reflétées dans au moins une tâche. `PrixReference` (décision #3, gardée) a ses 4 tâches complètes (modèle, API, UI, consommation).

**Cohérence des types** : `PrixReferenceDTO` défini en Task 2, réutilisé identique dans Tasks 3-6. `pairEvents()` défini en Task 12 avec sa forme de retour `{ pairs, unmatchedEvents, unmatchedMessages }`, consommée telle quelle en Task 13.

**Point non tranché signalé, pas caché** : la portée exacte du `matches` du content script MyFlip (Task 14, Step 1) dépend d'un choix mineur (élargir à tout le domaine vs. deuxième content script) laissé à l'implémentation — documenté explicitement plutôt que deviné en silence. Les sélecteurs DOM Vinted (Task 15) sont des hypothèses à vérifier contre le site réel, également documenté.

---

**Plan complet et sauvegardé dans `docs/superpowers/plans/2026-08-18-extension-vinted.md`. Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — un subagent frais par tâche, revue entre chaque tâche, itération rapide.

**2. Exécution inline** — exécution des tâches dans cette session avec executing-plans, par lots avec points de contrôle.

**Laquelle ?**
