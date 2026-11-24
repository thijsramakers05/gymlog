// Historie: streak, kalender, lijst van workouts, workout-detail.
import { S, persist, putSession, deleteSession } from '../store.js';
import { A, IN, registerView, render, go, back } from '../core.js';
import { t } from '../i18n.js';
import { esc, icon, uid, fmtSet, fmtNum, parseNum, fmtBig, fmtDurShort, fmtDateLong, fmtTime, startOfDay, weekStart, debounce } from '../util.js';
import { exName, gymName, gymColor, sessionStats, realSessions, weekStreak, setLabel } from '../logic.js';
import { navBar, notFound, metaChips } from './shared.js';
import { actionSheet, confirmDialog, toast } from '../ui.js';
import { locale } from '../util.js';

let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); })();
let selDay = null;

export function statTiles() {
  const list = realSessions();
  const thisWeek = list.filter((s) => s.start >= weekStart(Date.now())).length;
  const streak = weekStreak();
  return `<div class="stat-row">
    <div class="stat"><div class="stat-v">${icon('flame', 'flame')}${streak}</div><div class="stat-l">${t('weeksStreak')}</div></div>
    <div class="stat"><div class="stat-v">${thisWeek}</div><div class="stat-l">${t('thisWeek')}</div></div>
    <div class="stat"><div class="stat-v">${list.length}</div><div class="stat-l">${t('totalWorkouts')}</div></div>
  </div>`;
}

function calendar(list) {
  const m = new Date(calMonth);
  const y = m.getFullYear();
  const mo = m.getMonth();
  const offset = (new Date(y, mo, 1).getDay() + 6) % 7;
  const days = new Date(y, mo + 1, 0).getDate();
  const has = new Map();
  list.forEach((s) => { const k = startOfDay(s.start); has.set(k, (has.get(k) || 0) + 1); });
  const today = startOfDay(Date.now());
  const wd = t('weekdaysShort').split(',');
  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const ts = new Date(y, mo, d).getTime();
    const n = has.get(ts) || 0;
    cells += `<button class="cal-day ${n ? 'has' : ''} ${ts === today ? 'today' : ''} ${ts === selDay ? 'sel' : ''}" data-a="calDay" data-ts="${ts}" ${n ? '' : 'tabindex="-1"'}>${d}${n > 1 ? '<i></i>' : ''}</button>`;
  }
  const title = m.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
  return `<div class="cal-head"><button class="icon-btn" data-a="calNav" data-d="-1" aria-label="‹">${icon('chevL')}</button><b>${esc(title)}</b><button class="icon-btn" data-a="calNav" data-d="1" aria-label="›">${icon('chevR')}</button></div>
    <div class="cal-grid">${wd.map((x) => `<span class="cal-wd">${x}</span>`).join('')}${cells}</div>`;
}

function sessionCard(s) {
  const st = sessionStats(s);
  const shown = s.items.slice(0, 6);
  return `<div class="card sess" data-a="openSession" data-id="${s.id}">
    <div class="sess-top"><div><div class="sess-name">${esc(s.name)}</div><div class="muted small">${esc(fmtDateLong(s.start))} · ${fmtTime(s.start)}</div></div>
      ${st.prs ? `<span class="pr-badge">${icon('trophy', 'xs')} ${st.prs}</span>` : ''}</div>
    <div class="sess-stats"><span>${icon('clock', 'xs')} ${fmtDurShort(st.dur)}</span><span><i class="gym-dot" style="background:${gymColor(s.gymId)}"></i>${esc(gymName(s.gymId) || t('noGym'))}</span><span>${st.sets} sets</span><span>${fmtBig(st.vol)} kg</span></div>
    <div class="sess-ex">${shown.map((it) => `<div><span class="muted">${it.sets.length} ×</span> ${esc(exName(it.exerciseId))}</div>`).join('')}${s.items.length > shown.length ? `<div class="muted">+ ${s.items.length - shown.length}</div>` : ''}</div>
  </div>`;
}

registerView('history', () => {
  const list = realSessions();
  const m = new Date(calMonth);
  const mEnd = new Date(m.getFullYear(), m.getMonth() + 1, 1).getTime();
  const shown = selDay
    ? list.filter((s) => startOfDay(s.start) === selDay)
    : list.filter((s) => s.start >= calMonth && s.start < mEnd);
  const head = selDay ? fmtDateLong(selDay) : m.toLocaleDateString(locale(), { month: 'long' });
  return `<header class="big-head"><h1>${t('tabHistory')}</h1></header>
    ${statTiles()}
    <div class="card cal">${calendar(list)}</div>
    <div class="section-head"><h2 class="cap-first">${esc(head)}</h2>${selDay ? `<button class="link" data-a="calClear">${t('showMonth')}</button>` : ''}</div>
    ${shown.length ? shown.map(sessionCard).join('') : `<p class="muted center pad">${list.length ? t('noSessionsMonth') : t('noSessionsYet')}</p>`}`;
}, { tab: 'history' });

A.calNav = (el) => {
  const m = new Date(calMonth);
  calMonth = new Date(m.getFullYear(), m.getMonth() + +el.dataset.d, 1).getTime();
  selDay = null;
  render();
};
A.calDay = (el) => {
  const ts = +el.dataset.ts;
  if (!el.classList.contains('has')) return;
  selDay = selDay === ts ? null : ts;
  render();
};
A.calClear = () => { selDay = null; render(); };
A.openSession = (el) => go('session/' + el.dataset.id);

// ---------- Detail ----------
let editing = null;

registerView('session', (id) => {
  const s = S.sessions.find((x) => x.id === id);
  if (!s) return notFound();
  const st = sessionStats(s);
  const ed = editing === id;
  const right = ed
    ? `<button class="btn small primary" data-a="sessEditDone">${t('done')}</button>`
    : `<button class="icon-btn" data-a="sessMenu" data-id="${id}" aria-label="${t('more')}">${icon('more')}</button>`;
  return `${navBar({ title: s.name, right })}
    <div class="sd-head"><div class="muted cap-first">${esc(fmtDateLong(s.start))} · ${fmtTime(s.start)}${s.imported ? ' · ' + t('imported') : ''}</div>
      <div class="muted"><i class="gym-dot" style="background:${gymColor(s.gymId)}"></i>${esc(gymName(s.gymId) || t('noGym'))}</div></div>
    <div class="stat-row four">
      <div class="stat"><div class="stat-v">${s.imported ? '—' : fmtDurShort(st.dur)}</div><div class="stat-l">${t('duration')}</div></div>
      <div class="stat"><div class="stat-v">${st.sets}</div><div class="stat-l">sets</div></div>
      <div class="stat"><div class="stat-v">${fmtBig(st.vol)}</div><div class="stat-l">kg ${t('volume')}</div></div>
      <div class="stat"><div class="stat-v">${st.prs}</div><div class="stat-l">PR's</div></div>
    </div>
    ${s.items.map((it, ii) => `<div class="card">
      <button class="ex-name" data-a="openEx" data-id="${it.exerciseId}">${esc(exName(it.exerciseId))}</button>
      ${metaChips(it.meta)}
      ${it.note ? `<div class="ex-note">${icon('note', 'xs')} ${esc(it.note)}</div>` : ''}
      <div class="hist-sets">${it.sets.map((x, j) => `<div class="hs-row"><span class="set-type t-${x.type}">${setLabel(it.sets, j)}</span>
        ${ed ? `<span class="hs-edit"><input class="in" inputmode="decimal" data-in="hsKg" data-s="${id}" data-ii="${ii}" data-j="${j}" value="${fmtNum(x.kg)}"><span>×</span><input class="in" inputmode="numeric" data-in="hsReps" data-s="${id}" data-ii="${ii}" data-j="${j}" value="${x.reps != null ? x.reps : ''}"><button class="icon-btn" data-a="hsDel" data-s="${id}" data-ii="${ii}" data-j="${j}">${icon('trash')}</button></span>`
          : `<span class="hs-val">${esc(fmtSet(x))}</span>${x.pr ? `<span class="pr-mini">${icon('trophy', 'xs')} PR</span>` : ''}`}
        </div>${x.note ? `<div class="set-note">${icon('note', 'xs')} ${esc(x.note)}</div>` : ''}`).join('')}</div>
    </div>`).join('')}`;
}, { tab: 'history' });

const saveEdit = debounce((s) => putSession(s), 400);
const hsRef = (el) => {
  const s = S.sessions.find((x) => x.id === el.dataset.s);
  return { s, set: s.items[+el.dataset.ii].sets[+el.dataset.j] };
};
IN.hsKg = (el) => { const { s, set } = hsRef(el); set.kg = parseNum(el.value); saveEdit(s); };
IN.hsReps = (el) => { const { s, set } = hsRef(el); const n = parseInt(el.value, 10); set.reps = isNaN(n) ? null : n; saveEdit(s); };
A.hsDel = (el) => {
  const { s } = hsRef(el);
  const it = s.items[+el.dataset.ii];
  it.sets.splice(+el.dataset.j, 1);
  if (!it.sets.length) s.items.splice(+el.dataset.ii, 1);
  putSession(s);
  render();
};
A.sessEditDone = () => { editing = null; render(); };

A.sessMenu = async (el) => {
  const s = S.sessions.find((x) => x.id === el.dataset.id);
  const v = await actionSheet({
    title: s.name,
    options: [
      { label: t('editSets'), value: 'edit', icon: 'note' },
      { label: t('saveAsTpl'), value: 'tpl', icon: 'copy' },
      { label: t('deleteSession'), value: 'del', icon: 'trash', danger: true },
    ],
  });
  if (v === 'edit') { editing = s.id; render(); } else if (v === 'tpl') {
    const nt = { id: uid(), name: s.name, gymId: s.gymId || null, note: '', items: s.items.map((it) => ({ id: uid(), exerciseId: it.exerciseId, alts: {}, supersetId: it.supersetId || null, sets: it.sets.map((x) => ({ type: x.type })) })) };
    S.templates.push(nt);
    persist('templates');
    toast(t('tplCreated'), 'check');
  } else if (v === 'del') {
    const ok = await confirmDialog({ title: t('deleteSessionQ'), text: t('deleteSessionText'), ok: t('delete'), danger: true });
    if (!ok) return;
    await deleteSession(s.id);
    back('history');
  }
};
