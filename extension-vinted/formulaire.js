// extension-vinted/formulaire.js
//
// Pilotage du DOM de vinted.fr/items/new. Chargé AVANT content-vinted.js par
// le manifest, comme script classique : pas d'import/export, les fonctions
// vivent dans la portée globale du monde isolé du content script.
//
// Tous les sélecteurs viennent de relevés réels :
//   docs/audits/2026-09-07-vinted-form-mapping.md
//   docs/audits/2026-09-08-vinted-mecanique-panneaux.md
// Ne jamais en inventer un « par analogie » : le prix a déjà prouvé qu'un
// champ peut avoir l'air rempli tout en ne l'étant pas.

const SEL_VALIDER_PANNEAU = '[data-testid="input-dropdown-save-button"]';

function pause(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pause aléatoire, bornes en ms. C'est la mesure anti-bot : un formulaire
 *  rempli en 40 ms est le signal le plus lisible qui existe. */
function pauseAleatoire(minMs, maxMs) {
  return pause(minMs + Math.random() * (maxMs - minMs));
}

/**
 * Attend qu'un élément apparaisse. Renvoie l'élément, ou `null` au bout du
 * délai — jamais d'exception : l'appelant décide quoi en faire, et un
 * sélecteur périmé doit produire une bannière, pas une trace de pile.
 */
function attendreElement(selecteur, timeoutMs = 10_000) {
  const deja = document.querySelector(selecteur);
  if (deja) return Promise.resolve(deja);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selecteur);
      if (!el) return;
      observer.disconnect();
      clearTimeout(minuteur);
      resolve(el);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const minuteur = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

/**
 * Écrit une valeur en passant par le setter NATIF du prototype.
 *
 * React installe un « value tracker » sur chaque champ contrôlé : il retient
 * la dernière valeur qu'il a écrite pour décider si un événement `input`
 * correspond à un vrai changement. Une affectation `el.value = …` passe sous
 * ce tracker — le DOM change, React croit que rien n'a bougé, et remet sa
 * valeur au premier re-render. Le setter du prototype met le tracker à jour
 * en même temps que la valeur.
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

/**
 * Tape un texte CARACTÈRE PAR CARACTÈRE, avec de vrais événements clavier.
 *
 * ⚠️ Ce n'est pas seulement de l'anti-bot. Le relevé du 2026-09-08 a créé un
 * brouillon dont le PRIX affichait « 15,00 € » à l'écran et valait `0.0` en
 * base : `el.value = …` + un `Event("input")` synthétique suffisent à mettre
 * à jour l'affichage sans déclencher le commit interne du champ prix. Le
 * titre, écrit pareil, passait. Une frappe réelle plus un `blur` est la seule
 * parade connue — et aucune ne se VÉRIFIE depuis la page : seul le brouillon
 * relu après coup dit la vérité.
 *
 * `Array.from` et non `split("")` : « é » et les emojis sont des paires de
 * substituts, que `split("")` couperait en deux.
 *
 * Renvoie `true` si le champ porte quelque chose à la fin, `false` si la
 * frappe n'a rien écrit du tout.
 */
async function taperTexte(el, texte) {
  const demande = String(texte);
  // Un champ non vide a été rempli à la main : on ne l'écrase jamais. C'est un
  // SUCCÈS — le champ porte bien une valeur — et pas un échec.
  if (el.value && el.value.trim() !== "") return true;
  el.focus();
  let courant = "";
  for (const caractere of Array.from(demande)) {
    // `keypress` fait partie de la séquence listée par la spec §5.4. Il est
    // déprécié au sens des standards, mais toujours émis par les vrais
    // navigateurs à la frappe : l'omettre laisse un trou dans la séquence
    // qu'un champ qui écoute le clavier peut voir.
    el.dispatchEvent(new KeyboardEvent("keydown", { key: caractere, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keypress", { key: caractere, bubbles: true }));
    courant += caractere;
    ecrireValeur(el, courant);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: caractere, bubbles: true }));
    await pause(25 + Math.random() * 45);
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.blur();
  el.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

  // Parade n° 3 de la spec §5.4 : relire `el.value` après le blur.
  //
  // ⚠️ On teste « le champ est-il resté VIDE ? », JAMAIS l'égalité avec le
  // texte demandé. Le champ prix REFORMATE ce qu'on tape — « 15 » ressort
  // « 15,00 € » (relevé 2026-09-08 §6) — donc une comparaison stricte
  // échouerait sur un remplissage parfaitement réussi et arrêterait la chaîne
  // pour rien. Ne pas « resserrer » cette vérification : elle est faible
  // exprès, et la spec le dit — elle n'attrape que le cas où la frappe n'a
  // rien écrit du tout. Seul le brouillon relu après coup prouve le commit.
  if (demande.trim() !== "" && String(el.value ?? "").trim() === "") {
    console.warn(
      `[myflip-vinted] frappe sans effet sur ${decrireChamp(el)} : le champ est resté vide`,
    );
    return false;
  }
  return true;
}

/** De quoi nommer un champ dans un avertissement, sans supposer qu'il porte
 *  un `data-testid` (les champs de panneau n'en ont pas tous un). */
function decrireChamp(el) {
  return el?.getAttribute?.("data-testid") || el?.id || el?.name || el?.tagName || "champ inconnu";
}

/** Ouvre un panneau en cliquant son champ visible. Aucun chevron à viser :
 *  le relevé du 2026-09-08 §2 confirme que le champ suffit pour les cinq. */
async function ouvrirPanneau(testid) {
  const champ = await attendreElement(`[data-testid="${testid}"]`);
  if (!champ) {
    console.warn(`[myflip-vinted] panneau non ouvert : [data-testid="${testid}"] n'est jamais apparu`);
    return false;
  }
  champ.click();
  await pauseAleatoire(500, 1200);
  return true;
}

/**
 * Coche une option d'un panneau ouvert, à partir de l'id de son input.
 *
 * ⚠️ On ne clique JAMAIS l'input lui-même : il est `aria-hidden="true"` et
 * `tabindex="-1"`, et le relevé du 2026-09-08 §2 l'a vu répondre par
 * intermittence — parfois `aria-checked` bascule sans que le libellé affiché
 * suive. La cible est le conteneur `[role="radio"]` / `[role="checkbox"]`,
 * c'est-à-dire ce qu'un vrai clic utilisateur atteint.
 */
async function choisirOption(idInput) {
  const input = document.getElementById(idInput);
  if (!input) return false;
  const cible = input.closest('[role="radio"], [role="checkbox"]');
  // Pas de repli sur le `<label>` : dans le DOM relevé, ce label enveloppe
  // l'input caché et le cible directement — le cliquer reviendrait à cliquer
  // l'input aria-hidden que cette fonction interdit. Un conteneur `role`
  // absent signale que le DOM de Vinted a changé sous nos pieds : mieux vaut
  // échouer bruyamment (l'appelant traduit ce `false` en `echec-selecteurs`,
  // bannière + arrêt de la chaîne) qu'un demi-remplissage muet, invérifiable
  // depuis la page (même piège que le champ prix).
  if (!cible) {
    console.warn(`[myflip-vinted] conteneur role="radio"/"checkbox" introuvable pour #${idInput}`);
    return false;
  }
  cible.click();
  await pauseAleatoire(300, 900);
  return true;
}

/**
 * Ferme un panneau EN CONSERVANT la sélection.
 *
 * ⚠️ Le bouton « X » (`<champ>-select-dropdown-close-button`) ferme aussi,
 * mais en ANNULANT ce qui vient d'être coché (relevé 2026-09-08 §3, testé
 * sur la couleur). Ni Échap ni un clic à l'extérieur ne ferment quoi que ce
 * soit. « Fait » est le seul geste correct — ne jamais le remplacer.
 */
async function validerPanneau() {
  const bouton = await attendreElement(SEL_VALIDER_PANNEAU, 3000);
  if (!bouton) {
    console.warn(`[myflip-vinted] bouton « Fait » introuvable (${SEL_VALIDER_PANNEAU}) : panneau non validé`);
    return false;
  }
  await pauseAleatoire(300, 900);
  bouton.click();
  await pauseAleatoire(400, 1200);
  return true;
}

/**
 * Choisit la catégorie par recherche, puis VÉRIFIE le fil d'Ariane.
 *
 * La vérification n'est pas du zèle : « Sacs à dos » existe sous Femmes
 * (157), sous Hommes (246) et sous Enfants. Si l'id changeait chez Vinted, un
 * clic au mauvais endroit rangerait tous les articles dans le mauvais rayon
 * sans produire la moindre erreur. On préfère échouer bruyamment.
 */
async function choisirCategorie(recherche, categoryId, filArianeAttendu) {
  if (!(await ouvrirPanneau("catalog-select-dropdown-input"))) return false;

  const champRecherche = await attendreElement("#catalog-search-input", 5000);
  if (!champRecherche) {
    console.warn("[myflip-vinted] recherche de catégorie impossible : #catalog-search-input n'est jamais apparu");
    return false;
  }
  await taperTexte(champRecherche, recherche);

  const ligne = await attendreElement(`#catalog-search-${categoryId}-result`, 8000);
  if (!ligne) {
    console.warn(
      `[myflip-vinted] catégorie ${categoryId} absente des résultats : #catalog-search-${categoryId}-result n'est jamais apparu pour la recherche « ${recherche} »`,
    );
    return false;
  }

  const filAriane = (ligne.querySelector(".web_ui__Cell__body")?.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (filAriane !== filArianeAttendu) {
    console.error(
      `[myflip-vinted] fil d'Ariane inattendu : « ${filAriane} » au lieu de « ${filArianeAttendu} » — rien n'a été validé`,
    );
    return false;
  }

  ligne.click();
  await pauseAleatoire(300, 900);
  return validerPanneau();
}

/** Coche une case simple (unisexe, format de colis) — hors composant panneau,
 *  donc pas de « Fait » à cliquer derrière. */
async function cocher(selecteur) {
  const el = await attendreElement(selecteur, 5000);
  if (!el) {
    console.warn(`[myflip-vinted] case à cocher introuvable : ${selecteur} n'est jamais apparu`);
    return false;
  }
  if (!el.checked) el.click();
  await pauseAleatoire(400, 1200);
  return true;
}

/**
 * Dépose les photos. `photos` est un tableau de `{ type, buffer }` —
 * content-myflip.js convertit les Blob en ArrayBuffer à la source, seul
 * format qui traverse sans réserve le messaging ET IndexedDB.
 */
function injecterPhotos(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return false;
  // `data-testid` et non `input[type=file]` : le relevé confirme qu'il n'y en
  // a qu'un aujourd'hui, mais un widget tiers ajouté demain en introduirait
  // un second sans prévenir, et querySelector prend le premier venu.
  const input = document.querySelector('[data-testid="add-photos-input"]');
  if (!input) return false;
  try {
    const fichiers = photos
      .map((p, i) => {
        if (!p || !p.buffer) return null;
        const blob = new Blob([p.buffer], { type: p.type || "image/jpeg" });
        return new File([blob], `photo-${String(i + 1).padStart(2, "0")}.jpg`, {
          type: blob.type,
        });
      })
      .filter(Boolean);
    if (fichiers.length === 0) return false;
    const dt = new DataTransfer();
    for (const f of fichiers) dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (err) {
    console.error("[myflip-vinted] injection des photos en échec", err);
    return false;
  }
}

/**
 * Clique « Sauvegarder le brouillon ».
 *
 * ⚠️ Jamais `upload-form-save-button` (« Ajouter ») : ce serait une
 * publication réelle, hors périmètre de cette version.
 *
 * L'attribut `disabled` de ce bouton ne veut rien dire — il vaut `false` même
 * sur un formulaire entièrement vide (relevé 2026-09-08 §5). Il ne peut donc
 * pas servir de vérification : l'appelant doit avoir contrôlé chaque champ
 * lui-même avant d'arriver ici.
 */
async function cliquerBrouillon() {
  const bouton = document.querySelector('[data-testid="upload-form-save-draft-button"]');
  if (!bouton) {
    console.warn(
      '[myflip-vinted] bouton brouillon introuvable ([data-testid="upload-form-save-draft-button"]) : rien n\'a été sauvegardé',
    );
    return false;
  }
  await pauseAleatoire(4000, 10_000);
  bouton.click();
  return true;
}
