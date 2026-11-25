// Vrienden-tab, profiel van een vriend en workout van een vriend.
import { S, persist } from '../store.js';
import { A, registerView, render, go, back, route } from '../core.js';
import { t } from '../i18n.js';
import { esc, icon, uid, fmtSet, fmtNum, fmtBig, fmtDate, fmtDateLong, fmtTime, fmtDurShort, relDay, isoWeek, weekStart, addDays, normName } from '../util.js';
import { exById, invalidateEx, setLabel, e1rm, isWork } from '../logic.js';
import { navBar, metaChips, muscleLabel } from './shared.js';
import { thumbForEx } from '../visual.js';
import { columnChart, lineChart } from '../charts.js';
import { actionSheet, confirmDialog, toast } from '../ui.js';
import * as cloud from '../cloud.js';
import * as fr from '../friends.js';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
let addMsg = null; // { ok, text }
let unMsg = null;
let busy = false;

const rerender = (names) => () => { if (names.includes(route.name)) render(); };

function avatar(id, cls = '') {
  const name = fr.nameOf(id);
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="avatar ${cls}" style="background:hsl(${h},55%,42%)">${esc((name[0] || '?').toUpperCase())}</span>`;
}
const handle = (id) => { const p = fr.profileOf(id); return p ? '@' + p.username : ''; };

function errText(e) {
  if (!e) return '';
  if (e.code === 'offline') return t('friendsOffline');
  const map = { user_not_found: 'userNotFound', already_friends: 'alreadyFriends', already_requested: 'alreadyRequested', username_taken: 'usernameTaken' };
  return map[e.code] ? t(map[e.code]) : cloud.errorText(e);
}

function sessStats(s) {
  let sets = 0; let vol = 0;
  for (const it of s.items || []) for (const st of it.sets || []) {
    if (!isWork(st)) continue;
    sets++;
    vol += (st.kg || 0) * (st.reps || 0);
  }
  return { sets, vol, dur: s.end ? s.end - s.start : 0 };
}

function fExName(d, exId) {
  const e = (d && d.ex && d.ex.get(exId)) || exById(exId);
  return e ? e.name : '?';
}

// ---------- Kaarten ----------
function feedCard(uidF, s) {
  const d = fr.F.data[uidF] || {};
  const st = sessStats(s);
  const names = (s.items || []).slice(0, 4).map((it) => esc(fExName(d, it.exerciseId)));
  const prs = (s.items || []).reduce((n, it) => n + (it.sets || []).filter((x) => x.pr).length, 0);
  return `<div class="card sess feed" data-a="openFSession" data-f="${uidF}" data-id="${esc(s.id)}">
    <div class="feed-top">${avatar(uidF)}<div class="feed-who"><b>${esc(fr.nameOf(uidF))}</b><span class="muted small">${esc(relDay(s.start))} · ${fmtTime(s.start)}</span></div>${prs ? `<span class="pr-badge">${icon('trophy', 'xs')} ${prs}</span>` : ''}</div>
    <div class="sess-name">${esc(s.name || 'Workout')}</div>
    <div class="sess-stats"><span>${icon('clock', 'xs')} ${fmtDurShort(st.dur)}</span><span>${st.sets} sets</span><span>${fmtBig(st.vol)} kg</span></div>
    ${names.length ? `<div class="sess-ex muted small">${names.join(' · ')}${(s.items || []).length > 4 ? ' · …' : ''}</div>` : ''}
  </div>`;
}

function usernameForm() {
  return `<div class="card">
    <h3 class="card-h">${icon('user', 'sm')} ${t('chooseUsername')}</h3>
    <p class="muted small">${t('usernameHint')}</p>
    <label class="field"><span>${t('username')}</span><div class="at-input"><span>@</span><input id="un-name" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" maxlength="20" placeholder="${t('usernamePh')}"></div></label>
    <label class="field"><span>${t('displayNameOpt')}</span><input id="un-display" maxlength="40" placeholder="${t('displayNamePh')}" autocomplete="off"></label>
    ${unMsg ? `<p class="${unMsg.ok ? 'ok-box' : 'error-box'}">${icon(unMsg.ok ? 'check' : 'warn', 'sm')}<span>${esc(unMsg.text)}</span></p>` : ''}
    <button class="btn primary btn-block" data-a="unSave" ${busy ? 'disabled' : ''}>${busy ? t('busy') : t('save')}</button>
  </div>`;
}

// ---------- Vrienden-tab ----------
registerView('friends', () => {
  const head = `<header class="big-head"><h1>${t('tabFriends')}</h1>${fr.F.profile ? `<button class="icon-btn" data-a="go" data-to="account" aria-label="${t('friendsSettings')}">${icon('sliders')}</button>` : ''}</header>`;
  if (!cloud.loggedIn()) {
    return `${head}<div class="empty card">${icon('users', 'lg')}<h3>${t('friendsLoginTitle')}</h3><p class="muted">${t('friendsLoginText')}</p><div class="empty-btns"><button class="btn primary" data-a="go" data-to="account">${t('accountLogin')}</button></div></div>`;
  }
  const F = fr.F;
  // Alleen automatisch laden als er geen fout openstaat (anders blijft hij eindeloos proberen)
  if (!F.loading && !F.error && (!F.loadedAt || Date.now() - F.loadedAt > 30000)) {
    fr.loadAll().then(rerender(['friends']));
  }
  if (!F.loadedAt) {
    if (F.error) {
      return `${head}<div class="card center pad"><p class="muted">${esc(errText(F.error))}</p><button class="btn secondary" data-a="frRefresh">${icon('refresh', 'sm')} ${t('retry')}</button></div>`;
    }
    return `${head}<p class="muted center pad">${t('loading')}</p>`;
  }
  if (!F.profile) return `${head}${usernameForm()}`;
  const inc = fr.pendingIn();
  const out = fr.pendingOut();
  const ids = fr.friendIds().sort((a, b) => (fr.weekInfo(b).last || 0) - (fr.weekInfo(a).last || 0));
  return `${head}
    <div class="me-line muted small">${t('youAre')} <b>@${esc(F.profile.username)}</b></div>
    <div class="card add-friend">
      <div class="af-row"><div class="at-input grow"><span>@</span><input id="af-name" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" placeholder="${t('addFriendPh')}"></div>
      <button class="btn small primary" data-a="frAdd" ${busy ? 'disabled' : ''}>${icon('userPlus', 'sm')} ${t('friendAdd')}</button></div>
      ${addMsg ? `<p class="${addMsg.ok ? 'ok-box' : 'error-box'}">${icon(addMsg.ok ? 'check' : 'warn', 'sm')}<span>${esc(addMsg.text)}</span></p>` : ''}
    </div>
    ${inc.length ? `<h2 class="list-h">${t('incomingRequests')}</h2><div class="list-card">${inc.map((f) => `<div class="list-row">${avatar(f.requester)}<span class="lr-main">${esc(fr.nameOf(f.requester))}<small>${esc(handle(f.requester))} · ${t('wantsFriend')}</small></span>
      <button class="btn small primary" data-a="frAccept" data-id="${f.requester}">${t('accept')}</button><button class="icon-btn" data-a="frDecline" data-id="${f.requester}" aria-label="${t('decline')}">${icon('x', 'sm')}</button></div>`).join('')}</div>` : ''}
    <h2 class="list-h">${t('myFriends')}${ids.length ? ` (${ids.length})` : ''}</h2>
    ${ids.length ? `<div class="list-card">${ids.map((id) => {
      const w = fr.weekInfo(id);
      const sub = w.last ? `${t('friendLast', { when: relDay(w.last) })} · ${t('friendThisWeek', { n: w.thisWeek })}` : t('friendNever');
      return `<button class="list-row" data-a="openFriend" data-id="${id}">${avatar(id)}<span class="lr-main">${esc(fr.nameOf(id))}<small>${esc(sub)}</small></span>${w.streak ? `<span class="streak">${icon('flame', 'flame')}${w.streak}</span>` : ''}${icon('chevR', 'sm muted')}</button>`;
    }).join('')}</div>` : `<p class="muted small pad-s">${t('noFriendsYet')}</p>`}
    ${out.length ? `<h2 class="list-h">${t('outgoingRequests')}</h2><div class="list-card">${out.map((f) => `<div class="list-row">${avatar(f.addressee)}<span class="lr-main">${esc(fr.nameOf(f.addressee))}<small>${esc(handle(f.addressee))} · ${t('requestPending')}</small></span><button class="btn small secondary" data-a="frDecline" data-id="${f.addressee}">${t('cancelRequest')}</button></div>`).join('')}</div>` : ''}
    ${ids.length ? `<div class="section-head"><h2>${t('recentWorkouts')}</h2><button class="link" data-a="frRefresh">${icon('refresh', 'sm')} ${t('refresh')}</button></div>
      ${(F.feed || []).length ? F.feed.map((x) => feedCard(x.user_id, { ...x.data, id: x.id })).join('') : `<p class="muted center pad">${t('noFeedYet')}</p>`}` : ''}`;
}, { tab: 'friends' });

A.frRefresh = async () => { fr.F.error = null; await fr.loadAll(true); render(); };
A.frRetryFriend = async (el) => {
  const d = fr.F.data[el.dataset.id];
  if (d) d.error = null;
  await fr.loadFriend(el.dataset.id, true);
  render();
};

A.unSave = async () => {
  const name = document.getElementById('un-name').value.trim().toLowerCase();
  const disp = document.getElementById('un-display').value.trim();
  if (!USERNAME_RE.test(name)) { unMsg = { text: t('usernameInvalid') }; render(); return; }
  busy = true; unMsg = null; render();
  try {
    await fr.createProfile(name, disp);
    toast(t('usernameSaved', { name }), 'check');
  } catch (e) {
    unMsg = { text: errText(e) };
  }
  busy = false;
  render();
};

A.frAdd = async () => {
  const input = document.getElementById('af-name');
  const name = input.value.trim().replace(/^@/, '').toLowerCase();
  if (!name) return;
  if (name === fr.F.profile.username) { addMsg = { text: t('cantAddSelf') }; render(); return; }
  busy = true; addMsg = null; render();
  try {
    const r = await fr.sendRequest(name);
    addMsg = { ok: true, text: r === 'accepted' ? t('nowFriends', { name: '@' + name }) : t('requestSent', { name: '@' + name }) };
  } catch (e) {
    addMsg = { text: errText(e) };
  }
  busy = false;
  render();
};

A.frAccept = async (el) => {
  try { await fr.accept(el.dataset.id); toast(t('nowFriends', { name: fr.nameOf(el.dataset.id) }), 'check'); } catch (e) { toast(errText(e)); }
  render();
};
A.frDecline = async (el) => {
  try { await fr.removeFriendship(el.dataset.id); } catch (e) { toast(errText(e)); }
  render();
};
A.openFriend = (el) => go('friend/' + el.dataset.id);
A.openFSession = (el) => go(`fsession/${el.dataset.f}/${encodeURIComponent(el.dataset.id)}`);

// ---------- Profiel van een vriend ----------
let ftab = 'workouts';
let ftabFor = null;

function recordsFor(d) {
  const by = new Map();
  for (const s of d.allSessions || []) for (const it of s.items || []) {
    for (const st of it.sets || []) {
      if (!isWork(st) || !st.reps || st.kg == null) continue;
      const r = by.get(it.exerciseId) || { n: 0, best: null, heavy: null, sessions: new Set() };
      r.sessions.add(s.id);
      const e = e1rm(st.kg, st.reps);
      if (!r.best || e > r.best.e) r.best = { e, kg: st.kg, reps: st.reps, t: s.start };
      if (!r.heavy || st.kg > r.heavy.kg) r.heavy = { kg: st.kg, reps: st.reps, t: s.start };
      by.set(it.exerciseId, r);
    }
  }
  return [...by.entries()].map(([id, r]) => ({ id, ...r, n: r.sessions.size })).sort((a, b) => b.n - a.n).slice(0, 20);
}

registerView('friend', (id) => {
  const F = fr.F;
  if (!F.loadedAt) {
    if (!F.loading && !F.error) fr.loadAll().then(rerender(['friend']));
    return `${navBar({ title: '' })}<p class="muted center pad">${F.error ? esc(errText(F.error)) : t('loading')}</p>`;
  }
  if (!fr.isFriend(id)) return `${navBar({ title: '' })}<p class="muted center pad">${t('notFriend')}</p>`;
  if (ftabFor !== id) { ftab = 'workouts'; ftabFor = id; }
  const d = F.data[id] || {};
  if (!d.full && !d.loading && !d.error) fr.loadFriend(id).then(rerender(['friend']));
  const share = fr.shareOf(id);
  const w = fr.weekInfo(id);
  const now = Date.now();
  const bars = w.weeks.slice(-12).map((v, i) => {
    const ws = weekStart(addDays(now, -7 * (11 - i)));
    return { label: String(isoWeek(ws)), value: v, tip: `<b>${v} workouts</b><span>${esc(t('weekN', { n: isoWeek(ws) }))}</span>` };
  });
  const tabs = [['workouts', t('tabWorkouts')], ['schemas', t('tabSchemas')], ['records', t('tabRecords')]];
  if (share.bodyweight) tabs.push(['weight', t('tabWeight')]);
  let body = '';
  if (d.error && !d.full) body = `<div class="card center pad"><p class="muted">${esc(errText(d.error))}</p><button class="btn secondary" data-a="frRetryFriend" data-id="${id}">${icon('refresh', 'sm')} ${t('retry')}</button></div>`;
  else if (!d.full) body = `<p class="muted center pad">${t('loading')}</p>`;
  else if (ftab === 'workouts') {
    body = !share.sessions ? `<p class="muted center pad">${t('notSharedSessions', { name: fr.nameOf(id) })}</p>`
      : d.sessions.length ? d.sessions.slice(0, 50).map((s) => feedCard(id, s)).join('') : `<p class="muted center pad">${t('noSessionsYet')}</p>`;
  } else if (ftab === 'schemas') {
    body = !share.templates ? `<p class="muted center pad">${t('notSharedTemplates', { name: fr.nameOf(id) })}</p>`
      : d.templates.length ? d.templates.map((tp) => `<div class="card tpl">
          <div class="tpl-name">${esc(tp.name)}</div>
          <div class="tpl-sub">${t('nExercises', { n: (tp.items || []).length })} · ${t('nSets', { n: (tp.items || []).reduce((n, it) => n + (it.sets || []).length, 0) })}${tp.gymId && d.gyms.get(tp.gymId) ? ' · ' + esc(d.gyms.get(tp.gymId).name) : ''}</div>
          <div class="tpl-ex">${(tp.items || []).map((it) => esc(fExName(d, it.exerciseId))).join(' · ')}</div>
          <div class="tpl-bottom"><span></span><button class="btn small primary" data-a="frCopyTpl" data-f="${id}" data-tid="${esc(tp.id)}">${icon('copy', 'sm')} ${t('copyTpl')}</button></div>
        </div>`).join('') : `<p class="muted center pad">${t('noSchemasFriend')}</p>`;
  } else if (ftab === 'records') {
    const recs = share.sessions ? recordsFor(d) : [];
    body = !share.sessions ? `<p class="muted center pad">${t('notSharedSessions', { name: fr.nameOf(id) })}</p>`
      : recs.length ? `<div class="list-card">${recs.map((r) => `<div class="list-row">${thumbForEx(d.ex.get(r.id) || exById(r.id), 'sm')}<span class="lr-main">${esc(fExName(d, r.id))}<small>${t('recHeaviest')}: ${fmtNum(r.heavy.kg)} kg × ${r.heavy.reps} · ${r.n}×</small></span><span class="lr-val"><div>${fmtNum(Math.round(r.best.e))} kg</div><div class="muted small">1RM ≈</div></span></div>`).join('')}</div>` : `<p class="muted center pad">${t('noRecords')}</p>`;
  } else if (ftab === 'weight') {
    const pts = d.bodyweight.map((e) => ({ x: e.t, y: e.kg, tip: `<b>${esc(fmtNum(e.kg))} kg</b><span>${esc(fmtDate(e.t, true))}</span>` }));
    body = `<div class="card"><p class="chart-title">${t('bodyweight')} (kg)</p>${lineChart({ series: [{ name: t('bodyweight'), color: 'var(--accent)', points: pts }], xFmt: (x) => fmtDate(x), yFmt: (v) => fmtNum(v), emptyText: t('bwEmpty') })}</div>`;
  }
  return `${navBar({ title: fr.nameOf(id), right: `<button class="icon-btn" data-a="frMenu" data-id="${id}" aria-label="${t('more')}">${icon('more')}</button>` })}
    <div class="friend-head">${avatar(id, 'lg')}<div><div class="fh-name">${esc(fr.nameOf(id))}</div><div class="muted">${esc(handle(id))}</div></div></div>
    <div class="stat-row">
      <div class="stat"><div class="stat-v">${icon('flame', 'flame')}${w.streak}</div><div class="stat-l">${t('weeksStreak')}</div></div>
      <div class="stat"><div class="stat-v">${w.thisWeek}</div><div class="stat-l">${t('thisWeek')}</div></div>
      <div class="stat"><div class="stat-v">${w.total}</div><div class="stat-l">${t('totalWorkouts')}</div></div>
    </div>
    ${share.sessions ? `<div class="card"><p class="chart-title muted small">${t('workoutsPerWeek')}</p>${columnChart({ bars, height: 130 })}</div>` : ''}
    <div class="seg">${tabs.map(([k, l]) => `<button class="${ftab === k ? 'on' : ''}" data-a="frTab" data-t="${k}">${l}</button>`).join('')}</div>
    ${body}`;
}, { tab: 'friends' });

A.frTab = (el) => { ftab = el.dataset.t; render(); };

A.frMenu = async (el) => {
  const id = el.dataset.id;
  const v = await actionSheet({ title: fr.nameOf(id), sub: handle(id), options: [
    { label: t('refresh'), value: 'refresh', icon: 'refresh' },
    { label: t('removeFriend'), value: 'remove', icon: 'trash', danger: true },
  ] });
  if (v === 'refresh') { await fr.loadFriend(id, true); render(); } else if (v === 'remove') {
    const ok = await confirmDialog({ title: t('removeFriendQ', { name: fr.nameOf(id) }), text: t('removeFriendText'), ok: t('removeFriend'), danger: true });
    if (!ok) return;
    try { await fr.removeFriendship(id); toast(t('friendRemoved'), 'check'); back('friends'); } catch (e) { toast(errText(e)); }
  }
};

// Schema van een vriend kopiëren naar je eigen workouts
A.frCopyTpl = (el) => {
  const fid = el.dataset.f;
  const d = fr.F.data[fid];
  const tpl = d && d.templates.find((x) => x.id === el.dataset.tid);
  if (!tpl) return;
  const map = {};
  let created = 0;
  const resolve = (fx) => {
    if (map[fx]) return map[fx];
    const own = exById(fx);
    if (own && own.lib) return (map[fx] = fx);
    const fe = d.ex.get(fx) || own;
    const name = fe ? fe.name : 'Oefening';
    const mine = S.exercises.find((e) => normName(e.name) === normName(name));
    if (mine) return (map[fx] = mine.id);
    const ex = { id: uid(), name, muscle: (fe && fe.muscle) || 'other', equip: (fe && fe.equip) || 'other', custom: true };
    if (fe && Array.isArray(fe.sec)) ex.sec = fe.sec;
    S.exercises.push(ex);
    created++;
    return (map[fx] = ex.id);
  };
  const nt = {
    id: uid(),
    name: `${tpl.name} (${handle(fid)})`,
    gymId: S.settings.gymId || null,
    note: tpl.note || '',
    items: (tpl.items || []).map((it) => ({
      id: uid(),
      exerciseId: resolve(it.exerciseId),
      alts: {},
      supersetId: it.supersetId || null,
      sets: (it.sets || [{ type: 'n' }]).map((s) => (s.reps ? { type: s.type || 'n', reps: s.reps } : { type: s.type || 'n' })),
    })),
  };
  S.templates.push(nt);
  invalidateEx();
  persist('exercises', 'templates');
  toast(created ? t('tplCopiedNew', { n: created }) : t('tplCopied'), 'check');
  go('tpl/' + nt.id);
};

// ---------- Workout van een vriend ----------
registerView('fsession', (fid, sid) => {
  const d = fr.F.data[fid] || {};
  let s = d.sessions && d.allSessions.find((x) => x.id === sid);
  if (!s) {
    const f = (fr.F.feed || []).find((x) => x.user_id === fid && x.id === sid);
    if (f) s = { ...f.data, id: f.id };
  }
  if (!s) {
    if (!d.full && !d.loading && !d.error) fr.loadFriend(fid).then(rerender(['fsession']));
    const txt = d.error ? errText(d.error) : d.loading || !d.full ? t('loading') : t('notFound');
    return `${navBar({ title: '' })}<p class="muted center pad">${esc(txt)}</p>`;
  }
  const st = sessStats(s);
  const share = fr.shareOf(fid);
  const gym = d.gyms && d.gyms.get(s.gymId);
  return `${navBar({ title: s.name || 'Workout' })}
    <div class="feed-top fs-who">${avatar(fid)}<div class="feed-who"><b>${esc(fr.nameOf(fid))}</b><span class="muted small cap-first">${esc(fmtDateLong(s.start))} · ${fmtTime(s.start)}${gym ? ' · ' + esc(gym.name) : ''}</span></div></div>
    <div class="stat-row four">
      <div class="stat"><div class="stat-v">${fmtDurShort(st.dur)}</div><div class="stat-l">${t('duration')}</div></div>
      <div class="stat"><div class="stat-v">${st.sets}</div><div class="stat-l">sets</div></div>
      <div class="stat"><div class="stat-v">${fmtBig(st.vol)}</div><div class="stat-l">kg ${t('volume')}</div></div>
      <div class="stat"><div class="stat-v">${(s.items || []).reduce((n, it) => n + (it.sets || []).filter((x) => x.pr).length, 0)}</div><div class="stat-l">PR's</div></div>
    </div>
    ${(s.items || []).map((it) => {
      const key = it.exerciseId + '|' + s.gymId;
      const hasPhoto = share.photos && d.photos && d.photos.has(key);
      const fe = (d.ex && d.ex.get(it.exerciseId)) || exById(it.exerciseId);
      return `<div class="card">
        <div class="ex-head">${thumbForEx(fe, '', hasPhoto ? `data-fphoto="${fid}|${esc(key)}"` : '')}<span class="ex-name static">${esc(fExName(d, it.exerciseId))}</span></div>
        ${fe ? `<div class="muted small">${muscleLabel(fe.muscle)}</div>` : ''}
        ${metaChips(it.meta)}
        ${it.note ? `<div class="ex-note">${icon('note', 'xs')} ${esc(it.note)}</div>` : ''}
        <div class="hist-sets">${(it.sets || []).map((x, j) => `<div class="hs-row"><span class="set-type t-${x.type}">${setLabel(it.sets, j)}</span><span class="hs-val">${esc(fmtSet(x))}</span>${x.pr ? `<span class="pr-mini">${icon('trophy', 'xs')} PR</span>` : ''}</div>${x.note ? `<div class="set-note">${icon('note', 'xs')} ${esc(x.note)}</div>` : ''}`).join('')}</div>
      </div>`;
    }).join('')}`;
}, {
  tab: 'friends',
  after: () => {
    document.querySelectorAll('img[data-fphoto]').forEach((img) => {
      const [fid, key] = img.dataset.fphoto.split(/\|(.+)/);
      fr.friendPhotoUrl(fid, key).then((u) => { img.src = u; }).catch(() => { img.closest('.thumb').classList.remove('photo'); });
    });
  },
});
