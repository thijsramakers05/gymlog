import { S, openStore, persist } from './store.js';
import { A, IN, CH, initRouter } from './core.js';
import { ensureLibrary } from './logic.js';
import { uid } from './util.js';
import './views/home.js';
import './views/template.js';
import { tick } from './views/workout.js';
import './views/history.js';
import './views/exercises.js';
import './views/profile.js';
import './views/import.js';

function bindEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el || el.disabled) return;
    const fn = A[el.dataset.a];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest && e.target.closest('[data-in]');
    if (el && IN[el.dataset.in]) IN[el.dataset.in](el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest && e.target.closest('[data-ch]');
    if (el && CH[el.dataset.ch]) CH[el.dataset.ch](el, e);
  });
  // Toetsenbord-hoogte bijhouden zodat sheets erboven blijven
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const upd = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', kb + 'px');
    };
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
  }
}

async function init() {
  await openStore();
  if (!S.settings.seeded) {
    if (!S.gyms.length) {
      S.gyms = [
        { id: uid(), name: 'Trainmore Koningin Wilhelminaplein' },
        { id: uid(), name: 'Basic Fit Sittard' },
      ];
    }
    S.settings.gymId = S.gyms[0].id;
    S.settings.seeded = true;
    await persist('gyms', 'settings');
  }
  if (!S.settings.gymId && S.gyms.length) S.settings.gymId = S.gyms[0].id;
  ensureLibrary();
  document.documentElement.lang = S.settings.lang;
  bindEvents();
  initRouter();
  setInterval(tick, 1000);
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  if ('serviceWorker' in navigator && !local) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div style="padding:60px 24px;font-family:-apple-system,sans-serif"><h2>Gymlog kon niet starten</h2><p>${String(e && e.message)}</p></div>`;
});
