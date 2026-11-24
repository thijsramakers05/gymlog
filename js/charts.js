// Kleine SVG-grafieken met tik-tooltip (lijn en kolom).
import { esc } from './util.js';
import { t } from './i18n.js';

const reg = {};
let seq = 0;
const W = 340;

function niceTicks(min, max, count = 4, integer = false) {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const raw = span / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nrm = raw / mag;
  let step = (nrm <= 1 ? 1 : nrm <= 2 ? 2 : nrm <= 2.5 ? 2.5 : nrm <= 5 ? 5 : 10) * mag;
  if (integer) step = Math.max(1, Math.round(step));
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(Math.round(v * 1000) / 1000);
  return out;
}

const fmtTick = (v) => (Math.abs(v) >= 10000 ? Math.round(v / 1000) + 'K' : String(Math.round(v * 10) / 10));

// series: [{ name, color, points: [{ x, y, tip }] }]
export function lineChart({ series, height = 180, xFmt, yFmt = fmtTick, emptyText }) {
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return `<div class="chart-empty">${esc(emptyText || t('noData'))}</div>`;
  const H = height;
  const pl = 40; const pr = 14; const pt = 12; const pb = 26;
  let xmin = Math.min(...pts.map((p) => p.x));
  let xmax = Math.max(...pts.map((p) => p.x));
  if (xmin === xmax) { xmin -= 864e5 * 3; xmax += 864e5 * 3; }
  const ys = pts.map((p) => p.y);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys), 4);
  const ymin = ticks[0];
  const ymax = ticks[ticks.length - 1];
  const sx = (x) => pl + ((x - xmin) / (xmax - xmin)) * (W - pl - pr);
  const sy = (y) => pt + (1 - (y - ymin) / (ymax - ymin || 1)) * (H - pt - pb);
  const id = 'c' + ++seq;
  const hits = [];
  let svg = '';
  ticks.forEach((v) => {
    const y = sy(v);
    svg += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text class="tick" x="${pl - 6}" y="${y + 4}" text-anchor="end">${esc(yFmt(v))}</text>`;
  });
  let xl = [xmin, xmax];
  if (pts.length > 2) xl.splice(1, 0, (xmin + xmax) / 2);
  if (xFmt) xl = xl.filter((x, i) => i === 0 || xFmt(x) !== xFmt(xl[i - 1]));
  xl.forEach((x, i) => {
    const anchor = i === 0 ? 'start' : i === xl.length - 1 ? 'end' : 'middle';
    svg += `<text class="tick" x="${sx(x)}" y="${H - 6}" text-anchor="${anchor}">${esc(xFmt ? xFmt(x) : '')}</text>`;
  });
  series.forEach((s) => {
    const p = [...s.points].sort((a, b) => a.x - b.x);
    if (!p.length) return;
    const d = p.map((q, i) => `${i ? 'L' : 'M'}${sx(q.x).toFixed(1)},${sy(q.y).toFixed(1)}`).join('');
    const area = `${d}L${sx(p[p.length - 1].x).toFixed(1)},${sy(ymin)}L${sx(p[0].x).toFixed(1)},${sy(ymin)}Z`;
    if (series.length === 1) svg += `<path d="${area}" fill="${s.color}" opacity=".10"/>`;
    svg += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const showDots = p.length <= 16;
    p.forEach((q, i) => {
      const cx = sx(q.x); const cy = sy(q.y);
      if (showDots || i === p.length - 1) svg += `<circle cx="${cx}" cy="${cy}" r="4" fill="${s.color}" class="dot"/>`;
      hits.push({ x: cx, y: cy, tip: q.tip, color: s.color });
    });
  });
  svg += `<line class="xhair" x1="0" x2="0" y1="${pt}" y2="${H - pb}" visibility="hidden"/><circle class="hl" r="5" visibility="hidden"/>`;
  reg[id] = { hits, H };
  const legend = series.length > 1
    ? `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`
    : '';
  return `${legend}<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${svg}</svg><div class="chart-tip" hidden></div></div>`;
}

// bars: [{ label, value, tip }]
export function columnChart({ bars, height = 170, color = 'var(--accent)', yFmt = fmtTick }) {
  if (!bars.length || bars.every((b) => !b.value)) return `<div class="chart-empty">${esc(t('noData'))}</div>`;
  const H = height;
  const pl = 40; const pr = 8; const pt = 18; const pb = 24;
  const ticks = niceTicks(0, Math.max(...bars.map((b) => b.value)), 4, bars.every((b) => Number.isInteger(b.value)));
  const ymax = ticks[ticks.length - 1];
  const band = (W - pl - pr) / bars.length;
  const bw = Math.min(24, band * 0.62);
  const sy = (v) => pt + (1 - v / (ymax || 1)) * (H - pt - pb);
  const base = sy(0);
  const id = 'c' + ++seq;
  const hits = [];
  let svg = '';
  ticks.forEach((v) => {
    const y = sy(v);
    svg += `<line class="${v === 0 ? 'axis' : 'grid'}" x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}"/><text class="tick" x="${pl - 6}" y="${y + 4}" text-anchor="end">${esc(yFmt(v))}</text>`;
  });
  bars.forEach((b, i) => {
    const cx = pl + band * i + band / 2;
    const x = cx - bw / 2;
    const y = sy(b.value);
    const h = base - y;
    if (b.value > 0) {
      const r = Math.min(4, h, bw / 2);
      svg += `<path d="M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${base}Z" fill="${color}"/>`;
    }
    if (i % 2 === (bars.length - 1) % 2) svg += `<text class="tick" x="${cx}" y="${H - 7}" text-anchor="middle">${esc(b.label)}</text>`;
    hits.push({ x: cx, y: Math.min(y, base - 2), tip: b.tip, color });
  });
  const last = bars[bars.length - 1];
  if (last.value > 0) svg += `<text class="cap" x="${pl + band * (bars.length - 1) + band / 2}" y="${sy(last.value) - 5}" text-anchor="middle">${esc(yFmt(last.value))}</text>`;
  svg += `<line class="xhair" x1="0" x2="0" y1="${pt}" y2="${base}" visibility="hidden"/>`;
  reg[id] = { hits, H, bars: true };
  return `<div class="chart" data-chart="${id}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${svg}</svg><div class="chart-tip" hidden></div></div>`;
}

function hide(c) {
  c.classList.remove('hovering');
  const tip = c.querySelector('.chart-tip');
  if (tip) tip.hidden = true;
  c.querySelectorAll('.xhair,.hl').forEach((e) => e.setAttribute('visibility', 'hidden'));
}

function hover(e) {
  const c = e.target.closest ? e.target.closest('.chart') : null;
  document.querySelectorAll('.chart.hovering').forEach((x) => { if (x !== c) hide(x); });
  if (!c) return;
  const d = reg[c.dataset.chart];
  if (!d || !d.hits.length) return;
  const svg = c.querySelector('svg');
  const r = svg.getBoundingClientRect();
  const scale = r.width / W;
  const vx = (e.clientX - r.left) / scale;
  const vy = (e.clientY - r.top) / scale;
  let best = null; let bd = Infinity;
  for (const h of d.hits) {
    const dd = Math.abs(h.x - vx) * 3 + Math.abs(h.y - vy) * 0.3;
    if (dd < bd) { bd = dd; best = h; }
  }
  if (!best) return;
  c.classList.add('hovering');
  const xh = c.querySelector('.xhair');
  xh.setAttribute('x1', best.x); xh.setAttribute('x2', best.x); xh.setAttribute('visibility', 'visible');
  const hl = c.querySelector('.hl');
  if (hl) { hl.setAttribute('cx', best.x); hl.setAttribute('cy', best.y); hl.setAttribute('fill', best.color); hl.setAttribute('visibility', 'visible'); }
  const tip = c.querySelector('.chart-tip');
  tip.innerHTML = best.tip || '';
  tip.hidden = false;
  const px = best.x * scale;
  const tw = tip.offsetWidth;
  tip.style.left = Math.max(0, Math.min(r.width - tw, px - tw / 2)) + 'px';
  tip.style.top = Math.max(0, best.y * scale - tip.offsetHeight - 12) + 'px';
}

document.addEventListener('pointerdown', hover);
document.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) hover(e); });
