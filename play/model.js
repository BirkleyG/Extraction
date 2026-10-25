import { createProductionState, liftRatePerMinute, shaftRatePerMinute, tickProductionSecond, withdrawSurfaceUnits } from '../backend/src/production.js';
import * as E from './economy.js';

export const SAVE_KEY = 'extraction_playtest_v4';
export const SAVE_VERSION = 2;
export const { DESTINATIONS, LEVEL_CAP, MAX_SHAFTS } = E;
export const ORES = Object.freeze([
  { id: 'ferrite', name: 'Ferrite', color: '#cf8152', value: 1 },
  { id: 'cobalt', name: 'Cobalt', color: '#55a8d8', value: 1.15 },
  { id: 'lithium', name: 'Lithium', color: '#93d0ae', value: 1.05 },
  { id: 'sulfur', name: 'Sulfur', color: '#e6cd65', value: 0.9 },
  { id: 'crystal', name: 'Crystal', color: '#bb97e8', value: 1.5 },
  { id: 'iridium', name: 'Iridium', color: '#90c5ce', value: 2.3 },
  { id: 'mythic', name: 'Mythic', color: '#ee9d58', value: 4 },
]);
/** the three upgrade lines a player can buy */
export const UPGRADE_LINES = E.LINE_IDS;
/** a sandbox keeps only the most recent trips and ledger lines in the save; running totals keep the whole story */
const KEEP_SHIPMENTS = 24;
const KEEP_LEDGER = 60;

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
export const TOUGH_TERRAINS = Object.freeze(['mesa', 'volcanic', 'canyon', 'glacier', 'alpine', 'badlands', 'arches', 'monoliths', 'rifts', 'crystal', 'scrapyard']);
const TOOL_HARDNESS = [2, 4, 5, 6, 8, 10];
/** how hard a rock the pick can break, from the pick level */
export const toolHardness = (pickLevel) => TOOL_HARDNESS[E.tierIndex('pick', pickLevel)];
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
    const mythic = site.mythic && shaftNumber >= 14 && R() < 0.5;
    const oreId = mythic ? MYTHIC_ORE : site.rareOreIds[Math.floor(R() * site.rareOreIds.length)];
    if (!oreId) continue;
    const richness = 0.6 + R() * 0.9;
    const sizeUnits = E.veinSize(shaftNumber, richness, mythic);
    veins.push({ id: `v${shaftNumber}-${k}`, shaftNumber, oreId, at: Math.round(150 + R() * 170 + k * 25), sizeUnits, remainingUnits: sizeUnits, seen: false, warned: false });
  }
  return veins.sort((a, b) => a.at - b.at);
}

const shaftByNumber = (state, number) => state.production.shafts.find((shaft) => shaft.shaftNumber === number);
export function veinStatus(state, vein) {
  if (vein.remainingUnits <= 1e-9) return 'empty';
  if (faceDistance(state.shaftMined?.[vein.shaftNumber] ?? 0) < vein.at) return 'ahead';
  const shaft = shaftByNumber(state, vein.shaftNumber);
  return !shaft || HARDNESS[vein.oreId] > toolHardness(state.upgrades.pick) ? 'blocked' : 'mining';
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

/* ---------- the three lines, derived from one place so the screen, the engine and the pacing study agree ---------- */
const levelOf = (state, type) => state.upgrades[type];
export function upgradeCost(state, type) {
  if (!E.LINES[type]) fail('UNKNOWN_UPGRADE');
  const level = levelOf(state, type);
  return level >= E.LEVEL_CAP ? null : E.lineCost(type, level);
}
/** exact price of buying `count` (a number, or 'max' for as many as the coin allows) levels, plus how many that is */
export function bulkQuote(state, type, count = 1) {
  if (!E.LINES[type]) fail('UNKNOWN_UPGRADE');
  const start = levelOf(state, type);
  const wanted = count === 'max' ? E.LEVEL_CAP - start : Math.min(safeInt(count, 'purchase count'), E.LEVEL_CAP - start);
  let levels = 0; let cost = 0;
  while (levels < wanted) {
    const price = E.lineCost(type, start + levels);
    if (cost + price > state.coins || cost + price > MAX_COIN) break;
    cost += price; levels += 1;
  }
  return { levels, cost, nextPrice: start < E.LEVEL_CAP ? E.lineCost(type, start + levels) : null };
}
export const shaftPrice = (state) => (state.production.shafts.length >= E.MAX_SHAFTS ? null : E.shaftCost(state.production.shafts.length + 1));

/** push the three line levels into the shared production state (rates, buffers, yard) and the hauler */
function applyLevels(state) {
  const { pick, lift, hauler } = state.upgrades;
  const perMiner = E.pickRatePerMiner(pick);
  const buffer = E.shaftBuffer(lift);
  for (const shaft of state.production.shafts) { shaft.baseRatePerWorkerPerMinute = perMiner; shaft.bufferCapacityUnits = Math.max(shaft.bufferCapacityUnits, buffer); }
  state.production.lift.level = lift;
  state.production.surface.capacityUnits = Math.max(state.production.surface.capacityUnits, E.yardCapacity(lift, hauler));
  state.ship.capacityUnits = E.haulerCapacity(hauler);
  state.ship.speedPerMinute = E.haulerSpeed(hauler);
}

function shaftBlueprint(number, state) {
  return {
    shaftNumber: number,
    oreId: state.site.commonOreId,
    digLevel: 0, // the pick is a mine-wide line (upgrades.pick); the shared formula's own linear dig level stays at zero
    bunkhouseLevel: 0,
    workersAssigned: E.MINERS_PER_SHAFT,
    cartLevel: 10, // fixed rails: full utilization
    depthGrowth: E.TUNE.depth,
    baseRatePerWorkerPerMinute: E.pickRatePerMiner(state.upgrades.pick),
    soilModifier: 1,
    weatherModifier: 1,
    buffsMultiplier: 1,
    bufferCapacityUnits: E.shaftBuffer(state.upgrades.lift),
    bufferUnits: 0,
  };
}

function addLedger(state, type, amount, description, externalAccount) {
  safeInt(amount, 'ledger amount');
  const id = `local-${String(state.nextRecordId).padStart(8, '0')}`;
  state.nextRecordId += 1;
  const earnsOwner = type === 'NPC_RAW_PURCHASE' || type === 'START_GRANT' || type === 'DEV_TEST_GRANT';
  state.ledger.push(Object.freeze({
    id, atSecond: state.simSeconds, type, amount,
    ownerDelta: earnsOwner ? amount : -amount,
    externalDelta: earnsOwner ? -amount : amount,
    externalAccount, description,
  }));
  if (state.ledger.length > KEEP_LEDGER) state.ledger.splice(0, state.ledger.length - KEEP_LEDGER);
}

function changeCoin(state, delta, type, description, externalAccount) {
  const next = safeInt(state.coins + delta, 'wallet');
  state.coins = next;
  addLedger(state, type, Math.abs(delta), description, externalAccount);
}

export function createGameState(siteOptions) {
  const site = makeSite(siteOptions);
  const state = {
    schemaVersion: SAVE_VERSION,
    simSeconds: 0,
    coins: 0,
    sourceGrants: 0,
    totalExternalEarnings: 0,
    trips: 0,
    upgrades: { pick: 0, lift: 0, hauler: 0 },
    production: null,
    ship: { capacityUnits: E.haulerCapacity(0), speedPerMinute: E.haulerSpeed(0), readyAtSecond: 0, loading: false, cargoOreId: null, cargoUnits: 0 },
    site,
    veins: generateVeins(site, 1),
    shaftMined: {},
    selectedDestinationId: DESTINATIONS[0].id,
    autoLaunch: true,
    shipments: [],
    shipmentStatusById: {},
    ledger: [],
    nextRecordId: 1,
    log: [],
    notice: 'Your first crate of ore is already in the yard. The hauler leaves when its hold is full.',
  };
  state.production = createProductionState({
    shafts: [shaftBlueprint(1, state)],
    lift: { level: 0, baseRatePerMinute: E.TUNE.lift, curve: 'exponential', growth: E.TUNE.growth },
    surface: { capacityUnits: E.yardCapacity(0, 0), unitsByOre: [{ oreId: site.commonOreId, units: E.START_YARD_UNITS }] },
    syntheticDownstreamDrain: { unitsPerSecond: 0 },
    elapsedSeconds: 0,
  });
  return state;
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
export function priceFor(destination, oreId) {
  const item = ore(oreId);
  if (!item) fail('UNKNOWN_ORE');
  return roundHalfUp(destination.basePrice * item.value);
}
function appendLog(state, message, type = 'event') {
  state.log.push(Object.freeze({ atSecond: state.simSeconds, message, type }));
  if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
}

function availableSurface(state, oreId) {
  return state.production.surface.unitsByOre.find((row) => row.oreId === oreId)?.units ?? 0;
}
function preferredCargoOre(state, destinationId) {
  const destination = destinationFor(destinationId);
  return state.production.surface.unitsByOre.filter((row) => row.units > 0).sort((a, b) => {
    const valueOrder = priceFor(destination, b.oreId) - priceFor(destination, a.oreId);
    return valueOrder || (a.oreId < b.oreId ? -1 : a.oreId > b.oreId ? 1 : 0);
  })[0]?.oreId ?? null;
}

/** seconds for one round trip to a buyer at the hauler's current speed */
export const tripSecondsTo = (state, destinationId) => E.tripSeconds(destinationFor(destinationId), state.ship.speedPerMinute);

/** Pay the cargo aboard at takeoff. Computer-run buyers never run out of coin or room, so the only limits are the ship and the ore. */
function computeDispatch(state, destinationId) {
  const destination = destinationFor(destinationId);
  if (state.ship.readyAtSecond > state.simSeconds) return { state, result: null, reason: 'ship-busy' };
  const cargoOreId = state.ship.cargoOreId;
  const units = state.ship.cargoUnits;
  if (!cargoOreId || units < 1e-9) return { state, result: null, reason: 'no-cargo' };
  const price = priceFor(destination, cargoOreId);
  let payment = roundHalfUp(units * price);
  if (!Number.isSafeInteger(payment) || payment < 1) return { state, result: null, reason: 'no-cargo' };
  const next = clone(state);
  // the ledger is exact whole coin: the vault tops out at the largest safe integer rather than losing the sale
  const room = MAX_COIN - next.coins;
  const vaultFull = payment > room;
  if (vaultFull) payment = room;
  if (payment > 0) {
    changeCoin(next, payment, 'NPC_RAW_PURCHASE', `${destination.name} paid at departure`, `source:NPC:${destinationId}`);
    next.totalExternalEarnings = Math.min(MAX_COIN, next.totalExternalEarnings + payment);
  }
  const now = next.simSeconds;
  const tripSeconds = E.tripSeconds(destination, next.ship.speedPerMinute);
  const arrivalAtSecond = now + Math.ceil(tripSeconds / 2);
  next.ship.readyAtSecond = now + tripSeconds;
  next.ship.cargoUnits = 0;
  next.ship.cargoOreId = null;
  next.ship.loading = false;
  next.trips += 1;
  const shipmentId = `shipment-${String(next.nextRecordId).padStart(8, '0')}`;
  next.nextRecordId += 1;
  const shipment = Object.freeze({
    id: shipmentId, oreId: cargoOreId, units, unitPrice: price, payment, destinationId,
    departureAtSecond: now, arrivalAtSecond, shipReadyAtSecond: next.ship.readyAtSecond, tripSeconds, state: 'PAID_AT_DEPARTURE',
  });
  next.shipments.push(shipment);
  next.shipmentStatusById[shipmentId] = 'IN_TRANSIT';
  while (next.shipments.length > KEEP_SHIPMENTS) delete next.shipmentStatusById[next.shipments.shift().id];
  if (vaultFull) appendLog(next, 'The vault is full: coin cannot go any higher in this sandbox.', 'sale');
  else if (units >= 1 && (next.trips <= 3 || next.trips % 25 === 0 || units * price >= 1000)) appendLog(next, `${fmtUnits(units)} ${ore(cargoOreId).name} took off for ${destination.name}; ${payment} coin paid at takeoff.`, 'sale');
  return { state: next, result: shipment, reason: 'launched' };
}
function fmtUnits(value) { return value >= 1e6 ? value.toExponential(2) : value >= 100 ? String(Math.round(value)) : value.toFixed(1); }

/** The pad loads at once: whatever the yard has of the cargo ore goes into the hold, up to the hold's size. */
function loadHold(state) {
  if (state.ship.readyAtSecond > state.simSeconds) return state;
  const next = clone(state);
  const cargoOreId = next.ship.cargoOreId ?? preferredCargoOre(next, next.selectedDestinationId);
  const room = Math.max(0, next.ship.capacityUnits - next.ship.cargoUnits);
  const amount = cargoOreId ? Math.min(availableSurface(next, cargoOreId), room) : 0;
  next.ship.loading = amount > 1e-9;
  if (amount <= 1e-9) return next;
  next.production = withdrawSurfaceUnits(next.production, cargoOreId, amount);
  next.ship.cargoOreId = cargoOreId;
  next.ship.cargoUnits += amount;
  return next;
}

/** The cargo ore has stopped arriving (vein dry, shaft idle) so waiting for a full hold would wait forever. */
function cargoStranded(state) {
  const id = state.ship.cargoOreId;
  if (!id || state.ship.cargoUnits < 1e-9 || availableSurface(state, id) >= 1e-9) return false;
  return !state.production.shafts.some((shaft) => shaft.workersAssigned > 0 && ((miningVein(state, shaft.shaftNumber)?.oreId ?? state.site.commonOreId) === id || shaft.bufferUnits > 1e-9 && shaft.oreId === id));
}

/** Auto mode: take off the moment the hold is full (or the ore can no longer arrive). */
function launchIfReady(state) {
  if (state.ship.readyAtSecond > state.simSeconds) return state;
  let loaded = loadHold(state);
  const full = loaded.ship.cargoUnits >= loaded.ship.capacityUnits - 1e-9;
  if (loaded.autoLaunch && loaded.ship.cargoUnits > 0 && (full || cargoStranded(loaded))) {
    const result = computeDispatch(loaded, loaded.selectedDestinationId);
    if (result.result) loaded = result.state;
  }
  return loaded;
}

function arriveShipments(state) {
  if (!state.shipments.some((shipment) => state.shipmentStatusById[shipment.id] === 'IN_TRANSIT' && shipment.arrivalAtSecond <= state.simSeconds)) return state;
  const next = clone(state);
  for (const shipment of next.shipments) {
    if (next.shipmentStatusById[shipment.id] !== 'IN_TRANSIT' || shipment.arrivalAtSecond > next.simSeconds) continue;
    next.shipmentStatusById[shipment.id] = 'DELIVERED';
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

/** Buy `count` levels (1, 10 or 'max') of pick, lift or hauler. Takes as many as the coin allows; none affordable fails with no change. */
export function purchaseUpgrade(inputState, type, { count = 1 } = {}) {
  const state = validateGameState(inputState);
  if (!E.LINES[type]) fail('UNKNOWN_UPGRADE');
  if (levelOf(state, type) >= E.LEVEL_CAP) fail('AT_CAP');
  const quote = bulkQuote(state, type, count);
  if (quote.levels === 0) fail('INSUFFICIENT_FUNDS');
  const next = clone(state);
  changeCoin(next, -quote.cost, 'SYSTEM_PURCHASE', `${E.LINES[type].label} +${quote.levels}`, 'sink:SYSTEM_PURCHASE');
  next.upgrades[type] += quote.levels;
  applyLevels(next);
  appendLog(next, `${E.LINES[type].label} is now level ${next.upgrades[type]} (${quote.cost} coin).`, 'purchase');
  return validateGameState(next);
}

export function buyNextShaft(inputState) {
  const state = validateGameState(inputState);
  const number = state.production.shafts.length + 1;
  if (number > E.MAX_SHAFTS) fail('AT_CAP');
  const cost = E.shaftCost(number);
  safeInt(cost, 'shaft cost');
  if (state.coins < cost) fail('INSUFFICIENT_FUNDS');
  const next = clone(state);
  changeCoin(next, -cost, 'SYSTEM_PURCHASE', `Unlocked shaft ${number}`, 'sink:SYSTEM_PURCHASE');
  next.production.shafts.push(shaftBlueprint(number, next));
  next.veins.push(...generateVeins(next.site, number));
  appendLog(next, `Shaft ${number} opened with a crew of ${E.MINERS_PER_SHAFT}.`, 'purchase');
  return validateGameState(next);
}

export function selectDestination(inputState, destinationId) {
  const state = validateGameState(inputState);
  destinationFor(destinationId);
  const next = clone(state);
  next.selectedDestinationId = destinationId;
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
  const loaded = loadHold(state);
  if (loaded.ship.cargoUnits < 1e-9) fail('NOT_ENOUGH_STOCK');
  const result = computeDispatch(loaded, loaded.selectedDestinationId);
  if (!result.result) fail('NOT_ENOUGH_STOCK');
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

/** the whole chain in one object: what each stage can move per minute, and what each buyer would pay per minute for this setup */
export function flowSummary(state) {
  const digPerMinute = currentRates(state).reduce((sum, row) => sum + row.ratePerMinute, 0);
  const liftPerMinute = currentLiftRate(state);
  const supply = Math.min(digPerMinute, liftPerMinute);
  const ore0 = ore(state.site.commonOreId);
  const buyers = DESTINATIONS.map((destination) => {
    const trip = E.tripSeconds(destination, state.ship.speedPerMinute);
    const haulPerMinute = state.ship.capacityUnits / trip * 60;
    const unitsPerMinute = Math.min(supply, haulPerMinute);
    return { destination, tripSeconds: trip, haulPerMinute, unitsPerMinute, coinPerMinute: unitsPerMinute * priceFor(destination, ore0.id) };
  });
  const best = buyers.reduce((top, row) => (row.coinPerMinute > top.coinPerMinute ? row : top), buyers[0]);
  const chosen = buyers.find((row) => row.destination.id === state.selectedDestinationId);
  return { digPerMinute, liftPerMinute, haulPerMinute: chosen.haulPerMinute, supplyPerMinute: supply, buyers, bestId: best.destination.id, coinPerMinute: chosen.coinPerMinute };
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
  safeInt(input.trips, 'trips');
  if (!Array.isArray(input.shipments) || !Array.isArray(input.ledger) || !Array.isArray(input.log) || !Array.isArray(input.production?.shafts)) fail('INVALID_SAVE');
  if (!input.upgrades || typeof input.upgrades !== 'object' || !input.shipmentStatusById || typeof input.shipmentStatusById !== 'object') fail('INVALID_SAVE');
  if (Object.keys(input.upgrades).length !== E.LINE_IDS.length || typeof input.autoLaunch !== 'boolean') fail('INVALID_SAVE');
  for (const key of E.LINE_IDS) { safeInt(input.upgrades[key], `upgrade ${key}`); if (input.upgrades[key] > E.LEVEL_CAP) fail('INVALID_SAVE'); }
  destinationFor(input.selectedDestinationId);
  const production = createProductionState(input.production);
  if (production.shafts.some((shaft, index) => shaft.shaftNumber !== index + 1 || !ore(shaft.oreId))) fail('INVALID_SAVE', 'Shaft order or ore is invalid');
  if (production.shafts.some((shaft) => shaft.workersAssigned !== E.MINERS_PER_SHAFT)) fail('INVALID_SAVE', 'Every shaft carries a full crew');
  if (production.syntheticDownstreamDrain.unitsPerSecond !== 0 || production.syntheticDownstreamDrain.drainedByOre.length !== 0) fail('INVALID_SAVE', 'Synthetic drain must remain disabled in the playtest');
  if (!input.ship || number(input.ship.capacityUnits, 'ship capacity', Number.MIN_VALUE) <= 0 || number(input.ship.speedPerMinute, 'ship speed', Number.MIN_VALUE) <= 0) fail('INVALID_SAVE');
  safeInt(input.ship.readyAtSecond, 'ship ready time');
  number(input.ship.cargoUnits, 'ship cargo');
  if (typeof input.ship.loading !== 'boolean' || input.ship.cargoUnits > input.ship.capacityUnits + 1e-9 || (input.ship.cargoUnits > 0 && !ore(input.ship.cargoOreId)) || (input.ship.cargoUnits === 0 && input.ship.cargoOreId !== null)) fail('INVALID_SAVE');
  if (!Number.isSafeInteger(input.nextRecordId) || input.nextRecordId < 1) fail('INVALID_SAVE');
  const shipmentIds = new Set();
  for (const shipment of input.shipments) {
    if (!shipment || typeof shipment.id !== 'string' || shipmentIds.has(shipment.id) || !ore(shipment.oreId) || !destinationFor(shipment.destinationId) || typeof shipment.state !== 'string') fail('INVALID_SAVE');
    shipmentIds.add(shipment.id);
    safeInt(shipment.payment, 'shipment payment');
    number(shipment.units, 'shipment units', Number.MIN_VALUE);
    if (!['IN_TRANSIT', 'DELIVERED'].includes(input.shipmentStatusById[shipment.id])) fail('INVALID_SAVE');
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
