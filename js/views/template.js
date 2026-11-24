// Workout (schema) bewerken: oefeningen, sets, alternatief per gym, supersets.
import { S, persist } from '../store.js';
import { A, IN, registerView, render, back } from '../core.js';
import { t } from '../i18n.js';
import { esc, icon, uid, debounce, fmtRest } from '../util.js';
import { exById, exName, gymById, gymName, setLabel, SET_TYPES, restFor } from '../logic.js';
import { navBar, notFound, pickGym, openPicker, pickRest } from './shared.js';
import { actionSheet, confirmDialog, promptText, toast } from '../ui.js';
import { beginWorkout } from './home.js';
import { exThumb } from '../visual.js';

const tplOf = (el) => S.templates.find((x) => x.id === el.dataset.tpl || x.id === el.dataset.id);
const itemOf = (tpl, el) => tpl.items.find((x) => x.id === el.dataset.item);
const save = () => persist('templates');
const saveSoon = debounce(save, 400);

function ssLetters(items) {
  const m = {};
  let n = 0;
  items.forEach((it) => { if (it.supersetId && !m[it.supersetId]) m[it.supersetId] = String.fromCharCode(65 + n++); });
  return m;
}

function itemHTML(tpl, it, ss) {
  const d = `data-tpl="${tpl.id}" data-item="${it.id}"`;
  const alts = Object.entries(it.alts || {}).filter(([g, e]) => e && gymById(g));
  return `<div class="card tpl-item ${it.supersetId ? 'ss' : ''}">
    ${it.supersetId ? `<div class="ss-label">${icon('link', 'xs')} Superset ${ss[it.supersetId]}</div>` : ''}
    <div class="ti-head"><button class="thumb-btn" data-a="exVisual" data-id="${it.exerciseId}" data-gym="${tpl.gymId || S.settings.gymId || ''}">${exThumb(it.exerciseId, tpl.gymId || S.settings.gymId)}</button><button class="ex-name" data-a="tiSwap" ${d}>${esc(exName(it.exerciseId))}</button>
      <button class="icon-btn" data-a="tiMenu" ${d} aria-label="${t('more')}">${icon('more')}</button></div>
    ${!tpl.gymId && alts.length ? `<div class="alt-lines">${alts.map(([g, e]) => `<div class="alt-line">${icon('swap', 'xs')}<span>${esc(gymName(g))}: <b>${esc(exName(e))}</b></span><button class="link small" data-a="tiAltDel" ${d} data-gym="${g}">${t('remove')}</button></div>`).join('')}</div>` : ''}
    <div class="ti-sets">
      <div class="set-chips">${it.sets.map((s, j) => `<button class="set-chip t-${s.type}" data-a="tiSet" ${d} data-i="${j}">${setLabel(it.sets, j)}${s.reps ? `<small>×${s.reps}</small>` : ''}</button>`).join('')}</div>
      <div class="mini-step"><button data-a="tiSetDel" ${d} aria-label="−">${icon('minus')}</button><button data-a="tiSetAdd" ${d} aria-label="+">${icon('plus')}</button></div>
    </div>
    <div class="ti-foot muted small">${t('nSets', { n: it.sets.length })} · ${icon('timer', 'xs')} ${fmtRest(restFor(it.exerciseId))}</div>
  </div>`;
}

registerView('tpl', (id) => {
  const tpl = S.templates.find((x) => x.id === id);
  if (!tpl) return notFound();
  const ss = ssLetters(tpl.items);
  return `${navBar({ title: t('editWorkout'), right: `<button class="btn small primary" data-a="tplStart" data-id="${id}">${icon('play', 'sm')} ${t('start')}</button>` })}
    <div class="card form-card">
      <input class="title-input" data-in="tplName" data-id="${id}" value="${esc(tpl.name)}" placeholder="${t('workoutName')}" autocomplete="off">
      <button class="row-btn" data-a="tplGym" data-id="${id}"><span>${icon('pin')} ${t('gym')}</span><span class="muted rb-val"><span class="ell">${tpl.gymId ? esc(gymName(tpl.gymId)) : t('allGyms')}</span>${icon('chevR', 'sm')}</span></button>
      <textarea class="note-input" data-in="tplNote" data-id="${id}" rows="2" placeholder="${t('tplNotePh')}">${esc(tpl.note || '')}</textarea>
    </div>
    <p class="hint">${tpl.gymId ? t('gymTplHint') : t('allGymsHint')}</p>
    ${tpl.items.map((it) => itemHTML(tpl, it, ss)).join('') || `<div class="empty card"><p class="muted">${t('noExercisesYet')}</p></div>`}
    <button class="btn btn-block primary" data-a="tplAddEx" data-id="${id}">${icon('plus')} ${t('addExercise')}</button>
    <button class="btn btn-block danger-ghost" data-a="tplDelete" data-id="${id}">${t('deleteWorkout')}</button>`;
}, { tab: 'home' });

IN.tplName = (el) => { const tpl = tplOf(el); tpl.name = el.value.trim() || t('newWorkout'); saveSoon(); };
IN.tplNote = (el) => { const tpl = tplOf(el); tpl.note = el.value; saveSoon(); };

A.tplStart = (el) => { save(); beginWorkout(tplOf(el)); };

A.tplGym = async (el) => {
  const tpl = tplOf(el);
  const g = await pickGym({ current: tpl.gymId || 'all', includeAll: true, title: t('workoutForGym') });
  if (!g) return;
  tpl.gymId = g === 'all' ? null : g;
  save();
  render();
};

A.tplAddEx = (el) => {
  const tpl = tplOf(el);
  openPicker({
    multi: true,
    title: t('addExercise'),
    onPick: (ids) => {
      ids.forEach((exId) => tpl.items.push({ id: uid(), exerciseId: exId, alts: {}, supersetId: null, sets: [{ type: 'n' }, { type: 'n' }] }));
      save();
      render();
    },
  });
};

A.tplDelete = async (el) => {
  const tpl = tplOf(el);
  const ok = await confirmDialog({ title: t('deleteWorkoutQ'), text: tpl.name, ok: t('delete'), danger: true });
  if (!ok) return;
  S.templates = S.templates.filter((x) => x.id !== tpl.id);
  save();
  back();
};

A.tiSwap = (el) => {
  const tpl = tplOf(el);
  const it = itemOf(tpl, el);
  openPicker({ title: t('chooseExercise'), onPick: ([id]) => { it.exerciseId = id; save(); render(); } });
};

A.tiAltDel = (el) => {
  const tpl = tplOf(el);
  const it = itemOf(tpl, el);
  delete it.alts[el.dataset.gym];
  save();
  render();
};

A.tiSetAdd = (el) => {
  const tpl = tplOf(el);
  const it = itemOf(tpl, el);
  const last = it.sets[it.sets.length - 1];
  it.sets.push({ type: 'n', ...(last && last.reps ? { reps: last.reps } : {}) });
  save();
  render();
};
A.tiSetDel = (el) => {
  const tpl = tplOf(el);
  const it = itemOf(tpl, el);
  if (it.sets.length <= 1) { toast(t('minOneSet')); return; }
  it.sets.pop();
  save();
  render();
};

A.tiSet = async (el) => {
  const tpl = tplOf(el);
  const it = itemOf(tpl, el);
  const i = +el.dataset.i;
  const s = it.sets[i];
  const opts = SET_TYPES.map((tp) => ({ label: t('type_' + tp), value: 'type:' + tp, checked: s.type === tp }));
  opts.push({ label: s.reps ? t('targetRepsN', { n: s.reps }) : t('targetReps'), value: 'reps', icon: 'note' });
  opts.push({ label: t('deleteSet'), value: 'del', icon: 'trash', danger: true });
  const v = await actionSheet({ title: t('setN', { n: setLabel(it.sets, i) }), sub: exName(it.exerciseId), options: opts });
  if (!v) return;
  if (v.startsWith('type:')) s.type = v.slice(5);
  else if (v === 'reps') {
    const r = await promptText({ title: t('targetReps'), text: t('targetRepsText'), value: s.reps || '', inputmode: 'numeric' });
    if (r === null) return;
    const n = parseInt(r, 10);
    if (n > 0) s.reps = n; else delete s.reps;
  } else if (v === 'del') {
    if (it.sets.length <= 1) { toast(t('minOneSet')); return; }
    it.sets.splice(i, 1);
  }
  save();
  render();
};

A.tiMenu = async (el) => {
  const tpl = tplOf(el);
  const it = itemOf(tpl, el);
  const idx = tpl.items.indexOf(it);
  const opts = [
    { label: t('chooseOtherExercise'), value: 'swap', icon: 'swap' },
    !tpl.gymId ? { label: t('altPerGym'), value: 'alt', icon: 'pin', sub: t('altPerGymSub') } : null,
    { label: t('restTimeN', { t: fmtRest(restFor(it.exerciseId)) }), value: 'rest', icon: 'timer' },
    it.supersetId ? { label: t('removeSuperset'), value: 'ssoff', icon: 'link' } : idx < tpl.items.length - 1 ? { label: t('supersetNext'), value: 'sson', icon: 'link' } : null,
    idx > 0 ? { label: t('moveUp'), value: 'up', icon: 'up' } : null,
    idx < tpl.items.length - 1 ? { label: t('moveDown'), value: 'down', icon: 'down' } : null,
    { label: t('removeExercise'), value: 'del', icon: 'trash', danger: true },
  ].filter(Boolean);
  const v = await actionSheet({ title: exName(it.exerciseId), options: opts });
  if (!v) return;
  if (v === 'swap') return A.tiSwap(el);
  if (v === 'alt') {
    const g = await pickGym({ title: t('altWhichGym') });
    if (!g || g === 'all') return;
    openPicker({
      title: t('altAtGym', { gym: gymName(g) }),
      onPick: ([id]) => {
        it.alts = it.alts || {};
        if (id === it.exerciseId) delete it.alts[g]; else it.alts[g] = id;
        save();
        render();
      },
    });
    return;
  }
  if (v === 'rest') {
    const sec = await pickRest(restFor(it.exerciseId));
    if (!sec) return;
    const ex = exById(it.exerciseId);
    if (ex) { ex.rest = sec; persist('exercises'); }
  } else if (v === 'sson') {
    const next = tpl.items[idx + 1];
    const sid = next.supersetId || uid();
    it.supersetId = sid;
    next.supersetId = sid;
  } else if (v === 'ssoff') {
    const sid = it.supersetId;
    it.supersetId = null;
    const rest = tpl.items.filter((x) => x.supersetId === sid);
    if (rest.length === 1) rest[0].supersetId = null;
  } else if (v === 'up' || v === 'down') {
    const j = v === 'up' ? idx - 1 : idx + 1;
    [tpl.items[idx], tpl.items[j]] = [tpl.items[j], tpl.items[idx]];
  } else if (v === 'del') {
    tpl.items.splice(idx, 1);
  }
  save();
  render();
};
