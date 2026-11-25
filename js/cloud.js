// Accounts en synchronisatie met Supabase, zonder externe bibliotheek.
// Werkwijze: alles blijft eerst lokaal opgeslagen; op de achtergrond worden wijzigingen
// per record (workout, oefening, sessie, ...) vergeleken met de vorige synchronisatie en verstuurd.
import {
  S, persist, putSession, deleteSession, clearSessions, getPhoto, putPhoto, deletePhoto,
  photoKeys, getKv, setKv, setChangeHook, quietly,
} from './store.js';
import { invalidateEx, ensureLibrary } from './logic.js';
import { normName, relDay } from './util.js';
import { render, route } from './core.js';
import { t } from './i18n.js';
import { choose, toast } from './ui.js';
import { forgetPhoto } from './visual.js';

export const SUPA_URL = 'https://fmnwgjmzfbdbnjvujciw.supabase.co';
const SUPA_KEY = 'sb_publishable_XCosIuFi8OlnLSSVmPpeww_8RMp0iZC'; // publieke sleutel, bedoeld om in de app te staan
export const appUrl = () => location.origin + location.pathname;

let auth = null; // { access_token, refresh_token, expires_at, user: { id, email } }
let st = null; // { userId, cursor, hashes: { kind: { id: hash } }, lastSync, initialized }
export const status = { state: 'idle', error: null };
const listeners = new Set();
export const onStatus = (fn) => listeners.add(fn);
function setStatus(state, error = null) {
  status.state = state;
  status.error = error;
  listeners.forEach((f) => { try { f(); } catch (e) { /* negeren */ } });
}

export const loggedIn = () => !!auth;
export const userEmail = () => (auth ? auth.user.email : null);
export const lastSyncAt = () => (st && auth && st.userId === auth.user.id ? st.lastSync : null);

// ---------- HTTP ----------
class ApiError extends Error {
  constructor(msg, statusCode, code) { super(msg); this.status = statusCode; this.code = code; }
}

async function call(path, { method = 'GET', body, headers = {}, token, raw = false } = {}) {
  const h = { apikey: SUPA_KEY, ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  let payload = body;
  if (body !== undefined && !(body instanceof Blob)) {
    h['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(SUPA_URL + path, { method, headers: h, body: payload, cache: 'no-store' });
  } catch (e) {
    throw new ApiError('offline', 0, 'offline');
  }
  if (!res.ok) {
    let j = null;
    try { j = await res.json(); } catch (e) { /* geen json */ }
    const msg = (j && (j.msg || j.message || j.error_description || j.error)) || 'HTTP ' + res.status;
    throw new ApiError(msg, res.status, (j && (j.error_code || j.code || (typeof j.error === 'string' ? j.error : null))) || null);
  }
  if (raw) return res;
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

const sessionFrom = (j) => ({
  access_token: j.access_token,
  refresh_token: j.refresh_token,
  expires_at: Date.now() + (j.expires_in || 3600) * 1000,
  user: { id: j.user.id, email: j.user.email },
});

async function setAuth(a) {
  auth = a;
  await setKv('auth', a);
}

let refreshing = null;
function refresh() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const j = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: auth.refresh_token } });
        await setAuth(sessionFrom(j));
      } catch (e) {
        if (e.status >= 400 && e.status < 500) {
          // Sessie verlopen of ingetrokken: lokaal uitloggen, gegevens blijven staan
          await setAuth(null);
          setStatus('expired');
          toast(t('sessionExpired'));
        }
        throw e;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function token() {
  if (!auth) throw new ApiError('not logged in', 401, 'no_session');
  if (Date.now() > auth.expires_at - 60000) await refresh();
  return auth.access_token;
}

async function api(path, opts = {}) {
  try {
    return await call(path, { ...opts, token: await token() });
  } catch (e) {
    if (e.status === 401 && auth && e.code !== 'no_session') {
      await refresh();
      return call(path, { ...opts, token: auth.access_token });
    }
    throw e;
  }
}

// ---------- Inloggen ----------
export async function signUp(email, password) {
  const j = await call('/auth/v1/signup?redirect_to=' + encodeURIComponent(appUrl()), { method: 'POST', body: { email, password } });
  if (j && j.access_token) {
    await setAuth(sessionFrom(j));
    afterLogin();
    return { loggedIn: true };
  }
  return { confirm: true };
}

export async function signIn(email, password) {
  const j = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  await setAuth(sessionFrom(j));
  afterLogin();
}

export async function recover(email) {
  await call('/auth/v1/recover?redirect_to=' + encodeURIComponent(appUrl()), { method: 'POST', body: { email } });
}

export async function logout() {
  const a = auth;
  await setAuth(null);
  setStatus('idle');
  if (a) call('/auth/v1/logout?scope=local', { method: 'POST', token: a.access_token }).catch(() => {});
}

// Volledig loskoppelen zonder iets op de server te veranderen (bij "alle gegevens wissen")
export async function forgetAccountLocally() {
  auth = null;
  st = null;
  await setKv('auth', null);
  await setKv('sync', null);
  setStatus('idle');
}

export async function deleteAccount() {
  const uid = auth.user.id;
  const list = await api('/storage/v1/object/list/photos', { method: 'POST', body: { prefix: uid, limit: 1000, offset: 0 } });
  if (list && list.length) {
    await api('/storage/v1/object/photos', { method: 'DELETE', body: { prefixes: list.map((o) => uid + '/' + o.name) } });
  }
  await api('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} });
  await forgetAccountLocally();
}

export function errorText(e) {
  const m = String((e && e.message) || '').toLowerCase();
  const c = String((e && e.code) || '').toLowerCase();
  if (c === 'offline') return t('errOffline');
  if (c === 'invalid_credentials' || m.includes('invalid login')) return t('errLogin');
  if (c === 'email_not_confirmed' || m.includes('not confirmed')) return t('errNotConfirmed');
  if (c === 'user_already_exists' || m.includes('already registered')) return t('errExists');
  if (c === 'weak_password' || m.includes('password should')) return t('errWeakPw');
  if (c.includes('rate_limit') || e.status === 429) return t('errRate');
  if (c === 'validation_failed' || m.includes('invalid format') || m.includes('unable to validate email')) return t('errEmail');
  return (e && e.message) || t('errUnknown');
}

// Links uit e-mails (bevestigen, wachtwoord vergeten) komen binnen als #access_token=...&type=...
export let pendingLink = null;
export function captureAuthLink() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (!/(^|&)(access_token|error|error_code)=/.test(raw)) return false;
  const p = new URLSearchParams(raw);
  pendingLink = {
    type: p.get('type'),
    error: p.get('error_description') || p.get('error'),
    token: p.get('access_token'),
  };
  history.replaceState(null, '', location.pathname + '#/auth-link');
  return true;
}
export async function setPasswordFromLink(password) {
  await call('/auth/v1/user', { method: 'PUT', body: { password }, token: pendingLink.token });
}

// ---------- Synchronisatie ----------
const stable = (v) => {
  if (v === undefined || v === null) return 'null';
  if (typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
};
function hashOf(v) {
  const s = stable(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}

const KINDS = ['gym', 'exercise', 'prefs', 'meta', 'template', 'bodyweight', 'photo', 'session'];
const PREF_KEYS = ['lang', 'prevByGym', 'rest', 'step', 'wakeLock', 'gymId'];

function prefsData() {
  const p = { deletedLib: S.deletedLib || [] };
  PREF_KEYS.forEach((k) => { p[k] = S.settings[k] === undefined ? null : S.settings[k]; });
  return p;
}

function collect() {
  const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
  return {
    gym: byId(S.gyms),
    exercise: byId(S.exercises),
    prefs: new Map([['main', prefsData()]]),
    meta: new Map(Object.entries(S.meta)),
    template: byId(S.templates),
    bodyweight: byId(S.bodyweight),
    photo: new Map(Object.entries(S.photoRevs || {}).map(([k, rev]) => [k, { rev }])),
    session: byId(S.sessions),
  };
}

function getLocal(kind, id) {
  const find = (arr) => arr.find((x) => x.id === id);
  switch (kind) {
    case 'gym': return find(S.gyms);
    case 'exercise': return find(S.exercises);
    case 'template': return find(S.templates);
    case 'bodyweight': return find(S.bodyweight);
    case 'session': return find(S.sessions);
    case 'meta': return S.meta[id];
    case 'prefs': return id === 'main' ? prefsData() : undefined;
    case 'photo': return S.photoRevs && S.photoRevs[id] ? { rev: S.photoRevs[id] } : undefined;
    default: return undefined;
  }
}

const photoPath = (key) => `${auth.user.id}/${key.replace(/\|/g, '__')}.jpg`;

async function downloadPhoto(key) {
  try {
    const res = await api('/storage/v1/object/authenticated/photos/' + photoPath(key), { raw: true });
    return await res.blob();
  } catch (e) {
    if (e.status === 404 || e.status === 400) return null;
    throw e;
  }
}

async function setLocal(kind, id, data, touched) {
  const upsert = (arr) => {
    const i = arr.findIndex((x) => x.id === id);
    if (data === undefined) { if (i >= 0) arr.splice(i, 1); } else if (i >= 0) arr[i] = data; else arr.push(data);
  };
  switch (kind) {
    case 'gym': upsert(S.gyms); touched.add('gyms'); break;
    case 'exercise': upsert(S.exercises); touched.add('exercises'); break;
    case 'template': upsert(S.templates); touched.add('templates'); break;
    case 'bodyweight': upsert(S.bodyweight); touched.add('bodyweight'); break;
    case 'meta': if (data === undefined) delete S.meta[id]; else S.meta[id] = data; touched.add('meta'); break;
    case 'prefs':
      if (data) {
        PREF_KEYS.forEach((k) => { if (k in data) S.settings[k] = data[k]; });
        S.deletedLib = data.deletedLib || [];
        touched.add('settings');
        touched.add('deletedLib');
      }
      break;
    case 'session': if (data === undefined) await deleteSession(id); else await putSession(data); break;
    case 'photo':
      if (data === undefined) {
        if (photoKeys.has(id)) await deletePhoto(id);
        forgetPhoto(id);
      } else {
        const blob = await downloadPhoto(id);
        if (!blob) return false;
        await putPhoto(id, blob, data.rev);
        forgetPhoto(id);
      }
      break;
    default: return false;
  }
  return true;
}

// Eén record van de server verwerken. Geeft true als er lokaal iets veranderd is.
async function applyIncoming(r, preferRemote, touched) {
  const H = st.hashes[r.kind] || (st.hashes[r.kind] = {});
  const local = getLocal(r.kind, r.id);
  const lh = local === undefined ? null : hashOf(local);
  const rh = r.deleted || r.data == null ? null : hashOf(r.data);
  const remember = () => { if (rh === null) delete H[r.id]; else H[r.id] = rh; };
  if (lh === rh) { remember(); return false; }
  const last = H[r.id] === undefined ? null : H[r.id];
  if (lh !== last && !preferRemote) return false; // lokaal gewijzigd: lokale versie wint en wordt hierna verstuurd
  const ok = await setLocal(r.kind, r.id, rh === null ? undefined : r.data, touched);
  if (ok) remember();
  return ok;
}

async function fetchPage(cursor) {
  const q = '/rest/v1/records?select=kind,id,data,deleted,server_ts&order=server_ts.asc&limit=500'
    + (cursor ? '&server_ts=gt.' + encodeURIComponent(cursor) : '');
  return (await api(q)) || [];
}

async function pull(preferRemote) {
  let applied = 0;
  for (;;) {
    const rows = await fetchPage(st.cursor);
    const touched = new Set();
    await quietly(async () => {
      for (const r of rows) if (await applyIncoming(r, preferRemote, touched)) applied++;
      if (touched.size) await persist(...touched);
    });
    if (touched.has('exercises')) invalidateEx();
    if (rows.length) st.cursor = rows[rows.length - 1].server_ts;
    await saveSt();
    if (rows.length < 500) break;
  }
  return applied;
}

async function push() {
  const cur = collect();
  const rows = [];
  for (const kind of KINDS) {
    const m = cur[kind];
    const H = st.hashes[kind] || (st.hashes[kind] = {});
    for (const [id, data] of m) {
      const h = hashOf(data);
      if (H[id] !== h) rows.push({ kind, id, data, deleted: false, h });
    }
    for (const id of Object.keys(H)) if (!m.has(id)) rows.push({ kind, id, data: null, deleted: true, h: null });
  }
  if (!rows.length) return 0;
  // Foto-bestanden eerst, zodat een ander apparaat nooit een foto-record zonder bestand ziet
  for (const r of rows) {
    if (r.kind !== 'photo') continue;
    const path = '/storage/v1/object/photos/' + photoPath(r.id);
    if (r.deleted) {
      await api(path, { method: 'DELETE' }).catch((e) => { if (e.status !== 404 && e.status !== 400) throw e; });
    } else {
      const blob = await getPhoto(r.id);
      if (!blob) { r.skip = true; continue; }
      await api(path, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg', 'x-upsert': 'true' } });
    }
  }
  const todo = rows.filter((r) => !r.skip);
  const now = Date.now();
  for (let i = 0; i < todo.length; i += 100) {
    const chunk = todo.slice(i, i + 100);
    await api('/rest/v1/records', {
      method: 'POST',
      body: chunk.map((r) => ({ kind: r.kind, id: r.id, data: r.data, deleted: r.deleted, updated_at: now })),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    chunk.forEach((r) => { if (r.deleted) delete st.hashes[r.kind][r.id]; else st.hashes[r.kind][r.id] = r.h; });
    await saveSt();
  }
  return todo.length;
}

const saveSt = () => setKv('sync', st);

function isPristine() {
  return !S.sessions.length && !S.templates.length && !S.bodyweight.length && !Object.keys(S.meta).length
    && !photoKeys.size && !S.exercises.some((e) => e.custom);
}

async function clearLocal() {
  S.gyms = [];
  S.templates = [];
  S.bodyweight = [];
  S.meta = {};
  S.deletedLib = [];
  S.exercises = S.exercises.filter((e) => e.lib);
  await clearSessions();
  for (const k of [...photoKeys]) { await deletePhoto(k); forgetPhoto(k); }
  await persist('gyms', 'templates', 'bodyweight', 'meta', 'deletedLib', 'exercises');
  invalidateEx();
}

// Samenvoegen: gyms en eigen oefeningen met dezelfde naam als in het account worden één.
async function remapDuplicates(live) {
  const rg = live.filter((r) => r.kind === 'gym').map((r) => r.data);
  const re = live.filter((r) => r.kind === 'exercise').map((r) => r.data);
  const G = {};
  const E = {};
  for (const g of S.gyms) { const m = rg.find((x) => normName(x.name) === normName(g.name)); if (m && m.id !== g.id) G[g.id] = m.id; }
  for (const e of S.exercises) { if (e.lib) continue; const m = re.find((x) => normName(x.name) === normName(e.name)); if (m && m.id !== e.id) E[e.id] = m.id; }
  if (!Object.keys(G).length && !Object.keys(E).length) return;
  const g = (id) => G[id] || id;
  const x = (id) => E[id] || id;
  S.gyms = S.gyms.filter((z) => !G[z.id]);
  S.exercises = S.exercises.filter((z) => !E[z.id]);
  for (const s of [...S.sessions]) {
    const ns = { ...s, gymId: g(s.gymId), items: s.items.map((it) => ({ ...it, exerciseId: x(it.exerciseId) })) };
    if (stable(ns) !== stable(s)) await putSession(ns);
  }
  S.templates = S.templates.map((tp) => ({
    ...tp,
    gymId: tp.gymId ? g(tp.gymId) : tp.gymId,
    items: tp.items.map((it) => ({
      ...it,
      exerciseId: x(it.exerciseId),
      alts: Object.fromEntries(Object.entries(it.alts || {}).map(([k, v]) => [g(k), x(v)])),
    })),
  }));
  const rekey = (k) => { const [a, b] = k.split('|'); return x(a) + '|' + (b === '-' ? b : g(b)); };
  S.meta = Object.fromEntries(Object.entries(S.meta).map(([k, v]) => [rekey(k), v]));
  for (const k of [...photoKeys]) {
    const nk = rekey(k);
    if (nk === k) continue;
    const b = await getPhoto(k);
    if (b) await putPhoto(nk, b);
    await deletePhoto(k);
    forgetPhoto(k);
  }
  if (S.settings.gymId) S.settings.gymId = g(S.settings.gymId);
  if (S.active) {
    S.active.gymId = g(S.active.gymId);
    S.active.items.forEach((it) => { it.exerciseId = x(it.exerciseId); it.origExId = x(it.origExId); });
  }
  await persist('gyms', 'exercises', 'templates', 'meta', 'settings', 'active');
  invalidateEx();
}

async function fetchAll() {
  const all = [];
  let cursor = null;
  for (;;) {
    const rows = await fetchPage(cursor);
    all.push(...rows);
    if (rows.length < 500) break;
    cursor = rows[rows.length - 1].server_ts;
  }
  return all;
}

// Eerste keer dit account op dit toestel
async function initialSync() {
  const rows = await fetchAll();
  const live = rows.filter((r) => !r.deleted && r.data != null);
  st.hashes = {};
  if (live.length) {
    let mode = 'remote';
    if (!isPristine()) {
      mode = await choose({
        title: t('syncChoiceTitle'),
        text: t('syncChoiceText'),
        options: [
          { label: t('syncMerge'), value: 'merge', primary: true },
          { label: t('syncUseAccount'), value: 'remote' },
          { label: t('syncCancelLogin'), value: null },
        ],
      });
      if (!mode) { await logout(); return false; }
    }
    await quietly(async () => {
      if (mode === 'remote') await clearLocal(); else await remapDuplicates(live);
      const touched = new Set();
      for (const r of rows) await applyIncoming(r, true, touched);
      if (touched.size) await persist(...touched);
    });
    invalidateEx();
    ensureLibrary();
    if (!S.gyms.some((g) => g.id === S.settings.gymId)) {
      S.settings.gymId = S.gyms[0] ? S.gyms[0].id : null;
      await persist('settings');
    }
  }
  st.cursor = rows.length ? rows[rows.length - 1].server_ts : null;
  st.initialized = true;
  await saveSt();
  refreshUi(true);
  return true;
}

let running = null;
let again = false;
let timer = null;

export function scheduleSync(ms = 2500) {
  if (!auth) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow(); }, ms);
}

export function syncNow() {
  if (!auth) return Promise.resolve();
  if (running) { again = true; return running; }
  running = (async () => {
    setStatus('syncing');
    try {
      if (!st || st.userId !== auth.user.id) {
        st = { userId: auth.user.id, cursor: null, hashes: {}, lastSync: null, initialized: false };
        await saveSt();
      }
      if (!st.initialized && !(await initialSync())) return;
      const applied = await pull(false);
      await push();
      st.lastSync = Date.now();
      await saveSt();
      setStatus('ok');
      if (applied) refreshUi();
    } catch (e) {
      console.warn('sync', e);
      if (!auth) setStatus('expired');
      else setStatus(e.code === 'offline' ? 'offline' : 'error', errorText(e));
    } finally {
      running = null;
      if (again && auth) { again = false; scheduleSync(800); }
    }
  })();
  return running;
}

function afterLogin() {
  setStatus('syncing');
  syncNow();
}

// Scherm bijwerken na binnengekomen wijzigingen, maar niet tijdens het typen of in een lopende workout
function refreshUi(force) {
  const el = document.activeElement;
  const typing = el && el.matches && el.matches('input, textarea, select');
  if (typing && !force) return;
  if (route.name === 'workout' && !force) return;
  render();
}

export function statusText() {
  if (!auth) return status.state === 'expired' ? t('syncExpired') : t('syncOff');
  if (status.state === 'syncing') return t('syncBusy');
  if (status.state === 'offline') return t('syncOffline');
  if (status.state === 'error') return t('syncError', { msg: status.error || '' });
  const ls = lastSyncAt();
  if (!ls) return t('syncPending');
  const min = Math.round((Date.now() - ls) / 60000);
  if (min < 1) return t('syncDoneNow');
  if (min < 60) return t('syncDoneMin', { n: min });
  return t('syncDoneWhen', { when: relDay(ls) });
}

export async function initCloud() {
  auth = await getKv('auth');
  st = await getKv('sync');
  setChangeHook(() => scheduleSync(2500));
  window.addEventListener('online', () => scheduleSync(500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(800); });
  setInterval(() => { if (document.visibilityState === 'visible') scheduleSync(0); }, 120000);
  onStatus(() => {
    document.querySelectorAll('[data-sync-status]').forEach((e) => { e.textContent = statusText(); });
  });
  if (auth) scheduleSync(1200);
}
