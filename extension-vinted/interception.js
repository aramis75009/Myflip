// extension-vinted/interception.js
//
// Lire ce que Vinted a RÉELLEMENT enregistré, au lieu de le deviner.
//
// Jusqu'au 09/09/2026, le succès d'un article se déduisait d'un changement
// d'URL (`tabs.onUpdated` vers `/member/`, dans background.js). C'est un
// signal binaire : « quelque chose a été sauvegardé ». Il ne dit rien du
// CONTENU — et c'est très exactement pour ça que le brouillon à `0,00 €` du
// 08/09 a coûté un mois et deux chantiers avant d'être vu. Une extension qui
// lit la réponse de l'API l'aurait signalé au premier essai.
//
// Ce fichier installe cette lecture. Il est chargé EN PREMIER par le manifest,
// avant formulaire.js et content-vinted.js.
//
// ⚠️ AUCUN code ne s'exécute au chargement : ce fichier ne fait que DÉCLARER
// des fonctions, et c'est délibéré. C'est ce qui le rend évaluable hors
// navigateur, donc testable (interception.test.js évalue ce fichier tel quel
// dans Node, sans DOM). `installerInterception()` est appelée explicitement
// par content-vinted.js.
//
// Faits établis, à ne pas re-supposer :
//   - `POST /api/v2/item_upload/drafts` est la requête qui crée le brouillon,
//     et la page redirige vers `/member/<id>` juste après
//     (audit 2026-09-08 §6).
//   - Sa réponse porte le prix sous la forme `price: { amount: "0.0" }` —
//     c'est ce relevé, et lui seul, qui a montré le prix à zéro.

/** Les requêtes qui nous intéressent. `items` est la publication réelle :
 *  l'extension ne la déclenche jamais, mais si elle partait un jour par
 *  accident, mieux vaut le VOIR que l'ignorer. */
const CIBLES_INTERCEPTION = ["/api/v2/item_upload/drafts", "/api/v2/item_upload/items"];

const EVENEMENT_REPONSE = "myflip:reponse-vinted";

// ---------------------------------------------------------------------------
// Fonctions pures — testées dans interception.test.js
// ---------------------------------------------------------------------------

/**
 * Ramène un prix, quelle que soit la forme sous laquelle Vinted l'a écrit, à
 * un nombre — ou à `null` si rien d'exploitable ne s'y trouve.
 *
 * Les trois formes vues ou plausibles : `{ amount: "0.0" }` (celle du relevé
 * du 08/09), une chaîne `"15,00 €"` telle que le champ la reformate, et un
 * nombre nu.
 *
 * ⚠️ `null` veut dire « je n'ai pas su lire », JAMAIS « le prix vaut zéro ».
 * Les appelants doivent distinguer les deux : confondre l'ignorance avec le
 * zéro ferait échouer des articles parfaitement enregistrés.
 */
function normaliserPrix(valeur) {
  if (valeur === null || valeur === undefined) return null;
  if (typeof valeur === "number") return Number.isFinite(valeur) ? valeur : null;
  if (typeof valeur === "object") return normaliserPrix(valeur.amount);
  // Le champ français rend « 15,00 € » : la virgule est le séparateur
  // décimal, et le symbole comme les espaces (y compris l'insécable étroit
  // U+202F que Vinted utilise) n'ont rien à faire dans un Number.
  const texte = String(valeur).trim().replace(",", ".").replace(/[^\d.]/g, "");
  if (texte === "") return null;
  const nombre = Number(texte);
  return Number.isFinite(nombre) ? nombre : null;
}

/**
 * Extrait de la réponse JSON ce qui permet de dire si l'article est bien
 * enregistré : son identifiant, son prix, son titre.
 *
 * Volontairement TOLÉRANT sur l'emballage (`{item:…}`, `{draft:…}`, ou
 * l'objet à plat) : la forme exacte de la réponse du POST n'a jamais été
 * relevée, seulement celle de la relecture `GET /wardrobe/…`. Chercher à
 * plusieurs endroits coûte trois lignes ; se tromper d'emballage ferait
 * conclure « prix illisible » sur un brouillon correct.
 *
 * Renvoie `null` si le corps n'est pas du JSON d'objet — pas une exception :
 * une réponse inattendue ne doit jamais casser un remplissage réussi.
 */
function analyserReponseBrouillon(corps) {
  let json;
  try {
    json = JSON.parse(corps);
  } catch {
    return null;
  }
  // `Array.isArray` n'est pas du zèle : un tableau est un objet, et sans ce
  // test une réponse `[…]` produirait un article de champs tous nuls — donc
  // un « prix illisible » sur une réponse qui n'était pas un article du tout.
  const estArticle = (o) => Boolean(o) && typeof o === "object" && !Array.isArray(o);
  if (!estArticle(json)) return null;

  const emballages = [json.item, json.draft, json].filter(estArticle);
  const article = emballages[0];
  if (!article) return null;

  return {
    id: article.id ?? null,
    prix: normaliserPrix(article.price),
    titre: typeof article.title === "string" ? article.title : null,
  };
}

/**
 * Le prix enregistré est-il celui qu'on a demandé ?
 *
 * `demande` arrive en format français (« 24,5 »), `enregistre` en nombre.
 * La tolérance est d'un demi-centime : le champ reformate, Vinted arrondit,
 * et une comparaison stricte de flottants ferait échouer 24,5 contre
 * 24.499999999999996.
 *
 * ⚠️ Renvoie `"inconnu"` — et pas `false` — quand l'un des deux prix n'a pas
 * pu être lu. C'est la distinction qui empêche d'arrêter la chaîne sur une
 * réponse dont on n'a simplement pas compris la forme.
 */
function verdictPrix(demande, enregistre) {
  const attendu = normaliserPrix(demande);
  if (attendu === null || enregistre === null) return "inconnu";
  return Math.abs(attendu - enregistre) < 0.005 ? "conforme" : "divergent";
}

/**
 * Une réponse interceptée correspond-elle à ce qu'on attend ?
 *
 * `depuisMs` écarte les réponses ANTÉRIEURES au geste qu'on observe. Sans lui,
 * une requête émise au chargement du formulaire — un enregistrement
 * automatique de brouillon, par exemple — serait servie à la place de celle du
 * clic « Sauvegarder le brouillon » : on vérifierait le prix d'un brouillon
 * vide, on le trouverait illisible, et la vérification s'éteindrait sans que
 * rien ne le signale. Exactement le mode de panne que ce chantier supprime.
 */
function correspondReponse(paquet, fragmentUrl, methode, depuisMs = 0) {
  if (!paquet || typeof paquet.url !== "string") return false;
  if (!paquet.url.includes(fragmentUrl)) return false;
  if (methode && String(paquet.methode).toUpperCase() !== methode.toUpperCase()) return false;
  // Un paquet sans `ts` vient d'une version antérieure du script de page :
  // mieux vaut l'accepter que de perdre la vérification pour un champ absent.
  if (depuisMs && typeof paquet.ts === "number" && paquet.ts < depuisMs) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Le monde de la PAGE
// ---------------------------------------------------------------------------

/**
 * Exécutée dans le contexte de la PAGE, pas dans le monde isolé du content
 * script : ne référencer ni `browser`, ni aucune variable englobante — le
 * corps de cette fonction est stringifié et rejoué dans un autre monde JS.
 * Même contrainte et même motif que `forcerVisibilitePage()`.
 *
 * ⚠️ C'est POURQUOI ce détour existe : le `XMLHttpRequest` du monde isolé
 * n'est pas celui que Vinted utilise. Un patch posé depuis le content script
 * ne verrait jamais passer une seule requête de la page.
 */
function interceptionPage(CIBLES, NOM_EVENEMENT) {
  "use strict";

  // Rejouée à chaque injection ; sans ce garde, deux passages
  // empileraient deux couches de patch et relaieraient tout en double.
  if (window.__myflipInterceptionPosee) return;
  window.__myflipInterceptionPosee = true;

  const interesse = (url, methode) =>
    typeof url === "string" &&
    String(methode).toUpperCase() === "POST" &&
    CIBLES.some((cible) => url.includes(cible));

  /**
   * Repasse la frontière d'isolation. Le `detail` est une CHAÎNE et non un
   * objet : sous la Xray vision de Firefox, un objet créé par la page arrive
   * au content script derrière un wrapper qui demanderait `cloneInto` pour
   * être lu sans surprise. Une chaîne traverse telle quelle, toujours.
   */
  const relayer = (url, methode, statut, corps) => {
    try {
      document.dispatchEvent(
        new CustomEvent(NOM_EVENEMENT, {
          // `ts` sert à ne pas confondre la réponse du clic « Sauvegarder le
          // brouillon » avec une requête plus ancienne portant la même URL.
          detail: JSON.stringify({ url, methode, statut, corps, ts: Date.now() }),
        }),
      );
    } catch (e) {
      // Un corps non sérialisable ou un dispatch refusé ne doit jamais
      // remonter dans le code de Vinted : on perd la mesure, pas la page.
    }
  };

  // --- XMLHttpRequest ------------------------------------------------------
  //
  // C'est le transport que Vinted utilise pour ce formulaire. On enveloppe le
  // CONSTRUCTEUR plutôt que de patcher `prototype.open` : la référence
  // originale reste intacte, et le prototype est réexposé tel quel juste
  // en dessous pour que `instanceof` et les patches tiers continuent de
  // fonctionner.
  const XHROriginal = window.XMLHttpRequest;
  function XHRSurveille() {
    const xhr = new XHROriginal();
    let methode = "";
    let url = "";
    const ouvrirOriginal = xhr.open.bind(xhr);
    xhr.open = function (m, u, ...reste) {
      methode = String(m || "");
      url = String(u || "");
      return ouvrirOriginal(m, u, ...reste);
    };
    xhr.addEventListener("load", function () {
      if (!interesse(url, methode)) return;
      let corps = "";
      try {
        // `responseText` LÈVE si `responseType` vaut autre chose que "" ou
        // "text". Un throw ici partirait dans le gestionnaire de la page.
        corps = xhr.responseText;
      } catch (e) {
        corps = "";
      }
      relayer(url, methode, xhr.status, corps);
    });
    return xhr;
  }
  XHRSurveille.prototype = XHROriginal.prototype;

  // ⚠️ Les constantes d'état vivent AUSSI sur le constructeur, pas seulement
  // sur le prototype. Sans cette recopie, un `xhr.readyState ===
  // XMLHttpRequest.DONE` quelque part dans le code de Vinted comparerait à
  // `undefined` — donc jamais vrai — et c'est SA page qu'on casserait, pas
  // notre remplissage. Le coût d'y penser est cinq lignes ; celui de l'oublier
  // est un site qui ne répond plus, sans rien dans la console qui nous
  // désigne.
  for (const cle of ["UNSENT", "OPENED", "HEADERS_RECEIVED", "LOADING", "DONE"]) {
    try {
      XHRSurveille[cle] = XHROriginal[cle];
    } catch (e) {
      // Une propriété non inscriptible : rien de plus à faire ici.
    }
  }

  window.XMLHttpRequest = XHRSurveille;

  // --- fetch ---------------------------------------------------------------
  //
  // En assurance seulement : le formulaire passe par XHR aujourd'hui. Vinted
  // peut changer de transport sans prévenir, et ce jour-là la vérification du
  // prix s'éteindrait en silence — le mode de panne que tout ce chantier
  // existe pour supprimer.
  const fetchOriginal = window.fetch;
  if (typeof fetchOriginal === "function") {
    window.fetch = function (...args) {
      const promesse = fetchOriginal.apply(this, args);
      try {
        const cible = args[0];
        const url = typeof cible === "string" ? cible : (cible && cible.url) || "";
        const methode = String(
          (args[1] && args[1].method) || (cible && cible.method) || "GET",
        );
        if (interesse(url, methode)) {
          promesse.then((reponse) => {
            // `clone()` avant lecture : consommer le corps original priverait
            // Vinted de sa propre réponse.
            reponse
              .clone()
              .text()
              .then(
                (corps) => relayer(url, methode, reponse.status, corps),
                () => {},
              );
          }, () => {});
        }
      } catch (e) {
        // idem : jamais rien remonter dans le code de la page.
      }
      return promesse;
    };
  }
}

// ---------------------------------------------------------------------------
// Le monde ISOLÉ — tampon et attente
// ---------------------------------------------------------------------------

/**
 * Tout ce qui a été intercepté depuis le chargement de la page.
 *
 * ⚠️ Ce tampon n'est pas du confort, il supprime une COURSE. La réponse de
 * l'API arrive quelques millisecondes après le clic « Sauvegarder le
 * brouillon » ; un écouteur posé seulement APRÈS le clic pourrait la manquer
 * et attendre pour rien jusqu'au bout du délai. On enregistre tout dès
 * `document_start`, et `attendreReponseVinted()` regarde d'abord ici.
 */
const reponsesInterceptees = [];
const attentesReponse = [];

/**
 * Installe l'interception : le pont de réception d'abord, le patch de la page
 * ensuite. Jamais l'inverse — entre les deux, une réponse qui arriverait
 * n'aurait personne pour l'entendre.
 *
 * À appeler à `document_start`, avant que le moindre script de Vinted n'ait
 * capturé sa référence à `XMLHttpRequest`.
 */
function installerInterception() {
  document.addEventListener(EVENEMENT_REPONSE, (e) => {
    let paquet;
    try {
      paquet = JSON.parse(e.detail);
    } catch {
      return; // un detail qui n'est pas notre JSON n'est pas pour nous
    }
    reponsesInterceptees.push(paquet);
    // À rebours : `splice` pendant le parcours ne saute alors aucune entrée.
    for (let i = attentesReponse.length - 1; i >= 0; i--) {
      const attente = attentesReponse[i];
      if (!correspondReponse(paquet, attente.fragment, attente.methode, attente.depuisMs)) {
        continue;
      }
      attentesReponse.splice(i, 1);
      attente.resoudre(paquet);
    }
  });

  try {
    const script = document.createElement("script");
    // `textContent` et non `src` : un script à `src` se charge de façon
    // ASYNCHRONE, et Vinted aurait tout le temps de lancer ses requêtes
    // avant qu'il ne tourne. Un script inline s'exécute à l'insertion.
    // Les constantes sont passées EN ARGUMENTS, sérialisées en JSON. Une
    // fonction stringifiée perd sa portée : sans ce passage, la liste des URL
    // et le nom de l'événement devraient être réécrits en dur dans son corps,
    // et le jour où l'un des deux changerait ici, la copie d'en face
    // continuerait de vivre sa vie — les réponses partiraient sous un nom que
    // plus personne n'écoute, sans la moindre erreur.
    script.textContent = `(${interceptionPage.toString()})(${JSON.stringify(
      CIBLES_INTERCEPTION,
    )}, ${JSON.stringify(EVENEMENT_REPONSE)});`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (err) {
    console.warn(
      "[myflip-vinted] interception réseau non posée : le succès sera déduit de l'URL, et le prix enregistré ne sera pas vérifié",
      err,
    );
  }
}

/**
 * Attend une réponse de Vinted correspondant à `fragmentUrl` + `methode`.
 *
 * `depuisMs` (epoch) borne la recherche aux réponses arrivées APRÈS cet
 * instant, tampon compris : c'est ce qui empêche de servir une requête émise
 * au chargement de la page à la place de celle qu'on attend.
 *
 * Renvoie le paquet `{ url, methode, statut, corps, ts }`, ou `null` au bout du
 * délai — jamais d'exception, et jamais de rejet : comme `attendreElement()`,
 * c'est à l'appelant de décider ce que vaut une absence de réponse. Ici, elle
 * ne vaut PAS un échec : elle vaut « je ne sais pas », et le repli sur la
 * détection par URL reste en place.
 *
 * `setTimeout` et non le worker de `formulaire.js` : cette échéance se compte
 * en dizaines de secondes, et le bridage des onglets d'arrière-plan (une
 * seconde de granularité) n'a aucune importance à cette échelle. Le worker
 * existe pour les pauses de 25 ms de la frappe, pas pour ça.
 */
function attendreReponseVinted(fragmentUrl, methode, timeoutMs = 30_000, depuisMs = 0) {
  const deja = reponsesInterceptees.find((p) =>
    correspondReponse(p, fragmentUrl, methode, depuisMs),
  );
  if (deja) return Promise.resolve(deja);

  return new Promise((resolve) => {
    const attente = { fragment: fragmentUrl, methode, depuisMs, resoudre: null };
    const minuteur = setTimeout(() => {
      const i = attentesReponse.indexOf(attente);
      if (i !== -1) attentesReponse.splice(i, 1);
      resolve(null);
    }, timeoutMs);
    attente.resoudre = (paquet) => {
      clearTimeout(minuteur);
      resolve(paquet);
    };
    attentesReponse.push(attente);
  });
}
