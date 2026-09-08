// extension-vinted/content-myflip.js
//
// Content script injecté sur tout le domaine MyFlip (voir manifest.json). Une
// seule responsabilité depuis le 08/09/2026 : sur /mise-en-vente, écouter le
// CustomEvent "myflip:publier-vinted" (émis par
// app/mise-en-vente/_publierVinted.ts) et le transmettre au service worker
// sous forme de message runtime.
//
// Ce qu'il ne fait PLUS : recopier la fourchette de délai anti-ban depuis le
// DOM de /compte vers browser.storage.local. Le délai est désormais choisi
// dans un pop-up au lancement du lot et voyage avec chaque annonce — c'était
// le mécanisme le plus fragile du chantier, et le seul à produire une panne
// muette (/compte jamais visité, la file ne démarrait pas, rien ne le disait).
//
// ⚠️ Le manifest matche TOUT le domaine, et pas seulement /mise-en-vente,
// alors même que /compte n'est plus concerné : MyFlip navigue en SPA
// (next/link), et un content script ne s'injecte qu'à un CHARGEMENT DE PAGE
// RÉEL. Restreindre le match empêcherait l'injection pour qui atterrit sur
// /dashboard après connexion puis clique vers /mise-en-vente — un parcours
// parfaitement normal.
let publicationEcoutee = false; // écouteur "myflip:publier-vinted" posé une seule fois pour toute la vie du script

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

/**
 * Ré-évaluée à CHAQUE navigation détectée, pas seulement à l'injection.
 *
 * MyFlip navigue en SPA (`components/Sidebar.tsx` utilise `next/link`) : un
 * content script s'injecte une fois par CHARGEMENT DE PAGE RÉEL, jamais par
 * changement de route côté client. Quelqu'un qui atterrit sur `/dashboard`
 * après connexion puis clique vers `/mise-en-vente` dans la barre latérale ne
 * provoque donc AUCUNE nouvelle injection. Si `location.pathname` n'était lu
 * qu'une fois au chargement du script, l'écouteur de publication ne
 * s'attacherait jamais dans ce parcours pourtant banal — c'est exactement le
 * bug trouvé en revue lors du chantier de remplissage (09/2026).
 */
function reagirALaRoute() {
  if (location.pathname.startsWith("/mise-en-vente") && !publicationEcoutee) {
    ecouterPublicationVinted();
    publicationEcoutee = true;
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
    const { articleId, titre, description, prix, photos, vinted, delai } = e.detail;

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
      // Reconstruit champ par champ, contrairement à `vinted` qui passe tel
      // quel. Ce n'est pas de la coquetterie : un `delai` qui arriverait
      // abîmé de l'autre côté de la frontière Xray produirait un `cibleMs` à
      // NaN, `NaN > maintenant` vaut `false`, et l'onglet s'ouvrirait
      // IMMÉDIATEMENT — le garde-fou anti-ban annulé sans un mot. Un objet
      // mal formé arrive ici en `null` et déclenche le repli de
      // delaiDeLEntree() (file.js), qui lui est prudent.
      delai:
        delai && typeof delai === "object"
          ? { minMinutes: Number(delai.minMinutes), maxMinutes: Number(delai.maxMinutes) }
          : null,
      photos: photosTransportables,
    });
  });
}

