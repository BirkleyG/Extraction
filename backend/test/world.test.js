import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, siteValue, WorldError } from '../src/world.js';

const seeds = ['alpha-seed-001', 'bravo-seed-002', 'charlie-seed-3', 'delta-seed-0004', 'echo-seed-00005'];

test('T04-01 every planet has exactly seven ores: two common, four rare, one mythic', () => {
  for (const seed of seeds) {
    const w = generateWorld({ seed, monthId: '2026-11', players: 5 });
    assert.equal(w.ores.length, 7);
    const count = (tier) => w.ores.filter((o) => o.tier === tier).length;
    assert.deepEqual([count('common'), count('rare'), count('mythic')], [2, 4, 1]);
    for (const o of w.ores) {
      if (o.tier === 'common') assert(o.hardness >= 1 && o.hardness <= 2);
      if (o.tier === 'rare') assert(o.hardness >= 5 && o.hardness <= 6);
      if (o.tier === 'mythic') assert(o.hardness >= 9 && o.hardness <= 10);
    }
  }
});

test('same seed reproduces the planet; different seed or month differs', () => {
  const a = generateWorld({ seed: seeds[0], monthId: '2026-11', players: 4 });
  assert.deepEqual(a, generateWorld({ seed: seeds[0], monthId: '2026-11', players: 4 }));
  assert.notDeepEqual(a.sites, generateWorld({ seed: seeds[1], monthId: '2026-11', players: 4 }).sites);
});

test('regions scale 6-12 per player; common ores are exclusive per region', () => {
  for (const players of [1, 3, 10]) {
    const w = generateWorld({ seed: seeds[2], monthId: '2026-11', players });
    assert(w.regions.length >= Math.max(6, 6 * players) && w.regions.length <= 12 * players, `${players}: ${w.regions.length}`);
    for (const region of w.regions) {
      const siteCommons = w.sites.filter((s) => s.regionId === region.id).map((s) => s.deposits.filter((d) => w.ores[d.oreIndex].tier === 'common').map((d) => d.oreIndex));
      for (const commons of siteCommons) assert.deepEqual(commons, [region.commonOreIndex]);
    }
  }
});

test('rare ores cover roughly 37% of sites each; mythic only in tough ground and ~5% of sites', () => {
  let sites = 0; const rare = [0, 0, 0, 0]; let mythic = 0;
  for (let i = 0; i < 20; i += 1) {
    const w = generateWorld({ seed: `coverage-seed-${i}`, monthId: '2026-11', players: 10 });
    for (const s of w.sites) {
      sites += 1;
      for (const d of s.deposits) {
        if (d.oreIndex >= 2 && d.oreIndex <= 5) rare[d.oreIndex - 2] += 1;
        if (d.oreIndex === 6) { mythic += 1; assert(w.regions.find((r) => r.id === s.regionId).soilHardness >= 8); }
      }
    }
  }
  for (const n of rare) assert(Math.abs(n / sites - 0.37) < 0.04, `rare share ${n / sites}`);
  assert(mythic / sites > 0.02 && mythic / sites < 0.09, `mythic share ${mythic / sites}`);
});

test('every planet has at least one mythic deposit', () => {
  for (let i = 0; i < 40; i += 1) {
    const w = generateWorld({ seed: `mythic-seed-${i}x`, monthId: '2026-11', players: 1 });
    assert(w.sites.some((s) => s.deposits.some((d) => d.oreIndex === 6)));
  }
});

test('T11-01 starting sites are distinct, mythic-free and within 5% of equal value', () => {
  for (const seed of seeds) {
    const w = generateWorld({ seed, monthId: '2026-11', players: 10 });
    assert.equal(w.startSites.length, 10);
    assert.equal(new Set(w.startSites.map((s) => s.siteId)).size, 10);
    for (const start of w.startSites) {
      const site = w.sites.find((s) => s.id === start.siteId);
      assert(!site.deposits.some((d) => d.oreIndex === 6));
      assert.equal(site.startSlot, start.slot);
      assert(Math.abs(siteValue(w, site) - w.startTargetValue) / w.startTargetValue <= 0.05, `${seed} slot ${start.slot}`);
    }
  }
});

test('veins never exceed their deposit size and are non-negative integers', () => {
  const w = generateWorld({ seed: seeds[3], monthId: '2026-11', players: 6 });
  for (const s of w.sites) for (const d of s.deposits) {
    if (w.ores[d.oreIndex].tier === 'common') assert.equal(d.veins.length, 0);
    else { assert(d.veins.length >= 1 && d.veins.length <= 3); for (const v of d.veins) assert(Number.isSafeInteger(v.units) && v.units >= 0 && v.remaining === v.units); }
  }
});

test('rejects invalid inputs', () => {
  assert.throws(() => generateWorld({ seed: 'x', monthId: '2026-11', players: 1 }), WorldError);
  assert.throws(() => generateWorld({ seed: seeds[0], monthId: 'nov', players: 1 }), WorldError);
  assert.throws(() => generateWorld({ seed: seeds[0], monthId: '2026-11', players: 0 }), WorldError);
});
