// Opslag: alles staat lokaal op het toestel in IndexedDB.
// Met een account wordt het daarnaast op de achtergrond gesynchroniseerd (zie cloud.js).
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
  photoRevs: {},
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

const KV = ['gyms', 'exercises', 'templates', 'meta', 'bodyweight', 'settings', 'active', 'deletedLib', 'photoRevs'];
const OBJ_KEYS = { meta: true, settings: true, photoRevs: true };
let db = null;

const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txDone = (tx) => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = () => rej(tx.error);
  tx.onabort = () => rej(tx.error);
});
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function sortSessions() {
  S.sessions.sort((a, b) => b.start - a.start);
}

// ---------- Wijzigingen melden (voor synchronisatie) ----------
let changeHook = null;
let quiet = 0;
export function setChangeHook(fn) { changeHook = fn; }
function changed() { if (changeHook && !quiet) changeHook(); }
// Wijzigingen die van de server komen niet opnieuw als "lokale wijziging" melden
export async function quietly(fn) {
  quiet++;
  try { return await fn(); } finally { quiet--; }
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
  // Foto's zonder versienummer (van voor 1.2) krijgen er een
  let revAdded = false;
  for (const k of photoKeys) if (!S.photoRevs[k]) { S.photoRevs[k] = rid(); revAdded = true; }
  if (revAdded) await persist('photoRevs');
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* niet ondersteund */ }
}

export function persist(...keys) {
  if (!db) return Promise.resolve();
  const tx = db.transaction('kv', 'readwrite');
  const st = tx.objectStore('kv');
  keys.forEach((k) => st.put(S[k] === undefined ? null : S[k], k));
  if (keys.some((k) => k !== 'active')) changed();
  return txDone(tx).catch((e) => console.error('persist', e));
}

// Losse sleutels buiten S (inloggegevens, synchronisatiestatus); gaan niet mee in de back-up
export function getKv(key) {
  return wrap(db.transaction('kv').objectStore('kv').get(key)).then((v) => (v === undefined ? null : v));
}
export function setKv(key, val) {
  const tx = db.transaction('kv', 'readwrite');
  if (val == null) tx.objectStore('kv').delete(key); else tx.objectStore('kv').put(val, key);
  return txDone(tx);
}

export function putSession(s) {
  const i = S.sessions.findIndex((x) => x.id === s.id);
  if (i >= 0) S.sessions[i] = s; else S.sessions.push(s);
  sortSessions();
  const tx = db.transaction('sessions', 'readwrite');
  tx.objectStore('sessions').put(s);
  changed();
  return txDone(tx).catch((e) => console.error('putSession', e));
}

export function deleteSession(id) {
  S.sessions = S.sessions.filter((x) => x.id !== id);
  const tx = db.transaction('sessions', 'readwrite');
  tx.objectStore('sessions').delete(id);
  changed();
  return txDone(tx);
}

export function clearSessions() {
  S.sessions = [];
  const tx = db.transaction('sessions', 'readwrite');
  tx.objectStore('sessions').clear();
  changed();
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
export async function putPhoto(key, blob, rev) {
  photoKeys.add(key);
  const tx = pdb.transaction('photos', 'readwrite');
  tx.objectStore('photos').put(blob, key);
  await txDone(tx);
  S.photoRevs[key] = rev || rid();
  await persist('photoRevs');
}
export async function deletePhoto(key) {
  photoKeys.delete(key);
  const tx = pdb.transaction('photos', 'readwrite');
  tx.objectStore('photos').delete(key);
  await txDone(tx);
  delete S.photoRevs[key];
  await persist('photoRevs');
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
  const o = { app: 'gymlog', version: 3, exportedAt: Date.now() };
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
  // Alleen de app-gegevens vervangen; inlog- en synchronisatiestatus blijven staan.
  const tx = db.transaction(['kv', 'sessions'], 'readwrite');
  const kv = tx.objectStore('kv');
  const ss = tx.objectStore('sessions');
  ss.clear();
  for (const k of KV) {
    const v = data[k];
    S[k] = v !== undefined && v !== null ? v : (k === 'active' ? null : OBJ_KEYS[k] ? {} : []);
  }
  S.settings = { ...DEFAULT_SETTINGS, ...S.settings };
  const revs = {};
  for (const k of photoKeys) revs[k] = (S.photoRevs && S.photoRevs[k]) || rid();
  S.photoRevs = revs;
  for (const k of KV) kv.put(S[k], k);
  S.sessions = Array.isArray(data.sessions) ? data.sessions : [];
  S.sessions.forEach((s) => ss.put(s));
  sortSessions();
  await txDone(tx);
  changed();
}
