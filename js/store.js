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

export async function openStore() {
  db = await new Promise((res, rej) => {
    const r = indexedDB.open('gymlog', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = db.transaction(['kv', 'sessions']);
  const kv = tx.objectStore('kv');
  const reqs = KV.map((k) => kv.get(k));
  const sreq = tx.objectStore('sessions').getAll();
  const [vals, sessions] = await Promise.all([Promise.all(reqs.map(wrap)), wrap(sreq)]);
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

export function exportData() {
  const o = { app: 'gymlog', version: 1, exportedAt: Date.now() };
  KV.forEach((k) => { o[k] = S[k]; });
  o.sessions = S.sessions;
  return o;
}

export async function replaceAll(data) {
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
