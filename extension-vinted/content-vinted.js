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

const ORDRE_ATTENDU_MS = 10_000;

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
  masquerBadge(badge);

  if (statut !== "succes") {
    afficherBanniere(
      statut === "echec-selecteurs"
        ? "L'extension a besoin d'une mise à jour — termine cette annonce à la main. La chaîne est arrêtée."
        : "Remplissage incomplet — rien n'a été sauvegardé. Termine à la main. La chaîne est arrêtée.",
    );
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
 *   "succes-partiel"   — un champ n'a pas pris, ou les photos manquent
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
    if (!v) return "echec-selecteurs"; // sans identifiants Vinted, rien à faire ici

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
    if (!marqueVisible) return "echec-selecteurs";

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
    if (!champTitre) return "succes-partiel";
    await taperTexte(champTitre, entry.titre);

    direAuBadge(badge, "description…");
    const champDescription = document.querySelector('[data-testid="description--input"]');
    if (!champDescription) return "succes-partiel";
    await taperTexte(champDescription, entry.description);

    // Le prix EN DERNIER, et frappé caractère par caractère : c'est le champ
    // qui s'est déjà affiché rempli tout en valant 0.0 en base (audit
    // 2026-09-08 §6). Aucune vérification depuis la page ne peut le
    // démentir — seul le brouillon relu le dira.
    direAuBadge(badge, "prix…");
    const champPrix = document.querySelector('[data-testid="price-input--input"]');
    if (!champPrix) return "succes-partiel";
    await taperTexte(champPrix, String(entry.prix ?? ""));

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

function afficherBanniere(texte) {
  const host = document.createElement("div");
  host.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#fef3c7;color:#78350f;padding:10px;text-align:center;font:14px system-ui,sans-serif;";
  host.textContent = texte;
  document.documentElement.appendChild(host);
}
