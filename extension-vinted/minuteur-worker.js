// extension-vinted/minuteur-worker.js
//
// Un worker ne fait qu'une chose ici : rendre la main après un délai, sans
// être soumis au bridage des minuteurs que le navigateur impose aux onglets
// d'arrière-plan (au minimum une seconde, et davantage avec le temps).
//
// L'extension ouvre l'onglet Vinted caché : sans ce détour, les pauses de 25
// à 70 ms de la frappe deviennent des secondes, et remplir une description
// prendrait des minutes.

self.onmessage = (e) => {
  const { id, delai } = e.data || {};
  setTimeout(() => self.postMessage({ id }), delai);
};
