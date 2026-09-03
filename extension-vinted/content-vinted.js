// extension-vinted/content-vinted.js
//
// Content script injecté sur https://www.vinted.fr/items/new* (manifest.json
// — un vrai chargement de page à chaque fois, pas une SPA : pas besoin de la
// détection de navigation utilisée par content-myflip.js).
//
// Contrat avec le service worker (background.js, Task 13) pour
// "vinted:qui-suis-je" — vérifié en le lisant directement dans background.js,
// PAS déduit du brief (qui mentionne à tort un champ `delaiMs`, absent en
// réalité) :
//   { entry: null }                    → aucun article assigné à cet onglet.
//   { entry, delaiNonRegle: true }     → article assigné, mais aucun délai
//                                         anti-ban réglé dans /compte ;
//                                         entry.cibleMs est absent.
//   { entry }                          → article assigné, délai déjà tiré ;
//                                         entry.cibleMs est un epoch ms
//                                         ABSOLU, déjà calculé et persisté
//                                         par background.js. Ce script le LIT
//                                         seulement — jamais recalculé ici.
// `entry` : { entryId, titre, description, prix, photos, openerTabId, ts,
// tabId, cibleMs }.
//
// `entry.photos` est un tableau de `{ type, buffer }` — PAS de `Blob`. La
// conversion a lieu dans content-myflip.js, au plus près de la page : voir
// le commentaire de `ecouterPublicationVinted()` sur les deux frontières que
// les photos doivent traverser. Ici on reconstruit le `Blob` au moment de
// s'en servir, via `versBlob()`.
//
// Ce script ne définit ni import ni export : comme content-myflip.js, il
// n'est PAS déclaré "type: module" dans manifest.json content_scripts, donc
// chargé comme script classique.

/**
 * Décide quoi faire à partir de la réponse brute de "vinted:qui-suis-je".
 * Fonction pure (aucun DOM), volontairement séparée de init() pour rester
 * testable indépendamment du navigateur.
 */
function interpreterReponseQuiSuisJe(reponse, maintenant) {
  const { entry, delaiNonRegle } = reponse || {};
  if (!entry) return { action: "neutre" };
  if (delaiNonRegle) return { action: "delai-non-regle" };
  // Contrat background.js : quand delaiNonRegle n'est pas true, cibleMs a
  // toujours été tiré et persisté avant que la réponse parte (cf. handler
  // "vinted:qui-suis-je" dans background.js) — jamais recalculé ici.
  return { action: "remplir", attendreMs: entry.cibleMs - maintenant };
}

async function init() {
  let reponse;
  try {
    reponse = await browser.runtime.sendMessage({ type: "vinted:qui-suis-je" });
  } catch (err) {
    // Service worker injoignable (contexte d'extension invalidé, etc.) :
    // aucune certitude qu'un article est assigné à cet onglet, donc état
    // neutre plutôt qu'une bannière trompeuse sur une page qui n'a peut-être
    // aucun rapport avec MyFlip.
    console.error("[myflip-vinted]", err);
    return;
  }

  const action = interpreterReponseQuiSuisJe(reponse, Date.now());

  if (action.action === "neutre") return; // onglet Vinted sans lien avec MyFlip : rien à afficher, jamais de badge ni de bannière

  if (action.action === "delai-non-regle") {
    afficherBanniere("Réglez le délai anti-ban dans /compte avant de publier automatiquement.");
    return;
  }

  const { entry } = reponse;

  // Le badge n'a de sens que s'il reste effectivement une attente à montrer
  // (ex. relecture de cette page après un premier passage déjà en retard sur
  // sa cible) — pas la peine de l'afficher pour le faire disparaître dans la
  // même passe.
  let badge = null;
  if (action.attendreMs > 0) {
    // Le badge est un pur confort d'affichage sur NOTRE Shadow DOM (aucun
    // sélecteur Vinted en jeu ici, contrairement à remplirFormulaire) : une
    // panne inattendue ne doit donc jamais empêcher la suite, qui est le
    // vrai travail (remplir le formulaire). On dégrade silencieusement au
    // lieu de laisser une exception interrompre init() avant même d'avoir
    // tenté le remplissage.
    try {
      badge = creerBadge(entry);
      demarrerCompteARebours(badge, entry.cibleMs);
    } catch (err) {
      console.error("[myflip-vinted] badge non affiché", err);
      badge = null;
    }
    await new Promise((r) => setTimeout(r, action.attendreMs));
  }

  const statut = remplirFormulaire(entry);
  if (badge) masquerBadge(badge);

  if (statut === "echec-selecteurs") {
    afficherBanniere(
      "L'extension a besoin d'une mise à jour — continue à la main pour cet article, la mise à jour n'est pas automatique.",
    );
    // Rien n'a été rempli : l'entrée reste en file côté background (pas de
    // "vinted:entree-consommee"). Un rechargement de cette page la
    // retentera, puisque le tabId lui reste assigné.
    return;
  }

  if (statut === "succes-partiel") {
    afficherBanniere("Photos non injectées automatiquement — le texte est rempli, ajoute les photos à la main.");
    // Volontairement PAS de "vinted:entree-consommee" ici non plus : le
    // travail n'est que partiellement fait. Consommer marquerait l'article
    // comme traité alors que les photos manquent encore, sans bénéfice pour
    // Aramis — un rechargement ne réécrira pas le texte déjà rempli (garde-fou
    // ne-jamais-écraser plus bas) mais retentera l'injection des photos.
    return;
  }

  // statut === "succes" : texte ET photos en place, seul cas de consommation.
  await browser.runtime
    .sendMessage({ type: "vinted:entree-consommee", entryId: entry.entryId })
    .catch((err) => console.error("[myflip-vinted]", err));
}

init();

// ---------------------------------------------------------------------------
// Badge (Shadow DOM) + bannières
// ---------------------------------------------------------------------------

/**
 * Badge construit noeud par noeud, PAS via innerHTML.
 *
 * `web-ext lint` remonte `UNSAFE_VAR_ASSIGNMENT` sur toute affectation
 * d'innerHTML portant une valeur dynamique — c'est un avertissement que la
 * revue AMO regarde. Le titre était bien échappé à la main, mais échapper
 * soi-même est exactement ce que `textContent` rend inutile : plus de
 * fonction d'échappement à maintenir, plus de valeur interpolée dans une
 * chaîne de balisage, plus d'avertissement.
 */
function creerBadge(entry) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .badge { display:flex; align-items:center; gap:8px; background:#fff;
      border:1px solid #ddd; border-radius:12px; padding:8px 12px;
      font: 13px system-ui, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
    .vignette { width:28px; height:28px; border-radius:6px; object-fit:cover;
      flex-shrink:0; background:#eee; display:block; }
    .repere { width:8px; height:8px; border-radius:50%; background:#0f5132; flex-shrink:0; }
    .titre { max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  `;

  const badge = document.createElement("div");
  badge.className = "badge";

  const urlVignette = creerUrlVignette(entry.photos);
  if (urlVignette) {
    const img = document.createElement("img");
    img.className = "vignette";
    img.src = urlVignette;
    img.alt = "";
    badge.appendChild(img);
  } else {
    const repere = document.createElement("span");
    repere.className = "repere";
    badge.appendChild(repere);
  }

  const titre = document.createElement("span");
  titre.className = "titre";
  titre.textContent = String(entry.titre || "").slice(0, 40);
  badge.appendChild(titre);

  const compteARebours = document.createElement("span");
  compteARebours.className = "compte-a-rebours";
  compteARebours.textContent = "…";
  badge.appendChild(compteARebours);

  shadow.append(style, badge);
  document.documentElement.appendChild(host);
  return { host, shadow, urlVignette };
}

/**
 * `{ type, buffer }` → `Blob`. Renvoie `null` sur une entrée malformée
 * plutôt que de lever : l'appelant décide quoi en faire.
 */
function versBlob(photo) {
  if (!photo || !photo.buffer) return null;
  try {
    return new Blob([photo.buffer], { type: photo.type || "image/jpeg" });
  } catch (err) {
    console.error("[myflip-vinted] photo illisible", err);
    return null;
  }
}

/**
 * Miniature de la première photo via URL.createObjectURL — best-effort :
 * sur tout échec (pas de photos, API absente, buffer invalide) on retombe
 * sur le repère coloré, jamais d'exception qui empêcherait l'affichage du
 * badge.
 */
function creerUrlVignette(photos) {
  try {
    if (!Array.isArray(photos) || !photos[0]) return null;
    if (typeof URL.createObjectURL !== "function") return null;
    const blob = versBlob(photos[0]);
    return blob ? URL.createObjectURL(blob) : null;
  } catch {
    // best-effort, cf. commentaire ci-dessus
    return null;
  }
}

function demarrerCompteARebours(badge, cibleMs) {
  const el = badge.shadow.querySelector(".compte-a-rebours");
  const tick = () => {
    const reste = Math.max(0, cibleMs - Date.now());
    el.textContent = formaterCompteARebours(reste);
    if (reste > 0) requestAnimationFrame(tick);
  };
  tick();
}

/** reste (ms, déjà >= 0) → "M:SS". Pure, testable sans DOM. */
function formaterCompteARebours(resteMs) {
  const min = Math.floor(resteMs / 60_000);
  const sec = Math.floor((resteMs % 60_000) / 1000);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function masquerBadge(badge) {
  if (badge.urlVignette) {
    try {
      URL.revokeObjectURL(badge.urlVignette);
    } catch {
      // best-effort
    }
  }
  badge.host.remove();
}

function afficherBanniere(texte) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fef3c7;color:#78350f;padding:10px;text-align:center;font:14px system-ui,sans-serif;";
  host.textContent = texte;
  document.documentElement.appendChild(host);
}

// ---------------------------------------------------------------------------
// Remplissage des champs
// ---------------------------------------------------------------------------

/**
 * Sélecteurs `data-testid`/`name` : hypothèses raisonnables mais NON
 * vérifiées contre le DOM réel de vinted.fr/items/new (personne sur ce
 * projet ne l'a inspecté — cf. brief Task 15). C'est le point de maintenance
 * déjà budgété par la bannière "mise à jour nécessaire" ci-dessous : si ces
 * sélecteurs sont faux, aucun champ n'est trouvé, remplirFormulaire()
 * renvoie "echec-selecteurs" sans rien avoir touché, et init() bascule sur
 * la bannière au lieu de planter ou de rester silencieux.
 *
 * Renvoie "echec-selecteurs" (rien trouvé, rien rempli), "succes-partiel"
 * (texte rempli, photos non injectées) ou "succes" (texte + photos). Ne
 * lève jamais : toute exception inattendue pendant la manipulation du DOM
 * Vinted est rattrapée et traduite en "echec-selecteurs".
 */
function remplirFormulaire(entry) {
  try {
    const champTitre = document.querySelector('[data-testid="title--input"], input[name="title"]');
    const champDescription = document.querySelector(
      '[data-testid="description--input"], textarea[name="description"]',
    );
    const champPrix = document.querySelector('[data-testid="price-input--input"], input[name="price"]');

    if (!champTitre || !champDescription || !champPrix) return "echec-selecteurs";

    remplirChamp(champTitre, entry.titre);
    remplirChamp(champDescription, entry.description);
    remplirChamp(champPrix, String(entry.prix));

    const succesPhotos = injecterPhotos(entry.photos);
    return succesPhotos ? "succes" : "succes-partiel";
  } catch (err) {
    console.error("[myflip-vinted] remplissage du formulaire Vinted en échec", err);
    return "echec-selecteurs";
  }
}

/** Un champ non vide (espaces compris) est considéré rempli à la main : on
 * ne le touche jamais. Pure, testable sans DOM. */
function devraitRemplirChamp(valeurActuelle) {
  return !valeurActuelle || valeurActuelle.trim() === "";
}

/**
 * Écrit une valeur dans un champ en passant par le setter NATIF du prototype,
 * pas par `el.value = …`.
 *
 * Vinted est une application React, et React installe un « value tracker »
 * sur chaque champ contrôlé : il retient la dernière valeur qu'il a lui-même
 * écrite pour décider si un événement `input` correspond à un vrai
 * changement. Une affectation directe `el.value = …` passe sous ce tracker —
 * le DOM change, mais React croit que la valeur n'a pas bougé, ignore
 * l'événement synthétique, et remet sa propre valeur (vide) au premier
 * re-render.
 *
 * Le symptôme est le pire possible : le champ se remplit visuellement, donc
 * `remplirFormulaire()` renvoie "succes", donc l'entrée est CONSOMMÉE et
 * supprimée de la file — pendant que le formulaire réel est resté vide.
 *
 * Appeler le setter du prototype met à jour le tracker en même temps que la
 * valeur, ce qui rend l'événement `input` qui suit indiscernable d'une vraie
 * frappe. Repli sur l'affectation directe si le descripteur est introuvable
 * (champ non standard) : mieux vaut tenter que ne rien écrire.
 */
function ecrireValeur(el, valeur) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, valeur);
  else el.value = valeur;
}

// Ne jamais écraser un champ déjà rempli à la main.
function remplirChamp(el, valeur) {
  if (!devraitRemplirChamp(el.value)) return;
  el.focus();
  ecrireValeur(el, valeur);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
}

function injecterPhotos(photos) {
  // Un tableau vide/absent n'est pas un succès silencieux : sans photo
  // réelle à transférer, l'input file ne doit pas être touché, et l'appelant
  // doit savoir que les photos restent à faire à la main.
  if (!Array.isArray(photos) || photos.length === 0) return false;
  const inputFichier = document.querySelector('input[type="file"]');
  if (!inputFichier) return false;
  try {
    // Reconstruction des Blob depuis les { type, buffer } transportés — cf.
    // l'en-tête de ce fichier. Une seule photo illisible ne doit pas faire
    // perdre les autres, mais une liste entièrement vide après filtrage est
    // un échec : sans quoi on toucherait l'input pour n'y mettre rien.
    const fichiers = photos
      .map((p, i) => {
        const blob = versBlob(p);
        return blob
          ? new File([blob], `photo-${String(i + 1).padStart(2, "0")}.jpg`, {
              type: blob.type,
            })
          : null;
      })
      .filter(Boolean);
    if (fichiers.length === 0) return false;

    const dt = new DataTransfer();
    for (const fichier of fichiers) dt.items.add(fichier);
    inputFichier.files = dt.files;
    inputFichier.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (err) {
    console.error("[myflip-vinted] injection des photos en échec", err);
    return false;
  }
}
