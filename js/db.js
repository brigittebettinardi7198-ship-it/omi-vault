// Minimal IndexedDB wrapper. All data stays on this device.
const NAME = 'omi-broker', VERSION = 2;
export const STORES = ['properties', 'owners', 'companies', 'leases', 'requirements', 'activities', 'followups', 'templates', 'settings', 'comps'];
let dbp;
export function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => { const db = r.result; STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const s = t.objectStore(store); const out = fn(s); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
export const getAll = store => tx(store, 'readonly', s => s.getAll());
export const put = (store, obj) => tx(store, 'readwrite', s => { s.put(obj); });
export const putMany = (store, arr) => tx(store, 'readwrite', s => { arr.forEach(o => s.put(o)); });
export const del = (store, id) => tx(store, 'readwrite', s => { s.delete(id); });
export const clear = store => tx(store, 'readwrite', s => { s.clear(); });
