// Profiel: volume per week, spiergroepen, lichaamsgewicht, instellingen, gyms, back-up.
import { S, persist, exportData, replaceAll } from '../store.js';
import { A, CH, registerView, render, go } from '../core.js';
import { t } from '../i18n.js';
import { esc, icon, uid, fmtNum, parseNum, fmtBig, fmtDate, relDay, isoWeek, weekStart, addDays, todayStr, dateStrToTs, fmtRest } from '../util.js';
import { weekSeries, muscleSets, invalidateEx, ensureLibrary } from '../logic.js';
import { navBar, muscleLabel, pickRest } from './shared.js';
import { columnChart, lineChart } from '../charts.js';
import { statTiles } from './history.js';
import { actionSheet, confirmDialog, promptText, toast, openSheet } from '../ui.js';
import * as cloud from '../cloud.js';

export const VERSION = '1.3.0';

let wkMetric = 'sets';
let mWeek = weekStart(Date.now());

function bodyweightCard() {
  const bw = [...S.bodyweight].sort((a, b) => a.t - b.t);
  const last = bw[bw.length - 1];
  const prev = bw[bw.length - 2];
  const delta = last && prev ? Math.round((last.kg - prev.kg) * 10) / 10 : null;
  return `<div class="card tap" data-a="go" data-to="bodyweight">
    <div class="card-head"><h3>${icon('scale', 'sm')} ${t('bodyweight')}</h3>${icon('chevR', 'sm muted')}</div>
    ${last ? `<div class="bw-big"><b>${fmtNum(last.kg)}</b> kg ${delta != null ? `<span class="muted small">${delta > 0 ? '+' : ''}${fmtNum(delta)} kg ${t('sinceLast')}</span>` : ''}</div>
      <div class="muted small">${esc(fmtDate(last.t, true))}</div>` : `<p class="muted small">${t('bwEmpty')}</p>`}
  </div>`;
}

registerView('profile', () => {
  const series = weekSeries(10, wkMetric);
  const bars = series.map((w) => ({
    label: String(isoWeek(w.ws)),
    value: w.value,
    tip: `<b>${esc(wkMetric === 'kg' ? fmtBig(w.value) + ' kg' : w.value + ' sets')}</b><span>${esc(t('weekN', { n: isoWeek(w.ws) }))} · ${esc(fmtDate(w.ws))}</span>`,
  }));
  const ms = muscleSets(mWeek);
  const max = Math.max(1, ...ms.map((m) => m.sets));
  const isThis = mWeek === weekStart(Date.now());
  const lastBackup = S.settings.lastBackup;
  return `<header class="big-head"><h1>${t('tabProfile')}</h1></header>
    ${statTiles()}
    <div class="card">
      <div class="card-head"><h3>${t('perWeek')}</h3><div class="seg small inline"><button class="${wkMetric === 'sets' ? 'on' : ''}" data-a="wkMetric" data-m="sets">sets</button><button class="${wkMetric === 'kg' ? 'on' : ''}" data-a="wkMetric" data-m="kg">kg</button></div></div>
      <p class="chart-title muted small">${wkMetric === 'kg' ? t('perWeekKg') : t('perWeekSets')}</p>
      ${columnChart({ bars })}
    </div>
    <div class="card">
      <div class="card-head"><h3>${t('muscleGroups')}</h3><div class="week-nav"><button class="icon-btn" data-a="mWeek" data-d="-1">${icon('chevL', 'sm')}</button><span>${isThis ? t('thisWeek') : t('weekN', { n: isoWeek(mWeek) })}</span><button class="icon-btn" data-a="mWeek" data-d="1" ${isThis ? 'disabled' : ''}>${icon('chevR', 'sm')}</button></div></div>
      ${ms.length ? `<div class="hbars">${ms.map((m) => `<div class="hb-row"><span class="hb-label">${muscleLabel(m.muscle)}</span><div class="hb-track"><div class="hb-fill" style="width:${(m.sets / max) * 100}%"></div></div><span class="hb-val">${m.sets}</span></div>`).join('')}</div><p class="hint">${t('muscleHint')}</p>` : `<p class="muted small">${t('noSetsWeek')}</p>`}
    </div>
    ${bodyweightCard()}
    <h2 class="list-h">${t('account')}</h2>
    <div class="list-card">
      <button class="list-row" data-a="go" data-to="account">${icon('cloud')}<span class="lr-main">${cloud.loggedIn() ? esc(cloud.userEmail()) : t('accountLogin')}<small data-sync-status>${esc(cloud.loggedIn() ? cloud.statusText() : t('accountLoginSub'))}</small></span>${icon('chevR', 'sm muted')}</button>
    </div>
    <h2 class="list-h">${t('settings')}</h2>
    <div class="list-card">
      <button class="list-row" data-a="go" data-to="gyms">${icon('pin')}<span class="lr-main">${t('gyms')}</span><span class="muted">${S.gyms.length}</span>${icon('chevR', 'sm muted')}</button>
      <button class="list-row" data-a="go" data-to="import">${icon('upload')}<span class="lr-main">${t('importSchedule')}</span>${icon('chevR', 'sm muted')}</button>
      <div class="list-row"><span class="ic-wrap">${icon('globe')}</span><span class="lr-main">${t('language')}</span><div class="seg small inline"><button class="${S.settings.lang === 'nl' ? 'on' : ''}" data-a="setLang" data-l="nl">NL</button><button class="${S.settings.lang === 'en' ? 'on' : ''}" data-a="setLang" data-l="en">EN</button></div></div>
      <button class="list-row" data-a="togglePrevGym">${icon('pin')}<span class="lr-main">${t('prevByGym')}<small>${t('prevByGymSub')}</small></span><span class="switch ${S.settings.prevByGym ? 'on' : ''}"></span></button>
      <button class="list-row" data-a="setRest">${icon('timer')}<span class="lr-main">${t('defaultRest')}</span><span class="muted">${fmtRest(S.settings.rest)}</span></button>
      <button class="list-row" data-a="setStep">${icon('sliders')}<span class="lr-main">${t('defaultStep')}</span><span class="muted">${fmtNum(S.settings.step)} kg</span></button>
      <button class="list-row" data-a="toggleWake">${icon('phone')}<span class="lr-main">${t('keepAwake')}</span><span class="switch ${S.settings.wakeLock ? 'on' : ''}"></span></button>
    </div>
    <h2 class="list-h">${t('backup')}</h2>
    <div class="list-card">
      <button class="list-row" data-a="backupExport">${icon('download')}<span class="lr-main">${t('backupMake')}<small>${lastBackup ? t('lastBackup', { when: relDay(lastBackup) }) : t('neverBackup')}</small></span>${icon('chevR', 'sm muted')}</button>
      <label class="list-row">${icon('share')}<span class="lr-main">${t('backupRestore')}</span>${icon('chevR', 'sm muted')}<input type="file" class="vh" accept=".json,application/json" data-ch="backupImport"></label>
    </div>
    ${lastBackup && Date.now() - lastBackup < 14 * 864e5 ? '' : `<p class="hint">${t('backupHint')}</p>`}
    <div class="list-card">
      <button class="list-row" data-a="installHelp">${icon('info')}<span class="lr-main">${t('installHelp')}</span>${icon('chevR', 'sm muted')}</button>
      <button class="list-row danger" data-a="wipeAll">${icon('trash')}<span class="lr-main">${t('wipeAll')}</span></button>
    </div>
    <p class="muted center small pad">Gymbie ${VERSION}</p>`;
}, { tab: 'profile' });

A.wkMetric = (el) => { wkMetric = el.dataset.m; render(); };
A.mWeek = (el) => {
  const n = weekStart(addDays(mWeek, +el.dataset.d * 7 + 1));
  if (n > weekStart(Date.now())) return;
  mWeek = n;
  render();
};
A.setLang = (el) => {
  S.settings.lang = el.dataset.l;
  document.documentElement.lang = S.settings.lang;
  persist('settings');
  render();
};
A.togglePrevGym = () => { S.settings.prevByGym = !S.settings.prevByGym; persist('settings'); render(); };
A.toggleWake = () => { S.settings.wakeLock = !S.settings.wakeLock; persist('settings'); render(); };
A.setRest = async () => {
  const sec = await pickRest(S.settings.rest, t('defaultRest'));
  if (sec) { S.settings.rest = sec; persist('settings'); render(); }
};
A.setStep = async () => {
  const opts = [0.5, 1, 1.25, 2, 2.5, 5];
  const v = await actionSheet({ title: t('defaultStep'), options: opts.map((s) => ({ label: fmtNum(s) + ' kg', value: s, checked: s === S.settings.step })) });
  if (v) { S.settings.step = v; persist('settings'); render(); }
};

A.backupExport = async () => {
  const data = JSON.stringify(await exportData());
  const name = `gymbie-backup-${todayStr()}.json`;
  const mark = () => { S.settings.lastBackup = Date.now(); persist('settings'); render(); };
  let file = null;
  try { file = new File([data], name, { type: 'application/json' }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); mark(); toast(t('backupDone'), 'check'); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  mark();
  toast(t('backupDone'), 'check');
};

CH.backupImport = async (el) => {
  const f = el.files && el.files[0];
  el.value = '';
  if (!f) return;
  let data;
  try { data = JSON.parse(await f.text()); } catch (e) { toast(t('backupInvalid')); return; }
  if (!data || data.app !== 'gymlog') { toast(t('backupInvalid')); return; }
  const n = (data.sessions || []).length;
  const text = t('restoreText', { n, date: data.exportedAt ? fmtDate(data.exportedAt, true) : '?' }) + (cloud.loggedIn() ? '\n\n' + t('restoreAccountNote') : '');
  const ok = await confirmDialog({ title: t('restoreQ'), text, ok: t('restore'), danger: true });
  if (!ok) return;
  await replaceAll(data);
  invalidateEx();
  ensureLibrary();
  toast(t('restored'), 'check');
  go('home', true);
};

A.wipeAll = async () => {
  const text = t('wipeText') + (cloud.loggedIn() ? '\n\n' + t('wipeAccountNote') : '');
  const ok = await confirmDialog({ title: t('wipeQ'), text, ok: t('wipeAll'), danger: true });
  if (!ok) return;
  const ok2 = await confirmDialog({ title: t('wipeQ2'), text: t('wipeText2'), ok: t('wipeAll'), danger: true });
  if (!ok2) return;
  // Eerst loskoppelen van het account, zodat het wissen niet naar de server wordt gesynchroniseerd
  await cloud.forgetAccountLocally();
  await replaceAll({ settings: { lang: S.settings.lang } });
  invalidateEx();
  location.reload();
};

A.installHelp = () => {
  openSheet(`<h3 class="sheet-title">${t('installHelp')}</h3>
    <ol class="steps">
      <li>${t('install1')}</li>
      <li>${t('install2')}</li>
      <li>${t('install3')}</li>
      <li>${t('install4')}</li>
    </ol>
    <p class="hint">${t('installNote')}</p>
    <button class="btn primary btn-block" data-a="closeSheet">${t('ok')}</button>`, { cls: 'form-sheet' });
};

// ---------- Lichaamsgewicht ----------
registerView('bodyweight', () => {
  const bw = [...S.bodyweight].sort((a, b) => b.t - a.t);
  const pts = [...bw].reverse().map((e) => ({ x: e.t, y: e.kg, tip: `<b>${esc(fmtNum(e.kg))} kg</b><span>${esc(fmtDate(e.t, true))}</span>` }));
  return `${navBar({ title: t('bodyweight') })}
    <div class="card bw-add">
      <label class="field"><span>${t('weightKg')}</span><input id="bw-kg" inputmode="decimal" placeholder="${bw[0] ? fmtNum(bw[0].kg) : '80'}" autocomplete="off"></label>
      <label class="field"><span>${t('date')}</span><input id="bw-date" type="date" value="${todayStr()}"></label>
      <button class="btn primary" data-a="bwAdd">${t('add')}</button>
    </div>
    <div class="card"><p class="chart-title">${t('bodyweight')} (kg)</p>${lineChart({ series: [{ name: t('bodyweight'), color: 'var(--accent)', points: pts }], xFmt: (x) => fmtDate(x), yFmt: (v) => fmtNum(v), emptyText: t('bwEmpty') })}</div>
    ${bw.length ? `<div class="list-card">${bw.map((e) => `<div class="list-row"><span class="lr-main">${esc(fmtDate(e.t, true))}</span><b>${fmtNum(e.kg)} kg</b><button class="icon-btn" data-a="bwDel" data-id="${e.id}" aria-label="${t('delete')}">${icon('trash', 'sm')}</button></div>`).join('')}</div>` : ''}`;
}, { tab: 'profile' });

A.bwAdd = () => {
  const kg = parseNum(document.getElementById('bw-kg').value);
  if (!kg || kg < 20 || kg > 400) { toast(t('bwInvalid')); return; }
  const ts = dateStrToTs(document.getElementById('bw-date').value) + 12 * 3600e3;
  S.bodyweight.push({ id: uid(), t: ts, kg });
  persist('bodyweight');
  render();
  toast(t('saved'), 'check');
};
A.bwDel = (el) => {
  S.bodyweight = S.bodyweight.filter((e) => e.id !== el.dataset.id);
  persist('bodyweight');
  render();
};

// ---------- Gyms ----------
registerView('gyms', () => `${navBar({ title: t('gyms'), right: `<button class="icon-btn accent" data-a="gymAdd" aria-label="${t('addGym')}">${icon('plus')}</button>` })}
  <div class="list-card">${S.gyms.map((g) => {
    const n = S.sessions.filter((s) => s.gymId === g.id && !s.imported).length;
    return `<div class="list-row"><span class="lr-main">${esc(g.name)}<small>${t('nWorkoutsLogged', { n })}${S.settings.gymId === g.id ? ' · ' + t('current') : ''}</small></span>
      <button class="icon-btn" data-a="gymEdit" data-id="${g.id}" aria-label="${t('edit')}">${icon('note', 'sm')}</button>
      <button class="icon-btn" data-a="gymDel" data-id="${g.id}" aria-label="${t('delete')}">${icon('trash', 'sm')}</button></div>`;
  }).join('') || `<p class="muted pad">${t('noGyms')}</p>`}</div>
  <p class="hint">${t('gymsHint')}</p>`, { tab: 'profile' });

A.gymAdd = async () => {
  const name = await promptText({ title: t('addGym'), placeholder: t('gymNamePh') });
  if (!name) return;
  S.gyms.push({ id: uid(), name });
  if (!S.settings.gymId) S.settings.gymId = S.gyms[0].id;
  persist('gyms', 'settings');
  render();
};
A.gymEdit = async (el) => {
  const g = S.gyms.find((x) => x.id === el.dataset.id);
  const name = await promptText({ title: t('renameGym'), value: g.name });
  if (!name) return;
  g.name = name;
  persist('gyms');
  render();
};
A.gymDel = async (el) => {
  const g = S.gyms.find((x) => x.id === el.dataset.id);
  const used = S.sessions.some((s) => s.gymId === g.id) || S.templates.some((x) => x.gymId === g.id);
  if (used) { toast(t('gymInUse')); return; }
  const ok = await confirmDialog({ title: t('deleteGymQ'), text: g.name, ok: t('delete'), danger: true });
  if (!ok) return;
  S.gyms = S.gyms.filter((x) => x.id !== g.id);
  if (S.settings.gymId === g.id) S.settings.gymId = S.gyms[0] ? S.gyms[0].id : null;
  persist('gyms', 'settings');
  render();
};
