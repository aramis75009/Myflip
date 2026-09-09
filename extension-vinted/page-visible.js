// extension-vinted/page-visible.js
//
// Tourne dans le monde de la PAGE (injecté par content-vinted.js via
// web_accessible_resources), pas dans le monde isolé du content script.
//
// Pourquoi : l'extension ouvre l'onglet Vinted en ARRIÈRE-PLAN, pour ne pas
// voler l'écran. Un onglet caché répond `document.hidden === true`,
// `visibilityState === "hidden"`, `hasFocus() === false` — et un formulaire
// qui valide au départ du focus peut alors ne jamais considérer qu'il l'a eu.
// C'est l'une des quatre causes retenues pour le brouillon à `0,00 €`
// (docs/audits/2026-09-09-champ-prix-vinted-diagnostic.md, fait n° 4).
//
// Ce script ne touche à AUCUNE donnée et n'envoie rien nulle part : il répond
// « visible » aux questions que la page se pose sur elle-même.

(function () {
  "use strict";

  const mentir = (objet, propriete, valeur) => {
    try {
      Object.defineProperty(objet, propriete, {
        get: () => valeur,
        configurable: true,
      });
    } catch (e) {
      // Une propriété non configurable, ou un navigateur qui refuse : on
      // n'insiste pas. Le remplissage marchera peut-être quand même, et une
      // exception ici casserait tout le reste du script.
    }
  };

  mentir(document, "hidden", false);
  mentir(document, "visibilityState", "visible");
  document.hasFocus = function () {
    return true;
  };

  // Les gestionnaires posés en propriété (`document.onvisibilitychange = …`)
  // ne passent pas par addEventListener : les neutraliser séparément.
  for (const prop of ["onvisibilitychange", "onblur"]) {
    for (const cible of [document, window]) {
      try {
        Object.defineProperty(cible, prop, {
          get: () => null,
          set: () => {},
          configurable: true,
        });
      } catch (e) {
        // idem
      }
    }
  }

  // Et ceux posés par addEventListener : interceptés en phase de CAPTURE,
  // donc avant d'atteindre leur cible.
  for (const evenement of ["visibilitychange", "blur", "pagehide"]) {
    const bloquer = (e) => e.stopImmediatePropagation();
    document.addEventListener(evenement, bloquer, true);
    window.addEventListener(evenement, bloquer, true);
  }
})();
