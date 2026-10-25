import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionState } from '../../backend/src/production.js';
import {
  advanceGame, createGameState, dispatchNow, selectDestination, setAutoLaunch, stepGame,
  validateGameState, purchaseUpgrade, buyNextShaft, currentLiftRate, grantDevCoins,
  makeSite, generateVeins, veinStatus, faceDistance, toolHardness, COMMON_ORES, RARE_ORES,
} from '../model.js';

const code = (name) => (error) => error?.code === name;

function loadedStockState({ units = 2, buyerFunds = 30000, buyerCapacity = 120 } = {}) {
  const state = createGameState();
  state.autoLaunch = false;
  state.buyers[0].funds = buyerFunds;
  state.buyers[0].capacityUnits = buyerCapacity;
  state.production = {
    ...state.production,
    surface: { capacityUnits: 100, unitsByOre: [{ oreId: 'ferrite', units }] },
    initialUnitsByOre: [{ oreId: 'ferrite', units }],
    cumulativeMinedByOre: [],
  };
  return validateGameState(state);
}

test('paid departure removes real stock, debits the finite buyer, reserves capacity and credits exactly once', () => {
  const before = loadedStockState({ units: 2, buyerFunds: 500, buyerCapacity: 1 });
  const loading = dispatchNow(before);
  assert.equal(loading.coins, before.coins);
  assert.equal(loading.buyers[0].funds, before.buyers[0].funds);
  assert.equal(loading.shipments.length, 0, 'loading alone is not a sale');
  const loaded = advanceGame(loading, 1, 1).state;
  assert(loaded.ship.cargoUnits >= 1);
  assert.equal(loaded.coins, before.coins);
  assert.equal(loaded.shipments.length, 0);
  const after = dispatchNow(loaded);
  const shipment = after.shipments[0];
  assert.equal(shipment.units, 1);
  assert.equal(shipment.payment, 40);
  assert.equal(after.coins, 40);
  assert.equal(after.buyers[0].funds, 460);
  assert.equal(after.buyers[0].reservedUnits, 1);
  assert.equal(after.ship.cargoUnits, loaded.ship.cargoUnits - shipment.units);
  assert.equal(after.shipmentStatusById[shipment.id], 'IN_TRANSIT');
  assert.equal(before.coins, 0);
  assert.equal(before.production.surface.unitsByOre[0].units, 2);
  assert(Object.isFrozen(shipment));

  const ledgerCount = after.ledger.length;
  const walletAfterDeparture = after.coins;
  const arrived = advanceGame(after, shipment.arrivalAtSecond - after.simSeconds, 300).state;
  assert.equal(arrived.shipmentStatusById[shipment.id], 'DELIVERED');
  assert.equal(arrived.coins, walletAfterDeparture);
  assert.equal(arrived.ledger.length, ledgerCount, 'arrival creates no second payment');
  assert.equal(arrived.buyers[0].reservedUnits, 0);
  assert.equal(arrived.buyers[0].inventoryUnits, 1);
});

test('automatic partial cargo launches at one unit and pays at departure', () => {
  const state = createGameState();
  const next = advanceGame(state, 60, 300).state;
  assert.equal(next.shipments.length, 1);
  assert(next.shipments[0].units >= 1);
  assert.equal(next.shipments[0].state, 'PAID_AT_DEPARTURE');
  assert(next.coins > state.coins);
  assert(next.shipments[0].departureAtSecond > 0 && next.shipments[0].departureAtSecond <= 60);
  assert.equal(next.ship.cargoUnits, 0, 'full buyer terms consume the complete loaded cargo without quantized dust');
});

test('a stranded sub-unit load clears as a paid partial sale when its ore has no future source', () => {
  const state = createGameState();
  const oldShipment = {
    id: 'shipment-old', oreId: 'ferrite', units: 1, unitPrice: 40, payment: 40,
    destinationId: 'frontier-refinery', departureAtSecond: 0, arrivalAtSecond: 121,
    shipReadyAtSecond: 241, tripSeconds: 241, state: 'PAID_AT_DEPARTURE',
  };
  state.coins += 40;
  state.totalExternalEarnings = 40;
  state.buyers[0].funds -= 40;
  state.buyers[0].inventoryUnits = 1;
  state.shipments.push(oldShipment);
  state.shipmentStatusById[oldShipment.id] = 'DELIVERED';
  state.ledger.push({ id: 'local-00000002', atSecond: 0, type: 'NPC_RAW_PURCHASE', amount: 40, ownerDelta: 40, externalDelta: -40, externalAccount: 'source:NPC:frontier-refinery', description: 'Prior paid fixture shipment' });
  state.nextRecordId = 3;
  state.workersHired = 0;
  state.selectedDestinationId = 'cinder-buyer';
  state.ship.cargoOreId = 'ferrite';
  state.ship.cargoUnits = 0.304;
  state.ship.loading = true;
  state.production = createProductionState({
    ...state.production,
    shafts: state.production.shafts.map((shaft) => ({ ...shaft, workersAssigned: 0, bufferUnits: 0 })),
    surface: { capacityUnits: 100, unitsByOre: [{ oreId: 'cobalt', units: 20 }] },
    initialUnitsByOre: [{ oreId: 'cobalt', units: 20 }, { oreId: 'ferrite', units: 0.304 }],
    cumulativeMinedByOre: [],
    externalTransfersByOre: [{ oreId: 'ferrite', units: 0.304 }],
  });
  const launched = advanceGame(validateGameState(state), 1, 1).state;
  assert.equal(launched.shipments.length, 2);
  assert.deepEqual(launched.shipments[0], oldShipment);
  assert.equal(launched.shipments[1].destinationId, 'cinder-buyer');
  assert.equal(launched.shipments[1].units, 0.304);
  assert.equal(launched.shipments[1].payment, 19);
  assert.equal(launched.coins, 59);
  assert.equal(launched.ship.cargoUnits, 0);
});

test('manual destination selection is pre-departure only and cannot overspend a buyer fixture', () => {
  let state = loadedStockState({ units: 10 });
  state = selectDestination(state, 'cinder-buyer');
  state.buyers[1].funds = 800;
  state.buyers[1].capacityUnits = 36;
  state = validateGameState(state);
  const beforeCoins = state.coins;
  const loading = dispatchNow(state);
  assert.equal(loading.coins, beforeCoins);
  state = advanceGame(loading, 1, 1).state;
  const dispatched = dispatchNow(state);
  const shipment = dispatched.shipments[0];
  assert.equal(shipment.destinationId, 'cinder-buyer');
  assert(shipment.payment <= 800);
  assert.equal(dispatched.buyers[1].funds, 800 - shipment.payment);
  assert.equal(dispatched.coins, beforeCoins + shipment.payment);
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
