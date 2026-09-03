# HANDOFF — MyFlip

**Ce fichier ne contient qu'une seule passation : la dernière.** Avant de
travailler, lis-le en entier. Avant de partir, remplace-le et archive celui que
tu remplaces dans `docs/handoffs/`.

Le mode d'emploi complet est dans [`AGENTS.md`](AGENTS.md), section
« Terminer une session ». L'index des passations passées est en bas de page.

---

# Passation — 2026-08-18 · Extension Vinted, design en cours

| | |
|---|---|
| **Agent** | Claude Code (Sonnet 5) + Aramis |
| **Branche** | main |
| **Commits** | aucun — session 100% design/discussion, aucun code touché |

## Goal — l'objectif

Concevoir une extension Firefox qui pré-remplit un brouillon Vinted à partir
d'une annonce générée dans MyFlip (`/mise-en-vente`), pour supprimer le
copier-coller manuel sur ~150 articles — sans risquer un ban Vinted.

## Current state — ce qui a été fait

Brainstorming architectural complet (skill `superpowers:brainstorming`,
chemin « architectural »). Le design a été discuté, affiné et globalement
validé au fil de l'eau avec Aramis. **Rien n'a encore été écrit en fichier
spec**, et le design n'a pas eu de validation finale formelle — la session
s'est arrêtée juste avant, sur la présentation d'un schéma récapitulatif.

Un artifact HTML (diagramme SVG en 7 étapes du workflow) a été préparé mais
**jamais vu par Aramis** : la publication a échoué à répétition à cause d'une
panne du classificateur de sécurité côté Anthropic (« claude-sonnet-5
temporarily unavailable », affectant aussi `WebFetch` — panne large, pas
propre à l'outil Artifact). Le fichier existe en local (probablement
nettoyé depuis, c'est un dossier scratchpad de session) :
`.../scratchpad/trajet-annonce.html` — à refaire si besoin plutôt qu'à
chercher à le récupérer.

Aucune ligne de code de l'extension ou de MyFlip n'a été écrite. Aucun fichier
du repo n'a été modifié par cette session.

## Decisions — choix critiques ou irréversibles

- **Firefox uniquement.** C'est le navigateur qu'utilise Aramis pour Vinted —
  pas de portage Chrome prévu pour la V1.

- **Portée volontairement réduite pour limiter le risque de ban** : l'extension
  ne remplit QUE des champs texte/nombre — titre, description, prix, photos.
  Marque, catégorie, taille, état restent toujours saisis à la main dans
  l'UI Vinted. Raison donnée par Aramis lui-même : ce sont des menus à
  recherche/autocomplete, plus fragiles à automatiser et plus proches d'un
  pattern détectable — pour gagner peu de temps vu le petit nombre de champs.

- **L'extension ne clique jamais sur « Enregistrer en brouillon »** côté
  Vinted. Toujours un geste humain final. Conséquence directe : pas de
  garantie que les champs obligatoires (catégorie…) soient tous remplis par
  l'extension, ce n'est pas un problème puisque c'est Aramis qui termine et
  valide.

- **Rythme « semi-auto, un onglet à la fois »**, choisi explicitement contre
  un mode « automatique en rafale » (ouverture/remplissage en chaîne sans
  intervention). Raison : un enchaînement programmatique de N créations de
  brouillon est le genre de pattern qu'un site anti-fraude repère ; le clic
  utilisateur reste le seul déclencheur d'ouverture d'onglet.

- **Délai aléatoire volontaire avant remplissage automatique** sur chaque
  nouvel onglet Vinted, autre garde-fou anti-ban. **La fourchette (min/max en
  minutes) est réglée PAR ARAMIS lui-même**, pas de valeur imposée par défaut
  — exemple donné : 6 et 7 minutes. Un concurrent ferait déjà ça via une
  extension similaire (nom donné oralement, pas fiable retranscrit : « Le
  Trocathlon » ? « Clemz » ? « Vlim » ? — à reconfirmer avec Aramis, il a
  proposé de montrer une capture d'écran mais ne l'a pas encore fait).

- **Prix suggéré via un nouveau tableau de référence marque × catégorie**
  (nouveau modèle Prisma à créer, nommé `PrixReference` dans la discussion),
  plutôt qu'un calcul dynamique par coefficient. Réutilise EXACTEMENT la même
  mécanique de correspondance que `PromptTemplate` / `pickPrompt` dans
  `lib/promptSelect.ts`, déjà en place dans le repo. Exemples concrets donnés
  par Aramis : Pull/Polo Tommy Hilfiger → 22 €, Pull Ralph Lauren → 24 €.
  Prix affiché et modifiable à l'étape QCM de `/mise-en-vente`, avant la
  génération de l'annonce.

- **Un seul clic fait deux choses** : cliquer « Publier sur Vinted » doit à la
  fois (a) enregistrer l'article en statut *Brouillon* dans MyFlip (réutilise
  le PATCH `/api/articles/[id]` et le bouton « Brouillon » déjà existants) et
  (b) empiler l'annonce dans la file d'attente de l'extension. Si
  l'enregistrement MyFlip échoue, **ne pas** empiler dans la file — éviter un
  brouillon Vinted désynchronisé du stock MyFlip.

- **Pas d'API serveur dédiée côté MyFlip pour l'extension, pas d'OAuth, pas de
  token.** L'extension ne parle jamais au backend MyFlip : seulement aux deux
  pages ouvertes dans le navigateur (MyFlip authentifié via sa session
  NextAuth, Vinted via sa propre session). Raison technique impérative : les
  photos ne vivent QUE en mémoire du navigateur pendant la session
  `/mise-en-vente` (`Blob`, jamais uploadées sur un serveur — cf.
  `app/mise-en-vente/_reducer.ts`, type `Photo`, commentaire « le JPEG déposé
  sur Vinted » jamais dégradé). Elles doivent donc être transmises pendant que
  l'onglet MyFlip est encore ouvert, extension → onglet Vinted.

- **Mécanisme retenu : file d'attente (FIFO), pas un simple « dernier élément
  écrase le précédent ».** Supporte le cas où Aramis enchaîne plusieurs clics
  « Publier sur Vinted » avant d'aller remplir les onglets un par un (« faire
  10 articles vite, puis aller sur Vinted »).

## Changed — fichiers et composants

Aucun. Session de discussion pure ; aucun fichier du repo modifié.

**Note sans lien avec cette session** : `git status` montre `.gitignore`
modifié et non commité (ajout de `.env*`), présent avant le début de cette
conversation. À vérifier/committer séparément — ne pas l'attribuer à ce
brainstorming.

## Architecture envisagée (pas encore figée en spec)

- **Côté MyFlip** (`app/mise-en-vente/`) :
  - `_reducer.ts` : ajouter un champ prix à `Qcm` (actuellement marque,
    categorie, taille, etat, matiere, matiere2, details — pas de prix).
  - `page.tsx` fonction `enregistrer()` (~ligne 349) : PATCH actuel envoie
    `titreAnnonce`, `descriptionAnnonce`, `motsClesAnnonce`, `statut` — à
    étendre avec `prixVente`.
  - `_components/ExportAnnonces.tsx` bouton « Publier sur Vinted » (~ligne
    204, actuellement un simple lien `<a href="https://www.vinted.fr/items/new">`
    en `target="_blank"`) : à transformer pour déclencher l'enregistrement +
    l'événement de mise en file, avant/en plus d'ouvrir l'onglet.
  - Nouveau : modèle Prisma `PrixReference` (marque, categorie, prix,
    estDefaut) + fonction `pickPrix()` calquée sur `pickPrompt()`
    (`lib/promptSelect.ts`).
  - Nouveau : deux champs numériques sur `UserSettings` (délai min/max en
    minutes), éditables dans `/compte`.

- **Extension Firefox** (nouveau, hors du dépôt Next.js — dossier séparé,
  emplacement pas encore décidé) :
  1. Content script sur le domaine MyFlip (`/mise-en-vente`) : écoute
     l'événement du clic « Publier », récupère titre/description/prix/photos
     (Blobs).
  2. Background script (page persistante) : file d'attente en **IndexedDB**
     (les Blobs ne tiennent pas dans `storage.local`), tire un délai aléatoire
     par entrée dans la fourchette réglée par Aramis.
  3. Content script sur `vinted.fr/items/new*` : consomme la file, affiche un
     badge de compte à rebours si le délai n'est pas écoulé, remplit
     titre/description/prix via de vrais événements `input`/`change`, injecte
     les photos dans l'input fichier via `DataTransfer`. Vérifie qu'un champ
     n'est pas déjà rempli à la main avant d'écrire dessus (ne jamais écraser
     une saisie en cours). Ne clique jamais sur « Enregistrer ».

Permissions extension limitées à MyFlip + `vinted.fr/items/new*`. Sans
extension installée, le bouton garde son comportement actuel (lien simple) —
aucune dépendance dure.

Points **non tranchés**, à valider avec Aramis dès la reprise :
- Est-ce qu'un même délai aléatoire s'applique à *chaque* onglet Vinted, ou
  seulement un délai global entre deux ouvertures ? (la discussion penchait
  vers « un tirage indépendant par entrée en file », à reconfirmer).
- Emplacement du dépôt/dossier de l'extension (repo séparé vs sous-dossier de
  MyFlip).
- Manifest V2 vs V3 pour Firefox — pas discuté.
- Nom et détails exacts du concurrent cité (« Le Trocathlon »/« Clemz »/
  « Vlim » — transcription incertaine) et capture d'écran promise par Aramis.

## Validations — passants / échoués / non lancés

| Commande | Résultat |
|---|---|
| — | ⏭️ **non lancé** — aucun code produit cette session, rien à valider. |

## Blockers — ce qui bloque

Rien côté conception. Côté outillage : panne intermittente du classificateur
de sécurité Anthropic sur plusieurs jours, qui a empêché de publier le schéma
récapitulatif (artifact) pendant cette session — sans lien avec le projet
MyFlip lui-même. Aramis relance sa session avec
`--dangerously-skip-permissions` pour contourner ça immédiatement.

## Next — la prochaine action

Reprendre le brainstorming architectural là où il s'est arrêté : représenter
(ou faire valider en mots si le rendu visuel échoue encore) le schéma en 7
étapes du workflow, obtenir l'approbation finale d'Aramis sur le design
complet, PUIS écrire le spec file
(`docs/superpowers/specs/2026-08-18-extension-vinted-design.md`), PUIS
invoquer le skill `writing-plans`. Ne pas commencer à coder avant cette
approbation explicite (gate du skill `superpowers:brainstorming`).

---

## Historique des passations

| Date | Sujet | Agent | Fiche |
|---|---|---|---|
| 2026-08-18 | Extension Vinted, design en cours | Claude Code (Sonnet 5) | *(pas encore archivée — première passation du projet)* |
