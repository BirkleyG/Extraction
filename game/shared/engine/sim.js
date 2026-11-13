// advance(): piecewise-linear flow simulation with discrete ship and vein events.
//
// Time is cut into segments that end at: `now`, every absolute minute boundary,
// each ship arrival/return/timeout, and estimated "ship full" / "vein threshold"
// moments. Inside a segment every rate is constant and the pipeline
// (shafts -> tunnel -> lift -> yard -> conveyor -> docked ships) is solved as one
// fluid step, so splitting a segment anywhere gives (almost) the same totals.
import { T } from './tuning.js';
import { info, clone, num, pos, fmt } from './util.js';
import {
  liftRate, convRate, yardCap, perMiner, tunnelCap, shipCap, tripSecs,
  shaftStatus, assignMiners, pickDest, priceAt, grade,
} from './model.js';
import { syncUnlocks } from './unlocks.js';

const MAX_EVENT_SALES = 12;

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
  let rates = [], oreOf = [], gradeOf = [], lastScale = 1;

  const recompute = () => {
    assignMiners(c, world);
    rates = c.shafts.map((s) => (shaftStatus(c, I, s).ok ? s.miners * perMiner(s.up.cart, s.idx) / 60000 : 0)); // ore per ms
    oreOf = c.shafts.map((s) => I.idx[s.ore]);
    gradeOf = c.shafts.map((s) => grade(s.idx));
  };
  recompute();

  const emit = (type, text, at, data) => events.push({ type, text, at, data });

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
      if (s.state === 'out') {
        const bi = I.buyerIdx[s.dest] ?? 0;
        let coin = 0;
        for (let o = 0; o < I.n; o++) if (cargo[k][o] > 0) {
          coin += cargoG[k][o] * priceAt(world, I, o, bi, s.arriveAt);
          soldArr[o] += cargo[k][o];
        }
        coin = pos(coin);
        c.coin += coin; c.earned += coin; soldCoin += coin; saleCount++;
        c.stats.sold += sum(cargo[k]); c.stats.sales++;
        if (c.stats.firstSaleAt == null) c.stats.firstSaleAt = s.arriveAt;
        if (saleCount <= MAX_EVENT_SALES) {
          emit('sale', `${s.name} sold ${fmt(sum(cargo[k]))} ore at ${I.buyers[bi].name}`, s.arriveAt,
            { shipId: s.id, destId: s.dest, coin, ore: toMap(I, cargo[k]) });
        }
        cargo[k].fill(0); cargoG[k].fill(0);
        s.state = 'back';
        s.homeAt = s.arriveAt + tripSecs(I.buyers[bi], s.cls) * 1000;
      } else {
        s.state = 'home';
        s.readyAt = s.homeAt;
      }
    }
    // departures
    c.ships.forEach((s, k) => {
      if (s.state !== 'loading') return;
      const load = sum(cargo[k]);
      const full = load >= shipCap(s) * (1 - 1e-9) - 1e-9;
      const timeout = s.firstLoadAt != null && t >= s.firstLoadAt + T.maxLoadSecs * 1000 - 1e-6;
      if (load > 0 && (full || timeout)) {
        const bi = pickDest(world, I, s, cargoG[k], t);
        const b = I.buyers[bi];
        s.state = 'out';
        s.dest = b.id;
        s.departAt = t;
        s.arriveAt = t + tripSecs(b, s.cls) * 1000;
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
      }
    }
    // veins
    let changed = false;
    c.shafts.forEach((s) => {
      const v = s.vein;
      if (!v || v.warn >= 3) return;
      if (v.left <= 1e-6) {
        v.left = 0; v.warn = 3; changed = true;
        // Crews fall back to the best common ore the drill can cut, so income dips instead of stopping.
        const spent = s.ore;
        const fb = I.ores.filter((o) => o.tier === 'common' && o.hardness <= c.drill).sort((a, b) => (b.value || 0) - (a.value || 0))[0];
        if (fb) { s.ore = fb.id; s.vein = null; s.spent = spent; }
        emit('veinOut', `${s.name}: the ${oreName(I, spent)} vein is exhausted.${fb ? ` Crews switched to ${oreName(I, fb.id)}.` : ''} Re-drill for a new rare vein.`, t, { shaftId: s.id });
      } else if (v.warn < 2 && v.left <= v.total * T.veinWarn[1]) {
        v.warn = 2; emit('vein5', `${s.name}: ${oreName(I, s.ore)} vein at 5%`, t, { shaftId: s.id, pct: 5 });
      } else if (v.warn < 1 && v.left <= v.total * T.veinWarn[0]) {
        v.warn = 1; emit('vein20', `${s.name}: ${oreName(I, s.ore)} vein at 20%`, t, { shaftId: s.id, pct: 20 });
      }
    });
    if (changed) recompute();
  };

  let t = c.t;
  let guard = 0;
  while (t < now && guard++ < 5e6) {
    process(t);
    let te = Math.min(now, (Math.floor(t / T.gridMs) + 1) * T.gridMs);
    // exact ship events
    c.ships.forEach((s) => {
      const due = s.state === 'out' ? s.arriveAt : s.state === 'back' ? s.homeAt
        : s.state === 'loading' && s.firstLoadAt != null ? s.firstLoadAt + T.maxLoadSecs * 1000 : Infinity;
      if (due > t && due < te) te = due;
    });
    // estimated events (never shorter than 1s)
    let est = Infinity;
    const cr = convRate(c.conveyor) / 60000;
    c.ships.forEach((s, k) => {
      if (s.state !== 'loading') return;
      const free = shipCap(s) - sum(cargo[k]);
      const r = flowRate[k] < 0 ? cr : flowRate[k];
      if (r > 0) est = Math.min(est, free / r);
    });
    c.shafts.forEach((s, k) => {
      const v = s.vein;
      if (!v || v.left <= 0 || !(rates[k] > 0) || !(lastScale > 0)) return;
      const thr = v.warn < 1 ? v.total * T.veinWarn[0] : v.warn < 2 ? v.total * T.veinWarn[1] : 0;
      est = Math.min(est, Math.max(0, v.left - thr) / (rates[k] * lastScale));
    });
    if (est < Infinity) te = Math.min(te, t + Math.max(1000, est));
    const dt = te - t;
    if (dt > 0) lastScale = flow(dt, t);
    t = te;
  }
  process(now);

  function flow(dt, t0) {
    const pot = rates.map((r, k) => {
      const x = r * dt;
      const v = c.shafts[k].vein;
      return v ? Math.min(x, Math.max(0, v.left)) : x;
    });
    const Ppot = sum(pot);
    const B1 = sum(tun), K1 = tunnelCap(c);
    const B2 = sum(yd), K2 = yardCap(c.yardLvl);
    const Lcap = liftRate(c.lift) * dt / 60000;
    const Ccap = convRate(c.conveyor) * dt / 60000;
    const loading = [];
    c.ships.forEach((s, k) => { if (s.state === 'loading') loading.push(k); });
    loading.sort((a, b) => num(c.ships[a].dockedAt) - num(c.ships[b].dockedAt) || a - b);
    const caps = loading.map((k) => Math.max(0, Math.min(Ccap, shipCap(c.ships[k]) - sum(cargo[k]))));
    const flPot = Math.min(Lcap, B1 + Ppot);
    const fc = Math.min(sum(caps), B2 + flPot);
    const fl = Math.max(0, Math.min(flPot, K2 - B2 + fc));
    const fm = Math.max(0, Math.min(Ppot, K1 - B1 + fl));
    const scale = Ppot > 0 ? fm / Ppot : 0;
    if (fm > 0) {
      for (let k = 0; k < pot.length; k++) {
        if (!(pot[k] > 0)) continue;
        const m = pot[k] * scale;
        tun[oreOf[k]] += m;
        tunG[oreOf[k]] += m * gradeOf[k];
        const v = c.shafts[k].vein;
        if (v) v.left = Math.max(0, v.left - m);
      }
      c.stats.mined += fm;
    }
    if (fl > 0) {
      const [up, upG] = takeByValue(I, tun, tunG, fl);
      for (let o = 0; o < I.n; o++) { yd[o] += up[o]; ydG[o] += upG[o]; }
      c.stats.lifted += fl;
    }
    let left = fc;
    loading.forEach((k, j) => {
      const x = Math.min(caps[j], left);
      left -= x;
      if (x > 0) {
        const [got, gotG] = takeByValue(I, yd, ydG, x);
        for (let o = 0; o < I.n; o++) { cargo[k][o] += got[o]; cargoG[k][o] += gotG[o]; }
        if (c.ships[k].firstLoadAt == null) c.ships[k].firstLoadAt = t0;
      }
      flowRate[k] = x / dt;
    });
    c.stats.loaded += fc - Math.max(0, left);
    return scale;
  }

  // pack
  c.tunnel = toMap(I, tun); c.tunnelG = toMap(I, tunG);
  c.yard = toMap(I, yd); c.yardG = toMap(I, ydG);
  c.ships.forEach((s, k) => { s.cargo = toMap(I, cargo[k]); s.cargoG = toMap(I, cargoG[k]); });
  c.t = now;
  if (saleCount > MAX_EVENT_SALES) {
    emit('salesSummary', `${saleCount - MAX_EVENT_SALES} more ship sales`, now, { count: saleCount - MAX_EVENT_SALES });
  }
  const sales = [];
  for (let o = 0; o < I.n; o++) if (soldArr[o] > 0) sales.push({ oreId: I.ores[o].id, amount: soldArr[o] });
  if (sales.length) events.push({ type: 'sales', text: '', at: now, data: { coin: soldCoin, trips: saleCount, ore: toMap(I, soldArr) } });
  syncUnlocks(c, world, now, events);
  return { colony: c, events, sales };
}

function oreName(I, id) { return I.ores[I.idx[id]]?.name || id; }
