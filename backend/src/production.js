const MAX = Number.MAX_SAFE_INTEGER;
export class ProductionError extends Error {
  constructor(code, message = code) { super(message); this.name = 'ProductionError'; this.code = code; }
}
const fail = (code, message = code) => { throw new ProductionError(code, message); };
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const textOrder = (a, b) => a < b ? -1 : a > b ? 1 : 0;

function integer(value, min, max, label) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_CONFIG', `${label} must be an integer from ${min} to ${max}`);
  return value;
}
function finite(value, label, { min = 0, max = MAX, strict = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value > max || (strict ? value <= min : value < min)) fail('INVALID_AMOUNT', `${label} must be finite and in range`);
  return value;
}
function oreId(value) {
  if (typeof value !== 'string' || !value || value.length > 128) fail('INVALID_CONFIG', 'oreId must be a non-empty string');
  return value;
}
function cloneRows(rows, label) {
  if (!Array.isArray(rows)) fail('INVALID_STATE', `${label} must be an array`);
  const seen = new Set();
  const result = rows.map((row) => {
    if (!isRecord(row) || Object.keys(row).length !== 2 || !Object.hasOwn(row, 'oreId') || !Object.hasOwn(row, 'units')) fail('INVALID_STATE', `Malformed ${label} row`);
    const id = oreId(row.oreId);
    if (seen.has(id)) fail('INVALID_STATE', `Duplicate ore in ${label}`);
    seen.add(id);
    return { oreId: id, units: finite(row.units, `${label} units`) };
  });
  return result.sort((a, b) => textOrder(a.oreId, b.oreId));
}
function rowMap(rows) { return new Map(rows.map(({ oreId: id, units }) => [id, units])); }
function rowsFromMap(map) { return [...map].map(([id, units]) => ({ oreId: id, units })).sort((a, b) => textOrder(a.oreId, b.oreId)); }
function add(map, id, amount, label) {
  const next = (map.get(id) ?? 0) + amount;
  finite(next, label);
  map.set(id, next);
}
function totalRows(rows) { return rows.reduce((sum, row) => { const next = sum + row.units; finite(next, 'inventory total'); return next; }, 0); }
function closeEnough(left, right, elapsedSeconds) {
  // Nonnegative floating ore flows accumulate rounding across ticks. Use the
  // standard gamma_n forward-error bound, conservatively budgeting 256 rounded
  // operations per ore/tick. Coin accounting never uses this tolerance.
  const roundoff = 256 * (elapsedSeconds + 1) * Number.EPSILON;
  if (!Number.isFinite(roundoff) || roundoff >= 1) fail('OVERFLOW', 'Ore precision budget exhausted');
  const tolerance = Math.max(128 * Number.EPSILON, roundoff / (1 - roundoff));
  return Math.abs(left - right) <= tolerance * Math.max(1, Math.abs(left), Math.abs(right));
}

/** C-01 shaft throughput. All rates are units/minute; workers are explicitly assigned. */
export function shaftRatePerMinute(config) {
  if (!isRecord(config)) fail('INVALID_CONFIG');
  const shaftNumber = integer(config.shaftNumber, 1, 30, 'shaftNumber');
  const digLevel = integer(config.digLevel, 0, 1000, 'digLevel');
  const bunkhouseLevel = integer(config.bunkhouseLevel, 0, 10, 'bunkhouseLevel');
  const workersAssigned = integer(config.workersAssigned, 0, 10 + 5 * bunkhouseLevel, 'workersAssigned');
  const cartLevel = integer(config.cartLevel, 0, 10, 'cartLevel');
  const depthGrowth = finite(config.depthGrowth, 'depthGrowth', { min: 1, strict: true });
  const baseRatePerWorkerPerMinute = finite(config.baseRatePerWorkerPerMinute, 'baseRatePerWorkerPerMinute', { min: 0, strict: true });
  const soilModifier = finite(config.soilModifier, 'soilModifier', { min: 0, strict: true });
  const weatherModifier = finite(config.weatherModifier, 'weatherModifier', { min: 0, strict: true });
  const buffsMultiplier = finite(config.buffsMultiplier, 'buffsMultiplier', { min: 0, strict: true });
  const utilization = 0.25 + 0.075 * cartLevel;
  const rate = workersAssigned * baseRatePerWorkerPerMinute * depthGrowth ** (shaftNumber - 1) * (1 + 0.04 * digLevel) * soilModifier * weatherModifier * utilization * buffsMultiplier;
  return finite(rate, 'shaft rate');
}

/** Lift throughput in units/minute, with explicit linear-reference or exponential profile. */
export function liftRatePerMinute(config) {
  if (!isRecord(config)) fail('INVALID_CONFIG');
  const liftLevel = integer(config.liftLevel, 0, 1000, 'liftLevel');
  const baseRatePerMinute = finite(config.baseRatePerMinute, 'baseRatePerMinute', { min: 0, strict: true });
  let rate;
  if (config.curve === 'linear-reference') rate = baseRatePerMinute * (1 + 0.04 * liftLevel);
  else if (config.curve === 'exponential') {
    const growth = finite(config.growth, 'growth', { min: 1, strict: true });
    rate = baseRatePerMinute * growth ** liftLevel;
  } else fail('INVALID_CONFIG', 'curve must be exponential or linear-reference');
  return finite(rate, 'lift rate');
}

// Section 04: below 5% of its size a vein's output falls in proportion (floored so it finishes in finite time).
export const VEIN_TAPER_FRACTION = 0.05;
export const VEIN_TAPER_FLOOR = 0.02;
export function veinFactor(vein) {
  if (!vein || vein.remaining <= 0) return 0;
  return vein.remaining >= VEIN_TAPER_FRACTION * vein.size ? 1 : Math.max(VEIN_TAPER_FLOOR, vein.remaining / (VEIN_TAPER_FRACTION * vein.size));
}
const veinActive = (shaft) => shaft.vein !== undefined && shaft.vein.remaining > 0;
/** The ore a shaft digs right now: its vein ore while the vein lasts, otherwise the common ore of its band (T04-02). */
export const targetOre = (shaft) => (veinActive(shaft) ? shaft.vein.oreId : shaft.commonOreId);
/** Units/minute the shaft is producing now (formula x vein taper), as shown on the shaft card. */
export const effectiveShaftRatePerMinute = (shaft) => shaftRatePerMinute(shaft) * (veinActive(shaft) ? veinFactor(shaft.vein) : 1);

function cloneShaft(shaft) {
  if (!isRecord(shaft)) fail('INVALID_CONFIG', 'Shaft configuration must be an object');
  const value = {
    shaftNumber: integer(shaft.shaftNumber, 1, 30, 'shaftNumber'),
    oreId: oreId(shaft.oreId),
    digLevel: integer(shaft.digLevel, 0, 1000, 'digLevel'),
    bunkhouseLevel: integer(shaft.bunkhouseLevel, 0, 10, 'bunkhouseLevel'),
    workersAssigned: integer(shaft.workersAssigned, 0, 10 + 5 * shaft.bunkhouseLevel, 'workersAssigned'),
    cartLevel: integer(shaft.cartLevel, 0, 10, 'cartLevel'),
    depthGrowth: finite(shaft.depthGrowth, 'depthGrowth', { min: 1, strict: true }),
    baseRatePerWorkerPerMinute: finite(shaft.baseRatePerWorkerPerMinute, 'baseRatePerWorkerPerMinute', { min: 0, strict: true }),
    soilModifier: finite(shaft.soilModifier, 'soilModifier', { min: 0, strict: true }),
    weatherModifier: finite(shaft.weatherModifier, 'weatherModifier', { min: 0, strict: true }),
    buffsMultiplier: finite(shaft.buffsMultiplier, 'buffsMultiplier', { min: 0, strict: true }),
    bufferCapacityUnits: finite(shaft.bufferCapacityUnits, 'bufferCapacityUnits', { min: 0, strict: true }),
    bufferUnits: finite(shaft.bufferUnits ?? 0, 'bufferUnits'),
    lightsLevel: integer(shaft.lightsLevel ?? 0, 0, 10, 'lightsLevel'),
    supportsLevel: integer(shaft.supportsLevel ?? 0, 0, 10, 'supportsLevel'),
    // The band's common ore; `oreId` is the ore currently in the buffer (the vein ore while a vein lasts, then the common ore).
    commonOreId: oreId(shaft.commonOreId ?? shaft.oreId),
  };
  if (shaft.vein !== undefined && shaft.vein !== null) {
    if (!isRecord(shaft.vein)) fail('INVALID_CONFIG', 'vein must be an object');
    const size = finite(shaft.vein.size, 'vein size', { min: 0, strict: true });
    value.vein = { oreId: oreId(shaft.vein.oreId), size, remaining: finite(shaft.vein.remaining, 'vein remaining') };
    if (value.vein.remaining > size) fail('INVALID_STATE', 'Vein remaining exceeds its size');
  }
  if (value.bufferUnits > value.bufferCapacityUnits) fail('INVALID_STATE', 'Shaft buffer exceeds capacity');
  shaftRatePerMinute(value);
  return value;
}

function checkConservation(state) {
  const initial = rowMap(state.initialUnitsByOre);
  const mined = rowMap(state.cumulativeMinedByOre);
  const drained = rowMap(state.syntheticDownstreamDrain.drainedByOre);
  const surface = rowMap(state.surface.unitsByOre);
  const external = rowMap(state.externalTransfersByOre);
  for (const shaft of state.shafts) add(surface, shaft.oreId, 0, 'surface units');
  const ids = new Set([...initial.keys(), ...mined.keys(), ...drained.keys(), ...surface.keys(), ...external.keys(), ...state.shafts.map((shaft) => shaft.oreId)]);
  for (const id of ids) {
    const lhs = (initial.get(id) ?? 0) + (mined.get(id) ?? 0);
    const rhs = state.shafts.filter((shaft) => shaft.oreId === id).reduce((sum, shaft) => sum + shaft.bufferUnits, 0)
      + (surface.get(id) ?? 0) + (drained.get(id) ?? 0) + (external.get(id) ?? 0);
    finite(lhs, 'accounted units');
    finite(rhs, 'physical units');
    if (!closeEnough(lhs, rhs, state.elapsedSeconds)) fail('MASS_BALANCE', `Unit conservation failed for ore ${id}: ${lhs} != ${rhs}`);
  }
}

/** Build a validated detached flow checkpoint. No automatic worker assignment occurs. */
export function createProductionState(config) {
  if (!isRecord(config) || !Array.isArray(config.shafts) || config.shafts.length < 1 || config.shafts.length > 30) fail('INVALID_CONFIG', 'A mine must have 1 to 30 explicitly assigned shafts');
  if ((config.schemaVersion ?? 1) !== 1) fail('UNSUPPORTED_SCHEMA_VERSION');
  const shafts = config.shafts.map(cloneShaft).sort((a, b) => a.shaftNumber - b.shaftNumber);
  if (new Set(shafts.map((shaft) => shaft.shaftNumber)).size !== shafts.length) fail('INVALID_CONFIG', 'Shaft numbers must be unique');
  if (!isRecord(config.lift)) fail('INVALID_CONFIG', 'Lift configuration is required');
  const lift = {
    level: integer(config.lift.level, 0, 1000, 'lift level'),
    baseRatePerMinute: finite(config.lift.baseRatePerMinute, 'lift base rate', { min: 0, strict: true }),
    curve: config.lift.curve,
  };
  if (lift.curve === 'exponential') lift.growth = finite(config.lift.growth, 'lift growth', { min: 1, strict: true });
  liftRatePerMinute({ liftLevel: lift.level, baseRatePerMinute: lift.baseRatePerMinute, curve: lift.curve, growth: lift.growth });
  const surface = {
    capacityUnits: finite(config.surface?.capacityUnits, 'surface capacity', { min: 0, strict: true }),
    unitsByOre: cloneRows(config.surface?.unitsByOre ?? [], 'surface inventory'),
  };
  if (totalRows(surface.unitsByOre) > surface.capacityUnits) fail('INVALID_STATE', 'Surface inventory exceeds capacity');
  const syntheticDownstreamDrain = {
    unitsPerSecond: finite(config.syntheticDownstreamDrain?.unitsPerSecond ?? 0, 'synthetic drain rate'),
    drainedByOre: cloneRows(config.syntheticDownstreamDrain?.drainedByOre ?? [], 'synthetic drain'),
  };
  const cumulativeMinedByOre = cloneRows(config.cumulativeMinedByOre ?? [], 'mined totals');
  const initialUnitsByOre = cloneRows(config.initialUnitsByOre ?? [], 'initial totals');
  const externalTransfersByOre = cloneRows(config.externalTransfersByOre ?? [], 'external transfers');
  if (config.initialUnitsByOre === undefined) {
    if (cumulativeMinedByOre.length || syntheticDownstreamDrain.drainedByOre.length || externalTransfersByOre.length) fail('INVALID_STATE', 'Restored flow state requires initialUnitsByOre');
    const initial = rowMap(surface.unitsByOre);
    for (const shaft of shafts) add(initial, shaft.oreId, shaft.bufferUnits, 'initial inventory');
    initialUnitsByOre.push(...rowsFromMap(initial));
  }
  const state = {
    schemaVersion: 1,
    shafts,
    lift,
    surface,
    syntheticDownstreamDrain,
    initialUnitsByOre,
    cumulativeMinedByOre,
    externalTransfersByOre,
    elapsedSeconds: integer(config.elapsedSeconds ?? 0, 0, MAX, 'elapsedSeconds'),
  };
  checkConservation(state);
  return state;
}

/** One explicit second: dig into shaft buffers, lift by ascending shaft number, then apply synthetic drain. */
export function tickProductionSecond(inputState) {
  const state = createProductionState(inputState);
  if (state.elapsedSeconds === MAX) fail('OVERFLOW', 'Elapsed seconds exceed safe range');
  const shafts = state.shafts.map((shaft) => ({ ...shaft }));
  const mined = rowMap(state.cumulativeMinedByOre);
  const surface = rowMap(state.surface.unitsByOre);
  const liftCapacity = liftRatePerMinute({
    liftLevel: state.lift.level,
    baseRatePerMinute: state.lift.baseRatePerMinute,
    curve: state.lift.curve,
    growth: state.lift.growth,
  }) / 60;

  for (const shaft of shafts) {
    if (shaft.vein) shaft.vein = { ...shaft.vein };
    // A shaft switches ore only with an empty buffer, so the lift flushes the old ore first and mass stays per-ore exact.
    const target = targetOre(shaft);
    if (target !== shaft.oreId) { if (shaft.bufferUnits === 0) shaft.oreId = target; else continue; }
    if (shaft.workersAssigned === 0 || shaft.bufferUnits >= shaft.bufferCapacityUnits) continue;
    const onVein = veinActive(shaft);
    const perSecond = (shaftRatePerMinute(shaft) / 60) * (onVein ? veinFactor(shaft.vein) : 1);
    const amount = Math.min(perSecond, shaft.bufferCapacityUnits - shaft.bufferUnits, onVein ? shaft.vein.remaining : Infinity);
    if (amount <= 0) continue;
    shaft.bufferUnits += amount;
    if (onVein) shaft.vein.remaining -= amount;
    add(mined, shaft.oreId, amount, 'mined units');
  }

  let liftRemaining = liftCapacity;
  let surfaceFree = state.surface.capacityUnits - totalRows(rowsFromMap(surface));
  for (const shaft of shafts) {
    if (liftRemaining <= 0 || surfaceFree <= 0) break;
    const amount = Math.min(shaft.bufferUnits, liftRemaining, surfaceFree);
    if (amount <= 0) continue;
    shaft.bufferUnits -= amount;
    add(surface, shaft.oreId, amount, 'surface units');
    liftRemaining -= amount;
    surfaceFree -= amount;
  }

  const drained = rowMap(state.syntheticDownstreamDrain.drainedByOre);
  let drainRemaining = state.syntheticDownstreamDrain.unitsPerSecond;
  for (const id of [...surface.keys()].sort(textOrder)) {
    if (drainRemaining <= 0) break;
    const amount = Math.min(surface.get(id) ?? 0, drainRemaining);
    surface.set(id, (surface.get(id) ?? 0) - amount);
    add(drained, id, amount, 'drained units');
    drainRemaining -= amount;
  }

  const next = {
    schemaVersion: 1,
    shafts,
    lift: { ...state.lift },
    surface: { capacityUnits: state.surface.capacityUnits, unitsByOre: rowsFromMap(surface).filter((row) => row.units > 0) },
    syntheticDownstreamDrain: { unitsPerSecond: state.syntheticDownstreamDrain.unitsPerSecond, drainedByOre: rowsFromMap(drained).filter((row) => row.units > 0) },
    initialUnitsByOre: state.initialUnitsByOre.map((row) => ({ ...row })),
    cumulativeMinedByOre: rowsFromMap(mined).filter((row) => row.units > 0),
    externalTransfersByOre: state.externalTransfersByOre.map((row) => ({ ...row })),
    elapsedSeconds: state.elapsedSeconds + 1,
  };
  checkConservation(next);
  return next;
}

/** Catch up through the same one-second tick function; unprocessed seconds are returned without a cap. */
export function advanceProductionSeconds(inputState, { seconds, maxSteps }) {
  integer(seconds, 0, MAX, 'seconds');
  integer(maxSteps, 1, MAX, 'maxSteps');
  let state = createProductionState(inputState);
  const processedSeconds = Math.min(seconds, maxSteps);
  for (let step = 0; step < processedSeconds; step += 1) state = tickProductionSecond(state);
  return { state, processedSeconds, remainingSeconds: seconds - processedSeconds };
}


/** Transfer real surface stock out of this flow model, e.g. into ship cargo.
 * The caller must commit its corresponding cargo/reservation atomically.
 * This function neither sells inventory nor creates a synthetic drain/payment.
 */
export function withdrawSurfaceUnits(inputState, requestedOreId, units) {
  const id = oreId(requestedOreId);
  finite(units, 'withdrawal units', { min: 0, strict: true });
  const state = createProductionState(inputState);
  const inventory = rowMap(state.surface.unitsByOre);
  const available = inventory.get(id) ?? 0;
  if (units > available) fail('INSUFFICIENT_STOCK', 'Not enough surface ore');
  inventory.set(id, available - units);
  const external = rowMap(state.externalTransfersByOre);
  add(external, id, units, 'external transfer units');
  const next = {
    ...state,
    surface: { ...state.surface, unitsByOre: rowsFromMap(inventory).filter((row) => row.units > 0) },
    externalTransfersByOre: rowsFromMap(external),
  };
  checkConservation(next);
  return next;
}

const sumRows = (rows) => rows.reduce((sum, row) => sum + row.units, 0);
const deltaRows = (after, before) => {
  const prior = rowMap(before);
  return rowsFromMap(rowMap(after)).map(({ oreId: id, units }) => ({ oreId: id, units: units - (prior.get(id) ?? 0) })).filter((row) => Math.abs(row.units) > 0);
};

/**
 * Catch up using the same one-second tick, but extrapolate once the flow is provably steady: two consecutive
 * ticks leave every shaft buffer unchanged and produce identical surface/mined deltas, and the yard has room.
 * Results match the plain one-second loop within the ore-unit tolerance (verified by tests; coin is never involved).
 * `maxTicks` bounds explicitly simulated ticks; extrapolated seconds are not counted against it.
 */
export function advanceProductionFast(inputState, { seconds, maxTicks = 100_000 }) {
  integer(seconds, 0, MAX, 'seconds');
  integer(maxTicks, 1, MAX, 'maxTicks');
  let state = createProductionState(inputState);
  let remaining = seconds;
  let ticks = 0;
  let previous = null;
  while (remaining > 0 && ticks < maxTicks) {
    const before = state;
    state = tickProductionSecond(state);
    remaining -= 1;
    ticks += 1;
    const surfaceDelta = deltaRows(state.surface.unitsByOre, before.surface.unitsByOre);
    const minedDelta = deltaRows(state.cumulativeMinedByOre, before.cumulativeMinedByOre);
    const buffersSame = state.shafts.every((shaft, i) => Math.abs(shaft.bufferUnits - before.shafts[i].bufferUnits) <= 1e-12 * Math.max(1, shaft.bufferCapacityUnits));
    const sig = JSON.stringify({ surfaceDelta, minedDelta });
    const steady = buffersSame && previous !== null && previous === sig;
    previous = sig;
    if (!steady || remaining < 2) continue;
    const perTick = sumRows(surfaceDelta);
    const free = state.surface.capacityUnits - sumRows(state.surface.unitsByOre);
    // Leave a safety margin of one tick so the transition tick is simulated explicitly.
    let room = perTick > 0 ? Math.floor(free / perTick) - 1 : remaining;
    // Extrapolate only while every vein stays in its full-output regime (above the taper threshold) and ore type is stable.
    let veinStable = true;
    const veinUse = state.shafts.map((shaft, i) => {
      const was = before.shafts[i];
      if (shaft.oreId !== was.oreId || targetOre(shaft) !== shaft.oreId) veinStable = false;
      if (!shaft.vein) return 0;
      const used = was.vein.remaining - shaft.vein.remaining;
      if (used > 0) room = Math.min(room, Math.floor((shaft.vein.remaining - VEIN_TAPER_FRACTION * shaft.vein.size) / used) - 1);
      if (shaft.vein.remaining < VEIN_TAPER_FRACTION * shaft.vein.size * 2 && shaft.vein.remaining > 0) veinStable = false;
      return used;
    });
    if (!veinStable) continue;
    const jump = Math.min(remaining, room);
    if (jump < 2) continue;
    const surface = rowMap(state.surface.unitsByOre);
    const mined = rowMap(state.cumulativeMinedByOre);
    for (const { oreId: id, units } of surfaceDelta) add(surface, id, units * jump, 'surface units');
    for (const { oreId: id, units } of minedDelta) add(mined, id, units * jump, 'mined units');
    state = {
      ...state,
      shafts: state.shafts.map((shaft, i) => (shaft.vein ? { ...shaft, vein: { ...shaft.vein, remaining: shaft.vein.remaining - veinUse[i] * jump } } : shaft)),
      surface: { capacityUnits: state.surface.capacityUnits, unitsByOre: rowsFromMap(surface).filter((row) => row.units > 0) },
      cumulativeMinedByOre: rowsFromMap(mined).filter((row) => row.units > 0),
      elapsedSeconds: state.elapsedSeconds + jump,
    };
    state = createProductionState(state);
    remaining -= jump;
    previous = null;
  }
  return { state, processedSeconds: seconds - remaining, remainingSeconds: remaining };
}
