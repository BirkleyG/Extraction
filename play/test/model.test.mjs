import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceGame, createGameState, dispatchNow, selectDestination, setAutoLaunch, stepGame, bulkQuote, flowSummary,
  validateGameState, purchaseUpgrade, buyNextShaft, upgradeCost, grantDevCoins, DESTINATIONS,
  makeSite, generateVeins, veinStatus, faceDistance, toolHardness, COMMON_ORES, RARE_ORES,
} from '../model.js';
import * as E from '../economy.js';
import { simulate, flows, DAY } from '../sim/pacing.mjs';

const code = (name) => (error) => error?.code === name;
const run = (state, seconds) => advanceGame(state, seconds, seconds).state;

test('the first sale needs no waiting: a full starter hold leaves at once, paid at takeoff, and arrival never pays again', () => {
  const before = createGameState();
  assert.equal(before.coins, 0);
  assert.equal(before.ship.capacityUnits, E.START_YARD_UNITS, 'the starter crate of ore fills the starter hold');
  const after = stepGame(before);
  const shipment = after.shipments[0];
  assert.equal(shipment.units, 10);
  assert.equal(shipment.payment, 100);
  assert.equal(after.coins, 100);
  assert.equal(after.shipmentStatusById[shipment.id], 'IN_TRANSIT');
  assert(after.ship.readyAtSecond > after.simSeconds, 'the hauler is away');
  assert.throws(() => dispatchNow(after), code('SHIP_BUSY'));
  assert.equal(before.coins, 0, 'input state is never mutated');
  const ledgerCount = after.ledger.length;
  const arrived = run(after, shipment.arrivalAtSecond - after.simSeconds);
  assert.equal(arrived.shipmentStatusById[shipment.id], 'DELIVERED');
  assert.equal(arrived.ledger.length, ledgerCount, 'arrival creates no second payment');
  assert(shipment.tripSeconds <= 15, 'the starter round trip is seconds, not minutes');
});

test('auto mode takes off only when the hold is full, with exactly a full load', () => {
  let state = createGameState();
  state.production.surface.unitsByOre = [{ oreId: state.site.commonOreId, units: 0 }];
  state.production.initialUnitsByOre = [{ oreId: state.site.commonOreId, units: 0 }];
  state = validateGameState(state);
  state = run(state, 8);
  assert.equal(state.shipments.length, 0, 'not full yet, so it keeps loading');
  assert(state.ship.cargoUnits > 5 && state.ship.cargoUnits < 10);
  state = run(state, 6);
  assert.equal(state.shipments.length, 1);
  assert.equal(state.shipments[0].units, 10);
  assert.equal(state.shipments[0].state, 'PAID_AT_DEPARTURE');
  assert.equal(state.ship.cargoUnits < 10, true);
});

test('with auto off the hauler never leaves by itself; Launch now sends a partial load', () => {
  let state = setAutoLaunch(createGameState(), false);
  state = run(state, 120);
  assert.equal(state.shipments.length, 0);
  const sent = dispatchNow(state);
  assert.equal(sent.shipments.length, 1);
  assert(sent.shipments[0].units > 0 && sent.shipments[0].units <= sent.ship.capacityUnits);
  assert.equal(sent.coins, sent.shipments[0].payment);
});

test('Launch now with nothing to send fails without changing the state', () => {
  const state = setAutoLaunch(createGameState(), false);
  state.production.surface.unitsByOre = [{ oreId: state.site.commonOreId, units: 0 }];
  state.production.initialUnitsByOre = [{ oreId: state.site.commonOreId, units: 0 }];
  const empty = validateGameState(state);
  const snapshot = JSON.stringify(empty);
  assert.throws(() => dispatchNow(empty), code('NOT_ENOUGH_STOCK'));
  assert.equal(JSON.stringify(empty), snapshot);
});

test('computer-run buyers never run out and the three buyers pay their listed price per unit', () => {
  for (const destination of DESTINATIONS) {
    let state = selectDestination(setAutoLaunch(createGameState(), false), destination.id);
    state = dispatchNow(state);
    assert.equal(state.shipments[0].unitPrice, destination.basePrice);
    assert.equal(state.coins, state.shipments[0].payment);
    assert.equal(state.shipments[0].tripSeconds, E.tripSeconds(destination, state.ship.speedPerMinute));
  }
});

test('farther buyers pay more per unit; which is best depends on hauler and supply, and the screen shows each estimate', () => {
  const fresh = flowSummary(createGameState());
  assert.equal(fresh.buyers.length, 3);
  assert(fresh.buyers.every((b) => b.coinPerMinute > 0));
  assert.equal(fresh.bestId, 'frontier-refinery', 'with the starter hauler, short trips win');
  const rich = createGameState();
  rich.upgrades = { pick: 10, lift: 25, hauler: 25 };
  rich.production.lift.level = 25; rich.ship.capacityUnits = E.haulerCapacity(25); rich.ship.speedPerMinute = E.haulerSpeed(25);
  rich.production.surface.capacityUnits = E.yardCapacity(25, 25);
  for (const shaft of rich.production.shafts) { shaft.bufferCapacityUnits = E.shaftBuffer(25); shaft.baseRatePerWorkerPerMinute = E.pickRatePerMiner(10); }
  assert.equal(flowSummary(validateGameState(rich)).bestId, 'outer-station', 'once supply is the limit, the far buyer pays most');
});

test('purchases are exact, atomic and bulk-priced: unaffordable fails with no change; max buys what coin allows', () => {
  const poor = createGameState();
  assert.throws(() => purchaseUpgrade(poor, 'pick'), code('INSUFFICIENT_FUNDS'));
  assert.throws(() => purchaseUpgrade(poor, 'nope'), code('UNKNOWN_UPGRADE'));
  assert.throws(() => buyNextShaft(poor), code('INSUFFICIENT_FUNDS'));
  const rich = grantDevCoins(poor, 1000);
  const one = purchaseUpgrade(rich, 'pick');
  assert.equal(one.upgrades.pick, 1);
  assert.equal(one.coins, 1000 - E.lineCost('pick', 0));
  assert.equal(one.ledger.at(-1).type, 'SYSTEM_PURCHASE');
  assert.equal(rich.upgrades.pick, 0, 'input state is never mutated');
  const quote = bulkQuote(rich, 'lift', 'max');
  const max = purchaseUpgrade(rich, 'lift', { count: 'max' });
  assert.equal(max.upgrades.lift, quote.levels);
  assert.equal(rich.coins - max.coins, quote.cost);
  assert(max.coins < E.lineCost('lift', max.upgrades.lift), 'max leaves too little for one more level');
  let sum = 0; for (let level = 0; level < quote.levels; level += 1) sum += E.lineCost('lift', level);
  assert.equal(sum, quote.cost, 'bulk price is the sum of individually rounded level prices');
  assert.equal(upgradeCost(rich, 'hauler'), E.lineCost('hauler', 0));
});

test('each purchase moves exactly the stage it names, and the three numbers stay connected', () => {
  let state = grantDevCoins(createGameState(), 100000);
  const rate = (s) => s.production.shafts[0].baseRatePerWorkerPerMinute;
  const base = { dig: rate(state), lift: state.production.lift.level, hold: state.ship.capacityUnits, speed: state.ship.speedPerMinute };
  state = purchaseUpgrade(state, 'pick');
  assert(rate(state) > base.dig * 1.3);
  assert.equal(state.production.lift.level, base.lift);
  assert.equal(state.ship.capacityUnits, base.hold);
  state = purchaseUpgrade(state, 'hauler');
  assert(state.ship.capacityUnits > base.hold && state.ship.speedPerMinute > base.speed);
  state = purchaseUpgrade(state, 'lift');
  assert.equal(state.production.lift.level, 1);
  assert(state.production.surface.capacityUnits >= 2 * state.ship.capacityUnits, 'the yard always holds at least two loads');
  assert(state.production.shafts[0].bufferCapacityUnits >= E.shaftBuffer(1) - 1e-9);
});

test('a new shaft arrives with a full crew, follows the pick and digs more than the one above it', () => {
  let state = grantDevCoins(createGameState(), 10000);
  state = purchaseUpgrade(state, 'pick', { count: 3 });
  state = buyNextShaft(state);
  assert.equal(state.production.shafts.length, 2);
  assert.equal(state.coins, 10000 - bulkQuote(grantDevCoins(createGameState(), 10000), 'pick', 3).cost - E.shaftCost(2));
  assert.equal(state.production.shafts[1].workersAssigned, E.MINERS_PER_SHAFT);
  assert.equal(state.production.shafts[1].baseRatePerWorkerPerMinute, E.pickRatePerMiner(3));
  const [a, b] = flowSummary(state).digPerMinute > 0 ? [state.production.shafts[0], state.production.shafts[1]] : [];
  assert(b.depthGrowth ** 1 > 1 && a.shaftNumber === 1);
});

test('shaft 31 cannot be bought', () => {
  let state = createGameState();
  state.production.shafts = Array.from({ length: 30 }, (_, i) => ({ ...state.production.shafts[0], shaftNumber: i + 1 }));
  state.coins = Number.MAX_SAFE_INTEGER;
  state = validateGameState(state);
  assert.throws(() => buyNextShaft(state), code('AT_CAP'));
});

test('bounded catch-up and repeated one-second ticks produce the same sandbox state', () => {
  let repeated = createGameState();
  const start = repeated;
  const chunk = advanceGame(start, 600, 600);
  for (let index = 0; index < 600; index += 1) repeated = stepGame(repeated);
  assert.deepEqual(chunk.state, repeated);
  assert.equal(chunk.remainingSeconds, 0);
  const bounded = advanceGame(start, 10_000, 100);
  assert.equal(bounded.remainingSeconds, 9_900);
});

test('fast trips keep the save small: old trips and ledger lines are dropped, totals keep the whole story', () => {
  let state = createGameState();
  state = run(state, 1800);
  assert(state.trips > 100, `expected many quick trips, got ${state.trips}`);
  assert(state.shipments.length <= 24 && state.ledger.length <= 60);
  assert.equal(Object.keys(state.shipmentStatusById).length, state.shipments.length);
  assert(JSON.stringify(state).length < 120_000, 'the save stays well under the browser storage limit');
  assert.equal(state.totalExternalEarnings, state.coins, 'nothing was spent, so every coin earned is still in the wallet');
});

test('the vault tops out at the largest safe integer instead of losing a sale or throwing', () => {
  let state = setAutoLaunch(createGameState(), false);
  state.coins = Number.MAX_SAFE_INTEGER - 5; state.totalExternalEarnings = Number.MAX_SAFE_INTEGER - 5;
  state = dispatchNow(validateGameState(state));
  assert.equal(state.coins, Number.MAX_SAFE_INTEGER);
  assert.equal(state.shipments[0].payment, 5);
});

test('invalid or unsupported browser saves fail validation instead of entering simulation', () => {
  const state = createGameState();
  assert.throws(() => validateGameState({ ...state, schemaVersion: 1 }), code('INVALID_SAVE'));
  assert.throws(() => validateGameState({ ...state, coins: NaN }), code('INVALID_STATE'));
  assert.throws(() => validateGameState({ ...state, upgrades: { pick: 0, lift: 0 } }), code('INVALID_SAVE'));
  assert.throws(() => validateGameState({ ...state, production: { ...state.production, syntheticDownstreamDrain: { unitsPerSecond: 1, drainedByOre: [] } } }), code('INVALID_SAVE'));
});

test('start is zero coin with no grant, and the lift readout is the shared production math', () => {
  const state = createGameState();
  assert.equal(state.coins, 0);
  assert.equal(state.sourceGrants, 0);
  assert.equal(state.ledger.length, 0);
  assert.equal(flowSummary(state).liftPerMinute, E.liftRate(0));
  assert.equal(flowSummary(state).digPerMinute, E.MINERS_PER_SHAFT * E.pickRatePerMiner(0));
});

test('the engine and the pacing study agree: simulated income over 10 minutes matches the fluid estimate', () => {
  for (const levels of [{ pick: 4, lift: 3, hauler: 3, shafts: 2 }, { pick: 9, lift: 9, hauler: 9, shafts: 3 }]) {
    let state = createGameState();
    state.coins = Math.floor(Number.MAX_SAFE_INTEGER / 4);
    state = validateGameState(state);
    for (const id of ['pick', 'lift', 'hauler']) state = purchaseUpgrade(state, id, { count: levels[id] });
    for (let n = 1; n < levels.shafts; n += 1) state = buyNextShaft(state);
    const start = state; const best = flowSummary(state).buyers.reduce((a, b) => (b.coinPerMinute > a.coinPerMinute ? b : a));
    state = selectDestination(state, best.destination.id);
    state = run(state, 120); // warm up the yard and the first trips
    const t0 = state.totalExternalEarnings;
    state = run(state, 600);
    const engine = (state.totalExternalEarnings - t0) / 600;
    const fluid = flows(levels).coinPerSec;
    assert(engine > 0.6 * fluid && engine < 1.4 * fluid, `engine ${engine.toFixed(1)}/s vs fluid ${fluid.toFixed(1)}/s at ${JSON.stringify(levels)}`);
    assert.equal(start.upgrades.pick, levels.pick);
  }
});

test('pacing: the first minute is fast, and a month changes the scale by orders of magnitude, inside the exact-coin ceiling', () => {
  const active = simulate({ visitEvery: 0 });
  const at = (rows, label) => rows.find((row) => row.label === label);
  assert(at(active, '10 sec').purchases >= 3, 'something to buy within seconds');
  assert(at(active, '1 min').purchases >= 8, 'a purchase every few seconds in the opening');
  assert(at(active, '1 min').income >= 3 * at(active, '10 sec').income / 1.5);
  assert(at(active, '1 hour').shafts >= 5 && at(active, '1 hour').shafts <= 12);
  assert(at(active, '1 day').income > 1e5, 'day one is a different game');
  assert(at(active, '30 days').income > 1e8);
  assert(at(active, '30 days').income / at(active, '1 min').income > 1e6, 'the month spans six orders of magnitude of income');
  assert(at(active, '30 days').earned < Number.MAX_SAFE_INTEGER, 'an active month stays inside the exact-coin ceiling');
  const daily = simulate({ visitEvery: DAY });
  assert(at(daily, '30 days').earned > 0.3 * at(active, '30 days').earned, 'a once-a-day player is not left behind');
  const fresh = simulate({ visitEvery: 0 }).filter((row) => row.shafts <= 30 && row.pick <= E.LEVEL_CAP);
  assert.equal(fresh.length, active.length, 'no line or shaft cap is reached inside a month');
});

function veinState({ pick, size = 5, at = 0 }) {
  const state = createGameState();
  state.autoLaunch = false;
  state.upgrades.pick = pick;
  state.veins = [{ id: 'v-test', shaftNumber: 1, oreId: 'lithium', at, sizeUnits: size, remainingUnits: size, seen: false, warned: false }];
  state.shaftMined = { 1: 1000 };
  return validateGameState(state);
}
const minedOf = (state, oreId) => state.production.cumulativeMinedByOre.find((row) => row.oreId === oreId)?.units ?? 0;

test('T04-03: a rare vein is mined until empty and never past its size', () => {
  let state = veinState({ pick: 20, size: 5 });
  assert.equal(veinStatus(state, state.veins[0]), 'mining');
  for (let second = 0; second < 600; second += 1) state = stepGame(state);
  assert.ok(Math.abs(minedOf(state, 'lithium') - 5) < 1e-6, `mined ${minedOf(state, 'lithium')} lithium from a 5 unit vein`);
  assert.equal(state.veins[0].remainingUnits, 0);
});

test('T04-02: an empty vein hands the shaft back to the common ore and never goes negative', () => {
  let state = veinState({ pick: 20, size: 2 });
  for (let second = 0; second < 900; second += 1) {
    state = stepGame(state);
    assert.ok(state.veins[0].remainingUnits >= 0);
    assert.ok(state.production.shafts.every((shaft) => shaft.bufferUnits >= 0));
  }
  assert.equal(state.production.shafts[0].oreId, state.site.commonOreId);
  assert.ok(minedOf(state, state.site.commonOreId) > 1, 'the shaft continues on the common ore');
});

test('a pick that is too weak leaves the vein alone and the shaft keeps digging common ore', () => {
  let state = veinState({ pick: 1, size: 5 });
  assert.equal(veinStatus(state, state.veins[0]), 'blocked');
  for (let second = 0; second < 300; second += 1) state = stepGame(state);
  assert.equal(minedOf(state, 'lithium'), 0);
  assert.equal(state.veins[0].remainingUnits, 5);
  assert.ok(minedOf(state, state.site.commonOreId) > 0);
});

test('a vein stays ahead of the tunnel face until enough has been dug', () => {
  const state = veinState({ pick: 20, size: 5, at: 300 });
  state.shaftMined = { 1: 0 };
  assert.equal(veinStatus(state, state.veins[0]), 'ahead');
  assert.ok(faceDistance(0) === 0 && faceDistance(1e9) <= 360);
  assert.ok(toolHardness(0) < 5 && toolHardness(14) >= 5 && toolHardness(26) >= 6 && toolHardness(50) >= 9, 'better picks break harder rock');
});

test('rare veins scale with depth so a deep vein lasts hours, not milliseconds', () => {
  const site = makeSite({ planetId: 'p-test', regionId: 'r1', tough: false });
  const shallow = generateVeins(site, 3)[0]; const deep = generateVeins(site, 10).sort((a, b) => b.sizeUnits - a.sizeUnits)[0];
  assert(deep && shallow && deep.sizeUnits > 100 * shallow.sizeUnits);
});

test('each site has exactly one common ore and deterministic veins', () => {
  for (const regionId of ['r0', 'r1', 'r2', 'r3', 'r4', 'r5']) {
    const site = makeSite({ planetId: 'p-test', regionId, tough: regionId === 'r2' });
    assert.ok(COMMON_ORES.includes(site.commonOreId));
    assert.ok(site.rareOreIds.length >= 2 && site.rareOreIds.every((id) => RARE_ORES.includes(id)));
    for (let shaft = 1; shaft <= 30; shaft += 1) {
      const a = generateVeins(site, shaft); const b = generateVeins(site, shaft);
      assert.deepEqual(a, b);
      assert.ok(a.every((vein) => vein.sizeUnits > 0 && vein.remainingUnits === vein.sizeUnits));
    }
    assert.ok(generateVeins(site, 3).length >= 1, 'shaft 3 always holds a rare vein');
  }
});
