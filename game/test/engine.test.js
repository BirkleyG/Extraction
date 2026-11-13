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
    { id: 'ruby', name: 'Ruby', tier: 'rare', hardness: 4, depthMin: 6 },
    { id: 'opal', name: 'Opal', tier: 'rare', hardness: 5, depthMin: 10, baseValue: 12 },
    { id: 'star', name: 'Starheart', tier: 'mythic', hardness: 5, depthMin: 15 },
  ],
  buyers: [
    { id: 'depot', name: 'Ring Depot', distance: 'near', likes: { gravel: 1, amber: 0.9 } },
    { id: 'forge', name: 'Forge Moon', distance: 'mid', likes: { amber: 1.4, jade: 1.3 } },
    { id: 'court', name: 'Velvet Court', distance: 'far', likes: { ruby: 1.5, star: 5, gravel: 0.8 } },
    { id: 'scrap', name: 'Scrap Yard', distance: 'mid', likes: { gravel: 1.2 } },
  ],
};

const newWorld = () => ({ month: 'test', planet: PLANET, market: {}, startedAt: 0, endsAt: 30 * DAY, events: [], changes: [] });
const fresh = (now = 0) => E.newColony({ id: 'c1', uid: 'u1', name: 'Test', species: 'Mole', planet: PLANET, siteRegion: 'r1', now });

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
  let c = rich(fresh(0), w);
  c = run(c, w, { type: 'upgradeDrill' });
  c = run(c, w, { type: 'upgradeDrill' });
  for (let i = 0; i < 7; i++) c = run(c, w, { type: 'buyShaft' });
  c = run(c, w, { type: 'hire', n: 60 });
  for (const s of c.shafts) {
    c = run(c, w, { type: 'upgradeShaft', shaftId: s.id, kind: 'bunk', n: 4 });
    c = run(c, w, { type: 'upgradeShaft', shaftId: s.id, kind: 'cart', n: 3 });
  }
  c = run(c, w, { type: 'hire', n: 20 });
  c = run(c, w, { type: 'upgradeLift', n: 12 });
  c = run(c, w, { type: 'upgradeConveyor', n: 8 });
  c = run(c, w, { type: 'upgradeYard', n: 6 });
  c = run(c, w, { type: 'buyPad' });
  c = run(c, w, { type: 'buyShip', cls: 'hauler' });
  c = run(c, w, { type: 'buyShip', cls: 'cruiser' });
  for (const s of c.ships) c = run(c, w, { type: 'upgradeShip', shipId: s.id, n: 6 });
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
  assert.equal(c.shafts.length, 1);
  assert.equal(c.shafts[0].ore, 'gravel');
  assert.equal(c.shafts[0].face, 0);
  assert.ok(Array.isArray(c.shafts[0].pk));
  assert.equal(c.ships.length, 1);
  assert.equal(c.miners, 0);
  assert.ok(c.coin >= E.quote(c, newWorld(), { type: 'hire' }).cost, 'can afford the first miner');
  assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
  assert.deepEqual(E.unlocks(c, newWorld(), 1000).panels, ['mine', 'hire']);
});

test('determinism: same inputs give identical colonies', () => {
  const script = () => {
    const w = newWorld();
    let c = fresh(0);
    c = run(c, w, { type: 'hire' }, 1000);
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
  const r2 = E.applyCommand(c, w, { type: 'upgradeLift', n: 1 }, c.t + HOUR);
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
  assert.ok(one.shafts.reduce((a, q) => a + q.dug, 0) > 3, 'tunnels crossed several pocket boundaries');
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
  assert.ok(gained < 1.5 * live * 3 * 24 * 60);
  assertSane(r.colony, 'offline');
  const summary = r.events.find((e) => e.type === 'sales');
  assert.ok(summary && summary.data.coin > 0 && Object.keys(summary.data.ore).length > 0);
  assert.ok(r.sales.length > 0 && r.sales.every((s) => s.amount > 0 && PLANET.ores.some((o) => o.id === s.oreId)));
  assert.ok(r.events.filter((e) => e.type === 'sale').length <= 12, 'per-ship sale events are capped');
  assert.ok(JSON.stringify(r.events).length < 20_000);
});

test('commands: hire with n = 1, 10, 100 and max', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 1e6);
  assert.match(E.quote(c, w, { type: 'hire', n: 10 }).effect, /\+3 miners .*bunks full/, 'hiring stops at free bunks');
  c.shafts = Array.from({ length: 12 }, (_, i) => ({ ...c.shafts[0], id: 's' + i, up: { bunk: 10, cart: 0 } }));
  const q1 = E.quote(c, w, { type: 'hire', n: 1 });
  const q10 = E.quote(c, w, { type: 'hire', n: 10 });
  const q100 = E.quote(c, w, { type: 'hire', n: 100 });
  assert.equal(q1.n, 1); assert.equal(q10.n, 10); assert.equal(q100.n, 100);
  assert.ok(q10.cost > 10 * q1.cost && q100.cost > q10.cost, 'rising cost');
  assert.match(q10.effect, /\+10 miners \(0 → 10\)/);
  c.coin = 5000;
  const qm = E.quote(c, w, { type: 'hire', n: 'max' });
  assert.ok(qm.n > 1 && qm.cost <= c.coin && qm.canAfford);
  assert.ok(E.quote(c, w, { type: 'hire', n: qm.n + 1 }).cost > c.coin, 'max is the largest affordable');
  const after = run(c, w, { type: 'hire', n: 'max' });
  assert.equal(after.miners, qm.n);
  assert.ok(Math.abs(after.coin - (5000 - qm.cost)) < 1e-6);
  const full = run({ ...after, coin: 1e9 }, w, { type: 'hire', n: 'max' });
  assert.match(E.quote(full, w, { type: 'hire' }).error, /No free bunks/);
  const poor = { ...after, coin: 0 };
  const qp = E.quote(poor, w, { type: 'hire', n: 'max' });
  assert.equal(qp.canAfford, false);
  assert.ok(qp.cost > 0, 'max with no coin still shows the next price');
});

test('commands: shafts, shaft upgrades and re-drill', () => {
  const w = newWorld();
  let c = rich(fresh(0), w);
  const q = E.quote(c, w, { type: 'buyShaft' });
  assert.match(q.effect, /^Shaft 2: /);
  c = run(c, w, { type: 'buyShaft' });
  assert.equal(c.shafts.length, 2);
  const ns = c.shafts[1];
  assert.equal(ns.face, 0);
  assert.equal(ns.ore, 'gravel', 'a new tunnel starts on common ore');
  assert.ok(ns.pk.length >= 1 && ns.pk[0].start <= E.TUNING.pk.first[1], 'first pocket a few metres in');
  assert.match(q.effect, new RegExp(`first pocket: ${PLANET.ores.find((o) => o.id === ns.pk[0].ore).name}`), 'quote previews the first pocket');
  const s = c.shafts[0];
  const qc = E.quote(c, w, { type: 'upgradeShaft', shaftId: s.id, kind: 'cart', n: 10 });
  assert.match(qc.effect, /ore per miner/);
  c = run(c, w, { type: 'upgradeShaft', shaftId: s.id, kind: 'cart', n: 10 });
  c = run(c, w, { type: 'upgradeShaft', shaftId: s.id, kind: 'bunk', n: 'max' });
  assert.equal(c.shafts[0].up.cart, 10);
  assert.equal(c.shafts[0].up.bunk, E.TUNING.upMax0, 'bunks max out per depth');
  const r = E.applyCommand(c, w, { type: 'upgradeShaft', shaftId: s.id, kind: 'bunk', n: 1 }, c.t);
  assert.match(r.error, /maxed/);
  assert.match(E.applyCommand(c, w, { type: 'upgradeShaft', shaftId: 'nope', kind: 'cart' }, c.t).error, /No such shaft/);
  // re-drilling is gone: tunnels keep going and find the next pocket
  assert.equal(E.applyCommand(c, w, { type: 'redrill', shaftId: s.id }, c.t).error, 'Unknown command');
  assert.ok(!E.candidateMoves(c, w).some((m) => m.type === 'redrill'));
  // tunnel is full at 30
  let full = rich(fresh(0), w, 1e300);
  for (let i = 1; i < 30; i++) full = run(full, w, { type: 'buyShaft' });
  assert.equal(full.shafts.length, 30);
  assert.match(E.applyCommand(full, w, { type: 'buyShaft' }, 0).error, /full/);
});

test('commands: lift, conveyor, yard, pads, drill', () => {
  const w = newWorld();
  let c = rich(fresh(0), w);
  for (const type of ['upgradeLift', 'upgradeConveyor', 'upgradeYard']) {
    const q = E.quote(c, w, { type, n: 10 });
    assert.equal(q.n, 10);
    assert.match(q.effect, /^\+\d+% .*\(.* → .*\)/);
    c = run(c, w, { type, n: 10 });
  }
  assert.equal(c.lift, 10); assert.equal(c.conveyor, 10); assert.equal(c.yardLvl, 10);
  assert.ok(E.rates(c, w).liftPerMin > E.TUNING.liftBase * 5);
  c = run(c, w, { type: 'buyPad', n: 'max' });
  assert.equal(c.pads, E.TUNING.padMax);
  assert.match(E.applyCommand(c, w, { type: 'buyPad' }, c.t).error, /pads/);
  c = run(c, w, { type: 'upgradeDrill' });
  assert.equal(c.drill, 2);
  for (let i = 0; i < 3; i++) c = run(c, w, { type: 'upgradeDrill' });
  assert.equal(c.drill, 5);
  assert.match(E.applyCommand(c, w, { type: 'upgradeDrill' }, c.t).error, /Mythic drill license/);
  const day3 = E.advance(c, w, 2 * DAY + HOUR).colony;
  const d6 = run(day3, w, { type: 'upgradeDrill' });
  assert.equal(d6.drill, 6);
  assert.match(E.applyCommand(d6, w, { type: 'upgradeDrill' }, d6.t).error, /maxed/);
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
  const qs = E.quote(c, w, { type: 'upgradeShip', shipId: sh.id, n: 10 });
  assert.match(qs.effect, /cargo \(.* → .*\)/);
  c = run(c, w, { type: 'upgradeShip', shipId: sh.id, n: 10 });
  assert.equal(c.ships[1].lvl, 10);
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
  assert.match(E.applyCommand(fresh(0), w, { type: 'upgradeLift' }, 0).error, /Not unlocked/);
});

test('insufficient coin: error and nothing changes', () => {
  const w = newWorld();
  const c = rich(fresh(0), w, 5);
  for (const cmd of [{ type: 'upgradeLift' }, { type: 'buyShaft' }, { type: 'buyShip', cls: 'hauler' }, { type: 'hire', n: 10 }, { type: 'upgradeDrill' }]) {
    const r = E.applyCommand(c, w, cmd, c.t);
    assert.match(r.error, /Not enough coin/, cmd.type);
    assert.equal(r.colony.coin, c.coin);
    assert.equal(r.colony.shafts.length, c.shafts.length);
    assert.equal(E.quote(c, w, cmd).canAfford, false);
  }
});

test('fuzz: never negative, never NaN', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 2e5);
  let s = 12345;
  const rnd = (n) => { s = (s * 16807) % 2147483647; return s % n; };
  const kinds = ['hire', 'buyShaft', 'upgradeShaft', 'upgradeLift', 'upgradeConveyor', 'upgradeYard', 'buyPad', 'upgradeDrill', 'buyShip', 'upgradeShip', 'setRoute', 'rename'];
  let t = 0;
  for (let i = 0; i < 400; i++) {
    t += rnd(4) === 0 ? rnd(6 * HOUR) : rnd(20_000);
    const type = kinds[rnd(kinds.length)];
    const shaft = c.shafts[rnd(c.shafts.length)], ship = c.ships[rnd(c.ships.length)];
    const ns = [1, 10, 100, 'max'];
    const cmd = { type, n: ns[rnd(4)], shaftId: shaft.id, shipId: ship.id, kind: rnd(2) ? 'cart' : 'bunk', cls: ['hauler', 'cruiser', 'freighter'][rnd(3)],
      policy: ['best', 'nearest', 'fixed'][rnd(3)], destId: PLANET.buyers[rnd(4)].id, target: 'ship', id: ship.id, name: 'S' + i };
    const r = E.applyCommand(c, w, cmd, t);
    c = r.colony;
    assertSane(c, `step ${i} ${type}`);
    const rt = E.rates(c, w);
    for (const k of ['coinPerMin', 'minePerMin', 'liftPerMin', 'shipPerMin', 'throughput', 'score']) assert.ok(Number.isFinite(rt[k]) && rt[k] >= 0, k);
  }
  assert.ok(c.earned > 0);
});

// A shaft at depth 1 with one hand-placed pocket (later pockets roll after it as usual).
function withPocket(c, pocket) {
  c = JSON.parse(JSON.stringify(c));
  const s = c.shafts[1];
  Object.assign(s, { face: 0, pk: [pocket], pkN: 1, pkEnd: pocket.start + pocket.len, dug: 0 });
  return c;
}

test('pockets: strike, mine the pocket ore, back to common; rates show it', () => {
  const w = newWorld();
  let c = rich(fresh(0), w, 1e9);
  c = run(c, w, { type: 'upgradeDrill' });
  c = run(c, w, { type: 'buyShaft' });
  c = run(c, w, { type: 'upgradeLift', n: 20 });
  c = withPocket(c, { ore: 'amber', start: 1, len: 2 });
  c = run(c, w, { type: 'hire', n: 3 });
  c = run(c, w, { type: 'hire', n: 3 });
  assert.equal(c.shafts[1].ore, 'gravel');
  let r = E.rates(c, w).shafts[1];
  assert.equal(r.pocket, null);
  assert.equal(r.next.ore, 'amber');
  assert.ok(Math.abs(r.next.at - 1) < 1e-9 && r.next.blocked === false);
  assert.ok(r.metresPerMin > 0);
  const events = [], ores = [];
  let sawPocket = null;
  const t0 = c.t;
  for (let t = t0 + MIN; t < t0 + 3 * HOUR; t += MIN) {
    const x = E.advance(c, w, t);
    c = x.colony;
    events.push(...x.events.filter((e) => ['strike', 'pocketOut', 'blocked'].includes(e.type) && e.data.shaftId === c.shafts[1].id));
    if (ores[ores.length - 1] !== c.shafts[1].ore) ores.push(c.shafts[1].ore);
    const rs = E.rates(c, w).shafts[1];
    if (rs.pocket && !sawPocket) sawPocket = rs.pocket;
  }
  assert.deepEqual(events.slice(0, 2).map((e) => e.type), ['strike', 'pocketOut']);
  assert.match(events[0].text, /Shaft 2 struck Amber!/);
  assert.deepEqual(events[0].data, { shaftId: c.shafts[1].id, oreId: 'amber', tier: 'rare' });
  assert.equal(ores[1], 'amber', 'the crew mines the pocket ore');
  assert.notEqual(ores[2], 'amber', 'then goes back to common');
  assert.equal(E.TUNING.pk && PLANET.ores.find((o) => o.id === ores[2]).tier, 'common');
  assert.ok(sawPocket && sawPocket.ore === 'amber' && sawPocket.len === 2 && sawPocket.left <= 2);
  assert.ok(c.shafts[1].face > 3 && c.shafts[1].dug >= 1);
  assert.ok(!c.shafts[1].pk.some((p) => p.start + p.len <= c.shafts[1].face), 'dug-out pockets are pruned');
  // the strike lands when the face reaches 1 m: Q(1) ore at the shaft's rate
  const s1 = c.shafts[1];
  const rate = 3 * E.TUNING.minePerMiner * Math.pow(E.TUNING.richness, 1);
  const ore1 = E.TUNING.pk.minPerM * rate * (1 + 1 / (2 * E.TUNING.pk.haulM));
  assert.ok(Math.abs(events[0].at - (c.born + ore1 / rate * MIN)) < 2 * MIN, `strike near the right time (${events[0].at} vs ${ore1 / rate * MIN})`);
});

test('pockets: a hard pocket stops the face; walls pay 60% until the drill breaks in', () => {
  const w = newWorld();
  let c = rich(fresh(0), w);
  c = run(c, w, { type: 'buyShaft' });
  c = run(c, w, { type: 'upgradeLift', n: 20 });
  c = withPocket(c, { ore: 'jade', start: 0.5, len: 1.5 });
  c = run(c, w, { type: 'hire', n: 6 });
  assert.equal(c.miners, 6, 'a tunnel heading for a hard pocket still has bunks');
  const evs = [];
  const t0 = c.t;
  for (let t = t0 + MIN; t <= t0 + 2 * HOUR; t += 10 * MIN) { const x = E.advance(c, w, t); c = x.colony; evs.push(...x.events); }
  const s = c.shafts[1];
  assert.equal(s.face, 0.5, 'face waits at the pocket');
  assert.equal(evs.filter((e) => e.type === 'blocked').length, 1, 'blocked fires once');
  assert.match(evs.find((e) => e.type === 'blocked').text, /needs drill 3/);
  let r = E.rates(c, w).shafts[1];
  assert.equal(r.ok, true);
  assert.equal(r.blocked, true);
  assert.equal(r.need, 3);
  assert.equal(r.reason, 'Needs drill 3 to break into Jade');
  assert.equal(r.ore, 'gravel');
  const full = 3 * E.TUNING.minePerMiner * Math.pow(E.TUNING.richness, 1);
  assert.ok(Math.abs(r.wallRate - full * E.TUNING.pk.wall) < 1e-9 && r.orePerMin === r.wallRate);
  assert.deepEqual(r.next, { ore: 'jade', at: 0, blocked: true });
  const b = E.bottleneck(c, w);
  assert.equal(b.stage, 'blocked');
  assert.equal(b.suggestion.cmd.type, 'upgradeDrill');
  assert.match(b.message, /stuck at a pocket/);
  const mined = c.stats.mined;
  c = E.advance(c, w, c.t + HOUR).colony;
  assert.ok(c.stats.mined > mined, 'walls keep paying');
  assert.equal(c.shafts[1].face, 0.5);
  c = run(c, w, { type: 'upgradeDrill' });
  assert.equal(E.rates(c, w).shafts[1].blocked, true, 'drill 2 is not enough');
  c = run(c, w, { type: 'upgradeDrill' });
  r = E.rates(c, w).shafts[1];
  assert.equal(r.blocked, false);
  assert.equal(r.ore, 'jade');
  const x = E.advance(c, w, c.t + 10 * MIN);
  assert.ok(x.events.some((e) => e.type === 'strike' && e.data.oreId === 'jade'), 'breaking in is a strike');
  assert.ok(x.colony.shafts[1].face > 0.5, 'face moves again');
  // mythic pockets need the mythic drill even at drill 5
  c = withPocket(x.colony, { ore: 'star', start: 0, len: 1 });
  c.drill = 5;
  assert.match(E.rates(c, w).shafts[1].reason, /mythic drill/);
});

test('pockets: rolled from the seed, richer deeper, colony stays small after a month of digging', () => {
  const w = newWorld();
  let c = midgame(w);
  const a = E.advance(c, w, c.t + HOUR).colony, b = E.advance(JSON.parse(JSON.stringify(c)), w, c.t + HOUR).colony;
  assert.deepEqual(a.shafts.map((s) => s.pk), b.shafts.map((s) => s.pk));
  // deeper shafts roll harder, rarer ores
  let deep = rich(fresh(0), w, 1e300);
  for (let i = 1; i < 30; i++) deep = run(deep, w, { type: 'buyShaft' });
  const tierAt = (k) => deep.shafts[k].pk.map((p) => PLANET.ores.find((o) => o.id === p.ore));
  assert.ok(tierAt(1).every((o) => o.tier === 'rare' && o.depthMin <= 3));
  assert.ok(deep.shafts.slice(0, 15).every((s) => s.pk.every((p) => p.ore !== 'star')), 'mythic only deep');
  const t0 = c.t;
  for (let t = t0 + 6 * HOUR; t <= t0 + 30 * DAY; t += 6 * HOUR) c = E.advance(c, w, t).colony;
  const size = JSON.stringify(c).length;
  assert.ok(size < 30_000, `colony is ${size} bytes`);
  for (const s of c.shafts) assert.ok(s.pk.length <= E.TUNING.pk.ahead + 1, `${s.name} keeps ${s.pk.length} pockets`);
  assert.ok(c.shafts.some((s) => s.face > 100), 'tunnels get long');
  assert.ok(c.shafts.reduce((x, s) => x + s.dug, 0) > 20, 'many pockets dug');
  assertSane(c);
});

test('ships: load, launch, get paid on arrival, fly home', () => {
  const w = newWorld();
  let c = fresh(0);
  c = run(c, w, { type: 'hire' }, 0);
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
  c = run(c, w, { type: 'hire', n: 3 });
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
  c = run(c, w, { type: 'hire', n: 3 });
  const r = E.advance(c, w, c.t + HOUR);
  const w2 = E.recordSales(w, r.sales, r.colony.t);
  assert.ok(w2.market.gravel.index < 1);
});

test('bottleneck: names the stage and suggests the cheapest helpful command', () => {
  const w = newWorld();
  let c = rich(fresh(0), w);
  c = run(c, w, { type: 'buyShaft' });
  c = run(c, w, { type: 'upgradeDrill' });
  c = run(c, w, { type: 'hire', n: 6 });
  c = run(c, w, { type: 'upgradeConveyor', n: 10 });
  for (let i = 0; i < 3; i++) c = run(c, w, { type: 'buyShip', cls: 'hauler' });
  const b = E.bottleneck(c, w);
  assert.equal(b.stage, 'lift');
  assert.ok(b.wastedPerMin > 0);
  assert.match(b.message, /Your lift can't keep up: .* ore\/min piles up in the tunnels\. Upgrade the lift for .*\./);
  assert.deepEqual(b.suggestion.cmd, { n: 1, type: 'upgradeLift' });
  assert.equal(b.suggestion.cost, E.quote(c, w, { type: 'upgradeLift' }).cost);
  assert.equal(b.suggestion.canAfford, true);
  const after = run(c, w, b.suggestion.cmd);
  assert.ok(E.rates(after, w).coinPerMin > E.rates(c, w).coinPerMin, 'following it helps');
  // poor: still suggests, and prefers what you can afford
  const poor = { ...c, coin: E.quote(c, w, { type: 'hire' }).cost };
  const bp = E.bottleneck(poor, w);
  assert.ok(bp.suggestion);
  if (bp.suggestion.canAfford === false) {
    const all = E.bestMoves(poor, w, { limit: 0 }).filter((m) => m.gain > 0);
    assert.ok(all.every((m) => m.firstCost >= bp.suggestion.cost || poor.coin < m.firstCost));
  }
  // a balanced fresh mine: the mine itself is the limit and hiring helps
  const f = run(fresh(0), w, { type: 'hire' }, 0);
  const bf = E.bottleneck({ ...f, coin: 100 }, w);
  assert.equal(bf.stage, 'mine');
  assert.equal(bf.suggestion.cmd.type, 'hire');
});

test('unlocks: panels drip in, licenses follow the month, tutorial steps', () => {
  const w = newWorld();
  let c = fresh(0);
  let u = E.unlocks(c, w, 0);
  assert.deepEqual(u.panels, ['mine', 'hire']);
  assert.deepEqual(u.licenses, []);
  assert.equal(u.tutorial.step, 0);
  assert.match(u.tutorial.hint, /Hire/);
  c = run(c, w, { type: 'hire' }, 0);
  assert.equal(E.unlocks(c, w, 0).tutorial.step, 1);
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
  for (let i = 1; i < 30; i++) big = run(big, w, { type: 'buyShaft' });
  for (let i = 1; i < 20; i++) big = run(big, w, { type: 'buyShip', cls: 'hauler' });
  big = run(big, w, { type: 'buyPad', n: 'max' });
  big = run(big, w, { type: 'hire', n: 300 });
  big = run(big, w, { type: 'upgradeLift', n: 50 });
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
// A deep, busy colony: 14 shafts (some deeper than the drill can cut, they still cave in).
function deepColony(w) {
  let c = midgame(w);
  c.coin = 1e15;
  for (let i = 0; i < 6; i++) c = run(c, w, { type: 'buyShaft' });
  c = run(c, w, { type: 'hire', n: 'max' });
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
  assert.ok(prot.stats.mined > raw.stats.mined, 'protected shafts dig more');
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
  assert.equal(x.miners, 3, "the Guild sends a relief crew");
  assert.equal(x.lift, 0);
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
  let s = run(fresh(0), w, { type: 'hire' }, 0);
  s.evo = { mine: 0, ship: 0, sell: 2, spectacle: 0 };
  let t = 0, out = null;
  while (!out && t < 5 * MIN) { t += 1000; s = E.advance(s, w, t).colony; if (s.ships[0].state === 'out') out = s.ships[0]; }
  const sale = E.advance(s, w, out.arriveAt).events.find((e) => e.type === 'sale');
  const expect = Object.entries(out.cargoG).reduce((acc, [o, n]) => acc + n * E.marketPrice(w, o, out.dest, out.arriveAt), 0) * (1 + 2 * T.sell.per);
  assert.ok(Math.abs(sale.data.coin - expect) < 1e-9);
});
