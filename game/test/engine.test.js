import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../shared/engine/index.js';

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;

const PLANET = {
  id: 'test', seed: 99,
  ores: [
    { id: 'gravel', name: 'Gravel', tier: 'common', hardness: 1, depthMin: 0 },
    { id: 'slate', name: 'Slate', tier: 'common', hardness: 2, depthMin: 2 },
    { id: 'amber', name: 'Amber', tier: 'rare', hardness: 2, depthMin: 1 },
    { id: 'jade', name: 'Jade', tier: 'rare', hardness: 3, depthMin: 3 },
    { id: 'ruby', name: 'Ruby', tier: 'rare', hardness: 5, depthMin: 6 },
    { id: 'opal', name: 'Opal', tier: 'rare', hardness: 7, depthMin: 10, baseValue: 12 },
    { id: 'star', name: 'Starheart', tier: 'mythic', hardness: 9, depthMin: 15 },
  ],
  buyers: [
    { id: 'depot', name: 'Ring Depot', distance: 'near', likes: { gravel: 1, amber: 0.9 } },
    { id: 'forge', name: 'Forge Moon', distance: 'mid', likes: { amber: 1.4, jade: 1.3 } },
    { id: 'court', name: 'Velvet Court', distance: 'far', likes: { ruby: 1.5, star: 5, gravel: 0.8 } },
    { id: 'scrap', name: 'Scrap Yard', distance: 'mid', likes: { gravel: 1.2 } },
  ],
};

const newWorld = () => ({ month: 'test', planet: PLANET, market: {}, startedAt: 0, endsAt: 30 * DAY, events: [], changes: [] });
// A site in the Phase 3.5 shape: gravel ground, every rare present, and the mythic ore (a mythic site).
const SITE = { id: 'site1', regionId: 'r1', soil: 1, common: 'gravel',
  richness: { gravel: 1, slate: 0, amber: 0.8, jade: 0.6, ruby: 0.5, opal: 0.4, star: 0.9 },
  veinSize: { gravel: 1, slate: 1, amber: 1, jade: 1, ruby: 1, opal: 1, star: 1 } };
const fresh = (now = 0, site = SITE) => E.newColony({ id: 'c1', uid: 'u1', name: 'Test', species: 'Mole', planet: PLANET, siteRegion: 'r1', site, now });
const sid = (c, k = 0) => c.shafts[k].id;
const buyN = (c, w, n, dir = 'left') => { for (let i = 0; i < n; i++) c = run(c, w, { type: 'buyShaft', dir }); return c; };

// Unlock every panel and give coin (licenses still follow the day of the month).
function rich(c, w, coin = 1e12) {
  c = JSON.parse(JSON.stringify(c));
  c.coin = coin;
  c.earned = Math.max(c.earned, 1e9);
  c.grant = Math.max(c.grant || 0, 1); // skip panel time gates in fixtures
  return E.advance(c, w, c.t).colony;
}
function run(c, w, cmd, now = c.t) {
  const r = E.applyCommand(c, w, cmd, now);
  assert.equal(r.error, undefined, `${cmd.type}: ${r.error}`);
  return r.colony;
}
function midgame(w) {
  let c = rich(fresh(0), w, 1e22);
  c = buyN(c, w, 7);
  for (const s of c.shafts) {
    c = run(c, w, { type: 'hireMiners', shaftId: s.id, n: 60 });
    c = run(c, w, { type: 'upgradeGear', shaftId: s.id, n: 7 });
    c = run(c, w, { type: 'upgradeCart', shaftId: s.id, n: 60 });
  }
  c = run(c, w, { type: 'upgradeLift', kind: 'speed', n: 40 });
  c = run(c, w, { type: 'upgradeLift', kind: 'capacity', n: 40 });
  c = run(c, w, { type: 'upgradeLift', kind: 'buckets', n: 20 });
  c = run(c, w, { type: 'upgradeConveyor', n: 50 });
  c = run(c, w, { type: 'upgradeYard', n: 30 });
  c = run(c, w, { type: 'buyPad', n: 'max' });
  for (let i = 0; i < 5; i++) c = run(c, w, { type: 'buyShip', cls: 'hauler' });
  c = run(c, w, { type: 'buyShip', cls: 'cruiser' });
  c = run(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'hold', n: 40 });
  c = run(c, w, { type: 'upgradeClass', cls: 'cruiser', kind: 'hold', n: 40 });
  c.coin = 0;
  return c;
}
function walkNumbers(o, path, out) {
  if (typeof o === 'number') { out.push([path, o]); return out; }
  if (o && typeof o === 'object') for (const k in o) walkNumbers(o[k], path + '.' + k, out);
  return out;
}
function assertSane(c, label = '') {
  for (const [p, v] of walkNumbers(c, 'c', [])) {
    assert.ok(Number.isFinite(v), `${label} ${p} is ${v}`);
    if (!/\.(seed|rng)$/.test(p)) assert.ok(v >= 0, `${label} ${p} is negative: ${v}`);
  }
}
const rel = (a, b) => Math.abs(a - b) / Math.max(1, Math.abs(a), Math.abs(b));
function deepFreeze(o) { if (o && typeof o === 'object') { Object.freeze(o); for (const k in o) deepFreeze(o[k]); } return o; }

test('newColony: plain JSON starter colony', () => {
  const c = fresh(1000);
  assert.equal(c.v, E.ENGINE_VERSION);
  assert.equal(E.ENGINE_VERSION, 6);
  assert.equal(c.shafts.length, 1);
  assert.equal(c.shafts[0].ore, 'gravel');
  assert.equal(c.shafts[0].face, 0);
  assert.ok(Array.isArray(c.shafts[0].pk));
  assert.equal(c.ships.length, 1);
  assert.equal(c.shafts[0].miners, E.TUNING.startMiners, 'the free first shaft starts with a few miners');
  assert.equal(c.miners, E.TUNING.startMiners);
  assert.equal(c.shafts[0].gear, 1); assert.equal(c.shafts[0].cart, 1);
  assert.deepEqual(c.lift, { speed: 0, capacity: 0, buckets: 0 });
  assert.ok(c.coin >= E.quote(c, newWorld(), { type: 'hireMiners', shaftId: sid(c) }).cost, 'can afford another miner');
  assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
  assert.deepEqual(E.unlocks(c, newWorld(), 1000).panels, ['mine', 'hire']);
  // the site is stored; without one a default is derived (first common, rares at 0.37, no mythic)
  assert.deepEqual(c.site, SITE);
  const d = E.newColony({ id: 'd', uid: 'd', planet: PLANET, siteRegion: 'rX', now: 0 });
  assert.equal(d.site.common, 'gravel'); assert.equal(d.site.regionId, 'rX'); assert.equal(d.site.soil, 1);
  assert.deepEqual([d.site.richness.amber, d.site.richness.jade, d.site.richness.ruby, d.site.richness.opal, d.site.richness.star], [0.37, 0.37, 0.37, 0.37, 0]);
});

test('determinism: same inputs give identical colonies', () => {
  const script = () => {
    const w = newWorld();
    let c = fresh(0);
    c = run(c, w, { type: 'hireMiners', shaftId: sid(c) }, 1000);
    for (let t = 10_000; t < 30 * MIN; t += 7_000) {
      c = E.advance(c, w, t).colony;
      const best = E.bestMoves(c, w, { limit: 1 })[0];
      if (best && best.canAfford) for (const st of best.steps) { const r = E.applyCommand(c, w, st, t); if (!r.error) c = r.colony; }
    }
    return E.advance(c, w, 2 * DAY);
  };
  const a = script(), b = script();
  assert.deepEqual(a.colony, b.colony);
  assert.deepEqual(a.events, b.events);
});

test('advance is pure and does not mutate its input', () => {
  const w = newWorld();
  const c = deepFreeze(midgame(w));
  const before = JSON.stringify(c);
  const r = E.advance(c, deepFreeze(w), c.t + DAY);
  assert.notEqual(r.colony, c);
  assert.equal(JSON.stringify(c), before);
  const r2 = E.applyCommand(c, w, { type: 'upgradeLift', kind: 'speed', n: 1 }, c.t + HOUR);
  assert.ok(r2.colony.coin >= 0);
  assert.equal(JSON.stringify(c), before);
});

test('step invariance: 3 days in one call vs 1-minute calls agree within 0.5%', () => {
  const w = newWorld();
  const c = midgame(w);
  const end = c.t + 3 * DAY;
  const one = E.advance(c, w, end).colony;
  let many = c;
  for (let t = c.t + MIN; t <= end; t += MIN) many = E.advance(many, w, t).colony;
  let odd = c, t = c.t, s = 11;
  while (t < end) { s = (s * 16807) % 2147483647; t = Math.min(end, t + 500 + (s % (3 * HOUR))); odd = E.advance(odd, w, t).colony; }
  for (const x of [many, odd]) {
    assert.ok(rel(one.coin, x.coin) < 0.005, `coin ${one.coin} vs ${x.coin}`);
    assert.ok(rel(one.earned, x.earned) < 0.005);
    assert.ok(rel(one.stats.mined, x.stats.mined) < 0.005, `mined ${one.stats.mined} vs ${x.stats.mined}`);
    assert.ok(rel(one.stats.sold, x.stats.sold) < 0.005);
    const face = (y) => y.shafts.reduce((a, q) => a + q.face, 0), dug = (y) => y.shafts.reduce((a, q) => a + q.dug, 0);
    assert.ok(rel(face(one), face(x)) < 0.005, `faces ${face(one)} vs ${face(x)}`);
    assert.ok(Math.abs(dug(one) - dug(x)) <= 1, `pockets dug ${dug(one)} vs ${dug(x)}`);
  }
  assert.ok(one.earned > 0);
  assert.ok(one.shafts.reduce((a, q) => a + q.dug, 0) >= 1, 'tunnels crossed a vein boundary');
});

test('offline 3-day catch-up runs fast and pays at about the live rate', () => {
  const w = newWorld();
  const c = midgame(w);
  const live = E.rates(c, w).coinPerMin;
  const t0 = performance.now();
  const r = E.advance(c, w, c.t + 3 * DAY);
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `took ${ms}ms`);
  const gained = r.colony.coin - c.coin;
  assert.ok(gained > 0.3 * live * 3 * 24 * 60, `gained ${gained} vs live ${live}/min`);
  assert.ok(gained < 4 * live * 3 * 24 * 60, `gained ${gained} vs live ${live}/min x 3d = ${live * 4320}`);
  assertSane(r.colony, 'offline');
  const summary = r.events.find((e) => e.type === 'sales');
  assert.ok(summary && summary.data.coin > 0 && Object.keys(summary.data.ore).length > 0);
  assert.ok(r.sales.length > 0 && r.sales.every((s) => s.amount > 0 && PLANET.ores.some((o) => o.id === s.oreId)));
  assert.ok(r.events.filter((e) => e.type === 'sale').length <= 12, 'per-ship sale events are capped');
  assert.ok(JSON.stringify(r.events).length < 20_000);
});

test('commands: hireMiners with n = 1, 10, 100 and max; cost rises with the shaft', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 1e7);
  const s0 = sid(c);
  const q1 = E.quote(c, w, { type: 'hireMiners', shaftId: s0, n: 1 });
  const q10 = E.quote(c, w, { type: 'hireMiners', shaftId: s0, n: 10 });
  const q100 = E.quote(c, w, { type: 'hireMiners', shaftId: s0, n: 90 });
  assert.equal(q1.n, 1); assert.equal(q10.n, 10); assert.equal(q100.n, 90);
  assert.ok(q10.cost > 10 * q1.cost && q100.cost > q10.cost, 'rising cost');
  assert.match(q10.effect, /\+10 miners in Shaft 1 \(3 → 13\)/);
  c.coin = 5000;
  const qm = E.quote(c, w, { type: 'hireMiners', shaftId: s0, n: 'max' });
  assert.ok(qm.n > 1 && qm.cost <= c.coin && qm.canAfford);
  assert.ok(E.quote(c, w, { type: 'hireMiners', shaftId: s0, n: qm.n + 1 }).cost > c.coin, 'max is the largest affordable');
  const after = run(c, w, { type: 'hireMiners', shaftId: s0, n: 'max' });
  assert.equal(after.shafts[0].miners, 3 + qm.n);
  assert.equal(after.miners, 3 + qm.n);
  assert.ok(Math.abs(after.coin - (5000 - qm.cost)) < 1e-6);
  const full = run({ ...after, coin: 1e300 }, w, { type: 'hireMiners', shaftId: s0, n: 'max' });
  assert.equal(full.shafts[0].miners, E.TUNING.hire.max);
  assert.match(E.quote(full, w, { type: 'hireMiners', shaftId: s0 }).error, /fully crewed/);
  const poor = { ...after, coin: 0 };
  const qp = E.quote(poor, w, { type: 'hireMiners', shaftId: s0, n: 'max' });
  assert.equal(qp.canAfford, false);
  assert.ok(qp.cost > 0, 'max with no coin still shows the next price');
  assert.match(E.quote(c, w, { type: 'hireMiners', shaftId: 'nope' }).error, /No such shaft/);
  // deeper shafts: a miner costs far more
  const deep = buyN(rich(fresh(0), w, 1e22), w, 3);
  const cost = (k) => E.quote(deep, w, { type: 'hireMiners', shaftId: sid(deep, k) }).cost;
  assert.ok(cost(1) > 4 * cost(0) && cost(2) > 4 * cost(1) && cost(3) > 4 * cost(2), 'miners cost more with the shaft index');
});

test('shaftOptions: exactly 2 directions, different, deterministic, with fuzzy prospects and the cost', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 1e22);
  const o1 = E.shaftOptions(c, w), o2 = E.shaftOptions(JSON.parse(JSON.stringify(c)), w);
  assert.deepEqual(o1, o2, 'deterministic');
  assert.equal(o1.length, 2);
  assert.deepEqual(o1.map((o) => o.dir), ['left', 'right']);
  assert.notEqual(o1[0].seed, o1[1].seed, 'each option has its own seed');
  for (const o of o1) {
    assert.equal(o.cost, E.quote(c, w, { type: 'buyShaft', dir: o.dir }).cost);
    assert.equal(o.idx, 1);
    assert.deepEqual(Object.keys(o.prospects).sort(), PLANET.ores.map((x) => x.id).sort());
    assert.ok(Object.values(o.prospects).every((p) => ['none', 'low', 'fair', 'good'].includes(p)));
    assert.equal(o.prospects.gravel, 'good', "the site's common is always there");
    assert.equal(o.prospects.slate, 'none', 'ores absent from the site are none');
    assert.equal(o.prospects.star, 'none', 'no mythic above the deepest band');
  }
  // across the shafts of a month, the two options differ in their prospects and one is often better
  let differ = 0, rounds = 0;
  for (let i = 0; i < 12; i++) {
    const [a, b] = E.shaftOptions(c, w);
    rounds++;
    if (JSON.stringify(a.prospects) !== JSON.stringify(b.prospects)) differ++;
    c = run(c, w, { type: 'buyShaft', dir: i % 2 ? 'right' : 'left' });
  }
  assert.ok(differ >= rounds / 2, `options differ in ${differ}/${rounds} shafts`);
  assert.deepEqual(E.shaftOptions(c, w).map((o) => o.band), ['deepest', 'deepest']);
  // a new colony with another seed sees other tilts
  const other = E.newColony({ id: 'c2', uid: 'u2', planet: PLANET, site: SITE, now: 0 });
  assert.notDeepEqual(E.shaftOptions(other, w).map((o) => o.seed), E.shaftOptions(fresh(0), w).map((o) => o.seed));
  // the tunnel is full at 30
  const full = buyN(rich(fresh(0), w, 1e300), w, 29);
  assert.equal(full.shafts.length, 30);
  assert.deepEqual(E.shaftOptions(full, w), []);
  assert.match(E.applyCommand(full, w, { type: 'buyShaft', dir: 'left' }, 0).error, /full/);
});

test('buyShaft {dir}: starts with 0 miners, gear 1, cart 1; the chosen direction sets the shaft', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 1e12);
  assert.match(E.applyCommand(c, w, { type: 'buyShaft' }, c.t).error, /direction/);
  assert.match(E.applyCommand(c, w, { type: 'buyShaft', dir: 'up' }, c.t).error, /direction/);
  const q = E.quote(c, w, { type: 'buyShaft', dir: 'right' });
  assert.match(q.effect, /^Shaft 2 \(shallow, right\): Gravel/);
  assert.ok(q.cost >= 1e6, 'monumental');
  const before = c.coin;
  const [oL, oR] = E.shaftOptions(c, w);
  c = run(c, w, { type: 'buyShaft', dir: 'right' });
  assert.equal(c.shafts.length, 2);
  const ns = c.shafts[1];
  assert.equal(ns.miners, 0); assert.equal(ns.gear, 1); assert.equal(ns.cart, 1);
  assert.equal(ns.dir, 'right'); assert.equal(ns.band, 'shallow'); assert.equal(ns.seed, oR.seed); assert.notEqual(ns.seed, oL.seed);
  assert.equal(ns.face, 0);
  assert.equal(ns.ore, 'gravel', 'a new tunnel starts on common ore');
  assert.ok(Math.abs(before - c.coin - q.cost) < 1e-6);
  assert.equal(c.miners, E.TUNING.startMiners, 'the new shaft has no crew');
  assert.equal(E.rates(c, w).shafts[1].orePerMin, 0);
  // the other direction gives another tunnel
  const d = run(rich(fresh(0), w, 1e12), w, { type: 'buyShaft', dir: 'left' });
  assert.notDeepEqual(d.shafts[1].pk, ns.pk);
  // each shaft costs about 10x the one before
  const costs = [];
  let x = rich(fresh(0), w, 1e30);
  for (let i = 0; i < 6; i++) { costs.push(E.quote(x, w, { type: 'buyShaft', dir: 'left' }).cost); x = run(x, w, { type: 'buyShaft', dir: 'left' }); }
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] / costs[i - 1] >= 10 && costs[i] / costs[i - 1] <= 20, `shaft ${i + 2} costs x${costs[i] / costs[i - 1]}`);
});

test('shafts own their miners: no transfers, hiring and upgrades are per shaft', () => {
  const w = newWorld();
  let c = buyN(rich(fresh(0), w, 1e15), w, 2);
  const [a, b, d] = c.shafts.map((s) => s.id);
  assert.deepEqual(c.shafts.map((s) => s.miners), [3, 0, 0]);
  c = run(c, w, { type: 'hireMiners', shaftId: b, n: 5 });
  assert.deepEqual(c.shafts.map((s) => s.miners), [3, 5, 0]);
  assert.equal(c.miners, 8);
  c = run(c, w, { type: 'upgradeGear', shaftId: b, n: 2 });
  c = run(c, w, { type: 'upgradeCart', shaftId: d, n: 3 });
  assert.deepEqual(c.shafts.map((s) => [s.miners, s.gear, s.cart]), [[3, 1, 1], [5, 3, 1], [0, 1, 4]]);
  // no way to move a miner: there is no such command, and time never reassigns them
  for (const type of ['hire', 'moveMiners', 'transfer', 'assign', 'upgradeDrill']) assert.equal(E.applyCommand(c, w, { type, shaftId: a, to: b, n: 1 }, c.t).error, 'Unknown command', type);
  assert.deepEqual(E.advance(c, w, c.t + 3 * DAY).colony.shafts.map((s) => s.miners), [3, 5, 0]);
  // idle shafts make nothing; a crewed shaft makes ore
  const r = E.rates(c, w).shafts;
  assert.equal(r[2].orePerMin, 0); assert.ok(r[0].orePerMin > 0 && r[1].orePerMin > 0);
  // the old global commands and bunks are gone
  assert.equal(E.applyCommand(c, w, { type: 'upgradeShaft', shaftId: a, kind: 'bunk' }, c.t).error, 'Unknown upgrade');
  assert.ok(!E.candidateMoves(c, w).some((m) => ['hire', 'upgradeDrill'].includes(m.type)));
});

test('cart caps production; gear and carts get milestone bonuses', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 1e15);
  const s = sid(c);
  c = run(c, w, { type: 'hireMiners', shaftId: s, n: 20 });
  const T = E.TUNING;
  let r = E.rates(c, w).shafts[0];
  const crew = 23 * T.minePerMiner;               // gear 1, shaft 1, soil 1
  assert.ok(Math.abs(r.crew - crew) < 1e-9);
  assert.ok(Math.abs(r.cap - T.cart.rate) < 1e-9, 'cart 1 hauls the base rate');
  assert.ok(Math.abs(r.orePerMin - T.cart.rate) < 1e-9 && r.limit === 'cart', 'the cart caps the crew');
  assert.ok(r.orePerMin < crew);
  // a better cart lifts the cap; more miners above the cap add nothing
  const more = run(c, w, { type: 'hireMiners', shaftId: s, n: 10 });
  assert.ok(Math.abs(E.rates(more, w).shafts[0].orePerMin - T.cart.rate) < 1e-9, 'miners past the cart add nothing');
  const cart = run(c, w, { type: 'upgradeCart', shaftId: s, n: 4 });
  const rc = E.rates(cart, w).shafts[0];
  assert.ok(Math.abs(rc.cap - T.cart.rate * (1 + T.cart.add * 4)) < 1e-9);
  assert.ok(Math.abs(rc.orePerMin - Math.min(crew, rc.cap)) < 1e-9);
  assert.equal(E.bottleneck(c, w).stage === 'cart' || E.bottleneck(c, w).stage === 'lift', true);
  // soil slows the crew, not the cart
  const hard = E.newColony({ id: 'h', uid: 'h', planet: PLANET, site: { ...SITE, soil: 1.25 }, now: 0 });
  assert.ok(Math.abs(E.rates(hard, w).shafts[0].crew - 3 * T.minePerMiner / 1.25) < 1e-9);
  // milestones: x2 at 25, 50, 100 on top of the per-level gain
  const pm = (g) => E.rates({ ...c, shafts: [{ ...c.shafts[0], gear: g }] }, w).shafts[0].perMiner;
  assert.ok(Math.abs(pm(25) / pm(24) - 2 * (1 + T.gear.add * 24) / (1 + T.gear.add * 23)) < 1e-9, 'gear 25 doubles');
  assert.ok(pm(50) / pm(49) > 2 && pm(100) / pm(99) > 2 && pm(26) / pm(25) < 1.1);
  const cp = (k) => E.rates({ ...c, shafts: [{ ...c.shafts[0], cart: k }] }, w).shafts[0].cap;
  assert.ok(cp(25) / cp(24) > 2 && cp(50) / cp(49) > 2 && cp(24) / cp(23) < 1.1);
  // quotes announce the milestone
  const lic = { ...c, unlocked: { ...c.unlocked, licenses: [...c.unlocked.licenses, 'mythicDrill'] } };
  assert.match(E.quote({ ...lic, shafts: [{ ...c.shafts[0], gear: 24 }] }, w, { type: 'upgradeGear', shaftId: s }).effect, /milestone x2/);
});

test('lift: buckets x capacity x trips per minute, from three upgrades; depth slows it', () => {
  const w = newWorld();
  const T = E.TUNING, L = T.lift;
  let c = rich(fresh(0), w, 1e18);
  const lift = (x) => E.rates(x, w).liftPerMin;
  const base = L.buckets.base * L.capacity.base * L.speed.base;
  assert.ok(Math.abs(lift(c) - base) < 1e-9, `fresh lift ${lift(c)} vs ${base}`);
  c = run(c, w, { type: 'upgradeLift', kind: 'speed', n: 3 });
  assert.ok(Math.abs(lift(c) - base * Math.pow(L.speed.mult, 3)) < 1e-6, 'speed');
  c = run(c, w, { type: 'upgradeLift', kind: 'capacity', n: 5 });
  assert.ok(Math.abs(lift(c) - base * Math.pow(L.speed.mult, 3) * Math.pow(L.capacity.mult, 5)) < 1e-6, 'capacity');
  c = run(c, w, { type: 'upgradeLift', kind: 'buckets', n: 2 });
  const full = base * Math.pow(L.speed.mult, 3) * Math.pow(L.capacity.mult, 5) * (L.buckets.base + 2 * L.buckets.add) / L.buckets.base;
  assert.ok(Math.abs(lift(c) - full) < 1e-6, 'buckets');
  assert.deepEqual(c.lift, { speed: 3, capacity: 5, buckets: 2 });
  for (const kind of ['speed', 'capacity', 'buckets']) {
    const q = E.quote(c, w, { type: 'upgradeLift', kind, n: 10 });
    assert.equal(q.n, 10); assert.ok(q.cost > 0 && /lift .* → .*\/min/.test(q.effect), q.effect);
  }
  assert.match(E.quote(c, w, { type: 'upgradeLift' }).error, /speed, capacity or buckets/);
  assert.match(E.quote(c, w, { type: 'upgradeLift', kind: 'wheels' }).error, /speed, capacity or buckets/);
  assert.ok(E.quote(c, w, { type: 'upgradeLift', kind: 'buckets', n: 100 }).n <= 100);
  // the deepest working shaft slows the trips; an empty deep shaft doesn't
  let d = buyN(c, w, 7);
  assert.ok(Math.abs(lift(d) - full) < 1e-6, 'a shaft without miners does not slow the lift');
  d = run(d, w, { type: 'hireMiners', shaftId: sid(d, 7), n: 1 });
  assert.ok(Math.abs(lift(d) - full / (1 + L.depthSlow * 7)) < 1e-6, 'trips slow with depth');
  // evolution multiplies the lift as before
  assert.ok(Math.abs(E.rates({ ...c, evo: { ...c.evo, mine: 1 } }, w).liftPerMin / lift(c) - (1 + T.evo.mine.per)) < 1e-9);
});

test('gear: hardness 1-10 gates veins; gear above 8 needs the mythic drill license', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 1e30);
  c = buyN(c, w, 1);
  const T = E.TUNING;
  assert.equal(T.gear.free, 8);
  // a vein of hardness 5 (ruby) stops a gear-3 shaft but not a gear-5 one
  const ruby = (x) => withVein(x, 1, { ore: 'ruby', start: 0, len: 100 });
  let b = run(ruby(c), w, { type: 'hireMiners', shaftId: sid(c, 1), n: 6 });
  b = run(b, w, { type: 'upgradeGear', shaftId: sid(c, 1), n: 2 });
  let r = E.rates(b, w).shafts[1];
  assert.equal(r.blocked, true); assert.equal(r.need, 5); assert.equal(r.gear, 3);
  assert.equal(r.reason, 'Needs gear 5 to break into Ruby');
  b = run(b, w, { type: 'upgradeGear', shaftId: sid(c, 1), n: 2 });
  assert.equal(E.rates(b, w).shafts[1].blocked, false, 'gear >= hardness cuts it');
  // common ore needs no gear; rare 3 (jade) needs gear 3
  const jade = withVein(c, 1, { ore: 'jade', start: 0, len: 100 });
  assert.equal(E.rates(run(run(jade, w, { type: 'hireMiners', shaftId: sid(c, 1) }), w, { type: 'upgradeGear', shaftId: sid(c, 1) }), w).shafts[1].blocked, true, 'gear 2 < jade 3');
  // gear levels above 8 need the licence (day 3 and 3M earned)
  const early = { ...c, earned: 2e6 };
  const g8 = run(early, w, { type: 'upgradeGear', shaftId: sid(c, 1), n: 7 });
  assert.equal(g8.shafts[1].gear, 8);
  const noLic = E.applyCommand(g8, w, { type: 'upgradeGear', shaftId: sid(c, 1) }, g8.t);
  assert.match(noLic.error, /Mythic drill license/);
  assert.match(E.quote(g8, w, { type: 'upgradeGear', shaftId: sid(c, 1), n: 'max' }).error, /Mythic drill license/);
  const capped = run(early, w, { type: 'upgradeGear', shaftId: sid(c, 1), n: 'max' });
  assert.equal(capped.shafts[1].gear, 8, 'max stops at 8 without the licence');
  const licensed = E.advance({ ...g8, earned: 4e6 }, w, 3 * DAY).colony;
  assert.ok(licensed.unlocked.licenses.includes('mythicDrill'));
  const g12 = run({ ...licensed, coin: 1e30 }, w, { type: 'upgradeGear', shaftId: sid(c, 1), n: 4 });
  assert.equal(g12.shafts[1].gear, 12);
  // mythic ore is hardness 9-10: gear 8 can't cut it, gear 9 can
  const star = (x, gear) => { const y = withVein(x, 1, { ore: 'star', start: 0, len: 100 }); y.shafts[1].gear = gear; return E.rates(y, w).shafts[1]; };
  assert.equal(star(licensed, 8).blocked, true);
  assert.match(star(licensed, 8).reason, /Needs gear 9 \(the Mythic drill license\) to break into Starheart/);
  assert.equal(star(licensed, 9).blocked, false);
  assert.equal(PLANET.ores.find((o) => o.id === 'star').hardness, 9);
});

test('commands: conveyor, yard, pads', () => {
  const w = newWorld();
  let c = rich(fresh(0), w);
  for (const type of ['upgradeConveyor', 'upgradeYard']) {
    const q = E.quote(c, w, { type, n: 10 });
    assert.equal(q.n, 10);
    assert.match(q.effect, /^\+\d+% .*\(.* → .*\)/);
    c = run(c, w, { type, n: 10 });
  }
  assert.equal(c.conveyor, 10); assert.equal(c.yardLvl, 10);
  c = run(c, w, { type: 'buyPad', n: 'max' });
  assert.equal(c.pads, E.TUNING.padMax);
  assert.match(E.applyCommand(c, w, { type: 'buyPad' }, c.t).error, /pads/);
  assert.match(E.applyCommand(c, w, { type: 'upgradeDrill' }, c.t).error, /Unknown command/, 'the drill is the per-shaft gear now');
});

test('commands: ships, routes, rename, tutorial, errors', () => {
  const w = newWorld();
  let c = rich(fresh(0), w);
  assert.match(E.applyCommand(c, w, { type: 'buyShip', cls: 'freighter' }, 0).error, /Freighter license/);
  const q = E.quote(c, w, { type: 'buyShip', cls: 'hauler' });
  assert.match(q.effect, /New Hauler/);
  c = run(c, w, { type: 'buyShip', cls: 'hauler' });
  c = run(c, w, { type: 'buyShip', cls: 'cruiser' });
  assert.deepEqual(c.ships.map((s) => s.cls), ['hauler', 'hauler', 'cruiser']);
  assert.ok(E.quote(c, w, { type: 'buyShip', cls: 'hauler' }).cost > q.cost, 'each ship costs more');
  const sh = c.ships[1];
  const qs = E.quote(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'hold', n: 10 });
  assert.match(qs.effect, /cargo per ship \(.* → .*\)/);
  c = run(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'hold', n: 10 });
  assert.equal(c.fleet.hauler.hold, 10);
  assert.equal(E.applyCommand(c, w, { type: 'upgradeShip', shipId: sh.id }, c.t).error, 'Unknown command');
  c = run(c, w, { type: 'setRoute', shipId: sh.id, policy: 'fixed', destId: 'court' });
  assert.equal(c.ships[1].policy, 'fixed'); assert.equal(c.ships[1].destId, 'court');
  assert.match(E.applyCommand(c, w, { type: 'setRoute', shipId: sh.id, policy: 'fixed', destId: 'mars' }, c.t).error, /destination/);
  assert.match(E.applyCommand(c, w, { type: 'setRoute', shipId: sh.id, policy: 'warp' }, c.t).error, /policy/);
  c = run(c, w, { type: 'rename', target: 'colony', name: '  <b>Deep   Rock</b> Galactic Mining Company  ' });
  assert.ok(c.name.length <= 24 && !/[<>]/.test(c.name), c.name);
  assert.equal(c.name, 'bDeep Rock/b Galactic Mi');
  c = run(c, w, { type: 'rename', target: 'ship', id: sh.id, name: 'Big Bertha' });
  c = run(c, w, { type: 'rename', target: 'shaft', id: c.shafts[0].id, name: 'The Pit' });
  assert.equal(c.ships[1].name, 'Big Bertha'); assert.equal(c.shafts[0].name, 'The Pit');
  assert.match(E.applyCommand(c, w, { type: 'rename', target: 'ship', id: 'x', name: 'A' }, c.t).error, /Not found/);
  assert.match(E.applyCommand(c, w, { type: 'rename', target: 'colony', name: '   ' }, c.t).error, /empty/);
  c = run(c, w, { type: 'tutorial', step: 3 });
  assert.ok(c.tutorial >= 3);
  assert.match(E.applyCommand(c, w, { type: 'launchNukes' }, c.t).error, /Unknown/);
  assert.match(E.applyCommand(c, w, null, c.t).error, /Bad command/);
  // locked panels refuse commands
  assert.match(E.applyCommand(fresh(0), w, { type: 'upgradeLift', kind: 'speed' }, 0).error, /Not unlocked/);
});

test('insufficient coin: error and nothing changes', () => {
  const w = newWorld();
  const c = rich(fresh(0), w, 5);
  for (const cmd of [{ type: 'upgradeLift', kind: 'speed' }, { type: 'buyShaft', dir: 'left' }, { type: 'buyShip', cls: 'hauler' }, { type: 'hireMiners', shaftId: 's1', n: 10 }, { type: 'upgradeGear', shaftId: 's1' }]) {
    const r = E.applyCommand(c, w, cmd, c.t);
    assert.match(r.error, /Not enough coin/, cmd.type);
    assert.equal(r.colony.coin, c.coin);
    assert.equal(r.colony.shafts.length, c.shafts.length);
    assert.equal(E.quote(c, w, cmd).canAfford, false);
  }
});

test('fuzz: never negative, never NaN', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 5e9);
  let s = 12345;
  const rnd = (n) => { s = (s * 16807) % 2147483647; return s % n; };
  const kinds = ['hireMiners', 'buyShaft', 'upgradeShaft', 'upgradeGear', 'upgradeCart', 'upgradeLift', 'upgradeConveyor', 'upgradeYard', 'buyPad', 'buyShip', 'upgradeClass', 'setRoute', 'rename'];
  let t = 0;
  for (let i = 0; i < 400; i++) {
    t += rnd(4) === 0 ? rnd(6 * HOUR) : rnd(20_000);
    const type = kinds[rnd(kinds.length)];
    const shaft = c.shafts[rnd(c.shafts.length)], ship = c.ships[rnd(c.ships.length)];
    const ns = [1, 10, 100, 'max'];
    const cmd = { type, n: ns[rnd(4)], shaftId: shaft.id, shipId: ship.id, kind: ['speed', 'capacity', 'buckets', 'lights', 'supports', 'hold', 'loading', 'multi', 'hold2'][rnd(9)], dir: rnd(2) ? 'left' : 'right', cls: ['hauler', 'cruiser', 'freighter'][rnd(3)],
      policy: ['best', 'nearest', 'fixed'][rnd(3)], destId: PLANET.buyers[rnd(4)].id, target: 'ship', id: ship.id, name: 'S' + i };
    const r = E.applyCommand(c, w, cmd, t);
    c = r.colony;
    assertSane(c, `step ${i} ${type}`);
    const rt = E.rates(c, w);
    for (const k of ['coinPerMin', 'minePerMin', 'liftPerMin', 'shipPerMin', 'throughput', 'score']) assert.ok(Number.isFinite(rt[k]) && rt[k] >= 0, k);
  }
  assert.ok(c.earned > 0);
});

// Shaft k with one hand-placed vein (later veins roll after it as usual).
function withVein(c, k, vein) {
  c = JSON.parse(JSON.stringify(c));
  const s = c.shafts[k];
  Object.assign(s, { face: 0, pk: [vein], pkN: 1, pkEnd: vein.start + vein.len, dug: 0 });
  return c;
}
// A busy shaft 2 with the lift, conveyors and yard to carry what it digs.
function busy(w, vein) {
  let c = rich(fresh(0), w, 1e15);
  c = buyN(c, w, 1);
  c = run(c, w, { type: 'upgradeLift', kind: 'speed', n: 25 });
  c = run(c, w, { type: 'upgradeLift', kind: 'capacity', n: 25 });
  c = run(c, w, { type: 'upgradeLift', kind: 'buckets', n: 5 });
  c = run(c, w, { type: 'upgradeConveyor', n: 25 });
  c = run(c, w, { type: 'upgradeYard', n: 20 });
  c = run(c, w, { type: 'buyPad', n: 3 });
  for (let i = 0; i < 3; i++) c = run(c, w, { type: 'buyShip', cls: 'hauler' });
  const s = sid(c, 1);
  c = run(c, w, { type: 'hireMiners', shaftId: s, n: 20 });
  c = run(c, w, { type: 'upgradeGear', shaftId: s, n: 1 });
  c = run(c, w, { type: 'upgradeCart', shaftId: s, n: 12 });
  return withVein(c, 1, vein);
}

test('veins: strike, running low at 20%, linear taper below 5%, then back to common', () => {
  const w = newWorld();
  const T = E.TUNING.pk;
  let c = busy(w, { ore: 'amber', start: 1, len: 20 });
  assert.equal(c.shafts[1].ore, 'gravel');
  let r = E.rates(c, w).shafts[1];
  assert.equal(r.pocket, null);
  assert.equal(r.next.ore, 'amber');
  assert.ok(Math.abs(r.next.at - 1) < 1e-9 && r.next.blocked === false);
  assert.ok(r.metresPerMin > 0);
  const full = r.orePerMin;
  const events = [], seen = [];
  let taper = [], ores = [];
  const t0 = c.t;
  for (let t = t0 + MIN; t < t0 + 3 * DAY && !events.some((e) => e.type === 'pocketOut'); t += MIN) {
    const x = E.advance(c, w, t);
    c = x.colony;
    events.push(...x.events.filter((e) => ['strike', 'veinLow', 'pocketOut', 'blocked'].includes(e.type) && e.data.shaftId === sid(c, 1)));
    if (ores[ores.length - 1] !== c.shafts[1].ore) ores.push(c.shafts[1].ore);
    const rs = E.rates(c, w).shafts[1];
    if (rs.pocket) { seen.push(rs.pocket); taper.push([(c.shafts[1].face - 1) / 20, rs.pocket.taper, rs.orePerMin]); }
  }
  assert.deepEqual(events.map((e) => e.type), ['strike', 'veinLow', 'pocketOut'], 'strike, low at 20%, dug out');
  assert.match(events[0].text, /Shaft 2 struck Amber!/);
  assert.deepEqual(events[0].data, { shaftId: sid(c, 1), oreId: 'amber', tier: 'rare' });
  assert.match(events[1].text, /Amber vein is running low/);
  assert.deepEqual(ores.slice(0, 3), ['gravel', 'amber', 'gravel'], 'common, the vein ore, back to common');
  assert.equal(PLANET.ores.find((o) => o.id === ores[2]).tier, 'common');
  assert.ok(c.shafts[1].face > 21 && c.shafts[1].dug >= 1);
  assert.ok(!c.shafts[1].pk.some((p) => p.start + p.len <= c.shafts[1].face), 'dug-out veins are pruned');
  // running low fired at 80%: the face had passed start + 0.8 len but not by much
  const lowAt = events[1].at;
  assert.ok(lowAt > events[0].at && lowAt < events[2].at);
  // taper: full output until 95% through, then 0.9 .. 0.1 of it, never up again
  const before = taper.filter(([f]) => f < 0.949), tail = taper.filter(([f]) => f >= 0.951);
  assert.ok(before.length > 10 && before.every(([, k]) => k === 1));
  assert.ok(before.every(([, , o]) => Math.abs(o - full) < 1e-6), 'full output in the body of the vein');
  assert.ok(tail.length >= 3, 'the taper is visible');
  assert.ok(tail.every(([, k], i) => k < 1 && (i === 0 || k <= tail[i - 1][1] + 1e-12)), 'tapers down');
  assert.ok(tail.every(([, k, o]) => Math.abs(o - full * k) < 1e-6), 'output follows the taper');
  assert.ok(Math.min(...tail.map(([, k]) => k)) <= 0.3 && Math.max(...tail.map(([, k]) => k)) <= 0.9 + 1e-9);
  assert.equal(T.taperFrom, 0.95); assert.equal(T.low, 0.8);
  // rates after the vein: back to common at full output
  assert.equal(E.rates(c, w).shafts[1].pocket, null);
});

test('veins: a vein harder than the gear stops the face; walls pay 60% until the gear breaks in', () => {
  const w = newWorld();
  let c = busy(w, { ore: 'ruby', start: 0.5, len: 5 });
  const evs = [];
  const t0 = c.t;
  for (let t = t0 + MIN; t <= t0 + 2 * HOUR; t += 10 * MIN) { const x = E.advance(c, w, t); c = x.colony; evs.push(...x.events); }
  assert.equal(c.shafts[1].face, 0.5, 'face waits at the vein');
  assert.equal(evs.filter((e) => e.type === 'blocked').length, 1, 'blocked fires once');
  assert.match(evs.find((e) => e.type === 'blocked').text, /needs gear 5/);
  let r = E.rates(c, w).shafts[1];
  assert.equal(r.ok, true); assert.equal(r.blocked, true); assert.equal(r.need, 5); assert.equal(r.ore, 'gravel');
  assert.ok(Math.abs(r.wallRate - Math.min(r.crew, r.cap) * E.TUNING.pk.wall) < 1e-9 && r.orePerMin === r.wallRate);
  assert.deepEqual(r.next, { ore: 'ruby', at: 0, blocked: true });
  const b = E.bottleneck(c, w);
  assert.equal(b.stage, 'blocked');
  assert.match(b.message, /stuck at a vein: needs gear 5/i);
  assert.equal(b.suggestion, undefined, 'a diagnosis, no recommended buy');
  const mined = c.stats.mined;
  c = E.advance(c, w, c.t + HOUR).colony;
  assert.ok(c.stats.mined > mined, 'walls keep paying');
  assert.equal(c.shafts[1].face, 0.5);
  c = run(c, w, { type: 'upgradeGear', shaftId: sid(c, 1), n: 2 });
  assert.equal(E.rates(c, w).shafts[1].blocked, true, 'gear 4 is not enough');
  c = run(c, w, { type: 'upgradeGear', shaftId: sid(c, 1) });
  r = E.rates(c, w).shafts[1];
  assert.equal(r.blocked, false); assert.equal(r.ore, 'ruby');
  const x = E.advance(c, w, c.t + 10 * MIN);
  assert.ok(x.events.some((e) => e.type === 'strike' && e.data.oreId === 'ruby'), 'breaking in is a strike');
  assert.ok(x.colony.shafts[1].face > 0.5, 'face moves again');
});

// Roll many veins for one shaft by moving its roll counter on (rolls depend on the shaft seed and the vein number).
function sampleVeins(c, w, k, rounds = 12) {
  const out = [];
  c = JSON.parse(JSON.stringify(c));
  for (let i = 0; i < rounds; i++) {
    const s = c.shafts[k];
    Object.assign(s, { face: 0, pk: [], pkN: i * 3, pkEnd: 0 });
    c = E.advance(c, w, c.t + 1).colony;
    out.push(...c.shafts[k].pk.map((p) => ({ ...p })));
  }
  return out;
}

test('veins: only site ores occur, by band; mythic only in the deepest band at a mythic site', () => {
  const w = newWorld();
  const only = { ...SITE, richness: { gravel: 1, slate: 0, amber: 0, jade: 0.6, ruby: 0, opal: 0, star: 0 } };
  const noMyth = { ...SITE, richness: { ...SITE.richness, star: 0 } };
  const mk = (site) => buyN(rich(fresh(0, site), w, 1e300), w, 15);
  const a = mk(only), m = mk(SITE), n = mk(noMyth);
  assert.deepEqual(m.shafts.map((s) => s.band), ['shallow', 'shallow', 'shallow', 'middle', 'middle', 'middle', 'middle',
    'deep', 'deep', 'deep', 'deep', 'deep', 'deepest', 'deepest', 'deepest', 'deepest']);
  let sawMythic = 0, sawRare = 0;
  for (const k of [0, 1, 4, 8, 12, 15]) {
    for (const v of sampleVeins(a, w, k)) assert.equal(v.ore, 'jade', `an only-jade site rolled ${v.ore} in shaft ${k + 1}`);
    for (const v of sampleVeins(n, w, k)) assert.notEqual(v.ore, 'star', 'no mythic without a mythic site');
    const mv = sampleVeins(m, w, k, 30);
    for (const v of mv) {
      const tier = PLANET.ores.find((o) => o.id === v.ore).tier;
      assert.ok(tier === 'rare' || tier === 'mythic', 'veins are rare or mythic ore');
      if (tier === 'mythic') { assert.ok(k >= 12, `mythic in shaft ${k + 1}`); sawMythic++; } else sawRare++;
      const hours = v.len / 60;
      assert.ok(hours >= (tier === 'mythic' ? 2 : 4) - 0.02 && hours <= (tier === 'mythic' ? 24 : 48) + 0.02, `a ${tier} vein of ${hours.toFixed(1)} h`);
    }
  }
  assert.ok(sawMythic > 0 && sawRare > 0, 'mythic shows up in the deepest band, rares in the others');
  assert.ok(sampleVeins(m, w, 15, 30).some((v) => v.ore === 'star'));
  // no site rares at all: only the common, in every band
  const bare = buyN(rich(fresh(0, { ...SITE, richness: { gravel: 1, slate: 0, amber: 0, jade: 0, ruby: 0, opal: 0, star: 0 } }), w, 1e300), w, 14);
  assert.ok(bare.shafts.every((s) => s.pk.length === 0), 'a site without rares rolls no veins');
  const ob = E.advance(bare, w, bare.t + 5 * HOUR).colony;
  assert.ok(ob.shafts.every((s) => s.ore === 'gravel'));
  // richer, bigger veins and deeper bands: more of the tunnel is vein; veins grow with veinSize
  const share = (site, k) => { const v = sampleVeins(buyN(rich(fresh(0, site), w, 1e300), w, 12), w, k, 30); return v.reduce((x, y) => x + y.len, 0) / (v[v.length - 1].start + v[v.length - 1].len); };
  assert.ok(share(SITE, 8) > share(SITE, 4) && share(SITE, 4) > share(SITE, 1), 'vein odds grow with depth');
  const poor = { ...SITE, richness: { ...SITE.richness, amber: 0.1, jade: 0.1, ruby: 0.1, opal: 0.1, star: 0 } };
  assert.ok(share(SITE, 8) > share(poor, 8), 'vein odds grow with richness');
  const big = { ...SITE, veinSize: { ...SITE.veinSize, amber: 1.6, jade: 1.6, ruby: 1.6, opal: 1.6 } };
  const small = { ...SITE, veinSize: { ...SITE.veinSize, amber: 0.6, jade: 0.6, ruby: 0.6, opal: 0.6 } };
  assert.ok(share(big, 8) > share(small, 8), 'vein sizes grow with veinSize');
});

test('veins: rolled from the shaft seed, each direction its own; colony stays small after a month of digging', () => {
  const w = newWorld();
  let c = midgame(w);
  const a = E.advance(c, w, c.t + HOUR).colony, b = E.advance(JSON.parse(JSON.stringify(c)), w, c.t + HOUR).colony;
  assert.deepEqual(a.shafts.map((s) => s.pk), b.shafts.map((s) => s.pk));
  const l = buyN(rich(fresh(0), w, 1e12), w, 1, 'left'), r = buyN(rich(fresh(0), w, 1e12), w, 1, 'right');
  assert.notEqual(l.shafts[1].seed, r.shafts[1].seed);
  assert.notDeepEqual(l.shafts[1].pk, r.shafts[1].pk);
  assert.deepEqual(l.shafts[1].pk, buyN(rich(fresh(0), w, 1e12), w, 1, 'left').shafts[1].pk, 'same direction, same tunnel');
  const t0 = c.t;
  for (let t = t0 + 6 * HOUR; t <= t0 + 30 * DAY; t += 6 * HOUR) c = E.advance(c, w, t).colony;
  const size = JSON.stringify(c).length;
  assert.ok(size < 30_000, `colony is ${size} bytes`);
  for (const s of c.shafts) assert.ok(s.pk.length <= E.TUNING.pk.ahead + 1, `${s.name} keeps ${s.pk.length} veins`);
  assert.ok(c.shafts.some((s) => s.face > 5), 'tunnels get long');
  assert.ok(c.shafts.reduce((x, s) => x + s.dug, 0) >= 3, 'veins dug');
  assertSane(c);
});

test('ships: load, launch, get paid on arrival, fly home', () => {
  const w = newWorld();
  let c = fresh(0);
  let t = 0, launched = null;
  while (t < 5 * MIN && !launched) {
    t += 1000;
    const r = E.advance(c, w, t);
    c = r.colony;
    launched = r.events.find((e) => e.type === 'launch');
  }
  assert.ok(launched, 'first ship launches');
  const ship = c.ships[0];
  assert.equal(ship.state, 'out');
  const cargo = ship.cargo;
  const load = Object.values(cargo).reduce((a, b) => a + b, 0);
  assert.ok(load > 0);
  const trip = ship.arriveAt - ship.departAt;
  assert.equal(trip, E.destinations(c, w, 'hauler').find((d) => d.id === ship.dest).tripSecs * 1000);
  const coin0 = c.coin;
  const before = E.advance(c, w, ship.arriveAt - 1).colony;
  assert.equal(before.coin, coin0, 'no pay before arrival');
  const at = E.advance(c, w, ship.arriveAt);
  const expect = Object.entries(cargo).reduce((a, [o, n]) => a + n * E.marketPrice(w, o, ship.dest, ship.arriveAt), 0);
  assert.ok(Math.abs(at.colony.coin - coin0 - expect) < 1e-9);
  const sale = at.events.find((e) => e.type === 'sale');
  assert.ok(sale && Math.abs(sale.data.coin - expect) < 1e-9);
  assert.equal(at.colony.ships[0].state, 'back');
  assert.deepEqual(at.colony.ships[0].cargo, {});
  const home = E.advance(at.colony, w, at.colony.ships[0].homeAt).colony;
  assert.equal(home.ships[0].state, 'loading', 'docks again when home');
  assert.ok(home.stats.firstSaleAt === ship.arriveAt);
  assert.ok(ship.arriveAt < 90_000, 'first sale within 90 seconds');
});

test('route policies: best, nearest, fixed', () => {
  const w = newWorld();
  let c = rich(fresh(0), w);
  c = run(c, w, { type: 'hireMiners', shaftId: sid(c), n: 3 });
  const launchDest = (policy, destId) => {
    let x = run(c, w, { type: 'setRoute', shipId: c.ships[0].id, policy, destId });
    const t0 = x.t;
    for (let t = t0; t < t0 + 5 * MIN; t += 1000) { x = E.advance(x, w, t).colony; if (x.ships[0].state === 'out') break; }
    return x.ships[0].dest;
  };
  assert.equal(launchDest('fixed', 'court'), 'court');
  assert.equal(launchDest('nearest'), 'depot');
  // best: gravel pays 1.0 at depot (15s) vs 1.2 at scrap (35s) vs 0.8 at court (70s) => depot per minute
  assert.equal(launchDest('best'), 'depot');
  const rows = E.destinations(c, w, 'hauler');
  assert.equal(rows.length, 4);
  assert.equal(rows.filter((r) => r.best).length, 1);
  assert.equal(rows.find((r) => r.best).id, 'depot');
  assert.ok(rows.every((r) => r.tripSecs > 0 && Number.isFinite(r.coinPerMin)));
  assert.ok(E.destinations(c, w, 'cruiser')[0].tripSecs < rows[0].tripSecs, 'cruisers are faster');
  // a cargo the far buyer pays 5x for goes far under 'best' (coin per minute of round trip)
  const y = JSON.parse(JSON.stringify(c));
  y.ships[0] = { ...y.ships[0], state: 'loading', cargo: { star: 40 }, cargoG: { star: 40 }, firstLoadAt: y.t - 60_000 };
  const z = E.advance(y, w, y.t + 1000).colony;
  assert.equal(z.ships[0].dest, 'court');
});

test('market: selling drops the price, it recovers with a half-life', () => {
  let w = newWorld();
  const p0 = E.marketPrice(w, 'star', 'court', 0);
  assert.ok(p0 > 0);
  const w1 = E.recordSales(w, [{ oreId: 'star', amount: 1e6 }, { oreId: 'amber', amount: 1e6 }, { oreId: 'gravel', amount: 1e6 }], 0);
  assert.deepEqual(w.market, {}, 'recordSales is pure');
  const drop = (id) => 1 - w1.market[id].index;
  assert.ok(drop('star') > drop('amber') && drop('amber') > drop('gravel'), 'mythic swings hardest, common barely moves');
  assert.ok(drop('gravel') < 0.001);
  assert.ok(drop('star') > 0.02);
  const p1 = E.marketPrice(w1, 'star', 'court', 0);
  assert.ok(p1 < p0);
  const half = E.marketPrice(w1, 'star', 'court', E.TUNING.halfLifeMs);
  assert.ok(Math.abs((p0 - half) - (p0 - p1) / 2) < 1e-9 * p0, 'half the dip recovers in one half-life');
  assert.ok(E.marketPrice(w1, 'star', 'court', 10 * DAY) > 0.999 * p0);
  // crash floor
  const crash = E.recordSales(w, { star: 1e12 }, 0);
  assert.ok(crash.market.star.index >= E.TUNING.indexFloor);
  // buyer likes multiply price
  assert.ok(E.marketPrice(w, 'ruby', 'court', 0) > E.marketPrice(w, 'ruby', 'depot', 0));
  assert.equal(E.marketPrice(w, 'nope', 'court', 0), 0);
  // advance reports sales for recordSales
  let c = rich(fresh(0), w);
  c = run(c, w, { type: 'hireMiners', shaftId: sid(c), n: 3 });
  const r = E.advance(c, w, c.t + HOUR);
  const w2 = E.recordSales(w, r.sales, r.colony.t);
  assert.ok(w2.market.gravel.index < 1);
});

test('bottleneck: names the stage as plain information, with no recommended buys', () => {
  const w = newWorld();
  let c = rich(fresh(0), w);
  c = buyN(c, w, 1);
  c = run(c, w, { type: 'hireMiners', shaftId: sid(c, 1), n: 20 });
  c = run(c, w, { type: 'upgradeCart', shaftId: sid(c, 1), n: 20 });
  c = run(c, w, { type: 'upgradeConveyor', n: 10 });
  for (let i = 0; i < 3; i++) c = run(c, w, { type: 'buyShip', cls: 'hauler' });
  const b = E.bottleneck(c, w);
  assert.equal(b.stage, 'lift');
  assert.ok(b.wastedPerMin > 0 && b.wastedOrePerMin > 0);
  assert.match(b.message, /^Your lift can't keep up: .* ore\/min piles up in the tunnels\.$/, 'a diagnosis only');
  assert.deepEqual(Object.keys(b).sort(), ['message', 'stage', 'wastedOrePerMin', 'wastedPerMin']);
  // fixing the named stage helps
  const after = run(c, w, { type: 'upgradeLift', kind: 'buckets', n: 6 });
  assert.ok(E.rates(after, w).coinPerMin > E.rates(c, w).coinPerMin);
  // a cart that can't haul its crew is named
  let d = rich(fresh(0), w, 1e12);
  d = run(d, w, { type: 'hireMiners', shaftId: sid(d), n: 30 });
  d = run(d, w, { type: 'upgradeLift', kind: 'buckets', n: 6 });
  const bd = E.bottleneck(d, w);
  assert.ok(['cart', 'lift', 'conveyor', 'ships'].includes(bd.stage));
  assert.equal(E.bottleneck(run(rich(fresh(0), w, 1e12), w, { type: 'upgradeCart', shaftId: sid(c), n: 1 }), w).stage !== undefined, true);
  // a balanced fresh mine: the mine itself is the limit
  const bf = E.bottleneck(fresh(0), w);
  assert.ok(['mine', 'lift', 'ships', 'conveyor'].includes(bf.stage));
  assert.ok(E.bestMoves(c, w, { limit: 3 }).length > 0, 'bestMoves stays for the pacing bot');
});

test('unlocks: panels drip in, licenses follow the month, tutorial steps', () => {
  const w = newWorld();
  let c = fresh(0);
  let u = E.unlocks(c, w, 0);
  assert.deepEqual(u.panels, ['mine', 'hire']);
  assert.deepEqual(u.licenses, []);
  assert.equal(u.tutorial.step, 1);
  assert.match(u.tutorial.hint, /miners/);
  assert.equal(E.unlocks(c, w, 0).tutorial.step, 1, 'the crew is already digging');
  const seen = [];
  const order = [];
  for (let t = 1000; t < 40 * MIN; t += 3000) {
    const r = E.advance(c, w, t);
    c = r.colony;
    for (const e of r.events) if (e.type === 'unlock') { seen.push(e.data.panel); order.push(t); }
    const best = E.bestMoves(c, w, { limit: 1 })[0];
    if (best && best.canAfford) for (const st of best.steps) { const x = E.applyCommand(c, w, st, t); if (!x.error) c = x.colony; }
  }
  assert.ok(seen.length >= 4, `panels revealed in the first 40 minutes: ${seen}`);
  assert.equal(new Set(seen).size, seen.length, 'each panel is announced once');
  assert.ok(E.unlocks(c, w, c.t).tutorial.step >= 4);
  // licenses: coin AND day
  const r1 = { ...c, earned: 1e9 };
  assert.deepEqual(E.unlocks(r1, w, HOUR).licenses, ['cruiser']);
  assert.deepEqual(E.unlocks(r1, w, DAY + HOUR).licenses, ['cruiser', 'freighter']);
  assert.deepEqual(E.unlocks(r1, w, 2 * DAY + HOUR).licenses, ['cruiser', 'freighter', 'mythicDrill']);
  assert.deepEqual(E.unlocks({ ...c, earned: 0 }, w, 5 * DAY).licenses.filter((l) => !c.unlocked.licenses.includes(l)), []);
  const adv = E.advance(r1, w, 2 * DAY + HOUR);
  assert.deepEqual(adv.events.filter((e) => e.type === 'license').map((e) => e.data.license).sort(), ['freighter', 'mythicDrill'].filter((l) => !r1.unlocked.licenses.includes(l)).concat(r1.unlocked.licenses.includes('cruiser') ? [] : ['cruiser']).sort());
  assert.equal(E.unlocks(adv.colony, w, adv.colony.t).next.license.id, 'refinery');
  const late = E.advance({ ...adv.colony, earned: 2e7 }, w, 3 * DAY + HOUR);
  assert.ok(late.events.some((e) => e.type === 'license' && e.data.license === 'refinery'));
  assert.ok(late.colony.unlocked.panels.includes('refinery'), 'the refinery panel opens with its license');
  assert.equal(E.unlocks(late.colony, w, late.colony.t).next.license, null);
});

test('late joiners get a catch-up grant that counts toward licenses', () => {
  const w = newWorld();
  assert.equal(E.catchUpGrant(w, HOUR), 0);
  const g5 = E.catchUpGrant(w, 5 * DAY), g15 = E.catchUpGrant(w, 15 * DAY);
  assert.ok(g5 > 0 && g15 > g5);
  const c = E.newColony({ uid: 'late', planet: PLANET, now: 5 * DAY, grant: g5 });
  assert.equal(c.coin, E.TUNING.startCoin + g5);
  assert.equal(c.grant, g5);
  const u = E.unlocks(c, w, 5 * DAY);
  assert.ok(u.licenses.includes('freighter'));
  assert.equal(E.newColony({ uid: 'x', planet: PLANET, now: 0, grant: { coin: 50 } }).coin, E.TUNING.startCoin + 50);
});

test('JSON round trip gives the same results; size stays small', () => {
  const w = newWorld();
  const c = midgame(w);
  const copy = JSON.parse(JSON.stringify(c));
  assert.deepEqual(copy, c);
  assert.deepEqual(E.advance(copy, w, c.t + DAY), E.advance(c, w, c.t + DAY));
  // 30 shafts and 20 ships, mid-flight with cargo
  let big = rich(fresh(0), w, 1e300);
  big = buyN(big, w, 29);
  for (let i = 1; i < 20; i++) big = run(big, w, { type: 'buyShip', cls: 'hauler' });
  big = run(big, w, { type: 'buyPad', n: 'max' });
  for (const s of big.shafts) big = run(big, w, { type: 'hireMiners', shaftId: s.id, n: 10 });
  big = run(big, w, { type: 'upgradeLift', kind: 'speed', n: 50 });
  big = E.advance(big, w, big.t + 2 * HOUR).colony;
  const size = JSON.stringify(big).length;
  assert.ok(size < 50_000, `colony is ${size} bytes`);
  assert.equal(big.ships.length, 20);
  assert.equal(E.applyCommand(big, w, { type: 'buyShip', cls: 'hauler' }, big.t).error, 'Fleet is full');
  assertSane(big);
});

test('rates and quote are plain, finite numbers for the UI', () => {
  const w = newWorld();
  const c = midgame(w);
  const r = E.rates(c, w);
  assert.ok(r.coinPerMin > 0 && r.minePerMin > 0 && r.liftPerMin > 0 && r.conveyorPerMin > 0 && r.shipPerMin > 0);
  assert.equal(r.shafts.length, c.shafts.length);
  assert.equal(r.ships.length, c.ships.length);
  assert.ok(Object.values(r.orePerMin).every((x) => x > 0));
  for (const cmd of E.candidateMoves(c, w)) {
    const q = E.quote(c, w, cmd);
    assert.ok(q.error || (Number.isFinite(q.cost) && q.cost > 0 && typeof q.effect === 'string' && q.effect.length > 0), JSON.stringify(cmd));
  }
  assert.equal(E.fmt(1234), '1.2K');
  assert.equal(E.fmt(20e6), '20M');
  assert.equal(E.fmt(1.5e15), '1.5Qa');
});

test('autoSpend buys the best moves in one command and respects the reserve', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 50_000);
  const before = E.rates(c, w).coinPerMin;
  const r = E.applyCommand(c, w, { type: 'autoSpend', keep: 0.2 }, c.t);
  assert.equal(r.error, undefined);
  assert.ok(r.colony.coin >= 50_000 * 0.2 - 1e-6, 'keeps the reserve');
  assert.ok(r.colony.coin < 50_000, 'spent something');
  assert.ok(E.rates(r.colony, w).coinPerMin > before, 'income went up');
  assert.ok(r.events.some((e) => e.type === 'autoSpend'));
  const broke = E.applyCommand({ ...r.colony, coin: 0 }, w, { type: 'autoSpend' }, r.colony.t);
  assert.match(broke.error, /Nothing worth buying/);
});

// ---------------------------------------------------------------- Phase 2: world changes
test('world changes: demand, supply, global, buyer; stacking and clamp', () => {
  const w = newWorld();
  const base = (o, b) => E.marketPrice(w, o, b, 1000);
  const ch = (x) => ({ id: 'x' + Math.random(), by: null, source: 'event', title: 't', reason: '', at: 0, ...x });
  const w1 = { ...w, changes: [ch({ kind: 'demand', oreId: 'amber', mult: 2 })] };
  assert.ok(Math.abs(E.marketPrice(w1, 'amber', 'forge', 1000) - 2 * base('amber', 'forge')) < 1e-9);
  assert.equal(E.marketPrice(w1, 'gravel', 'forge', 1000), base('gravel', 'forge'));
  const w2 = { ...w, changes: [ch({ kind: 'supply', oreId: 'gravel', mult: 2 })] };
  assert.ok(Math.abs(E.marketPrice(w2, 'gravel', 'depot', 1000) - base('gravel', 'depot') / 2) < 1e-9);
  const w3 = { ...w, changes: [ch({ kind: 'global', mult: 1.5 })] };
  for (const o of ['gravel', 'jade']) assert.ok(Math.abs(E.marketPrice(w3, o, 'court', 1000) - 1.5 * base(o, 'court')) < 1e-9);
  const w4 = { ...w, changes: [ch({ kind: 'buyer', buyerId: 'court', mult: 3 })] };
  assert.ok(Math.abs(E.marketPrice(w4, 'ruby', 'court', 1000) - 3 * base('ruby', 'court')) < 1e-9);
  assert.equal(E.marketPrice(w4, 'ruby', 'forge', 1000), base('ruby', 'forge'));
  // stacking is multiplicative; the combined effect is clamped to 0.2..5
  const w5 = { ...w, changes: [ch({ kind: 'global', mult: 1.5 }), ch({ kind: 'demand', oreId: 'amber', mult: 2 })] };
  assert.ok(Math.abs(E.priceMult(w5, 'amber', 'forge', 1000) - 3) < 1e-12);
  const hi = { ...w, changes: [ch({ kind: 'global', mult: 4 }), ch({ kind: 'buyer', buyerId: 'forge', mult: 4 })] };
  assert.equal(E.priceMult(hi, 'amber', 'forge', 1000), 5);
  const lo = { ...w, changes: [ch({ kind: 'supply', oreId: 'amber', mult: 4 }), ch({ kind: 'global', mult: 0.5 })] };
  assert.equal(E.priceMult(lo, 'amber', 'forge', 1000), 0.2);
  // expiry and start
  const w6 = { ...w, changes: [ch({ kind: 'global', mult: 2, until: 5000 }), ch({ kind: 'global', mult: 3, at: 9000 })] };
  assert.equal(E.activeChanges(w6, 1000).length, 1);
  assert.equal(E.priceMult(w6, 'gravel', 'depot', 4999), 2);
  assert.equal(E.priceMult(w6, 'gravel', 'depot', 5000), 1);
  assert.equal(E.priceMult(w6, 'gravel', 'depot', 9000), 3);
  // rates and destinations follow the changes
  const c = midgame(w);
  const wg = { ...w, changes: [ch({ kind: 'global', mult: 2 })] };
  assert.ok(Math.abs(E.rates(c, wg).coinPerMin / E.rates(c, w).coinPerMin - 2) < 1e-6);
  const d0 = E.destinations(c, w), d1 = E.destinations(c, wg);
  assert.ok(Math.abs(d1[0].price.gravel - 2 * d0[0].price.gravel) < 1e-9);
  // best route follows a buyer boom
  const boom = { ...w, changes: [ch({ kind: 'buyer', buyerId: 'scrap', mult: 5 })] };
  assert.equal(E.destinations(c, boom).find((d) => d.best).id, 'scrap');
});

test('world changes: sales pay the changed price; step invariance across an expiry', () => {
  const w = newWorld();
  const c = midgame(w);
  const until = c.t + 6 * HOUR + 1234;
  const wb = { ...w, changes: [{ id: 'boom', kind: 'global', mult: 2, by: null, source: 'event', title: 'Boom', reason: '', at: c.t, until }] };
  const end = c.t + 12 * HOUR;
  const plain = E.advance(c, w, end).colony;
  const one = E.advance(c, wb, end).colony;
  assert.ok(one.earned - c.earned > (plain.earned - c.earned) * 1.3, 'the boom paid more');
  let many = c;
  for (let t = c.t + MIN; t <= end; t += MIN) many = E.advance(many, wb, t).colony;
  assert.ok(rel(one.coin, many.coin) < 0.005, `coin ${one.coin} vs ${many.coin}`);
  assert.ok(rel(one.earned, many.earned) < 0.005);
  // after expiry, prices are back to normal
  assert.equal(E.priceMult(wb, 'gravel', 'depot', until), 1);
});

// ---------------------------------------------------------------- Phase 2: hazards
function withHazards(k, fn) {
  const hz = E.TUNING.hz, saved = { ...hz };
  for (const key of ['cave', 'mad', 'gas', 'flood', 'fire', 'quake']) hz[key] *= k;
  try { return fn(); } finally { Object.assign(hz, saved); }
}
// A deep, busy colony: 14 shafts (the deep ones are far below what the gear cuts; they still cave in).
function deepColony(w) {
  let c = midgame(w);
  c.coin = 1e30;
  c = buyN(c, w, 6);
  for (const s of c.shafts) c = run(c, w, { type: 'hireMiners', shaftId: s.id, n: 'max' });
  c.coin = 0;
  return c;
}
const hazardsOf = (r) => r.events.filter((e) => e.type === 'hazard');

test('hazards: deterministic, step-invariant across 3 days, never negative', () => withHazards(8, () => {
  const w = newWorld();
  const c = deepColony(w);
  const end = c.t + 3 * DAY;
  const a = E.advance(c, w, end), b = E.advance(c, w, end);
  assert.deepEqual(a.colony, b.colony);
  assert.deepEqual(a.events, b.events);
  const one = a.colony;
  assert.ok(one.stats.hazards >= 10, `hazards ${one.stats.hazards}`);
  let many = c;
  const seen = [];
  for (let t = c.t + MIN; t <= end; t += MIN) { const r = E.advance(many, w, t); many = r.colony; seen.push(...hazardsOf(r)); }
  let odd = c, t = c.t, s = 7;
  while (t < end) { s = (s * 16807) % 2147483647; t = Math.min(end, t + 500 + (s % (3 * HOUR))); odd = E.advance(odd, w, t).colony; }
  for (const x of [many, odd]) {
    assert.equal(x.stats.hazards, one.stats.hazards, 'same number of mishaps');
    assert.equal(x.stats.lost, one.stats.lost, 'same miners lost');
    assert.equal(x.miners, one.miners);
    assert.ok(rel(one.coin, x.coin) < 0.005, `coin ${one.coin} vs ${x.coin}`);
  }
  assert.equal(seen.length, one.stats.hazards);
  for (const e of seen) {
    assert.ok(['cavein', 'insanity', 'gas', 'flood', 'fire', 'quake'].includes(e.data.kind));
    assert.ok(typeof e.text === 'string' && e.text.length > 10 && !/[{}]/.test(e.text), e.text);
    assert.ok(e.data.lost >= 0 && e.data.haltMins >= 0);
  }
  assert.ok(new Set(seen.map((e) => e.text)).size >= 5, 'stories vary');
  assertSane(one, 'hazards');
  assert.ok(one.miners >= 1);
  assert.ok(one.shafts.every((s) => s.miners >= 0));
}));

test('hazards: lights, supports and colony safety lower losses', () => withHazards(8, () => {
  const w = newWorld();
  const c = deepColony(w);
  let safe = JSON.parse(JSON.stringify(c));
  safe.coin = 1e15;
  for (const s of safe.shafts) if (s.idx > 0) {
    safe = run(safe, w, { type: 'upgradeShaft', shaftId: s.id, kind: 'lights', n: 'max' });
    safe = run(safe, w, { type: 'upgradeShaft', shaftId: s.id, kind: 'supports', n: 'max' });
  }
  for (const kind of ['ventilation', 'pumps', 'firebreaks']) safe = run(safe, w, { type: 'upgradeSafety', kind, n: 3 });
  safe.coin = 0;
  const end = c.t + 3 * DAY;
  const raw = E.advance(c, w, end).colony, prot = E.advance(safe, w, end).colony;
  assert.ok(prot.stats.hazards < raw.stats.hazards / 3, `${prot.stats.hazards} vs ${raw.stats.hazards}`);
  assert.ok(prot.stats.lost < raw.stats.lost, `${prot.stats.lost} vs ${raw.stats.lost}`);
  assert.ok(prot.stats.mined > raw.stats.mined, 'protected shafts dig more ' + prot.stats.mined + ' vs ' + raw.stats.mined);
  // risk numbers for the UI
  const r0 = E.rates(c, w), r1 = E.rates(safe, w);
  assert.equal(r0.shafts[0].risk, 0, 'the home shaft is safe');
  assert.ok(r0.shafts.every((s) => s.risk >= 0 && s.risk <= 1));
  assert.ok(r1.shafts[5].risk < r0.shafts[5].risk);
  assert.ok(r1.hazards.loss < r0.hazards.loss);
  // safety moves are planned like any other upgrade
  assert.ok(E.candidateMoves(c, w).some((m) => m.kind === 'supports'));
  assert.ok(E.quote(c, w, { type: 'upgradeShaft', shaftId: c.shafts[3].id, kind: 'lights' }).cost > 0);
  assert.match(E.quote(c, w, { type: 'upgradeShaft', shaftId: c.shafts[0].id, kind: 'lights' }).error, /safe/);
  assert.match(E.quote(c, w, { type: 'upgradeSafety', kind: 'moat' }).error, /Unknown/);
}));

test('hazards: calm first 30 minutes; the safety panel opens with depth', () => withHazards(50, () => {
  const w = newWorld();
  let c = deepColony(w); // born at 0, built at t = 0
  const calm = E.advance(c, w, 29 * MIN);
  assert.equal(hazardsOf(calm).length, 0, 'no hazards in the first 30 minutes');
  const later = E.advance(c, w, 3 * HOUR);
  const hz = hazardsOf(later);
  assert.ok(hz.length > 0);
  assert.ok(hz.every((e) => e.at >= 30 * MIN));
  assert.ok(later.colony.unlocked.panels.includes('safety'));
  const f = fresh(0);
  assert.ok(!E.unlocks(f, w, 0).panels.includes('safety'));
  const quiet = E.advance(rich(f, w), w, 2 * DAY);
  assert.equal(quiet.colony.stats.hazards, 0, 'a lone home shaft is never in danger');
}));

// ---------------------------------------------------------------- Phase 2: prestige
function readyToNuke(w, runEarned = 3e7) {
  const c = midgame(w);
  c.runEarned = runEarned; c.monthEarned = runEarned + 5e6;
  return E.advance(c, w, c.t).colony;
}

test('nuke: threshold, confirmation, quote', () => {
  const w = newWorld();
  const low = readyToNuke(w, 1e7);
  assert.ok(low.unlocked.panels.includes('prestige'), 'prestige panel shows up before the nuke is allowed');
  assert.match(E.quote(low, w, { type: 'nuke' }).error, /20M/);
  assert.match(E.applyCommand(low, w, { type: 'nuke', confirm: 'NUKE' }, low.t).error, /20M/);
  const c = readyToNuke(w);
  const q = E.quote(c, w, { type: 'nuke' });
  assert.equal(q.error, undefined);
  assert.ok(q.canAfford);
  assert.ok(Math.abs(q.spectacle - Math.pow(3e7, 1 / 7.5)) < 1e-9);
  assert.match(E.applyCommand(c, w, { type: 'nuke' }, c.t).error, /NUKE/);
  assert.match(E.applyCommand(c, w, { type: 'nuke', confirm: 'nuke please' }, c.t).error, /NUKE/);
  const f = fresh(0);
  assert.match(E.quote(f, w, { type: 'nuke' }).error, /unlocked/i);
});

test('nuke: settles ships in flight, resets the colony, keeps SP, evolutions, name and panels', () => {
  const w = newWorld();
  let c = readyToNuke(w);
  c.sp = 4; c.evo = { mine: 1, ship: 0, sell: 1, spectacle: 2 };
  // one ship in flight with paid cargo, one loading (its cargo is lost)
  c.ships[0] = { ...c.ships[0], state: 'out', dest: 'forge', cargo: { amber: 100 }, cargoG: { amber: 105 }, departAt: c.t, arriveAt: c.t + 30_000 };
  c.ships[1] = { ...c.ships[1], state: 'loading', cargo: { gravel: 50 }, cargoG: { gravel: 50 } };
  const panels = [...c.unlocked.panels], licenses = [...c.unlocked.licenses];
  const run0 = c.runEarned, month0 = c.monthEarned;
  const r = E.applyCommand(c, w, { type: 'nuke', confirm: 'NUKE' }, c.t);
  assert.equal(r.error, undefined);
  const x = r.colony;
  const paid = 105 * E.marketPrice(w, 'amber', 'forge', c.t) * (1 + E.TUNING.evo.sell.per); // sell evo level 1
  const spect = Math.pow(run0 + paid, 1 / 7.5) * (1 + 2 * E.TUNING.evo.spectacle.per); // spectacle evo level 2
  const ev = r.events.find((e) => e.type === 'nuke');
  assert.ok(ev && ev.text.length > 10);
  assert.ok(Math.abs(ev.data.spectacle - spect) < 1e-9);
  assert.ok(Math.abs(ev.data.runEarned - (run0 + paid)) < 1e-6);
  assert.ok(Math.abs(x.sp - (4 + spect)) < 1e-9);
  assert.equal(ev.data.sp, x.sp);
  assert.deepEqual(r.sales, [{ oreId: 'amber', amount: 100 }]);
  assert.ok(Math.abs(x.monthEarned - (month0 + paid)) < 1e-6);
  assert.equal(x.runEarned, 0);
  assert.equal(x.earned, 0);
  assert.equal(x.coin, E.TUNING.startCoin);
  assert.equal(x.shafts.length, 1);
  assert.equal(x.ships.length, 1);
  assert.equal(x.miners, E.TUNING.startMiners, 'the first shaft comes with a relief crew');
  assert.equal(x.shafts[0].miners, E.TUNING.startMiners);
  assert.deepEqual(x.lift, { speed: 0, capacity: 0, buckets: 0 });
  assert.deepEqual(x.site, c.site, 'the site survives a nuke');
  assert.deepEqual(x.evo, { mine: 1, ship: 0, sell: 1, spectacle: 2 });
  assert.equal(x.nukes, 1);
  assert.equal(x.name, 'Test'); assert.equal(x.species, 'Mole'); assert.equal(x.siteRegion, 'r1');
  assert.deepEqual(x.lastNuke, { at: c.t, spectacle: spect, runEarned: run0 + paid, makerUsed: false });
  for (const p of panels) assert.ok(x.unlocked.panels.includes(p), `keeps panel ${p}`);
  for (const l of licenses) assert.ok(x.unlocked.licenses.includes(l));
  assert.equal(x.v, E.ENGINE_VERSION);
  assertSane(x, 'nuked');
  // the fresh colony plays on
  const y = x; // the relief crew is already digging
  assert.ok(E.advance(y, w, y.t + HOUR).colony.earned > 0);
  // and can't nuke again right away
  assert.match(E.quote(x, w, { type: 'nuke' }).error, /20M/);
});

test('evolve: SP costs, effects on rates, prices and speed', () => {
  const w = newWorld();
  const c = readyToNuke(w);
  const q = E.quote(c, w, { type: 'evolve', kind: 'sell' });
  assert.equal(q.currency, 'sp');
  assert.equal(q.cost, E.TUNING.evo.sell.cost);
  assert.equal(q.canAfford, false);
  const r0 = E.applyCommand(c, w, { type: 'evolve', kind: 'sell' }, c.t);
  assert.match(r0.error, /SP/);
  assert.equal(r0.colony.evo.sell, 0);
  const T = E.TUNING.evo;
  const rich2 = { ...c, sp: 100 };
  const q3 = E.quote(rich2, w, { type: 'evolve', kind: 'mine', n: 3 });
  assert.ok(Math.abs(q3.cost - T.mine.cost * (1 + T.mine.growth + T.mine.growth ** 2)) < 1e-9, 'costs rise geometrically');
  assert.ok(E.quote(rich2, w, { type: 'evolve', kind: 'mine', n: 'max' }).n >= 2);
  assert.match(E.quote(rich2, w, { type: 'evolve', kind: 'luck' }).error, /Unknown/);
  let x = rich2;
  for (const kind of ['mine', 'ship', 'sell']) {
    const r = E.applyCommand(x, w, { type: 'evolve', kind }, x.t);
    assert.equal(r.error, undefined);
    assert.ok(r.events.some((e) => e.type === 'evolve' && e.data.kind === kind));
    x = r.colony;
  }
  assert.ok(Math.abs(x.sp - (100 - 3 * T.mine.cost)) < 1e-9);
  assert.equal(x.coin, c.coin, 'evolutions cost SP, not coin');
  const a = E.rates(c, w), b = E.rates(x, w);
  assert.ok(Math.abs(b.minePerMin / a.minePerMin - (1 + T.mine.per)) < 1e-9);
  assert.ok(Math.abs(b.liftPerMin / a.liftPerMin - (1 + T.mine.per)) < 1e-9);
  assert.ok(Math.abs(b.ships[0].tripSecs * (1 + T.ship.per) - a.ships[0].tripSecs) < 1e-6);
  assert.ok(b.coinPerMin > a.coinPerMin * (1 + T.sell.per) * 0.999);
  const d0 = E.destinations(c, w), d1 = E.destinations(x, w);
  assert.ok(Math.abs(d1[0].price.gravel / d0[0].price.gravel - (1 + T.sell.per)) < 1e-9);
  // a sale pays the evolved price
  let s = fresh(0);
  s.evo = { mine: 0, ship: 0, sell: 2, spectacle: 0 };
  let t = 0, out = null;
  while (!out && t < 5 * MIN) { t += 1000; s = E.advance(s, w, t).colony; if (s.ships[0].state === 'out') out = s.ships[0]; }
  const sale = E.advance(s, w, out.arriveAt).events.find((e) => e.type === 'sale');
  const expect = Object.entries(out.cargoG).reduce((acc, [o, n]) => acc + n * E.marketPrice(w, o, out.dest, out.arriveAt), 0) * (1 + 2 * T.sell.per);
  assert.ok(Math.abs(sale.data.coin - expect) < 1e-9);
});

// ---------------------------------------------------------------- Phase 3: refineries, parties, ledger
const PARTIES = [
  { id: 'ind1', name: 'Iron Union', type: 'industrial', wants: { gravel: 1, slate: 1, amber: 0.5 }, demand: 400, ref: 1, sigma: 1.5, cap: 2 },
  { id: 'mil1', name: 'Fleet Office', type: 'military', wants: { gravel: 0.6, slate: 0.5, jade: 1 }, demand: 200, ref: 1.4, sigma: 2, cap: 1.5 },
  { id: 'fr1', name: 'Night Market', type: 'fringe', wants: { gravel: 0.3, amber: 1 }, demand: 300, ref: 0.8, sigma: 4, cap: 2.5 },
];
const refWorld = (parties = PARTIES) => ({ ...newWorld(), parties });
// A midgame colony holding the refinery license, with the given refineries built.
// A modest 3-shaft colony (about the old mid-game's ore flow) so the refinery's throughput and demand matter.
function smallMid(w) {
  let c = buyN(rich(fresh(0), w, 1e18), w, 3);
  for (const s of c.shafts) {
    c = run(c, w, { type: 'hireMiners', shaftId: s.id, n: 1 });
    c = run(c, w, { type: 'upgradeCart', shaftId: s.id, n: 2 });
  }
  c = run(c, w, { type: 'upgradeLift', kind: 'speed', n: 6 });
  c = run(c, w, { type: 'upgradeLift', kind: 'capacity', n: 6 });
  c = run(c, w, { type: 'upgradeLift', kind: 'buckets', n: 2 });
  c = run(c, w, { type: 'upgradeConveyor', n: 8 });
  c = run(c, w, { type: 'upgradeYard', n: 8 });
  c = run(c, w, { type: 'buyPad', n: 2 });
  for (let i = 0; i < 3; i++) c = run(c, w, { type: 'buyShip', cls: 'hauler' });
  c = run(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'hold', n: 6 });
  c.coin = 0;
  return c;
}
function refColony(w, sites = ['planet'], markup) {
  let c = smallMid(w);
  c.unlocked.licenses.push('refinery');
  c.coin = 1e12;
  for (const site of sites) c = run(c, w, { type: 'buildRefinery', site });
  if (markup != null) for (const site of sites) for (const o of PLANET.ores) c = run(c, w, { type: 'setRefine', site, oreId: o.id, markup });
  c.coin = 0;
  return c;
}
const refinedIn = (c) => c.ledger.month.in.refined;
const stockOf = (c, site) => Object.values(c.refinery[site].stock).reduce((a, b) => a + b, 0);

test('demand curve: falls with the ask, zero above the hidden max, grows, follows world changes', () => {
  const w = refWorld();
  let prev = Infinity;
  for (const p of [0.5, 0.7, 0.9, 1, 1.2, 1.5, 1.9]) {
    const d = E.demandAt(w, null, 'gravel', p, DAY);
    assert.ok(d > 0 && d < prev, `ask ${p}: ${d}`);
    prev = d;
  }
  // the highest hidden max for gravel is 1.4 x 1.5 = 2.1; above it nobody buys
  assert.equal(E.demandAt(w, null, 'gravel', 2.11, DAY), 0);
  assert.equal(E.demandAt(w, null, 'ruby', 1, DAY), 0, 'nobody wants ruby');
  assert.ok(E.demandAt(w, null, 'gravel', 1, 10 * DAY) > 2 * E.demandAt(w, null, 'gravel', 1, DAY), 'demand grows through the month');
  const base = E.demandAt(w, null, 'gravel', 1, DAY);
  const ch = (x) => ({ ...w, changes: [x] });
  assert.ok(rel(E.demandAt(ch({ kind: 'global', mult: 2 }), null, 'gravel', 1, DAY), 2 * base) < 1e-9);
  assert.ok(rel(E.demandAt(ch({ kind: 'demand', oreId: 'gravel', mult: 3 }), null, 'gravel', 1, DAY), 3 * base) < 1e-9);
  assert.ok(rel(E.demandAt(ch({ kind: 'demand', oreId: 'amber', mult: 3 }), null, 'gravel', 1, DAY), base) < 1e-9);
  const only = (id) => E.demandAt({ ...w, parties: PARTIES.filter((p) => p.id === id) }, null, 'gravel', 1, DAY);
  const b2 = E.demandAt(ch({ kind: 'buyer', buyerId: 'ind1', mult: 2 }), null, 'gravel', 1, DAY);
  assert.ok(rel(b2, base + only('ind1')) < 1e-9, 'a buyer change scales that party only');
  assert.equal(E.demandAt(newWorld(), null, 'gravel', 1, DAY), Infinity, 'no parties: the computer buyer takes everything');
});

test('refinery: license, build, quotes, the on-planet refinery is fed from the yard', () => {
  const w = refWorld();
  const m = midgame(w);
  m.coin = 1e12;
  assert.match(E.quote(m, w, { type: 'buildRefinery', site: 'planet' }).error, /unlocked|license/i);
  let c = refColony(w, ['planet']);
  assert.ok(c.unlocked.panels.includes('refinery'));
  assert.match(E.quote(c, w, { type: 'buildRefinery', site: 'planet' }).error, /already/);
  assert.match(E.quote(c, w, { type: 'upgradeRefinery', site: 'planet', kind: 'docks' }).error, /docks/);
  assert.match(E.quote(c, w, { type: 'setRoute', shipId: c.ships[0].id, policy: 'refinery' }).error, /orbital/);
  assert.match(E.quote(c, w, { type: 'upgradeRefinery', site: 'planet', kind: 'yield' }).effect, /\+10% yield \(1\.00 → 1\.10 refined per ore\)/);
  assert.match(E.quote(c, w, { type: 'upgradeRefinery', site: 'planet', kind: 'throughput', n: 2 }).effect, /throughput/);
  assert.match(E.quote(c, w, { type: 'setRefine', site: 'planet', oreId: 'gravel', markup: 1.25 }).effect, /Gravel: refine, ask 1\.25x/);
  assert.equal(E.quote(c, w, { type: 'setRefine', site: 'planet', oreId: 'gravel', markup: 1.25 }).cost, 0);
  const r0 = E.rates(c, w).refinery.planet;
  assert.ok(r0.inPerMin > 0 && r0.byOre.gravel.ask === 1);
  const x = E.advance(c, w, c.t + 30 * MIN);
  const after = x.colony;
  assert.ok(refinedIn(after) > 0, 'refined goods sold');
  assert.ok(x.events.some((e) => e.type === 'refined' && e.data.coin > 0));
  assert.ok(E.rates(after, w).coinPerMin > E.rates(smallMid(w), w).coinPerMin, 'refining pays more than selling raw here');
  assertSane(after, 'refinery');
});

test('refinery: ships deliver to the orbital refinery; best may choose it', () => {
  const w = refWorld();
  let c = refColony(w, ['orbital']);
  for (const s of c.ships) c = run(c, w, { type: 'setRoute', shipId: s.id, policy: 'refinery' });
  const x = E.advance(c, w, c.t + 20 * MIN);
  const dl = x.events.filter((e) => e.type === 'deliver');
  assert.ok(dl.length > 0 && dl[0].data.raw > 0, 'ships unload at the refinery');
  assert.ok(refinedIn(x.colony) > 0);
  const r = E.rates(x.colony, w);
  assert.ok(r.ships.some((s) => s.dest === E.REF_DEST));
  assert.ok(r.refinery.orbital.inPerMin > 0);
  // the default 'best' policy flies there too while it pays better
  const b = E.advance(refColony(w, ['orbital']), w, c.t + 20 * MIN);
  assert.ok(b.events.some((e) => e.type === 'deliver'), 'best picks the refinery');
});

test('refinery: a full store stops intake; storage upgrade is honored', () => {
  const w = refWorld();
  let c = refColony(w, ['planet'], 3); // nobody pays 3x: nothing sells
  const a = E.advance(c, w, c.t + 6 * HOUR);
  const cap = E.rates(a.colony, w).refinery.planet.cap;
  assert.ok(Math.abs(stockOf(a.colony, 'planet') - cap) < 1e-6 * cap, `stock ${stockOf(a.colony, 'planet')} vs cap ${cap}`);
  assert.ok(a.colony.refinery.planet.full);
  assert.ok(a.events.some((e) => e.type === 'refineryFull'));
  assert.equal(refinedIn(a.colony), 0);
  const r = E.rates(a.colony, w).refinery.planet;
  assert.equal(r.inPerMin, 0, 'full and unsold: no intake');
  assert.equal(r.byOre.gravel.vsRaw, -1);
  const b = E.advance(a.colony, w, a.colony.t + HOUR).colony;
  assert.ok(Math.abs(stockOf(b, 'planet') - cap) < 1e-6 * cap);
  assert.ok(b.ledger.month.in.raw > a.colony.ledger.month.in.raw, 'ore goes back to the ships');
  // lower the price: stock starts to sell
  const d = E.advance(run(b, w, { type: 'setRefine', site: 'planet', oreId: 'gravel', markup: 1 }), w, b.t + 10 * MIN).colony;
  assert.ok(refinedIn(d) > 0);
});

test('refinery: a lower markup sells more units; vsRaw', () => {
  const w = refWorld();
  const sold = (markup) => {
    const c = refColony(w, ['planet'], markup);
    c.refinery.planet.stock = { gravel: 1e6 }; c.refinery.planet.lvl.storage = 30; // plenty in store: sales = demand
    const r = E.advance(c, w, c.t + 10 * MIN);
    return r.events.find((e) => e.type === 'refined')?.data.ore.gravel || 0;
  };
  const lo = sold(0.8), mid = sold(1.2), hi = sold(1.8);
  assert.ok(lo > mid && mid > hi && hi > 0, `${lo} > ${mid} > ${hi}`);
  const c = refColony(w, ['planet']);
  const g = E.rates(c, w).refinery.planet.byOre.gravel;
  assert.ok(Number.isFinite(g.vsRaw) && g.vsRaw > 0, `vsRaw ${g.vsRaw}`);
});

test('ledger: every coin is tagged and the sums match coin changes', () => {
  const w = refWorld();
  let c = refColony(w, ['planet', 'orbital']);
  c.coin = 1e9;
  const sumIn = (x) => Object.values(x.ledger.month.in).reduce((a, b) => a + b, 0) - x.ledger.month.in.nukeCargo;
  const sumOut = (x) => Object.values(x.ledger.month.out).reduce((a, b) => a + b, 0);
  const in0 = sumIn(c), out0 = sumOut(c), coin0 = c.coin;
  c = E.advance(c, w, c.t + HOUR).colony;
  for (const cmd of [{ type: 'hireMiners', shaftId: c.shafts[0].id, n: 3 }, { type: 'upgradeLift', kind: 'speed' }, { type: 'upgradeRefinery', site: 'planet', kind: 'throughput' },
    { type: 'upgradeRefinery', site: 'orbital', kind: 'docks' }, { type: 'upgradeSafety', kind: 'pumps' }, { type: 'upgradeClass', cls: 'hauler', kind: 'hold' }]) {
    const r = E.applyCommand(c, w, cmd, c.t + 5 * MIN);
    if (!r.error) c = r.colony;
  }
  c = E.advance(c, w, c.t + HOUR).colony;
  assert.ok(Math.abs((c.coin - coin0) - ((sumIn(c) - in0) - (sumOut(c) - out0))) < 1e-6 * c.coin, 'coin change = in - out');
  const L = c.ledger.month;
  assert.ok(L.in.refined > 0 && L.out.refinery > 0 && L.out.miners > 0 && L.out.lift > 0 && L.out.safety > 0 && L.out.ships > 0);
  assert.deepEqual(c.ledger.run.out, c.ledger.month.out);
  const g = E.newColony({ id: 'g', planet: PLANET, now: 0, grant: 5000 });
  assert.equal(g.ledger.month.in.grant, 5000);
});

test('refinery: step invariance across store-full transitions and a 3-day catch-up', () => {
  const w = refWorld();
  let c = refColony(w, ['planet', 'orbital'], 1.5);
  c.refinery.planet.lvl.storage = 0;
  const end = c.t + 3 * DAY;
  const t0 = performance.now();
  const one = E.advance(c, w, end);
  assert.ok(performance.now() - t0 < 4000, 'catch-up is fast');
  let many = c;
  for (let t = c.t + MIN; t <= end; t += MIN) many = E.advance(many, w, t).colony;
  let odd = c, t = c.t, s = 7;
  while (t < end) { s = (s * 16807) % 2147483647; t = Math.min(end, t + 500 + (s % (2 * HOUR))); odd = E.advance(odd, w, t).colony; }
  for (const x of [many, odd]) {
    assert.ok(rel(one.colony.coin, x.coin) < 0.005, `coin ${one.colony.coin} vs ${x.coin}`);
    assert.ok(rel(refinedIn(one.colony), refinedIn(x)) < 0.005, `refined ${refinedIn(one.colony)} vs ${refinedIn(x)}`);
  }
  assert.ok(refinedIn(one.colony) > 0);
  assertSane(one.colony, 'refinery catch-up');
  // a store that fills at a high ask, drains at a low one, then fills again: one call per phase vs 1-minute steps
  const f = refColony(w, ['planet'], 2.05);
  f.refinery.planet.lvl.yield = 15; // a rich colony: the store fills fast
  const phases = [[6, null], [10, 0.5], [16, 2.05]];
  const play = (step) => {
    let q = f, t = f.t, full = 0;
    for (const [h, m] of phases) {
      if (m != null) for (const o of ['gravel', 'slate', 'amber', 'jade']) q = run(q, w, { type: 'setRefine', site: 'planet', oreId: o, markup: m }, q.t);
      const end = f.t + h * HOUR;
      while (t < end) { t = Math.min(end, t + step); const r = E.advance(q, w, t); q = r.colony; full += r.events.filter((e) => e.type === 'refineryFull').length; }
    }
    return { q, full };
  };
  const fa = play(16 * HOUR), fb = play(MIN);
  assert.ok(fa.full >= 2, `the store filled twice (${fa.full})`);
  assert.equal(fa.full, fb.full);
  assert.ok(rel(refinedIn(fa.q), refinedIn(fb.q)) < 0.005, `${refinedIn(fa.q)} vs ${refinedIn(fb.q)}`);
  assert.ok(rel(stockOf(fa.q, 'planet'), stockOf(fb.q, 'planet')) < 0.005);
});

test('refinery: a nuke removes refineries, keeps the panel and buy settings, resets the run ledger', () => {
  const w = refWorld();
  let c = refColony(w, ['planet', 'orbital']);
  c = run(c, w, { type: 'setRefine', site: 'planet', oreId: 'amber', markup: 1.4, on: false });
  c = E.advance(c, w, c.t + HOUR).colony;
  c.runEarned = 3e7;
  const month = JSON.parse(JSON.stringify(c.ledger.month));
  const x = run(c, w, { type: 'nuke', confirm: 'NUKE' });
  assert.equal(x.refinery.planet, null);
  assert.equal(x.refinery.orbital, null);
  assert.ok(x.unlocked.panels.includes('refinery'));
  assert.equal(x.ledger.run.in.raw, 0);
  assert.equal(x.ledger.run.out.refinery, 0);
  assert.equal(x.ledger.month.out.refinery, month.out.refinery, 'the month ledger stays');
  let y = { ...x, coin: 1e9 };
  y = run(y, w, { type: 'buildRefinery', site: 'planet' });
  assert.deepEqual(y.refinery.planet.ores.amber, { on: false, markup: 1.4 }, 'rebuilt with the old settings');
});

test('refinery: with no parties a computer buyer takes everything at 0.6x', () => {
  const w = newWorld();
  const c = refColony(w, ['planet'], 2);
  const r = E.advance(c, w, c.t + 30 * MIN);
  const ev = r.events.find((e) => e.type === 'refined');
  assert.ok(ev && ev.data.coin > 0);
  const I = PLANET.ores;
  const expect = Object.entries(ev.data.ore).reduce((a, [id, n]) => {
    const o = I.find((x) => x.id === id);
    const v = o.baseValue || E.TUNING.value[o.tier] * Math.pow(E.TUNING.valueHard[o.tier], o.hardness - 1);
    return a + n * v * E.TUNING.ref.valueMult * E.TUNING.ref.computer;
  }, 0);
  assert.ok(rel(ev.data.coin, expect) < 1e-9);
  assert.equal(stockOf(r.colony, 'planet'), 0, 'nothing piles up');
  assert.equal(E.rates(r.colony, w).refinery.planet.byOre.gravel.ask, E.TUNING.ref.computer);
});

test('hazards: danger doubles every 5 shafts', () => {
  const w = newWorld();
  const hz = E.TUNING.hz, saved = { ...hz };
  hz.quake = 0; hz.gas = 0; hz.flood = 0; hz.fire = 0;
  try {
    const c = buyN(rich(fresh(0), w, 1e300), w, 12);
    const r = E.rates(c, w).shafts;
    assert.equal(r[0].risk, 0);
    // cave + insanity risk is proportional to idx x 2^(idx/5) (the shaft needs miners for insanity: caves only here)
    const k = (i) => i * Math.pow(2, i / 5);
    assert.ok(Math.abs(r[10].risk / r[5].risk - k(10) / k(5)) < 1e-6 || r[10].risk >= 0.99, `${r[10].risk} / ${r[5].risk}`);
    assert.ok(Math.abs(r[10].risk / r[5].risk - 4) < 1e-6 || r[10].risk >= 0.99, 'x4 = 2 (depth) x 2 (doubling per 5 shafts)');
  } finally { Object.assign(hz, saved); }
});

// ---------------------------------------------------------------- ships rework: class upgrades, one ore per ship, fleet-wide loading
const withLicense = (c, ...ls) => { c = JSON.parse(JSON.stringify(c)); for (const l of ls) if (!c.unlocked.licenses.includes(l)) c.unlocked.licenses.push(l); return c; };
// A colony with no miners and a hand-stocked yard, so loading decisions can be read off exactly.
function yardLab(w, { yard, pads = 2, ships = ['hauler'], extra = [] }) {
  let c = withLicense(rich(fresh(0), w, 1e22), 'cruiser', 'freighter');
  c = run(c, w, { type: 'buyPad', n: pads - 1 });
  for (const cls of ships) c = run(c, w, { type: 'buyShip', cls });
  for (const cmd of extra) c = run(c, w, cmd);
  c = JSON.parse(JSON.stringify(c));
  c.shafts[0].miners = 0; c.miners = 0;
  c.yard = { ...yard }; c.yardG = { ...yard };
  return c;
}

test('class upgrades: one price for the class, every ship of it (new ones too) uses the levels', () => {
  const w = newWorld();
  let c = withLicense(rich(fresh(0), w), 'cruiser');
  c = run(c, w, { type: 'buyShip', cls: 'hauler' });
  c = run(c, w, { type: 'buyShip', cls: 'cruiser' });
  const rows = () => Object.fromEntries(E.rates(c, w).ships.map((s) => [s.id, s]));
  const base = rows();
  const cap0 = base[c.ships[0].id].cap;
  assert.equal(base[c.ships[1].id].cap, cap0);
  const q = E.quote(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'hold', n: 12 });
  assert.match(q.effect, /milestone x2/, 'level 10 is a milestone');
  c = run(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'hold', n: 12 });
  assert.equal(c.fleet.hauler.hold, 12);
  assert.equal(c.fleet.cruiser.hold, 0, 'other classes unchanged');
  c = run(c, w, { type: 'buyShip', cls: 'hauler' }); // arrives fully upgraded
  const after = rows();
  const hs = c.ships.filter((s) => s.cls === 'hauler');
  assert.equal(hs.length, 3);
  for (const s of hs) assert.ok(Math.abs(after[s.id].cap / cap0 - Math.pow(E.TUNING.fleetUp.hold.mult, 12) * 2) < 1e-9, 'all haulers share the class hold');
  assert.equal(after[hs[2].id].cap, after[hs[0].id].cap, 'the new hauler is already upgraded');
  assert.equal(c.ships.every((s) => s.lvl === undefined), true, 'no per-ship levels');
  // speed belongs to the cruiser only, loading to the hauler only
  assert.match(E.applyCommand(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'speed' }, c.t).error, /cannot upgrade/);
  assert.match(E.applyCommand(c, w, { type: 'upgradeClass', cls: 'cruiser', kind: 'loading' }, c.t).error, /cannot upgrade/);
  const t0 = E.rates(c, w).ships.find((s) => s.cls === 'cruiser').tripSecs;
  c = run(c, w, { type: 'upgradeClass', cls: 'cruiser', kind: 'speed', n: 10 });
  assert.ok(E.rates(c, w).ships.find((s) => s.cls === 'cruiser').tripSecs < t0, 'cruiser speed shortens trips');
  c = run(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'loading', n: 5 });
  assert.equal(c.fleet.hauler.loading, 5);
  assert.match(E.applyCommand(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'hold' }, c.t).error, /Buy a freighter first/);
  assert.equal(E.applyCommand(c, w, { type: 'upgradeShip', shipId: c.ships[0].id }, c.t).error, 'Unknown command');
});

test('freighter: multi is a one-time, very expensive unlock; hold2 needs it', () => {
  const w = newWorld();
  let c = withLicense(rich(fresh(0), w, 1e22), 'freighter');
  c = run(c, w, { type: 'buyShip', cls: 'freighter' });
  assert.match(E.applyCommand(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'hold2' }, c.t).error, /second hold/);
  assert.equal(E.quote(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'hold2' }).canAfford, false);
  const qm = E.quote(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'multi' });
  assert.ok(qm.cost >= 1e12 && qm.cost >= 100 * E.quote(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'hold', n: 20 }).cost / 100, 'a ton');
  assert.ok(qm.cost > 1000 * E.quote(c, w, { type: 'buyShip', cls: 'freighter' }).cost);
  const fOf = () => E.rates(c, w).ships.find((x) => x.cls === 'freighter');
  assert.equal(fOf().oreId2, undefined, 'no second hold yet');
  c = run(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'multi' });
  assert.equal(c.fleet.freighter.multi, 1);
  assert.match(E.applyCommand(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'multi' }, c.t).error, /Already/);
  const r1 = fOf();
  assert.ok(r1.cap2 > 0 && 'fill2' in r1, 'second hold exists');
  c = run(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'hold2', n: 5 });
  assert.ok(fOf().cap2 > r1.cap2, 'hold2 grows the second hold');
  assert.equal(fOf().cap, r1.cap, 'and not the first');
  // only freighters carry the unlock
  assert.match(E.applyCommand(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'multi' }, c.t).error, /cannot upgrade/);
});

test('loading: each ship carries one ore type', () => {
  const w = newWorld();
  const c = yardLab(w, { yard: { gravel: 3000, amber: 3000, jade: 3000 }, pads: 3, ships: ['hauler', 'hauler'] });
  const r = E.advance(c, w, c.t + 30_000).colony;
  for (const s of r.ships) {
    assert.equal(s.state, 'loading');
    assert.ok(s.oreId, 'ore chosen at docking');
    assert.equal(s.oreId2, null, 'a hauler has one hold');
    const held = Object.keys(s.cargo).filter((k) => s.cargo[k] > 1e-9);
    assert.ok(held.length <= 1 && (held.length === 0 || held[0] === s.oreId), JSON.stringify(s.cargo));
  }
  // a month of play never mixes ores in one hold either
  let m = midgame(w);
  for (let i = 0; i < 40; i++) {
    m = E.advance(m, w, m.t + 7 * MIN).colony;
    for (const s of m.ships) assert.ok(Object.keys(s.cargo).filter((k) => s.cargo[k] > 1e-6).length <= 1, JSON.stringify(s.cargo));
  }
  for (const s of E.rates(m, w).ships) assert.ok(s.oreId && s.fill >= 0 && s.fill <= 1, JSON.stringify(s));
});

test('loading: a scarce high-value ore goes to one ship, the next takes the other ore; an abundant one goes to both', () => {
  const w = newWorld();
  const scarce = E.advance(yardLab(w, { yard: { gravel: 5000, amber: 20 } }), w, 1000).colony;
  assert.deepEqual(scarce.ships.map((s) => s.state), ['loading', 'loading']);
  assert.deepEqual(scarce.ships.map((s) => s.oreId), ['amber', 'gravel'], 'amber is claimed, so the second ship fills with gravel');
  const plenty = E.advance(yardLab(w, { yard: { gravel: 5000, amber: 5000 } }), w, 1000).colony;
  assert.deepEqual(plenty.ships.map((s) => s.oreId), ['amber', 'amber'], 'enough amber for both');
  // the ships actually load what they chose
  const later = E.advance(scarce, w, 1000 + 10_000).colony;
  assert.ok((later.ships[1].cargo.gravel || 0) > 0 || later.ships[1].state === 'out');
  // deterministic: same state, same choice
  const again = E.advance(yardLab(w, { yard: { gravel: 5000, amber: 20 } }), w, 1000).colony;
  assert.deepEqual(again.ships.map((s) => [s.oreId, s.oreId2]), scarce.ships.map((s) => [s.oreId, s.oreId2]));
});

test('loading: a freighter with multi fills two holds with two different ores', () => {
  const w = newWorld();
  const c = yardLab(w, { yard: { gravel: 20000, amber: 20000, jade: 20000 }, pads: 1, ships: ['freighter'],
    extra: [{ type: 'upgradeConveyor', n: 30 }, { type: 'upgradeClass', cls: 'freighter', kind: 'multi' }, { type: 'upgradeClass', cls: 'freighter', kind: 'hold2', n: 3 }] });
  const fr = c.ships.find((s) => s.cls === 'freighter');
  c.ships = [fr]; fr.state = 'home'; fr.readyAt = c.t;
  const r = E.advance(c, w, c.t + 50).colony;
  const s = r.ships[0];
  assert.equal(s.state, 'loading');
  assert.ok(s.oreId && s.oreId2 && s.oreId !== s.oreId2, `${s.oreId} / ${s.oreId2}`);
  const v = E.rates(r, w).ships[0];
  assert.equal(v.oreId, s.oreId); assert.equal(v.oreId2, s.oreId2);
  const done = E.advance(r, w, c.t + 5 * MIN);
  const sale = done.events.find((e) => e.type === 'sale');
  assert.ok(sale, 'the freighter flew and sold');
  const sold = Object.keys(sale.data.ore).filter((k) => sale.data.ore[k] > 1e-6);
  assert.deepEqual(sold.sort(), [s.oreId, s.oreId2].sort(), 'it sold both holds');
  assert.ok(sale.data.ore[s.oreId2] > 0 && v.cap2 > 0);
});

test('fleet: step invariance and offline catch-up with class upgrades and a dual-hold freighter', () => {
  const w = newWorld();
  let c = withLicense(midgame(w), 'freighter');
  c.coin = 1e22;
  c = run(c, w, { type: 'buyShip', cls: 'freighter' });
  c = run(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'multi' });
  c = run(c, w, { type: 'upgradeClass', cls: 'freighter', kind: 'hold2', n: 10 });
  c = run(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'loading', n: 10 });
  const end = c.t + 2 * DAY;
  const one = E.advance(c, w, end).colony;
  let many = c, odd = c, t = c.t, s = 7;
  for (let x = c.t + MIN; x <= end; x += MIN) many = E.advance(many, w, x).colony;
  while (t < end) { s = (s * 16807) % 2147483647; t = Math.min(end, t + 500 + (s % (2 * HOUR))); odd = E.advance(odd, w, t).colony; }
  for (const x of [many, odd]) {
    assert.ok(rel(one.earned, x.earned) < 0.01, `earned ${one.earned} vs ${x.earned}`);
    assert.ok(rel(one.stats.sold, x.stats.sold) < 0.01, `sold ${one.stats.sold} vs ${x.stats.sold}`);
  }
  assert.ok(one.earned > c.earned && one.stats.launches > c.stats.launches);
  // offline catch-up pays at about the live rate
  const live = E.rates(c, w).coinPerMin;
  const paid = (one.earned - c.earned) / (2 * DAY / MIN);
  assert.ok(paid > 0.3 * live && paid < 8 * live, `paid ${paid} vs rate ${live}`); // rates() prices the common mix; rare veins struck offline pay more
});

test('migration: a v5 colony (per-ship levels, no fleet) loads, drops ship levels and keeps running', () => {
  const w = newWorld();
  let c = JSON.parse(JSON.stringify(midgame(w)));
  c.v = 5; c.coin = 1e9;
  delete c.fleet;
  c.ships.forEach((s, i) => { s.lvl = 7 + i; delete s.oreId; delete s.oreId2; delete s.pickAt; });
  // an old ship mid-load with mixed cargo
  const ld = c.ships.find((s) => s.state === 'loading') || c.ships[0];
  ld.state = 'loading'; ld.cargo = { gravel: 3, amber: 9 }; ld.cargoG = { gravel: 3, amber: 9 }; ld.dockedAt = c.t; ld.firstLoadAt = c.t;
  assert.ok(Number.isFinite(E.rates(c, w).coinPerMin), 'rates work before any migration');
  const r = E.advance(c, w, c.t + HOUR).colony;
  assert.deepEqual(r.fleet, { hauler: { hold: 0, loading: 0 }, cruiser: { hold: 0, speed: 0 }, freighter: { hold: 0, multi: 0, hold2: 0 } });
  assert.ok(r.ships.every((s) => s.lvl === undefined && s.oreId !== undefined));
  const o = E.applyCommand(c, w, { type: 'upgradeClass', cls: 'hauler', kind: 'hold' }, c.t);
  assert.equal(o.error, undefined);
  assert.equal(o.colony.fleet.hauler.hold, 1);
  const r2 = E.advance(r, w, r.t + DAY).colony;
  assert.ok(r2.earned > r.earned && Number.isFinite(r2.coin));
  assertSane(r2, 'migrated');
});

test('hands-on: tapping digs ore, rush doubles a shaft for a minute, crates pay out on schedule', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 1e6);
  const s0 = c.shafts[0];
  const before = Object.values(c.tunnel || {}).reduce((a, b) => a + b, 0);
  let r = E.applyCommand(c, w, { type: 'dig', shaftId: s0.id }, c.t);
  assert.equal(r.error, undefined);
  assert.ok(Object.values(r.colony.tunnel).reduce((a, b) => a + b, 0) > before, 'a tap adds ore to the tunnel');
  // rush: x2 output for 60 s, then a cooldown
  const base = E.advance(c, w, c.t + 60_000).colony.earned;
  r = E.applyCommand(c, w, { type: 'rush', shaftId: s0.id }, c.t);
  assert.equal(r.error, undefined);
  assert.ok(r.events.some((e) => e.type === 'rush'));
  assert.match(E.applyCommand(r.colony, w, { type: 'rush', shaftId: s0.id }, c.t + 1000).error, /Rush ready/);
  // step-invariance across the rush ending
  const one = E.advance(r.colony, w, c.t + 3 * 60_000).colony;
  let many = r.colony; for (let t = c.t + 7_000; t <= c.t + 3 * 60_000; t += 7_000) many = E.advance(many, w, t).colony;
  many = E.advance(many, w, c.t + 3 * 60_000).colony;
  assert.ok(Math.abs(one.earned - many.earned) <= 0.005 * Math.max(1, one.earned) + 1e-6, `rush step invariance ${one.earned} vs ${many.earned}`);
  // crates: none up before the scheduled time, claimable inside the window, then the next is scheduled
  const cr = E.crateSync(c, c.t);
  assert.ok(cr.at > c.t);
  assert.match(E.applyCommand(c, w, { type: 'claimCrate' }, c.t).error, /No crate/);
  const got = E.applyCommand(c, w, { type: 'claimCrate' }, cr.at + 1000);
  assert.equal(got.error, undefined);
  assert.ok(got.events.some((e) => e.type === 'crate'));
  assert.ok(E.crateSync(got.colony, cr.at + 2000).at > cr.at + 2000, 'next crate scheduled');
  assert.equal(E.tierOf('gear', 23).name, 'Jackhammer');
});
