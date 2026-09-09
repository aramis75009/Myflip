# Écart entre l'extension MyFlip et celle du Troc Futé

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
| `content-interceptor.js` | 2,9 Ko | **non** — c'est là que vit l'interception XHR (rang 1) |
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

## Note de ressemblance, pour un remplissage fiable : **6 / 10**

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
| Panneaux catégorie / marque / état / couleur / matière / colis | déjà en place |
| Photos, titre, description | déjà en place |
| Délai aléatoire entre articles | déjà en place |
| Brouillon uniquement, jamais « Ajouter » | déjà en place, et volontaire |

### Ce qui manque, par importance décroissante

**1. Ils LISENT ce que Vinted a enregistré. Nous le devinons. (−2 points)**

Leur `content-interceptor.js` remplace `XMLHttpRequest` par une version qui
retient les réponses. `content-human-actions.js` expose ensuite
`waitForXHR(urlFragment, method, timeout)`, avec deux raccourcis nommés :
`waitForDraftCreation` sur `POST /api/v2/item_upload/drafts` et
`waitForItemCreation` sur `POST /api/v2/item_upload/items`.

Autrement dit, ils attendent la réponse de l'API et savent **ce que Vinted a
réellement enregistré**, champ par champ.

MyFlip déduit le succès d'un changement d'URL (`background.js`, `tabs.onUpdated`
vers `/member/`). C'est un signal binaire : « quelque chose a été sauvegardé ».
Il ne dit rien du contenu.

⚠️ **C'est le manque le plus coûteux du projet.** Le brouillon à `0,00 €` du
08/09 aurait été détecté **au premier essai** par cette interception, au lieu de
coûter un mois et deux chantiers. C'est aussi ce qui rendrait la vérification du
prix automatique au lieu de dépendre d'Aramis relisant le brouillon à la main.

**2. Leurs clics sont de vrais clics. (−1 point)**

Ils disposent de `fireMouseEvent(el, type)` et l'utilisent pour composer une
séquence de souris. MyFlip appelle `HTMLElement.click()`.

Ce n'est pas cosmétique : `HTMLElement.click()` exécute le comportement
d'activation et émet un `click` non fiable (`isTrusted: false`), **sans
`pointerdown` ni `mousedown` — donc sans l'effet de bord de focus d'un vrai
appui**. La revue du 09/09 a trouvé un commentaire de `taperPrix()` qui
affirmait exactement l'inverse.

**3. Un troisième garde-fou anti-endormissement. (−0,5 point)**

Outre le mensonge de visibilité et le worker, ils ont
`createUnthrottledInterval()` avec un `startOscillator()` : un oscillateur Web
Audio inaudible, qui empêche le navigateur de suspendre l'onglet. MyFlip a deux
protections sur trois.

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

## Pour monter à 9

1. **L'interception de la réponse Vinted** (+2). La seule qui transforme « on
   espère » en « on sait ». À faire porter par un script du monde de la page,
   comme le mensonge de visibilité — `XMLHttpRequest` du monde isolé n'est pas
   celui que Vinted utilise.
2. **Les vrais événements souris** (+1), en remplacement de `.click()`.

Le reste est du confort ou de l'inconnu.

⚠️ **La ressemblance n'est pas le fonctionnement.** Leur outil marche parce
qu'il a tourné des milliers de fois chez des clients, pas parce qu'il a la bonne
forme. Rien de MyFlip n'a encore tourné dans un navigateur.
