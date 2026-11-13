// Steady-state rates (no simulation): what the colony makes per minute right now.
import { T } from './tuning.js';
import { info, pos } from './util.js';
import {
  liftRate, convRate, yardCap, bunkCap, perMiner, tunnelCap, shipCap, tripSecs,
  shaftStatus, pickDest, priceAt, grade, evoMult, hazardRates, depthOf,
} from './model.js';
import { tunnelAt, expectedMix, metresPerMin, cuts } from './pockets.js';
import { REF_DEST, refThru, refYield, refCap, refDocks, refCfg, refUnit, refTrip, demandVec, hasParties, nearestBuyer, intakeFrom, prefersRefinery } from './refinery.js';

const avg = ([a, b]) => (a + b) / 2;
// Hazards as expected numbers: per-shaft risk (mishaps/hour) and the share of time a shaft sits halted.
export function hazardOutlook(c) {
  const hr = hazardRates(c, 8.64e15);
  const H = T.hz, D = Math.max(1, depthOf(c)), col = hr.colony;
  const shafts = c.shafts.map((s, k) => {
    const share = s.idx / D;
    const h = hr.shafts[k];
    const risk = h.cave + h.mad + (col.gas + col.flood) * share + (s.idx > 0 ? col.quake : 0);
    const haltMinsPerHour = h.cave * avg(H.caveHalt) + h.mad * avg(H.madHalt)
      + (col.gas * avg(H.gasHalt) + col.flood * avg(H.floodHalt)) * share
      + (s.idx > 0 ? col.quake * avg(H.quakeHalt) * Math.pow(H.cut, s.up.supports || 0) : 0);
    return { risk: Math.min(1, risk), down: Math.min(0.9, haltMinsPerHour / 60) };
  });
  const perHour = hr.shafts.reduce((a, h) => a + h.cave + h.mad, 0) + col.gas + col.flood + col.fire + col.quake;
  return { shafts, perHour, fire: col.fire, colony: col };
}

export function rates(colony, world) {
  const c = colony;
  const I = info(world);
  const now = c.t;
  const mineK = evoMult(c, 'mine'), sellK = evoMult(c, 'sell');
  const hz = hazardOutlook(c);
  const ore = new Array(I.n).fill(0), oreG = new Array(I.n).fill(0);
  const oreE = new Array(I.n).fill(0), oreEG = new Array(I.n).fill(0); // long-run mix, for planning (score)
  const shaftV = [];
  const shafts = c.shafts.map((s, k) => {
    const st = shaftStatus(c, I, s);
    const tn = tunnelAt(c, I, s);
    const haltMs = Math.max(0, (s.haltUntil || 0) - now);
    const full = st.ok && !haltMs ? s.miners * perMiner(s.up.cart, s.idx) * mineK : 0;
    const r = full * (tn.blocked ? T.pk.wall : 1);
    const gr = grade(s.idx);
    if (r > 0) { ore[I.idx[s.ore]] += r; oreG[I.idx[s.ore]] += r * gr; }
    if (tn.blocked) { if (r > 0) { oreE[I.idx[s.ore]] += r; oreEG[I.idx[s.ore]] += r * gr; } }
    else if (full > 0) for (const { i, share } of expectedMix(I, s.idx, c.drill)) { oreE[i] += full * share; oreEG[i] += full * share * gr; }
    shaftV.push(r * gr * (I.ores[I.idx[s.ore]]?.value || 0));
    const face = s.face || 0;
    const nx = tn.blocked ? tn.cur : tn.next;
    return {
      id: s.id, name: s.name, ore: s.ore, oreId: s.ore, miners: s.miners, cap: bunkCap(s.up.bunk), orePerMin: r,
      perMiner: perMiner(s.up.cart, s.idx) * mineK, grade: gr, ok: st.ok,
      reason: haltMs && st.ok ? `Halted: ${Math.ceil(haltMs / 60000)} min to clear` : st.reason,
      haltMins: Math.ceil(haltMs / 60000), risk: hz.shafts[k].risk,
      lights: s.up.lights || 0, supports: s.up.supports || 0,
      face, metresPerMin: tn.blocked ? 0 : metresPerMin(s, r), dug: s.dug || 0,
      blocked: !!tn.blocked, need: st.need || 0, wallRate: tn.blocked ? r : 0,
      pocket: tn.cur && !tn.blocked ? { ore: tn.cur.ore, left: Math.max(0, tn.cur.start + tn.cur.len - face), len: tn.cur.len } : null,
      next: nx ? { ore: nx.ore, at: Math.max(0, nx.start - face), blocked: !cuts(c, I.ores[I.idx[nx.ore]]) } : null,
    };
  });
  const mine = ore.reduce((a, b) => a + b, 0);
  const lift = liftRate(c.lift) * mineK;
  const convPad = convRate(c.conveyor);
  const conveyor = convPad * c.pads;
  const supply = Math.min(mine, lift);
  // Mix of what reaches the yard (highest value passes first).
  const g = ore.map((x, o) => (x > 0 ? oreG[o] / x : 1));            // average grade per ore
  const order = I.ores.map((o) => o.i).sort((a, b) => I.ores[b].value * g[b] - I.ores[a].value * g[a] || a - b);
  const mix = new Array(I.n).fill(0);
  let rest = supply;
  for (const o of order) { const x = Math.min(ore[o], rest); mix[o] = x; rest -= x; }
  const mixG = mix.map((x, o) => x * g[o]);

  // Ships (and, with refineries, the ore they divert). pass(mixIn, supplyIn, orb) is the ship stage for a raw mix.
  const N = c.ships.length;
  const RF = c.refinery || {};
  const orbR = RF.orbital || null;
  const pass = (mixIn, supplyIn, orb) => {
    const fill = Math.max(1e-9, Math.min(convPad, supplyIn / Math.max(1, Math.min(N, c.pads))));
    const mixInG = mixIn.map((x, o) => x * g[o]);
    let docks = orb ? orb.docks : 0, accept = orb ? orb.accept : 0;
    const ships = c.ships.map((s) => {
      const bi = pickDest(world, I, s, mixInG, now);
      const b = I.buyers[bi];
      const cap = shipCap(s);
      let rt = 2 * tripSecs(b, s.cls, c) / 60, ref = false;
      if (orb && docks > 0 && (s.policy === 'refinery' || (s.policy === 'best' && accept > 0))
        && prefersRefinery(c, world, I, s, mixIn, mixInG, bi, now, Infinity)) {
        ref = true; docks--; rt = 2 * refTrip(s.cls, c) / 60;
        accept -= cap / (cap / convPad + rt);
      }
      const loadFull = cap / convPad;                       // minutes at full conveyor speed
      const loadReal = Math.min(T.maxLoadSecs / 60, cap / fill); // what really happens at current supply
      return { id: s.id, name: s.name, cls: s.cls, cap, dest: ref ? REF_DEST : b.id, tripSecs: rt * 30, bi, ref, loadFull, loadReal, rt };
    });
    let shipMax = 0, padUse = 0;
    for (const s of ships) { s.perMin = s.cap / (s.loadFull + s.rt); shipMax += s.perMin; padUse += s.loadFull / (s.loadFull + s.rt); }
    if (padUse > c.pads) { const k = c.pads / padUse; ships.forEach((s) => { s.perMin *= k; }); shipMax *= k; }
    // Yard: while no ship is docked the yard (and tunnels) must hold the flow.
    let gap = 1;
    for (const s of ships) gap *= Math.max(0, 1 - Math.min(1, s.loadReal / (s.loadReal + s.rt)));
    const meanRt = N ? ships.reduce((a, s) => a + s.rt, 0) / N : 1;
    const gapLen = meanRt / Math.max(1, N);
    const buffer = yardCap(c.yardLvl) + tunnelCap(c) * 0.5;
    const yardLoss = supplyIn > 0 && N ? gap * Math.max(0, 1 - buffer / (supplyIn * gapLen)) : 0;
    const through = Math.max(0, Math.min(supplyIn * (1 - yardLoss), conveyor, shipMax));
    const del = new Array(I.n).fill(0);
    let rest = through;
    for (const o of order) { const x = Math.min(mixIn[o], rest); del[o] = x; rest -= x; }
    const price = new Array(I.n).fill(0);
    const mkt = ships.filter((s) => !s.ref);
    const wsum = mkt.reduce((a, s) => a + s.perMin, 0), all = ships.reduce((a, s) => a + s.perMin, 0);
    for (let o = 0; o < I.n; o++) {
      let p = 0;
      for (const s of mkt) p += (wsum > 0 ? s.perMin / wsum : 1 / mkt.length) * priceAt(world, I, o, s.bi, now);
      price[o] = p * sellK;
    }
    const fR = all > 0 ? (all - wsum) / all : 0; // share of shipped ore flown to the orbital refinery
    let coin = 0;
    for (let o = 0; o < I.n; o++) coin += del[o] * (1 - fR) * g[o] * price[o];
    return { ships, shipMax, yardLoss, through, del, price, coin, fR };
  };
  const P0 = pass(mix, supply, null);
  let { ships, shipMax, yardLoss, through, price } = P0;
  let coin = P0.coin;

  // Refineries: the on-planet one takes ore off the yard before the conveyor; the orbital one is fed by ships.
  let refinery = null, refCoin = 0, refPlan = 0, rawCoin = coin;
  if (RF.planet || orbR) {
    refinery = {};
    const parties = hasParties(world, I);
    const near = nearestBuyer(I);
    const nearP = I.ores.map((o, i) => priceAt(world, I, i, near, now) * sellK);
    const site = (name, R) => {
      const cf = I.ores.map((o) => refCfg(R, o.id));
      const ask = cf.map((x) => x.markup), on = cf.map((x) => x.on);
      const D = demandVec(world, I, ask, now);
      const unit = cf.map((x, o) => (parties ? x.markup : T.ref.computer) * refUnit(I, o) * sellK);
      const stock = I.ores.map((o) => Math.max(0, Number(R.stock?.[o.id]) || 0));
      return { name, R, cf, ask, on, D, unit, stock, thru: refThru(name, R), y: refYield(name, R), cap: refCap(name, R), full: !!R.full };
    };
    const sites = [];
    let mixL = mix, supplyL = supply, pIn = null;
    if (RF.planet) {
      const x = site('planet', RF.planet);
      pIn = intakeFrom(mix, g, x.on, x.D, x.thru, x.y, x.full, I.byValue);
      mixL = mix.map((m, o) => Math.max(0, m - pIn[o]));
      supplyL = Math.max(0, supply - pIn.reduce((a, b) => a + b, 0));
      x.inn = pIn; sites.push(x);
    }
    let ox = null;
    if (orbR) {
      ox = site('orbital', orbR);
      let acc = 0, rem = ox.thru;
      for (const o of I.byValue) if (ox.on[o] && rem > 0) { const a = ox.D[o] === Infinity ? rem : Math.min(rem, ox.D[o] / (Math.max(1e-9, g[o]) * ox.y)); acc += a; rem -= a; }
      ox.accept = Math.max(acc, 1e-9); ox.docks = refDocks(orbR);
    }
    const P1 = pass(mixL, supplyL, ox);
    ({ ships, shipMax, yardLoss, through, price } = P1);
    rawCoin = P1.coin;
    if (ox) {
      const offer = P1.del.map((d) => d * P1.fR);
      ox.inn = intakeFrom(offer, g, ox.on, ox.D, ox.thru, ox.y, true, I.byValue);
      // ore the hold can't take, and ore not being refined, is sold at the nearest buyer
      for (let o = 0; o < I.n; o++) rawCoin += Math.max(0, offer[o] - ox.inn[o]) * g[o] * nearP[o];
      sites.push(ox);
    }
    for (const x of sites) {
      const byOre = {};
      let inn = 0, out = 0, soldT = 0, cpm = 0, plan = 0, stockT = 0;
      I.ores.forEach((o, i) => {
        const fin = x.inn[i], fout = fin * g[i] * x.y;
        const cur = x.stock[i] > 0 ? x.D[i] : Math.min(fout, x.D[i]);
        const sold = Number.isFinite(cur) ? cur : fout;
        const cc = sold * x.unit[i];
        const steady = Math.min(fout, x.D[i]) * x.unit[i];
        // coin per raw ore: refined (at what sells) vs raw at today's buyers
        const sellShare = fout > 0 ? Math.min(1, x.D[i] / fout) : (x.D[i] > 0 ? 1 : 0);
        const perRef = g[i] * x.y * x.unit[i] * sellShare;
        const perRaw = g[i] * (price[i] || P0.price[i] || nearP[i]);
        inn += fin; out += fout; soldT += sold; cpm += cc; plan += steady; stockT += x.stock[i];
        byOre[o.id] = { on: x.on[i], ask: parties ? x.ask[i] : T.ref.computer, inPerMin: fin, soldPerMin: sold, coinPerMin: cc, stock: x.stock[i],
          vsRaw: perRaw > 0 ? perRef / perRaw - 1 : null };
      });
      refinery[x.name] = { inPerMin: inn, outPerMin: out, soldPerMin: soldT, coinPerMin: cpm, stock: stockT, cap: x.cap, full: x.full,
        throughput: x.thru, yield: x.y, ...(x.name === 'orbital' ? { docks: refDocks(x.R), hold: Object.values(x.R.raw || {}).reduce((a, b) => a + (Number(b) || 0), 0) } : {}), byOre };
      refCoin += cpm; refPlan += plan;
    }
    coin = rawCoin + refCoin;
  }
  // Soft score for planning: a smooth min over stages, so improving a near-bottleneck still counts.
  const P = 6;
  const stages = { mine, lift, conveyor, ships: P0.shipMax };
  let soft = 0;
  for (const k in stages) soft += Math.pow(Math.max(1e-9, stages[k]), -P);
  // Hazards: expected share of output lost to halted shafts and yard fires.
  const vSum = shaftV.reduce((a, b) => a + b, 0);
  let hzLoss = vSum > 0 ? shaftV.reduce((a, v, k) => a + v / vSum * hz.shafts[k].down, 0) : 0;
  if (supply > 0) hzLoss += Math.min(0.2, hz.fire * avg(T.hz.fireBurn) * 0.5 * yardCap(c.yardLvl) / (supply * 60));
  hzLoss = Math.min(0.9, hzLoss);
  soft = Math.pow(soft, -1 / P) * (1 - P0.yardLoss) * (1 - hzLoss);
  // Planning value per ore: the long-run mix (pockets come and go), so a shaft between pockets still counts its odds.
  const mineE = oreE.reduce((a, b) => a + b, 0);
  const gE = oreE.map((x, o) => (x > 0 ? oreEG[o] / x : 1));
  const orderE = I.ores.map((o) => o.i).sort((a, b) => I.ores[b].value * gE[b] - I.ores[a].value * gE[a] || a - b);
  let restE = Math.max(0, Math.min(mineE, lift, conveyor, P0.shipMax)), vE = 0, mE = 0;
  for (const o of orderE) { const x = Math.min(oreE[o], restE); vE += x * gE[o] * P0.price[o]; mE += x; restE -= x; }
  let vpo = mE > 0 ? vE / mE : 0;
  if (!(vpo > 0)) { let m = 0, v = 0; for (let o = 0; o < I.n; o++) { m += mix[o]; v += mixG[o] * P0.price[o]; } vpo = m > 0 ? v / m : 0; }
  let limit = 'mine';
  for (const k in stages) if (stages[k] < stages[limit]) limit = k;
  const orePerMin = {};
  I.ores.forEach((o, i) => { if (ore[i] > 0) orePerMin[o.id] = ore[i]; });
  return {
    orePerMin, minePerMin: mine, liftPerMin: lift, conveyorPerMin: conveyor, conveyorPerPad: convPad,
    shipPerMin: shipMax, throughput: through, coinPerMin: pos(coin), valuePerOre: through > 0 ? coin / through : 0,
    yardLoss, yardCap: yardCap(c.yardLvl), tunnelCap: tunnelCap(c), idleMiners: c.idle || 0, pads: c.pads,
    shafts, ships: ships.map(({ bi, ref, loadFull, loadReal, rt, ...s }) => ({ ...s, cycleSecs: (loadFull + rt) * 60 })),
    limit, score: mine > 0 ? pos(soft * vpo * (refinery && P0.coin > 0 ? rawCoin / P0.coin : 1) + refPlan * (1 - hzLoss)) : 0,
    refinery: refinery || {},
    hazards: { perHour: hz.perHour, loss: hzLoss, lossPerMin: pos(coin) * hzLoss, colony: hz.colony },
    evo: { mine: mineK, ship: evoMult(c, 'ship'), sell: sellK },
    _price: P0.price, _ore: ore, _mix: mix, _mixG: mixG, _unit: P0.price.map((p, o) => p * g[o]), _order: order,
  };
}

