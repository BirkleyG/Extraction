// Section 10 upgrade economics: one registered table of cost curves and exact bulk pricing.
// Prices are computed server-side only; the browser may display quotes but never decides them.
const MAX = Number.MAX_SAFE_INTEGER;

export class UpgradeError extends Error {
  constructor(code, message = code) { super(message); this.name = 'UpgradeError'; this.code = code; }
}
const fail = (code, message = code) => { throw new UpgradeError(code, message); };

// Positive round-half-up, applied once per level price (section 10 "Cost indexing").
const roundHalfUp = (value) => Math.floor(value + 0.5);

function curve(base, growth, cap) { return Object.freeze({ kind: 'geometric', base, growth, cap }); }
function series(prices) { return Object.freeze({ kind: 'list', prices: Object.freeze([...prices]), cap: prices.length }); }

/** Registered level-cost curves. New line families need an entry here plus an affordability test. */
export const CURVES = Object.freeze({
  // 1000-level families (section 10 table). Each purchased line keeps its own schedule.
  dig: curve(15, 1.021, 1000),
  lift: curve(25, 1.0205, 1000),
  shaftBuffer: curve(25, 1.0205, 1000),
  shipSpeed: curve(30, 1.02, 1000),
  shipCapacity: curve(30, 1.02, 1000),
  padLoading: curve(30, 1.02, 1000),
  surfaceStorage: curve(50, 1.0195, 1000),
  habitat: curve(50, 1.0195, 1000), // C-01 proposal: worker capacity = 10 + 2 per level (see habitatCapacity)
  refineryStorage: curve(50, 1.0195, 1000),
  stationSilo: curve(50, 1.0195, 1000),
  refineryProcessing: curve(100, 1.019, 1000),
  refineryBudgetLimit: curve(100, 1.019, 1000),
  militaryRate: curve(250, 1.018, 1000),
  // 10-level shaft improvements.
  lights: curve(150, 1.8, 10),
  supports: curve(200, 1.8, 10),
  carts: curve(400, 1.8, 10),
  bunkhouse: curve(100, 1.8, 10),
  // Translation short tracks.
  vocabulary: curve(10_000, 1.10, 100),
  accuracy: curve(20_000, 1.12, 75),
  languages: curve(5_000_000, 1.35, 12), // cap is the world's distinct language count; 12 is a placeholder until world generation sets it
  // Intelligence tiers 1..5.
  intelligence: series([100_000_000, 1_000_000_000, 10_000_000_000, 100_000_000_000, 1_000_000_000_000]),
});

function levelPrice(spec, level) {
  const raw = spec.kind === 'list' ? spec.prices[level] : Math.max(1, roundHalfUp(spec.base * spec.growth ** level));
  if (!Number.isSafeInteger(raw) || raw < 1 || raw > MAX) fail('OVERFLOW', 'Level price exceeds safe integer range');
  return raw;
}

function spec(curveId) {
  const found = Object.hasOwn(CURVES, curveId) ? CURVES[curveId] : undefined;
  if (!found) fail('UNKNOWN_UPGRADE', `Unknown upgrade line: ${String(curveId)}`);
  return found;
}
function checkLevel(level, cap) {
  if (!Number.isSafeInteger(level) || level < 0 || level > cap) fail('INVALID_LEVEL', 'Level must be an integer within the line cap');
  return level;
}

/** Cost of buying level L+1 when currently at level L. */
export function nextLevelPrice(curveId, level) {
  const s = spec(curveId);
  checkLevel(level, s.cap);
  if (level >= s.cap) fail('AT_CAP', 'Line is at its cap');
  return levelPrice(s, level);
}

/** Exact bulk price: the sum of individually rounded level prices. */
export function bulkPrice(curveId, level, count) {
  const s = spec(curveId);
  checkLevel(level, s.cap);
  if (!Number.isSafeInteger(count) || count < 1) fail('INVALID_COUNT', 'Count must be a positive integer');
  if (level + count > s.cap) fail('AT_CAP', 'Purchase would exceed the line cap');
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    total += levelPrice(s, level + i);
    if (!Number.isSafeInteger(total)) fail('OVERFLOW', 'Bulk price exceeds safe integer range');
  }
  return total;
}

/**
 * Quote a Buy 1/10/100/Max request. `mode` is 1, 10, 100 or 'max'. Fixed counts are all-or-nothing
 * (rejected, never silently shrunk); Max buys as many levels as funds and the cap allow.
 */
export function quote(curveId, level, mode, funds) {
  const s = spec(curveId);
  checkLevel(level, s.cap);
  if (!Number.isSafeInteger(funds) || funds < 0) fail('INVALID_FUNDS', 'Funds must be a non-negative safe integer');
  if (level >= s.cap) fail('AT_CAP', 'Line is at its cap');
  if (mode === 'max') {
    let count = 0;
    let total = 0;
    while (level + count < s.cap) {
      const price = levelPrice(s, level + count);
      if (total + price > funds) break;
      total += price;
      count += 1;
    }
    if (count === 0) fail('INSUFFICIENT_FUNDS', 'Cannot afford the next level');
    return { count, total, newLevel: level + count };
  }
  if (![1, 10, 100].includes(mode)) fail('INVALID_MODE', 'Mode must be 1, 10, 100 or max');
  const total = bulkPrice(curveId, level, mode);
  if (total > funds) fail('INSUFFICIENT_FUNDS', 'Insufficient funds');
  return { count: mode, total, newLevel: level + mode };
}

// Facility and expansion prices that are not level lines.
export const MAX_SHAFTS = 30;
export function shaftPrice(shaftNumber) {
  if (!Number.isSafeInteger(shaftNumber) || shaftNumber < 2 || shaftNumber > MAX_SHAFTS) fail('INVALID_SHAFT', 'Shaft 1 is supplied and shaft 31 does not exist');
  return fixed(120 * 2.4 ** (shaftNumber - 1));
}
export function padPrice(padNumber) {
  if (!Number.isSafeInteger(padNumber) || padNumber < 2 || padNumber > 12) fail('INVALID_PAD', 'Pads 2 to 12 are purchasable');
  return fixed(4_000 * 6 ** (padNumber - 2));
}
export function dockPrice(dockNumber) {
  if (!Number.isSafeInteger(dockNumber) || dockNumber < 2 || dockNumber > 24) fail('INVALID_DOCK', 'Docks 2 to 24 are purchasable');
  return fixed(20_000_000 * 1.6 ** (dockNumber - 2));
}
/** nth outpost site price (n >= 1): 2B, then x2.5 each. */
export function outpostSitePrice(n) {
  if (!Number.isSafeInteger(n) || n < 1) fail('INVALID_OUTPOST', 'Outpost index must be a positive integer');
  return fixed(2_000_000_000 * 2.5 ** (n - 1));
}
export const FIRST_REFINERY_PRICE = 250_000_000;
export const FIRST_STATION_PRICE = 10_000_000_000;

function fixed(value) {
  const rounded = Math.max(1, roundHalfUp(value));
  if (!Number.isSafeInteger(rounded)) fail('OVERFLOW');
  return rounded;
}

/** Shaft improvements derived from level (section 10 / 03). */
export const shaftWorkerCapacity = (bunkhouseLevel) => 10 + 5 * bunkhouseLevel;
export const cartUtilization = (cartLevel) => Math.min(1, 0.25 + 0.075 * cartLevel);
export const supportHazardFactor = (supportLevel) => 100 ** (-supportLevel / 10);

/** C-01 proposal: total miner pool capacity. 1000 levels reach 2010, covering 30 shafts x 60 workers. */
export const habitatCapacity = (level) => 10 + 2 * level;
