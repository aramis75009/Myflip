# PRD — Refonte complète du design de MyFlip

> 20/10/2026 · Cadré avec Aramis · Statut : validé le 20/10/2026

## 1. Problème

Aramis utilise MyFlip tous les jours pour gérer son activité de revente : stock, commandes de lots, mise en vente Vinted, comptabilité des ventes, calendrier, statistiques, et le Studio, qui génère par IA les photos des sacs. Il « ne peut plus voir » le design actuel (la « Direction C — Console tactile »). En plus, ce design est bugué.

Bugs relevés dans le code le 20/10 :

- **Polices et texte**
  - Le loader appelle Space Grotesk par son nom littéral, alors que `next/font` l'a renommée. Il s'affiche donc en police système.
  - Il existe une vingtaine de tailles de texte arbitraires, dont 38 usages sous 10 px, illisibles.
  - Presque toutes les tailles sont en px, donc le zoom texte du navigateur ne fonctionne pas.
- **Opacités sans effet** : sur les couleurs définies en variables CSS, Tailwind ne génère pas les classes d'opacité. Résultat :
  - aucun voile derrière les modales ;
  - les barres collantes ou fixes de Mise en vente et de la landing page sont transparentes ;
  - l'overlay de Mise en vente est invisible.
- **Menu et cadre**
  - L'entrée active du menu latéral est blanche sur blanc au premier affichage.
  - Une barre de défilement inutile apparaît sur chaque page : `min-h-screen` est appliqué deux fois sous une barre du haut de 62 px.
  - Cinq éléments sont au même z-index ; c'est l'ordre du DOM qui décide lequel passe devant.
- **Mobile**
  - Les champs de saisie font moins de 16 px, donc iOS zoome à chaque focus.
  - Les barres fixes chevauchent le dock en bas d'écran, car elles ignorent la zone sûre de l'iPhone.
  - Les toasts restent clairs en mode sombre.
  - La barre de défilement reste claire en mode sombre.

Le code freine aussi tout changement de style :

- Il n'y a aucun composant commun pour les boutons, champs, sélecteurs ou tableaux : 184 boutons et 94 champs sont stylés à la main un par un.
- Les modales existent en quatre implémentations différentes.
- Il y a 1 374 valeurs arbitraires en px et 133 couleurs hexadécimales en dur.
- 12 fichiers dépassent 400 lignes ; la page Stock en fait 1 827.

Le **Studio** est l'écran qui compte le plus aujourd'hui, et son parcours est confus :

- Une planche de 15 cases occupe le haut de la fiche, au-dessus de la file « À juger », alors que le code annonce que la prochaine action est en haut.
- On ne peut pas retirer une photo de la planche, alors que l'API le permet.
- Les touches V et R valident ou rejettent une image sur-le-champ, sans annulation possible.
- Une image rejetée disparaît sans laisser d'historique.
- Il y a quatre façons concurrentes de placer une prise.
- Les étoiles de favoris s'affichent mais ne réagissent pas : le composant qui les gère n'est importé nulle part.
- Les réglages des prompts sont rangés sous une entrée de menu nommée « Prompts ».

Aramis trouve le choix des modèles de génération « amateur ». On ne voit ni les résultats réels de chaque modèle, ni ce qu'un sac complet va coûter, et on ne peut pas comparer deux modèles.

## 2. Solution

Une nouvelle identité visuelle complète, sur laquelle Aramis donne **carte blanche** : palette, polices, mouvement, iconographie et ton.

- Elle doit être belle, professionnelle, claire et très lisible.
- Les thèmes clair et sombre sont soignés tous les deux.
- Elle est pensée d'abord pour l'ordinateur et reste impeccable sur mobile.

Elle repose sur une base de composants communs et s'applique à **tous** les écrans. Les parcours sont revus pour retirer des clics et des hésitations.

Le Studio devient l'écran vitrine. Son parcours suit l'ordre du travail réel :

1. importer et ranger les photos du sac ;
2. choisir les angles ;
3. choisir le ou les modèles ;
4. générer ;
5. juger chaque image ;
6. valider pour l'annonce.

Le **choix des modèles** est entièrement repensé : un catalogue vivant, des favoris qui fonctionnent, et pour chaque modèle ses résultats réels (taux de réussite du premier coup, coût moyen) et son coût estimé par sac. On y trouve aussi l'historique des tentatives par prise et une comparaison côte à côte de 2 ou 3 modèles sur une même prise. L'inspiration vient de Fruit Drama Studio, une autre application d'Aramis (`~/Documents/fruit-drama-studio`). Il ne s'agit pas de le copier : Aramis l'a écrit en 30 minutes et attend nettement mieux.

## 3. Critères de réussite

1. Aucun des bugs listés en § 1 ne se reproduit, vérifié par captures Playwright avant/après.
2. Une seule famille de tokens pilote l'ensemble :
   - aucune couleur hexadécimale en dur dans les composants (exceptions documentées : données de couleurs Vinted, e-mails, couleurs de statut si elles passent en tokens) ;
   - une échelle typographique de 8 tailles au plus, et aucun texte d'interface sous 11 px ;
   - les tailles de police en rem, pour que le zoom texte du navigateur fonctionne ;
   - une échelle de z-index nommée.
3. Le contraste atteint WCAG AA (4,5:1 pour le texte, 3:1 pour les éléments d'interface) dans les deux thèmes, focus compris.
4. Chaque écran a ses états chargement, vide, erreur et désactivé dessinés, et chaque action donne un retour visible.
5. Sur mobile, aucun champ ne fait zoomer iOS, aucune barre fixe ne chevauche le dock, et aucune page ne défile horizontalement, sauf les tableaux larges, qui défilent dans leur conteneur avec un indice visuel.
6. Studio : le coût estimé d'un sac complet (15 prises) est affiché avant de lancer, et comparé au **budget par sac, 1 € par défaut**, réglable. Au-delà du budget, ou si un prix est inconnu, la génération demande une confirmation qui affiche le montant.
7. Studio : le sélecteur de modèles montre, pour chaque modèle :
   - son prix par image ;
   - son coût par sac ;
   - son taux de réussite du premier coup et son coût moyen réel, tirés des essais d'Aramis ;
   - son statut de favori, que l'on peut basculer.
8. Studio : chaque prise a un historique de ses tentatives (image, modèle, coût, durée, verdict IA, décision), qui inclut les images rejetées.
9. Studio : une prise peut être générée sur 2 ou 3 modèles en un seul lancement, et les résultats se jugent côte à côte.
10. Studio : une décision de validation ou de rejet peut être annulée, et une photo de la planche peut être retirée ou remplacée.
11. `npm run lint`, `npm run typecheck` et `npm test` passent. La suite Playwright passe en clair et en sombre, sur ordinateur (1440 px) et sur mobile (390 px).
12. Toutes les fonctions existantes marchent encore : aucune route, aucun calcul et aucune donnée perdus.

## 4. User stories

**Fondations**
1. En tant qu'Aramis, je veux une identité visuelle nouvelle et cohérente sur tous les écrans, pour avoir plaisir à ouvrir l'outil chaque jour.
2. En tant qu'Aramis, je veux des polices nettes qui se chargent sans saut ni police système, pour lire mes chiffres sans effort.
3. En tant qu'Aramis, je veux basculer entre clair et sombre sans élément oublié (toasts, barres de défilement, logos, favicon), pour travailler le soir.
4. En tant qu'Aramis, je veux un menu latéral où l'écran actif est évident dès le premier affichage, pour savoir où je suis.
5. En tant qu'Aramis, je veux que les modales aient un voile, se ferment au clavier et rendent le focus, pour ne pas perdre le fil.
6. En tant qu'Aramis sur mobile, je veux saisir dans un champ sans que la page zoome, pour noter une vente debout.
7. En tant qu'Aramis, je veux des animations sobres et rapides qui expliquent ce qui se passe (apparition, déplacement, succès), et qui se coupent si je règle mon système pour réduire les animations.

**Studio**
8. En tant qu'Aramis, je veux voir dans le catalogue des coloris, d'un coup d'œil, ce qui reste à faire pour chacun (photographier, générer, juger), en une phrase d'action, pour choisir par où commencer.
9. En tant qu'Aramis, je veux que les filtres du catalogue restent dans l'URL, pour revenir où j'étais.
10. En tant qu'Aramis, je veux que la fiche d'un coloris mette la prochaine action en haut, pour ne pas faire défiler 15 cases avant de juger.
11. En tant qu'Aramis, je veux déposer mes photos d'un coup et qu'elles remplissent les cases libres, même si j'en dépose trop (les surplus sont signalés, pas tout refusés), pour gagner du temps.
12. En tant qu'Aramis, je veux retirer ou remplacer une photo de la planche, pour corriger une erreur.
13. En tant qu'Aramis, je veux une seule façon claire de ranger une prise (glisser à la souris, avec une alternative au clavier), pour ne pas hésiter.
14. En tant qu'Aramis, je veux choisir les angles dans un tableau lisible sans défilement horizontal pénible, avec un choix automatique en un clic.
15. En tant qu'Aramis, je veux un sélecteur de modèles avec recherche, favoris épinglés que je peux basculer, et filtres prix et réussite, pour trouver le bon modèle vite.
16. En tant qu'Aramis, je veux voir pour chaque modèle son prix par image, son coût pour un sac complet, son taux de réussite du premier coup et son coût moyen réel, pour choisir en connaissance de cause.
17. En tant qu'Aramis, je veux savoir avant de lancer combien coûte le sac, comparé à mon budget de 1 €, pour ne jamais être surpris.
18. En tant qu'Aramis, je veux régler ce budget par sac, pour l'ajuster si les prix changent.
19. En tant qu'Aramis, je veux générer la même prise avec 2 ou 3 modèles et comparer les images côte à côte, pour trouver le meilleur rapport qualité-prix.
20. En tant qu'Aramis, je veux l'historique de toutes les tentatives d'une prise, rejetées comprises, pour comprendre ce qui marche.
21. En tant qu'Aramis, je veux voir ma vraie photo à côté de l'image générée, avec l'avis de l'IA présenté comme une aide, pour décider vite.
22. En tant qu'Aramis, je veux valider ou rejeter au clavier, avec un retour visible et la possibilité d'annuler, pour juger vite sans erreur irréversible.
23. En tant qu'Aramis, je veux distinguer une vérification IA en échec d'une vérification pas encore faite, pour savoir quoi relancer.
24. En tant qu'Aramis, je veux suivre la progression d'une génération et la retrouver si je change de page, pour ne pas perdre un lancement payé.
25. En tant qu'Aramis, je veux régler le prompt maître et les prompts d'angle depuis le Studio, et voir le prompt exactement tel qu'il part, pour comprendre ce que reçoit le modèle.
26. En tant qu'Aramis, je veux un Bilan lisible (réussite, dépenses, par modèle, par angle, par coloris) avec de vrais graphiques.

**Autres écrans**
27. En tant qu'Aramis, je veux un tableau de bord qui réponde d'abord à « où en est mon mois », avec mon objectif et mes marges.
28. En tant qu'Aramis, je veux un Stock rapide à filtrer, avec un changement de statut en ligne et des actions groupées, sans perte de fluidité sur des centaines de lignes.
29. En tant qu'Aramis, je veux saisir une commande de lots avec moins de champs visibles d'un coup et des valeurs par défaut justes, pour aller plus vite.
30. En tant qu'Aramis, je veux un parcours de mise en vente en 4 étapes plus lisible, dont la barre d'actions reste visible et opaque.
31. En tant qu'Aramis, je veux enregistrer une vente avec la même fenêtre, que je passe par le Stock ou par « À comptabiliser », pour ne pas apprendre deux formulaires.
32. En tant qu'Aramis, je veux un calendrier et des statistiques avec des graphiques clairs, lisibles dans les deux thèmes.
33. En tant qu'Aramis, je veux des pages Compte, Paramètres et Démarrage aussi soignées que le reste.
34. En tant que visiteur, je veux une landing page publique à la nouvelle image, pour comprendre MyFlip en dix secondes.
35. En tant qu'Aramis, je veux des pages de connexion, d'inscription, de mot de passe oublié, des pages légales et une 404 cohérentes avec l'appli.

## 5. Périmètre

**Dedans :**
- Les fondations : identité, tokens, polices, thèmes, composants communs, cadre de navigation, échelle de z-index et mouvement.
- La correction de tous les bugs du § 1.
- Le Studio entier : catalogue, fiche, planche, file à juger, angles, génération, sélecteur de modèles, historique, comparaison, réglages des prompts et Bilan.
- Tous les autres écrans : tableau de bord, stock, commandes, mise en vente, à comptabiliser, calendrier, statistiques, paramètres, compte, démarrage, authentification, pages légales et 404.
- La landing page, en dernière vague.
- La refonte des parcours : fusionner des écrans ou des fenêtres, réordonner des étapes, retirer des clics.
- Des ajouts au schéma de données **pour le Studio uniquement**.
- L'ajout de Playwright en dépendance de développement.

**Hors périmètre :**
- Les calculs métier (marges, trésorerie, statuts, prix), les routes d'API existantes et leurs contrats, hors Studio. La refonte porte sur le visuel et les parcours, pas sur la logique.
- La suppression ou la modification de données ou de colonnes existantes : seuls les ajouts sont autorisés.
- L'extension Chrome Vinted et son interface, qui forment un projet séparé.
- Les e-mails transactionnels : leur rendu est contraint par les clients mail.
- Les intégrations Trello et SacBase : on ne touche qu'à leur présentation dans l'appli.

## 6. Stack technique

D'après le `package.json` de MyFlip, lu le 20/10/2026 :

| Brique | Version | Note |
|---|---|---|
| Next.js (App Router) | ^15.3.9 | |
| React / React DOM | ^18 | |
| TypeScript | ^5 | |
| Tailwind CSS | ^3.4.1 | aucun plugin |
| Prisma + @prisma/client | ^6.19.3 | base Postgres Neon |
| NextAuth | ^5.0.0-beta.31 | |
| @tanstack/react-query | ^5.101.0 | |
| @tanstack/react-virtual | ^3.14.3 | tableau Stock |
| lucide-react | ^1.21.0 | icônes |
| sonner | ^2.0.7 | toasts |
| date-fns | ^4.4.0 | |
| @vercel/blob | — | images du Studio |
| Vitest | ^3.2.7 | environnement node, tests de logique seulement |
| ESLint | ^8 | next/core-web-vitals et next/typescript |

Absents :
- shadcn et Radix ;
- toute bibliothèque d'animation, de graphiques ou de glisser-déposer ;
- clsx, cva et tailwind-merge ;
- Playwright, Testing Library et toute CI.

Polices actuelles, chargées par `next/font/google` : Space Grotesk et JetBrains Mono.

La génération d'images passe par OpenRouter, avec la clé d'Aramis réglée dans Mon compte. Le catalogue des modèles est déjà lu en direct et normalisé côté serveur : modèles d'image et tarifs par image via les endpoints. Le module de devis est pur et partagé entre client et serveur.

Le déploiement est automatique sur Vercel depuis `main`, et c'est la prod.

**Ajouts autorisés par la refonte :**
- de nouvelles polices via `next/font` ;
- des primitives accessibles (Radix, ou shadcn sur Radix) ;
- une bibliothèque de mouvement si elle est justifiée (Motion pour React) ;
- les utilitaires de classes clsx, cva et tailwind-merge ;
- une bibliothèque de graphiques si les SVG faits main ne suffisent plus ;
- Playwright en dépendance de développement.

Chaque ajout est justifié dans le commit, et les versions sont lues dans la doc du moment (MCP `context7`, à autoriser via `/mcp`), pas de mémoire.

## 7. Agents, skills et outils à utiliser

| Étape | Agent / skill / outil | Pourquoi |
|---|---|---|
| Orchestration | Outil `Workflow`, mode **ultracode**, à demander explicitement dans le message d'ouverture | Aramis veut une exécution autonome multi-agents dans une conversation neuve |
| Choix du modèle de chaque sous-agent | `jev-delegate` (`route.py`) puis agents `jev-<modèle>-<effort>` | Règle du CLAUDE.md global : Jev route chaque sous-agent |
| Direction visuelle | `frontend-design` (table d'arbitrage), avec l'appui de `design-taste-frontend`, `high-end-visual-design` et `apple-design` | Carte blanche : une identité forte, pas un gabarit |
| Inspiration et composants | MCP **21st.dev**, connecté (compte payant, 100 crédits jusqu'au 01/11) : `get_inspiration`, `search`, `get_component`, `get_theme` | Repérer des composants et thèmes de qualité, puis les adapter au code |
| Bibliothèque de primitives | `shadcn`, `pick-ui-library` | Choisir et installer des primitives accessibles |
| Audit puis correction par domaine | `better` (perso, qui fait arbitrer Jev parmi les skills de design), puis `better-ui`, `better-typography`, `better-colors`, `better-layout`, `better-writing` et `better-accessibility`, ou `better-interface` seul | Chaque défaut va au skill qui en possède la règle |
| Mouvement | `emil-design-eng`, `animate`, puis `review-animations` et `find-animation-opportunities` | Des animations utiles, rapides et interruptibles |
| Textes de l'interface | `better-writing`, `ux-writing` | Libellés, erreurs, états vides |
| Graphiques (Bilan, statistiques, calendrier, tableau de bord) | `dataviz` | Table d'arbitrage |
| Tableaux de bord | `kpi-dashboard-design` | Hiérarchie des indicateurs |
| Mobile | `mobile-native` | Zone sûre, zoom iOS, dock |
| Vérification Playwright | `playwright-best-practices` | Mise en place de la suite de captures |
| Vérification visuelle en direct | Navigateur intégré (`mcp__Claude_Browser__*`, `preview_start`) | Rendu réel, console, réseau |
| Revue avant merge | `/code-review`, puis `/interface-review` (à taper par Aramis, non invocable par un agent) | Table d'arbitrage |
| États d'un composant | `/state-machine` et `/break` (à taper par Aramis) | Non invocables par un agent : à proposer seulement |
| Fin de chantier | `superpowers:verification-before-completion` | Aucune annonce sans preuve |
| Déploiement | Merge sur `main`, puis Vercel en automatique ; contrôle avec `vercel-deploy-workflow` | Table d'arbitrage |
| Doc des bibliothèques | MCP `context7` (à autoriser via `/mcp`) | Versions actuelles, pas la mémoire du modèle |

## 8. Décisions d'implémentation

**Identité et tokens**
- Une seule source de vérité : des variables CSS sémantiques, redéfinies sous le thème sombre et exposées à Tailwind.
- Les couleurs sont définies en **canaux** (par exemple au format `R G B` ou OKLCH, avec `<alpha-value>` dans la config Tailwind) pour que les opacités du type `bg-surface/90` fonctionnent. C'est la cause racine des voiles et barres transparents.
- Les alias morts ou en double (`primary`, `muted`, `faint`…) sont supprimés.
- Les tailles de police sont en rem, sur une échelle nommée. Les espacements, rayons, ombres, z-index et durées sont nommés eux aussi.
- Les couleurs de statut et de canal passent en tokens à deux thèmes, au lieu des styles en ligne.
- Les polices sont chargées par `next/font`, avec leurs variables posées sur `<html>`. Le nom littéral d'une famille n'est jamais écrit en dur. Pour les chiffres : chiffres tabulaires (`tabular-nums`).
- Le favicon, l'icône iOS et `themeColor` sont réalignés sur la nouvelle identité.

**Composants communs**
Une couche de primitives réutilisées partout :
- bouton, avec ses variantes, tailles et état « en cours » ;
- champ, zone de texte, sélecteur et case à cocher, à 16 px minimum sur mobile ;
- badge et pastille de statut ;
- carte ;
- modale (une seule implémentation : voile, piège de focus, Échap, retour du focus) et sa variante tiroir ;
- menu ;
- onglets ;
- tableau, avec en-tête collant et défilement horizontal contenu ;
- états vide, erreur et chargement ;
- squelette de chargement.

Les pages consomment ces primitives ; les styles écrits au cas par cas disparaissent.

**Cadre**
- Un seul conteneur gère la hauteur, avec `dvh` et sans double `min-h-screen`.
- Menu latéral : indicateur actif rendu dès le serveur, repli conservé, pied toujours visible.
- Barre du haut : sur ordinateur, une recherche ou commande rapide est permise si elle sert les parcours.
- Dock mobile : priorisé, avec un menu « Plus » au lieu d'une barre qui défile.
- Toasts : suivent le thème et sont décalés au-dessus du dock et du bouton du chat.
- Ajout de pages `loading` et `error` par segment.

**Mouvement**
- Durées courtes, de 120 à 240 ms pour l'interface.
- Entrées et sorties symétriques, animations interruptibles.
- Respect de `prefers-reduced-motion`, sans `!important` global.
- Les ~30 keyframes actuelles sont remplacées par un petit jeu nommé.

**Studio — parcours**
- La fiche s'ouvre sur la prochaine action. Ses sections sont ordonnées et repliables : Photos, Angles, Génération, À juger, Validées.
- **Planche**
  - Les photos en trop sont signalées, pas tout le lot refusé.
  - On peut retirer ou remplacer une photo via l'API de suppression existante, qui refuse si la photo a servi.
  - Une seule interaction principale (glisser), avec une alternative clavier.
  - Le sélecteur dans le tableau des angles est supprimé.
- **Jugement**
  - Raccourcis V et R conservés, avec un toast « Annuler » de quelques secondes avant que la décision ne soit définitive.
  - Les rejetés restent consultables dans l'historique.
  - L'état « vérification échouée » est distinct de « pas encore vérifié ».
- **Réglages du Studio** (prompt maître, prompts d'angle, budget) : accessibles depuis le Studio. L'entrée de menu « Prompts » est renommée ou fusionnée selon le nouveau découpage de navigation.
- **Aperçu du prompt** : on peut voir le prompt exactement tel qu'il part, prompt maître puis prompt d'angle.

**Studio — modèles, coût et tests**
- **Catalogue**
  - Il reste lu en direct chez OpenRouter.
  - Si l'agent qui implémente le juge utile, les modèles Google en accès direct peuvent s'ajouter, comme dans Fruit Drama Studio. C'est optionnel et doit être justifié.
  - En cas de panne, l'appli garde le dernier catalogue connu et propose un bouton Rafraîchir.
- **Sélecteur**
  - Recherche ; favoris épinglés et basculables, via la table de favoris existante ; filtres « dans le budget » et « déjà testé » ; tri par coût par sac ou par réussite.
  - Pour chaque modèle : prix par image, coût par sac (15 prises), badge « hors budget », taux de réussite du premier coup et coût moyen réel (calculés depuis les essais existants), nombre d'images, date de la dernière utilisation.
- **Budget par sac**
  - Nouveau réglage, 1 € par défaut, stocké dans les réglages Studio du compte : c'est un ajout de colonne.
  - Il est converti en dollars avec un taux affiché et réglable (OpenRouter facture en dollars).
  - Le seuil fixe de 0,10 $ est remplacé.
  - La confirmation se déclenche quand l'estimation du lancement dépasse le budget ou qu'un prix est inconnu. Le bouton affiche alors le montant, par exemple « Confirmer 1,34 € ».
  - Le serveur recalcule le devis et refuse un lancement non confirmé : le contrôle n'est pas seulement dans l'interface.
- **Historique** : la liste de tous les essais et échecs d'une prise (images, modèle, coût réel ou estimé, durée, verdict IA, décision), avec « retenir cette version ». Les données existent déjà (essais et échecs) ; la durée de génération est un ajout de colonne.
- **Comparaison**
  - Un lancement peut viser 2 ou 3 modèles pour une même prise. Les essais partagent leur identifiant de lancement.
  - Une vue côte à côte présente ces images avec la vraie photo, leur coût et leur verdict.
  - On en valide une, ou aucune.
  - Le devis multiplie les coûts en conséquence et la confirmation l'affiche.
- **Règles inchangées** : ne jamais inventer un prix ; ne jamais compter zéro un coût réel absent ; le verdict IA n'est qu'une aide, et seules les décisions d'Aramis alimentent les statistiques.

**Données**
- Ajouts seulement, sur le schéma Prisma : budget par sac, taux de conversion, durée de génération, et ce qu'exige la comparaison si l'identifiant de lancement ne suffit pas.
- Migration Prisma créée et testée en local.
- **Application sur la base Neon de prod uniquement après un OK explicite d'Aramis.** Attention : le `.env` local de MyFlip n'est pas la prod.

**Autres écrans**
- Une seule fenêtre de vente, qui remplace SellModal et SellDialog et inclut le compte de vente.
- Barres d'actions groupées : statut « Vendu » inclus.
- Graphiques passés par `dataviz`.
- Les pages trop grandes sont découpées en composants au passage, sans changer leur logique.

## 9. À faire absolument

- **Lire `docs/design-system.md` puis le remplacer** par le nouveau système. Le code et la doc doivent dire la même chose, pour qu'un prochain agent ne réintroduise pas l'ancienne direction.
- **Corriger les couleurs à la racine, en canaux**, avant tout restylage. Sinon chaque écran refait le bug d'opacité.
- **Capturer l'état actuel avant de toucher quoi que ce soit** : Playwright, chaque route, clair et sombre, ordinateur et mobile. Sans base de comparaison, on ne prouve aucune correction.
- **Travailler sur une branche de refonte**, jamais sur `main`. Le merge sur `main` met en prod : Aramis l'autorise dès que tout est vérifié (lint, typecheck, tests, suite Playwright, revue).
- **Garder les textes de l'interface en français**, code et commits en anglais. C'est la règle du projet.
- **Garder la règle « jamais un prix inventé »** et le contrôle de coût côté serveur. L'argent d'Aramis est en jeu.
- **Vérifier chaque écran dans le navigateur**, pas seulement par le code. Les bugs du § 1 sont des bugs de rendu.
- **Faire router chaque sous-agent par Jev** et donner à chacun une consigne autonome (fichiers, but, vérification). C'est la règle du CLAUDE.md global, et les sous-agents ne voient pas la conversation.
- **Avant le merge en prod d'une migration, s'arrêter et demander son OK à Aramis** pour l'appliquer sur Neon. Une migration ratée en prod casse l'appli.

## 10. À ne pas faire

- **Ne pas lancer `npm run build` pendant qu'un `npm run dev` tourne** : ça corrompt `.next`. Utiliser `npx tsc --noEmit` (`npm run typecheck`) et le navigateur.
- **Ne pas modifier ni supprimer de colonnes ou de données existantes** : c'est une règle d'Aramis, seuls les ajouts sont permis.
- **Ne pas changer les calculs métier ni les contrats d'API hors Studio** : le périmètre est le visuel et les parcours.
- **Ne pas remplacer le sélecteur de statut natif du Stock par un menu personnalisé sans résoudre le rognage** : il est natif exprès, pour ne pas être coupé dans le conteneur virtualisé et pour rester utilisable au clavier et sur mobile.
- **Ne pas changer la hauteur des lignes du Stock sans mettre à jour la virtualisation** : sinon le défilement saute.
- **Ne pas chercher ni modifier dans `.claude/worktrees/`** : il contient des copies complètes du code, et une modification de masse les toucherait.
- **Ne pas recopier Fruit Drama Studio** : Aramis veut mieux, il s'en sert seulement comme inspiration.
- **Ne pas reprendre la « Direction C — Console tactile »**, ni son vert foncé et son accent citron vert : Aramis ne la supporte plus.
- **Ne pas écrire de couleur, de taille ou de z-index en dur dans un composant** : c'est ce qui a rendu la direction actuelle impossible à faire évoluer.
- **Ne pas ajouter de bibliothèque sans justification** : chaque dépendance pèse sur le bundle et la maintenance.
- **Ne pas commiter d'image générée, de clé ou de `.env`** : ce sont des données sensibles.

## 11. Points d'attention

- **Doublons iCloud** : le projet vit dans un dossier synchronisé. Des copies « * 2 » apparaissent, par exemple le dossier « essais 2 » dans les routes API du Studio et un `.git/index 2`. Les repérer et ne pas les prendre pour du code actif. Les supprimer seulement après avoir vérifié qu'ils sont des doublons exacts.
- **Fichier non suivi** : `extension-vinted/banc/` est non suivi sur `main`. Ne pas l'embarquer dans les commits de la refonte.
- **Coût réel** : le budget de 1 € par sac exclut de fait les modèles les plus chers. Par exemple Nano Banana Pro, autour de 0,134 $ l'image au 05/10, revient à environ 2 $ par sac. Le sélecteur doit le montrer honnêtement, pas le cacher. Les tests de comparaison dépensent de l'argent réel : aucun test automatisé n'appelle OpenRouter.
- **Mode auto** : le garde-fou peut refuser des actions de prod (variables d'env Vercel, migration Neon). Dans ce cas, préparer la commande exacte pour qu'Aramis la lance.
- **Statut des données de test** : les essais du Studio en prod sont de vrais essais. Les tests Playwright tournent sur le serveur de dev local, sans écrire en prod.
- **Taille du chantier** : 12 fichiers de plus de 400 lignes. Découper par vagues, avec un commit par écran, pour pouvoir revenir en arrière.
- **Écrans sans tests de rendu** : Vitest ne teste que la logique, et la suite Playwright sera la seule protection visuelle. Elle doit couvrir toutes les routes avant la refonte.
- **Authentification dans Playwright** : il faut un compte de test local (graine ou fixture du projet), jamais le compte réel d'Aramis.
- **Polices** : vérifier la licence et le support des caractères français et des symboles (→, ✕, €).

## 12. Tests et vérification

- **Avant** : une suite Playwright de captures, avec toutes les routes connectées et publiques, en clair et en sombre, à 1440 px et à 390 px. Elle sert de référence.
- **Pendant**, à chaque écran :
  - `npm run lint`, `npm run typecheck` et `npm test` sont verts ;
  - les captures sont comparées et commentées ;
  - le navigateur intégré ne montre aucune erreur de console ;
  - un contrôle d'accessibilité automatique est lancé (axe via Playwright) ;
  - la navigation au clavier est vérifiée sur les modales et le Studio.
- **Tests de logique à ajouter** (Vitest) :
  - devis par sac et comparaison au budget, conversion en euros ;
  - agrégats par modèle (taux de réussite du premier coup, coût moyen réel), à partir de données fictives ;
  - devis multi-modèles ;
  - annulation d'une décision.
- **Tests de parcours** (Playwright) :
  - Studio : importer des photos, retirer une photo, choisir des angles, ouvrir le sélecteur et basculer un favori, voir le devis et la confirmation au-dessus du budget, valider puis annuler. OpenRouter est simulé, jamais appelé.
  - Une vente depuis le Stock et une depuis À comptabiliser passent par la même fenêtre.
- **Les bugs du § 1** ont chacun une capture « après » qui prouve leur disparition.
- **Après le merge** : le déploiement Vercel de `main` est vert, et la prod est contrôlée sur les écrans clés. Le Studio est vérifié avec une génération réelle **seulement si Aramis la lance**, puisqu'elle coûte.
- S'appuyer sur la trentaine de tests de logique existants (Studio, prompts, catalogue, lancement, statistiques, vérification…), qui doivent rester verts.

## 13. Découpage en étapes

1. **Base de comparaison.** Installer Playwright, prendre les captures de toutes les routes et créer le compte de test. *Visible : un dossier de captures « avant » et une suite verte.*
2. **Direction visuelle.** Explorer avec `frontend-design` et 21st.dev, puis fixer palette, polices, échelles et mouvement, et réécrire `docs/design-system.md`. *Visible : une page de référence du système, dans les deux thèmes.*
3. **Fondations.** Tokens en canaux, polices, thèmes, primitives communes, cadre (menu, barre du haut, dock, toasts), z-index, pages de chargement et d'erreur. Tous les bugs du § 1 sont corrigés. *Visible : toute l'appli a déjà changé de peau, sans bug d'affichage.*
4. **Studio, parcours.** Catalogue, fiche réordonnée, planche, angles, jugement avec annulation, réglages dans le Studio, aperçu du prompt. *Visible : un Studio neuf, de bout en bout.*
5. **Studio, modèles.** Sélecteur, budget par sac, historique, comparaison côte à côte, Bilan avec graphiques, migration d'ajout. *Visible : choisir et comparer des modèles en voyant les coûts. La migration est en attente de l'OK d'Aramis pour la prod.*
6. **Écrans du quotidien.** Tableau de bord, Stock, Commandes, Mise en vente, À comptabiliser, avec la fenêtre de vente unique. *Visible : les parcours quotidiens refaits.*
7. **Écrans de pilotage.** Calendrier, Statistiques, Paramètres, Compte, Démarrage, authentification, pages légales, 404. *Visible : plus aucun écran à l'ancienne image.*
8. **Landing page.** *Visible : la page publique refaite.*
9. **Finition et livraison.** Revue des animations, accessibilité, `/code-review`, captures finales, merge sur `main` (prod) et contrôle Vercel. *Visible : MyFlip refait, en prod.*

Les étapes 6 à 8 peuvent se paralléliser entre agents une fois les fondations posées, à raison d'un écran par agent et sans fichiers partagés.

## 14. Hypothèses et questions ouvertes

- **Merge en prod sans relecture d'Aramis** : c'est son choix explicite. L'agent doit rendre compte de chaque merge (ce qui part, captures, résultats de vérification).
- **Taux de conversion dollar → euro** : la valeur par défaut est à choisir à l'implémentation et à afficher. Le réglage reste modifiable.
- **Modèles Google en accès direct** : optionnels, à justifier si l'agent les ajoute (une clé supplémentaire à gérer).
- **Navigation** : le nouveau découpage du menu (fusions, renommages comme « Prompts ») est laissé à l'agent, dans l'esprit « visuel + parcours ». Il le documente dans le système de design.
