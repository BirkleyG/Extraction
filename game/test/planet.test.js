import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regionNeighbors, MIN_SITE_GAP } from '../shared/planet/layout.js';
import { improvisePlanet, planetFromAI, planetPrompt, planetSummary, oreSpriteSpec, TERRAINS, TERRAIN_IDS, WEATHER, SHAPES, THEMES } from '../shared/planet/index.js';
import { SPEC, DECOR } from '../public/app/pixel/terrains.js';

const HEX = /^#[0-9a-f]{6}$/;

const commonIds = (p) => p.ores.filter((o) => o.tier === 'common').map((o) => o.id);
function assertLayout(p) {
  const [c0, c1] = commonIds(p); const mythic = p.ores[6].id; const rares = p.ores.slice(2, 6).map((o) => o.id);
  const reg = new Map(p.regions.map((r) => [r.id, r]));
  for (const r of p.regions) {
    assert.ok([c0, c1].includes(r.common)); assert.ok(r.soil >= 0.75 && r.soil <= 1.35); assert.equal(typeof r.tough, 'boolean');
    assert.ok(r.temperature >= -1 && r.temperature <= 1); assert.ok(Array.isArray(r.neighbors));
  }
  const ids = new Set();
  for (const s of p.sites) {
    assert.ok(!ids.has(s.id)); ids.add(s.id); const r = reg.get(s.regionId); assert.ok(r);
    assert.ok(Math.abs(s.soil - r.soil) <= 0.07); assert.equal(s.richness[r.common], 1);
    assert.ok(!((r.common === c0 ? c1 : c0) in s.richness));
    for (const [id, v] of Object.entries(s.richness)) { assert.ok(v >= 0.2 && v <= 1 || v === 1); assert.ok(s.veinSize[id] >= 0.6 && s.veinSize[id] <= 1.6); if (id !== r.common) assert.ok(rares.includes(id) || id === mythic); }
    assert.deepEqual(Object.keys(s.veinSize).sort(), Object.keys(s.richness).sort());
    if (mythic in s.richness) assert.ok(r.tough);
    assert.equal(typeof s.start, 'boolean'); assert.ok(s.score > 0);
  }
}

function assertValid(p) {
  assert.equal(typeof p.id, 'string'); assert.ok(p.id);
  for (const k of ['name', 'theme', 'tagline', 'story']) { assert.equal(typeof p[k], 'string', k); assert.ok(p[k].length > 0, k); assert.ok(!/[<>]/.test(p[k]), k); }
  assert.equal(p.sky.length, 2); p.sky.forEach((c) => assert.match(c, HEX));
  assert.ok(Array.isArray(p.moons) && p.moons.length <= 3);
  for (const m of p.moons) { assert.match(m.color, HEX); assert.ok(m.size >= 4 && m.size <= 18); assert.ok(m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1); }
  assert.equal(p.layers.length, 5); p.layers.forEach((l) => { assert.ok(l.name); assert.match(l.color, HEX); });
  assert.ok(p.regions.length >= 12 && p.regions.length <= 18);
  assert.equal(new Set(p.regions.map((r) => r.id)).size, p.regions.length);
  for (const r of p.regions) {
    assert.ok(TERRAINS[r.terrain], r.terrain); assert.ok(WEATHER[r.weather], r.weather); assert.ok(r.name && r.blurb);
    assert.ok(r.biomes.length >= 1); r.biomes.forEach((c) => assert.match(c, HEX));
    assert.ok(r.x >= 0 && r.x <= 1000 && r.y >= 0 && r.y <= 1000);
  }
  assert.equal(p.ores.length, 7);
  assert.deepEqual(p.ores.map((o) => o.tier), ['common', 'common', 'rare', 'rare', 'rare', 'rare', 'mythic']);
  assert.equal(new Set(p.ores.map((o) => o.id)).size, 7);
  assert.equal(new Set(p.ores.map((o) => o.name.toLowerCase())).size, 7);
  for (const o of p.ores) {
    assert.match(o.color, HEX); assert.ok(o.palette.length >= 3 && o.palette.length <= 4); o.palette.forEach((c) => assert.match(c, HEX));
    assert.ok(SHAPES.includes(o.shape), o.shape); assert.ok(o.use && o.description && o.name);
    for (const k of ['hardness', 'depthMin', 'baseValue']) assert.ok(Number.isFinite(o[k]), k);
    if (o.tier === 'common') { assert.equal(o.depthMin, 0); assert.ok(o.hardness >= 1 && o.hardness <= 3); assert.ok(o.baseValue >= 1 && o.baseValue <= 3); }
    if (o.tier === 'rare') { assert.ok(o.depthMin >= 2 && o.depthMin <= 12); assert.ok(o.hardness >= 3 && o.hardness <= 7); assert.ok(o.baseValue >= 8 && o.baseValue <= 60); }
    if (o.tier === 'mythic') { assert.ok(o.depthMin >= 16 && o.depthMin <= 20); assert.ok(o.hardness === 9 || o.hardness === 10); assert.ok(o.baseValue >= 300 && o.baseValue <= 600); }
  }
  assert.equal(p.buyers.length, 4);
  for (const b of p.buyers) {
    assert.ok(b.name && b.blurb && ['near', 'mid', 'far'].includes(b.distance));
    assert.ok(Number.isInteger(b.units));
    if (b.distance === 'near') { assert.ok(b.units >= 1 && b.units <= 8); assert.equal(b.offPlanet, false); assert.equal(b.leave, 0); } else { assert.ok(b.units >= 10 && b.units <= 60); assert.equal(b.offPlanet, true); assert.equal(b.leave, 8); }
    assert.equal(b.units > 30, b.distance === 'far');
    for (const o of p.ores) { const v = b.likes[o.id]; assert.ok(v >= 0.8 && v <= 1.4, `${b.name} ${o.id} ${v}`); }
  }
  assertLayout(p);
  assert.ok(JSON.stringify(p).length < 60000);
}

test('improvisePlanet is valid and deterministic per seed', () => {
  for (const seed of ['a', 'b', 'month-2026-11', 42, '']) {
    const p = improvisePlanet(seed, { history: [] }); assertValid(p);
    assert.deepEqual(improvisePlanet(seed, { history: [] }), p);
  }
  assert.notDeepEqual(improvisePlanet('x', {}).ores, improvisePlanet('y', {}).ores);
});

test('improvisePlanet avoids recently used themes', () => {
  const history = [];
  for (let i = 0; i < 6; i += 1) {
    const p = improvisePlanet(`seed-${i}`, { history });
    const recent = history.slice(-6).map((h) => h.themeId);
    assert.ok(!recent.includes(p.themeId), `${p.themeId} repeated`);
    history.push(planetSummary(p));
  }
  // even with only names/themes in the summary (e.g. AI planets), a matching built-in theme is avoided
  const sweet = THEMES.find((t) => t.id === 'sweet');
  for (let i = 0; i < 20; i += 1) assert.notEqual(improvisePlanet(`s${i}`, { history: [{ name: sweet.names[0], theme: sweet.concept }] }).themeId, 'sweet');
  // every theme used up still yields a planet
  assertValid(improvisePlanet('full', { history: THEMES.map((t) => ({ themeId: t.id })) }));
});

test('ores are themed: name words come from the theme, uses are galactic', () => {
  let p = null;
  for (let i = 0; i < 200 && !p; i += 1) { const c = improvisePlanet(`candy${i}`, {}); if (c.themeId === 'sweet') p = c; }
  assert.ok(p, 'some seed makes a candy world');
  const words = THEMES.find((t) => t.id === 'sweet').oreWords;
  for (const o of p.ores) assert.ok(words.some((w) => o.name.includes(w)), o.name);
});

test('planetFromAI survives garbage and always returns a valid planet', () => {
  const junk = [null, undefined, 42, 'not json', '[]', [], { ores: 'x' }, { ores: [{ name: 'Lone' }, { name: 'Lone' }, null] },
    { sky: ['red', '#12'], moons: [{ color: 'blue', size: 999, x: -4, y: 'up' }, 1, 2, 3, 4], layers: [{ name: '<script>', color: '#gg0000' }],
      regions: [{ terrain: 'moon-cheese', name: 'Brie Flats' }, { terrain: 'volcano lava place' }], buyers: [{ likes: { lone: 99 } }],
      ores: [{ name: 'A', tier: 'mythic', color: '#zzzzzz', hardness: -9, depthMin: 999, baseValue: 'lots', palette: ['#fff', 'nope'], shape: 'pyramid' }] },
    { name: { a: 1 }, story: 7, theme: { concept: 'Object theme' }, regions: Array.from({ length: 30 }, () => ({ terrain: 'mesa' })), ores: Array.from({ length: 20 }, (_, i) => ({ name: `Ore ${i % 3}`, tier: 'rare' })) },
  ];
  for (const raw of junk) assertValid(planetFromAI(raw, 'seed'));
  const p = planetFromAI(junk[8], 's');
  assert.ok(p.ai);
  assert.equal(p.ores.filter((o) => o.tier === 'rare').length, 4);
  assert.equal(planetFromAI(junk[9], 's').theme, 'Object theme');
  assert.equal(planetFromAI(junk[8], 's').regions[1].terrain, 'volcanic'); // inferred from free text
  assert.ok(planetFromAI(junk[8], 's').regions.length >= 12);
});

test('planetFromAI keeps good AI content and parses chatty JSON', () => {
  const good = {
    name: 'Gumdrop Major', theme: 'A candy world where dessert fights back.', tagline: 'Sweet. Lethal.', story: 'One. Two. Three.',
    sky: ['#220022', '#FF88CC'], stars: '#ffffff', surface: '#aa5588', moons: [{ color: '#ffeeaa', size: 12, x: 0.2, y: 0.3 }],
    layers: Array.from({ length: 5 }, (_, i) => ({ name: `Layer ${i}`, color: '#40203' + i })),
    regions: ['terraces', 'prairie', 'islands', 'lakes', 'fungal'].map((t, i) => ({ name: `R${i}`, terrain: t, biomes: ['#112233', '#223344', '#334455'], blurb: 'b', weather: 'spores' })),
    ores: [
      { id: 'gumdrop-quartz', name: 'Gumdrop Quartz', tier: 'common', hardness: 1, depthMin: 0, baseValue: 2, color: '#ff66aa', shape: 'cluster', use: 'starship hull insulation', description: 'Chewy.' },
      { name: 'Toffee Plate', tier: 'common', color: '#aa7733', shape: 'ingot', use: 'hull plating' },
      { name: 'Sherbet Isotope', tier: 'rare', depthMin: 3, color: '#ffcc33' }, { name: 'Licorice Coil', tier: 'rare', depthMin: 6, color: '#222222' },
      { name: 'Fudge Lens', tier: 'rare', depthMin: 9 }, { name: 'Praline Gem', tier: 'rare', depthMin: 12 },
      { name: 'Birthday Singularity', tier: 'mythic', depthMin: 18, baseValue: 500, color: '#ffffff', shape: 'star' },
    ],
    buyers: [{ name: 'Sweet Tooth', blurb: 'x', distance: 'far', likes: { 'gumdrop-quartz': 1.4, 'Toffee Plate': 0.8 } }],
  };
  const p = planetFromAI(`Sure! Here you go:\n\`\`\`json\n${JSON.stringify(good)}\n\`\`\``, 'm1');
  assertValid(p);
  assert.equal(p.name, 'Gumdrop Major'); assert.equal(p.sky[1], '#ff88cc'); assert.equal(p.moons.length, 1);
  assert.deepEqual(p.regions.slice(0, 5).map((r) => r.terrain), ['terraces', 'prairie', 'islands', 'lakes', 'fungal']);
  assert.equal(p.ores[0].name, 'Gumdrop Quartz'); assert.equal(p.ores[0].shape, 'cluster'); assert.equal(p.ores[0].use, 'starship hull insulation');
  assert.equal(p.ores[6].baseValue, 500);
  assert.equal(p.buyers[0].likes['gumdrop-quartz'], 1.4); assert.equal(p.buyers[0].likes['toffee-plate'], 0.8); assert.equal(p.buyers[0].distance, 'far');
  assert.deepEqual(planetFromAI(good, 'm1'), planetFromAI(good, 'm1'));
});

test('planetPrompt asks for only JSON, lists terrains, honors request and history', () => {
  const s = planetPrompt({ request: 'a planet made of cheese', history: [planetSummary(improvisePlanet('h', {}))] });
  assert.match(s, /ONLY a JSON object/); assert.match(s, /cheese/); assert.match(s, /Maker Guild/);
  for (const id of TERRAIN_IDS) assert.ok(s.includes(id), id);
  assert.ok(s.includes(improvisePlanet('h', {}).name));
  assert.match(planetPrompt({}), /Surprise us/);
});

test('every terrain has a drawing spec and its decor exists', () => {
  assert.equal(TERRAIN_IDS.length, 39);
  for (const id of TERRAIN_IDS) {
    assert.ok(SPEC[id], `no spec for ${id}`);
    for (const [kind] of SPEC[id].decor) assert.ok(DECOR[kind], `${id} decor ${kind}`);
    assert.ok(WEATHER[TERRAINS[id].fx], `${id} weather`);
  }
  for (let i = 0; i < 30; i += 1) for (const r of improvisePlanet(`t${i}`, {}).regions) assert.ok(SPEC[r.terrain]);
});

test('oreSpriteSpec never throws and orders the palette dark to light', () => {
  for (const o of [null, {}, { palette: 'x', shape: 'nope' }, ...improvisePlanet('o', {}).ores]) {
    const s = oreSpriteSpec(o);
    assert.ok(s.palette.length >= 3 && s.palette.length <= 4); s.palette.forEach((c) => assert.match(c, HEX));
    assert.ok(SHAPES.includes(s.shape)); assert.ok(s.sparkle >= 0 && s.sparkle <= 1);
  }
  assert.equal(oreSpriteSpec({ tier: 'mythic' }).sparkle, 1);
});

const seeds = (n, f) => Array.from({ length: n }, (_, i) => f(improvisePlanet(`layout-${i}`, {}), i));

test('12-18 regions with two contiguous, non-overlapping common zones', () => {
  const counts = new Set();
  seeds(120, (p) => {
    counts.add(p.regions.length);
    const nb = regionNeighbors(p.regions);
    for (const c of commonIds(p)) {
      const zone = p.regions.filter((r) => r.common === c); assert.ok(zone.length >= 3, `zone of ${c} has ${zone.length}`);
      const inZone = new Set(zone.map((r) => r.id)); const seen = new Set([zone[0].id]); const stack = [zone[0].id];
      while (stack.length) for (const n of nb[stack.pop()]) if (inZone.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      assert.equal(seen.size, zone.length, 'zone is one connected piece');
    }
    assert.equal(p.regions.filter((r) => commonIds(p).includes(r.common)).length, p.regions.length);
    // everything that touches is stored on the region too
    for (const r of p.regions) assert.deepEqual([...r.neighbors].sort(), [...nb[r.id]].sort());
    const tough = p.regions.filter((r) => r.tough).length; assert.ok(tough / p.regions.length >= 0.19 && tough / p.regions.length <= 0.31, `${tough}/${p.regions.length}`);
  });
  assert.ok(counts.size >= 6 && Math.min(...counts) === 12 && Math.max(...counts) === 18);
});

test('tough ground favours rugged terrain and temperature follows terrain', () => {
  const rugged = new Set(['volcanic', 'alpine', 'canyon', 'crystal', 'badlands']); let a = 0; let b = 0; let n = 0; let m = 0;
  seeds(150, (p) => p.regions.forEach((r) => { if (rugged.has(r.terrain)) { a += 1; if (r.tough) b += 1; } n += 1; if (r.tough) m += 1; }));
  assert.ok(b / a > 0.5, `rugged tough share ${b / a}`); assert.ok(b / a > (m - b) / (n - a) * 2);
  const t = (id) => { const xs = []; seeds(80, (p) => p.regions.forEach((r) => { if (r.terrain === id) xs.push(r.temperature); })); return xs.length ? xs.reduce((u, v) => u + v, 0) / xs.length : null; };
  assert.ok(t('volcanic') > 0.5); assert.ok(t('glacier') < -0.5);
});

test('rare ores: independent ~37% per site, 16/37/33/13/2% by count; mythic ~5% on tough ground only', () => {
  const bins = [0, 0, 0, 0, 0]; const per = [0, 0, 0, 0]; let n = 0; let my = 0; let perPlanet = 0;
  seeds(300, (p) => {
    const rares = p.ores.slice(2, 6).map((o) => o.id); let mm = 0;
    for (const s of p.sites) {
      n += 1; const k = rares.filter((id) => id in s.richness).length; bins[k] += 1; rares.forEach((id, i) => { if (id in s.richness) per[i] += 1; });
      if (p.ores[6].id in s.richness) { my += 1; mm += 1; assert.ok(p.regions.find((r) => r.id === s.regionId).tough); }
    }
    assert.ok(mm >= 1); perPlanet += mm;
  });
  [0.16, 0.37, 0.33, 0.13, 0.02].forEach((e, k) => assert.ok(Math.abs(bins[k] / n - e) < 0.035, `${k} rares: ${bins[k] / n}`));
  per.forEach((c, i) => assert.ok(Math.abs(c / n - 0.37) < 0.03, `rare ${i}: ${c / n}`));
  assert.ok(Math.abs(my / n - 0.05) < 0.01, `mythic ${my / n}`);
});

test('sites: 3-6 per region, minimum spacing, inside the map, in their own region cell', () => {
  seeds(60, (p) => {
    for (const r of p.regions) { const k = p.sites.filter((s) => s.regionId === r.id).length; assert.ok(k >= 3 && k <= 6, `${k} sites`); }
    for (const [i, a] of p.sites.entries()) {
      assert.ok(Math.hypot(a.x - 500, a.y - 500) <= 480);
      let best = null; let bd = 1e9; for (const r of p.regions) { const d = Math.hypot(r.x - a.x, r.y - a.y); if (d < bd) { bd = d; best = r; } }
      assert.equal(best.id, a.regionId);
      for (const b of p.sites.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= MIN_SITE_GAP);
    }
  });
});

test('start sites: at least 12, both common zones, similar quality near mean + 1 SD, never mythic', () => {
  seeds(150, (p) => {
    const starts = p.sites.filter((s) => s.start); const reg = new Map(p.regions.map((r) => [r.id, r]));
    assert.ok(starts.length >= 12 && starts.length <= 16, `${starts.length} starts`);
    for (const c of commonIds(p)) assert.ok(starts.filter((s) => reg.get(s.regionId).common === c).length >= 5);
    for (const s of starts) assert.ok(!(p.ores[6].id in s.richness));
    const plain = p.sites.filter((s) => !(p.ores[6].id in s.richness)); const mean = plain.reduce((t, s) => t + s.score, 0) / plain.length;
    const sd = Math.sqrt(plain.reduce((t, s) => t + (s.score - mean) ** 2, 0) / plain.length);
    for (const s of starts) assert.ok(Math.abs(s.score - (mean + sd)) < 0.8 * sd, `start score ${s.score} vs ${(mean + sd).toFixed(1)} (sd ${sd.toFixed(1)})`);
    assert.ok(starts.every((s) => s.score > mean));
    const sm = starts.reduce((t, s) => t + s.score, 0) / starts.length;
    assert.ok(Math.sqrt(starts.reduce((t, s) => t + (s.score - sm) ** 2, 0) / starts.length) < 0.55 * sd, 'starts are comparable');
    assert.ok(Math.abs(sm - (mean + sd)) < 0.6 * sd, 'starts average about +1 SD');
  });
});

test('hardness bands and AI planets get seeded layouts too', () => {
  seeds(40, (p) => {
    for (const o of p.ores) { const [a, b] = { common: [1, 3], rare: [3, 7], mythic: [9, 10] }[o.tier]; assert.ok(o.hardness >= a && o.hardness <= b); }
    const rh = p.ores.slice(2, 6).map((o) => o.hardness); assert.deepEqual(rh, rh.slice().sort((x, y) => x - y));
  });
  const ai = planetFromAI({ name: 'X', regions: [{ name: 'Brie Flats', terrain: 'mesa', x: 5, y: 5, soil: 99 }], ores: [{ name: 'A', tier: 'rare', hardness: 99 }] }, 'k');
  assertValid(ai); assert.equal(ai.regions[0].name, 'Brie Flats'); assert.ok(ai.regions[0].soil <= 1.35 && ai.regions[0].x !== 5);
  assert.deepEqual(planetFromAI({}, 'k'), planetFromAI({}, 'k'));
  assert.deepEqual(planetFromAI({}, 'k').sites.map((s) => s.id), improvisePlanet('k', {}).sites.map((s) => s.id));
});
