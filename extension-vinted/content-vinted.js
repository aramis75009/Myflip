// extension-vinted/content-vinted.js
//
// Injecté sur https://www.vinted.fr/items/new*. Chargé APRÈS formulaire.js,
// dont il utilise les primitives (même portée, scripts classiques).
//
// Contrat avec background.js :
//   "vinted:qui-suis-je" → { entry } ou { entry: null }
//   "vinted:resultat"    → { entryId, statut }
//
// Les statuts, et ce qu'ils engagent côté worker :
//   "succes-verifie"      la réponse de l'API a été LUE et le prix concorde.
//                         Le worker consomme l'entrée et ferme l'onglet sur ce
//                         seul signal, sans attendre la redirection.
//   "succes"              le remplissage est allé au bout, mais la réponse
//                         n'a pas pu être lue. Repli sur l'ancienne détection
//                         par changement d'URL (tabs.onUpdated → /member/).
//   "prix-non-enregistre" le brouillon EXISTE chez Vinted, avec un prix qui
//                         n'est pas celui demandé. C'est le bug du 08/09.
//   "echec-api"           Vinted a refusé la requête : rien n'a été créé.
//   "succes-partiel"      un champ n'a pas pris ; rien n'a été sauvegardé.
//   "echec-selecteurs"    un sélecteur manque ; rien n'a été sauvegardé.
//
// Le délai anti-ban n'est PLUS attendu ici : l'onglet n'est créé par le
// worker qu'une fois l'heure venue. Ce script n'a donc plus de compte à
// rebours — quand il s'exécute, c'est qu'il est l'heure.

/**
 * Exécuté dans le contexte de la PAGE (via injecterVisibilite), pas dans le
 * monde isolé du content script — ne référencer ni `browser`, ni aucune
 * variable englobante : le corps de cette fonction est stringifié et rejoué
 * dans un autre monde JS. Même contrainte, et même motif, que
 * `patchHistoriquePage()` dans content-myflip.js.
 */
function forcerVisibilitePage() {
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
  try {
    document.hasFocus = function () {
      return true;
    };
  } catch (e) {
    // Même raison que `mentir()` : un navigateur qui refuse ne doit pas
    // emporter le reste du script avec lui.
  }

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
    // Ne bloquer QUE ce qui vise la fenêtre ou le document. `blur` ne
    // bouillonne pas, mais il CAPTURE : sans ce test, un stopImmediatePropagation
    // posé ici empêcherait tout écouteur `blur` d'ÉLÉMENT de la page de se
    // déclencher — y compris celui dont dépend le commit du champ prix si
    // Vinted tourne en React 16, où onBlur dérive de `blur` et non de
    // `focusout`. On casserait alors précisément ce qu'on répare.
    const bloquer = (e) => {
      if (e.target === window || e.target === document) e.stopImmediatePropagation();
    };
    document.addEventListener(evenement, bloquer, true);
    window.addEventListener(evenement, bloquer, true);
  }

  // Troisième garde-fou anti-endormissement, après le mensonge de visibilité
  // et le worker de minuterie : un oscillateur Web Audio à gain nul. Un
  // onglet qui « joue » quelque chose est beaucoup moins susceptible d'être
  // suspendu par le navigateur.
  //
  // ⚠️ Son efficacité N'EST PAS ÉTABLIE ici, et il faut s'attendre à ce qu'il
  // ne serve à rien : la politique d'autoplay laisse un AudioContext créé
  // sans geste utilisateur à l'état « suspended », et un contexte suspendu ne
  // compte pas comme une lecture. D'où le marqueur ci-dessous plutôt qu'une
  // affirmation : l'état réel est journalisé au premier passage, et tranchera.
  try {
    const FabriqueAudio = window.AudioContext || window.webkitAudioContext;
    if (FabriqueAudio) {
      const contexte = new FabriqueAudio();
      const oscillateur = contexte.createOscillator();
      const gain = contexte.createGain();
      gain.gain.value = 0; // strictement inaudible, jamais « très faible »
      oscillateur.connect(gain);
      gain.connect(contexte.destination);
      oscillateur.start();
      const noter = () => {
        document.documentElement.dataset.myflipOscillateur = contexte.state;
      };
      noter();
      Promise.resolve(contexte.resume?.()).then(noter, noter);
    }
  } catch (e) {
    // Web Audio indisponible ou refusé : les deux autres gardes suffisent.
  }

  // Marqueur relu depuis le monde isolé : un attribut DOM traverse la
  // frontière d'isolation, contrairement aux objets JS.
  document.documentElement.dataset.myflipVisible = "1";
}

// L'interception réseau EN PREMIER, avant même le mensonge de visibilité :
// c'est elle qui doit précéder le moindre script de Vinted, sans quoi la page
// aurait déjà capturé sa référence à `XMLHttpRequest` et le brouillon
// repartirait dans l'angle mort. (`installerInterception()` vit dans
// interception.js, chargé avant ce fichier par le manifest.)
installerInterception();

/**
 * Injecte le mensonge de visibilité dans le monde de la PAGE, de façon
 * SYNCHRONE.
 *
 * `textContent` et non `src` : une balise `src` se charge de façon
 * asynchrone, et rien ne garantirait alors qu'elle ait tourné avant le premier
 * geste sur le formulaire. Un script inline s'exécute à l'insertion. C'est le
 * motif déjà en place et documenté dans content-myflip.js.
 */
(function injecterVisibilite() {
  try {
    const script = document.createElement("script");
    script.textContent = `(${forcerVisibilitePage.toString()})();`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    if (document.documentElement.dataset.myflipVisible !== "1") {
      console.warn(
        "[myflip-vinted] script inline rejeté (CSP de Vinted ?) : l'onglet reste « caché » pour la page, le prix peut repartir à 0,00 €",
      );
    }
  } catch (err) {
    console.warn("[myflip-vinted] injection du mensonge de visibilité impossible", err);
  }
})();

const ORDRE_ATTENDU_MS = 10_000;

// Combien de temps attendre la réponse de Vinted après le clic « Sauvegarder
// le brouillon ». Large : la requête part sur un formulaire qui vient de
// téléverser des photos, et l'expiration ne coûte qu'un repli sur l'ancienne
// détection par URL — jamais un échec.
const REPONSE_BROUILLON_MS = 30_000;

// Dernière étape annoncée au badge. C'est la seule chose qui dise QUEL champ a
// lâché : sur un échec elle part dans la bannière, qui sans elle serait
// générique au point de n'aider personne.
let derniereEtape = "";

async function init() {
  let reponse;
  try {
    reponse = await browser.runtime.sendMessage({ type: "vinted:qui-suis-je" });
  } catch (err) {
    // Worker injoignable : aucune certitude qu'un article soit assigné à cet
    // onglet. État neutre plutôt qu'une bannière sur une page qui n'a
    // peut-être aucun rapport avec MyFlip.
    console.error("[myflip-vinted]", err);
    return;
  }

  const entry = reponse?.entry;
  if (!entry) return; // onglet Vinted ouvert à la main : ne rien afficher, jamais

  const badge = creerBadge(entry);
  const statut = await remplir(entry, badge);

  // ⚠️ Le message AVANT l'affichage, et l'ordre n'est pas cosmétique.
  //
  // Un brouillon enregistré redirige la page vers `/member/<id>`, ce qui tue
  // ce content script. Le message est la seule chose qui ait un effet HORS de
  // cet onglet : c'est lui qui arrête la file quand le prix n'est pas passé.
  // Le perdre au profit d'une bannière que la navigation va emporter de toute
  // façon serait le mauvais arbitrage — et sur un prix divergent, la chaîne
  // repartirait comme si de rien n'était.
  await browser.runtime
    .sendMessage({ type: "vinted:resultat", entryId: entry.entryId, statut })
    .catch((err) => console.error("[myflip-vinted]", err));

  // Le badge ne disparaît QUE sur un succès. Sur un échec il porte l'étape en
  // cours — la seule information de diagnostic qui existe — et l'effacer à
  // l'instant précis où elle devient utile était le pire moment possible.
  if (estSucces(statut)) {
    masquerBadge(badge);
    return;
  }

  afficherBanniere(texteBanniere(statut, entry));
}

/** Les deux statuts qui veulent dire « l'article est passé ». `succes-verifie`
 *  est le seul des deux qui le PROUVE : voir verifierBrouillonEnregistre(). */
function estSucces(statut) {
  return statut === "succes" || statut === "succes-verifie";
}

// `run_at: "document_start"` est là pour l'injection de visibilité, qui doit
// précéder React. Le remplissage, lui, n'a aucune raison de démarrer avant que
// le HTML soit parsé : ses délais d'attente partiraient plus tôt et
// expireraient sur un formulaire simplement pas encore monté.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

/**
 * Remplit le formulaire dans l'ORDRE IMPOSÉ par Vinted : marque, état,
 * couleur, matériau, unisexe et colis n'existent pas dans le DOM tant qu'une
 * catégorie feuille n'a pas été validée (audit 2026-09-07 §3).
 *
 * Ne lève jamais. Renvoie :
 *   "echec-selecteurs"    — un sélecteur manque, rien n'a été sauvegardé
 *   "succes-partiel"      — un champ n'a pas pris, le prix est vide, ou les
 *                           photos manquent
 *   "echec-api"           — Vinted a refusé la requête, rien n'a été créé
 *   "prix-non-enregistre" — le brouillon existe, mais pas avec le bon prix
 *   "succes"              — tout est rempli, le brouillon a été demandé, mais
 *                           la réponse de l'API n'a pas pu être lue
 *   "succes-verifie"      — idem, et la réponse CONFIRME le prix enregistré
 *
 * ⚠️ Le clic « Sauvegarder le brouillon » n'a lieu QUE dans le dernier cas.
 * Un brouillon à moitié rempli sauvegardé automatiquement est pire qu'un
 * onglet laissé ouvert : il faut aller le rechercher dans Vinted pour le
 * corriger, sans savoir ce qui manque.
 */
async function remplir(entry, badge) {
  try {
    const v = entry.vinted;
    // Sans identifiants Vinted, rien à faire ici : la fiche n'a pas de mapping
    // marque + catégorie. Le statut reste `echec-selecteurs` (contrat de
    // messages inchangé), mais la bannière, elle, dit la vraie raison — cf.
    // texteBanniere().
    if (!v) {
      console.warn(
        `[myflip-vinted] ${entry.entryId} : aucun mapping Vinted (marque + catégorie non gérées), remplissage abandonné`,
      );
      return "echec-selecteurs";
    }

    direAuBadge(badge, "catégorie…");
    if (!(await choisirCategorie(v.rechercheCategorie, v.categoryId, v.filAriane))) {
      return "echec-selecteurs";
    }

    // La marque n'apparaît qu'après la validation de la catégorie : son
    // arrivée est le signal que le reste du formulaire est monté.
    const marqueVisible = await attendreElement(
      '[data-testid="brand-select-dropdown-input"]',
      ORDRE_ATTENDU_MS,
    );
    if (!marqueVisible) {
      console.warn(
        '[myflip-vinted] le champ marque ([data-testid="brand-select-dropdown-input"]) n\'est jamais apparu après la validation de la catégorie',
      );
      return "echec-selecteurs";
    }

    direAuBadge(badge, "marque…");
    if (!(await ouvrirPanneau("brand-select-dropdown-input"))) return "echec-selecteurs";
    if (!(await choisirOption(`brand-radio-${v.brandId}`))) return "succes-partiel";
    if (!(await validerPanneau())) return "succes-partiel";

    direAuBadge(badge, "état…");
    if (!(await ouvrirPanneau("category-condition-single-list-input"))) return "succes-partiel";
    if (!(await choisirOption(`condition-radio-${v.conditionId}`))) return "succes-partiel";
    if (!(await validerPanneau())) return "succes-partiel";

    direAuBadge(badge, "couleur…");
    if (!(await ouvrirPanneau("color-select-dropdown-input"))) return "succes-partiel";
    // Jamais plus que la limite : au-delà, Vinted évince silencieusement la
    // plus ancienne sélection au lieu de refuser le clic (FIFO).
    for (const id of v.colorIds.slice(0, 2)) {
      if (!(await choisirOption(`color-checkbox-${id}`))) return "succes-partiel";
    }
    if (!(await validerPanneau())) return "succes-partiel";

    if (v.materialIds.length > 0) {
      direAuBadge(badge, "matériau…");
      if (!(await ouvrirPanneau("category-material-multi-list-input"))) return "succes-partiel";
      for (const id of v.materialIds.slice(0, 3)) {
        if (!(await choisirOption(`material-checkbox-${id}`))) return "succes-partiel";
      }
      if (!(await validerPanneau())) return "succes-partiel";
    }

    if (v.unisex) {
      direAuBadge(badge, "unisexe…");
      if (!(await cocher("#unisex"))) return "succes-partiel";
    }

    // `input[name=…]` et non `#package_type_selector_N` : le relevé donne ce
    // nom à la fois comme `data-testid`, comme `id` et comme `name`, et les
    // variantes `--input` / `--text` laissent penser que le testid nu porte
    // un conteneur. `cocher()` a besoin du vrai `input`, il lit `.checked`.
    direAuBadge(badge, "format du colis…");
    if (!(await cocher(`input[name="package_type_selector_${v.packageType}"]`))) {
      return "succes-partiel";
    }

    direAuBadge(badge, "titre…");
    const champTitre = document.querySelector('[data-testid="title--input"]');
    if (!champTitre) {
      console.warn('[myflip-vinted] champ titre introuvable ([data-testid="title--input"])');
      return "succes-partiel";
    }
    if (!(await taperTexte(champTitre, entry.titre))) return "succes-partiel";

    direAuBadge(badge, "description…");
    const champDescription = document.querySelector('[data-testid="description--input"]');
    if (!champDescription) {
      console.warn(
        '[myflip-vinted] champ description introuvable ([data-testid="description--input"])',
      );
      return "succes-partiel";
    }
    if (!(await taperTexte(champDescription, entry.description))) return "succes-partiel";

    // Le prix EN DERNIER, et par `taperPrix()` : ce champ valide au DÉPART du
    // focus, pas à la frappe, et c'est ce qui l'avait fait partir à 0,00 €.
    direAuBadge(badge, "prix…");

    // ⚠️ Sans prix, on s'arrête AVANT toute frappe. `taperTexte(champ, "")`
    // boucle sur zéro caractère et laisse le champ vide : Vinted enregistrerait
    // alors un brouillon à 0,00 €, l'entrée serait consommée et l'onglet fermé.
    // C'est exactement la panne que ce chantier existe pour empêcher — et elle
    // est invisible une fois l'onglet fermé, puisque rien à l'écran ne la
    // signale. Cause la plus probable : le prompt sélectionné pour cet
    // article ne porte pas de `prixReference`.
    const prixDemande = String(entry.prix ?? "");
    if (prixDemande.trim() === "") {
      console.warn(
        "[myflip-vinted] prix vide : aucun brouillon ne sera sauvegardé (il partirait à 0,00 €). Renseigne un prix de référence dans /parametres.",
      );
      return "succes-partiel";
    }

    const champPrix = document.querySelector('[data-testid="price-input--input"]');
    if (!champPrix) {
      console.warn('[myflip-vinted] champ prix introuvable ([data-testid="price-input--input"])');
      return "succes-partiel";
    }
    if (!(await taperPrix(champPrix, prixDemande))) return "succes-partiel";

    direAuBadge(badge, "photos…");
    if (!injecterPhotos(entry.photos)) return "succes-partiel";

    direAuBadge(badge, "brouillon…");
    // Relevé AVANT le clic : seules les réponses postérieures à cet instant
    // seront regardées. La fenêtre couvre aussi la pause d'attente interne de
    // `cliquerBrouillon()`, ce qui est sans importance — ce qu'il s'agit
    // d'écarter, ce sont les requêtes du CHARGEMENT du formulaire, à des
    // dizaines de secondes en arrière.
    const avantClic = Date.now();
    if (!(await cliquerBrouillon())) return "succes-partiel";

    direAuBadge(badge, "vérification…");
    return await verifierBrouillonEnregistre(prixDemande, avantClic);
  } catch (err) {
    console.error("[myflip-vinted] remplissage en échec", err);
    return "echec-selecteurs";
  }
}

/**
 * Lit ce que Vinted a RÉELLEMENT enregistré, au lieu de le déduire.
 *
 * C'est le manque le plus coûteux que l'audit du 09/09 relevait face au Troc
 * Futé : eux attendent la réponse de l'API, MyFlip devinait le succès à un
 * changement d'URL. Le brouillon à `0,00 €` du 08/09 — champ affichant
 * « 15,00 € », base enregistrant zéro — aurait été vu au premier essai.
 *
 * ⚠️ Règle de prudence, valable pour chacune des sorties ci-dessous : une
 * réponse ABSENTE ou ILLISIBLE ne vaut PAS un échec. Elle vaut « je ne sais
 * pas », et on retombe alors sur `"succes"`, c'est-à-dire sur l'ancienne
 * détection par changement d'URL, qui reste en place dans background.js.
 * Inverser ce défaut arrêterait la file sur des brouillons parfaitement
 * enregistrés le jour où Vinted changerait la forme de sa réponse.
 */
async function verifierBrouillonEnregistre(prixDemande, depuisMs) {
  const paquet = await attendreReponseVinted(
    "/api/v2/item_upload/drafts",
    "POST",
    REPONSE_BROUILLON_MS,
    depuisMs,
  );

  if (!paquet) {
    console.warn(
      "[myflip-vinted] aucune réponse de POST /api/v2/item_upload/drafts interceptée : " +
        "le succès retombe sur le changement d'URL, et le prix enregistré n'a PAS été vérifié. " +
        "Cause probable : la CSP de Vinted a rejeté le script d'interception, ou le formulaire a changé de transport.",
    );
    return "succes";
  }

  if (paquet.statut >= 400) {
    console.error(
      `[myflip-vinted] Vinted a REFUSÉ le brouillon (HTTP ${paquet.statut}) — rien n'a été enregistré`,
      String(paquet.corps ?? "").slice(0, 500),
    );
    return "echec-api";
  }

  const article = analyserReponseBrouillon(paquet.corps);
  if (!article) {
    console.warn(
      "[myflip-vinted] réponse du brouillon illisible : le prix n'a pas pu être vérifié",
      String(paquet.corps ?? "").slice(0, 300),
    );
    return "succes";
  }

  console.info(
    `[myflip-vinted] brouillon ${article.id} enregistré — prix demandé « ${prixDemande} », ` +
      `prix enregistré ${article.prix}, titre « ${article.titre} »`,
  );

  const verdict = verdictPrix(prixDemande, article.prix);

  if (verdict === "divergent") {
    // Le cas historique, enfin détectable : le champ affichait « 15,00 € » et
    // le brouillon partait à zéro.
    console.error(
      `[myflip-vinted] PRIX NON ENREGISTRÉ : « ${prixDemande} » demandé, ${article.prix} enregistré ` +
        `sur le brouillon ${article.id}. Le brouillon existe chez Vinted et doit être corrigé à la main.`,
    );
    return "prix-non-enregistre";
  }

  if (verdict === "inconnu") {
    console.warn(
      "[myflip-vinted] prix illisible dans la réponse : brouillon accepté, prix non vérifié",
    );
    return "succes";
  }

  return "succes-verifie";
}

// ---------------------------------------------------------------------------
// Badge (Shadow DOM) et bannières
// ---------------------------------------------------------------------------

/**
 * Badge construit noeud par noeud, PAS via innerHTML : `web-ext lint` remonte
 * UNSAFE_VAR_ASSIGNMENT sur toute affectation d'innerHTML dynamique, et
 * `textContent` rend inutile toute fonction d'échappement maison.
 *
 * ⚠️ Enveloppée comme `direAuBadge` et `masquerBadge`. Si `attachShadow` (ou
 * n'importe quoi d'autre ici) levait, l'exception remonterait dans `init()`
 * AVANT `remplir()` : aucun `vinted:resultat` ne partirait, l'entrée resterait
 * « en-cours » côté worker, et toute la file se bloquerait — pour un élément
 * décoratif. Renvoie `null` en cas de panne ; les trois fonctions du badge
 * tolèrent un badge nul, donc le remplissage continue sans lui.
 */
function creerBadge(entry) {
  try {
    return construireBadge(entry);
  } catch (err) {
    console.warn("[myflip-vinted] badge non affiché, le remplissage continue quand même", err);
    return null;
  }
}

function construireBadge(entry) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .badge { display:flex; align-items:center; gap:8px; background:#fff;
      border:1px solid #ddd; border-radius:12px; padding:8px 12px;
      font: 13px system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
    .repere { width:8px; height:8px; border-radius:50%; background:#0f5132; flex-shrink:0; }
    .titre { max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .etape { color:#666; font-variant-numeric:tabular-nums; }
  `;

  const badge = document.createElement("div");
  badge.className = "badge";

  const repere = document.createElement("span");
  repere.className = "repere";
  badge.appendChild(repere);

  const titre = document.createElement("span");
  titre.className = "titre";
  titre.textContent = String(entry.titre || "").slice(0, 40);
  badge.appendChild(titre);

  const etape = document.createElement("span");
  etape.className = "etape";
  etape.textContent = "…";
  badge.appendChild(etape);

  shadow.append(style, badge);
  document.documentElement.appendChild(host);
  return { host, shadow };
}

/** Le badge est un pur confort : une panne d'affichage ne doit jamais
 *  interrompre le remplissage, qui est le vrai travail. */
function direAuBadge(badge, texte) {
  // Mémorisé AVANT l'affichage, et hors du try : la bannière doit pouvoir
  // nommer l'étape même quand le badge n'a jamais pu être construit.
  derniereEtape = texte;
  try {
    const el = badge?.shadow.querySelector(".etape");
    if (el) el.textContent = texte;
  } catch {
    // best-effort
  }
}

function masquerBadge(badge) {
  try {
    badge?.host.remove();
  } catch {
    // best-effort
  }
}

/**
 * Le texte affiché à l'utilisateur sur un échec.
 *
 * ⚠️ Une fiche sans `vinted` n'est PAS une extension périmée : c'est un
 * article que le mapping marque + catégorie ne couvre pas (le bouton unitaire
 * « Publier sur Vinted » reste utilisable sur n'importe quelle fiche). Lui
 * afficher « l'extension a besoin d'une mise à jour » enverrait chercher la
 * panne exactement là où elle n'est pas. Le statut renvoyé au worker, lui, ne
 * change pas : c'est toujours `echec-selecteurs`.
 */
function texteBanniere(statut, entry) {
  if (statut === "echec-selecteurs" && !entry?.vinted) {
    return (
      "Cet article n'est pas géré automatiquement (aucune correspondance marque + catégorie connue) — " +
      "remplis-le à la main. La chaîne est arrêtée."
    );
  }
  // Ces deux-là sont d'une nature différente de tous les autres : le
  // formulaire a été rempli jusqu'au bout et la requête est PARTIE. Dire
  // « rien n'a été sauvegardé » y serait faux, et enverrait chercher la panne
  // dans le remplissage alors qu'elle est dans ce que Vinted a retenu.
  if (statut === "prix-non-enregistre") {
    return (
      "Le brouillon a été créé chez Vinted, mais SANS LE PRIX — va le corriger à la main " +
      "dans tes brouillons Vinted. La chaîne est arrêtée."
    );
  }
  if (statut === "echec-api") {
    return (
      "Vinted a refusé d'enregistrer ce brouillon — rien n'a été créé. Le détail est dans la " +
      "console de cet onglet. La chaîne est arrêtée."
    );
  }

  const etape = derniereEtape ? ` Dernière étape atteinte : ${derniereEtape}` : "";
  if (statut === "echec-selecteurs") {
    return (
      "L'extension a besoin d'une mise à jour — termine cette annonce à la main. La chaîne est arrêtée." +
      etape
    );
  }
  return (
    "Remplissage incomplet — rien n'a été sauvegardé. Termine à la main. La chaîne est arrêtée." + etape
  );
}

function afficherBanniere(texte) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fef3c7;color:#78350f;padding:10px;text-align:center;font:14px system-ui,sans-serif;";
  host.textContent = texte;
  document.documentElement.appendChild(host);
}
