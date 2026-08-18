// extension-vinted/db.js
const DB_NAME = "myflip-vinted";
const DB_VERSION = 2;
const STORE = "entries";
const PENDING_STORE = "pendingEvents";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "entryId" });
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        // Persiste les événements tabs.onCreated non encore appariés. Sans
        // ce store, pendingEvents ne vivait qu'en mémoire : un service
        // worker tué pendant reconcile() (lecture + écriture(s) IndexedDB,
        // potentiellement plusieurs paires) perdait l'événement pour
        // toujours, laissant l'entrée en file qu'il devait apparier orpheline
        // en permanence — prête à être volée par le prochain événement
        // tabs.onCreated du même openerTabId (pairEvents() apparie par ts
        // croissant, sans notion d'expiration propre).
        db.createObjectStore(PENDING_STORE, { keyPath: "tabId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveEntry(entry) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllEntries() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteEntry(entryId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(entryId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function savePendingEvent(event) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).put(event);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllPendingEvents() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readonly");
    const req = tx.objectStore(PENDING_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function deletePendingEvent(tabId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).delete(tabId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
