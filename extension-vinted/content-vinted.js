// extension-vinted/content-vinted.js
//
// Injecté sur https://www.vinted.fr/items/new*. Chargé APRÈS formulaire.js,
// dont il utilise les primitives (même portée, scripts classiques).
//
// Contrat avec background.js :
//   "vinted:qui-suis-je" → { entry } ou { entry: null }
//   "vinted:resultat"    → { entryId, statut }
//
// Le délai anti-ban n'est PLUS attendu ici : l'onglet n'est créé par le
// worker qu'une fois l'heure venue. Ce script n'a donc plus de compte à
// rebours — quand il s'exécute, c'est qu'il est l'heure.

// Injecté dans le monde de la PAGE, le plus tôt possible : ce script répond
// « visible » aux questions que Vinted se pose sur l'onglet, qui est ouvert
// en arrière-plan. Depuis le monde isolé, redéfinir `document.hidden`
// n'aurait aucun effet sur le React de Vinted — cf. l'en-tête du fichier.
(function injecterVisibilite() {
  try {
    const script = document.createElement("script");
    script.src = browser.runtime.getURL("page-visible.js");
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  } catch (err) {
    console.warn("[myflip-vinted] injection de page-visible.js impossible", err);
  }
})();

const ORDRE_ATTENDU_MS = 10_000;

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

  // Le badge ne disparaît QUE sur un succès. Sur un échec il porte l'étape en
  // cours — la seule information de diagnostic qui existe — et l'effacer à
  // l'instant précis où elle devient utile était le pire moment possible.
  if (statut === "succes") masquerBadge(badge);

  if (statut !== "succes") {
    afficherBanniere(texteBanniere(statut, entry));
  }

  await browser.runtime
    .sendMessage({ type: "vinted:resultat", entryId: entry.entryId, statut })
    .catch((err) => console.error("[myflip-vinted]", err));
}

init();

/**
 * Remplit le formulaire dans l'ORDRE IMPOSÉ par Vinted : marque, état,
 * couleur, matériau, unisexe et colis n'existent pas dans le DOM tant qu'une
 * catégorie feuille n'a pas été validée (audit 2026-09-07 §3).
 *
 * Ne lève jamais. Renvoie :
 *   "echec-selecteurs" — un sélecteur manque, rien n'a été sauvegardé
 *   "succes-partiel"   — un champ n'a pas pris, le prix est vide, ou les
 *                        photos manquent
 *   "succes"           — tout est rempli et le brouillon a été demandé
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
    if (!(await cliquerBrouillon())) return "succes-partiel";
    return "succes";
  } catch (err) {
    console.error("[myflip-vinted] remplissage en échec", err);
    return "echec-selecteurs";
  }
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
