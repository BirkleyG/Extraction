import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../src/world.js';
import {
  HOUR_SECONDS, WEATHER_KINDS, EnvironmentError, weatherAt, groundedUntil, nextWeatherChange, soilModifier,
  bandForShaft, assignVeins, veinOutputFactor, veinWarning, mineFromVein,
} from '../src/environment.js';

const env = { weatherSeed: 'weather-seed-1', baseWeather: 'dust' };
const code = (c) => (e) => e instanceof EnvironmentError && e.code === c;

test('weather is deterministic, seed-sensitive and constant within an hour', () => {
  assert.deepEqual(weatherAt(env, 5000), weatherAt(env, 5000));
  assert.deepEqual(weatherAt(env, 7200), weatherAt(env, 7200 + 3599));
  const other = { ...env, weatherSeed: 'weather-seed-2' };
  let diff = 0;
  for (let h = 0; h < 200; h += 1) if (weatherAt(env, h * HOUR_SECONDS).kind !== weatherAt(other, h * HOUR_SECONDS).kind) diff += 1;
  assert(diff > 0);
});

test('weather never grounds two consecutive hours and has sane distribution', () => {
  const counts = Object.fromEntries(WEATHER_KINDS.map((k) => [k, 0]));
  let prev = false; let grounded = 0;
  for (let h = 0; h < 20000; h += 1) {
    const w = weatherAt(env, h * HOUR_SECONDS);
    counts[w.kind] += 1;
    if (w.grounded) { assert.equal(w.kind, 'storm'); assert(!prev, `consecutive grounded at ${h}`); grounded += 1; }
    prev = w.grounded;
  }
  assert(counts.storm > 0 && counts.clear > 0 && grounded > 0);
  assert(counts.dust / 20000 > 0.5 && counts.dust / 20000 < 0.8);
});

test('groundedUntil and nextWeatherChange', () => {
  let checked = 0;
  for (let h = 0; h < 3000; h += 1) {
    const sec = h * HOUR_SECONDS + 17;
    const until = groundedUntil(env, sec);
    if (weatherAt(env, sec).grounded) { checked += 1; assert.equal(until, (h + 1) * HOUR_SECONDS); assert(!weatherAt(env, until).grounded); } else assert.equal(until, sec);
  }
  assert(checked > 0);
  assert.equal(nextWeatherChange(0), 3600);
  assert.equal(nextWeatherChange(3599), 3600);
  assert.equal(nextWeatherChange(3600), 7200);
});

test('weather rejects invalid input', () => {
  assert.throws(() => weatherAt(null, 0), code('INVALID_ENV'));
  assert.throws(() => weatherAt({ weatherSeed: 'short', baseWeather: 'clear' }, 0), code('INVALID_ENV'));
  assert.throws(() => weatherAt({ weatherSeed: 'long-enough', baseWeather: 'fog' }, 0), code('INVALID_ENV'));
  for (const bad of [-1, 1.5, NaN, '5', Infinity]) assert.throws(() => weatherAt(env, bad), code('INVALID_SECOND'));
  assert.throws(() => groundedUntil(env, -1), code('INVALID_SECOND'));
  assert.throws(() => nextWeatherChange(-1), code('INVALID_SECOND'));
});

test('soil modifier values, bounds and errors', () => {
  assert.equal(soilModifier('basalt', 5), 1);
  assert(Math.abs(soilModifier('loam', 1) - 1.10 * 1.04) < 1e-12);
  assert(Math.abs(soilModifier('obsidian', 10) - 0.85 * 0.95) < 1e-12);
  for (const s of ['loam', 'basalt', 'shale', 'granite', 'obsidian']) for (let h = 1; h <= 10; h += 1) {
    const m = soilModifier(s, h); assert(m >= 0.5 && m <= 1.25);
  }
  assert.throws(() => soilModifier('mud', 5), code('UNKNOWN_SOIL'));
  assert.throws(() => soilModifier('loam', 0), code('INVALID_HARDNESS'));
  assert.throws(() => soilModifier('loam', 11), code('INVALID_HARDNESS'));
});

test('depth bands cover shafts 1..30', () => {
  const expect = (k) => (k <= 4 ? 'shallow' : k <= 12 ? 'middle' : k <= 20 ? 'deep' : 'deepest');
  for (let k = 1; k <= 30; k += 1) assert.equal(bandForShaft(k), expect(k));
  for (const bad of [0, 31, 1.5, NaN, '3']) assert.throws(() => bandForShaft(bad), code('INVALID_SHAFT'));
});

const world = generateWorld({ seed: 'seed-abcdefgh', monthId: '2026-11', players: 3 });
const sites = world.sites.filter((s) => s.deposits.some((d) => world.ores[d.oreIndex].tier !== 'common')).slice(0, 12);

test('assignVeins: distinct shafts, tier ranges, depth-scaled size, determinism, no mutation', () => {
  assert(sites.length >= 5);
  let total = 0; let mythic = 0;
  for (const site of sites) {
    const before = JSON.stringify([world.ores, site.deposits]);
    const veins = assignVeins({ seed: 'vein-seed-001', ores: world.ores, deposits: site.deposits });
    assert.equal(JSON.stringify([world.ores, site.deposits]), before);
    assert.deepEqual(veins, assignVeins({ seed: 'vein-seed-001', ores: world.ores, deposits: site.deposits }));
    assert.equal(new Set(veins.map((v) => v.shaftNumber)).size, veins.length);
    const units = site.deposits.flatMap((d) => d.veins.map((v) => v.units));
    for (const v of veins) {
      total += 1;
      assert(Number.isInteger(v.size) && v.size >= 1 && v.size === v.remaining);
      if (v.tier === 'rare') assert(v.shaftNumber >= 5 && v.shaftNumber <= 20);
      else { assert.equal(v.tier, 'mythic'); mythic += 1; assert(v.shaftNumber >= 21 && v.shaftNumber <= 30); }
      const di = Number(v.id.split('-')[1]); const vi = Number(v.id.split('-')[2]);
      assert.equal(v.size, Math.round(site.deposits[di].veins[vi].units * (1 + 0.05 * (v.shaftNumber - 5))));
    }
    assert(veins.length <= units.filter((u) => u > 0).length);
  }
  assert(total > 0);
  assert(mythic >= 0);
});

test('assignVeins: seed sensitivity, size grows with depth, skips empty, drops excess', () => {
  const ores = [{ id: 'a', tier: 'common' }, { id: 'b', tier: 'rare' }, { id: 'c', tier: 'mythic' }];
  const mk = (n, units = 1000) => [{ oreIndex: 0, veins: [] }, { oreIndex: 1, veins: Array.from({ length: n }, () => ({ units, remaining: units })) }];
  const bySeed = new Set();
  for (let i = 0; i < 20; i += 1) bySeed.add(JSON.stringify(assignVeins({ seed: `seed-number-${i}`, ores, deposits: mk(3) })));
  assert(bySeed.size > 1);
  const full = assignVeins({ seed: 'seed-number-x', ores, deposits: mk(20) });
  assert.equal(full.length, 16); // shafts 5..20 only
  for (const v of full) assert(v.size === Math.round(1000 * (1 + 0.05 * (v.shaftNumber - 5))));
  const sorted = [...full].sort((a, b) => a.shaftNumber - b.shaftNumber);
  for (let i = 1; i < sorted.length; i += 1) assert(sorted[i].size > sorted[i - 1].size);
  assert.equal(assignVeins({ seed: 'seed-number-x', ores, deposits: mk(2, 0) }).length, 0);
  const myth = assignVeins({ seed: 'seed-number-x', ores, deposits: [{ oreIndex: 2, veins: Array.from({ length: 15 }, () => ({ units: 500, remaining: 500 })) }] });
  assert.equal(myth.length, 10);
  assert(myth.every((v) => v.shaftNumber >= 21));
  assert.throws(() => assignVeins({ seed: 'short', ores, deposits: [] }), code('INVALID_SEED'));
  assert.throws(() => assignVeins({ seed: 'seed-number-x', ores, deposits: [{ oreIndex: 9, veins: [] }] }), code('INVALID_DEPOSIT'));
});

test('veinWarning thresholds at exact boundaries', () => {
  const w = (remaining) => veinWarning({ size: 1000, remaining });
  assert.equal(w(1000), null);
  assert.equal(w(200), null);
  assert.equal(w(199), 'LOW');
  assert.equal(w(50), 'LOW');
  assert.equal(w(49), 'CRITICAL');
  assert.equal(w(1), 'CRITICAL');
  assert.equal(w(0), 'DEPLETED');
});

test('veinOutputFactor taper', () => {
  const f = (remaining) => veinOutputFactor({ size: 1000, remaining });
  assert.equal(f(1000), 1);
  assert.equal(f(50), 1);
  assert.equal(f(25), 0.5);
  assert.equal(f(1), 0.02);
  assert.equal(f(0), 0);
});

test('T04-02 depleting a vein drops output to zero (common-only) and never produces negative units', () => {
  let vein = { id: 'v', size: 1000, remaining: 1000 };
  let steps = 0;
  while (veinOutputFactor(vein) > 0) {
    const r = mineFromVein(vein, 7.3);
    assert(r.mined >= 0 && r.vein.remaining >= 0 && r.vein.remaining <= vein.remaining);
    vein = r.vein; steps += 1;
    assert(steps < 100000);
  }
  assert.equal(vein.remaining, 0);
  assert.equal(veinWarning(vein), 'DEPLETED');
  const after = mineFromVein(vein, 100);
  assert.equal(after.mined, 0);
  assert.equal(after.vein.remaining, 0);
});

test('T04-03 sum of mined units never exceeds vein size', () => {
  for (const [size, step] of [[1000, 0.001 * 1000], [1000, 1e9], [12345, 0.37], [1, 1e-9], [500, 3.3]]) {
    let vein = { size, remaining: size }; let sum = 0; let n = 0;
    while (vein.remaining > 0 && n < 3_000_000) {
      const r = mineFromVein(vein, step);
      assert(r.mined >= 0);
      sum += r.mined; vein = r.vein; n += 1;
    }
    assert(sum <= size + 1e-6, `sum ${sum} > size ${size}`);
    assert(size - vein.remaining <= size);
  }
  const big = mineFromVein({ size: 100, remaining: 100 }, 1e12);
  assert.equal(big.mined, 100);
  const input = { size: 100, remaining: 50 };
  mineFromVein(input, 10);
  assert.deepEqual(input, { size: 100, remaining: 50 });
});

test('mining and vein inputs reject invalid values', () => {
  const v = { size: 100, remaining: 100 };
  for (const bad of [-1, NaN, Infinity, '5', undefined]) assert.throws(() => mineFromVein(v, bad), code('INVALID_UNITS'));
  assert.throws(() => mineFromVein({ size: 0, remaining: 0 }, 1), code('INVALID_VEIN'));
  assert.throws(() => veinWarning(null), code('INVALID_VEIN'));
  assert.throws(() => veinOutputFactor({ size: 10, remaining: -1 }), code('INVALID_VEIN'));
});
