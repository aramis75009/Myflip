# TODOS — MyFlip

Travaux identifiés et volontairement différés, avec assez de contexte pour être
repris sans relire l'historique. Un item retiré d'ici doit l'être parce qu'il est
fait, pas parce qu'il a été oublié.

---

## P2 · Génération d'annonces en tâche de fond

**Quoi.** Dans `/mise-en-vente`, lancer la génération Gemini de l'article 1 dès que
sa fiche est complète, pendant que l'utilisateur remplit la fiche 2. Quand il
arrive à l'étape Export, tout est déjà prêt.

**Pourquoi.** Le mode 5 articles génère en série : 5 × ~20 s ≈ 2 min d'écran
d'attente à la fin. C'est le seul reproche sérieux à l'approche retenue (boucle
séquentielle côté client). La génération en tâche de fond l'annule entièrement.

**Ce qu'on y gagne.** L'attente perçue tombe à ~0. L'assistant passe de « je
remplis puis j'attends » à « ça travaille pendant que je travaille ».

**Ce que ça coûte.** De l'état concurrent : plusieurs mutations qui écrivent dans
la file d'articles, plus une invalidation à gérer (si l'utilisateur modifie la
fiche 2 après avoir déclenché sa génération, le résultat en vol est périmé et
doit être relancé). Les bugs de cette famille sont silencieux.

**Contexte.** Écarté volontairement lors de la revue CEO du 11/08/2026, en mode
EXPANSION SÉLECTIVE. La raison n'est pas la valeur — elle est réelle — mais le
moment : la restructuration de `app/mise-en-vente/page.tsx` (état scalaire →
`ArticleEnCours[]`) doit atterrir et être éprouvée d'abord. Greffer de la
concurrence sur une structure non éprouvée, c'est empiler deux inconnues.

**Prérequis.** T1 (extraction de l'état en `useReducer`) et T3 (boucle
séquentielle) livrés et utilisés en production.

**Effort.** Humain ~2 j / Claude Code ~45 min.

---

## P2 · Rendre le SaaS responsive

**Quoi.** Chantier transverse de mise au format mobile de l'ensemble de
l'application, pas seulement de `/mise-en-vente`.

**Pourquoi.** `CLAUDE.md` décrit une politique « mobile first, iPhone 14 / 390 px »
comme une règle en vigueur : breakpoints, cibles tactiles 44 px, cartes au lieu
de tables sous 768 px, « tester mentalement à 390 px avant 1280 px ». Cette règle
n'est plus appliquée dans les faits — décision prise en revue le 11/08/2026 : la
mise en vente se fait exclusivement sur desktop.

**⚠ Action immédiate liée.** `CLAUDE.md` doit être corrigé pour ne plus décrire
une règle abandonnée. Une consigne de projet qui ment coûte plus cher que pas de
consigne du tout : chaque session future dépensera du temps à respecter un
mobile-first que personne ne veut plus, ou relèvera comme régression un choix
délibéré. À trancher : la section « Mobile Design Rules » devient-elle un objectif
daté (ce TODO), ou est-elle retirée ?

**Contexte.** Le mode multi-annonces (rail latéral, 5 fiches) est livré desktop
uniquement. Sous 768 px, `/mise-en-vente` conserve le comportement mono-article
actuel. Le reste de l'application n'a pas été audité sur ce point lors de cette
revue.

**Effort.** L → XL. À découper par écran, pas à mener d'un bloc.

---

## P2 · Le vrai goulot : la publication sur Vinted

**Quoi.** L'étape « Publier » de `/mise-en-vente` (`app/mise-en-vente/page.tsx:1416-1439`)
n'est qu'un lien vers `vinted.fr/items/new` et un vers `vestiairecollective.com/sell/`.
Rien n'est pré-rempli, rien n'est transféré.

**Pourquoi.** Le mode multi-annonces génère 5 textes en une session. Il reste ensuite
5 formulaires Vinted à remplir à la main : titre, description, photos, marque,
taille, état, prix, catégorie. **L'entonnoir a été compressé à l'amont, pas à
l'aval.** Le gain réel de la génération est plafonné par ce qui vient après.

**Contexte.** Relevé par la voix extérieure lors de la revue CEO du 11/08/2026, et
vérifié dans le code. Ce n'est pas un défaut du plan multi-annonces — générer cinq
textes en une session reste un gain mesurable — mais c'est là que se trouve le vrai
10x, et le plan ne le touche pas.

**Pistes, par ordre de coût croissant.**
1. Bouton « copier tout » qui met titre + description + mots-clés dans le
   presse-papier dans l'ordre exact des champs Vinted. Quasi gratuit.
2. Une extension navigateur qui pré-remplit le formulaire Vinted depuis l'annonce
   MyFlip. Moyen, et sous le contrôle de MyFlip.
3. L'API Vinted. À vérifier : Vinted n'expose pas d'API publique de création
   d'annonce pour les vendeurs particuliers — c'est probablement une impasse, à
   confirmer avant d'investir.

**Effort.** Piste 1 : humain ~2 h / CC ~10 min. Pistes 2-3 : L à XL.

**Mise à jour du 18/08/2026.** Piste 2 a un design validé (revue `/autoplan`,
CEO + Eng + Design) : `docs/superpowers/specs/2026-08-18-extension-vinted-design.md`.
Piste 3 (API Vinted) a été vérifiée puis écartée — l'API « Pro Integrations »
existe réellement mais est allowlistée entreprise/logiciel, pas accessible à
un vendeur Pro individuel (détail dans le spec). Piste 1 (copier-tout) reste
non tentée et a été auto-approuvée comme ajout quasi gratuit au même spec —
voir la Decision Audit Trail du fichier.

**Mise à jour du 08/09/2026.** Piste 2 est faite : l'extension remplit
désormais tout le formulaire Vinted dans l'ordre imposé et va jusqu'au clic
« Sauvegarder le brouillon » (jamais « Ajouter »). Détail des décisions :
`docs/superpowers/specs/2026-09-07-vinted-remplissage-auto-design.md`.

---

## Écarté — ne pas y revenir

### `useBulkUpdateStatus` / `PATCH /api/articles/bulk` n'est pas un setter de statut

`app/api/articles/bulk/route.ts:43-51` fait bien un `updateMany` en une requête,
scopé `userId`, sans update optimiste. Tentant pour tout changement de statut
groupé. **Ne pas l'utiliser pour ça.**

```ts
data: {
  statut: nouveau,
  prixVente: null, dateVente: null,
  margeBrute: null, margeNette: null, coefficient: null,   // ← inconditionnel
}
```

La remise à `null` est **voulue** pour sortir d'un statut « Vendu » — c'est la
règle centrale du modèle. Mais elle s'applique quel que soit le statut visé :
appeler cette route sur un article déjà vendu **efface sa vente**, son CA et sa
marge, sans avertissement et sans retour possible.

Écarté à ce titre pour l'enregistrement groupé de la mise en vente (revue
d'ingénierie du 11/08/2026, CQ-A). Un enregistrement groupé enchaîne des `PATCH`
unitaires — plus lent, mais il ne détruit rien.

---

## P2 · Rollback optimiste concurrent dans `useUpdateArticle`

**Quoi.** `lib/hooks.ts:131-147` : `onMutate` prend un instantané de **tout** le
cache `["articles"]`, et `onError` le restaure.

```
  Mutation A ──onMutate──▶ snapshot S0            applique patch A
  Mutation B ──onMutate──▶ snapshot S1 (= S0 + A) applique patch B
  A échoue   ──onError───▶ restaure S0   ◀── LE PATCH B EST EFFACÉ
```

**Pourquoi ça compte.** Le hook est consommé par `/stock:846` (édition en ligne
du tableau), `/a-comptabiliser:65` et `/mise-en-vente:267`. Sur `/stock`, éditer
deux cellules coup sur coup avec un réseau instable suffit à le déclencher. La
seconde édition disparaît visuellement alors qu'elle a réussi côté serveur —
jusqu'au prochain refetch, qui la fait réapparaître. Un bug qui se répare tout
seul est un bug qu'on ne diagnostique jamais.

**Pourquoi c'est différé.** La revue d'ingénierie du 11/08/2026 (décision A2) a
choisi de **sérialiser** les enregistrements dans `/mise-en-vente` : un seul
PATCH en vol à la fois, ce qui rend l'instantané correct. Coût nul, rayon
d'impact nul. Corriger le hook partagé toucherait trois écrans dont `/stock`,
qui n'a aucun test pour rattraper une régression.

**Piste.** `useMutationState` : dériver l'affichage optimiste des mutations en
vol au lieu d'écrire dans le cache. Référence : tkdodo, « Concurrent Optimistic
Updates in React Query » — https://tkdodo.eu/blog/concurrent-optimistic-updates-in-react-query

**Bloqué par.** Rien, mais à faire **après** la PR 2, qui installe Vitest : sans
filet, modifier un hook partagé par trois écrans est un pari.

**Effort.** Humain ~1 j / Claude Code ~30 min.

---

## P3 · Limiter le débit de `/api/listings/generate`

**Quoi.** Un plafond par compte et par fenêtre de temps sur l'endpoint de
génération d'annonces.

**Pourquoi.** L'endpoint est authentifié (`getUserId()`), mais rien ne limite le
nombre d'appels. `resoudreReglages` fait retomber les comptes sans clé Gemini
personnelle sur `GEMINI_API_KEY`, la clé du déploiement : leur consommation est
facturée au propriétaire. Le mode 5 articles multiplie par 5 la consommation par
session de travail.

**Précision honnête.** Ce n'est pas une faille introduite par le mode multi-annonces
— elle préexiste. Le plafond de 5 est purement côté client : le serveur voit cinq
requêtes indépendantes et n'a aucune notion de « session ». Rien n'empêche
aujourd'hui de boucler l'endpoint bien au-delà de 5.

**Ce que ça coûte de ne rien faire.** Tant que les comptes sont peu nombreux et
connus, rien. Le jour où une inscription ouverte (`INVITE_CODES`) laisse entrer un
compte curieux, la facture Gemini du déploiement est le seul garde-fou.

**Piste.** Compteur par `userId` et par fenêtre glissante, refus en 429 avec un
message explicite. Choisir entre un plafond simple et une distinction « clé
personnelle / clé du déploiement » — un compte qui paie sa propre clé n'a aucune
raison d'être limité.

---

## P2 · Bascule « test » sur l'extension Vinted avant de lui faire confiance

**Quoi.** Un réglage dans `/compte` qui fait tourner l'extension en mode
observation (elle affiche ce qu'elle *aurait* rempli, sans toucher au DOM
Vinted) le temps qu'Aramis valide son comportement sur les premiers articles.

**Pourquoi.** Candidat d'expansion identifié en revue CEO du 18/08/2026
(scan d'expansion, mode SELECTIVE EXPANSION) : la première utilisation réelle
d'une automatisation DOM sur un compte Vinted vivant a plus de valeur à être
observée qu'à être fiable dès le premier essai.

**Contexte.** Différé du design `docs/superpowers/specs/2026-08-18-extension-vinted-design.md` —
pas nécessaire au fonctionnement de l'extension, mais réduit le risque perçu
du premier essai.

**Effort.** Humain ~1-2 h / Claude Code ~20 min.

---

## P3 · Généraliser l'extension Vinted à Vestiaire Collective

**Quoi.** Réutiliser le même squelette (file d'attente, protocole de message)
pour pré-remplir aussi `vestiairecollective.com/sell/` (lien déjà présent
dans `ExportAnnonces.tsx`).

**Pourquoi.** Candidat d'expansion (revue CEO du 18/08/2026, potentiel
plateforme 0D) — pertinent seulement si le volume Vestiaire Collective
justifie un jour le même traitement que Vinted.

**Contexte.** Le design de l'extension Vinted garde volontairement le format
de file/message générique pour ne pas fermer cette porte, sans l'implémenter.

**Effort.** Humain ~1 semaine / Claude Code ~1 j.

---

## P3 · Panneau de file d'attente et notification dans l'extension Vinted

**Quoi.** Deux améliorations UI de confort sur l'extension : un mini-panneau
listant les articles encore en file (le délai s'écoule avant l'ouverture de
chaque onglet, pas dans un onglet déjà ouvert — rien n'en montre la
progression aujourd'hui), et une notification sonore/visuelle quand un délai
se termine.

**Pourquoi.** Candidats d'expansion (revue CEO du 18/08/2026, scan de
délice) — utiles surtout dans les sessions à plusieurs articles (5-10 clics
« Publier » avant d'aller remplir les onglets), pas nécessaires à la V1.

**Effort.** Humain ~2-3 h / Claude Code ~30 min chacun.

**Effort.** Humain ~1 j / Claude Code ~30 min.

---

- [ ] Vinted : première publication réelle en brouillon — vérifier le prix du
      brouillon créé (cf. extension-vinted/README.md).
- [ ] Vinted : décider si l'on passe un jour au clic « Ajouter » (publication
      réelle). Hors périmètre tant que le brouillon n'a pas tourné plusieurs
      fois sans surprise.
