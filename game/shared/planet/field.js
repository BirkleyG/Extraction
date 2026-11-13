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
const SEA_SHARE = 0.28; const TOUGH_SHARE = 0.3;
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
  const env = 1 - sstep(0.26, 0.58, d);
  const m = fbm(qx * 2.2 + F.o[8], qy * 2.2 + F.o[9], s + 5, 3);
  const ridge = 1 - Math.abs(2 * fbm(qx * 4.5 + F.o[10], qy * 4.5 + F.o[11], s + 6, 4) - 1);
  return { h: 0.42 * base + 0.4 * env + 0.28 * ridge * ridge * sstep(0.4, 0.62, m) * (0.4 + env), ridge: ridge * ridge, qx, qy };
}

export function fieldAt(F, x, y) {
  const r = rawHeight(F, x, y); const h = r.h;
  const e = clamp((h - F.sea) / (F.top - F.sea), 0, 1.2);
  const water = h <= F.sea;
  const lat = Math.abs(y - 500) / 500;
  const tn = fbm(r.qx * 2 + F.o[12], r.qy * 2 + F.o[13], F.s + 7, 3);
  const temperature = clamp(0.9 - 1.7 * lat ** 1.1 - 0.85 * Math.min(1, e) + 0.3 * (tn - 0.5) + F.gt, -1, 1);
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

/* patch noises, each in its own domain-warped space */
const patch = (F, f, k, scale, oct = 4) => fbm(f.qx * scale + F.p[k][0], f.qy * scale + F.p[k][1], F.s + 40 + k * 3, oct);
const commonN = (F, f) => patch(F, f, 0, 2.2);
const rareN = (F, f, i) => patch(F, f, 1 + i, 2.9);
const mythN = (F, f) => patch(F, f, 5, 3.4);
const veinN = (F, f, k) => clamp(0.5 + (patch(F, f, 6 + k, 5, 2) - 0.5) * 2.2, 0, 1);

/* ---------- build ---------- */
const LAND_GRID = 64;
function landSamples(F) {
  const out = [];
  for (let j = 0; j < LAND_GRID; j += 1) for (let i = 0; i < LAND_GRID; i += 1) {
    const x = (i + 0.5) * (1000 / LAND_GRID); const y = (j + 0.5) * (1000 / LAND_GRID);
    const f = fieldAt(F, x, y); if (!f.water) out.push({ x, y, f });
  }
  return out;
}
const quant = (arr, q) => { const a = arr.slice().sort((p, r) => p - r); return a[clamp(Math.floor(q * a.length), 0, a.length - 1)]; };

const SITE_WORDS = ['Strike', 'Outcrop', 'Seam', 'Claim', 'Bluff', 'Hollow', 'Rise', 'Pit', 'Ledge', 'Drift', 'Knoll', 'Scar', 'Vent', 'Shelf', 'Gap', 'Spur', 'Pocket', 'Lode'];

export function buildField(seed, regions, ores) {
  const R = rng(hash(`field:${seed}`));
  const F = { s: hash(`fs:${seed}`) & 0xffff, o: Array.from({ length: 16 }, () => +(R() * 200).toFixed(2)), sea: 0.5, top: 1, gt: 0, gm: 0, wc: 0.55, c: [], p: Array.from({ length: 12 }, () => [+(R() * 200).toFixed(2), +(R() * 200).toFixed(2)]), thr: {} };
  // planet-wide climate lean from the regions' landscapes
  const prof = regions.map((r) => PROFILE[r.terrain]).filter(Boolean);
  if (prof.length) { F.gt = r4(clamp(0.5 * prof.reduce((t, p) => t + p[0], 0) / prof.length, -0.3, 0.3)); F.gm = r4(clamp(0.4 * (prof.reduce((t, p) => t + p[1], 0) / prof.length - 0.5), -0.15, 0.15)); }
  // sea level and peak height from a coarse grid
  const hs = []; for (let j = 0; j < 40; j += 1) for (let i = 0; i < 40; i += 1) hs.push(rawHeight(F, (i + 0.5) * 25, (j + 0.5) * 25).h);
  F.sea = r4(quant(hs, SEA_SHARE)); F.top = r4(quant(hs, 0.985));
  const land = landSamples(F);
  // region centres: spread over land, each terrain on the land that best fits it
  const n = regions.length; const cand = land.filter((_, i) => i % 3 === Math.floor(R() * 3) || true).map((s) => ({ x: s.x + (R() - 0.5) * 12, y: s.y + (R() - 0.5) * 12, t: s.f.temperature, m: s.f.moisture, e: Math.min(1, s.f.e) }));
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
  F.thr.common = r4(quant(cs.map((s) => commonN(F, s.f)), 0.5));
  for (let i = 0; i < 4; i += 1) F.thr[`r${i}`] = r4(quant(cs.map((s) => rareN(F, s.f, i)), 1 - RARE_P));
  F.thr.tLo = r4(quant(cs.map((s) => s.f.T), 0.05)); F.thr.tHi = r4(quant(cs.map((s) => s.f.T), 0.99));
  F.thr.tough = r4(quant(cs.map((s) => s.f.T), 1 - TOUGH_SHARE));
  const tough = cs.filter((s) => s.f.T > F.thr.tough);
  F.thr.myth = r4(quant(tough.map((s) => mythN(F, s.f)), 1 - MYTHIC_SHARE * cs.length / Math.max(1, tough.length)));
  // region metadata
  const acc = regions.map(() => ({ n: 0, soil: 0, tough: 0, temp: 0, c0: 0 }));
  for (const s of cs) {
    const a = acc[s.ri]; a.n += 1; a.soil += soilOf(F, s.f); a.tough += s.f.T > F.thr.tough ? 1 : 0; a.temp += s.f.temperature; a.c0 += commonN(F, s.f) > F.thr.common ? 1 : 0;
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
  const common = (commons.length > 1 && commonN(F, f) <= F.thr.common ? commons[0] : commons[commons.length > 1 ? 1 : 0] || commons[0]).id;
  const richness = {}; const veinSize = {};
  richness[common] = 1;
  rares.forEach((o, i) => { const n = rareN(F, f, i); if (n > F.thr[`r${i}`]) richness[o.id] = r2(0.15 + 0.85 * sstep(0, 0.1, n - F.thr[`r${i}`])); });
  if (mythic && tough) { const n = mythN(F, f); if (n > F.thr.myth) richness[mythic.id] = r2(0.15 + 0.85 * sstep(0, 0.08, n - F.thr.myth)); }
  ores.forEach((o, k) => { if (o.id in richness) veinSize[o.id] = r2(0.6 + veinN(F, f, k)); });
  const score = r2(Object.entries(richness).reduce((t, [id, v]) => t + v * veinSize[id] * Math.sqrt(ores.find((o) => o.id === id).baseValue), 0) / soil);
  return { x, y, regionId: region.id, height: r2(clamp(f.h, 0, 1)), temperature: r2(f.temperature), moisture: r2(f.moisture), climate: climateOf(f), terrain: region.terrain, soil, tough, common, richness, veinSize, score, water: f.water };
}

export function sampleSpot(planet, x, y) {
  x = clamp(Number(x) || 0, 0, 1000); y = clamp(Number(y) || 0, 0, 1000);
  const s = spotFrom(planet, x, y, fieldAt(planet.field, x, y)); delete s.water; s.isWater = planet.field ? fieldAt(planet.field, x, y).water : false; return s;
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
