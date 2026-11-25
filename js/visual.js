// Spierkaart (doorzichtig silhouet, eigen tekening) en eigen foto's per apparaat per gym.
import { S, photoKeys, getPhoto, putPhoto, deletePhoto } from './store.js';
import { A, CH, render, go } from './core.js';
import { t } from './i18n.js';
import { esc, icon } from './util.js';
import { exById, exName, gymName, metaKey, musclesOf } from './logic.js';
import { openSheet, updateSheet, sheetEl, confirmDialog, toast } from './ui.js';

// ---------- Silhouet ----------
// Figuur in een vlak van 100 × 200. Linkerhelft wordt gespiegeld voor rechts.
const BODY = `<g style="fill:var(--mm-body);stroke:var(--mm-body);opacity:var(--mm-body-op)">
  <ellipse cx="50" cy="15" rx="9" ry="11" stroke="none"/>
  <rect x="45" y="23" width="10" height="11" rx="3" stroke="none"/>
  <path stroke="none" d="M32,34 C40,31 60,31 68,34 L71,40 C70,52 67,60 65,68 C64,78 65,88 66,99 L34,99 C35,88 36,78 35,68 C33,60 30,52 29,40 Z"/>
  <g fill="none" stroke-linecap="round">
    <line x1="28.5" y1="39" x2="23" y2="80" stroke-width="10.5"/><line x1="71.5" y1="39" x2="77" y2="80" stroke-width="10.5"/>
    <line x1="23" y1="80" x2="17.5" y2="114" stroke-width="8"/><line x1="77" y1="80" x2="82.5" y2="114" stroke-width="8"/>
    <line x1="42.5" y1="100" x2="43" y2="146" stroke-width="15"/><line x1="57.5" y1="100" x2="57" y2="146" stroke-width="15"/>
    <line x1="43" y1="146" x2="43.5" y2="184" stroke-width="9.5"/><line x1="57" y1="146" x2="56.5" y2="184" stroke-width="9.5"/>
  </g>
  <ellipse cx="16.5" cy="120.5" rx="4" ry="5.5" stroke="none"/><ellipse cx="83.5" cy="120.5" rx="4" ry="5.5" stroke="none"/>
  <ellipse cx="42.5" cy="190.5" rx="5" ry="3.5" stroke="none"/><ellipse cx="57.5" cy="190.5" rx="5" ry="3.5" stroke="none"/>
</g>`;

const SHAPES = {
  front: {
    center: [
      ['abs', '<rect x="44.6" y="58" width="5" height="9.2" rx="2"/>'],
      ['abs', '<rect x="50.4" y="58" width="5" height="9.2" rx="2"/>'],
      ['abs', '<rect x="44.6" y="68.4" width="5" height="9.2" rx="2"/>'],
      ['abs', '<rect x="50.4" y="68.4" width="5" height="9.2" rx="2"/>'],
      ['abs', '<rect x="44.6" y="78.8" width="5" height="11" rx="2.2"/>'],
      ['abs', '<rect x="50.4" y="78.8" width="5" height="11" rx="2.2"/>'],
    ],
    left: [
      ['traps', '<path d="M45.5,29.5 L37,35 L45.5,35.5 Z"/>'],
      ['shoulders', '<ellipse cx="29.5" cy="41" rx="5.6" ry="6.6"/>'],
      ['chest', '<path d="M49,37.5 C43,36.5 36.5,37.5 33.5,41.5 C33.2,48 35.5,53 40,55 C44,56.4 47.8,55.4 49,53.2 Z"/>'],
      ['biceps', '<ellipse cx="25.8" cy="59.5" rx="3.8" ry="10" transform="rotate(7.6 25.8 59.5)"/>'],
      ['forearms', '<ellipse cx="20.4" cy="95" rx="3.3" ry="12" transform="rotate(8.9 20.4 95)"/>'],
      ['abs', '<path d="M43.2,59 L37.5,61.5 C37.3,72 38.4,82 41.5,90.5 L43.2,90.5 Z"/>'],
      ['abductors', '<ellipse cx="36.6" cy="103" rx="2.6" ry="6"/>'],
      ['quads', '<ellipse cx="41.6" cy="121" rx="6.2" ry="19" transform="rotate(-2 41.6 121)"/>'],
      ['quads', '<ellipse cx="46.2" cy="137" rx="2.8" ry="6"/>'],
      ['adductors', '<ellipse cx="47.6" cy="110" rx="2.1" ry="9"/>'],
      ['calves', '<ellipse cx="41.2" cy="163" rx="3" ry="11.5"/>'],
    ],
  },
  back: {
    center: [
      ['traps', '<path d="M50,27 C47,30.5 42,33 36,36 C41,38.5 46,44 50,58 C54,44 59,38.5 64,36 C58,33 53,30.5 50,27 Z"/>'],
      ['lowerback', '<rect x="44.4" y="73" width="5.2" height="19" rx="2.6"/>'],
      ['lowerback', '<rect x="50.4" y="73" width="5.2" height="19" rx="2.6"/>'],
    ],
    left: [
      ['shoulders', '<ellipse cx="29.5" cy="41.5" rx="5.6" ry="6.6"/>'],
      ['back', '<ellipse cx="38.6" cy="45" rx="4" ry="2.6"/>'],
      ['back', '<path d="M44,47 C39.5,46 35.5,46.5 33.5,48.5 C33.6,57 36.5,66 41,73.5 C44,76.5 47,76.5 48,73.5 L48.4,59 Z"/>'],
      ['triceps', '<ellipse cx="25.6" cy="57.5" rx="3.9" ry="10.5" transform="rotate(7.6 25.6 57.5)"/>'],
      ['forearms', '<ellipse cx="20.4" cy="95" rx="3.3" ry="12" transform="rotate(8.9 20.4 95)"/>'],
      ['abductors', '<ellipse cx="37" cy="97.5" rx="3.4" ry="4.6"/>'],
      ['glutes', '<ellipse cx="43" cy="105" rx="7.2" ry="8.6"/>'],
      ['hamstrings', '<ellipse cx="42.6" cy="129" rx="6" ry="16"/>'],
      ['adductors', '<ellipse cx="47.5" cy="118" rx="2" ry="7"/>'],
      ['calves', '<ellipse cx="42.9" cy="160" rx="5" ry="11.5"/>'],
    ],
  },
};

const part = ([m, el]) => el.replace(/^<(\w+)/, `<$1 style="fill:var(--m-${m},var(--mu-idle));stroke:var(--mm-line);stroke-width:.5"`);

function figure(view) {
  const sh = SHAPES[view];
  const left = sh.left.map(part).join('');
  return `<g id="mm-${view}">${BODY}${sh.center.map(part).join('')}${left}<g transform="matrix(-1 0 0 1 100 0)">${left}</g></g>`;
}

export function injectSprite() {
  const wrap = document.createElement('div');
  wrap.innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${figure('front')}${figure('back')}</defs></svg>`;
  document.body.prepend(wrap.firstChild);
}

// Uitsnede en kant per primaire spiergroep (voor de kleine ronde afbeelding)
const THUMB = {
  chest: ['front', '12 24 76 76'],
  shoulders: ['front', '12 24 76 76'],
  biceps: ['front', '8 30 76 76'],
  forearms: ['front', '4 58 64 64'],
  abs: ['front', '20 44 60 60'],
  quads: ['front', '18 90 64 64'],
  adductors: ['front', '18 90 64 64'],
  back: ['back', '12 24 76 76'],
  traps: ['back', '12 20 76 76'],
  triceps: ['back', '8 30 76 76'],
  lowerback: ['back', '18 52 64 64'],
  glutes: ['back', '18 76 64 64'],
  abductors: ['back', '18 76 64 64'],
  hamstrings: ['back', '18 96 64 64'],
  calves: ['back', '20 134 60 60'],
  other: ['front', '0 0 100 200'],
};
const BACK_FIRST = new Set(['back', 'traps', 'triceps', 'lowerback', 'glutes', 'abductors', 'hamstrings', 'calves']);

export function mmSvg(mus, view, box, cls = '') {
  const vars = [`--m-${mus.primary}:var(--mu-on)`, ...mus.sec.filter((m) => m !== mus.primary).map((m) => `--m-${m}:var(--mu-2nd)`)].join(';');
  return `<svg class="mm ${cls}" viewBox="${box || '0 0 100 200'}" style="${vars}" aria-hidden="true"><use href="#mm-${view}"/></svg>`;
}

export function muscleMapPair(ex) {
  const mus = musclesOf(ex);
  const views = BACK_FIRST.has(mus.primary) ? ['back', 'front'] : ['front', 'back'];
  return `<div class="mm-pair">${views.map((v) => `<figure>${mmSvg(mus, v)}<figcaption>${t(v === 'front' ? 'viewFront' : 'viewBack')}</figcaption></figure>`).join('')}</div>
    <div class="mm-legend"><span><i class="on"></i>${t('m_' + mus.primary)}</span>${mus.sec.length ? `<span><i class="sec"></i>${mus.sec.map((m) => t('m_' + m)).join(', ')}</span>` : ''}</div>`;
}

// ---------- Foto's ----------
const urlCache = new Map();
const loading = new Set();

export function ensurePhoto(key) {
  if (urlCache.has(key) || loading.has(key) || !photoKeys.has(key)) return;
  loading.add(key);
  getPhoto(key).then((blob) => {
    loading.delete(key);
    if (!blob) return;
    const u = URL.createObjectURL(blob);
    urlCache.set(key, u);
    document.querySelectorAll(`img[data-photo="${key}"]`).forEach((i) => { i.src = u; });
  }).catch(() => loading.delete(key));
}

export function forgetPhoto(key) {
  const u = urlCache.get(key);
  if (u) URL.revokeObjectURL(u);
  urlCache.delete(key);
}

export function photoImg(key, cls = '') {
  ensurePhoto(key);
  const u = urlCache.get(key);
  return `<img class="${cls}" data-photo="${key}" ${u ? `src="${u}"` : ''} alt="">`;
}

export const hasPhoto = (exId, gymId) => !!gymId && photoKeys.has(metaKey(exId, gymId));

// Kleine ronde afbeelding: eigen foto van deze gym, anders de spierkaart
export function exThumb(exId, gymId, cls = '') {
  if (hasPhoto(exId, gymId)) return `<span class="thumb photo ${cls}">${photoImg(metaKey(exId, gymId))}</span>`;
  const mus = musclesOf(exById(exId));
  const [view, box] = THUMB[mus.primary] || THUMB.other;
  return `<span class="thumb ${cls}">${mmSvg(mus, view, box)}</span>`;
}

// Miniatuur voor een willekeurig oefening-object (bijv. van een vriend); fotoUrl optioneel
export function thumbForEx(ex, cls = '', photoAttr = '') {
  if (photoAttr) return `<span class="thumb photo ${cls}"><img ${photoAttr} alt=""></span>`;
  const mus = musclesOf(ex || { muscle: 'other' });
  const [view, box] = THUMB[mus.primary] || THUMB.other;
  return `<span class="thumb ${cls}">${mmSvg(mus, view, box)}</span>`;
}

async function resizeImage(file, max = 1200) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s);
    c.height = Math.round(img.naturalHeight * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function photoInput(exId, gymId) {
  return `<input type="file" accept="image/*" class="vh" data-ch="photoPick" data-ex="${exId}" data-gym="${gymId}">`;
}

// ---------- Sheet met foto + spierkaart ----------
let vis = null;

function visualHTML() {
  const ex = exById(vis.exId);
  const key = metaKey(vis.exId, vis.gymId);
  const has = vis.gymId && photoKeys.has(key);
  const gym = gymName(vis.gymId);
  return `<h3 class="sheet-title">${esc(exName(vis.exId))}</h3>
    <p class="sheet-sub">${icon('pin', 'xs')} ${esc(gym || t('noGym'))}</p>
    ${vis.gymId ? `${has ? `<div class="photo-big">${photoImg(key)}</div>` : ''}
    <div class="photo-btns">
      <label class="btn ${has ? 'secondary' : 'primary'}">${icon('camera', 'sm')} ${has ? t('changePhoto') : t('addPhoto')}${photoInput(vis.exId, vis.gymId)}</label>
      ${has ? `<button class="btn danger-ghost" data-a="photoDel" data-ex="${vis.exId}" data-gym="${vis.gymId}">${icon('trash', 'sm')} ${t('deletePhoto')}</button>` : ''}
    </div>
    <p class="hint">${t('photoHint', { gym: esc(gym) })}</p>` : ''}
    <div class="card mm-card">${muscleMapPair(ex)}</div>
    ${vis.showDetails ? `<button class="btn btn-block secondary" data-a="visDetails" data-id="${vis.exId}">${icon('chart', 'sm')} ${t('historyRecords')}</button>` : ''}`;
}

export function openVisual(exId, gymId, showDetails = true) {
  vis = { exId, gymId, showDetails };
  openSheet(visualHTML(), { cls: 'form-sheet', onClose: () => { vis = null; } });
}

A.exVisual = (el) => openVisual(el.dataset.id, el.dataset.gym || S.settings.gymId, el.dataset.details !== '0');
A.visDetails = (el) => { A.closeSheet(); go('ex/' + el.dataset.id); };

CH.photoPick = async (el) => {
  const f = el.files && el.files[0];
  const { ex, gym } = el.dataset;
  el.value = '';
  if (!f) return;
  try {
    const blob = await resizeImage(f);
    if (!blob) throw new Error('resize');
    const key = metaKey(ex, gym);
    forgetPhoto(key);
    await putPhoto(key, blob);
    toast(t('photoSaved'), 'check');
  } catch (e) {
    console.error(e);
    toast(t('photoFailed'));
    return;
  }
  if (vis && sheetEl()) updateSheet(visualHTML());
  render();
};

A.photoDel = async (el) => {
  const { ex, gym } = el.dataset;
  const ok = await confirmDialog({ title: t('deletePhotoQ'), text: `${exName(ex)} · ${gymName(gym)}`, ok: t('delete'), danger: true });
  if (!ok) return;
  const key = metaKey(ex, gym);
  forgetPhoto(key);
  await deletePhoto(key);
  if (vis && sheetEl()) updateSheet(visualHTML());
  render();
};
