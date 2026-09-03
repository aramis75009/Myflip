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
réserve. `content-vinted.js` reconstruit le `Blob` au moment de s'en servir
(`versBlob()`). Si la conversion échoue, rien n'est mis en file et l'erreur
part en console : mieux vaut un onglet Vinted neutre qu'une entrée aux photos
creuses qui ferait croire au succès.

**Les champs se remplissent par le setter natif du prototype**, pas par
`el.value = …` (voir `ecrireValeur()` dans `content-vinted.js`). Vinted est en
React : une affectation directe passe sous le value tracker, React ignore
l'événement `input` et remet sa valeur au premier re-render. Le symptôme est
traître — le champ a l'air rempli, `remplirFormulaire()` renvoie `"succes"`,
l'entrée est consommée, et le formulaire réel est resté vide.

**Le badge se construit noeud par noeud**, pas en `innerHTML` : `web-ext lint`
remonte `UNSAFE_VAR_ASSIGNMENT` sur toute interpolation dynamique, et
`textContent` rend inutile toute fonction d'échappement maison.

## Ce qui n'est toujours pas vérifié

Les sélecteurs du formulaire Vinted (`[data-testid="title--input"]`,
`input[name="title"]`, `[data-testid="price-input--input"]`,
`input[type="file"]`) sont des hypothèses : personne n'a inspecté le DOM réel
de `vinted.fr/items/new`. Si aucun champ n'est trouvé, `remplirFormulaire()`
renvoie `"echec-selecteurs"` sans rien toucher et une bannière invite à
continuer à la main — pas de panne silencieuse, mais pas de remplissage non
plus tant que le relevé n'est pas fait.
