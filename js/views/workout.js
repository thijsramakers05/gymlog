// Actieve workout: sets loggen, vorige keer, wisselen, rusttimer, afronden.
import { S, persist, putSession, saveActiveSoon, flushActive } from '../store.js';
import { A, IN, registerView, render, go, route } from '../core.js';
import { t } from '../i18n.js';
import { esc, icon, uid, fmtNum, fmtSet, parseNum, fmtDur, fmtRest, fmtDate, relDay } from '../util.js';
import {
  exById, exName, gymName, getMeta, restFor, stepFor, lastFor, records, effKg, e1rm, isWork,
  setLabel, resolveEx, snapshotMeta, SET_TYPES,
} from '../logic.js';
import { actionSheet, choose, confirmDialog, promptText, toast } from '../ui.js';
import { openPicker, openMetaEditor, pickGym, pickRest, metaChips } from './shared.js';
import { exThumb } from '../visual.js';

const W = () => S.active;

// ---------- Workout starten ----------
function fillSets(base, ps) {
  return base.map((b, i) => {
    const p = ps[i];
    const target = b.reps != null ? b.reps : (b.target != null ? b.target : null);
    return {
      id: uid(),
      type: b.type || 'n',
      kg: p && p.kg != null ? p.kg : null,
      reps: p && p.reps != null ? p.reps : target,
      plus: p ? p.plus || 0 : 0,
      target,
      done: false,
      note: '',
    };
  });
}

export function makeItem(exId, gymId, tplSets, ti) {
  const prev = lastFor(exId, gymId, true);
  const ps = prev ? prev.item.sets : [];
  const base = tplSets && tplSets.length ? tplSets : ps.length ? ps.map((s) => ({ type: s.type })) : [{ type: 'n' }, { type: 'n' }];
  return {
    id: uid(),
    exerciseId: exId,
    origExId: exId,
    tplItemId: ti ? ti.id : null,
    supersetId: ti ? ti.supersetId || null : null,
    note: '',
    sets: fillSets(base, ps),
  };
}

export function startWorkout(tpl) {
  const gymId = S.settings.gymId;
  const items = tpl ? tpl.items.map((ti) => makeItem(resolveEx(tpl, ti, gymId), gymId, ti.sets, ti)) : [];
  S.active = {
    id: uid(),
    templateId: tpl ? tpl.id : null,
    name: tpl ? tpl.name : t('emptyWorkoutName'),
    gymId,
    start: Date.now(),
    items,
    prevAll: {},
    rest: null,
  };
  persist('active');
  go('workout');
}

// ---------- Weergave ----------
function ssLetters(items) {
  const m = {};
  let n = 0;
  items.forEach((it) => { if (it.supersetId && !m[it.supersetId]) m[it.supersetId] = String.fromCharCode(65 + n++); });
  return m;
}

function progressText() {
  const w = W();
  let done = 0; let all = 0;
  w.items.forEach((it) => it.sets.forEach((s) => { all++; if (s.done) done++; }));
  return t('setsProgress', { done, all });
}

function rowHTML(it, s, i, p, showPlus) {
  const prevTxt = p ? fmtSet(p) : '—';
  return `<div class="set-row ${s.done ? 'done' : ''}" data-row="${it.id}:${i}">
    <button class="set-type t-${s.type}" data-a="setMenu" data-item="${it.id}" data-i="${i}">${setLabel(it.sets, i)}</button>
    <button class="prev" data-a="copyPrev" data-item="${it.id}" data-i="${i}" ${p ? '' : 'disabled'}>${esc(prevTxt)}</button>
    <div class="kg-cell"><input class="in" data-in="woKg" data-item="${it.id}" data-i="${i}" inputmode="decimal" value="${fmtNum(s.kg)}" placeholder="${p && p.kg != null ? fmtNum(p.kg) : '–'}" autocomplete="off">${showPlus ? `<button class="plus-btn ${s.plus ? 'on' : ''}" data-a="cyclePlus" data-item="${it.id}" data-i="${i}" aria-label="+">${s.plus ? '+'.repeat(s.plus) : '+'}</button>` : ''}</div>
    <input class="in" data-in="woReps" data-item="${it.id}" data-i="${i}" inputmode="numeric" pattern="[0-9]*" value="${s.reps != null ? s.reps : ''}" placeholder="${p && p.reps != null ? p.reps : '–'}" autocomplete="off">
    <button class="chk ${s.pr ? 'pr' : ''}" data-a="toggleDone" data-item="${it.id}" data-i="${i}" aria-label="${t('done')}">${s.pr ? icon('trophy') : icon('check')}</button>
  </div>${s.note ? `<div class="set-note">${icon('note', 'xs')} ${esc(s.note)}</div>` : ''}`;
}

function cardHTML(it, ss) {
  const w = W();
  const meta = getMeta(it.exerciseId, w.gymId);
  const all = !!(w.prevAll && w.prevAll[it.id]);
  const prev = lastFor(it.exerciseId, w.gymId, !all, w.id);
  const ps = prev ? prev.item.sets : [];
  const showPlus = !!meta.plusKg || it.sets.some((s) => s.plus) || ps.some((s) => s.plus);
  let prevLine;
  if (prev) {
    const otherGym = all && prev.session.gymId !== w.gymId ? ` · ${esc(gymName(prev.session.gymId))}` : '';
    prevLine = `${t('lastTime')}: ${esc(fmtDate(prev.session.start))} · ${esc(relDay(prev.session.start))}${otherGym}`;
  } else prevLine = all ? t('neverDoneEx') : t('notAtThisGym');
  const extra = `<button class="chip ghost" data-a="editMeta" data-item="${it.id}">${icon('sliders', 'xs')} ${meta.fields.length || meta.note ? t('edit') : t('addSettings')}</button>`;
  return `<section class="ex-card ${it.supersetId ? 'ss' : ''}" id="card-${it.id}">
    ${it.supersetId ? `<div class="ss-label">${icon('link', 'xs')} Superset ${ss[it.supersetId]}</div>` : ''}
    <div class="ex-head">
      <button class="thumb-btn" data-a="exVisual" data-id="${it.exerciseId}" data-gym="${w.gymId || ''}" aria-label="${t('photoAndMuscles')}">${exThumb(it.exerciseId, w.gymId)}</button>
      <button class="ex-name" data-a="exInfo" data-id="${it.exerciseId}">${esc(exName(it.exerciseId))}</button>
      <button class="chip ghost rest-chip" data-a="restStart" data-item="${it.id}">${icon('timer', 'xs')} ${fmtRest(restFor(it.exerciseId))}</button>
      <button class="icon-btn" data-a="exMenu" data-item="${it.id}" aria-label="${t('more')}">${icon('more')}</button>
    </div>
    ${metaChips(meta, extra)}
    ${it.note ? `<div class="ex-note">${icon('note', 'xs')} ${esc(it.note)}</div>` : ''}
    <div class="prev-line"><span>${prevLine}</span><button class="seg-mini" data-a="prevToggle" data-item="${it.id}"><span class="${!all ? 'on' : ''}">${t('thisGym')}</span><span class="${all ? 'on' : ''}">${t('allGymsShort')}</span></button></div>
    <div class="sets ${showPlus ? 'has-plus' : ''}">
      <div class="set-row head"><span>${t('colSet')}</span><span>${t('colPrev')}</span><span>${t('colKg')}</span><span>${t('colReps')}</span><span>${icon('check', 'xs')}</span></div>
      ${it.sets.map((s, i) => rowHTML(it, s, i, ps[i], showPlus)).join('')}
    </div>
    <button class="add-set" data-a="addSet" data-item="${it.id}">${icon('plus', 'sm')} ${t('addSet')}</button>
  </section>`;
}

function restBar() {
  const r = S.active && S.active.rest;
  if (!r) return '';
  const rem = Math.max(0, Math.ceil((r.end - Date.now()) / 1000));
  return `<div class="rest-bar"><div class="rest-prog" data-tick="restbar" style="width:${Math.min(100, (rem / r.total) * 100)}%"></div>
    <button class="rb-btn" data-a="restAdj" data-d="-15">−15</button>
    <div class="rest-time"><small>${t('rest')}</small><b data-tick="rest">${fmtRest(rem)}</b></div>
    <button class="rb-btn" data-a="restAdj" data-d="15">+15</button>
    <button class="rb-btn skip" data-a="restStop">${t('skip')}</button></div>`;
}

registerView('workout', () => {
  const w = W();
  if (!w) { setTimeout(() => go('home', true), 0); return ''; }
  const ss = ssLetters(w.items);
  return `<header class="wo-head">
      <button class="icon-btn" data-a="woMin" aria-label="${t('minimize')}">${icon('chevD')}</button>
      <button class="wo-title" data-a="woRename"><span class="wo-name">${esc(w.name)}</span><span class="wo-time" data-tick="el">${fmtDur(Date.now() - w.start)}</span></button>
      <button class="btn small primary" data-a="woFinish">${t('finish')}</button>
    </header>
    <div class="wo-meta"><button class="gym-chip small" data-a="woGym">${icon('pin')}<span>${esc(gymName(w.gymId) || t('noGym'))}</span>${icon('chevD', 'sm')}</button><span class="muted small" data-progress>${progressText()}</span></div>
    ${w.items.map((it) => cardHTML(it, ss)).join('') || `<div class="empty card"><p class="muted">${t('emptyWorkoutText')}</p></div>`}
    <button class="btn btn-block secondary" data-a="woAddEx">${icon('plus')} ${t('addExercise')}</button>
    <button class="btn btn-block danger-ghost" data-a="woCancel">${t('cancelWorkout')}</button>
    <div id="rest-slot">${restBar()}</div>`;
}, { noTabs: true, cls: 'wo-screen', after: () => { requestWake(); document.body.classList.toggle('resting', !!(S.active && S.active.rest)); } });

function refreshCard(id) {
  const w = W();
  const it = w.items.find((x) => x.id === id);
  const el = document.getElementById('card-' + id);
  if (!it || !el) { render(); return; }
  el.outerHTML = cardHTML(it, ssLetters(w.items));
  const p = document.querySelector('[data-progress]');
  if (p) p.textContent = progressText();
}

function refreshRest() {
  const slot = document.getElementById('rest-slot');
  if (slot) slot.innerHTML = restBar();
  document.body.classList.toggle('resting', !!(S.active && S.active.rest));
  if (!(S.active && S.active.rest)) document.querySelectorAll('[data-tick="restlabel"]').forEach((e) => { e.textContent = ''; });
}

const itemOf = (el) => W().items.find((x) => x.id === el.dataset.item);
const setOf = (el) => {
  const it = itemOf(el);
  const i = +el.dataset.i;
  return { it, i, s: it ? it.sets[i] : null };
};

// ---------- Invoer ----------
IN.woKg = (el) => { const { s } = setOf(el); if (!s) return; s.kg = parseNum(el.value); saveActiveSoon(); };
IN.woReps = (el) => {
  const { s } = setOf(el);
  if (!s) return;
  const n = parseInt(el.value, 10);
  s.reps = isNaN(n) ? null : n;
  saveActiveSoon();
};

// Snelle knoppen (−/+) onder de set die je aan het invullen bent
document.addEventListener('focusin', (e) => {
  const el = e.target;
  if (!el.matches || !el.matches('.set-row .in')) return;
  showStepper(el.dataset.item, +el.dataset.i);
});
document.addEventListener('pointerdown', (e) => {
  const st = document.querySelector('.stepper');
  if (!st || e.target.closest('.stepper') || e.target.closest('.set-row')) return;
  st.remove();
});

function showStepper(itemId, i) {
  const key = itemId + ':' + i;
  const cur = document.querySelector('.stepper');
  if (cur && cur.dataset.key === key) return;
  if (cur) cur.remove();
  const row = document.querySelector(`.set-row[data-row="${key}"]`);
  const w = W();
  if (!row || !w) return;
  const it = w.items.find((x) => x.id === itemId);
  const step = stepFor(it.exerciseId, w.gymId);
  const div = document.createElement('div');
  div.className = 'stepper';
  div.dataset.key = key;
  div.innerHTML = `<div class="st-group"><span class="st-lbl">kg</span><button data-step="kg" data-d="-1">−${fmtNum(step)}</button><button data-step="kg" data-d="1">+${fmtNum(step)}</button></div>
    <div class="st-group"><span class="st-lbl">reps</span><button data-step="reps" data-d="-1">−1</button><button data-step="reps" data-d="1">+1</button></div>`;
  div.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('button[data-step]');
    if (!b) return;
    ev.preventDefault();
    applyStep(itemId, i, b.dataset.step, +b.dataset.d);
  });
  div.addEventListener('mousedown', (ev) => ev.preventDefault());
  let anchor = row;
  if (row.nextElementSibling && row.nextElementSibling.classList.contains('set-note')) anchor = row.nextElementSibling;
  anchor.after(div);
}

function applyStep(itemId, i, field, d) {
  const w = W();
  const it = w.items.find((x) => x.id === itemId);
  const s = it && it.sets[i];
  const row = document.querySelector(`.set-row[data-row="${itemId}:${i}"]`);
  if (!s || !row) return;
  if (field === 'kg') {
    const inp = row.querySelector('[data-in="woKg"]');
    const step = stepFor(it.exerciseId, w.gymId);
    const base = s.kg != null ? s.kg : parseNum(inp.placeholder) || 0;
    s.kg = Math.max(0, Math.round((base + d * step) * 1000) / 1000);
    inp.value = fmtNum(s.kg);
  } else {
    const inp = row.querySelector('[data-in="woReps"]');
    const base = s.reps != null ? s.reps : parseInt(inp.placeholder, 10) || 0;
    s.reps = Math.max(0, base + d);
    inp.value = s.reps;
  }
  saveActiveSoon();
}

// ---------- Sets ----------
function prCheck(it, set) {
  if (!isWork(set)) return null;
  const w = W();
  const r = records(it.exerciseId, w.gymId, w.id);
  if (!r.maxKg) return null;
  const kg = effKg(set, it.exerciseId, w.gymId) || 0;
  const e = e1rm(kg, set.reps);
  let bestKg = r.maxKg.kg;
  let bestE = r.maxE1rm ? r.maxE1rm.v : 0;
  for (const x of w.items) {
    if (x.exerciseId !== it.exerciseId) continue;
    for (const s of x.sets) {
      if (s === set || !s.done || !isWork(s)) continue;
      const k = effKg(s, x.exerciseId, w.gymId) || 0;
      bestKg = Math.max(bestKg, k);
      bestE = Math.max(bestE, e1rm(k, s.reps));
    }
  }
  if (kg > bestKg + 1e-9) return 'kg';
  if (e > bestE + 1e-9) return 'e1rm';
  return null;
}

A.toggleDone = (el) => {
  const { it, s } = setOf(el);
  if (!s) return;
  const row = el.closest('.set-row');
  if (!s.done) {
    const kgIn = row.querySelector('[data-in="woKg"]');
    const repIn = row.querySelector('[data-in="woReps"]');
    if (s.kg == null && kgIn.value === '' && parseNum(kgIn.placeholder) != null) s.kg = parseNum(kgIn.placeholder);
    if (s.reps == null && /^\d+$/.test(repIn.placeholder)) s.reps = +repIn.placeholder;
    if (!s.reps) {
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
      repIn.focus();
      return;
    }
    s.done = true;
    s.doneAt = Date.now();
    s.pr = prCheck(it, s);
    if (s.pr) toast(t('newPR', { ex: exName(it.exerciseId) }), 'trophy');
  } else {
    s.done = false;
    s.pr = null;
  }
  saveActiveSoon();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  refreshCard(it.id);
};

A.copyPrev = (el) => {
  const { it, s, i } = setOf(el);
  const w = W();
  const all = w.prevAll && w.prevAll[it.id];
  const prev = lastFor(it.exerciseId, w.gymId, !all, w.id);
  const p = prev && prev.item.sets[i];
  if (!p || !s) return;
  s.kg = p.kg;
  s.reps = p.reps;
  s.plus = p.plus || 0;
  saveActiveSoon();
  refreshCard(it.id);
};

A.cyclePlus = (el) => {
  const { it, s } = setOf(el);
  s.plus = ((s.plus || 0) + 1) % 3;
  saveActiveSoon();
  refreshCard(it.id);
};

A.prevToggle = (el) => {
  const w = W();
  const it = itemOf(el);
  w.prevAll = w.prevAll || {};
  w.prevAll[it.id] = !w.prevAll[it.id];
  saveActiveSoon();
  refreshCard(it.id);
};

A.setMenu = async (el) => {
  const { it, s, i } = setOf(el);
  const opts = SET_TYPES.map((tp) => ({ label: t('type_' + tp), value: 'type:' + tp, checked: s.type === tp }));
  opts.push({ label: s.note ? t('editSetNote') : t('addSetNote'), value: 'note', icon: 'note' });
  opts.push({ label: t('deleteSet'), value: 'del', icon: 'trash', danger: true });
  const v = await actionSheet({ title: t('setN', { n: setLabel(it.sets, i) }), sub: exName(it.exerciseId), options: opts });
  if (!v) return;
  if (v.startsWith('type:')) s.type = v.slice(5);
  else if (v === 'note') {
    const n = await promptText({ title: t('setNote'), value: s.note || '', placeholder: t('setNotePh') });
    if (n === null) return;
    s.note = n;
  } else if (v === 'del') it.sets.splice(i, 1);
  saveActiveSoon();
  refreshCard(it.id);
};

A.addSet = (el) => {
  const it = itemOf(el);
  const w = W();
  const prev = lastFor(it.exerciseId, w.gymId, true, w.id);
  const i = it.sets.length;
  const p = prev && prev.item.sets[i];
  const last = it.sets[i - 1];
  const src = p || last;
  it.sets.push({ id: uid(), type: 'n', kg: src ? src.kg : null, reps: src ? src.reps : null, plus: src ? src.plus || 0 : 0, target: null, done: false, note: '' });
  saveActiveSoon();
  refreshCard(it.id);
};

A.editMeta = (el) => {
  const it = itemOf(el);
  openMetaEditor(it.exerciseId, W().gymId, () => refreshCard(it.id));
};

A.exInfo = (el) => go('ex/' + el.dataset.id);

// ---------- Oefening-menu ----------
A.exMenu = async (el) => {
  const w = W();
  const it = itemOf(el);
  const idx = w.items.indexOf(it);
  const opts = [
    { label: t('swapExercise'), value: 'swap', icon: 'swap' },
    { label: t('machineSettings'), value: 'meta', icon: 'sliders' },
    { label: it.note ? t('editNote') : t('addNote'), value: 'note', icon: 'note' },
    { label: t('restTimeN', { t: fmtRest(restFor(it.exerciseId)) }), value: 'rest', icon: 'timer' },
    it.supersetId ? { label: t('removeSuperset'), value: 'ssoff', icon: 'link' } : idx < w.items.length - 1 ? { label: t('supersetNext'), value: 'sson', icon: 'link' } : null,
    idx > 0 ? { label: t('moveUp'), value: 'up', icon: 'up' } : null,
    idx < w.items.length - 1 ? { label: t('moveDown'), value: 'down', icon: 'down' } : null,
    { label: t('viewHistory'), value: 'hist', icon: 'chart' },
    { label: t('removeExercise'), value: 'del', icon: 'trash', danger: true },
  ].filter(Boolean);
  const v = await actionSheet({ title: exName(it.exerciseId), options: opts });
  if (!v) return;
  if (v === 'swap') return swapExercise(it);
  if (v === 'meta') return openMetaEditor(it.exerciseId, w.gymId, () => refreshCard(it.id));
  if (v === 'hist') return go('ex/' + it.exerciseId);
  if (v === 'note') {
    const n = await promptText({ title: t('exerciseNote'), value: it.note || '', placeholder: t('exerciseNotePh') });
    if (n === null) return;
    it.note = n;
  } else if (v === 'rest') {
    const sec = await pickRest(restFor(it.exerciseId));
    if (!sec) return;
    const ex = exById(it.exerciseId);
    if (ex) { ex.rest = sec; persist('exercises'); }
  } else if (v === 'sson') {
    const next = w.items[idx + 1];
    const sid = next.supersetId || uid();
    it.supersetId = sid;
    next.supersetId = sid;
  } else if (v === 'ssoff') {
    const sid = it.supersetId;
    it.supersetId = null;
    const restSs = w.items.filter((x) => x.supersetId === sid);
    if (restSs.length === 1) restSs[0].supersetId = null;
  } else if (v === 'up' || v === 'down') {
    const j = v === 'up' ? idx - 1 : idx + 1;
    [w.items[idx], w.items[j]] = [w.items[j], w.items[idx]];
  } else if (v === 'del') {
    if (it.sets.some((s) => s.done)) {
      const ok = await confirmDialog({ title: t('removeExerciseQ'), text: t('removeExerciseText'), ok: t('delete'), danger: true });
      if (!ok) return;
    }
    w.items.splice(idx, 1);
  }
  saveActiveSoon();
  render();
};

function swapExercise(it) {
  const w = W();
  openPicker({
    title: t('swapExercise'),
    onPick: async ([id]) => {
      if (it.sets.some((s) => s.done)) {
        const ok = await confirmDialog({ title: t('swapDoneTitle'), text: t('swapDoneText'), ok: t('swap') });
        if (!ok) return;
      }
      const prev = lastFor(id, w.gymId, true, w.id);
      const ps = prev ? prev.item.sets : [];
      it.exerciseId = id;
      it.sets = fillSets(it.sets.map((s) => ({ type: s.type, target: s.target })), ps);
      saveActiveSoon();
      render();
      toast(t('swapped', { ex: exName(id) }), 'swap');
    },
  });
}

A.woAddEx = () => {
  const w = W();
  openPicker({
    multi: true,
    title: t('addExercise'),
    onPick: (ids) => {
      ids.forEach((id) => w.items.push(makeItem(id, w.gymId)));
      saveActiveSoon();
      render();
      const last = w.items[w.items.length - 1];
      const el = last && document.getElementById('card-' + last.id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
};

// ---------- Kop ----------
A.woMin = () => go('home');
A.resumeWo = () => go('workout');
A.woRename = async () => {
  const n = await promptText({ title: t('workoutName'), value: W().name });
  if (!n) return;
  W().name = n;
  saveActiveSoon();
  render();
};

A.woGym = async () => {
  const w = W();
  const g = await pickGym({ current: w.gymId, title: t('whichGym') });
  if (!g || g === 'all' || g === w.gymId) return;
  w.gymId = g;
  S.settings.gymId = g;
  persist('settings');
  const tpl = S.templates.find((x) => x.id === w.templateId);
  w.items.forEach((it) => {
    if (it.sets.some((s) => s.done)) return;
    let ex = it.exerciseId;
    if (tpl && !tpl.gymId && it.tplItemId && it.exerciseId === it.origExId) {
      const ti = tpl.items.find((x) => x.id === it.tplItemId);
      if (ti) ex = resolveEx(tpl, ti, g);
    }
    const prev = lastFor(ex, g, true, w.id);
    const ps = prev ? prev.item.sets : [];
    it.exerciseId = ex;
    it.origExId = ex;
    it.sets = fillSets(it.sets.map((s) => ({ type: s.type, target: s.target })), ps);
  });
  saveActiveSoon();
  render();
};

// ---------- Rusttimer ----------
let actx = null;
function unlockAudio() {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { /* geen audio */ }
}
function beep() {
  if (!actx) return;
  try {
    const now = actx.currentTime;
    [0, 0.28, 0.56].forEach((d, i) => {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.frequency.value = i === 2 ? 1320 : 880;
      o.connect(g);
      g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, now + d);
      g.gain.exponentialRampToValueAtTime(0.5, now + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.2);
      o.start(now + d);
      o.stop(now + d + 0.22);
    });
  } catch (e) { /* negeren */ }
}

A.restStart = (el) => {
  const it = itemOf(el);
  unlockAudio();
  const sec = restFor(it.exerciseId);
  W().rest = { end: Date.now() + sec * 1000, total: sec, fired: false };
  saveActiveSoon();
  refreshRest();
};
A.restAdj = (el) => {
  const r = W().rest;
  if (!r) return;
  const d = +el.dataset.d;
  r.end = Math.max(Date.now(), r.end + d * 1000);
  r.total = Math.max(1, r.total + d);
  saveActiveSoon();
  tick();
};
A.restStop = () => { W().rest = null; saveActiveSoon(); refreshRest(); };

export function tick() {
  const w = S.active;
  if (!w) return;
  const now = Date.now();
  document.querySelectorAll('[data-tick="el"]').forEach((e) => { e.textContent = fmtDur(now - w.start); });
  const r = w.rest;
  if (!r) return;
  const rem = Math.max(0, Math.ceil((r.end - now) / 1000));
  document.querySelectorAll('[data-tick="rest"]').forEach((e) => { e.textContent = fmtRest(rem); });
  document.querySelectorAll('[data-tick="restbar"]').forEach((e) => { e.style.width = Math.min(100, (rem / r.total) * 100) + '%'; });
  document.querySelectorAll('[data-tick="restlabel"]').forEach((e) => { e.textContent = `· ${t('rest')} ${fmtRest(rem)}`; });
  if (rem <= 0 && !r.fired) {
    r.fired = true;
    beep();
    toast(t('restDone'), 'timer');
    const bar = document.querySelector('.rest-bar');
    if (bar) bar.classList.add('finished');
    setTimeout(() => {
      if (S.active && S.active.rest === r) { S.active.rest = null; saveActiveSoon(); refreshRest(); }
    }, 2500);
  }
}

// ---------- Scherm aan houden ----------
let wake = null;
async function requestWake() {
  if (!S.settings.wakeLock || !S.active || !('wakeLock' in navigator) || wake) return;
  try {
    wake = await navigator.wakeLock.request('screen');
    wake.addEventListener('release', () => { wake = null; });
  } catch (e) { wake = null; }
}
function releaseWake() { if (wake) { wake.release().catch(() => {}); wake = null; } }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushActive();
  else if (S.active && route.name === 'workout') requestWake();
});

// ---------- Afronden ----------
function diffTemplate(tpl, w) {
  const lines = [];
  for (const it of w.items) {
    const ti = it.tplItemId && tpl.items.find((x) => x.id === it.tplItemId);
    if (!ti) { lines.push('+ ' + exName(it.exerciseId)); continue; }
    if (it.exerciseId !== it.origExId) lines.push(`⇄ ${exName(it.origExId)} → ${exName(it.exerciseId)}`);
    else if (it.sets.length !== ti.sets.length || it.sets.some((s, i) => s.type !== ((ti.sets[i] && ti.sets[i].type) || 'n'))) {
      lines.push(`${exName(it.exerciseId)}: ${t('nSets', { n: ti.sets.length })} → ${t('nSets', { n: it.sets.length })}`);
    }
  }
  for (const ti of tpl.items) if (!w.items.some((it) => it.tplItemId === ti.id)) lines.push('− ' + exName(resolveEx(tpl, ti, w.gymId)));
  const order = w.items.filter((it) => it.tplItemId && tpl.items.some((x) => x.id === it.tplItemId)).map((it) => it.tplItemId);
  const tplOrder = tpl.items.map((x) => x.id).filter((id) => order.includes(id));
  if (order.join() !== tplOrder.join()) lines.push(t('orderChanged'));
  const ssChanged = w.items.some((it) => {
    const ti = it.tplItemId && tpl.items.find((x) => x.id === it.tplItemId);
    return ti && !!ti.supersetId !== !!it.supersetId;
  });
  if (ssChanged) lines.push(t('supersetsChanged'));
  return lines;
}

function applyTemplate(tpl, w) {
  tpl.items = w.items.map((it) => {
    const old = it.tplItemId && tpl.items.find((x) => x.id === it.tplItemId);
    const sets = it.sets.map((s, i) => {
      const o = { type: s.type };
      const prevT = old && old.sets[i] && old.sets[i].reps;
      if (prevT) o.reps = prevT;
      return o;
    });
    if (!old) return { id: uid(), exerciseId: it.exerciseId, alts: {}, supersetId: it.supersetId || null, sets };
    const ti = { ...old, alts: { ...(old.alts || {}) }, sets, supersetId: it.supersetId || null };
    if (it.exerciseId !== it.origExId) {
      if (!tpl.gymId && w.gymId) {
        if (it.exerciseId === ti.exerciseId) delete ti.alts[w.gymId];
        else ti.alts[w.gymId] = it.exerciseId;
      } else ti.exerciseId = it.exerciseId;
    }
    return ti;
  });
  persist('templates');
}

function discardActive() {
  S.active = null;
  persist('active');
  releaseWake();
  document.body.classList.remove('resting');
  go('home', true);
}

A.woCancel = async () => {
  const ok = await confirmDialog({ title: t('cancelWorkoutQ'), text: t('cancelWorkoutText'), ok: t('discardWorkout'), danger: true });
  if (ok) discardActive();
};

A.woFinish = async () => {
  const w = W();
  const pending = [];
  w.items.forEach((it) => it.sets.forEach((s) => { if (!s.done && s.reps) pending.push({ it, s }); }));
  const doneCount = w.items.reduce((n, it) => n + it.sets.filter((s) => s.done).length, 0);
  if (pending.length) {
    const c = await choose({
      title: t('finishTitle'),
      text: t('uncheckedText', { n: pending.length }),
      options: [
        { label: t('checkAllFinish'), value: 'all', primary: true },
        { label: t('ignoreUnchecked'), value: 'drop' },
        { label: t('keepTraining'), value: null },
      ],
    });
    if (!c) return;
    if (c === 'all') pending.forEach(({ it, s }) => { s.done = true; s.doneAt = Date.now(); s.pr = prCheck(it, s); });
  } else if (!doneCount) {
    const ok = await confirmDialog({ title: t('noSetsTitle'), text: t('noSetsText'), ok: t('discardWorkout'), danger: true });
    if (ok) discardActive();
    return;
  } else {
    const ok = await confirmDialog({ title: t('finishTitle'), text: t('finishText'), ok: t('finish') });
    if (!ok) return;
  }
  const tpl = S.templates.find((x) => x.id === w.templateId);
  if (tpl) {
    const changes = diffTemplate(tpl, w);
    if (changes.length) {
      const c = await choose({
        title: t('updateTplTitle', { name: tpl.name }),
        text: changes.join('\n'),
        options: [{ label: t('keepTpl'), value: 'no' }, { label: t('updateTpl'), value: 'yes', primary: true }],
      });
      if (c === 'yes') applyTemplate(tpl, w);
    }
  }
  const session = {
    id: w.id,
    templateId: w.templateId,
    name: w.name,
    gymId: w.gymId,
    start: w.start,
    end: Date.now(),
    items: w.items.map((it) => ({
      exerciseId: it.exerciseId,
      supersetId: it.supersetId || null,
      note: it.note || '',
      meta: snapshotMeta(it.exerciseId, w.gymId),
      sets: it.sets.filter((s) => s.done).map((s) => ({ type: s.type, kg: s.kg, reps: s.reps, plus: s.plus || 0, note: s.note || '', pr: s.pr || null })),
    })).filter((it) => it.sets.length),
  };
  if (!tpl && session.items.length) {
    const c = await choose({
      title: t('saveAsTplQ'),
      text: t('saveAsTplText'),
      options: [{ label: t('no'), value: false }, { label: t('saveAsTpl'), value: true, primary: true }],
    });
    if (c) {
      const nt = { id: uid(), name: w.name, gymId: w.gymId || null, note: '', items: session.items.map((it) => ({ id: uid(), exerciseId: it.exerciseId, alts: {}, supersetId: it.supersetId, sets: it.sets.map((s) => ({ type: s.type })) })) };
      S.templates.push(nt);
      session.templateId = nt.id;
      persist('templates');
    }
  }
  await putSession(session);
  const prs = session.items.reduce((n, it) => n + it.sets.filter((s) => s.pr).length, 0);
  S.active = null;
  await persist('active');
  releaseWake();
  document.body.classList.remove('resting');
  toast(prs ? t('savedWithPRs', { n: prs }) : t('workoutSaved'), prs ? 'trophy' : 'check');
  go('history', true);
};
