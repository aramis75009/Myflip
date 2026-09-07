// extension-vinted/db.js
const DB_NAME = "myflip-vinted";
// v3 : le store "pendingEvents" disparaît. Il ne servait qu'à l'appariement
// onglet↔article par openerTabId, devenu inutile depuis que l'extension crée
// elle-même ses onglets (background.js) et connaît donc leur tabId.
const DB_VERSION = 3;
const STORE = "entries";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "entryId" });
      }
      // Migration depuis v2 : le store d'appariement est supprimé s'il existe
      // encore. Les entrées de "entries", elles, sont conservées — elles
      // portent un article réel, pas un état d'appariement.
      if (db.objectStoreNames.contains("pendingEvents")) {
        db.deleteObjectStore("pendingEvents");
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
