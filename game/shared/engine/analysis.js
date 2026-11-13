// Steady-state rates, bottleneck finder, destination table, market.
import { T } from './tuning.js';
import { info, clone, num, pos, fmt } from './util.js';
import {
  liftRate, convRate, yardCap, bunkCap, perMiner, tunnelCap, shipCap, tripSecs,
  shaftStatus, pickDest, priceAt, marketIndex, evoMult, activeChanges, priceMult,
} from './model.js';
export { activeChanges, priceMult };
import { applyNow, quote } from './commands.js';
import { rates } from './rates.js';
export { rates };

// ---------------------------------------------------------------- moves
const n1 = (cmd) => ({ n: 1, ...cmd });
export function candidateMoves(c, world) {
  const I = info(world);
  const list = [{ type: 'hire' }, { type: 'buyShaft' }, { type: 'upgradeLift' }, { type: 'upgradeConveyor' },
    { type: 'upgradeYard' }, { type: 'buyPad' }, { type: 'upgradeDrill' }];
  for (const cls of Object.keys(T.ship)) list.push({ type: 'buyShip', cls });
  for (const s of c.ships) list.push({ type: 'upgradeShip', shipId: s.id });
  for (const s of c.shafts) {
    if (!shaftStatus(c, I, s).ok) continue;
    list.push({ type: 'upgradeShaft', shaftId: s.id, kind: 'cart' }, { type: 'upgradeShaft', shaftId: s.id, kind: 'bunk' });
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
    case 'hire': return 'Hire a miner';
    case 'buyShaft': return 'Dig a new shaft';
    case 'upgradeShaft': return { bunk: `Add bunks to ${sh()}`, lights: `Light up ${sh()}`, supports: `Shore up ${sh()}` }[cmd.kind] || `Add carts to ${sh()}`;
    case 'upgradeSafety': return { ventilation: 'Improve ventilation', pumps: 'Install pumps', firebreaks: 'Build firebreaks' }[cmd.kind] || 'Improve safety';
    case 'upgradeLift': return 'Upgrade the lift';
    case 'upgradeConveyor': return 'Upgrade the conveyors';
    case 'upgradeYard': return 'Expand the yard';
    case 'buyPad': return 'Build a launch pad';
    case 'upgradeDrill': return 'Upgrade the drill';
    case 'buyShip': return `Buy a ${T.ship[cmd.cls]?.label.toLowerCase() || 'ship'}`;
    case 'upgradeShip': return `Upgrade ${c.ships.find((s) => s.id === cmd.shipId)?.name || 'a ship'}`;
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
    stats: { ...c.stats },
    unlocked: { panels: [...(c.unlocked?.panels || [])], licenses: [...(c.unlocked?.licenses || [])] },
    safety: { ...c.safety }, evo: { ...c.evo },
    refinery: c.refinery ? { planet: refCopy(c.refinery.planet), orbital: refCopy(c.refinery.orbital) } : undefined,
    ledger: c.ledger ? clone(c.ledger) : undefined,
  };
}

function refCopy(R) { return R ? { ...R, lvl: { ...R.lvl }, ores: { ...R.ores } } : null; }

function expand(c, world, cmd) {
  const I = info(world);
  const steps = [cmd];
  const x = planClone(c);
  x.coin = Infinity;
  if (applyNow(x, world, cmd, [])) return null;
  const fix = () => {
    // a drill upgrade keeps going until a stuck face is freed (not past licenses)
    for (let guard = 0; cmd.type === 'upgradeDrill' && guard < 6; guard++) {
      const need = x.shafts.some((s) => /Needs drill/.test(shaftStatus(x, I, s).reason));
      if (!need || applyNow(x, world, { type: 'upgradeDrill' }, [])) break;
      steps.push({ type: 'upgradeDrill' });
    }
    let free = x.shafts.reduce((a, s) => a + (shaftStatus(x, I, s).ok ? bunkCap(s.up.bunk) : 0), 0) - x.miners;
    while (free-- > 0 && !applyNow(x, world, { type: 'hire', n: 1 }, [])) steps.push({ type: 'hire', n: 1 });
  };
  if (cmd.type === 'buyShaft' || cmd.type === 'upgradeDrill' || (cmd.type === 'upgradeShaft' && cmd.kind === 'bunk')) {
    fix();
    const last = x.shafts[x.shafts.length - 1];
    if (cmd.type === 'buyShaft' && !shaftStatus(x, I, last).ok && !applyNow(x, world, { type: 'buyShaft' }, [])) {
      steps.push({ type: 'buyShaft' });
      fix();
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
const STAGE_CMDS = {
  mine: ['hire', 'buyShaft', 'upgradeShaft', 'upgradeDrill'],
  idle: ['buyShaft', 'upgradeShaft'],
  blocked: ['upgradeDrill'],
  lift: ['upgradeLift'],
  conveyor: ['upgradeConveyor', 'buyPad'],
  ships: ['buyShip', 'upgradeShip', 'buyPad'],
  yard: ['upgradeYard', 'buyShip'],
  safety: ['upgradeSafety', 'upgradeShaft:lights', 'upgradeShaft:supports'],
};
const cmdKey = (m) => (m.type === 'upgradeShaft' && (m.kind === 'lights' || m.kind === 'supports') ? `upgradeShaft:${m.kind}` : m.type);

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
  if (c.idle > 0) {
    const best = Math.max(0, ...r.shafts.filter((s) => s.ok).map((s) => s.perMiner * s.grade * (r._price[I.idx[s.ore]] || 0)));
    push('idle', c.idle * T.minePerMiner, c.idle * best * 0.5, { miners: c.idle });
  }
  // Faces stuck at a pocket the drill can't cut: what the pocket would pay minus the wall scrapings.
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

  const pick = (types) => {
    const moves = bestMoves(c, world, { cmds: candidateMoves(c, world).filter((m) => types.includes(cmdKey(m)) || (m.type === 'upgradeShaft' && types.includes('upgradeShaft') && m.kind !== 'lights' && m.kind !== 'supports')), limit: 0 }).filter((m) => m.gain > 1e-9);
    const aff = moves.filter((m) => c.coin >= m.firstCost);
    if (aff.length) return aff[0];
    return moves.sort((a, b) => a.firstCost - b.firstCost)[0] || null;
  };
  let sug = pick(STAGE_CMDS[top.stage]);
  if (!sug) sug = pick(Object.values(STAGE_CMDS).flat());
  const tail = sug ? ` ${moveLabel(c, sug.cmd)} for ${fmt(sug.firstCost)}.` : '';
  const o = fmt(top.ore);
  const msg = {
    lift: `Your lift can't keep up: ${o} ore/min piles up in the tunnels.`,
    yard: `Your yard fills up while ships are away: ${o} ore/min is lost.`,
    conveyor: `Your conveyors can't keep up: ${o} ore/min piles up in the yard.`,
    ships: `Not enough ships: ${o} ore/min waits in the yard.`,
    idle: `${c.idle} miner${c.idle > 1 ? 's are' : ' is'} idle: no free bunks.`,
    blocked: top.shaft ? `${top.shaft.name} is stuck at a pocket: ${top.shaft.reason.toLowerCase()}.` : '',
    mine: 'Everything keeps up. More ore means more coin.',
    safety: `Mishaps underground cost about ${fmt(top.value)} coin/min (${(top.perHour || 0).toFixed(2)} per hour).`,
  }[top.stage];
  return {
    stage: top.stage, wastedPerMin: pos(top.value), wastedOrePerMin: pos(top.ore),
    message: msg + tail,
    suggestion: sug ? { cmd: sug.cmd, cost: sug.firstCost, label: moveLabel(c, sug.cmd), gainPerMin: sug.gain, canAfford: c.coin >= sug.firstCost, steps: sug.steps, bundleCost: sug.cost } : null,
  };
}

// ---------------------------------------------------------------- destinations & market
export function destinations(colony, world, shipClass = 'hauler') {
  const I = info(world);
  const r = rates(colony, world);
  const now = colony.t;
  const mixTotal = r._mix.reduce((a, b) => a + b, 0);
  const cap = (T.ship[shipClass] || T.ship.hauler).cap;
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
