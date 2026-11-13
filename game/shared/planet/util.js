/* Small pure helpers shared by the planet generator and the pixel kit: seeded RNG, colour math, text cleaning.
 * No DOM, no I/O, no Math.random. */

export function hash(s) {
  let h = 2166136261 >>> 0; s = String(s);
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/* mulberry32: same generator the original renderer used */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/* stateless hash noise in 0..1 for integer i and a seed */
export function h01(i, sd) { let h = Math.imul((i | 0) ^ (sd | 0), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967295; }

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
export const shuffle = (R, arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const num = (v, fb) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : fb));

/* ---------- colour ---------- */
const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;
export function isHex(v) { return typeof v === 'string' && (HEX6.test(v.trim()) || HEX3.test(v.trim())); }
/* a valid #rrggbb (lowercase) or the fallback */
export function hexOr(v, fb) {
  if (typeof v !== 'string') return fb;
  let s = v.trim().toLowerCase(); if (!s.startsWith('#')) s = `#${s}`;
  if (HEX3.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX6.test(s) ? s : fb;
}
const toRgb = (c) => { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const fromRgb = (r, g, b) => `#${((1 << 24) | (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)).toString(16).slice(1)}`;

export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const k = (n) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return fromRgb(f(0), f(8), f(4));
}
export function toHsl(c) {
  const [R, G, B] = toRgb(c).map((v) => v / 255);
  const mx = Math.max(R, G, B); const mn = Math.min(R, G, B); const d = mx - mn; const l = (mx + mn) / 2;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [((h * 60) + 360) % 360, s, l];
}
export function mix(a, b, t) { const A = toRgb(a); const B = toRgb(b); return fromRgb(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); }
/* a < 0 darkens toward black, a > 0 lightens toward white */
export function shade(c, a) { const [r, g, b] = toRgb(c); return a < 0 ? fromRgb(r * (1 + a), g * (1 + a), b * (1 + a)) : fromRgb(r + (255 - r) * a, g + (255 - g) * a, b + (255 - b) * a); }
export function adjust(c, dh, ds, dl) { const [h, s, l] = toHsl(c); return hsl(h + dh, s + ds, l + dl); }
export function colorDist(a, b) { const A = toRgb(a); const B = toRgb(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); }
export function luma(c) { const [r, g, b] = toRgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
export function rgba(c, a) { const [r, g, b] = toRgb(c); return `rgba(${r},${g},${b},${a})`; }
/* pixel-art ramp: shadows drift cool, lights drift warm */
export function ramp(c, n = 4) {
  const [h, s, l] = toHsl(c);
  const warm = (dh) => { const toward = h > 60 && h < 240 ? -1 : 1; return h + toward * dh; }; // lean lights toward yellow
  const cool = (dh) => { const toward = h > 60 && h < 240 ? 1 : -1; return h + toward * dh; };
  const out = [hsl(cool(18), Math.min(1, s * 0.9 + 0.08), Math.max(0.1, l * 0.5)), hsl(h, s, l), hsl(warm(10), Math.min(1, s * 1.05), Math.min(0.86, l + (1 - l) * 0.38))];
  if (n >= 4) out.push(hsl(warm(16), s * 0.5, Math.min(0.97, l + (1 - l) * 0.78)));
  return out;
}

/* ---------- text ---------- */
/* strip markup and control characters, collapse whitespace, clamp length */
export function cleanText(v, fb, max = 120) {
  if (typeof v !== 'string') return fb;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[<>\u0000-\u001f\u007f`]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return fb;
  if (s.length <= max) return s;
  const cut = s.slice(0, max); const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,;:\s-]+$/, '');
}
export function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24); }
