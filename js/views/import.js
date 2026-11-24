// Schema importeren: Excel-bestand of geplakte tekst, met controle-scherm.
import { S, persist, putSession } from '../store.js';
import { A, IN, CH, registerView, render, go } from '../core.js';
import { t } from '../i18n.js';
import { esc, icon, uid, fmtNum, todayStr, dateStrToTs, normName } from '../util.js';
import { exById, exName, matchExercise, matchGym, guessMuscle, invalidateEx } from '../logic.js';
import { readXlsx, parseGrid, parseText } from '../importer.js';
import { navBar, openPicker } from './shared.js';
import { actionSheet, toast } from '../ui.js';

let imp = fresh();
function fresh() { return { step: 'input', blocks: [], history: true, date: todayStr(), error: '', text: '' }; }

function toPreview(raw) {
  return raw.map((b) => {
    let gymId = '';
    if (b.gym) gymId = matchGym(b.gym) || 'new:' + b.gym;
    else gymId = S.settings.gymId || '';
    const existing = S.templates.find((x) => normName(x.name) === normName(b.name) && (x.gymId || '') === (gymId.startsWith('new:') ? '_' : gymId));
    return {
      include: true,
      gymId,
      gymRaw: b.gym,
      name: b.name,
      note: b.note || '',
      existing: existing ? existing.id : null,
      replace: !!existing,
      items: b.rows.map((r) => ({ name: r.name, exId: matchExercise(r.name), sets: r.sets })),
    };
  });
}

function inputHTML() {
  return `${navBar({ title: t('importTitle') })}
    <p class="hint">${t('importIntro')}</p>
    <div class="card">
      <h3 class="card-h">${icon('upload', 'sm')} ${t('importFile')}</h3>
      <p class="muted small">${t('importFileText')}</p>
      <label class="btn primary btn-block">${t('chooseFile')}<input type="file" class="vh" accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv" data-ch="impFile"></label>
    </div>
    <div class="card">
      <h3 class="card-h">${icon('note', 'sm')} ${t('importPaste')}</h3>
      <p class="muted small">${t('importPasteText')}</p>
      <textarea id="imp-text" class="imp-text" rows="9" placeholder="${esc(t('importExample'))}">${esc(imp.text)}</textarea>
      <button class="btn primary btn-block" data-a="impParse">${t('process')}</button>
    </div>
    ${imp.error ? `<p class="error">${icon('warn', 'sm')} ${esc(imp.error)}</p>` : ''}`;
}

function mapLabel(it) {
  if (!it.exId) return `<span class="map-chip new">${icon('plus', 'xs')} ${t('newEx')}</span>`;
  const ex = exById(it.exId);
  const same = ex && normName(ex.name) === normName(it.name);
  return `<span class="map-chip linked">${icon('link', 'xs')} ${same ? t('existingEx') : esc(exName(it.exId))}</span>`;
}

function setInput(bi, ii, si, s) {
  if (s.planned) return `<span class="ib-set planned">${s.targetReps ? '× ' + s.targetReps : t('emptySet')}</span>`;
  const kg = s.kg != null ? fmtNum(s.kg) + '+'.repeat(s.plus || 0) : '';
  const d = `data-b="${bi}" data-i="${ii}" data-s="${si}"`;
  return `<span class="ib-set ${s.warn ? 'warn' : ''}"><input data-in="ibKg" ${d} value="${esc(kg)}" inputmode="decimal" aria-label="kg"><i>×</i><input data-in="ibReps" ${d} value="${s.reps != null ? s.reps : ''}" inputmode="numeric" aria-label="reps"></span>`;
}

function blockHTML(b, bi) {
  const gymOpts = S.gyms.map((g) => `<option value="${g.id}" ${b.gymId === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
  const newOpt = b.gymId.startsWith('new:') ? `<option value="${esc(b.gymId)}" selected>${esc(t('newGymOpt', { name: b.gymId.slice(4) }))}</option>` : '';
  return `<div class="card imp-block ${b.include ? '' : 'off'}">
    <div class="ib-head"><label class="cb"><input type="checkbox" data-ch="ibInclude" data-b="${bi}" ${b.include ? 'checked' : ''}><span></span></label>
      <input class="ib-name" data-in="ibName" data-b="${bi}" value="${esc(b.name)}" aria-label="${t('workoutName')}"></div>
    <label class="ib-gym"><span class="muted small">${icon('pin', 'xs')} ${t('gym')}</span><select data-ch="ibGym" data-b="${bi}">${newOpt}${gymOpts}<option value="" ${b.gymId === '' ? 'selected' : ''}>${t('allGyms')}</option></select></label>
    ${b.existing ? `<label class="toggle-row small"><span>${t('replaceExisting')}</span><input type="checkbox" data-ch="ibReplace" data-b="${bi}" ${b.replace ? 'checked' : ''}></label>` : ''}
    ${b.note ? `<div class="muted small">${icon('note', 'xs')} ${esc(b.note)}</div>` : ''}
    <div class="ib-items">${b.items.map((it, ii) => `<div class="ib-item">
      <div class="ib-ex"><span class="ib-exname">${esc(it.name)}</span><button class="map-btn" data-a="ibMap" data-b="${bi}" data-i="${ii}">${mapLabel(it)}</button></div>
      <div class="ib-sets">${it.sets.map((s, si) => setInput(bi, ii, si, s)).join('')}</div></div>`).join('')}</div>
  </div>`;
}

function previewHTML() {
  const n = imp.blocks.filter((b) => b.include).length;
  const warn = imp.blocks.some((b) => b.items.some((it) => it.sets.some((s) => s.warn)));
  return `${navBar({ title: t('checkImport') })}
    <p class="hint">${t('foundN', { n: imp.blocks.length })}</p>
    ${warn ? `<p class="warn-box">${icon('warn', 'sm')} ${t('warnHint')}</p>` : ''}
    <div class="card">
      <label class="toggle-row"><span>${t('importWeights')}<small>${t('importWeightsSub')}</small></span><input type="checkbox" data-ch="impHist" ${imp.history ? 'checked' : ''}></label>
      ${imp.history ? `<label class="toggle-row"><span>${t('weightsDate')}</span><input type="date" data-ch="impDate" value="${imp.date}"></label>` : ''}
    </div>
    ${imp.blocks.map(blockHTML).join('')}
    <div class="sticky-foot"><button class="btn secondary" data-a="impBack">${t('back')}</button><button class="btn primary grow" data-a="impCommit" ${n ? '' : 'disabled'}>${t('importN', { n })}</button></div>`;
}

registerView('import', () => (imp.step === 'preview' ? previewHTML() : inputHTML()), { tab: 'home' });

function showPreview(raw) {
  if (!raw.length) { imp.error = t('importNothing'); render(); return; }
  imp.blocks = toPreview(raw);
  imp.step = 'preview';
  imp.error = '';
  render({ y: 0 });
}

const isGym = (s) => !!matchGym(s);

A.impParse = () => {
  const text = document.getElementById('imp-text').value;
  imp.text = text;
  showPreview(parseText(text, isGym));
};

CH.impFile = async (el) => {
  const f = el.files && el.files[0];
  el.value = '';
  if (!f) return;
  try {
    if (/\.xlsx$/i.test(f.name) || f.type.includes('spreadsheetml')) {
      const sheets = await readXlsx(await f.arrayBuffer());
      showPreview(sheets.flatMap((s) => parseGrid(s.grid)));
    } else if (/\.xls$/i.test(f.name)) {
      imp.error = t('xlsOld');
      render();
    } else {
      showPreview(parseText(await f.text(), isGym));
    }
  } catch (e) {
    console.error(e);
    imp.error = e.message === 'nodecomp' ? t('xlsxUnsupported') : t('importFailed');
    render();
  }
};

A.impBack = () => { imp.step = 'input'; render({ y: 0 }); };

CH.ibInclude = (el) => { imp.blocks[+el.dataset.b].include = el.checked; render(); };
CH.ibReplace = (el) => { imp.blocks[+el.dataset.b].replace = el.checked; };
CH.ibGym = (el) => {
  const b = imp.blocks[+el.dataset.b];
  b.gymId = el.value;
  const ex = S.templates.find((x) => normName(x.name) === normName(b.name) && (x.gymId || '') === b.gymId);
  b.existing = ex ? ex.id : null;
  b.replace = !!ex;
  render();
};
CH.impHist = (el) => { imp.history = el.checked; render(); };
CH.impDate = (el) => { imp.date = el.value || todayStr(); };
IN.ibName = (el) => { imp.blocks[+el.dataset.b].name = el.value; };
IN.ibKg = (el) => {
  const s = imp.blocks[+el.dataset.b].items[+el.dataset.i].sets[+el.dataset.s];
  const m = /^(\d+(?:[.,]\d+)?)?\s*(\+*)$/.exec(el.value.trim());
  if (m) { s.kg = m[1] ? +m[1].replace(',', '.') : null; s.plus = m[2].length; s.warn = false; el.parentElement.classList.remove('warn'); }
};
IN.ibReps = (el) => {
  const s = imp.blocks[+el.dataset.b].items[+el.dataset.i].sets[+el.dataset.s];
  const n = parseInt(el.value, 10);
  s.reps = isNaN(n) ? null : n;
};

A.ibMap = async (el) => {
  const it = imp.blocks[+el.dataset.b].items[+el.dataset.i];
  const v = await actionSheet({
    title: it.name,
    options: [
      { label: t('mapNew', { name: it.name }), value: 'new', icon: 'plus', checked: !it.exId },
      { label: t('mapExisting'), value: 'pick', icon: 'link', checked: !!it.exId, sub: it.exId ? exName(it.exId) : '' },
    ],
  });
  if (v === 'new') { it.exId = null; render(); } else if (v === 'pick') {
    openPicker({ title: t('mapExisting'), onPick: ([id]) => { it.exId = id; render(); } });
  }
};

A.impCommit = async () => {
  const blocks = imp.blocks.filter((b) => b.include);
  if (!blocks.length) return;
  const newGyms = new Map();
  for (const b of blocks) {
    if (!b.gymId.startsWith('new:')) continue;
    const name = b.gymId.slice(4);
    const k = normName(name);
    if (!newGyms.has(k)) {
      const g = { id: uid(), name };
      S.gyms.push(g);
      newGyms.set(k, g.id);
    }
    b.gymId = newGyms.get(k);
  }
  const created = new Map();
  for (const b of blocks) {
    for (const it of b.items) {
      if (it.exId) continue;
      const k = normName(it.name);
      let id = created.get(k);
      if (!id) {
        const g = guessMuscle(it.name);
        const ex = { id: uid(), name: it.name.trim(), muscle: g.muscle, equip: g.equip, custom: true };
        S.exercises.push(ex);
        id = ex.id;
        created.set(k, id);
      }
      it.exId = id;
    }
  }
  invalidateEx();
  const base = dateStrToTs(imp.date);
  const writes = [];
  blocks.forEach((b, bi) => {
    const items = b.items.map((it) => ({
      id: uid(),
      exerciseId: it.exId,
      alts: {},
      supersetId: null,
      sets: it.sets.map((s) => (s.targetReps ? { type: 'n', reps: s.targetReps } : { type: 'n' })),
    }));
    const ex = b.replace && b.existing && S.templates.find((x) => x.id === b.existing);
    if (ex) { ex.items = items; ex.name = b.name; if (b.note) ex.note = b.note; ex.gymId = b.gymId || null; } else S.templates.push({ id: uid(), name: b.name, gymId: b.gymId || null, note: b.note, items });
    if (imp.history) {
      const hItems = b.items.map((it) => ({
        exerciseId: it.exId,
        supersetId: null,
        note: '',
        meta: null,
        sets: it.sets.filter((s) => !s.planned && (s.kg != null || s.reps != null)).map((s) => ({ type: 'n', kg: s.kg, reps: s.reps, plus: s.plus || 0, note: '', pr: null })),
      })).filter((x) => x.sets.length);
      if (hItems.length) writes.push(putSession({ id: uid(), imported: true, templateId: null, name: b.name, gymId: b.gymId || null, start: base + bi * 1000, end: base + bi * 1000, items: hItems }));
    }
  });
  if (!S.settings.gymId && S.gyms.length) S.settings.gymId = S.gyms[0].id;
  await Promise.all([...writes, persist('gyms', 'exercises', 'templates', 'settings')]);
  toast(t('importDone', { n: blocks.length }), 'check');
  imp = fresh();
  go('home', true);
};
