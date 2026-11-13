import { test } from 'node:test';
import assert from 'node:assert/strict';
import { improvisePlanet, planetFromAI, planetPrompt, planetSummary, oreSpriteSpec, TERRAINS, TERRAIN_IDS, WEATHER, SHAPES, THEMES } from '../shared/planet/index.js';
import { SPEC, DECOR } from '../public/app/pixel/terrains.js';

const HEX = /^#[0-9a-f]{6}$/;

function assertValid(p) {
  assert.equal(typeof p.id, 'string'); assert.ok(p.id);
  for (const k of ['name', 'theme', 'tagline', 'story']) { assert.equal(typeof p[k], 'string', k); assert.ok(p[k].length > 0, k); assert.ok(!/[<>]/.test(p[k]), k); }
  assert.equal(p.sky.length, 2); p.sky.forEach((c) => assert.match(c, HEX));
  assert.ok(Array.isArray(p.moons) && p.moons.length <= 3);
  for (const m of p.moons) { assert.match(m.color, HEX); assert.ok(m.size >= 4 && m.size <= 18); assert.ok(m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1); }
  assert.equal(p.layers.length, 5); p.layers.forEach((l) => { assert.ok(l.name); assert.match(l.color, HEX); });
  assert.ok(p.regions.length >= 5 && p.regions.length <= 7);
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
    if (o.tier === 'common') { assert.equal(o.depthMin, 0); assert.ok(o.hardness >= 1 && o.hardness <= 2); assert.ok(o.baseValue >= 1 && o.baseValue <= 3); }
    if (o.tier === 'rare') { assert.ok(o.depthMin >= 2 && o.depthMin <= 12); assert.ok(o.hardness >= 2 && o.hardness <= 4); assert.ok(o.baseValue >= 8 && o.baseValue <= 60); }
    if (o.tier === 'mythic') { assert.ok(o.depthMin >= 16 && o.depthMin <= 20); assert.equal(o.hardness, 5); assert.ok(o.baseValue >= 300 && o.baseValue <= 600); }
  }
  assert.equal(p.buyers.length, 4);
  for (const b of p.buyers) {
    assert.ok(b.name && b.blurb && ['near', 'mid', 'far'].includes(b.distance));
    for (const o of p.ores) { const v = b.likes[o.id]; assert.ok(v >= 0.8 && v <= 1.4, `${b.name} ${o.id} ${v}`); }
  }
  assert.doesNotThrow(() => JSON.stringify(p));
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
  assert.deepEqual(p.regions.map((r) => r.terrain), ['terraces', 'prairie', 'islands', 'lakes', 'fungal']);
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
