// Derived numbers: per-level stats, miner assignment, veins, market prices.
import { T } from './tuning.js';
import { info, rngNext, num, pos } from './util.js';

// Every T.milestoneEvery levels a stat doubles (a "milestone"), on top of its per-level gain.
export const milestone = (lvl) => Math.pow(2, Math.floor(lvl / T.milestoneEvery));
export const liftRate = (lvl) => T.liftBase * Math.pow(T.liftMult, lvl) * milestone(lvl);
export const convRate = (lvl) => T.convBase * Math.pow(T.convMult, lvl) * milestone(lvl);
export const yardCap = (lvl) => T.yardBase * Math.pow(T.yardMult, lvl);
export const bunkCap = (lvl) => T.bunkCap0 + T.bunkCapPer * lvl;
export const perMiner = (cart, idx = 0) => T.minePerMiner * (1 + T.cartAdd * cart) * Math.pow(T.richness, idx);
export const grade = (idx) => Math.pow(T.grade, idx);
export const tunnelCap = (c) => T.shaftBuffer * Math.max(1, c.shafts.length);
export const shipCap = (ship) => (T.ship[ship.cls] || T.ship.hauler).cap * Math.pow(T.shipCapMult, ship.lvl || 0) * milestone(ship.lvl || 0);
export const shipSpeed = (cls) => (T.ship[cls] || T.ship.hauler).speed;
export const tripSecs = (buyer, cls, c) => T.tripSecs[buyer.distance] / (shipSpeed(cls) * (c ? evoMult(c, 'ship') : 1));

// Evolutions: mine/ship/sell compound per level; spectacle is additive.
export const evoLvl = (c, kind) => Math.max(0, Math.floor(num(c?.evo?.[kind], 0)));
export function evoMult(c, kind) {
  const e = T.evo[kind];
  if (!e) return 1;
  const L = evoLvl(c, kind);
  return kind === 'spectacle' ? 1 + e.per * L : Math.pow(1 + e.per, L);
}
export const spectacleOf = (c, runEarned) => Math.pow(Math.max(0, num(runEarned, 0)), T.spectaclePow) * evoMult(c, 'spectacle');

// Hazards ---------------------------------------------------------------
// Per-hour rates. Each shaft: cave (supports), mad (lights). Colony: gas, flood, fire, quake.
const cut = (lvl) => Math.pow(T.hz.cut, Math.max(0, num(lvl, 0)));
export const depthOf = (c) => c.shafts.reduce((a, s) => a + s.idx, 0);
export function hazardRates(c, t) {
  const calm = num(t, c.t) < num(c.born, 0) + T.hz.calmMs;
  const sh = c.shafts.map((s) => calm ? { cave: 0, mad: 0 } : {
    cave: T.hz.cave * s.idx * cut(s.up.supports),
    mad: s.miners > 0 ? T.hz.mad * s.idx * cut(s.up.lights) : 0,
  });
  const D = calm ? 0 : depthOf(c);
  const sf = c.safety || {};
  const deep = c.shafts.filter((s) => s.idx > 0);
  const avgSup = deep.length ? deep.reduce((a, s) => a + Math.min(1, num(s.up.supports) / 3), 0) / deep.length : 0;
  return {
    shafts: sh,
    colony: {
      gas: T.hz.gas * D * cut(sf.ventilation),
      flood: T.hz.flood * D * cut(sf.pumps),
      fire: T.hz.fire * D * cut(sf.firebreaks),
      quake: T.hz.quake * D * (1 - 0.6 * avgSup),
    },
  };
}

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
    .map((s, k) => ({ k, ok: shaftStatus(c, I, s).ok, v: (I.ores[I.idx[s.ore]]?.value || 0) * grade(s.idx) * perMiner(s.up.cart, s.idx) }))
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
  // The first shafts always hit ore the starting drill can cut, so the early game has no dead ends.
  if (!redrill && idx < 3 && cands.some((o) => o.hardness <= 1)) cands = cands.filter((o) => o.hardness <= 1);
  const pool = cands.length ? cands : I.ores.filter((o) => o.tier === 'common').slice(0, 1);
  if (!pool.length) pool.push(I.ores[0]);
  const w = pool.map((o) => {
    const deep = Math.max(0, idx - o.depthMin);
    if (o.tier === 'common') return idx === 0 ? 1 : 2 / (1 + idx / 3);
    if (o.tier === 'rare') return 1 + o.depthMin * 0.4;
    return 1 + deep * 0.3;
  });
  const sum = w.reduce((a, b) => a + b, 0);
  const [r, next] = rngNext(rng >>> 0);
  let x = r * sum, pick = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) { pick = pool[i]; break; } }
  let vein = null;
  if (pick.tier !== 'common') {
    // Sized to last about T.veinHours at a well-upgraded shaft of this depth
    // (re-drills use the shaft's own upgrades if that is bigger).
    const mid = Math.floor((T.upMax0 + T.upMaxPerDepth * idx) / 2);
    const typical = bunkCap(mid) * perMiner(mid, idx);
    const own = up ? bunkCap(up.bunk) * perMiner(up.cart, idx) : 0;
    const k = pick.tier === 'mythic' ? T.veinMythicK : 1;
    const total = Math.round(Math.max(typical, own) * 60 * T.veinHours * k * (0.75 + 0.5 * rngNext(next)[0]));
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

// World changes (Maker deals, galactic events). A change is active from `at` (if given) until `until` (if given).
export function activeChanges(world, now) {
  const list = Array.isArray(world?.changes) ? world.changes : [];
  now = num(now, 0);
  return list.filter((ch) => ch && Number(ch.mult) > 0 && Number.isFinite(Number(ch.mult))
    && !(Number.isFinite(ch.at) && ch.at > now) && !(Number.isFinite(ch.until) && ch.until <= now));
}
// Combined multiplier for one ore at one buyer, clamped to [changeMin, changeMax].
export function priceMult(world, oreId, buyerId, now) {
  let m = 1;
  for (const ch of activeChanges(world, now)) {
    const x = Number(ch.mult);
    if (ch.kind === 'global') m *= x;
    else if (ch.kind === 'demand' && ch.oreId === oreId) m *= x;
    else if (ch.kind === 'supply' && ch.oreId === oreId) m /= x;
    else if (ch.kind === 'buyer' && ch.buyerId === buyerId) m *= x;
  }
  return Math.min(T.changeMax, Math.max(T.changeMin, m));
}
// Times (after `from`, up to `to`) when some change starts or ends: prices step there.
export function changeTimes(world, from, to) {
  const out = [];
  for (const ch of Array.isArray(world?.changes) ? world.changes : []) {
    for (const x of [ch?.at, ch?.until]) if (Number.isFinite(x) && x > from && x < to) out.push(x);
  }
  return out;
}

export function priceAt(world, I, oi, bi, now) {
  const base = I.ores[oi].value * I.buyers[bi].likes[oi] * marketIndex(world, I.ores[oi].id, now);
  return world?.changes?.length ? base * priceMult(world, I.ores[oi].id, I.buyers[bi].id, now) : base;
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
