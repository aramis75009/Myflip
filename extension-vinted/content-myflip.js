// extension-vinted/content-myflip.js
//
// Content script injecté sur tout le domaine MyFlip (voir manifest.json —
// élargi depuis `/mise-en-vente*` pour couvrir aussi `/compte`, cf. ruling
// Task 14). Deux responsabilités indépendantes, chacune activée seulement
// sur la page où elle a un sens :
//
//   1. /mise-en-vente : écoute le CustomEvent "myflip:publier-vinted" (émis
//      par app/mise-en-vente/_publierVinted.ts, Task 8) et le transmet au
//      service worker (Task 13) sous forme de message runtime.
//   2. /compte : copie best-effort des réglages de délai anti-ban
//      (ExtensionVinted.tsx, Task 9) depuis le DOM vers
//      browser.storage.local — seule voie d'accès pour le service worker,
//      qui n'a pas d'API MyFlip dédiée pour les lire (cf. commentaire
//      lireDelaiRegle() dans background.js).
//
// MyFlip navigue en SPA (components/Sidebar.tsx utilise next/link) : un
// content script s'injecte une fois par CHARGEMENT DE PAGE RÉEL, pas par
// changement de route côté client. Un utilisateur qui atterrit sur une page
// non matchée (ex. /dashboard après connexion) puis clique vers
// /mise-en-vente dans la sidebar ne provoque donc PAS une nouvelle
// injection — si on ne lisait `location.pathname` qu'une fois au chargement
// du script, l'écouteur de publication ne s'attacherait jamais dans ce
// parcours pourtant normal (trouvé en revue, fix round 1 de cette tâche).
// `reagirALaRoute()` est donc ré-évaluée à chaque navigation détectée, pas
// seulement à l'injection.
let publicationEcoutee = false; // écouteur "myflip:publier-vinted" posé une seule fois pour toute la vie du script
let compteSyncEnCours = false; // synchroniserDelaiVinted() actif pour la visite COURANTE de /compte
let nettoyerCompteSync = null; // déconnecte les observers de la visite /compte précédente en la quittant

// Marqueur de présence, lu par extensionPresente() dans
// app/mise-en-vente/_publierVinted.ts. Sans lui, la page ne peut pas savoir
// si quelqu'un écoute son CustomEvent, et ouvrirait un onglet Vinted que
// l'extension ouvre déjà — deux onglets par article.
//
// `dataset` sur documentElement traverse la frontière d'isolation : les
// attributs DOM sont partagés entre le monde du content script et celui de
// la page, contrairement aux objets JavaScript (Xray).
document.documentElement.dataset.myflipVinted = "1";

reagirALaRoute();
demarrerDetectionNavigationSpa(reagirALaRoute);

function reagirALaRoute() {
  const chemin = location.pathname;

  if (chemin.startsWith("/mise-en-vente") && !publicationEcoutee) {
    ecouterPublicationVinted();
    publicationEcoutee = true;
  }

  if (chemin.startsWith("/compte")) {
    if (!compteSyncEnCours) {
      compteSyncEnCours = true;
      nettoyerCompteSync = synchroniserDelaiVinted();
    }
  } else if (compteSyncEnCours) {
    // On quitte /compte : les <input> de la visite précédente vont être
    // démontées par React (nouvelle visite = nouveaux noeuds DOM plus tard),
    // donc rien à observer entre-temps. Sans ce nettoyage, un observer
    // encore en attente d'éléments (jamais trouvés) continuerait à réagir à
    // des mutations DOM sans rapport sur la nouvelle page jusqu'à son
    // timeout interne.
    compteSyncEnCours = false;
    nettoyerCompteSync?.();
    nettoyerCompteSync = null;
  }
}

/**
 * Détecte les navigations SPA (next/link, sans rechargement complet) pour
 * que `reagirALaRoute()` soit ré-évaluée à chaque changement de route.
 *
 * `history.pushState`/`replaceState` sont patchés DANS LE CONTEXTE DE LA
 * PAGE (via un <script> injecté), pas depuis ce content script directement.
 * Raison : la "Xray vision" de Firefox fait qu'une réaffectation directe de
 * `history.pushState = ...` depuis un content script crée une propriété
 * expando visible uniquement de ce content script — le vrai
 * `history.pushState` que Next.js appelle resterait l'original, non
 * intercepté (confirmé via la doc Mozilla sur Xray vision / "Sharing
 * objects with page scripts" ; la variante correcte depuis un content
 * script demanderait `window.wrappedJSObject` + `exportFunction`, plus
 * fragile qu'un <script> inline pour ce cas précis). Un <script> injecté
 * s'exécute nativement dans le monde de la page : le patch y est visible
 * par construction, sans API Firefox spécifique. Site sans CSP (vérifié :
 * aucun header Content-Security-Policy dans next.config.mjs, middleware.ts
 * ou vercel.json), donc pas de risque de blocage silencieux de ce script
 * inline par une directive script-src.
 *
 * Le pont retour vers ce content script (isolé du contexte page) est le
 * même mécanisme déjà utilisé et vérifié dans ce fichier pour
 * "myflip:publier-vinted" : un événement DOM sur `window`, qui traverse
 * la frontière d'isolation dans les deux sens.
 */
function demarrerDetectionNavigationSpa(onChange) {
  injecterInterceptionHistorique();
  window.addEventListener("popstate", onChange);
  window.addEventListener("myflip:locationchange", onChange);
}

function injecterInterceptionHistorique() {
  const script = document.createElement("script");
  script.textContent = `(${patchHistoriquePage.toString()})();`;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

/**
 * Exécuté dans le contexte de la PAGE (via injecterInterceptionHistorique),
 * pas celui de ce content script — ne référencer ni `browser`, ni aucune
 * variable du scope englobant : le corps de cette fonction est stringifié
 * et rejoué tel quel dans un autre monde JS.
 */
function patchHistoriquePage() {
  const original = {
    pushState: history.pushState,
    replaceState: history.replaceState,
  };
  history.pushState = function (...args) {
    const r = original.pushState.apply(this, args);
    window.dispatchEvent(new Event("myflip:locationchange"));
    return r;
  };
  history.replaceState = function (...args) {
    const r = original.replaceState.apply(this, args);
    window.dispatchEvent(new Event("myflip:locationchange"));
    return r;
  };
}

/**
 * Capture l'événement de publication émis par la page /mise-en-vente et le
 * transmet au service worker. Forme du message : contrat fixé par le
 * handler "myflip:mise-en-file" dans background.js (Task 13) — entryId,
 * titre, description, prix, photos.
 */
function ecouterPublicationVinted() {
  window.addEventListener("myflip:publier-vinted", async (e) => {
    const { articleId, titre, description, prix, photos, vinted } = e.detail;

    // Les photos ne partent PAS en Blob. Elles traversent deux frontières
    // successives avant d'atteindre l'onglet Vinted :
    //
    //   page MyFlip ──[CustomEvent.detail]──▶ content script ──[sendMessage]──▶ worker
    //                    Xray Firefox                          sérialisation
    //
    // Aucune des deux n'a jamais été vérifiée sur ce projet (le spike qui
    // devait le faire — Task 10 du plan — n'a pas de commit ; un commentaire
    // affirmait ici son résultat sans qu'il existe). Un `Blob` qui survit à
    // l'une peut arriver vide après l'autre, et l'échec serait SILENCIEUX :
    // l'entrée partirait en file avec des photos creuses, et le remplissage
    // renverrait "succes-partiel" sans jamais dire pourquoi.
    //
    // `ArrayBuffer` est structured-cloneable sans réserve partout (messaging
    // ET IndexedDB), donc on convertit ici, au plus près de la source. Le
    // `Blob` est reconstruit à l'arrivée par content-vinted.js.
    let photosTransportables;
    try {
      photosTransportables = await Promise.all(
        (photos ?? []).map(async (blob) => ({
          type: blob.type || "image/jpeg",
          buffer: await blob.arrayBuffer(),
        })),
      );
    } catch (err) {
      // Ce catch est le détecteur de la frontière Xray : si `detail` n'a pas
      // traversé proprement, `blob.arrayBuffer` est absent ou lève ici. On
      // n'envoie RIEN plutôt qu'une entrée à moitié valide — un onglet
      // Vinted sans entrée appariée reste neutre (content-vinted.js), là où
      // une entrée aux photos creuses ferait croire au succès.
      console.error(
        "[myflip-vinted] photos illisibles depuis le content script — rien mis en file",
        err,
      );
      return;
    }

    await browser.runtime.sendMessage({
      type: "myflip:mise-en-file",
      entryId: articleId,
      titre,
      description,
      prix,
      // Identifiants NUMÉRIQUES Vinted, ou undefined si la fiche n'a pas de
      // mapping. Transmis tels quels : aucune traduction de ce côté-ci, où
      // rien n'est testé. `vinted` est un objet de nombres et de chaînes,
      // structured-cloneable sans réserve — contrairement aux Blob, qui ont
      // dû être convertis en ArrayBuffer juste au-dessus.
      vinted,
      photos: photosTransportables,
    });
  });
}

/**
 * Copie best-effort des bornes de délai (ExtensionVinted.tsx) vers
 * browser.storage.local, sous les clés `delaiMin`/`delaiMax` lues par
 * lireDelaiRegle() dans background.js.
 *
 * Pas d'API dédiée pour lire UserSettings.delaiVintedMinMinutes/MaxMinutes
 * depuis l'extension (invariant du design) : seule source disponible, le
 * DOM des deux <input> de /compte (id stables `delai-vinted-min` /
 * `delai-vinted-max`, cf. ExtensionVinted.tsx).
 *
 * Deux signaux d'écriture distincts, car ils couvrent deux moments
 * différents :
 *   - "change" natif sur chaque <input> : édition manuelle, même moment que
 *     l'onBlur qui déclenche la sauvegarde serveur côté ExtensionVinted.tsx.
 *   - transition `disabled` → activé : chargement initial. Les deux champs
 *     sont `disabled` et vides tant que le premier GET de useReglages()
 *     n'a pas résolu (pretAModifier) ; ce flip est piloté par React comme
 *     attribut DOM, pas un événement "change", donc guetté séparément via
 *     un second MutationObserver dédié à l'attribut `disabled`. Sans ce
 *     second signal, visiter /compte sans rien modifier ne copiait jamais
 *     les valeurs déjà enregistrées côté serveur vers le storage de
 *     l'extension — trouvé en revue, fix round 1 de cette tâche.
 *
 * Renvoie une fonction de nettoyage qui déconnecte les observers encore
 * actifs (appelée par reagirALaRoute() en quittant /compte).
 */
function synchroniserDelaiVinted() {
  const TIMEOUT_MS = 20_000;
  const debut = Date.now();
  let attache = false;
  let attrObserver = null;

  const observer = new MutationObserver(essayerAttacher);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  essayerAttacher();

  function essayerAttacher() {
    if (attache) return;
    const champMin = document.getElementById("delai-vinted-min");
    const champMax = document.getElementById("delai-vinted-max");
    if (!(champMin instanceof HTMLInputElement) || !(champMax instanceof HTMLInputElement)) {
      if (Date.now() - debut > TIMEOUT_MS) observer.disconnect();
      return;
    }
    attache = true;
    observer.disconnect(); // plus besoin de guetter l'apparition des champs

    const synchroniser = () => copierDelaiVersStorage(champMin, champMax);
    champMin.addEventListener("change", synchroniser);
    champMax.addEventListener("change", synchroniser);

    if (!champMin.disabled && !champMax.disabled) {
      // Déjà activés (données chargées avant que ce content script ait fini
      // de chercher les champs) : sync immédiate, rien d'autre à observer.
      synchroniser();
      return;
    }
    // Encore désactivés : guetter la transition disabled → activé.
    // "disabled" est un attribut booléen réfléchi par le DOM (contrairement
    // à `value`/`checked`) — que React le pose via la propriété IDL ou via
    // setAttribute, le navigateur reflète toujours l'attribut en conséquence,
    // donc cet observer se déclenche de façon fiable dans les deux cas.
    attrObserver = new MutationObserver(() => {
      if (champMin.disabled || champMax.disabled) return;
      attrObserver.disconnect();
      attrObserver = null;
      synchroniser();
    });
    attrObserver.observe(champMin, { attributes: true, attributeFilter: ["disabled"] });
    attrObserver.observe(champMax, { attributes: true, attributeFilter: ["disabled"] });
  }

  return () => {
    observer.disconnect();
    attrObserver?.disconnect();
  };
}

/** Chaîne de saisie → entier ou `null` (champ vide = borne non réglée). Même
 * règle que versNombre() dans ExtensionVinted.tsx. */
function versNombre(v) {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function copierDelaiVersStorage(champMin, champMax) {
  if (champMin.disabled || champMax.disabled) return;
  const delaiMin = versNombre(champMin.value);
  const delaiMax = versNombre(champMax.value);
  await browser.storage.local.set({ delaiMin, delaiMax });
}
