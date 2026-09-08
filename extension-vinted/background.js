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
import {
  delaiDeLEntree,
  entreesPerimees,
  estPremiereEntree,
  prochaineAction,
  tirerDelaiMs,
} from "./file.js";

const ALARME = "myflip-vinted-suite";
const TTL_MS = 60 * 60_000;
const URL_FORMULAIRE = "https://www.vinted.fr/items/new";

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "myflip:mise-en-file") {
    if (!sender.tab) {
      console.warn("[myflip-vinted] mise-en-file sans onglet expéditeur, ignorée");
      return;
    }
    // Un nouvel envoi depuis /mise-en-vente est le geste explicite qui dit
    // « j'ai corrigé, on repart » (c'est ce que promet le README). Sans cette
    // purge, l'état "echouee" serait ABSORBANT : rien d'autre ne le supprime,
    // prochaineAction() renverrait "suspendu" à jamais, et chaque envoi
    // suivant partirait dans le vide — la page afficherait « Brouillon », et
    // pas un onglet ne s'ouvrirait.
    await purgerEchecs();
    // La file est relue APRÈS la purge : une entrée en échec qui vient d'être
    // retirée ne doit pas faire passer ce nouvel envoi pour un article qui
    // rejoint un lot en cours. Le drapeau est posé maintenant, une fois pour
    // toutes — pas recalculé à la planification, où il redeviendrait vrai
    // après chaque succès (cf. estPremiereEntree dans file.js).
    const premier = estPremiereEntree(await getAllEntries());
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
      // Fourchette choisie dans le pop-up de /mise-en-vente, en minutes.
      // Portée par l'entrée : deux lots lancés avec des réglages différents
      // s'enchaînent sans que le second impose le sien au premier.
      delai: msg.delai,
      premier,
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

// Deux gestes différents portent le même événement, et il faut les distinguer
// par l'état de l'entrée :
//
//   "en-cours"  — l'onglet a été fermé PENDANT le remplissage, sans
//                 redirection : le travail n'a pas abouti. On suspend plutôt
//                 que de passer au suivant — l'onglet a été fermé pour une
//                 raison, et elle vaut probablement pour les suivants.
//   "echouee"   — l'onglet avait été LAISSÉ ouvert avec sa bannière après un
//                 échec. Le fermer est le « ferme l'onglet » du README :
//                 l'utilisateur a vu le problème, on retire l'entrée et la
//                 chaîne repart. Sans cette sortie, la file resterait
//                 suspendue pour toujours.
browser.tabs.onRemoved.addListener(async (tabId) => {
  const entries = await getAllEntries();
  const entree = entries.find((e) => e.tabId === tabId);
  if (!entree) return;

  if (entree.etat === "echouee") {
    console.warn(
      `[myflip-vinted] onglet de l'entrée en échec ${entree.entryId} fermé : entrée retirée, la file repart`,
    );
    await deleteEntry(entree.entryId);
    await avancer();
    return;
  }

  if (entree.etat !== "en-cours") return;
  entree.etat = "echouee";
  await saveEntry(entree);
  // Ce basculement était totalement muet : un onglet fermé par mégarde
  // arrêtait la chaîne sans laisser la moindre trace.
  console.warn(
    `[myflip-vinted] onglet de ${entree.entryId} fermé avant la fin du remplissage : chaîne suspendue`,
  );
});

browser.alarms.onAlarm.addListener((alarme) => {
  if (alarme.name === ALARME) void avancer();
});

// Sérialisation de avancer() : un seul passage à la fois. Sans ce verrou,
// deux déclenchements concurrents (l'alarme pendant un message entrant, ou
// reprendre() en parallèle du tout premier message) liraient chacun l'état
// AVANT que l'autre écrive, décideraient tous deux "ouvrir" pour la même
// entrée, et ouvriraient deux onglets pour un seul article — l'un des deux
// orphelin, jamais tracé. Les appels concurrents s'enfilent sur cette chaîne
// au lieu de s'entrelacer.
let chaineAvancer = Promise.resolve();

/**
 * Point d'entrée public, appelé depuis les quatre endroits qui font avancer
 * la file (message entrant, tabs.onUpdated, l'alarme, la reprise au réveil).
 * Enfile l'appel sur la chaîne plutôt que de lancer avancerImpl()
 * directement : c'est ce qui garantit qu'un seul passage tourne à la fois.
 */
function avancer() {
  chaineAvancer = chaineAvancer.then(avancerImpl).catch((erreur) => {
    // Les appelants en "void avancer()" (l'alarme) ne peuvent attraper aucun
    // rejet : sans ce catch, la moindre exception deviendrait une unhandled
    // rejection invisible — dans le seul fichier du chantier sans test.
    console.error("[myflip-vinted] erreur dans avancer()", erreur);
  });
  return chaineAvancer;
}

/**
 * Fait avancer la file d'un cran. Idempotente : elle peut être rappelée à
 * tout moment (message entrant, alarme, réveil du worker) et ne fera rien de
 * plus que ce que l'état en base justifie. Ne jamais l'appeler directement
 * en dehors de avancer() : c'est avancer() qui la sérialise.
 */
async function avancerImpl() {
  const entries = await getAllEntries();

  // Une entrée "echouee" suspend toute la chaîne pour que l'utilisateur
  // termine l'article à la main. La purge TTL ne doit pas lever cette
  // suspension au bout d'une heure : la chaîne repartirait toute seule, et
  // les articles suivants échoueraient très probablement pour la même
  // raison — exactement ce que la suspension existe pour empêcher.
  const suspendue = entries.some((e) => e.etat === "echouee");
  if (!suspendue) {
    for (const entryId of entreesPerimees(entries, Date.now(), TTL_MS)) {
      console.warn(`[myflip-vinted] purge de l'entrée périmée ${entryId}`);
      await deleteEntry(entryId);
    }
  }

  const action = prochaineAction(await getAllEntries(), Date.now());

  if (action.type === "suspendu") {
    // Ce cas était muet, et c'était la panne silencieuse la plus grave du
    // chantier : chaque nouvel envoi retombait ici sans rien journaliser,
    // pendant que /mise-en-vente affichait « Brouillon » comme si tout allait
    // bien. Les deux sorties nommées ici sont celles du README.
    console.warn(
      `[myflip-vinted] file ARRÊTÉE sur l'entrée ${action.entryId} (son remplissage a échoué). ` +
        "Rien ne repartira tant que son onglet n'aura pas été fermé, ou qu'un nouvel envoi " +
        "depuis /mise-en-vente n'aura pas purgé les entrées en échec.",
    );
    return;
  }

  if (action.type === "planifier") {
    const entrees = await getAllEntries();
    const entree = entrees.find((e) => e.entryId === action.entryId);
    if (!entree) {
      // Disparue entre la décision et cette relecture (purge TTL, action
      // manuelle...) : rien à planifier, une passe ultérieure repartira d'un
      // état à jour. Ne pas déréférencer un find() qui a pu rendre undefined.
      console.warn(`[myflip-vinted] entrée ${action.entryId} disparue avant planification, ignorée`);
      return;
    }
    const { minMinutes, maxMinutes } = delaiDeLEntree(entree);
    entree.cibleMs = action.immediat
      ? // Premier article du lot : il ne patiente pas. Le délai anti-ban n'a
        // de sens qu'ENTRE deux annonces.
        Date.now()
      : Date.now() + tirerDelaiMs(minMinutes, maxMinutes, Math.random);
    await saveEntry(entree);
    // Récursion directe, PAS via avancer() : on est déjà dans le passage
    // sérialisé courant, repasser par avancer() enfilerait un appel sur
    // chaineAvancer qui attend la fin de ce même passage — un verrou
    // mort-né.
    return avancerImpl();
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
    if (!entree) {
      // Même garde que ci-dessus, mais ici tabs.create() a déjà tourné :
      // l'onglet fraîchement ouvert ne doit pas rester à l'écran, non tracé,
      // pour un article qui n'existe plus.
      console.warn(`[myflip-vinted] entrée ${action.entryId} disparue après ouverture de l'onglet, fermeture`);
      await browser.tabs.remove(onglet.id).catch(() => {
        // L'onglet a pu être fermé à la main entre-temps : ce n'est pas un échec.
      });
      return;
    }
    entree.tabId = onglet.id;
    entree.etat = "en-cours";
    await saveEntry(entree);
  }
  // "occupe" et "rien" : il n'y a rien à faire, et c'est normal — les taire
  // est un choix, pas un oubli ("suspendu", lui, est journalisé plus haut).
  // La reprise viendra d'un tabs.onUpdated, d'un tabs.onRemoved, ou d'une
  // nouvelle mise en file.
}

/**
 * Retire toutes les entrées en échec. Appelée au moment d'une nouvelle mise
 * en file, jamais automatiquement : lever la suspension toute seule ferait
 * repartir la chaîne sur une cause qui n'a pas été corrigée.
 *
 * Ne ferme aucun onglet : celui qui reste ouvert porte la bannière qui dit ce
 * qui a lâché, et c'est la seule information de diagnostic disponible.
 */
async function purgerEchecs() {
  const entries = await getAllEntries();
  for (const e of entries.filter((x) => x.etat === "echouee")) {
    console.warn(`[myflip-vinted] nouvel envoi : l'entrée en échec ${e.entryId} est retirée de la file`);
    await deleteEntry(e.entryId);
  }
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
