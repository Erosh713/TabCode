/* TabCode — tiny IndexedDB layer shared by the app and the service worker.
   Classic script (no module) so the service worker can importScripts() it. */
(function (g) {
  "use strict";
  const NAME = "tabcode", VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
        if (!db.objectStoreNames.contains("trash")) db.createObjectStore("trash", { keyPath: "tid" });
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
      req.onblocked = () => console.warn("TabCode: base de données bloquée par un autre onglet");
    });
    return dbPromise;
  }

  function tx(store, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      let result;
      Promise.resolve(fn(s)).then(r => { result = r; });
      t.oncomplete = () => resolve(result && result.__req ? result.__req.result : result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  const wrap = req => ({ __req: req });

  g.TCDB = {
    open,
    get: (store, key) => tx(store, "readonly", s => wrap(s.get(key))),
    all: (store) => tx(store, "readonly", s => wrap(s.getAll())),
    put: (store, value, key) => tx(store, "readwrite", s => { key === undefined ? s.put(value) : s.put(value, key); }),
    del: (store, key) => tx(store, "readwrite", s => { s.delete(key); }),
  };
})(typeof self !== "undefined" ? self : window);
