# Contrat API Studio (lot données, 22/10/2026)

## Contrat pour l'agent d'interface

Les montants sont en USD sauf suffixe `Eur`. `taux` = euros pour 1 $.

### Fonctions de `lib/studioModeles.ts` (isomorphe)
- **Budget :** `BudgetCompte = { budgetParSacEur, tauxEurParUsd }`, `BUDGET_PAR_DEFAUT` (1 et 0,86), `BUDGET_PAR_SAC_EUR_DEFAUT`, `TAUX_EUR_PAR_USD_DEFAUT`, `PRISES_PAR_SAC` (15).
- **Conversion :** `usdEnEur(usd|null, taux)` et `eurEnUsd(eur|null, taux)` rendent `null` si l'entrée est inutilisable.
- **Comparaison :** `comparerAuBudget(eur|null, budgetEur)` rend `"dans" | "hors" | "inconnu"`. « Hors » veut dire strictement au-dessus.
- **Coût d'un sac :** `coutSac(modele, budget?, { nbPrises?, nbPhotosParPrise? })` rend `{ modele, nbPrises, raison, usdParImage, eurParImage, usd, eur, statutBudget }`. Un tarif au jeton ou inconnu donne `null` partout et `statutBudget: "inconnu"`, jamais zéro et jamais « dans le budget ».
- **Devis multi-modèles :** `devisDuLancement({ modeles, nbCases, nbPhotos?=1, avecImageRatee?, budget? })`.
  - Il rend `DevisMultiModeles = DevisBudget & { parModele: LigneModeleDevis[]; images }`.
  - `LigneModeleDevis` = `{ modele, nom, images, raison, usdParImage, eurParImage, usd, eur }`.
  - Pour 2 ou 3 modèles sur une seule prise, c'est `nbCases: 1`.
  - C'est le même calcul que le serveur : mêmes entrées, même devis.
- **`DevisBudget`** = l'ancien `Devis` (`lignes, totalConnuUsd, inconnus, confirmationRequise`) plus :
  - `budgetEur`, `tauxEurParUsd`, `totalConnuEur`, `depasseBudget` ;
  - `raisonConfirmation: "budget" | "prix_inconnu" | "budget_et_prix_inconnu" | null` ;
  - `montantConfirmationEur`, arrondi au centime supérieur, à mettre sur le bouton « Confirmer 1,34 € » ;
  - `montantMinimum`, vrai si un prix est inconnu : le vrai total est supérieur au montant affiché.
- **Règle de confirmation :** total connu en € strictement supérieur au budget, OU au moins un prix inconnu. Un budget ou un taux illisible redemande toujours confirmation.
- **Divers :**
  - `devisLancement(estimations, budget?)` : le budget par défaut s'applique s'il est omis.
  - `entreesEnvoyees` et `placesPourPhotos` : la règle de troncature, partagée avec le serveur.
  - `formatEur(eur|null)` donne « 1,34 € », « 0,05 € », « 0,016 € » ou « inconnu ».
  - `lireBudgetSaisi(body)`.

### Autres modules purs
- `lib/studioAgregats.ts` : `agregatsParModele(essais, echecs)` rend `AgregatModele[]` avec ces champs :
  - `modele`, `images`, `premiersCoupsDecides`, `premiersCoupsValides` ;
  - `tauxPremierCoup` (0 à 1, `null` si rien n'est décidé), `coutMoyenReelUsd`, `coutsConnus`, `coutIncomplet` ;
  - `dureeMoyenneMs`, `echecs`, `derniereUtilisation` (ISO).
  
  Un « premier coup » est un essai qui n'est pas une correction (sans `essaiParentId`) et sur lequel Aramis a décidé. L'avis IA n'entre pas dans le calcul, et le modèle « manuel » est exclu.
- `lib/studioDecision.ts` : `verifierChangementDecision`, `peutAnnulerDecision`, `peutValiderEssai`.
- `lib/studioHistorique.ts` : `construireHistorique`.

### Routes

**`POST /api/studio/generations`**
- Le corps est inchangé, et le client n'envoie jamais le budget. **`modeles` est limité à 3** (c'était 6) : au-delà, 400.
- 409 : `{ error: "Ce lancement est estimé à 1,29 € (budget par sac : 1,00 €) : confirmation requise.", code: "confirmation_requise", devis: DevisMultiModeles }`.
- 200 : `{ essai: { id, numero, modele, coutEstimeUsd, coutReelUsd, dureeMs }, referencesEnvoyees, referencesTronquees }`.
- `lancementId` est recopié sur chaque essai et chaque échec du lancement. Un essai d'un autre modèle du même lancement ne verrouille plus la case (corrige une course sur la comparaison).

**`GET /api/studio/reglages`**
- Réponse : `{ promptMaitre, modifieLe, budgetParSacEur, tauxEurParUsd, angles }`.

**`PUT /api/studio/reglages`**
- Corps : `{ promptMaitre?, budgetParSacEur?, tauxEurParUsd? }`. Au moins un champ ; un champ absent reste inchangé.
- Bornes : budget de 0,01 à 1000 € (arrondi au centime), taux de 0,5 à 2 (4 décimales).
- Réponse 200 : `{ ok, modifieLe, budgetParSacEur, tauxEurParUsd }`.
- Réponse 400 : `{ error, code: "corps_invalide" }`, sans rien écrire.

**`GET /api/studio/modeles`**
- Réponse : `{ modeles, favoris, agregats: AgregatModele[], budget: BudgetCompte, etat, fetchedAt }`.
- Un modèle jamais utilisé n'a pas d'agrégat : afficher « jamais essayé », pas 0 %.

**`GET /api/studio/historique?cle=&referenceId=&angleId=`**
- Réponse : `{ cle, referenceId, angleId, tentatives }`, de la plus ancienne à la plus récente. À inverser côté écran pour avoir la plus récente en tête.
- Un essai porte :
  - `kind: "essai"`, `id`, `creeLe`, `modele`, `numero`, `source` ;
  - `lancementId`, `essaiParentId`, `skuCible` ;
  - `image` (`/api/studio/image?essai=…`, `null` si purgée), `purgee` ;
  - `cout: { usd, nature: "reel" | "estime" | "inconnu" }`, `coutReelUsd`, `coutEstimeUsd`, `dureeMs` ;
  - `verdictIA: { verdict, scoreGlobal } | null` ;
  - `decision` (`null` = à juger) ;
  - `peutAnnuler` et `peutValider`, chacun `{ possible: true }` ou `{ possible: false, code, message }`.
- Un échec porte : `kind: "echec"`, `id`, `creeLe`, `modele`, `lancementId`, `code`, `message`, `cout`, `coutReelUsd`, `dureeMs`.
- Erreurs : 400 si un paramètre manque, 404 si un élément n'est pas du compte.
- Seuls les échecs qui ont un `referenceId` apparaissent dans l'historique d'une case.

**`PATCH /api/studio/essais/[id]`**
- Corps : `{ decision: "valide" | "rejete" | null }`, `null` annule.
- 200 : `{ ok, decision, inchange }`.
- 409 : `{ error, code, autresEssaiIds }` avec :
  - `image_purgee` : rejet dont l'image a été effacée, impossible à rattraper ;
  - `case_reprise` : une autre image tient la case, il faut la rejeter d'abord ;
  - `deja_validee` : une case ne porte qu'une image validée ;
  - `conflit` : l'essai a changé entre la lecture et l'écriture (sans `autresEssaiIds`).

**`chargerFiche`** (côté serveur)
- Ajoute `budget: { budgetParSacEur, tauxEurParUsd }`.
- Chaque essai gagne `dureeMs` et `lancementId`.

### À retirer côté interface
Fait le 22/10 (lot « Studio, modèles ») : `SEUIL_CONFIRMATION_USD` et l'ancien sélecteur sont supprimés, le sélecteur réécrit lit `agregats` et `budget`, le 409 ouvre la confirmation avec son devis. La question 3 ci-dessous est faite aussi : `POST /essais/[id]/verifier` range `{ erreur: { code, message } }` dans `verifIA`, sans écraser un avis lisible.

## Questions
1. **« Retenir cette version » de façon atomique ?** Non fait. Le front enchaîne deux appels explicites : rejeter l'autre image, puis valider celle-ci. Un endpoint atomique rejetterait d'office l'image écartée, ce qui fausserait le taux de réussite d'un modèle perdant une comparaison. Mon conseil : garder deux appels, à moins que tu acceptes qu'un choix compte comme rejet.
2. **Budget par sac cumulé ?** Non fait. Le PRD ne compare que l'estimation du lancement au budget, pas ce qui a déjà été dépensé sur le sac. Mon conseil : laisser ainsi, et ajouter plus tard un « déjà dépensé sur ce sac » côté écran.
3. **Avis IA en échec (histoire 23, SU-16) :** `POST /essais/[id]/verifier` n'enregistre rien en cas d'échec, donc le front ne peut pas distinguer « échec » de « pas encore demandé » après rechargement. Il suffirait d'écrire `{ erreur: { code, message } }` dans `verifIA` (Json, sans migration). Mon conseil : à faire au prochain lot.
4. **Migration en prod :** non appliquée, en attente de ton OK. Quand tu le donnes : `npx prisma migrate deploy` avec le `DATABASE_URL` de prod, en vérifiant d'abord que l'endpoint est `ep-curly-haze` et en contrôlant `information_schema` comme pour la dev. Mon conseil : à lancer avant le merge sur `main`.
5. **`CLAUDE.md` du projet :** la section Studio parle encore du « seuil de 0,10 $ », du `StudioReglages` à une colonne et de « sept tables ». Je n'y ai pas touché pour éviter un conflit avec l'agent d'interface. Mon conseil : la corriger à la passe documentation finale.
6. **e2e :** seul le test de confirmation en tarif inconnu est inchangé. Un lancement à une image sur « E2E: Modèle cher » ne déclenche plus de confirmation avec le budget de 1 €. Mon conseil : que le seed e2e crée `StudioReglages` avec un petit `budgetParSacEur` pour tester la confirmation « au-dessus du budget ».

Fichiers modifiés : `tsconfig.json`, `app/studio/**`, `components/**` et `lib/toast.ts` appartiennent à d'autres chantiers. Je ne les ai pas commités, ni les doublons iCloud « … 2.* ».