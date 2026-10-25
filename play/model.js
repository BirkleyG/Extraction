import { createProductionState, liftRatePerMinute, shaftRatePerMinute, tickProductionSecond, withdrawSurfaceUnits } from '../backend/src/production.js';
import { tierOf } from './upgrades.js';

export const SAVE_KEY = 'extraction_playtest_v1';
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
  Object.freeze({ id: 'frontier-refinery', name: 'Frontier Refinery', detail: 'Near · steady bid', distance: 1, basePrice: 500, unloadUnitsPerMinute: 30, budget: 1_000_000_000, capacity: 1_000_000, accent: '#e7a15a' }),
  Object.freeze({ id: 'cinder-buyer', name: 'Cinder Bay Buyer', detail: 'Far · premium bid', distance: 3, basePrice: 800, unloadUnitsPerMinute: 18, budget: 250_000_000, capacity: 250_000, accent: '#66bfd0' }),
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
const TOOL_HARDNESS = [2, 4, 6, 8, 10];
export const toolHardness = (digLevel) => TOOL_HARDNESS[tierOf('dig', digLevel).i];
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
  if (rareOreIds.length < 2) rareOreIds = RARE_ORES.filter((_, index) => index % 2 === Math.floor(R() * 2));
  return { seed, regionId, commonOreId, rareOreIds, mythic: Boolean(tough) && R() < 0.7 };
}

export function generateVeins(site, shaftNumber) {
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
    const sizeUnits = Math.round(richness * (mythic ? VEIN_SIZE.mythic : VEIN_SIZE.rare) * (1 + 0.15 * (shaftNumber - 1)));
    veins.push({ id: `v${shaftNumber}-${k}`, shaftNumber, oreId, at: Math.round(150 + R() * 170 + k * 25), sizeUnits, remainingUnits: sizeUnits, seen: false, warned: false });
  }
  return veins.sort((a, b) => a.at - b.at);
}

const shaftByNumber = (state, number) => state.production.shafts.find((shaft) => shaft.shaftNumber === number);
export function veinStatus(state, vein) {
  if (vein.remainingUnits <= 1e-9) return 'empty';
  if (faceDistance(state.shaftMined?.[vein.shaftNumber] ?? 0) < vein.at) return 'ahead';
  const shaft = shaftByNumber(state, vein.shaftNumber);
  return !shaft || HARDNESS[vein.oreId] > toolHardness(shaft.digLevel) ? 'blocked' : 'mining';
}
function miningVein(state, shaftNumber) { return (state.veins || []).find((vein) => vein.shaftNumber === shaftNumber && veinStatus(state, vein) === 'mining'); }

function addSurfaceUnits(production, oreId, units) {
  const row = production.surface.unitsByOre.find((item) => item.oreId === oreId);
  if (row) row.units += units; else production.surface.unitsByOre.push({ oreId, units });
}

/** one second of digging with vein bookkeeping wrapped around the shared flow tick */
function mineOneSecond(next) {
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
  switch (type) {
    case 'dig': return { level: findShaft(state, shaftNumber).digLevel, cap: 1000, base: 15, growth: 1.021 };
    case 'lift': return { level: state.production.lift.level, cap: 1000, base: 25, growth: 1.0205 };
    case 'bunkhouse': return { level: findShaft(state, shaftNumber).bunkhouseLevel, cap: 10, base: 100, growth: 1.8 };
    case 'cart': return { level: findShaft(state, shaftNumber).cartLevel, cap: 10, base: 400, growth: 1.8 };
    case 'yard': return { level: state.upgrades.yard, cap: 1000, base: 50, growth: 1.0195 };
    case 'habitat': return { level: state.upgrades.habitat, cap: 10, base: 300, growth: 1.8 };
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

function addLedger(state, type, amount, description, externalAccount) {
  safeInt(amount, 'ledger amount');
  const id = `local-${String(state.nextRecordId).padStart(8, '0')}`;
  state.nextRecordId += 1;
  const entry = Object.freeze({
    id,
    atSecond: state.simSeconds,
    type,
    amount,
    ownerDelta: type === 'NPC_RAW_PURCHASE' ? amount : type === 'START_GRANT' || type === 'DEV_TEST_GRANT' ? amount : -amount,
    externalDelta: type === 'NPC_RAW_PURCHASE' ? -amount : type === 'START_GRANT' || type === 'DEV_TEST_GRANT' ? -amount : amount,
    externalAccount,
    description,
  });
  state.ledger.push(entry);
}

function changeCoin(state, delta, type, description, externalAccount) {
  const next = safeInt(state.coins + delta, 'wallet');
  if (delta < 0 && next > state.coins) fail('OVERFLOW');
  state.coins = next;
  addLedger(state, type, Math.abs(delta), description, externalAccount);
}

export function createGameState(siteOptions) {
  const site = makeSite(siteOptions);
  const buyers = DESTINATIONS.map((destination) => ({
    id: destination.id,
    funds: destination.budget,
    capacityUnits: destination.capacity,
    inventoryUnits: 0,
    reservedUnits: 0,
  }));
  const state = {
    schemaVersion: SAVE_VERSION,
    simSeconds: 0,
    coins: 0,
    sourceGrants: 500,
    totalExternalEarnings: 0,
    workersHired: 5,
    upgrades: { habitat: 0, yard: 0, shipCapacity: 0, shipSpeed: 0, loading: 0 },
    production: newProductionState([shaftBlueprint(1, { oreId: site.commonOreId }, 5)], { level: 1, baseRatePerMinute: 2, curve: 'exponential', growth: BASE_LIFT_GROWTH }, { capacityUnits: 100, unitsByOre: [] }),
    ship: { capacityUnits: 150, speedPerMinute: 0.5, loadingUnitsPerMinute: 60, readyAtSecond: 0, loading: false, cargoOreId: null, cargoUnits: 0 },
    site,
    veins: generateVeins(site, 1),
    shaftMined: {},
    buyers,
    selectedDestinationId: DESTINATIONS[0].id,
    autoLaunch: true,
    shipments: [],
    shipmentStatusById: {},
    ledger: [],
    nextRecordId: 1,
    log: [],
    notice: 'The mine is live. Tune the dig, then watch the first partial cargo launch.',
  };
  changeCoin(state, 500, 'START_GRANT', 'Local testbed source grant', 'source:START_GRANT');
  return state;
}

function findShaft(state, shaftNumber) {
  const shaft = state.production.shafts.find((item) => item.shaftNumber === shaftNumber);
  if (!shaft) fail('UNKNOWN_SHAFT');
  return shaft;
}

function buyerFor(state, destinationId = state.selectedDestinationId) {
  const buyer = state.buyers.find((item) => item.id === destinationId);
  if (!buyer) fail('UNKNOWN_DESTINATION');
  return buyer;
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
  return state.production.surface.unitsByOre.filter((row) => row.units > 0).sort((a, b) => {
    const valueOrder = priceFor(destinationFor(destinationId), b.oreId) - priceFor(destinationFor(destinationId), a.oreId);
    return valueOrder || (a.oreId < b.oreId ? -1 : a.oreId > b.oreId ? 1 : 0);
  })[0]?.oreId ?? null;
}

function computeDispatch(state, destinationId, allowPartial = false) {
  const destination = destinationFor(destinationId);
  const buyer = buyerFor(state, destinationId);
  if (state.ship.readyAtSecond > state.simSeconds) return { state, result: null, reason: 'ship-busy' };
  const capacityFree = buyer.capacityUnits - buyer.inventoryUnits - buyer.reservedUnits;
  const cargoOreId = state.ship.cargoOreId;
  const yardUnits = state.ship.cargoUnits;
  if (!cargoOreId || yardUnits < (allowPartial ? 0.001 : 1)) return { state, result: null, reason: 'not-enough-loaded-cargo' };
  const price = priceFor(destination, cargoOreId);
  const fullPayment = roundHalfUp(yardUnits * price);
  const canSellAll = yardUnits <= capacityFree && Number.isSafeInteger(fullPayment) && fullPayment > 0 && fullPayment <= buyer.funds;
  let units = canSellAll
    ? yardUnits
    : Math.min(state.ship.capacityUnits, yardUnits, capacityFree, buyer.funds / price);
  let payment = roundHalfUp(units * price);
  if (payment > buyer.funds) {
    units = Math.max(0, units - Number.EPSILON * Math.max(1, units) * 4);
    payment = roundHalfUp(units * price);
  }
  if (units < (allowPartial ? 0.001 : 1)) return { state, result: null, reason: capacityFree < (allowPartial ? 0.001 : 1) ? 'buyer-full' : buyer.funds < price ? 'buyer-out-of-funds' : 'not-enough-stock' };
  if (!Number.isSafeInteger(payment) || payment <= 0 || payment > buyer.funds) fail('INVALID_PAYMENT');
  const next = clone(state);
  const nextBuyer = buyerFor(next, destinationId);

  nextBuyer.funds -= payment;
  nextBuyer.reservedUnits += units;
  changeCoin(next, payment, 'NPC_RAW_PURCHASE', `${destination.name} paid at departure`, `source:NPC:${destinationId}`);
  next.totalExternalEarnings = addSafe(next.totalExternalEarnings, payment, 'external earnings');
  const now = next.simSeconds;
  const travelOneWaySeconds = destination.distance / next.ship.speedPerMinute * 60;
  const unloadSeconds = units / destination.unloadUnitsPerMinute * 60;
  const arrivalAtSecond = now + Math.ceil(travelOneWaySeconds + unloadSeconds);
  const tripSeconds = Math.ceil(2 * travelOneWaySeconds + unloadSeconds);
  next.ship.readyAtSecond = now + tripSeconds;
  next.ship.cargoUnits = Math.max(0, next.ship.cargoUnits - units);
  if (next.ship.cargoUnits < 1e-9) { next.ship.cargoUnits = 0; next.ship.cargoOreId = null; }
  next.ship.loading = false;
  const shipmentId = `shipment-${String(next.nextRecordId).padStart(8, '0')}`;
  const shipment = Object.freeze({
    id: shipmentId,
    oreId: cargoOreId,
    units,
    unitPrice: price,
    payment,
    destinationId,
    departureAtSecond: now,
    arrivalAtSecond,
    shipReadyAtSecond: next.ship.readyAtSecond,
    tripSeconds,
    state: 'PAID_AT_DEPARTURE',
  });
  next.shipments.push(shipment);
  next.shipmentStatusById[shipmentId] = 'IN_TRANSIT';
  appendLog(next, `${units.toFixed(3)} ${ore(cargoOreId).name} departed to ${destination.name}; ${payment} coin paid at takeoff.`, 'sale');
  return { state: next, result: shipment, reason: 'launched' };
}

function loadOneSecond(state) {
  if (state.ship.readyAtSecond > state.simSeconds || !state.ship.loading) return state;
  const next = clone(state);
  const cargoOreId = next.ship.cargoOreId ?? preferredCargoOre(next, next.selectedDestinationId);
  if (!cargoOreId) return next;
  const available = availableSurface(next, cargoOreId);
  const room = Math.max(0, next.ship.capacityUnits - next.ship.cargoUnits);
  const amount = Math.min(available, room, next.ship.loadingUnitsPerMinute / 60);
  if (amount <= 0) return next;
  next.production = withdrawSurfaceUnits(next.production, cargoOreId, amount);
  next.ship.cargoOreId = cargoOreId;
  next.ship.cargoUnits += amount;
  return next;
}

function hasFutureOreForStandardLoad(state, cargoOreId) {
  const currentStock = availableSurface(state, cargoOreId);
  if (currentStock + state.ship.cargoUnits >= 1) return true;
  const surfaceTotalUnits = state.production.surface.unitsByOre.reduce((sum, row) => sum + row.units, 0);
  const surfaceHasRoom = state.production.surface.capacityUnits - surfaceTotalUnits > 1e-9;
  if (!surfaceHasRoom) return false;
  return state.production.shafts.some((shaft) => shaft.oreId === cargoOreId && (shaft.bufferUnits > 0 || shaftRatePerMinute(shaft) > 0));
}

function launchIfReady(state) {
  if (state.ship.readyAtSecond > state.simSeconds) return state;
  const next = clone(state);
  if (next.autoLaunch && next.ship.cargoUnits < 1 && !next.ship.loading && preferredCargoOre(next, next.selectedDestinationId)) next.ship.loading = true;
  let loaded = loadOneSecond(next);
  if (loaded.autoLaunch && loaded.ship.cargoUnits > 0) {
    const allowPartial = loaded.ship.cargoUnits < 1 && !hasFutureOreForStandardLoad(loaded, loaded.ship.cargoOreId);
    const result = computeDispatch(loaded, loaded.selectedDestinationId, allowPartial);
    if (result.result) loaded = result.state;
  }
  return loaded;
}

function arriveShipments(state) {
  const next = clone(state);
  for (const shipment of next.shipments) {
    if (next.shipmentStatusById[shipment.id] !== 'IN_TRANSIT' || shipment.arrivalAtSecond > next.simSeconds) continue;
    const buyer = buyerFor(next, shipment.destinationId);
    buyer.reservedUnits = Math.max(0, buyer.reservedUnits - shipment.units);
    buyer.inventoryUnits += shipment.units;
    next.shipmentStatusById[shipment.id] = 'DELIVERED';
    appendLog(next, `${shipment.units.toFixed(3)} ${ore(shipment.oreId).name} delivered. No second payment was made.`, 'arrival');
  }
  return next;
}

export function stepGame(inputState) {
  const state = validateGameState(inputState);
  const next = clone(state);
  next.simSeconds += 1;
  mineOneSecond(next);
  let advanced = arriveShipments(next);
  advanced = launchIfReady(advanced);
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
    const cost = costAt(schedule.base, schedule.growth, schedule.level + index);
    if (spend + cost > state.coins) break;
    spend += cost;
    affordableCount += 1;
  }
  if (affordableCount === 0) fail('INSUFFICIENT_FUNDS');
  const next = clone(state);
  changeCoin(next, -spend, 'SYSTEM_PURCHASE', `Purchased ${type} ×${affordableCount}`, 'sink:SYSTEM_PURCHASE');
  const finalLevel = schedule.level + affordableCount;
  switch (type) {
    case 'dig': findShaft(next, shaftNumber).digLevel = finalLevel; break;
    case 'bunkhouse': findShaft(next, shaftNumber).bunkhouseLevel = finalLevel; break;
    case 'cart': findShaft(next, shaftNumber).cartLevel = finalLevel; break;
    case 'lift':
      next.production.lift.level = finalLevel;
      next.production.shafts.forEach((shaft) => { shaft.bufferCapacityUnits = 25 * (1 + 0.04 * finalLevel); });
      break;
    case 'yard': next.upgrades.yard = finalLevel; next.production.surface.capacityUnits = 100 * (1 + 0.04 * finalLevel); break;
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
  const cost = roundHalfUp(120 * 2.4 ** (number - 1));
  safeInt(cost, 'shaft cost');
  if (state.coins < cost) fail('INSUFFICIENT_FUNDS');
  const next = clone(state);
  changeCoin(next, -cost, 'SYSTEM_PURCHASE', `Unlocked shaft ${number}`, 'sink:SYSTEM_PURCHASE');
  next.production.shafts.push(shaftBlueprint(number, { liftLevel: next.production.lift.level, oreId: next.site.commonOreId }, 0));
  next.veins.push(...generateVeins(next.site, number));
  rebalanceWorkers(next);
  appendLog(next, `Shaft ${number} opened. Assign workers through the hire panel.`, 'purchase');
  return validateGameState(next);
}

export function hireWorkers(inputState, count = 1) {
  const state = validateGameState(inputState);
  const requested = count === 'max' ? MAX_COIN : safeInt(count, 'worker count');
  const workerCapacity = 10 + 5 * state.upgrades.habitat;
  const poolSpace = workerCapacity - state.workersHired;
  const shaftSpace = state.production.shafts.reduce((sum, shaft) => sum + 10 + 5 * shaft.bunkhouseLevel - shaft.workersAssigned, 0);
  const hireCount = Math.min(requested, poolSpace, shaftSpace, Math.floor(state.coins / 20));
  if (hireCount < 1) fail(state.coins < 20 ? 'INSUFFICIENT_FUNDS' : 'NO_WORKER_CAPACITY');
  const next = clone(state);
  changeCoin(next, -hireCount * 20, 'SYSTEM_PURCHASE', `Hired ${hireCount} miner${hireCount === 1 ? '' : 's'}`, 'sink:SYSTEM_PURCHASE');
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
  rebalanceWorkers(next);
  return next;
}

export function setAutoLaunch(inputState, value) {
  if (typeof value !== 'boolean') fail('INVALID_COMMAND');
  const next = clone(validateGameState(inputState));
  next.autoLaunch = value;
  return next;
}

export function dispatchNow(inputState) {
  const state = validateGameState(inputState);
  if (state.ship.readyAtSecond > state.simSeconds) fail('SHIP_BUSY');
  if (state.ship.cargoUnits > 0) {
    const result = computeDispatch(state, state.selectedDestinationId, true);
    if (!result.result) fail(result.reason.toUpperCase().replaceAll('-', '_'));
    return validateGameState(result.state);
  }
  if (state.ship.cargoUnits < 1) {
    if (!preferredCargoOre(state, state.selectedDestinationId)) fail('NOT_ENOUGH_STOCK');
    const next = clone(state);
    next.ship.loading = true;
    appendLog(next, 'Cargo loading started. Ore remains unpaid until launch.', 'load');
    return validateGameState(next);
  }
  const result = computeDispatch(state, state.selectedDestinationId);
  if (!result.result) fail(result.reason.toUpperCase().replaceAll('-', '_'));
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
  return schedule.level >= schedule.cap ? null : costAt(schedule.base, schedule.growth, schedule.level);
}

export function expectedUnitValue(state, oreId) {
  return priceFor(destinationFor(state.selectedDestinationId), oreId);
}

export function shipmentRows(state) {
  return state.shipments.slice().reverse().map((shipment) => ({ ...shipment, status: state.shipmentStatusById[shipment.id] }));
}

export function validateGameState(input) {
  if (!input || typeof input !== 'object' || input.schemaVersion !== SAVE_VERSION) fail('INVALID_SAVE');
  safeInt(input.simSeconds, 'simSeconds');
  safeInt(input.coins, 'wallet');
  safeInt(input.sourceGrants, 'source grants');
  safeInt(input.totalExternalEarnings, 'earnings');
  safeInt(input.workersHired, 'workersHired');
  if (!Array.isArray(input.buyers) || !Array.isArray(input.shipments) || !Array.isArray(input.ledger) || !Array.isArray(input.log) || !Array.isArray(input.production?.shafts)) fail('INVALID_SAVE');
  if (!input.upgrades || typeof input.upgrades !== 'object' || !input.shipmentStatusById || typeof input.shipmentStatusById !== 'object') fail('INVALID_SAVE');
  for (const key of ['habitat', 'yard', 'shipCapacity', 'shipSpeed', 'loading']) safeInt(input.upgrades[key], `upgrade ${key}`);
  if (Object.keys(input.upgrades).length !== 5 || input.upgrades.habitat > 10 || Object.values(input.upgrades).some((value) => value > 1000) || typeof input.autoLaunch !== 'boolean') fail('INVALID_SAVE');
  destinationFor(input.selectedDestinationId);
  const production = createProductionState(input.production);
  if (production.shafts.some((shaft, index) => shaft.shaftNumber !== index + 1 || !ore(shaft.oreId))) fail('INVALID_SAVE', 'Shaft order or ore is invalid');
  if (production.shafts.reduce((sum, shaft) => sum + shaft.workersAssigned, 0) !== input.workersHired || input.workersHired > 10 + 5 * input.upgrades.habitat) fail('INVALID_SAVE', 'Worker assignments do not match the crew pool');
  if (production.syntheticDownstreamDrain.unitsPerSecond !== 0 || production.syntheticDownstreamDrain.drainedByOre.length !== 0) fail('INVALID_SAVE', 'Synthetic drain must remain disabled in the playtest');
  if (input.buyers.some((buyer) => !buyer || typeof buyer !== 'object')) fail('INVALID_SAVE', 'Buyer fixture is malformed');
  const buyerIds = input.buyers.map((buyer) => buyer.id);
  if (buyerIds.length !== DESTINATIONS.length || new Set(buyerIds).size !== buyerIds.length || DESTINATIONS.some((destination) => !buyerIds.includes(destination.id))) fail('INVALID_SAVE', 'Buyer fixture set is invalid');
  for (const buyer of input.buyers) {
    if (!buyer || !DESTINATIONS.some((destination) => destination.id === buyer.id)) fail('INVALID_SAVE');
    safeInt(buyer.funds, 'buyer funds');
    number(buyer.capacityUnits, 'buyer capacity');
    number(buyer.inventoryUnits, 'buyer inventory');
    number(buyer.reservedUnits, 'buyer reservations');
    if (buyer.inventoryUnits + buyer.reservedUnits > buyer.capacityUnits + 1e-9) fail('INVALID_SAVE');
  }
  if (!input.ship || number(input.ship.capacityUnits, 'ship capacity', Number.MIN_VALUE) <= 0 || number(input.ship.speedPerMinute, 'ship speed', Number.MIN_VALUE) <= 0 || number(input.ship.loadingUnitsPerMinute, 'loading rate', Number.MIN_VALUE) <= 0) fail('INVALID_SAVE');
  safeInt(input.ship.readyAtSecond, 'ship ready time');
  number(input.ship.cargoUnits, 'ship cargo');
  if (typeof input.ship.loading !== 'boolean' || input.ship.cargoUnits > input.ship.capacityUnits || (input.ship.cargoUnits > 0 && !ore(input.ship.cargoOreId)) || (input.ship.cargoUnits === 0 && input.ship.cargoOreId !== null)) fail('INVALID_SAVE');
  if (!Number.isSafeInteger(input.nextRecordId) || input.nextRecordId < 1) fail('INVALID_SAVE');
  const shipmentIds = new Set();
  for (const shipment of input.shipments) {
    if (!shipment || typeof shipment.id !== 'string' || shipmentIds.has(shipment.id) || !ore(shipment.oreId) || !destinationFor(shipment.destinationId) || typeof shipment.state !== 'string') fail('INVALID_SAVE');
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
  const veins = input.veins ?? production.shafts.flatMap((shaft) => generateVeins(site, shaft.shaftNumber));
  if (!Array.isArray(veins) || veins.some((vein) => !vein || !ore(vein.oreId) || HARDNESS[vein.oreId] < 5 || !Number.isFinite(vein.sizeUnits) || !Number.isFinite(vein.remainingUnits) || vein.remainingUnits < 0 || vein.remainingUnits > vein.sizeUnits + 1e-9 || !production.shafts.some((shaft) => shaft.shaftNumber === vein.shaftNumber))) fail('INVALID_SAVE', 'Veins are malformed');
  const shaftMined = input.shaftMined ?? {};
  if (typeof shaftMined !== 'object' || Object.values(shaftMined).some((value) => !Number.isFinite(value) || value < 0)) fail('INVALID_SAVE', 'Mined totals are malformed');
  return { ...input, production, site, veins, shaftMined };
}

export function coinRatePerMinute(state) {
  const producing = currentRates(state).reduce((sum, row) => sum + row.ratePerMinute, 0);
  const destination = destinationFor(state.selectedDestinationId);
  return producing * priceFor(destination, ORES[0].id);
}
