// advance(): piecewise-linear flow simulation with discrete ship and pocket events.
//
// Time is cut into segments that end at: `now`, every absolute minute boundary,
// each ship arrival/return/timeout, and estimated "ship full" / "face reaches a pocket
// boundary" moments (the face never crosses a boundary inside a segment). Inside a segment every rate is constant and the pipeline
// (shafts -> tunnel -> lift -> yard -> conveyor -> docked ships) is solved as one
// fluid step, so splitting a segment anywhere gives (almost) the same totals.
import { T } from './tuning.js';
import { info, clone, num, pos, fmt } from './util.js';
import {
  liftRate, convRate, yardCap, shaftRate, tunnelCap, shipCap, shipCap2, loadMult, ensureFleet, tripSecs,
  shaftStatus, gradeScale, assignMiners, pickDest, priceAt, grade, evoMult, hazardRates, changeTimes, dangerOf,
} from './model.js';
import { syncUnlocks } from './unlocks.js';
import { tunnelAt, syncTunnel, oreBetween, faceAfter, needOf, needText } from './pockets.js';
import { ensureHz, rollBudget, hzPick, hazardText } from './hazards.js';
import {
  SITES, REF_DEST, refThru, refYield, refCap, refDocks, refCfg, refUnit, refTrip, refineFlow, demandVec,
  hasParties, nearestBuyer, prefersRefinery,
} from './refinery.js';
import { ensureLedger, ledgerIn } from './ledger.js';
import { pickLoad, holdFill, shipLoadRate, loadWindow } from './loading.js';

const MAX_EVENT_SALES = 12;
const MAX_EVENT_HAZARDS = 12;
const MAX_EVENT_POCKETS = 12;
const HOUR = 3_600_000;
const DUE = 1e-9; // hazard budgets at or below this fire

export function toArr(I, map) {
  const a = new Array(I.n).fill(0);
  if (map) for (const k in map) { const i = I.idx[k]; if (i !== undefined) a[i] += pos(map[k]); }
  return a;
}
export function toMap(I, arr, keepZero = false) {
  const m = {};
  for (let i = 0; i < I.n; i++) if (keepZero || arr[i] > 1e-9) m[I.ores[i].id] = arr[i] > 1e-9 ? arr[i] : 0;
  return m;
}
const sum = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; };

// Take `amount` from src (per-ore amounts, with grade units srcG) highest unit value first.
// Returns [amounts, gradeUnits] taken. Grade travels with the ore in proportion.
function takeByValue(I, src, srcG, amount) {
  const out = new Array(I.n).fill(0), outG = new Array(I.n).fill(0);
  const order = I.ores.map((o) => o.i).filter((o) => src[o] > 0)
    .sort((a, b) => I.ores[b].value * srcG[b] / src[b] - I.ores[a].value * srcG[a] / src[a] || a - b);
  let left = amount;
  for (const o of order) {
    if (left <= 0) break;
    const x = Math.min(src[o], left);
    if (x > 0) {
      const g = x >= src[o] ? srcG[o] : srcG[o] * (x / src[o]);
      src[o] -= x; srcG[o] -= g; out[o] = x; outG[o] = g; left -= x;
    }
  }
  for (let o = 0; o < I.n; o++) if (src[o] < 1e-12) { src[o] = 0; srcG[o] = 0; }
  return [out, outG];
}

export function advance(colony, world, now) {
  const c = clone(colony);
  ensureHz(c);
  ensureLedger(c);
  ensureFleet(c);
  const events = [];
  const I = info(world);
  now = num(now, c.t);
  const soldArr = new Array(I.n).fill(0);
  let soldCoin = 0, saleCount = 0;
  if (!(now > c.t)) {
    syncUnlocks(c, world, Math.max(now, c.t), events);
    return { colony: c, events, sales: [] };
  }

  const tun = toArr(I, c.tunnel), tunG = toArr(I, c.tunnelG);
  const yd = toArr(I, c.yard), ydG = toArr(I, c.yardG);
  const cargo = c.ships.map((s) => toArr(I, s.cargo));
  const cargoG = c.ships.map((s) => toArr(I, s.cargoG));
  const flowRate = c.ships.map(() => -1); // last measured fill rate (ore/ms), -1 unknown
  let rates = [], base = [], oreOf = [], gradeOf = [], tgt = [], digs = [], sig = [], lastScale = 1;
  let pkCount = 0;
  const mineK = evoMult(c, 'mine'), sellK = evoMult(c, 'sell');
  let hzCount = 0, hzLost = 0;

  // Refineries: per-site working arrays (packed back at the end).
  const rs = {};
  const parties = hasParties(world, I);
  for (const site of SITES) {
    const R = c.refinery?.[site];
    if (!R) continue;
    const cf = I.ores.map((o) => refCfg(R, o.id));
    rs[site] = {
      R, stock: toArr(I, R.stock), raw: toArr(I, R.raw), rawG: toArr(I, R.rawG),
      on: cf.map((x) => x.on), ask: cf.map((x) => x.markup), thru: refThru(site, R) / 60000,
      y: refYield(site, R), cap: refCap(site, R), full: !!R.full,
      price: cf.map((x, o) => (parties ? x.markup : T.ref.computer) * refUnit(I, o) * sellK),
    };
  }
  const refSold = new Array(I.n).fill(0);
  let refCoin = 0, refFullCount = 0, deliverCount = 0;
  const near = nearestBuyer(I);
  const credit = (coin, key) => {
    c.coin += coin; c.earned += coin; c.runEarned += coin; c.monthEarned += coin;
    ledgerIn(c, key, coin);
  };

  let hr = null, hrCalm = null;
  const recompute = () => {
    hr = null;
    assignMiners(c, world);
    const tn = c.shafts.map((s) => tunnelAt(c, I, s));
    base = c.shafts.map((s, k) => (shaftStatus(c, I, s).ok ? shaftRate(c, s, mineK) / 60000 * (tn[k].blocked ? T.pk.wall : tn[k].taper) : 0)); // ore per ms (the cart caps the crew; veins taper at the end)
    oreOf = c.shafts.map((s) => I.idx[s.ore]);
    digs = tn.map((x) => !x.blocked);      // blocked faces don't move
    tgt = tn.map((x) => x.target);         // metres where the mined ore changes next
    sig = tn.map((x) => x.ore + (x.blocked ? '!' : '') + x.taper);
    gradeOf = c.shafts.map((s) => grade(s.idx));
  };
  // Halted shafts (cave-ins, floods...) dig nothing until haltUntil.
  const ratesAt = (t) => { rates = base.map((r, k) => (num(c.shafts[k].haltUntil, 0) > t ? 0 : r)); };
  recompute();

  const emit = (type, text, at, data) => events.push({ type, text, at, data });

  // Holds of ship k: [{ o (ore index), cap }]. One ore per hold (hold 2 only for a freighter with `multi`).
  const holdsOf = (k) => {
    const s = c.ships[k], out = [];
    const o1 = s.oreId ? I.idx[s.oreId] : undefined;
    if (o1 !== undefined) out.push({ o: o1, cap: shipCap(s, c) });
    const o2 = s.oreId2 ? I.idx[s.oreId2] : undefined;
    if (o2 !== undefined && o2 !== o1) { const c2 = shipCap2(s, c); if (c2 > 0) out.push({ o: o2, cap: c2 }); }
    return out;
  };
  const freeOf = (k) => { let f = 0; for (const h of holdsOf(k)) f += Math.max(0, h.cap - cargo[k][h.o]); return f; };
  const shipFull = (k) => holdsOf(k).every((h) => h.cap - cargo[k][h.o] <= h.cap * 1e-9 + 1e-9);

  // Docking: pick the ore(s) this ship loads (loading.js). Reads the yard and tunnels, what is mined now, and what docked ships claimed.
  function choose(k, s, t) {
    const stock = new Array(I.n), grd = new Array(I.n), claim = new Array(I.n).fill(0), flow = new Array(I.n).fill(0);
    for (let o = 0; o < I.n; o++) { stock[o] = yd[o] + tun[o]; grd[o] = stock[o] > 0 ? (ydG[o] + tunG[o]) / stock[o] : 0; }
    let tot = 0;
    c.shafts.forEach((sh, i) => {
      const r = num(sh.haltUntil, 0) > t ? 0 : base[i] * 60000;
      if (!(r > 0)) return;
      flow[oreOf[i]] += r; tot += r;
      if (!(stock[oreOf[i]] > 0)) grd[oreOf[i]] = Math.max(grd[oreOf[i]], gradeOf[i]);
    });
    const lift = liftRate(c) * mineK;
    if (tot > lift) for (let o = 0; o < I.n; o++) flow[o] *= lift / tot;
    for (let o = 0; o < I.n; o++) if (!(grd[o] > 0)) grd[o] = 1;
    c.ships.forEach((q, j) => {
      if (j === k || q.state !== 'loading') return;
      for (const h of holdsOf(j)) claim[h.o] += Math.max(0, h.cap - cargo[j][h.o]);
    });
    const lr = shipLoadRate(c, s), W = loadWindow();
    const fill = (o1, C1, o2, C2) => {
      const a = holdFill(C1, stock[o1], claim[o1], flow[o1], lr, W);
      const b = o2 >= 0 ? holdFill(C2, stock[o2], claim[o2], flow[o2], lr, W) : { q: 0, t: 0 };
      let q1 = a.q, q2 = b.q, T = Math.max(a.t, b.t, (q1 + q2) / lr);
      if (T > W) { const k = W * lr / (q1 + q2); q1 *= k; q2 *= k; T = W; } // a ship leaves T.maxLoadSecs after its first ore
      return { q1, q2, T };
    };
    const pick = pickLoad(c, world, I, s, { now: t, grade: grd, fill });
    let o1 = pick ? pick.o1 : -1, o2 = pick ? pick.o2 : -1;
    if (o1 < 0) { // nothing to load anywhere right now: wait on the ore that is flowing most, else the richest
      o1 = I.byValue[0];
      for (const o of I.byValue) if (flow[o] > flow[o1] * (1 + 1e-12)) o1 = o;
    }
    s.oreId = I.ores[o1].id;
    s.oreId2 = o2 >= 0 ? I.ores[o2].id : null;
    s.pickAt = t + T.maxLoadSecs * 1000;
  }

  // Discrete events due at time t, in time order.
  const process = (t) => {
    for (;;) {
      let k = -1, when = Infinity;
      c.ships.forEach((s, i) => {
        const due = s.state === 'out' ? s.arriveAt : s.state === 'back' ? s.homeAt : Infinity;
        if (due <= t && due < when) { when = due; k = i; }
      });
      if (k < 0) break;
      const s = c.ships[k];
      if (s.state === 'out' && s.dest === REF_DEST) {
        deliver(k, s);
        s.state = 'back';
        s.homeAt = s.arriveAt + refTrip(s.cls, c) * 1000;
        continue;
      }
      if (s.state === 'out') {
        const bi = I.buyerIdx[s.dest] ?? 0;
        let coin = 0;
        for (let o = 0; o < I.n; o++) if (cargo[k][o] > 0) {
          coin += cargoG[k][o] * priceAt(world, I, o, bi, s.arriveAt);
          soldArr[o] += cargo[k][o];
        }
        coin = pos(coin * sellK);
        credit(coin, 'raw'); soldCoin += coin; saleCount++;
        c.stats.sold += sum(cargo[k]); c.stats.sales++;
        if (c.stats.firstSaleAt == null) c.stats.firstSaleAt = s.arriveAt;
        if (saleCount <= MAX_EVENT_SALES) {
          emit('sale', `${s.name} sold ${fmt(sum(cargo[k]))} ore at ${I.buyers[bi].name}`, s.arriveAt,
            { shipId: s.id, destId: s.dest, coin, ore: toMap(I, cargo[k]) });
        }
        cargo[k].fill(0); cargoG[k].fill(0);
        s.state = 'back';
        s.homeAt = s.arriveAt + tripSecs(I.buyers[bi], s.cls, c) * 1000;
      } else {
        s.state = 'home';
        s.readyAt = s.homeAt;
      }
    }
    // departures
    c.ships.forEach((s, k) => {
      if (s.state !== 'loading') return;
      const load = sum(cargo[k]);
      const full = shipFull(k);
      const timeout = s.firstLoadAt != null && t >= s.firstLoadAt + T.maxLoadSecs * 1000 - 1e-6;
      if (load > 0 && (full || timeout)) {
        const bi = pickDest(world, I, s, cargoG[k], t, c);
        if (rs.orbital && toRefinery(k, s, bi, t)) {
          s.state = 'out'; s.dest = REF_DEST; s.departAt = t;
          s.arriveAt = t + refTrip(s.cls, c) * 1000;
          s.firstLoadAt = null;
          c.stats.launches++;
          if (c.stats.launches <= 3) emit('launch', `${s.name} launched for your orbital refinery`, t, { shipId: s.id, destId: REF_DEST });
          flowRate[k] = -1;
          return;
        }
        const b = I.buyers[bi];
        s.state = 'out';
        s.dest = b.id;
        s.departAt = t;
        s.arriveAt = t + tripSecs(b, s.cls, c) * 1000;
        s.firstLoadAt = null;
        c.stats.launches++;
        if (c.stats.launches <= 3) emit('launch', `${s.name} launched for ${b.name}`, t, { shipId: s.id, destId: b.id });
        flowRate[k] = -1;
      }
    });
    // docking
    let docked = c.ships.filter((s) => s.state === 'loading').length;
    if (docked < c.pads) {
      const waiting = c.ships.map((s, k) => ({ s, k })).filter((x) => x.s.state === 'home')
        .sort((a, b) => num(a.s.readyAt) - num(b.s.readyAt) || a.k - b.k);
      for (const { s } of waiting) {
        if (docked >= c.pads) break;
        s.state = 'loading'; s.dockedAt = t; s.firstLoadAt = null; docked++;
        choose(c.ships.indexOf(s), s, t);
      }
    }
    // a docked ship still empty after the load window picks again (its ore may have run out)
    c.ships.forEach((s, k) => {
      if (s.state === 'loading' && s.firstLoadAt == null && sum(cargo[k]) <= 0 && (s.oreId == null || (s.pickAt != null && t >= s.pickAt - 1e-6))) choose(k, s, t);
    });
    // tunnels: pockets dug out, faces breaking into pockets or stuck at hard ones
    let changed = false;
    const pe = (type, text, data) => { if (++pkCount <= MAX_EVENT_POCKETS) emit(type, text, t, data); };
    c.shafts.forEach((s, k) => {
      while (s.pk.length && s.pk[0].start + s.pk[0].len <= s.face + 1e-7) {
        const p = s.pk.shift();
        s.dug++;
        if (p.hit) pe('pocketOut', `${s.name}: the ${oreName(I, p.ore)} pocket is dug out. Back to ${oreName(I, tunnelAt(c, I, s).common.id)}.`, { shaftId: s.id, oreId: p.ore });
      }
      const st = syncTunnel(c, I, s);
      if (st.cur && !st.blocked && !st.cur.hit) {
        st.cur.hit = 1;
        const o = I.ores[I.idx[st.cur.ore]];
        pe('strike', `${s.name} struck ${o.name}!`, { shaftId: s.id, oreId: o.id, tier: o.tier });
      } else if (st.cur && !st.blocked && st.cur.hit && !st.cur.low && num(s.face) >= st.cur.start + T.pk.low * st.cur.len - 1e-7) {
        st.cur.low = 1;
        const o = I.ores[I.idx[st.cur.ore]];
        pe('veinLow', `${s.name}: the ${o.name} vein is running low (20% left).`, { shaftId: s.id, oreId: o.id, tier: o.tier });
      } else if (st.blocked && !st.cur.blk) {
        st.cur.blk = 1;
        pe('blocked', `${s.name} hit ${st.pocketOre.name}: ${needText(st.pocketOre).toLowerCase()}. Crews scrape the walls meanwhile.`, { shaftId: s.id, oreId: st.pocketOre.id, need: needOf(st.pocketOre) });
      }
      if (sig[k] !== st.ore + (st.blocked ? '!' : '') + st.taper || tgt[k] !== st.target) changed = true;
    });
    if (changed) recompute();
    // hazards whose budget ran out
    let hit = false;
    c.shafts.forEach((s) => {
      for (const kind of ['cave', 'mad']) if (s.hz[kind] <= DUE) { hazard(kind, s, t); s.hz[kind] = budget(); hit = true; }
    });
    for (const kind of ['gas', 'flood', 'fire', 'quake']) if (c.hz[kind] <= DUE) { hazard(kind, null, t); c.hz[kind] = budget(); hit = true; }
    if (hit) recompute();
  };

  // Orbital refinery: ships unload enabled ore into the raw hold; overflow and other ore sell at the nearest buyer.
  function toRefinery(k, s, bi, t) {
    const x = rs.orbital;
    let flying = 0, inbound = 0;
    c.ships.forEach((q, j) => { if (q.state === 'out' && q.dest === REF_DEST) { flying++; inbound += sum(cargo[j]); } });
    if (flying >= refDocks(x.R)) return false;
    return prefersRefinery(c, world, I, s, cargo[k], cargoG[k], bi, t, x.cap - sum(x.raw) - inbound);
  }
  function deliver(k, s) {
    const x = rs.orbital;
    let room = x ? Math.max(0, x.cap - sum(x.raw)) : 0, put = 0, coin = 0;
    const order = I.byValue;
    for (const o of order) {
      const a = cargo[k][o];
      if (!(a > 0)) continue;
      const take = x && x.on[o] ? Math.min(a, room) : 0;
      if (take > 0) {
        const g = take >= a ? cargoG[k][o] : cargoG[k][o] * (take / a);
        x.raw[o] += take; x.rawG[o] += g; room -= take; put += take;
        cargo[k][o] -= take; cargoG[k][o] -= g;
      }
      if (cargo[k][o] > 1e-12) {
        coin += cargoG[k][o] * priceAt(world, I, o, near, s.arriveAt);
        soldArr[o] += cargo[k][o];
      }
    }
    coin = pos(coin * sellK);
    if (coin > 0) { credit(coin, 'raw'); soldCoin += coin; }
    if (++deliverCount <= MAX_EVENT_SALES) {
      emit('deliver', `${s.name} unloaded ${fmt(put)} ore at your orbital refinery` + (coin > 0 ? `, sold the rest for ${fmt(coin)}` : ''), s.arriveAt,
        { shipId: s.id, raw: put, coin });
    }
    cargo[k].fill(0); cargoG[k].fill(0);
  }
  function refine(site, buf, bufG, dt, t0, inflow = null, inflowG = null) {
    const x = rs[site];
    const D = demandVec(world, I, x.ask, t0, gradeScale(c)).map((d) => d / 60000);
    const was = x.full;
    const r = refineFlow(buf, bufG, x.stock, x.on, D, x.thru, x.y, x.cap, dt, I.byValue, inflow, inflowG);
    let coin = 0;
    for (let o = 0; o < I.n; o++) if (r.sold[o] > 0) { coin += r.sold[o] * x.price[o]; refSold[o] += r.sold[o]; }
    if (coin > 0) { credit(coin, 'refined'); refCoin += coin; }
    x.full = r.full;
    if (r.full && !was && ++refFullCount <= 3) {
      emit('refineryFull', `Your ${site === 'planet' ? 'on-planet' : 'orbital'} refinery's storage is full: buyers aren't taking enough at your asking prices.`, t0 + dt, { site });
    }
    return r;
  }

  function budget() { const [b, r] = rollBudget(c.hzRng); c.hzRng = r; return b; }
  // Every mishap draws the same number of rolls whatever happens, so the seeded stream stays
  // aligned even when tiny timing differences change an outcome (step invariance).
  let rolls = [];
  function rnd() { return rolls.length ? rolls.shift() : 0.5; }
  const between = ([a, b]) => Math.round(a + (b - a) * rnd());
  const halt = (s, t, mins) => { if (mins > 0) s.haltUntil = Math.max(num(s.haltUntil, 0), t + mins * 60_000); };
  // Lose up to `want` miners from shaft s; the colony always keeps at least one miner.
  const lose = (s, want) => {
    const n = Math.max(0, Math.min(want, s ? s.miners : want, c.miners - 1));
    c.miners -= n; if (s) s.miners -= n;
    c.stats.lost = num(c.stats.lost) + n; hzLost += n;
    return n;
  };
  const deepShaft = () => {
    const deep = c.shafts.filter((s) => s.idx > 0);
    if (!deep.length) return null;
    let x = rnd() * deep.reduce((a, s) => a + dangerOf(s.idx), 0);
    for (const s of deep) { x -= dangerOf(s.idx); if (x <= 0) return s; }
    return deep[deep.length - 1];
  };
  function hazard(kind, s, t) {
    rolls = [];
    for (let i = 0; i < 6; i++) { const [u, r] = hzPick(c.hzRng); c.hzRng = r; rolls.push(u); }
    const H = T.hz;
    let lost = 0, haltMins = 0, saved = false, burned = 0;
    let kindName = kind;
    if (kind === 'cave') {
      kindName = 'cavein';
      haltMins = between(H.caveHalt);
      const trapped = s.miners > 0 ? 1 + Math.floor(rnd() * 3) : 0;
      saved = trapped > 0 && rnd() < H.rescue;
      if (!saved) lost = lose(s, trapped);
      halt(s, t, haltMins);
    } else if (kind === 'mad') {
      kindName = 'insanity';
      haltMins = between(H.madHalt);
      lost = lose(s, 1 + Math.floor(rnd() * 2));
      halt(s, t, haltMins);
    } else if (kind === 'gas' || kind === 'flood') {
      s = deepShaft();
      if (!s) return;
      haltMins = between(kind === 'gas' ? H.gasHalt : H.floodHalt);
      if (kind === 'gas' && rnd() < 0.3) lost = lose(s, 1);
      halt(s, t, haltMins);
    } else if (kind === 'fire') {
      const f = H.fireBurn[0] + (H.fireBurn[1] - H.fireBurn[0]) * rnd();
      for (let o = 0; o < I.n; o++) { burned += yd[o] * f; yd[o] *= 1 - f; ydG[o] *= 1 - f; }
    } else if (kind === 'quake') {
      haltMins = between(H.quakeHalt);
      for (const x of c.shafts) if (x.idx > 0) halt(x, t, Math.round(haltMins * Math.pow(H.cut, num(x.up.supports))));
      const worst = c.shafts.filter((x) => x.idx > 0 && !num(x.up.supports) && x.miners > 0).sort((a, b) => b.idx - a.idx)[0];
      if (worst && rnd() < 0.4) { lost = lose(worst, 1); s = worst; }
    }
    c.stats.hazards = num(c.stats.hazards) + 1;
    hzCount++;
    if (hzCount <= MAX_EVENT_HAZARDS) {
      const text = hazardText(kindName, { shaft: s ? s.name : 'the colony', lost, saved, haltMins, burned: fmt(burned) }, rnd());
      const data = { kind: kindName, lost, haltMins };
      if (s && kind !== 'fire') data.shaftId = s.id;
      if (saved) data.rescued = true;
      if (kind === 'fire') data.burned = burned;
      emit('hazard', text, t, data);
    }
  }

  let t = c.t;
  let guard = 0;
  while (t < now && guard++ < 5e6) {
    process(t);
    ratesAt(t);
    let te = Math.min(now, (Math.floor(t / T.gridMs) + 1) * T.gridMs);
    // exact hazard events, halts ending, calm period ending, world changes starting/ending
    const calmEnd = num(c.born, 0) + T.hz.calmMs;
    if (!hr || hrCalm !== (t < calmEnd)) { hr = hazardRates(c, t); hrCalm = t < calmEnd; }
    if (calmEnd > t && calmEnd < te) te = calmEnd;
    c.shafts.forEach((s, k) => {
      const h = num(s.haltUntil, 0);
      if (h > t && h < te) te = h;
      for (const kind of ['cave', 'mad']) {
        const l = hr.shafts[k][kind];
        if (l > 0) { const due = t + Math.max(1, s.hz[kind] / l * HOUR); if (due < te) te = due; }
      }
    });
    for (const kind in hr.colony) {
      const l = hr.colony[kind];
      if (l > 0) { const due = t + Math.max(1, c.hz[kind] / l * HOUR); if (due < te) te = due; }
    }
    for (const x of changeTimes(world, t, te)) te = Math.min(te, x);
    // exact ship events
    c.ships.forEach((s) => {
      const due = s.state === 'out' ? s.arriveAt : s.state === 'back' ? s.homeAt
        : s.state === 'loading' && s.firstLoadAt != null ? s.firstLoadAt + T.maxLoadSecs * 1000
        : s.state === 'loading' && s.pickAt != null ? s.pickAt : Infinity;
      if (due > t && due < te) te = due;
    });
    // estimated events (never shorter than 1s)
    let est = Infinity;
    const cr = convRate(c.conveyor) / 60000;
    c.ships.forEach((s, k) => {
      if (s.state !== 'loading') return;
      const free = freeOf(k);
      const r = flowRate[k] < 0 ? cr : flowRate[k];
      if (r > 0) est = Math.min(est, free / r);
    });
    c.shafts.forEach((s, k) => {
      if (!digs[k] || !(tgt[k] < Infinity) || !(rates[k] > 0) || !(lastScale > 0)) return;
      est = Math.min(est, oreBetween(s, s.face, tgt[k]) / (rates[k] * lastScale));
    });
    if (est < Infinity) te = Math.min(te, t + Math.max(1000, est));
    const dt = te - t;
    if (dt > 0) {
      lastScale = flow(dt, t);
      // hazard clocks tick at this segment's rates
      const h = dt / HOUR;
      c.shafts.forEach((s, k) => { for (const kind of ['cave', 'mad']) if (hr.shafts[k][kind] > 0) s.hz[kind] = Math.max(0, s.hz[kind] - hr.shafts[k][kind] * h); });
      for (const kind in hr.colony) if (hr.colony[kind] > 0) c.hz[kind] = Math.max(0, c.hz[kind] - hr.colony[kind] * h);
    }
    t = te;
  }
  process(now);

  function flow(dt, t0) {
    // the face stops at the next boundary; the rest of the segment digs nothing there
    const room = rates.map((r, k) => (digs[k] && tgt[k] < Infinity ? oreBetween(c.shafts[k], c.shafts[k].face, tgt[k]) : Infinity));
    const pot = rates.map((r, k) => Math.min(r * dt, room[k]));
    const Ppot = sum(pot);
    const B1 = sum(tun), K1 = tunnelCap(c);
    const B2 = sum(yd), K2 = yardCap(c.yardLvl);
    const Lcap = liftRate(c) * mineK * dt / 60000;
    const Ccap = convRate(c.conveyor) * dt / 60000;
    const loading = [];
    c.ships.forEach((s, k) => { if (s.state === 'loading') loading.push(k); });
    loading.sort((a, b) => num(c.ships[a].dockedAt) - num(c.ships[b].dockedAt) || a - b);
    const flPot = Math.min(Lcap, B1 + Ppot);
    // What each docked ship's holds can take this step: its own ore only, from the yard plus what the lift can deliver.
    const availO = yd.slice();
    if (flPot > 0 && loading.length) {
      const tc = tun.slice(), tcG = tunG.slice();
      for (let k = 0; k < pot.length; k++) if (pot[k] > 0) { tc[oreOf[k]] += pot[k]; tcG[oreOf[k]] += pot[k] * gradeOf[k]; }
      const [upPot] = takeByValue(I, tc, tcG, flPot);
      for (let o = 0; o < I.n; o++) availO[o] += upPot[o];
    }
    const plan = loading.map((k) => {
      let rate = Ccap * loadMult(c, c.ships[k].cls);
      return holdsOf(k).map((h) => {
        const x = Math.max(0, Math.min(rate, h.cap - cargo[k][h.o], availO[h.o]));
        rate -= x; availO[h.o] -= x;
        return x;
      });
    });
    const fc = Math.min(plan.reduce((a, p) => a + sum(p), 0), B2 + flPot);
    const fl = Math.max(0, Math.min(flPot, K2 - B2 + fc));
    const fm = Math.max(0, Math.min(Ppot, K1 - B1 + fl));
    const scale = Ppot > 0 ? fm / Ppot : 0;
    if (fm > 0) {
      for (let k = 0; k < pot.length; k++) {
        if (!(pot[k] > 0)) continue;
        const m = pot[k] * scale;
        tun[oreOf[k]] += m;
        tunG[oreOf[k]] += m * gradeOf[k];
        const sh = c.shafts[k];
        if (digs[k]) sh.face = m >= room[k] * (1 - 1e-9) ? tgt[k] : Math.min(tgt[k], faceAfter(sh, sh.face, m));
      }
      c.stats.mined += fm;
    }
    let up = null, upG = null;
    if (fl > 0) {
      [up, upG] = takeByValue(I, tun, tunG, fl);
      c.stats.lifted += fl;
    }
    // the on-planet refinery draws from the yard while the lift fills it (a steady inflow over the step)
    if (rs.planet) refine('planet', yd, ydG, dt, t0, up && up.map((x) => x / dt), upG && upG.map((x) => x / dt));
    else if (up) for (let o = 0; o < I.n; o++) { yd[o] += up[o]; ydG[o] += upG[o]; }
    if (rs.orbital) refine('orbital', rs.orbital.raw, rs.orbital.rawG, dt, t0);
    let loaded = 0;
    loading.forEach((k, j) => {
      let got = 0;
      holdsOf(k).forEach((h, i) => {
        const x = Math.min(plan[j][i], yd[h.o]);
        if (!(x > 0)) return;
        const g = x >= yd[h.o] ? ydG[h.o] : ydG[h.o] * (x / yd[h.o]);
        yd[h.o] -= x; ydG[h.o] -= g;
        if (yd[h.o] < 1e-12) { yd[h.o] = 0; ydG[h.o] = 0; }
        cargo[k][h.o] += x; cargoG[k][h.o] += g; got += x;
      });
      if (got > 0 && c.ships[k].firstLoadAt == null) c.ships[k].firstLoadAt = t0;
      flowRate[k] = got / dt;
      loaded += got;
    });
    c.stats.loaded += loaded;
    return scale;
  }

  // pack
  c.tunnel = toMap(I, tun); c.tunnelG = toMap(I, tunG);
  c.yard = toMap(I, yd); c.yardG = toMap(I, ydG);
  c.ships.forEach((s, k) => { s.cargo = toMap(I, cargo[k]); s.cargoG = toMap(I, cargoG[k]); });
  for (const site in rs) {
    const x = rs[site];
    x.R.stock = toMap(I, x.stock); x.R.raw = toMap(I, x.raw); x.R.rawG = toMap(I, x.rawG); x.R.full = x.full;
  }
  c.t = now;
  if (saleCount > MAX_EVENT_SALES) {
    emit('salesSummary', `${saleCount - MAX_EVENT_SALES} more ship sales`, now, { count: saleCount - MAX_EVENT_SALES });
  }
  if (pkCount > MAX_EVENT_POCKETS) {
    emit('pocketSummary', `${pkCount - MAX_EVENT_POCKETS} more strikes and dug-out pockets while you were away`, now, { count: pkCount - MAX_EVENT_POCKETS });
  }
  if (hzCount > MAX_EVENT_HAZARDS) {
    emit('hazardSummary', `${hzCount - MAX_EVENT_HAZARDS} more mishaps underground while you were away`, now, { count: hzCount - MAX_EVENT_HAZARDS, lost: hzLost });
  }
  if (refCoin > 0) events.push({ type: 'refined', text: '', at: now, data: { coin: refCoin, ore: toMap(I, refSold) } });
  if (deliverCount > MAX_EVENT_SALES) emit('deliverSummary', `${deliverCount - MAX_EVENT_SALES} more refinery deliveries`, now, { count: deliverCount - MAX_EVENT_SALES });
  const sales = [];
  for (let o = 0; o < I.n; o++) if (soldArr[o] > 0) sales.push({ oreId: I.ores[o].id, amount: soldArr[o] });
  if (sales.length) events.push({ type: 'sales', text: '', at: now, data: { coin: soldCoin, trips: saleCount, ore: toMap(I, soldArr) } });
  syncUnlocks(c, world, now, events);
  return { colony: c, events, sales };
}

function oreName(I, id) { return I.ores[I.idx[id]]?.name || id; }
