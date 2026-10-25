/* Skylines, ground decor and animated overlays for the 30 newer landscapes (the first nine are drawn directly in scene.js).
 * Each landscape is a small spec: how its far and near ridges are built, what litters the ground, and an optional overlay. */
import { lerp, pR, pL, pD, pB, hexMix, sh, oreSprite, pS, PXC } from './sprites.js';

const h01 = (i, sd) => { let h = Math.imul((i | 0) ^ (sd | 0), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16; return (h >>> 0) / 4294967295; };
const vn = (x, sd) => { const i = Math.floor(x); const f = x - i; const u = f * f * (3 - 2 * f); return lerp(h01(i, sd), h01(i + 1, sd), u); };

const AUTUMN = ['#c8602a', '#d8902a', '#a8402a', '#e0b030'];
const roll = (a, f, b) => ({ k: 'roll', a, f, b });
const cells = (shape, cell, h, extra = {}) => ({ k: 'cells', shape, cell, h, ...extra });

export const SPEC = {
  forest: { far: roll(12, 0.009, 30), near: cells('round', 34, [22, 46], { gap: 0.1 }), decor: [['round', 3], ['tuft', 3], ['rock', 1], ['flower', 1], ['bush', 2]] },
  jungle: { far: roll(18, 0.012, 38), near: cells('round', 40, [34, 70], { span: 1.1 }), decor: [['fern', 4], ['bush', 2], ['flower', 2], ['round', 2]] },
  savanna: { far: roll(8, 0.006, 14), near: cells('acacia', 80, [14, 28], { gap: 0.2 }), decor: [['acacia', 1], ['tuft', 5], ['rock', 1], ['bone', 0.3]] },
  tundra: { far: roll(6, 0.007, 12), near: { k: 'flat', b: 4, a: 3 }, decor: [['snow', 3], ['rock', 2], ['tuft', 1]] },
  taiga: { far: roll(9, 0.01, 26), near: cells('conifer', 22, [26, 54]), decor: [['conifer', 4], ['snow', 2], ['rock', 1]] },
  prairie: { far: roll(9, 0.006, 22), near: roll(4, 0.014, 8), decor: [['tuft', 4], ['flower', 4], ['rock', 0.5]] },
  alpine: { far: { k: 'peak', a: 92, f: 0.02, b: 40, cap: true }, near: { k: 'peak', a: 50, f: 0.035, b: 20, cap: true }, decor: [['rock', 3], ['snow', 2], ['conifer', 1]] },
  islands: { far: cells('dome', 130, [14, 32], { gap: 0.25 }), near: cells('palm', 95, [10, 18], { gap: 0.45 }), water: { d: 10 }, decor: [['palm', 2], ['tuft', 3], ['rock', 1], ['shell', 1]] },
  coast: { far: { k: 'steps', a: 46, f: 0.007, b: 22, q: 4 }, near: roll(5, 0.013, 8), water: { d: 8, from: 300 }, stripes: true, decor: [['tuft', 3], ['rock', 3], ['shell', 1]] },
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
    case 'bush': return { h: Math.sqrt(Math.max(0, 1 - a * a)) * H + 2, cap: true };
    case 'dome': return { h: Math.sqrt(Math.max(0, 1 - a * a)) * H + 2, cap: true };
    case 'hive': return { h: a < 1 ? Math.floor(Math.sqrt(Math.max(0, 1 - a * a)) * 5) / 5 * H + 2 : 3, cap: true };
    case 'slab': return a < w ? { h: H } : { h: 3 };
    case 'tentacle': { const k = Math.max(0, 1 - a * 1.5 + Math.sin((wx + idx * 13) * 0.35) * 0.08); return { h: H * Math.pow(k, 1.25) + 3, cap: k > 0.82 }; }
    case 'ribs': return a < 0.95 ? (() => { const h = Math.sin((1 - a) * Math.PI * 0.5) * H; return { h, lo: Math.max(0, h - 5) }; })() : { h: 3 };
    case 'arch': return a < 0.85 ? (a > 0.5 ? { h: H } : { h: H, lo: H - 9 }) : { h: 3 };
    case 'bone': return a < 0.3 ? { h: H * (1 - a / 0.3 * 0.9) } : { h: 3 };
    case 'shard': return a < 0.9 ? { h: Math.max(3, H * (1 - a)), cap: a < 0.2 } : { h: 3 };
    case 'eye': {
      if (a < 0.08) return { h: H, trunk: true };
      if (a < 0.3) return { h: H + Math.sqrt(1 - (a / 0.3) ** 2) * H * 0.2, lo: H * 0.9, ball: true };
      return { h: 3 };
    }
    case 'float': {
      const fl = Ly.float[0] + h01(idx + 7, sd) * (Ly.float[1] - Ly.float[0]);
      return a < 1 ? { h: fl + H * (1 - a * a), lo: fl, cap: true } : { h: 2 };
    }
    default: return { h: H };
  }
}

export function ridgeLayer(Ly, wx, sd, planet) {
  switch (Ly.k) {
    case 'none': return { h: 0 };
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
      if (Ly.col) r.c = Ly.col[idx % Ly.col.length];
      else if (Ly.shape === 'slab' || Ly.shape === 'hive') r.c = null;
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

/* ---------- ground decor ---------- */
const leafOf = (region) => sh(region.biome, 0.12);
const DK = {
  tuft: (x, gc, R0) => { for (let k = 0; k < 3; k += 1) pR(x + k * 2, -3 - (k % 2), 1, 3 + (k % 2), sh(gc, 0.2)); },
  flower: (x, gc, R0, pl) => { pR(x, -5, 1, 5, '#3a6a2a'); const o = pl.ores[Math.floor(R0() * pl.ores.length)]; pR(x - 1, -7, 3, 2, o.color); pR(x, -6, 1, 1, '#fff6c0'); },
  rock: (x, gc) => { pR(x, -3, 6, 3, sh(gc, -0.3)); pR(x + 1, -5, 3, 2, sh(gc, -0.15)); pR(x + 3, -4, 2, 1, sh(gc, 0.1)); },
  conifer: (x, gc, R0, pl, region) => { const h = 12 + Math.floor(R0() * 12); pR(x, -3, 2, 3, '#3a2818'); for (let q = 0; q < h; q += 1) { const w = (h - q) * 0.32 + 0.4; pR(x + 1 - w, -q - 3, w * 2, 1, q % 5 === 0 ? sh(leafOf(region), -0.2) : sh(leafOf(region), -0.1)); } },
  round: (x, gc, R0, pl, region) => { const h = 9 + Math.floor(R0() * 8); pR(x, -h * 0.5, 2, h * 0.5, '#4a3220'); for (let q = 0; q < h * 0.7; q += 1) { const t = q / (h * 0.7); const w = Math.sqrt(Math.max(0, 1 - (t * 2 - 1) ** 2)) * (h * 0.45) + 1; pR(x + 1 - w, -h * 0.45 - q, w * 2, 1, q % 4 === 0 ? sh(leafOf(region), -0.15) : leafOf(region)); } },
  palm: (x, gc, R0) => { const h = 12 + Math.floor(R0() * 10); for (let q = 0; q < h; q += 1) pR(x + Math.floor(q * 0.12), -q - 2, 2, 1, '#7a5a3a'); const cx = x + Math.floor(h * 0.12); pL(cx + 1, -h - 2, cx - 9, -h + 3, '#3a8a3a', 2); pL(cx + 1, -h - 2, cx + 11, -h + 3, '#3a8a3a', 2); pL(cx + 1, -h - 2, cx + 1, -h - 8, '#4a9a44', 2); },
  acacia: (x, gc, R0) => { const h = 10 + Math.floor(R0() * 8); pR(x, -h, 2, h, '#5a3e24'); pR(x - 8, -h - 3, 18, 3, '#4a7a34'); pR(x - 5, -h - 5, 12, 2, '#5a8a3c'); },
  dead: (x) => { pR(x, -14, 2, 14, '#3a2a22'); pL(x + 1, -10, x + 6, -16, '#3a2a22', 1); pL(x + 1, -7, x - 4, -13, '#3a2a22', 1); },
  bush: (x, gc, R0, pl, region) => { pR(x - 4, -4, 9, 4, sh(leafOf(region), -0.2)); pR(x - 2, -6, 6, 2, leafOf(region)); },
  fern: (x, gc, R0, pl, region) => { for (let k = -2; k <= 2; k += 1) pL(x, 0, x + k * 3, -7 + Math.abs(k), sh(leafOf(region), 0.05), 1); },
  pond: (x) => { pR(x, -1, 20, 1, '#2a6a8a'); pR(x + 3, -1, 6, 1, '#6ad0e8'); },
  snow: (x, gc, R0) => { const h = 4 + Math.floor(R0() * 5); for (let q = 0; q < h; q += 1) { const w = (h - q) * 1.5 + 1; pR(x - w, -q - 1, w * 2, 1, q % 3 === 0 ? '#d4e6f2' : '#f4fbff'); } },
  bone: (x, gc, R0) => { const h = 5 + Math.floor(R0() * 8); pR(x, -h, 2, h, '#e8e0cc'); pR(x - 1, -h - 1, 4, 2, '#e8e0cc'); pR(x + 4, -3, 6, 2, '#d8d0bc'); },
  shard: (x, gc, R0, pl) => { const h = 6 + Math.floor(R0() * 12); for (let q = 0; q < h; q += 1) pR(x - (h - q) * 0.25, -q - 1, (h - q) * 0.5 + 1, 1, q < 3 ? '#eaf6ff' : '#b8d8ee'); },
  gear: (x, gc, R0) => { const r = 4 + Math.floor(R0() * 4); pR(x - r, -r * 2, r * 2, r * 2, '#6a6a76'); pR(x - r + 1, -r * 2 + 1, r * 2 - 2, r * 2 - 2, '#8a8a96'); pR(x - 1, -r - 1, 2, 2, '#3a3a44'); for (let k = 0; k < 4; k += 1) pR(x - r - 1 + k * 3, -r * 2 - 1, 2, 1, '#6a6a76'); },
  eye: (x, gc, R0) => { const h = 6 + Math.floor(R0() * 8); pR(x, -h, 1, h, '#5a2a6a'); pD(x + 0.5, -h - 2, 3, '#f0f0e8'); pR(x, -h - 3, 2, 2, '#1a1022'); },
  neon: (x, gc, R0, pl) => { const o = pl.ores[Math.floor(R0() * pl.ores.length)]; const h = 8 + Math.floor(R0() * 12); pR(x, -h, 2, h, '#1a1428'); pR(x, -h, 1, h, o.color); },
  comb: (x) => { for (let q = 0; q < 3; q += 1) for (let k = 0; k <= 2 - q; k += 1) pR(x + k * 4 + q * 2, -q * 3 - 3, 3, 3, q % 2 ? '#d89a2a' : '#b87a1c'); },
  tent: (x, gc, R0) => { const h = 8 + Math.floor(R0() * 10); for (let q = 0; q < h; q += 1) pR(x + Math.round(Math.sin(q * 0.5) * 2), -q - 1, 2, 1, q > h - 3 ? '#ff7ac0' : '#a82e7a'); },
  mono: (x, gc, R0) => { const h = 8 + Math.floor(R0() * 12); pR(x, -h, 4, h, '#14121e'); pR(x, -h, 1, h, '#3a3a52'); },
  mushroom: (x, gc, R0) => { const h = 4 + Math.floor(R0() * 7); pR(x, -h, 2, h, '#d8c8b8'); pR(x - 3, -h - 3, 8, 3, '#ff9fd0'); pR(x - 1, -h - 2, 1, 1, '#fff'); },
  crystal: (x, gc, R0, pl) => { const o = pl.ores[Math.floor(R0() * pl.ores.length)]; const im = oreSprite(o.color, 'crystal', 4 + Math.floor(R0() * 3), Math.floor(R0() * 99)); pS(im, x, 2, im.width / 2, im.height - 1, false); },
  vent: (x) => { pR(x - 5, -3, 10, 3, '#8a7a5a'); pR(x - 3, -5, 6, 2, '#a89874'); pR(x - 1, -5, 2, 1, '#3a2a1a'); },
  rice: (x, gc, R0) => { pR(x, -1, 22, 1, '#7ac0d0'); for (let k = 0; k < 6; k += 1) pR(x + 2 + k * 3, -3, 1, 2, '#5ab048'); },
  reed: (x) => { for (let k = 0; k < 3; k += 1) pR(x + k * 2, -6 - (k % 2) * 3, 1, 6 + (k % 2) * 3, '#5a7a3a'); pR(x + 1, -9, 1, 2, '#6a4a2a'); },
  ripple: (x, gc) => { pR(x, -1, 12, 1, sh(gc, 0.2)); pR(x + 3, -2, 5, 1, sh(gc, 0.1)); },
  crack: (x, gc) => { pL(x, 0, x + 4, -1, sh(gc, -0.35), 1); pL(x + 4, -1, x + 7, 0, sh(gc, -0.35), 1); },
  heather: (x, gc, R0, pl, region) => { for (let k = 0; k < 4; k += 1) { pR(x + k * 2, -3 - (k % 2), 1, 3, '#4a3a5a'); pR(x + k * 2, -4 - (k % 2), 1, 1, '#b07ad0'); } },
  stump: (x) => { pR(x, -5, 6, 5, '#5a3a26'); pR(x, -5, 6, 1, '#8a6a46'); },
  shell: (x) => { pR(x, -2, 4, 2, '#f4e4d4'); pR(x + 1, -3, 2, 1, '#fff4e8'); },
  leaf: (x, gc, R0) => { pR(x, -1, 3, 1, AUTUMN[Math.floor(R0() * AUTUMN.length)]); pR(x + 4, -2, 2, 1, AUTUMN[Math.floor(R0() * AUTUMN.length)]); },
  spire: (x, gc, R0) => { const h = 10 + Math.floor(R0() * 14); pR(x, -h, 5, h, sh(gc, -0.2)); pR(x - 2, -h, 9, 3, sh(gc, -0.05)); pR(x, -h, 1, h, sh(gc, 0.1)); },
};

export function drawDecor(spec, x, gc, R0, planet, region) {
  const total = spec.decor.reduce((n, d) => n + d[1], 0); let r = R0() * total;
  for (const [kind, w] of spec.decor) { r -= w; if (r <= 0) { if (DK[kind]) DK[kind](x, gc, R0, planet, region); return; } }
}

/* ---------- animated overlays ---------- */
export function drawOverlay(name, o) {
  const { t, sd, planet, spec, wx0, wx1, g } = o;
  if (name === 'falls') {
    for (let i = 0; i < 3; i += 1) {
      const x = 90 + h01(i + 5, sd) * 380; const far = ridgeLayer(spec.far, x, sd, planet); const H = far.h;
      pR(x - 1, -H, 3, H, '#e8f6ff');
      for (let q = 0; q < H; q += 4) { const k = (q + t * 24) % 8 < 4; if (k) pR(x - 1, -q - 2, 3, 2, '#9ad0ea'); }
      g.globalAlpha = 0.35; pD((x) * PXC.s + PXC.ox, 0 * PXC.s + PXC.oy, 7 * PXC.s + 2, '#e8f6ff', g, true); g.globalAlpha = 1;
    }
  } else if (name === 'geysers') {
    for (let i = 0; i < 3; i += 1) {
      const x = 110 + i * 190 + h01(i, sd) * 40; const ph = (t * 0.22 + i * 0.37) % 1;
      if (ph < 0.55) { const k = ph / 0.55; for (let q = 0; q < 9; q += 1) { const u = q / 9; g.globalAlpha = (1 - u) * 0.6 * Math.sin(k * Math.PI); pD((x + Math.sin(u * 4 + t) * (2 + u * 8)) * PXC.s + PXC.ox, (-u * 70 * Math.sin(k * Math.PI) - 4) * PXC.s + PXC.oy, (2 + u * 7) * PXC.s + 1, '#f4f4f4', g, true); } g.globalAlpha = 1; }
    }
  } else if (name === 'rifts') {
    for (let i = 0; i < 2; i += 1) {
      const x = 130 + i * 300 + h01(i, sd) * 80; const flick = 0.5 + 0.5 * Math.sin(t * 5 + i * 2); const col = planet.ores[(sd + i) % 7].color;
      let px = x; let py = -150;
      for (let q = 0; q < 14; q += 1) { const nx = x + (h01(q + i * 20, sd) - 0.5) * 20; const ny = py + 8; g.globalAlpha = 0.5 + 0.5 * flick; pL(px, py, nx, ny, '#ffffff', 1); g.globalAlpha = 0.25 * flick; pL(px, py, nx, ny, col, 4); g.globalAlpha = 1; px = nx; py = ny; }
    }
  } else if (name === 'scrap') {
    for (let i = 0; i < 4; i += 1) {
      const x = 60 + i * 150 + h01(i, sd) * 40;
      for (let q = 0; q < 6; q += 1) { const ph = (t * 0.6 + q / 6 + i * 0.2) % 1; g.globalAlpha = 1 - ph; pR(x + Math.sin(ph * 9 + q) * 6, -ph * 46 - 6, 1, 1, ph < 0.4 ? '#ffd23f' : '#ff8a3d'); }
      g.globalAlpha = 1;
      for (let q = 0; q < 4; q += 1) { const ph = (t * 0.2 + q / 4 + i * 0.3) % 1; g.globalAlpha = (1 - ph) * 0.4; pD((x + ph * 12) * PXC.s + PXC.ox, (-30 - ph * 60) * PXC.s + PXC.oy, (3 + ph * 8) * PXC.s + 1, '#5a5a60', g, true); }
      g.globalAlpha = 1;
    }
  } else if (name === 'watch') {
    for (const Ly of [spec.far, spec.near]) {
      for (const c of layerCells(Ly, sd, wx0, wx1)) {
        const gaze = Math.sin(t * 0.8 + c.idx) * 2; const blink = Math.sin(t * 0.7 + c.idx * 1.9) > 0.97;
        const by0 = -(c.H * 1.05); if (blink) pR(c.cen - 3, by0, 6, 1, '#7a3a8a'); else { pR(c.cen + gaze - 1, by0 - 1, 3, 3, '#1a1022'); pR(c.cen + gaze, by0 - 1, 1, 1, '#ff3d3d'); }
      }
    }
  }
}

export function overlayFor(spec) { return spec && spec.over; }
export function isWater(spec) { return spec && spec.water; }
export function waterColor(planet) { return hexMix('#2a6a9a', planet.sky[1], 0.3); }
export { h01 };
export const hexOf = hexMix;
