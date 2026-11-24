// Opslag: alles staat lokaal op het toestel in IndexedDB.
export const S = {
  gyms: [],
  exercises: [],
  templates: [],
  sessions: [],
  meta: {},
  bodyweight: [],
  settings: {},
  active: null,
  deletedLib: [],
};

export const DEFAULT_SETTINGS = {
  lang: 'nl',
  gymId: null,
  prevByGym: true,
  rest: 120,
  step: 2.5,
  wakeLock: true,
  lastBackup: null,
  seeded: false,
};

const KV = ['gyms', 'exercises', 'templates', 'meta', 'bodyweight', 'settings', 'active', 'deletedLib'];
let db = null;

const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error);
});

export function sortSessions() {
  S.sessions.sort((a, b) => b.start - a.start);
}

// Sleutels van opgeslagen foto's ("oefening|gym"); de foto's zelf worden pas geladen als ze nodig zijn.
export const photoKeys = new Set();

let pdb = null; // aparte database voor foto's, zodat de hoofddatabase nooit een versie-upgrade nodig heeft

// Openen zonder versienummer: een bestaande database opent altijd direct (er is niets om op te wachten);
// alleen een gloednieuwe database krijgt versie 1 met de benodigde opslag.
function openDb(name, stores) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name);
    r.onupgradeneeded = () => stores(r.result);
    r.onsuccess = () => {
      const d = r.result;
      d.onversionchange = () => d.close();
      res(d);
    };
    r.onerror = () => rej(r.error);
  });
}

export async function openStore() {
  [db, pdb] = await Promise.all([
    openDb('gymlog', (d) => {
      d.createObjectStore('kv');
      d.createObjectStore('sessions', { keyPath: 'id' });
    }),
    openDb('gymlog-photos', (d) => d.createObjectStore('photos')),
  ]);
  const tx = db.transaction(['kv', 'sessions']);
  const kv = tx.objectStore('kv');
  const reqs = KV.map((k) => kv.get(k));
  const sreq = tx.objectStore('sessions').getAll();
  const preq = pdb.transaction('photos').objectStore('photos').getAllKeys();
  const [vals, sessions, pkeys] = await Promise.all([Promise.all(reqs.map(wrap)), wrap(sreq), wrap(preq)]);
  photoKeys.clear();
  (pkeys || []).forEach((k) => photoKeys.add(k));
  await migrateOldPhotos();
  KV.forEach((k, i) => { if (vals[i] !== undefined && vals[i] !== null) S[k] = vals[i]; });
  S.settings = { ...DEFAULT_SETTINGS, ...(S.settings || {}) };
  S.sessions = sessions || [];
  sortSessions();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* niet ondersteund */ }
}

export function persist(...keys) {
  if (!db) return Promise.resolve();
  const tx = db.transaction('kv', 'readwrite');
  const st = tx.objectStore('kv');
  keys.forEach((k) => st.put(S[k] === undefined ? null : S[k], k));
  return txDone(tx).catch((e) => console.error('persist', e));
}

export function putSession(s) {
  const i = S.sessions.findIndex((x) => x.id === s.id);
  if (i >= 0) S.sessions[i] = s; else S.sessions.push(s);
  sortSessions();
  const tx = db.transaction('sessions', 'readwrite');
  tx.objectStore('sessions').put(s);
  return txDone(tx).catch((e) => console.error('putSession', e));
}

export function deleteSession(id) {
  S.sessions = S.sessions.filter((x) => x.id !== id);
  const tx = db.transaction('sessions', 'readwrite');
  tx.objectStore('sessions').delete(id);
  return txDone(tx);
}

let activeTimer = null;
export function saveActiveSoon() {
  clearTimeout(activeTimer);
  activeTimer = setTimeout(() => persist('active'), 250);
}
export function flushActive() {
  clearTimeout(activeTimer);
  return persist('active');
}

// ---------- Foto's ----------
export function getPhoto(key) {
  return wrap(pdb.transaction('photos').objectStore('photos').get(key));
}
export function putPhoto(key, blob) {
  photoKeys.add(key);
  const tx = pdb.transaction('photos', 'readwrite');
  tx.objectStore('photos').put(blob, key);
  return txDone(tx);
}
export function deletePhoto(key) {
  photoKeys.delete(key);
  const tx = pdb.transaction('photos', 'readwrite');
  tx.objectStore('photos').delete(key);
  return txDone(tx);
}

// Versie 1.1.0 bewaarde foto's in de hoofddatabase; die eenmalig overzetten.
async function migrateOldPhotos() {
  if (!db.objectStoreNames.contains('photos')) return;
  const st = db.transaction('photos').objectStore('photos');
  const [keys, blobs] = await Promise.all([wrap(st.getAllKeys()), wrap(st.getAll())]);
  if (!keys.length) return;
  const tx = pdb.transaction('photos', 'readwrite');
  keys.forEach((k, i) => { if (!photoKeys.has(k)) { tx.objectStore('photos').put(blobs[i], k); photoKeys.add(k); } });
  await txDone(tx);
  const clr = db.transaction('photos', 'readwrite');
  clr.objectStore('photos').clear();
  await txDone(clr);
}
const blobToDataUrl = (b) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = () => rej(r.error);
  r.readAsDataURL(b);
});

export async function exportData() {
  const o = { app: 'gymlog', version: 2, exportedAt: Date.now() };
  KV.forEach((k) => { o[k] = S[k]; });
  o.sessions = S.sessions;
  o.photos = {};
  for (const key of photoKeys) {
    const b = await getPhoto(key);
    if (b) o.photos[key] = await blobToDataUrl(b);
  }
  return o;
}

export async function replaceAll(data) {
  // Foto's eerst omzetten: binnen een IndexedDB-transactie mag niet op andere dingen gewacht worden.
  const photos = [];
  for (const [key, url] of Object.entries(data.photos || {})) {
    try { photos.push([key, await (await fetch(url)).blob()]); } catch (e) { /* kapotte foto overslaan */ }
  }
  const ptx = pdb.transaction('photos', 'readwrite');
  const ps = ptx.objectStore('photos');
  ps.clear();
  photoKeys.clear();
  photos.forEach(([key, blob]) => { ps.put(blob, key); photoKeys.add(key); });
  await txDone(ptx);
  const tx = db.transaction(['kv', 'sessions'], 'readwrite');
  const kv = tx.objectStore('kv');
  const ss = tx.objectStore('sessions');
  kv.clear();
  ss.clear();
  const empty = { meta: {}, settings: {}, active: null };
  for (const k of KV) {
    S[k] = data[k] !== undefined && data[k] !== null ? data[k] : (k in empty ? empty[k] : []);
  }
  S.settings = { ...DEFAULT_SETTINGS, ...S.settings };
  for (const k of KV) kv.put(S[k], k);
  S.sessions = Array.isArray(data.sessions) ? data.sessions : [];
  S.sessions.forEach((s) => ss.put(s));
  sortSessions();
  await txDone(tx);
}
