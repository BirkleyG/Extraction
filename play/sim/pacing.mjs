/* Pacing study for the /play/ sandbox economy. A fluid approximation of the engine (ore flows through dig -> lift -> hauler -> buyer)
 * driven by a greedy best-payback player. Prints milestone tables against the rulebook section 10 benchmark.
 * Nothing here certifies balance: C-coefficients stay provisional.
 *   node play/sim/pacing.mjs [active|casual|idle|all]            */
import {
  DESTINATIONS, LINE_IDS, LEVEL_CAP, MAX_SHAFTS, MINERS_PER_SHAFT, START_YARD_UNITS, TUNE, depthFactor, haulerCapacity, haulerSpeed, liftRate, lineCost, pickRatePerMiner, shaftCost, tripSeconds,
} from '../economy.js';

export const DAY = 86400;
/** rulebook section 10 active benchmark: cumulative earnings at these times */
export const BENCHMARK = [['1 hour', 3600, 1e5], ['6 hours', 6 * 3600, 3e6], ['1 day', DAY, 1e8], ['5 days', 5 * DAY, 5.0625e8], ['7 days', 7 * DAY, 1.139e9], ['14 days', 14 * DAY, 1.9462e10], ['21 days', 21 * DAY, 3.32526e11], ['28 days', 28 * DAY, 5.682e12], ['30 days', 30 * DAY, 1.2783e13]];
export const MILESTONES = [['10 sec', 10], ['1 min', 60], ['5 min', 300], ['15 min', 900], ...BENCHMARK.map(([label, at]) => [label, at])].sort((a, b) => a[1] - b[1]);

/** the mine's physical flows at a given set of levels, in units per second, and the coin per second the best buyer yields */
export function flows(s, t = TUNE) {
  let dig = 0;
  for (let k = 1; k <= s.shafts; k += 1) dig += MINERS_PER_SHAFT * pickRatePerMiner(s.pick, t) * depthFactor(k, t) / 60;
  const lift = liftRate(s.lift, t) / 60;
  const supply = Math.min(dig, lift);
  const capacity = haulerCapacity(s.hauler, t); const speed = haulerSpeed(s.hauler, t);
  let best = { coinPerSec: 0, destination: DESTINATIONS[0], haul: 0 };
  for (const d of DESTINATIONS) {
    const haul = capacity / tripSeconds(d, speed);
    const coinPerSec = Math.min(supply, haul) * d.basePrice;
    if (coinPerSec > best.coinPerSec) best = { coinPerSec, destination: d, haul };
  }
  return { dig, lift, supply, haul: best.haul, coinPerSec: best.coinPerSec, destination: best.destination };
}

function options(s, t) {
  const out = [];
  for (const id of LINE_IDS) if (s[id] < LEVEL_CAP && Number.isSafeInteger(lineCost(id, s[id], t))) out.push({ id, cost: lineCost(id, s[id], t), next: { ...s, [id]: s[id] + 1 } });
  if (s.shafts < MAX_SHAFTS && Number.isSafeInteger(shaftCost(s.shafts + 1, t))) out.push({ id: 'shaft', cost: shaftCost(s.shafts + 1, t), next: { ...s, shafts: s.shafts + 1 } });
  return out;
}

/** score = payback seconds (cost / extra coin per second). A step that adds nothing today but unlocks a later one is scored on a two-step look-ahead. */
function score(o, income, t) {
  let gain = flows(o.next, t).coinPerSec - income;
  if (gain <= 1e-12) for (const o2 of options(o.next, t)) gain = Math.max(gain, (flows(o2.next, t).coinPerSec - income) / 2);
  return gain > 1e-12 ? o.cost / gain : Infinity;
}

/** profile.visitEvery = seconds between visits (0 = always at the keyboard, buys the moment the best option is affordable).
 * Visiting players buy the best affordable option repeatedly at each visit and otherwise let the mine run. */
export function simulate({ visitEvery = 0, horizon = 30 * DAY, tune = TUNE } = {}) {
  const t = tune; const s = { pick: 0, lift: 0, hauler: 0, shafts: 1 };
  let now = 0; let coins = START_YARD_UNITS * DESTINATIONS[0].basePrice; let earned = coins; let purchases = 0;
  const rows = []; let next = 0;
  const snap = (label, at) => { const f = flows(s, t); rows.push({ label, at, earned, coins, income: f.coinPerSec, destination: f.destination.name, ...s, purchases }); };
  const advanceTo = (target) => {
    while (next < MILESTONES.length && MILESTONES[next][1] <= target) {
      const dt = MILESTONES[next][1] - now; const inc = flows(s, t).coinPerSec; coins += inc * dt; earned += inc * dt; now = MILESTONES[next][1];
      snap(MILESTONES[next][0], now); next += 1;
    }
    const inc = flows(s, t).coinPerSec; coins += inc * (target - now); earned += inc * (target - now); now = target;
  };
  let guard = 0;
  while (now < horizon && guard++ < 400000) {
    const income = flows(s, t).coinPerSec;
    if (!visitEvery) {
      let best = null; let cheap = null;
      for (const o of options(s, t)) { const sc = score(o, income, t); const rec = { ...o, sc }; if (!best || sc < best.sc) best = rec; if (o.cost <= coins && (!cheap || sc < cheap.sc)) cheap = rec; }
      if (!best) { advanceTo(horizon); break; }
      // an attentive player takes any affordable deal that pays back within twice the best deal's payback, otherwise saves for the best
      if (cheap && cheap.sc <= best.sc * 2) best = cheap;
      if (coins < best.cost) { if (income <= 0) { advanceTo(horizon); break; } advanceTo(Math.min(horizon, now + (best.cost - coins) / income)); if (now >= horizon) break; coins = Math.max(coins, best.cost); }
      coins -= best.cost; Object.assign(s, best.next); purchases += 1;
    } else {
      if (guard > 1) { advanceTo(Math.min(horizon, (Math.floor(now / visitEvery + 1e-9) + 1) * visitEvery)); if (now >= horizon) break; }
      for (;;) {
        const inc = flows(s, t).coinPerSec; let best = null;
        for (const o of options(s, t)) if (o.cost <= coins) { const sc = score(o, inc, t); if (!best || sc < best.sc) best = { ...o, sc }; }
        if (!best) break;
        coins -= best.cost; Object.assign(s, best.next); purchases += 1;
      }
    }
  }
  advanceTo(horizon);
  if (!rows.length || rows.at(-1).at < horizon) snap('horizon', horizon);
  return rows;
}

export const PROFILES = { active: 0, casual: DAY / 3, idle: DAY };
const fmt = (v) => { const units = [[1e15, 'Qa'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]; for (const [at, u] of units) if (v >= at) return `${(v / at).toFixed(v / at < 10 ? 2 : 1)}${u}`; return v.toFixed(v < 10 ? 1 : 0); };
export function table(rows) {
  const bench = new Map(BENCHMARK.map(([label, , target]) => [label, target]));
  const head = 'when      earned     benchmark  income/s   shafts pick lift haul buys  buyer';
  return [head, ...rows.map((r) => `${r.label.padEnd(9)} ${fmt(r.earned).padStart(8)}  ${(bench.has(r.label) ? fmt(bench.get(r.label)) : '').padStart(9)}  ${fmt(r.income).padStart(9)}  ${String(r.shafts).padStart(5)} ${String(r.pick).padStart(4)} ${String(r.lift).padStart(4)} ${String(r.hauler).padStart(4)} ${String(r.purchases).padStart(4)}  ${r.destination}`)].join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const which = process.argv[2] || 'all';
  for (const [name, every] of Object.entries(PROFILES)) {
    if (which !== 'all' && which !== name) continue;
    console.log(`\n== ${name} (${every ? `visits every ${every / 3600} h` : 'always playing'}) ==`);
    console.log(table(simulate({ visitEvery: every })));
  }
}
