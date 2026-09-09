// extension-vinted/web-ext-config.mjs
//
// Lu automatiquement par `web-ext lint`, `web-ext build` et `web-ext sign`
// quand ils sont lancés depuis ce dossier — donc par les deux commandes du
// README, sans rien changer à leur ligne d'appel.
//
// Les fichiers de test n'ont rien à faire dans une extension signée : ils ne
// sont jamais chargés par le manifest, ils alourdissent le paquet distribué,
// et `interception.test.js` déclenchait un avertissement `DANGEROUS_EVAL` pour
// son `new Function(…)` — la seule façon de charger un content script
// CLASSIQUE depuis un test ESM. Cet avertissement portait sur du code qui ne
// s'exécute jamais dans le navigateur.
export default {
  ignoreFiles: ["*.test.js", "web-ext-config.mjs", "web-ext-artifacts"],
};
