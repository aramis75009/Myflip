// extension-vinted/background.js
//
// Ordonnanceur de la file de publication Vinted. Un seul article en vol à la
// fois, un onglet créé par l'extension elle-même, et une alarme pour tenir
// les délais anti-ban à travers la mort du worker.
//
// Ce que ce fichier N'A PLUS : l'appariement onglet↔article par openerTabId.
// L'extension crée ses onglets, donc elle connaît leur tabId — pairing.js et
// le store "pendingEvents" ont disparu avec ce besoin.
//
// Toute la logique de décision vit dans file.js, en fonctions pures testées.
// Ici il ne reste que du branchement d'API browser.*, volontairement.

import { deleteEntry, getAllEntries, saveEntry } from "./db.js";
import { entreesPerimees, prochaineAction, tirerDelaiMs } from "./file.js";

const ALARME = "myflip-vinted-suite";
const TTL_MS = 60 * 60_000;
const URL_FORMULAIRE = "https://www.vinted.fr/items/new";

// Les bornes de délai ne sont pas lisibles par API (invariant de design : pas
// d'API MyFlip dédiée à l'extension). content-myflip.js les copie depuis le
// DOM de /compte vers storage.local. « Réglé » veut donc dire « Aramis a
// visité /compte après son dernier changement ».
async function lireDelaiRegle() {
  const { delaiMin, delaiMax } = await browser.storage.local.get(["delaiMin", "delaiMax"]);
  if (delaiMin == null || delaiMax == null) return null;
  return { delaiMin, delaiMax };
}

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "myflip:mise-en-file") {
    if (!sender.tab) {
      console.warn("[myflip-vinted] mise-en-file sans onglet expéditeur, ignorée");
      return;
    }
    await saveEntry({
      entryId: msg.entryId,
      titre: msg.titre,
      description: msg.description,
      prix: msg.prix,
      // `{ type, buffer }[]`, pas des Blob : content-myflip.js convertit à la
      // source pour que les photos traversent sans ambiguïté le messaging ET
      // IndexedDB.
      photos: msg.photos,
      // Identifiants numériques Vinted, ou undefined si la fiche n'a pas de
      // mapping. Consommé tel quel par content-vinted.js : aucune traduction
      // de ce côté-ci de la frontière.
      vinted: msg.vinted,
      etat: "en-attente",
      ts: Date.now(),
      cibleMs: null,
      tabId: null,
    });
    await avancer();
    return;
  }

  if (msg.type === "vinted:qui-suis-je") {
    if (!sender.tab) return { entry: null };
    const entries = await getAllEntries();
    const mienne = entries.find((e) => e.tabId === sender.tab.id);
    return { entry: mienne ?? null };
  }

  if (msg.type === "vinted:resultat") {
    const entries = await getAllEntries();
    const entree = entries.find((e) => e.entryId === msg.entryId);
    if (!entree) return;

    if (msg.statut === "succes") {
      // Le clic « Sauvegarder le brouillon » redirige vers /member/<id> : la
      // confirmation arrive par tabs.onUpdated (plus bas), pas ici. Ce
      // message dit seulement que le clic est parti.
      return;
    }
    // Échec de remplissage : l'onglet reste OUVERT avec sa bannière, pour que
    // l'article puisse être terminé à la main, et la chaîne s'arrête.
    entree.etat = "echouee";
    await saveEntry(entree);
    console.warn(`[myflip-vinted] chaîne suspendue sur ${entree.entryId} : ${msg.statut}`);
    return;
  }
});

// Succès : la page a quitté /items/new pour le profil vendeur. C'est le seul
// signal fiable — le toast de confirmation est emporté par la redirection
// avant d'être observable (cf. audit 2026-09-08 §6).
browser.tabs.onUpdated.addListener(async (tabId, infos) => {
  if (!infos.url) return;
  const entries = await getAllEntries();
  const entree = entries.find((e) => e.tabId === tabId && e.etat === "en-cours");
  if (!entree) return;
  if (!infos.url.includes("/member/")) return;

  await deleteEntry(entree.entryId);
  await browser.tabs.remove(tabId).catch(() => {
    // L'onglet a pu être fermé à la main entre-temps : ce n'est pas un échec.
  });
  await avancer();
});

// Un onglet en cours fermé à la main, sans redirection : le travail n'a pas
// abouti. On suspend plutôt que de passer au suivant — l'onglet a été fermé
// pour une raison, et elle vaut probablement pour les articles suivants.
browser.tabs.onRemoved.addListener(async (tabId) => {
  const entries = await getAllEntries();
  const entree = entries.find((e) => e.tabId === tabId && e.etat === "en-cours");
  if (!entree) return;
  entree.etat = "echouee";
  await saveEntry(entree);
});

browser.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME) void avancer();
});

/**
 * Fait avancer la file d'un cran. Idempotente : elle peut être rappelée à
 * tout moment (message entrant, alarme, réveil du worker) et ne fera rien de
 * plus que ce que l'état en base justifie.
 */
async function avancer() {
  const entries = await getAllEntries();

  for (const entryId of entreesPerimees(entries, Date.now(), TTL_MS)) {
    console.warn(`[myflip-vinted] purge de l'entrée périmée ${entryId}`);
    await deleteEntry(entryId);
  }

  const action = prochaineAction(await getAllEntries(), Date.now());

  if (action.type === "planifier") {
    const delai = await lireDelaiRegle();
    if (!delai) {
      // Sans fourchette réglée, on n'invente pas de délai : un délai implicite
      // de zéro annulerait le garde-fou anti-ban. La bannière de
      // content-vinted.js ne peut rien dire ici (aucun onglet ouvert), donc
      // la console est le seul canal — documenté dans le README.
      console.warn("[myflip-vinted] délai anti-ban non réglé : ouvre /compte une fois.");
      return;
    }
    const entrees = await getAllEntries();
    const entree = entrees.find((e) => e.entryId === action.entryId);
    entree.cibleMs = Date.now() + tirerDelaiMs(delai.delaiMin, delai.delaiMax, Math.random);
    await saveEntry(entree);
    return void avancer();
  }

  if (action.type === "attendre") {
    // `when` en epoch absolu, pas `delayInMinutes` : le worker peut mourir
    // entre-temps, et une échéance absolue survit là où un délai relatif
    // repartirait de zéro au réveil.
    browser.alarms.create(ALARME, { when: Date.now() + action.dansMs });
    return;
  }

  if (action.type === "ouvrir") {
    const onglet = await browser.tabs.create({ url: URL_FORMULAIRE, active: false });
    const entrees = await getAllEntries();
    const entree = entrees.find((e) => e.entryId === action.entryId);
    entree.tabId = onglet.id;
    entree.etat = "en-cours";
    await saveEntry(entree);
  }
  // "occupe", "suspendu", "rien" : il n'y a rien à faire. La reprise viendra
  // d'un tabs.onUpdated, d'un tabs.onRemoved, ou d'une nouvelle mise en file.
}

// Au réveil du worker (MV3 : il peut être tué à tout moment), la file est en
// base et se relit. Une entrée « en-cours » dont l'onglet a disparu pendant
// le sommeil est rattrapée ici plutôt que de bloquer la chaîne à jamais.
(async function reprendre() {
  const entries = await getAllEntries();
  for (const e of entries.filter((x) => x.etat === "en-cours")) {
    const vivant = await browser.tabs.get(e.tabId).catch(() => null);
    if (vivant) continue;
    e.etat = "echouee";
    await saveEntry(e);
  }
  await avancer();
})();
