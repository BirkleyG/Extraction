// Tunnels and ore pockets.
//
// Every shaft is a horizontal tunnel driven sideways from the lift. Its `face` (metres) moves forward as ore
// is mined. Outside a pocket the crew mines the shaft's endless common ore (the best common the drill can cut);
// inside a pocket they mine that pocket's ore until the face passes its end. A pocket harder than the drill
// stops the face at its start: the crew scrapes common ore off the walls at T.pk.wall of the normal rate.
//
// Pockets are rolled deterministically from (colony seed, nukes, shaft depth, pocket number), a few ahead of
// the face, and pruned once dug out, so a colony stays small however long its tunnels get.
//
// Ore per metre scales with the gallery's crew (bunks x carts x depth richness): a full crew advances about
// 1 / T.pk.minPerM metres a minute at the lift, slower as the haul back grows (T.pk.haulM). So strikes come
// on a human time scale: often early, rarer (and bigger) as tunnels get long.
import { T } from './tuning.js';
import { hashSeed, rngNext, num } from './util.js';

const EPS = 1e-7;
const round2 = (x) => Math.round(x * 100) / 100;

const crewOre = (s) => (T.bunkCap0 + T.bunkCapPer * num(s.up?.bunk)) * T.minePerMiner * (1 + T.cartAdd * num(s.up?.cart)) * Math.pow(T.richness, s.idx);
// Ore per metre at the lift (face 0). Mining from a to b takes opm * (b - a) * (1 + (a + b) / (2 haulM)).
export const opm = (s) => T.pk.minPerM * crewOre(s);
const Q = (s, f) => opm(s) * (f + f * f / (2 * T.pk.haulM));
export const oreBetween = (s, a, b) => (b > a ? Q(s, b) - Q(s, a) : 0);
export function faceAfter(s, a, m) {
  const p = opm(s);
  if (!(m > 0) || !(p > 0)) return a;
  const H = T.pk.haulM, k = 1 + a / H;
  return a + (2 * m / p) / (k + Math.sqrt(k * k + 2 * m / (p * H)));
}
// Metres a minute at `orePerMin` for this shaft's face.
export const metresPerMin = (s, orePerMin) => (orePerMin > 0 ? orePerMin / (opm(s) * (1 + num(s.face) / T.pk.haulM)) : 0);

export const cuts = (c, ore) => (ore ? (ore.tier === 'mythic' ? c.drill >= T.drillMax : ore.hardness <= c.drill) : false);
export const needOf = (ore) => (ore.tier === 'mythic' ? T.drillMax : ore.hardness);
export const needText = (ore) => (ore.tier === 'mythic' ? `Needs the mythic drill to break into ${ore.name}` : `Needs drill ${ore.hardness} to break into ${ore.name}`);

// The endless common ore of a shaft: the most valuable common the drill can cut at this depth.
const commonMemo = new WeakMap();
export function commonOre(I, idx, drill) {
  let m = commonMemo.get(I);
  if (!m) { m = new Map(); commonMemo.set(I, m); }
  const key = idx * 16 + drill;
  let v = m.get(key);
  if (v) return v;
  const commons = I.ores.filter((o) => o.tier === 'common');
  const ok = commons.filter((o) => o.hardness <= drill && o.depthMin <= idx).sort((a, b) => b.value - a.value || a.i - b.i);
  v = ok[0] || commons.sort((a, b) => a.hardness - b.hardness || a.value - b.value)[0] || I.ores[0];
  m.set(key, v);
  return v;
}

// Pocket ores at a depth with their pick weights. Rares can peek one or two levels above their depthMin
// (smaller odds); mythic only at or below its depth.
const candMemo = new WeakMap();
export function pocketCands(I, idx) {
  let m = candMemo.get(I);
  if (!m) { m = new Map(); candMemo.set(I, m); }
  let v = m.get(idx);
  if (v) return v;
  v = [];
  for (const o of I.ores) {
    if (o.tier === 'rare') {
      const d = o.depthMin - idx;
      if (d <= 0) v.push({ o, w: 1 + o.depthMin * 0.4 });
      else if (d <= 2) v.push({ o, w: d === 1 ? 0.7 : 0.35 });
    } else if (o.tier === 'mythic' && o.depthMin <= idx) v.push({ o, w: T.pk.mythicW * (1 + (idx - o.depthMin) * 0.3) });
  }
  const sum = v.reduce((a, x) => a + x.w, 0);
  v.forEach((x) => { x.p = x.w / sum; });
  m.set(idx, v);
  return v;
}
export const pocketShare = (idx) => Math.min(T.pk.share[2], T.pk.share[0] + T.pk.share[1] * idx);
const lenMean = (idx) => (T.pk.len[0] + T.pk.len[1]) / 2 * (1 + T.pk.lenDepth * idx);

// Pocket n of a shaft, starting after `prevEnd`. Pure.
function rollPocket(c, I, s, n, prevEnd) {
  const cands = pocketCands(I, s.idx);
  if (!cands.length) return null;
  let r = hashSeed(`${num(c.seed)}|${num(c.nukes)}|${s.idx}|${n}`);
  const u = [];
  for (let i = 0; i < 4; i++) { const [x, nx] = rngNext(r); u.push(x); r = nx; }
  let x = u[0], pick = cands[cands.length - 1].o;
  for (const cd of cands) { x -= cd.p; if (x <= 0) { pick = cd.o; break; } }
  const mythic = pick.tier === 'mythic';
  const len = (T.pk.len[0] + (T.pk.len[1] - T.pk.len[0]) * u[1]) * (1 + T.pk.lenDepth * s.idx) * (mythic ? T.pk.mythicLen : 1);
  const sh = pocketShare(s.idx);
  let gap;
  if (n === 0) {
    const f = s.idx === 0 ? T.pk.homeFirst : T.pk.first;
    gap = f[0] + (f[1] - f[0]) * u[2];
  } else gap = lenMean(s.idx) * (1 - sh) / sh * (0.5 + u[2]);
  const start = round2(prevEnd + gap);
  return { ore: pick.id, start, len: Math.max(0.5, round2(len)) };
}

// Fill in the tunnel fields of a shaft (new or loaded) and keep T.pk.ahead pockets rolled past the face.
export function ensureTunnel(c, I, s) {
  if (!Number.isFinite(s.face)) s.face = 0;
  if (!Array.isArray(s.pk)) s.pk = [];
  if (!Number.isFinite(s.pkN)) s.pkN = 0;
  if (!Number.isFinite(s.pkEnd)) s.pkEnd = 0;
  if (!Number.isFinite(s.dug)) s.dug = 0;
  let ahead = 0;
  for (const p of s.pk) if (p.start + p.len > s.face + EPS) ahead++;
  for (let guard = 0; ahead < T.pk.ahead && guard < 20; guard++) {
    const p = rollPocket(c, I, s, s.pkN, s.pkEnd);
    if (!p) break;
    s.pk.push(p); s.pkN++; s.pkEnd = round2(p.start + p.len); ahead++;
  }
}

// Where the face is: { cur (pocket the face is in), next (first pocket ahead), blocked, ore, target }.
// target = metres where what is mined changes next (Infinity when blocked or no pockets).
export function tunnelAt(c, I, s) {
  const face = num(s.face);
  let cur = null, next = null;
  for (const p of s.pk || []) {
    if (p.start + p.len <= face + EPS) continue;
    if (p.start <= face + EPS) { if (!cur) cur = p; } else if (!next || p.start < next.start) next = p;
  }
  const common = commonOre(I, s.idx, c.drill);
  if (cur) {
    const o = I.ores[I.idx[cur.ore]];
    if (o && !cuts(c, o)) return { cur, next, blocked: true, ore: common.id, pocketOre: o, target: Infinity, common };
    return { cur, next, blocked: false, ore: cur.ore, pocketOre: o, target: cur.start + cur.len, common };
  }
  return { cur: null, next, blocked: false, ore: common.id, pocketOre: null, target: next ? next.start : Infinity, common };
}

// Keep s.ore (what the crew is mining right now) in step with the face and the drill. Mutates s.
export function syncTunnel(c, I, s) {
  ensureTunnel(c, I, s);
  const st = tunnelAt(c, I, s);
  s.ore = st.ore;
  return st;
}

// Long-run ore mix of a shaft at this drill level, as time shares: [{ i, share }] (planning only).
// Pockets the drill can't cut count as wall-rate common ore.
const mixMemo = new WeakMap();
export function expectedMix(I, idx, drill) {
  let m = mixMemo.get(I);
  if (!m) { m = new Map(); mixMemo.set(I, m); }
  const key = idx * 16 + drill;
  let v = m.get(key);
  if (v) return v;
  const common = commonOre(I, idx, drill);
  const sh = pocketShare(idx);
  const out = new Map([[common.i, 1]]);
  const fake = { drill };
  for (const { o, p } of pocketCands(I, idx)) {
    const share = sh * p * (o.tier === 'mythic' ? T.pk.mythicLen : 1);
    out.set(common.i, out.get(common.i) - share);
    if (cuts(fake, o)) out.set(o.i, (out.get(o.i) || 0) + share);
    else out.set(common.i, out.get(common.i) + share * T.pk.wall);
  }
  v = [...out].map(([i, share]) => ({ i, share }));
  m.set(key, v);
  return v;
}
