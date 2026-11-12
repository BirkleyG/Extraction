// Derived numbers: per-level stats, miner assignment, veins, market prices.
import { T } from './tuning.js';
import { info, rngNext, num, pos } from './util.js';

export const liftRate = (lvl) => T.liftBase * Math.pow(T.liftMult, lvl);
export const convRate = (lvl) => T.convBase * Math.pow(T.convMult, lvl);
export const yardCap = (lvl) => T.yardBase * Math.pow(T.yardMult, lvl);
export const bunkCap = (lvl) => T.bunkCap0 + T.bunkCapPer * lvl;
export const perMiner = (cart, idx = 0) => T.minePerMiner * Math.pow(T.cartMult, cart) * Math.pow(T.richness, idx);
export const tunnelCap = (c) => T.shaftBuffer * Math.max(1, c.shafts.length);
export const shipCap = (ship) => (T.ship[ship.cls] || T.ship.hauler).cap * Math.pow(T.shipCapMult, ship.lvl || 0);
export const shipSpeed = (cls) => (T.ship[cls] || T.ship.hauler).speed;
export const tripSecs = (buyer, cls) => T.tripSecs[buyer.distance] / shipSpeed(cls);

// Why a shaft is (not) producing.
export function shaftStatus(c, I, s) {
  const ore = I.ores[I.idx[s.ore]];
  if (!ore) return { ok: false, reason: 'No vein' };
  if (s.vein && s.vein.left <= 0) return { ok: false, reason: 'Vein exhausted: re-drill it' };
  if (ore.tier === 'mythic' && c.drill < T.drillMax) return { ok: false, reason: 'Needs the mythic drill' };
  if (ore.hardness > c.drill) return { ok: false, reason: `Needs drill ${ore.hardness}` };
  return { ok: true, reason: '' };
}

// Miners fill the most valuable open slots. Mutates c.shafts[*].miners.
export function assignMiners(c, world) {
  const I = info(world);
  const order = c.shafts
    .map((s, k) => ({ k, ok: shaftStatus(c, I, s).ok, v: (I.ores[I.idx[s.ore]]?.value || 0) * perMiner(s.up.cart, s.idx) }))
    .sort((a, b) => (b.ok - a.ok) || (b.v - a.v) || (a.k - b.k));
  let left = c.miners;
  for (const o of order) {
    const s = c.shafts[o.k];
    const n = o.ok ? Math.min(left, bunkCap(s.up.bunk)) : 0;
    s.miners = n;
    left -= n;
  }
  c.idle = left;
}

// Roll the vein for shaft index `idx` from rng state. Pure: returns { vein, ore, rng }.
export function rollVein(world, idx, rng, { redrill = false, up = null } = {}) {
  const I = info(world);
  let cands = I.ores.filter((o) => o.depthMin <= idx);
  if (redrill && cands.some((o) => o.tier !== 'common')) cands = cands.filter((o) => o.tier !== 'common');
  const pool = cands.length ? cands : I.ores.filter((o) => o.tier === 'common').slice(0, 1);
  if (!pool.length) pool.push(I.ores[0]);
  const w = pool.map((o) => {
    const deep = Math.max(0, idx - o.depthMin);
    if (o.tier === 'common') return idx === 0 ? 1 : 1.2 / (1 + idx / 3);
    if (o.tier === 'rare') return 1 + deep * 0.15;
    return 0.5 + deep * 0.15;
  });
  const sum = w.reduce((a, b) => a + b, 0);
  const [r, next] = rngNext(rng >>> 0);
  let x = r * sum, pick = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) { pick = pool[i]; break; } }
  let vein = null;
  if (pick.tier !== 'common') {
    const base = pick.tier === 'mythic' ? T.veinMythic : T.veinRare;
    // Big enough to last a while at this shaft's full staffing (re-drills keep their upgrades).
    const full = up ? bunkCap(up.bunk) * perMiner(up.cart, idx) * 60 * T.veinHours : 0;
    const total = Math.round(Math.max(base * Math.pow(T.veinGrowth, idx), full) * (0.8 + 0.4 * rngNext(next)[0]));
    vein = { total, left: total, warn: 0 };
  }
  return { ore: pick.id, vein, rng: rngNext(next)[1] };
}

// Market --------------------------------------------------------------
export function marketIndex(world, oreId, now) {
  const m = world.market?.[oreId];
  if (!m) return 1;
  const idx = Math.min(1, Math.max(T.indexFloor, num(m.index, 1)));
  const dt = Math.max(0, num(now, 0) - num(m.lastT, 0));
  return 1 - (1 - idx) * Math.pow(0.5, dt / T.halfLifeMs);
}

export function priceAt(world, I, oi, bi, now) {
  return I.ores[oi].value * I.buyers[bi].likes[oi] * marketIndex(world, I.ores[oi].id, now);
}

// Best destination for a cargo vector (per ore index) under a ship's policy.
export function pickDest(world, I, ship, cargo, now) {
  if (ship.policy === 'fixed' && I.buyerIdx[ship.destId] !== undefined) return I.buyerIdx[ship.destId];
  if (ship.policy === 'nearest') {
    let best = 0;
    I.buyers.forEach((b, i) => { if (T.tripSecs[b.distance] < T.tripSecs[I.buyers[best].distance]) best = i; });
    return best;
  }
  let best = 0, bestV = -1;
  const total = cargo.reduce((a, b) => a + b, 0);
  for (let b = 0; b < I.buyers.length; b++) {
    let v = 0;
    for (let o = 0; o < I.n; o++) v += (total > 0 ? cargo[o] : 1) * priceAt(world, I, o, b, now);
    v /= 2 * tripSecs(I.buyers[b], ship.cls);
    if (v > bestV) { bestV = v; best = b; }
  }
  return best;
}

export const tierOf = (I, oreId) => I.ores[I.idx[oreId]]?.tier || 'common';
export { pos };
