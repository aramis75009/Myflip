# PRD — Studio IA : génération d'images par API OpenRouter, mise en concurrence des modèles

> 2026-10-19 · Cadré avec Aramis · Statut : validé le 2026-10-19
>
> Complète la spec du 17/10 (`2026-10-17-studio-ia-design.md`) et son plan du
> 18/10. **Remplace** sa contrainte §2 « génération dans l'application Gemini,
> pas de clé API » et fait entrer dans le périmètre l'« option B » que son §10
> excluait. Tout le reste de la spec tient, à commencer par le cloisonnement §7.

## 1. Problème

Aramis veut savoir quel modèle d'image reproduit le plus fidèlement un sac
Hipobuy sous d'autres angles, et à quel prix. Aujourd'hui le Studio prépare un
prompt, puis Aramis génère à la main dans l'application Gemini (abonnement Pro)
et redépose le résultat. Ce va-et-vient est lent, il n'essaie qu'un seul modèle
(Nano Banana Pro) et ne dit rien du coût. Impossible de comparer.

## 2. Solution

Sur chaque ligne d'angle de la fiche coloris, Aramis coche un ou plusieurs
modèles d'image du catalogue OpenRouter et clique sur « Générer ». MyFlip
affiche d'abord un devis. Au-delà de 0,10 $, ou si un tarif est inconnu, il
demande une confirmation. Ensuite il envoie à chaque modèle le même prompt et
les mêmes vraies photos de référence. Chaque modèle produit son essai, rangé avec
son coût réel. Le modèle de vision note chaque image aussitôt. Les essais
s'affichent côte à côte et Aramis valide ou rejette. « Corriger un détail »
relance le même modèle avec l'image ratée et un prompt de correction ciblée. Le
bilan classe les modèles : taux de réussite au 1er essai, essais moyens, coût
moyen, coût par image validée. Le dépôt manuel d'une image faite ailleurs reste
possible.

## 3. Critères de réussite

- Depuis une fiche coloris, un lancement sur 3 modèles produit 3 essais en un
  seul clic de génération (plus une confirmation si le devis dépasse 0,10 $),
  sans quitter MyFlip.
- Chaque essai généré par API porte son modèle, son coût réel (ou « inconnu »
  quand OpenRouter ne le renvoie pas, jamais un chiffre inventé) et son coût
  estimé au lancement.
- Aucun lancement estimé au-delà de 0,10 $, ou de tarif inconnu, ne part sans
  confirmation explicite. Vérifié par un test.
- Le bilan sort une ligne par modèle avec le taux de validation au 1er essai,
  les essais moyens, le coût moyen par essai et le coût par image validée.
- Sur ~10 coloris × 5 angles, Aramis peut désigner le meilleur rapport
  fidélité/prix à partir du seul bilan.
- Le test de cloisonnement passe toujours, étendu au nouveau code : aucune image
  générée ne peut rejoindre une annonce.

## 4. User stories

1. En tant qu'Aramis, je veux voir la liste des modèles OpenRouter capables de
   produire une image à partir d'images de référence, pour choisir lesquels
   mettre en concurrence.
2. En tant qu'Aramis, je veux épingler mes modèles favoris, pour ne pas fouiller
   le catalogue à chaque lancement.
3. En tant qu'Aramis, je veux voir le prix indicatif de chaque modèle (par image,
   ou « tarif au jeton » / « tarif inconnu »), pour savoir ce que je paie avant
   de cocher.
4. En tant qu'Aramis, je veux cocher plusieurs modèles sur un angle et les lancer
   d'un coup, pour comparer à prompt et références identiques.
5. En tant qu'Aramis, je veux un devis avant chaque lancement, pour ne pas
   découvrir la facture après coup.
6. En tant qu'Aramis, je veux devoir confirmer tout lancement estimé au-delà de
   0,10 $ ou de tarif inconnu, pour qu'aucune grosse dépense ne parte par erreur.
7. En tant qu'Aramis, je veux voir chaque génération en cours, puis son résultat
   ou son erreur nommée (clé manquante, crédit épuisé, blocage de sécurité,
   modèle sans image), pour savoir quoi faire.
8. En tant qu'Aramis, je veux qu'un modèle en échec n'empêche pas les autres de
   finir, pour ne pas perdre un lancement entier.
9. En tant qu'Aramis, je veux que chaque image générée soit notée
   automatiquement par le modèle de vision, pour avoir un premier avis sans
   cliquer.
10. En tant qu'Aramis, je veux voir les essais d'un même angle côte à côte, avec
    le modèle et le coût de chacun, pour juger d'un coup d'œil.
11. En tant qu'Aramis, je veux valider ou rejeter chaque essai, pour que ma
    décision, et non le verdict IA, alimente le bilan.
12. En tant qu'Aramis, je veux « Corriger un détail » sur un essai : le même
    modèle repart des références, de l'essai raté et du prompt de correction,
    pour tenter une correction sans repartir de zéro.
13. En tant qu'Aramis, je veux que l'essai corrigé compte comme l'essai suivant
    du même modèle et que l'essai raté compte comme rejeté, pour que « essais
    moyens » mesure vraiment l'effort.
14. En tant qu'Aramis, je veux pouvoir encore déposer à la main une image faite
    ailleurs, pour comparer aussi l'application Gemini.
15. En tant qu'Aramis, je veux un bilan par modèle (taux au 1er essai, essais
    moyens, coût moyen, coût par image validée, score IA moyen), pour désigner le
    meilleur rapport qualité/prix.
16. En tant qu'Aramis, je veux voir le total dépensé dans le Studio, pour suivre
    le budget du test.
17. En tant qu'Aramis, je veux que la clé OpenRouter de mon compte serve à la
    génération, sans nouvelle clé à saisir, pour ne rien configurer de plus.

## 5. Périmètre

**Dedans :**
- Catalogue vivant des modèles d'image OpenRouter (sortie image ET entrée
  image), avec favoris et prix indicatif.
- Génération par API OpenRouter, plusieurs modèles par lancement, sur un angle.
- Devis, seuil de confirmation à 0,10 $ par lancement, coût réel par essai.
- Vérification IA automatique après chaque génération (module existant).
- Correction ciblée par régénération.
- Bilan par modèle et total dépensé.
- Conservation du dépôt manuel (`source` = `manuel`).

**Hors périmètre :**
- Google direct / clé Google AI Studio : écarté au cadrage, OpenRouter donne
  plusieurs fournisseurs avec une seule clé déjà en place.
- Plafond mensuel de dépense : Aramis a choisi le seul seuil par lancement.
- Lancer un coloris entier (tous les angles d'un coup) : le lancement se fait
  angle par angle. À reconsidérer après le test.
- Génération vidéo, retouche, détourage.
- Toute utilisation des images générées hors du Studio (spec §7).
- Mobile (spec §2).

## 6. Stack technique

| Brique | Version | Source |
|---|---|---|
| Next.js (App Router) | ^15.3.9 | `package.json` MyFlip |
| React | ^18 | `package.json` MyFlip |
| Prisma / Neon Postgres | ^6.19.3 | `package.json` MyFlip |
| @vercel/blob (store privé `myflip-studio`) | 2.8.2 | installé le 19/10 |
| vitest | 3.2.7 | sortie de `npm test` |
| OpenRouter : génération d'image (`/images` et `chat/completions` avec `modalities: ["image","text"]`), catalogue (`/images/models`, `/models?output_modalities=image`), coût (`usage.cost`) | API | code de Fruit Drama Studio, lu le 19/10 |
| Hébergement | Vercel (projet `compta-polos`), fonctions à 300 s par défaut | AGENTS.md, connaissances Vercel à jour |

Référence d'implémentation à lire, pas à copier aveuglément : **Fruit Drama
Studio** (Next 16 / React 19), son client OpenRouter (appel image, décodage
`b64_json` / data URL, `usage.cost`), son catalogue (filtre
`input_modalities` contient `image`, nombre max de références) et son
estimateur de prix (« jamais un chiffre inventé »).

## 7. Agents, skills et outils à utiliser

Aramis veut **plusieurs agents en parallèle, avec un œil sur le coût** : chaque
tâche part au modèle le moins cher qui sait la faire, choisi par Jev.

| Étape | Agent / skill / outil | Pourquoi |
|---|---|---|
| Choix de skill au début de la session | `jev-skill-router` (`aiguilleur.py --auto`) | règle globale d'Aramis ; la table d'arbitrage de `~/.claude/CLAUDE.md` l'emporte |
| Modèle et effort de **chaque** sous-agent | `jev-delegate` (`route.py --max-effort xhigh`, toutes les tâches d'un lot en un seul appel), puis types `jev-<modèle>-<effort>` | coût : haiku pour le mécanique, sonnet pour le standard, opus pour le délicat. Échec → relancer un cran au-dessus. Rapport final avec `report.py` |
| Orchestration | `superpowers:subagent-driven-development`, `superpowers:dispatching-parallel-agents` | étapes indépendantes en parallèle (catalogue / estimateur / client de génération) |
| Plan d'exécution | `superpowers:writing-plans` | transformer ce PRD en tâches cochables avant de coder |
| Logique pure | `superpowers:test-driven-development` | estimateur, seuil, parseur de réponse OpenRouter, statistiques par modèle |
| Docs OpenRouter | `WebFetch` sur openrouter.ai/docs (le MCP `context7` demande une autorisation dans cette session) | les formes de requête image bougent ; ne pas se fier à la mémoire |
| Revue avant de rendre | `code-review` (table d'arbitrage) | `/review` et `code-reviewer` sont écartés par la table |
| Vérification au navigateur | navigateur intégré (`mcp__Claude_Browser__*`), dev servers de `.claude/launch.json` | règle globale : rien n'est « fait » sans preuve |
| Avant d'affirmer | `superpowers:verification-before-completion` | règle globale « vérifié vs supposé » |
| Interface | `/better` si une retouche d'écran s'impose | table d'arbitrage |

## 8. Décisions d'implémentation

**Données — migration écrite à la main, déployée avant le code** (même
procédure que `20261018120000_studio_ia` : jamais `db push`, `photosPretes`,
`geminiKey` et `anthropicKey` intactes, vérification sur `information_schema`).
Colonnes ajoutées à `StudioEssai`, toutes nullables (les essais manuels
existants restent valides) :

```prisma
model StudioEssai {
  // … existant …
  modele        String?  // id OpenRouter (« google/gemini-3-pro-image »…), null pour un dépôt manuel
  coutEstimeUsd Float?   // estimation au lancement, null si tarif inconnu
  coutReelUsd   Float?   // usage.cost renvoyé par OpenRouter, null si non renvoyé
  lancementId   String?  // regroupe les essais d'un même clic « Générer »
  essaiParentId String?  // l'essai raté dont celui-ci est la correction
}
```

Les favoris se rangent par compte. La table (ou la colonne JSON sur un réglage
existant) est à trancher dans le plan, toujours par migration manuelle.

**Numérotation des essais.** Le numéro est compté **par coloris × angle ×
modèle**. Sinon trois modèles lancés ensemble occuperaient les essais 1, 2 et 3,
et le « taux au 1er essai » ne voudrait plus rien dire. La contrainte unique
actuelle (coloris, angle, numéro) doit donc intégrer le modèle : c'est une
décision de migration à écrire dans le plan.

**Modules :**
- *Catalogue d'images OpenRouter*, côté serveur, en cache : modèles dont la
  sortie contient `image` ET l'entrée contient `image`, avec le nombre max de
  références et le prix brut. Repli sur la dernière bonne réponse.
- *Estimateur*, pur : prix par image quand OpenRouter en publie un, sinon
  « tarif au jeton » / « inconnu », **jamais de chiffre inventé**. Somme d'un
  lancement et règle du seuil : confirmation si total > 0,10 $ ou si un tarif
  est inconnu.
- *Client de génération*, côté serveur : un appel par modèle, références en
  data URL (lues dans le Blob privé), format 3:4 demandé quand le modèle
  l'accepte. Erreurs typées : clé manquante, crédit, sécurité, pas d'image,
  injoignable. Il ne journalise ni les images ni la clé.
- *Route de lancement* : reçoit (coloris, angle, modèles, confirmation,
  éventuel essai parent). Elle recalcule le devis côté serveur et **refuse** si
  le seuil est dépassé sans confirmation. Chaque modèle est généré
  indépendamment : l'image va au Blob sous `generees/<userId>/`, l'essai est
  créé avec `source = api`, puis la vérification IA est lancée. Les échecs d'un
  modèle n'annulent pas les autres.
- *Durée* : une génération dure de quelques secondes à plus d'une minute. Le
  client déclenche une requête par modèle en parallèle, sous la limite de
  300 s des fonctions Vercel. Pas de file de tâches tant que ça tient.
- *Statistiques* : le module existant gagne une dimension « par modèle » (essai
  manuel = « manuel ») et des agrégats de coût. Toujours calculées sur la
  décision, jamais sur le verdict IA.
- *Écran* : sur chaque ligne d'angle, un sélecteur de modèles (favoris en tête,
  prix affiché), le devis, « Générer », l'état par modèle en cours, puis les
  essais groupés par modèle. Le bilan ajoute un tableau par modèle et le total
  dépensé.

**Correction ciblée** : même modèle ; entrées = références + image de l'essai
raté + prompt de correction existant. L'essai raté passe « rejeté », le nouveau
pointe vers lui (`essaiParentId`).

## 9. À faire absolument

- **Migration manuelle, commitée et déployée avant le code** : le build Vercel
  ne lance que `prisma generate`, du code déployé avant sa migration tombe en
  500 pour tous les comptes.
- **Le seuil se vérifie côté serveur**, pas seulement à l'écran : un appel direct
  à la route ne doit pas contourner la confirmation.
- **Ranger le coût réel sur chaque essai**, avec le modèle : c'est la matière
  même du test.
- **Étendre le test de cloisonnement** à tout fichier nouveau (catalogue,
  génération, routes) : c'est lui qui rend l'exigence §7 non négociable.
- **Clé OpenRouter du compte uniquement**, résolue comme aujourd'hui : erreur
  « clé manquante » nommée, avec un lien vers « Mon compte ».
- **Lire la doc OpenRouter du jour** pour la forme des requêtes image et la
  présence de `usage.cost` avant de coder le client.
- **Router chaque sous-agent par Jev** et finir par `report.py` : consigne
  d'Aramis sur le coût.

## 10. À ne pas faire

- **Ne pas inventer un prix** quand OpenRouter n'en publie pas : un faux devis
  rassure à tort, alors que « tarif inconnu » déclenche la confirmation.
- **Ne pas élargir `lib/openrouter.ts`** (génération d'annonces) : son schéma
  JSON est celui des annonces. Le Studio garde ses modules à lui, préfixés
  `studio`, que la vente n'importe pas.
- **Ne pas ajouter de repli sur une variable d'environnement** pour la clé : tout
  compte MyFlip générerait aux frais du déploiement (même trou que celui corrigé
  sur Trello).
- **Ne pas lancer un coloris entier d'un coup** : hors périmètre, le seuil vaut
  par lancement d'angle.
- **Ne pas commiter, pousser ni fusionner sans demande explicite d'Aramis**, et
  jamais sur `main`. Au 19/10, T7–T9 sont volontairement non commités.
- **Pas de `npm run build` pendant un `npm run dev`** : il corrompt `.next`.
- **Ne jamais toucher la base de prod** ; les essais se font sur la base de dev
  (`ep-autumn-morning`).

## 11. Points d'attention

- **Formes de requête hétérogènes** : selon le modèle, OpenRouter attend
  l'endpoint `/images` ou `chat/completions` avec `modalities`. Fruit Drama gère
  les deux. Le nombre max de références varie (de 1 à 14) : il faut tronquer
  proprement et le dire.
- **`usage.cost` peut manquer** : coût réel null, affiché « inconnu », exclu des
  moyennes de coût (pas compté zéro).
- **Prix au jeton** : beaucoup de modèles d'image n'ont pas de prix par image,
  donc le devis sera souvent « inconnu », donc confirmation. Acceptable, mais à
  rendre lisible.
- **Coût cumulé du test** : environ 10 coloris × 5 angles × 3 modèles × ~0,10 $,
  soit de l'ordre de 15 $, plus les corrections. Le total dépensé doit rester
  visible.
- **Blocages de sécurité** : certains modèles refusent les logos de marque
  (Nike). Il faut un message nommé, pas une erreur générique, et le compter à
  part dans le bilan.
- **Taille des réponses** : une image en base64 peut peser plusieurs Mo. La
  route l'écrit au Blob et ne la renvoie jamais au navigateur (limite de 4,5 Mo
  par réponse sur Vercel).
- **SacBase** : la route coloris n'existe qu'en local (PR SacBase #18 non
  déployée). Sans elle, le Studio ne liste que les coloris déjà ouverts.
- **Vignettes du catalogue** : SacBase protège ses images derrière sa session.
  Elles ne s'affichent pas dans MyFlip, c'est connu et sans rapport.
- **Prompts du 17/10** absents du dépôt : les prompts actuels sont une
  réécriture. À comparer avant de conclure sur un modèle.

## 12. Tests et vérification

- **vitest, logique pure** : estimateur (prix publié / au jeton / inconnu,
  somme, seuil à 0,10 $ strict, inconnu ⇒ confirmation), parseur du catalogue
  (filtre entrée+sortie image, max de références), parseur de réponse de
  génération (`b64_json`, data URL, pas d'image, blocage, `usage.cost` absent),
  numérotation par modèle, statistiques par modèle et agrégats de coût (coût
  inconnu exclu, jamais compté zéro).
- **Test de cloisonnement étendu** et **prouvé par injection de faute**, comme
  le 19/10 : un import interdit et une écriture sur `Article` doivent le faire
  échouer.
- **Route de lancement** : refus sans confirmation au-delà du seuil, avec un
  `fetch` OpenRouter injecté (aucun appel réel en test).
- **Navigateur, contre le dev** (comptes et données de test, base de dev) :
  catalogue affiché, lancement à 2-3 modèles moins chers, confirmation
  déclenchée, essais côte à côte avec coût, vérification IA, correction, bilan
  par modèle. **Un seul vrai appel payant** par modèle testé, annoncé à Aramis
  avant.
- `npm test`, `npm run typecheck`, `npm run lint` verts, sortie collée dans la
  passation.

## 13. Découpage en étapes

1. **Migration** : colonnes de `StudioEssai`, unique par modèle, favoris.
   Appliquée sur dev, vérifiée sur `information_schema`. *Visible :* tables à jour,
   colonnes protégées intactes.
2. **Catalogue + estimateur** (parallélisable) : modules purs et testés, route
   de lecture du catalogue. *Visible :* liste des modèles avec prix dans un écran
   de test.
3. **Client de génération + route de lancement** (parallélisable avec 2 une fois
   l'interface fixée) : seuil serveur, Blob, essai `api`, vérification
   automatique. *Visible :* un lancement réel produit un essai avec coût.
4. **Écran de la ligne d'angle** : sélecteur, devis, confirmation, états par
   modèle, essais groupés, correction par régénération. *Visible :* le parcours
   complet au navigateur.
5. **Bilan par modèle + total dépensé.** *Visible :* le tableau par modèle.
6. **Documentation et passation** : `CLAUDE.md` (section Studio IA, à mettre à
   jour : la génération n'est plus « manuelle seulement »), `TODOS.md` (l'option
   B passe de « plus tard » à « fait »), `HANDOFF.md` selon `AGENTS.md`, avec le
   rapport de coût Jev.

## 14. Hypothèses et questions ouvertes

- La forme exacte des favoris (table dédiée ou réglage JSON) reste à trancher
  dans le plan. C'est technique, sans effet sur le comportement.
- « Lancement » = un angle × les modèles cochés : c'est la définition retenue
  pour le seuil de 0,10 $ (confirmée par Aramis).
