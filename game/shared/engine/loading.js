// Which ore does a ship load? (Ships rework, Phase 3.5.) One ore per hold, chosen when the ship docks (no RNG; a pure function of
// state, so advance() stays step-invariant). The choice maximizes the ship's coin/min given what the yard holds, what is flowing in,
// and what ships already docked have claimed; that is also what is best for the fleet because ships dock in order and a late ship
// never slows an earlier one (it queues behind it on the same ore).
import { T } from './tuning.js';
import { priceAt, pickDest, tripSecs, shipCap, shipCap2, loadMult, evoMult, convRate } from './model.js';
import { refValues, refTrip } from './refinery.js';

// Where a full hold of G (grade units per ore) would fly under the ship's policy.
// -> { bi, rt (round trip, minutes), mult (value multiplier for flying to the refinery, else 1), price[o] (coin per grade unit) }
export function routeFor(c, world, I, s, G, now) {
  const bi = pickDest(world, I, s, G, now, c);
  const b = I.buyers[bi];
  const sellK = evoMult(c, 'sell');
  let rt = 2 * tripSecs(b, s.cls, c) / 60, mult = 1;
  if (c.refinery?.orbital && (s.policy === 'refinery' || s.policy === 'best')) {
    const x = refValues(c, world, I, s, G, G, bi, now, Infinity);
    if (x && x.vM > 0 && (s.policy === 'refinery' || x.vR / refTrip(s.cls, c) > x.vM / tripSecs(b, s.cls, c))) {
      mult = x.vR / x.vM; rt = 2 * refTrip(s.cls, c) / 60;
    }
  }
  const price = new Array(I.n);
  for (let o = 0; o < I.n; o++) price[o] = priceAt(world, I, o, bi, now) * mult * sellK;
  return { bi, rt, mult, price };
}

// Pick the ore (and, for a freighter with `multi`, a second ore) for a docking ship.
// ctx: { now, grade[o] (coin grade per ore unit), fill(o1, C1, o2, C2, rt) -> { q1, q2, T (minutes on the pad) }, order? }
// -> { o1, o2 (-1 = none), score } | null when nothing can be loaded at all
export function pickLoad(c, world, I, s, ctx) {
  const C1 = shipCap(s, c), C2 = shipCap2(s, c);
  const g = ctx.grade;
  let best = null;
  const evaluate = (o1, o2) => {
    const G = new Array(I.n).fill(0);
    G[o1] = C1 * g[o1];
    if (o2 >= 0) G[o2] = C2 * g[o2];
    const r = routeFor(c, world, I, s, G, ctx.now);
    const f = ctx.fill(o1, C1, o2, o2 >= 0 ? C2 : 0, r.rt);
    const q = f.q1 + f.q2;
    if (!(q > 1e-9)) return;
    const v = f.q1 * g[o1] * r.price[o1] + (o2 >= 0 ? f.q2 * g[o2] * r.price[o2] : 0);
    const score = v / (f.T + r.rt);
    if (!best || score > best.score * (1 + 1e-12)) best = { o1, o2, score };
  };
  for (const o1 of I.byValue) {
    evaluate(o1, -1);
    if (C2 > 0) for (const o2 of I.byValue) if (o2 !== o1) evaluate(o1, o2);
  }
  return best;
}

// How one hold fills on ore o (capacity C) given the yard: stock (ore now, free of claims already made), `claim` (what docked ships
// still need of o), flow (ore/min arriving) and lr (the ship's load rate, ore/min). -> { q, t (minutes) }
export function holdFill(C, stock, claim, flow, lr, W) {
  if (!(C > 0)) return { q: 0, t: 0 };
  const avail = stock - claim;
  const have = Math.max(0, avail), debt = Math.max(0, -avail);
  const rem = Math.max(0, C - have);
  if (rem <= 1e-12) return { q: C, t: C / lr };
  if (!(flow > 0)) return { q: Math.min(C, lr * W, have), t: have > 0 ? Math.min(W, have / lr) : 0 };
  const full = Math.max(C / lr, (debt + rem) / flow);
  if (full <= W) return { q: C, t: full };
  return { q: Math.min(C, lr * W, have + Math.max(0, flow * W - debt)), t: W };
}

// Load rate of one ship in ore/min: the conveyor's per-pad rate x the class's loading upgrade.
export const shipLoadRate = (c, s) => convRate(c.conveyor) * loadMult(c, s.cls);
export const loadWindow = () => T.maxLoadSecs / 60; // minutes
