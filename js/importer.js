// Trainingsschema's inlezen: .xlsx (zonder externe bibliotheek), geplakte Excel-cellen en vrije tekst.

// ---------- ZIP + XLSX ----------
async function inflate(data) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf, want) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const elen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const loff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    if (want && !want(name)) continue;
    const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true);
    const data = u8.subarray(start, start + csize);
    if (method === 0) out[name] = data;
    else if (method === 8) out[name] = await inflate(data);
  }
  return out;
}

const colIdx = (letters) => {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

function textOf(el) {
  // Rich text: alle <t> behalve fonetische hints (<rPh>)
  return [...el.getElementsByTagName('t')].filter((x) => !x.parentNode || x.parentNode.nodeName !== 'rPh').map((x) => x.textContent).join('');
}

export async function readXlsx(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('nodecomp');
  const files = await unzip(buf, (nm) => nm.startsWith('xl/'));
  const dec = new TextDecoder();
  const xml = (nm) => (files[nm] ? new DOMParser().parseFromString(dec.decode(files[nm]), 'application/xml') : null);
  const ss = xml('xl/sharedStrings.xml');
  const strings = ss ? [...ss.getElementsByTagName('si')].map(textOf) : [];
  const wb = xml('xl/workbook.xml');
  if (!wb) throw new Error('xlsx');
  const rels = xml('xl/_rels/workbook.xml.rels');
  const relMap = {};
  if (rels) [...rels.getElementsByTagName('Relationship')].forEach((r) => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
  const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const sheets = [...wb.getElementsByTagName('sheet')].map((s, i) => {
    const rid = s.getAttributeNS(RNS, 'id') || s.getAttribute('r:id');
    let target = relMap[rid] || `worksheets/sheet${i + 1}.xml`;
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    return { name: s.getAttribute('name'), path: target };
  });
  return sheets.map((sh) => {
    const doc = xml(sh.path);
    const grid = [];
    if (doc) {
      for (const c of doc.getElementsByTagName('c')) {
        const m = /^([A-Z]+)(\d+)$/.exec(c.getAttribute('r') || '');
        if (!m) continue;
        const col = colIdx(m[1]);
        const row = +m[2] - 1;
        const type = c.getAttribute('t');
        const vEl = c.getElementsByTagName('v')[0];
        let v = '';
        if (type === 's') v = vEl ? strings[+vEl.textContent] || '' : '';
        else if (type === 'inlineStr') v = textOf(c);
        else if (vEl) v = vEl.textContent;
        if ((!type || type === 'n') && v !== '' && !isNaN(+v)) v = String(Math.round(+v * 1000) / 1000);
        (grid[row] || (grid[row] = []))[col] = v;
      }
    }
    return { name: sh.name, grid };
  });
}

// ---------- Raster (Excel-blokken) ----------
const clean = (v) => String(v == null ? '' : v).replace(/ /g, ' ').trim();
const HDR = /^(oefening(en)?|exercises?|oefening\s*\/\s*exercise)$/i;

function parseCellSet(wRaw, rRaw) {
  const w = clean(wRaw);
  const r = clean(rRaw);
  if (!w && !r) return null;
  if (/^[wx]$/i.test(w) || (!w && /^[wx]$/i.test(r))) return { planned: true };
  const m = /^(\d+(?:[.,]\d+)?)\s*(\+*)\s*(?:kg)?$/i.exec(w);
  const reps = /^\d+$/.test(r) ? +r : null;
  if (m) return { kg: +m[1].replace(',', '.'), plus: m[2].length, reps };
  if (!w && reps != null) return { kg: null, plus: 0, reps };
  return { planned: true, raw: w };
}

function flagWarnings(sets) {
  const kgs = sets.filter((s) => s.kg != null).map((s) => s.kg);
  const min = kgs.length ? Math.min(...kgs) : 0;
  sets.forEach((s) => {
    if (s.kg == null) return;
    const dec = (String(s.kg).split('.')[1] || '').length;
    if (dec > 2 || (kgs.length > 1 && min > 0 && s.kg > min * 4)) s.warn = true;
  });
}

function mode(arr) {
  const c = {};
  let best = null;
  arr.forEach((v) => { c[v] = (c[v] || 0) + 1; if (best == null || c[v] > c[best]) best = v; });
  return best == null ? null : +best;
}

export function parseGrid(grid) {
  const cell = (r, c) => clean(grid[r] && grid[r][c]);
  const blocks = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (!HDR.test(cell(r, c))) continue;
      let pairs = [];
      for (let j = c + 1; j < c + 41; j += 2) {
        if (/gewicht|kg|weight|lb/i.test(cell(r + 1, j)) && /rep|herh/i.test(cell(r + 1, j + 1))) pairs.push(j);
        else break;
      }
      let dataStart = r + 2;
      if (!pairs.length) {
        dataStart = r + 1;
        for (let j = c + 1; j < c + 41; j++) if (/^set\s*\d+/i.test(cell(r, j))) pairs.push(j);
        if (!pairs.length) pairs = [c + 1, c + 3, c + 5];
      }
      const last = pairs[pairs.length - 1] + 1;
      let gym = '';
      let name = '';
      const note = [];
      if (r > 0) {
        const a = cell(r - 1, c);
        const b = cell(r - 1, c + 1);
        if (a && b) { gym = a; name = b; } else name = a || b;
        for (let j = c + 2; j <= last; j++) { const v = cell(r - 1, j); if (v) note.push(v); }
      }
      const rows = [];
      for (let rr = dataStart; rr < grid.length; rr++) {
        const nm = cell(rr, c);
        if (!nm || HDR.test(nm)) break;
        // Een ingevulde latere set (ook 'W'/'x') betekent dat de sets ervoor ook bestaan.
        const raw = pairs.map((j) => parseCellSet(cell(rr, j), cell(rr, j + 1)));
        let lastIdx = -1;
        raw.forEach((s, i) => { if (s) lastIdx = i; });
        const sets = raw.slice(0, lastIdx + 1).map((s) => s || { planned: true });
        flagWarnings(sets);
        rows.push({ name: nm, sets });
      }
      const def = mode(rows.map((x) => x.sets.length).filter(Boolean)) || 2;
      rows.forEach((x) => { if (!x.sets.length) x.sets = Array.from({ length: def }, () => ({ planned: true })); });
      if (rows.length) blocks.push({ gym, name: name || 'Workout', note: note.join(' · '), rows });
    }
  }
  return blocks;
}

// ---------- Vrije tekst ----------
const GYMISH = /gym|fit|trainmore|sport|club|health|crossfit|fitness/i;

function splitHeader(h, isGym) {
  h = h.replace(/^#+\s*/, '').replace(/[:]\s*$/, '').trim();
  const parts = h.split(/\s+[|@–—-]\s+|\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    let gi = parts.findIndex((p) => isGym(p));
    if (gi < 0) gi = parts.findIndex((p) => GYMISH.test(p));
    if (gi >= 0) return { gym: parts[gi], name: parts.filter((_, i) => i !== gi).join(' - ') };
  }
  return { gym: '', name: h };
}

const SET_RE = /(\d+(?:[.,]\d+)?)\s*(\+*)\s*(kg)?\s*[x×*]\s*(\d+)/gi;
const hasSets = (l) => new RegExp(SET_RE.source, 'i').test(l) || /\d+\s*sets?\b/i.test(l);

function parseLine(raw) {
  const l = raw.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '').trim();
  if (!l) return null;
  const matches = [...l.matchAll(new RegExp(SET_RE.source, 'gi'))];
  let name = (matches.length ? l.slice(0, matches[0].index) : l).replace(/[\s:–|,-]+$/, '').trim();
  let sets = [];
  if (matches.length === 1 && !matches[0][3] && !matches[0][2] && /^\d+$/.test(matches[0][1]) && +matches[0][1] <= 5) {
    const reps = +matches[0][4];
    sets = Array.from({ length: +matches[0][1] }, () => ({ planned: true, targetReps: reps }));
  } else {
    sets = matches.map((m) => ({ kg: +m[1].replace(',', '.'), plus: m[2].length, reps: +m[4] }));
  }
  if (!sets.length) {
    const sm = /(\d+)\s*sets?\b/i.exec(l);
    if (sm) {
      sets = Array.from({ length: +sm[1] }, () => ({ planned: true }));
      name = l.slice(0, sm.index).replace(/[\s:–|,-]+$/, '').trim() || name;
    }
  }
  if (!name) return null;
  flagWarnings(sets);
  return { name, sets };
}

export function parseText(text, isGym = () => false) {
  text = String(text || '').replace(/\r/g, '').replace(/ /g, ' ');
  const lines = text.split('\n');
  if (lines.some((l) => l.includes('\t'))) {
    const b = parseGrid(lines.map((l) => l.split('\t')));
    if (b.length) return b;
  }
  if (lines.filter((l) => l.includes(';')).length > 2) {
    const b = parseGrid(lines.map((l) => l.split(';')));
    if (b.length) return b;
  }
  const paras = [];
  let cur = [];
  for (const raw of lines) {
    const l = raw.replace(/\t+/g, ' ').trim();
    if (!l) { if (cur.length) { paras.push(cur); cur = []; } continue; }
    cur.push(l);
  }
  if (cur.length) paras.push(cur);
  const blocks = [];
  for (const p of paras) {
    let header = null;
    let rows = p;
    if (!hasSets(p[0]) && (p.length > 1 || /[:#]|\s[|@-]\s/.test(p[0]))) { header = p[0]; rows = p.slice(1); }
    const parsed = rows.map(parseLine).filter(Boolean);
    const prevBlock = blocks[blocks.length - 1];
    if (!header && prevBlock && !prevBlock.rows.length) { prevBlock.rows = parsed; continue; }
    const { gym, name } = header ? splitHeader(header, isGym) : { gym: '', name: '' };
    blocks.push({ gym, name: name || 'Workout', note: '', rows: parsed });
  }
  blocks.forEach((b) => {
    const def = mode(b.rows.map((x) => x.sets.length).filter(Boolean)) || 2;
    b.rows.forEach((x) => { if (!x.sets.length) x.sets = Array.from({ length: def }, () => ({ planned: true })); });
  });
  return blocks.filter((b) => b.rows.length);
}
