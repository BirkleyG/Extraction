// Pure owner-state rules for the mine -> NPC buyer loop (sections 03, 05, 10). No I/O, no coin movement:
// GameService applies the returned changes together with ledger postings in one transaction.
import { createProductionState, advanceProductionFast, withdrawSurfaceUnits, shaftRatePerMinute, liftRatePerMinute } from './production.js';
import { CURVES, bulkPrice, habitatCapacity, shaftPrice, shaftWorkerCapacity } from './upgrades.js';

export class MineError extends Error {
  constructor(code, message = code) { super(message); this.name = 'MineError'; this.code = code; }
}
const fail = (code, message = code) => { throw new MineError(code, message); };

export const OWNER_SCHEMA_VERSION = 1;
export const LIFT_BASE = 2;
export const LIFT_GROWTH = 1.0316; // C01-LIFT-02
export const HIRE_BASE = 20;       // C01-EARLY-01
export const HIRE_GROWTH = 1.004;
export const STARTING_WORKERS = 5;
export const STARTER_CARGO_UNITS = 5; // C01-EARLY-02: in-kind starting ore so the first paid departure happens within seconds (not coin)
const clone = (v) => JSON.parse(JSON.stringify(v));
const linear = (base, level) => base * (1 + 0.04 * level);

export const bufferCapacity = (liftLevel) => 25 * (1 + 0.04 * liftLevel);
export const yardCapacity = (level) => linear(100, level);
export const shipCapacityUnits = (level) => Math.floor(linear(150, level));
export const shipSpeedPerMinute = (level) => linear(0.5, level);
export const loadUnitsPerMinute = (level) => linear(60, level);

function shaftBlueprint(number, oreId, liftLevel) {
  return {
    shaftNumber: number, oreId, digLevel: 1, bunkhouseLevel: 0, workersAssigned: 0, cartLevel: 0,
    depthGrowth: 2.2, baseRatePerWorkerPerMinute: 1, soilModifier: 1, weatherModifier: 1, buffsMultiplier: 1,
    bufferCapacityUnits: bufferCapacity(liftLevel), bufferUnits: 0,
  };
}

/** New month-scoped owner state: shaft 1 at dig 1, 5 miners, lift 1, one pad, one Hauler, zero coin. */
export function createOwnerState({ ownerId, monthId, siteId, commonOreId, nowSec }) {
  if (!Number.isSafeInteger(nowSec) || nowSec < 0) fail('INVALID_CLOCK');
  const shaft = shaftBlueprint(1, commonOreId, 1);
  shaft.workersAssigned = STARTING_WORKERS;
  return {
    schemaVersion: OWNER_SCHEMA_VERSION, ownerId, monthId, siteId, simSecond: nowSec,
    workersHired: STARTING_WORKERS,
    levels: { habitat: 0, surfaceStorage: 0, shipCapacity: 0, shipSpeed: 0, padLoading: 0, lights: 0, supports: 0 },
    ship: { readyAtSecond: nowSec },
    production: createProductionState({
      shafts: [shaft],
      lift: { level: 1, baseRatePerMinute: LIFT_BASE, curve: 'exponential', growth: LIFT_GROWTH },
      surface: { capacityUnits: yardCapacity(0), unitsByOre: [{ oreId: commonOreId, units: STARTER_CARGO_UNITS }] },
      syntheticDownstreamDrain: { unitsPerSecond: 0 },
    }),
    shipments: [], shipmentCounter: 0, totalExternalEarnings: 0,
  };
}

/** Advance the mine to `toSec` through the shared one-second tick (steady stretches are extrapolated). `maxSteps` bounds explicit ticks; returns what remains. */
export function advanceOwner(state, toSec, maxSteps) {
  const gap = toSec - state.simSecond;
  if (gap < 0) fail('CLOCK_REGRESSION');
  const result = advanceProductionFast(state.production, { seconds: gap, maxTicks: maxSteps });
  const next = clone(state);
  next.production = result.state;
  next.simSecond = state.simSecond + result.processedSeconds;
  return { state: next, remainingSeconds: result.remainingSeconds };
}

export const hireCost = (alreadyHired) => Math.round(HIRE_BASE * HIRE_GROWTH ** (alreadyHired - STARTING_WORKERS));
export function hirePrice(state, count) {
  if (!Number.isSafeInteger(count) || count < 1) fail('INVALID_COUNT');
  let total = 0;
  for (let i = 0; i < count; i += 1) total += hireCost(state.workersHired + i);
  if (!Number.isSafeInteger(total)) fail('OVERFLOW');
  return total;
}

/** Fill workers into shafts with room, highest per-worker rate first (auto-assignment, section 03). */
export function assignWorkers(state) {
  const next = clone(state);
  for (const s of next.production.shafts) s.workersAssigned = 0;
  const order = [...next.production.shafts].sort((a, b) => shaftRatePerMinute({ ...b, workersAssigned: 1 }) - shaftRatePerMinute({ ...a, workersAssigned: 1 }) || a.shaftNumber - b.shaftNumber);
  let left = next.workersHired;
  for (const s of order) {
    const take = Math.min(left, shaftWorkerCapacity(s.bunkhouseLevel));
    s.workersAssigned = take; left -= take;
  }
  next.production = createProductionState(next.production);
  return next;
}

export function hire(state, count) {
  if (!Number.isSafeInteger(count) || count < 1) fail('INVALID_COUNT');
  if (state.workersHired + count > habitatCapacity(state.levels.habitat)) fail('NO_HABITAT_CAPACITY');
  const room = state.production.shafts.reduce((a, s) => a + shaftWorkerCapacity(s.bunkhouseLevel), 0);
  if (state.workersHired + count > room) fail('NO_SHAFT_CAPACITY');
  const cost = hirePrice(state, count);
  const next = clone(state);
  next.workersHired += count;
  return { state: assignWorkers(next), cost };
}

export function shaftLevelLine(state, line, shaftNumber) {
  const shaft = state.production.shafts.find((s) => s.shaftNumber === shaftNumber);
  switch (line) {
    case 'dig': if (!shaft) fail('UNKNOWN_SHAFT'); return shaft.digLevel;
    case 'carts': if (!shaft) fail('UNKNOWN_SHAFT'); return shaft.cartLevel;
    case 'bunkhouse': if (!shaft) fail('UNKNOWN_SHAFT'); return shaft.bunkhouseLevel;
    case 'lift': return state.production.lift.level;
    case 'habitat': case 'shipCapacity': case 'shipSpeed': case 'surfaceStorage': case 'lights': case 'supports': return state.levels[line];
    case 'padLoading': return state.levels.padLoading;
    default: return fail('UNKNOWN_UPGRADE', `Line not purchasable here: ${String(line)}`);
  }
}
export const PURCHASABLE_LINES = Object.freeze(['dig', 'carts', 'bunkhouse', 'lift', 'habitat', 'shipCapacity', 'shipSpeed', 'surfaceStorage', 'padLoading', 'lights', 'supports']);

export function applyLevel(state, line, shaftNumber, newLevel) {
  if (!PURCHASABLE_LINES.includes(line)) fail('UNKNOWN_UPGRADE');
  const next = clone(state);
  const shaft = next.production.shafts.find((s) => s.shaftNumber === shaftNumber);
  switch (line) {
    case 'dig': shaft.digLevel = newLevel; break;
    case 'carts': shaft.cartLevel = newLevel; break;
    case 'bunkhouse': shaft.bunkhouseLevel = newLevel; break;
    case 'lift':
      next.production.lift.level = newLevel;
      for (const s of next.production.shafts) s.bufferCapacityUnits = bufferCapacity(newLevel);
      break;
    case 'surfaceStorage': next.levels.surfaceStorage = newLevel; next.production.surface.capacityUnits = yardCapacity(newLevel); break;
    default: next.levels[line] = newLevel;
  }
  return assignWorkers(next);
}

export function addShaft(state) {
  const number = state.production.shafts.length + 1;
  const cost = shaftPrice(number); // throws at 31
  const next = clone(state);
  next.production.shafts.push(shaftBlueprint(number, state.production.shafts[0].oreId, state.production.lift.level));
  return { state: assignWorkers(next), cost };
}

/** Planned trip: 2 x travel + unload (+ separate loading time). One function for UI estimates and the simulation. */
export function tripEstimate(state, buyer, units) {
  const speed = shipSpeedPerMinute(state.levels.shipSpeed);
  const travelSeconds = (buyer.distance / speed) * 60;
  const unloadSeconds = (units / buyer.unloadUnitsPerMinute) * 60;
  const tripSeconds = Math.ceil(2 * travelSeconds + unloadSeconds);
  const loadSeconds = Math.ceil((units / loadUnitsPerMinute(state.levels.padLoading)) * 60);
  return { tripSeconds, loadSeconds, busySeconds: tripSeconds + loadSeconds, arrivalOffsetSeconds: Math.ceil(travelSeconds + unloadSeconds) };
}

export function surfaceUnits(state, oreId) {
  return state.production.surface.unitsByOre.find((r) => r.oreId === oreId)?.units ?? 0;
}
export { withdrawSurfaceUnits, liftRatePerMinute, CURVES, bulkPrice };
