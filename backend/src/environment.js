// Weather, soil, depth bands, vein placement and depletion (sections 03, 04). Pure and deterministic:
// no I/O, no clocks, no Math.random. Veins are server-only truth; clients get filtered read models only.
import { createStepRng } from './events.js';

export class EnvironmentError extends Error {
  constructor(code, message = code) { super(message); this.name = 'EnvironmentError'; this.code = code; }
}
const fail = (code, message = code) => { throw new EnvironmentError(code, message); };

// C-03 PROVISIONAL: every coefficient below is a tuning placeholder, not certified balance.
export const HOUR_SECONDS = 3600;
export const WEATHER_KINDS = Object.freeze(['clear', 'dust', 'storm', 'ash', 'cold']);
export const WEATHER_MODIFIERS = Object.freeze({ clear: 1.0, dust: 0.9, storm: 0.7, ash: 0.85, cold: 0.8 }); // C-03 PROVISIONAL
export const BASE_WEATHER_SHARE = 0.6; // C-03 PROVISIONAL: chance an hour matches the site's base weather
export const SOIL_MODIFIERS = Object.freeze({ loam: 1.10, basalt: 1.00, shale: 0.95, granite: 0.90, obsidian: 0.85 }); // C-03 PROVISIONAL
export const HARDNESS_STEP = 0.01; // C-03 PROVISIONAL: soil modifier loses 1% per hardness point above 5
export const SOIL_MODIFIER_MIN = 0.5; // C-03 PROVISIONAL
export const SOIL_MODIFIER_MAX = 1.25; // C-03 PROVISIONAL
export const MAX_SHAFT = 30;
export const DEPTH_BANDS = Object.freeze([ // section 04: shallow common; middle/deep add rare; only deepest has mythic
  { band: 'shallow', from: 1, to: 4 },
  { band: 'middle', from: 5, to: 12 },
  { band: 'deep', from: 13, to: 20 },
  { band: 'deepest', from: 21, to: 30 },
]);
export const VEIN_SHAFT_RANGE = Object.freeze({ rare: [5, 20], mythic: [21, 30] }); // C-03 PROVISIONAL
export const VEIN_SIZE_DEPTH_GROWTH = 0.05; // C-03 PROVISIONAL: +5% size per shaft below shaft 5
export const VEIN_WARN_FRACTION = 0.20; // C-03 PROVISIONAL (section 04: warning below 20%)
export const VEIN_TAPER_FRACTION = 0.05; // C-03 PROVISIONAL (section 04: output falls in proportion below 5%)
export const VEIN_TAPER_FLOOR = 0.02; // C-03 PROVISIONAL: minimum factor so a tapering vein finishes in finite time

const isSec = (n) => Number.isSafeInteger(n) && n >= 0;
function checkEnv(env) {
  if (!env || typeof env !== 'object' || typeof env.weatherSeed !== 'string' || env.weatherSeed.length < 8 || env.weatherSeed.length > 256
    || !WEATHER_KINDS.includes(env.baseWeather)) fail('INVALID_ENV');
}

// Raw roll for one hour (before grounding rules). O(1): one seeded RNG scope per hour index.
function rawKind(env, hour) {
  const rng = createStepRng(env.weatherSeed, 'weather', hour);
  return rng.next() < BASE_WEATHER_SHARE ? env.baseWeather : WEATHER_KINDS[rng.int(WEATHER_KINDS.length)];
}
// A storm grounds ships unless the previous hour's raw roll was also a storm, so grounded hours never touch.
function groundedHour(env, hour) {
  return rawKind(env, hour) === 'storm' && !(hour > 0 && rawKind(env, hour - 1) === 'storm');
}

export function weatherAt(env, sec) {
  checkEnv(env);
  if (!isSec(sec)) fail('INVALID_SECOND');
  const hour = Math.floor(sec / HOUR_SECONDS);
  const kind = rawKind(env, hour);
  return { kind, productionModifier: WEATHER_MODIFIERS[kind], grounded: groundedHour(env, hour) };
}

export function groundedUntil(env, sec) {
  checkEnv(env);
  if (!isSec(sec)) fail('INVALID_SECOND');
  const hour = Math.floor(sec / HOUR_SECONDS);
  // Next hour can never also be grounded, so at most one hop.
  return groundedHour(env, hour) ? (hour + 1) * HOUR_SECONDS : sec;
}

export function nextWeatherChange(sec) {
  if (!isSec(sec)) fail('INVALID_SECOND');
  return (Math.floor(sec / HOUR_SECONDS) + 1) * HOUR_SECONDS;
}

export function soilModifier(soil, soilHardness) {
  if (typeof soil !== 'string' || !Object.hasOwn(SOIL_MODIFIERS, soil)) fail('UNKNOWN_SOIL');
  if (!Number.isInteger(soilHardness) || soilHardness < 1 || soilHardness > 10) fail('INVALID_HARDNESS');
  const value = SOIL_MODIFIERS[soil] * (1 - HARDNESS_STEP * (soilHardness - 5));
  return Math.min(SOIL_MODIFIER_MAX, Math.max(SOIL_MODIFIER_MIN, value));
}

export function bandForShaft(k) {
  if (!Number.isInteger(k) || k < 1 || k > MAX_SHAFT) fail('INVALID_SHAFT');
  return DEPTH_BANDS.find((b) => k >= b.from && k <= b.to).band;
}

export function assignVeins({ seed, ores, deposits }) {
  if (!Array.isArray(ores) || !Array.isArray(deposits)) fail('INVALID_INPUT');
  if (typeof seed !== 'string' || seed.length < 8 || seed.length > 256) fail('INVALID_SEED');
  const rng = createStepRng(seed, 'veins', 0);
  const used = new Set();
  const out = [];
  deposits.forEach((deposit, di) => {
    const ore = ores[deposit?.oreIndex];
    if (!ore) fail('INVALID_DEPOSIT');
    if (ore.tier === 'common') return; // common ore is infinite and has no vein
    const range = VEIN_SHAFT_RANGE[ore.tier];
    if (!range) fail('INVALID_TIER');
    const floor = range[0] - 1; // weight = k-4 (rare), k-20 (mythic)
    (deposit.veins ?? []).forEach((v, vi) => {
      if (!(v?.units > 0)) return;
      const open = [];
      for (let k = range[0]; k <= range[1]; k += 1) if (!used.has(k)) open.push(k);
      if (open.length === 0) return; // excess veins dropped deterministically
      let roll = rng.next() * open.reduce((s, k) => s + (k - floor), 0);
      let shaft = open[open.length - 1];
      for (const k of open) { roll -= k - floor; if (roll < 0) { shaft = k; break; } }
      used.add(shaft);
      const size = Math.max(1, Math.round(v.units * (1 + VEIN_SIZE_DEPTH_GROWTH * (shaft - 5))));
      out.push({ id: `vein-${di}-${vi}`, oreId: ore.id, tier: ore.tier, shaftNumber: shaft, size, remaining: size });
    });
  });
  return out;
}

function checkVein(vein) {
  if (!vein || !Number.isFinite(vein.size) || vein.size <= 0 || !Number.isFinite(vein.remaining) || vein.remaining < 0) fail('INVALID_VEIN');
}

export function veinOutputFactor(vein) {
  checkVein(vein);
  if (vein.remaining <= 0) return 0;
  const fraction = vein.remaining / vein.size;
  if (fraction >= VEIN_TAPER_FRACTION) return 1;
  return Math.max(VEIN_TAPER_FLOOR, vein.remaining / (VEIN_TAPER_FRACTION * vein.size));
}

export function veinWarning(vein) {
  checkVein(vein);
  if (vein.remaining <= 0) return 'DEPLETED';
  const fraction = vein.remaining / vein.size;
  if (fraction < VEIN_TAPER_FRACTION) return 'CRITICAL';
  return fraction < VEIN_WARN_FRACTION ? 'LOW' : null;
}

export function mineFromVein(vein, requestedUnits) {
  checkVein(vein);
  if (typeof requestedUnits !== 'number' || !Number.isFinite(requestedUnits) || requestedUnits < 0) fail('INVALID_UNITS');
  const mined = Math.min(requestedUnits * veinOutputFactor(vein), vein.remaining);
  return { mined, vein: { ...vein, remaining: Math.max(0, vein.remaining - mined) } };
}
