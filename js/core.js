// Router, actie-register en de vaste onderdelen (tabbalk, balk 'workout bezig').
import { S } from './store.js';
import { t } from './i18n.js';
import { esc, icon, fmtDur } from './util.js';

export const A = {};   // klik-acties: data-a="naam"
export const IN = {};  // input-events: data-in="naam"
export const CH = {};  // change-events: data-ch="naam"

const views = {};
export function registerView(name, fn, opts = {}) { views[name] = { fn, ...opts }; }

export let route = { name: 'home', params: [] };
let depth = 0;
const scrollMem = {};
let lastKey = null;

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, ...params] = h.split('/');
  return { name: name || 'home', params: params.map(decodeURIComponent) };
}

export function go(path, replace) {
  const h = '#/' + path;
  if (replace) history.replaceState(null, '', h);
  else { history.pushState(null, '', h); depth++; }
  onRoute();
}

export function back(fallback = 'home') {
  if (depth > 0) history.back();
  else go(fallback, true);
}

// Haakje dat vóór elke routewissel kan ingrijpen (bijv. inloglinks uit e-mails)
let preRoute = null;
export function setPreRoute(fn) { preRoute = fn; }

function onRoute() {
  if (preRoute) preRoute();
  if (lastKey != null) scrollMem[lastKey] = window.scrollY;
  route = parseHash();
  const key = location.hash;
  render({ y: scrollMem[key] || 0 });
}

export function initRouter() {
  window.addEventListener('popstate', () => { depth = Math.max(0, depth - 1); onRoute(); });
  route = parseHash();
  render({ y: 0 });
}

// Optionele melding bovenaan de hoofdschermen (bijv. verhuisd naar een nieuwe link)
let notice = null;
export function setNotice(fn) { notice = fn; }
const NOTICE_ROUTES = ['home', 'history', 'friends', 'exercises', 'profile'];

export function render(opts = {}) {
  const v = views[route.name] || views.home;
  const y = opts.y != null ? opts.y : window.scrollY;
  const html = v.fn(...route.params);
  const app = document.getElementById('app');
  const top = notice && NOTICE_ROUTES.includes(route.name) ? notice() : '';
  app.innerHTML = `<main class="screen ${v.cls || ''}">${top}${html}</main>${v.noTabs ? '' : activeBar() + tabbar(v.tab)}`;
  document.body.classList.toggle('has-active', !!S.active && !v.noTabs);
  window.scrollTo(0, y);
  if (v.after) v.after(...route.params);
  lastKey = location.hash;
}

// Rood bolletje op een tab (bijv. nieuwe vriendschapsverzoeken)
const badges = {};
export function setBadge(tab, n) {
  if ((badges[tab] || 0) === n) return;
  badges[tab] = n;
  const b = document.querySelector(`.tab[data-r="${tab}"] .tab-badge`);
  if (b) { b.textContent = n; b.hidden = !n; }
}

function tabbar(active) {
  const tabs = [
    ['home', 'dumbbell', 'tabTraining'],
    ['history', 'calendar', 'tabHistory'],
    ['friends', 'users', 'tabFriends'],
    ['exercises', 'list', 'tabExercises'],
    ['profile', 'user', 'tabProfile'],
  ];
  return `<nav class="tabbar">${tabs.map(([r, ic, k]) => `<button class="tab ${active === r ? 'on' : ''}" data-a="tab" data-r="${r}"><span class="tab-ic">${icon(ic)}<span class="tab-badge" ${badges[r] ? '' : 'hidden'}>${badges[r] || ''}</span></span><span>${t(k)}</span></button>`).join('')}</nav>`;
}

function activeBar() {
  const w = S.active;
  if (!w) return '';
  return `<button class="active-bar" data-a="resumeWo"><span class="ab-dot"></span><span class="ab-name">${esc(w.name)}</span><span class="ab-time" data-tick="el">${fmtDur(Date.now() - w.start)}</span><span class="ab-rest" data-tick="restlabel"></span>${icon('chevR', 'sm')}</button>`;
}

A.tab = (el) => {
  const r = el.dataset.r;
  if (route.name === r) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  depth = 0;
  scrollMem['#/' + r] = scrollMem['#/' + r] || 0;
  go(r, true);
};
A.back = () => back();
A.go = (el) => go(el.dataset.to);
