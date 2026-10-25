import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionState } from '../../backend/src/production.js';
import {
  advanceGame, createGameState, dispatchNow, selectDestination, setAutoLaunch, stepGame,
  validateGameState, purchaseUpgrade, buyNextShaft, currentLiftRate, grantDevCoins,
  makeSite, generateVeins, veinStatus, faceDistance, toolHardness, COMMON_ORES, RARE_ORES,
} from '../model.js';

const code = (name) => (error) => error?.code === name;

function yardState({ units = 200, ore = 'ferrite', auto = true } = {}) {
  const state = createGameState();
  state.autoLaunch = auto;
  state.production = {
    ...state.production,
    surface: { capacityUnits: 1000, unitsByOre: [{ oreId: ore, units }] },
    initialUnitsByOre: [{ oreId: ore, units }],
    cumulativeMinedByOre: [],
  };
  return validateGameState(state);
}

test('Launch now sells the starter ore at once: paid at takeoff, ship away, arrival never pays again', () => {
  const before = createGameState();
  assert.equal(before.coins, 0);
  assert.equal(before.buyers, undefined, 'computer-run buyers have no budget to track');
  const after = dispatchNow(before);
  const shipment = after.shipments[0];
  assert.equal(shipment.units, 5);
  assert.equal(shipment.payment, 200);
  assert.equal(after.coins, 200);
  assert.equal(after.shipmentStatusById[shipment.id], 'IN_TRANSIT');
  assert(after.ship.readyAtSecond > after.simSeconds, 'the hauler is away');
  assert.throws(() => dispatchNow(after), code('SHIP_BUSY'));
  assert.equal(before.coins, 0, 'input state is never mutated');
  const ledgerCount = after.ledger.length;
  const arrived = advanceGame(after, shipment.arrivalAtSecond - after.simSeconds, 300).state;
  assert.equal(arrived.shipmentStatusById[shipment.id], 'DELIVERED');
  assert.equal(arrived.coins, after.coins);
  assert.equal(arrived.ledger.length, ledgerCount, 'arrival creates no second payment');
});

test('auto mode takes off only when the hold is full, with exactly a full load', () => {
  let state = yardState({ units: 400 });
  state = advanceGame(state, 100, 300).state;
  assert.equal(state.shipments.length, 0, 'not full yet, so it keeps loading');
  assert(state.ship.cargoUnits > 90 && state.ship.cargoUnits < 150);
  state = advanceGame(state, 80, 300).state;
  assert.equal(state.shipments.length, 1);
  assert.equal(state.shipments[0].units, 150);
  assert.equal(state.shipments[0].payment, 6000);
  assert.equal(state.shipments[0].state, 'PAID_AT_DEPARTURE');
  assert.equal(state.ship.cargoUnits, 0);
});

test('with auto off the hauler never leaves by itself; Launch now sends a partial load', () => {
  let state = yardState({ units: 400, auto: false });
  state = advanceGame(state, 300, 300).state;
  assert.equal(state.shipments.length, 0);
  assert.equal(state.ship.cargoUnits, 150, 'it loaded the full hold and waits');
  const sent = dispatchNow(state);
  assert.equal(sent.shipments.length, 1);
  assert.equal(sent.shipments[0].units, 150);
  const small = dispatchNow(yardState({ units: 12, auto: false }));
  assert.equal(small.shipments[0].units, 12);
  assert.equal(small.shipments[0].payment, 480);
  assert(small.ship.readyAtSecond > small.simSeconds + small.shipments[0].tripSeconds - 1, 'the rush-loading time is added to the next trip');
});

test('Launch now with nothing to send fails without changing the state', () => {
  const empty = yardState({ units: 0 });
  assert.throws(() => dispatchNow(empty), code('NOT_ENOUGH_STOCK'));
});

test('a stranded partial load (ore can no longer arrive) is sent by auto mode instead of waiting forever', () => {
  const state = yardState({ units: 0 });
  state.ship.cargoOreId = 'ferrite';
  state.ship.cargoUnits = 30;
  state.workersHired = 0;
  state.production = createProductionState({
    ...state.production,
    shafts: state.production.shafts.map((shaft) => ({ ...shaft, workersAssigned: 0, bufferUnits: 0 })),
    surface: { capacityUnits: 1000, unitsByOre: [] },
    initialUnitsByOre: [{ oreId: 'ferrite', units: 30 }],
    cumulativeMinedByOre: [],
    externalTransfersByOre: [{ oreId: 'ferrite', units: 30 }],
  });
  const launched = advanceGame(validateGameState(state), 1, 1).state;
  assert.equal(launched.shipments.length, 1);
  assert.equal(launched.shipments[0].units, 30);
});

test('computer-run buyers never run out: selling is limited only by ore and the ship; pick a buyer before launch', () => {
  let state = yardState({ units: 800, auto: false });
  state = selectDestination(state, 'cinder-bay-buyer');
  let total = 0;
  for (let trip = 0; trip < 5; trip += 1) {
    state = advanceGame(state, state.ship.readyAtSecond > state.simSeconds ? state.ship.readyAtSecond - state.simSeconds : 1, 5000).state;
    state = dispatchNow(state);
    total += state.shipments.at(-1).payment;
  }
  assert.equal(state.shipments.length, 5);
  assert(state.shipments.every((x) => x.destinationId === 'cinder-bay-buyer' && x.unitPrice === 64));
  assert.equal(state.coins, total);
  assert(total >= 5 * 150 * 64 - 64 * 5);
});

test('unaffordable system purchase fails atomically; valid purchases burn coin', () => {
  const before = grantDevCoins(createGameState(), 400);
  const oneShaft = buyNextShaft(before);
  assert.equal(oneShaft.production.shafts.length, 2);
  assert.throws(() => buyNextShaft(oneShaft), code('INSUFFICIENT_FUNDS'));
  assert.equal(oneShaft.production.shafts.length, 2);
  const upgraded = purchaseUpgrade(before, 'dig', { shaftNumber: 1, count: 1 });
  assert.equal(upgraded.production.shafts[0].digLevel, 2);
  assert(upgraded.coins < before.coins);
  assert.equal(upgraded.ledger.at(-1).type, 'SYSTEM_PURCHASE');
  assert.equal(before.production.shafts[0].digLevel, 1);
});

test('bounded catch-up and repeated one-second ticks produce the same sandbox state', () => {
  let repeated = setAutoLaunch(createGameState(), false);
  const start = repeated;
  const chunk = advanceGame(start, 600, 600);
  for (let index = 0; index < 600; index += 1) repeated = stepGame(repeated);
  assert.deepEqual(chunk.state, repeated);
  assert.equal(chunk.remainingSeconds, 0);
  assert.equal(chunk.processedSeconds, 600);
  const bounded = advanceGame(start, 10_000, 100);
  assert.equal(bounded.remainingSeconds, 9_900);
});

test('one-hour fixture fast-forward uses the same one-second simulation without a catch-up cap', () => {
  const start = setAutoLaunch(createGameState(), false);
  const result = advanceGame(start, 3600, 3600);
  assert.equal(result.remainingSeconds, 0);
  assert.equal(result.state.simSeconds, 3600);
  assert.equal(result.state.production.syntheticDownstreamDrain.unitsPerSecond, 0);
});

test('invalid or unsupported browser saves fail validation instead of entering simulation', () => {
  const state = createGameState();
  assert.throws(() => validateGameState({ ...state, schemaVersion: 99 }), code('INVALID_SAVE'));
  assert.throws(() => validateGameState({ ...state, coins: NaN }), code('INVALID_STATE'));
  assert.throws(() => validateGameState({ ...state, production: { ...state.production, syntheticDownstreamDrain: { unitsPerSecond: 1, drainedByOre: [] } } }), code('INVALID_SAVE'));
});

test('start is zero coin with no grant, and lift readout uses shared production math', () => {
  const state = createGameState();
  assert.equal(state.coins, 0);
  assert.equal(state.sourceGrants, 0);
  assert.equal(state.ledger.length, 0);
  assert.equal(currentLiftRate(state), 2 * 1.0316);
});

function veinState({ digLevel, size = 5, at = 0 }) {
  const state = createGameState();
  state.autoLaunch = false;
  state.production.shafts[0].digLevel = digLevel;
  state.veins = [{ id: 'v-test', shaftNumber: 1, oreId: 'lithium', at, sizeUnits: size, remainingUnits: size, seen: false, warned: false }];
  state.shaftMined = { 1: 1000 };
  return validateGameState(state);
}
const minedOf = (state, oreId) => state.production.cumulativeMinedByOre.find((row) => row.oreId === oreId)?.units ?? 0;

test('T04-03: a rare vein is mined until empty and never past its size', () => {
  let state = veinState({ digLevel: 40, size: 5 });
  assert.equal(veinStatus(state, state.veins[0]), 'mining');
  for (let second = 0; second < 600; second += 1) state = stepGame(state);
  assert.ok(Math.abs(minedOf(state, 'lithium') - 5) < 1e-6, `mined ${minedOf(state, 'lithium')} lithium from a 5 unit vein`);
  assert.equal(state.veins[0].remainingUnits, 0);
});

test('T04-02: an empty vein hands the shaft back to the common ore and never goes negative', () => {
  let state = veinState({ digLevel: 40, size: 2 });
  for (let second = 0; second < 900; second += 1) {
    state = stepGame(state);
    assert.ok(state.veins[0].remainingUnits >= 0);
    assert.ok(state.production.shafts.every((shaft) => shaft.bufferUnits >= 0));
  }
  assert.equal(state.production.shafts[0].oreId, state.site.commonOreId);
  assert.ok(minedOf(state, state.site.commonOreId) > 1, 'the shaft continues on the common ore');
});

test('a pick that is too weak leaves the vein alone and the shaft keeps digging common ore', () => {
  let state = veinState({ digLevel: 1, size: 5 });
  assert.equal(veinStatus(state, state.veins[0]), 'blocked');
  for (let second = 0; second < 300; second += 1) state = stepGame(state);
  assert.equal(minedOf(state, 'lithium'), 0);
  assert.equal(state.veins[0].remainingUnits, 5);
  assert.ok(minedOf(state, 'ferrite') > 0);
});

test('a vein stays ahead of the tunnel face until enough has been dug', () => {
  const state = veinState({ digLevel: 40, size: 5, at: 300 });
  state.shaftMined = { 1: 0 };
  assert.equal(veinStatus(state, state.veins[0]), 'ahead');
  assert.ok(faceDistance(0) === 0 && faceDistance(1e9) <= 360);
  assert.ok(toolHardness(1) < 5 && toolHardness(40) >= 6 && toolHardness(350) >= 9);
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
    assert.equal(createGameState({ planetId: 'p-test', regionId, tough: false }).production.shafts[0].oreId, site.commonOreId === undefined ? 'x' : makeSite({ planetId: 'p-test', regionId, tough: false }).commonOreId);
  }
});
