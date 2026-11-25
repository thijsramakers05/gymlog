import { S } from './store.js';
import { t } from './i18n.js';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const DAY = 864e5;

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

export const locale = () => (S.settings.lang === 'en' ? 'en-GB' : 'nl-NL');

export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isFinite(n) ? n : null;
}

export function fmtNum(n) {
  if (n == null || n === '' || !isFinite(n)) return '';
  const s = String(Math.round(n * 1000) / 1000);
  return S.settings.lang === 'en' ? s : s.replace('.', ',');
}

export function fmtSet(s) {
  if (!s || (s.kg == null && s.reps == null)) return '—';
  const plus = '+'.repeat(s.plus || 0);
  const kg = s.kg != null ? fmtNum(s.kg) + plus : (plus || '–');
  return s.reps != null ? `${kg} × ${s.reps}` : `${kg} kg`;
}

export const fmtBig = (n) => Math.round(n || 0).toLocaleString(locale());
export const pad = (n) => String(n).padStart(2, '0');

export function fmtDur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

export function fmtDurShort(ms) {
  const m = Math.round((ms || 0) / 60000);
  if (m < 60) return t('minShort', { m });
  return t('hourMin', { h: Math.floor(m / 60), m: m % 60 });
}

export const fmtRest = (sec) => `${Math.floor(sec / 60)}:${pad(Math.max(0, sec) % 60)}`;

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function isoWeek(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const w1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - w1) / DAY - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

export function fmtDate(ts, year) {
  const o = { day: 'numeric', month: 'short' };
  if (year) o.year = 'numeric';
  return new Date(ts).toLocaleDateString(locale(), o);
}
export const fmtDateLong = (ts) => new Date(ts).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

export function relDay(ts) {
  const d = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (d <= 0) return t('today');
  if (d === 1) return t('yesterday');
  if (d < 7) return t('daysAgo', { n: d });
  if (d < 14) return t('weekAgo');
  if (d < 60) return t('weeksAgo', { n: Math.floor(d / 7) });
  return fmtDate(ts, true);
}

export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const dateStrToTs = (s) => {
  const [y, m, d] = String(s).split('-').map(Number);
  return y ? new Date(y, (m || 1) - 1, d || 1).getTime() : startOfDay(Date.now());
};

// Naam-normalisatie voor het herkennen van oefeningen en gyms
export function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}
export const sortKey = (s) => normName(s).split(' ').sort().join(' ');
export const compact = (s) => normName(s).replace(/ /g, '');

export function debounce(fn, ms) {
  let tm;
  return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); };
}

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  more: '<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>',
  dumbbell: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor" stroke="none"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  swap: '<path d="M7 4L3.5 7.5 7 11M3.5 7.5H17M17 13l3.5 3.5L17 20M20.5 16.5H7"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H4.5v1.5A3.5 3.5 0 008 11M16 6h3.5v1.5A3.5 3.5 0 0116 11M12 13v4M8.5 20.5h7M10 17h4v3.5h-4z"/>',
  note: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  upload: '<path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 15v4.5h15V15"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 15v4.5h15V15"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.5 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.5-3.5-8.5s1.1-6 3.5-8.5z"/>',
  scale: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 10a5 5 0 017 0M12 10.5l1.5-2"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.4 3.6-8.3.5 1.7 1.4 2.8 2.7 3.4.2-2.6 1.3-5 3.4-6.9.3 3.3 3.3 5.9 3.3 10.2C18.5 17.6 16 21 12 21z"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  chart: '<path d="M4 19.5h16M7 16v-5M12 16V7M17 16v-8"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5v.5"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4M6 11H5v9.5h14V11h-1"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4M9.5 2.5h5"/>',
  warn: '<path d="M12 4L2.8 19.5h18.4L12 4zM12 10v4.5M12 17v.5"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 00.6-7.95A5.5 5.5 0 007.5 9.2 4.66 4.66 0 007 18.5z"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 11-2.2-5.3M19.5 4.5v4h-4"/>',
  logout: '<path d="M14 4.5h4.5a1.5 1.5 0 011.5 1.5v12a1.5 1.5 0 01-1.5 1.5H14M10 16.5L5.5 12 10 7.5M5.5 12H15"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 015.5 7h2.3l1.5-2.2h5.4L16.2 7h2.3A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5z"/><circle cx="12" cy="13" r="3.4"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
