// Pure owner-state rules for the mine -> NPC buyer loop (sections 03, 04, 05, 10). No I/O, no coin movement:
// GameService applies the returned changes together with ledger postings in one transaction.
import { createProductionState, advanceProductionFast, withdrawSurfaceUnits, shaftRatePerMinute, liftRatePerMinute } from './production.js';
import { CURVES, bulkPrice, habitatCapacity, padPrice, shaftPrice, shaftWorkerCapacity } from './upgrades.js';
import { groundedUntil, nextWeatherChange, soilModifier, weatherAt } from './environment.js';
import { MAX_PADS, MAX_SHIPS, chooseRow, destinationTable, shipCapacityUnits, shipClass, shipPolicy, shipPrice, tripPlan } from './ships.js';

export class MineError extends Error {
  constructor(code, message = code) { super(message); this.name = 'MineError'; this.code = code; }
}
const fail = (code, message = code) => { throw new MineError(code, message); };

export const OWNER_SCHEMA_VERSION = 2;
export const LIFT_BASE = 2;
export const LIFT_GROWTH = 1.0316; // C01-LIFT-02
export const HIRE_BASE = 20;       // C01-EARLY-01
export const HIRE_GROWTH = 1.004;
export const STARTING_WORKERS = 5;
export const STARTER_CARGO_UNITS = 5; // C01-EARLY-02: in-kind starting ore so the first paid departure happens within seconds (not coin)
const clone = (v) => JSON.parse(JSON.stringify(v));
const linear = (base, level) => base * (1 + 0.04 * level);
export { shipCapacityUnits, shipSpeedPerMinute, loadUnitsPerMinute } from './ships.js';

export const bufferCapacity = (liftLevel) => 25 * (1 + 0.04 * liftLevel);
export const yardCapacity = (level) => linear(300, level); // holds two full starting loads so a Hauler can fill while it is away

function shaftBlueprint(number, oreId, liftLevel) {
  return {
    shaftNumber: number, oreId, commonOreId: oreId, digLevel: 1, bunkhouseLevel: 0, workersAssigned: 0, cartLevel: 0, lightsLevel: 0, supportsLevel: 0,
    depthGrowth: 2.2, baseRatePerWorkerPerMinute: 1, soilModifier: 1, weatherModifier: 1, buffsMultiplier: 1,
    bufferCapacityUnits: bufferCapacity(liftLevel), bufferUnits: 0,
  };
}

/**
 * New month-scoped owner state: shaft 1 at dig 1, 5 miners, lift 1, one pad, one Hauler, zero coin.
 * `env` ({soil, soilHardness, weatherSeed, baseWeather}) and `veinPlan` (assigned veins, server-only) come from the generated planet;
 * without them the mine is neutral (no weather, no veins), which the fixtures rely on.
 */
export function createOwnerState({ ownerId, monthId, siteId, commonOreId, nowSec, slot = 0, env = null, veinPlan = [], oreTiers = {} }) {
  if (!Number.isSafeInteger(nowSec) || nowSec < 0) fail('INVALID_CLOCK');
  const shaft = shaftBlueprint(1, commonOreId, 1);
  shaft.workersAssigned = STARTING_WORKERS;
  return {
    schemaVersion: OWNER_SCHEMA_VERSION, ownerId, monthId, siteId, slot, simSecond: nowSec,
    workersHired: STARTING_WORKERS,
    levels: { habitat: 0, surfaceStorage: 0, shipCapacity: 0, shipSpeed: 0, padLoading: 0 },
    pads: 1, padFreeAt: [nowSec],
    ships: [{ id: 'ship-1', class: 'hauler', readyAtSecond: nowSec }],
    env, veinPlan, oreTiers: { ...oreTiers, [commonOreId]: 'common' },
    production: createProductionState({
      shafts: [shaft],
      lift: { level: 1, baseRatePerMinute: LIFT_BASE, curve: 'exponential', growth: LIFT_GROWTH },
      surface: { capacityUnits: yardCapacity(0), unitsByOre: [{ oreId: commonOreId, units: STARTER_CARGO_UNITS }] },
      syntheticDownstreamDrain: { unitsPerSecond: 0 },
    }),
    shipments: [], shipmentCounter: 0, totalExternalEarnings: 0,
    // Fleet default policy: take off automatically when the hold is full; best coin per minute. A ship may carry its own policy.
    policy: { auto: true, destinationId: null },
  };
}

export const oreTier = (state, oreId) => state.oreTiers?.[oreId] ?? 'common';
export const weatherNow = (state, sec) => (state.env ? weatherAt(state.env, sec) : { kind: 'clear', productionModifier: 1, grounded: false });
/** Earliest second >= sec at which ships may take off (weather grounding delays, never cancels, a departure). */
export const takeoffSecond = (state, sec) => (state.env ? groundedUntil(state.env, sec) : sec);

function withEnv(production, env, sec) {
  if (!env) return production;
  const soil = soilModifier(env.soil, env.soilHardness);
  const weather = weatherAt(env, sec).productionModifier;
  return { ...production, shafts: production.shafts.map((shaft) => ({ ...shaft, soilModifier: soil, weatherModifier: weather })) };
}

/**
 * Advance the mine to `toSec` through the shared one-second tick (steady stretches are extrapolated). Weather is constant within
 * an hour, so the run is cut at hour boundaries; live play and catch-up cut identically. `maxSteps` bounds explicit ticks per
 * segment; returns what remains.
 */
export function advanceOwner(state, toSec, maxSteps) {
  if (toSec < state.simSecond) fail('CLOCK_REGRESSION');
  let production = state.production;
  let at = state.simSecond;
  while (at < toSec) {
    const segEnd = state.env ? Math.min(toSec, nextWeatherChange(at)) : toSec;
    const r = advanceProductionFast(withEnv(production, state.env, at), { seconds: segEnd - at, maxTicks: maxSteps });
    production = r.state;
    at += r.processedSeconds;
    if (r.remainingSeconds > 0) break;
  }
  const next = clone(state);
  next.production = production;
  next.simSecond = at;
  return { state: next, remainingSeconds: toSec - at };
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
  // Section 03: miners above shaft capacity are hired but ignored until capacity grows ("!" wasted labor, see wastedWorkers).
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
    case 'lights': if (!shaft) fail('UNKNOWN_SHAFT'); return shaft.lightsLevel;
    case 'supports': if (!shaft) fail('UNKNOWN_SHAFT'); return shaft.supportsLevel;
    case 'habitat': case 'shipCapacity': case 'shipSpeed': case 'surfaceStorage': return state.levels[line];
    case 'padLoading': return state.levels.padLoading;
    default: return fail('UNKNOWN_UPGRADE', `Line not purchasable here: ${String(line)}`);
  }
}
export const PURCHASABLE_LINES = Object.freeze(['dig', 'carts', 'bunkhouse', 'lift', 'habitat', 'shipCapacity', 'shipSpeed', 'surfaceStorage', 'padLoading', 'lights', 'supports']);

export function applyLevel(state, line, shaftNumber, newLevel) {
  if (!PURCHASABLE_LINES.includes(line)) fail('UNKNOWN_UPGRADE');
  const next = clone(state);
  const shaft = next.production.shafts.find((s) => s.shaftNumber === shaftNumber);
  if (['dig', 'carts', 'bunkhouse', 'lights', 'supports'].includes(line) && !shaft) fail('UNKNOWN_SHAFT');
  switch (line) {
    case 'dig': shaft.digLevel = newLevel; break;
    case 'carts': shaft.cartLevel = newLevel; break;
    case 'bunkhouse': shaft.bunkhouseLevel = newLevel; break;
    case 'lights': shaft.lightsLevel = newLevel; break;
    case 'supports': shaft.supportsLevel = newLevel; break;
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
  const shaft = shaftBlueprint(number, state.production.shafts[0].commonOreId, state.production.lift.level);
  const plan = (state.veinPlan ?? []).find((v) => v.shaftNumber === number);
  if (plan) shaft.vein = { oreId: plan.oreId, size: plan.size, remaining: plan.size };
  next.production.shafts.push(shaft);
  return { state: assignWorkers(next), cost };
}

/** Pads 2..12 (section 05/10). Ships queue for pads, so a new pad only adds loading capacity. */
export function addPad(state, nowSec) {
  if (state.pads >= MAX_PADS) fail('INVALID_PAD', 'A mine has at most 12 pads');
  const cost = padPrice(state.pads + 1);
  const next = clone(state);
  next.pads += 1;
  next.padFreeAt = [...state.padFreeAt, nowSec];
  return { state: next, cost };
}

export function addShip(state, className, nowSec) {
  const cost = shipPrice(className); // throws UNKNOWN_SHIP_CLASS
  if (state.ships.length >= MAX_SHIPS) fail('FLEET_FULL');
  const next = clone(state);
  const id = `ship-${state.ships.length + 1}`;
  next.ships.push({ id, class: className, readyAtSecond: nowSec });
  return { state: next, cost, shipId: id };
}

/** Miners hired but not seated in any shaft ("!" wasted labor, section 03). */
export const wastedWorkers = (state) => Math.max(0, state.workersHired - state.production.shafts.reduce((a, s) => a + s.workersAssigned, 0));

export function surfaceUnits(state, oreId) {
  return state.production.surface.unitsByOre.find((r) => r.oreId === oreId)?.units ?? 0;
}
export { withdrawSurfaceUnits, liftRatePerMinute, CURVES, bulkPrice };

// ---------------------------------------------------------------------------------------------------------
// Departures. Computer-run buyers never run out of coin for the BASE bid (CEO decision Q-10): they pay units x bid at takeoff.
// Only the rare/mythic premium is finite (see npc-market.js). A ship takes off automatically when its hold is full; "Launch now"
// forces it. Every payment is decided here, at takeoff; arrival never pays (section 02/05).
// ---------------------------------------------------------------------------------------------------------
const enc = (v) => Buffer.from(JSON.stringify(v)).toString('base64url');
const ORE_EPSILON = 1e-6; // ore flows are floating point; a stock within 1e-6 of a whole unit counts as that unit
const TIER_RANK = { mythic: 2, rare: 1, common: 0 };
export const getPolicy = (state) => state.policy ?? { auto: true, destinationId: null };

export function findShip(state, shipId) {
  const ship = state.ships.find((s) => s.id === shipId);
  if (!ship) fail('UNKNOWN_SHIP');
  return ship;
}

/** Whole units on the yard, per ore, most valuable tier first. */
export function yardLines(state) {
  return state.production.surface.unitsByOre
    .map((r) => ({ oreId: r.oreId, tier: oreTier(state, r.oreId), units: Math.floor(r.units + ORE_EPSILON) }))
    .filter((l) => l.units > 0)
    .sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier] || (a.oreId < b.oreId ? -1 : 1));
}
export const yardStock = (state) => yardLines(state).reduce((a, l) => a + l.units, 0);

/** The hold's contents for `wantUnits`: most valuable ore first, one line per ore (a load is never split between destinations). */
export function cargoPlan(state, wantUnits) {
  const lines = [];
  let left = wantUnits;
  for (const l of yardLines(state)) {
    if (left <= 0) break;
    const take = Math.min(l.units, left);
    lines.push({ oreId: l.oreId, tier: l.tier, units: take });
    left -= take;
  }
  return lines;
}

/** A takeoff is due when the hold is full, or when the yard is completely full (nothing more could arrive). */
export const takeoffTarget = (state, ship = state.ships[0]) => Math.max(1, Math.min(shipCapacityUnits(state, ship), Math.floor(state.production.surface.capacityUnits)));

/** Destination table for one ship and cargo (price, tax, trip time, coin per minute). Same inputs as the real departure (T05-01). */
export function destinationRows(state, ship, market, lines, atSec) {
  const units = lines.reduce((a, l) => a + l.units, 0);
  return destinationTable(state, ship, market.refineries, units, atSec, { quoteFor: (r) => market.quote(r.id, lines, atSec), waitFor: (r) => market.dockWait(r.id) });
}
export const chooseDestination = (state, ship, market, lines, atSec) => chooseRow(destinationRows(state, ship, market, lines, atSec), shipPolicy(state, ship));

/** Take the cargo off the yard and pay for it at `atSec`. The state must already be advanced to atSec; `market` is mutated (premium, dock). */
export function departureFor(state, shipId, refineryId, lines, atSec, market, { weatherDelaySeconds = 0 } = {}) {
  const refinery = market.get(refineryId);
  if (!refinery) fail('UNKNOWN_DESTINATION');
  const ship = findShip(state, shipId);
  const units = lines.reduce((a, l) => a + l.units, 0);
  if (!Number.isSafeInteger(units) || units < 1) fail('INVALID_UNITS');
  const next = clone(state);
  for (const l of lines) {
    const available = surfaceUnits(next, l.oreId);
    next.production = withdrawSurfaceUnits(next.production, l.oreId, l.units > available && l.units - available <= ORE_EPSILON ? available : l.units);
  }
  const quote = market.quote(refinery.id, lines, atSec);
  const plan = tripPlan(state, ship, refinery, units, atSec, { dockWaitSeconds: market.dockWait(refinery.id) });
  const payment = quote.payment;
  if (!Number.isSafeInteger(payment) || payment < 1) fail('OVERFLOW');
  market.commit(refinery.id, quote, plan.dockReservation);
  next.shipmentCounter += 1;
  const shipment = {
    id: `shp:${enc(state.ownerId)}:${state.monthId}:${next.shipmentCounter}`, number: next.shipmentCounter, shipId, oreId: lines[0].oreId, units,
    unitPrice: refinery.bidPerUnit, payment, basePayment: quote.basePayment, premiumPayment: quote.premiumPayment,
    cargo: quote.lines.map((l) => ({ oreId: l.oreId, tier: l.tier, units: l.units, premiumUnits: l.premiumUnits, payment: l.payment })),
    destinationId: refinery.id, departureSecond: atSec, arrivalSecond: atSec + plan.arrivalOffsetSeconds, tripSeconds: plan.tripSeconds,
    dockWaitSeconds: plan.dockWaitSeconds, weatherDelaySeconds, state: 'PAID_AT_DEPARTURE',
  };
  next.shipments.push(shipment);
  if (next.shipments.length > 100) next.shipments.splice(0, next.shipments.length - 100);
  next.ships.find((x) => x.id === shipId).readyAtSecond = plan.readyAtSecond;
  next.padFreeAt[plan.padIndex] = plan.readyAtSecond;
  next.totalExternalEarnings += payment;
  if (!Number.isSafeInteger(next.totalExternalEarnings)) fail('OVERFLOW');
  return { state: next, shipment, plan };
}

/** Earliest second in [fromSec, toSec] at which the yard holds at least `target` whole units, or null. Stock only grows between departures. */
function firstSecondWithStock(state, fromSec, toSec, target, maxTicks) {
  const stockAt = (t) => yardStock(advanceOwner(state, t, maxTicks).state);
  if (stockAt(fromSec) >= target) return fromSec;
  if (stockAt(toSec) < target) return null;
  let lo = fromSec; let hi = toSec; // stock(lo) < target <= stock(hi)
  while (hi - lo > 1) { const mid = lo + Math.floor((hi - lo) / 2); if (stockAt(mid) >= target) hi = mid; else lo = mid; }
  return hi;
}

/**
 * Advance to `toSec`, taking off automatically each time a ship's hold is full, the ship is ready and the weather allows.
 * Ships are served in time order (ties: fleet order). Pure except for the working `market`: returns the new state and the
 * departures made (each needs a ledger posting at its own second). Grounded takeoffs wait, with the delay recorded; cargo is never lost.
 */
export function settleAuto(inputState, market, toSec, { maxDepartures = 150, maxTicks = 20_000 } = {}) {
  let cur = inputState;
  const departures = [];
  for (;;) {
    let pick = null;
    for (const ship of cur.ships) {
      if (!shipPolicy(cur, ship).auto) continue;
      const from = Math.max(cur.simSecond, ship.readyAtSecond);
      if (from > toSec) continue;
      const t = firstSecondWithStock(cur, from, toSec, takeoffTarget(cur, ship), maxTicks);
      if (t === null) continue;
      const tt = takeoffSecond(cur, t);
      if (tt > toSec) continue;
      if (!pick || tt < pick.tt) pick = { ship, t, tt };
    }
    if (!pick) break;
    if (departures.length >= maxDepartures) return { state: cur, departures, done: false };
    const atT = advanceOwner(cur, pick.tt, maxTicks);
    if (atT.remainingSeconds > 0) return { state: atT.state, departures, done: false };
    const target = takeoffTarget(atT.state, pick.ship);
    const lines = cargoPlan(atT.state, target);
    const row = chooseDestination(atT.state, pick.ship, market, lines, pick.tt);
    const dep = departureFor(atT.state, pick.ship.id, row.id, lines, pick.tt, market, { weatherDelaySeconds: pick.tt - pick.t });
    departures.push({ ...dep.shipment, atSecond: pick.tt });
    cur = dep.state;
  }
  const end = advanceOwner(cur, toSec, maxTicks);
  return { state: end.state, departures, done: end.remainingSeconds === 0 };
}

/** Seconds until the first automatic takeoff, assuming the current inflow; 0 when a hold is already full; null when ore is not arriving. */
export function secondsUntilFull(state) {
  const ship = state.ships.find((s) => shipPolicy(state, s).auto);
  if (!ship) return null;
  const cap = takeoffTarget(state, ship);
  const total = (st) => st.production.surface.unitsByOre.reduce((a, r) => a + r.units, 0);
  const stock = total(state);
  if (stock >= cap) return 0;
  const probe = advanceOwner(state, state.simSecond + 60, 100).state;
  const rate = (total(probe) - stock) / 60;
  return rate > 1e-9 ? Math.ceil((cap - stock) / rate) : null;
}
