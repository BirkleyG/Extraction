// Small pure helpers for the guild engine. No Math.random, no Date.now.

export function hash(x) {
  const s = String(x ?? '');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}
export function rng(seed) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// One deterministic uniform number for a key.
export const roll = (...k) => rng(k.join('|'))();
export const between = (u, [a, b]) => a + (b - a) * u;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const num = (x, d = 0) => (Number.isFinite(x) ? x : d);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const r2 = (v) => Math.round(v * 100) / 100;

export function clone(o) {
  if (o === null || typeof o !== 'object') return o;
  if (Array.isArray(o)) return o.map(clone);
  const r = {};
  for (const k in o) if (o[k] !== undefined) r[k] = clone(o[k]);
  return r;
}

export function fmt(n) {
  n = num(n);
  const a = Math.abs(n);
  if (a < 1000) return a < 10 && a % 1 ? n.toFixed(1) : Math.round(n).toString();
  const units = ['K', 'M', 'B', 'T', 'Qa'];
  let i = -1, v = a;
  while (v >= 1000 && i < units.length - 1) { v /= 1000; i++; }
  return (n < 0 ? '-' : '') + (v < 100 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)) + units[i];
}

export function cleanName(s, fallback = '') {
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28).trim();
  return t || fallback;
}

export const HOUR = 3_600_000;
export const DAY = 86_400_000;
