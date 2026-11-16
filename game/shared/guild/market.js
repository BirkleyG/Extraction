// The galactic market: nested CES demand from galactic buyers, outside suppliers with rising supply curves,
// and this planet as a low-cost newcomer. Prices are never set by hand: they clear the market.
//
//   Buyer k:  U = ( a·X_mat^ρ0 + (1-a)·N^ρ0 )^(1/ρ0)                     materials vs everything else (numeraire, price 1)
//             X_mat = ( Σ_u β·X_u^ρ1 )^(1/ρ1)                               across uses (hull plating, reactor fuel, ...)
//             X_u   = ( Σ_{i in u} α_ki·x_i^ρ2 )^(1/ρ2)                     across ores within one use (σ2 per buyer)
//   Spending share in a nest: s_i = α_i^σ · p_i^(1-σ) / Σ_j α_j^σ · p_j^(1-σ),   σ = 1/(1-ρ)
//   Ore i clears where  Σ_k x_ki(p) = S_out,i(p) + Q_i
//     S_out,i(p) = S0_i · (p/p̄_i)^η_tier      (outside suppliers, upward sloping)
//     Q_i = this planet's supply (an EMA of recent sales, refined units per hour)
//   Calibrated so that at the expected planet supply (tier share of galactic demand) the price is the baseline p̄_i.
//
// Goods are measured in baseline-value units inside the solver (x̂ = x · p̄), so ores worth 10 and 5,000 mix cleanly.
// World changes shift budgets, needs and outside supply, never prices: global/buyer -> budget, demand -> need, supply -> S0.
import { G } from './tuning.js';
import { hash, clamp } from './util.js';

const M = G.market;
const cache = new Map();

export function oreInfo(planet) {
  return (planet.ores || []).map((o, i) => {
    const tier = ['common', 'rare', 'mythic'].includes(o.tier) ? o.tier : 'common';
    const base = Number(o.baseValue) > 0 ? Number(o.baseValue) : { common: 2, rare: 20, mythic: 450 }[tier];
    let hardness = clamp(Math.round(Number(o.hardness) || 1), 1, 10);
    if (tier === 'mythic') hardness = Math.max(9, hardness);
    return { id: String(o.id), name: o.name || 'Ore ' + (i + 1), tier, use: String(o.use || 'industry'), hardness, base, pbar: base * M.priceScale, i, color: o.color };
  });
}

// Build the calibrated market for this planet and its buyers (world.parties). Cached per planet + party set.
export function buildMarket(planet, parties = []) {
  const key = planet.id + ':' + parties.map((p) => p.id).join(',');
  if (cache.has(key)) return cache.get(key);
  const ores = oreInfo(planet);
  const n = ores.length;
  const uses = [...new Set(ores.map((o) => o.use))];
  const useOf = ores.map((o) => uses.indexOf(o.use));
  const list = parties.length ? parties : [{ id: 'galaxy', demand: 60, sigma: 2.5, wants: Object.fromEntries(ores.map((o) => [o.id, 0.6])) }];
  const buyers = list.map((p) => ({
    id: p.id,
    w: Math.max(0.05, Number(p.demand) || 60),
    s2: clamp(Number(p.sigma) || 2.5, 1.2, 6),
    alpha: ores.map((o) => Math.max(0, Number(p.wants?.[o.id]) || 0)),
    a: 0.5, M: 1,
  }));
  // every ore needs someone who wants it
  for (let i = 0; i < n; i++) if (!buyers.some((b) => b.alpha[i] > 0)) for (const b of buyers) b.alpha[i] = 0.05;
  const target = ores.map((o) => M.target[o.tier]);
  const V = ores.map((o, i) => target[i] * o.pbar); // coin per hour of galactic demand at baseline
  const totalV = V.reduce((a, b) => a + b, 0);
  const wSum = buyers.reduce((a, b) => a + b.w, 0);
  for (const b of buyers) b.M = (totalV / M.matShare) * (b.w / wSum);
  const mk = { planetId: planet.id, ores, uses, useOf, buyers, n, S0: new Array(n).fill(0), eta: ores.map((o) => M.eta[o.tier]), target };
  const ones = new Array(n).fill(1);
  for (let it = 0; it < 60; it++) {
    for (const b of buyers) fitTop(mk, b);
    const d = demandValue(mk, ones, null);
    let worst = 0;
    for (let i = 0; i < n; i++) {
      const r = V[i] / Math.max(1e-9, d[i]);
      worst = Math.max(worst, Math.abs(Math.log(r)));
      for (const b of buyers) if (b.alpha[i] > 0) b.alpha[i] *= Math.pow(r, 0.5 / b.s2);
    }
    if (worst < 1e-4) break;
  }
  for (const b of buyers) fitTop(mk, b);
  for (let i = 0; i < n; i++) mk.S0[i] = target[i] * (1 - M.share[ores[i].tier]);
  mk.expected = ores.map((o, i) => target[i] * M.share[o.tier]); // planet supply at which p = p̄
  if (cache.size > 20) cache.delete(cache.keys().next().value);
  cache.set(key, mk);
  return mk;
}

// Pick the top-nest weight so that at baseline prices 30% of the budget goes to materials.
function fitTop(mk, b) {
  const Pm = nestPrices(mk, b, new Array(mk.n).fill(1), 1).Pm;
  const s0 = M.sigma0;
  const r = (M.matShare / (1 - M.matShare)) * Math.pow(Pm, s0 - 1);
  const q = Math.pow(r, 1 / s0);
  b.a = q / (1 + q);
}

function nestPrices(mk, b, ph, tasteMult) {
  const s1 = M.sigma1, U = mk.uses.length;
  const Su = new Array(U).fill(0);
  for (let i = 0; i < mk.n; i++) {
    const al = b.alpha[i] * (tasteMult === 1 ? 1 : tasteMult[i] ?? 1);
    if (al > 0) Su[mk.useOf[i]] += Math.pow(al, b.s2) * Math.pow(ph[i], 1 - b.s2);
  }
  const Pu = Su.map((s) => (s > 0 ? Math.pow(s, 1 / (1 - b.s2)) : 0));
  let T = 0;
  for (let u = 0; u < U; u++) if (Pu[u] > 0) T += Math.pow(Pu[u], 1 - s1);
  const Pm = Math.pow(T, 1 / (1 - s1));
  return { Su, Pu, T, Pm };
}

// Spending (coin/hr at baseline value units) of every buyer on every ore, summed: returns x̂_i (value units/hr) per ore,
// or per buyer when `per` is given (an array to fill).
function demandValue(mk, ph, mods, per) {
  const out = new Array(mk.n).fill(0);
  const s0 = M.sigma0, s1 = M.sigma1;
  for (let k = 0; k < mk.buyers.length; k++) {
    const b = mk.buyers[k];
    const taste = 1;
    const budget = b.M * (mods ? mods.budget[k] : 1);
    const { Su, Pu, T, Pm } = nestPrices(mk, b, ph, taste);
    const A = Math.pow(b.a, s0) * Math.pow(Pm, 1 - s0), B = Math.pow(1 - b.a, s0);
    const sm = A / (A + B);
    for (let i = 0; i < mk.n; i++) {
      const al = b.alpha[i] * (taste === 1 ? 1 : taste[i] ?? 1);
      if (!(al > 0)) continue;
      const u = mk.useOf[i];
      const su = Math.pow(Pu[u], 1 - s1) / T;
      const si = (Math.pow(al, b.s2) * Math.pow(ph[i], 1 - b.s2)) / Su[u];
      const x = ((budget * sm * su * si) / ph[i]) * (mods ? mods.need[i] : 1);
      out[i] += x;
      if (per) per[k][i] = x;
    }
  }
  return out;
}

// World changes in effect -> budget multipliers per buyer, need and outside supply per ore.
export function activeChanges(world, now) {
  return (world.changes || []).filter((c) => (c.at == null || c.at <= now) && (c.until == null || now < c.until));
}
function modsFor(mk, world, now) {
  const budget = mk.buyers.map(() => 1);
  const need = new Array(mk.n).fill(1);
  const supply = new Array(mk.n).fill(1);
  for (const c of activeChanges(world, now)) {
    const m = clamp(Number(c.mult) || 1, 0.2, 5);
    const oi = mk.ores.findIndex((o) => o.id === c.oreId);
    if (c.kind === 'global') budget.forEach((_, k) => (budget[k] *= m));
    else if (c.kind === 'buyer') {
      let k = mk.buyers.findIndex((b) => b.id === c.buyerId);
      if (k < 0) k = hash(c.id || c.buyerId || 'x') % mk.buyers.length; // events name planet buyers; pick a galactic one
      budget[k] *= m;
    } else if (c.kind === 'demand' && oi >= 0) need[oi] *= m; // buyers need more (or less) of it at any price
    else if (c.kind === 'supply' && oi >= 0) supply[oi] *= m;
  }
  return { budget, need, supply };
}

// Planet supply per ore (refined units/hr) from the world's sales EMA, decayed to `now`.
export function planetFlow(world, now) {
  const hl = G.market.flowHalfLife * 3_600_000;
  const out = {};
  for (const [id, f] of Object.entries(world.flow || {})) {
    const q = Number(f && f.q) || 0;
    out[id] = q * Math.pow(0.5, Math.max(0, now - (f.t ?? now)) / hl);
  }
  return out;
}

// Fold sales (refined units, already sold) into the planet flow EMA. Returns a new world.
export function recordSales(world, sales, now) {
  if (!sales || !Object.keys(sales).length) return world;
  const hlH = G.market.flowHalfLife;
  const flow = { ...(world.flow || {}) };
  const cur = planetFlow(world, now);
  for (const [id, amt] of Object.entries(sales)) {
    if (!(amt > 0)) continue;
    // an EMA of the rate: a sale of `amt` adds amt / (mean life in hours) to the hourly rate
    flow[id] = { q: (cur[id] || 0) + amt / (hlH / Math.LN2), t: now };
  }
  for (const id of Object.keys(flow)) if (!sales[id]) flow[id] = { q: cur[id] || 0, t: now };
  return { ...world, flow };
}

// Clearing prices for every ore. Returns { [oreId]: { p, pbar, idx, D, Q, out, share } }.
export function prices(world, now) {
  const mk = buildMarket(world.planet, world.parties || []);
  const flow = planetFlow(world, now);
  const mods = modsFor(mk, world, now);
  const Q = mk.ores.map((o) => flow[o.id] || 0);
  const key = Q.map((q) => q.toPrecision(4)).join(',') + '|' + hash(JSON.stringify([mods.budget, mods.supply, mods.need]));
  if (mk.last && mk.last.key === key) return mk.last.out;
  // Warm start from the last solution; per-ore Newton steps in log price (cross-ore effects are small, a few sweeps settle them).
  const ph = mk.last ? mk.last.ph.slice() : new Array(mk.n).fill(1);
  const supplyOut = (i, p) => mk.S0[i] * mods.supply[i] * Math.pow(p, mk.eta[i]);
  const excess = (i) => demandValue(mk, ph, mods)[i] / mk.ores[i].pbar - supplyOut(i, ph[i]) - Q[i];
  const lo = Math.log(M.lo), hi = Math.log(M.hi);
  for (let sweep = 0; sweep < 12; sweep++) {
    let moved = 0;
    for (let i = 0; i < mk.n; i++) {
      for (let it = 0; it < 8; it++) {
        const x = Math.log(ph[i]);
        const f0 = excess(i);
        const h = 1e-3;
        ph[i] = Math.exp(x + h);
        const f1 = excess(i);
        const dfx = (f1 - f0) / h;
        let nx = dfx < 0 ? x - f0 / dfx : x + (f0 > 0 ? 0.5 : -0.5);
        nx = clamp(nx, Math.max(lo, x - 1), Math.min(hi, x + 1));
        ph[i] = Math.exp(nx);
        moved = Math.max(moved, Math.abs(nx - x));
        if (Math.abs(nx - x) < 1e-5) break;
      }
    }
    if (moved < 1e-5) break;
  }
  const D = demandValue(mk, ph, mods);
  const out = {};
  mk.ores.forEach((o, i) => {
    const d = D[i] / o.pbar;
    out[o.id] = { p: o.pbar * ph[i], pbar: o.pbar, idx: ph[i], D: d, Q: Q[i], out: supplyOut(i, ph[i]), share: d > 0 ? Q[i] / d : 0, tier: o.tier };
  });
  mk.last = { key, out, ph: ph.slice(), mods };
  return out;
}

// What one buyer would take of each ore at today's prices (units/hr). Used to size contracts. Hidden from players.
export function buyerDemand(world, now, buyerId) {
  const mk = buildMarket(world.planet, world.parties || []);
  prices(world, now);
  const per = mk.buyers.map(() => new Array(mk.n).fill(0));
  demandValue(mk, mk.last.ph, mk.last.mods, per);
  const k = mk.buyers.findIndex((b) => b.id === buyerId);
  if (k < 0) return {};
  return Object.fromEntries(mk.ores.map((o, i) => [o.id, per[k][i] / o.pbar]));
}

// Price if the planet supplied `Q` (units/hr) of one ore, everything else as now. For "what if I flood it" intel.
export function priceAt(world, now, oreId, Q) {
  const mk = buildMarket(world.planet, world.parties || []);
  prices(world, now);
  const i = mk.ores.findIndex((o) => o.id === oreId);
  if (i < 0) return 0;
  const ph = mk.last.ph.slice();
  const mods = mk.last.mods;
  let lo = Math.log(M.lo), hi = Math.log(M.hi);
  for (let it = 0; it < 32; it++) {
    const mid = (lo + hi) / 2; ph[i] = Math.exp(mid);
    const d = demandValue(mk, ph, mods)[i] / mk.ores[i].pbar;
    if (d - mk.S0[i] * mods.supply[i] * Math.pow(ph[i], mk.eta[i]) - Q > 0) lo = mid; else hi = mid;
  }
  return mk.ores[i].pbar * Math.exp((lo + hi) / 2);
}
