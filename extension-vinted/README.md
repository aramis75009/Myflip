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
