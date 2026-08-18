// extension-vinted/background.js
import { deleteEntry, getAllEntries, saveEntry } from "./db.js";
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

const pendingEvents = []; // { tabId, openerTabId, ts }

browser.tabs.onCreated.addListener((tab) => {
  if (tab.openerTabId == null) return;
  pendingEvents.push({ tabId: tab.id, openerTabId: tab.openerTabId, ts: Date.now() });
  reconcile();
});

browser.runtime.onMessage.addListener(async (msg, sender) => {
  if (msg.type === "myflip:mise-en-file") {
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
  const entries = await getAllEntries();
  const unpaired = entries.filter((e) => e.tabId == null);
  const messages = unpaired.map((e) => ({
    entryId: e.entryId,
    openerTabId: e.openerTabId,
    ts: e.ts,
  }));
  const { pairs } = pairEvents(pendingEvents, messages);
  for (const { tabId, entryId } of pairs) {
    const entry = entries.find((e) => e.entryId === entryId);
    entry.tabId = tabId;
    await saveEntry(entry);
    const idx = pendingEvents.findIndex((e) => e.tabId === tabId);
    if (idx >= 0) pendingEvents.splice(idx, 1);
  }
}

// Au réveil du service worker (Manifest V3 : peut être tué à tout moment),
// relire les entrées en attente — pendingEvents ne survit qu'en mémoire pour
// la session courante, mais un onglet déjà apparié garde son tabId en
// IndexedDB : reconcile() n'a rien à refaire pour lui.
reconcile();
