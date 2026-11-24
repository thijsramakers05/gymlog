// Startscherm: gym kiezen, workouts van die gym, starten.
import { S, persist } from '../store.js';
import { A, registerView, render, go } from '../core.js';
import { t } from '../i18n.js';
import { esc, icon, relDay, uid, clone } from '../util.js';
import { curGym, exName, resolveEx, tplLastDone, gymName } from '../logic.js';
import { pickGym } from './shared.js';
import { startWorkout } from './workout.js';
import { actionSheet, choose, confirmDialog } from '../ui.js';

function tplCard(tpl, gid) {
  const names = tpl.items.map((it) => exName(resolveEx(tpl, it, gid)));
  const sets = tpl.items.reduce((n, it) => n + it.sets.length, 0);
  const last = tplLastDone(tpl.id);
  return `<div class="card tpl" data-a="openTpl" data-id="${tpl.id}">
    <div class="tpl-top"><div class="tpl-titles"><div class="tpl-name">${esc(tpl.name)}</div>
      <div class="tpl-sub">${tpl.gymId ? '' : t('allGyms') + ' · '}${t('nExercises', { n: tpl.items.length })} · ${t('nSets', { n: sets })}</div></div>
      <button class="icon-btn" data-a="tplMenu" data-id="${tpl.id}" aria-label="${t('more')}">${icon('more')}</button></div>
    ${names.length ? `<div class="tpl-ex">${esc(names.join(' · '))}</div>` : ''}
    ${tpl.note ? `<div class="tpl-note">${icon('note', 'xs')} ${esc(tpl.note)}</div>` : ''}
    <div class="tpl-bottom"><span class="muted small">${last ? t('lastDone', { when: relDay(last) }) : t('neverDone')}</span>
      <button class="btn small primary" data-a="startTpl" data-id="${tpl.id}">${icon('play', 'sm')} ${t('start')}</button></div>
  </div>`;
}

registerView('home', () => {
  const gym = curGym();
  const gid = gym ? gym.id : null;
  const tpls = S.templates.filter((x) => !x.gymId || x.gymId === gid);
  const other = S.templates.length - tpls.length;
  return `<header class="big-head"><h1>${t('tabTraining')}</h1></header>
    <button class="gym-chip" data-a="homeGym">${icon('pin')}<span>${esc(gym ? gym.name : t('chooseGym'))}</span>${icon('chevD', 'sm')}</button>
    <button class="btn btn-block secondary start-empty" data-a="startEmpty">${icon('plus')}<span>${t('startEmpty')}</span></button>
    <div class="section-head"><h2>${t('workouts')}</h2>
      <div class="sh-actions"><button class="link" data-a="go" data-to="import">${icon('upload', 'sm')} ${t('import')}</button><button class="link" data-a="newTpl">${icon('plus', 'sm')} ${t('new')}</button></div></div>
    ${tpls.length ? tpls.map((x) => tplCard(x, gid)).join('') : `<div class="empty card">${icon('dumbbell', 'lg')}<h3>${t('noWorkoutsTitle')}</h3><p class="muted">${t('noWorkoutsText')}</p>
      <div class="empty-btns"><button class="btn primary" data-a="go" data-to="import">${icon('upload', 'sm')} ${t('importSchedule')}</button><button class="btn secondary" data-a="newTpl">${t('newWorkout')}</button></div></div>`}
    ${other ? `<p class="muted center small">${t('otherGymWorkouts', { n: other })}</p>` : ''}`;
}, { tab: 'home' });

A.homeGym = async () => {
  const g = await pickGym({ current: S.settings.gymId });
  if (g && g !== 'all') { S.settings.gymId = g; persist('settings'); render(); }
};

export async function beginWorkout(tpl) {
  if (S.active) {
    const c = await choose({
      title: t('activeExistsTitle'),
      text: t('activeExistsText', { name: S.active.name }),
      options: [
        { label: t('resume'), value: 'resume', primary: true },
        { label: t('discardAndStart'), value: 'new', danger: true },
        { label: t('cancel'), value: null },
      ],
    });
    if (c === 'resume') { go('workout'); return; }
    if (c !== 'new') return;
  }
  if (tpl && tpl.gymId && tpl.gymId !== S.settings.gymId) {
    S.settings.gymId = tpl.gymId;
    persist('settings');
  }
  startWorkout(tpl);
}

A.startEmpty = () => beginWorkout(null);
A.startTpl = (el) => beginWorkout(S.templates.find((x) => x.id === el.dataset.id));
A.openTpl = (el) => go('tpl/' + el.dataset.id);
A.newTpl = () => {
  const tpl = { id: uid(), name: t('newWorkout'), gymId: S.settings.gymId || null, note: '', items: [] };
  S.templates.push(tpl);
  persist('templates');
  go('tpl/' + tpl.id);
};

A.tplMenu = async (el) => {
  const tpl = S.templates.find((x) => x.id === el.dataset.id);
  if (!tpl) return;
  const v = await actionSheet({
    title: tpl.name,
    options: [
      { label: t('start'), value: 'start', icon: 'play' },
      { label: t('edit'), value: 'edit', icon: 'note' },
      { label: t('duplicate'), value: 'dup', icon: 'copy' },
      { label: t('delete'), value: 'del', icon: 'trash', danger: true },
    ],
  });
  if (v === 'start') beginWorkout(tpl);
  else if (v === 'edit') go('tpl/' + tpl.id);
  else if (v === 'dup') {
    const c = clone(tpl);
    c.id = uid();
    c.name = tpl.name + ' (2)';
    c.items.forEach((it) => { it.id = uid(); });
    S.templates.splice(S.templates.indexOf(tpl) + 1, 0, c);
    persist('templates');
    render();
  } else if (v === 'del') {
    const ok = await confirmDialog({ title: t('deleteWorkoutQ'), text: tpl.name, ok: t('delete'), danger: true });
    if (ok) { S.templates = S.templates.filter((x) => x.id !== tpl.id); persist('templates'); render(); }
  }
};
