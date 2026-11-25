// Vrienden: profielen, verzoeken en gedeelde gegevens (alleen online, niets wordt lokaal opgeslagen).
import { rest, rpc, myId, loggedIn, storageBlob, photoPathFor, onSynced } from './cloud.js';
import { setBadge, render, route } from './core.js';

export const SHARE_KEYS = ['sessions', 'templates', 'meta', 'photos', 'bodyweight'];
export const DEFAULT_SHARE = { sessions: true, templates: true, meta: false, photos: false, bodyweight: false };

function blank() {
  return { owner: myId(), profile: undefined, friendships: [], profiles: {}, stats: {}, feed: null, loadedAt: 0, loading: null, error: null, data: {} };
}
export const F = blank();
function ensureOwner() {
  if (F.owner !== myId()) { Object.assign(F, blank()); setBadge('friends', 0); }
}

const err = (code) => Object.assign(new Error(code), { code });

export const otherOf = (f) => (f.requester === myId() ? f.addressee : f.requester);
export const pendingIn = () => F.friendships.filter((f) => f.status === 'pending' && f.addressee === myId());
export const pendingOut = () => F.friendships.filter((f) => f.status === 'pending' && f.requester === myId());
export const friendIds = () => F.friendships.filter((f) => f.status === 'accepted').map(otherOf);
export const isFriend = (id) => friendIds().includes(id);
export const profileOf = (id) => F.profiles[id] || null;
export const nameOf = (id) => { const p = F.profiles[id]; return p ? p.display_name || p.username : '?'; };
export const shareOf = (id) => ({ ...DEFAULT_SHARE, ...((F.profiles[id] && F.profiles[id].share) || {}) });

export function weekInfo(id) {
  const s = F.stats[id];
  if (!s) return { total: 0, last: null, thisWeek: 0, streak: 0, weeks: [] };
  const w = s.weeks || [];
  let i = w.length - 1;
  if (i >= 0 && !w[i]) i--;
  let streak = 0;
  while (i >= 0 && w[i] > 0) { streak++; i--; }
  return { total: s.total || 0, last: s.last_start || null, thisWeek: w[w.length - 1] || 0, streak, weeks: w };
}

async function loadBasics(id) {
  const d = F.data[id] || (F.data[id] = { loadedAt: 0 });
  if (d.ex) return;
  const rows = await rpc('friend_data', { friend: id, kinds: ['exercise', 'gym'] });
  d.ex = new Map(rows.filter((r) => r.kind === 'exercise').map((r) => [r.id, r.data]));
  d.gyms = new Map(rows.filter((r) => r.kind === 'gym').map((r) => [r.id, r.data]));
}

export function loadAll(force) {
  ensureOwner();
  if (!loggedIn()) return Promise.resolve();
  if (F.loading) return F.loading;
  if (!force && F.loadedAt && Date.now() - F.loadedAt < 30000) return Promise.resolve();
  F.loading = (async () => {
    try {
      const me = myId();
      const [prof, fr] = await Promise.all([
        rest(`/rest/v1/profiles?select=*&user_id=eq.${me}`),
        rest('/rest/v1/friendships?select=*'),
      ]);
      F.profile = (prof && prof[0]) || null;
      F.friendships = fr || [];
      const ids = [...new Set(F.friendships.map(otherOf))];
      const profiles = {};
      if (ids.length) {
        const ps = await rest(`/rest/v1/profiles?select=user_id,username,display_name,share&user_id=in.(${ids.join(',')})`);
        (ps || []).forEach((p) => { profiles[p.user_id] = p; });
      }
      if (F.profile) profiles[me] = F.profile;
      F.profiles = profiles;
      if (friendIds().length) {
        const [stats, feed] = await Promise.all([rpc('friend_stats'), rpc('friend_feed', { lim: 30 })]);
        F.stats = {};
        (stats || []).forEach((s) => { F.stats[s.user_id] = s; });
        F.feed = feed || [];
        await Promise.all([...new Set(F.feed.map((x) => x.user_id))].map((id) => loadBasics(id).catch(() => {})));
      } else {
        F.stats = {};
        F.feed = [];
      }
      F.loadedAt = Date.now();
      F.error = null;
    } catch (e) {
      F.error = e;
    } finally {
      F.loading = null;
      setBadge('friends', pendingIn().length);
    }
  })();
  return F.loading;
}

export function loadFriend(id, force) {
  ensureOwner();
  const d = F.data[id] || (F.data[id] = { loadedAt: 0 });
  if (d.loading) return d.loading;
  if (!force && d.full && Date.now() - d.loadedAt < 60000) return Promise.resolve();
  d.loading = (async () => {
    try {
      const rows = await rpc('friend_data', { friend: id, kinds: ['session', 'template', 'exercise', 'gym', 'bodyweight', 'meta', 'photo'] });
      const of = (k) => rows.filter((r) => r.kind === k);
      d.allSessions = of('session').map((r) => r.data).sort((a, b) => b.start - a.start);
      d.sessions = d.allSessions.filter((s) => !s.imported);
      d.templates = of('template').map((r) => r.data);
      d.ex = new Map(of('exercise').map((r) => [r.id, r.data]));
      d.gyms = new Map(of('gym').map((r) => [r.id, r.data]));
      d.bodyweight = of('bodyweight').map((r) => r.data).sort((a, b) => a.t - b.t);
      d.meta = Object.fromEntries(of('meta').map((r) => [r.id, r.data]));
      d.photos = new Set(of('photo').map((r) => r.id));
      d.full = true;
      d.loadedAt = Date.now();
      d.error = null;
    } catch (e) {
      d.error = e;
    } finally {
      d.loading = null;
    }
  })();
  return d.loading;
}

// ---------- Acties ----------
export async function createProfile(username, displayName) {
  try {
    const rows = await rest('/rest/v1/profiles', {
      method: 'POST',
      body: { username, display_name: displayName || null, share: DEFAULT_SHARE },
      headers: { Prefer: 'return=representation' },
    });
    F.profile = rows[0];
    F.profiles[myId()] = F.profile;
    return F.profile;
  } catch (e) {
    if (e.status === 409 || e.code === '23505') throw err('username_taken');
    throw e;
  }
}

export async function updateProfile(patch) {
  try {
    const rows = await rest(`/rest/v1/profiles?user_id=eq.${myId()}`, {
      method: 'PATCH',
      body: patch,
      headers: { Prefer: 'return=representation' },
    });
    F.profile = rows[0];
    F.profiles[myId()] = F.profile;
    return F.profile;
  } catch (e) {
    if (e.status === 409 || e.code === '23505') throw err('username_taken');
    throw e;
  }
}

export async function sendRequest(username) {
  const found = await rpc('find_profile', { uname: username });
  if (!found || !found.length) throw err('user_not_found');
  const other = found[0];
  await loadAll(true);
  const existing = F.friendships.find((f) => otherOf(f) === other.user_id);
  if (existing) {
    if (existing.status === 'pending' && existing.addressee === myId()) { await accept(other.user_id); return 'accepted'; }
    throw err(existing.status === 'accepted' ? 'already_friends' : 'already_requested');
  }
  try {
    await rest('/rest/v1/friendships', { method: 'POST', body: { addressee: other.user_id }, headers: { Prefer: 'return=minimal' } });
  } catch (e) {
    if (e.status === 409 || e.code === '23505') throw err('already_requested');
    throw e;
  }
  await loadAll(true);
  return 'sent';
}

export async function accept(otherId) {
  await rest(`/rest/v1/friendships?requester=eq.${otherId}&addressee=eq.${myId()}`, {
    method: 'PATCH',
    body: { status: 'accepted', accepted_at: new Date().toISOString() },
    headers: { Prefer: 'return=minimal' },
  });
  await loadAll(true);
}

export async function removeFriendship(otherId) {
  const me = myId();
  await rest(`/rest/v1/friendships?or=(and(requester.eq.${me},addressee.eq.${otherId}),and(requester.eq.${otherId},addressee.eq.${me}))`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  delete F.data[otherId];
  await loadAll(true);
}

// Foto van een vriend (alleen als die foto's deelt)
const photoCache = new Map();
export async function friendPhotoUrl(friendId, key) {
  const k = friendId + '/' + key;
  if (photoCache.has(k)) return photoCache.get(k);
  const blob = await storageBlob(photoPathFor(friendId, key));
  const u = URL.createObjectURL(blob);
  photoCache.set(k, u);
  return u;
}

// Na elke synchronisatie de vriendenlijst (en het bolletje) bijwerken
onSynced(() => {
  loadAll().then(() => {
    if (['friends', 'friend'].includes(route.name)) {
      const el = document.activeElement;
      if (!(el && el.matches && el.matches('input, textarea'))) render();
    }
  });
});
