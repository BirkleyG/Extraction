import { createIndustry, validateIndustry, advanceIndustry, applyIndustryAction, refineryStats, stationStats, npcRefinedPrice } from './industry.js';
import { createFrontier, validateFrontier, advanceFrontier, applyFrontierAction } from './frontier.js';
import * as E from './economy.js';
import { createProductionState, liftRatePerMinute, shaftRatePerMinute, tickProductionSecond, withdrawSurfaceUnits } from '../production.js';
import { tierOf } from './upgrades.js';

export const SAVE_KEY = 'extraction_playtest_v4';
export const SAVE_VERSION = 1;
export const BASE_LIFT_GROWTH = 1.0316;
export const ORES = Object.freeze([
  { id: 'ferrite', name: 'Ferrite', color: '#cf8152', value: 1 },
  { id: 'cobalt', name: 'Cobalt', color: '#55a8d8', value: 1.15 },
  { id: 'lithium', name: 'Lithium', color: '#93d0ae', value: 1.05 },
  { id: 'sulfur', name: 'Sulfur', color: '#e6cd65', value: 0.9 },
  { id: 'crystal', name: 'Crystal', color: '#bb97e8', value: 1.5 },
  { id: 'iridium', name: 'Iridium', color: '#90c5ce', value: 2.3 },
  { id: 'mythic', name: 'Mythic', color: '#ee9d58', value: 4 },
]);
export const DESTINATIONS = Object.freeze([
  Object.freeze({ id: 'frontier-refinery', name: 'Frontier Refinery', detail: 'Near · steady bid', distance: 1, basePrice: 40, unloadUnitsPerMinute: 1500, accent: '#e7a15a' }),
  Object.freeze({ id: 'cinder-bay-buyer', name: 'Cinder Bay Buyer', detail: 'Far · premium bid', distance: 3, basePrice: 64, unloadUnitsPerMinute: 900, accent: '#66bfd0' }),
  Object.freeze({ id: 'low-orbit-depot', name: 'Low Orbit Depot', detail: 'Remote · mid bid', distance: 8, basePrice: 52, unloadUnitsPerMinute: 1200, accent: '#b48bd6' }),
]);


/* ---------- sites, common ore and rare veins (rulebook 04, provisional C-03 sizes) ----------
 * A site has exactly one common ore (infinite) and a few rare veins hidden in its shafts. A shaft digs the common ore
 * until its tunnel face reaches a vein that its pick is hard enough to break; the vein then supplies its rare ore until
 * it is empty (T04-02, T04-03) and the shaft goes back to the common ore. The scene only illustrates this. */
const textHash = (value) => { let h = 2166136261 >>> 0; const text = String(value); for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const seededRng = (seed) => { let a = (seed >>> 0) || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
export const COMMON_ORES = Object.freeze(['ferrite', 'cobalt']);
export const RARE_ORES = Object.freeze(['lithium', 'sulfur', 'crystal', 'iridium']);
export const MYTHIC_ORE = 'mythic';
export const HARDNESS = Object.freeze({ ferrite: 1, cobalt: 2, lithium: 5, sulfur: 5, crystal: 6, iridium: 6, mythic: 9 });
export const VEIN_SIZE = Object.freeze({ rare: 900, mythic: 3000 });
export const TOUGH_TERRAINS = Object.freeze(['mesa', 'volcanic', 'canyon', 'glacier', 'alpine', 'badlands', 'arches', 'monoliths', 'rifts', 'crystal', 'scrapyard']);
const TOOL_HARDNESS = [2, 4, 6, 8, 10, 10];
export const toolHardness = (digLevel, sandbox = false) => TOOL_HARDNESS[sandbox ? E.tierIndex('pick', digLevel) : tierOf('dig', digLevel).i];
/** how far a shaft's tunnel face has been dug, in scene units, from the units it has mined */
export const faceDistance = (minedUnits) => Math.min(360, 40 * Math.log2(1 + Math.max(0, minedUnits) / 4));
const DEFAULT_SITE = Object.freeze({ seed: 'sandbox|home', regionId: 'home', commonOreId: 'ferrite', rareOreIds: RARE_ORES, mythic: true });

export function makeSite(options) {
  if (!options) return { ...DEFAULT_SITE, rareOreIds: [...DEFAULT_SITE.rareOreIds] };
  const { planetId = 'sandbox', regionId = 'home', tough = false } = options;
  const seed = `${planetId}|${regionId}`;
  const R = seededRng(textHash(`${seed}|site`));
  const commonOreId = COMMON_ORES[R() < 0.5 ? 0 : 1];
  let rareOreIds = RARE_ORES.filter(() => R() < 0.55);
  if (rareOreIds.length < 2) { const start = Math.floor(R() * RARE_ORES.length); rareOreIds = [RARE_ORES[start], RARE_ORES[(start + 1) % RARE_ORES.length]]; }
  return { seed, regionId, commonOreId, rareOreIds, mythic: Boolean(tough) && R() < 0.7 };
}

export function generateVeins(site, shaftNumber, sandbox = true) {
  const R = seededRng(textHash(`${site.seed}|shaft${shaftNumber}`));
  const chance = Math.min(0.8, 0.3 + 0.025 * shaftNumber);
  const maxVeins = shaftNumber >= 12 ? 3 : shaftNumber >= 5 ? 2 : 1;
  const veins = [];
  for (let k = 0; k < maxVeins; k += 1) {
    const forced = shaftNumber === 3 && k === 0 && site.rareOreIds.length > 0;
    if (!forced && R() >= chance * (k === 0 ? 1 : 0.5)) continue;
    const mythic = site.mythic && shaftNumber >= 24 && R() < 0.5;
    const oreId = mythic ? MYTHIC_ORE : site.rareOreIds[Math.floor(R() * site.rareOreIds.length)];
    if (!oreId) continue;
    const richness = 0.6 + R() * 0.9;
    const sizeUnits = sandbox ? E.veinSize(shaftNumber, richness, mythic) : Math.round(richness * (mythic ? VEIN_SIZE.mythic : VEIN_SIZE.rare) * (1 + 0.15 * (shaftNumber - 1)));
    veins.push({ id: `v${shaftNumber}-${k}`, shaftNumber, oreId, at: Math.round(150 + R() * 170 + k * 25), sizeUnits, remainingUnits: sizeUnits, seen: false, warned: false });
  }
  return veins.sort((a, b) => a.at - b.at);
}

const shaftByNumber = (state, number) => state.production.shafts.find((shaft) => shaft.shaftNumber === number);
export function veinStatus(state, vein) {
  if (vein.remainingUnits <= 1e-9) return 'empty';
  if (faceDistance(state.shaftMined?.[vein.shaftNumber] ?? 0) < vein.at) return 'ahead';
  const shaft = shaftByNumber(state, vein.shaftNumber);
  return !shaft || HARDNESS[vein.oreId] > toolHardness(shaft.digLevel, Boolean(state.economyProfile)) ? 'blocked' : 'mining';
}
function miningVein(state, shaftNumber) { return (state.veins || []).find((vein) => vein.shaftNumber === shaftNumber && veinStatus(state, vein) === 'mining'); }

function addSurfaceUnits(production, oreId, units) {
  const row = production.surface.unitsByOre.find((item) => item.oreId === oreId);
  if (row) row.units += units; else production.surface.unitsByOre.push({ oreId, units });
}

/** one second of digging with vein bookkeeping wrapped around the shared flow tick */
function mineOneSecond(next) {
  // Trusted snapshots already encode server-side veins. Only predict their visible production.
  if (next.remote) { next.production = tickProductionSecond(next.production); return; }
  const production = next.production;
  let surfaceFree = production.surface.capacityUnits - production.surface.unitsByOre.reduce((sum, row) => sum + row.units, 0);
  const caps = new Map(); const plan = [];
  for (const shaft of production.shafts) {
    const vein = miningVein(next, shaft.shaftNumber);
    const want = vein ? vein.oreId : next.site.commonOreId;
    let limit = null;
    if (shaft.oreId !== want) {
      if (shaft.bufferUnits <= 1e-9) shaft.oreId = want;
      else if (surfaceFree >= shaft.bufferUnits) { addSurfaceUnits(production, shaft.oreId, shaft.bufferUnits); surfaceFree -= shaft.bufferUnits; shaft.bufferUnits = 0; shaft.oreId = want; }
      else limit = shaft.bufferUnits; // changeover: no digging until the lift has cleared the old ore
    }
    const activeVein = vein && shaft.oreId === vein.oreId ? vein : null;
    if (activeVein) limit = Math.min(limit ?? Infinity, shaft.bufferUnits + activeVein.remainingUnits);
    if (limit !== null) { caps.set(shaft.shaftNumber, shaft.bufferCapacityUnits); shaft.bufferCapacityUnits = Math.max(shaft.bufferUnits, Math.min(shaft.bufferCapacityUnits, limit)); }
    const amount = shaft.workersAssigned > 0 && shaft.bufferUnits < shaft.bufferCapacityUnits ? Math.min(shaftRatePerMinute(shaft) / 60, shaft.bufferCapacityUnits - shaft.bufferUnits) : 0;
    plan.push({ shaftNumber: shaft.shaftNumber, amount, vein: activeVein ? activeVein.id : null });
  }
  // Local veins are tracked by this wrapper, not the server's embedded-vein kernel.
  // Pin its fallback ore to the locally chosen buffer ore before the shared tick.
  for (const shaft of production.shafts) if (!shaft.vein) shaft.commonOreId = shaft.oreId;
  next.production = tickProductionSecond(production);
  for (const shaft of next.production.shafts) if (caps.has(shaft.shaftNumber)) shaft.bufferCapacityUnits = caps.get(shaft.shaftNumber);
  for (const item of plan) {
    const vein = item.vein ? next.veins.find((v) => v.id === item.vein) : null;
    // only common digging pushes the tunnel face forward; working a vein holds the face at the vein
    if (!vein) next.shaftMined[item.shaftNumber] = (next.shaftMined[item.shaftNumber] ?? 0) + item.amount;
    if (!vein) continue;
    vein.remainingUnits = Math.max(0, vein.remainingUnits - item.amount);
    if (vein.remainingUnits < 1e-9) { vein.remainingUnits = 0; appendLog(next, `The ${ore(vein.oreId).name} vein in shaft ${vein.shaftNumber} ran dry. The shaft is back on ${ore(next.site.commonOreId).name}.`, 'vein'); }
    else if (!vein.warned && vein.remainingUnits < vein.sizeUnits * 0.2) { vein.warned = true; appendLog(next, `The ${ore(vein.oreId).name} vein in shaft ${vein.shaftNumber} is below 20 percent.`, 'vein'); }
  }
  for (const vein of next.veins) {
    if (vein.seen) continue;
    const status = veinStatus(next, vein);
    if (status === 'mining' || status === 'blocked') { vein.seen = true; appendLog(next, status === 'mining' ? `Shaft ${vein.shaftNumber} broke into a vein of ${ore(vein.oreId).name}.` : `Shaft ${vein.shaftNumber} found a vein of ${ore(vein.oreId).name}, but the pick is too weak to break it.`, 'vein'); }
  }
}

const MAX_COIN = Number.MAX_SAFE_INTEGER;
const fail = (code, message = code) => { const error = new Error(message); error.code = code; throw error; };
const ore = (id) => ORES.find((item) => item.id === id);
const safeInt = (value, label) => { if (!Number.isSafeInteger(value) || value < 0 || value > MAX_COIN) fail('INVALID_STATE', `${label} must be a safe non-negative integer`); return value; };
const number = (value, label, min = 0) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > MAX_COIN) fail('INVALID_STATE', `${label} must be finite and non-negative`); return value; };
const roundHalfUp = (value) => Math.floor(value + 0.5);
const clone = (value) => JSON.parse(JSON.stringify(value));
const addSafe = (a, b, label) => safeInt(a + b, label);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function costAt(base, growth, level) {
  const cost = roundHalfUp(base * growth ** level);
  return safeInt(Math.max(1, cost), 'purchase cost');
}

function costSchedule(type, state, shaftNumber = 1) {
  if (state.economyProfile) { const id = sandboxLine(type); if (!id) fail("UNKNOWN_UPGRADE"); return { level: sandboxLevel(state, id), cap: E.LEVEL_CAP, id }; }
  switch (type) {
    case 'dig': return { level: findShaft(state, shaftNumber).digLevel, cap: 1000, base: 15, growth: 1.021 };
    case 'lift': return { level: state.production.lift.level, cap: 1000, base: 25, growth: 1.0205 };
    case 'bunkhouse': return { level: findShaft(state, shaftNumber).bunkhouseLevel, cap: 10, base: 100, growth: 1.8 };
    case 'cart': return { level: findShaft(state, shaftNumber).cartLevel, cap: 10, base: 400, growth: 1.8 };
    case 'yard': return { level: state.upgrades.yard, cap: 1000, base: 50, growth: 1.0195 };
    case 'habitat': return { level: state.upgrades.habitat, cap: 1000, base: 50, growth: 1.0195 };
    case 'shipCapacity': return { level: state.upgrades.shipCapacity, cap: 1000, base: 30, growth: 1.02 };
    case 'shipSpeed': return { level: state.upgrades.shipSpeed, cap: 1000, base: 30, growth: 1.02 };
    case 'loading': return { level: state.upgrades.loading, cap: 1000, base: 30, growth: 1.02 };
    default: fail('UNKNOWN_UPGRADE');
  }
}

function newProductionState(shafts, lift, surface, elapsedSeconds = 0) {
  return createProductionState({
    shafts,
    lift,
    surface,
    syntheticDownstreamDrain: { unitsPerSecond: 0 },
    elapsedSeconds,
  });
}

function shaftBlueprint(number, upgrades = {}, workersAssigned = 0) {
  return {
    shaftNumber: number,
    oreId: upgrades.oreId ?? ORES[0].id,
    digLevel: upgrades.digLevel ?? 1,
    bunkhouseLevel: upgrades.bunkhouseLevel ?? 0,
    workersAssigned,
    cartLevel: upgrades.cartLevel ?? 0,
    depthGrowth: 2.2,
    baseRatePerWorkerPerMinute: 1,
    soilModifier: 1,
    weatherModifier: 1,
    buffsMultiplier: 1,
    bufferCapacityUnits: 25 * (1 + 0.04 * (upgrades.liftLevel ?? 1)),
    bufferUnits: 0,
  };
}

function addLedger(state, type, amount, description, externalAccount, actualDelta, escrowDelta = 0) {
  safeInt(amount, 'ledger amount');
  const id = `local-${String(state.nextRecordId).padStart(8, '0')}`;
  state.nextRecordId += 1;
  const entry = Object.freeze({
    id,
    atSecond: state.simSeconds,
    type,
    amount,
    ownerDelta: actualDelta,
    externalDelta: -actualDelta - escrowDelta,
    ...(escrowDelta ? { escrowDelta } : {}),
    externalAccount,
    description,
  });
  state.ledger.push(entry);
}

function changeCoin(state, delta, type, description, externalAccount, escrowDelta = 0) {
  const next = safeInt(state.coins + delta, 'wallet');
  if (delta < 0 && next > state.coins) fail('OVERFLOW');
  state.coins = next;
  addLedger(state, type, Math.abs(delta), description, externalAccount, delta, escrowDelta);
}

export function createGameState(siteOptions, { legacy = false } = {}) {
  const site = makeSite(siteOptions);
  const state = {
    schemaVersion: SAVE_VERSION,
    economyProfile: 'sandbox-rebuild-v1',
    simSeconds: 0,
    coins: 0,
    sourceGrants: 0,
    totalExternalEarnings: 0,
    workersHired: 10,
    upgrades: { habitat: 0, yard: 0, shipCapacity: 0, shipSpeed: 0, loading: 0, pick: 0, hauler: 0 },
    production: newProductionState([shaftBlueprint(1, { oreId: site.commonOreId }, 5)], { level: 1, baseRatePerMinute: 2, curve: 'exponential', growth: BASE_LIFT_GROWTH }, { capacityUnits: 300, unitsByOre: [{ oreId: site.commonOreId, units: 5 }] }),
    ship: { capacityUnits: 150, speedPerMinute: 0.5, loadingUnitsPerMinute: 60, readyAtSecond: 0, loading: false, cargoOreId: null, cargoUnits: 0 },
    site,
    veins: generateVeins(site, 1, !legacy),
    shaftMined: {},
    selectedDestinationId: DESTINATIONS[0].id,
    autoLaunch: true,
    shipments: [],
    shipmentStatusById: {},
    ledger: [],
    nextRecordId: 1,
    log: [],
    notice: 'The mine is live with zero coin. Press Launch now to sell your starter ore, then spend it on digging.',
  };
  if (legacy) { delete state.economyProfile; delete state.upgrades.pick; delete state.upgrades.hauler; state.workersHired = 5; return state; }
  state.production.lift.level = 0;
  syncSandbox(state);
  state.production.surface.unitsByOre = [{ oreId: site.commonOreId, units: E.START_YARD_UNITS }];
  state.production.initialUnitsByOre = [{ oreId: site.commonOreId, units: E.START_YARD_UNITS }];
  return validateGameState(state);
}

function findShaft(state, shaftNumber) {
  const shaft = state.production.shafts.find((item) => item.shaftNumber === shaftNumber);
  if (!shaft) fail('UNKNOWN_SHAFT');
  return shaft;
}

function destinationFor(id) {
  const destination = DESTINATIONS.find((item) => item.id === id);
  if (!destination) fail('UNKNOWN_DESTINATION');
  return destination;
}
function priceFor(destination, oreId) {
  const item = ore(oreId);
  if (!item) fail('UNKNOWN_ORE');
  return roundHalfUp(destination.basePrice * item.value);
}
function rebalanceWorkers(state) {
  for (const shaft of state.production.shafts) shaft.workersAssigned = 0;
  const destination = destinationFor(state.selectedDestinationId);
  for (let worker = 0; worker < state.workersHired; worker += 1) {
    const candidates = state.production.shafts.filter((shaft) => shaft.workersAssigned < 10 + 5 * shaft.bunkhouseLevel).map((shaft) => ({
      shaft,
      score: shaftRatePerMinute({ ...shaft, workersAssigned: 1 }) * priceFor(destination, shaft.oreId),
    })).sort((a, b) => b.score - a.score || a.shaft.shaftNumber - b.shaft.shaftNumber);
    if (!candidates.length) fail('NO_WORKER_CAPACITY');
    candidates[0].shaft.workersAssigned += 1;
  }
}
function appendLog(state, message, type = 'event') {
  state.log.push(Object.freeze({ atSecond: state.simSeconds, message, type }));
  if (state.log.length > 80) state.log.splice(0, state.log.length - 80);
}

function availableSurface(state, oreId) {
  return state.production.surface.unitsByOre.find((row) => row.oreId === oreId)?.units ?? 0;
}
function preferredCargoOre(state, destinationId) {
  return state.production.surface.unitsByOre.filter((row) => state.economyProfile ? Math.floor(row.units) >= 1 : row.units > 0).sort((a, b) => {
    const valueOrder = priceFor(destinationFor(destinationId), b.oreId) - priceFor(destinationFor(destinationId), a.oreId);
    return valueOrder || (a.oreId < b.oreId ? -1 : a.oreId > b.oreId ? 1 : 0);
  })[0]?.oreId ?? null;
}

/** Pay the cargo aboard at takeoff. NPC buyers never run out of coin or room, so the only limits are the ship and the ore. */
function computeDispatch(state, destinationId, extraLoadSeconds = 0) {
  const destination = destinationFor(destinationId);
  if (state.ship.readyAtSecond > state.simSeconds) return { state, result: null, reason: 'ship-busy' };
  const cargoOreId = state.ship.cargoOreId;
  const units = state.ship.cargoUnits;
  if (!cargoOreId || units < 1e-9) return { state, result: null, reason: 'no-cargo' };
  const price = state.economyProfile ? roundHalfUp(E.DESTINATIONS[DESTINATIONS.indexOf(destination)].basePrice * ore(cargoOreId).value) : priceFor(destination, cargoOreId);
  const payment = roundHalfUp(units * price);
  if (!Number.isSafeInteger(payment) || payment < 1) return { state, result: null, reason: 'no-cargo' };
  if (payment > MAX_COIN - state.coins || payment > MAX_COIN - state.totalExternalEarnings) return { state, result: null, reason: 'balance-limit' };
  const next = state;
  changeCoin(next, payment, 'NPC_RAW_PURCHASE', `${destination.name} paid at departure`, `source:NPC:${destinationId}`);
  next.totalExternalEarnings = addSafe(next.totalExternalEarnings, payment, 'external earnings');
  const now = next.simSeconds;
  const travelOneWaySeconds = destination.distance / next.ship.speedPerMinute * 60;
  const unloadSeconds = state.economyProfile ? E.DESTINATIONS[DESTINATIONS.indexOf(destination)].unloadSeconds : units / destination.unloadUnitsPerMinute * 60;
  const arrivalAtSecond = now + Math.ceil(travelOneWaySeconds + unloadSeconds);
  const tripSeconds = Math.ceil(2 * travelOneWaySeconds + unloadSeconds);
  next.ship.readyAtSecond = now + tripSeconds + extraLoadSeconds;
  next.ship.cargoUnits = 0;
  next.ship.cargoOreId = null;
  next.ship.loading = false;
  const shipmentId = `shipment-${String(next.nextRecordId).padStart(8, '0')}`;
  const shipment = Object.freeze({
    id: shipmentId, oreId: cargoOreId, units, unitPrice: price, payment, destinationId,
    departureAtSecond: now, arrivalAtSecond, shipReadyAtSecond: next.ship.readyAtSecond, tripSeconds, state: 'PAID_AT_DEPARTURE',
  });
  next.shipments.push(shipment);
  next.shipmentStatusById[shipmentId] = 'IN_TRANSIT';
  appendLog(next, `${units.toFixed(1)} units of ${ore(cargoOreId).name} took off for ${destination.name}; ${payment} coin paid at takeoff.`, 'sale');
  return { state: next, result: shipment, reason: 'launched' };
}

/** Normal loading: the pad moves ore from the yard into the hold at the pad's loading rate. */
function loadOneSecond(state) {
  if (state.ship.readyAtSecond > state.simSeconds) return state;
  const next = state;
  const cargoOreId = next.ship.cargoOreId ?? preferredCargoOre(next, next.selectedDestinationId);
  const room = Math.max(0, next.ship.capacityUnits - next.ship.cargoUnits);
  const available = cargoOreId ? availableSurface(next, cargoOreId) : 0;
  const amount = Math.min(next.economyProfile ? Math.floor(available) : available, room, next.ship.loadingUnitsPerMinute / 60);
  next.ship.loading = amount > 1e-9;
  if (amount <= 1e-9) return next;
  next.production = withdrawSurfaceUnits(next.production, cargoOreId, amount);
  next.ship.cargoOreId = cargoOreId;
  next.ship.cargoUnits += amount;
  return next;
}

/** Instant top-up used by "Launch now": the hold is filled from the yard at once; the time it would have taken to load is added before the next trip. */
function rushLoad(state) {
  const next = clone(state);
  const cargoOreId = next.ship.cargoOreId ?? preferredCargoOre(next, next.selectedDestinationId);
  if (!cargoOreId) return { state: next, loaded: 0 };
  const available = availableSurface(next, cargoOreId);
  const amount = Math.min(next.economyProfile ? Math.floor(available) : available, Math.max(0, next.ship.capacityUnits - next.ship.cargoUnits));
  if (amount <= 1e-9) return { state: next, loaded: 0 };
  next.production = withdrawSurfaceUnits(next.production, cargoOreId, amount);
  next.ship.cargoOreId = cargoOreId;
  next.ship.cargoUnits += amount;
  return { state: next, loaded: amount };
}

/** The cargo ore has stopped arriving (vein dry, shaft idle) so waiting for a full hold would wait forever. */
function cargoStranded(state) {
  const id = state.ship.cargoOreId;
  if (!id || state.ship.cargoUnits < 1e-9 || (state.economyProfile ? Math.floor(availableSurface(state, id)) >= 1 : availableSurface(state, id) >= 1e-9)) return false;
  return !state.production.shafts.some((shaft) => shaft.workersAssigned > 0 && ((miningVein(state, shaft.shaftNumber)?.oreId ?? state.site.commonOreId) === id || shaft.bufferUnits > 1e-9 && shaft.oreId === id));
}

/** Auto mode: load continuously and take off the moment the hold is full (or the ore can no longer arrive). */
function launchIfReady(state) {
  if (state.ship.readyAtSecond > state.simSeconds) return state;
  let loaded = loadOneSecond(state);
  const full = loaded.ship.cargoUnits >= loaded.ship.capacityUnits - 1e-9;
  if (loaded.autoLaunch && loaded.ship.cargoUnits > 0 && (full || cargoStranded(loaded))) {
    const result = computeDispatch(loaded, loaded.selectedDestinationId);
    if (result.result) loaded = result.state;
  }
  return loaded;
}

function arriveShipments(state) {
  const next = state;
  for (const shipment of next.shipments) {
    if (next.shipmentStatusById[shipment.id] !== 'IN_TRANSIT' || shipment.arrivalAtSecond > next.simSeconds) continue;
    next.shipmentStatusById[shipment.id] = 'DELIVERED';
    appendLog(next, `${shipment.units.toFixed(1)} units of ${ore(shipment.oreId).name} delivered. No second payment was made.`, 'arrival');
  }
  return next;
}

export function stepGame(inputState) {
  const state = validateGameState(inputState);
  const next = clone(state);
  next.simSeconds += 1;
  if (next.economyProfile) {
    const step = advanceFrontier(next.frontier, 1);
    next.frontier = step.frontier;
    for (const shaft of next.production.shafts) shaft.buffsMultiplier = step.productionMultiplier;
    for (const event of step.events) appendLog(next, event.description, 'frontier');
  }
  mineOneSecond(next);
  if (next.economyProfile) {
    const step = advanceIndustry(next.industry, 1);
    next.industry = step.industry;
    for (const event of step.events) appendLog(next, 'Published refined-goods offers refreshed for the new market hour.', event.type);
    if (next.industry.autoRoute && next.industry.refinery) {
      let free = refineryStats(next.industry.refinery).inputCapacity - Object.values(next.industry.refinery.input).reduce((n, value) => n + value, 0);
      for (const row of next.production.surface.unitsByOre.slice()) {
        const units = Math.min(Math.floor(row.units), Math.floor(free));
        if (units < 1) continue;
        next.production = withdrawSurfaceUnits(next.production, row.oreId, units);
        next.industry.refinery.input[row.oreId] += units;
        free -= units;
      }
    }
  }
  // Optional local refinery exports are batched, using the same checked commands as manual orders.
  if (next.economyProfile && next.simSeconds % 30 === 0 && next.industry.refinery) {
    const policy = next.industry.outputPolicy ?? 'hold';
    for (const [oreId, stock] of Object.entries(next.industry.refinery.output)) {
      let units = Math.floor(stock);
      if (units < 1 || policy === 'hold') continue;
      if (policy === 'station') {
        if (!next.industry.station) continue;
        units = Math.min(units, Math.floor(stationStats(next.industry.station).siloCapacity - next.industry.station.stock[oreId]));
        if (units > 0) Object.assign(next, industryCommand(next, { type: 'transferToStation', oreId, units }));
      } else if (policy === 'npc') {
        const payment = units * npcRefinedPrice(next.industry, oreId);
        const owned = next.coins + (next.industry.refinery.budget ?? 0);
        // Full wallets keep physical output waiting rather than minting or discarding anything.
        if (!Number.isSafeInteger(payment) || payment > MAX_COIN - owned || payment > MAX_COIN - next.totalExternalEarnings) continue;
        Object.assign(next, industryCommand(next, { type: 'sellRefinedNpc', oreId, units }));
      }
    }
  }
  let advanced = arriveShipments(next);
  // Online play: the server owns takeoffs and payments; the browser only keeps the picture of the mine moving between polls.
  if (!advanced.remote) advanced = launchIfReady(advanced);
  if (advanced.economyProfile) compactHistory(advanced);
  return validateGameState(advanced);
}

export function advanceGame(inputState, seconds, maxSteps = 300) {
  safeInt(seconds, 'catch-up seconds');
  safeInt(maxSteps, 'catch-up batch');
  if (maxSteps < 1) fail('INVALID_BATCH');
  let state = validateGameState(inputState);
  const processedSeconds = Math.min(seconds, maxSteps);
  for (let index = 0; index < processedSeconds; index += 1) state = stepGame(state);
  return { state, processedSeconds, remainingSeconds: seconds - processedSeconds };
}

function costForCount(schedule, count) {
  let total = 0;
  for (let offset = 0; offset < count; offset += 1) total = addSafe(total, costAt(schedule.base, schedule.growth, schedule.level + offset), 'purchase total');
  return total;
}

export function purchaseUpgrade(inputState, type, { shaftNumber = 1, count = 1 } = {}) {
  const state = validateGameState(inputState);
  const schedule = costSchedule(type, state, shaftNumber);
  const requested = count === 'max' ? schedule.cap - schedule.level : safeInt(count, 'purchase count');
  if (requested < 1 || schedule.level >= schedule.cap) fail('AT_CAP');
  const levels = Math.min(requested, schedule.cap - schedule.level);
  let affordableCount = 0;
  let spend = 0;
  for (let index = 0; index < levels; index += 1) {
    const cost = schedule.id ? E.lineCost(schedule.id, schedule.level + index) : costAt(schedule.base, schedule.growth, schedule.level + index);
    if (spend + cost > state.coins) break;
    spend += cost;
    affordableCount += 1;
  }
  if (affordableCount === 0) fail('INSUFFICIENT_FUNDS');
  const next = clone(state);
  changeCoin(next, -spend, 'SYSTEM_PURCHASE', `Purchased ${type} ×${affordableCount}`, 'sink:SYSTEM_PURCHASE');
  const finalLevel = schedule.level + affordableCount;
  if (state.economyProfile) {
    if (schedule.id === 'pick') next.upgrades.pick = finalLevel;
    if (schedule.id === 'hauler') next.upgrades.hauler = finalLevel;
    if (schedule.id === 'lift') next.production.lift.level = finalLevel;
    syncSandbox(next);
    appendLog(next, `Upgraded ${schedule.id} ×${affordableCount}.`, 'purchase');
    return validateGameState(next);
  }
  switch (type) {
    case 'dig': findShaft(next, shaftNumber).digLevel = finalLevel; break;
    case 'bunkhouse': findShaft(next, shaftNumber).bunkhouseLevel = finalLevel; break;
    case 'cart': findShaft(next, shaftNumber).cartLevel = finalLevel; break;
    case 'lift':
      next.production.lift.level = finalLevel;
      next.production.shafts.forEach((shaft) => { shaft.bufferCapacityUnits = 25 * (1 + 0.04 * finalLevel); });
      break;
    case 'yard': next.upgrades.yard = finalLevel; next.production.surface.capacityUnits = 300 * (1 + 0.04 * finalLevel); break;
    case 'habitat': next.upgrades.habitat = finalLevel; break;
    case 'shipCapacity': next.upgrades.shipCapacity = finalLevel; next.ship.capacityUnits = 150 * (1 + 0.04 * finalLevel); break;
    case 'shipSpeed': next.upgrades.shipSpeed = finalLevel; next.ship.speedPerMinute = 0.5 * (1 + 0.04 * finalLevel); break;
    case 'loading': next.upgrades.loading = finalLevel; next.ship.loadingUnitsPerMinute = 60 * (1 + 0.04 * finalLevel); break;
  }
  if (type === 'dig' || type === 'cart' || type === 'bunkhouse' || type === 'lift') rebalanceWorkers(next);
  appendLog(next, `System purchase: ${type} ×${affordableCount} for ${spend} coin.`, 'purchase');
  return validateGameState(next);
}

export function buyNextShaft(inputState) {
  const state = validateGameState(inputState);
  const number = state.production.shafts.length + 1;
  if (number > 30) fail('AT_CAP');
  const cost = state.economyProfile ? E.shaftCost(number) : roundHalfUp(120 * 2.4 ** (number - 1));
  if (!Number.isSafeInteger(cost)) fail("INSUFFICIENT_FUNDS");
  safeInt(cost, 'shaft cost');
  if (state.coins < cost) fail('INSUFFICIENT_FUNDS');
  const next = clone(state);
  changeCoin(next, -cost, 'SYSTEM_PURCHASE', `Unlocked shaft ${number}`, 'sink:SYSTEM_PURCHASE');
  next.production.shafts.push(shaftBlueprint(number, { liftLevel: next.production.lift.level, oreId: next.site.commonOreId }, 0));
  next.veins.push(...generateVeins(next.site, number, Boolean(next.economyProfile)));
  if (next.economyProfile) syncSandbox(next); else rebalanceWorkers(next);
  appendLog(next, next.economyProfile ? `Shaft ${number} opened with ten miners already at work.` : `Shaft ${number} opened. Assign workers through the hire panel.`, 'purchase');
  return validateGameState(next);
}

export const hireCost = (alreadyHired) => roundHalfUp(20 * 1.004 ** (alreadyHired - 5));
export const habitatCapacity = (level) => 10 + 2 * level;

export function hireWorkers(inputState, count = 1) {
  const state = validateGameState(inputState);
  if (state.economyProfile) fail("NO_WORKER_CAPACITY", "Every shaft already includes ten miners.");
  const requested = count === 'max' ? MAX_COIN : safeInt(count, 'worker count');
  const workerCapacity = habitatCapacity(state.upgrades.habitat);
  const poolSpace = workerCapacity - state.workersHired;
  const shaftSpace = state.production.shafts.reduce((sum, shaft) => sum + 10 + 5 * shaft.bunkhouseLevel - shaft.workersAssigned, 0);
  const room = Math.min(requested, poolSpace, shaftSpace);
  let hireCount = 0;
  let spend = 0;
  while (hireCount < room) {
    const price = hireCost(state.workersHired + hireCount);
    if (spend + price > state.coins) break;
    spend += price;
    hireCount += 1;
  }
  if (hireCount < 1) fail(room < 1 ? 'NO_WORKER_CAPACITY' : 'INSUFFICIENT_FUNDS');
  const next = clone(state);
  changeCoin(next, -spend, 'SYSTEM_PURCHASE', `Hired ${hireCount} miner${hireCount === 1 ? '' : 's'}`, 'sink:SYSTEM_PURCHASE');
  next.workersHired += hireCount;
  rebalanceWorkers(next);
  appendLog(next, `${hireCount} miner${hireCount === 1 ? '' : 's'} hired and assigned by visible expected ore value.`, 'purchase');
  return validateGameState(next);
}

export function selectDestination(inputState, destinationId) {
  const state = validateGameState(inputState);
  destinationFor(destinationId);
  const next = clone(state);
  next.selectedDestinationId = destinationId;
  if (!next.economyProfile) rebalanceWorkers(next);
  return next;
}

export function setAutoLaunch(inputState, value) {
  if (typeof value !== 'boolean') fail('INVALID_COMMAND');
  const next = clone(validateGameState(inputState));
  next.autoLaunch = value;
  return next;
}

/** "Launch now": take off with whatever the hold and the yard can supply right now, without waiting for a full load. */
export function dispatchNow(inputState) {
  const state = validateGameState(inputState);
  if (state.ship.readyAtSecond > state.simSeconds) fail('SHIP_BUSY');
  const rushed = rushLoad(state);
  if (rushed.state.ship.cargoUnits < 1e-9) fail('NOT_ENOUGH_STOCK');
  const extra = state.economyProfile ? 0 : Math.ceil(rushed.loaded / rushed.state.ship.loadingUnitsPerMinute * 60);
  const result = computeDispatch(rushed.state, rushed.state.selectedDestinationId, extra);
  if (!result.result) fail(result.reason === 'balance-limit' ? 'BALANCE_LIMIT' : 'NOT_ENOUGH_STOCK');
  return validateGameState(result.state);
}

export function grantDevCoins(inputState, amount = 10000) {
  safeInt(amount, 'test grant');
  if (amount < 1) fail('INVALID_AMOUNT');
  const next = clone(validateGameState(inputState));
  changeCoin(next, amount, 'DEV_TEST_GRANT', 'Local developer test grant', 'source:DEV_TEST_GRANT');
  appendLog(next, `${amount} local test coins added by developer tools.`, 'grant');
  return validateGameState(next);
}

/** a shaft's output with a chosen crew size (default: the crew it has now) */
export function shaftRateFor(state, shaftNumber, workers) {
  const shaft = findShaft(state, shaftNumber);
  return shaftRatePerMinute({ ...shaft, workersAssigned: workers ?? shaft.workersAssigned });
}

export function currentRates(state) {
  return state.production.shafts.map((shaft) => ({
    shaftNumber: shaft.shaftNumber,
    ore: ore(shaft.oreId),
    ratePerMinute: shaftRatePerMinute(shaft),
    bufferPercent: shaft.bufferCapacityUnits ? shaft.bufferUnits / shaft.bufferCapacityUnits : 0,
    workers: shaft.workersAssigned,
  }));
}

export function currentLiftRate(state) {
  return liftRatePerMinute({ ...state.production.lift, liftLevel: state.production.lift.level });
}

export function upgradeCost(state, type, shaftNumber = 1) {
  const schedule = costSchedule(type, state, shaftNumber);
  const cost = schedule.id ? E.lineCost(schedule.id, schedule.level) : costAt(schedule.base, schedule.growth, schedule.level);
  return schedule.level >= schedule.cap || !Number.isSafeInteger(cost) ? null : cost;
}

export function expectedUnitValue(state, oreId) {
  const d = destinationFor(state.selectedDestinationId);
  return state.economyProfile ? roundHalfUp(E.DESTINATIONS[DESTINATIONS.indexOf(d)].basePrice * ore(oreId).value) : priceFor(d, oreId);
}

export function shipmentRows(state) {
  return state.shipments.slice().reverse().map((shipment) => ({ ...shipment, status: state.shipmentStatusById[shipment.id] }));
}

export function validateGameState(input) {
  if (!input || typeof input !== 'object' || input.schemaVersion !== SAVE_VERSION) fail('INVALID_SAVE');
  input = { ...input };
  if (input.economyProfile && !input.remote) {
    input.industry = input.industry ?? createIndustry(input.site?.seed ?? 'sandbox', input.simSeconds);
    input.frontier = input.frontier ?? createFrontier(input.site?.seed ?? 'sandbox', input.simSeconds);
    validateIndustry(input.industry); validateFrontier(input.frontier);
    if (input.industry.elapsedSeconds !== input.simSeconds || input.frontier.simSeconds !== input.simSeconds) fail('INVALID_SAVE', 'World clocks disagree');
    safeInt(input.coins + (input.industry.refinery?.budget ?? 0), 'total owned coin');
  }
  safeInt(input.simSeconds, 'simSeconds');
  safeInt(input.coins, 'wallet');
  safeInt(input.sourceGrants, 'source grants');
  safeInt(input.totalExternalEarnings, 'earnings');
  safeInt(input.workersHired, 'workersHired');
  if (!Array.isArray(input.shipments) || !Array.isArray(input.ledger) || !Array.isArray(input.log) || !Array.isArray(input.production?.shafts)) fail('INVALID_SAVE');
  if (!input.upgrades || typeof input.upgrades !== 'object' || !input.shipmentStatusById || typeof input.shipmentStatusById !== 'object') fail('INVALID_SAVE');
  for (const key of ['habitat', 'yard', 'shipCapacity', 'shipSpeed', 'loading']) safeInt(input.upgrades[key], `upgrade ${key}`);
  if ((!input.economyProfile && Object.keys(input.upgrades).length !== 5) || input.upgrades.habitat > 1000 || Object.values(input.upgrades).some((value) => value > 1000) || typeof input.autoLaunch !== 'boolean') fail('INVALID_SAVE');
  if (input.economyProfile) {
    if (input.remote || input.economyProfile !== 'sandbox-rebuild-v1') fail('INVALID_SAVE');
    for (const value of [input.upgrades.pick, input.upgrades.hauler, input.production.lift.level]) if (!Number.isSafeInteger(value) || value < 0 || value > E.LEVEL_CAP) fail('INVALID_SAVE');
  }
  destinationFor(input.selectedDestinationId);
  const production = createProductionState(input.production);
  if (production.shafts.some((shaft, index) => shaft.shaftNumber !== index + 1 || !ore(shaft.oreId))) fail('INVALID_SAVE', 'Shaft order or ore is invalid');
  if ((input.remote ? production.shafts.reduce((sum, shaft) => sum + shaft.workersAssigned, 0) > input.workersHired : production.shafts.reduce((sum, shaft) => sum + shaft.workersAssigned, 0) !== input.workersHired) || (!input.economyProfile && input.workersHired > habitatCapacity(input.upgrades.habitat))) fail('INVALID_SAVE', 'Worker assignments do not match the crew pool');
  if (production.syntheticDownstreamDrain.unitsPerSecond !== 0 || production.syntheticDownstreamDrain.drainedByOre.length !== 0) fail('INVALID_SAVE', 'Synthetic drain must remain disabled in the playtest');
  if (!input.ship || number(input.ship.capacityUnits, 'ship capacity', Number.MIN_VALUE) <= 0 || number(input.ship.speedPerMinute, 'ship speed', Number.MIN_VALUE) <= 0 || number(input.ship.loadingUnitsPerMinute, 'loading rate', Number.MIN_VALUE) <= 0) fail('INVALID_SAVE');
  safeInt(input.ship.readyAtSecond, 'ship ready time');
  number(input.ship.cargoUnits, 'ship cargo');
  if (typeof input.ship.loading !== 'boolean' || input.ship.cargoUnits > input.ship.capacityUnits || (input.ship.cargoUnits > 0 && !ore(input.ship.cargoOreId)) || (input.ship.cargoUnits === 0 && input.ship.cargoOreId !== null)) fail('INVALID_SAVE');
  if (!Number.isSafeInteger(input.nextRecordId) || input.nextRecordId < 1) fail('INVALID_SAVE');
  if (input.historyArchive) {
    if (!input.economyProfile || !input.historyArchive.shipments || !input.historyArchive.ledger) fail('INVALID_SAVE');
    const { shipments, ledger } = input.historyArchive;
    for (const value of [shipments.count, shipments.payment, ledger.count, ...Object.values(ledger.amountsByType)]) safeInt(value, 'archive total');
    if (!Number.isSafeInteger(ledger.ownerDelta) || !Number.isSafeInteger(ledger.externalDelta) || ledger.ownerDelta + ledger.externalDelta + (ledger.escrowDelta ?? 0) !== 0 || !Array.isArray(shipments.unitsByOre)) fail('INVALID_SAVE');
    for (const row of shipments.unitsByOre) { if (!ore(row.oreId)) fail('INVALID_SAVE'); number(row.units, 'archived ore'); }
  }
  const shipmentIds = new Set();
  for (const shipment of input.shipments) {
    if (!shipment || typeof shipment.id !== 'string' || shipmentIds.has(shipment.id) || !ore(shipment.oreId) || !(input.remote && input.online?.offers?.some(row => row.id === shipment.destinationId) || destinationFor(shipment.destinationId)) || typeof shipment.state !== 'string') fail('INVALID_SAVE');
    shipmentIds.add(shipment.id);
    safeInt(shipment.payment, 'shipment payment');
    number(shipment.units, 'shipment units', Number.MIN_VALUE);
    if (!input.shipmentStatusById || !['IN_TRANSIT', 'DELIVERED'].includes(input.shipmentStatusById[shipment.id])) fail('INVALID_SAVE');
    for (const time of [shipment.departureAtSecond, shipment.arrivalAtSecond, shipment.shipReadyAtSecond, shipment.tripSeconds]) safeInt(time, 'shipment time');
  }
  if (Object.keys(input.shipmentStatusById).length !== shipmentIds.size || Object.keys(input.shipmentStatusById).some((id) => !shipmentIds.has(id))) fail('INVALID_SAVE');
  if (input.ledger.some((entry) => !entry || typeof entry.description !== 'string' || typeof entry.externalAccount !== 'string' || !Number.isSafeInteger(entry.atSecond) || entry.atSecond < 0 || entry.atSecond > input.simSeconds || !Number.isSafeInteger(entry.amount) || entry.amount < 0 || !Number.isSafeInteger(entry.ownerDelta) || !Number.isSafeInteger(entry.externalDelta))) fail('INVALID_SAVE');
  if (input.log.some((entry) => !entry || typeof entry.message !== 'string' || !Number.isSafeInteger(entry.atSecond) || entry.atSecond < 0 || entry.atSecond > input.simSeconds)) fail('INVALID_SAVE');
  const site = input.site ?? makeSite();
  if (typeof site.commonOreId !== 'string' || !COMMON_ORES.includes(site.commonOreId) || !Array.isArray(site.rareOreIds) || site.rareOreIds.some((id) => !RARE_ORES.includes(id))) fail('INVALID_SAVE', 'Site is malformed');
  const veins = input.veins ?? production.shafts.flatMap((shaft) => generateVeins(site, shaft.shaftNumber, Boolean(input.economyProfile)));
  if (!Array.isArray(veins) || veins.some((vein) => !vein || !ore(vein.oreId) || HARDNESS[vein.oreId] < 5 || !Number.isFinite(vein.sizeUnits) || !Number.isFinite(vein.remainingUnits) || vein.remainingUnits < 0 || vein.remainingUnits > vein.sizeUnits + 1e-9 || !production.shafts.some((shaft) => shaft.shaftNumber === vein.shaftNumber))) fail('INVALID_SAVE', 'Veins are malformed');
  const shaftMined = input.shaftMined ?? {};
  if (typeof shaftMined !== 'object' || Object.values(shaftMined).some((value) => !Number.isFinite(value) || value < 0)) fail('INVALID_SAVE', 'Mined totals are malformed');
  return { ...input, production, site, veins, shaftMined };
}

export function coinRatePerMinute(state) {
  const producing = currentRates(state).reduce((sum, row) => sum + row.ratePerMinute, 0);
  if (state.economyProfile) { const destination = destinationsFor(state).find(d => d.id === state.selectedDestinationId); return Math.min(producing, currentLiftRate(state), state.ship.capacityUnits / E.tripSeconds(destination, state.ship.speedPerMinute) * 60) * expectedUnitValue(state, state.site.commonOreId); }
  const destination = destinationFor(state.selectedDestinationId);
  return producing * priceFor(destination, ORES[0].id);
}

// Sandbox coefficients are encoded in the existing conserved production state. Remote states never use this profile.
const sandboxLine = (type) => ({ dig: 'pick', pick: 'pick', lift: 'lift', hauler: 'hauler', shipCapacity: 'hauler', shipSpeed: 'hauler', loading: 'hauler' })[type];
const sandboxLevel = (state, id) => id === 'lift' ? state.production.lift.level : state.upgrades[id];
function syncSandbox(state) {
  const pick = state.upgrades.pick; const haul = state.upgrades.hauler; const lift = state.production.lift.level;
  state.production.lift = { level: lift, baseRatePerMinute: E.TUNE.lift, curve: 'exponential', growth: E.TUNE.growth };
  for (const shaft of state.production.shafts) {
    shaft.digLevel = pick; shaft.workersAssigned = E.MINERS_PER_SHAFT; shaft.cartLevel = 10; shaft.bunkhouseLevel = 0;
    shaft.depthGrowth = E.TUNE.depth; shaft.baseRatePerWorkerPerMinute = E.pickRatePerMiner(pick) / (1 + .04 * pick);
    shaft.bufferCapacityUnits = Math.max(shaft.bufferUnits, E.shaftBuffer(lift));
  }
  state.workersHired = state.production.shafts.length * E.MINERS_PER_SHAFT;
  state.production.surface.capacityUnits = Math.max(state.production.surface.unitsByOre.reduce((sum, r) => sum + r.units, 0), E.yardCapacity(lift, haul));
  state.ship.capacityUnits = E.haulerCapacity(haul); state.ship.speedPerMinute = E.haulerSpeed(haul); state.ship.loadingUnitsPerMinute = state.ship.capacityUnits * 60;
  state.upgrades.shipCapacity = haul; state.upgrades.shipSpeed = haul; state.upgrades.loading = haul;
}

export const nextShaftCost = (state) => {
  if (state.production.shafts.length >= E.MAX_SHAFTS) return null;
  const cost = state.economyProfile ? E.shaftCost(state.production.shafts.length + 1) : roundHalfUp(120 * 2.4 ** state.production.shafts.length);
  return Number.isSafeInteger(cost) ? cost : null;
};
export const destinationsFor = (state) => state.economyProfile ? DESTINATIONS.map((d, i) => ({ ...d, ...E.DESTINATIONS[i], id: d.id, unloadUnitsPerMinute: d.unloadUnitsPerMinute })) : DESTINATIONS;

// Keep recent local detail and aggregate every retired record explicitly. Paid shipments still in transit are never retired.
function compactHistory(state) {
  if (state.shipments.length <= 32 && state.ledger.length <= 64) return;
  const archive = state.historyArchive ??= { shipments: { count: 0, payment: 0, unitsByOre: [] }, ledger: { count: 0, ownerDelta: 0, externalDelta: 0, escrowDelta: 0, amountsByType: {} } };
  while (state.shipments.length > 32 && state.shipmentStatusById[state.shipments[0].id] === 'DELIVERED') {
    const row = state.shipments.shift();
    const totals = archive.shipments; totals.count += 1; totals.payment = addSafe(totals.payment, row.payment, 'archived payments');
    const item = totals.unitsByOre.find(r => r.oreId === row.oreId);
    if (item) item.units += row.units; else totals.unitsByOre.push({oreId:row.oreId, units:row.units});
    totals.lastId = row.id; totals.lastAtSecond = row.departureAtSecond;
    delete state.shipmentStatusById[row.id];
  }
  while (state.ledger.length > 64) {
    const row = state.ledger.shift(); const totals = archive.ledger; totals.count += 1;
    totals.ownerDelta += row.ownerDelta; totals.externalDelta += row.externalDelta; totals.escrowDelta = (totals.escrowDelta ?? 0) + (row.escrowDelta ?? 0);
    totals.amountsByType[row.type] = addSafe(totals.amountsByType[row.type] ?? 0, row.amount, 'archived ledger amount');
    totals.lastId = row.id; totals.lastAtSecond = row.atSecond;
  }
}


/** Local facilities use the same conserved yard and checked ledger as the mine. */
export function industryCommand(inputState, action) {
  const state = validateGameState(inputState);
  if (!state.economyProfile || state.remote) fail('UNAVAILABLE', 'Industry is available in the new local sandbox.');
  const next = clone(state);
  const result = applyIndustryAction(next.industry, action, {
    coins: next.coins, simSeconds: next.simSeconds,
    availableRawByOre: Object.fromEntries(next.production.surface.unitsByOre.map(row => [row.oreId, row.units])),
  });
  next.industry = result.industry;
  if (result.rawWithdrawal) next.production = withdrawSurfaceUnits(next.production, result.rawWithdrawal.oreId, result.rawWithdrawal.units);
  if (result.coinDelta) {
    const escrow = result.ledgerType === 'ESCROW_FUND' || result.ledgerType === 'ESCROW_RELEASE';
    changeCoin(next, result.coinDelta, result.ledgerType, result.description, escrow ? 'owner:refinery:escrow' : result.coinDelta > 0 ? 'source:INDUSTRY' : 'sink:SYSTEM_PURCHASE', escrow ? -result.coinDelta : 0);
    if (!escrow && result.coinDelta > 0) next.totalExternalEarnings = addSafe(next.totalExternalEarnings, result.coinDelta, 'external earnings');
  }
  appendLog(next, result.description, 'industry');
  return validateGameState(next);
}

export function frontierCommand(inputState, action) {
  const next = clone(validateGameState(inputState));
  if (!next.economyProfile || next.remote) fail('UNAVAILABLE');
  const result = applyFrontierAction(next.frontier, action, { coins: next.coins, simSeconds: next.simSeconds });
  if (result.type === 'rejected') fail('INVALID_COMMAND', result.description);
  next.frontier = result.frontier;
  changeCoin(next, result.coinDelta, 'SYSTEM_PURCHASE', result.description, 'sink:SYSTEM_PURCHASE');
  appendLog(next, result.description, 'frontier');
  return validateGameState(next);
}
