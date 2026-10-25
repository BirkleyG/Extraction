// C-01 early-game calibration study: a greedy "active" player on the section 03/05/10 formulas.
// Coarse steady-state flow model (not the authoritative engine): it exists to choose price/hire
// coefficients and to measure first-minute cadence. Output is evidence, not balance certification.
import { nextLevelPrice, shaftPrice, padPrice } from '../src/upgrades.js';

const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? Number(hit.split('=')[1]) : fallback; };
export const params = {
  unitPrice: arg('price', 40),        // coin per raw unit at the nearest NPC refinery (per-tier multipliers ignored)
  hireBase: arg('hire', 20),
  hireGrowth: arg('hireGrowth', 1.004),
  minLoadUnits: arg('minLoad', 1),     // partial-load departure threshold (units)
  distance: arg('distance', 1),
  unloadPerMin: arg('unload', 1500),
  hours: arg('hours', 24),
  liftBase: 2, liftGrowth: 1.0316,
};

const habitatCap = (level) => 10 + 2 * level;
function mineRate(s) {
  let total = 0;
  for (const sh of s.shafts) {
    const util = Math.min(1, 0.25 + 0.075 * sh.cart);
    total += sh.workers * 2.2 ** (sh.n - 1) * (1 + 0.04 * sh.dig) * util;
  }
  return total;
}
const liftRate = (s) => params.liftBase * params.liftGrowth ** s.lift;
function shipThroughput(s) {
  const cap = 150 * (1 + 0.04 * s.shipCap);
  const speed = 0.5 * (1 + 0.04 * s.shipSpeed);
  const load = 60 * (1 + 0.04 * s.loading);
  const trip = 2 * params.distance / speed + cap / params.unloadPerMin + cap / load;
  return (cap / trip) * (1 + 0) * s.ships;
}
function incomePerMin(s) { return params.unitPrice * Math.min(mineRate(s), liftRate(s), shipThroughput(s)); }

const hireCost = (s) => Math.round(params.hireBase * params.hireGrowth ** (s.workers - 5));
// Capacity packages: pay for habitat levels as needed, then staff the new capacity. Tracks the extra spend on t.__extra.
function ensureHabitat(t, need) {
  while (t.shafts.reduce((a, x) => a + x.workers, 0) + need > habitatCap(t.habitat) && t.habitat < 1000) { t.__extra += nextLevelPrice('habitat', t.habitat); t.habitat += 1; }
}
function options(s) {
  const out = [];
  const totalWorkers = s.shafts.reduce((a, x) => a + x.workers, 0);
  const habCap = habitatCap(s.habitat);
  s.shafts.forEach((sh, i) => {
    if (sh.dig < 1000) out.push({ id: `dig${sh.n}`, cost: nextLevelPrice('dig', sh.dig), apply: (t) => { t.shafts[i].dig += 1; } });
    if (sh.cart < 10) out.push({ id: `cart${sh.n}`, cost: nextLevelPrice('carts', sh.cart), apply: (t) => { t.shafts[i].cart += 1; } });
    if (sh.bunk < 10) out.push({ id: `bunk${sh.n}`, enabler: true, cost: nextLevelPrice('bunkhouse', sh.bunk), apply: (t) => { t.__extra = 0; ensureHabitat(t, 5); t.shafts[i].bunk += 1; } });
    if (sh.workers < 10 + 5 * sh.bunk && totalWorkers < habCap) out.push({ id: `hire${sh.n}`, cost: hireCost({ workers: totalWorkers }), apply: (t) => { t.shafts[i].workers += 1; } });
  });
  if (s.habitat < 1000) out.push({ id: 'habitat', enabler: true, cost: nextLevelPrice('habitat', s.habitat), apply: (t) => { t.habitat += 1; } });
  // Opening a shaft is evaluated together with staffing it (up to 5 miners, habitat space permitting).
  if (s.shafts.length < 30) {
    out.push({ id: 'shaft', enabler: true, cost: shaftPrice(s.shafts.length + 1), apply: (t) => { t.__extra = 0; ensureHabitat(t, 5); t.shafts.push({ n: t.shafts.length + 1, dig: 1, cart: 0, bunk: 0, workers: 0 }); } });
  }
  if (s.lift < 1000) out.push({ id: 'lift', cost: nextLevelPrice('lift', s.lift), apply: (t) => { t.lift += 1; } });
  if (s.shipCap < 1000) out.push({ id: 'shipCap', cost: nextLevelPrice('shipCapacity', s.shipCap), apply: (t) => { t.shipCap += 1; } });
  if (s.shipSpeed < 1000) out.push({ id: 'shipSpeed', cost: nextLevelPrice('shipSpeed', s.shipSpeed), apply: (t) => { t.shipSpeed += 1; } });
  if (s.loading < 1000) out.push({ id: 'loading', cost: nextLevelPrice('padLoading', s.loading), apply: (t) => { t.loading += 1; } });
  if (s.ships < 12) out.push({ id: 'pad+ship', cost: padPrice(s.ships + 1) + 3000 * 2 ** (s.ships - 1), apply: (t) => { t.ships += 1; } });
  return out;
}
const copy = (s) => JSON.parse(JSON.stringify(s));
// Enabler purchases (habitat, bunkhouse, shaft) only pay off once staffed, so they are evaluated with up to 5 follow-on hires.
function staff(t, max = 5) {
  let cost = 0;
  for (let k = 0; k < max; k += 1) {
    const total = t.shafts.reduce((a, x) => a + x.workers, 0);
    if (total >= habitatCap(t.habitat)) break;
    const open = t.shafts.filter((x) => x.workers < 10 + 5 * x.bunk).sort((a, b) => b.n - a.n)[0];
    if (!open) break;
    cost += hireCost({ workers: total }); open.workers += 1;
  }
  return cost;
}

export function simulate() {
  const s = { shafts: [{ n: 1, dig: 1, cart: 0, bunk: 0, workers: 5 }], habitat: 0, lift: 1, shipCap: 0, shipSpeed: 0, loading: 0, ships: 1, workers: 5 };
  let coin = 0, earned = 0, yard = 0, shipReadyAt = 0, buys = [], firstSale = null;
  const checkpoints = { 3600: null, 21600: null, 86400: null };
  const end = params.hours * 3600;
  let rows = [];
  for (let t = 1; t <= end; t += 1) {
    const mined = Math.min(mineRate(s), liftRate(s)) / 60;
    yard += mined;
    // ship departs when ready and yard has at least the minimum load (ships > 1 modeled as faster turnaround)
    const cap = 150 * (1 + 0.04 * s.shipCap);
    if (t >= shipReadyAt && yard >= Math.min(params.minLoadUnits, cap)) {
      const units = Math.floor(Math.min(yard, cap));
      if (units >= 1) {
        const pay = Math.round(units * params.unitPrice);
        coin += pay; earned += pay; yard -= units;
        if (firstSale === null) firstSale = t;
        const speed = 0.5 * (1 + 0.04 * s.shipSpeed);
        shipReadyAt = t + ((2 * params.distance / speed + units / params.unloadPerMin) * 60) / s.ships;
      }
    }
    if (t > 3600 && t % 30 !== 0) continue_buy: { /* buyer acts every 30s after the first hour (speed) */ }
    // Stage-aware buyer: improve the currently binding stage (mine / lift / ships) with its best cost-per-throughput option.
    for (let guard = 0; guard < (t > 3600 && t % 30 !== 0 ? 0 : 2000); guard += 1) {
      const rates = { mine: mineRate(s), lift: liftRate(s), ship: shipThroughput(s) };
      const binding = Object.entries(rates).sort((a, b) => a[1] - b[1])[0][0];
      const measure = { mine: mineRate, lift: liftRate, ship: shipThroughput }[binding];
      const stageOf = (id) => (id === 'lift' ? 'lift' : /^(shipCap|shipSpeed|loading|pad)/.test(id) ? 'ship' : 'mine');
      const base = measure(s);
      const opts = options(s).filter((o) => stageOf(o.id) === binding).map((o) => {
        const n = copy(s); n.__extra = 0; o.apply(n); const extra = (o.enabler ? staff(n) : 0) + n.__extra;
        n.workers = n.shafts.reduce((a, x) => a + x.workers, 0);
        const gain = measure(n) - base; return { ...o, totalCost: o.cost + extra, gain, ratio: gain > 0 ? (o.cost + extra) / gain : Infinity };
      }).filter((o) => o.gain > 0).sort((a, b) => a.ratio - b.ratio);
      const pick = opts.find((o) => o.totalCost <= coin && o.ratio <= (opts[0]?.ratio ?? 0) * 3);
      if (!pick) break;
      s.__extra = 0; pick.apply(s); if (pick.enabler) staff(s); s.workers = s.shafts.reduce((a, x) => a + x.workers, 0);
      coin -= pick.totalCost; buys.push({ t, id: pick.id, cost: pick.totalCost });
    }
    for (const k of Object.keys(checkpoints)) if (t === Number(k)) checkpoints[k] = earned;
    if (t % 3600 === 0 && rows.length < 800) rows.push({ hour: t / 3600, earned, income: Math.round(incomePerMin(s)), shafts: s.shafts.length, ships: s.ships });
  }
  return { firstSale, checkpoints, buys, rows, final: s };
}

if (process.argv[1].endsWith('calibrate-early.mjs')) {
  const r = simulate();
  const gaps = r.buys.filter((b) => b.t <= 3600).map((b) => b.t);
  console.log('params', JSON.stringify(params));
  console.log('first sale (s):', r.firstSale, ' first purchase (s):', r.buys[0]?.t);
  console.log('purchases in first 60s:', r.buys.filter((b) => b.t <= 60).length, ' first 5 min:', r.buys.filter((b) => b.t <= 300).length, ' first hour:', gaps.length);
  let maxGap = 0; for (let i = 1; i < gaps.length; i += 1) maxGap = Math.max(maxGap, gaps[i] - gaps[i - 1]);
  console.log('max gap between purchases in hour 1 (s):', maxGap);
  console.log('earned @1h/6h/24h:', r.checkpoints[3600], r.checkpoints[21600], r.checkpoints[86400], ' targets: 1e5 / 3e6 / 1e8');
  console.log(r.rows.filter((x) => [1, 2, 6, 24, 72, 120, 168].includes(x.hour)).map((x) => JSON.stringify(x)).join('\n'));
}
if (process.argv.includes('--debug')) {
  const r = simulate(); const s = r.final;
  console.log(JSON.stringify(s), 'mine', mineRate(s).toFixed(1), 'lift', liftRate(s).toFixed(1), 'ship', shipThroughput(s).toFixed(1));
}
if (process.argv.includes('--opts')) {
  const r = simulate(); const s = r.final; s.__extra = 0;
  const base = mineRate(s);
  for (const o of options(s).filter((o) => /^(dig|cart|bunk|hire|habitat|shaft)/.test(o.id)).slice(0, 12)) {
    const n = copy(s); n.__extra = 0; o.apply(n); const extra = (o.enabler ? staff(n) : 0) + n.__extra;
    console.log(o.id, o.cost, extra, (mineRate(n) - base).toFixed(3));
  }
  console.log(buysTail(r));
}
function buysTail(r) { return JSON.stringify(r.buys.slice(-5)); }
if (process.argv.includes('--why')) {
  const r = simulate(); const s = r.final;
  const rates = { mine: mineRate(s), lift: liftRate(s), ship: shipThroughput(s) };
  console.log(rates);
  for (const st of ['mine', 'lift', 'ship']) {
    const measure = { mine: mineRate, lift: liftRate, ship: shipThroughput }[st];
    const stageOf = (id) => (id === 'lift' ? 'lift' : /^(shipCap|shipSpeed|loading|pad)/.test(id) ? 'ship' : 'mine');
    const base = measure(s);
    const o = options(s).filter((x) => stageOf(x.id) === st).map((x) => { const n = copy(s); n.__extra = 0; x.apply(n); const ex = (x.enabler ? staff(n) : 0) + n.__extra; const g = measure(n) - base; return [x.id, x.cost + ex, +g.toFixed(3), g > 0 ? Math.round((x.cost + ex) / g) : null]; }).filter((x) => x[3] !== null).sort((a, b) => a[3] - b[3]).slice(0, 4);
    console.log(st, JSON.stringify(o));
  }
}
