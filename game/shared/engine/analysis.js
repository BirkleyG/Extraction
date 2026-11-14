// Steady-state rates, bottleneck finder, destination table, market.
import { T } from './tuning.js';
import { info, clone, num, pos, fmt } from './util.js';
import {
  liftRate, convRate, yardCap, perMiner, cartRate, soilOf, tunnelCap, shipCap, tripSecs, FLEET_KINDS,
  shaftStatus, pickDest, priceAt, marketIndex, evoMult, activeChanges, priceMult,
} from './model.js';
export { activeChanges, priceMult };
import { applyNow, quote, shaftOptions, prospectScore } from './commands.js';
import { rates } from './rates.js';
export { rates };

// ---------------------------------------------------------------- moves
const n1 = (cmd) => ({ n: 1, ...cmd });
// The better of the two dig directions by prospects (ties: left). The pacing bot and autoSpend use it; players choose themselves.
export function bestDir(c, world) {
  const o = shaftOptions(c, world);
  if (!o.length) return null;
  return o.reduce((a, b) => (prospectScore(b.prospects) > prospectScore(a.prospects) ? b : a)).dir;
}
export function candidateMoves(c, world) {
  const I = info(world);
  const list = [{ type: 'upgradeLift', kind: 'speed' }, { type: 'upgradeLift', kind: 'capacity' }, { type: 'upgradeLift', kind: 'buckets' },
    { type: 'upgradeConveyor' }, { type: 'upgradeYard' }, { type: 'buyPad' }];
  const dir = bestDir(c, world);
  if (dir) list.push({ type: 'buyShaft', dir });
  for (const cls of Object.keys(T.ship)) list.push({ type: 'buyShip', cls });
  for (const cls of Object.keys(T.ship)) {
    if (!c.ships.some((q) => q.cls === cls)) continue;
    for (const kind of FLEET_KINDS[cls]) list.push({ type: 'upgradeClass', cls, kind });
  }
  for (const s of c.shafts) {
    if (!shaftStatus(c, I, s).ok) continue;
    list.push({ type: 'hireMiners', shaftId: s.id }, { type: 'upgradeGear', shaftId: s.id }, { type: 'upgradeCart', shaftId: s.id });
  }
  if ((c.unlocked?.panels || []).includes('safety')) {
    for (const s of c.shafts) if (s.idx > 0 && s.miners > 0) {
      if ((s.up.lights || 0) < T.shaftSafeMax) list.push({ type: 'upgradeShaft', shaftId: s.id, kind: 'lights' });
      if ((s.up.supports || 0) < T.shaftSafeMax) list.push({ type: 'upgradeShaft', shaftId: s.id, kind: 'supports' });
    }
    for (const kind of ['ventilation', 'pumps', 'firebreaks']) list.push({ type: 'upgradeSafety', kind });
  }
  if ((c.unlocked?.panels || []).includes('refinery')) {
    for (const site of ['planet', 'orbital']) {
      if (!c.refinery?.[site]) { list.push({ type: 'buildRefinery', site }); continue; }
      for (const kind of ['throughput', 'yield', 'storage', 'docks']) if (kind !== 'docks' || site === 'orbital') list.push({ type: 'upgradeRefinery', site, kind });
    }
  }
  return list.map(n1);
}

export function moveLabel(c, cmd) {
  const sh = () => c.shafts.find((s) => s.id === cmd.shaftId)?.name || 'a shaft';
  switch (cmd.type) {
    case 'hireMiners': return `Hire a miner in ${sh()}`;
    case 'buyShaft': return `Dig a new shaft (${cmd.dir || '?'})`;
    case 'upgradeGear': return `Upgrade the gear in ${sh()}`;
    case 'upgradeCart': return `Upgrade the cart in ${sh()}`;
    case 'upgradeShaft': return { lights: `Light up ${sh()}`, supports: `Shore up ${sh()}` }[cmd.kind] || `Upgrade ${sh()}`;
    case 'upgradeSafety': return { ventilation: 'Improve ventilation', pumps: 'Install pumps', firebreaks: 'Build firebreaks' }[cmd.kind] || 'Improve safety';
    case 'upgradeLift': return `Upgrade the lift (${cmd.kind})`;
    case 'upgradeConveyor': return 'Upgrade the conveyors';
    case 'upgradeYard': return 'Expand the yard';
    case 'buyPad': return 'Build a launch pad';
    case 'buyShip': return `Buy a ${T.ship[cmd.cls]?.label.toLowerCase() || 'ship'}`;
    case 'upgradeClass': return cmd.kind === 'multi' ? 'Unlock the freighter second hold' : `Upgrade ${T.ship[cmd.cls]?.label.toLowerCase() || 'ship'} ${cmd.kind}`;
    case 'buildRefinery': return cmd.site === 'orbital' ? 'Build an orbital refinery' : 'Build an on-planet refinery';
    case 'upgradeRefinery': return `Refinery ${cmd.kind} (${cmd.site === 'orbital' ? 'orbital' : 'on-planet'})`;
    default: return cmd.type;
  }
}

// Expand a command into the small bundle a player would really buy with it
// (a new shaft or bunk is worth nothing without miners; a drill level that frees no face is followed by the next).
// A copy deep enough for applyNow (which never touches ore maps, cargo or hazard clocks). Much faster than clone().
export function planClone(c) {
  return {
    ...c,
    shafts: c.shafts.map((s) => ({ ...s, up: { ...s.up } })),
    ships: c.ships.map((s) => ({ ...s })),
    fleet: Object.fromEntries(Object.entries(c.fleet || {}).map(([k, v]) => [k, { ...v }])),
    stats: { ...c.stats },
    unlocked: { panels: [...(c.unlocked?.panels || [])], licenses: [...(c.unlocked?.licenses || [])] },
    safety: { ...c.safety }, evo: { ...c.evo },
    refinery: c.refinery ? { planet: refCopy(c.refinery.planet), orbital: refCopy(c.refinery.orbital) } : undefined,
    ledger: c.ledger ? clone(c.ledger) : undefined,
  };
}

function refCopy(R) { return R ? { ...R, lvl: { ...R.lvl }, ores: { ...R.ores } } : null; }

// Expand a command into the small bundle a player would really buy with it
// (a new shaft is worth nothing without miners; gear is bought until a stuck face breaks through). For the pacing bot and autoSpend only.
function expand(c, world, cmd) {
  const I = info(world);
  const steps = [cmd];
  const x = planClone(c);
  x.coin = Infinity;
  if (applyNow(x, world, cmd, [])) return null;
  if (cmd.type === 'buyShaft') {
    const s = x.shafts[x.shafts.length - 1];
    const st = { type: 'hireMiners', shaftId: s.id, n: 3 };
    if (!applyNow(x, world, st, [])) steps.push(st);
    // A shaft is a whole new business: the bundle also puts half its price into the new shaft's miners, gear and cart,
    // best ore per coin first (the bot would otherwise never see why a shaft is worth it).
    const budget = quote(c, world, cmd).cost * 0.5;
    let spent = 0;
    for (let guard = 0; guard < 80 && spent < budget; guard++) {
      const sh = x.shafts.find((q) => q.id === s.id);
      const crew = sh.miners * perMiner(sh) / soilOf(x), cap = cartRate(sh);
      const opts = [
        { cmd: { type: 'hireMiners', shaftId: sh.id, n: 1 }, gain: Math.min((sh.miners + 1) * perMiner(sh) / soilOf(x), cap) - Math.min(crew, cap) },
        { cmd: { type: 'upgradeGear', shaftId: sh.id, n: 1 }, gain: Math.min(sh.miners * perMiner({ ...sh, gear: sh.gear + 1 }) / soilOf(x), cap) - Math.min(crew, cap) },
        { cmd: { type: 'upgradeCart', shaftId: sh.id, n: 1 }, gain: Math.min(crew, cartRate({ ...sh, cart: sh.cart + 1 })) - Math.min(crew, cap) },
      ].map((o) => ({ ...o, cost: quote(x, world, o.cmd).cost })).filter((o) => o.gain > 0 && Number.isFinite(o.cost));
      if (!opts.length) { const o = { type: crew > cap ? 'upgradeCart' : 'hireMiners', shaftId: sh.id, n: 1 }; opts.push({ cmd: o, cost: quote(x, world, o).cost, gain: 1e-9 }); }
      opts.sort((a, b) => b.gain / b.cost - a.gain / a.cost);
      if (applyNow(x, world, opts[0].cmd, [])) break;
      steps.push(opts[0].cmd);
      spent += opts[0].cost;
    }
  }
  // Crew and cart must grow together: the cart caps the crew, and a crew under the cart's cap wastes it.
  const balance = (id, pre) => {
    for (let guard = 0; guard < 40; guard++) {
      const s = x.shafts.find((q) => q.id === id);
      const crew = s.miners * perMiner(s) / soilOf(x), cap = cartRate(s);
      const st = crew > cap * 1.0001 ? { type: 'upgradeCart', shaftId: id, n: 1 } : (!pre && crew < cap * 0.9999 && s.miners < T.hire.max) ? { type: 'hireMiners', shaftId: id, n: 1 } : null;
      if (!st || applyNow(x, world, st, [])) break;
      steps.push(st);
    }
  };
  if (cmd.type === 'hireMiners' || cmd.type === 'upgradeGear') balance(cmd.shaftId, true);
  if (cmd.type === 'upgradeCart') balance(cmd.shaftId, false);
  if (cmd.type === 'upgradeGear') {
    for (let guard = 0; guard < 8; guard++) {
      const s = x.shafts.find((q) => q.id === cmd.shaftId);
      if (!shaftStatus(x, I, s).blocked) break;
      const st = { type: 'upgradeGear', shaftId: s.id, n: 1 };
      if (applyNow(x, world, st, [])) break;
      steps.push(st);
    }
  }
  // every step is a paid purchase, so the bundle's cost is what it added to stats.spent
  return { steps, after: x, cost: x.stats.spent - (c.stats?.spent || 0) };
}

// Evaluate commands by coin/min gained per coin spent. Uses steady-state rates.
// Each result: { cmd, steps, cost, gain, ratio, canAfford, label }. `steps` is the bundle (cmd first).
export function bestMoves(colony, world, { cmds, limit = 5 } = {}) {
  const base = rates(colony, world).score;
  const out = [];
  for (const cmd of cmds || candidateMoves(colony, world)) {
    const e = expand(colony, world, cmd);
    if (!e) continue;
    const cost = e.cost;
    if (!(cost > 0) || !Number.isFinite(cost)) continue;
    const gain = rates(e.after, world).score - base;
    const extra = e.steps.length > 1 ? ` (+${e.steps.length - 1} more step${e.steps.length > 2 ? 's' : ''})` : '';
    out.push({ cmd, steps: e.steps, cost, firstCost: quote(colony, world, cmd).cost, gain, ratio: gain / cost, canAfford: colony.coin >= cost, label: moveLabel(colony, cmd) + extra });
  }
  out.sort((a, b) => b.ratio - a.ratio);
  return limit ? out.slice(0, limit) : out;
}


// ---------------------------------------------------------------- bottleneck
// A plain diagnosis, no recommended buys: { stage, wastedPerMin, wastedOrePerMin, message }.
export function bottleneck(colony, world) {
  const c = colony;
  const I = info(world);
  const r = rates(c, world);
  const avgPrice = (amount, fromLow) => {
    // value of `amount` ore/min taken from the low-value end of the mined mix
    let left = amount, v = 0;
    const order = fromLow ? [...r._order].reverse() : r._order;
    for (const o of order) { const x = Math.min(r._ore[o], left); v += x * r._unit[o]; left -= x; }
    return v;
  };
  const stages = [];
  let flow = r.minePerMin;
  const push = (stage, ore, value, extra) => stages.push({ stage, ore, value, ...extra });
  if (r.liftPerMin < flow) { push('lift', flow - r.liftPerMin, avgPrice(flow - r.liftPerMin, true)); flow = r.liftPerMin; }
  if (r.yardLoss > 0) { push('yard', flow * r.yardLoss, avgPrice(flow * r.yardLoss, true)); flow *= 1 - r.yardLoss; }
  if (r.conveyorPerMin < flow) { push('conveyor', flow - r.conveyorPerMin, avgPrice(flow - r.conveyorPerMin, true)); flow = r.conveyorPerMin; }
  if (r.shipPerMin < flow) { push('ships', flow - r.shipPerMin, avgPrice(flow - r.shipPerMin, true)); flow = r.shipPerMin; }
  // A cart that can't haul what its crew digs.
  let carted = null, cartV = 0;
  for (const s of r.shafts) {
    if (!s.ok || !(s.crew > s.cap * 1.001) || s.haltMins) continue;
    const lost = s.crew - s.cap;
    const v = lost * s.grade * (r._price[I.idx[s.ore]] || 0);
    if (!carted || v > cartV) { carted = { ...s, lost }; cartV = v; }
  }
  if (carted) push('cart', carted.lost, cartV, { shaft: carted });
  // Faces stuck at a vein the gear can't cut: what the vein would pay minus the wall scrapings.
  let stuck = null, stuckV = 0;
  for (const s of r.shafts) {
    if (!s.blocked || !s.next) continue;
    const full = s.wallRate / T.pk.wall;
    const v = Math.max(0, full * s.grade * (r._price[I.idx[s.next.ore]] || 0) - s.wallRate * s.grade * (r._price[I.idx[s.ore]] || 0));
    if (!stuck || v > stuckV) { stuck = s; stuckV = v; }
  }
  if (stuck) push('blocked', 0, Math.max(stuckV, 1e-6), { shaft: stuck });
  // Only call safety a bottleneck when mishaps cost a noticeable share of income.
  if (r.hazards.lossPerMin > Math.max(1, 0.02 * (r.coinPerMin || 0)) && (c.unlocked?.panels || []).includes('safety')) {
    push('safety', 0, r.hazards.lossPerMin, { perHour: r.hazards.perHour });
  }
  stages.sort((a, b) => b.value - a.value);
  const top = stages[0] && stages[0].value > 1e-9 ? stages[0] : { stage: 'mine', ore: 0, value: 0 };
  const o = fmt(top.ore);
  const msg = {
    lift: `Your lift can't keep up: ${o} ore/min piles up in the tunnels.`,
    yard: `Your yard fills up while ships are away: ${o} ore/min is lost.`,
    conveyor: `Your conveyors can't keep up: ${o} ore/min piles up in the yard.`,
    ships: `Not enough ships: ${o} ore/min waits in the yard.`,
    cart: top.shaft ? `${top.shaft.name}'s cart can't haul what the crew digs: ${o} ore/min waits at the face.` : '',
    blocked: top.shaft ? `${top.shaft.name} is stuck at a vein: ${top.shaft.reason.toLowerCase()}.` : '',
    mine: 'Everything keeps up. More ore means more coin.',
    safety: `Mishaps underground cost about ${fmt(top.value)} coin/min (${(top.perHour || 0).toFixed(2)} per hour).`,
  }[top.stage];
  return { stage: top.stage, wastedPerMin: pos(top.value), wastedOrePerMin: pos(top.ore), message: msg };
}

// ---------------------------------------------------------------- destinations & market
export function destinations(colony, world, shipClass = 'hauler') {
  const I = info(world);
  const r = rates(colony, world);
  const now = colony.t;
  const mixTotal = r._mix.reduce((a, b) => a + b, 0);
  const cap = shipCap({ cls: T.ship[shipClass] ? shipClass : 'hauler' }, colony);
  const rows = I.buyers.map((b, bi) => {
    const price = {};
    let v = 0;
    I.ores.forEach((o, oi) => {
      price[o.id] = priceAt(world, I, oi, bi, now) * evoMult(colony, 'sell');
      v += (mixTotal > 0 ? r._mixG[oi] / mixTotal : 1 / I.n) * price[o.id];
    });
    const trip = tripSecs(b, shipClass, colony);
    return { id: b.id, name: b.name, distance: b.distance, price, tripSecs: trip, coinPerMin: v * cap / (2 * trip / 60), best: false };
  });
  let bi = 0;
  rows.forEach((x, i) => { if (x.coinPerMin > rows[bi].coinPerMin) bi = i; });
  if (rows[bi]) rows[bi].best = true;
  return rows;
}

export function marketPrice(world, oreId, destId, now) {
  const I = info(world);
  const oi = I.idx[oreId], bi = I.buyerIdx[destId];
  if (oi === undefined || bi === undefined) return 0;
  return pos(priceAt(world, I, oi, bi, now));
}

// sales: [{ oreId, amount }] or { oreId: amount }. Returns a new world.
export function recordSales(world, sales, now) {
  const I = info(world);
  const w = { ...world, market: { ...(world.market || {}) } };
  const list = Array.isArray(sales) ? sales : Object.entries(sales || {}).map(([oreId, amount]) => ({ oreId, amount }));
  const vol = {};
  for (const s of list) {
    if (!s) continue;
    const id = s.oreId ?? s.ore;
    if (I.idx[id] === undefined) continue;
    vol[id] = (vol[id] || 0) + pos(Number(s.amount));
  }
  for (const id in vol) {
    const tier = I.ores[I.idx[id]].tier;
    const cur = marketIndex(world, id, now);
    const next = Math.max(T.indexFloor, cur * Math.exp(-vol[id] / T.depth[tier]));
    w.market[id] = { index: next, lastT: num(now) };
  }
  return w;
}

export function marketTable(world, now) {
  const I = info(world);
  return I.ores.map((o) => ({ id: o.id, name: o.name, tier: o.tier, value: o.value, index: marketIndex(world, o.id, now) }));
}
