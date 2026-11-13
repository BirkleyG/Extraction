// Tunnels and veins (ore pockets).
//
// Every shaft is a horizontal tunnel driven sideways from the lift. Its `face` (metres) moves forward as ore
// is mined. Outside a vein the crew mines the site's endless common ore; inside a vein they mine that vein's rare
// (or mythic) ore until the face passes its end. Veins are rolled deterministically from the shaft's own seed
// (set when the shaft is bought: each of the two dig directions has its own), a few ahead of the face, and
// pruned once dug out.
//
// Only ores present at the site occur (site.richness[ore] > 0). Rares need the middle band or deeper (shallow
// shafts see them rarely), mythic only the deepest band at a site that has it. Vein odds and sizes grow with the
// band and with richness x veinSize x the direction's tilt. A vein lasts about 4 h to 2 days at the pace of a
// reference crew (T.pk.refOre): a metre is a minute of that crew. Events: "running low" at 20% left; below 5% left
// the output tapers linearly (5 steps), then the face is back on common ore. A vein harder than the shaft's gear stops
// the face at its start: the crew scrapes common ore off the walls at T.pk.wall of the normal rate.
import { T } from './tuning.js';
import { hashSeed, rngNext, num } from './util.js';

const EPS = 1e-7;
const round2 = (x) => Math.round(x * 100) / 100;

export const bandOfIdx = (idx) => { const b = T.depthBands; return idx < b[0] ? 0 : idx < b[1] ? 1 : idx < b[2] ? 2 : 3; };
export const bandOf = (idx) => T.bands[bandOfIdx(idx)];
export const richnessAt = (idx) => Math.pow(T.richness, idx);

// Ore per metre: a metre is T.pk.minPerM minutes of the reference crew at this depth.
export const opm = (s) => T.pk.minPerM * T.pk.refOre * richnessAt(s.idx);
export const oreBetween = (s, a, b) => (b > a ? opm(s) * (b - a) : 0);
export const faceAfter = (s, a, m) => (m > 0 ? a + m / opm(s) : a);
// Metres a minute at `orePerMin`.
export const metresPerMin = (s, orePerMin) => (orePerMin > 0 ? orePerMin / opm(s) : 0);

// Hardness: a gear level >= hardness cuts the ore. Mythic ore is hardness 9-10 (gear above T.gear.free needs the license).
// Common ore needs no gear (the soil slows it instead).
export const needOf = (ore) => (ore.tier === 'mythic' ? Math.max(T.gear.free + 1, ore.hardness) : ore.hardness);
export const cuts = (s, ore) => (ore ? (ore.tier === 'common' ? true : num(s.gear, 1) >= needOf(ore)) : false);
export const needText = (ore) => {
  const n = needOf(ore);
  return `Needs gear ${n}${n > T.gear.free ? ' (the Mythic drill license)' : ''} to break into ${ore.name}`;
};

// What a colony's site gives: the common ore and per-ore richness (0..1) and vein size (0.6..1.6).
export function defaultSite(I, siteRegion = null) {
  const common = I.ores.find((o) => o.tier === 'common') || I.ores[0];
  const richness = {}, veinSize = {};
  for (const o of I.ores) {
    if (o.tier === 'common') richness[o.id] = o.id === common?.id ? 1 : 0;
    else if (o.tier === 'rare') richness[o.id] = 0.37;
    else richness[o.id] = 0;
    veinSize[o.id] = 1;
  }
  return { id: 'default', regionId: siteRegion ?? null, soil: 1, richness, veinSize, common: common?.id ?? null };
}
export const commonOre = (c, I) => {
  const id = c.site?.common;
  const o = I.ores[I.idx[id]];
  if (o && o.tier === 'common') return o;
  return I.ores.filter((x) => x.tier === 'common').sort((a, b) => a.hardness - b.hardness || a.i - b.i)[0] || I.ores[0];
};

// Vein candidates of a shaft: [{ o, w (odds weight), r (site richness x tilt), size, p }], and their total weight P.
export function veinCands(c, I, s) {
  const site = c.site || {};
  const band = bandOfIdx(s.idx);
  const v = [];
  let P = 0;
  for (const o of I.ores) {
    if (o.tier === 'common') continue;
    if (o.tier === 'mythic' && band < 3) continue;
    const r0 = num(site.richness?.[o.id]);
    if (!(r0 > 0)) continue;
    const r = r0 * num(s.tilt?.[o.id], 1);
    const size = num(site.veinSize?.[o.id], 1);
    const w = r * size * (o.tier === 'mythic' ? T.pk.mythicW : 1);
    v.push({ o, w, r, size });
    P += w;
  }
  v.forEach((x) => { x.p = x.w / P; });
  v.P = P;
  return v;
}
// Share of a tunnel that lies inside veins.
export function veinShare(c, I, s) {
  const v = veinCands(c, I, s);
  if (!v.length) return 0;
  return Math.min(T.pk.shareMax, T.pk.share[bandOfIdx(s.idx)] * (0.25 + 0.75 * Math.min(2, v.P)));
}
const meanLenM = () => T.pk.meanHours * 60 / T.pk.minPerM;

// Vein n of a shaft, starting after `prevEnd`. Pure.
function rollPocket(c, I, s, n, prevEnd) {
  const cands = veinCands(c, I, s);
  const sh = veinShare(c, I, s);
  if (!cands.length || !(sh > 0)) return null;
  let r = hashSeed(`${s.seed}|${n}`);
  const u = [];
  for (let i = 0; i < 4; i++) { const [x, nx] = rngNext(r); u.push(x); r = nx; }
  let x = u[0], pick = cands[cands.length - 1];
  for (const cd of cands) { x -= cd.p; if (x <= 0) { pick = cd; break; } }
  const mythic = pick.o.tier === 'mythic';
  const sizeK = pick.size * (0.6 + 0.4 * Math.min(1.6, pick.r)) * (mythic ? T.pk.mythicLen : 1);
  const hours = Math.min(T.pk.hoursMax * (mythic ? T.pk.mythicLen : 1), Math.max(T.pk.hoursMin * (mythic ? T.pk.mythicLen : 1), T.pk.hours[0] * Math.pow(T.pk.hours[1], u[1]) * sizeK));
  const gapMean = meanLenM() * (1 - sh) / sh;
  const gap = gapMean * (n === 0 ? 0.15 + 0.85 * u[2] : 0.5 + u[2]);
  const start = round2(prevEnd + gap);
  return { ore: pick.o.id, start, len: Math.max(1, round2(hours * 60 / T.pk.minPerM)) };
}

// Fill in the tunnel fields of a shaft (new or loaded) and keep T.pk.ahead veins rolled past the face.
export function ensureTunnel(c, I, s) {
  if (!Number.isFinite(s.face)) s.face = 0;
  if (!Array.isArray(s.pk)) s.pk = [];
  if (!Number.isFinite(s.pkN)) s.pkN = 0;
  if (!Number.isFinite(s.pkEnd)) s.pkEnd = 0;
  if (!Number.isFinite(s.dug)) s.dug = 0;
  if (!Number.isFinite(s.gear) || s.gear < 1) s.gear = 1;
  if (!Number.isFinite(s.cart) || s.cart < 1) s.cart = 1;
  if (!Number.isFinite(s.seed)) s.seed = hashSeed(`${num(c.seed)}|${num(c.nukes)}|${s.idx}|${s.dir || 'main'}`);
  if (!s.tilt || typeof s.tilt !== 'object') s.tilt = {};
  if (!s.dir) s.dir = 'main';
  s.band = bandOf(s.idx);
  let ahead = 0;
  for (const p of s.pk) if (p.start + p.len > s.face + EPS) ahead++;
  for (let guard = 0; ahead < T.pk.ahead && guard < 20; guard++) {
    const p = rollPocket(c, I, s, s.pkN, s.pkEnd);
    if (!p) break;
    s.pk.push(p); s.pkN++; s.pkEnd = round2(p.start + p.len); ahead++;
  }
}

// Boundaries inside a vein, as fractions of its length: running low (80%), then the taper steps, then the end.
const BOUNDS = (() => {
  const b = [T.pk.low];
  const w = (1 - T.pk.taperFrom) / T.pk.taperSteps;
  for (let k = 0; k < T.pk.taperSteps; k++) b.push(T.pk.taperFrom + w * k);
  b.push(1);
  return [...new Set(b)].sort((x, y) => x - y);
})();
const stepW = (1 - T.pk.taperFrom) / T.pk.taperSteps;
// Output share of the rare ore at fraction f of a vein: 1 until 95%, then 0.9, 0.7, 0.5, 0.3, 0.1 (linear taper to 0).
export const taperAt = (f) => (f < T.pk.taperFrom - 1e-9 ? 1 : 1 - (Math.min(T.pk.taperSteps - 1, Math.floor((f - T.pk.taperFrom) / stepW + 1e-9)) + 0.5) / T.pk.taperSteps);

// Where the face is: { cur (vein the face is in), next, blocked, ore, target, taper, common }.
// target = metres where what is mined (or its taper) changes next (Infinity when blocked or no veins).
export function tunnelAt(c, I, s) {
  const face = num(s.face);
  let cur = null, next = null;
  for (const p of s.pk || []) {
    if (p.start + p.len <= face + EPS) continue;
    if (p.start <= face + EPS) { if (!cur) cur = p; } else if (!next || p.start < next.start) next = p;
  }
  const common = commonOre(c, I);
  if (cur) {
    const o = I.ores[I.idx[cur.ore]];
    if (o && !cuts(s, o)) return { cur, next, blocked: true, ore: common.id, pocketOre: o, target: Infinity, common, taper: 1 };
    const f = (face - cur.start) / cur.len;
    let target = cur.start + cur.len;
    for (const b of BOUNDS) { const m = cur.start + b * cur.len; if (m > face + EPS) { target = m; break; } }
    return { cur, next, blocked: false, ore: cur.ore, pocketOre: o, target, common, taper: taperAt(f + EPS / cur.len) };
  }
  return { cur: null, next, blocked: false, ore: common.id, pocketOre: null, target: next ? next.start : Infinity, common, taper: 1 };
}
// 0..1: how much of the vein the face is through.
export const veinDone = (s, p) => (p && p.len > 0 ? Math.min(1, Math.max(0, (num(s.face) - p.start) / p.len)) : 0);

// Keep s.ore (what the crew is mining right now) in step with the face and the gear. Mutates s.
export function syncTunnel(c, I, s) {
  ensureTunnel(c, I, s);
  const st = tunnelAt(c, I, s);
  s.ore = st.ore;
  return st;
}

// Long-run ore mix of a shaft at its gear, as time shares: [{ i, share }] (planning only).
// Veins the gear can't cut count as wall-rate common ore.
export function expectedMix(c, I, s) {
  const common = commonOre(c, I);
  const sh = veinShare(c, I, s);
  const out = new Map([[common.i, 1]]);
  if (!(sh > 0)) return [{ i: common.i, share: 1 }];
  for (const { o, p } of veinCands(c, I, s)) {
    const share = sh * p * (o.tier === 'mythic' ? T.pk.mythicLen : 1);
    out.set(common.i, out.get(common.i) - share);
    if (cuts(s, o)) out.set(o.i, (out.get(o.i) || 0) + share);
    else out.set(common.i, out.get(common.i) + share * T.pk.wall);
  }
  return [...out].map(([i, share]) => ({ i, share }));
}

// Fuzzy prospects of a shaft's veins, per ore: 'none' | 'low' | 'fair' | 'good' (the site's common is always 'good').
export function prospectsOf(c, I, s) {
  const out = {};
  const band = bandOfIdx(s.idx);
  const f = T.pk.share[band] / T.pk.share[1];
  for (const o of I.ores) {
    if (o.tier === 'common') { out[o.id] = o.id === commonOre(c, I).id ? 'good' : 'none'; continue; }
    const cd = veinCands(c, I, s).find((x) => x.o.id === o.id);
    const e = cd ? cd.r * cd.size * f : 0;
    out[o.id] = e < 0.04 ? 'none' : e < 0.3 ? 'low' : e < 0.6 ? 'fair' : 'good';
  }
  return out;
}
