import { T } from './tuning.js';

// mulberry32 on a uint32 state; returns [float, nextState]
export function rngNext(state) {
  let a = (state + 0x6D2B79F5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export function hashSeed(x) {
  const s = String(x ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}

export const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export const num = (x, d = 0) => (Number.isFinite(x) ? x : d);
export const pos = (x) => (Number.isFinite(x) && x > 0 ? x : 0);

export function fmt(n) {
  n = num(n);
  const a = Math.abs(n);
  if (a < 1000) return (a < 10 && a % 1 ? n.toFixed(1) : Math.round(n).toString());
  const units = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
  let i = -1, v = a;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return (n < 0 ? '-' : '') + (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : v < 100 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)) + units[i];
}

export function cleanName(s, fallback = '') {
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24).trim();
  return t || fallback;
}

// Planet info, cached per planet object.
const cache = new WeakMap();
export function info(world) {
  const planet = world.planet;
  let I = cache.get(planet);
  if (I) return I;
  const ores = (planet.ores || []).map((o, i) => {
    const tier = ['common', 'rare', 'mythic'].includes(o.tier) ? o.tier : 'common';
    const hardness = Math.min(5, Math.max(1, Math.round(num(o.hardness, 1))));
    let value = Number(o.baseValue);
    if (!(value > 0) || !Number.isFinite(value)) value = T.value[tier] * Math.pow(T.valueHard[tier], hardness - 1);
    value = Math.min(1e7, Math.max(0.05, value));
    return { id: String(o.id ?? 'ore' + i), name: o.name || 'Ore ' + (i + 1), tier, hardness, depthMin: Math.max(0, num(o.depthMin, 0)), value, i };
  });
  const idx = {};
  ores.forEach((o) => { idx[o.id] = o.i; });
  const byValue = ores.map((o) => o.i).sort((a, b) => ores[b].value - ores[a].value);
  const buyers = (planet.buyers || []).map((b, i) => ({
    id: String(b.id ?? 'b' + i), name: b.name || 'Buyer ' + (i + 1),
    distance: ['near', 'mid', 'far'].includes(b.distance) ? b.distance : 'mid',
    likes: ores.map((o) => { const m = Number(b.likes?.[o.id]); return m > 0 && Number.isFinite(m) ? Math.min(5, m) : 1; }),
  }));
  if (!buyers.length) buyers.push({ id: 'guild', name: 'Guild Exchange', distance: 'near', likes: ores.map(() => 1) });
  const buyerIdx = {};
  buyers.forEach((b, i) => { buyerIdx[b.id] = i; });
  I = { ores, idx, byValue, buyers, buyerIdx, n: ores.length };
  cache.set(planet, I);
  return I;
}

export const DAY_MS = 86_400_000;
export function dayOf(world, now) {
  const start = num(world.startedAt, 0);
  return Math.max(1, Math.floor((num(now) - start) / DAY_MS) + 1);
}
