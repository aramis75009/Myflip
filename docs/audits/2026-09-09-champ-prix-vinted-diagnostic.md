# Le champ prix de Vinted — diagnostic du brouillon à 0,00 €

**Date** : 2026-09-09
**Origine** : comparaison entre `extension-vinted/formulaire.js` et le
comportement observable d'une extension concurrente publiée sur
addons.mozilla.org (Le Troc Futé, 2.0.9), téléchargée publiquement, lue, puis
supprimée.

⚠️ **Ce document ne contient aucun code tiers.** Il consigne des **faits sur le
site de Vinted** et sur le fonctionnement de React — au même titre que les trois
relevés DOM déjà présents dans ce dossier. Aucune ligne n'a été recopiée, et
aucune ne doit l'être : leur implémentation leur appartient.

---

## Le symptôme, rappelé

Relevé du 2026-09-08 : un brouillon enregistré à **`0,00 €`** alors que le champ
affichait « 15,00 € ». Le titre, écrit exactement de la même façon, passait sans
problème. `extension-vinted/README.md` le documente comme le seul inconnu du
chantier, et `formulaire.js` porte la parade actuelle — frappe caractère par
caractère — avec la mention honnête qu'elle n'a jamais été prouvée.

**Le champ prix est le seul du formulaire à se comporter ainsi.** C'est le fait
central : ce n'est pas un problème de frappe en général, c'est un problème
propre à ce champ.

---

## Fait n° 1 — `blur` n'est pas ce que React écoute

**C'est l'explication la plus probable, et elle n'a rien de spécifique à
Vinted.**

Depuis React 17, les gestionnaires ne sont plus posés sur chaque élément mais
**à la racine de l'application**, et `onBlur` est émulé à partir de
l'événement **`focusout`**, pas de `blur`.

Or `blur` **ne remonte pas** l'arbre DOM (`bubbles: false` par spécification).
Le forcer à `true` sur un événement synthétique ne change rien : React n'a pas
d'écouteur `blur` à la racine, il en a un `focusout`. Un `blur` fabriqué et
lancé sur l'élément ne l'atteint donc **jamais**.

`formulaire.js` (`taperTexte`, lignes 106-108) termine par :

```
change → el.blur() → FocusEvent("blur", { bubbles: true })
```

Le `el.blur()` natif, lui, produit un vrai `focusout`… **si l'élément a
réellement le focus**. En onglet d'arrière-plan, ce n'est pas garanti (cf. fait
n° 4).

**Ce que fait le concurrent, et qui marche** : `focusout` explicite, puis un
**vrai clic** sur un autre élément pour déplacer le focus pour de bon.

**Pourquoi le titre passe et pas le prix** : le titre se contente de l'événement
`input` pour se mettre à jour et se soumettre. Le prix a une **validation au
départ du focus** — il reformate « 15 » en « 15,00 € » — et c'est cette étape
qui commite la valeur. Pas de `focusout` vu par React, pas de commit : le champ
garde l'affichage produit par `input`, et le formulaire part avec `0`.

---

## Fait n° 2 — le séparateur décimal doit être une virgule

Le champ est en locale française : il attend **`15,00`**, pas `15.00`.

Le concurrent convertit systématiquement le point en virgule avant d'écrire.

`app/mise-en-vente` laisse `qcm.prix` tel qu'Aramis l'a saisi, et le
pré-remplissage écrit `String(prixReference)` — donc `24.5` produit **`24.5`**,
avec un point. Un champ français qui reçoit un point peut soit l'ignorer, soit
tronquer, soit rendre `0`.

**Ce fait est indépendant du n° 1 et doit être corrigé aussi** : même avec le
bon événement, `24.5` n'est pas ce que le champ attend.

---

## Fait n° 3 — le champ prix veut un vrai clic, avant et après

Le concurrent, pour ce champ **et pour lui seul**, encadre l'écriture de deux
clics réels : un sur le conteneur `[data-testid="price-input"]` avant, un autre
après pour sortir du champ. Entre les deux, une pause de 300 à 500 ms avant de
signaler le départ du focus.

Les autres champs n'ont pas ce traitement. Le fait qu'ils aient écrit une
fonction séparée **uniquement pour le prix** est en soi l'information : ce champ
a une mécanique de validation que les autres n'ont pas.

À noter : ils **n'écrivent pas caractère par caractère** pour le prix. Ils
posent la valeur en une fois. La frappe lettre à lettre n'est donc pas la
parade — la séquence de focus l'est.

---

## Fait n° 4 — l'onglet d'arrière-plan est un piège à part entière

`background.js` de MyFlip ouvre l'onglet Vinted avec `active: false`. Dans un
onglet qui n'est pas au premier plan, le navigateur impose deux choses :

- `document.hidden === true`, `document.visibilityState === "hidden"`,
  `document.hasFocus() === false` ;
- les minuteurs sont **bridés** — au minimum une seconde, et bien davantage
  après quelques minutes.

Conséquences pour `formulaire.js` : les micro-pauses de 25 à 70 ms deviennent
des secondes, ce qui allonge démesurément une frappe caractère par caractère ; et
un champ qui valide au départ du focus peut ne jamais considérer qu'il l'a eu.

Le concurrent traite les deux de front, et c'est l'aveu le plus clair que le
problème existe :

- il **ment à la page** sur sa visibilité et son focus (`document.hidden`,
  `visibilityState`, `hasFocus()` forcés, et les événements `visibilitychange` /
  `blur` neutralisés) ;
- il **déporte ses minuteurs dans un Web Worker**, non soumis au bridage — leur
  fichier le dit en commentaire, en toutes lettres.

⚠️ **Ce mensonge sur la visibilité n'est possible que depuis le monde de la
page**, pas depuis un content script isolé. Le concurrent injecte ses scripts
via `web_accessible_resources`. `formulaire.js` tourne aujourd'hui dans le monde
isolé : y redéfinir `document.hidden` n'aurait **aucun effet** sur le React de
Vinted.

---

## Ce que ça implique pour MyFlip, par ordre de coût

| # | Correctif | Coût | Effet attendu |
|---|---|---|---|
| 1 | Émettre `focusout` (qui remonte) au lieu de compter sur `blur` | 2 lignes | Probable cause racine |
| 2 | Convertir le point en virgule avant d'écrire le prix | 1 ligne | Indépendant, nécessaire |
| 3 | Clic réel sur le conteneur du prix avant et après, avec pause | ~10 lignes | Renforce le n° 1 |
| 4 | Ouvrir l'onglet **au premier plan** (`active: true`) | 1 mot | Supprime le piège n° 4 sans mentir à la page |
| 5 | Minuteurs dans un Worker, mensonge de visibilité, injection monde page | important | À n'envisager que si le n° 4 ne suffit pas |

**Le n° 4 mérite une décision produit.** Ouvrir l'onglet au premier plan vole le
focus à Aramis pendant le remplissage — désagréable sur un lot de cinq. Mais
c'est une ligne de code contre plusieurs centaines pour reproduire le
contournement du concurrent, et c'est **honnête** vis-à-vis du navigateur.

---

## Ce qui reste non prouvé

Tout, jusqu'à un passage réel. Ce document explique **pourquoi** le prix
échouait probablement ; il ne le démontre pas. La seule preuve reste le
brouillon relu dans Vinted après coup.

Il est également possible que le concurrent porte ces quatre parades sans que
les quatre soient nécessaires — on ne voit pas ce qu'il a essayé et abandonné.
