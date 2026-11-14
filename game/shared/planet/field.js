/* Painted planet (Phase 3.5): hidden continuous fields sampled anywhere on a 0..1000 square map.
 * Pure and seeded. planet.field stores only seeds, thresholds and region centres (no rasters).
 *
 *   buildField(seed, regions, ores) -> sites[]   (mutates regions: x, y, common, soil, tough, temperature, neighbors; returns the field as sites.field)
 *   sampleSpot(planet, x, y)        -> { x, y, regionId, height, temperature, moisture, climate, terrain, soil, tough, common, richness, veinSize, score }
 *   startSpot(planet, taken, seed)  -> spot | null     spotOK(planet, x, y, taken) -> { ok, reason }
 *   territoryAt(planet, x, y)       -> null            (Phase 5 hook)
 *   fieldAt(field, x, y)            -> raw climate numbers (used by the renderer) */
import { hash, rng, clamp, pick } from './util.js';
import { TERRAINS } from './terrains.js';

export const MIN_SITE_GAP = 44;
export const RARE_P = 0.37;
export const MYTHIC_SHARE = 0.05;
const SEA_SHARE = 0.4; const TOUGH_SHARE = 0.3;
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/* ---------- noise ---------- */
const gh = (ix, iy, s) => { let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 2246822519); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const GX = [1, -1, 1, -1, 0.7071, -0.7071, 0.7071, -0.7071]; const GY = [1, 1, -1, -1, 0.7071, 0.7071, -0.7071, -0.7071];
function perlin(x, y, s) {
  const x0 = Math.floor(x); const y0 = Math.floor(y); const fx = x - x0; const fy = y - y0;
  const d = (ix, iy, dx, dy) => { const k = gh(ix, iy, s) & 7; return GX[k] * dx + GY[k] * dy; };
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10); const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = d(x0, y0, fx, fy) + u * (d(x0 + 1, y0, fx - 1, fy) - d(x0, y0, fx, fy));
  const b = d(x0, y0 + 1, fx, fy - 1) + u * (d(x0 + 1, y0 + 1, fx - 1, fy - 1) - d(x0, y0 + 1, fx, fy - 1));
  return a + v * (b - a);
}
/* fractal noise, roughly 0..1 centred on 0.5 */
function fbm(x, y, s, oct) {
  let sum = 0; let amp = 1; let tot = 0; let f = 1;
  for (let i = 0; i < oct; i += 1) { sum += amp * perlin(x * f + i * 17.3, y * f - i * 9.1, s + i); tot += amp; amp *= 0.5; f *= 2; }
  return clamp(0.5 + (sum / tot) * 0.95, 0, 1);
}

/* ---------- climate profile of each terrain: [temperature -1..1, moisture 0..1, elevation 0..1]; alien ones fit anywhere ---------- */
const PROFILE = {
  glacier: [-0.95, 0.5, 0.7], tundra: [-0.75, 0.35, 0.3], taiga: [-0.5, 0.65, 0.35], alpine: [-0.45, 0.4, 0.95], mirror: [-0.2, 0.1, 0.2], moor: [-0.25, 0.7, 0.4],
  skyislands: [-0.2, 0.5, 0.9], redwoods: [-0.05, 0.85, 0.4], falls: [0, 0.8, 0.6], lakes: [-0.05, 0.8, 0.1], forest: [0, 0.65, 0.35], autumn: [0.05, 0.6, 0.35], prairie: [0.1, 0.4, 0.2],
  terraces: [0.25, 0.7, 0.5], coast: [0.1, 0.6, 0.05], islands: [0.35, 0.8, 0.02], swamp: [0.3, 0.95, 0.03], jungle: [0.55, 0.9, 0.2], savanna: [0.5, 0.35, 0.15], scrub: [0.5, 0.2, 0.25],
  dunes: [0.85, 0.05, 0.15], oasis: [0.65, 0.2, 0.1], saltflat: [0.6, 0.05, 0.05], badlands: [0.6, 0.1, 0.5], canyon: [0.55, 0.12, 0.6], mesa: [0.55, 0.15, 0.55], arches: [0.6, 0.1, 0.5],
  geysers: [0.7, 0.5, 0.45], volcanic: [0.95, 0.3, 0.85], scrapyard: [0.3, 0.3, 0.3], ruins: [0.2, 0.4, 0.2], hive: [0.4, 0.5, 0.3], tendrils: [0.35, 0.8, 0.2],
};
const TOUGH_T = new Set(['volcanic', 'alpine', 'canyon', 'crystal', 'badlands', 'monoliths', 'glacier', 'mesa', 'rifts']);

export function regionCountFor(seed) { return 12 + Math.floor(rng(hash(`rcount:${seed}`))() * 7); }

/* ---------- raw field ---------- */
/* F = { seed, sea, g (global temp/moisture bias), nz: noise seeds, centres, thresholds ... } */
function rawHeight(F, x, y) {
  const px = x / 1000; const py = y / 1000; const s = F.s;
  const wx = (fbm(px * 2 + F.o[0], py * 2 + F.o[1], s + 1, 3) - 0.5) * 0.34; const wy = (fbm(px * 2 + F.o[2], py * 2 + F.o[3], s + 2, 3) - 0.5) * 0.34;
  const qx = px + wx; const qy = py + wy;
  const base = fbm(qx * 3.2 + F.o[4], qy * 3.2 + F.o[5], s + 3, 6);
  const d = Math.hypot(qx - 0.5, qy - 0.5) + (fbm(px * 1.6 + F.o[6], py * 1.6 + F.o[7], s + 4, 3) - 0.5) * 0.3;
  const env = 1 - sstep(0.2, 0.5, d);
  const m = fbm(qx * 2.2 + F.o[8], qy * 2.2 + F.o[9], s + 5, 3);
  const ridge = 1 - Math.abs(2 * fbm(qx * 3 + F.o[10], qy * 3 + F.o[11], s + 6, 3) - 1);
  return { h: 0.42 * base + 0.4 * env + 0.22 * ridge * ridge * sstep(0.4, 0.62, m) * (0.4 + env), ridge: ridge * ridge, qx, qy };
}

export function fieldAt(F, x, y) {
  const r = rawHeight(F, x, y); const h = r.h;
  const e = clamp((h - F.sea) / (F.top - F.sea), 0, 1.2);
  let water = h <= F.sea;
  if (!water && F.dr) for (const d of F.dr) if ((x - d[0]) ** 2 + (y - d[1]) ** 2 < d[2] * d[2]) { water = true; break; }
  const lat = Math.abs(y - 500) / 500;
  const tn = fbm(r.qx * 2 + F.o[12], r.qy * 2 + F.o[13], F.s + 7, 3);
  const temperature = clamp(0.95 - 1.5 * lat ** 1.2 - 0.85 * Math.min(1, e) + 0.3 * (tn - 0.5) + F.gt, -1, 1);
  const mn = fbm(r.qx * 2.6 + F.o[14], r.qy * 2.6 + F.o[15], F.s + 8, 4);
  const moisture = clamp(0.2 + 0.62 * mn + 0.2 * (1 - Math.min(1, e)) + 0.14 * Math.cos(lat * Math.PI * 1.7) + F.gm - 0.12, 0, 1);
  const rugged = r.ridge * (0.45 + 0.55 * clamp(e, 0, 1));
  const T = 0.5 * Math.min(1, e) + 0.5 * rugged;
  return { h, e, water, temperature, moisture, rugged, T, qx: r.qx, qy: r.qy };
}

/* climate class: derived from temperature, moisture, elevation */
export function climateOf(f) {
  if (f.water) return 'water';
  const { temperature: t, moisture: m, e } = f;
  if (t < -0.55) return e > 0.6 ? 'glacier' : 'ice';
  if (e > 0.62) return t < 0 ? 'alpine' : (m < 0.4 ? 'badlands' : 'highland');
  if (t < -0.2) return m > 0.5 ? 'taiga' : 'tundra';
  if (m > 0.86 && e < 0.2) return 'wetland';
  if (t < 0.25) return m < 0.3 ? 'steppe' : m < 0.55 ? 'grassland' : 'forest';
  return m < 0.25 ? 'desert' : m < 0.45 ? 'savanna' : m < 0.7 ? 'woodland' : 'jungle';
}

/* nearest region in a mix of place and climate: gives organic, climate-following borders */
function regionDist(F, f, x, y, i) {
  const c = F.c[i];
  return ((x - c[0]) ** 2 + (y - c[1]) ** 2) / (300 * 300) + F.wc * ((f.temperature - c[2]) ** 2 + (f.moisture - c[3]) ** 2 + (Math.min(1, f.e) - c[4]) ** 2);
}
export function regionWeights(F, f, x, y) {
  const d = F.c.map((_, i) => regionDist(F, f, x, y, i)); return d;
}
function nearestRegion(F, f, x, y) { let b = 0; let bd = Infinity; for (let i = 0; i < F.c.length; i += 1) { const d = regionDist(F, f, x, y, i); if (d < bd) { bd = d; b = i; } } return b; }

/* patches: a few discs of very different radii merged, edges wobbled by noise. inside when v > cfg.b; v - b gives soft edges */
const patchV = (F, f, x, y, cfg) => {
  let v = -9; for (const d of cfg.d) v = Math.max(v, 1 - Math.hypot(x - d[0], y - d[1]) / d[2]);
  return v + 0.24 * (fbm(f.qx * 2 + F.p[cfg.k][0], f.qy * 2 + F.p[cfg.k][1], F.s + 40 + cfg.k, 2) - 0.5) * 2;
};
const veinN = (F, f, k) => clamp(0.5 + (fbm(f.qx * 5 + F.p[6 + k][0], f.qy * 5 + F.p[6 + k][1], F.s + 60 + k, 2) - 0.5) * 2.2, 0, 1);

/* ---------- build ---------- */
const LAND_GRID = 64; const FINE = 100;
function landSamples(F, G = LAND_GRID) {
  const out = [];
  for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) {
    const x = (i + 0.5) * (1000 / G); const y = (j + 0.5) * (1000 / G);
    const f = fieldAt(F, x, y); if (!f.water) out.push({ x, y, f, gi: j * G + i, ci: out.length });
  }
  return out;
}

/* sizes of connected pieces (8-neighbour) of cells where on[i] is true; cells are indexed j*GRID+i */
function pieces(on, GRID = LAND_GRID) {
  const seen = new Uint8Array(on.length); const out = [];
  for (let s0 = 0; s0 < on.length; s0 += 1) {
    if (!on[s0] || seen[s0]) continue;
    let n = 0; const st = [s0]; seen[s0] = 1;
    while (st.length) {
      const c = st.pop(); n += 1; const ci = c % GRID; const cj = (c - ci) / GRID;
      for (let dj = -1; dj <= 1; dj += 1) for (let di = -1; di <= 1; di += 1) {
        const ii = ci + di; const jj = cj + dj; if (ii < 0 || jj < 0 || ii >= GRID || jj >= GRID) continue;
        const k = jj * GRID + ii; if (on[k] && !seen[k]) { seen[k] = 1; st.push(k); }
      }
    }
    out.push(n);
  }
  return out;
}
/* find a patch config covering `want` of the eligible cells where every piece is >= minFrac of all land (and of the rest too when both: common ores) */
function genPatch(F, R, cs, k, want, minFrac, { eligible = null, both = false, fine = null, rmin = 130, rmax = 470, maxd = 4, planar = false } = {}) {
  const N = cs.length; const pool = eligible || cs; const minN = minFrac * N * 1.12; let best = null; let bestBad = Infinity;
  const total = pool.length;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const nd = 1 + Math.floor(R() * maxd); const d = [];
    for (let i = 0; i < nd; i += 1) { const c = pool[Math.floor(R() * pool.length)]; d.push([Math.round(c.x), Math.round(c.y), Math.round(rmin * Math.exp(R() * Math.log(rmax / rmin)))]); }
    if (planar && attempt % 2 === 0) { const a = R() * Math.PI * 2; const off = (R() - 0.5) * 300; d.length = 0; d.push([Math.round(500 + Math.cos(a) * (3000 + off)), Math.round(500 + Math.sin(a) * (3000 + off)), 3000]); }
    const cfg = { k, d, b: 0 };
    const v = cs.map((s) => patchV(F, s.f, s.x, s.y, cfg));
    const pv = (eligible ? eligible.map((s) => v[s.ci]) : v).slice().sort((a, b2) => b2 - a);
    cfg.b = r4(pv[clamp(Math.round(want * total), 0, total - 1)]);
    const on = new Uint8Array(LAND_GRID * LAND_GRID); const off = new Uint8Array(LAND_GRID * LAND_GRID);
    cs.forEach((s, i) => { if (eligible && !s.elig) return; if (v[i] > cfg.b) on[s.gi] = 1; else if (!eligible) off[s.gi] = 1; });
    const sizes = pieces(on).concat(both ? pieces(off) : []);
    const bad = sizes.filter((n) => n < minN).reduce((t, n) => t + (minN - n), 0);
    let fbad = 0;
    if (bad === 0 && fine) {
      for (const [fg, G2] of fine) {
        if (fbad) break;
        const on2 = new Uint8Array(G2 * G2); const off2 = new Uint8Array(G2 * G2);
        for (const s of fg) { if (eligible && !s.elig) continue; if (patchV(F, s.f, s.x, s.y, cfg) > cfg.b) on2[s.gi] = 1; else if (!eligible) off2[s.gi] = 1; }
        const minF = minFrac * fg.length * 0.95;
        fbad = pieces(on2, G2).concat(both ? pieces(off2, G2) : []).filter((n) => n < minF).reduce((t, n) => t + (minF - n), 0);
      }
    }
    if (bad + fbad < bestBad) { bestBad = bad + fbad; best = cfg; }
    if (bad + fbad === 0) break;
  }
  return best;
}

/* tiny separate islands are drowned (stored as a few discs) so every landmass is big enough to hold an ore patch */
function drownIslets(F) {
  F.dr = [];
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const G of [100, 64, 50, 80, 40]) {
      const u = 1000 / G; const on = new Uint8Array(G * G); let total = 0;
      for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) if (!fieldAt(F, (i + 0.5) * u, (j + 0.5) * u).water) { on[j * G + i] = 1; total += 1; }
      const seen = new Uint8Array(on.length);
      for (let s0 = 0; s0 < on.length; s0 += 1) {
        if (!on[s0] || seen[s0]) continue;
        const cells = []; const st = [s0]; seen[s0] = 1;
        while (st.length) {
          const c = st.pop(); cells.push(c); const ci = c % G; const cj = (c - ci) / G;
          for (let dj = -1; dj <= 1; dj += 1) for (let di = -1; di <= 1; di += 1) { const ii = ci + di; const jj = cj + dj; if (ii < 0 || jj < 0 || ii >= G || jj >= G) continue; const k = jj * G + ii; if (on[k] && !seen[k]) { seen[k] = 1; st.push(k); } }
        }
        if (cells.length < 0.07 * total) {
          const mx = cells.reduce((t, c) => t + (c % G), 0) / cells.length; const my = cells.reduce((t, c) => t + Math.floor(c / G), 0) / cells.length;
          const r = Math.max(...cells.map((c) => Math.hypot((c % G) - mx, Math.floor(c / G) - my))) * u + 1.5 * u + 12;
          F.dr.push([Math.round((mx + 0.5) * u), Math.round((my + 0.5) * u), Math.round(r)]); changed = true;
        }
      }
    }
    if (!changed) break;
  }
}
const quant = (arr, q) => { const a = arr.slice().sort((p, r) => p - r); return a[clamp(Math.floor(q * a.length), 0, a.length - 1)]; };

const SITE_WORDS = ['Strike', 'Outcrop', 'Seam', 'Claim', 'Bluff', 'Hollow', 'Rise', 'Pit', 'Ledge', 'Drift', 'Knoll', 'Scar', 'Vent', 'Shelf', 'Gap', 'Spur', 'Pocket', 'Lode'];

export function buildField(seed, regions, ores) {
  const R = rng(hash(`field:${seed}`));
  const F = { s: hash(`fs:${seed}`) & 0xffff, o: Array.from({ length: 16 }, () => +(R() * 200).toFixed(2)), sea: 0.5, top: 1, gt: 0, gm: 0, wc: 0.55, c: [], p: Array.from({ length: 14 }, () => [+(R() * 200).toFixed(2), +(R() * 200).toFixed(2)]), thr: {} };
  // planet-wide climate lean from the regions' landscapes
  const prof = regions.map((r) => PROFILE[r.terrain]).filter(Boolean);
  if (prof.length) { F.gt = r4(clamp(0.5 * prof.reduce((t, p) => t + p[0], 0) / prof.length, -0.3, 0.3)); F.gm = r4(clamp(0.4 * (prof.reduce((t, p) => t + p[1], 0) / prof.length - 0.5), -0.15, 0.15)); }
  // sea level and peak height from a coarse grid
  const hs = []; for (let j = 0; j < 40; j += 1) for (let i = 0; i < 40; i += 1) hs.push(rawHeight(F, (i + 0.5) * 25, (j + 0.5) * 25).h);
  F.sea = r4(quant(hs, SEA_SHARE)); F.top = r4(quant(hs, 0.985));
  drownIslets(F);
  const land = landSamples(F);
  // region centres: spread over land, each terrain on the land that best fits it
  const n = regions.length; const cand = land.filter((s) => s.f.e > 0.04 && !fieldAt(F, Math.round(s.x), Math.round(s.y)).water).map((s) => ({ x: s.x, y: s.y, t: s.f.temperature, m: s.f.moisture, e: Math.min(1, s.f.e) }));
  const order = regions.map((r, i) => i).sort((a, b) => (PROFILE[regions[b].terrain] ? 1 : 0) - (PROFILE[regions[a].terrain] ? 1 : 0));
  const placed = []; const centres = new Array(n);
  for (const i of order) {
    const p = PROFILE[regions[i].terrain]; let best = null; let bs = Infinity;
    for (let k = 0; k < 160; k += 1) {
      const c = cand[Math.floor(R() * cand.length)];
      const gap = placed.length ? Math.min(...placed.map((q) => Math.hypot(q.x - c.x, q.y - c.y))) : 999;
      const fit = p ? (c.t - p[0]) ** 2 * 1.2 + (c.m - p[1]) ** 2 + (c.e - p[2]) ** 2 * 0.8 : R() * 0.5;
      const score = fit + Math.max(0, 170 - gap) / 60 + R() * 0.12;
      if (score < bs) { bs = score; best = c; }
    }
    placed.push(best); centres[i] = best;
  }
  centres.forEach((c, i) => { regions[i].x = Math.round(c.x); regions[i].y = Math.round(c.y); });
  F.c = centres.map((c) => [Math.round(c.x), Math.round(c.y), r2(c.t), r2(c.m), r2(c.e)]);
  // calibrate the hidden fields on land
  const cs = land.map((s) => ({ ...s, ri: nearestRegion(F, s.f, s.x, s.y) }));
  F.thr.tLo = r4(quant(cs.map((s) => s.f.T), 0.05)); F.thr.tHi = r4(quant(cs.map((s) => s.f.T), 0.99));
  F.thr.tough = r4(quant(cs.map((s) => s.f.T), 1 - TOUGH_SHARE));
  F.pc = {}; const fine = [FINE, 50, 80].map((G2) => [landSamples(F, G2), G2]); for (const [fg] of fine) for (const s of fg) s.elig = s.f.T > F.thr.tough;
  F.pc.common = genPatch(F, R, cs, 0, 0.5, 0.06, { both: true, fine, rmin: 250, rmax: 1600, maxd: 2, planar: true });
  for (let i = 0; i < 4; i += 1) F.pc[`r${i}`] = genPatch(F, R, cs, 1 + i, RARE_P, 0.055, { fine });
  const tough = cs.filter((s) => { s.elig = s.f.T > F.thr.tough; return s.elig; });
  F.pc.myth = genPatch(F, R, cs, 5, MYTHIC_SHARE * cs.length / Math.max(1, tough.length), 0.022, { eligible: tough, fine });
  // region metadata
  const acc = regions.map(() => ({ n: 0, soil: 0, tough: 0, temp: 0, c0: 0 }));
  for (const s of cs) {
    const a = acc[s.ri]; a.n += 1; a.soil += soilOf(F, s.f); a.tough += s.f.T > F.thr.tough ? 1 : 0; a.temp += s.f.temperature; a.c0 += patchV(F, s.f, s.x, s.y, F.pc.common) > F.pc.common.b ? 1 : 0;
  }
  const c0 = ores.find((o) => o.tier === 'common'); const c1 = ores.filter((o) => o.tier === 'common')[1] || c0;
  regions.forEach((r, i) => {
    const a = acc[i]; const k = Math.max(1, a.n);
    r.soil = r2(clamp(a.n ? a.soil / k : 1, 0.75, 1.35)); r.tough = a.n ? a.tough / k > 0.5 : TOUGH_T.has(r.terrain); r.temperature = r2(clamp(a.n ? a.temp / k : F.c[i][2], -1, 1));
    r.common = (a.c0 / k > 0.5 ? c1 : c0).id;
  });
  const nb = regions.map(() => new Set()); const G = 80;
  const own = []; for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) { const x = (i + 0.5) * (1000 / G); const y = (j + 0.5) * (1000 / G); const f = fieldAt(F, x, y); own.push(f.water ? -1 : nearestRegion(F, f, x, y)); }
  for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) { const a = own[j * G + i]; if (a < 0) continue; for (const [di, dj] of [[1, 0], [0, 1]]) { if (i + di >= G || j + dj >= G) continue; const b = own[(j + dj) * G + i + di]; if (b >= 0 && b !== a) { nb[a].add(b); nb[b].add(a); } } }
  regions.forEach((r, i) => { r.neighbors = [...nb[i]].map((k) => regions[k].id); });
  // score distribution over ordinary land (needs ores and regions: temporary planet)
  const tmp = { field: F, regions, ores };
  const mythId = ores.find((o) => o.tier === 'mythic')?.id; const sc = [];
  for (const s of cs) { const sp = spotFrom(tmp, s.x, s.y, s.f); if (!(mythId in sp.richness)) sc.push(sp.score); }
  const mean = sc.reduce((t, v) => t + v, 0) / Math.max(1, sc.length); const sd = Math.sqrt(sc.reduce((t, v) => t + (v - mean) ** 2, 0) / Math.max(1, sc.length));
  F.stat = { mean: r4(mean), sd: r4(sd) };
  // legacy site list (the server still reads it until it moves to startSpot): 16 equal starts
  const sites = []; const names = new Set();
  const planetLike = { field: F, regions, ores };
  for (let k = 0; k < 16; k += 1) {
    const sp = startSpot(planetLike, sites, `${seed}:site${k}`); if (!sp) break;
    const reg = regions.find((r) => r.id === sp.regionId); const last = reg.name.split(' ').pop();
    let name = ''; for (let t = 0; t < 8 && (!name || names.has(name)); t += 1) name = `${pick(R, SITE_WORDS)} ${last}`;
    if (names.has(name)) name = `${name} ${k + 1}`; names.add(name);
    sites.push({ id: `s${sp.x}_${sp.y}`, regionId: sp.regionId, name, x: sp.x, y: sp.y, soil: sp.soil, richness: sp.richness, veinSize: sp.veinSize, start: true, score: sp.score });
  }
  sites.field = F;
  return sites;
}

function soilOf(F, f) { return 0.75 + 0.6 * clamp((f.T - F.thr.tLo) / Math.max(1e-6, F.thr.tHi - F.thr.tLo), 0, 1); }

/* ---------- sampling ---------- */
function spotFrom(planet, x, y, f) {
  const F = planet.field; const ores = planet.ores;
  const ri = nearestRegion(F, f, x, y); const region = planet.regions[ri];
  const commons = ores.filter((o) => o.tier === 'common'); const rares = ores.filter((o) => o.tier === 'rare'); const mythic = ores.find((o) => o.tier === 'mythic');
  const soil = r2(soilOf(F, f)); const tough = f.T > F.thr.tough;
  const common = (commons.length > 1 && patchV(F, f, x, y, F.pc.common) <= F.pc.common.b ? commons[1] : commons[0]).id;
  const richness = {}; const veinSize = {};
  richness[common] = 1;
  rares.forEach((o, i) => { const c = F.pc[`r${i}`]; const v = patchV(F, f, x, y, c); if (v > c.b) richness[o.id] = r2(0.15 + 0.85 * sstep(0, 0.2, v - c.b)); });
  if (mythic && tough) { const c = F.pc.myth; const v = patchV(F, f, x, y, c); if (v > c.b) richness[mythic.id] = r2(0.15 + 0.85 * sstep(0, 0.15, v - c.b)); }
  ores.forEach((o, k) => { if (o.id in richness) veinSize[o.id] = r2(0.6 + veinN(F, f, k)); });
  const score = r2(Object.entries(richness).reduce((t, [id, v]) => t + v * veinSize[id] * Math.sqrt(ores.find((o) => o.id === id).baseValue), 0) / soil);
  return { x, y, regionId: region.id, height: r2(clamp(f.h, 0, 1)), temperature: r2(f.temperature), moisture: r2(f.moisture), climate: climateOf(f), terrain: region.terrain, soil, tough, common, richness, veinSize, score, water: f.water };
}

export function sampleSpot(planet, x, y) {
  x = clamp(Number(x) || 0, 0, 1000); y = clamp(Number(y) || 0, 0, 1000);
  const s = spotFrom(planet, x, y, fieldAt(planet.field, x, y)); delete s.water; return s;
}
export const isWater = (planet, x, y) => fieldAt(planet.field, x, y).water;
export function territoryAt() { return null; } // Phase 5: tribe and wildlife fields

export function spotOK(planet, x, y, taken = []) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 20 || y < 20 || x > 980 || y > 980) return { ok: false, reason: 'off-map' };
  const f = fieldAt(planet.field, x, y);
  if (f.water || f.e < 0.03) return { ok: false, reason: 'water' };
  for (const p of taken) if (Math.hypot(p.x - x, p.y - y) < MIN_SITE_GAP) return { ok: false, reason: 'too-close' };
  return { ok: true, reason: null };
}

/* a random land spot near mean + 1 SD, never mythic, never within MIN_SITE_GAP of taken points */
export function startSpot(planet, taken = [], seed = 'start') {
  const F = planet.field; const R = rng(hash(`start:${seed}`)); const target = F.stat.mean + F.stat.sd; const tol = 0.2 * F.stat.sd;
  const mythId = planet.ores.find((o) => o.tier === 'mythic')?.id; let best = null; let bd = Infinity;
  for (let k = 0; k < 6000; k += 1) {
    const x = Math.round(40 + R() * 920); const y = Math.round(40 + R() * 920);
    if (!spotOK(planet, x, y, taken).ok) continue;
    const sp = spotFrom(planet, x, y, fieldAt(F, x, y));
    if (mythId in sp.richness) continue;
    const d = Math.abs(sp.score - target);
    if (d < bd) { bd = d; best = sp; }
    if (d <= tol) break;
  }
  if (!best) return null;
  delete best.water; return best;
}
