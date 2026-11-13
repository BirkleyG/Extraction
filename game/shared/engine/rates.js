// Steady-state rates (no simulation): what the colony makes per minute right now.
import { T } from './tuning.js';
import { info, pos } from './util.js';
import {
  liftRate, convRate, yardCap, bunkCap, perMiner, tunnelCap, shipCap, tripSecs,
  shaftStatus, pickDest, priceAt, grade, evoMult, hazardRates, depthOf,
} from './model.js';
import { tunnelAt, expectedMix, metresPerMin, cuts } from './pockets.js';

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

  // Ships
  const N = c.ships.length;
  const fill = Math.max(1e-9, Math.min(convPad, supply / Math.max(1, Math.min(N, c.pads))));
  const ships = c.ships.map((s) => {
    const bi = pickDest(world, I, s, mixG, now);
    const b = I.buyers[bi];
    const cap = shipCap(s);
    const rt = 2 * tripSecs(b, s.cls, c) / 60;
    const loadFull = cap / convPad;                       // minutes at full conveyor speed
    const loadReal = Math.min(T.maxLoadSecs / 60, cap / fill); // what really happens at current supply
    return { id: s.id, name: s.name, cls: s.cls, cap, dest: b.id, tripSecs: rt * 30, bi, loadFull, loadReal, rt };
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
  const yardLoss = supply > 0 && N ? gap * Math.max(0, 1 - buffer / (supply * gapLen)) : 0;

  const through = Math.max(0, Math.min(supply * (1 - yardLoss), conveyor, shipMax));
  // Delivered mix and coin
  const del = new Array(I.n).fill(0);
  rest = through;
  for (const o of order) { const x = Math.min(mix[o], rest); del[o] = x; rest -= x; }
  const price = new Array(I.n).fill(0);
  const wsum = ships.reduce((a, s) => a + s.perMin, 0);
  for (let o = 0; o < I.n; o++) {
    let p = 0;
    for (const s of ships) p += (wsum > 0 ? s.perMin / wsum : 1 / ships.length) * priceAt(world, I, o, s.bi, now);
    price[o] = p * sellK;
  }
  let coin = 0;
  for (let o = 0; o < I.n; o++) coin += del[o] * g[o] * price[o];
  // Soft score for planning: a smooth min over stages, so improving a near-bottleneck still counts.
  const P = 6;
  const stages = { mine, lift, conveyor, ships: shipMax };
  let soft = 0;
  for (const k in stages) soft += Math.pow(Math.max(1e-9, stages[k]), -P);
  // Hazards: expected share of output lost to halted shafts and yard fires.
  const vSum = shaftV.reduce((a, b) => a + b, 0);
  let hzLoss = vSum > 0 ? shaftV.reduce((a, v, k) => a + v / vSum * hz.shafts[k].down, 0) : 0;
  if (supply > 0) hzLoss += Math.min(0.2, hz.fire * avg(T.hz.fireBurn) * 0.5 * yardCap(c.yardLvl) / (supply * 60));
  hzLoss = Math.min(0.9, hzLoss);
  soft = Math.pow(soft, -1 / P) * (1 - yardLoss) * (1 - hzLoss);
  // Planning value per ore: the long-run mix (pockets come and go), so a shaft between pockets still counts its odds.
  const mineE = oreE.reduce((a, b) => a + b, 0);
  const gE = oreE.map((x, o) => (x > 0 ? oreEG[o] / x : 1));
  const orderE = I.ores.map((o) => o.i).sort((a, b) => I.ores[b].value * gE[b] - I.ores[a].value * gE[a] || a - b);
  let restE = Math.max(0, Math.min(mineE, lift, conveyor, shipMax)), vE = 0, mE = 0;
  for (const o of orderE) { const x = Math.min(oreE[o], restE); vE += x * gE[o] * price[o]; mE += x; restE -= x; }
  let vpo = mE > 0 ? vE / mE : 0;
  if (!(vpo > 0)) { let m = 0, v = 0; for (let o = 0; o < I.n; o++) { m += mix[o]; v += mixG[o] * price[o]; } vpo = m > 0 ? v / m : 0; }
  let limit = 'mine';
  for (const k in stages) if (stages[k] < stages[limit]) limit = k;
  const orePerMin = {};
  I.ores.forEach((o, i) => { if (ore[i] > 0) orePerMin[o.id] = ore[i]; });
  return {
    orePerMin, minePerMin: mine, liftPerMin: lift, conveyorPerMin: conveyor, conveyorPerPad: convPad,
    shipPerMin: shipMax, throughput: through, coinPerMin: pos(coin), valuePerOre: through > 0 ? coin / through : 0,
    yardLoss, yardCap: yardCap(c.yardLvl), tunnelCap: tunnelCap(c), idleMiners: c.idle || 0, pads: c.pads,
    shafts, ships: ships.map(({ bi, loadFull, loadReal, rt, ...s }) => ({ ...s, cycleSecs: (loadFull + rt) * 60 })),
    limit, score: mine > 0 ? pos(soft * vpo) : 0,
    hazards: { perHour: hz.perHour, loss: hzLoss, lossPerMin: pos(coin) * hzLoss, colony: hz.colony },
    evo: { mine: mineK, ship: evoMult(c, 'ship'), sell: sellK },
    _price: price, _ore: ore, _mix: mix, _mixG: mixG, _unit: price.map((p, o) => p * g[o]), _order: order,
  };
}

