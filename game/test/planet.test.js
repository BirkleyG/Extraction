import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleSpot, startSpot, spotOK, isWater, territoryAt, MIN_SITE_GAP, regionCountFor, improvisePlanet, planetFromAI, planetPrompt, planetSummary, oreSpriteSpec, TERRAINS, TERRAIN_IDS, WEATHER, SHAPES, THEMES } from '../shared/planet/index.js';
import { SPEC, DECOR } from '../public/app/pixel/terrains.js';

const HEX = /^#[0-9a-f]{6}$/;

const commonIds = (p) => p.ores.filter((o) => o.tier === 'common').map((o) => o.id);
function assertLayout(p) {
  const [c0, c1] = commonIds(p);
  for (const r of p.regions) {
    assert.ok([c0, c1].includes(r.common)); assert.ok(r.soil >= 0.75 && r.soil <= 1.35); assert.equal(typeof r.tough, 'boolean');
    assert.ok(r.temperature >= -1 && r.temperature <= 1); assert.ok(Array.isArray(r.neighbors));
  }
  assert.ok(p.field && typeof p.field === 'object'); assert.ok(JSON.stringify(p.field).length < 8000);
  assert.equal(territoryAt(p, 500, 500), null);
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
  for (let i = 0; i < 8; i += 1) assert.notEqual(improvisePlanet(`s${i}`, { history: [{ name: sweet.names[0], theme: sweet.concept }] }).themeId, 'sweet');
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
  for (let i = 0; i < 10; i += 1) for (const r of improvisePlanet(`t${i}`, {}).regions) assert.ok(SPEC[r.terrain]);
});

test('oreSpriteSpec never throws and orders the palette dark to light', () => {
  for (const o of [null, {}, { palette: 'x', shape: 'nope' }, ...improvisePlanet('o', {}).ores]) {
    const s = oreSpriteSpec(o);
    assert.ok(s.palette.length >= 3 && s.palette.length <= 4); s.palette.forEach((c) => assert.match(c, HEX));
    assert.ok(SHAPES.includes(s.shape)); assert.ok(s.sparkle >= 0 && s.sparkle <= 1);
  }
  assert.equal(oreSpriteSpec({ tier: 'mythic' }).sparkle, 1);
});

const seeds = (n, f) => Array.from({ length: n }, (_, i) => f(improvisePlanet(`field-${i}`, {}), i));
const G = 50;
/* sample the map on a grid: land cells with their spots */
function grid(p) {
  const cells = new Array(G * G).fill(null); let land = 0;
  for (let j = 0; j < G; j += 1) for (let i = 0; i < G; i += 1) { const x = (i + 0.5) * (1000 / G); const y = (j + 0.5) * (1000 / G); if (!isWater(p, x, y)) { cells[j * G + i] = sampleSpot(p, x, y); land += 1; } }
  return { cells, land };
}
function pieces(cells, pred) {
  const on = cells.map((s) => !!s && pred(s)); const seen = new Uint8Array(on.length); const out = [];
  for (let s0 = 0; s0 < on.length; s0 += 1) {
    if (!on[s0] || seen[s0]) continue;
    let n = 0; const st = [s0]; seen[s0] = 1;
    while (st.length) {
      const c = st.pop(); n += 1; const ci = c % G; const cj = (c - ci) / G;
      for (let dj = -1; dj <= 1; dj += 1) for (let di = -1; di <= 1; di += 1) { const ii = ci + di; const jj = cj + dj; if (ii < 0 || jj < 0 || ii >= G || jj >= G) continue; const k = jj * G + ii; if (on[k] && !seen[k]) { seen[k] = 1; st.push(k); } }
    }
    out.push(n);
  }
  return out;
}

test('sampleSpot is deterministic and in range, with only present ores keyed', () => {
  const p = improvisePlanet('spot-a', {}); const again = improvisePlanet('spot-a', {});
  assert.deepEqual(p.field, again.field);
  const ids = new Set(p.ores.map((o) => o.id)); const regionIds = new Set(p.regions.map((r) => r.id));
  const { cells } = grid(p);
  for (const s of cells) {
    if (!s) continue;
    assert.deepEqual(s, sampleSpot(again, s.x, s.y));
    assert.ok(regionIds.has(s.regionId)); assert.ok(TERRAINS[s.terrain]); assert.equal(s.terrain, p.regions.find((r) => r.id === s.regionId).terrain);
    assert.ok(s.height >= 0 && s.height <= 1 && s.temperature >= -1 && s.temperature <= 1 && s.moisture >= 0 && s.moisture <= 1);
    assert.ok(s.soil >= 0.75 && s.soil <= 1.35, `soil ${s.soil}`); assert.equal(typeof s.tough, 'boolean'); assert.equal(typeof s.climate, 'string');
    assert.equal(s.richness[s.common], 1); assert.ok(commonIds(p).includes(s.common));
    assert.deepEqual(Object.keys(s.veinSize).sort(), Object.keys(s.richness).sort());
    for (const [id, v] of Object.entries(s.richness)) { assert.ok(ids.has(id)); assert.ok(v > 0 && v <= 1); assert.ok(s.veinSize[id] >= 0.6 && s.veinSize[id] <= 1.6); }
    assert.ok(Number.isFinite(s.score) && s.score > 0);
  }
  const c = sampleSpot(p, -50, 5000); assert.ok(c.x === 0 && c.y === 1000);
});

test('painted fields: commons ~50/50, rares ~37% each, mythic ~5% on tough ground, patches never tiny', () => {
  const lo = (n) => n; let seen = 0;
  seeds(10, (p) => {
    const [c0, c1] = commonIds(p); const rares = p.ores.slice(2, 6).map((o) => o.id); const my = p.ores[6].id;
    const { cells, land } = grid(p); seen += 1;
    assert.ok(land / (G * G) > 0.4 && land / (G * G) < 0.9, `land ${land}`);
    const frac = (f) => cells.filter((s) => s && f(s)).length / land;
    const a = frac((s) => s.common === c0); assert.ok(a > 0.4 && a < 0.6, `common split ${a}`);
    for (const id of rares) { const v = frac((s) => id in s.richness); assert.ok(v > 0.32 && v < 0.42, `rare ${v}`); }
    const m = frac((s) => my in s.richness); assert.ok(m > 0.03 && m < 0.075, `mythic ${m}`);
    for (const s of cells) if (s && my in s.richness) assert.ok(s.tough, 'mythic only on tough ground');
    const minPiece = (pred, share) => { const ps = pieces(cells, pred); assert.ok(ps.length >= 1); const mn = Math.min(...ps) / land; assert.ok(mn >= share, `smallest patch ${mn.toFixed(3)} < ${share}`); };
    for (const id of [c0, c1]) minPiece((s) => s.common === id, 0.04);
    for (const id of rares) minPiece((s) => id in s.richness, 0.04);
    minPiece((s) => my in s.richness, 0.015);
    const counts = [0, 0, 0, 0, 0]; for (const s of cells) if (s) counts[rares.filter((id) => id in s.richness).length] += 1; assert.ok(counts[0] > 0 && counts[1] > 0 && counts[2] > 0);
  });
  assert.equal(lo(seen), 10);
});

test('startSpot: land, gap kept, no mythic, similar scores near +1 SD', () => {
  seeds(6, (p, n) => {
    const mythic = p.ores[6].id; const taken = []; const scores = [];
    for (let i = 0; i < 10; i += 1) {
      const s = startSpot(p, taken, `player-${n}-${i}`); assert.ok(s, 'got a spot');
      assert.ok(!isWater(p, s.x, s.y)); assert.ok(!(mythic in s.richness));
      for (const t of taken) assert.ok(Math.hypot(t.x - s.x, t.y - s.y) >= MIN_SITE_GAP);
      assert.deepEqual(s, sampleSpot(p, s.x, s.y)); assert.equal(spotOK(p, s.x, s.y, taken).ok, true);
      assert.equal(spotOK(p, s.x, s.y, taken.concat(s)).reason, 'too-close');
      taken.push({ x: s.x, y: s.y }); scores.push(s.score);
    }
    const { cells } = grid(p); const all = cells.filter((s) => s && !(mythic in s.richness)).map((s) => s.score);
    const mean = all.reduce((t, v) => t + v, 0) / all.length; const sd = Math.sqrt(all.reduce((t, v) => t + (v - mean) ** 2, 0) / all.length);
    const sm = scores.reduce((t, v) => t + v, 0) / 10;
    assert.ok(Math.abs(sm - (mean + sd)) < 0.5 * sd, `start mean ${sm.toFixed(1)} vs ${(mean + sd).toFixed(1)}`);
    assert.ok(Math.max(...scores) - Math.min(...scores) < 1.2 * sd, 'starts are comparable');
    assert.equal(startSpot(p, taken, 'x').x === startSpot(p, taken, 'x').x, true);
  });
});

test('spotOK rejects water, edges and crowding', () => {
  const p = improvisePlanet('ok-1', {});
  assert.equal(spotOK(p, 5, 5, []).ok, false);
  const { cells } = grid(p); const sea = cells.findIndex((s) => !s);
  if (sea >= 0) { const x = ((sea % G) + 0.5) * (1000 / G); const y = (Math.floor(sea / G) + 0.5) * (1000 / G); if (x > 20 && x < 980 && y > 20 && y < 980) assert.equal(spotOK(p, x, y, []).reason, 'water'); }
});

test('12-18 named climate areas with sensible neighbours; AI planets get painted fields too', () => {
  const counts = new Set();
  for (let i = 0; i < 150; i += 1) counts.add(regionCountFor(`n${i}`));
  seeds(12, (p) => { assert.ok(p.regions.length >= 12 && p.regions.length <= 18); for (const r of p.regions) assert.ok(isWater(p, r.x, r.y) === false); assertLayout(p); });
  assert.ok(counts.size >= 4 && Math.min(...counts) === 12 && Math.max(...counts) === 18);
  const ai = planetFromAI({ name: 'X', regions: [{ name: 'Brie Flats', terrain: 'mesa', x: 5, y: 5, soil: 99 }], ores: [{ name: 'A', tier: 'rare', hardness: 99 }] }, 'k');
  assertValid(ai); assert.equal(ai.regions[0].name, 'Brie Flats'); assert.ok(ai.regions[0].soil <= 1.35 && ai.regions[0].x !== 5);
  assert.deepEqual(planetFromAI({}, 'k'), planetFromAI({}, 'k'));
  for (const junk of [null, 42, 'nope', [], { regions: 'x', ores: 7 }]) assertValid(planetFromAI(junk, 'g'));
});

test('hardness bands hold and planet JSON stays small', () => {
  seeds(8, (p) => {
    for (const o of p.ores) { const [a, b] = { common: [1, 3], rare: [3, 7], mythic: [9, 10] }[o.tier]; assert.ok(o.hardness >= a && o.hardness <= b); }
    const rh = p.ores.slice(2, 6).map((o) => o.hardness); assert.deepEqual(rh, rh.slice().sort((x, y) => x - y));
    assert.ok(JSON.stringify(p).length < 60000);
  });
});
