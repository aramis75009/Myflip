# Le champ prix et l'onglet caché — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que le prix arrive réellement dans le brouillon Vinted au lieu de s'y enregistrer à `0,00 €`, en corrigeant les quatre causes identifiées — le mauvais événement de fin de saisie, le séparateur décimal, l'absence de vrai déplacement de focus, et le bridage de l'onglet d'arrière-plan.

**Architecture:** Le prix cesse d'être traité comme un champ texte ordinaire : il gagne sa propre primitive dans `formulaire.js`, avec la séquence de focus que Vinted attend. Le format français est appliqué **côté MyFlip**, dans le seul endroit testable de la chaîne. Et l'onglet caché cesse d'être un handicap : un script injecté dans le monde de la page lui fait croire qu'il est visible, et les pauses passent par un *worker* que le navigateur ne bride pas.

**Tech Stack:** Next.js 15 / TypeScript côté MyFlip, extension Firefox MV3 en JavaScript ES2022 sans bundler, Vitest en environnement `node`.

**Spec:** `docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md` — les quatre faits établis, avec leur raisonnement. Le lire en entier avant de commencer.

---

## Global Constraints

- **Branche `vinted-champ-prix`**, dans le worktree `.claude/worktrees/extension-vinted/`. Partie de `origin/main` (`a31f369`). Jamais `main` directement.
- **Aucun code du concurrent n'est recopié.** Le diagnostic consigne des faits sur Vinted et sur React ; l'implémentation est la nôtre. Si une ligne ressemble à un copier-coller, elle est à réécrire.
- **La cause racine visée est l'événement, pas la frappe.** Depuis React 17, `onBlur` est émulé depuis **`focusout`**, qui remonte l'arbre ; `blur` ne remonte pas et n'atteint jamais l'écouteur posé à la racine. C'est ce que ce chantier corrige. Ne pas « renforcer la frappe » à la place.
- **Le prix ne se tape plus caractère par caractère.** La valeur est posée en une fois. Les autres champs, eux, ne changent pas.
- **Aucun sélecteur n'est inventé.** `[data-testid="price-input"]` (le conteneur) et `[data-testid="price-input--input"]` (le champ) sont les seuls admis. Seul le second vient d'un relevé DOM (`docs/audits/2026-09-07-vinted-form-mapping.md`) ; le conteneur n'apparaît dans aucun relevé — il vient de la lecture d'une extension concurrente le 09/09 (`docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md`) et reste à confirmer contre le DOM réel de Vinted.
- **Vérification** : `npx tsc --noEmit` et `npx vitest run` depuis la racine du worktree ; `npx web-ext lint --self-hosted` depuis `extension-vinted/` — 0 erreur, 2 avertissements de baseline. **Jamais `npm run build`.**
- **Aucun travail en base**, aucune commande `prisma`.
- **`extension-vinted/*.js` n'est ni typé ni testable** : `tsconfig.json` n'inclut que `**/*.ts` / `**/*.tsx`, et vitest ne collecte que `extension-vinted/**/*.test.js`. Sur ces fichiers, la relecture EST la vérification — un vert ne prouve rien.
- **Commentaires et messages d'interface en français** ; identifiants et messages de commit en anglais.
- **Rien de ce chantier ne tournera dans un navigateur avant qu'Aramis l'essaie**, sur un compte jetable depuis Windows, contre `myflip-app.vercel.app`.

---

## Structure des fichiers

**Créés**

| Fichier | Responsabilité |
|---|---|
| `extension-vinted/page-visible.js` | Injecté dans le monde de la PAGE : fait répondre à Vinted que l'onglet est visible et a le focus. Ne peut pas vivre dans le monde isolé — c'est le React de Vinted qu'il faut convaincre, pas nous. |
| `extension-vinted/minuteur-worker.js` | Minuteurs dans un fil séparé, que le navigateur ne bride pas en arrière-plan. |

**Modifiés**

| Fichier | Changement |
|---|---|
| `app/mise-en-vente/_publierVinted.ts` + test | `prixPourVinted()` — le seul maillon testable de la chaîne du prix. |
| `extension-vinted/formulaire.js` | `taperPrix()` ; `pause()` passe par le worker. |
| `extension-vinted/content-vinted.js` | Appelle `taperPrix()` ; injecte `page-visible.js`. |
| `extension-vinted/manifest.json` | `web_accessible_resources` pour les deux nouveaux fichiers ; version `1.2.0`. |
| `extension-vinted/README.md` | Ce que fait l'extension pour le prix, et pourquoi l'onglet caché ment. |

---

## Task 1: Le prix part au format français — et c'est testé

C'est le seul maillon de la chaîne du prix qui peut être couvert par un test. On commence par lui.

**Files:**
- Modify: `app/mise-en-vente/_publierVinted.ts`
- Test: `app/mise-en-vente/_publierVinted.test.ts`

**Interfaces:**
- Produit : `prixPourVinted(brut: string): string`, exportée. Consommée par `detailPublicationVinted()` dans le même fichier, et par personne d'autre.

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `app/mise-en-vente/_publierVinted.test.ts` :

```ts
describe("prixPourVinted", () => {
  it("convertit le point décimal en virgule — le champ Vinted est en locale française", () => {
    expect(prixPourVinted("24.5")).toBe("24,5");
  });

  it("laisse une virgule déjà saisie tranquille", () => {
    expect(prixPourVinted("24,5")).toBe("24,5");
  });

  it("laisse un entier tranquille", () => {
    expect(prixPourVinted("25")).toBe("25");
  });

  it("retire les espaces autour", () => {
    expect(prixPourVinted("  25 ")).toBe("25");
  });

  it("ne convertit QUE le premier point — « 1.234.5 » n'est pas un prix, on ne l'invente pas", () => {
    // Un second point signalerait une saisie qu'on ne sait pas interpréter.
    // La convertir en virgule fabriquerait un nombre plausible et faux ;
    // la laisser telle quelle fait échouer le champ bruyamment.
    expect(prixPourVinted("1.234.5")).toBe("1,234.5");
  });

  it("rend une chaîne vide sur une entrée vide", () => {
    expect(prixPourVinted("")).toBe("");
    expect(prixPourVinted("   ")).toBe("");
  });
});
```

Compléter la ligne d'import en tête du fichier pour ajouter `prixPourVinted` à ce qui est importé depuis `./_publierVinted`.

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `npx vitest run app/mise-en-vente/_publierVinted.test.ts`
Expected: FAIL — `"prixPourVinted" is not exported by "app/mise-en-vente/_publierVinted.ts"`.

- [ ] **Step 3: Écrire l'implémentation**

Dans `app/mise-en-vente/_publierVinted.ts`, ajouter avant `detailPublicationVinted` :

```ts
/**
 * Le prix, au format que le champ Vinted attend réellement.
 *
 * Le champ est en locale française : il veut « 24,5 », pas « 24.5 ». Un point
 * reçu là où il attend une virgule fait partie des causes retenues pour le
 * brouillon enregistré à `0,00 €` du 2026-09-08 (cf.
 * docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md, fait n° 2).
 *
 * `replace` sans drapeau global : il ne remplace que la PREMIÈRE occurrence.
 * C'est voulu. « 1.234.5 » n'est pas un prix que nous savons lire ; en faire
 * « 1,234,5 » fabriquerait un nombre plausible et faux. Mieux vaut laisser
 * passer une valeur que le champ refusera visiblement.
 */
export function prixPourVinted(brut: string): string {
  return String(brut ?? "").trim().replace(".", ",");
}
```

Puis, dans `detailPublicationVinted`, remplacer `prix: f.qcm.prix,` par :

```ts
    prix: prixPourVinted(f.qcm.prix),
```

- [ ] **Step 4: Lancer le test et vérifier qu'il passe**

Run: `npx vitest run app/mise-en-vente/_publierVinted.test.ts`
Expected: PASS.

⚠️ Le test existant « porte l'id article, le texte de l'annonce, le prix… » attend `prix: "25"` pour un `qcm.prix` de `"25"` : un entier traverse `prixPourVinted` sans changer, donc il reste vert. S'il devient rouge, c'est que l'implémentation ne fait pas ce que le brief décrit — s'arrêter et le signaler plutôt que d'ajuster le test.

- [ ] **Step 5: Vérifier et commiter**

Run: `npx tsc --noEmit` — attendu : exit 0, aucune sortie.
Run: `npx vitest run` — attendu : aucun échec.

```bash
git add app/mise-en-vente/_publierVinted.ts app/mise-en-vente/_publierVinted.test.ts
git commit -m "fix: send the price in the format the French Vinted field expects"
```

---

## Task 2: `taperPrix()` — la séquence de focus que le champ attend

**Files:**
- Modify: `extension-vinted/formulaire.js`
- Modify: `extension-vinted/content-vinted.js`

**Interfaces:**
- Consomme : `ecrireValeur()`, `pauseAleatoire()`, `decrireChamp()` — déjà dans `formulaire.js`.
- Produit : `taperPrix(el, valeur): Promise<boolean>`, dans la portée globale du monde isolé. Appelée par `content-vinted.js`.

⚠️ **Aucun test ne couvre ce fichier et aucun ne le peut.** La relecture du diff est la seule vérification. Écrire lentement, relire.

- [ ] **Step 1: Ajouter `taperPrix()` à `formulaire.js`**

À placer juste après `taperTexte()`, avant `decrireChamp()` :

```js
/**
 * Écrit le PRIX. Ce champ a sa propre fonction parce qu'il a sa propre
 * mécanique — c'est le seul du formulaire qui valide au DÉPART du focus, et
 * c'est ce qui a produit le brouillon à `0,00 €` du 2026-09-08.
 *
 * Trois différences avec `taperTexte()`, chacune motivée dans
 * docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md :
 *
 * 1. `focusout` — LA correction. Depuis React 17, `onBlur` est émulé depuis
 *    `focusout`, écouté à la RACINE de l'application. `blur` ne remonte pas
 *    l'arbre (par spécification) : un `blur` fabriqué et lancé sur le champ
 *    n'atteint jamais cet écouteur, quoi qu'on mette dans `bubbles`. Le champ
 *    ne valide donc jamais, garde l'affichage produit par `input`, et le
 *    formulaire part avec zéro. Le titre survit à ça parce qu'il valide à la
 *    frappe, pas au départ.
 * 2. La valeur est posée EN UNE FOIS. La frappe caractère par caractère
 *    n'était pas la parade — elle ne touche pas au problème de focus, et elle
 *    coûte cher dans un onglet bridé.
 * 3. Un vrai clic sur le conteneur encadre l'écriture. `el.blur()` natif ne
 *    produit un `focusout` que si le champ avait réellement le focus ; le clic
 *    le lui donne, puis le lui retire pour de bon.
 */
async function taperPrix(el, valeur) {
  const demande = String(valeur);
  // Même règle que taperTexte : un champ déjà rempli à la main ne s'écrase pas.
  if (el.value && el.value.trim() !== "") return true;

  const conteneur = document.querySelector('[data-testid="price-input"]');

  if (conteneur) {
    conteneur.click();
    await pauseAleatoire(100, 200);
  }
  el.click();
  el.focus();
  await pauseAleatoire(100, 200);

  // `focusin` remonte, contrairement à `focus` : c'est celui que React voit.
  el.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));

  ecrireValeur(el, demande);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));

  // Laisser au champ le temps de reformater avant de lui retirer le focus :
  // c'est pendant cette fenêtre qu'il transforme « 15 » en « 15,00 € ».
  await pauseAleatoire(300, 500);

  // Le départ réel du focus, puis l'événement qui remonte. Les deux, parce
  // qu'ils ne servent pas au même : `blur()` pour le navigateur, `focusout`
  // pour React.
  el.blur();
  el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  await pauseAleatoire(200, 300);

  // Un vrai clic ailleurs : c'est ce qui déplace le focus pour de bon, là où
  // un événement fabriqué ne fait que le prétendre.
  if (conteneur) conteneur.click();
  await pauseAleatoire(200, 400);

  // Vérification VOLONTAIREMENT FAIBLE, comme dans taperTexte : on teste que
  // le champ n'est pas resté vide, jamais l'égalité avec la valeur demandée —
  // le champ reformate ce qu'on lui donne. Et rien de ce qui se lit depuis la
  // page ne prouve le commit : seul le brouillon relu après coup le dit.
  if (demande.trim() !== "" && String(el.value ?? "").trim() === "") {
    console.warn(
      `[myflip-vinted] prix sans effet sur ${decrireChamp(el)} : le champ est resté vide`,
    );
    return false;
  }
  return true;
}
```

- [ ] **Step 2: Brancher `taperPrix()` dans `content-vinted.js`**

Remplacer la ligne :

```js
    if (!(await taperTexte(champPrix, prixDemande))) return "succes-partiel";
```

par :

```js
    if (!(await taperPrix(champPrix, prixDemande))) return "succes-partiel";
```

Et corriger le commentaire au-dessus du bloc du prix (autour de la ligne 163), qui annonce encore une frappe caractère par caractère :

```js
    // Le prix EN DERNIER, et par `taperPrix()` : ce champ valide au DÉPART du
    // focus, pas à la frappe, et c'est ce qui l'avait fait partir à 0,00 €.
```

- [ ] **Step 3: Vérifier**

Run: `cd extension-vinted && npx web-ext lint --self-hosted` — attendu : 0 erreur, 2 avertissements, pas de troisième.
Run (racine du worktree) : `npx tsc --noEmit` puis `npx vitest run` — attendu : inchangés.

- [ ] **Step 4: Relire son propre diff, à voix haute**

Aucun outil ne vérifiera ce fichier. Contrôler une par une : `taperPrix` est bien déclarée avant son usage dans l'ordre de chargement du manifest (`formulaire.js` avant `content-vinted.js`) ; `taperTexte` n'est plus appelée pour le prix mais l'est toujours pour le titre et la description ; aucun `await` oublié ; le sélecteur du conteneur est bien `[data-testid="price-input"]`, celui du champ `[data-testid="price-input--input"]`.

- [ ] **Step 5: Commiter**

```bash
git add extension-vinted/formulaire.js extension-vinted/content-vinted.js
git commit -m "fix: give the price field the focus sequence it validates on"
```

---

## Task 3: Faire croire à la page qu'elle est visible

⚠️ **NOTE — DÉPASSÉ EN FIX ROUND 1** : Ce plan décrit une injection par `<script src browser.runtime.getURL(...)>` et une déclaration séparée dans `web_accessible_resources`. **Ce n'est pas ce qui a été livré.** La fonction `forcerVisibilitePage()` vit désormais dans `content-vinted.js` et s'injecte avec `script.textContent = \`(${forcerVisibilitePage.toString()})();\`` — le même pattern synchrone que `content-myflip.js`. Pourquoi : une injection par `<script src>` s'exécute de manière asynchrone, créant une course entre le chargement du script et la première écriture de formulaire. Le `textContent` garantit l'exécution immédiate. Historiquement, ce plan envisageait le premier ; pragmatiquement, le second a livré le résultat.

---

**Files:**
- ~~Create: `extension-vinted/page-visible.js`~~ *Créé directement dans `content-vinted.js`*
- Modify: `extension-vinted/content-vinted.js`, ~~`extension-vinted/manifest.json`~~ *Le manifest n'a pas changé*

**Interfaces:**
- Produit : une fonction `forcerVisibilitePage()` dans le monde isolé, injectée dans le monde de la PAGE. N'expose rien ; elle agit par effet de bord sur `document` et `window`.

⚠️ **Ce script DOIT tourner dans le monde de la page, pas dans le monde isolé du content script.** C'est le React de Vinted qu'il s'agit de convaincre, et il ne voit que les propriétés du monde de la page. Redéfinir `document.hidden` depuis un content script ne changerait rien pour lui — même piège que le `history.pushState` documenté dans `content-myflip.js`.

- [ ] **Step 1: Créer `extension-vinted/page-visible.js`**

```js
// extension-vinted/page-visible.js
//
// Tourne dans le monde de la PAGE (injecté par content-vinted.js via
// web_accessible_resources), pas dans le monde isolé du content script.
//
// Pourquoi : l'extension ouvre l'onglet Vinted en ARRIÈRE-PLAN, pour ne pas
// voler l'écran. Un onglet caché répond `document.hidden === true`,
// `visibilityState === "hidden"`, `hasFocus() === false` — et un formulaire
// qui valide au départ du focus peut alors ne jamais considérer qu'il l'a eu.
// C'est l'une des quatre causes retenues pour le brouillon à `0,00 €`
// (docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md, fait n° 4).
//
// Ce script ne touche à AUCUNE donnée et n'envoie rien nulle part : il répond
// « visible » aux questions que la page se pose sur elle-même.

(function () {
  "use strict";

  const mentir = (objet, propriete, valeur) => {
    try {
      Object.defineProperty(objet, propriete, {
        get: () => valeur,
        configurable: true,
      });
    } catch (e) {
      // Une propriété non configurable, ou un navigateur qui refuse : on
      // n'insiste pas. Le remplissage marchera peut-être quand même, et une
      // exception ici casserait tout le reste du script.
    }
  };

  mentir(document, "hidden", false);
  mentir(document, "visibilityState", "visible");
  document.hasFocus = function () {
    return true;
  };

  // Les gestionnaires posés en propriété (`document.onvisibilitychange = …`)
  // ne passent pas par addEventListener : les neutraliser séparément.
  for (const prop of ["onvisibilitychange", "onblur"]) {
    for (const cible of [document, window]) {
      try {
        Object.defineProperty(cible, prop, {
          get: () => null,
          set: () => {},
          configurable: true,
        });
      } catch (e) {
        // idem
      }
    }
  }

  // Et ceux posés par addEventListener : interceptés en phase de CAPTURE,
  // donc avant d'atteindre leur cible.
  for (const evenement of ["visibilitychange", "blur", "pagehide"]) {
    const bloquer = (e) => e.stopImmediatePropagation();
    document.addEventListener(evenement, bloquer, true);
    window.addEventListener(evenement, bloquer, true);
  }
})();
```

- [ ] **Step 2: L'injecter depuis `content-vinted.js`**

Tout en haut du fichier, après son commentaire d'en-tête et avant toute autre instruction — il doit agir **avant** que le React de Vinted ne s'installe :

```js
// Injecté dans le monde de la PAGE, le plus tôt possible : ce script répond
// « visible » aux questions que Vinted se pose sur l'onglet, qui est ouvert
// en arrière-plan. Depuis le monde isolé, redéfinir `document.hidden`
// n'aurait aucun effet sur le React de Vinted — cf. l'en-tête du fichier.
(function injecterVisibilite() {
  try {
    const script = document.createElement("script");
    script.src = browser.runtime.getURL("page-visible.js");
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (err) {
    console.warn("[myflip-vinted] injection de page-visible.js impossible", err);
  }
})();
```

- [ ] **Step 3: Déclarer la ressource dans le manifest**

Ajouter à `extension-vinted/manifest.json`, au même niveau que `content_scripts` :

```json
  "web_accessible_resources": [
    {
      "resources": ["page-visible.js"],
      "matches": ["https://www.vinted.fr/*"]
    }
  ],
```

Et porter `"version"` à `"1.2.0"`.

- [ ] **Step 4: Vérifier**

Run: `cd extension-vinted && npx web-ext lint --self-hosted`
Expected : 0 erreur. **Le nombre d'avertissements peut passer de 2 à 3** — `web-ext` signale parfois `web_accessible_resources`. Si un troisième apparaît, le LIRE et le rapporter dans le rapport avec son texte exact ; ne pas le taire, ne pas le supposer bénin.

Run (racine) : `npx tsc --noEmit` et `npx vitest run` — attendus inchangés.

- [ ] **Step 5: Commiter**

```bash
git add extension-vinted/page-visible.js extension-vinted/content-vinted.js extension-vinted/manifest.json
git commit -m "fix: tell the hidden tab it is visible, from the page world"
```

---

## Task 4: Des pauses que le navigateur ne bride pas

**Files:**
- Create: `extension-vinted/minuteur-worker.js`
- Modify: `extension-vinted/formulaire.js`, `extension-vinted/manifest.json`

**Interfaces:**
- Produit : un worker qui rend des `setTimeout` non bridés. `pause()` de `formulaire.js` l'utilise, avec repli sur `setTimeout` si le worker ne peut pas être créé.

- [ ] **Step 1: Créer `extension-vinted/minuteur-worker.js`**

```js
// extension-vinted/minuteur-worker.js
//
// Un worker ne fait qu'une chose ici : rendre la main après un délai, sans
// être soumis au bridage des minuteurs que le navigateur impose aux onglets
// d'arrière-plan (au minimum une seconde, et davantage avec le temps).
//
// L'extension ouvre l'onglet Vinted caché : sans ce détour, les pauses de 25
// à 70 ms de la frappe deviennent des secondes, et remplir une description
// prendrait des minutes.

self.onmessage = (e) => {
  const { id, delai } = e.data || {};
  setTimeout(() => self.postMessage({ id }), delai);
};
```

- [ ] **Step 2: Faire passer `pause()` par le worker**

Dans `extension-vinted/formulaire.js`, remplacer la fonction `pause()` actuelle par :

```js
/**
 * Le worker de minuterie, créé une seule fois et à la demande.
 *
 * `null` tant qu'on n'a pas essayé, `false` si la création a échoué — auquel
 * cas on retombe définitivement sur `setTimeout`. Distinguer les deux évite
 * de retenter la création à chaque pause.
 */
let minuteurWorker = null;

function obtenirMinuteur() {
  if (minuteurWorker !== null) return minuteurWorker;
  try {
    minuteurWorker = new Worker(browser.runtime.getURL("minuteur-worker.js"));
  } catch (err) {
    console.warn(
      "[myflip-vinted] worker de minuterie indisponible : les pauses seront bridées en arrière-plan",
      err,
    );
    minuteurWorker = false;
  }
  return minuteurWorker;
}

let prochainIdPause = 1;

/**
 * Attend `ms` millisecondes.
 *
 * Passe par un worker plutôt que par `setTimeout` : l'onglet Vinted est ouvert
 * en ARRIÈRE-PLAN, et le navigateur y bride les minuteurs à une seconde
 * minimum. Une frappe qui pose des pauses de 25 ms deviendrait vingt fois plus
 * lente. Un worker tourne dans son propre fil et échappe à ce bridage.
 *
 * Repli sur `setTimeout` si le worker ne peut pas être créé : lent, mais
 * fonctionnel — jamais un blocage.
 */
function pause(ms) {
  const worker = obtenirMinuteur();
  if (!worker) return new Promise((r) => setTimeout(r, ms));

  const id = prochainIdPause++;
  return new Promise((resolve) => {
    const surReponse = (e) => {
      if (e.data?.id !== id) return;
      worker.removeEventListener("message", surReponse);
      resolve();
    };
    worker.addEventListener("message", surReponse);
    worker.postMessage({ id, delai: ms });
  });
}
```

⚠️ Un identifiant par pause, et l'écouteur retiré dès la réponse : sans ça, deux pauses concurrentes se réveilleraient l'une l'autre, et les écouteurs s'accumuleraient à chaque caractère frappé.

- [ ] **Step 3: Déclarer le worker dans le manifest**

Ajouter `"minuteur-worker.js"` au tableau `resources` de `web_accessible_resources` créé en Tâche 3 :

```json
      "resources": ["page-visible.js", "minuteur-worker.js"],
```

- [ ] **Step 4: Vérifier**

Run: `cd extension-vinted && npx web-ext lint --self-hosted` — 0 erreur ; rapporter le compte d'avertissements réel.
Run (racine) : `npx tsc --noEmit` et `npx vitest run` — inchangés.

- [ ] **Step 5: Relire son propre diff**

Contrôler : `pause()` garde exactement la même signature et le même contrat qu'avant (une promesse qui se résout après le délai) ; `pauseAleatoire()` n'a pas été touchée et continue de l'appeler ; aucun appelant de `pause()` n'a changé.

- [ ] **Step 6: Commiter**

```bash
git add extension-vinted/minuteur-worker.js extension-vinted/formulaire.js extension-vinted/manifest.json
git commit -m "fix: run the fill pauses in a worker so a hidden tab does not throttle them"
```

---

## Task 5: Documentation et vérification d'ensemble

**Files:**
- Modify: `extension-vinted/README.md`

- [ ] **Step 1: Remplacer la section « Au premier passage, vérifie le prix »**

La section actuelle décrit la frappe caractère par caractère comme la parade. Ce n'est plus vrai. La remplacer par :

```markdown
## Au premier passage, vérifie le prix

Ouvre le brouillon créé dans Vinted et regarde le prix. **C'est le seul point
que rien d'automatique ne peut prouver.**

Lors du relevé du 08/09/2026, un brouillon a été enregistré avec `0,00 €` alors
que le champ affichait « 15,00 € ». Le diagnostic complet est dans
`docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md` ; en résumé, quatre
causes, toutes corrigées le 09/09 :

1. **Le mauvais événement.** Depuis React 17, `onBlur` est émulé depuis
   `focusout`, écouté à la racine de l'application ; `blur` ne remonte pas
   l'arbre et n'y arrive donc jamais. Le champ prix valide au DÉPART du focus —
   sans ce signal, il gardait l'affichage et le formulaire partait à zéro. Le
   titre survivait parce qu'il valide à la frappe.
2. **Le séparateur décimal.** Le champ est en locale française : il veut
   « 24,5 », pas « 24.5 ». La conversion se fait côté MyFlip, dans
   `prixPourVinted()` — le seul maillon de la chaîne du prix qui soit testé.
3. **Le focus n'était pas réellement déplacé.** Un vrai clic sur le conteneur
   encadre désormais l'écriture.
4. **L'onglet est caché.** Un onglet d'arrière-plan répond « je ne suis pas
   visible » et voit ses minuteurs bridés à la seconde. `page-visible.js` lui
   fait répondre l'inverse, depuis le monde de la page ; `minuteur-worker.js`
   sort les pauses du bridage.

**La frappe caractère par caractère n'était pas la solution** et ne s'applique
plus au prix : sa valeur est posée en une fois. Le titre et la description, eux,
continuent d'être frappés lettre à lettre.
```

- [ ] **Step 2: Vérification d'ensemble, les trois commandes**

Run (racine du worktree) : `npx tsc --noEmit` — exit 0, aucune sortie.
Run : `npx vitest run` — 17 fichiers, le total monte de 6 (les tests de `prixPourVinted`), 0 échec.
Run : `cd extension-vinted && npx web-ext lint --self-hosted` — 0 erreur ; rapporter le compte d'avertissements réel et le texte de tout avertissement nouveau.

⚠️ **Ne pas lancer `npm run build`.**

- [ ] **Step 3: Commiter**

```bash
git add extension-vinted/README.md
git commit -m "docs: record the four causes of the 0,00 EUR draft and their fixes"
```

- [ ] **Step 4: Dire ce qui n'a pas été vérifié**

En rendant la main, énoncer sans l'adoucir : **rien de ce chantier n'a tourné dans un navigateur.** Les quatre correctifs sont un diagnostic appliqué, pas un résultat observé. Trois d'entre eux vivent dans des fichiers qu'aucun outil ne type ni ne teste. Le seul verdict qui compte reste le prix du brouillon relu dans Vinted.

---

## Ce que ce plan ne couvre pas

- **La signature de l'extension** pour une installation permanente (voie « unlisted » d'addons.mozilla.org). Décidé avec Aramis le 09/09 : à faire, mais après l'essai.
- **La colonne `prixAnnonce`** — décidée le 09/09, consignée dans `TODOS.md`, à faire après l'essai également. Elle ne change rien au prix qui part vers Vinted, qui voyage en mémoire.
- **L'interception des réponses de l'API Vinted**, que le concurrent pratique pour confirmer la création d'un brouillon. MyFlip détecte le succès par le changement d'URL. Hors périmètre : ça marche, et rien ne prouve que ce soit insuffisant.
