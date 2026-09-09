# Extension Vinted — build & installation

Pas de build : les fichiers sources sont directement signés et packagés.

1. Compte développeur Mozilla gratuit sur https://addons.mozilla.org/developers/
2. `npx web-ext sign --api-key=<clé> --api-secret=<secret> --channel=unlisted`
   (lancé depuis ce dossier `extension-vinted/`)
3. Récupérer le `.xpi` signé produit dans `web-ext-artifacts/`
4. Firefox → Modules complémentaires et thèmes → roue crantée → « Installer
   un module depuis un fichier » → sélectionner le `.xpi`

À refaire à chaque changement de code (pas de mise à jour automatique tant
que l'extension n'est pas distribuée via l'AMO public).

**Firefox 140 minimum.** Exigé par `data_collection_permissions`, que Mozilla
réclame désormais pour toute nouvelle extension.

## Vérifier avant de signer

```bash
npx web-ext lint --self-hosted
```

Attendu : **0 erreur, 2 avertissements**. Une erreur fait échouer la signature.

Les deux avertissements restants sont voulus, ne pas chercher à les faire
disparaître :

- `BACKGROUND_SERVICE_WORKER_IGNORED` — le manifest déclare `background.scripts`
  (la forme Firefox, celle qui est réellement utilisée) **et**
  `background.service_worker` (la forme Chrome). Firefox ignore la seconde et
  le dit. Elle est là pour qu'un futur portage Chrome ne demande pas de
  retoucher le manifest. La supprimer ferait taire l'avertissement et fermerait
  cette porte.
  ⚠️ Ne jamais laisser `service_worker` **seul** : c'est l'état dans lequel
  l'extension a vécu jusqu'au 03/09/2026, et Firefox ne chargeait alors aucun
  script d'arrière-plan — panne totale et silencieuse.
- `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` —
  `data_collection_permissions` demande Firefox Android 142. L'extension ne
  cible pas Android, et remonter le plancher desktop à 142 pour une plateforme
  hors scope n'aurait pas de sens.

## Choix de conception à connaître avant de toucher au code

**Les photos ne circulent pas en `Blob`.** Elles traversent deux frontières
avant d'atteindre l'onglet Vinted :

```
page MyFlip ──[CustomEvent.detail]──▶ content script ──[sendMessage]──▶ worker
                 Xray Firefox                          sérialisation
```

`content-myflip.js` convertit chaque photo en `{ type, buffer }` dès la
réception, parce que `ArrayBuffer` traverse le messaging **et** IndexedDB sans
réserve. `injecterPhotos()` (`formulaire.js`) reconstruit le `Blob` au moment
de s'en servir. Si la conversion échoue, rien n'est mis en file et l'erreur
part en console : mieux vaut un onglet Vinted neutre qu'une entrée aux photos
creuses qui ferait croire au succès.

**Les champs se remplissent par le setter natif du prototype**, pas par
`el.value = …` (voir `ecrireValeur()` dans `formulaire.js`). Vinted est en
React : une affectation directe passe sous le value tracker, React ignore
l'événement `input` et remet sa valeur au premier re-render. Le symptôme est
traître — le champ a l'air rempli, `remplir()` renvoie `"succes"`,
l'entrée est consommée, et le formulaire réel est resté vide.

**Le badge se construit noeud par noeud**, pas en `innerHTML` : `web-ext lint`
remonte `UNSAFE_VAR_ASSIGNMENT` sur toute interpolation dynamique, et
`textContent` rend inutile toute fonction d'échappement maison.

## Ce que fait l'extension

1. Dans `/mise-en-vente`, étape 4, « Tout mettre en brouillon sur Vinted » (ou
   « Publier sur Vinted » sur une seule fiche).
2. Un pop-up demande le délai à laisser entre deux annonces : un délai fixe, ou
   une fourchette aléatoire, en minutes entières. Le dernier réglage est
   reproposé au lancement suivant.
3. MyFlip enregistre chaque article en statut *Brouillon*, puis met l'annonce en
   file dans l'extension. **Aucun onglet ne s'ouvre à ce moment-là.**
4. L'extension traite **un article à la fois**. Le premier part tout de suite ;
   pour chacun des suivants, elle attend un délai tiré dans la fourchette du
   lot, ouvre un onglet Vinted, remplit tout le formulaire, puis clique
   « Sauvegarder le brouillon ».
5. L'onglet se ferme tout seul quand le brouillon est enregistré, et l'article
   suivant démarre son propre délai.

L'extension ne clique **jamais** « Ajouter » : rien n'est publié.

## Au premier passage, vérifie le prix

Ouvre le brouillon créé dans Vinted et regarde le prix. **C'est le seul point
que rien d'automatique ne peut prouver.**

Lors du relevé du 08/09/2026, un brouillon a été enregistré avec `0,00 €` alors
que le champ affichait « 15,00 € ». Le diagnostic complet est dans
`docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md` ; en résumé, quatre
causes, toutes corrigées le 09/09 :

1. **Le mauvais événement.** Depuis React 17, `onBlur` est émulé depuis
   `focusout`, écouté à la racine de l'application ; `blur` ne remonte pas
   l'arbre et n'y arrive donc jamais. Le champ prix valide au DÉPART du focus —
   sans ce signal, il gardait l'affichage et le formulaire partait à zéro. Le
   titre survivait parce qu'il valide à la frappe.
2. **Le séparateur décimal.** Le champ est en locale française : il veut
   « 24,5 », pas « 24.5 ». La conversion se fait côté MyFlip, dans
   `prixPourVinted()` — le seul maillon de la chaîne du prix qui soit testé.
3. **Le focus n'était pas réellement déplacé.** Un vrai clic sur le conteneur
   encadre désormais l'écriture.
4. **L'onglet est caché.** Un onglet d'arrière-plan répond « je ne suis pas
   visible » et voit ses minuteurs bridés à la seconde. `forcerVisibilitePage()`
   (dans `content-vinted.js`, injectée dans le monde de la page) lui fait
   répondre l'inverse ; `minuteur-worker.js` sort les pauses du bridage.

**La frappe caractère par caractère n'était pas la solution** et ne s'applique
plus au prix : sa valeur est posée en une fois. Le titre et la description, eux,
continuent d'être frappés lettre à lettre.

## Si la chaîne s'arrête

C'est voulu. Un échec de remplissage suspend tout le reste de la file :
l'onglet en cours reste ouvert avec une bannière, rien n'a été sauvegardé, et
les articles suivants ne partent pas. La cause d'un échec est presque toujours
commune à tous (Vinted a changé son DOM) — enchaîner ne ferait qu'aggraver.

Pour repartir : ferme l'onglet, corrige, et relance depuis `/mise-en-vente`.

## Le délai voyage avec le lot

Il n'y a plus rien à régler avant de lancer, et plus rien à visiter : le délai
se choisit dans le pop-up, au moment où il sert, et **chaque entrée de la file
porte le sien**. Deux lots lancés avec des réglages différents s'enchaînent donc
correctement, au lieu que le second impose le sien au premier.

Jusqu'au 08/09/2026, la fourchette était un réglage de compte que ce content
script allait lire dans le DOM de `/compte`. Si `/compte` n'avait jamais été
visité, rien ne partait et rien ne le disait — c'est ce mode de panne muet que
le pop-up supprime.

Une entrée qui arriverait sans délai exploitable (mise en file par une version
antérieure de l'extension) retombe sur 2 à 5 minutes, jamais sur zéro.
