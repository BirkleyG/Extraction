// Refineries and hidden-demand buyer parties (Phase 3).
//
// A refinery turns raw ore into refined goods (raw grade units x yield) and sells them continuously
// to the month's buyer parties at the player's ask (a markup on the product's base value).
// Party k buys ore o at ask p (units/min):
//   q_k(p) = demand_k x growth(day) x wants_k[o] x (p / ref_k)^-sigma_k   when p <= ref_k x cap_k, else 0
// times T.ref.demandScale x T.ref.tierDemand[tier] and any world changes (global, demand/supply for the ore,
// buyer for the party). With no parties a computer buyer takes everything at T.ref.computer x base value.
// Sales = min(output + stock drawdown, total demand). Unsold goods fill storage; a full store stops intake.
import { T } from './tuning.js';
import { num, info, DAY_MS } from './util.js';
import { activeChanges, evoMult, shipSpeed, priceAt, tripSecs } from './model.js';

export const SITES = ['planet', 'orbital'];
export const REF_DEST = '@refinery';
export const REF_KINDS = ['throughput', 'yield', 'storage', 'docks'];
const EPS = 1e-12;

export const emptyRefinery = () => ({ planet: null, orbital: null });
export function ensureRef(c) {
  if (!c.refinery || typeof c.refinery !== 'object') c.refinery = emptyRefinery();
  return c.refinery;
}
export function newRefinery(site, ores) {
  return { site, lvl: { throughput: 0, yield: 0, storage: 0, docks: 0 }, ores: { ...(ores || {}) }, stock: {}, raw: {}, rawG: {}, full: false };
}
const L = (R, k) => Math.max(0, Math.floor(num(R?.lvl?.[k], 0)));
export const refThru = (site, R) => T.ref[site].thru * Math.pow(T.ref.up.throughput.mult, L(R, 'throughput'));   // raw ore/min
export const refYield = (site, R) => T.ref[site].yield + T.ref.up.yield.add * L(R, 'yield');                       // refined per grade unit
export const refCap = (site, R) => T.ref[site].storage * Math.pow(T.ref.up.storage.mult, L(R, 'storage'));        // refined units (and the orbital raw hold)
export const refDocks = (R) => (R ? T.ref.orbital.docks + T.ref.up.docks.add * L(R, 'docks') : 0);
export const clampMarkup = (m) => Math.min(T.ref.markupMax, Math.max(T.ref.markupMin, num(Number(m), 1)));
export function refCfg(R, oreId) {
  const o = R?.ores?.[oreId];
  return { on: !(o && o.on === false), markup: clampMarkup(o?.markup ?? 1) };
}
export const refUnit = (I, o) => I.ores[o].value * T.ref.valueMult; // base value of one refined unit
export const refTrip = (cls, c) => T.ref.tripSecs / (shipSpeed(cls) * (c ? evoMult(c, 'ship') : 1)); // one way, seconds

// ------------------------------------------------------------------ parties and demand
const pcache = new WeakMap();
export function partiesOf(world, I) {
  const list = Array.isArray(world?.parties) ? world.parties : null;
  if (!list || !list.length) return [];
  let hit = pcache.get(list);
  if (hit && hit.I === I) return hit.P;
  const P = [];
  for (const p of list) {
    if (!p || typeof p !== 'object') continue;
    const demand = num(Number(p.demand), 0), ref = num(Number(p.ref), 1), sigma = num(Number(p.sigma), 2), cap = num(Number(p.cap), 1.5);
    if (!(demand > 0) || !(ref > 0)) continue;
    const wants = I.ores.map((o) => { const w = Number(p.wants?.[o.id]); return w > 0 && Number.isFinite(w) ? Math.min(1, w) : 0; });
    P.push({ id: String(p.id ?? ''), demand, ref, sigma: Math.min(10, Math.max(0.2, sigma)), max: ref * Math.max(0, cap), wants });
  }
  pcache.set(list, { I, P });
  return P;
}

// Demand grows through the month: growth(day) = day^growthPow, day 1 = 1. Evaluated at the start of each minute.
export function growth(world, t) {
  const tg = Math.floor(num(t, 0) / T.gridMs) * T.gridMs;
  const day = Math.max(1, (tg - num(world?.startedAt, 0)) / DAY_MS + 1);
  return Math.pow(day, T.ref.growthPow);
}

function changeMult(chs, oreId, partyId) {
  let m = 1;
  for (const ch of chs) {
    const x = Number(ch.mult);
    if (ch.kind === 'global') m *= x;
    else if (ch.kind === 'demand' && ch.oreId === oreId) m *= x;
    else if (ch.kind === 'supply' && ch.oreId === oreId) m /= x;
    else if (ch.kind === 'buyer' && (ch.buyerId ?? ch.partyId) === partyId) m *= x;
  }
  return Math.min(T.changeMax, Math.max(T.changeMin, m));
}

// Units/min of refined ore o that the parties buy at ask p (a markup). Infinity = the computer buyer (no parties).
function demandOne(world, I, P, chs, g, o, p) {
  if (!P.length) return Infinity;
  const oreId = I.ores[o].id;
  let q = 0;
  for (const k of P) {
    const w = k.wants[o];
    if (!(w > 0) || p > k.max + 1e-12) continue;
    q += k.demand * w * Math.pow(p / k.ref, -k.sigma) * (chs.length ? changeMult(chs, oreId, k.id) : 1);
  }
  return q * g * T.ref.demandScale * (T.ref.tierDemand[I.ores[o].tier] ?? 1);
}
// Per-ore demand (units/min) at the given asks.
export function demandVec(world, I, asks, t) {
  const P = partiesOf(world, I);
  const chs = activeChanges(world, t);
  const g = growth(world, t);
  return asks.map((p, o) => demandOne(world, I, P, chs, g, o, p));
}
// Units/min summed over the parties at this ask (Infinity: no parties, the computer buyer takes everything).
// For tests and the future intel feature; never shown in the UI.
export function demandAt(world, colony, oreId, ask, now) {
  now = num(now, colony?.t ?? 0);
  const I = info(world);
  const o = I.idx[oreId];
  if (o === undefined) return 0;
  return demandOne(world, I, partiesOf(world, I), activeChanges(world, now), growth(world, now), o, clampMarkup(ask));
}
export const hasParties = (world, I) => partiesOf(world, I).length > 0;
// The price one refined unit of ore o actually sells for (before the sell evolution).
export const effAsk = (world, I, ask) => (hasParties(world, I) ? ask : T.ref.computer);

// ------------------------------------------------------------------ the flow integrator
// One refinery over dt ms, exact (piecewise-linear in time, split where a stock empties, the store fills,
// or a source runs dry), so advance() stays step-invariant.
//   buf/bufG: the source (the yard, or the orbital's raw hold), drawn at up to `thru` (raw/ms), best ore first.
//   on[o]: intake allowed. D[o]: demand in units/ms (Infinity = takes everything). stock[o]: refined units.
// Mutates buf, bufG, stock. Returns { took (raw per ore), sold (units per ore), full }.
export function refineFlow(buf, bufG, stock, on, D, thru, y, cap, dt, order) {
  const n = stock.length;
  const took = new Array(n).fill(0), sold = new Array(n).fill(0);
  for (let o = 0; o < n; o++) if (D[o] === Infinity && stock[o] > 0) { sold[o] += stock[o]; stock[o] = 0; }
  const inR = new Array(n), out = new Array(n), sl = new Array(n), gpu = new Array(n);
  let left = dt, total = 0;
  for (let o = 0; o < n; o++) total += stock[o];
  for (let iter = 0; iter < 80 && left > 1e-9; iter++) {
    const full = total >= cap * (1 - 1e-9);
    // room freed per ms by stocked ores selling (only matters when full)
    let budget = 0;
    if (full) for (let o = 0; o < n; o++) if (stock[o] > EPS) budget += D[o];
    let rem = thru;
    for (let o = 0; o < n; o++) { inR[o] = 0; out[o] = 0; gpu[o] = buf[o] > EPS ? bufG[o] / buf[o] : 0; }
    for (const o of order) {
      if (!(rem > 0)) break;
      if (!on[o] || !(buf[o] > EPS) || !(gpu[o] > 0)) continue;
      let r = rem;
      if (full) {
        const pass = stock[o] > EPS ? 0 : D[o]; // an ore with no stock sells straight off the line
        const maxOut = pass + budget;
        r = Math.min(r, maxOut / (gpu[o] * y));
        budget = Math.max(0, budget - Math.max(0, r * gpu[o] * y - pass));
      }
      if (!(r > 0)) continue;
      inR[o] = r; out[o] = r * gpu[o] * y; rem -= r;
    }
    let h = left, net = 0;
    for (let o = 0; o < n; o++) {
      sl[o] = stock[o] > EPS ? D[o] : Math.min(out[o], D[o]);
      const d = out[o] - sl[o];
      net += d;
      if (inR[o] > 0) h = Math.min(h, buf[o] / inR[o]);
      if (d < 0 && stock[o] > EPS) h = Math.min(h, stock[o] / -d);
    }
    let hitCap = false;
    if (!full && net > 0) { const tc = (cap - total) / net; if (tc < h) { h = Math.max(0, tc); hitCap = true; } }
    total = 0;
    for (let o = 0; o < n; o++) {
      if (inR[o] > 0) {
        const x = Math.min(buf[o], inR[o] * h);
        const g = x >= buf[o] ? bufG[o] : x * gpu[o];
        buf[o] -= x; bufG[o] -= g; took[o] += x;
        if (buf[o] <= EPS * 1e3) { buf[o] = 0; bufG[o] = 0; }
      }
      sold[o] += sl[o] * h;
      stock[o] = Math.max(0, stock[o] + (out[o] - sl[o]) * h);
      if (stock[o] < 1e-9) stock[o] = 0;
      total += stock[o];
    }
    if (hitCap && total > cap) total = cap;
    left -= h;
  }
  return { took, sold, full: total >= cap * (1 - 1e-9) };
}

// ------------------------------------------------------------------ steady-state helpers (rates)
// Planet intake from a raw flow (per ore, per minute): best ore first up to the throughput;
// when the store is full intake is held to what sells. Returns per-ore raw/min.
export function intakeFrom(offer, g, on, D, thru, y, throttle, order) {
  const r = new Array(offer.length).fill(0);
  let rem = thru;
  for (const o of order) {
    if (!(rem > 0)) break;
    if (!on[o] || !(offer[o] > 0)) continue;
    let x = Math.min(offer[o], rem);
    if (throttle && D[o] !== Infinity) x = Math.min(x, D[o] / (Math.max(1e-9, g[o]) * y));
    r[o] = x; rem -= x;
  }
  return r;
}

// Nearest market buyer index (overflow and unrefined cargo at the orbital are sold there).
export function nearestBuyer(I) {
  let best = 0;
  I.buyers.forEach((b, i) => { if (T.tripSecs[b.distance] < T.tripSecs[I.buyers[best].distance]) best = i; });
  return best;
}

// Should this ship fly to the orbital refinery? (policy 'refinery', or 'best' when it pays better).
// cargoG: grade units per ore (or the expected mix). room: free raw hold after ships already on the way.
export function prefersRefinery(c, world, I, ship, cargo, cargoG, bi, now, room) {
  const R = c.refinery?.orbital;
  if (!R) return false;
  if (ship.policy === 'refinery') return true;
  if (ship.policy !== 'best') return false;
  const y = refYield('orbital', R), near = nearestBuyer(I);
  let tot = 0;
  for (let o = 0; o < I.n; o++) tot += cargo[o] > 0 ? cargo[o] : 0;
  const fit = tot > 0 ? Math.min(1, Math.max(0, room / tot)) : 1;
  let vR = 0, vM = 0;
  for (let o = 0; o < I.n; o++) {
    const G = cargoG[o];
    if (!(G > 0)) continue;
    const cf = refCfg(R, I.ores[o].id);
    const nearV = G * priceAt(world, I, o, near, now);
    vR += cf.on ? fit * G * y * refUnit(I, o) * effAsk(world, I, cf.markup) + (1 - fit) * nearV : nearV;
    vM += G * priceAt(world, I, o, bi, now);
  }
  return vR / refTrip(ship.cls) > vM / tripSecs(I.buyers[bi], ship.cls);
}
