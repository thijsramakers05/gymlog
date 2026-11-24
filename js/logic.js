// Domeinlogica: oefeningen, standen per gym, vorige keer, records, statistieken.
import { S, persist } from './store.js';
import { weekStart, addDays, normName, sortKey, compact } from './util.js';
import { LIB, libId } from './library.js';

let exMap = null;
export const invalidateEx = () => { exMap = null; };
function exIndex() {
  if (!exMap) exMap = new Map(S.exercises.map((e) => [e.id, e]));
  return exMap;
}
export const exById = (id) => exIndex().get(id);
export const exName = (id) => (exById(id) ? exById(id).name : '—');

export const gymById = (id) => S.gyms.find((g) => g.id === id);
export const gymName = (id) => (gymById(id) ? gymById(id).name : '');
export const curGym = () => gymById(S.settings.gymId) || S.gyms[0] || null;
export const gymColor = (id) => `var(--gym-${Math.max(0, S.gyms.findIndex((g) => g.id === id)) % 3})`;

export function ensureLibrary() {
  const have = new Set(S.exercises.map((e) => e.id));
  const del = new Set(S.deletedLib || []);
  let added = false;
  for (const [name, muscle, equip] of LIB) {
    const id = libId(name);
    if (!have.has(id) && !del.has(id)) { S.exercises.push({ id, name, muscle, equip, lib: true }); added = true; }
  }
  if (added) { invalidateEx(); persist('exercises'); }
}

// ---------- Standen per apparaat per gym ----------
export const metaKey = (ex, gym) => ex + '|' + (gym || '-');
export function getMeta(ex, gym) {
  const m = S.meta[metaKey(ex, gym)];
  return { fields: [], note: '', plusKg: null, step: null, ...(m || {}) };
}
export function setMeta(ex, gym, m) {
  S.meta[metaKey(ex, gym)] = m;
  persist('meta');
}
export function snapshotMeta(ex, gym) {
  const m = getMeta(ex, gym);
  const fields = m.fields.filter((f) => f.label || f.value);
  return fields.length || m.note ? { fields: JSON.parse(JSON.stringify(fields)), note: m.note || '' } : null;
}
export const restFor = (ex) => (exById(ex) && exById(ex).rest) || S.settings.rest;
export const stepFor = (ex, gym) => getMeta(ex, gym).step || S.settings.step;

// ---------- Sets ----------
export const isWork = (s) => s.type !== 'w';
export function effKg(s, ex, gym) {
  if (s.kg == null) return null;
  const p = s.plus ? s.plus * (getMeta(ex, gym).plusKg || 0) : 0;
  return s.kg + p;
}
export const e1rm = (kg, reps) => (!kg || !reps ? 0 : reps === 1 ? kg : kg * (1 + reps / 30));

export const SET_TYPES = ['n', 'w', 't', 'b', 'd', 'f'];
export function setLabel(sets, i) {
  const s = sets[i];
  const map = { w: 'W', t: 'T', b: 'B', d: 'D', f: 'F' };
  if (s.type && s.type !== 'n') return map[s.type] || '?';
  let n = 0;
  for (let j = 0; j <= i; j++) if (!sets[j].type || sets[j].type === 'n') n++;
  return String(n);
}

// ---------- Vorige keer ----------
export function lastFor(ex, gym, byGym, excludeId) {
  for (const s of S.sessions) {
    if (s.id === excludeId) continue;
    if (byGym && s.gymId !== gym) continue;
    const item = s.items.find((i) => i.exerciseId === ex && i.sets.length);
    if (item) return { session: s, item };
  }
  return null;
}

export function lastByExercise() {
  const m = new Map();
  for (const s of S.sessions) for (const it of s.items) if (!m.has(it.exerciseId) && it.sets.length) m.set(it.exerciseId, { session: s, item: it });
  return m;
}

export function exSessions(ex, gym) {
  const out = [];
  for (const s of S.sessions) {
    if (gym && s.gymId !== gym) continue;
    s.items.forEach((item) => { if (item.exerciseId === ex && item.sets.length) out.push({ session: s, item }); });
  }
  return out;
}

export function records(ex, gym, excludeId) {
  const r = { maxKg: null, maxE1rm: null, maxVol: null, reps: {}, count: 0 };
  for (const s of S.sessions) {
    if (s.id === excludeId) continue;
    if (gym && s.gymId !== gym) continue;
    let seen = false;
    for (const it of s.items) {
      if (it.exerciseId !== ex) continue;
      for (const st of it.sets) {
        if (!isWork(st) || !st.reps) continue;
        seen = true;
        const kg = effKg(st, ex, s.gymId) || 0;
        if (!r.maxKg || kg > r.maxKg.kg || (kg === r.maxKg.kg && st.reps > r.maxKg.reps)) r.maxKg = { kg, reps: st.reps, t: s.start, set: st };
        const e = e1rm(kg, st.reps);
        if (!r.maxE1rm || e > r.maxE1rm.v) r.maxE1rm = { v: e, kg, reps: st.reps, t: s.start, set: st };
        const vol = kg * st.reps;
        if (!r.maxVol || vol > r.maxVol.v) r.maxVol = { v: vol, kg, reps: st.reps, t: s.start, set: st };
        if (st.reps <= 15) {
          const b = r.reps[st.reps];
          if (!b || kg > b.kg) r.reps[st.reps] = { kg, t: s.start };
        }
      }
    }
    if (seen) r.count++;
  }
  return r;
}

// ---------- Sessies & statistiek ----------
export function sessionStats(s) {
  let sets = 0; let vol = 0; let prs = 0;
  for (const it of s.items) {
    for (const st of it.sets) {
      if (st.pr) prs++;
      if (!isWork(st)) continue;
      sets++;
      vol += (effKg(st, it.exerciseId, s.gymId) || 0) * (st.reps || 0);
    }
  }
  return { sets, vol, prs, dur: s.end ? s.end - s.start : 0 };
}

export const realSessions = () => S.sessions.filter((s) => !s.imported);

export function weekStreak() {
  const weeks = new Set(realSessions().map((s) => weekStart(s.start)));
  let w = weekStart(Date.now());
  if (!weeks.has(w)) w = weekStart(addDays(w, -3));
  let n = 0;
  while (weeks.has(w)) { n++; w = weekStart(addDays(w, -3)); }
  return n;
}

export function weekSeries(nWeeks, metric) {
  const out = [];
  let w = weekStart(Date.now());
  for (let i = 0; i < nWeeks; i++) { out.unshift({ ws: w, value: 0 }); w = weekStart(addDays(w, -3)); }
  const idx = new Map(out.map((o, i) => [o.ws, i]));
  for (const s of realSessions()) {
    const i = idx.get(weekStart(s.start));
    if (i == null) continue;
    const st = sessionStats(s);
    out[i].value += metric === 'kg' ? st.vol : st.sets;
  }
  return out;
}

export function muscleSets(ws) {
  const we = weekStart(addDays(ws, 8));
  const m = {};
  for (const s of realSessions()) {
    if (s.start < ws || s.start >= we) continue;
    for (const it of s.items) {
      const ex = exById(it.exerciseId);
      const mg = (ex && ex.muscle) || 'other';
      const n = it.sets.filter(isWork).length;
      if (n) m[mg] = (m[mg] || 0) + n;
    }
  }
  return Object.entries(m).map(([muscle, sets]) => ({ muscle, sets })).sort((a, b) => b.sets - a.sets);
}

export function tplLastDone(tplId) {
  const s = S.sessions.find((x) => x.templateId === tplId && !x.imported);
  return s ? s.start : null;
}

export const resolveEx = (tpl, ti, gymId) => (!tpl.gymId && ti.alts && ti.alts[gymId]) || ti.exerciseId;

// ---------- Herkennen bij import ----------
export function matchExercise(name) {
  const n = normName(name);
  const k = sortKey(name);
  if (!n) return null;
  const list = [...S.exercises].sort((a, b) => (a.lib ? 1 : 0) - (b.lib ? 1 : 0));
  let hit = list.find((e) => normName(e.name) === n);
  if (!hit) hit = list.find((e) => sortKey(e.name) === k);
  return hit ? hit.id : null;
}

export function matchGym(name) {
  const n = compact(name);
  if (!n) return null;
  const g = S.gyms.find((x) => {
    const c = compact(x.name);
    return c === n || c.startsWith(n) || n.startsWith(c) || c.includes(n);
  });
  return g ? g.id : null;
}

const GUESS = [
  [/rear delt|reverse fly|face pull|upright row/, 'shoulders'],
  [/pulldown|pull down|\brow\b|pull ?up|\bchin|\blat\b|pullover|\bjpg\b/, 'back'],
  [/calf|calve|kuit/, 'calves'],
  [/adduct/, 'adductors'],
  [/abduct/, 'abductors'],
  [/crunch|\bab\b|\babs\b|leg raise|plank|sit ?up|buik/, 'abs'],
  [/leg curl|hamstring|\brdl\b|romanian|stiff|nordic|good morning/, 'hamstrings'],
  [/leg press|leg ext|squat|lunge|\bstep|\bhack|quad/, 'quads'],
  [/hip thrust|glute|kickback|bridge|\bbil/, 'glutes'],
  [/tricep|pushdown|push down|skull|jm press|\bdip/, 'triceps'],
  [/curl|bicep/, 'biceps'],
  [/lateral|side raise|lying raise|standing raise|shoulder|overhead|military|arnold|front raise|upright|schouder/, 'shoulders'],
  [/shrug/, 'traps'],
  [/deadlift|back ext|hyperext/, 'lowerback'],
  [/bench|chest|fly|pec|incline|flat|decline|push ?up|press|borst/, 'chest'],
];
const EQ = [
  [/smith/, 'smith'],
  [/plate/, 'plate'],
  [/cable|kabel|cuff|rope/, 'cable'],
  [/dumb|\bdb\b|dumbell/, 'dumbbell'],
  [/barbell|\bbb\b|ez bar|bench press/, 'barbell'],
  [/kettlebell/, 'kettlebell'],
  [/machine|press|curl|extension|pulldown|row|raise|fly|crunch/, 'machine'],
];

// ---------- Meewerkende spieren (voor de spierkaart) ----------
export const SEC_DEFAULT = {
  chest: ['shoulders', 'triceps'],
  back: ['biceps', 'shoulders'],
  shoulders: ['triceps', 'traps'],
  biceps: ['forearms'],
  triceps: [],
  forearms: [],
  abs: [],
  quads: ['glutes', 'adductors'],
  hamstrings: ['glutes', 'lowerback'],
  glutes: ['hamstrings'],
  calves: [],
  adductors: [],
  abductors: ['glutes'],
  traps: ['shoulders'],
  lowerback: ['glutes', 'hamstrings'],
  other: [],
};
const SEC_RULES = [
  [/lateral|side raise|lying raise|standing raise/, ['traps']],
  [/rear delt|reverse fly|reverse pec|face pull/, ['traps', 'back']],
  [/\bfly\b|pec dec|pec deck|butterfly|crossover/, ['shoulders']],
  [/leg ext/, []],
  [/leg curl|hamstring curl|nordic/, ['calves']],
  [/hammer|reverse curl/, ['forearms']],
  [/deadlift|rack pull/, ['hamstrings', 'glutes', 'traps', 'forearms']],
  [/pullover|straight arm/, ['triceps']],
  [/shrug/, ['forearms']],
  [/calf|crunch|plank|leg raise/, []],
];
export function guessSec(ex) {
  if (!ex) return [];
  const low = ' ' + String(ex.name).toLowerCase() + ' ';
  const rule = SEC_RULES.find(([re]) => re.test(low));
  const list = rule ? rule[1] : SEC_DEFAULT[ex.muscle] || [];
  return list.filter((m) => m !== ex.muscle);
}
export function musclesOf(ex) {
  if (!ex) return { primary: 'other', sec: [] };
  return { primary: ex.muscle || 'other', sec: Array.isArray(ex.sec) ? ex.sec : guessSec(ex) };
}

export function guessMuscle(name) {
  const n = normName(name);
  const k = sortKey(name);
  for (const [nm, muscle, equip, aliases] of LIB) {
    const all = [nm, ...(aliases || [])];
    if (all.some((a) => normName(a) === n || sortKey(a) === k)) return { muscle, equip };
  }
  const low = ' ' + String(name).toLowerCase() + ' ';
  const m = GUESS.find(([re]) => re.test(low));
  const e = EQ.find(([re]) => re.test(low));
  return { muscle: m ? m[1] : 'other', equip: e ? e[1] : 'other' };
}
