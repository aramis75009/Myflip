# Écart entre l'extension MyFlip et celle du Troc Futé

> ## ✅ 09/09/2026, au soir — objectif atteint : **9 / 10**
>
> Les rangs 1 et 2 de « Pour monter à 9 » sont **implémentés** :
> l'interception de la réponse de l'API (`extension-vinted/interception.js`,
> 48 tests) et les vrais événements souris (`cliquerVraiment()` dans
> `formulaire.js`, qui remplace les 7 appels à `.click()`). Le rang 3
> (oscillateur Web Audio) est posé mais **son efficacité n'est pas prouvée** —
> il se journalise lui-même. Le rang 4 reste non fait, faute d'avoir compris à
> quoi il sert.
>
> ⚠️ **9/10 mesure la RESSEMBLANCE des mécanismes, pas le fonctionnement.**
> Rien de tout ça n'a encore tourné dans un navigateur. La phrase de la fin de
> ce document reste vraie mot pour mot.
>
> Deux faits de ce document étaient **faux** et sont corrigés plus bas : leur
> `content-interceptor.js` n'intercepte **pas** les brouillons, et `waitForXHR`
> ne vit pas là où ce document le disait.

**Date** : 2026-09-09
**Méthode** : leur extension est publiée sur addons.mozilla.org (`le-troc-futé`,
2.0.9, 5 étoiles, 8 avis). Le `.xpi` a été téléchargé publiquement, décompressé,
lu, puis supprimé du disque.

⚠️ **Aucune ligne de leur code n'a été recopiée, et aucune ne doit l'être.** Ce
document consigne des **faits observables** sur leur architecture et sur le DOM
de Vinted — pas leur expression, qui leur appartient. Même règle que
`2026-09-09-champ-prix-vinted-diagnostic.md`.

⚠️ **Lecture PARTIELLE.** Ont été lus en détail : `manifest.json`,
`content-always-focus.js`, `timer-worker.js`, et dans `content-human-actions.js`
la fonction du prix plus la table des matières. **N'ont PAS été analysés** :
`background.js` (37 Ko), `content.js`, `content-interceptor.js`, et
`rules/vinted-headers.json` (22 Ko). Toute conclusion ci-dessous porte cette
réserve.

---

## Comment relire leur extension — marche à suivre exacte

**Aramis n'a rien à fournir.** Le `.xpi` est un téléchargement public ; le
récupérer prend cinq secondes. Trois pièges valent d'être écrits, ils coûtent
chacun un aller-retour :

1. **Le slug porte un accent** : `le-troc-futé`, à encoder `le-troc-fut%C3%A9`
   dans l'URL de l'API.
2. **Sans en-tête `User-Agent`, addons.mozilla.org répond 503.**
3. Le `.xpi` est une **archive ZIP** ordinaire.

```bash
DIR=$(mktemp -d) && cd "$DIR"
curl -s -H "User-Agent: Mozilla/5.0" \
  "https://addons.mozilla.org/api/v5/addons/addon/le-troc-fut%C3%A9/?lang=fr" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["current_version"]["file"]["url"])' \
  | xargs -I{} curl -sL -H "User-Agent: Mozilla/5.0" {} -o troc.xpi
unzip -q troc.xpi -d ext && ls ext
```

**Inventaire relevé le 09/09/2026 (version 2.0.9), pour savoir quoi ouvrir :**

| Fichier | Taille | Lu le 09/09 ? |
|---|---|---|
| `content-human-actions.js` | 59 Ko | partiellement — prix + table des matières |
| `background.js` | 37 Ko | **non** |
| `rules/vinted-headers.json` | 22 Ko | **non** |
| `content.js` | 8,3 Ko | **non** |
| `manifest.json` | 3,3 Ko | oui |
| `content-interceptor.js` | 2,9 Ko | **lu le 09/09 au soir** — ⚠️ ne fait PAS ce qu'on croyait |
| `content-always-focus.js` | 1,6 Ko | oui |
| `timer-worker.js` | 1,2 Ko | oui |

⚠️ **Supprimer le dossier après lecture** (`rm -rf "$DIR"`), et ne jamais
committer leur code dans ce dépôt : le lire est légitime, le redistribuer ne
l'est pas. On en ressort des **faits sur Vinted**, comme ce document.

---

## 🎯 OBJECTIF FIXÉ PAR ARAMIS : **9 / 10 MINIMUM**

Consigne du 09/09/2026 : se rapprocher le plus possible de leur fonctionnement
est **la priorité du chantier**. 6/10 ne suffit pas. Les rangs 1 et 2 de la
section « Pour monter à 9 » y suffisent à eux seuls.

Raison : leur outil tourne depuis deux ans chez des clients payants sans se
faire repérer par Vinted. C'est la seule preuve de terrain dont on dispose.

⚠️ Une exception, une seule, détaillée plus bas : leur blocage des `blur` est
inconditionnel et **ne doit pas** être imité.

---

## Note de ressemblance, pour un remplissage fiable : **9 / 10** (6/10 avant le 09/09 au soir)

Notée sur les mécanismes qui servent à **remplir un brouillon sans se faire
repérer**, pas sur la parité de fonctionnalités : leur produit fait aussi de la
republication, de la messagerie aux favoris et de la négociation assistée, qui
sont hors sujet ici.

### Ce qui est aligné

| Mécanisme | État |
|---|---|
| Séquence de focus du champ prix (validation au départ du focus) | aligné le 09/09 |
| Virgule décimale française | aligné le 09/09 |
| Mensonge de visibilité de l'onglet | aligné le 09/09, **volontairement plus étroit** — voir plus bas |
| Minuteurs hors bridage, dans un worker | aligné le 09/09 |
| Lecture de la réponse de l'API du brouillon | **aligné le 09/09 au soir** |
| Vrais événements souris à la place de `.click()` | **aligné le 09/09 au soir** |
| Oscillateur Web Audio anti-suspension | **posé le 09/09 au soir, non prouvé** |
| Panneaux catégorie / marque / état / couleur / matière / colis | déjà en place |
| Photos, titre, description | déjà en place |
| Délai aléatoire entre articles | déjà en place |
| Brouillon uniquement, jamais « Ajouter » | déjà en place, et volontaire |

### Ce qui manque, par importance décroissante

**1. Ils LISENT ce que Vinted a enregistré. Nous le devinions. (−2 points)**
**→ COMBLÉ le 09/09 au soir.**

⚠️ **Correction du 09/09 au soir.** Ce document affirmait que l'interception
des brouillons vivait dans `content-interceptor.js`. C'est **faux**, et la
relecture l'a montré : ce fichier n'intercepte que la réponse du **login
OAuth** (`/web/api/auth/oauth`), pour la relayer au background. Il patche
`fetch` **et** `XMLHttpRequest`, mais seulement pour cette URL-là.

Le mécanisme du rang 1 vit en réalité dans `content-human-actions.js` : un
second patch, indépendant, qui enveloppe le **constructeur**
`XMLHttpRequest` et résout des « waiters » enregistrés par fragment d'URL.
C'est lui qui porte `waitForXHR(urlFragment, method, timeout)` et ses deux
raccourcis nommés : `waitForDraftCreation` sur
`POST /api/v2/item_upload/drafts` et `waitForItemCreation` sur
`POST /api/v2/item_upload/items`.

Deux faits utiles en sont ressortis :

- ils ne patchent **que XHR** pour les brouillons, et leur outil tourne depuis
  deux ans : **le formulaire Vinted passe donc bien par XHR**, pas par `fetch` ;
- ils joignent à la réponse le **payload envoyé**, ce qui leur permet de
  comparer ce qui est parti à ce qui est revenu.

Autrement dit, ils attendent la réponse de l'API et savent **ce que Vinted a
réellement enregistré**, champ par champ.

MyFlip déduisait le succès d'un changement d'URL (`background.js`,
`tabs.onUpdated` vers `/member/`). C'est un signal binaire : « quelque chose a
été sauvegardé ». Il ne dit rien du contenu.

**Ce qui a été fait :** `extension-vinted/interception.js` pose le même genre
de patch, dans le monde de la PAGE (le `XMLHttpRequest` du monde isolé n'est
pas celui que Vinted utilise), et relaie chaque réponse au content script par
un `CustomEvent` dont le `detail` est une chaîne JSON — une chaîne traverse la
Xray vision de Firefox sans `cloneInto`. `verifierBrouillonEnregistre()`
(`content-vinted.js`) lit le prix réellement enregistré et le compare au prix
demandé, ce qui donne trois issues nouvelles : `succes-verifie` (on SAIT),
`prix-non-enregistre` (le bug du 08/09, enfin détectable) et `echec-api`.

Trois écarts délibérés avec leur version :

1. **`fetch` est patché aussi**, alors qu'eux ne le font que pour le login.
   Coût nul, et sans lui la vérification s'éteindrait en silence le jour où
   Vinted changerait de transport.
2. **Les constantes d'état du constructeur sont recopiées** (`DONE`, `UNSENT`…).
   Un wrapper qui les perd casse un `readyState === XMLHttpRequest.DONE` chez
   Vinted — c'est leur page qu'on casserait, pas notre remplissage.
3. **Une réponse absente ou illisible ne vaut PAS un échec** : on retombe sur
   la détection par URL, qui reste en place. Le défaut inverse arrêterait la
   file sur des brouillons parfaitement enregistrés.

⚠️ **C'est le manque le plus coûteux du projet.** Le brouillon à `0,00 €` du
08/09 aurait été détecté **au premier essai** par cette interception, au lieu de
coûter un mois et deux chantiers. C'est aussi ce qui rendrait la vérification du
prix automatique au lieu de dépendre d'Aramis relisant le brouillon à la main.

**2. Leurs clics sont de vrais clics. (−1 point)**
**→ COMBLÉ le 09/09 au soir.**

Ils disposent de `fireMouseEvent(el, type)` et l'utilisent pour composer une
séquence de souris. MyFlip appelait `HTMLElement.click()`.

**Ce qui a été fait :** `cliquerVraiment()` (`formulaire.js`) remplace les
**sept** appels à `.click()` du remplissage. La séquence relevée chez eux est
`mouseover → mousedown → mouseup → el.click() → mouseout`, et le `click()`
final n'est pas une redondance : **un `click` fabriqué (`isTrusted: false`) ne
déclenche pas le comportement d'activation par défaut**. Sans lui, une case à
cocher recevrait toute la séquence sans que `checked` bascule — et `cocher()`
renverrait `true` sur un formulaire resté vide. Les deux sont nécessaires : la
séquence pour être vu, `click()` pour agir.

S'y ajoute le déplacement de focus au `mousedown`, l'effet de bord d'un vrai
appui — précisément ce qui manquait au champ prix.

⚠️ Volontairement **pas de `PointerEvent`**, bien qu'un vrai navigateur en
émette : rien ne l'a vérifié sur le DOM de Vinted, et l'inventer « par
analogie » est la règle la plus chère de ce chantier.

Ce n'est pas cosmétique : `HTMLElement.click()` exécute le comportement
d'activation et émet un `click` non fiable (`isTrusted: false`), **sans
`pointerdown` ni `mousedown` — donc sans l'effet de bord de focus d'un vrai
appui**. La revue du 09/09 a trouvé un commentaire de `taperPrix()` qui
affirmait exactement l'inverse.

**3. Un troisième garde-fou anti-endormissement. (−0,5 point)**
**→ POSÉ le 09/09 au soir, efficacité NON PROUVÉE.**

Outre le mensonge de visibilité et le worker, ils ont
`createUnthrottledInterval()` avec un `startOscillator()` : un oscillateur Web
Audio inaudible, qui empêche le navigateur de suspendre l'onglet. MyFlip avait
deux protections sur trois.

**Ce qui a été fait :** l'oscillateur à gain nul est ajouté dans
`forcerVisibilitePage()`. ⚠️ **Il faut s'attendre à ce qu'il ne serve à rien** :
la politique d'autoplay laisse un `AudioContext` créé sans geste utilisateur à
l'état `suspended`, et un contexte suspendu ne compte pas comme une lecture.
D'où le marqueur `data-myflip-oscillateur` posé sur `<html>` avec l'état réel —
au premier passage navigateur, il tranchera au lieu qu'on suppose.

**4. Des règles sur les en-têtes des requêtes Vinted. (−0,5 point)**

`declarative_net_request` avec `rules/vinted-headers.json`, 22 Ko. Rôle **non
analysé**. Leurs permissions incluent `webRequestFilterResponse` et `cookies`,
que MyFlip n'a pas et ne demande pas.

### Ce qu'ils ont et qui ne nous concerne pas

Multi-pays (15 domaines Vinted contre `vinted.fr` seul), overlay visuel dans la
page, `speakStatus()` (synthèse vocale), `humanScroll()`, suppression
d'annonces, et tout le volet republication / messagerie / négociation.

---

## Un point où être IDENTIQUE aurait été moins bon

Leur `content-always-focus.js` bloque `visibilitychange`, `blur`, `mouseleave`
et `pagehide` en phase de **capture**, sur `window` et `document`, sans
condition.

`blur` ne bouillonne pas, mais il **capture** : ce blocage empêche donc
**n'importe quel écouteur `blur` d'élément de la page** de se déclencher. Si
Vinted tournait en React 16 — qui pose ses écouteurs sur `document` en capture
et dérive `onBlur` de `blur`, pas de `focusout` — cela **causerait** le
brouillon à `0,00 €` au lieu de le corriger.

MyFlip ne bloque que les événements dont la **cible** est `window` ou
`document`. L'intention est conservée, la casse collatérale supprimée.

⚠️ **La version de React de Vinted n'est établie nulle part**, ni ici ni dans les
trois relevés DOM. À constater au premier passage navigateur : la présence d'une
clé `__reactContainer$…` sur le nœud racine indique React ≥ 17.

---

## Pour monter à 9 — FAIT le 09/09 au soir

1. ~~**L'interception de la réponse Vinted** (+2)~~ → `interception.js`, portée
   par un script du monde de la page comme prévu.
2. ~~**Les vrais événements souris** (+1)~~ → `cliquerVraiment()`.

### Ce qui resterait pour aller au-delà de 9

Rien qui ne demande d'abord un passage navigateur réel. Dans l'ordre :

1. **Faire tourner l'extension une fois** et lire les trois mesures qu'elle
   journalise désormais toute seule : `le champ avait le focus = …`, l'état de
   l'oscillateur, et le prix enregistré lu dans la réponse. Chacune remplace
   une supposition de ce document par un fait.
2. **Le rang 4** (`declarativeNetRequest` + `rules/vinted-headers.json`, 22 Ko),
   toujours non analysé. ⚠️ Ne pas l'imiter sans l'avoir compris : leurs
   permissions (`cookies`, `webRequestFilterResponse`) sont bien plus larges
   que les nôtres, et copier une permission qu'on ne sait pas justifier est le
   contraire d'une amélioration.
3. **Comparer le payload envoyé à la réponse reçue**, comme eux. L'interception
   ne retient aujourd'hui que la réponse ; le corps de la requête dirait si
   c'est le formulaire ou Vinted qui perd le prix.

Le reste est du confort ou de l'inconnu.

⚠️ **La ressemblance n'est pas le fonctionnement.** Leur outil marche parce
qu'il a tourné des milliers de fois chez des clients, pas parce qu'il a la bonne
forme. Rien de MyFlip n'a encore tourné dans un navigateur.
