// Computer-run refineries with a finite rare/mythic PREMIUM (sections 02/05, Q-10). The BASE bid is unlimited per Q-10:
// payment always includes units x bidPerUnit. Only the premium on rare/mythic ore is market-driven and exhaustible, so it
// can never become unlimited premium demand. Pure functions only: no I/O, no clock, no Math.random. Coin is whole integers.
import { createStepRng } from './events.js';

export class NpcMarketError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'NpcMarketError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new NpcMarketError(code, message); };

// C-02 PROVISIONAL: all coefficients below are tuning data, not certified balance.
export const DEFAULT_PREMIUM = Object.freeze({ fundsMax: 50_000, refillPerHour: 5_000, storageCapacity: 2_000, drainPerHour: 200 }); // C-02 PROVISIONAL
export const TIER_REFERENCE = Object.freeze({ common: 1, rare: 3, mythic: 8 }); // C-02 PROVISIONAL
export const REFINERY_DOCKS = 4; // C-02 PROVISIONAL
export const REFINERY_DISTANCE_RANGE = Object.freeze({ min: 1, max: 8 }); // C-02 PROVISIONAL
export const REFINERY_BID_RANGE = Object.freeze({ min: 36, max: 72 }); // C-02 PROVISIONAL
export const REFINERY_UNLOAD_RANGE = Object.freeze({ min: 900, max: 1500 }); // C-02 PROVISIONAL
export const REFINERY_COUNT_RANGE = Object.freeze({ min: 3, max: 6 });

const safe = (value) => {
  if (!Number.isSafeInteger(value)) fail('COIN_OVERFLOW', 'Amount exceeds safe integer range');
  return value;
};
const mul = (a, b) => safe(a * b);
const add = (a, b) => safe(a + b);

const isInt = (value, min = 0) => Number.isSafeInteger(value) && value >= min;

export function generateRefineries({ seed, monthId, count = 3 } = {}) {
  if (typeof seed !== 'string' || seed.length === 0 || typeof monthId !== 'string' || monthId.length === 0) fail('INVALID_SEED');
  if (!Number.isSafeInteger(count) || count < REFINERY_COUNT_RANGE.min || count > REFINERY_COUNT_RANGE.max) fail('INVALID_COUNT');
  const rng = createStepRng(seed, `npc-refineries:${monthId}`, 0);
  const span = REFINERY_DISTANCE_RANGE.max - REFINERY_DISTANCE_RANGE.min + 1;
  const pool = Array.from({ length: span }, (_, i) => REFINERY_DISTANCE_RANGE.min + i);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const distance = pool.splice(rng.int(pool.length), 1)[0];
    out.push(Object.freeze({
      id: `refinery-${i + 1}`,
      name: `Refinery ${i + 1}`,
      distance,
      bidPerUnit: REFINERY_BID_RANGE.min + rng.int(REFINERY_BID_RANGE.max - REFINERY_BID_RANGE.min + 1),
      unloadUnitsPerMinute: REFINERY_UNLOAD_RANGE.min + rng.int(REFINERY_UNLOAD_RANGE.max - REFINERY_UNLOAD_RANGE.min + 1),
      docks: REFINERY_DOCKS,
      premium: Object.freeze({ ...DEFAULT_PREMIUM }),
    }));
  }
  return out;
}

function checkRefinery(refinery) {
  const p = refinery?.premium;
  if (!refinery || !isInt(refinery.bidPerUnit, 1) || !isInt(refinery.docks, 1) || !p
    || !isInt(p.fundsMax) || !isInt(p.refillPerHour) || !isInt(p.storageCapacity) || !isInt(p.drainPerHour)) fail('INVALID_REFINERY');
}

function checkState(refinery, state) {
  checkRefinery(refinery);
  if (!state || !isInt(state.premiumFunds) || !isInt(state.storageUsed) || !isInt(state.asOfSec) || !isInt(state.fundsRemainder ?? 0)
    || !isInt(state.storageRemainder ?? 0) || !Array.isArray(state.dockFreeAt) || state.dockFreeAt.length !== refinery.docks
    || !state.dockFreeAt.every((v) => isInt(v))) fail('INVALID_STATE');
}

export function initialMarketState(refinery, nowSec) {
  checkRefinery(refinery);
  if (!isInt(nowSec)) fail('INVALID_TIME');
  return {
    premiumFunds: refinery.premium.fundsMax,
    storageUsed: 0,
    fundsRemainder: 0,
    storageRemainder: 0,
    asOfSec: nowSec,
    dockFreeAt: Array.from({ length: refinery.docks }, () => nowSec),
  };
}

export function advanceMarket(refinery, state, nowSec) {
  checkState(refinery, state);
  if (!isInt(nowSec)) fail('INVALID_TIME');
  const p = refinery.premium;
  const elapsed = Math.max(0, nowSec - state.asOfSec);
  const fundsNum = add(state.fundsRemainder ?? 0, mul(p.refillPerHour, elapsed));
  let premiumFunds = add(state.premiumFunds, Math.floor(fundsNum / 3600));
  let fundsRemainder = fundsNum % 3600;
  if (premiumFunds >= p.fundsMax) { premiumFunds = p.fundsMax; fundsRemainder = 0; }
  const drainNum = add(state.storageRemainder ?? 0, mul(p.drainPerHour, elapsed));
  let storageUsed = state.storageUsed - Math.floor(drainNum / 3600);
  let storageRemainder = drainNum % 3600;
  if (storageUsed <= 0) { storageUsed = 0; storageRemainder = 0; }
  return {
    premiumFunds, storageUsed, fundsRemainder, storageRemainder,
    asOfSec: Math.max(state.asOfSec, nowSec),
    dockFreeAt: state.dockFreeAt.slice(),
  };
}

function checkLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) fail('INVALID_CARGO');
  const seen = new Set();
  for (const line of lines) {
    if (!line || typeof line.oreId !== 'string' || line.oreId.length === 0) fail('INVALID_CARGO');
    if (!Object.hasOwn(TIER_REFERENCE, line.tier)) fail('UNKNOWN_TIER');
    if (!isInt(line.units, 1)) fail('INVALID_UNITS');
    if (seen.has(line.oreId)) fail('DUPLICATE_ORE');
    seen.add(line.oreId);
  }
}

export function quoteCargo(refinery, state, lines, nowSec) {
  checkLines(lines);
  const s = advanceMarket(refinery, state, nowSec);
  const cap = refinery.premium.storageCapacity;
  const demandNum = Math.max(0, cap - s.storageUsed); // demand = demandNum / cap
  let funds = s.premiumFunds;
  let storage = s.storageUsed;
  let units = 0;
  let basePayment = 0;
  let premiumPayment = 0;
  const out = lines.map((line) => {
    const basePerUnit = refinery.bidPerUnit;
    const lineBase = mul(line.units, basePerUnit);
    // round-half-up(base x (ref-1) x demand), exact integer math: floor((2n + cap) / 2cap)
    const ppu = cap === 0 ? 0 : Math.floor(add(mul(mul(basePerUnit, TIER_REFERENCE[line.tier] - 1), demandNum), Math.floor(cap / 2)) / cap);
    let premiumUnits = 0;
    if (ppu > 0) premiumUnits = Math.min(line.units, Math.floor(funds / ppu), Math.max(0, cap - storage));
    const linePremium = mul(premiumUnits, ppu);
    funds -= linePremium;
    storage += premiumUnits;
    units = add(units, line.units);
    basePayment = add(basePayment, lineBase);
    premiumPayment = add(premiumPayment, linePremium);
    return {
      oreId: line.oreId, tier: line.tier, units: line.units, basePerUnit,
      premiumUnits, premiumPerUnit: ppu, basePayment: lineBase, premiumPayment: linePremium, payment: add(lineBase, linePremium),
    };
  });
  const payment = add(basePayment, premiumPayment);
  return { lines: out, units, basePayment, premiumPayment, payment, nextState: { ...s, premiumFunds: funds, storageUsed: storage } };
}

export function refineryOffer(refinery, state, lines, nowSec) {
  const { nextState, ...offer } = quoteCargo(refinery, state, lines, nowSec);
  return offer;
}

export function dockWaitSeconds(state, arrivalSec) {
  if (!state || !Array.isArray(state.dockFreeAt) || state.dockFreeAt.length === 0 || !isInt(arrivalSec)) fail('INVALID_STATE');
  return Math.max(0, Math.min(...state.dockFreeAt) - arrivalSec);
}

export function reserveDock(state, arrivalSec, unloadSeconds) {
  if (!state || !Array.isArray(state.dockFreeAt) || state.dockFreeAt.length === 0 || !isInt(arrivalSec) || !isInt(unloadSeconds)) fail('INVALID_DOCK_REQUEST');
  let index = 0;
  for (let i = 1; i < state.dockFreeAt.length; i += 1) if (state.dockFreeAt[i] < state.dockFreeAt[index]) index = i;
  const startSec = Math.max(arrivalSec, state.dockFreeAt[index]);
  const endSec = add(startSec, unloadSeconds);
  const dockFreeAt = state.dockFreeAt.slice();
  dockFreeAt[index] = endSec;
  return { waitSeconds: startSec - arrivalSec, startSec, endSec, state: { ...state, dockFreeAt } };
}
