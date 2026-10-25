import test from 'node:test';
import assert from 'node:assert/strict';
import { createProductionState } from '../../backend/src/production.js';
import {
  advanceGame, createGameState, dispatchNow, dispatchShip, selectDestination, setAutoLaunch, stepGame,
  validateGameState, purchaseUpgrade, buyNextShaft, currentLiftRate, fleetShips,
  buyShip, buyPad, nextShipCost, nextPadCost, shipPurchaseCost, grantDevCoins,
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
  assert.equal(shipment.payment, 500);
  assert.equal(after.coins, 1000);
  assert.equal(after.buyers[0].funds, 0);
  assert.equal(after.buyers[0].reservedUnits, 1);
  assert.equal(after.ship.cargoUnits, loaded.ship.cargoUnits - shipment.units);
  assert.equal(after.shipmentStatusById[shipment.id], 'IN_TRANSIT');
  assert.equal(before.coins, 500);
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
    id: 'shipment-old', oreId: 'ferrite', units: 1, unitPrice: 500, payment: 500,
    destinationId: 'frontier-refinery', departureAtSecond: 0, arrivalAtSecond: 121,
    shipReadyAtSecond: 241, tripSeconds: 241, state: 'PAID_AT_DEPARTURE',
  };
  state.coins += 500;
  state.totalExternalEarnings = 500;
  state.buyers[0].funds -= 500;
  state.buyers[0].inventoryUnits = 1;
  state.shipments.push(oldShipment);
  state.shipmentStatusById[oldShipment.id] = 'DELIVERED';
  state.ledger.push({ id: 'local-00000002', atSecond: 0, type: 'NPC_RAW_PURCHASE', amount: 500, ownerDelta: 500, externalDelta: -500, externalAccount: 'source:NPC:frontier-refinery', description: 'Prior paid fixture shipment' });
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
  assert.deepEqual(launched.shipments[0], { ...oldShipment, shipIndex: 0 });
  assert.equal(launched.shipments[1].destinationId, 'cinder-buyer');
  assert.equal(launched.shipments[1].units, 0.304);
  assert.equal(launched.shipments[1].payment, 243);
  assert.equal(launched.coins, 1243);
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
  const before = createGameState();
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

test('starter wallet is exactly the recorded source grant and lift readout uses shared production math', () => {
  const state = createGameState();
  assert.equal(state.coins, 500);
  assert.equal(state.sourceGrants, 500);
  assert.equal(state.ledger.length, 1);
  assert.equal(state.ledger[0].amount, 500);
  assert.equal(currentLiftRate(state), 2 * 1.0316);
});

test('older v1 saves migrate to one active pad and a single primary ship', () => {
  const legacy = createGameState();
  delete legacy.extraShips;
  delete legacy.padCount;
  delete legacy.ship.loading;
  delete legacy.ship.cargoOreId;
  delete legacy.ship.cargoUnits;
  const oldShipment = { id: 'legacy-shipment', oreId: 'ferrite', units: 1, unitPrice: 500, payment: 500, destinationId: 'frontier-refinery', departureAtSecond: 0, arrivalAtSecond: 60, shipReadyAtSecond: 120, tripSeconds: 120, state: 'PAID_AT_DEPARTURE' };
  legacy.shipments.push(oldShipment);
  legacy.shipmentStatusById[oldShipment.id] = 'DELIVERED';
  const migrated = validateGameState(legacy);
  assert.equal(migrated.padCount, 1);
  assert.deepEqual(migrated.extraShips, []);
  assert.equal(fleetShips(migrated).length, 1);
  assert.equal(migrated.ship.loading, false);
  assert.equal(migrated.ship.cargoUnits, 0);
  assert.equal(migrated.ship.cargoOreId, null);
  assert.equal(migrated.shipments[0].shipIndex, 0);
});

test('ships without pads stay parked; buying the next pad activates fleet trade', () => {
  let state = grantDevCoins(createGameState(), 25_000);
  assert.equal(nextShipCost(state), 1800);
  state = buyShip(state);
  assert.equal(fleetShips(state).length, 2);
  assert.equal(state.padCount, 1);
  assert.equal(state.extraShips[0].loading, false);
  assert.throws(() => dispatchShip(state, 1), code('SHIP_PARKED'));
  const parked = advanceGame(state, 120, 120).state;
  assert.equal(parked.extraShips[0].loading, false);
  assert.equal(parked.extraShips[0].cargoUnits, 0);
  assert(parked.shipments.every((shipment) => shipment.shipIndex === 0));
  assert.equal(nextPadCost(parked), 4000);
  const activated = buyPad(parked);
  assert.equal(activated.padCount, 2);
  assert.equal(nextPadCost(activated), 24_000);
  const running = advanceGame(activated, 1200, 1200).state;
  assert(running.shipments.some((shipment) => shipment.shipIndex === 1), 'the newly activated hauler eventually departs');
});

test('manual dispatch for an extra hauler loads unpaid first and tags its shipment index', () => {
  let state = grantDevCoins(createGameState(), 10_000);
  state = buyShip(state);
  state = buyPad(state);
  state.autoLaunch = false;
  state.production = createProductionState({
    ...state.production,
    surface: { capacityUnits: 100, unitsByOre: [{ oreId: 'ferrite', units: 2 }] },
    initialUnitsByOre: [{ oreId: 'ferrite', units: 2 }],
    cumulativeMinedByOre: [],
  });
  state = validateGameState(state);
  const wallet = state.coins;
  const loading = dispatchShip(state, 1);
  assert.equal(loading.coins, wallet);
  const loaded = advanceGame(loading, 1, 1).state;
  assert.equal(loaded.coins, wallet);
  assert.equal(loaded.shipments.length, 0);
  assert(loaded.extraShips[0].cargoUnits > 0);
  const launched = dispatchShip(loaded, 1);
  assert.equal(launched.shipments.length, 1);
  assert.equal(launched.shipments[0].shipIndex, 1);
  assert.equal(launched.shipments[0].payment, 500);
  assert.equal(launched.coins, wallet + 500);
  assert.equal(launched.ship.readyAtSecond, 0, 'the primary ship remains independent');
});

test('two active ships share buyer funds and capacity without overspending or over-reserving', () => {
  let state = grantDevCoins(createGameState(), 10_000);
  state = buyShip(state);
  state = buyPad(state);
  state.autoLaunch = true;
  state.buyers[0].funds = 500;
  state.buyers[0].capacityUnits = 1;
  state.production = createProductionState({
    ...state.production,
    surface: { capacityUnits: 100, unitsByOre: [{ oreId: 'ferrite', units: 2 }] },
    initialUnitsByOre: [{ oreId: 'ferrite', units: 2 }],
    cumulativeMinedByOre: [],
  });
  state = validateGameState(state);
  const afterOneSecond = stepGame(state);
  assert.equal(afterOneSecond.shipments.length, 1);
  const shipment = afterOneSecond.shipments[0];
  assert.equal(shipment.shipIndex, 0, 'stable fleet order gets the finite buyer capacity first');
  assert.equal(shipment.payment, 500);
  assert.equal(afterOneSecond.buyers[0].funds, 0);
  assert.equal(afterOneSecond.buyers[0].reservedUnits, 1);
  assert(afterOneSecond.buyers[0].inventoryUnits + afterOneSecond.buyers[0].reservedUnits <= afterOneSecond.buyers[0].capacityUnits);
  const wallet = afterOneSecond.coins;
  const delivered = advanceGame(afterOneSecond, shipment.arrivalAtSecond - afterOneSecond.simSeconds, 300).state;
  assert.equal(delivered.shipmentStatusById[shipment.id], 'DELIVERED');
  assert.equal(delivered.coins, wallet, 'arrival adds no second payment');
  assert.equal(delivered.buyers[0].inventoryUnits, 1);
  assert.equal(delivered.buyers[0].reservedUnits, 0);
});

test('fleet-wide ship upgrades apply to primary and purchased haulers', () => {
  let state = grantDevCoins(createGameState(), 100_000);
  state = buyShip(state);
  state = purchaseUpgrade(state, 'shipCapacity');
  state = purchaseUpgrade(state, 'shipSpeed');
  state = purchaseUpgrade(state, 'loading');
  assert(fleetShips(state).every((ship) => ship.capacityUnits === 156));
  assert(fleetShips(state).every((ship) => ship.speedPerMinute === 0.52));
  assert(fleetShips(state).every((ship) => Math.abs(ship.loadingUnitsPerMinute - 62.4) < 1e-12));
});

test('fleet and pad fixture counts stop at twelve', () => {
  let state = grantDevCoins(createGameState(), 1_000_000_000_000);
  while (fleetShips(state).length < 12) state = buyShip(state);
  assert.equal(nextShipCost(state), null);
  assert.throws(() => buyShip(state), code('AT_CAP'));
  while (state.padCount < 12) state = buyPad(state);
  assert.equal(nextPadCost(state), null);
  assert.throws(() => buyPad(state), code('AT_CAP'));
});

test('Hauler, Cruiser and Freighter classes preserve class stats through fleet upgrades and cost rounding', () => {
  let state = grantDevCoins(createGameState(), 100_000);
  assert.equal(shipPurchaseCost(state), 1800);
  assert.equal(shipPurchaseCost(state, 'cruiser'), 1800);
  assert.equal(shipPurchaseCost(state, 'freighter'), 3240);
  assert.equal(nextShipCost(state), shipPurchaseCost(state, 'hauler'));
  state = buyShip(state, 'cruiser');
  state = buyShip(state, 'freighter');
  let ships = fleetShips(state);
  assert.deepEqual(ships.map((ship) => ship.shipClass), ['hauler', 'cruiser', 'freighter']);
  assert.deepEqual(ships.map((ship) => ship.capacityUnits), [150, 52.5, 450]);
  assert.deepEqual(ships.map((ship) => ship.speedPerMinute), [0.5, 1.5, 0.3]);
  assert.deepEqual(ships.map((ship) => ship.loadingUnitsPerMinute), [60, 21, 180]);
  state = purchaseUpgrade(state, 'shipCapacity');
  state = purchaseUpgrade(state, 'shipSpeed');
  state = purchaseUpgrade(state, 'loading');
  ships = fleetShips(state);
  assert.deepEqual(ships.map((ship) => ship.shipClass), ['hauler', 'cruiser', 'freighter']);
  assert.deepEqual(ships.map((ship) => ship.capacityUnits), [156, 54.6, 468]);
  assert(ships.every((ship, index) => Math.abs(ship.speedPerMinute - [0.52, 1.56, 0.312][index]) < 1e-12));
  assert(ships.every((ship, index) => Math.abs(ship.loadingUnitsPerMinute - [62.4, 21.84, 187.2][index]) < 1e-12));
});

test('invalid ship classes fail atomically', () => {
  const state = grantDevCoins(createGameState(), 10_000);
  assert.throws(() => shipPurchaseCost(state, 'battleship'), code('INVALID_SHIP_CLASS'));
  assert.throws(() => buyShip(state, 'battleship'), code('INVALID_SHIP_CLASS'));
  assert.equal(fleetShips(state).length, 1);
  assert.equal(state.coins, 10_500);
});
