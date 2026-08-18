// extension-vinted/background.js
import {
  deleteEntry,
  deletePendingEvent,
  getAllEntries,
  getAllPendingEvents,
  saveEntry,
  savePendingEvent,
} from "./db.js";
import { pairEvents } from "./pairing.js";

// UserSettings.delaiVintedMinMinutes/MaxMinutes (Task 9) ne sont PAS exposés
// à l'extension via une API MyFlip (invariant : pas d'API dédiée, pas
// d'OAuth). L'extension les lit directement dans son propre
// browser.storage.local, où le content script MyFlip les aura copiés depuis
// le DOM de /compte au dernier chargement de cette page — donc "réglé" veut
// dire "Aramis a visité /compte au moins une fois après son dernier
// changement". Documenté dans le README utilisateur de l'extension (hors
// scope de ce plan de code).
async function lireDelaiRegle() {
  const { delaiMin, delaiMax } = await browser.storage.local.get(["delaiMin", "delaiMax"]);
  if (delaiMin == null || delaiMax == null) return null;
  return { delaiMin, delaiMax };
}

// Au-delà de ce délai, un événement tabs.onCreated ou une entrée en file
// encore non appariés sont purgés plutôt que laissés en attente
// indéfiniment. Sans ça, un orphelin ancien (onglet fermé avant sa mise en
// file, écriture persistée mais jamais consommée, etc.) peut être volé plus
// tard par un événement/message sans rapport pour le même openerTabId —
// pairEvents() apparie par ts croissant, sans notion d'expiration propre.
// 30 minutes est largement supérieur à toute plage de délai anti-ban
// réaliste (donc jamais confondu avec un cibleMs légitime en attente).
const TTL_MS = 30 * 60_000;

// Cache mémoire des événements tabs.onCreated non encore appariés.
// IndexedDB (store "pendingEvents", voir db.js) fait foi : ce tableau est
// reconstruit depuis IndexedDB à chaque reconcile(), y compris au réveil
// d'un service worker qui démarre avec ce tableau vide.
const pendingEvents = []; // { tabId, openerTabId, ts }

browser.tabs.onCreated.addListener(async (tab) => {
  if (tab.openerTabId == null) return;
  const event = { tabId: tab.id, openerTabId: tab.openerTabId, ts: Date.now() };
  // Persisté AVANT toute logique d'appariement. Si le service worker est tué
  // pendant reconcile() (lecture + écriture(s) IndexedDB, potentiellement
  // plusieurs paires), cet événement doit déjà être durablement enregistré :
  // sinon il ne vivait qu'en mémoire et disparaissait avec le worker,
  // laissant l'entrée en file qu'il devait apparier orpheline pour toujours
  // — prête à être volée par le prochain tabs.onCreated du même
  // openerTabId. La fonction est async et son promise n'est pas ignorée
  // (contrairement à une fonction sync + reconcile() en fire-and-forget) :
  // le runtime a un signal de travail en cours pendant toute la durée de
  // l'opération, pas seulement le tick synchrone.
  await savePendingEvent(event);
  pendingEvents.push(event);
  await reconcile();
});

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "myflip:mise-en-file") {
    if (!sender.tab) {
      console.warn("[myflip-vinted] myflip:mise-en-file reçu sans onglet expéditeur, ignoré");
      return;
    }
    await saveEntry({
      entryId: msg.entryId,
      titre: msg.titre,
      description: msg.description,
      prix: msg.prix,
      photos: msg.photos,
      openerTabId: sender.tab.id,
      ts: Date.now(),
      tabId: null,
      cibleMs: null,
    });
    await reconcile();
    return;
  }
  if (msg.type === "vinted:qui-suis-je") {
    if (!sender.tab) return { entry: null };
    const entries = await getAllEntries();
    const mine = entries.find((e) => e.tabId === sender.tab.id);
    if (!mine) return { entry: null };
    if (mine.cibleMs == null) {
      const delai = await lireDelaiRegle();
      if (!delai) return { entry: mine, delaiNonRegle: true };
      const minutes = delai.delaiMin + Math.random() * (delai.delaiMax - delai.delaiMin);
      mine.cibleMs = Date.now() + minutes * 60_000;
      await saveEntry(mine);
    }
    return { entry: mine };
  }
  if (msg.type === "vinted:entree-consommee") {
    await deleteEntry(msg.entryId);
  }
});

async function reconcile() {
  // Recharge les événements tabs.onCreated persistés : un service worker
  // fraîchement réveillé démarre avec pendingEvents vide en mémoire, mais
  // IndexedDB peut porter des événements laissés par une instance précédente
  // tuée avant la fin de son propre reconcile(). Fusion par tabId pour ne
  // pas dupliquer un événement déjà présent en mémoire (ex. juste poussé par
  // le listener tabs.onCreated dans ce même appel).
  const persisted = await getAllPendingEvents();
  for (const ev of persisted) {
    if (!pendingEvents.some((e) => e.tabId === ev.tabId)) {
      pendingEvents.push(ev);
    }
  }

  const entries = await getAllEntries();
  const unpaired = entries.filter((e) => e.tabId == null);
  const messages = unpaired.map((e) => ({
    entryId: e.entryId,
    openerTabId: e.openerTabId,
    ts: e.ts,
  }));

  const { pairs, unmatchedEvents, unmatchedMessages } = pairEvents(pendingEvents, messages);

  for (const { tabId, entryId } of pairs) {
    const entry = entries.find((e) => e.entryId === entryId);
    entry.tabId = tabId;
    await saveEntry(entry);
    const idx = pendingEvents.findIndex((e) => e.tabId === tabId);
    if (idx >= 0) pendingEvents.splice(idx, 1);
    await deletePendingEvent(tabId);
  }

  await purgeStale(unmatchedEvents, unmatchedMessages);
}

async function purgeStale(unmatchedEvents, unmatchedMessages) {
  const now = Date.now();
  for (const ev of unmatchedEvents) {
    if (now - ev.ts <= TTL_MS) continue;
    console.warn(
      `[myflip-vinted] purge tabs.onCreated orphelin (tabId=${ev.tabId}, openerTabId=${ev.openerTabId}, âge=${Math.round((now - ev.ts) / 1000)}s)`,
    );
    await deletePendingEvent(ev.tabId);
    const idx = pendingEvents.findIndex((e) => e.tabId === ev.tabId);
    if (idx >= 0) pendingEvents.splice(idx, 1);
  }
  for (const msg of unmatchedMessages) {
    if (now - msg.ts <= TTL_MS) continue;
    console.warn(
      `[myflip-vinted] purge entrée en file orpheline (entryId=${msg.entryId}, openerTabId=${msg.openerTabId}, âge=${Math.round((now - msg.ts) / 1000)}s)`,
    );
    await deleteEntry(msg.entryId);
  }
}

// Au réveil du service worker (Manifest V3 : peut être tué à tout moment),
// reconcile() recharge à la fois les entrées IndexedDB (tabId déjà posé =
// rien à refaire pour elles) et les événements tabs.onCreated persistés
// qu'une instance précédente n'a pas eu le temps d'apparier avant d'être
// tuée.
reconcile();
