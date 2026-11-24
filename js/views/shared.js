// Gedeelde schermonderdelen: navigatiebalk, gym-kiezer, oefening-kiezer, standen-editor.
import { S, persist } from '../store.js';
import { A, IN, render } from '../core.js';
import { t, SUGGEST } from '../i18n.js';
import { esc, icon, uid, fmtNum, parseNum, fmtRest, normName } from '../util.js';
import { exById, exName, gymName, getMeta, setMeta, invalidateEx, lastByExercise, musclesOf, SEC_DEFAULT } from '../logic.js';
import { exThumb } from '../visual.js';
import { MUSCLES, EQUIP } from '../library.js';
import { openSheet, closeSheet, sheetEl, actionSheet, promptText, toast } from '../ui.js';

export function navBar({ title, right = '', back = true }) {
  return `<div class="nav"><div class="nav-l">${back ? `<button class="nav-back" data-a="back">${icon('chevL')}<span>${t('back')}</span></button>` : ''}</div><div class="nav-title">${esc(title)}</div><div class="nav-r">${right}</div></div>`;
}

export const notFound = () => `${navBar({ title: '' })}<p class="muted center pad">${t('notFound')}</p>`;
export const muscleLabel = (m) => t('m_' + (m || 'other'));
export const equipLabel = (e) => t('eq_' + (e || 'other'));

export function metaChips(meta, extra = '') {
  if (!meta) return extra ? `<div class="ex-chips">${extra}</div>` : '';
  const f = (meta.fields || []).filter((x) => x.label || x.value);
  const chips = f.map((x) => `<span class="chip">${esc(x.label)} <b>${esc(x.value)}</b></span>`).join('');
  const note = meta.note ? `<span class="chip note">${icon('note', 'xs')} ${esc(meta.note)}</span>` : '';
  if (!chips && !note && !extra) return '';
  return `<div class="ex-chips">${chips}${note}${extra}</div>`;
}

// ---------- Gym kiezen ----------
export async function pickGym({ current, includeAll = false, title } = {}) {
  const options = [];
  if (includeAll) options.push({ label: t('allGyms'), value: 'all', icon: 'globe', checked: current === 'all' || current == null });
  S.gyms.forEach((g) => options.push({ label: g.name, value: g.id, icon: 'pin', checked: current === g.id }));
  options.push({ label: t('addGym'), value: '__add', icon: 'plus' });
  const v = await actionSheet({ title: title || t('chooseGym'), options });
  if (v === '__add') {
    const name = await promptText({ title: t('addGym'), placeholder: t('gymNamePh') });
    if (!name) return null;
    const g = { id: uid(), name };
    S.gyms.push(g);
    await persist('gyms');
    return g.id;
  }
  return v;
}

// ---------- Rusttijd kiezen ----------
export async function pickRest(current, title) {
  const opts = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
  return actionSheet({ title: title || t('restTime'), options: opts.map((s) => ({ label: fmtRest(s), value: s, checked: s === current })) });
}

// ---------- Oefening kiezen ----------
let pk = null;

export function openPicker({ multi = false, title, onPick }) {
  pk = { multi, onPick, q: '', muscle: null, sel: [] };
  openSheet(`<div class="pk-head"><button class="link" data-a="closeSheet">${t('cancel')}</button><b>${esc(title || t('chooseExercise'))}</b><button class="link strong" data-a="pkNew">${icon('plus', 'sm')} ${t('new')}</button></div>
    <div class="search"><span>${icon('search')}</span><input class="pk-search" data-in="pkSearch" placeholder="${t('searchEx')}" autocomplete="off" autocorrect="off" spellcheck="false"></div>
    <div class="chips-scroll pk-muscles"></div>
    <div class="pk-list"></div>
    ${multi ? `<div class="pk-foot"><button class="btn primary btn-block" data-a="pkDone" disabled>${t('add')}</button></div>` : ''}`,
  { full: true, cls: 'picker', onClose: () => { pk = null; } });
  renderPicker();
}

function renderPicker() {
  const el = sheetEl();
  if (!el || !pk) return;
  const q = normName(pk.q);
  const last = lastByExercise();
  let list = S.exercises.filter((e) => (!pk.muscle || e.muscle === pk.muscle) && (!q || normName(e.name).includes(q)));
  list.sort((a, b) => a.name.localeCompare(b.name));
  const row = (e) => {
    const sel = pk.sel.includes(e.id);
    return `<button class="pk-row ${sel ? 'sel' : ''}" data-a="pkPick" data-id="${e.id}">${exThumb(e.id, S.settings.gymId, 'sm')}<div class="pk-txt"><div class="pk-name">${esc(e.name)}</div><div class="pk-sub">${muscleLabel(e.muscle)} · ${equipLabel(e.equip)}${last.has(e.id) ? ` · <span class="accent-text">${t('used')}</span>` : ''}</div></div>${sel ? `<span class="pk-check">${icon('check')}</span>` : ''}</button>`;
  };
  let html = '';
  if (!q && !pk.muscle) {
    const recent = [];
    for (const [id] of last) { if (exById(id)) recent.push(exById(id)); if (recent.length >= 10) break; }
    if (recent.length) html += `<div class="pk-sec">${t('recent')}</div>${recent.map(row).join('')}`;
    html += `<div class="pk-sec">${t('allExercises')}</div>`;
  }
  html += list.length ? list.map(row).join('') : `<div class="pk-empty"><p class="muted">${t('noExFound')}</p><button class="btn secondary" data-a="pkNew">${icon('plus', 'sm')} ${t('createEx', { name: esc(pk.q) })}</button></div>`;
  el.querySelector('.pk-list').innerHTML = html;
  el.querySelector('.pk-muscles').innerHTML = ['all', ...MUSCLES].map((m) => `<button class="fchip ${(m === 'all' && !pk.muscle) || m === pk.muscle ? 'on' : ''}" data-a="pkMuscle" data-m="${m}">${m === 'all' ? t('all') : muscleLabel(m)}</button>`).join('');
  const done = el.querySelector('[data-a="pkDone"]');
  if (done) { done.disabled = !pk.sel.length; done.textContent = pk.sel.length ? t('addN', { n: pk.sel.length }) : t('add'); }
}

IN.pkSearch = (el) => { if (!pk) return; pk.q = el.value; renderPicker(); };
A.pkMuscle = (el) => { pk.muscle = el.dataset.m === 'all' ? null : el.dataset.m; renderPicker(); };
A.pkPick = (el) => {
  const id = el.dataset.id;
  if (!pk.multi) { const cb = pk.onPick; closeSheet(); cb([id]); return; }
  pk.sel = pk.sel.includes(id) ? pk.sel.filter((x) => x !== id) : [...pk.sel, id];
  renderPicker();
};
A.pkDone = () => { const cb = pk.onPick; const sel = pk.sel.slice(); closeSheet(); cb(sel); };
A.pkNew = () => openExerciseForm({
  name: pk ? pk.q : '',
  onSave: (ex) => {
    if (!pk) return;
    if (pk.multi) { pk.sel.push(ex.id); renderPicker(); } else { const cb = pk.onPick; closeSheet(); cb([ex.id]); }
  },
});

// ---------- Oefening maken / bewerken ----------
let exf = null;
export function openExerciseForm({ ex, name = '', onSave }) {
  exf = { ex, muscle: ex ? ex.muscle : null, equip: ex ? ex.equip : null, sec: ex ? [...musclesOf(ex).sec] : [], secTouched: false, onSave };
  openSheet(`<h3 class="sheet-title">${ex ? t('editExercise') : t('newExercise')}</h3>
    <label class="field"><span>${t('name')}</span><input id="exf-name" value="${esc(ex ? ex.name : name)}" placeholder="${t('exNamePh')}" autocomplete="off"></label>
    <div class="field"><span>${t('muscle')}</span><div class="chip-wrap" data-group="muscle">${MUSCLES.map((m) => `<button class="fchip ${exf.muscle === m ? 'on' : ''}" data-a="exfPick" data-k="muscle" data-v="${m}">${muscleLabel(m)}</button>`).join('')}</div></div>
    <div class="field"><span>${t('secMuscles')}</span><div class="chip-wrap exf-sec">${secChips()}</div></div>
    <div class="field"><span>${t('equipment')}</span><div class="chip-wrap" data-group="equip">${EQUIP.map((m) => `<button class="fchip ${exf.equip === m ? 'on' : ''}" data-a="exfPick" data-k="equip" data-v="${m}">${equipLabel(m)}</button>`).join('')}</div></div>
    <button class="btn primary btn-block" data-a="exfSave">${t('save')}</button>`, { cls: 'form-sheet', onClose: () => { exf = null; } });
  if (!ex) sheetEl().querySelector('#exf-name').focus();
}
function secChips() {
  return MUSCLES.filter((m) => m !== 'other' && m !== exf.muscle).map((m) => `<button class="fchip ${exf.sec.includes(m) ? 'on' : ''}" data-a="exfSec" data-v="${m}">${muscleLabel(m)}</button>`).join('');
}
A.exfPick = (el) => {
  exf[el.dataset.k] = el.dataset.v;
  el.parentElement.querySelectorAll('.fchip').forEach((b) => b.classList.toggle('on', b === el));
  if (el.dataset.k === 'muscle') {
    if (!exf.secTouched && !exf.ex) exf.sec = [...(SEC_DEFAULT[exf.muscle] || [])];
    exf.sec = exf.sec.filter((m) => m !== exf.muscle);
    sheetEl().querySelector('.exf-sec').innerHTML = secChips();
  }
};
A.exfSec = (el) => {
  const m = el.dataset.v;
  exf.secTouched = true;
  exf.sec = exf.sec.includes(m) ? exf.sec.filter((x) => x !== m) : [...exf.sec, m];
  el.classList.toggle('on', exf.sec.includes(m));
};
A.exfSave = () => {
  const name = sheetEl().querySelector('#exf-name').value.trim();
  if (!name) { toast(t('nameRequired')); return; }
  let ex = exf.ex;
  const fields = { name, muscle: exf.muscle || 'other', equip: exf.equip || 'other', sec: exf.sec.filter((m) => m !== (exf.muscle || 'other')) };
  if (ex) Object.assign(ex, fields);
  else { ex = { id: uid(), ...fields, custom: true }; S.exercises.push(ex); }
  invalidateEx();
  persist('exercises');
  const cb = exf.onSave;
  closeSheet();
  if (cb) cb(ex);
};

// ---------- Standen van het apparaat (per oefening per gym) ----------
let mf = null;
export function openMetaEditor(exId, gymId, onDone) {
  const m = getMeta(exId, gymId);
  mf = { exId, gymId, onDone, fields: m.fields.length ? m.fields.map((f) => ({ ...f })) : [] };
  openSheet(`<h3 class="sheet-title">${t('machineSettings')}</h3>
    <p class="sheet-sub">${esc(exName(exId))} · ${esc(gymName(gymId) || t('noGym'))}</p>
    <div class="mf-fields"></div>
    <div class="chip-wrap mf-sug">${(SUGGEST[S.settings.lang] || SUGGEST.nl).map((s) => `<button class="fchip" data-a="mfAdd" data-l="${esc(s)}">+ ${esc(s)}</button>`).join('')}<button class="fchip" data-a="mfAdd" data-l="">+ ${t('otherField')}</button></div>
    <label class="field"><span>${t('machineNote')}</span><textarea id="mf-note" rows="2" placeholder="${t('machineNotePh')}">${esc(m.note || '')}</textarea></label>
    <div class="field-row">
      <label class="field"><span>${t('plusWeight')}</span><input id="mf-plus" inputmode="decimal" value="${fmtNum(m.plusKg)}" placeholder="${t('plusWeightPh')}"></label>
      <label class="field"><span>${t('stepKg')}</span><input id="mf-step" inputmode="decimal" value="${fmtNum(m.step)}" placeholder="${fmtNum(S.settings.step)}"></label>
    </div>
    <p class="hint">${t('plusHint')}</p>
    <button class="btn primary btn-block" data-a="mfSave">${t('save')}</button>`, { cls: 'form-sheet', onClose: () => { mf = null; } });
  renderMf();
}
function readMf() {
  const el = sheetEl();
  if (!el || !mf) return;
  el.querySelectorAll('.mf-row').forEach((r, i) => {
    mf.fields[i] = { label: r.querySelector('.mf-label').value.trim(), value: r.querySelector('.mf-val').value.trim() };
  });
}
function renderMf(focusLast) {
  const el = sheetEl();
  el.querySelector('.mf-fields').innerHTML = mf.fields.length
    ? mf.fields.map((f, i) => `<div class="mf-row"><input class="mf-label" value="${esc(f.label)}" placeholder="${t('fieldName')}" autocomplete="off"><input class="mf-val" value="${esc(f.value)}" placeholder="${t('value')}" autocomplete="off"><button class="icon-btn" data-a="mfDel" data-i="${i}" aria-label="${t('delete')}">${icon('x')}</button></div>`).join('')
    : `<p class="muted small">${t('noFieldsYet')}</p>`;
  if (focusLast) {
    const rows = el.querySelectorAll('.mf-row');
    const last = rows[rows.length - 1];
    if (last) (last.querySelector('.mf-label').value ? last.querySelector('.mf-val') : last.querySelector('.mf-label')).focus();
  }
}
A.mfAdd = (el) => { readMf(); mf.fields.push({ label: el.dataset.l, value: '' }); renderMf(true); };
A.mfDel = (el) => { readMf(); mf.fields.splice(+el.dataset.i, 1); renderMf(); };
A.mfSave = () => {
  readMf();
  const el = sheetEl();
  const m = {
    fields: mf.fields.filter((f) => f.label || f.value),
    note: el.querySelector('#mf-note').value.trim(),
    plusKg: parseNum(el.querySelector('#mf-plus').value),
    step: parseNum(el.querySelector('#mf-step').value),
  };
  setMeta(mf.exId, mf.gymId, m);
  const cb = mf.onDone;
  closeSheet();
  if (cb) cb(); else render();
};
