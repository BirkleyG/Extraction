// Derived numbers: per-level stats, miner assignment, shaft status, market prices.
import { T } from './tuning.js';
import { info, num, pos } from './util.js';
import { syncTunnel, tunnelAt, needOf, needText, bandOfIdx, bandOf, richnessAt } from './pockets.js';
export { bandOfIdx, bandOf, richnessAt };

// Every T.milestoneEvery levels a stat doubles (a "milestone"), on top of its per-level gain.
export const milestone = (lvl) => Math.pow(2, Math.floor(lvl / T.milestoneEvery));
// Gear and cart double at T.milestones (25, 50, 100, 200, 300).
export const gearMilestone = (lvl) => { let m = 1; for (const x of T.milestones) if (lvl >= x) m *= 2; return m; };
export const nextMilestone = (lvl) => T.milestones.find((x) => x > lvl) ?? null;
export const convRate = (lvl) => T.convBase * Math.pow(T.convMult, lvl) * milestone(lvl);
export const yardCap = (lvl) => T.yardBase * Math.pow(T.yardMult, lvl);
export const soilOf = (c) => { const x = Number(c?.site?.soil); return x > 0 && Number.isFinite(x) ? x : 1; };
export const gearMult = (gear) => (1 + T.gear.add * (Math.max(1, gear) - 1)) * gearMilestone(Math.max(1, gear));
// Ore/min of one miner (before the soil, the evolution and the cart): gear x depth richness.
export const perMiner = (s) => T.minePerMiner * gearMult(num(s.gear, 1)) * richnessAt(s.idx);
// Ore/min the shaft's cart hauls from the face to the shaft entrance.
export const cartRate = (s) => T.cart.rate * (1 + T.cart.add * (Math.max(1, num(s.cart, 1)) - 1)) * gearMilestone(Math.max(1, num(s.cart, 1))) * richnessAt(s.idx);
// Ore/min a shaft really makes while working (c = colony for the soil, k = evolution multiplier): the cart caps the crew.
export const crewRate = (c, s, k = 1) => s.miners * perMiner(s) / soilOf(c) * k;
export const shaftRate = (c, s, k = 1) => Math.min(crewRate(c, s, k), cartRate(s) * k);
// Hazard danger of a shaft: its depth index, doubling every T.danger shafts (the first shaft is safe).
export const dangerOf = (idx) => (idx <= 0 ? 0 : idx * Math.pow(2, idx / T.danger));
export const shaftCost = (idx) => (idx <= 0 ? 0 : T.shaftBase * Math.pow(T.shaftGrowth, idx - 1));

// Lift: buckets x capacity x trips/min. Trips slow with the depth of the deepest working shaft.
export const liftLvl = (c) => ({ speed: num(c?.lift?.speed), capacity: num(c?.lift?.capacity), buckets: num(c?.lift?.buckets) });
export const liftTrips = (lvl) => T.lift.speed.base * Math.pow(T.lift.speed.mult, lvl) * milestone(lvl);
export const liftCapacity = (lvl) => T.lift.capacity.base * Math.pow(T.lift.capacity.mult, lvl) * milestone(lvl);
export const liftBuckets = (lvl) => T.lift.buckets.base + T.lift.buckets.add * lvl;
export const liftDepthIdx = (c) => c.shafts.reduce((a, s) => (s.miners > 0 ? Math.max(a, s.idx) : a), 0);
export const liftRate = (c) => {
  const l = liftLvl(c);
  return liftBuckets(l.buckets) * liftCapacity(l.capacity) * liftTrips(l.speed) / (1 + T.lift.depthSlow * liftDepthIdx(c));
};
export const grade = (idx) => Math.pow(T.grade, idx);
export const tunnelCap = (c) => T.shaftBuffer * Math.max(1, c.shafts.length);
const capMemo = new Map();
export const shipCap = (ship) => {
  const key = (ship.cls || '') + (ship.lvl || 0);
  let v = capMemo.get(key);
  if (v === undefined) {
    v = (T.ship[ship.cls] || T.ship.hauler).cap * Math.pow(T.shipCapMult, ship.lvl || 0) * milestone(ship.lvl || 0);
    if (capMemo.size < 5000) capMemo.set(key, v);
  }
  return v;
};
export const shipSpeed = (cls) => (T.ship[cls] || T.ship.hauler).speed;
export const tripSecs = (buyer, cls, c) => T.tripSecs[buyer.distance] / (shipSpeed(cls) * (c ? evoMult(c, 'ship') : 1));

// Evolutions: each level adds `per` to a multiplier (mine: ore/min, ship: speed, sell: price, spectacle: next nuke).
export const evoLvl = (c, kind) => Math.max(0, Math.floor(num(c?.evo?.[kind], 0)));
export function evoMult(c, kind) {
  const e = T.evo[kind];
  if (!e) return 1;
  const L = evoLvl(c, kind);
  return 1 + e.per * L;
}
export const spectacleOf = (c, runEarned) => Math.pow(Math.max(0, num(runEarned, 0)), T.spectaclePow) * evoMult(c, 'spectacle');

// Hazards ---------------------------------------------------------------
// Per-hour rates. Each shaft: cave (supports), mad (lights). Colony: gas, flood, fire, quake.
const CUT = Array.from({ length: 64 }, (_, i) => Math.pow(T.hz.cut, i));
const cut = (lvl) => CUT[Math.min(63, Math.max(0, lvl | 0))];
export const depthOf = (c) => c.shafts.reduce((a, s) => a + dangerOf(s.idx), 0);
export function hazardRates(c, t) {
  const calm = num(t, c.t) < num(c.born, 0) + T.hz.calmMs;
  const sh = c.shafts.map((s) => calm ? { cave: 0, mad: 0 } : {
    cave: T.hz.cave * dangerOf(s.idx) * cut(s.up.supports),
    mad: s.miners > 0 ? T.hz.mad * dangerOf(s.idx) * cut(s.up.lights) : 0,
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

// Why a shaft is (not) producing. A face stuck at a too-hard pocket still produces (wall rate):
// { ok: true, blocked: true, need, reason: 'Needs drill N to break into X' }.
export function shaftStatus(c, I, s) {
  if (!Array.isArray(s.pk)) syncTunnel(c, I, s);
  const st = tunnelAt(c, I, s);
  if (!I.ores[I.idx[st.ore]]) return { ok: false, reason: 'No ore' };
  if (st.blocked) return { ok: true, blocked: true, need: needOf(st.pocketOre), pocketOre: st.pocketOre.id, reason: needText(st.pocketOre) };
  return { ok: true, reason: '' };
}

// Syncs every shaft's tunnel (s.ore = what it mines now) and the colony's miner total. Miners belong to their shaft.
// Mutates c.shafts[*].ore / pockets, c.miners, c.idle.
export function assignMiners(c, world) {
  const I = info(world);
  let n = 0;
  for (const s of c.shafts) { syncTunnel(c, I, s); n += num(s.miners); }
  c.miners = n;
  c.idle = 0;
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
