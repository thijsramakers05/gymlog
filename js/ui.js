// Sheets (van onderen), dialogen, toasts.
import { A } from './core.js';
import { esc, icon } from './util.js';
import { t } from './i18n.js';

const root = () => document.getElementById('overlay-root');
const stack = [];

export function openSheet(html, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-a="closeSheet"></div><div class="sheet ${opts.full ? 'full' : ''} ${opts.cls || ''}"><div class="grabber"></div><div class="sheet-body">${html}</div></div>`;
  wrap.addEventListener('touchmove', (e) => { if (!e.target.closest('.sheet')) e.preventDefault(); }, { passive: false });
  root().appendChild(wrap);
  stack.push({ wrap, opts });
  document.body.classList.add('noscroll');
  return wrap;
}

export const sheetEl = () => (stack.length ? stack[stack.length - 1].wrap : null);

export function updateSheet(html) {
  const el = sheetEl();
  if (el) el.querySelector('.sheet-body').innerHTML = html;
}

export function closeSheet(val) {
  const top = stack.pop();
  if (!top) return;
  if (document.activeElement && top.wrap.contains(document.activeElement)) document.activeElement.blur();
  top.wrap.classList.add('closing');
  setTimeout(() => top.wrap.remove(), 200);
  if (!stack.length) document.body.classList.remove('noscroll');
  if (top.opts.onClose) top.opts.onClose(val);
}
A.closeSheet = () => closeSheet();

export function actionSheet({ title, sub, options }) {
  return new Promise((res) => {
    const html = `${title ? `<div class="as-title">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>` : ''}
      <div class="as-list">${options.map((o, i) => `<button class="as-opt ${o.danger ? 'danger' : ''} ${o.checked ? 'checked' : ''}" data-a="asPick" data-i="${i}">${o.icon ? icon(o.icon) : '<span class="ic"></span>'}<span class="as-label">${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>${o.checked ? icon('check', 'as-check') : ''}</button>`).join('')}</div>
      <button class="as-cancel" data-a="closeSheet">${t('cancel')}</button>`;
    openSheet(html, { cls: 'as', onClose: (v) => res(v) });
  }).then((i) => {
    if (i == null) return null;
    const o = options[i];
    if (o.fn) o.fn();
    return o.value !== undefined ? o.value : i;
  });
}
A.asPick = (el) => closeSheet(+el.dataset.i);

function dialog(inner, onClick) {
  const wrap = document.createElement('div');
  wrap.className = 'dlg-wrap';
  wrap.innerHTML = `<div class="dlg">${inner}</div>`;
  wrap.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    e.stopPropagation();
    onClick(b, () => wrap.remove());
  });
  root().appendChild(wrap);
  return wrap;
}

export function choose({ title, text, options }) {
  return new Promise((res) => {
    const inner = `<div class="dlg-body">${title ? `<h3>${esc(title)}</h3>` : ''}${text ? `<p>${esc(text)}</p>` : ''}</div>
      <div class="dlg-btns ${options.length > 2 ? 'col' : ''}">${options.map((o, i) => `<button class="${o.primary ? 'primary' : ''} ${o.danger ? 'danger' : ''}" data-i="${i}">${esc(o.label)}</button>`).join('')}</div>`;
    dialog(inner, (b, close) => { close(); res(options[+b.dataset.i].value); });
  });
}

export const confirmDialog = ({ title, text, ok, cancel, danger }) => choose({
  title,
  text,
  options: [{ label: cancel || t('cancel'), value: false }, { label: ok || t('ok'), value: true, primary: !danger, danger }],
});

export function promptText({ title, text, value = '', placeholder = '', inputmode = 'text', ok }) {
  return new Promise((res) => {
    const inner = `<div class="dlg-body">${title ? `<h3>${esc(title)}</h3>` : ''}${text ? `<p>${esc(text)}</p>` : ''}
      <input class="dlg-input" value="${esc(value)}" placeholder="${esc(placeholder)}" inputmode="${inputmode}" autocomplete="off"></div>
      <div class="dlg-btns"><button data-i="0">${t('cancel')}</button><button class="primary" data-i="1">${esc(ok || t('ok'))}</button></div>`;
    let wrap;
    const finish = (v) => { wrap.remove(); res(v); };
    wrap = dialog(inner, (b) => finish(b.dataset.i === '1' ? wrap.querySelector('input').value.trim() : null));
    const input = wrap.querySelector('input');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value.trim()); });
    input.focus();
    try { input.setSelectionRange(0, input.value.length); } catch (e) { /* type zonder selectie */ }
  });
}

export function toast(msg, ic) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${ic ? icon(ic) : ''}<span>${esc(msg)}</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2300);
  setTimeout(() => el.remove(), 2700);
}
