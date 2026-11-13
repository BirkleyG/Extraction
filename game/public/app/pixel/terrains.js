/* Drawing specs for all 39 landscapes (shared/planet/terrains.js has the data). Ported from the archived
 * legacy-tycoon play/terrains.js + the nine hand-drawn landscapes in play/scene.js, rewritten as specs:
 *   far / near: ridge profile built from `k` ('roll' | 'peak' | 'steps' | 'flat' | 'none' | 'cells' | 'fn')
 *   decor: weighted ground details; over: animated overlay; stripes/windows/holes/glint/topline: ridge styling
 * DOM-free at import time (sprites are only built when drawn), so Node tests can import it. */
import { lerp, h01, shade, mix } from '../../../shared/planet/util.js';
import { oreSpriteSpec } from '../../../shared/planet/ores.js';
import { oreSprite } from './sprites.js';

const vn = (x, sd) => { const i = Math.floor(x); const f = x - i; const u = f * f * (3 - 2 * f); return lerp(h01(i, sd), h01(i + 1, sd), u); };

export const AUTUMN = ['#c8602a', '#d8902a', '#a8402a', '#e0b030'];
const roll = (a, f, b) => ({ k: 'roll', a, f, b });
const cells = (shape, cell, h, extra = {}) => ({ k: 'cells', shape, cell, h, ...extra });
const fn = (name, L) => ({ k: 'fn', fn: name, L });

export const SPEC = {
  // the nine originals
  mesa: { far: fn('mesa', 0), near: fn('mesa', 1), stripes: true, decor: [['rock', 3], ['boulder', 2], ['pillar', 1.5], ['tuft', 0.5]] },
  dunes: { far: fn('dunes', 0), near: fn('dunes', 1), topline: true, decor: [['ripple', 6], ['deadbush', 2], ['bone', 0.3]] },
  glacier: { far: fn('glacier', 0), near: fn('glacier', 1), snowcap: true, decor: [['snow', 5], ['icespike', 3]] },
  volcanic: { far: fn('volcanic', 0), near: fn('volcanic', 1), over: 'volcano', decor: [['lava', 4], ['obsidian', 3], ['rock', 1]] },
  swamp: { far: fn('swamp', 0), near: fn('swamp', 1), decor: [['reed', 4], ['pool', 3], ['dead', 2]] },
  crystal: { far: fn('crystal', 0), near: fn('crystal', 1), topline: true, decor: [['crystal', 5], ['rock', 1]] },
  fungal: { far: fn('fungal', 0), near: fn('fungal', 1), over: 'fungal', decor: [['mushroom', 6], ['rock', 2]] },
  canyon: { far: fn('canyon', 0), near: fn('canyon', 1), stripes: true, decor: [['rock', 4], ['boulder', 2]] },
  saltflat: { far: roll(4, 0.006, 6), near: { k: 'flat', b: 2, a: 2 }, over: 'shimmer', decor: [['crack', 5], ['shine', 3]] },
  // thirty more, from terrains.js
  forest: { far: roll(12, 0.009, 30), near: cells('round', 34, [22, 46], { gap: 0.1 }), decor: [['round', 3], ['tuft', 3], ['rock', 1], ['flower', 1], ['bush', 2]] },
  jungle: { far: roll(18, 0.012, 38), near: cells('round', 40, [34, 70], { span: 1.1 }), decor: [['fern', 4], ['bush', 2], ['flower', 2], ['round', 2]] },
  savanna: { far: roll(8, 0.006, 14), near: cells('acacia', 80, [14, 28], { gap: 0.2 }), decor: [['acacia', 1], ['tuft', 5], ['rock', 1], ['bone', 0.3]] },
  tundra: { far: roll(6, 0.007, 12), near: { k: 'flat', b: 4, a: 3 }, decor: [['snow', 3], ['rock', 2], ['tuft', 1]] },
  taiga: { far: roll(9, 0.01, 26), near: cells('conifer', 22, [26, 54]), decor: [['conifer', 4], ['snow', 2], ['rock', 1]] },
  prairie: { far: roll(9, 0.006, 22), near: roll(4, 0.014, 8), decor: [['tuft', 4], ['flower', 4], ['rock', 0.5]] },
  alpine: { far: { k: 'peak', a: 92, f: 0.02, b: 40, cap: true }, near: { k: 'peak', a: 50, f: 0.035, b: 20, cap: true }, decor: [['rock', 3], ['snow', 2], ['conifer', 1]] },
  islands: { far: cells('dome', 130, [14, 32], { gap: 0.25 }), near: cells('palm', 95, [10, 18], { gap: 0.45 }), water: { d: 10 }, decor: [['palm', 2], ['tuft', 3], ['rock', 1], ['shell', 1]] },
  coast: { far: { k: 'steps', a: 46, f: 0.007, b: 22, q: 4 }, near: roll(5, 0.013, 8), water: { d: 8, every: 600, len: 300 }, stripes: true, decor: [['tuft', 3], ['rock', 3], ['shell', 1]] },
  lakes: { far: { k: 'peak', a: 52, f: 0.016, b: 28 }, near: { k: 'none' }, water: { d: 10 }, decor: [['reed', 3], ['tuft', 3], ['round', 1], ['rock', 1]] },
  badlands: { far: { k: 'steps', a: 52, f: 0.011, b: 20, q: 6 }, near: cells('spire', 26, [10, 36], { gap: 0.15 }), stripes: true, decor: [['rock', 3], ['spire', 2], ['tuft', 0.5]] },
  moor: { far: roll(14, 0.006, 18), near: roll(5, 0.012, 6), decor: [['heather', 4], ['mono', 1], ['rock', 2]] },
  autumn: { far: roll(12, 0.01, 28), near: cells('round', 32, [22, 44], { gap: 0.1, col: AUTUMN }), decor: [['round', 3], ['tuft', 2], ['leaf', 3], ['rock', 1]] },
  scrub: { far: roll(7, 0.007, 14), near: cells('bush', 28, [5, 12]), decor: [['bush', 4], ['tuft', 3], ['rock', 2]] },
  arches: { far: { k: 'steps', a: 38, f: 0.01, b: 22, q: 5 }, near: cells('arch', 120, [32, 58], { gap: 0.25 }), stripes: true, decor: [['rock', 3], ['spire', 1], ['tuft', 0.5]] },
  falls: { far: { k: 'steps', a: 56, f: 0.008, b: 30, q: 3 }, near: roll(5, 0.012, 8), stripes: true, over: 'falls', decor: [['fern', 3], ['rock', 2], ['round', 1], ['tuft', 2]] },
  geysers: { far: roll(7, 0.007, 10), near: { k: 'flat', b: 3, a: 2 }, over: 'geysers', decor: [['vent', 3], ['rock', 2], ['crack', 2]] },
  oasis: { far: roll(11, 0.008, 14), near: cells('palm', 130, [16, 28], { gap: 0.3 }), decor: [['palm', 2], ['pond', 1], ['ripple', 3], ['bush', 1]] },
  terraces: { far: { k: 'steps', a: 38, f: 0.014, b: 20, q: 9 }, near: { k: 'steps', a: 14, f: 0.03, b: 6, q: 5 }, stripes: true, decor: [['rice', 4], ['tuft', 2], ['round', 1]] },
  redwoods: { far: cells('trunk', 36, [64, 112], { w: 0.28, crown: true }), near: cells('trunk', 24, [32, 64], { w: 0.3, crown: true }), tint: '#6a4a34', decor: [['fern', 3], ['rock', 1], ['stump', 2], ['tuft', 1]] },
  skyislands: { tint: '#9ab0d6', far: cells('float', 100, [10, 22], { float: [34, 74], base: 2, gap: 0.2 }), near: cells('float', 64, [6, 12], { float: [12, 34], base: 2, gap: 0.2 }), decor: [['crystal', 2], ['tuft', 2], ['rock', 1]] },
  bones: { far: cells('ribs', 58, [32, 74], { gap: 0.15 }), near: cells('bone', 18, [8, 26], { gap: 0.1 }), tint: '#e8e0cc', decor: [['bone', 4], ['rock', 1], ['crack', 1]] },
  ruins: { far: cells('slab', 26, [30, 98], { w: 0.46, gap: 0.12 }), near: cells('slab', 18, [12, 42], { w: 0.46, gap: 0.2 }), windows: true, over: 'glitch', decor: [['neon', 3], ['gear', 1], ['rock', 2], ['crack', 1]] },
  tendrils: { far: cells('tentacle', 36, [40, 92]), near: cells('tentacle', 22, [18, 42]), decor: [['tent', 4], ['mushroom', 1], ['crack', 1]] },
  mirror: { far: cells('shard', 74, [12, 44], { gap: 0.2 }), near: { k: 'flat', b: 2, a: 1 }, glint: true, decor: [['shard', 4], ['ripple', 3], ['crack', 1]] },
  hive: { far: cells('hive', 50, [40, 84], { w: 0.46 }), near: cells('hive', 30, [14, 32], { w: 0.46 }), holes: true, decor: [['comb', 4], ['rock', 1], ['tuft', 1]] },
  monoliths: { far: cells('slab', 80, [40, 96], { w: 0.12, gap: 0.2 }), near: cells('slab', 50, [18, 42], { w: 0.1, gap: 0.2 }), decor: [['mono', 3], ['crack', 2], ['rock', 1]] },
  rifts: { far: cells('float', 70, [8, 18], { float: [24, 84], base: 2, gap: 0.15 }), near: cells('float', 44, [5, 10], { float: [10, 34], base: 2, gap: 0.2 }), over: 'rifts', decor: [['shard', 3], ['crack', 3], ['rock', 1]] },
  scrapyard: { far: cells('slab', 24, [20, 64], { w: 0.5 }), near: cells('slab', 16, [8, 28], { w: 0.5 }), over: 'scrap', decor: [['gear', 4], ['rock', 2], ['crack', 1]] },
  watchers: { far: cells('eye', 60, [36, 82], { gap: 0.1 }), near: cells('eye', 38, [16, 40], { gap: 0.1 }), over: 'watch', decor: [['eye', 3], ['mushroom', 1], ['tuft', 1]] },
};

/* ---------- ridge profiles ---------- */
function shape(Ly, dx, H, idx, sd, wx) {
  const a = Math.abs(dx); const w = Ly.w || 0.46;
  switch (Ly.shape) {
    case 'round': return a < 0.2 ? { h: H * 0.45, trunk: true } : { h: H * 0.35 + Math.sqrt(Math.max(0, 1 - Math.min(1, a / 0.95) ** 2)) * H * 0.65, cap: true };
    case 'conifer': return { h: a < 0.9 ? H * (1 - a) * (0.88 + 0.12 * (Math.floor(a * 10) % 2)) : 3, cap: true };
    case 'trunk': return a < w ? { h: H, trunk: true, crown: !!Ly.crown } : { h: 3 };
    case 'acacia': return a < 0.1 ? { h: H * 0.7, trunk: true } : a < 0.95 ? { h: H * 0.78, lo: H * 0.78 - 5, cap: true } : { h: 3 };
    case 'palm': return a < 0.08 ? { h: H * 0.8, trunk: true } : a < 0.9 ? { h: H * 0.8 + (1 - a) * H * 0.12, lo: H * 0.8 - 2, cap: true } : { h: 3 };
    case 'spire': return a < 0.2 ? { h: H } : a < 0.55 && H > 0 ? { h: H * 0.6 + 2, lo: Math.max(0, H * 0.6 - 3) } : { h: 3 };
    case 'bush': case 'dome': return { h: Math.sqrt(Math.max(0, 1 - a * a)) * H + 2, cap: true };
    case 'hive': return { h: a < 1 ? Math.floor(Math.sqrt(Math.max(0, 1 - a * a)) * 5) / 5 * H + 2 : 3, cap: true };
    case 'slab': return a < w ? { h: H } : { h: 3 };
    case 'tentacle': { const k = Math.max(0, 1 - a * 1.5 + Math.sin((wx + idx * 13) * 0.35) * 0.08); return { h: H * Math.pow(k, 1.25) + 3, cap: k > 0.82 }; }
    case 'ribs': { if (a >= 0.95) return { h: 3 }; const hh = Math.sin((1 - a) * Math.PI * 0.5) * H; return { h: hh, lo: Math.max(0, hh - 5) }; }
    case 'arch': return a < 0.85 ? (a > 0.5 ? { h: H } : { h: H, lo: H - 9 }) : { h: 3 };
    case 'bone': return a < 0.3 ? { h: H * (1 - a / 0.3 * 0.9) } : { h: 3 };
    case 'shard': return a < 0.9 ? { h: Math.max(3, H * (1 - a)), cap: a < 0.2 } : { h: 3 };
    case 'eye': if (a < 0.08) return { h: H, trunk: true }; if (a < 0.3) return { h: H + Math.sqrt(1 - (a / 0.3) ** 2) * H * 0.2, lo: H * 0.9, ball: true }; return { h: 3 };
    case 'float': { const fl = Ly.float[0] + h01(idx + 7, sd) * (Ly.float[1] - Ly.float[0]); return a < 1 ? { h: fl + H * (1 - a * a), lo: fl, cap: true } : { h: 2 }; }
    default: return { h: H };
  }
}

/* the nine hand-made skylines from scene.js */
function custom(name, wx, L, sd, planet) {
  switch (name) {
    case 'mesa': { const q = Math.floor(vn(wx * 0.011 + L * 7, sd) * 5) / 5; return { h: L ? 10 + q * 30 : 30 + q * 62 }; }
    case 'dunes': return { h: (L ? 7 : 16) + (L ? 5 : 9) * Math.sin(wx * 0.011 + (sd % 7) + L) + (L ? 3 : 6) * Math.sin(wx * 0.027 + 2) };
    case 'glacier': { const j = Math.abs((((wx * (L ? 0.05 : 0.028) + (sd % 9)) % 2) + 2) % 2 - 1); return { h: (L ? 14 : 34) + j * (L ? 30 : 70) + vn(wx * 0.1, sd) * 8, snow: true }; }
    case 'volcanic': {
      let hh = L ? 8 + vn(wx * 0.02, sd) * 14 : 14 + vn(wx * 0.012, sd) * 20;
      if (!L) { const c = volcanoNear(wx, sd); const d = Math.abs(wx - c); let cone = 88 - d * 0.6; if (cone > 0) { if (d < 9) cone = 74 - (9 - d) * 2.4; hh = Math.max(hh, cone); } }
      return { h: hh };
    }
    case 'swamp': return { h: (L ? 5 : 14) + (L ? 3 : 7) * Math.sin(wx * 0.017 + (sd % 5)) + vn(wx * 0.06, sd) * 4 };
    case 'crystal': {
      const cell = L ? 30 : 44; const idx = Math.floor(wx / cell); const cen = idx * cell + cell * (0.3 + h01(idx, sd) * 0.4);
      const H = (L ? 26 : 54) + h01(idx + 99, sd) * (L ? 30 : 70); const w = cell * 0.5; const d = Math.abs(wx - cen);
      const ores = planet.ores || []; const col = ores.length ? ores[((idx + L * 2 + (sd >>> 3)) % ores.length + ores.length) % ores.length].color : '#8a7ad0';
      return d < w ? { h: Math.max(L ? 3 : 6, H * (1 - d / w)), c: col, facet: wx < cen } : { h: L ? 3 : 6 };
    }
    case 'fungal': {
      const cell = L ? 40 : 56; const idx = Math.floor(wx / cell); const cen = idx * cell + cell * 0.5;
      const stem = (L ? 14 : 26) + h01(idx, sd) * (L ? 12 : 30); const capR = (L ? 9 : 15) + h01(idx + 5, sd) * (L ? 6 : 10); const dx = Math.abs(wx - cen);
      let hh = 4; let cap = false; let stalk = false;
      if (dx < 2.5) { hh = stem; stalk = true; }
      if (dx < capR) { const ch = stem + Math.sqrt(1 - (dx / capR) ** 2) * capR * 0.55; if (ch > hh) { return { h: ch, lo: stem - 1, cap: true, mush: true, stalk: dx < 2.5 }; } }
      return { h: hh, cap, stalk };
    }
    case 'canyon': { const n = vn(wx * 0.008 + L * 3, sd); let hh = (L ? 20 : 50) + n * (L ? 24 : 56); hh = Math.floor(hh / 7) * 7; return { h: vn(wx * 0.004 + 9, sd) > 0.72 ? (L ? 4 : 10) : hh }; }
    default: return { h: L ? 4 : 8 };
  }
}
/* volcano cones repeat every 270 world units */
export function volcanoNear(wx, sd) { const p = 270; const off = 70 + (sd % 70); return Math.round((wx - off) / p) * p + off; }

export function ridgeLayer(Ly, wx, sd, planet) {
  switch (Ly.k) {
    case 'none': return { h: 0 };
    case 'fn': return custom(Ly.fn, wx, Ly.L, sd, planet);
    case 'flat': return { h: Ly.b + vn(wx * 0.05, sd) * (Ly.a || 0) };
    case 'roll': return { h: Math.max(2, Ly.b + Ly.a * (Math.sin(wx * Ly.f + (sd % 7)) + 0.5 * Math.sin(wx * Ly.f * 2.3 + 2)) * 0.67) };
    case 'peak': { const j = Math.abs((((wx * Ly.f + (sd % 9)) % 2) + 2) % 2 - 1); return { h: Ly.b + j * Ly.a + vn(wx * 0.1, sd) * 6, snow: Ly.cap }; }
    case 'steps': { const q = Math.floor(vn(wx * Ly.f, sd) * Ly.q) / Ly.q; return { h: Ly.b + q * Ly.a }; }
    case 'cells': {
      const span = Ly.span || 1; const idx = Math.floor(wx / Ly.cell); const half = Ly.cell * 0.5 * span;
      const cen = idx * Ly.cell + Ly.cell * (0.5 + (h01(idx + 3, sd) - 0.5) * 0.4); const base = Ly.base || 3;
      if (Ly.gap && h01(idx + 17, sd) < Ly.gap) return { h: base };
      const dx = (wx - cen) / half; if (Math.abs(dx) > 1) return { h: base };
      const H = Ly.h[0] + h01(idx + 99, sd) * (Ly.h[1] - Ly.h[0]);
      const r = shape(Ly, dx, H, idx, sd, wx);
      if (Ly.col) r.c = Ly.col[((idx % Ly.col.length) + Ly.col.length) % Ly.col.length];
      return r;
    }
    default: return { h: 4 };
  }
}
export function layerCells(Ly, sd, x0, x1) {
  const out = [];
  if (Ly.k !== 'cells') return out;
  for (let idx = Math.floor(x0 / Ly.cell) - 1; idx <= Math.ceil(x1 / Ly.cell); idx += 1) {
    if (Ly.gap && h01(idx + 17, sd) < Ly.gap) continue;
    out.push({ cen: idx * Ly.cell + Ly.cell * (0.5 + (h01(idx + 3, sd) - 0.5) * 0.4), H: Ly.h[0] + h01(idx + 99, sd) * (Ly.h[1] - Ly.h[0]), idx });
  }
  return out;
}

/* ---------- ground decor (P = pen, x = world x, ground at y = 0) ---------- */
const oreAt = (pl, R0) => { const ores = pl.ores || []; return ores.length ? ores[Math.floor(R0() * ores.length)] : { color: '#b8a0e0', tier: 'rare', shape: 'shard' }; };
export const DECOR = {
  tuft: (P, x, gc) => { for (let k = 0; k < 3; k += 1) P.rect(x + k * 2, -3 - (k % 2), 1, 3 + (k % 2), shade(gc, 0.2)); },
  flower: (P, x, gc, R0, pl) => { P.rect(x, -5, 1, 5, '#3a6a2a'); P.rect(x - 1, -7, 3, 2, oreAt(pl, R0).color); P.rect(x, -6, 1, 1, '#fff6c0'); },
  rock: (P, x, gc) => { P.rect(x, -3, 6, 3, shade(gc, -0.3)); P.rect(x + 1, -5, 3, 2, shade(gc, -0.15)); P.rect(x + 3, -4, 2, 1, shade(gc, 0.1)); },
  boulder: (P, x, gc) => { P.rect(x, -4, 8, 4, shade(gc, -0.3)); P.rect(x + 1, -7, 5, 3, shade(gc, -0.15)); P.rect(x + 5, -6, 2, 1, shade(gc, 0.1)); },
  pillar: (P, x, gc) => { P.rect(x, -15, 4, 15, shade(gc, -0.2)); P.rect(x, -15, 1, 15, shade(gc, 0.1)); P.rect(x - 1, -16, 6, 2, shade(gc, -0.1)); },
  conifer: (P, x, gc, R0, pl, region, leaf) => { const hh = 12 + Math.floor(R0() * 12); P.rect(x, -3, 2, 3, '#3a2818'); for (let q = 0; q < hh; q += 1) { const w = (hh - q) * 0.32 + 0.4; P.rect(x + 1 - w, -q - 3, w * 2, 1, q % 5 === 0 ? shade(leaf, -0.2) : shade(leaf, -0.1)); } },
  round: (P, x, gc, R0, pl, region, leaf) => { const hh = 9 + Math.floor(R0() * 8); P.rect(x, -hh * 0.5, 2, hh * 0.5, '#4a3220'); for (let q = 0; q < hh * 0.7; q += 1) { const t = q / (hh * 0.7); const w = Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2)) * (hh * 0.45) + 1; P.rect(x + 1 - w, -hh * 0.45 - q, w * 2, 1, q % 4 === 0 ? shade(leaf, -0.15) : leaf); } },
  palm: (P, x, gc, R0) => { const hh = 12 + Math.floor(R0() * 10); for (let q = 0; q < hh; q += 1) P.rect(x + Math.floor(q * 0.12), -q - 2, 2, 1, '#7a5a3a'); const cx = x + Math.floor(hh * 0.12); P.line(cx + 1, -hh - 2, cx - 9, -hh + 3, '#3a8a3a', 2); P.line(cx + 1, -hh - 2, cx + 11, -hh + 3, '#3a8a3a', 2); P.line(cx + 1, -hh - 2, cx + 1, -hh - 8, '#4a9a44', 2); },
  acacia: (P, x, gc, R0) => { const hh = 10 + Math.floor(R0() * 8); P.rect(x, -hh, 2, hh, '#5a3e24'); P.rect(x - 8, -hh - 3, 18, 3, '#4a7a34'); P.rect(x - 5, -hh - 5, 12, 2, '#5a8a3c'); },
  dead: (P, x) => { P.rect(x, -14, 2, 14, '#3a2a22'); P.line(x + 1, -10, x + 6, -16, '#3a2a22', 1); P.line(x + 1, -7, x - 4, -13, '#3a2a22', 1); },
  deadbush: (P, x) => { P.line(x, 0, x + 2, -6, '#6a4a2a', 1); P.line(x, -3, x - 3, -6, '#6a4a2a', 1); P.line(x, -3, x + 4, -7, '#6a4a2a', 1); },
  bush: (P, x, gc, R0, pl, region, leaf) => { P.rect(x - 4, -4, 9, 4, shade(leaf, -0.2)); P.rect(x - 2, -6, 6, 2, leaf); },
  fern: (P, x, gc, R0, pl, region, leaf) => { for (let k = -2; k <= 2; k += 1) P.line(x, 0, x + k * 3, -7 + Math.abs(k), shade(leaf, 0.05), 1); },
  pond: (P, x) => { P.rect(x, -1, 20, 1, '#2a6a8a'); P.rect(x + 3, -1, 6, 1, '#6ad0e8'); },
  pool: (P, x) => { P.rect(x, -1, 18, 1, '#2a4a52'); P.rect(x + 4, -1, 2, 1, '#6ad0c0'); },
  snow: (P, x, gc, R0) => { const hh = 4 + Math.floor(R0() * 5); for (let q = 0; q < hh; q += 1) { const w = (hh - q) * 1.5 + 1; P.rect(x - w, -q - 1, w * 2, 1, q % 3 === 0 ? '#d4e6f2' : '#f4fbff'); } },
  icespike: (P, x, gc, R0) => { const hh = 6 + Math.floor(R0() * 10); P.rect(x, -hh, 3, hh, '#bfe3f6'); P.rect(x, -hh, 1, hh, '#ffffff'); P.rect(x + 3, -hh + 4, 2, hh - 4, '#8fc4e0'); },
  lava: (P, x) => { P.rect(x, -1, 9, 1, '#ff6a2a'); P.rect(x + 2, -1, 3, 1, '#ffd23f'); },
  obsidian: (P, x, gc, R0) => { const hh = 4 + Math.floor(R0() * 8); P.rect(x, -hh, 3, hh, '#1a1218'); P.rect(x + 1, -hh - 2, 1, 2, '#1a1218'); P.rect(x, -hh, 1, hh, '#3a2a34'); },
  bone: (P, x, gc, R0) => { const hh = 5 + Math.floor(R0() * 8); P.rect(x, -hh, 2, hh, '#e8e0cc'); P.rect(x - 1, -hh - 1, 4, 2, '#e8e0cc'); P.rect(x + 4, -3, 6, 2, '#d8d0bc'); },
  shard: (P, x, gc, R0) => { const hh = 6 + Math.floor(R0() * 12); for (let q = 0; q < hh; q += 1) P.rect(x - (hh - q) * 0.25, -q - 1, (hh - q) * 0.5 + 1, 1, q < 3 ? '#eaf6ff' : '#b8d8ee'); },
  gear: (P, x, gc, R0) => { const r = 4 + Math.floor(R0() * 4); P.rect(x - r, -r * 2, r * 2, r * 2, '#6a6a76'); P.rect(x - r + 1, -r * 2 + 1, r * 2 - 2, r * 2 - 2, '#8a8a96'); P.rect(x - 1, -r - 1, 2, 2, '#3a3a44'); for (let k = 0; k < 4; k += 1) P.rect(x - r - 1 + k * 3, -r * 2 - 1, 2, 1, '#6a6a76'); },
  eye: (P, x, gc, R0) => { const hh = 6 + Math.floor(R0() * 8); P.rect(x, -hh, 1, hh, '#5a2a6a'); P.disc(x + 0.5, -hh - 2, 3, '#f0f0e8'); P.rect(x, -hh - 3, 2, 2, '#1a1022'); },
  neon: (P, x, gc, R0, pl) => { const hh = 8 + Math.floor(R0() * 12); P.rect(x, -hh, 2, hh, '#1a1428'); P.rect(x, -hh, 1, hh, oreAt(pl, R0).color); },
  comb: (P, x) => { for (let q = 0; q < 3; q += 1) for (let k = 0; k <= 2 - q; k += 1) P.rect(x + k * 4 + q * 2, -q * 3 - 3, 3, 3, q % 2 ? '#d89a2a' : '#b87a1c'); },
  tent: (P, x, gc, R0) => { const hh = 8 + Math.floor(R0() * 10); for (let q = 0; q < hh; q += 1) P.rect(x + Math.round(Math.sin(q * 0.5) * 2), -q - 1, 2, 1, q > hh - 3 ? '#ff7ac0' : '#a82e7a'); },
  mono: (P, x, gc, R0) => { const hh = 8 + Math.floor(R0() * 12); P.rect(x, -hh, 4, hh, '#14121e'); P.rect(x, -hh, 1, hh, '#3a3a52'); },
  mushroom: (P, x, gc, R0, pl, region) => { const hh = 5 + Math.floor(R0() * 9); const cap = mix('#ff9fd0', region.biomes[0], 0.25 + R0() * 0.4); P.rect(x, -hh, 2, hh, '#d8c8b8'); P.rect(x - 4, -hh - 3, 10, 3, cap); P.rect(x - 3, -hh - 4, 8, 1, shade(cap, 0.4)); P.rect(x - 1, -hh - 2, 1, 1, '#fff'); },
  crystal: (P, x, gc, R0, pl) => { const o = oreAt(pl, R0); const im = oreSprite({ ...oreSpriteSpec(o), shape: R0() < 0.5 ? 'cluster' : 'shard' }, 9 + Math.floor(R0() * 6)); P.sprite(im, x, 1, im.width / 2, im.height - 1); },
  vent: (P, x) => { P.rect(x - 5, -3, 10, 3, '#8a7a5a'); P.rect(x - 3, -5, 6, 2, '#a89874'); P.rect(x - 1, -5, 2, 1, '#3a2a1a'); },
  rice: (P, x) => { P.rect(x, -1, 22, 1, '#7ac0d0'); for (let k = 0; k < 6; k += 1) P.rect(x + 2 + k * 3, -3, 1, 2, '#5ab048'); },
  reed: (P, x) => { for (let k = 0; k < 3; k += 1) P.rect(x + k * 2, -6 - (k % 2) * 3, 1, 6 + (k % 2) * 3, '#5a7a3a'); P.rect(x + 1, -9, 1, 2, '#6a4a2a'); },
  ripple: (P, x, gc) => { P.rect(x, -1, 12, 1, shade(gc, 0.2)); P.rect(x + 3, -2, 5, 1, shade(gc, 0.1)); },
  crack: (P, x, gc) => { P.line(x, 0, x + 4, -1, shade(gc, -0.35), 1); P.line(x + 4, -1, x + 7, 0, shade(gc, -0.35), 1); },
  shine: (P, x) => { P.rect(x, -1, 12, 1, '#ffffff'); },
  heather: (P, x) => { for (let k = 0; k < 4; k += 1) { P.rect(x + k * 2, -3 - (k % 2), 1, 3, '#4a3a5a'); P.rect(x + k * 2, -4 - (k % 2), 1, 1, '#b07ad0'); } },
  stump: (P, x) => { P.rect(x, -5, 6, 5, '#5a3a26'); P.rect(x, -5, 6, 1, '#8a6a46'); },
  shell: (P, x) => { P.rect(x, -2, 4, 2, '#f4e4d4'); P.rect(x + 1, -3, 2, 1, '#fff4e8'); },
  leaf: (P, x, gc, R0) => { P.rect(x, -1, 3, 1, AUTUMN[Math.floor(R0() * AUTUMN.length)]); P.rect(x + 4, -2, 2, 1, AUTUMN[Math.floor(R0() * AUTUMN.length)]); },
  spire: (P, x, gc, R0) => { const hh = 10 + Math.floor(R0() * 14); P.rect(x, -hh, 5, hh, shade(gc, -0.2)); P.rect(x - 2, -hh, 9, 3, shade(gc, -0.05)); P.rect(x, -hh, 1, hh, shade(gc, 0.1)); },
};
export function drawDecor(P, spec, x, gc, R0, planet, region, leaf) {
  const total = spec.decor.reduce((n, d) => n + d[1], 0); let r = R0() * total;
  for (const [kind, w] of spec.decor) { r -= w; if (r <= 0) { if (DECOR[kind]) DECOR[kind](P, x, gc, R0, planet, region, leaf); return; } }
}

/* ---------- animated overlays, anchored in the world so they pan with the land ---------- */
export function drawOverlay(name, o) {
  const { P, g, t, sd, planet, spec, wx0, wx1 } = o; const s = P.s; const fs = o.farShift || 0; const ns = o.nearShift || 0;
  const each = (period, fnc) => { for (let k = Math.floor(wx0 / period) - 1; k <= Math.ceil(wx1 / period); k += 1) fnc(k * period + h01(k + 31, sd) * period * 0.6, k); };
  const ores = planet.ores && planet.ores.length ? planet.ores : [{ color: '#b892ff' }];
  if (name === 'falls') {
    for (let k = Math.floor((wx0 - fs) / 190) - 1; k <= Math.ceil((wx1 - fs) / 190); k += 1) {
      const x = k * 190 + h01(k + 31, sd) * 114; const H = ridgeLayer(spec.far, x, sd, planet).h; const X = x + fs;
      P.rect(X - 1, -H, 3, H, '#e8f6ff');
      for (let q = 0; q < H; q += 4) { if ((q + t * 24) % 8 < 4) P.rect(X - 1, -q - 2, 3, 2, '#9ad0ea'); }
      g.globalAlpha = 0.35; P.disc(X, 0, 7, '#e8f6ff'); g.globalAlpha = 1;
    }
  } else if (name === 'geysers') {
    each(190, (x, k) => {
      const ph = (t * 0.22 + k * 0.37) % 1; if (ph >= 0.55 || ph < 0) return; const kk = ph / 0.55;
      for (let q = 0; q < 9; q += 1) { const u = q / 9; g.globalAlpha = (1 - u) * 0.6 * Math.sin(kk * Math.PI); P.disc(x + Math.sin(u * 4 + t) * (2 + u * 8), -u * 70 * Math.sin(kk * Math.PI) - 4, 2 + u * 7, '#f4f4f4'); }
      g.globalAlpha = 1;
    });
  } else if (name === 'rifts') {
    each(300, (x, i) => {
      const flick = 0.5 + 0.5 * Math.sin(t * 5 + i * 2); const col = ores[((sd + i) % ores.length + ores.length) % ores.length].color;
      let px = x; let py = -150;
      for (let q = 0; q < 14; q += 1) { const nx = x + (h01(q + i * 20, sd) - 0.5) * 20; const ny = py + 8; g.globalAlpha = 0.25 * flick; P.line(px, py, nx, ny, col, 4); g.globalAlpha = 0.5 + 0.5 * flick; P.line(px, py, nx, ny, '#ffffff', 1); px = nx; py = ny; }
      g.globalAlpha = 1;
    });
  } else if (name === 'scrap') {
    each(150, (x, i) => {
      for (let q = 0; q < 6; q += 1) { const ph = (t * 0.6 + q / 6 + i * 0.2) % 1; g.globalAlpha = 1 - ph; P.rect(x + Math.sin(ph * 9 + q) * 6, -ph * 46 - 6, 1, 1, ph < 0.4 ? '#ffd23f' : '#ff8a3d'); }
      for (let q = 0; q < 4; q += 1) { const ph = (t * 0.2 + q / 4 + i * 0.3) % 1; g.globalAlpha = (1 - ph) * 0.4; P.disc(x + ph * 12, -30 - ph * 60, 3 + ph * 8, '#5a5a60'); }
      g.globalAlpha = 1;
    });
  } else if (name === 'watch') {
    for (const [Ly, sh] of [[spec.far, fs], [spec.near, ns]]) {
      for (const c0 of layerCells(Ly, sd, wx0 - sh, wx1 - sh)) { const c = { ...c0, cen: c0.cen + sh };
        const gaze = Math.sin(t * 0.8 + c.idx) * 2; const blink = Math.sin(t * 0.7 + c.idx * 1.9) > 0.97;
        const by0 = -(c.H * 1.05); if (blink) P.rect(c.cen - 3, by0, 6, 1, '#7a3a8a'); else { P.rect(c.cen + gaze - 1, by0 - 1, 3, 3, '#1a1022'); P.rect(c.cen + gaze, by0 - 1, 1, 1, '#ff3d3d'); }
      }
    }
  } else if (name === 'volcano') {
    for (let c0 = volcanoNear(wx0 - fs - 270, sd); c0 <= wx1 - fs + 270; c0 += 270) {
      const c = c0 + fs; const y = -74; const glow = 0.5 + 0.5 * Math.sin(t * 3 + c);
      g.globalAlpha = 0.25 * glow; P.disc(c, y, 7 + 3 / s, '#ff6a2a'); g.globalAlpha = 1; P.rect(c - 5, y - 1, 10, 2, glow > 0.5 ? '#ffb347' : '#ff6a2a');
      for (let q = 0; q < 5; q += 1) { const ph = (t * 0.25 + q / 5) % 1; g.globalAlpha = (1 - ph) * 0.45; P.disc(c + Math.sin(ph * 5 + q) * 6, y - ph * 90, 3 + ph * 9, '#6a5a60'); }
      g.globalAlpha = 1;
    }
    each(80, (x, i) => { if (Math.sin(t * 2 + i * 1.7) > 0.2) P.rect(x, -1, 9, 1, '#ffb347'); });
  } else if (name === 'fungal') {
    each(58, (x, i) => { if (Math.sin(t * 1.5 + i) > -0.2) { g.globalAlpha = 0.25; P.disc(x, -8, 5, '#b0ffd8'); g.globalAlpha = 1; } });
  } else if (name === 'shimmer') {
    g.fillStyle = 'rgba(255,255,255,0.14)'; const hy = P.Y(0);
    for (let i = 0; i < 4; i += 1) g.fillRect(0, Math.round(hy - (3 + i * 2) * s + Math.sin(t * 3 + i) * 1.2 * s), P.view.w, Math.max(1, Math.round(s)));
  } else if (name === 'glitch') {
    each(120, (x, i) => { if (Math.sin(t * 3 + i * 2.1) > 0.6) P.rect(x, -20 - h01(i, sd) * 50, 3, 2, i % 2 ? '#ff5ec4' : '#7ad1ff'); });
  }
}
