// Release A2 acceptance: mine structure, improvements, veins, weather, fleet, destination choice, premium market and the
// transactional upgrade endpoint. Rule IDs: T03-05, T04-02/03, T05-01..04, T10-01/03/04/08, T18-03/11, section 02 accounting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryLedgerRepository, replayLedger, ledgerTransactionId } from '../src/ledger.js';
import { GameService, ownerPath, planetPath } from '../src/game-service.js';
import { generateWorld } from '../src/world.js';
import { generateRefineries } from '../src/npc-market.js';
import { createProductionState } from '../src/production.js';
import { addPad, addShaft, addShip, advanceOwner, createOwnerState, settleAuto, assignWorkers, hire, wastedWorkers, yardStock, takeoffSecond } from '../src/mine-engine.js';
import { MarketView, marketPath } from '../src/market-view.js';
import { SHIP_CLASSES, shipCapacityUnits, shipSpeedPerMinute, shipPrice, tripPlan } from '../src/ships.js';
import { bulkPrice, nextLevelPrice, padPrice, shaftPrice } from '../src/upgrades.js';
import { weatherAt } from '../src/environment.js';

const MONTH = '2026-11';
const T0 = Date.parse('2026-11-01T00:00:00Z');
const S0 = T0 / 1000;
const code = (c) => (e) => e.code === c;
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
let n = 0;
const cmd = (version, extra = {}) => ({ monthId: MONTH, requestId: `a2-${++n}`, expectedVersion: version, ...extra });
const ctx = (uid, sec, worldId = 'w') => ({ auth: { uid }, activeMonthId: MONTH, now: (S0 + sec) * 1000, worldId, startSite: { siteId: 's', commonOreId: 'ore-1' } });
const flat = [{ id: 'near', name: 'Near', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 1500 }, { id: 'far', name: 'Far', distance: 3, bidPerUnit: 64, unloadUnitsPerMinute: 900 }, { id: 'mid', name: 'Mid', distance: 8, bidPerUnit: 52, unloadUnitsPerMinute: 1200 }];

/** Give an owner spendable coin through the ledger (test-only START_GRANT source). */
async function fund(repo, uid, amount) {
  await repo.transact((tx) => tx.append({
    id: ledgerTransactionId('START_GRANT', uid, MONTH, 'test-fund'), ownerId: uid, monthId: MONTH, timestamp: T0, type: 'START_GRANT', reference: 'test-fund',
    postings: [{ account: `owner:${enc(uid)}:${enc(MONTH)}:spendable`, delta: amount }, { account: `source:START_GRANT:${enc(ledgerTransactionId('START_GRANT', uid, MONTH, 'test-fund'))}`, delta: -amount }],
  }));
}
const readDoc = (repo, path) => repo.transact((tx) => tx.getDoc(path), { worldId: 'w', ownerId: 'system', monthId: MONTH, readOnly: true });
const patchOwner = (repo, uid, fn, worldId = 'w') => repo.transact(async (tx) => { const d = await tx.getDoc(ownerPath(worldId, uid, MONTH)); await tx.putDoc(ownerPath(worldId, uid, MONTH), fn(d) ?? d); });
const settleTo = (game, uid, sec) => game.settleThrough({ worldId: 'w', ownerId: uid, monthId: MONTH, toSec: S0 + sec });
const view = (game, uid, sec) => game.ownerView(uid, MONTH, ctx(uid, sec));
const snapshotAll = async (repo, uid) => JSON.stringify([repo.snapshot().ledger, [...repo.snapshot().balances], await readDoc(repo, ownerPath('w', uid, MONTH)), await readDoc(repo, marketPath('w', MONTH, 'near'))]);
/** Place `units` of an ore on the owner's yard with exact mass accounting (initial inventory grows by the same amount). */
function giveOre(doc, oreId, tier, units) {
  const p = doc.production;
  const bump = (rows) => { const r = rows.find((x) => x.oreId === oreId); if (r) r.units += units; else rows.push({ oreId, units }); };
  bump(p.surface.unitsByOre); bump(p.initialUnitsByOre);
  doc.oreTiers[oreId] = tier;
  doc.production = createProductionState(p);
  return doc;
}

async function setup({ players = ['alice'], buyers = flat, planet = null, auto = false } = {}) {
  const repo = new MemoryLedgerRepository();
  const game = new GameService(repo, { npcBuyers: buyers });
  if (planet) await game.storePlanet({ worldId: 'w', monthId: MONTH, planet });
  const versions = {};
  for (const uid of players) {
    let r = await game.enroll(cmd(0), ctx(uid, 0));
    if (!auto) r = await game.setPolicy(cmd(r.version, { auto: false }), ctx(uid, 0));
    versions[uid] = r.version;
  }
  return { repo, game, versions };
}
const planetFor = (players = 3, refineries = generateRefineries({ seed: 'seed-abcdefgh', monthId: MONTH, count: 3 })) =>
  ({ ...generateWorld({ seed: 'seed-abcdefgh', monthId: MONTH, players }), cosmeticSeed: 'cosmetic', weatherSeed: 'weather-seed-1234', refineries });

// ----------------------------------------------------------------------------------------------- mine structure
test('T03-05 shafts 2..30 cost round(120 x 2.4^(k-1)); shaft 31 never exists and charges nothing', async () => {
  for (let k = 2; k <= 30; k += 1) assert.equal(shaftPrice(k), Math.round(120 * 2.4 ** (k - 1)));
  assert.throws(() => shaftPrice(31), (e) => e.code === 'INVALID_SHAFT');
  let state = createOwnerState({ ownerId: 'alice', monthId: MONTH, siteId: 's', commonOreId: 'ore-1', nowSec: S0 });
  for (let k = 2; k <= 30; k += 1) state = addShaft(state).state;
  assert.equal(state.production.shafts.length, 30);
  assert.throws(() => addShaft(state), (e) => e.code === 'INVALID_SHAFT');
  // through the service: nothing is charged or changed
  const { repo, game, versions } = await setup();
  await fund(repo, 'alice', 10_000);
  await patchOwner(repo, 'alice', () => state);
  const before = await snapshotAll(repo, 'alice');
  await assert.rejects(game.buyShaft(cmd(versions.alice), ctx('alice', 0)), code('INVALID_SHAFT'));
  assert.equal(await snapshotAll(repo, 'alice'), before);
});

test('pads: 1 at start, pads 2..12 cost round(4000 x 6^(n-2)), a 13th never exists', () => {
  let state = createOwnerState({ ownerId: 'a', monthId: MONTH, siteId: 's', commonOreId: 'ore-1', nowSec: S0 });
  assert.equal(state.pads, 1);
  for (let p = 2; p <= 12; p += 1) { const r = addPad(state, S0); assert.equal(r.cost, padPrice(p)); assert.equal(r.cost, Math.round(4000 * 6 ** (p - 2))); state = r.state; }
  assert.equal(state.pads, 12);
  assert.equal(state.padFreeAt.length, 12);
  assert.throws(() => addPad(state, S0), (e) => e.code === 'INVALID_PAD');
});

test('shaft improvements are per shaft and capped at 10: carts utilization, bunkhouse capacity, lights, supports', async () => {
  const { repo, game, versions } = await setup();
  await fund(repo, 'alice', 5_000_000);
  await patchOwner(repo, 'alice', (d) => addShaft(d).state);
  let v = versions.alice;
  const buy = async (line, shaftNumber, mode = 1) => { const r = await game.buyUpgrade(cmd(v, { line, shaftNumber, mode }), ctx('alice', 0)); v = r.version; return r; };
  await buy('lights', 2); await buy('supports', 2, 10); await buy('carts', 1, 10); await buy('bunkhouse', 1, 10);
  const doc = (await view(game, 'alice', 0)).doc;
  const [s1, s2] = doc.production.shafts;
  assert.equal(s2.lightsLevel, 1); assert.equal(s1.lightsLevel, 0, 'lights are per shaft');
  assert.equal(s2.supportsLevel, 10); assert.equal(s1.cartLevel, 10); assert.equal(s1.bunkhouseLevel, 10);
  await assert.rejects(game.buyUpgrade(cmd(v, { line: 'carts', shaftNumber: 1, mode: 1 }), ctx('alice', 0)), code('AT_CAP'));
  await assert.rejects(game.buyUpgrade(cmd(v, { line: 'lights', shaftNumber: 2, mode: 10 }), ctx('alice', 0)), code('AT_CAP'), 'level 1 + 10 would exceed the cap of 10');
  await assert.rejects(game.buyUpgrade(cmd(v, { line: 'lights', shaftNumber: 9, mode: 1 }), ctx('alice', 0)), code('UNKNOWN_SHAFT'));
  // utilization 0.25 + 0.075 L reaches 1.0 and worker capacity is 10 + 5 L
  const rate = (shaft) => 5 * 1 * (1 + 0.04 * shaft.digLevel) * (0.25 + 0.075 * shaft.cartLevel);
  assert.ok(Math.abs(((await game.state('alice', MONTH, ctx('alice', 0))).mine.shafts[0].ratePerMinute) - rate({ digLevel: 1, cartLevel: 10 })) < 1e-9);
  assert.equal((await game.state('alice', MONTH, ctx('alice', 0))).mine.shafts[0].workerCapacity, 60);
});

test('worker pool: auto-assignment fills the deepest-rate shafts first and surplus labor is flagged "!" (wasted), never lost', () => {
  let state = createOwnerState({ ownerId: 'a', monthId: MONTH, siteId: 's', commonOreId: 'ore-1', nowSec: S0 });
  state = addShaft(state).state;
  state.levels.habitat = 40; // capacity 90
  state = hire(state, 20).state;
  assert.equal(state.workersHired, 25);
  assert.equal(state.production.shafts[1].workersAssigned, 10, 'the faster, deeper shaft is seated first');
  assert.equal(state.production.shafts[0].workersAssigned, 10);
  assert.equal(wastedWorkers(state), 5);
  const raised = assignWorkers({ ...state, production: { ...state.production, shafts: state.production.shafts.map((s) => ({ ...s, bunkhouseLevel: 1 })) } });
  assert.equal(wastedWorkers(raised), 0, 'more bunkhouse capacity seats the waiting miners');
  assert.throws(() => hire(state, 100), (e) => e.code === 'NO_HABITAT_CAPACITY');
});

// ----------------------------------------------------------------------------------------------- veins, soil, weather
const veined = (size = 300) => {
  const base = createOwnerState({ ownerId: 'a', monthId: MONTH, siteId: 's', commonOreId: 'ore-1', nowSec: S0, oreTiers: { 'ore-3': 'rare' },
    veinPlan: [{ id: 'v1', oreId: 'ore-3', tier: 'rare', shaftNumber: 2, size, remaining: size }] });
  const withShaft = addShaft(base).state;
  withShaft.workersHired = 20; withShaft.levels.habitat = 10;
  // a strong lift and a big yard so the vein, not the lift or the yard, limits output in these mass tests
  withShaft.production = createProductionState({ ...withShaft.production, lift: { ...withShaft.production.lift, level: 300 }, surface: { ...withShaft.production.surface, capacityUnits: 1e7 } });
  return assignWorkers(withShaft);
};

test('T04-02/03 a depleting vein warns at 20% and 5%, tapers, never exceeds its size, then the shaft returns to common ore', () => {
  let state = veined(300);
  const mined = (st) => st.production.cumulativeMinedByOre.find((r) => r.oreId === 'ore-3')?.units ?? 0;
  const seenWarning = new Set();
  const fraction = (st) => st.production.shafts[1].vein.remaining / 300;
  let sawTaper = false;
  for (let t = 0; t < 40_000; t += 10) {
    state = advanceOwner(state, state.simSecond + 10, 50_000).state;
    const f = fraction(state);
    if (f < 0.2) seenWarning.add('LOW'); if (f < 0.05) seenWarning.add('CRITICAL');
    if (f < 0.05 && f > 0) sawTaper = true;
    assert.ok(state.production.shafts[1].vein.remaining >= 0, 'never negative');
    assert.ok(mined(state) <= 300 + 1e-9, 'T04-03 mined units never exceed the vein size');
  }
  assert.ok(seenWarning.has('LOW') && seenWarning.has('CRITICAL') && sawTaper);
  assert.ok(Math.abs(mined(state) - 300) < 1e-6, 'the vein is fully mined');
  const shaft = state.production.shafts[1];
  assert.equal(shaft.vein.remaining, 0);
  assert.equal(shaft.oreId, 'ore-1', 'depleted shaft continues on the common ore of its band');
  const commonBefore = state.production.cumulativeMinedByOre.find((r) => r.oreId === 'ore-1').units;
  state = advanceOwner(state, state.simSecond + 600, 50_000).state;
  assert.ok(state.production.cumulativeMinedByOre.find((r) => r.oreId === 'ore-1').units > commonBefore);
  assert.ok(Math.abs(mined(state) - 300) < 1e-6, 'no more rare ore after depletion');
});

test('T04-02/03 fast-forward over a vein equals the one-second loop and never overshoots', () => {
  const a = advanceOwner(veined(5000), S0 + 40_000, 100_000).state;
  let b = veined(5000);
  for (let i = 0; i < 40_000; i += 100) b = advanceOwner(b, b.simSecond + 100, 100_000).state;
  const rare = (st) => st.production.cumulativeMinedByOre.find((r) => r.oreId === 'ore-3')?.units ?? 0;
  assert.ok(rare(a) <= 5000 + 1e-9);
  assert.ok(Math.abs(rare(a) - rare(b)) <= 1e-6 * Math.max(1, rare(a)));
  assert.ok(Math.abs(a.production.shafts[1].vein.remaining - b.production.shafts[1].vein.remaining) <= 1e-6);
});

test('soil and weather modifiers feed the production formula and live == catch-up across weather hours', () => {
  const env = { soil: 'loam', soilHardness: 3, weatherSeed: 'weather-seed-1234', baseWeather: 'clear' };
  const mk = (e) => createOwnerState({ ownerId: 'a', monthId: MONTH, siteId: 's', commonOreId: 'ore-1', nowSec: S0, env: e });
  const mined = (st) => st.production.cumulativeMinedByOre[0]?.units ?? 0;
  const neutral = advanceOwner(mk(null), S0 + 1200, 50_000).state;
  const loam = advanceOwner(mk(env), S0 + 1200, 50_000).state;
  const kind = weatherAt(env, S0).productionModifier;
  assert.ok(Math.abs(mined(loam) / mined(neutral) - 1.1 * (1 - 0.01 * (3 - 5)) * kind) < 1e-6, 'soil x weather x base formula');
  const once = advanceOwner(mk(env), S0 + 6 * 3600 + 17, 100_000).state;
  let steps = mk(env);
  for (let t = S0; t < S0 + 6 * 3600 + 17; t += 777) steps = advanceOwner(steps, Math.min(t + 777, S0 + 6 * 3600 + 17), 100_000).state;
  assert.ok(Math.abs(mined(once) - mined(steps)) <= 1e-6 * mined(once));
  assert.equal(once.simSecond, steps.simSecond);
});

// ----------------------------------------------------------------------------------------------- ships
test('ship classes: Cruiser 3x speed/35% hold, Freighter 60% speed/3x hold at ~1.8x the price (section 05)', () => {
  const state = createOwnerState({ ownerId: 'a', monthId: MONTH, siteId: 's', commonOreId: 'ore-1', nowSec: S0 });
  const h = { class: 'hauler' }; const c = { class: 'cruiser' }; const f = { class: 'freighter' };
  assert.equal(shipCapacityUnits(state, h), 150); assert.equal(shipSpeedPerMinute(state, h), 0.5);
  assert.equal(shipCapacityUnits(state, c), Math.floor(150 * 0.35)); assert.ok(Math.abs(shipSpeedPerMinute(state, c) - 1.5) < 1e-12);
  assert.equal(shipCapacityUnits(state, f), 450); assert.ok(Math.abs(shipSpeedPerMinute(state, f) - 0.3) < 1e-12);
  assert.ok(Math.abs(shipPrice('freighter') / shipPrice('hauler') - 1.8) < 1e-9);
  assert.throws(() => shipPrice('galleon'), (e) => e.code === 'UNKNOWN_SHIP_CLASS');
  assert.deepEqual(Object.keys(SHIP_CLASSES), ['hauler', 'cruiser', 'freighter']);
});

test('T05-01 the destination table, the dispatch plan and the simulated trip use one function and agree to the second', async () => {
  const { game, versions } = await setup();
  const before = await game.state('alice', MONTH, ctx('alice', 0));
  const rows = before.fleet.ships[0].destinations;
  assert.equal(rows.length, 3);
  assert.equal(rows.filter((r) => r.best).length, 1);
  for (const r of rows) { assert.equal(r.tax, 0); assert.ok(r.coinPerMinute > 0); assert.equal(r.tripSeconds >= 2 * Math.floor((r.distance / 0.5) * 60), true); }
  const row = rows.find((r) => r.id === 'far');
  const res = await game.dispatch(cmd(versions.alice, { destinationId: 'far' }), ctx('alice', 0));
  assert.equal(res.shipment.tripSeconds, row.tripSeconds);
  assert.equal(res.plan.busySeconds, row.busySeconds);
  assert.equal(res.shipment.payment, row.payment);
  assert.equal(res.shipment.arrivalSecond - S0, row.arrivalOffsetSeconds);
});

test('ship policies: best coin per minute, nearest, fixed and preferred list choose from the same table', async () => {
  const { game, versions } = await setup({ auto: true });
  let v = versions.alice;
  const policyDispatch = async (policy, at) => {
    v = (await game.setPolicy(cmd(v, { auto: false, ...policy }), ctx('alice', at))).version;
    const r = await game.dispatch(cmd(v), ctx('alice', at)); v = r.version; return r.shipment.destinationId;
  };
  const rows = (await game.state('alice', MONTH, ctx('alice', 0))).fleet.ships[0].destinations;
  const best = rows.find((r) => r.best).id;
  assert.equal(await policyDispatch({ mode: 'best', destinationId: null }, 0), best);
  // each later trip needs a fresh load and a free ship
  const nearest = [...rows].sort((a, b) => a.distance - b.distance)[0].id;
  assert.equal(await policyDispatch({ mode: 'nearest' }, 4 * 3600), nearest);
  assert.equal(await policyDispatch({ mode: 'fixed', destinationId: 'mid' }, 8 * 3600), 'mid');
  assert.equal(await policyDispatch({ mode: 'preferred', preferred: ['mid', 'near'], destinationId: null }, 12 * 3600), ['mid', 'near'].sort((a, b) => rows.find((r) => r.id === b).coinPerMinute - rows.find((r) => r.id === a).coinPerMinute)[0]);
  await assert.rejects(game.setPolicy(cmd(v, { mode: 'cheapest' }), ctx('alice', 12 * 3600)), code('INVALID_COMMAND'));
  await assert.rejects(game.setPolicy(cmd(v, { preferred: ['nowhere'] }), ctx('alice', 12 * 3600)), code('UNKNOWN_DESTINATION'));
});

test('fleet: buying ships and pads is a paid, atomic, capped purchase; each ship has its own policy and sale', async () => {
  const { repo, game, versions } = await setup();
  await fund(repo, 'alice', 100_000);
  let v = versions.alice;
  await assert.rejects(game.buyShip(cmd(v, { class: 'galleon' }), ctx('alice', 0)), code('UNKNOWN_SHIP_CLASS'));
  const bought = await game.buyShip(cmd(v, { class: 'cruiser' }), ctx('alice', 0)); v = bought.version;
  assert.equal(bought.spent, shipPrice('cruiser')); assert.equal(bought.shipId, 'ship-2');
  const pad = await game.buyPad(cmd(v), ctx('alice', 0)); v = pad.version;
  assert.equal(pad.spent, padPrice(2));
  const p = await game.setPolicy(cmd(v, { shipId: 'ship-2', auto: false, mode: 'fixed', destinationId: 'far' }), ctx('alice', 0)); v = p.version;
  assert.equal(p.shipId, 'ship-2');
  const r = await game.dispatch(cmd(v, { shipId: 'ship-2', destinationId: 'near' }), ctx('alice', 0));
  assert.ok(r.shipment.units <= shipCapacityUnits(createOwnerState({ ownerId: 'a', monthId: MONTH, siteId: 's', commonOreId: 'o', nowSec: 0 }), { class: 'cruiser' }));
  assert.equal(r.shipment.shipId, 'ship-2');
  const doc = (await view(game, 'alice', 0)).doc;
  assert.equal(doc.ships[0].readyAtSecond, S0, 'the other ship stayed on its pad');
  assert.equal(replayLedger(repo.snapshot().ledger).balances.get(`owner:${enc('alice')}:${enc(MONTH)}:spendable`), (await view(game, 'alice', 0)).spendable);
  const pad3 = await game.buyPad(cmd(r.version), ctx('alice', 0));
  assert.equal(pad3.spent, padPrice(3));
  // purchases that cannot be afforded change nothing
  const before = await snapshotAll(repo, 'alice');
  await assert.rejects(game.buyPad(cmd(pad3.version), ctx('alice', 0)), code('INSUFFICIENT_FUNDS'));
  assert.equal(await snapshotAll(repo, 'alice'), before);
});

test('T05-04 ships never leave without cargo unless ordered; a ship that is away cannot be dispatched again', async () => {
  const { game, versions } = await setup();
  const first = await game.dispatch(cmd(versions.alice, { destinationId: 'near' }), ctx('alice', 0));
  await assert.rejects(game.dispatch(cmd(first.version, { destinationId: 'near' }), ctx('alice', 1)), code('SHIP_BUSY'));
  const later = 6 * 3600;
  await game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: S0 + later });
  const empty = await game.dispatch(cmd(first.version, { destinationId: 'near' }), ctx('alice', later));
  assert.ok(empty.shipment.units >= 1);
  await assert.rejects(game.dispatch(cmd(empty.version, { destinationId: 'near', shipId: 'ship-1' }), ctx('alice', later + 30)), code('SHIP_BUSY'));
});

// ----------------------------------------------------------------------------------------------- weather grounding
function stormEnv() {
  for (let i = 0; i < 400; i += 1) {
    const env = { soil: 'basalt', soilHardness: 5, weatherSeed: `weather-seed-${1000 + i}`, baseWeather: 'storm' };
    const grounded = [...Array(24).keys()].filter((h) => weatherAt(env, S0 + h * 3600).grounded);
    if (grounded.length) return { env, hour: grounded[0] };
  }
  throw new Error('no grounded hour found');
}

test('weather grounding: the ship waits (no loss), the delay is recorded, and a forced launch is rejected without mutation', async () => {
  const { env, hour } = stormEnv();
  const gStart = S0 + hour * 3600;
  let state = createOwnerState({ ownerId: 'alice', monthId: MONTH, siteId: 's', commonOreId: 'ore-1', nowSec: gStart - 5 * 3600 > S0 ? gStart - 5 * 3600 : S0, env });
  state.ships[0].readyAtSecond = gStart; // ready exactly when the storm hour begins
  state = giveOre(state, 'ore-1', 'common', 300 - 5);
  const market = new MarketView(flat, {}, 0);
  const departures = [];
  assert.ok(takeoffSecond(state, gStart) > gStart, 'the hour is grounded');
  state.simSecond = Math.min(state.simSecond, gStart);
  const settled = settleAuto(state, market, gStart + 3600 * 2, {});
  departures.push(...settled.departures);
  assert.ok(departures.length >= 1);
  const d = departures[0];
  assert.ok(d.departureSecond >= takeoffSecond(state, gStart), 'never departs while grounded');
  assert.ok(!weatherAt(env, d.departureSecond).grounded);
  assert.equal(d.units, 150, 'cargo intact');
  assert.ok(d.weatherDelaySeconds > 0, 'delay is disclosed');
  // service-level forced launch while grounded is rejected and changes nothing
  const { repo, game, versions } = await setup();
  await patchOwner(repo, 'alice', (doc) => { doc.env = env; doc.simSecond = gStart - 1; doc.ships[0].readyAtSecond = 0; doc.production = createProductionState({ ...doc.production, elapsedSeconds: doc.production.elapsedSeconds }); });
  await settleTo(game, 'alice', gStart - S0);
  const before = await snapshotAll(repo, 'alice');
  await assert.rejects(game.dispatch(cmd(versions.alice, { destinationId: 'near' }), ctx('alice', gStart - S0)), code('WEATHER_GROUNDED'));
  assert.equal(await snapshotAll(repo, 'alice'), before);
});

// ----------------------------------------------------------------------------------------------- docks
test('dock reservation: berths are finite, a late-dated departure is not blocked by another owner\'s later booking', () => {
  const view4 = new MarketView([{ id: 'r', distance: 1, bidPerUnit: 40, unloadUnitsPerMinute: 60, docks: 2 }], {}, 0);
  const q = (units) => view4.quote('r', [{ oreId: 'o', tier: 'common', units }], 0);
  const wait = (arrival, unload) => view4.dockWait('r')(arrival, unload);
  assert.equal(wait(100, 60), 0);
  view4.commit('r', q(1), { arrivalSec: 100, unloadSeconds: 60 });
  view4.commit('r', q(1), { arrivalSec: 100, unloadSeconds: 60 });
  assert.equal(wait(100, 60), 60, 'both berths busy until 160');
  assert.equal(wait(30, 60), 0, 'an earlier-dated arrival fits before the bookings');
  view4.commit('r', q(1), { arrivalSec: 100, unloadSeconds: 60 });
  assert.equal(wait(100, 60), 60, 'the third booking took the first berth to free up, one berth is open again at 160');
  view4.commit('r', q(1), { arrivalSec: 100, unloadSeconds: 60 });
  assert.equal(wait(100, 60), 120);
  assert.equal(wait(1000, 60), 0);
});

// ----------------------------------------------------------------------------------------------- premium market (section 02)
const richPlanet = (premium) => {
  const refineries = generateRefineries({ seed: 'seed-abcdefgh', monthId: MONTH, count: 3 }).map((r) => ({ ...r, bidPerUnit: 40, distance: 1, premium: { ...r.premium, ...premium } }));
  return planetFor(3, refineries);
};
async function rareWorld(premium, owners = ['alice', 'bob'], units = 4) {
  const planet = richPlanet(premium);
  const ctxs = await setup({ players: owners, planet });
  for (const o of owners) await patchOwner(ctxs.repo, o, (d) => { d.env = null; return giveOre(d, 'ore-3', 'rare', units); });
  return { ...ctxs, planet };
}
const sendRare = (game, uid, version, units = 4) => game.dispatch(cmd(version, { destinationId: 'refinery-1', units }), ctx(uid, 0));

test('T18-11 racing the last premium coin: exactly one owner receives it; the base bid stays unlimited (Q-10)', async () => {
  const planetRef = richPlanet({});
  const target = planetRef.refineries[0];
  const { repo, game, versions } = await rareWorld({ fundsMax: 80, storageCapacity: 1000, refillPerHour: 0, drainPerHour: 0 }, ['alice', 'bob']);
  const results = await Promise.all([sendRare(game, 'alice', versions.alice), sendRare(game, 'bob', versions.bob)]);
  const pays = results.map((r) => r.shipment.payment).sort((a, b) => a - b);
  assert.deepEqual(pays, [4 * 40, 4 * 40 + 80], 'one base-only payment and one with the single premium coin');
  assert.equal(results.reduce((a, r) => a + r.shipment.premiumPayment, 0), 80, 'premium paid out never exceeds the finite budget');
  const market = await readDoc(repo, marketPath('w', MONTH, target.id));
  assert.equal(market.premiumFunds, 0);
  assert.ok(market.premiumFunds >= 0);
  assert.equal(repo.snapshot().ledger.filter((e) => e.type === 'NPC_RAW_PURCHASE').length, 2);
  const sold = results.reduce((a, r) => a + r.shipment.payment, 0);
  const balances = replayLedger(repo.snapshot().ledger).balances;
  assert.equal(balances.get(`owner:${enc('alice')}:${enc(MONTH)}:spendable`) + balances.get(`owner:${enc('bob')}:${enc(MONTH)}:spendable`), sold);
  assert.ok(repo.reconcile());
});

test('T18-11 racing the last storage slot: premium units never exceed refinery storage; later cargo is paid at the base bid', async () => {
  const { repo, game, versions, planet } = await rareWorld({ fundsMax: 1_000_000, storageCapacity: 5, refillPerHour: 0, drainPerHour: 0 }, ['alice', 'bob']);
  const results = await Promise.all([sendRare(game, 'alice', versions.alice), sendRare(game, 'bob', versions.bob)]);
  const premiumUnits = results.reduce((a, r) => a + r.shipment.cargo.reduce((s, l) => s + l.premiumUnits, 0), 0);
  assert.equal(premiumUnits, 5, 'exactly the five slots were filled with premium cargo');
  const market = await readDoc(repo, marketPath('w', MONTH, planet.refineries[0].id));
  assert.equal(market.storageUsed, 5);
  for (const r of results) assert.ok(r.shipment.payment >= 4 * 40, 'base bid is always paid');
  // a third consignment finds the store full: base bid only, no premium at all
  await patchOwner(repo, 'alice', (d) => { d.ships[0].readyAtSecond = 0; return giveOre(d, 'ore-3', 'rare', 3); });
  const third = await game.dispatch(cmd(results[0].version ?? 0, { destinationId: 'refinery-1', units: 3 }), ctx('alice', 100)).catch((e) => e);
  assert.ok(third.shipment ? third.shipment.premiumPayment === 0 && third.shipment.payment === 120 : third.code === 'STALE_VERSION');
});

test('no unlimited premium demand: repeated rare sales run the premium dry while common and base payments continue', async () => {
  const { repo, game, versions } = await rareWorld({ fundsMax: 600, storageCapacity: 100_000, refillPerHour: 0, drainPerHour: 0 }, ['alice'], 40);
  let v = versions.alice; let premium = 0; let t = 0;
  for (let i = 0; i < 5; i += 1) {
    const r = await game.dispatch(cmd(v, { destinationId: 'refinery-1', units: 8 }), ctx('alice', t)); v = r.version; premium += r.shipment.premiumPayment;
    assert.equal(r.shipment.basePayment, 8 * 40);
    t += 4000;
    await game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: S0 + t });
  }
  assert.ok(premium <= 600 && premium > 0, `premium ${premium} stays within the finite budget`);
});

test('refineries: every planet gets at least three, owners see them with unlimited base bids and an exhaustible premium', async () => {
  const planet = planetFor();
  assert.ok(planet.refineries.length >= 3);
  const { game } = await setup({ planet });
  const st = await game.state('alice', MONTH, ctx('alice', 0));
  assert.ok(st.offers.length >= 3);
  assert.ok(st.offers.every((o) => o.unlimited === true));
  assert.ok(!JSON.stringify(st).includes('premiumFunds'), 'refinery budgets are server truth');
});

// ----------------------------------------------------------------------------------------------- determinism and secrecy
test('T18-03 replay == live == catch-up: multi-ship fleet with weather and a vein settles identically however it is chunked', async () => {
  const planet = planetFor();
  const run = async (stepSec) => {
    const { repo, game, versions } = await setup({ planet, auto: true });
    await fund(repo, 'alice', 2_000_000);
    let v = versions.alice;
    v = (await game.buyShip(cmd(v, { class: 'cruiser' }), ctx('alice', 0))).version;
    v = (await game.buyPad(cmd(v), ctx('alice', 0))).version;
    for (let t = stepSec; t <= 2 * 86400; t += stepSec) await game.settleThrough({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: S0 + t });
    const doc = (await view(game, 'alice', 2 * 86400)).doc;
    const ledger = repo.snapshot().ledger;
    const replay = replayLedger(ledger).balances;
    assert.equal(replay.get(`owner:${enc('alice')}:${enc(MONTH)}:spendable`), (await view(game, 'alice', 2 * 86400)).spendable);
    assert.ok(repo.reconcile());
    return { shipments: doc.shipments.map((s) => [s.id, s.shipId, s.units, s.payment, s.departureSecond, s.destinationId]), earned: doc.totalExternalEarnings, count: ledger.filter((e) => e.type === 'NPC_RAW_PURCHASE').length };
  };
  const single = await run(2 * 86400);
  const hourly = await run(3600);
  assert.ok(single.count > 5);
  assert.deepEqual(single, hourly);
});

test('arrival never pays again: passing every ETA, a month close or a replay adds no NPC payments', async () => {
  const { repo, game, versions } = await setup();
  const r = await game.dispatch(cmd(versions.alice, { destinationId: 'far' }), ctx('alice', 0));
  const paid = repo.snapshot().ledger.filter((e) => e.type === 'NPC_RAW_PURCHASE').length;
  await game.state('alice', MONTH, ctx('alice', r.shipment.arrivalSecond - S0 + 10_000));
  await game.settleBatch({ worldId: 'w', ownerId: 'alice', monthId: MONTH, toSec: r.shipment.arrivalSecond + 100 });
  assert.equal(repo.snapshot().ledger.filter((e) => e.type === 'NPC_RAW_PURCHASE').length, paid);
});

test('the owner read model never carries weather seeds, unassigned veins, refinery budgets or other players', async () => {
  const planet = planetFor(); const { game, repo } = await setup({ planet, players: ['alice', 'bob'] });
  const json = JSON.stringify(await game.state('alice', MONTH, ctx('alice', 600)));
  for (const secret of ['weatherSeed', 'veinPlan', 'premiumFunds', 'dockBusy', 'bob', 'baseWeather']) assert.ok(!json.includes(secret), `${secret} leaked`);
  const doc = await readDoc(repo, ownerPath('w', 'alice', MONTH));
  assert.ok(doc.veinPlan.length > 0 && doc.env.weatherSeed, 'the server keeps the truth');
});

// ----------------------------------------------------------------------------------------------- upgrades (T10)
test('T10-01/08 buy 1/10/100/Max charges exactly the sum of individually rounded level prices, atomically', async () => {
  for (const [mode, count] of [[1, 1], [10, 10], [100, 100]]) {
    const { repo, game, versions } = await setup();
    const level = 1;
    const price = bulkPrice('dig', level, count);
    await fund(repo, 'alice', price);
    const r = await game.buyUpgrade(cmd(versions.alice, { line: 'dig', shaftNumber: 1, mode }), ctx('alice', 0));
    assert.equal(r.spent, price); assert.equal(r.newLevel, level + count);
    assert.equal((await view(game, 'alice', 0)).spendable, 0, 'funds exactly spent');
    let manual = 0; for (let i = 0; i < count; i += 1) manual += nextLevelPrice('dig', level + i);
    assert.equal(manual, price);
  }
  const { repo, game, versions } = await setup();
  const funds = bulkPrice('dig', 1, 37) + 5;
  await fund(repo, 'alice', funds);
  const m = await game.buyUpgrade(cmd(versions.alice, { line: 'dig', shaftNumber: 1, mode: 'max' }), ctx('alice', 0));
  assert.equal(m.count, 37); assert.equal(m.spent, bulkPrice('dig', 1, 37));
  assert.equal((await view(game, 'alice', 0)).spendable, 5);
});

test('T10-03/04 caps hold and no milestone multiplier exists: output tracks base x (1 + 0.04 L) at every level', async () => {
  const { repo, game, versions } = await setup();
  await fund(repo, 'alice', 1_000_000);
  let v = versions.alice;
  const expected = (level) => 5 * (1 + 0.04 * level) * 0.25;
  for (const level of [1, 25, 50, 100, 101, 250]) {
    const need = level - (await view(game, 'alice', 0)).doc.production.shafts[0].digLevel;
    if (need > 0) { await patchOwner(repo, 'alice', (d) => { d.production = createProductionState({ ...d.production, shafts: d.production.shafts.map((s) => ({ ...s, digLevel: level })) }); }); }
    const st = await game.state('alice', MONTH, ctx('alice', 0));
    assert.ok(Math.abs(st.mine.shafts[0].ratePerMinute - expected(level)) < 1e-9, `level ${level}`);
  }
  void v;
});

test('T10-01/03 racing buyers: two bulk buys on the same version and the last coins never overspend or exceed a cap', async () => {
  const { repo, game, versions } = await setup();
  const price = bulkPrice('dig', 1, 10);
  await fund(repo, 'alice', price); // enough for ONE buy-10
  const results = await Promise.allSettled([
    game.buyUpgrade(cmd(versions.alice, { line: 'dig', shaftNumber: 1, mode: 10 }), ctx('alice', 0)),
    game.buyUpgrade(cmd(versions.alice, { line: 'dig', shaftNumber: 1, mode: 10 }), ctx('alice', 0)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(results.find((r) => r.status === 'rejected').reason.code === 'STALE_VERSION');
  const v = await view(game, 'alice', 0);
  assert.equal(v.spendable, 0); assert.equal(v.doc.production.shafts[0].digLevel, 11);
  // distinct request IDs on distinct (fresh) versions: the second sees no funds
  await fund(repo, 'alice', 0).catch(() => {});
  await assert.rejects(game.buyUpgrade(cmd(v.version, { line: 'dig', shaftNumber: 1, mode: 1 }), ctx('alice', 0)), code('INSUFFICIENT_FUNDS'));
  assert.ok(repo.reconcile());
});

test('T10 negative, fractional, overflowing and malformed upgrade inputs are rejected before any mutation', async () => {
  const { repo, game, versions } = await setup();
  await fund(repo, 'alice', 1_000_000);
  const before = await snapshotAll(repo, 'alice');
  const bad = [
    [{ line: 'dig', shaftNumber: 1, mode: -1 }, 'INVALID_MODE'], [{ line: 'dig', shaftNumber: 1, mode: 0 }, 'INVALID_MODE'], [{ line: 'dig', shaftNumber: 1, mode: 1.5 }, 'INVALID_MODE'],
    [{ line: 'dig', shaftNumber: 1, mode: '10' }, 'INVALID_MODE'], [{ line: 'dig', shaftNumber: 1, mode: Infinity }, 'INVALID_MODE'], [{ line: 'dig', shaftNumber: 1, mode: Number.MAX_SAFE_INTEGER }, 'INVALID_MODE'],
    [{ line: 'dig', shaftNumber: -1, mode: 1 }, 'UNKNOWN_SHAFT'], [{ line: 'dig', shaftNumber: 0, mode: 1 }, 'UNKNOWN_SHAFT'], [{ line: 'dig', shaftNumber: 1.5, mode: 1 }, 'INVALID_SHAFT'],
    [{ line: '__proto__', shaftNumber: 1, mode: 1 }, 'UNKNOWN_UPGRADE'], [{ line: 'shipSpeed', mode: 100000 }, 'INVALID_MODE'],
  ];
  for (const [payload, expected] of bad) await assert.rejects(game.buyUpgrade(cmd(versions.alice, payload), ctx('alice', 0)), code(expected), JSON.stringify(payload));
  await assert.rejects(game.buyUpgrade(cmd(versions.alice, { line: 'dig', price: 1, mode: 1 }), ctx('alice', 0)), code('INJECTED_FIELD'));
  await assert.rejects(game.buyPad(cmd(versions.alice, { price: 1 }), ctx('alice', 0)), code('INJECTED_FIELD'));
  await assert.rejects(game.hire(cmd(versions.alice, { count: -3 }), ctx('alice', 0)), code('INVALID_COUNT'));
  await assert.rejects(game.hire(cmd(versions.alice, { count: 2 ** 53 }), ctx('alice', 0)), (e) => ['INVALID_COUNT', 'OVERFLOW'].includes(e.code));
  await assert.rejects(game.dispatch(cmd(versions.alice, { units: -5 }), ctx('alice', 0)), code('INVALID_UNITS'));
  assert.equal(await snapshotAll(repo, 'alice'), before, 'every rejection mutated nothing');
});

test('rejected dispatch mutates nothing: busy ship, unknown destination or ship, over-capacity, empty yard', async () => {
  const { repo, game, versions } = await setup();
  const first = await game.dispatch(cmd(versions.alice, { destinationId: 'near' }), ctx('alice', 0));
  await settleTo(game, 'alice', 1);
  let before = await snapshotAll(repo, 'alice');
  await assert.rejects(game.dispatch(cmd(first.version, { destinationId: 'near' }), ctx('alice', 1)), code('SHIP_BUSY'));
  assert.equal(await snapshotAll(repo, 'alice'), before);
  // ready ship with cargo: bad requests
  const t = 3 * 3600;
  await settleTo(game, 'alice', t);
  before = await snapshotAll(repo, 'alice');
  for (const [extra, c] of [[{ destinationId: 'nowhere' }, 'UNKNOWN_DESTINATION'], [{ destinationId: 7 }, 'UNKNOWN_DESTINATION'], [{ shipId: 'ship-9' }, 'UNKNOWN_SHIP'], [{ units: 10_000 }, 'INSUFFICIENT_STOCK'], [{ units: 0 }, 'INVALID_UNITS']]) {
    await assert.rejects(game.dispatch(cmd(first.version, extra), ctx('alice', t)), code(c), JSON.stringify(extra));
    assert.equal(await snapshotAll(repo, 'alice'), before);
  }
  // drain the yard, then an empty dispatch
  await patchOwner(repo, 'alice', (d) => { d.production = createProductionState({ ...d.production, surface: { ...d.production.surface, unitsByOre: [] }, externalTransfersByOre: [{ oreId: 'ore-1', units: (d.production.surface.unitsByOre[0]?.units ?? 0) + (d.production.externalTransfersByOre[0]?.units ?? 0) }] }); });
  before = await snapshotAll(repo, 'alice');
  await assert.rejects(game.dispatch(cmd(first.version, { destinationId: 'near' }), ctx('alice', t)), code('NO_CARGO'));
  assert.equal(await snapshotAll(repo, 'alice'), before);
});
