/* Planet layout (Phase 3.5): where regions and sites sit and every number about them.
 * Pure and seeded: the same seed and ores always give the same map, whatever flavour (AI or improvised) the planet has.
 *
 *   regionCountFor(seed)                 -> 12..18
 *   applyLayout(seed, regions, ores)     -> sites[]  (mutates regions: x, y, neighbors, common, soil, tough, temperature)
 *   regionNeighbors(regions)             -> { [regionId]: [regionId] }  (cells that touch on the map)
 *
 * Map is a disc: centre (500,500), usable radius 480. Regions are Voronoi cells of their (x,y). */
import { hash, rng, clamp, pick, shuffle } from './util.js';

export const MAP_C = 500;
export const MAP_R = 480;
export const MIN_SITE_GAP = 44;
export const RARE_P = 0.37;
export const MYTHIC_SHARE = 0.05;

/* terrains that make naturally tough ground (weights for choosing which regions are tough) */
const TOUGH_W = { volcanic: 8, alpine: 8, canyon: 8, crystal: 8, badlands: 8, monoliths: 4, scrapyard: 3, arches: 3, mesa: 3, rifts: 3, geysers: 2, glacier: 2, tundra: 1.5, hive: 1.5 };
/* typical temperature, -1 freezing .. 1 scorching; anything unlisted is mild (0) */
const TEMP = {
  glacier: -0.95, tundra: -0.8, taiga: -0.6, alpine: -0.55, mirror: -0.3, moor: -0.25, skyislands: -0.2, redwoods: -0.1, falls: -0.05, lakes: -0.1,
  dunes: 0.85, volcanic: 0.95, badlands: 0.6, canyon: 0.55, mesa: 0.55, arches: 0.6, savanna: 0.5, scrub: 0.5, oasis: 0.65, geysers: 0.7, saltflat: 0.6, jungle: 0.55,
  scrapyard: 0.3, ruins: 0.2, hive: 0.4, tendrils: 0.35, swamp: 0.3, autumn: 0.05, islands: 0.35, coast: 0.1, terraces: 0.25,
};
const SITE_WORDS = ['Strike', 'Outcrop', 'Seam', 'Claim', 'Bluff', 'Hollow', 'Rise', 'Pit', 'Ledge', 'Drift', 'Knoll', 'Scar', 'Vent', 'Shelf', 'Gap', 'Spur', 'Pocket', 'Lode'];

const r2 = (v) => Math.round(v * 100) / 100;
const rangeIn = (R, a, b) => a + R() * (b - a);

export function regionCountFor(seed) { return 12 + Math.floor(rng(hash(`rcount:${seed}`))() * 7); }

function nearest(pts, x, y) { let b = 0; let bd = Infinity; for (let i = 0; i < pts.length; i += 1) { const d = (pts[i].x - x) ** 2 + (pts[i].y - y) ** 2; if (d < bd) { bd = d; b = i; } } return b; }

/* best-candidate sampling in the disc: every new seed goes where it is farthest from the others */
function placeRegions(R, n) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    let best = null; let bestD = -1;
    for (let k = 0; k < 40; k += 1) {
      const a = R() * Math.PI * 2; const rad = 410 * Math.sqrt(R());
      const c = { x: Math.round(MAP_C + Math.cos(a) * rad), y: Math.round(MAP_C + Math.sin(a) * rad) };
      const d = pts.length ? Math.min(...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) : 0;
      if (d > bestD) { bestD = d; best = c; }
    }
    pts.push(best);
  }
  return pts;
}

/* which regions touch: sample the disc on a grid and look at neighbouring cells */
export function regionNeighbors(regions) {
  const G = 90; const step = 1000 / G; const own = new Int16Array(G * G).fill(-1);
  for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) { const x = (i + 0.5) * step; const y = (j + 0.5) * step; if (Math.hypot(x - MAP_C, y - MAP_C) <= MAP_R) own[j * G + i] = nearest(regions, x, y); }
  const adj = regions.map(() => new Set());
  for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) {
    const a = own[j * G + i]; if (a < 0) continue;
    for (const [di, dj] of [[1, 0], [0, 1]]) { const ii = i + di; const jj = j + dj; if (ii >= G || jj >= G) continue; const b = own[jj * G + ii]; if (b >= 0 && b !== a) { adj[a].add(b); adj[b].add(a); } }
  }
  const out = {}; regions.forEach((r, i) => { out[r.id] = [...adj[i]].map((k) => regions[k].id); });
  return out;
}

/* two zones grown outward from the two farthest-apart regions, so each is one connected piece */
function splitZones(R, regions, nb) {
  let A = 0; let B = 1; let far = -1;
  for (let i = 0; i < regions.length; i += 1) for (let j = i + 1; j < regions.length; j += 1) { const d = Math.hypot(regions[i].x - regions[j].x, regions[i].y - regions[j].y); if (d > far) { far = d; A = i; B = j; } }
  const idx = new Map(regions.map((r, i) => [r.id, i]));
  const zone = new Array(regions.length).fill(-1); zone[A] = 0; zone[B] = 1;
  const seeds = [A, B]; let turn = R() < 0.5 ? 0 : 1;
  for (let left = regions.length - 2; left > 0;) {
    let moved = false;
    for (let t = 0; t < 2 && !moved; t += 1) {
      const z = (turn + t) % 2; const cand = [];
      for (let i = 0; i < regions.length; i += 1) if (zone[i] === z) for (const id of nb[regions[i].id]) { const k = idx.get(id); if (zone[k] < 0 && !cand.includes(k)) cand.push(k); }
      if (!cand.length) continue;
      cand.sort((p, q) => Math.hypot(regions[p].x - regions[seeds[z]].x, regions[p].y - regions[seeds[z]].y) - Math.hypot(regions[q].x - regions[seeds[z]].x, regions[q].y - regions[seeds[z]].y));
      zone[cand[Math.min(cand.length - 1, Math.floor(R() * R() * 2))]] = z; moved = true; left -= 1; turn = 1 - z;
    }
    if (!moved) { for (let i = 0; i < zone.length; i += 1) if (zone[i] < 0) { zone[i] = Math.hypot(regions[i].x - regions[A].x, regions[i].y - regions[A].y) <= Math.hypot(regions[i].x - regions[B].x, regions[i].y - regions[B].y) ? 0 : 1; } break; }
  }
  return zone;
}

function chooseTough(R, regions) {
  const n = regions.length; const lo = Math.ceil(n * 0.2); const hi = Math.floor(n * 0.3);
  const want = lo + Math.floor(R() * (hi - lo + 1));
  const pool = regions.map((r, i) => ({ i, w: TOUGH_W[r.terrain] || 1 })); const out = new Set();
  while (out.size < want && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0); let x = R() * total; let k = 0;
    while (k < pool.length - 1 && x >= pool[k].w) { x -= pool[k].w; k += 1; }
    out.add(pool[k].i); pool.splice(k, 1);
  }
  return out;
}

function placeSites(R, regions) {
  const sites = []; const names = new Set();
  regions.forEach((reg, ri) => {
    const want = 3 + Math.floor(R() * 4); const last = reg.name.split(' ').pop(); let got = 0;
    for (let k = 0; k < 400 && got < want; k += 1) {
      const a = R() * Math.PI * 2; const rad = 150 * Math.sqrt(R());
      const x = Math.round(reg.x + Math.cos(a) * rad); const y = Math.round(reg.y + Math.sin(a) * rad);
      if (Math.hypot(x - MAP_C, y - MAP_C) > MAP_R - 10 || nearest(regions, x, y) !== ri) continue;
      if (sites.some((s) => Math.hypot(s.x - x, s.y - y) < MIN_SITE_GAP)) continue;
      let name = ''; for (let t = 0; t < 8 && (!name || names.has(name)); t += 1) name = `${pick(R, SITE_WORDS)} ${last}`;
      if (names.has(name)) name = `${name} ${got + 1}`;
      names.add(name); got += 1;
      sites.push({ id: `s${sites.length}`, regionId: reg.id, name, x, y });
    }
  });
  return sites;
}

export function applyLayout(seed, regions, ores) {
  const R = rng(hash(`layout:${seed}`));
  const commons = ores.filter((o) => o.tier === 'common'); const rares = ores.filter((o) => o.tier === 'rare'); const mythic = ores.find((o) => o.tier === 'mythic');
  const pts = placeRegions(R, regions.length);
  regions.forEach((r, i) => { r.x = pts[i].x; r.y = pts[i].y; });
  const nb = regionNeighbors(regions);
  const zone = splitZones(R, regions, nb);
  const tough = chooseTough(R, regions);
  regions.forEach((r, i) => {
    r.common = commons[zone[i]].id;
    r.tough = tough.has(i);
    r.soil = r2(r.tough ? rangeIn(R, 1.05, 1.35) : rangeIn(R, 0.75, 1.2));
    r.temperature = r2(clamp((TEMP[r.terrain] || 0) + (R() - 0.5) * 0.3, -1, 1));
    r.neighbors = nb[r.id];
  });
  const sites = placeSites(R, regions);
  const byId = new Map(regions.map((r) => [r.id, r]));
  const val = (id) => Math.sqrt(ores.find((o) => o.id === id).baseValue);
  const score = (s) => Object.entries(s.richness).reduce((t, [id, rich]) => t + rich * s.veinSize[id] * val(id), 0) / s.soil;
  for (const s of sites) {
    const reg = byId.get(s.regionId);
    s.soil = r2(reg.soil + (R() - 0.5) * 0.12);
    s.richness = { [reg.common]: 1 };
    for (const o of rares) if (R() < RARE_P) s.richness[o.id] = r2(rangeIn(R, 0.2, 1));
  }
  // mythic: only on tough ground, about 5% of every site
  const hard = sites.filter((s) => byId.get(s.regionId).tough);
  const want = Math.min(hard.length, Math.max(1, Math.round(sites.length * MYTHIC_SHARE)));
  if (mythic) for (const s of shuffle(R, hard).slice(0, want)) s.richness[mythic.id] = r2(rangeIn(R, 0.2, 1));
  for (const s of sites) {
    s.veinSize = {}; for (const id of Object.keys(s.richness)) s.veinSize[id] = r2(rangeIn(R, 0.6, 1.6));
    s.score = r2(score(s));
    s.start = false;
  }
  // starts: no mythic, score nearest mean + 1 SD (taken over ordinary sites), at least 6 from each common zone, up to 16
  const plain = sites.filter((s) => !mythic || !(mythic.id in s.richness));
  const mean = plain.reduce((t, s) => t + s.score, 0) / plain.length;
  const sd = Math.sqrt(plain.reduce((t, s) => t + (s.score - mean) ** 2, 0) / plain.length);
  const target = mean + sd; const dist = (s) => Math.abs(s.score - target);
  const chosen = new Set(); const byDist = plain.slice().sort((p, q) => dist(p) - dist(q));
  for (const c of commons) for (const s of byDist.filter((x) => byId.get(x.regionId).common === c.id).slice(0, 6)) chosen.add(s);
  for (const s of byDist) { if (chosen.size >= 12 && dist(s) > 0.35 * sd) break; if (chosen.size >= 16) break; chosen.add(s); }
  for (const s of chosen) {
    s.start = true;
    // fairness: nudge vein sizes (inside 0.6-1.6) so every start lands close to the target
    const v = Object.values(s.veinSize); const lo = 0.6 / Math.min(...v); const hi = 1.6 / Math.max(...v);
    const k = clamp(target / s.score, lo, Math.max(lo, hi));
    for (const id of Object.keys(s.veinSize)) s.veinSize[id] = r2(clamp(s.veinSize[id] * k, 0.6, 1.6));
    // still short (a thin upper tail): richer rares, never above 1 and never a new ore
    for (let t = 0; t < 6 && score(s) < target * 0.95; t += 1) for (const id of Object.keys(s.richness)) if (id !== byId.get(s.regionId).common) s.richness[id] = r2(Math.min(1, s.richness[id] * 1.2));
    s.score = r2(score(s));
  }
  return sites;
}
