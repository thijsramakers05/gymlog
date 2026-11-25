import { S, openStore, persist } from './store.js';
import { A, IN, CH, initRouter, setPreRoute } from './core.js';
import { ensureLibrary } from './logic.js';
import { uid } from './util.js';
import { injectSprite } from './visual.js';
import { initCloud, captureAuthLink } from './cloud.js';
import { initMoveNotice } from './move.js';
import './views/home.js';
import './views/account.js';
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
  // Formulieren nooit echt versturen (Enter in een veld klikt op de knop, die de actie uitvoert)
  document.addEventListener('submit', (e) => e.preventDefault());
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
  captureAuthLink(); // link uit een e-mail (bevestigen / wachtwoord vergeten)
  // Als de database niet binnen 3 s opent (bijv. een oud Gymbie-venster houdt hem vast), uitleg tonen i.p.v. een leeg scherm.
  const slow = setTimeout(() => {
    const app = document.getElementById('app');
    if (app && !app.innerHTML) {
      app.innerHTML = `<div style="padding:calc(env(safe-area-inset-top) + 60px) 28px;font-family:-apple-system,sans-serif;line-height:1.45">
        <h2 style="margin:0 0 10px">Gymbie wordt bijgewerkt…</h2>
        <p>Er staat nog een ander venster of tabblad met Gymbie open. Sluit dat (of sluit de app helemaal af) en open Gymbie opnieuw.</p>
        <p style="opacity:.6;font-size:14px">Another Gymbie window is still open. Close it (or fully close the app) and open Gymbie again.</p></div>`;
    }
  }, 3000);
  await openStore();
  clearTimeout(slow);
  if (document.getElementById('app').innerHTML.includes('Gymbie wordt bijgewerkt')) document.getElementById('app').innerHTML = '';
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
  await initCloud();
  document.documentElement.lang = S.settings.lang;
  injectSprite();
  bindEvents();
  setPreRoute(captureAuthLink);
  initMoveNotice();
  initRouter();
  setInterval(tick, 1000);
  const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
  if ('serviceWorker' in navigator && !local) navigator.serviceWorker.register('sw.js').catch(() => {});
}

init().catch((e) => {
  console.error(e);
  document.getElementById('app').innerHTML = `<div style="padding:60px 24px;font-family:-apple-system,sans-serif"><h2>Gymbie kon niet starten</h2><p>${String(e && e.message)}</p></div>`;
});
