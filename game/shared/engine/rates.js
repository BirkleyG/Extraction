// Steady-state rates (no simulation): what the colony makes per minute right now.
import { T } from './tuning.js';
import { info, pos } from './util.js';
import {
  liftRate, convRate, yardCap, bunkCap, perMiner, tunnelCap, shipCap, tripSecs,
  shaftStatus, pickDest, priceAt,
} from './model.js';

export function rates(colony, world) {
  const c = colony;
  const I = info(world);
  const now = c.t;
  const ore = new Array(I.n).fill(0);
  const shafts = c.shafts.map((s) => {
    const st = shaftStatus(c, I, s);
    const r = st.ok ? s.miners * perMiner(s.up.cart, s.idx) : 0;
    if (r > 0) ore[I.idx[s.ore]] += r;
    return {
      id: s.id, name: s.name, ore: s.ore, miners: s.miners, cap: bunkCap(s.up.bunk), orePerMin: r,
      perMiner: perMiner(s.up.cart, s.idx), ok: st.ok, reason: st.reason,
      vein: s.vein ? { total: s.vein.total, left: s.vein.left, pct: s.vein.total > 0 ? Math.round(1000 * s.vein.left / s.vein.total) / 10 : 0 } : null,
    };
  });
  const mine = ore.reduce((a, b) => a + b, 0);
  const lift = liftRate(c.lift);
  const convPad = convRate(c.conveyor);
  const conveyor = convPad * c.pads;
  const supply = Math.min(mine, lift);
  // Mix of what reaches the yard (highest value passes first).
  const mix = new Array(I.n).fill(0);
  let rest = supply;
  for (const o of I.byValue) { const x = Math.min(ore[o], rest); mix[o] = x; rest -= x; }

  // Ships
  const N = c.ships.length;
  const fill = Math.max(1e-9, Math.min(convPad, supply / Math.max(1, Math.min(N, c.pads))));
  const ships = c.ships.map((s) => {
    const bi = pickDest(world, I, s, mix, now);
    const b = I.buyers[bi];
    const cap = shipCap(s);
    const rt = 2 * tripSecs(b, s.cls) / 60;
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
  for (const o of I.byValue) { const x = Math.min(mix[o], rest); del[o] = x; rest -= x; }
  const price = new Array(I.n).fill(0);
  const wsum = ships.reduce((a, s) => a + s.perMin, 0);
  for (let o = 0; o < I.n; o++) {
    let p = 0;
    for (const s of ships) p += (wsum > 0 ? s.perMin / wsum : 1 / ships.length) * priceAt(world, I, o, s.bi, now);
    price[o] = p;
  }
  let coin = 0;
  for (let o = 0; o < I.n; o++) coin += del[o] * price[o];
  // Soft score for planning: a smooth min over stages, so improving a near-bottleneck still counts.
  const P = 6;
  const stages = { mine, lift, conveyor, ships: shipMax };
  let soft = 0;
  for (const k in stages) soft += Math.pow(Math.max(1e-9, stages[k]), -P);
  soft = Math.pow(soft, -1 / P) * (1 - yardLoss);
  let vpo = through > 0 ? coin / through : 0;
  if (!(vpo > 0)) { let m = 0, v = 0; for (let o = 0; o < I.n; o++) { m += mix[o]; v += mix[o] * price[o]; } vpo = m > 0 ? v / m : 0; }
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
    _price: price, _ore: ore, _mix: mix,
  };
}

