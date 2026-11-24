// Oefeningen: lijst en detail (historie, grafiek, records, standen per gym).
import { S, persist } from '../store.js';
import { A, IN, registerView, render, go, back } from '../core.js';
import { t } from '../i18n.js';
import { esc, icon, fmtSet, fmtNum, fmtDate, relDay, normName, fmtRest } from '../util.js';
import {
  exById, gymName, gymColor, exSessions, records, lastByExercise, effKg, e1rm, isWork, setLabel,
  getMeta, invalidateEx, restFor,
} from '../logic.js';
import { MUSCLES } from '../library.js';
import { navBar, notFound, muscleLabel, equipLabel, metaChips, openExerciseForm, openMetaEditor, pickRest } from './shared.js';
import { lineChart } from '../charts.js';
import { actionSheet, confirmDialog, toast } from '../ui.js';
import { exThumb, muscleMapPair, photoImg, photoInput, hasPhoto } from '../visual.js';
import { metaKey } from '../logic.js';

function visualCard(ex) {
  const tiles = S.gyms.map((g) => {
    const name = `<span class="ptile-name">${esc(g.name)}</span>`;
    if (hasPhoto(ex.id, g.id)) return `<button class="ptile" data-a="exVisual" data-id="${ex.id}" data-gym="${g.id}" data-details="0">${photoImg(metaKey(ex.id, g.id))}${name}</button>`;
    return `<label class="ptile add">${icon('camera')}<span class="ptile-add">${t('addPhoto')}</span>${name}${photoInput(ex.id, g.id)}</label>`;
  }).join('');
  return `<div class="card ex-visual">${muscleMapPair(ex)}<div class="ptile-row">${tiles}</div></div>`;
}

// ---------- Lijst ----------
let q = '';
let muscle = null;
let scope = null;

function listHTML() {
  const last = lastByExercise();
  const nq = normName(q);
  let sc = scope;
  if (!sc) sc = S.exercises.some((e) => e.custom || last.has(e.id)) ? 'mine' : 'all';
  let list = S.exercises.filter((e) => (sc === 'all' || e.custom || last.has(e.id)) && (!muscle || e.muscle === muscle) && (!nq || normName(e.name).includes(nq)));
  list.sort((a, b) => a.name.localeCompare(b.name));
  if (!list.length) return `<p class="muted center pad">${t('noExFound')}</p>`;
  return list.map((e) => {
    const l = last.get(e.id);
    let right = '';
    if (l) {
      const work = l.item.sets.filter(isWork);
      const top = (work.length ? work : l.item.sets).reduce((a, b) => ((b.kg || 0) > (a.kg || 0) ? b : a));
      right = `<div class="lr-val"><div>${esc(fmtSet(top))}</div><div class="muted small">${esc(relDay(l.session.start))}</div></div>`;
    }
    return `<button class="list-row" data-a="openEx" data-id="${e.id}">${exThumb(e.id, S.settings.gymId, 'sm')}<div class="lr-main"><div class="lr-title">${esc(e.name)}</div><div class="muted small">${muscleLabel(e.muscle)} · ${equipLabel(e.equip)}</div></div>${right}${icon('chevR', 'sm muted')}</button>`;
  }).join('');
}

registerView('exercises', () => {
  const last = lastByExercise();
  const sc = scope || (S.exercises.some((e) => e.custom || last.has(e.id)) ? 'mine' : 'all');
  return `<header class="big-head"><h1>${t('tabExercises')}</h1><button class="icon-btn accent" data-a="exNew" aria-label="${t('newExercise')}">${icon('plus')}</button></header>
    <div class="search"><span>${icon('search')}</span><input data-in="exSearch" value="${esc(q)}" placeholder="${t('searchEx')}" autocomplete="off" autocorrect="off" spellcheck="false"></div>
    <div class="seg"><button class="${sc === 'mine' ? 'on' : ''}" data-a="exScope" data-s="mine">${t('myExercises')}</button><button class="${sc === 'all' ? 'on' : ''}" data-a="exScope" data-s="all">${t('allExercises')}</button></div>
    <div class="chips-scroll">${['all', ...MUSCLES].map((m) => `<button class="fchip ${(m === 'all' && !muscle) || m === muscle ? 'on' : ''}" data-a="exMuscle" data-m="${m}">${m === 'all' ? t('all') : muscleLabel(m)}</button>`).join('')}</div>
    <div class="list-card" id="ex-list">${listHTML()}</div>`;
}, { tab: 'exercises' });

IN.exSearch = (el) => { q = el.value; const l = document.getElementById('ex-list'); if (l) l.innerHTML = listHTML(); };
A.exScope = (el) => { scope = el.dataset.s; render(); };
A.exMuscle = (el) => { muscle = el.dataset.m === 'all' ? null : el.dataset.m; render(); };
A.exNew = () => openExerciseForm({ name: q, onSave: (ex) => go('ex/' + ex.id) });
A.openEx = (el) => go('ex/' + el.dataset.id);

// ---------- Detail ----------
let d = { id: null, gym: 'all', tab: 'history', metric: 'e1rm' };

function sessionPoint(s, it, metric) {
  const work = it.sets.filter((x) => isWork(x) && x.reps);
  if (!work.length) return null;
  let best = null; let val = 0;
  for (const x of work) {
    const kg = effKg(x, it.exerciseId, s.gymId) || 0;
    const v = metric === 'e1rm' ? e1rm(kg, x.reps) : metric === 'kg' ? kg : kg * x.reps;
    if (metric === 'vol') val += v;
    else if (v > val) { val = v; best = x; }
  }
  if (!best) best = work.reduce((a, b) => ((b.kg || 0) > (a.kg || 0) ? b : a));
  return { val, best };
}

function chartHTML(id) {
  const gyms = d.gym === 'all' ? S.gyms.map((g) => g.id) : [d.gym];
  const unit = d.metric === 'vol' ? 'kg' : 'kg';
  const series = gyms.map((gid) => {
    const points = exSessions(id, gid).map(({ session: s, item }) => {
      const p = sessionPoint(s, item, d.metric);
      if (!p) return null;
      const valTxt = `${fmtNum(Math.round(p.val * 10) / 10)} ${unit}`;
      return { x: s.start, y: p.val, tip: `<b>${esc(valTxt)}</b><span>${esc(fmtDate(s.start, true))} · ${esc(gymName(gid))}</span><span>${esc(t('bestSet'))}: ${esc(fmtSet(p.best))}</span>` };
    }).filter(Boolean);
    return { name: gymName(gid), color: gymColor(gid), points };
  }).filter((s) => s.points.length);
  const mlabel = { e1rm: t('metricE1rm'), kg: t('metricKg'), vol: t('metricVol') };
  return `<div class="card">
    <div class="seg small">${['e1rm', 'kg', 'vol'].map((m) => `<button class="${d.metric === m ? 'on' : ''}" data-a="exdMetric" data-m="${m}">${mlabel[m]}</button>`).join('')}</div>
    <p class="chart-title">${mlabel[d.metric]}${d.metric === 'e1rm' ? ` <span class="muted small">(${t('e1rmExplain')})</span>` : ''}</p>
    ${lineChart({ series, xFmt: (x) => fmtDate(x), emptyText: t('noDataGym') })}
    <p class="hint">${t('chartHint')}</p></div>`;
}

function historyHTML(id) {
  const list = exSessions(id, d.gym === 'all' ? null : d.gym);
  if (!list.length) return `<p class="muted center pad">${d.gym === 'all' ? t('noHistoryEx') : t('noHistoryGym')}</p>`;
  return list.map(({ session: s, item }) => `<div class="card hist-entry">
    <div class="he-top"><button class="link strong" data-a="openSession" data-id="${s.id}">${esc(fmtDate(s.start, true))}</button><span class="muted small"><i class="gym-dot" style="background:${gymColor(s.gymId)}"></i>${esc(gymName(s.gymId) || t('noGym'))}${s.imported ? ' · ' + t('imported') : ''}</span></div>
    ${metaChips(item.meta)}
    ${item.note ? `<div class="ex-note">${icon('note', 'xs')} ${esc(item.note)}</div>` : ''}
    <div class="hist-sets">${item.sets.map((x, j) => `<div class="hs-row"><span class="set-type t-${x.type}">${setLabel(item.sets, j)}</span><span class="hs-val">${esc(fmtSet(x))}</span>${x.reps && x.kg ? `<span class="muted small hs-1rm">1RM ≈ ${fmtNum(Math.round(e1rm(effKg(x, id, s.gymId), x.reps)))}</span>` : ''}${x.pr ? `<span class="pr-mini">${icon('trophy', 'xs')} PR</span>` : ''}</div>${x.note ? `<div class="set-note">${icon('note', 'xs')} ${esc(x.note)}</div>` : ''}`).join('')}</div>
  </div>`).join('');
}

function recordsHTML(id) {
  const r = records(id, d.gym === 'all' ? null : d.gym);
  if (!r.maxKg) return `<p class="muted center pad">${t('noRecords')}</p>`;
  const tile = (label, val, sub) => `<div class="rec"><div class="rec-l">${label}</div><div class="rec-v">${val}</div><div class="muted small">${sub}</div></div>`;
  const reps = Object.keys(r.reps).map(Number).sort((a, b) => a - b);
  return `<div class="rec-grid">
      ${tile(t('recHeaviest'), `${fmtNum(r.maxKg.kg)} kg`, `× ${r.maxKg.reps} · ${esc(fmtDate(r.maxKg.t, true))}`)}
      ${tile(t('recE1rm'), `${fmtNum(Math.round(r.maxE1rm.v * 10) / 10)} kg`, `${fmtNum(r.maxE1rm.kg)} × ${r.maxE1rm.reps} · ${esc(fmtDate(r.maxE1rm.t, true))}`)}
      ${tile(t('recVolume'), `${fmtNum(Math.round(r.maxVol.v))} kg`, `${fmtNum(r.maxVol.kg)} × ${r.maxVol.reps}`)}
      ${tile(t('recSessions'), r.count, d.gym === 'all' ? t('allGyms') : esc(gymName(d.gym)))}
    </div>
    <div class="card"><h3 class="card-h">${t('repRecords')}</h3>
      <table class="rep-table"><thead><tr><th>${t('colReps')}</th><th>${t('bestWeight')}</th><th>${t('date')}</th></tr></thead>
      <tbody>${reps.map((n) => `<tr><td>${n}</td><td><b>${fmtNum(r.reps[n].kg)} kg</b></td><td class="muted">${esc(fmtDate(r.reps[n].t, true))}</td></tr>`).join('')}</tbody></table></div>`;
}

function settingsHTML(id) {
  const gyms = d.gym === 'all' ? S.gyms : S.gyms.filter((g) => g.id === d.gym);
  return gyms.map((g) => {
    const m = getMeta(id, g.id);
    const has = m.fields.length || m.note || m.plusKg || m.step;
    return `<div class="card">
      <div class="card-head"><h3><i class="gym-dot" style="background:${gymColor(g.id)}"></i>${esc(g.name)}</h3><button class="link" data-a="exdMeta" data-gym="${g.id}">${has ? t('edit') : t('add')}</button></div>
      ${has ? `${metaChips(m)}<div class="muted small meta-extra">${m.plusKg ? `${t('plusWeight')}: ${fmtNum(m.plusKg)} kg` : ''}${m.plusKg && m.step ? ' · ' : ''}${m.step ? `${t('stepKg')}: ${fmtNum(m.step)} kg` : ''}</div>` : `<p class="muted small">${t('noSettingsYet')}</p>`}
    </div>`;
  }).join('') + `<p class="hint">${t('settingsHint')}</p>`;
}

registerView('ex', (id) => {
  const ex = exById(id);
  if (!ex) return notFound();
  if (d.id !== id) d = { id, gym: S.settings.prevByGym && S.settings.gymId ? S.settings.gymId : 'all', tab: 'history', metric: 'e1rm' };
  const tabs = [['history', t('tabHist')], ['chart', t('tabChart')], ['records', t('tabRecords')], ['settings', t('tabSettings')]];
  const body = d.tab === 'chart' ? chartHTML(id) : d.tab === 'records' ? recordsHTML(id) : d.tab === 'settings' ? settingsHTML(id) : historyHTML(id);
  return `${navBar({ title: ex.name, right: `<button class="icon-btn" data-a="exdMenu" data-id="${id}" aria-label="${t('more')}">${icon('more')}</button>` })}
    <div class="exd-sub muted">${muscleLabel(ex.muscle)} · ${equipLabel(ex.equip)} · ${icon('timer', 'xs')} ${fmtRest(restFor(id))}</div>
    ${visualCard(ex)}
    <div class="chips-scroll">${[['all', t('allGyms')], ...S.gyms.map((g) => [g.id, g.name])].map(([gid, name]) => `<button class="fchip ${d.gym === gid ? 'on' : ''}" data-a="exdGym" data-g="${gid}">${gid !== 'all' ? `<i class="gym-dot" style="background:${gymColor(gid)}"></i>` : ''}${esc(name)}</button>`).join('')}</div>
    <div class="seg">${tabs.map(([k, l]) => `<button class="${d.tab === k ? 'on' : ''}" data-a="exdTab" data-t="${k}">${l}</button>`).join('')}</div>
    ${body}`;
}, { tab: 'exercises' });

A.exdGym = (el) => { d.gym = el.dataset.g; render(); };
A.exdTab = (el) => { d.tab = el.dataset.t; render(); };
A.exdMetric = (el) => { d.metric = el.dataset.m; render(); };
A.exdMeta = (el) => openMetaEditor(d.id, el.dataset.gym, () => render());

A.exdMenu = async (el) => {
  const ex = exById(el.dataset.id);
  const v = await actionSheet({
    title: ex.name,
    options: [
      { label: t('editExercise'), value: 'edit', icon: 'note' },
      { label: t('restTimeN', { t: fmtRest(restFor(ex.id)) }), value: 'rest', icon: 'timer' },
      { label: t('deleteExercise'), value: 'del', icon: 'trash', danger: true },
    ],
  });
  if (v === 'edit') openExerciseForm({ ex, onSave: () => render() });
  else if (v === 'rest') {
    const sec = await pickRest(restFor(ex.id));
    if (sec) { ex.rest = sec; persist('exercises'); render(); }
  } else if (v === 'del') {
    const used = S.sessions.some((s) => s.items.some((it) => it.exerciseId === ex.id))
      || S.templates.some((tp) => tp.items.some((it) => it.exerciseId === ex.id || Object.values(it.alts || {}).includes(ex.id)))
      || (S.active && S.active.items.some((it) => it.exerciseId === ex.id));
    if (used) { toast(t('exInUse')); return; }
    const ok = await confirmDialog({ title: t('deleteExerciseQ'), text: ex.name, ok: t('delete'), danger: true });
    if (!ok) return;
    S.exercises = S.exercises.filter((x) => x.id !== ex.id);
    if (ex.lib) { S.deletedLib = [...(S.deletedLib || []), ex.id]; persist('deletedLib'); }
    invalidateEx();
    persist('exercises');
    back('exercises');
  }
};
