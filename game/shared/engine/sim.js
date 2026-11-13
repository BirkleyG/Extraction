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
  shaftStatus, assignMiners, pickDest, priceAt, grade, evoMult, hazardRates, changeTimes,
} from './model.js';
import { syncUnlocks } from './unlocks.js';
import { ensureHz, rollBudget, hzPick, hazardText } from './hazards.js';

const MAX_EVENT_SALES = 12;
const MAX_EVENT_HAZARDS = 12;
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
  let rates = [], base = [], oreOf = [], gradeOf = [], lastScale = 1;
  const mineK = evoMult(c, 'mine'), sellK = evoMult(c, 'sell');
  let hzCount = 0, hzLost = 0;

  const recompute = () => {
    assignMiners(c, world);
    base = c.shafts.map((s) => (shaftStatus(c, I, s).ok ? s.miners * perMiner(s.up.cart, s.idx) * mineK / 60000 : 0)); // ore per ms
    oreOf = c.shafts.map((s) => I.idx[s.ore]);
    gradeOf = c.shafts.map((s) => grade(s.idx));
  };
  // Halted shafts (cave-ins, floods...) dig nothing until haltUntil.
  const ratesAt = (t) => { rates = base.map((r, k) => (num(c.shafts[k].haltUntil, 0) > t ? 0 : r)); };
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
        coin = pos(coin * sellK);
        c.coin += coin; c.earned += coin; c.runEarned += coin; c.monthEarned += coin; soldCoin += coin; saleCount++;
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
      const full = load >= shipCap(s) * (1 - 1e-9) - 1e-9;
      const timeout = s.firstLoadAt != null && t >= s.firstLoadAt + T.maxLoadSecs * 1000 - 1e-6;
      if (load > 0 && (full || timeout)) {
        const bi = pickDest(world, I, s, cargoG[k], t);
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
    // hazards whose budget ran out
    let hit = false;
    c.shafts.forEach((s) => {
      for (const kind of ['cave', 'mad']) if (s.hz[kind] <= DUE) { hazard(kind, s, t); s.hz[kind] = budget(); hit = true; }
    });
    for (const kind of ['gas', 'flood', 'fire', 'quake']) if (c.hz[kind] <= DUE) { hazard(kind, null, t); c.hz[kind] = budget(); hit = true; }
    if (hit) recompute();
  };

  function budget() { const [b, r] = rollBudget(c.hzRng); c.hzRng = r; return b; }
  function rnd() { const [u, r] = hzPick(c.hzRng); c.hzRng = r; return u; }
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
    let x = rnd() * deep.reduce((a, s) => a + s.idx, 0);
    for (const s of deep) { x -= s.idx; if (x <= 0) return s; }
    return deep[deep.length - 1];
  };
  function hazard(kind, s, t) {
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
    const hr = hazardRates(c, t);
    const calmEnd = num(c.born, 0) + T.hz.calmMs;
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
  if (hzCount > MAX_EVENT_HAZARDS) {
    emit('hazardSummary', `${hzCount - MAX_EVENT_HAZARDS} more mishaps underground while you were away`, now, { count: hzCount - MAX_EVENT_HAZARDS, lost: hzLost });
  }
  const sales = [];
  for (let o = 0; o < I.n; o++) if (soldArr[o] > 0) sales.push({ oreId: I.ores[o].id, amount: soldArr[o] });
  if (sales.length) events.push({ type: 'sales', text: '', at: now, data: { coin: soldCoin, trips: saleCount, ore: toMap(I, soldArr) } });
  syncUnlocks(c, world, now, events);
  return { colony: c, events, sales };
}

function oreName(I, id) { return I.ores[I.idx[id]]?.name || id; }
