# Studio IA — banc de test de génération d'angles (option A, semi-manuel)

| | |
|---|---|
| **Date** | 2026-10-17 |
| **Statut** | Spec validée par Aramis le 17/10 — prochaine étape : plan d'implémentation |
| **Périmètre** | MyFlip (le Studio + conservation des vraies photos de mise en vente) + une route en lecture seule dans SacBase. Test de faisabilité sur ~10 coloris. |
| **Origine** | Test manuel du 17/10 dans Gemini (Nano Banana Pro) : 6 angles générés à partir de vraies photos, jugés fidèles (swoosh, lettrage ELITE, patch, motif). |

## 1. Objectif

Mesurer, sur une dizaine de coloris, si Nano Banana Pro reproduit **fidèlement et
régulièrement** un sac à partir de vraies photos de référence, sous d'autres angles :
combien d'essais par angle, quels détails dérivent, quels angles échouent.

**Ce n'est pas une fonctionnalité de mise en vente.** Aucune image générée ne doit
pouvoir rejoindre une annonce, l'export ou l'extension Vinted (voir §7).

## 2. Contraintes

- **Génération dans l'application Gemini, avec l'abonnement d'Aramis.** Pas de clé
  API, pas d'OpenRouter pour l'image. MyFlip prépare, Aramis génère, MyFlip range et
  vérifie.
- **Pas de robot dans l'application Gemini** (fragile, contraire aux conditions de Google).
- L'option B (clé API Gemini directe, bouton « Tester ce coloris ») doit pouvoir se
  brancher plus tard **sans changer le modèle de données** : une génération a une
  `source` (`manuel` aujourd'hui, `api` demain).
- Desktop uniquement (la génération se fait sur l'ordinateur).

## 3. Parcours

1. **Choisir un coloris.** Page `/studio` : liste des coloris présents dans le stock
   Hipobuy (dérivés des SKU, §4). Badge par coloris : références posées, angles testés,
   score moyen.
2. **Références = la bibliothèque de vraies photos du coloris.** Deux entrées :
   - **automatique** : toute photo réelle chargée dans `/mise-en-vente` pour un sac Hipobuy
     est conservée (Vercel Blob) et rattachée au coloris de ce sac (via SacBase, §4) ;
   - **manuelle** : glisser des photos directement sur la fiche coloris du Studio — y compris
     **en lot** (plusieurs fichiers d'un coup, HEIC accepté et converti) pour importer les
     photos déjà prises sur le téléphone. Le SKU est facultatif dans ce cas.
   Chaque photo reçoit un rôle (`face`, `dos`, `cote`, `detail`, `ouvert`) — suggéré par
   l'ordre de chargement, corrigeable. Un coloris photographié une fois reste disponible
   pour de nouvelles générations à tout moment.
3. **Préparer un angle.** Pour chaque modèle d'angle (§5), la fiche affiche :
   le **prompt compilé** (bouton *Copier*), la ou les **photos de référence à joindre**
   (bouton *Télécharger les références*), le format conseillé (**3:4**) et le modèle
   (**Pro**, pas Flash).
4. **Générer dans Gemini** (manuel), télécharger le résultat.
5. **Déposer le résultat** dans la case de l'angle (glisser-déposer, plusieurs essais
   possibles par angle). MyFlip enregistre l'essai n° N.
6. **Vérification automatique** (§6) : note par détail + verdict.
7. **Décider** : *Valider*, *Rejeter*, ou *Corriger un détail* — MyFlip compose alors le
   prompt de correction ciblée (« Keep everything identical, but fix … ») à recoller
   dans la même conversation Gemini.
8. **Tableau de bord du test** : taux de réussite au 1er essai par angle et par coloris,
   nombre moyen d'essais, détails qui dérivent le plus.

## 4. Coloris — source : SacBase

Les SKU MyFlip sont des identifiants d'**unité** (`SDN1`, `SDN2`…). Le coloris de chaque
sac (`5039 Black Pink`) n'est connu que de **SacBase** (`site_data.json` →
`commandes[].sacs[]`, aplati en `FlatBag { sku, model, colorTxt, img, statut, sold }`
dans `lib/v3/metrics.ts`). MyFlip va donc le chercher là.

**Périmètre : tous les coloris connus de SacBase.** Le Studio liste chaque coloris du
catalogue avec, pour repère :
- le nombre de sacs **chez Aramis** (`!sold` et `statut ∈ { "En stock", "Photos prêtes" }`) ;
- un badge **doublon** si ce nombre ≥ 2 (filtre pratique pour démarrer le test : le sac est
  là, on peut le photographier sous l'angle demandé et comparer à une vraie photo) ;
- le nombre de **vraies photos** déjà en bibliothèque.
Un coloris sans aucune référence est affiché grisé (« à photographier »).

**Côté SacBase — nouvelle route** `GET /api/studio/coloris` (lecture seule) :
- Auth : `Authorization: Bearer <SACSBASE_STUDIO_TOKEN>` (nouvelle variable SacBase,
  distincte du jeton MyFlip existant). Jeton absent/faux → 401. Hors session navigateur
  (comme l'API SacBase de MyFlip dans l'autre sens).
- Réponse :
  ```json
  { "genere": "2026-10-17T21:30:00Z",
    "coloris": [
      { "cle": "5039-black-pink", "modele": "5039", "coloris": "Black Pink",
        "image": "img/5039_black_pink.jpg",
        "sacs": [ { "sku": "SDN3", "statut": "En stock", "vendu": false },
                  { "sku": "SDN1", "statut": "Vendu",    "vendu": true } ],
        "chezMoi": 1 } ] }
  ```
  `cle` = `modele + "-" + coloris` en minuscules, espaces → tirets (fonction pure, testée).
  `image` = vignette catalogue SacBase, affichée seulement comme repère dans la liste —
  **jamais utilisée comme référence de génération** (les références sont les vraies photos
  d'Aramis, §3 étape 2).
- Logique pure dans `lib/v3/studio.ts` (regroupement par coloris, calcul de `chezMoi`), testée sur fixtures.
- Tous les sacs (vendus compris) : c'est ce qui permet de rattacher à son coloris une photo
  prise pour un sac aujourd'hui vendu.

**Côté MyFlip** — `lib/sacbaseStudio.server.ts` :
- Variables : `SACBASE_URL`, `SACBASE_STUDIO_TOKEN`.
- Même comportement que `lib/myflip.server.ts` côté SacBase : délai 4 s, cache 60 s,
  dernière bonne réponse si SacBase ne répond pas, jamais de jeton dans les logs.
- `StudioColoris` est créé à la première référence reçue ou à la première ouverture (clé =
  `cle` SacBase). La table `sku → cle` est relue à chaque fois, pas stockée.
- **Rattachement d'une photo de mise en vente** : au chargement dans `/mise-en-vente`, MyFlip
  envoie l'image au Blob avec le SKU ; le coloris est résolu via SacBase. SacBase injoignable
  ou SKU inconnu → la photo est gardée « non rattachée » et rattachée au prochain passage.

## 5. Modèles d'angle

Même principe que `PromptTemplate` : modèles éditables dans le Studio.

- `nom` (« Dos ¾ haut gauche »), `roleReference` (quelle photo joindre),
  `angle` (texte injecté dans `[ANGLE]`), `ordre`.
- **Bloc commun** éditable, avec variables : `{angle}`, `{details}` (liste des détails
  à préserver, saisie par coloris), `{scene}`.
- Amorçage avec les prompts testés le 17/10 (face, dos, bretelles, boucle, profil,
  patch, sac ouvert).
- Les **détails à préserver** sont saisis par coloris (ex. « patch ELITE côté gauche,
  swoosh blanc cassé, motif camouflage bordeaux ») : ils servent au prompt ET à la grille
  de vérification.

## 6. Vérification automatique

- Modèle de vision **texte** déjà branché (OpenRouter, `MODELE_PAR_DEFAUT`) : une
  analyse coûte une fraction de centime — ce n'est pas de la génération d'image.
- Entrée : photo(s) de référence + image générée + liste des détails du coloris.
- Sortie JSON stricte : pour chaque détail `{ detail, statut: "fidele"|"derive"|"absent", note }`,
  plus `{ angleRespecte: bool, scoreGlobal: 0-100, verdict: "ok"|"a_corriger"|"rejet" }`.
- Le verdict IA est une **aide** : la décision finale (Valider / Rejeter) reste à Aramis
  et c'est elle qui alimente les statistiques.

## 7. Cloisonnement (exigence non négociable)

- **Sens unique** : les vraies photos de `/mise-en-vente` peuvent **entrer** dans le Studio
  (bibliothèque de références) ; rien ne **sort** du Studio vers la mise en vente.
- Les images générées vivent dans des **tables dédiées** (§8), jamais sur `Article`.
- `/mise-en-vente`, `ExportAnnonces`, `_publierVinted`, l'API Hermes, l'API SacBase et
  l'extension **ne lisent pas** ces tables. Un test vérifie qu'aucun de ces modules
  n'importe `lib/studio*`.
- Pas de bouton « utiliser dans une annonce », pas d'export groupé des images générées.
- Bandeau permanent sur `/studio` : « Banc de test — images générées, hors mise en vente ».

## 8. Données

```prisma
model StudioColoris {
  id        String   @id @default(cuid())
  userId    String
  cle       String   // clé coloris fournie par SacBase (§4)
  modele    String
  coloris   String
  details   String   @db.Text   // détails à préserver, un par ligne
  references StudioReference[]
  essais     StudioEssai[]
  createdAt DateTime @default(now())
  @@unique([userId, cle])
}

model StudioReference {     // vraie photo uniquement
  id         String  @id @default(cuid())
  userId     String
  colorisId  String?          // null = pas encore rattachée (SacBase injoignable / SKU inconnu)
  sku        String?          // sac photographié, si connu
  origine    String           // mise_en_vente | studio
  role       String           // face | dos | cote | detail | ouvert
  urlImage   String
  createdAt  DateTime @default(now())
}

model StudioAngle {        // modèle d'angle éditable
  id             String @id @default(cuid())
  userId         String
  nom            String
  roleReference  String
  angle          String @db.Text
  ordre          Int
}

model StudioEssai {
  id          String   @id @default(cuid())
  colorisId   String
  angleId     String
  numero      Int              // 1er, 2e essai…
  source      String @default("manuel")   // manuel | api (option B)
  promptUtilise String @db.Text
  urlImage    String
  verifIA     Json?            // sortie §6
  decision    String?          // valide | rejete | null
  createdAt   DateTime @default(now())
}
```
(relations `userId` / `onDelete: Cascade` comme le reste du schéma)

**Stockage des fichiers** : MyFlip ne stocke aucune image aujourd'hui (les photos de mise
en vente ne vivent que dans le navigateur). **Vercel Blob** (décidé), privé, deux préfixes
distincts : `references/<userId>/…` (vraies photos) et `generees/<userId>/…` (Studio).
Compression côté client avant envoi (JPEG ~1600 px) ; HEIC converti avant envoi.
Conservation : illimitée pour les références, purge manuelle pour les essais rejetés.

⚠️ Migration : écrire la migration à la main (cf. `photosPretes`, `geminiKey` : refuser
tout `DROP` proposé par `prisma db push`) et la déployer **avant** le code.

## 9. Écrans

- `/studio` — grille de tous les coloris fournis par SacBase, filtre « doublons chez moi » (vignette catalogue, nombre de
  sacs chez Aramis, badges d'avancement). Bandeau « SacBase injoignable » si la synchro tombe.
- `/studio/[cle]` — fiche coloris : zone références, détails à préserver, puis une
  **ligne par angle** : prompt (Copier), références (Télécharger), cases d'essais
  (glisser-déposer), comparaison référence ↔ essai côte à côte, verdict IA, boutons de
  décision.
- `/studio/bilan` — statistiques du test (§3 étape 8).
- Entrée dans la sidebar, section secondaire, libellé « Studio (test) ».

## 10. Hors périmètre

- Génération automatique (option B) — plus tard, même modèle de données.
- Toute utilisation des images générées hors du Studio.
- Mobile.

## 11. Critères de réussite du test

- ~10 coloris × 5 angles traités (en commençant par les doublons chez Aramis).
- Mesures disponibles : taux de validation au 1er essai, essais moyens par angle, top 3
  des détails qui dérivent.
- Aucun chemin de code reliant `StudioEssai` à une annonce (test automatisé).

## 12. Décisions et questions

**Décidé (Aramis, 17/10)** : stockage Vercel Blob ; coloris et SKU lus dans SacBase ;
toutes les vraies photos de mise en vente sont conservées comme références par coloris ;
le test démarre sur les doublons présents chez Aramis ; **seuls les sacs Hipobuy**
(`whereSacbase`) sont concernés — les polos et lots relèvent de l'ancienne activité en
liquidation, leurs photos ne sont ni conservées ni envoyées au Blob.

Photos existantes sur le téléphone : importées à la main, en lot, depuis la fiche coloris.

**Ouvert** : rien — spec prête pour le plan d'implémentation.
