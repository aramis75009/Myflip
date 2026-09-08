# Remplissage automatique du formulaire Vinted — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un lot de sacs à dos Nike généré dans `/mise-en-vente` part en brouillons Vinted sans saisie manuelle : l'extension ouvre un onglet par article, remplit tous les champs du formulaire, et clique « Sauvegarder le brouillon » en espaçant chaque geste.

**Architecture:** MyFlip produit des identifiants Vinted numériques (aucun libellé à retraduire) dans la charge utile d'un `CustomEvent`. L'extension devient un ordonnanceur séquentiel : elle crée elle-même ses onglets (`browser.tabs.create`), en traite un seul à la fois, et détecte le succès par le changement d'URL. Toute la logique décidable reste pure et testée par Vitest ; seul le pilotage du DOM Vinted échappe aux tests.

**Tech Stack:** Next.js 15 / React 18 / TypeScript, Vitest (environnement `node`), extension Firefox MV3 en JavaScript ES2022 sans bundler.

**Spec:** `docs/superpowers/specs/2026-09-07-vinted-remplissage-auto-design.md`

## Global Constraints

- **Branche de travail** : `worktree-extension-vinted`, worktree monté sur `.claude/worktrees/extension-vinted/`. Jamais `main`.
- **Aucune migration Prisma.** Ce chantier n'ajoute ni table ni colonne. Deux migrations antérieures (`PrixReference`, `delai_vinted`) ne sont toujours pas appliquées en production et bloquent déjà la fusion — ne pas en ajouter une troisième.
- **Catégorie Vinted cible : `246`**, « Sacs à dos » sous **Hommes > Accessoires > Sacs et sacoches**. Fil d'Ariane attendu : `Hommes > Accessoires > Sacs et sacoches`. Ne jamais utiliser `157` (Femmes). ⚠️ **Corrigé le 2026-09-09** : cette contrainte disait exactement l'inverse, et le code livré le 08/09 visait 157. Les sacs vendus sont des sacs homme.
- **Marque Vinted : `53`** (Nike). Format de colis : `package_type_selector_1` (Petit). Unisexe : coché.
- **Ne jamais cliquer `[data-testid="<champ>-select-dropdown-close-button"]`** (le « X » d'un panneau) : il ferme **en annulant** la sélection. Le seul geste de fermeture autorisé est `[data-testid="input-dropdown-save-button"]` (« Fait »).
- **Ne jamais cliquer un `input[type=radio|checkbox]` d'un panneau** : ils sont `aria-hidden="true"` / `tabindex="-1"` et répondent par intermittence. Cliquer le conteneur `[role="radio"]` / `[role="checkbox"]` parent.
- **L'extension ne clique jamais `upload-form-save-button`** (« Ajouter », publication réelle). Uniquement `upload-form-save-draft-button`.
- **Aucune API MyFlip dédiée à l'extension, aucun OAuth, aucun jeton.** Le seul canal page → extension est le `CustomEvent` DOM `myflip:publier-vinted`.
- **Tests** : `npx vitest run` depuis la racine du worktree. `npx tsc --noEmit` pour le typage. **Jamais `npm run build`** (corrompt `.next` si un `npm run dev` tourne).
- **Lint extension** : `cd extension-vinted && npx web-ext lint --self-hosted` — 0 erreur attendue, 2 avertissements voulus et documentés dans `extension-vinted/README.md`.
- **Langue** : code, noms de variables et messages de commit en anglais ; commentaires et libellés d'interface en français, comme tout le dépôt.

---

## Structure des fichiers

**MyFlip — créés**

| Fichier | Responsabilité |
|---|---|
| `lib/vintedReferentiels.ts` | Tables de correspondance pures : 29 couleurs Vinted, état MyFlip → `condition_id`, matière MyFlip → `material_id`. Aucune logique. |
| `lib/vintedReferentiels.test.ts` | Vérifie que les tables couvrent bien les listes MyFlip et n'ont pas d'id en double. |
| `lib/vintedMapping.ts` | La combinaison marque + catégorie → constantes Vinted, et `pickVintedMapping()`. |
| `lib/vintedMapping.test.ts` | Correspondance exacte, casse, espaces, absence. |

**MyFlip — modifiés**

| Fichier | Changement |
|---|---|
| `app/mise-en-vente/_reducer.ts` | `Qcm.couleurs: number[]` ; l'action `qcm` accepte `number[]`. |
| `app/mise-en-vente/_reducer.test.ts` | Un test sur la nouvelle valeur de QCM. |
| `app/mise-en-vente/_components/FicheArticle.tsx` | Catalogue (« Sac à dos », « Nike »), carte Vinted, couleurs, taille masquée, matières pré-remplies. |
| `app/mise-en-vente/_publierVinted.ts` | `detailPublicationVinted()` porte `vinted?` ; `publierVinted()` perd `ouvrirOnglet`. |
| `app/mise-en-vente/_publierVinted.test.ts` | Couverture du nouveau payload et de la garde. |
| `app/mise-en-vente/page.tsx` | Câblage : plus de `window.open` par défaut, repli si l'extension est absente, action groupée. |
| `app/mise-en-vente/_components/ExportAnnonces.tsx` | Bouton « Tout mettre en brouillon sur Vinted », bouton par fiche désactivé sans couleur. |

**Extension — créés**

| Fichier | Responsabilité |
|---|---|
| `extension-vinted/file.js` | Ordonnanceur pur : `(entrées, maintenant) → action`, tirage du délai, purge TTL. Remplace `pairing.js`. Module ES, importé par `background.js`. |
| `extension-vinted/file.test.js` | File vide, chaîne occupée, chaîne suspendue, ordre FIFO, bornes du tirage. |
| `extension-vinted/formulaire.js` | Pilotage du DOM Vinted : ouvrir/choisir/valider un panneau, frappe simulée, vérification du fil d'Ariane. **Script classique**, chargé par le manifest avant `content-vinted.js`. |

⚠️ **Pourquoi les pauses et la frappe vivent dans `formulaire.js` et pas dans un
module partagé** : `background.js` est déclaré `"type": "module"` et importe en ESM,
alors que les content scripts sont chargés comme scripts classiques (pas de
`import`/`export`, cf. l'en-tête de `content-vinted.js`). Un module commun aux deux
n'existe pas sans bundler, et ce projet n'en a pas. Le tirage du délai *entre
articles* vit donc dans `file.js` (côté worker, testé), les micro-pauses de saisie
dans `formulaire.js` (côté page, non testées).

**Extension — modifiés**

| Fichier | Changement |
|---|---|
| `extension-vinted/manifest.json` | Permission `alarms` ; `file.js` remplace `pairing.js`. |
| `extension-vinted/db.js` | Store `pendingEvents` supprimé, `DB_VERSION` à 3, champ `etat` sur les entrées. |
| `extension-vinted/background.js` | Ordonnanceur : alarmes, `tabs.create`, détection de succès par `tabs.onUpdated`, fermeture d'onglet. |
| `extension-vinted/content-vinted.js` | Remplissage complet dans l'ordre imposé, puis clic brouillon. |
| `extension-vinted/content-myflip.js` | Transmet `vinted` ; pose le marqueur de présence de l'extension. |
| `extension-vinted/README.md` | Nouveau parcours utilisateur et vérification du prix au premier passage. |

**Extension — supprimés**

`extension-vinted/pairing.js`, `extension-vinted/pairing.test.js`.

---

## Task 1: Les tables de correspondance Vinted

**Files:**
- Create: `lib/vintedReferentiels.ts`
- Test: `lib/vintedReferentiels.test.ts`

**Interfaces:**
- Consomme : `ETATS` et `MATIERES_SUGGESTIONS` de `lib/listingOptions.ts`.
- Produit : `COULEURS_VINTED: CouleurVinted[]`, `ETAT_VERS_CONDITION_ID: Record<string, number>`, `MATIERE_VERS_MATERIAL_ID: Record<string, number>`, `materialIdsDepuisMatieres(matieres: string[]): number[]`, `conditionIdDepuisEtat(etat: string): number | null`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/vintedReferentiels.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { ETATS, MATIERES_SUGGESTIONS } from "@/lib/listingOptions";
import {
  COULEURS_VINTED,
  ETAT_VERS_CONDITION_ID,
  MATIERE_VERS_MATERIAL_ID,
  conditionIdDepuisEtat,
  materialIdsDepuisMatieres,
} from "@/lib/vintedReferentiels";

describe("COULEURS_VINTED", () => {
  it("porte les 29 couleurs du relevé Vinted", () => {
    expect(COULEURS_VINTED).toHaveLength(29);
  });

  it("n'a aucun id en double", () => {
    const ids = COULEURS_VINTED.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("donne un hex à toutes les couleurs sauf Multicolore", () => {
    for (const c of COULEURS_VINTED) {
      if (c.libelle === "Multicolore") expect(c.hex).toBe("");
      else expect(c.hex).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("ETAT_VERS_CONDITION_ID", () => {
  it("couvre les cinq états proposés par MyFlip", () => {
    for (const etat of ETATS) {
      expect(ETAT_VERS_CONDITION_ID[etat]).toBeTypeOf("number");
    }
  });

  it("mappe « Très bon état » sur 2", () => {
    expect(conditionIdDepuisEtat("Très bon état")).toBe(2);
  });

  it("renvoie null sur un état inconnu", () => {
    expect(conditionIdDepuisEtat("Comme neuf")).toBeNull();
    expect(conditionIdDepuisEtat("")).toBeNull();
  });
});

describe("MATIERE_VERS_MATERIAL_ID", () => {
  it("couvre les dix suggestions de matière de MyFlip", () => {
    for (const m of MATIERES_SUGGESTIONS) {
      expect(MATIERE_VERS_MATERIAL_ID[m]).toBeTypeOf("number");
    }
  });

  it("traduit Polyester et Nylon", () => {
    expect(materialIdsDepuisMatieres(["Polyester", "Nylon"])).toEqual([45, 52]);
  });

  it("déduplique : Coton et Coton piqué tombent tous deux sur 44", () => {
    expect(materialIdsDepuisMatieres(["Coton", "Coton piqué"])).toEqual([44]);
  });

  it("ignore les matières vides ou inconnues", () => {
    expect(materialIdsDepuisMatieres(["", "Kevlar", "Laine"])).toEqual([46]);
    expect(materialIdsDepuisMatieres([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run lib/vintedReferentiels.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/vintedReferentiels"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `lib/vintedReferentiels.ts` :

```ts
// Tables de correspondance MyFlip → Vinted. Aucune logique métier : ce sont
// des relevés, recopiés depuis docs/audits/2026-09-07-vinted-form-mapping.md
// et son complément Nike. Toute divergence se tranche en faveur des audits.

export type CouleurVinted = {
  id: number;
  libelle: string;
  /** Vide pour « Multicolore », qui n'a pas de hex chez Vinted. */
  hex: string;
};

/** GET /api/v2/item_upload/colors — liste globale, indépendante de la catégorie.
 *  Conservée dans l'ordre `order` de Vinted : c'est celui du panneau réel. */
export const COULEURS_VINTED: CouleurVinted[] = [
  { id: 1, libelle: "Noir", hex: "#000000" },
  { id: 3, libelle: "Gris", hex: "#919191" },
  { id: 12, libelle: "Blanc", hex: "#FFFFFF" },
  { id: 20, libelle: "Crème", hex: "#F8F8E1" },
  { id: 4, libelle: "Beige", hex: "#F4E0C8" },
  { id: 21, libelle: "Abricot", hex: "#FFCC98" },
  { id: 11, libelle: "Orange", hex: "#FFA500" },
  { id: 22, libelle: "Corail", hex: "#FE7F5D" },
  { id: 7, libelle: "Rouge", hex: "#CC3300" },
  { id: 23, libelle: "Bordeaux", hex: "#AE2E3D" },
  { id: 5, libelle: "Fuchsia", hex: "#FF0080" },
  { id: 24, libelle: "Rose", hex: "#FFCCCA" },
  { id: 6, libelle: "Violet", hex: "#800080" },
  { id: 25, libelle: "Lila", hex: "#D297D2" },
  { id: 26, libelle: "Bleu clair", hex: "#89CFF0" },
  { id: 9, libelle: "Bleu", hex: "#007BC4" },
  { id: 27, libelle: "Marine", hex: "#35358D" },
  { id: 17, libelle: "Turquoise", hex: "#B7DEE8" },
  { id: 30, libelle: "Menthe", hex: "#A2FFBC" },
  { id: 10, libelle: "Vert", hex: "#369A3D" },
  { id: 28, libelle: "Vert foncé", hex: "#356639" },
  { id: 16, libelle: "Kaki", hex: "#86814A" },
  { id: 2, libelle: "Marron", hex: "#663300" },
  { id: 29, libelle: "Moutarde", hex: "#E5B539" },
  { id: 8, libelle: "Jaune", hex: "#FFF200" },
  { id: 13, libelle: "Argenté", hex: "#DDDDDD" },
  { id: 14, libelle: "Doré", hex: "#BE9927" },
  { id: 15, libelle: "Multicolore", hex: "" },
  { id: 32, libelle: "Transparence", hex: "#F8FDFD" },
];

/**
 * Les cinq libellés de `ETATS` (lib/listingOptions.ts) sont identiques au
 * caractère près aux cinq options de l'attribut `condition` de Vinted. C'est
 * ce qui permet de DÉRIVER `condition_id` du QCM au lieu de le figer.
 *
 * ⚠️ Si un libellé de `ETATS` change, cette table cesse de le couvrir et le
 * test `lib/vintedReferentiels.test.ts` échoue — c'est voulu.
 */
export const ETAT_VERS_CONDITION_ID: Record<string, number> = {
  "Neuf avec étiquette": 6,
  "Neuf sans étiquette": 1,
  "Très bon état": 2,
  "Bon état": 3,
  Satisfaisant: 4,
};

export function conditionIdDepuisEtat(etat: string): number | null {
  return ETAT_VERS_CONDITION_ID[etat] ?? null;
}

/** Les dix suggestions de `MATIERES_SUGGESTIONS` → attribut `material` Vinted.
 *  « Coton piqué » n'existe pas chez Vinted : il retombe sur Coton (44). */
export const MATIERE_VERS_MATERIAL_ID: Record<string, number> = {
  Coton: 44,
  "Coton piqué": 44,
  Polyester: 45,
  Laine: 46,
  Lin: 146,
  Cuir: 43,
  "Jean / Denim": 303,
  Cachemire: 123,
  Nylon: 52,
  Viscose: 48,
};

/**
 * Matières MyFlip → ids Vinted, dédupliqués et dans l'ordre de saisie.
 * Une matière vide ou absente de la table est ignorée : mieux vaut un
 * matériau manquant qu'un id inventé.
 */
export function materialIdsDepuisMatieres(matieres: string[]): number[] {
  const ids: number[] = [];
  for (const m of matieres) {
    const id = MATIERE_VERS_MATERIAL_ID[m];
    if (id === undefined) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx vitest run lib/vintedReferentiels.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/vintedReferentiels.ts lib/vintedReferentiels.test.ts
git commit -m "feat(vinted): add the MyFlip-to-Vinted lookup tables"
```

---

## Task 2: Le mapping « Sac à dos Nike »

> ⚠️ **Périmé sur un point, corrigé le 2026-09-09.** Les blocs de code ci-dessous
> écrivent `categoryId: 157` et `filAriane: "Femmes > Sacs"`. C'est faux : la
> catégorie visée est **`246`**, fil d'Ariane `Hommes > Accessoires > Sacs et
> sacoches`. Ils sont laissés tels quels parce que ce fichier est le compte rendu
> de ce qui a été exécuté le 08/09 ; c'est `lib/vintedMapping.ts` qui fait foi.

**Files:**
- Create: `lib/vintedMapping.ts`
- Test: `lib/vintedMapping.test.ts`

**Interfaces:**
- Produit : `type MappingVinted`, `MAPPINGS_VINTED: MappingVinted[]`, `pickVintedMapping(marque: string, categorie: string): MappingVinted | null`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `lib/vintedMapping.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { MAPPINGS_VINTED, pickVintedMapping } from "@/lib/vintedMapping";

describe("pickVintedMapping", () => {
  it("trouve le sac à dos Nike", () => {
    const m = pickVintedMapping("Nike", "Sac à dos");
    expect(m?.categoryId).toBe(157);
    expect(m?.brandId).toBe(53);
    expect(m?.packageType).toBe(1);
    expect(m?.unisex).toBe(true);
    expect(m?.materiauxDefaut).toEqual(["Polyester", "Nylon"]);
    expect(m?.aUneTaille).toBe(false);
    expect(m?.filAriane).toBe("Femmes > Sacs");
  });

  it("ignore la casse et les espaces de bord", () => {
    expect(pickVintedMapping("  nike ", "SAC À DOS")?.categoryId).toBe(157);
  });

  it("exige les deux critères", () => {
    expect(pickVintedMapping("Nike", "Polo")).toBeNull();
    expect(pickVintedMapping("Adidas", "Sac à dos")).toBeNull();
  });

  it("renvoie null sur une saisie vide", () => {
    expect(pickVintedMapping("", "")).toBeNull();
  });

  it("ne vise jamais la catégorie 246, celle du rayon Hommes", () => {
    expect(MAPPINGS_VINTED.some((m) => m.categoryId === 246)).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run lib/vintedMapping.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/vintedMapping"`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `lib/vintedMapping.ts` :

```ts
// La combinaison marque + catégorie MyFlip → les constantes Vinted de la
// catégorie visée. Une seule entrée aujourd'hui : sacs à dos Nike.
//
// Pas de cascade façon pickPrompt()/pickPrix() (marque seule, catégorie
// seule, défaut) : avec une entrée, ce serait du code mort qui ment sur son
// intention, et un défaut trop large rangerait n'importe quel article dans
// les sacs à dos. Le jour où une deuxième combinaison arrive, la cascade se
// rajoute AVEC ses tests.

export type MappingVinted = {
  /** Libellé MyFlip, tel qu'affiché en pastille. */
  marque: string;
  categorie: string;
  /** Feuille de l'arbre Vinted. 157 = Femmes > Sacs > Sacs à dos. */
  categoryId: number;
  brandId: number;
  /** 1 = Petit, 2 = Moyen, 3 = Grand. */
  packageType: 1 | 2 | 3;
  unisex: boolean;
  /** Matières MyFlip pré-remplies quand le QCM est vide. */
  materiauxDefaut: string[];
  /** false ⇒ la catégorie Vinted n'a pas de champ taille. */
  aUneTaille: boolean;
  /** Texte à taper dans #catalog-search-input. */
  rechercheCategorie: string;
  /**
   * Fil d'Ariane attendu sur la ligne de résultat (.web_ui__Cell__body).
   *
   * ⚠️ Vérification indispensable : la recherche « Sacs à dos » renvoie
   * PLUSIEURS feuilles homonymes (157 Femmes, 246 Hommes, et l'équivalent
   * Enfants). Un id qui changerait chez Vinted rangerait les articles dans
   * le mauvais rayon sans la moindre erreur visible.
   */
  filAriane: string;
};

export const MAPPINGS_VINTED: MappingVinted[] = [
  {
    marque: "Nike",
    categorie: "Sac à dos",
    categoryId: 157,
    brandId: 53,
    packageType: 1,
    unisex: true,
    materiauxDefaut: ["Polyester", "Nylon"],
    aUneTaille: false,
    rechercheCategorie: "Sacs à dos",
    filAriane: "Femmes > Sacs",
  },
];

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Correspondance EXACTE sur marque + catégorie. Null si rien ne colle. */
export function pickVintedMapping(
  marque: string | null,
  categorie: string | null,
): MappingVinted | null {
  const m = norm(marque);
  const c = norm(categorie);
  if (!m || !c) return null;
  return (
    MAPPINGS_VINTED.find((x) => norm(x.marque) === m && norm(x.categorie) === c) ?? null
  );
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx vitest run lib/vintedMapping.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/vintedMapping.ts lib/vintedMapping.test.ts
git commit -m "feat(vinted): map Nike backpacks to Vinted category 157"
```

---

## Task 3: Le champ couleur dans le QCM

**Files:**
- Modify: `app/mise-en-vente/_reducer.ts`
- Test: `app/mise-en-vente/_reducer.test.ts`

**Interfaces:**
- Consomme : rien des tâches précédentes.
- Produit : `Qcm.couleurs: number[]` ; l'action `{ type: "qcm" }` accepte `valeur: string | boolean | number[]`.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à la fin de `app/mise-en-vente/_reducer.test.ts` :

```ts
describe("qcm/couleurs", () => {
  it("accepte un tableau d'ids de couleur", () => {
    const depart = etatInitial("f1");
    const apres = reducerMev(depart, {
      type: "qcm",
      id: "f1",
      champ: "couleurs",
      valeur: [1, 3],
    });
    expect(apres.fiches[0].qcm.couleurs).toEqual([1, 3]);
  });

  it("part d'un tableau vide", () => {
    expect(etatInitial("f1").fiches[0].qcm.couleurs).toEqual([]);
  });
});
```

Si `describe`, `etatInitial` ou `reducerMev` ne sont pas déjà importés en tête du fichier, compléter l'import existant plutôt que d'en ajouter un second.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run app/mise-en-vente/_reducer.test.ts`
Expected: FAIL — TypeScript refuse `champ: "couleurs"` (absent de `keyof Qcm`) et `valeur: [1, 3]`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `app/mise-en-vente/_reducer.ts`, ajouter le champ au type `Qcm` (après `prix`) :

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
  /** Ids de couleur Vinted, 0 à 2. Vinted plafonne la sélection à 2. */
  couleurs: number[];
};
```

Élargir l'action :

```ts
  | { type: "qcm"; id: string; champ: keyof Qcm; valeur: string | boolean | number[] }
```

Et compléter `QCM_VIDE` :

```ts
const QCM_VIDE: Qcm = {
  marque: "",
  marqueCustom: false,
  categorie: "",
  categorieCustom: false,
  taille: "",
  etat: "",
  matiere: "",
  matiere2: "",
  details: "",
  prix: "",
  couleurs: [],
};
```

Le `case "qcm"` du reducer n'a pas besoin d'être touché : il fait déjà
`{ ...f.qcm, [action.champ]: action.valeur }`.

- [ ] **Step 4: Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run app/mise-en-vente/_reducer.test.ts && npx tsc --noEmit`
Expected: PASS sur les tests. `tsc` signalera les appelants de `onQcm` dans `FicheArticle.tsx` — c'est attendu, la Task 4 les traite. Si `tsc` est rouge **uniquement** sur `FicheArticle.tsx`, continuer.

- [ ] **Step 5: Commit**

```bash
git add app/mise-en-vente/_reducer.ts app/mise-en-vente/_reducer.test.ts
git commit -m "feat(mise-en-vente): add Vinted colour ids to the QCM"
```

---

## Task 4: La carte Vinted dans la fiche article

**Files:**
- Modify: `app/mise-en-vente/_components/FicheArticle.tsx`

**Interfaces:**
- Consomme : `pickVintedMapping` (Task 2), `COULEURS_VINTED` (Task 1), `Qcm.couleurs` (Task 3).
- Produit : rien pour les tâches suivantes — c'est de l'écran.

Pas de test unitaire : le dépôt ne teste pas le rendu React (cf. l'en-tête de
`vitest.config.ts`, choix assumé). La vérification est `npx tsc --noEmit` puis un
passage à l'œil dans le navigateur.

- [ ] **Step 1: Élargir le catalogue**

Dans `app/mise-en-vente/_components/FicheArticle.tsx`, ajouter « Nike » aux
pastilles de marque et « Sac à dos » aux catégories :

```ts
const MARQUES_CHIPS = [
  "Ralph Lauren",
  "Tommy Hilfiger",
  "Lacoste",
  "Adidas",
  "Dickies",
  "Helly Hansen",
  "Nike",
];

const CATEGORIES_LIST = [
  "Polo", "Pull", "Chemise", "Sweat", "Veste", "Short", "Jogging", "Jean", "Bermuda",
  "Sac à dos",
];
```

- [ ] **Step 2: Résoudre le mapping et pré-remplir**

Ajouter les imports en tête de fichier :

```ts
import { COULEURS_VINTED } from "@/lib/vintedReferentiels";
import { pickVintedMapping } from "@/lib/vintedMapping";
```

Puis, à côté des autres `useMemo` du composant :

```ts
  // Le mapping Vinted résolu pour CETTE fiche. Sa présence arme le pilote
  // automatique de l'extension et conditionne l'affichage de la carte Vinted.
  const mappingVinted = useMemo(
    () => pickVintedMapping(qcm.marque, qcm.categorie),
    [qcm.marque, qcm.categorie],
  );
```

Puis deux effets, juste après l'effet du prix suggéré :

```ts
  // Une catégorie Vinted sans champ taille (les sacs, par exemple) : la carte
  // Taille est masquée, mais `fichePrete()` l'exige toujours. On pose
  // « Unique » pour que la fiche reste générable sans relâcher une garde qui
  // protège toutes les autres catégories.
  useEffect(() => {
    if (!mappingVinted || mappingVinted.aUneTaille) return;
    if (qcm.taille !== "Unique") onQcmRef.current("taille", "Unique");
  }, [mappingVinted, qcm.taille]);

  // Matières par défaut du mapping — posées seulement si RIEN n'a été choisi.
  // Ne jamais écraser une saisie : même invariant que le prix suggéré.
  useEffect(() => {
    if (!mappingVinted) return;
    if (qcm.matiere !== "" || qcm.matiere2 !== "") return;
    onQcmRef.current("matiere", mappingVinted.materiauxDefaut[0] ?? "");
    onQcmRef.current("matiere2", mappingVinted.materiauxDefaut[1] ?? "");
  }, [mappingVinted, qcm.matiere, qcm.matiere2]);
```

- [ ] **Step 3: Masquer la carte Taille quand la catégorie n'en a pas**

Envelopper le bloc `<ChampRequis label="Taille" …>` et son séparateur :

```tsx
          {(!mappingVinted || mappingVinted.aUneTaille) && (
            <>
              <ChampRequis label="Taille" ok={!!qcm.taille}>
                {TAILLES.map((t) => (
                  <Chip
                    key={t}
                    value={t}
                    active={qcm.taille === t}
                    onClick={() => onQcm("taille", qcm.taille === t ? "" : t)}
                  />
                ))}
              </ChampRequis>

              <div className="my-4 h-px bg-[var(--bg)]" />
            </>
          )}
```

- [ ] **Step 4: Ajouter la carte Vinted**

Insérer, après la carte « Infos supplémentaires » et avant la carte « Prix suggéré » :

```tsx
        {mappingVinted && (
          <div className={`${cardCls} p-5 md:px-6`}>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={labelCls}>Vinted — pilote automatique</span>
              <span className="rounded-full bg-[var(--pos-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--pos)]">
                armé
              </span>
            </div>

            {/* Ce que l'extension enverra sans rien demander. Affiché parce
                qu'une valeur figée invisible est une valeur qu'on découvre
                sur l'annonce publiée. */}
            <p className="mt-2.5 font-mono text-[12px] text-[var(--faint-2)]">
              {mappingVinted.rechercheCategorie} · {mappingVinted.filAriane} ·{" "}
              {mappingVinted.marque} · colis Petit · unisexe
            </p>

            <div className="mt-4">
              <div className="flex items-center gap-2.5">
                <label className="text-[12.5px] font-bold tracking-[0.03em] text-[var(--ink)]">
                  Couleur
                </label>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    qcm.couleurs.length > 0
                      ? "bg-[var(--pos-soft)] text-[var(--pos)]"
                      : "bg-[var(--neg-soft)] text-[var(--neg)]"
                  }`}
                >
                  {qcm.couleurs.length > 0 ? `${qcm.couleurs.length} / 2` : "requis"}
                </span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {COULEURS_VINTED.map((c) => {
                  const active = qcm.couleurs.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => basculerCouleur(c.id)}
                      aria-pressed={active}
                      className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl border-[1.5px] px-3 text-[13px] font-semibold transition-all ${
                        active
                          ? "border-[var(--acc)] bg-[var(--acc)] text-[var(--acc-ink)] shadow-[var(--shadow)]"
                          : "border-[var(--border)] bg-surface text-[var(--ink2)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      <span
                        aria-hidden
                        className="h-3.5 w-3.5 flex-none rounded-full border border-[var(--border-strong)]"
                        style={
                          c.hex
                            ? { background: c.hex }
                            : {
                                background:
                                  "conic-gradient(#e11,#fb0,#2b2,#09c,#71d,#e11)",
                              }
                        }
                      />
                      {c.libelle}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
```

Et la fonction de bascule, à côté de `toggleMatiere` :

```ts
  /**
   * Vinted plafonne la couleur à 2 — et au-delà de la limite il ne refuse
   * PAS le clic : il évince silencieusement la plus ancienne sélection
   * (FIFO, cf. docs/audits/…-nike-backpack.md §5). On refuse ici plutôt que
   * de laisser Vinted décider à notre place de quelle couleur perdre.
   */
  function basculerCouleur(id: number) {
    const actuelles = qcm.couleurs;
    if (actuelles.includes(id)) {
      onQcm("couleurs", actuelles.filter((x) => x !== id));
      return;
    }
    if (actuelles.length >= 2) return;
    onQcm("couleurs", [...actuelles, id]);
  }
```

- [ ] **Step 5: Élargir le type de la prop `onQcm`**

Dans le bloc `type Props`, remplacer :

```ts
  onQcm: (champ: keyof Qcm, valeur: string | boolean) => void;
```

par :

```ts
  onQcm: (champ: keyof Qcm, valeur: string | boolean | number[]) => void;
```

Puis répercuter dans `app/mise-en-vente/page.tsx`, sur le handler passé à
`<FicheArticle onQcm={…}>` : sa signature doit accepter le même type élargi.

- [ ] **Step 6: Vérifier le typage**

Run: `npx tsc --noEmit && npx vitest run`
Expected: aucune erreur, et tous les tests existants toujours verts.

- [ ] **Step 7: Commit**

```bash
git add app/mise-en-vente/_components/FicheArticle.tsx app/mise-en-vente/page.tsx
git commit -m "feat(mise-en-vente): show the Vinted card with colour picker"
```

---

## Task 5: La charge utile envoyée à l'extension

**Files:**
- Modify: `app/mise-en-vente/_publierVinted.ts`
- Test: `app/mise-en-vente/_publierVinted.test.ts`

**Interfaces:**
- Consomme : `pickVintedMapping` (Task 2), `conditionIdDepuisEtat` / `materialIdsDepuisMatieres` (Task 1).
- Produit : `type ChampsVinted`, `DetailPublicationVinted.vinted?: ChampsVinted`, et `publierVinted(f, enregistrerUn, emettreEvenement): Promise<boolean>` — **trois arguments désormais, plus quatre**.

- [ ] **Step 1: Écrire le test qui échoue**

Ajouter à `app/mise-en-vente/_publierVinted.test.ts` :

```ts
describe("detailPublicationVinted — champs Vinted", () => {
  it("porte les identifiants numériques pour un sac à dos Nike", () => {
    const f = ficheAvec({
      marque: "Nike",
      categorie: "Sac à dos",
      etat: "Très bon état",
      matiere: "Polyester",
      matiere2: "Nylon",
      couleurs: [1, 3],
    });
    const detail = detailPublicationVinted(f);
    expect(detail.vinted).toEqual({
      categoryId: 157,
      rechercheCategorie: "Sacs à dos",
      filAriane: "Femmes > Sacs",
      brandId: 53,
      conditionId: 2,
      packageType: 1,
      unisex: true,
      colorIds: [1, 3],
      materialIds: [45, 52],
    });
  });

  it("n'a pas de bloc vinted quand aucun mapping ne correspond", () => {
    const f = ficheAvec({ marque: "Ralph Lauren", categorie: "Polo", etat: "Bon état" });
    expect(detailPublicationVinted(f).vinted).toBeUndefined();
  });

  it("n'a pas de bloc vinted si l'état n'a pas d'équivalent Vinted", () => {
    const f = ficheAvec({ marque: "Nike", categorie: "Sac à dos", etat: "" });
    expect(detailPublicationVinted(f).vinted).toBeUndefined();
  });

  it("plafonne les couleurs à 2 et les matériaux à 2", () => {
    const f = ficheAvec({
      marque: "Nike",
      categorie: "Sac à dos",
      etat: "Bon état",
      matiere: "Coton",
      matiere2: "Coton piqué",
      couleurs: [1, 3, 12],
    });
    const v = detailPublicationVinted(f).vinted!;
    expect(v.colorIds).toEqual([1, 3]);
    expect(v.materialIds).toEqual([44]);
    expect(v.conditionId).toBe(3);
  });
});
```

Et, juste après `ficheDeTest()` déjà présent dans ce fichier, la fabrique que
ces tests utilisent :

```ts
/** `ficheDeTest()` avec un QCM surchargé — les tests Vinted ne se
 *  distinguent que par marque, catégorie, état, matières et couleurs. */
function ficheAvec(qcm: Partial<ArticleEnCours["qcm"]>): ArticleEnCours {
  const base = ficheDeTest();
  return { ...base, qcm: { ...base.qcm, ...qcm } };
}
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run app/mise-en-vente/_publierVinted.test.ts`
Expected: FAIL — `detail.vinted` vaut `undefined` dans le premier test.

- [ ] **Step 3: Écrire l'implémentation**

Dans `app/mise-en-vente/_publierVinted.ts`, ajouter les imports et le type :

```ts
import { pickVintedMapping } from "@/lib/vintedMapping";
import {
  conditionIdDepuisEtat,
  materialIdsDepuisMatieres,
} from "@/lib/vintedReferentiels";

/**
 * Les champs du formulaire Vinted, en identifiants NUMÉRIQUES — jamais en
 * libellés. L'extension les consomme tels quels : aucune traduction ne doit
 * avoir lieu de l'autre côté de la frontière, où rien n'est testé.
 */
export type ChampsVinted = {
  categoryId: number;
  rechercheCategorie: string;
  filAriane: string;
  brandId: number;
  conditionId: number;
  packageType: 1 | 2 | 3;
  unisex: boolean;
  /** 1 à 2 ids. */
  colorIds: number[];
  /** 0 à 2 ids, dédupliqués. */
  materialIds: number[];
};
```

Ajouter le champ optionnel au type existant :

```ts
export type DetailPublicationVinted = {
  articleId: string;
  titre: string;
  description: string;
  prix: string;
  /** Blob pleine résolution — cf. _reducer.ts sur `Photo.blob`. */
  photos: Blob[];
  /** Absent quand la fiche ne correspond à aucun mapping : l'extension se
   *  rabat alors sur titre/description/prix/photos, comme avant. */
  vinted?: ChampsVinted;
};
```

Et la construction :

```ts
/**
 * Résout les champs Vinted d'une fiche, ou `null` si elle n'est pas éligible.
 *
 * Deux conditions, pas une : un mapping marque+catégorie ET un état traduisible.
 * Sans état, Vinted refuse le formulaire (`required: true` sur `condition`) —
 * mieux vaut ne rien promettre que promettre un formulaire qui bloquera.
 */
function champsVinted(f: ArticleEnCours): ChampsVinted | null {
  const mapping = pickVintedMapping(f.qcm.marque, f.qcm.categorie);
  if (!mapping) return null;
  const conditionId = conditionIdDepuisEtat(f.qcm.etat);
  if (conditionId === null) return null;
  return {
    categoryId: mapping.categoryId,
    rechercheCategorie: mapping.rechercheCategorie,
    filAriane: mapping.filAriane,
    brandId: mapping.brandId,
    conditionId,
    packageType: mapping.packageType,
    unisex: mapping.unisex,
    // Plafonds appliqués ICI et pas seulement dans l'écran : au-delà de sa
    // limite, Vinted évince silencieusement la plus ancienne sélection au
    // lieu de refuser le clic. On ne lui donne jamais l'occasion de choisir.
    colorIds: f.qcm.couleurs.slice(0, 2),
    materialIds: materialIdsDepuisMatieres(
      [f.qcm.matiere, f.qcm.matiere2].filter(Boolean),
    ).slice(0, 2),
  };
}

export function detailPublicationVinted(f: ArticleEnCours): DetailPublicationVinted {
  const vinted = champsVinted(f);
  return {
    articleId: f.article!.id,
    titre: f.annonce.titre,
    description: f.annonce.description,
    prix: f.qcm.prix,
    photos: f.photos.map((p) => p.blob),
    ...(vinted ? { vinted } : {}),
  };
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx vitest run app/mise-en-vente/_publierVinted.test.ts`
Expected: PASS — les 5 tests existants plus les 4 nouveaux.

- [ ] **Step 5: Commit**

```bash
git add app/mise-en-vente/_publierVinted.ts app/mise-en-vente/_publierVinted.test.ts
git commit -m "feat(mise-en-vente): carry numeric Vinted ids in the publish payload"
```

---

## Task 6: L'onglet n'est plus ouvert par la page

**Files:**
- Modify: `app/mise-en-vente/_publierVinted.ts`
- Modify: `app/mise-en-vente/page.tsx:401-410`
- Test: `app/mise-en-vente/_publierVinted.test.ts`

**Interfaces:**
- Consomme : `DetailPublicationVinted` (Task 5).
- Produit : `publierVinted(f, enregistrerUn, emettreEvenement)` à trois arguments ; `extensionPresente(): boolean` exporté depuis `_publierVinted.ts`.

- [ ] **Step 1: Adapter les tests existants et en écrire un nouveau**

Dans `app/mise-en-vente/_publierVinted.test.ts`, retirer le quatrième argument
`ouvrirOnglet` de tous les appels à `publierVinted`, ainsi que les `vi.fn()` et
les assertions qui le concernent. Élargir l'import de tête pour y prendre le
type de la charge utile :

```ts
import {
  detailPublicationVinted,
  publierVinted,
  type DetailPublicationVinted,
} from "./_publierVinted";
```

Puis ajouter :

```ts
describe("publierVinted — sans ouverture d'onglet", () => {
  it("émet l'événement quand le PATCH réussit, et rien d'autre", async () => {
    const emis: DetailPublicationVinted[] = [];
    const ok = await publierVinted(
      ficheAvec({ marque: "Nike", categorie: "Sac à dos", etat: "Très bon état" }),
      async () => true,
      (d) => emis.push(d),
    );
    expect(ok).toBe(true);
    expect(emis).toHaveLength(1);
  });

  it("n'émet rien quand le PATCH échoue", async () => {
    const emis: DetailPublicationVinted[] = [];
    const ok = await publierVinted(
      ficheAvec({ marque: "Nike", categorie: "Sac à dos", etat: "Très bon état" }),
      async () => false,
      (d) => emis.push(d),
    );
    expect(ok).toBe(false);
    expect(emis).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run app/mise-en-vente/_publierVinted.test.ts`
Expected: FAIL — `publierVinted` attend encore quatre arguments.

- [ ] **Step 3: Écrire l'implémentation**

Dans `app/mise-en-vente/_publierVinted.ts`, remplacer la fonction et son
commentaire d'en-tête :

```ts
/**
 * Orchestre la publication Vinted d'une fiche.
 *
 * INVARIANT CRITIQUE : `emettreEvenement` n'est appelé QUE si `enregistrerUn`
 * a résolu à `true`. Ne jamais relâcher cette garde.
 *
 * ⚠️ Cette fonction n'ouvre PLUS d'onglet. C'est l'extension qui crée le sien
 * (`browser.tabs.create`), pour deux raisons : un `window.open()` placé après
 * un `await` réseau perd l'activation utilisateur (~5 s chez Firefox) et se
 * fait bloquer comme popup dès que le PATCH traîne ; et un onglet ouvert par
 * l'extension n'a plus besoin d'être apparié à son article après coup.
 * page.tsx garde un repli manuel pour le cas « extension non installée ».
 */
export async function publierVinted(
  f: ArticleEnCours,
  enregistrerUn: (id: string, statut: string) => Promise<boolean>,
  emettreEvenement: (detail: DetailPublicationVinted) => void,
): Promise<boolean> {
  if (!f.article) return false;
  // ⚠️ `f.id` — l'identité CLIENT de la fiche, PAS `f.article.id` : c'est ce
  // que `enregistrer()` (page.tsx) sait résoudre.
  const succes = await enregistrerUn(f.id, "Brouillon");
  if (!succes) return false;
  emettreEvenement(detailPublicationVinted(f));
  return true;
}

/**
 * L'extension est-elle installée ?
 *
 * `content-myflip.js` pose `data-myflip-vinted="1"` sur `<html>` à
 * l'injection. C'est le seul canal disponible : il n'existe aucune API MyFlip
 * que l'extension pourrait appeler, par choix de design. Sans marqueur, la
 * page ouvre l'onglet Vinted elle-même — le comportement d'avant ce chantier.
 */
export function extensionPresente(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.myflipVinted === "1";
}
```

- [ ] **Step 4: Câbler page.tsx**

Remplacer la fonction `publierVinted` locale de `app/mise-en-vente/page.tsx`
(ligne ~403) :

```ts
  async function publierVinted(f: ArticleEnCours) {
    const ok = await orchestrerPublicationVinted(
      f,
      (id, statut) => enregistrer([id], statut),
      (detail) => window.dispatchEvent(new CustomEvent("myflip:publier-vinted", { detail })),
    );
    // Sans extension, personne n'ouvrira l'onglet : on le fait, comme avant.
    // Le popup peut être bloqué (on sort d'un await) — c'est le prix du repli,
    // et il ne concerne que le cas « extension non installée ».
    if (ok && !extensionPresente()) {
      window.open("https://www.vinted.fr/items/new", "_blank", "noopener,noreferrer");
    }
    return ok;
  }
```

Le quatrième argument (`() => window.open(…)`) disparaît de cet appel : c'est
désormais l'extension qui ouvre l'onglet. Ajouter `extensionPresente` à
l'import existant de `./_publierVinted`.

- [ ] **Step 5: Lancer les tests et vérifier qu'ils passent**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS partout.

- [ ] **Step 6: Commit**

```bash
git add app/mise-en-vente/_publierVinted.ts app/mise-en-vente/_publierVinted.test.ts app/mise-en-vente/page.tsx
git commit -m "refactor(mise-en-vente): let the extension open the Vinted tab"
```

---

## Task 7: Le bouton « tout mettre en brouillon »

**Files:**
- Modify: `app/mise-en-vente/_components/ExportAnnonces.tsx`
- Modify: `app/mise-en-vente/page.tsx`

**Interfaces:**
- Consomme : `publierVinted` (Task 6), `pickVintedMapping` (Task 2).
- Produit : la prop `onPublierVintedTout: () => void` sur `ExportAnnonces`.

Pas de test unitaire (rendu React). Vérification : `tsc` puis l'écran.

- [ ] **Step 1: Ajouter la chaîne côté page**

Dans `app/mise-en-vente/page.tsx`, à côté de `publierVinted` :

```ts
  // Toutes les fiches éligibles, EN SÉRIE. Le parallèle est exclu pour la même
  // raison que l'enregistrement groupé (instantané du cache dans onMutate),
  // et parce que N événements émis d'un coup produiraient N onglets d'un coup
  // côté extension — exactement ce que l'ordonnanceur cherche à éviter.
  async function publierVintedTout() {
    const eligibles = etatRef.current.fiches.filter(
      (f) =>
        f.generation.phase === "ok" &&
        f.article !== null &&
        pickVintedMapping(f.qcm.marque, f.qcm.categorie) !== null &&
        f.qcm.couleurs.length > 0,
    );
    for (const f of eligibles) {
      const ok = await publierVinted(f);
      if (!ok) {
        toast.error(`${f.article!.sku} : mise en file impossible, chaîne arrêtée.`, {
          duration: 8000,
        });
        return;
      }
    }
  }
```

Importer `pickVintedMapping` depuis `@/lib/vintedMapping`.

- [ ] **Step 2: Passer la prop et le motif de blocage**

Dans `app/mise-en-vente/_components/ExportAnnonces.tsx`, ajouter à `type Props` :

```ts
  onPublierVintedTout: () => void;
```

Et l'accepter dans la destructuration du composant. Ajouter aussi, en tête du
fichier :

```ts
import { pickVintedMapping } from "@/lib/vintedMapping";
```

- [ ] **Step 3: Le bouton groupé**

Dans le bloc « Actions groupées », après le bouton « En vente » :

```tsx
          {generees.some(
            (f) =>
              pickVintedMapping(f.qcm.marque, f.qcm.categorie) !== null &&
              f.qcm.couleurs.length > 0,
          ) && (
            <button
              disabled={enregistrementEnCours}
              onClick={onPublierVintedTout}
              className="inline-flex min-h-[40px] items-center rounded-xl bg-[#09B1BA] px-4 text-[13px] font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              Tout mettre en brouillon sur Vinted
            </button>
          )}
```

- [ ] **Step 4: Désactiver le bouton par fiche sans couleur**

Remplacer le `<button>` « Publier sur Vinted » de chaque fiche par une version
qui connaît son motif de blocage. Juste avant le `return` de la boucle
`generees.map`, calculer :

```tsx
        const mapping = pickVintedMapping(f.qcm.marque, f.qcm.categorie);
        const couleurManquante = mapping !== null && f.qcm.couleurs.length === 0;
```

Puis :

```tsx
                <button
                  disabled={enregistrementEnCours || couleurManquante}
                  onClick={() => onPublierVinted(f.id)}
                  className="flex w-full items-center gap-2.5 rounded-[14px] bg-[#09B1BA] px-4 py-3 transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                >
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-white/20 font-grotesk text-[15px] font-extrabold text-white">
                    V
                  </span>
                  <span className="text-left text-[13.5px] font-bold leading-tight text-white">
                    {couleurManquante ? "Choisis une couleur" : "Publier sur Vinted"}
                  </span>
                  <ArrowRight className="ml-auto h-4 w-4 flex-none text-white" strokeWidth={2.3} />
                </button>
```

Le libellé dit la raison : un bouton grisé sans explication envoie chercher la
cause dans la mauvaise étape.

- [ ] **Step 5: Vérifier**

Run: `npx tsc --noEmit && npx vitest run`
Expected: aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add app/mise-en-vente/_components/ExportAnnonces.tsx app/mise-en-vente/page.tsx
git commit -m "feat(mise-en-vente): queue every eligible listing as a Vinted draft"
```

---

## Task 8: La base de l'extension perd son store d'appariement

**Files:**
- Modify: `extension-vinted/db.js`

**Interfaces:**
- Produit : `saveEntry`, `getAllEntries`, `deleteEntry` inchangés. `savePendingEvent`, `getAllPendingEvents`, `deletePendingEvent` **supprimés**.

Pas de test : `db.js` est une enveloppe IndexedDB sans logique, et IndexedDB
n'existe pas dans l'environnement `node` de Vitest.

- [ ] **Step 1: Passer la base en version 3 et retirer le store**

Remplacer le haut de `extension-vinted/db.js` :

```js
// extension-vinted/db.js
const DB_NAME = "myflip-vinted";
// v3 : le store "pendingEvents" disparaît. Il ne servait qu'à l'appariement
// onglet↔article par openerTabId, devenu inutile depuis que l'extension crée
// elle-même ses onglets (background.js) et connaît donc leur tabId.
const DB_VERSION = 3;
const STORE = "entries";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "entryId" });
      }
      // Migration depuis v2 : le store d'appariement est supprimé s'il existe
      // encore. Les entrées de "entries", elles, sont conservées — elles
      // portent un article réel, pas un état d'appariement.
      if (db.objectStoreNames.contains("pendingEvents")) {
        db.deleteObjectStore("pendingEvents");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
```

- [ ] **Step 2: Supprimer les trois fonctions devenues mortes**

Retirer `savePendingEvent`, `getAllPendingEvents` et `deletePendingEvent` de
`extension-vinted/db.js`. `saveEntry`, `getAllEntries` et `deleteEntry` ne
bougent pas.

- [ ] **Step 3: Vérifier qu'aucun appelant ne subsiste**

Run: `grep -rn "PendingEvent" extension-vinted/`
Expected: seul `background.js` sort — il sera réécrit en Task 10. Si un autre
fichier apparaît, s'arrêter et le signaler.

- [ ] **Step 4: Commit**

```bash
git add extension-vinted/db.js
git commit -m "refactor(extension): drop the tab-pairing store from IndexedDB"
```

---

## Task 9: L'ordonnanceur, fonction pure

**Files:**
- Create: `extension-vinted/file.js`
- Test: `extension-vinted/file.test.js`
- Delete: `extension-vinted/pairing.js`, `extension-vinted/pairing.test.js`
- Modify: `extension-vinted/manifest.json`

**Interfaces:**
- Produit : `prochaineAction(entrees, maintenant)`, `tirerDelaiMs(minMinutes, maxMinutes, alea)`, `entreesPerimees(entrees, maintenant, ttlMs)`.
- Forme d'une entrée : `{ entryId, etat, ts, cibleMs, tabId, titre, description, prix, photos, vinted }` où `etat ∈ { "en-attente", "en-cours", "echouee" }`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `extension-vinted/file.test.js` :

```js
import { describe, expect, it } from "vitest";
import { entreesPerimees, prochaineAction, tirerDelaiMs } from "./file.js";

const enAttente = (entryId, ts, cibleMs = null) => ({
  entryId,
  etat: "en-attente",
  ts,
  cibleMs,
  tabId: null,
});

describe("prochaineAction", () => {
  it("ne fait rien sur une file vide", () => {
    expect(prochaineAction([], 1000)).toEqual({ type: "rien" });
  });

  it("demande à planifier une entrée qui n'a pas encore de cible", () => {
    expect(prochaineAction([enAttente("a", 100)], 1000)).toEqual({
      type: "planifier",
      entryId: "a",
    });
  });

  it("demande à attendre quand la cible est dans le futur", () => {
    expect(prochaineAction([enAttente("a", 100, 5000)], 1000)).toEqual({
      type: "attendre",
      entryId: "a",
      dansMs: 4000,
    });
  });

  it("demande à ouvrir quand la cible est atteinte", () => {
    expect(prochaineAction([enAttente("a", 100, 1000)], 1000)).toEqual({
      type: "ouvrir",
      entryId: "a",
    });
  });

  it("traite les entrées dans leur ordre d'arrivée", () => {
    const file = [enAttente("b", 200, 0), enAttente("a", 100, 0)];
    expect(prochaineAction(file, 1000)).toEqual({ type: "ouvrir", entryId: "a" });
  });

  it("n'ouvre rien tant qu'une entrée est en cours", () => {
    const file = [
      { entryId: "a", etat: "en-cours", ts: 100, cibleMs: 0, tabId: 7 },
      enAttente("b", 200, 0),
    ];
    expect(prochaineAction(file, 1000)).toEqual({ type: "occupe", entryId: "a" });
  });

  it("suspend toute la chaîne dès qu'une entrée a échoué", () => {
    const file = [
      enAttente("b", 200, 0),
      { entryId: "a", etat: "echouee", ts: 100, cibleMs: 0, tabId: 7 },
    ];
    expect(prochaineAction(file, 1000)).toEqual({ type: "suspendu", entryId: "a" });
  });
});

describe("tirerDelaiMs", () => {
  it("respecte la borne basse", () => {
    expect(tirerDelaiMs(2, 6, () => 0)).toBe(120_000);
  });

  it("respecte la borne haute", () => {
    expect(tirerDelaiMs(2, 6, () => 1)).toBe(360_000);
  });

  it("tombe au milieu pour un tirage au milieu", () => {
    expect(tirerDelaiMs(2, 6, () => 0.5)).toBe(240_000);
  });

  it("accepte min = max", () => {
    expect(tirerDelaiMs(3, 3, () => 0.42)).toBe(180_000);
  });

  it("se protège d'une fourchette inversée", () => {
    expect(tirerDelaiMs(6, 2, () => 0)).toBe(120_000);
    expect(tirerDelaiMs(6, 2, () => 1)).toBe(360_000);
  });
});

describe("entreesPerimees", () => {
  it("rend les entrées plus vieilles que le TTL", () => {
    const file = [enAttente("vieille", 0), enAttente("fraiche", 900)];
    expect(entreesPerimees(file, 1000, 500)).toEqual(["vieille"]);
  });

  it("ne purge jamais une entrée en cours, même vieille", () => {
    const file = [{ entryId: "a", etat: "en-cours", ts: 0, cibleMs: 0, tabId: 7 }];
    expect(entreesPerimees(file, 10_000_000, 500)).toEqual([]);
  });
});
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run extension-vinted/file.test.js`
Expected: FAIL — `Failed to load ./file.js`.

- [ ] **Step 3: Écrire l'implémentation**

Créer `extension-vinted/file.js` :

```js
// extension-vinted/file.js
//
// L'ordonnanceur de la file de publication, en fonctions PURES : ni
// IndexedDB, ni browser.*, ni horloge implicite. C'est ce qui le rend
// testable sous Vitest en environnement node, comme l'était pairing.js —
// qu'il remplace.
//
// Une entrée de file :
//   { entryId, etat, ts, cibleMs, tabId, titre, description, prix,
//     photos, vinted }
//
//   etat : "en-attente" — mise en file, pas encore ouverte
//          "en-cours"   — son onglet Vinted est ouvert et se remplit
//          "echouee"    — le remplissage a échoué ; la chaîne est suspendue
//   ts      : epoch ms de mise en file. Donne l'ordre de traitement.
//   cibleMs : epoch ms ABSOLU à partir duquel l'onglet peut s'ouvrir.
//             null tant que le délai anti-ban n'a pas été tiré.

/**
 * Que faire, maintenant ?
 *
 * L'ordre des tests n'est pas cosmétique :
 *
 * 1. `suspendu` d'abord. Un échec arrête TOUT. Cinq brouillons ratés à la
 *    suite coûtent plus cher qu'un seul, et la cause est presque toujours
 *    commune (Vinted a changé son DOM) — enchaîner ne ferait qu'aggraver.
 * 2. `occupe` ensuite. Un seul article en vol à la fois : cinq onglets
 *    ouverts d'un coup seraient à la fois un signal de robot évident et un
 *    moyen sûr de saturer la mémoire du worker avec cent photos.
 * 3. Puis la plus ancienne entrée en attente, par `ts` croissant.
 */
export function prochaineAction(entrees, maintenant) {
  const echouee = entrees.find((e) => e.etat === "echouee");
  if (echouee) return { type: "suspendu", entryId: echouee.entryId };

  const enCours = entrees.find((e) => e.etat === "en-cours");
  if (enCours) return { type: "occupe", entryId: enCours.entryId };

  const attente = entrees
    .filter((e) => e.etat === "en-attente")
    .sort((a, b) => a.ts - b.ts);
  const suivante = attente[0];
  if (!suivante) return { type: "rien" };

  if (suivante.cibleMs == null) return { type: "planifier", entryId: suivante.entryId };
  if (suivante.cibleMs > maintenant) {
    return {
      type: "attendre",
      entryId: suivante.entryId,
      dansMs: suivante.cibleMs - maintenant,
    };
  }
  return { type: "ouvrir", entryId: suivante.entryId };
}

/**
 * Tire un délai en millisecondes dans une fourchette exprimée en MINUTES.
 *
 * `alea` est injecté (au lieu d'appeler Math.random ici) pour que les bornes
 * soient testables. La fourchette est réordonnée si elle arrive à l'envers :
 * les deux champs de /compte sont saisis à la main, rien ne garantit
 * min <= max, et un délai négatif ouvrirait tous les onglets d'un coup —
 * exactement le comportement que ce garde-fou existe pour empêcher.
 */
export function tirerDelaiMs(minMinutes, maxMinutes, alea) {
  const bas = Math.min(minMinutes, maxMinutes);
  const haut = Math.max(minMinutes, maxMinutes);
  return Math.round((bas + alea() * (haut - bas)) * 60_000);
}

/**
 * Entrées trop vieilles pour valoir quelque chose. Une entrée « en-cours »
 * n'est JAMAIS purgée : son onglet est ouvert, et la frappe simulée d'une
 * description peut à elle seule dépasser la minute.
 */
export function entreesPerimees(entrees, maintenant, ttlMs) {
  return entrees
    .filter((e) => e.etat !== "en-cours" && maintenant - e.ts > ttlMs)
    .map((e) => e.entryId);
}
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx vitest run extension-vinted/file.test.js`
Expected: PASS — 14 tests.

- [ ] **Step 5: Supprimer l'appariement, devenu sans objet**

```bash
git rm extension-vinted/pairing.js extension-vinted/pairing.test.js
```

- [ ] **Step 6: Déclarer la permission `alarms`**

Dans `extension-vinted/manifest.json`, remplacer la ligne des permissions :

```json
  "permissions": ["storage", "tabs", "alarms"],
```

`alarms` est indispensable : un délai de plusieurs minutes ne survit pas à un
`setTimeout` dans un worker MV3, que Firefox peut tuer à tout moment. Une
alarme, si.

- [ ] **Step 7: Vérifier le lint de l'extension**

Run: `cd extension-vinted && npx web-ext lint --self-hosted`
Expected: 0 erreur. Les 2 avertissements documentés dans `README.md` restent.

- [ ] **Step 8: Commit**

```bash
git add extension-vinted/file.js extension-vinted/file.test.js extension-vinted/manifest.json
git commit -m "feat(extension): replace tab pairing with a pure sequential scheduler"
```

---

## Task 10: Le worker devient un ordonnanceur

**Files:**
- Modify: `extension-vinted/background.js` (réécriture complète)

**Interfaces:**
- Consomme : `file.js` (Task 9), `db.js` (Task 8).
- Produit : les messages `myflip:mise-en-file`, `vinted:qui-suis-je`, `vinted:resultat` — contrat consommé par `content-myflip.js` (Task 13) et `content-vinted.js` (Task 12).

Pas de test : `background.js` n'est que du branchement d'API `browser.*`. Toute
la logique décidable est dans `file.js`, testée en Task 9. C'est précisément
pourquoi elle en a été extraite.

- [ ] **Step 1: Réécrire le fichier**

Remplacer entièrement `extension-vinted/background.js` :

```js
// extension-vinted/background.js
//
// Ordonnanceur de la file de publication Vinted. Un seul article en vol à la
// fois, un onglet créé par l'extension elle-même, et une alarme pour tenir
// les délais anti-ban à travers la mort du worker.
//
// Ce que ce fichier N'A PLUS : l'appariement onglet↔article par openerTabId.
// L'extension crée ses onglets, donc elle connaît leur tabId — pairing.js et
// le store "pendingEvents" ont disparu avec ce besoin.
//
// Toute la logique de décision vit dans file.js, en fonctions pures testées.
// Ici il ne reste que du branchement d'API browser.*, volontairement.

import { deleteEntry, getAllEntries, saveEntry } from "./db.js";
import { entreesPerimees, prochaineAction, tirerDelaiMs } from "./file.js";

const ALARME = "myflip-vinted-suite";
const TTL_MS = 60 * 60_000;
const URL_FORMULAIRE = "https://www.vinted.fr/items/new";

// Les bornes de délai ne sont pas lisibles par API (invariant de design : pas
// d'API MyFlip dédiée à l'extension). content-myflip.js les copie depuis le
// DOM de /compte vers storage.local. « Réglé » veut donc dire « Aramis a
// visité /compte après son dernier changement ».
async function lireDelaiRegle() {
  const { delaiMin, delaiMax } = await browser.storage.local.get(["delaiMin", "delaiMax"]);
  if (delaiMin == null || delaiMax == null) return null;
  return { delaiMin, delaiMax };
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "myflip:mise-en-file") {
    if (!sender.tab) {
      console.warn("[myflip-vinted] mise-en-file sans onglet expéditeur, ignorée");
      return;
    }
    await saveEntry({
      entryId: msg.entryId,
      titre: msg.titre,
      description: msg.description,
      prix: msg.prix,
      // `{ type, buffer }[]`, pas des Blob : content-myflip.js convertit à la
      // source pour que les photos traversent sans ambiguïté le messaging ET
      // IndexedDB.
      photos: msg.photos,
      // Identifiants numériques Vinted, ou undefined si la fiche n'a pas de
      // mapping. Consommé tel quel par content-vinted.js : aucune traduction
      // de ce côté-ci de la frontière.
      vinted: msg.vinted,
      etat: "en-attente",
      ts: Date.now(),
      cibleMs: null,
      tabId: null,
    });
    await avancer();
    return;
  }

  if (msg.type === "vinted:qui-suis-je") {
    if (!sender.tab) return { entry: null };
    const entries = await getAllEntries();
    const mienne = entries.find((e) => e.tabId === sender.tab.id);
    return { entry: mienne ?? null };
  }

  if (msg.type === "vinted:resultat") {
    const entries = await getAllEntries();
    const entree = entries.find((e) => e.entryId === msg.entryId);
    if (!entree) return;

    if (msg.statut === "succes") {
      // Le clic « Sauvegarder le brouillon » redirige vers /member/<id> : la
      // confirmation arrive par tabs.onUpdated (plus bas), pas ici. Ce
      // message dit seulement que le clic est parti.
      return;
    }
    // Échec de remplissage : l'onglet reste OUVERT avec sa bannière, pour que
    // l'article puisse être terminé à la main, et la chaîne s'arrête.
    entree.etat = "echouee";
    await saveEntry(entree);
    console.warn(`[myflip-vinted] chaîne suspendue sur ${entree.entryId} : ${msg.statut}`);
    return;
  }
});

// Succès : la page a quitté /items/new pour le profil vendeur. C'est le seul
// signal fiable — le toast de confirmation est emporté par la redirection
// avant d'être observable (cf. audit 2026-09-08 §6).
browser.tabs.onUpdated.addListener(async (tabId, infos) => {
  if (!infos.url) return;
  const entries = await getAllEntries();
  const entree = entries.find((e) => e.tabId === tabId && e.etat === "en-cours");
  if (!entree) return;
  if (!infos.url.includes("/member/")) return;

  await deleteEntry(entree.entryId);
  await browser.tabs.remove(tabId).catch(() => {
    // L'onglet a pu être fermé à la main entre-temps : ce n'est pas un échec.
  });
  await avancer();
});

// Un onglet en cours fermé à la main, sans redirection : le travail n'a pas
// abouti. On suspend plutôt que de passer au suivant — l'onglet a été fermé
// pour une raison, et elle vaut probablement pour les articles suivants.
browser.tabs.onRemoved.addListener(async (tabId) => {
  const entries = await getAllEntries();
  const entree = entries.find((e) => e.tabId === tabId && e.etat === "en-cours");
  if (!entree) return;
  entree.etat = "echouee";
  await saveEntry(entree);
});

browser.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME) void avancer();
});

/**
 * Fait avancer la file d'un cran. Idempotente : elle peut être rappelée à
 * tout moment (message entrant, alarme, réveil du worker) et ne fera rien de
 * plus que ce que l'état en base justifie.
 */
async function avancer() {
  const entries = await getAllEntries();

  for (const entryId of entreesPerimees(entries, Date.now(), TTL_MS)) {
    console.warn(`[myflip-vinted] purge de l'entrée périmée ${entryId}`);
    await deleteEntry(entryId);
  }

  const action = prochaineAction(await getAllEntries(), Date.now());

  if (action.type === "planifier") {
    const delai = await lireDelaiRegle();
    if (!delai) {
      // Sans fourchette réglée, on n'invente pas de délai : un délai implicite
      // de zéro annulerait le garde-fou anti-ban. La bannière de
      // content-vinted.js ne peut rien dire ici (aucun onglet ouvert), donc
      // la console est le seul canal — documenté dans le README.
      console.warn("[myflip-vinted] délai anti-ban non réglé : ouvre /compte une fois.");
      return;
    }
    const entrees = await getAllEntries();
    const entree = entrees.find((e) => e.entryId === action.entryId);
    entree.cibleMs = Date.now() + tirerDelaiMs(delai.delaiMin, delai.delaiMax, Math.random);
    await saveEntry(entree);
    return void avancer();
  }

  if (action.type === "attendre") {
    // `when` en epoch absolu, pas `delayInMinutes` : le worker peut mourir
    // entre-temps, et une échéance absolue survit là où un délai relatif
    // repartirait de zéro au réveil.
    browser.alarms.create(ALARME, { when: Date.now() + action.dansMs });
    return;
  }

  if (action.type === "ouvrir") {
    const onglet = await browser.tabs.create({ url: URL_FORMULAIRE, active: false });
    const entrees = await getAllEntries();
    const entree = entrees.find((e) => e.entryId === action.entryId);
    entree.tabId = onglet.id;
    entree.etat = "en-cours";
    await saveEntry(entree);
  }
  // "occupe", "suspendu", "rien" : il n'y a rien à faire. La reprise viendra
  // d'un tabs.onUpdated, d'un tabs.onRemoved, ou d'une nouvelle mise en file.
}

// Au réveil du worker (MV3 : il peut être tué à tout moment), la file est en
// base et se relit. Une entrée « en-cours » dont l'onglet a disparu pendant
// le sommeil est rattrapée ici plutôt que de bloquer la chaîne à jamais.
(async function reprendre() {
  const entries = await getAllEntries();
  for (const e of entries.filter((x) => x.etat === "en-cours")) {
    const vivant = await browser.tabs.get(e.tabId).catch(() => null);
    if (vivant) continue;
    e.etat = "echouee";
    await saveEntry(e);
  }
  await avancer();
})();
```

- [ ] **Step 2: Vérifier le lint**

Run: `cd extension-vinted && npx web-ext lint --self-hosted`
Expected: 0 erreur, 2 avertissements connus.

- [ ] **Step 3: Vérifier qu'aucune référence à l'appariement ne subsiste**

Run: `grep -rn "pairEvents\|pendingEvents\|openerTabId" extension-vinted/`
Expected: aucun résultat.

- [ ] **Step 4: Commit**

```bash
git add extension-vinted/background.js
git commit -m "feat(extension): turn the worker into a sequential scheduler"
```

---

## Task 11: Les primitives de pilotage du formulaire Vinted

**Files:**
- Create: `extension-vinted/formulaire.js`
- Modify: `extension-vinted/manifest.json`

**Interfaces:**
- Produit, dans la portée globale du monde isolé du content script (script classique, pas de module) : `pause`, `pauseAleatoire`, `attendreElement`, `taperTexte`, `ouvrirPanneau`, `choisirOption`, `validerPanneau`, `choisirCategorie`, `cocher`, `injecterPhotos`, `cliquerBrouillon`.

Pas de test unitaire : ce fichier ne fait que piloter le DOM d'un site
qu'on ne contrôle pas. Une fixture écrite à la main testerait mes hypothèses
sur Vinted, pas Vinted — c'est le choix déjà acté dans la spec §7.

- [ ] **Step 1: Créer le fichier**

Créer `extension-vinted/formulaire.js` :

```js
// extension-vinted/formulaire.js
//
// Pilotage du DOM de vinted.fr/items/new. Chargé AVANT content-vinted.js par
// le manifest, comme script classique : pas d'import/export, les fonctions
// vivent dans la portée globale du monde isolé du content script.
//
// Tous les sélecteurs viennent de relevés réels :
//   docs/audits/2026-09-07-vinted-form-mapping.md
//   docs/audits/2026-09-08-vinted-mecanique-panneaux.md
// Ne jamais en inventer un « par analogie » : le prix a déjà prouvé qu'un
// champ peut avoir l'air rempli tout en ne l'étant pas.

const SEL_VALIDER_PANNEAU = '[data-testid="input-dropdown-save-button"]';

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pause aléatoire, bornes en ms. C'est la mesure anti-bot : un formulaire
 *  rempli en 40 ms est le signal le plus lisible qui existe. */
function pauseAleatoire(minMs, maxMs) {
  return pause(minMs + Math.random() * (maxMs - minMs));
}

/**
 * Attend qu'un élément apparaisse. Renvoie l'élément, ou `null` au bout du
 * délai — jamais d'exception : l'appelant décide quoi en faire, et un
 * sélecteur périmé doit produire une bannière, pas une trace de pile.
 */
function attendreElement(selecteur, timeoutMs = 10_000) {
  const deja = document.querySelector(selecteur);
  if (deja) return Promise.resolve(deja);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selecteur);
      if (!el) return;
      observer.disconnect();
      clearTimeout(minuteur);
      resolve(el);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const minuteur = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Écrit une valeur en passant par le setter NATIF du prototype.
 *
 * React installe un « value tracker » sur chaque champ contrôlé : il retient
 * la dernière valeur qu'il a écrite pour décider si un événement `input`
 * correspond à un vrai changement. Une affectation `el.value = …` passe sous
 * ce tracker — le DOM change, React croit que rien n'a bougé, et remet sa
 * valeur au premier re-render. Le setter du prototype met le tracker à jour
 * en même temps que la valeur.
 */
function ecrireValeur(el, valeur) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, valeur);
  else el.value = valeur;
}

/**
 * Tape un texte CARACTÈRE PAR CARACTÈRE, avec de vrais événements clavier.
 *
 * ⚠️ Ce n'est pas seulement de l'anti-bot. Le relevé du 2026-09-08 a créé un
 * brouillon dont le PRIX affichait « 15,00 € » à l'écran et valait `0.0` en
 * base : `el.value = …` + un `Event("input")` synthétique suffisent à mettre
 * à jour l'affichage sans déclencher le commit interne du champ prix. Le
 * titre, écrit pareil, passait. Une frappe réelle plus un `blur` est la seule
 * parade connue — et aucune ne se VÉRIFIE depuis la page : seul le brouillon
 * relu après coup dit la vérité.
 *
 * `Array.from` et non `split("")` : « é » et les emojis sont des paires de
 * substituts, que `split("")` couperait en deux.
 */
async function taperTexte(el, texte) {
  // Un champ non vide a été rempli à la main : on ne l'écrase jamais.
  if (el.value && el.value.trim() !== "") return;
  el.focus();
  let courant = "";
  for (const caractere of Array.from(String(texte))) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: caractere, bubbles: true }));
    courant += caractere;
    ecrireValeur(el, courant);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: caractere, bubbles: true }));
    await pause(25 + Math.random() * 45);
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
}

/** Ouvre un panneau en cliquant son champ visible. Aucun chevron à viser :
 *  le relevé du 2026-09-08 §2 confirme que le champ suffit pour les cinq. */
async function ouvrirPanneau(testid) {
  const champ = await attendreElement(`[data-testid="${testid}"]`);
  if (!champ) return false;
  champ.click();
  await pauseAleatoire(500, 1200);
  return true;
}

/**
 * Coche une option d'un panneau ouvert, à partir de l'id de son input.
 *
 * ⚠️ On ne clique JAMAIS l'input lui-même : il est `aria-hidden="true"` et
 * `tabindex="-1"`, et le relevé du 2026-09-08 §2 l'a vu répondre par
 * intermittence — parfois `aria-checked` bascule sans que le libellé affiché
 * suive. La cible est le conteneur `[role="radio"]` / `[role="checkbox"]`,
 * c'est-à-dire ce qu'un vrai clic utilisateur atteint.
 */
async function choisirOption(idInput) {
  const input = document.getElementById(idInput);
  if (!input) return false;
  const cible = input.closest('[role="radio"], [role="checkbox"]') ?? input.closest("label");
  if (!cible) return false;
  cible.click();
  await pauseAleatoire(300, 900);
  return true;
}

/**
 * Ferme un panneau EN CONSERVANT la sélection.
 *
 * ⚠️ Le bouton « X » (`<champ>-select-dropdown-close-button`) ferme aussi,
 * mais en ANNULANT ce qui vient d'être coché (relevé 2026-09-08 §3, testé
 * sur la couleur). Ni Échap ni un clic à l'extérieur ne ferment quoi que ce
 * soit. « Fait » est le seul geste correct — ne jamais le remplacer.
 */
async function validerPanneau() {
  const bouton = await attendreElement(SEL_VALIDER_PANNEAU, 3000);
  if (!bouton) return false;
  await pauseAleatoire(300, 900);
  bouton.click();
  await pauseAleatoire(400, 1200);
  return true;
}

/**
 * Choisit la catégorie par recherche, puis VÉRIFIE le fil d'Ariane.
 *
 * La vérification n'est pas du zèle : « Sacs à dos » existe sous Femmes
 * (157), sous Hommes (246) et sous Enfants. Si l'id changeait chez Vinted, un
 * clic au mauvais endroit rangerait tous les articles dans le mauvais rayon
 * sans produire la moindre erreur. On préfère échouer bruyamment.
 */
async function choisirCategorie(recherche, categoryId, filArianeAttendu) {
  if (!(await ouvrirPanneau("catalog-select-dropdown-input"))) return false;

  const champRecherche = await attendreElement("#catalog-search-input", 5000);
  if (!champRecherche) return false;
  await taperTexte(champRecherche, recherche);

  const ligne = await attendreElement(`#catalog-search-${categoryId}-result`, 8000);
  if (!ligne) return false;

  const filAriane = (ligne.querySelector(".web_ui__Cell__body")?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (filAriane !== filArianeAttendu) {
    console.error(
      `[myflip-vinted] fil d'Ariane inattendu : « ${filAriane} » au lieu de « ${filArianeAttendu} » — rien n'a été validé`,
    );
    return false;
  }

  ligne.click();
  await pauseAleatoire(300, 900);
  return validerPanneau();
}

/** Coche une case simple (unisexe, format de colis) — hors composant panneau,
 *  donc pas de « Fait » à cliquer derrière. */
async function cocher(selecteur) {
  const el = await attendreElement(selecteur, 5000);
  if (!el) return false;
  if (!el.checked) el.click();
  await pauseAleatoire(400, 1200);
  return true;
}

/**
 * Dépose les photos. `photos` est un tableau de `{ type, buffer }` —
 * content-myflip.js convertit les Blob en ArrayBuffer à la source, seul
 * format qui traverse sans réserve le messaging ET IndexedDB.
 */
function injecterPhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return false;
  // `data-testid` et non `input[type=file]` : le relevé confirme qu'il n'y en
  // a qu'un aujourd'hui, mais un widget tiers ajouté demain en introduirait
  // un second sans prévenir, et querySelector prend le premier venu.
  const input = document.querySelector('[data-testid="add-photos-input"]');
  if (!input) return false;
  try {
    const fichiers = photos
      .map((p, i) => {
        if (!p || !p.buffer) return null;
        const blob = new Blob([p.buffer], { type: p.type || "image/jpeg" });
        return new File([blob], `photo-${String(i + 1).padStart(2, "0")}.jpg`, {
          type: blob.type,
        });
      })
      .filter(Boolean);
    if (fichiers.length === 0) return false;
    const dt = new DataTransfer();
    for (const f of fichiers) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (err) {
    console.error("[myflip-vinted] injection des photos en échec", err);
    return false;
  }
}

/**
 * Clique « Sauvegarder le brouillon ».
 *
 * ⚠️ Jamais `upload-form-save-button` (« Ajouter ») : ce serait une
 * publication réelle, hors périmètre de cette version.
 *
 * L'attribut `disabled` de ce bouton ne veut rien dire — il vaut `false` même
 * sur un formulaire entièrement vide (relevé 2026-09-08 §5). Il ne peut donc
 * pas servir de vérification : l'appelant doit avoir contrôlé chaque champ
 * lui-même avant d'arriver ici.
 */
async function cliquerBrouillon() {
  const bouton = document.querySelector('[data-testid="upload-form-save-draft-button"]');
  if (!bouton) return false;
  await pauseAleatoire(4000, 10_000);
  bouton.click();
  return true;
}
```

- [ ] **Step 2: Charger le fichier avant le content script**

Dans `extension-vinted/manifest.json`, remplacer le second bloc de
`content_scripts` :

```json
    {
      "matches": ["https://www.vinted.fr/items/new*"],
      "js": ["formulaire.js", "content-vinted.js"]
    }
```

L'ordre compte : les deux sont des scripts classiques dans la même portée, et
`content-vinted.js` appelle des fonctions définies par `formulaire.js`.

- [ ] **Step 3: Vérifier le lint**

Run: `cd extension-vinted && npx web-ext lint --self-hosted`
Expected: 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add extension-vinted/formulaire.js extension-vinted/manifest.json
git commit -m "feat(extension): add the Vinted form driving primitives"
```

---

## Task 12: Le remplissage complet, dans l'ordre imposé

**Files:**
- Modify: `extension-vinted/content-vinted.js` (réécriture complète)

**Interfaces:**
- Consomme : les primitives de `formulaire.js` (Task 11) ; le contrat de messages de `background.js` (Task 10).
- Produit : envoie `{ type: "vinted:resultat", entryId, statut }` avec `statut ∈ { "succes", "echec-selecteurs", "succes-partiel" }`.

- [ ] **Step 1: Réécrire le fichier**

Remplacer entièrement `extension-vinted/content-vinted.js` :

```js
// extension-vinted/content-vinted.js
//
// Injecté sur https://www.vinted.fr/items/new*. Chargé APRÈS formulaire.js,
// dont il utilise les primitives (même portée, scripts classiques).
//
// Contrat avec background.js :
//   "vinted:qui-suis-je" → { entry } ou { entry: null }
//   "vinted:resultat"    → { entryId, statut }
//
// Le délai anti-ban n'est PLUS attendu ici : l'onglet n'est créé par le
// worker qu'une fois l'heure venue. Ce script n'a donc plus de compte à
// rebours — quand il s'exécute, c'est qu'il est l'heure.

const ORDRE_ATTENDU_MS = 10_000;

async function init() {
  let reponse;
  try {
    reponse = await browser.runtime.sendMessage({ type: "vinted:qui-suis-je" });
  } catch (err) {
    // Worker injoignable : aucune certitude qu'un article soit assigné à cet
    // onglet. État neutre plutôt qu'une bannière sur une page qui n'a
    // peut-être aucun rapport avec MyFlip.
    console.error("[myflip-vinted]", err);
    return;
  }

  const entry = reponse?.entry;
  if (!entry) return; // onglet Vinted ouvert à la main : ne rien afficher, jamais

  const badge = creerBadge(entry);
  const statut = await remplir(entry, badge);
  masquerBadge(badge);

  if (statut !== "succes") {
    afficherBanniere(
      statut === "echec-selecteurs"
        ? "L'extension a besoin d'une mise à jour — termine cette annonce à la main. La chaîne est arrêtée."
        : "Remplissage incomplet — rien n'a été sauvegardé. Termine à la main. La chaîne est arrêtée.",
    );
  }

  await browser.runtime
    .sendMessage({ type: "vinted:resultat", entryId: entry.entryId, statut })
    .catch((err) => console.error("[myflip-vinted]", err));
}

init();

/**
 * Remplit le formulaire dans l'ORDRE IMPOSÉ par Vinted : marque, état,
 * couleur, matériau, unisexe et colis n'existent pas dans le DOM tant qu'une
 * catégorie feuille n'a pas été validée (audit 2026-09-07 §3).
 *
 * Ne lève jamais. Renvoie :
 *   "echec-selecteurs" — un sélecteur manque, rien n'a été sauvegardé
 *   "succes-partiel"   — un champ n'a pas pris, ou les photos manquent
 *   "succes"           — tout est rempli et le brouillon a été demandé
 *
 * ⚠️ Le clic « Sauvegarder le brouillon » n'a lieu QUE dans le dernier cas.
 * Un brouillon à moitié rempli sauvegardé automatiquement est pire qu'un
 * onglet laissé ouvert : il faut aller le rechercher dans Vinted pour le
 * corriger, sans savoir ce qui manque.
 */
async function remplir(entry, badge) {
  try {
    const v = entry.vinted;
    if (!v) return "echec-selecteurs"; // sans identifiants Vinted, rien à faire ici

    direAuBadge(badge, "catégorie…");
    if (!(await choisirCategorie(v.rechercheCategorie, v.categoryId, v.filAriane))) {
      return "echec-selecteurs";
    }

    // La marque n'apparaît qu'après la validation de la catégorie : son
    // arrivée est le signal que le reste du formulaire est monté.
    const marqueVisible = await attendreElement(
      '[data-testid="brand-select-dropdown-input"]',
      ORDRE_ATTENDU_MS,
    );
    if (!marqueVisible) return "echec-selecteurs";

    direAuBadge(badge, "marque…");
    if (!(await ouvrirPanneau("brand-select-dropdown-input"))) return "echec-selecteurs";
    if (!(await choisirOption(`brand-radio-${v.brandId}`))) return "succes-partiel";
    if (!(await validerPanneau())) return "succes-partiel";

    direAuBadge(badge, "état…");
    if (!(await ouvrirPanneau("category-condition-single-list-input"))) return "succes-partiel";
    if (!(await choisirOption(`condition-radio-${v.conditionId}`))) return "succes-partiel";
    if (!(await validerPanneau())) return "succes-partiel";

    direAuBadge(badge, "couleur…");
    if (!(await ouvrirPanneau("color-select-dropdown-input"))) return "succes-partiel";
    // Jamais plus que la limite : au-delà, Vinted évince silencieusement la
    // plus ancienne sélection au lieu de refuser le clic (FIFO).
    for (const id of v.colorIds.slice(0, 2)) {
      if (!(await choisirOption(`color-checkbox-${id}`))) return "succes-partiel";
    }
    if (!(await validerPanneau())) return "succes-partiel";

    if (v.materialIds.length > 0) {
      direAuBadge(badge, "matériau…");
      if (!(await ouvrirPanneau("category-material-multi-list-input"))) return "succes-partiel";
      for (const id of v.materialIds.slice(0, 3)) {
        if (!(await choisirOption(`material-checkbox-${id}`))) return "succes-partiel";
      }
      if (!(await validerPanneau())) return "succes-partiel";
    }

    if (v.unisex) {
      direAuBadge(badge, "unisexe…");
      if (!(await cocher("#unisex"))) return "succes-partiel";
    }

    // `input[name=…]` et non `#package_type_selector_N` : le relevé donne ce
    // nom à la fois comme `data-testid`, comme `id` et comme `name`, et les
    // variantes `--input` / `--text` laissent penser que le testid nu porte
    // un conteneur. `cocher()` a besoin du vrai `input`, il lit `.checked`.
    direAuBadge(badge, "format du colis…");
    if (!(await cocher(`input[name="package_type_selector_${v.packageType}"]`))) {
      return "succes-partiel";
    }

    direAuBadge(badge, "titre…");
    const champTitre = document.querySelector('[data-testid="title--input"]');
    if (!champTitre) return "succes-partiel";
    await taperTexte(champTitre, entry.titre);

    direAuBadge(badge, "description…");
    const champDescription = document.querySelector('[data-testid="description--input"]');
    if (!champDescription) return "succes-partiel";
    await taperTexte(champDescription, entry.description);

    // Le prix EN DERNIER, et frappé caractère par caractère : c'est le champ
    // qui s'est déjà affiché rempli tout en valant 0.0 en base (audit
    // 2026-09-08 §6). Aucune vérification depuis la page ne peut le
    // démentir — seul le brouillon relu le dira.
    direAuBadge(badge, "prix…");
    const champPrix = document.querySelector('[data-testid="price-input--input"]');
    if (!champPrix) return "succes-partiel";
    await taperTexte(champPrix, String(entry.prix ?? ""));

    direAuBadge(badge, "photos…");
    if (!injecterPhotos(entry.photos)) return "succes-partiel";

    direAuBadge(badge, "brouillon…");
    if (!(await cliquerBrouillon())) return "succes-partiel";
    return "succes";
  } catch (err) {
    console.error("[myflip-vinted] remplissage en échec", err);
    return "echec-selecteurs";
  }
}

// ---------------------------------------------------------------------------
// Badge (Shadow DOM) et bannières
// ---------------------------------------------------------------------------

/**
 * Badge construit noeud par noeud, PAS via innerHTML : `web-ext lint` remonte
 * UNSAFE_VAR_ASSIGNMENT sur toute affectation d'innerHTML dynamique, et
 * `textContent` rend inutile toute fonction d'échappement maison.
 */
function creerBadge(entry) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .badge { display:flex; align-items:center; gap:8px; background:#fff;
      border:1px solid #ddd; border-radius:12px; padding:8px 12px;
      font: 13px system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
    .repere { width:8px; height:8px; border-radius:50%; background:#0f5132; flex-shrink:0; }
    .titre { max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .etape { color:#666; font-variant-numeric:tabular-nums; }
  `;

  const badge = document.createElement("div");
  badge.className = "badge";

  const repere = document.createElement("span");
  repere.className = "repere";
  badge.appendChild(repere);

  const titre = document.createElement("span");
  titre.className = "titre";
  titre.textContent = String(entry.titre || "").slice(0, 40);
  badge.appendChild(titre);

  const etape = document.createElement("span");
  etape.className = "etape";
  etape.textContent = "…";
  badge.appendChild(etape);

  shadow.append(style, badge);
  document.documentElement.appendChild(host);
  return { host, shadow };
}

/** Le badge est un pur confort : une panne d'affichage ne doit jamais
 *  interrompre le remplissage, qui est le vrai travail. */
function direAuBadge(badge, texte) {
  try {
    const el = badge?.shadow.querySelector(".etape");
    if (el) el.textContent = texte;
  } catch {
    // best-effort
  }
}

function masquerBadge(badge) {
  try {
    badge?.host.remove();
  } catch {
    // best-effort
  }
}

function afficherBanniere(texte) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fef3c7;color:#78350f;padding:10px;text-align:center;font:14px system-ui,sans-serif;";
  host.textContent = texte;
  document.documentElement.appendChild(host);
}
```

- [ ] **Step 2: Vérifier le lint**

Run: `cd extension-vinted && npx web-ext lint --self-hosted`
Expected: 0 erreur, 2 avertissements connus.

- [ ] **Step 3: Commit**

```bash
git add extension-vinted/content-vinted.js
git commit -m "feat(extension): fill every Vinted field, then save the draft"
```

---

## Task 13: Le pont côté MyFlip

**Files:**
- Modify: `extension-vinted/content-myflip.js`

**Interfaces:**
- Consomme : `DetailPublicationVinted.vinted` (Task 5).
- Produit : `data-myflip-vinted="1"` sur `<html>`, lu par `extensionPresente()` (Task 6) ; le champ `vinted` dans le message `myflip:mise-en-file`.

- [ ] **Step 1: Poser le marqueur de présence**

Dans `extension-vinted/content-myflip.js`, juste avant l'appel à
`reagirALaRoute()` en haut du fichier :

```js
// Marqueur de présence, lu par extensionPresente() dans
// app/mise-en-vente/_publierVinted.ts. Sans lui, la page ne peut pas savoir
// si quelqu'un écoute son CustomEvent, et ouvrirait un onglet Vinted que
// l'extension ouvre déjà — deux onglets par article.
//
// `dataset` sur documentElement traverse la frontière d'isolation : les
// attributs DOM sont partagés entre le monde du content script et celui de
// la page, contrairement aux objets JavaScript (Xray).
document.documentElement.dataset.myflipVinted = "1";
```

- [ ] **Step 2: Transmettre les champs Vinted**

Dans `ecouterPublicationVinted()`, élargir la destructuration et le message :

```js
    const { articleId, titre, description, prix, photos, vinted } = e.detail;
```

puis, dans l'appel `browser.runtime.sendMessage` :

```js
    await browser.runtime.sendMessage({
      type: "myflip:mise-en-file",
      entryId: articleId,
      titre,
      description,
      prix,
      // Identifiants NUMÉRIQUES Vinted, ou undefined si la fiche n'a pas de
      // mapping. Transmis tels quels : aucune traduction de ce côté-ci, où
      // rien n'est testé. `vinted` est un objet de nombres et de chaînes,
      // structured-cloneable sans réserve — contrairement aux Blob, qui ont
      // dû être convertis en ArrayBuffer juste au-dessus.
      vinted,
      photos: photosTransportables,
    });
```

- [ ] **Step 3: Vérifier le lint**

Run: `cd extension-vinted && npx web-ext lint --self-hosted`
Expected: 0 erreur.

- [ ] **Step 4: Commit**

```bash
git add extension-vinted/content-myflip.js
git commit -m "feat(extension): forward Vinted ids and advertise the extension"
```

---

## Task 14: Vérification d'ensemble et documentation

**Files:**
- Modify: `extension-vinted/README.md`
- Modify: `TODOS.md`

- [ ] **Step 1: Lancer toute la vérification automatisable**

```bash
npx tsc --noEmit
npx vitest run
cd extension-vinted && npx web-ext lint --self-hosted
```

Expected: `tsc` muet ; Vitest vert, avec les tests de `pairing.test.js` (5)
remplacés par ceux de `file.test.js` (14) et les nouveaux fichiers de `lib/` ;
`web-ext lint` à 0 erreur et 2 avertissements.

- [ ] **Step 2: Mettre le README de l'extension à jour**

Dans `extension-vinted/README.md`, remplacer la section décrivant le parcours
par :

```markdown
## Ce que fait l'extension

1. Dans `/mise-en-vente`, étape 4, « Tout mettre en brouillon sur Vinted ».
2. MyFlip enregistre chaque article en statut *Brouillon*, puis met l'annonce
   en file dans l'extension. **Aucun onglet ne s'ouvre à ce moment-là.**
3. L'extension traite **un article à la fois**. Pour chacun : elle attend un
   délai tiré au hasard dans la fourchette réglée dans `/compte`, ouvre un
   onglet Vinted, remplit tout le formulaire, puis clique
   « Sauvegarder le brouillon ».
4. L'onglet se ferme tout seul quand le brouillon est enregistré, et l'article
   suivant démarre son propre délai.

L'extension ne clique **jamais** « Ajouter » : rien n'est publié.

## Au premier passage, vérifie le prix

Ouvre le brouillon créé dans Vinted et regarde le prix.

Lors du relevé du 08/09/2026, un brouillon a été enregistré avec `0,00 €`
alors que le champ affichait « 15,00 € ». Le champ prix a une logique de
validation que l'affichage ne reflète pas. L'extension le tape désormais
caractère par caractère avec de vrais événements clavier, ce qui devrait
suffire — mais **aucune vérification faite depuis la page ne peut le
prouver**. Seul le brouillon relu le dit.

## Si la chaîne s'arrête

C'est voulu. Un échec de remplissage suspend tout le reste de la file :
l'onglet en cours reste ouvert avec une bannière, rien n'a été sauvegardé, et
les articles suivants ne partent pas. La cause d'un échec est presque toujours
commune à tous (Vinted a changé son DOM) — enchaîner ne ferait qu'aggraver.

Pour repartir : ferme l'onglet, corrige, et relance depuis `/mise-en-vente`.

## Le délai doit être réglé

Si `/compte` n'a jamais été visité depuis l'installation, aucune fourchette
n'est en mémoire et **rien ne se passe** — un avertissement part dans la
console du worker (`about:debugging` → Inspecter). Visiter `/compte` une fois
suffit.
```

- [ ] **Step 3: Nettoyer TODOS.md**

Deux sections sont périmées :

- **« P2 · Le vrai goulot : la publication sur Vinted »** — sa piste 2
  (« une extension navigateur qui pré-remplit le formulaire ») est faite, et
  va désormais jusqu'au clic « Sauvegarder le brouillon ». Ajouter une mise à
  jour datée du 08/09/2026 renvoyant à
  `docs/superpowers/specs/2026-09-07-vinted-remplissage-auto-design.md`,
  plutôt que de réécrire la section — ce fichier garde l'historique des
  décisions.
- **« P3 · Panneau de file d'attente et notification dans l'extension
  Vinted »** — elle parle d'un « compte à rebours par onglet » qui n'existe
  plus : l'attente a lieu avant l'ouverture de l'onglet, pas dedans.
  Reformuler en conséquence.

Puis ajouter :

```markdown
- [ ] Vinted : première publication réelle en brouillon — vérifier le prix du
      brouillon créé (cf. extension-vinted/README.md).
- [ ] Vinted : décider si l'on passe un jour au clic « Ajouter » (publication
      réelle). Hors périmètre tant que le brouillon n'a pas tourné plusieurs
      fois sans surprise.
```

- [ ] **Step 4: Commit**

```bash
git add extension-vinted/README.md TODOS.md
git commit -m "docs(extension): document the draft chain and the price check"
```

---

## Ce que ce plan ne couvre pas, et qui reste à Aramis

Aucune de ces étapes n'est faisable depuis un éditeur : MyFlip est derrière
l'authentification, Vinted derrière la sienne.

1. **Appliquer les migrations `PrixReference` et `delai_vinted`** sur la base
   de production **avant** toute fusion dans `main`. `vercel.json` lance
   `prisma generate`, pas `migrate deploy` : fusionner sans ça déploie du code
   qui interroge une table absente.
2. **Peupler `PrixReference`** dans `/parametres`, sans quoi le prix envoyé à
   Vinted est vide — et un prix vide, sur un champ qui a déjà prouvé qu'il
   pouvait mentir, est le pire point de départ pour un premier essai.
3. **Régler la fourchette de délai** dans `/compte`, au moins une fois, sinon
   la file ne démarre pas.
4. **Signer et installer l'extension** :
   `cd extension-vinted && npx web-ext sign --channel=unlisted`, puis
   installer le `.xpi` dans Firefox.
5. **Faire un premier passage sur UN seul article**, pas cinq — et vérifier le
   prix du brouillon produit.
