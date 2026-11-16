# PRD — Studio : retouches par lot à la place de la génération d'images

> 16/11/2026 · Cadré avec Aramis · Statut : validé le 16/11/2026

## 1. Problème
Le Studio de MyFlip produit des images d'annonce par génération IA : choix de modèles, prompts, dépenses OpenRouter, puis tri des résultats. Aramis a mis le Studio en pause le 10/11 (« ça ne fonctionne pas ») et ne veut plus de génération. Son besoin réel : partir des **vraies photos déjà stockées** d'un sac et en tirer plusieurs **versions** différentes (photos retouchées et titre reformulé), vite et sans dépense d'images. Aujourd'hui, il ne peut que pivoter une photo à la fois (outil « Pivoter » livré le 16/11), et il doit retoucher ailleurs pour le reste.

## 2. Solution
Dans le Studio, sur la fiche d'un sac :
- Aramis coche plusieurs photos du sac et ouvre **un seul panneau de retouche**. Il y règle, avec un aperçu en direct sur chaque photo :
  - **pivoter**, même angle pour toutes, en mode **zoom** (aucun coin vide) ou **bords blancs** (image entière) ;
  - **recadrer**, de 0 à 30 %, centré ;
  - **ajouter un cadre** : couleur (blanc, noir, gris ou beige, ou choix libre), épaisseur, et bord adouci réglable.
- **Enregistrer** crée une **copie retouchée** de chaque photo cochée et range ces copies dans **une nouvelle version** du sac (Version 2, 3…). L'original ne change jamais. **Il n'y a plus d'étape « Juger / Valider »** : l'aperçu en direct suffit (décision du 16/11).
- Une **Version** du sac = ses photos, son titre, sa description et son **SKU d'annonce**, qu'Aramis renseigne lui-même dans une case. Un sac peut avoir plusieurs versions. La Version 1 est l'état actuel.
- La description d'une version a trois parties : **les tirets** (jamais modifiés), **les mots-clés** (légèrement reformulés par l'IA) et **le SKU** (saisi par Aramis).
- Un seul bouton **« Reformuler »** propose, pour la version en cours, un nouveau titre et des mots-clés de description légèrement changés, avec le même sens. Les tirets ne bougent pas, et le SKU n'est jamais touché par l'IA.
- Dans **Mise en vente**, Aramis choisit la version à publier.
- Sur chaque version, deux boutons de copie : **« Copier le titre »** et **« Copier la description »**. Le second copie d'un coup les tirets, une ligne vide, les mots-clés, puis le SKU sur la ligne juste en dessous des mots-clés (décision du 16/11).

La génération d'images IA disparaît du Studio.

## 3. Critères de réussite
- Aramis produit une **Version 2 complète** d'un sac (6 photos retouchées, un titre et des mots-clés reformulés, son SKU saisi) en **moins de 2 minutes**, sans autre dépense que la reformulation. *(Critère proposé, voir §14.)*
- Les photos d'origine sont identiques, octet pour octet, avant et après n'importe quelle retouche.
- Aucun appel à un modèle d'images ne reste possible depuis le Studio.
- Les images IA déjà validées apparaissent toujours dans leurs annonces.
- La partie à tirets de la description est identique avant et après « Reformuler ».

## 4. User stories
1. En tant qu'Aramis, je veux cocher plusieurs photos d'un sac d'un coup, pour leur appliquer les mêmes retouches.
2. En tant qu'Aramis, je veux tourner toutes les photos cochées du même angle (−45° à +45°, au degré, au curseur ou en tapant le nombre), pour varier leur aspect.
3. En tant qu'Aramis, je veux choisir entre « zoom » et « bords blancs » pour la rotation, pour garder soit une photo pleine, soit l'image entière.
4. En tant qu'Aramis, je veux recadrer de 0 à 30 % avec un seul curseur, pour resserrer sur le sac.
5. En tant qu'Aramis, je veux ajouter un cadre de couleur autour de la photo, pour changer son aspect.
6. En tant qu'Aramis, je veux choisir la couleur du cadre parmi des pastilles ou librement, pour aller vite tout en gardant le choix.
7. En tant qu'Aramis, je veux régler l'épaisseur du cadre.
8. En tant qu'Aramis, je veux adoucir le passage entre la photo et le cadre, pour un rendu moins dur.
9. En tant qu'Aramis, je veux cumuler rotation, recadrage et cadre dans un seul passage, pour n'enregistrer qu'une copie par photo.
10. En tant qu'Aramis, je veux voir l'aperçu de chaque photo cochée avant d'enregistrer, pour ne pas découvrir le résultat après coup.
11. En tant qu'Aramis, je veux que l'original ne soit jamais modifié, pour pouvoir toujours repartir de la vraie photo.
12. En tant qu'Aramis, je veux qu'« Enregistrer » range directement les copies dans une nouvelle version, sans étape de validation, parce que j'ai déjà vu le résultat dans l'aperçu.
13. En tant qu'Aramis, je veux garder plusieurs versions du même sac (Version 1, 2, 3…), chacune avec ses photos, son titre, sa description et son SKU.
14. En tant qu'Aramis, je veux cliquer « Reformuler » pour obtenir un nouveau titre et des mots-clés de description légèrement changés, de même sens, et relancer si la proposition ne me plaît pas.
15. En tant qu'Aramis, je veux que les tirets de la description restent identiques, parce qu'ils décrivent l'objet et ne doivent pas bouger.
15 bis. En tant qu'Aramis, je veux renseigner moi-même le SKU de chaque version, pour l'annonce.
15 ter. En tant qu'Aramis, je veux copier le titre en un clic, et la description entière en un clic (tirets, ligne vide, mots-clés, SKU juste en dessous), pour la coller dans mon annonce.
16. En tant qu'Aramis, je veux choisir la version à publier dans Mise en vente.
17. En tant qu'Aramis, je veux que mes anciennes images validées restent dans leurs annonces, pour ne rien perdre.
18. En tant qu'Aramis, je veux que les copies pivotées créées avant la refonte apparaissent dans le nouvel outil.

## 5. Périmètre
**Dedans :**
- la suppression de la génération d'images (écrans, routes, choix de modèles, prompts du Studio) ;
- le panneau de retouche par lot (pivoter, recadrer, cadre) ;
- les copies retouchées et leur validation ;
- les Versions d'un sac ;
- la reformulation du titre et des mots-clés ;
- le choix de la version dans Mise en vente ;
- la reprise des copies pivotées existantes.

**Hors périmètre :**
- **le lot sur plusieurs sacs à la fois** : Aramis a choisi le lot « toutes les photos d'un sac » ;
- **un angle différent par photo dans un lot** : même angle pour toutes, par décision ;
- **la reformulation automatique de tout un lot** : interdite, une reformulation ne part que sur clic (§10) ;
- **la modification de la description à tirets** : interdite (§10) ;
- **toute action vers Vinted depuis le Studio** : la publication reste dans Mise en vente et l'extension.

## 6. Stack technique
- **Next.js 15** (`^15.3.9`) et **React 18**, lus dans `package.json` de MyFlip.
- **Prisma 6** (`^6.19.3`). Base de dev et de preview sur Neon, **base de prod sur Supabase** (autre compte), d'après la mémoire projet et le CLAUDE.md du dépôt.
- **sharp 0.34.5** pour le rendu serveur des images, ajouté par la PR #10 (outil « Pivoter »).
- **Stockage des photos** : le même mécanisme de dépôt que l'import du Studio, déjà réutilisé par « Pivoter ».
- **IA texte** : le fournisseur choisi pour Mise en vente (sélection configurable dans Paramètres, déjà utilisée par la génération d'annonce).
- **Déploiement** : Vercel ; merger sur `main` déploie la prod.

## 7. Agents, skills et outils à utiliser
| Étape | Agent / skill / outil | Pourquoi |
|---|---|---|
| Maquette avant code | `frontend-design`, puis une maquette HTML sur le modèle des maquettes FLIPO du hub Revente | Aramis valide une maquette avant tout code ; elle part de l'app réelle |
| Plan d'exécution | `superpowers:writing-plans` | Découper chaque étape en tâches vérifiables |
| Code | Un sous-agent par étape (`jev-sonnet-xhigh` d'après Jev), lancé dans un worktree de MyFlip | Le hub Revente ne code pas ; chaque étape est une PR |
| Rendu d'images | sharp (déjà présent) | Même lib que « Pivoter », rendu identique à l'aperçu |
| Doc de lib | MCP `context7` (sharp, Next 15) | Ne pas coder de mémoire |
| Tests e2e | Playwright (déjà dans le dépôt, compte `demo`) | Comme les tests du Studio existants |
| Relecture avant merge | `/code-review` | Règle globale d'Aramis |
| Base de prod | SQL idempotent collé par Aramis dans Supabase | Le MCP Supabase de la session n'a pas accès au projet MYFLIP |

## 8. Décisions d'implémentation
- **Une seule fonction de géométrie partagée** par l'aperçu (client) et le rendu (serveur). Elle part de la fonction de recadrage déjà livrée pour « Pivoter », et l'étend au mode « bords blancs », au recadrage centré et au cadre. Les paramètres d'une retouche forment un objet unique :
  ```ts
  type Retouche = {
    angle: number;                       // −45…45, entier
    modeRotation: "zoom" | "bordsBlancs";
    recadragePct: number;                // 0…30, centré
    cadre: null | { couleur: string; epaisseurPct: number; adoucissement: number };
  };
  ```
- **Copie retouchée** : la copie pivotée de la PR #10 (lien vers l'originale) est généralisée pour porter les réglages complets de la retouche, au lieu du seul angle. Les copies existantes sont reprises comme retouches « angle seul, mode zoom ».
- **Versions** : une Version appartient à un sac. Elle a un numéro, des photos ordonnées, un titre, une description en trois parties (tirets, mots-clés, SKU) et un SKU d'annonce saisi par Aramis. La Version 1 reprend les images déjà validées, le titre, la description et le SKU actuels.
- **Plus de validation** : chaque « Enregistrer » du panneau crée la version suivante avec les copies. La décision d'Aramis reste la seule porte d'entrée d'une image dans une annonce : c'est lui qui enregistre, puis qui choisit la version à publier.
- **Reformulation** : une seule route reçoit le titre et les mots-clés de la description et renvoie une proposition, via le même sélecteur d'IA que la génération d'annonce. Les tirets et le SKU ne lui sont jamais envoyés à modifier : ils sont recollés tels quels autour des mots-clés reformulés.
- **Découpage de la description** (lu dans le code le 16/11) : la génération d'annonce renvoie déjà trois champs séparés, `titre`, `description` et `motsCles` (une chaîne de mots séparés par des virgules). L'export assemble l'annonce en `description`, ligne vide, `motsCles`, ligne vide, SKU. La reformulation ne touche donc que `titre` et `motsCles`. Les tirets viennent des prompts personnalisés d'Aramis, stockés en base, dans le champ `description`.
- **Mise en vente** lit la version choisie au lieu de « toutes les images validées du sac ».
- **Suppression de la génération** : les écrans, les routes de génération, les choix de modèles, les prompts du Studio et la confirmation de dépense disparaissent. Les données des images déjà validées sont conservées.

## 9. À faire absolument
- **Maquette validée avant le code**, parce qu'Aramis ne lit pas les specs : il juge sur écran.
- **Le SQL de migration en entier, idempotent, dans chaque PR qui touche le schéma**, collé dans Supabase **avant** le merge, parce que la prod n'est pas la base du `.env` local, et que le Studio de prod plante sinon.
- **La même fonction de géométrie pour l'aperçu et le rendu**, parce qu'un écart entre les deux montrerait une photo et en enregistrerait une autre.
- **Reprendre les copies pivotées existantes**, parce qu'elles sont déjà en prod depuis le 16/11.
- **Garder la Version 1 égale à l'état actuel** (images validées et titre), parce que les annonces existantes doivent rester publiables sans rien refaire.

## 10. À ne pas faire
- **Ne jamais modifier une photo d'origine**, parce que c'est la seule vraie photo du sac et la base de toutes les versions.
- **Ne jamais effacer les images IA déjà validées**, parce qu'elles sont dans des annonces actives.
- **Ne jamais lancer de reformulation sans clic**, ni en masse, parce que chaque appel coûte et qu'Aramis veut garder la main.
- **Ne jamais toucher la description à tirets**, parce qu'elle décrit l'objet tel qu'il est.
- **Ne pas laisser de chemin vers un modèle d'images**, parce que la génération est supprimée, pas cachée.
- **Aucun lien ni aucune action vers Vinted depuis le Studio**, parce que toute automatisation Vinted fait courir un risque de bannissement.

## 11. Points d'attention
- **Sens du titre** : la reformulation doit garder les faits de l'annonce (marque déclarée par le vendeur, coloris, taille, état). Elle ne doit rien ajouter de faux. À vérifier dans le prompt et dans les tests.
- **Taille des fichiers** : un cadre épais avec un adoucissement fort alourdit le JPEG. Garder le plafond de 4 Mo déjà appliqué par « Pivoter ».
- **Dédoublonnage par empreinte** : chaque copie a l'empreinte de ses propres octets, jamais celle de l'originale, sinon le dépôt écrase l'original (piège trouvé sur « Pivoter »).
- **sharp sur Vercel** : vérifié en build pour « Pivoter », pas encore en exécution réelle au 16/11.
- **Studio marqué « En chantier »** : retirer ce marquage seulement quand Aramis le dit.
- **Test e2e périmé** : `studio-parcours` attend un texte qui n'existe plus depuis la PR #8 ; il est à corriger au passage.

## 12. Tests et vérification
- **Géométrie** : tests unitaires de la fonction partagée (angles 0, ±8, ±45 ; les deux modes ; recadrage 0, 15 et 30 % ; cadre avec et sans adoucissement). Ils vérifient qu'il n'y a aucun coin vide en mode zoom et que l'image entière est visible en mode bords blancs.
- **Rendu** : comparer l'aperçu et le rendu serveur sur une même photo, en reprenant la méthode de « Pivoter ».
- **Original intact** : test d'intégration, octets identiques avant et après un lot.
- **Lot** : 6 photos, une retouche, 6 copies créées. Deux enregistrements identiques ne créent pas de doublon.
- **Versions** : la Version 1 égale l'état actuel, une Version 2 se crée, et Mise en vente publie la version choisie.
- **Reformulation** : l'IA est remplacée par un faux en test. La description à tirets est identique et aucun appel ne part sans action.
- **Suppression** : plus aucune route ni écran de génération. Les images validées existantes sont lues normalement.
- **Commandes** : `tsc --noEmit`, lint, `vitest`, `npm run build` (jamais si un `next dev` tourne) et Playwright sur le compte `demo`, avec les sorties réelles dans chaque PR.

## 13. Découpage en étapes
1. **Maquette** du panneau de retouche, des versions et de « Reformuler ». *Visible : une page HTML validée par Aramis.*
2. **Retouche par lot et Versions** (fusion des anciennes étapes 2 et 3, puisque « Enregistrer » crée directement une version) : pivoter en deux modes, recadrer, cadre ; copies ; Versions avec case SKU, boutons « Copier le titre » et « Copier la description » ; reprise des copies pivotées. *Visible : cocher 6 photos, régler, « Enregistrer en Version 2 », remplir le SKU, copier titre et description.*
3. *(fusionnée dans l'étape 2)*
4. **Reformuler**. *Visible : un nouveau titre et des mots-clés de description légèrement changés pour la Version 2 ; tirets et SKU intacts.*
5. **Mise en vente lit la version choisie**. *Visible : un menu « Version » dans Mise en vente.*
6. **Suppression de la génération d'images**. *Visible : plus de modèles, de prompts ni de dépense dans le Studio ; les anciennes images validées sont toujours là.*

Chaque étape est une PR distincte, vérifiée, mergée sur le go d'Aramis.

## 14. Hypothèses et questions ouvertes
- **Critère des 2 minutes** pour une Version 2 complète : proposé par Claude, pas confirmé par Aramis.
- **Plage des réglages du cadre** (épaisseur maximale, intensité maximale de l'adoucissement) : à fixer sur la maquette.
- **Ordre des étapes 5 et 6** : la suppression pourrait passer plus tôt si Aramis veut retirer la génération tout de suite.
- **Questions de la maquette du 16/11, pas encore tranchées** (réponses proposées par Claude) :
  - « Reformuler » sur la Version 1 ? Proposé : seulement à partir de la Version 2, pour ne pas changer une annonce en ligne.
  - La version choisie dans Mise en vente remplace-t-elle aussi le texte généré ? Proposé : oui, l'IA de Mise en vente ne génère que si la version n'a pas de texte.
  - Bilan et Réglages du Studio, supprimés à l'étape 6 ? Proposé : oui.
- **Cadre** : valeurs proposées sur la maquette, épaisseur de 0 à 15 % (défaut 4 %), bord adouci de 0 à 100 % (défaut 35 %).
